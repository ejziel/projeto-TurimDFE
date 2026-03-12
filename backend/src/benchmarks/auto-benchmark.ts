import { seedData, clearData, getProgress } from '../services/seed.service';
import { createRun, completeRun, failRun, updateRun } from '../services/benchmark.service';
import { runInsertSingleBenchmark } from './insert-single.bench';
import { runInsertBatchBenchmark } from './insert-batch.bench';
import { runQueryFiltersBenchmark } from './query-filters.bench';
import { runQueryPaginationBenchmark } from './query-pagination.bench';
import { runQueryVolumeBenchmark } from './query-volume.bench';
import { runConcurrentOpsBenchmark } from './concurrent-ops.bench';
import { runCounterIncrementBenchmark } from './counter-increment.bench';
import { runIndexEffectivenessBenchmark } from './index-effectiveness.bench';
import { BenchmarkResult } from '../models/benchmark-result.model';

export interface AutoBenchmarkConfig {
    volume: string;
    clearBefore?: boolean;
    suites?: string[];
    insertIterations?: number;
    queryIterations?: number;
    concurrentDuration?: number;
}

// Progressive volume steps: selecting 100k runs 1k → 10k → 50k → 100k
const VOLUME_PROGRESSION: Record<string, string[]> = {
    '1k': ['1k'],
    '10k': ['1k', '10k'],
    '50k': ['1k', '10k', '50k'],
    '100k': ['1k', '10k', '50k', '100k'],
    '250k': ['1k', '10k', '50k', '100k', '250k'],
    '500k': ['1k', '10k', '50k', '100k', '250k', '500k'],
};

export interface VolumeResults {
    volume: string;
    results: BenchmarkResult[];
}

export interface AutoBenchmarkProgress {
    runId: string;
    status: 'clearing' | 'seeding' | 'benchmarking' | 'generating-report' | 'completed' | 'failed';
    phase: string;
    overallProgress: number;
    seedProgress?: {
        seededDocs: number;
        totalDocs: number;
        seededEvents: number;
        totalEvents: number;
    };
    currentSuite?: string;
    currentVolume?: string;
    completedVolumes: string[];
    volumeSteps: string[];
    completedSuites: string[];
    totalSuites: number;
    results: BenchmarkResult[];
    resultsByVolume: VolumeResults[];
    report?: string;
    startedAt: string;
    completedAt?: string;
    error?: string;
    config: AutoBenchmarkConfig;
}

// Store progress for active auto-benchmarks
const autoRuns = new Map<string, AutoBenchmarkProgress>();

export function getAutoProgress(runId: string): AutoBenchmarkProgress | undefined {
    return autoRuns.get(runId);
}

export function getAllAutoRuns(): AutoBenchmarkProgress[] {
    return [...autoRuns.values()].sort((a, b) =>
        new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime(),
    );
}

interface ValidationThresholds {
    maxMeanLatencyMs: number;
    maxP95LatencyMs: number;
    maxP99LatencyMs: number;
    minOpsPerSecond: number;
    maxErrorRate: number;
}

const DEFAULT_THRESHOLDS: Record<string, ValidationThresholds> = {
    'insert-single': { maxMeanLatencyMs: 50, maxP95LatencyMs: 100, maxP99LatencyMs: 200, minOpsPerSecond: 20, maxErrorRate: 0.01 },
    'insert-batch': { maxMeanLatencyMs: 200, maxP95LatencyMs: 500, maxP99LatencyMs: 1000, minOpsPerSecond: 5, maxErrorRate: 0.01 },
    'query-filters': { maxMeanLatencyMs: 100, maxP95LatencyMs: 300, maxP99LatencyMs: 500, minOpsPerSecond: 10, maxErrorRate: 0.01 },
    'query-pagination': { maxMeanLatencyMs: 150, maxP95LatencyMs: 400, maxP99LatencyMs: 600, minOpsPerSecond: 8, maxErrorRate: 0.01 },
    'query-volume': { maxMeanLatencyMs: 200, maxP95LatencyMs: 500, maxP99LatencyMs: 800, minOpsPerSecond: 5, maxErrorRate: 0.02 },
    'concurrent': { maxMeanLatencyMs: 300, maxP95LatencyMs: 800, maxP99LatencyMs: 1500, minOpsPerSecond: 3, maxErrorRate: 0.05 },
    'counter-increment': { maxMeanLatencyMs: 100, maxP95LatencyMs: 300, maxP99LatencyMs: 500, minOpsPerSecond: 10, maxErrorRate: 0.02 },
    'index-effectiveness': { maxMeanLatencyMs: 80, maxP95LatencyMs: 200, maxP99LatencyMs: 400, minOpsPerSecond: 15, maxErrorRate: 0.01 },
    default: { maxMeanLatencyMs: 150, maxP95LatencyMs: 400, maxP99LatencyMs: 800, minOpsPerSecond: 5, maxErrorRate: 0.05 },
};

