import { useState, useEffect, useMemo } from 'react';
import { getAllResults } from '../api/benchmarkApi';
import type { BenchmarkResult, ValidationThresholds, ValidationIssue } from '../types/benchmark.types';
import { DEFAULT_THRESHOLDS } from '../types/benchmark.types';

function validateResult(result: BenchmarkResult): ValidationIssue | null {
  const thresholds = DEFAULT_THRESHOLDS[result.suiteName] || DEFAULT_THRESHOLDS.default;
  const violations: ValidationIssue['violations'] = [];
  const { metrics } = result;

  if (metrics.latency.mean > thresholds.maxMeanLatencyMs)
    violations.push({ field: 'latency.mean', label: 'Latencia Media', value: metrics.latency.mean, threshold: thresholds.maxMeanLatencyMs, severity: metrics.latency.mean > thresholds.maxMeanLatencyMs * 2 ? 'critical' : 'warning' });
  if (metrics.latency.p95 > thresholds.maxP95LatencyMs)
    violations.push({ field: 'latency.p95', label: 'P95', value: metrics.latency.p95, threshold: thresholds.maxP95LatencyMs, severity: metrics.latency.p95 > thresholds.maxP95LatencyMs * 2 ? 'critical' : 'warning' });
  if (metrics.latency.p99 > thresholds.maxP99LatencyMs)
    violations.push({ field: 'latency.p99', label: 'P99', value: metrics.latency.p99, threshold: thresholds.maxP99LatencyMs, severity: metrics.latency.p99 > thresholds.maxP99LatencyMs * 2 ? 'critical' : 'warning' });
  if (metrics.operationsPerSecond < thresholds.minOpsPerSecond)
    violations.push({ field: 'operationsPerSecond', label: 'Throughput', value: metrics.operationsPerSecond, threshold: thresholds.minOpsPerSecond, severity: metrics.operationsPerSecond < thresholds.minOpsPerSecond / 2 ? 'critical' : 'warning' });
  if (metrics.errorRate > thresholds.maxErrorRate)
    violations.push({ field: 'errorRate', label: 'Taxa de Erros', value: metrics.errorRate, threshold: thresholds.maxErrorRate, severity: metrics.errorRate > thresholds.maxErrorRate * 3 ? 'critical' : 'warning' });

  return violations.length > 0 ? { result, violations } : null;
}

function buildReport(results: BenchmarkResult[], issues: ValidationIssue[]): string {
  const now = new Date().toISOString();

  const summaryByType = new Map<string, { count: number; avgMean: number; avgOps: number; errors: number }>();
  for (const r of results) {
    const existing = summaryByType.get(r.suiteName) || { count: 0, avgMean: 0, avgOps: 0, errors: 0 };
    existing.count++;
    existing.avgMean += r.metrics.latency.mean;
    existing.avgOps += r.metrics.operationsPerSecond;
    existing.errors += r.metrics.errors;
    summaryByType.set(r.suiteName, existing);
  }

  const summaryLines: string[] = [];
  for (const [suite, data] of summaryByType) {
    const t = DEFAULT_THRESHOLDS[suite] || DEFAULT_THRESHOLDS.default;
    summaryLines.push(`  - ${suite}: ${data.count} cenarios, media latencia ${(data.avgMean / data.count).toFixed(1)}ms (limite: ${t.maxMeanLatencyMs}ms), media ops/s ${(data.avgOps / data.count).toFixed(1)} (min: ${t.minOpsPerSecond}), ${data.errors} erros total`);
  }

  const violationLines: string[] = [];
  for (const issue of issues) {
    const hasCritical = issue.violations.some((v) => v.severity === 'critical');
    const severity = hasCritical ? 'CRITICO' : 'ALERTA';
    const details = issue.violations
      .map((v) => {
        const val = v.field === 'errorRate' ? (v.value * 100).toFixed(1) + '%' : v.value.toFixed(2);
        const lim = v.field === 'errorRate' ? (v.threshold * 100).toFixed(1) + '%' : v.threshold.toString();
        return `${v.label}: ${val} (limite: ${lim})`;
      })
      .join('; ');
    violationLines.push(`  [${severity}] ${issue.result.scenarioName} (${issue.result.suiteName}, volume: ${issue.result.dataVolume.toLocaleString()}): ${details}`);
  }

  const criticalCount = issues.filter((i) => i.violations.some((v) => v.severity === 'critical')).length;
  const warningCount = issues.length - criticalCount;

  const prompt = `Voce e um especialista em performance de banco de dados Firestore. Analise o relatorio de benchmark abaixo do sistema TurimDFE (gestao de documentos fiscais eletronicos - NFe, CTe, NFSe, CTe-OS).

Contexto do sistema:
- Firestore como banco principal com multi-tenancy (tenantId como prefixo em queries)
- Documentos fiscais com campos: tipo, chaveAcesso, valores, datas, situacao, statusManifestacao
- Indices compostos para queries frequentes
- Operacoes criticas: insercao de novos documentos, consultas com filtros compostos, paginacao cursor-based

RELATORIO DE BENCHMARK - ${now}
=====================================

RESUMO GERAL:
  Total de cenarios executados: ${results.length}
  Cenarios com violacao: ${issues.length} (${criticalCount} criticos, ${warningCount} alertas)
  Cenarios dentro do padrao: ${results.length - issues.length}

METRICAS POR SUITE:
${summaryLines.join('\n')}

VIOLACOES ENCONTRADAS (fora dos padroes):
${violationLines.length > 0 ? violationLines.join('\n') : '  Nenhuma violacao encontrada.'}

LIMITES APLICADOS:
${Object.entries(DEFAULT_THRESHOLDS)
  .filter(([k]) => k !== 'default')
  .map(([suite, t]) => `  ${suite}: mean<${t.maxMeanLatencyMs}ms, p95<${t.maxP95LatencyMs}ms, p99<${t.maxP99LatencyMs}ms, ops/s>${t.minOpsPerSecond}, erros<${(t.maxErrorRate * 100).toFixed(0)}%`)
  .join('\n')}

DETALHES COMPLETOS DOS CENARIOS COM VIOLACAO:
${issues
  .map((issue) => {
    const r = issue.result;
    return `  ${r.scenarioName} (${r.suiteName}):
    Volume: ${r.dataVolume.toLocaleString()} docs
    Operacoes: ${r.metrics.totalOperations} em ${r.metrics.totalDurationMs.toFixed(0)}ms
    Latencia: min=${r.metrics.latency.min.toFixed(2)}ms, mean=${r.metrics.latency.mean.toFixed(2)}ms, median=${r.metrics.latency.median.toFixed(2)}ms, p95=${r.metrics.latency.p95.toFixed(2)}ms, p99=${r.metrics.latency.p99.toFixed(2)}ms, max=${r.metrics.latency.max.toFixed(2)}ms, stddev=${r.metrics.latency.stddev.toFixed(2)}ms
    Throughput: ${r.metrics.operationsPerSecond} ops/s
    Erros: ${r.metrics.errors} (${(r.metrics.errorRate * 100).toFixed(1)}%)`;
  })
  .join('\n')}

Com base neste relatorio:
1. Identifique os problemas mais criticos de performance e suas possiveis causas raiz
2. Para cada violacao, sugira acoes corretivas especificas (ex: criar indice, reestruturar query, ajustar batch size, etc.)
3. Indique se algum padrao sugere problema de infraestrutura vs problema de modelagem de dados
4. Priorize as recomendacoes por impacto no usuario final
5. Sugira indices compostos do Firestore que poderiam melhorar os cenarios com problemas`;

  return prompt;
}

