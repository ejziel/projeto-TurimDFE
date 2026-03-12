import { useState, useEffect, useRef } from 'react';
import { startAutoBenchmark, getAutoProgress } from '../api/benchmarkApi';
import type { BenchmarkResult } from '../types/benchmark.types';

const VOLUMES = [
    { value: '1k', label: '1K docs', desc: 'Rapido (~1 min) — apenas 1K', steps: ['1k'] },
    { value: '10k', label: '10K docs', desc: 'Padrao (~8 min) — 1K → 10K', steps: ['1k', '10k'] },
    { value: '50k', label: '50K docs', desc: 'Medio (~25 min) — 1K → 10K → 50K', steps: ['1k', '10k', '50k'] },
    { value: '100k', label: '100K docs', desc: 'Grande (~50 min) — 1K → 10K → 50K → 100K', steps: ['1k', '10k', '50k', '100k'] },
    { value: '250k', label: '250K docs', desc: 'Pesado (~2h) — 1K → 10K → 50K → 100K → 250K', steps: ['1k', '10k', '50k', '100k', '250k'] },
];

const SUITES = [
    { id: 'insert-single', label: 'Insercao Unitaria' },
    { id: 'insert-batch', label: 'Insercao em Batch' },
    { id: 'query-filters', label: 'Queries com Filtros' },
    { id: 'query-pagination', label: 'Paginacao por Cursor' },
    { id: 'query-volume', label: 'Escalabilidade por Volume' },
    { id: 'concurrent', label: 'Operacoes Concorrentes' },
    { id: 'counter-increment', label: 'Incremento de Contadores' },
    { id: 'index-effectiveness', label: 'Efetividade de Indices' },
];

interface VolumeResults {
    volume: string;
    results: BenchmarkResult[];
}

interface AutoProgress {
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
    config: Record<string, any>;
}

const statusLabels: Record<string, { label: string; color: string; bg: string }> = {
    clearing: { label: 'Limpando', color: 'text-orange-600', bg: 'bg-orange-100' },
    seeding: { label: 'Semeando', color: 'text-blue-600', bg: 'bg-blue-100' },
    benchmarking: { label: 'Testando', color: 'text-purple-600', bg: 'bg-purple-100' },
    'generating-report': { label: 'Gerando Relatorio', color: 'text-indigo-600', bg: 'bg-indigo-100' },
    completed: { label: 'Concluido', color: 'text-green-600', bg: 'bg-green-100' },
    failed: { label: 'Falhou', color: 'text-red-600', bg: 'bg-red-100' },
};