// ============================================================
// Comparative report generation (multi-volume)
// ============================================================

function generateComparativeReport(resultsByVolume: VolumeResults[], config: AutoBenchmarkConfig): string {
    const now = new Date().toISOString();
    const volumes = resultsByVolume.map(v => v.volume);
    const allResults = resultsByVolume.flatMap(v => v.results);

    // Build comparative table: for each scenario, show metrics across volumes
    const scenarioMap = new Map<string, Map<string, BenchmarkResult>>();
    for (const vr of resultsByVolume) {
        for (const r of vr.results) {
            const key = `${r.suiteName}::${r.scenarioName}`;
            if (!scenarioMap.has(key)) scenarioMap.set(key, new Map());
            scenarioMap.get(key)!.set(vr.volume, r);
        }
    }

    // Build the comparative table
    const compLines: string[] = [];
    const colWidth = 14;
    const pad = (s: string, w: number) => s.length >= w ? s.slice(0, w) : s + ' '.repeat(w - s.length);

    // Header
    const scenarioCol = pad('Cenario', 45);
    const volHeaders = volumes.map(v => pad(v, colWidth)).join('');
    compLines.push(`  ${scenarioCol}  ${volHeaders}`);
    compLines.push(`  ${'-'.repeat(45)}  ${volumes.map(() => '-'.repeat(colWidth)).join('')}`);

    // Mean latency comparison
    compLines.push('');
    compLines.push('  LATENCIA MEDIA (ms):');
    for (const [key, volMap] of scenarioMap) {
        const name = key.split('::')[1].slice(0, 43);
        const values = volumes.map(v => {
            const r = volMap.get(v);
            return r ? pad(r.metrics.latency.mean.toFixed(2), colWidth) : pad('-', colWidth);
        }).join('');
        compLines.push(`  ${pad(name, 45)}  ${values}`);
    }

    // P95 comparison
    compLines.push('');
    compLines.push('  P95 LATENCIA (ms):');
    for (const [key, volMap] of scenarioMap) {
        const name = key.split('::')[1].slice(0, 43);
        const values = volumes.map(v => {
            const r = volMap.get(v);
            return r ? pad(r.metrics.latency.p95.toFixed(2), colWidth) : pad('-', colWidth);
        }).join('');
        compLines.push(`  ${pad(name, 45)}  ${values}`);
    }

    // Throughput comparison
    compLines.push('');
    compLines.push('  THROUGHPUT (ops/s):');
    for (const [key, volMap] of scenarioMap) {
        const name = key.split('::')[1].slice(0, 43);
        const values = volumes.map(v => {
            const r = volMap.get(v);
            return r ? pad(String(r.metrics.operationsPerSecond), colWidth) : pad('-', colWidth);
        }).join('');
        compLines.push(`  ${pad(name, 45)}  ${values}`);
    }

    // Degradation analysis: compare last volume vs first volume
    const degradationLines: string[] = [];
    if (volumes.length > 1) {
        for (const [key, volMap] of scenarioMap) {
            const name = key.split('::')[1];
            const first = volMap.get(volumes[0]);
            const last = volMap.get(volumes[volumes.length - 1]);
            if (first && last) {
                const meanDeg = ((last.metrics.latency.mean / first.metrics.latency.mean - 1) * 100);
                const p95Deg = ((last.metrics.latency.p95 / first.metrics.latency.p95 - 1) * 100);
                const opsDeg = ((last.metrics.operationsPerSecond / first.metrics.operationsPerSecond - 1) * 100);

                const severity = meanDeg > 200 || p95Deg > 200 ? 'CRITICO' :
                    meanDeg > 50 || p95Deg > 50 ? 'ALERTA' : 'OK';

                degradationLines.push(`  [${severity}] ${name}:`);
                degradationLines.push(`    Mean: ${first.metrics.latency.mean.toFixed(2)}ms → ${last.metrics.latency.mean.toFixed(2)}ms (${meanDeg >= 0 ? '+' : ''}${meanDeg.toFixed(1)}%)`);
                degradationLines.push(`    P95:  ${first.metrics.latency.p95.toFixed(2)}ms → ${last.metrics.latency.p95.toFixed(2)}ms (${p95Deg >= 0 ? '+' : ''}${p95Deg.toFixed(1)}%)`);
                degradationLines.push(`    Ops:  ${first.metrics.operationsPerSecond} → ${last.metrics.operationsPerSecond} ops/s (${opsDeg >= 0 ? '+' : ''}${opsDeg.toFixed(1)}%)`);
            }
        }
    }

    // Violations
    interface Violation { field: string; label: string; value: number; threshold: number; severity: 'warning' | 'critical'; }
    interface Issue { result: BenchmarkResult; volume: string; violations: Violation[]; }
    const issues: Issue[] = [];
    for (const vr of resultsByVolume) {
        for (const r of vr.results) {
            const t = DEFAULT_THRESHOLDS[r.suiteName] || DEFAULT_THRESHOLDS.default;
            const violations: Violation[] = [];
            const m = r.metrics;
            if (m.latency.mean > t.maxMeanLatencyMs) violations.push({ field: 'latency.mean', label: 'Latencia Media', value: m.latency.mean, threshold: t.maxMeanLatencyMs, severity: m.latency.mean > t.maxMeanLatencyMs * 2 ? 'critical' : 'warning' });
            if (m.latency.p95 > t.maxP95LatencyMs) violations.push({ field: 'latency.p95', label: 'P95', value: m.latency.p95, threshold: t.maxP95LatencyMs, severity: m.latency.p95 > t.maxP95LatencyMs * 2 ? 'critical' : 'warning' });
            if (m.latency.p99 > t.maxP99LatencyMs) violations.push({ field: 'latency.p99', label: 'P99', value: m.latency.p99, threshold: t.maxP99LatencyMs, severity: m.latency.p99 > t.maxP99LatencyMs * 2 ? 'critical' : 'warning' });
            if (m.operationsPerSecond < t.minOpsPerSecond) violations.push({ field: 'operationsPerSecond', label: 'Throughput', value: m.operationsPerSecond, threshold: t.minOpsPerSecond, severity: m.operationsPerSecond < t.minOpsPerSecond / 2 ? 'critical' : 'warning' });
            if (m.errorRate > t.maxErrorRate) violations.push({ field: 'errorRate', label: 'Taxa de Erros', value: m.errorRate, threshold: t.maxErrorRate, severity: m.errorRate > t.maxErrorRate * 3 ? 'critical' : 'warning' });
            if (violations.length > 0) issues.push({ result: r, volume: vr.volume, violations });
        }
    }

    const criticalCount = issues.filter(i => i.violations.some(v => v.severity === 'critical')).length;
    const warningCount = issues.length - criticalCount;

    const violationLines = issues.map(issue => {
        const hasCrit = issue.violations.some(v => v.severity === 'critical');
        const sev = hasCrit ? 'CRITICO' : 'ALERTA';
        const details = issue.violations.map(v => {
            const val = v.field === 'errorRate' ? (v.value * 100).toFixed(1) + '%' : v.value.toFixed(2);
            const lim = v.field === 'errorRate' ? (v.threshold * 100).toFixed(1) + '%' : v.threshold.toString();
            return `${v.label}: ${val} (limite: ${lim})`;
        }).join('; ');
        return `  [${sev}] [${issue.volume}] ${issue.result.scenarioName} (${issue.result.suiteName}): ${details}`;
    });

    return `========================================================================
RELATORIO COMPARATIVO DE BENCHMARK - TurimDFE
Teste Progressivo de Escalabilidade
========================================================================
Data: ${now}
Volumes testados: ${volumes.join(' → ')}
Total de cenarios: ${allResults.length} (${volumes.length} volumes x ${scenarioMap.size} cenarios)

${volumes.length > 1 ? `PROGRESSAO: ${volumes.map((v, i) => i === volumes.length - 1 ? `[${v}]` : v).join(' → ')}` : ''}

========================================================================
TABELA COMPARATIVA POR VOLUME
========================================================================

${compLines.join('\n')}

${volumes.length > 1 ? `========================================================================
ANALISE DE DEGRADACAO (${volumes[0]} → ${volumes[volumes.length - 1]})
========================================================================

${degradationLines.length > 0 ? degradationLines.join('\n') : '  Nenhuma degradacao significativa encontrada.'}
` : ''}
========================================================================
VIOLACOES (fora dos padroes por volume)
========================================================================

  Total: ${issues.length} (${criticalCount} criticos, ${warningCount} alertas)

${violationLines.length > 0 ? violationLines.join('\n') : '  Nenhuma violacao encontrada.'}

========================================================================
DETALHES POR VOLUME
========================================================================

${resultsByVolume.map(vr => `--- Volume: ${vr.volume} (${vr.results.length} cenarios) ---
${vr.results.map(r => {
        const t = DEFAULT_THRESHOLDS[r.suiteName] || DEFAULT_THRESHOLDS.default;
        const m = r.metrics;
        const status = m.latency.mean > t.maxMeanLatencyMs * 2 ? 'CRIT' : m.latency.mean > t.maxMeanLatencyMs ? 'WARN' : ' OK ';
        return `  [${status}] ${r.scenarioName}: mean=${m.latency.mean.toFixed(2)}ms p95=${m.latency.p95.toFixed(2)}ms ops/s=${m.operationsPerSecond} erros=${m.errors}`;
    }).join('\n')}`).join('\n\n')}

========================================================================
PROMPT PARA ANALISE POR IA
========================================================================

Voce e um especialista em performance e escalabilidade de banco de dados Firestore. Analise o relatorio COMPARATIVO de benchmark abaixo do sistema TurimDFE (gestao de documentos fiscais eletronicos - NFe, CTe, NFSe, CTe-OS).

Contexto do sistema:
- Firestore como banco principal com multi-tenancy (tenantId como prefixo em queries)
- Documentos fiscais com campos: tipo, chaveAcesso, valores, datas, situacao, statusManifestacao
- Indices compostos para queries frequentes
- Operacoes criticas: insercao de novos documentos, consultas com filtros compostos, paginacao cursor-based

TESTE DE ESCALABILIDADE PROGRESSIVO:
Volumes testados na sequencia: ${volumes.join(' → ')}
Total de cenarios por volume: ${scenarioMap.size}
Total de cenarios executados: ${allResults.length}

TABELA COMPARATIVA DE LATENCIA MEDIA (ms):
${(() => {
            const lines: string[] = [];
            for (const [key, volMap] of scenarioMap) {
                const name = key.split('::')[1];
                const vals = volumes.map(v => { const r = volMap.get(v); return r ? r.metrics.latency.mean.toFixed(2) + 'ms' : '-'; });
                lines.push(`  ${name}: ${vals.join(' → ')}`);
            }
            return lines.join('\n');
        })()}

${volumes.length > 1 ? `DEGRADACAO DE PERFORMANCE (${volumes[0]} → ${volumes[volumes.length - 1]}):
${degradationLines.join('\n')}` : ''}

VIOLACOES:
${violationLines.length > 0 ? violationLines.join('\n') : '  Nenhuma violacao encontrada.'}

Com base neste relatorio COMPARATIVO:
1. Identifique quais operacoes escalam LINEARMENTE e quais escalam de forma NAO-LINEAR com o volume
2. Para cenarios que degradam significativamente, identifique a causa raiz provavel (indice missing, full collection scan, etc.)
3. Indique o volume a partir do qual o sistema comeca a ter problemas e se ha um "ponto de inflexao"
4. Sugira otimizacoes especificas para os cenarios com maior degradacao (indices compostos, reestruturacao de queries, caching, etc.)
5. Avalie se a arquitetura multi-tenant com tenantId prefix escala bem no Firestore
6. Priorize as recomendacoes por impacto no usuario final em producao`;
}