export default function AIReport() {
  const [results, setResults] = useState<BenchmarkResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    getAllResults()
      .then(setResults)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const issues = useMemo(() => {
    const allIssues: ValidationIssue[] = [];
    for (const r of results) {
      const issue = validateResult(r);
      if (issue) allIssues.push(issue);
    }
    return allIssues;
  }, [results]);

  const report = useMemo(() => buildReport(results, issues), [results, issues]);

  const handleCopy = () => {
    navigator.clipboard.writeText(report).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const handleDownload = () => {
    const blob = new Blob([report], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `turimdfe-ai-report-${new Date().toISOString().slice(0, 10)}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
      </div>
    );
  }

  const criticalCount = issues.filter((i) => i.violations.some((v) => v.severity === 'critical')).length;
  const warningCount = issues.length - criticalCount;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold">Relatorio para IA</h2>
        <div className="flex gap-2">
          <button
            onClick={handleCopy}
            className={`px-4 py-2 rounded text-sm text-white ${
              copied ? 'bg-green-600' : 'bg-blue-600 hover:bg-blue-700'
            }`}
          >
            {copied ? 'Copiado!' : 'Copiar Prompt'}
          </button>
          <button
            onClick={handleDownload}
            className="px-4 py-2 bg-gray-700 text-white rounded text-sm hover:bg-gray-800"
          >
            Baixar .txt
          </button>
        </div>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <div className="bg-white rounded-lg shadow p-4">
          <p className="text-sm text-gray-500">Cenarios</p>
          <p className="text-2xl font-bold">{results.length}</p>
        </div>
        <div className="bg-white rounded-lg shadow p-4 border-l-4 border-red-500">
          <p className="text-sm text-gray-500">Criticos</p>
          <p className="text-2xl font-bold text-red-600">{criticalCount}</p>
        </div>
        <div className="bg-white rounded-lg shadow p-4 border-l-4 border-yellow-500">
          <p className="text-sm text-gray-500">Alertas</p>
          <p className="text-2xl font-bold text-yellow-600">{warningCount}</p>
        </div>
        <div className="bg-white rounded-lg shadow p-4 border-l-4 border-green-500">
          <p className="text-sm text-gray-500">OK</p>
          <p className="text-2xl font-bold text-green-600">{results.length - issues.length}</p>
        </div>
      </div>

      {/* Instructions */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
        <h3 className="font-semibold text-blue-800 mb-1">Como usar</h3>
        <p className="text-sm text-blue-700">
          O relatorio abaixo ja inclui o prompt otimizado com contexto do sistema, limites definidos, e dados das violacoes.
          Copie o texto completo e cole diretamente no ChatGPT, Claude, ou outra IA para obter analise e recomendacoes de performance.
        </p>
      </div>

      {/* Report preview */}
      <div className="bg-white rounded-lg shadow">
        <div className="border-b px-4 py-3 flex items-center justify-between">
          <h3 className="font-semibold">Preview do Prompt</h3>
          <span className="text-xs text-gray-400">{report.length.toLocaleString()} caracteres</span>
        </div>
        <pre className="p-4 text-sm text-gray-700 whitespace-pre-wrap font-mono overflow-auto max-h-[600px] leading-relaxed">
          {report}
        </pre>
      </div>
    </div>
  );
}