export default function AutoBenchmark() {
    const [volume, setVolume] = useState('10k');
    const [clearBefore] = useState(true);
    const [selectedSuites, setSelectedSuites] = useState<string[]>([]);
    const [running, setRunning] = useState(false);
    const [progress, setProgress] = useState<AutoProgress | null>(null);
    const [copied, setCopied] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

    useEffect(() => {
        return () => {
            if (pollRef.current) clearInterval(pollRef.current);
        };
    }, []);

    const selectedVolume = VOLUMES.find(v => v.value === volume);

    const handleStart = async () => {
        setError(null);
        setRunning(true);
        setProgress(null);

        try {
            const result = await startAutoBenchmark({
                volume,
                clearBefore,
                suites: selectedSuites.length > 0 ? selectedSuites : undefined,
            });

            const runId = result.runId;
            if (!runId) {
                setError('Benchmark iniciado mas runId nao retornado. Verifique auto-list.');
                setRunning(false);
                return;
            }

            pollRef.current = setInterval(async () => {
                try {
                    const prog = await getAutoProgress(runId);
                    setProgress(prog);

                    if (prog.status === 'completed' || prog.status === 'failed') {
                        if (pollRef.current) clearInterval(pollRef.current);
                        pollRef.current = null;
                        setRunning(false);
                        if (prog.status === 'failed') {
                            setError(prog.error || 'Benchmark falhou');
                        }
                    }
                } catch {
                    // Keep polling
                }
            }, 2000);
        } catch (err: any) {
            setError(err.message || 'Erro ao iniciar benchmark');
            setRunning(false);
        }
    };

    const handleToggleSuite = (suiteId: string) => {
        setSelectedSuites((prev) =>
            prev.includes(suiteId) ? prev.filter((s) => s !== suiteId) : [...prev, suiteId],
        );
    };

    const handleSelectAll = () => {
        setSelectedSuites(selectedSuites.length === SUITES.length ? [] : SUITES.map((s) => s.id));
    };

    const handleCopyReport = () => {
        if (progress?.report) {
            navigator.clipboard.writeText(progress.report).then(() => {
                setCopied(true);
                setTimeout(() => setCopied(false), 2000);
            });
        }
    };

    const handleDownloadReport = () => {
        if (progress?.report) {
            const blob = new Blob([progress.report], { type: 'text/plain;charset=utf-8' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `turimdfe-benchmark-progressivo-${volume}-${new Date().toISOString().slice(0, 10)}.txt`;
            a.click();
            URL.revokeObjectURL(url);
        }
    };

    const statusInfo = progress ? statusLabels[progress.status] || statusLabels.failed : null;

    const elapsed = progress
        ? (() => {
            const start = new Date(progress.startedAt).getTime();
            const end = progress.completedAt ? new Date(progress.completedAt).getTime() : Date.now();
            const seconds = Math.round((end - start) / 1000);
            const mins = Math.floor(seconds / 60);
            const secs = seconds % 60;
            return mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;
        })()
        : '';

    return (
        <div>
            <h2 className="text-2xl font-bold mb-2">Benchmark Automatico Progressivo</h2>
            <p className="text-gray-500 text-sm mb-6">
                Testa escalabilidade executando benchmarks em volumes crescentes e gerando relatorio comparativo
            </p>

            {/* Config Panel */}
            {!running && !progress?.report && (
                <div className="bg-white rounded-lg shadow p-6 mb-6">
                    <h3 className="font-semibold mb-4">Configuracao</h3>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        {/* Volume */}
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">Volume Alvo</label>
                            <div className="space-y-2">
                                {VOLUMES.map((v) => (
                                    <label
                                        key={v.value}
                                        className={`flex items-start gap-3 p-3 rounded border cursor-pointer transition-colors ${volume === v.value ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:border-gray-300'
                                            }`}
                                    >
                                        <input
                                            type="radio"
                                            name="volume"
                                            value={v.value}
                                            checked={volume === v.value}
                                            onChange={() => setVolume(v.value)}
                                            className="text-blue-600 mt-1"
                                        />
                                        <div className="flex-1">
                                            <div className="flex items-center gap-2">
                                                <span className="font-medium">{v.label}</span>
                                                {v.steps.length > 1 && (
                                                    <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full font-medium">
                                                        {v.steps.length} etapas
                                                    </span>
                                                )}
                                            </div>
                                            <p className="text-gray-400 text-xs mt-0.5">{v.desc}</p>
                                            {v.steps.length > 1 && (
                                                <div className="flex items-center gap-1 mt-1">
                                                    {v.steps.map((step, i) => (
                                                        <span key={step} className="flex items-center">
                                                            <span className={`text-xs font-mono px-1.5 py-0.5 rounded ${volume === v.value ? 'bg-blue-200 text-blue-800' : 'bg-gray-100 text-gray-500'
                                                                }`}>
                                                                {step}
                                                            </span>
                                                            {i < v.steps.length - 1 && <span className="text-gray-300 mx-0.5">→</span>}
                                                        </span>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                    </label>
                                ))}
                            </div>
                        </div>

                        {/* Suites */}
                        <div>
                            <div className="flex items-center justify-between mb-2">
                                <label className="block text-sm font-medium text-gray-700">Suites de Benchmark</label>
                                <button
                                    onClick={handleSelectAll}
                                    className="text-xs text-blue-600 hover:underline"
                                >
                                    {selectedSuites.length === SUITES.length ? 'Desmarcar todas' : 'Selecionar todas'}
                                </button>
                            </div>
                            <p className="text-xs text-gray-400 mb-2">Vazio = todas as suites (executadas em cada volume)</p>
                            <div className="space-y-1">
                                {SUITES.map((suite) => (
                                    <label
                                        key={suite.id}
                                        className={`flex items-center gap-2 px-3 py-2 rounded border cursor-pointer text-sm transition-colors ${selectedSuites.includes(suite.id) ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:border-gray-300'
                                            }`}
                                    >
                                        <input
                                            type="checkbox"
                                            checked={selectedSuites.includes(suite.id)}
                                            onChange={() => handleToggleSuite(suite.id)}
                                            className="text-blue-600"
                                        />
                                        {suite.label}
                                    </label>
                                ))}
                            </div>

                            {/* Info box */}
                            {selectedVolume && selectedVolume.steps.length > 1 && (
                                <div className="mt-4 p-3 bg-amber-50 border border-amber-200 rounded text-xs text-amber-800">
                                    <strong>Modo progressivo:</strong> Cada suite sera executada {selectedVolume.steps.length} vezes
                                    (uma para cada volume: {selectedVolume.steps.join(' → ')}).
                                    Total: {(selectedSuites.length || 8) * selectedVolume.steps.length} execucoes de suites.
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Start button */}
                    <div className="mt-6 border-t pt-4">
                        <button
                            onClick={handleStart}
                            disabled={running}
                            className="px-8 py-3 bg-green-600 text-white rounded-lg font-semibold hover:bg-green-700 disabled:bg-gray-400 transition-colors text-lg"
                        >
                            Iniciar Benchmark Progressivo
                        </button>
                        <p className="text-xs text-gray-400 mt-2">
                            {selectedVolume && selectedVolume.steps.length > 1
                                ? `Para cada volume (${selectedVolume.steps.join(' → ')}): limpar → seed → ${selectedSuites.length || 8} suites → proximo volume → relatorio comparativo`
                                : `Limpar dados → seed ${volume} → executar ${selectedSuites.length || 8} suites → relatorio`
                            }
                        </p>
                    </div>
                </div>
            )}

            {/* Error */}
            {error && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
                    <p className="text-red-800 font-medium">Erro</p>
                    <p className="text-red-700 text-sm">{error}</p>
                </div>
            )}

            {/* Progress Panel */}
            {progress && (
                <div className="bg-white rounded-lg shadow p-6 mb-6">
                    <div className="flex items-center justify-between mb-4">
                        <div className="flex items-center gap-3">
                            <h3 className="font-semibold">Progresso</h3>
                            {statusInfo && (
                                <span className={`px-3 py-1 rounded-full text-xs font-medium ${statusInfo.bg} ${statusInfo.color}`}>
                                    {statusInfo.label}
                                </span>
                            )}
                            {progress.currentVolume && progress.status !== 'completed' && (
                                <span className="px-3 py-1 rounded-full text-xs font-medium bg-purple-100 text-purple-700">
                                    Volume: {progress.currentVolume}
                                </span>
                            )}
                        </div>
                        <span className="text-sm text-gray-400">{elapsed}</span>
                    </div>

                    {/* Overall progress bar */}
                    <div className="w-full bg-gray-200 rounded-full h-4 mb-3">
                        <div
                            className={`h-4 rounded-full transition-all duration-500 ${progress.status === 'completed' ? 'bg-green-500' :
                                    progress.status === 'failed' ? 'bg-red-500' : 'bg-blue-500'
                                }`}
                            style={{ width: `${progress.overallProgress}%` }}
                        />
                    </div>
                    <p className="text-sm text-gray-600 mb-4">{progress.phase}</p>

                    {/* Volume steps progress */}
                    {progress.volumeSteps && progress.volumeSteps.length > 1 && (
                        <div className="mb-4">
                            <p className="text-xs text-gray-500 mb-2">
                                Volumes: {progress.completedVolumes?.length || 0}/{progress.volumeSteps.length}
                            </p>
                            <div className="flex items-center gap-1">
                                {progress.volumeSteps.map((vol, i) => {
                                    const isCompleted = progress.completedVolumes?.includes(vol);
                                    const isCurrent = progress.currentVolume === vol && !isCompleted;
                                    return (
                                        <div key={vol} className="flex items-center">
                                            <div
                                                className={`px-3 py-2 rounded-lg text-sm font-mono font-bold transition-all ${isCompleted ? 'bg-green-500 text-white shadow-sm' :
                                                        isCurrent ? 'bg-blue-500 text-white animate-pulse shadow-md' :
                                                            'bg-gray-100 text-gray-400'
                                                    }`}
                                            >
                                                {isCompleted ? '✓ ' : isCurrent ? '▶ ' : ''}{vol}
                                            </div>
                                            {i < progress.volumeSteps.length - 1 && (
                                                <span className={`mx-1 text-lg ${isCompleted ? 'text-green-400' : 'text-gray-300'}`}>→</span>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    )}

                    {/* Seed progress details */}
                    {progress.status === 'seeding' && progress.seedProgress && (
                        <div className="grid grid-cols-2 gap-4 mb-4 p-4 bg-gray-50 rounded">
                            <div>
                                <p className="text-xs text-gray-500">Documentos</p>
                                <p className="font-mono text-sm">
                                    {progress.seedProgress.seededDocs.toLocaleString()} / {progress.seedProgress.totalDocs.toLocaleString()}
                                </p>
                            </div>
                            <div>
                                <p className="text-xs text-gray-500">Eventos</p>
                                <p className="font-mono text-sm">
                                    {progress.seedProgress.seededEvents.toLocaleString()} / {progress.seedProgress.totalEvents.toLocaleString()}
                                </p>
                            </div>
                        </div>
                    )}

                    {/* Benchmark suites progress (current volume) */}
                    {(progress.status === 'benchmarking') && (
                        <div className="mb-4">
                            <p className="text-xs text-gray-500 mb-2">
                                Suites ({progress.currentVolume}): {progress.completedSuites?.length || 0}/{progress.totalSuites}
                            </p>
                            <div className="flex flex-wrap gap-2">
                                {SUITES.map((suite) => {
                                    const isCompleted = progress.completedSuites?.includes(suite.id);
                                    const isCurrent = progress.currentSuite === suite.id && !isCompleted;
                                    return (
                                        <span
                                            key={suite.id}
                                            className={`px-2 py-1 rounded text-xs font-medium ${isCompleted ? 'bg-green-100 text-green-700' :
                                                    isCurrent ? 'bg-blue-100 text-blue-700 animate-pulse' :
                                                        'bg-gray-100 text-gray-400'
                                                }`}
                                        >
                                            {isCompleted ? '✓' : isCurrent ? '⏳' : '○'} {suite.label}
                                        </span>
                                    );
                                })}
                            </div>
                        </div>
                    )}

                    {/* Live results table grouped by volume */}
                    {progress.resultsByVolume && progress.resultsByVolume.length > 0 && (
                        <div className="mt-4">
                            <h4 className="text-sm font-semibold mb-2">
                                Resultados ({progress.results?.length || 0} cenarios em {progress.resultsByVolume.length} volume{progress.resultsByVolume.length > 1 ? 's' : ''})
                            </h4>
                            <div className="overflow-x-auto max-h-72 overflow-y-auto">
                                <table className="w-full text-xs">
                                    <thead className="sticky top-0 bg-white">
                                        <tr className="border-b text-left">
                                            <th className="pb-1">Volume</th>
                                            <th className="pb-1">Cenario</th>
                                            <th className="pb-1">Suite</th>
                                            <th className="pb-1">Ops/s</th>
                                            <th className="pb-1">Mean (ms)</th>
                                            <th className="pb-1">P95 (ms)</th>
                                            <th className="pb-1">Erros</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {progress.resultsByVolume.map((vr) =>
                                            vr.results.map((r, i) => (
                                                <tr key={`${vr.volume}-${i}`} className="border-b border-gray-50">
                                                    <td className="py-1">
                                                        <span className="px-1.5 py-0.5 rounded bg-gray-100 font-mono text-gray-600">{vr.volume}</span>
                                                    </td>
                                                    <td className="py-1 font-medium truncate max-w-[180px]">{r.scenarioName}</td>
                                                    <td className="py-1 text-gray-500">{r.suiteName}</td>
                                                    <td className="py-1 font-mono">{r.metrics.operationsPerSecond}</td>
                                                    <td className="py-1 font-mono">{r.metrics.latency.mean.toFixed(1)}</td>
                                                    <td className="py-1 font-mono">{r.metrics.latency.p95.toFixed(1)}</td>
                                                    <td className="py-1">{r.metrics.errors}</td>
                                                </tr>
                                            ))
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* Report Section */}
            {progress?.report && (
                <div className="space-y-6">
                    <div className="bg-white rounded-lg shadow p-6">
                        <div className="flex items-center justify-between mb-4">
                            <h3 className="font-semibold text-lg">Relatorio Comparativo</h3>
                            <div className="flex gap-2">
                                <button
                                    onClick={handleCopyReport}
                                    className={`px-4 py-2 rounded text-sm text-white ${copied ? 'bg-green-600' : 'bg-blue-600 hover:bg-blue-700'
                                        }`}
                                >
                                    {copied ? 'Copiado!' : 'Copiar Relatorio'}
                                </button>
                                <button
                                    onClick={handleDownloadReport}
                                    className="px-4 py-2 bg-gray-700 text-white rounded text-sm hover:bg-gray-800"
                                >
                                    Baixar .txt
                                </button>
                                <button
                                    onClick={() => { setProgress(null); setError(null); }}
                                    className="px-4 py-2 bg-gray-200 text-gray-700 rounded text-sm hover:bg-gray-300"
                                >
                                    Novo Benchmark
                                </button>
                            </div>
                        </div>

                        {/* Summary cards */}
                        {progress.results.length > 0 && (
                            <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
                                <div className="bg-gray-50 rounded p-3">
                                    <p className="text-xs text-gray-500">Volumes</p>
                                    <p className="text-lg font-bold">{progress.completedVolumes?.join(' → ')}</p>
                                </div>
                                <div className="bg-gray-50 rounded p-3">
                                    <p className="text-xs text-gray-500">Etapas</p>
                                    <p className="text-xl font-bold">{progress.completedVolumes?.length || 0}</p>
                                </div>
                                <div className="bg-gray-50 rounded p-3">
                                    <p className="text-xs text-gray-500">Cenarios Total</p>
                                    <p className="text-xl font-bold">{progress.results.length}</p>
                                </div>
                                <div className="bg-gray-50 rounded p-3">
                                    <p className="text-xs text-gray-500">Suites/Volume</p>
                                    <p className="text-xl font-bold">{progress.totalSuites}</p>
                                </div>
                                <div className="bg-gray-50 rounded p-3">
                                    <p className="text-xs text-gray-500">Duracao</p>
                                    <p className="text-xl font-bold">{elapsed}</p>
                                </div>
                            </div>
                        )}

                        {/* Instructions */}
                        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4">
                            <h4 className="font-semibold text-blue-800 mb-1">Relatorio de Escalabilidade</h4>
                            <p className="text-sm text-blue-700">
                                Este relatorio compara o desempenho entre volumes ({progress.completedVolumes?.join(' → ')}).
                                Inclui analise de degradacao e um prompt otimizado para IA focar em escalabilidade.
                                Copie e cole no ChatGPT, Claude ou outra IA.
                            </p>
                        </div>

                        {/* Report preview */}
                        <div className="border rounded-lg">
                            <div className="border-b px-4 py-3 flex items-center justify-between bg-gray-50">
                                <h4 className="font-semibold text-sm">Relatorio Comparativo Completo</h4>
                                <span className="text-xs text-gray-400">{progress.report.length.toLocaleString()} caracteres</span>
                            </div>
                            <pre className="p-4 text-xs text-gray-700 whitespace-pre-wrap font-mono overflow-auto max-h-[500px] leading-relaxed">
                                {progress.report}
                            </pre>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