const ALL_SUITES = [
    'insert-single',
    'insert-batch',
    'query-filters',
    'query-pagination',
    'query-volume',
    'concurrent',
    'counter-increment',
    'index-effectiveness',
];

export async function runAutoBenchmark(config: AutoBenchmarkConfig): Promise<string> {
    const run = createRun('auto-benchmark');
    const suitesToRun = config.suites && config.suites.length > 0
        ? config.suites.filter(s => ALL_SUITES.includes(s))
        : ALL_SUITES;

    // Determine volume progression
    const volumeSteps = VOLUME_PROGRESSION[config.volume] || [config.volume];

    const progress: AutoBenchmarkProgress = {
        runId: run.runId,
        status: 'clearing',
        phase: 'Iniciando...',
        overallProgress: 0,
        completedVolumes: [],
        volumeSteps,
        completedSuites: [],
        totalSuites: suitesToRun.length,
        results: [],
        resultsByVolume: [],
        startedAt: new Date().toISOString(),
        config,
    };
    autoRuns.set(run.runId, progress);

    const updateAutoProgress = (update: Partial<AutoBenchmarkProgress>) => {
        Object.assign(progress, update);
        autoRuns.set(run.runId, progress);
    };

    const suiteFunctions = (cfg: AutoBenchmarkConfig): Record<string, () => Promise<BenchmarkResult | BenchmarkResult[]>> => ({
        'insert-single': () => runInsertSingleBenchmark({ iterations: cfg.insertIterations || 200 }),
        'insert-batch': () => runInsertBatchBenchmark({ batchSizes: [10, 50, 100, 500], batchesPerSize: 5 }),
        'query-filters': () => runQueryFiltersBenchmark({ iterations: cfg.queryIterations || 20 }),
        'query-pagination': () => runQueryPaginationBenchmark({ pagesToFetch: 15 }),
        'query-volume': () => runQueryVolumeBenchmark({ iterations: cfg.queryIterations || 30 }),
        'concurrent': () => runConcurrentOpsBenchmark({
            concurrentReaders: 10,
            concurrentWriters: 5,
            durationSeconds: cfg.concurrentDuration || 10,
        }),
        'counter-increment': () => runCounterIncrementBenchmark({ concurrencyLevels: [1, 5, 10, 20], iterationsPerLevel: 50 }),
        'index-effectiveness': () => runIndexEffectivenessBenchmark({ iterations: cfg.queryIterations || 20 }),
    });

    // Progress calculation:
    // Each volume step gets equal share. Within each step: clear(5%) + seed(40%) + benchmarks(55%)
    const perVolumePercent = 95 / volumeSteps.length; // Reserve 5% for final report

    try {
        const allVolumeResults: VolumeResults[] = [];
        const allResults: BenchmarkResult[] = [];

        for (let vi = 0; vi < volumeSteps.length; vi++) {
            const vol = volumeSteps[vi];
            const volumeBaseProgress = Math.round(vi * perVolumePercent);
            const volumeLabel = `[${vi + 1}/${volumeSteps.length}] ${vol}`;

            // ======== Clear data ========
            updateAutoProgress({
                status: 'clearing',
                currentVolume: vol,
                phase: `${volumeLabel}: Limpando dados...`,
                overallProgress: volumeBaseProgress + 1,
                completedSuites: [],
            });
            updateRun(run.runId, { progress: volumeBaseProgress + 1, currentScenario: `Limpando dados para ${vol}...` });
            await clearData();

            // ======== Seed data ========
            const seedBaseProgress = volumeBaseProgress + Math.round(perVolumePercent * 0.05);
            updateAutoProgress({
                status: 'seeding',
                phase: `${volumeLabel}: Gerando ${vol} documentos...`,
                overallProgress: seedBaseProgress,
            });
            updateRun(run.runId, { progress: seedBaseProgress, currentScenario: `Seeding ${vol}...` });

            const seedPromise = seedData(vol);

            const seedPollInterval = setInterval(() => {
                const seedProg = getProgress();
                const seedPercent = seedProg.totalDocs > 0
                    ? Math.round((seedProg.seededDocs / seedProg.totalDocs) * 100)
                    : 0;
                // Seed occupies 40% of each volume's allocation
                const overallSeedProgress = seedBaseProgress + Math.round(seedPercent * (perVolumePercent * 0.40) / 100);
                updateAutoProgress({
                    phase: `${volumeLabel}: ${seedProg.phase}`,
                    overallProgress: overallSeedProgress,
                    seedProgress: {
                        seededDocs: seedProg.seededDocs,
                        totalDocs: seedProg.totalDocs,
                        seededEvents: seedProg.seededEvents,
                        totalEvents: seedProg.totalEvents,
                    },
                });
                updateRun(run.runId, { progress: overallSeedProgress, currentScenario: `[${vol}] ${seedProg.phase}` });
            }, 1000);

            await seedPromise;
            clearInterval(seedPollInterval);

            // ======== Run benchmarks for this volume ========
            const benchBaseProgress = volumeBaseProgress + Math.round(perVolumePercent * 0.45);
            updateAutoProgress({
                status: 'benchmarking',
                phase: `${volumeLabel}: Executando benchmarks...`,
                overallProgress: benchBaseProgress,
                completedSuites: [],
            });

            const volumeResults: BenchmarkResult[] = [];
            const fns = suiteFunctions(config);

            for (let si = 0; si < suitesToRun.length; si++) {
                const suiteName = suitesToRun[si];
                const fn = fns[suiteName];
                if (!fn) continue;

                const suiteProgress = benchBaseProgress + Math.round((si / suitesToRun.length) * (perVolumePercent * 0.55));
                updateAutoProgress({
                    currentSuite: suiteName,
                    phase: `${volumeLabel}: ${suiteName} (${si + 1}/${suitesToRun.length})...`,
                    overallProgress: suiteProgress,
                });
                updateRun(run.runId, { progress: suiteProgress, currentScenario: `[${vol}] ${suiteName}` });

                try {
                    const result = await fn();
                    const results = Array.isArray(result) ? result : [result];
                    volumeResults.push(...results);
                    allResults.push(...results);
                    progress.results = [...allResults];
                    updateAutoProgress({ completedSuites: [...progress.completedSuites, suiteName] });
                } catch (err: any) {
                    console.error(`[${vol}] Suite ${suiteName} failed:`, err.message);
                }
            }

            allVolumeResults.push({ volume: vol, results: volumeResults });
            updateAutoProgress({
                completedVolumes: [...progress.completedVolumes, vol],
                resultsByVolume: [...allVolumeResults],
            });
        }

        // ======== Generate comparative report ========
        updateAutoProgress({
            status: 'generating-report',
            phase: 'Gerando relatorio comparativo...',
            overallProgress: 95,
        });
        updateRun(run.runId, { progress: 95, currentScenario: 'Gerando relatorio comparativo...' });

        const report = generateComparativeReport(allVolumeResults, config);

        updateAutoProgress({
            status: 'completed',
            phase: `Benchmark progressivo concluido! (${volumeSteps.join(' → ')})`,
            overallProgress: 100,
            report,
            completedAt: new Date().toISOString(),
            results: allResults,
            resultsByVolume: allVolumeResults,
        });

        completeRun(run.runId, allResults);
        return run.runId;

    } catch (err: any) {
        updateAutoProgress({
            status: 'failed',
            phase: `Erro: ${err.message}`,
            error: err.message,
            completedAt: new Date().toISOString(),
        });
        failRun(run.runId, err.message);
        throw err;
    }
}
