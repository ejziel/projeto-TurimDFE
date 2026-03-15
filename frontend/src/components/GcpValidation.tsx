import { useState, useEffect } from 'react';
import {
    getHealth,
    seedGenerate,
    runGcpValidation,
    getGcpValidationResult,
    getGcpValidationLatest,
} from '../api/benchmarkApi';
import type { HealthStatus, GcpValidationResult, QueryOutcome } from '../types/benchmark.types';

const GCP_VOLUMES = ['gcp-5k', 'gcp-50k', 'gcp-500k'] as const;

function StatusBadge({ status }: { status: QueryOutcome['status'] }) {
    if (status === 'success') return <span className="px-2 py-0.5 rounded text-xs bg-green-800 text-green-200">✓ indexed</span>;
    if (status === 'index_required') return <span className="px-2 py-0.5 rounded text-xs bg-yellow-800 text-yellow-200">⚠ index_required</span>;
    return <span className="px-2 py-0.5 rounded text-xs bg-red-800 text-red-200">✗ error</span>;
}

function QueryTable({ queries, title }: { queries: QueryOutcome[]; title: string }) {
    // Deduplicate by queryName, show one row per unique query (average latency)
    const byName: Record<string, QueryOutcome[]> = {};
    for (const q of queries) {
        if (!byName[q.queryName]) byName[q.queryName] = [];
        byName[q.queryName].push(q);
    }

    return (
        <div className="mb-6">
            <h3 className="text-sm font-semibold text-gray-300 mb-2">{title}</h3>
            <div className="overflow-x-auto">
                <table className="w-full text-sm">
                    <thead>
                        <tr className="text-left text-gray-400 border-b border-gray-700">
                            <th className="py-2 pr-4">Query</th>
                            <th className="py-2 pr-4">Status</th>
                            <th className="py-2 pr-4">Latência média</th>
                            <th className="py-2 pr-4">Docs retornados</th>
                            <th className="py-2">Detalhe</th>
                        </tr>
                    </thead>
                    <tbody>
                        {Object.entries(byName).map(([name, outcomes]) => {
                            const successOnes = outcomes.filter(o => o.status === 'success');
                            const avgLatency = successOnes.length
                                ? successOnes.reduce((s, o) => s + o.latencyMs, 0) / successOnes.length
                                : outcomes[0].latencyMs;
                            const avgDocs = successOnes.length
                                ? Math.round(successOnes.reduce((s, o) => s + o.docsReturned, 0) / successOnes.length)
                                : 0;
                            const representative = outcomes[0];

                            return (
                                <tr key={name} className="border-b border-gray-800">
                                    <td className="py-2 pr-4 font-mono text-xs text-gray-300">{name}</td>
                                    <td className="py-2 pr-4"><StatusBadge status={representative.status} /></td>
                                    <td className="py-2 pr-4 text-gray-200">{avgLatency.toFixed(1)} ms</td>
                                    <td className="py-2 pr-4 text-gray-200">{avgDocs}</td>
                                    <td className="py-2 text-xs text-gray-500">
                                        {representative.status === 'index_required' && representative.indexCreationUrl && (
                                            <a
                                                href={representative.indexCreationUrl}
                                                target="_blank"
                                                rel="noreferrer"
                                                className="text-blue-400 hover:underline"
                                            >
                                                Criar índice ↗
                                            </a>
                                        )}
                                        {representative.status === 'error' && (
                                            <span className="text-red-400">{representative.errorMessage}</span>
                                        )}
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>
        </div>
    );
}

export default function GcpValidation() {
    const [health, setHealth] = useState<HealthStatus | null>(null);
    const [volume, setVolume] = useState<string>('gcp-5k');
    const [seedStatus, setSeedStatus] = useState<'idle' | 'seeding' | 'done' | 'error'>('idle');
    const [runStatus, setRunStatus] = useState<'idle' | 'running' | 'done' | 'error'>('idle');
    const [result, setResult] = useState<GcpValidationResult | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [pollRunId, setPollRunId] = useState<string | null>(null);

    useEffect(() => {
        getHealth().then(setHealth).catch(() => {});
    }, []);

    // Load last result on mount
    useEffect(() => {
        getGcpValidationLatest().then(setResult).catch(() => {});
    }, []);

    // Poll for completion
    useEffect(() => {
        if (!pollRunId || runStatus !== 'running') return;
        const interval = setInterval(async () => {
            try {
                const data = await getGcpValidationResult(pollRunId);
                if (data.status === 'completed') {
                    clearInterval(interval);
                    setRunStatus('done');
                    if (data.gcpValidation) setResult(data.gcpValidation);
                } else if (data.status === 'failed') {
                    clearInterval(interval);
                    setRunStatus('error');
                    setError('Validation failed');
                }
            } catch {
                clearInterval(interval);
                setRunStatus('error');
            }
        }, 2000);
        return () => clearInterval(interval);
    }, [pollRunId, runStatus]);

    const handleSeed = async () => {
        setSeedStatus('seeding');
        setError(null);
        try {
            await seedGenerate(volume);
            setSeedStatus('done');
        } catch (e: any) {
            setSeedStatus('error');
            setError(e.message);
        }
    };

    const handleRunValidation = async () => {
        setRunStatus('running');
        setError(null);
        try {
            const { runId } = await runGcpValidation({ iterations: 5 });
            setPollRunId(runId);
        } catch (e: any) {
            setRunStatus('error');
            setError(e.message);
        }
    };

    const gcpMode = health?.gcpMode ?? false;

    return (
        <div className="p-6 space-y-6">
            {/* Header */}
            <div className="flex items-center gap-4">
                <h2 className="text-2xl font-bold text-white">GCP Firestore Validation</h2>
                <span className={`px-3 py-1 rounded-full text-sm font-semibold ${gcpMode ? 'bg-green-800 text-green-200' : 'bg-yellow-800 text-yellow-200'}`}>
                    {gcpMode ? '● GCP' : '● Emulator'}
                </span>
                {health && (
                    <span className="text-sm text-gray-400">
                        project: {health.projectId}
                    </span>
                )}
            </div>

            {!gcpMode && (
                <div className="bg-yellow-900/40 border border-yellow-700 rounded p-4 text-yellow-200 text-sm">
                    <strong>Aviso:</strong> rodando em modo Emulator. As queries sem índice <strong>não</strong> falharão —
                    o emulador faz scan em memória. Para validar comportamento real de produção, use:
                    <code className="block mt-1 text-xs font-mono bg-black/30 p-2 rounded">
                        docker compose -f docker-compose.yml -f docker-compose.gcp.yml up --build
                    </code>
                </div>
            )}

            {/* Seed + Run controls */}
            <div className="bg-gray-800 rounded-lg p-4 flex flex-wrap gap-4 items-end">
                <div>
                    <label className="block text-sm text-gray-400 mb-1">Volume</label>
                    <select
                        value={volume}
                        onChange={(e) => setVolume(e.target.value)}
                        className="bg-gray-700 text-white rounded px-3 py-2 text-sm"
                    >
                        {GCP_VOLUMES.map(v => <option key={v} value={v}>{v}</option>)}
                    </select>
                </div>
                <button
                    onClick={handleSeed}
                    disabled={seedStatus === 'seeding'}
                    className="px-4 py-2 rounded bg-indigo-600 hover:bg-indigo-700 text-white text-sm disabled:opacity-50"
                >
                    {seedStatus === 'seeding' ? 'Seeding...' : `Seed ${volume}`}
                </button>
                {seedStatus === 'done' && <span className="text-green-400 text-sm">Seed concluído ✓</span>}

                <button
                    onClick={handleRunValidation}
                    disabled={runStatus === 'running'}
                    className="px-4 py-2 rounded bg-blue-600 hover:bg-blue-700 text-white text-sm disabled:opacity-50"
                >
                    {runStatus === 'running' ? 'Executando...' : 'Rodar Validação'}
                </button>
                {runStatus === 'done' && <span className="text-green-400 text-sm">Validação concluída ✓</span>}
            </div>

            {error && (
                <div className="bg-red-900/40 border border-red-700 rounded p-3 text-red-200 text-sm">{error}</div>
            )}

            {/* Results */}
            {result && (
                <div className="space-y-6">
                    {/* Summary */}
                    <div className="bg-gray-800 rounded-lg p-4">
                        <h3 className="text-sm font-semibold text-gray-400 mb-3 uppercase tracking-wide">Resumo</h3>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                            <div className="text-center">
                                <div className="text-2xl font-bold text-green-400">{result.summary.passed}</div>
                                <div className="text-xs text-gray-400">Indexed (success)</div>
                            </div>
                            <div className="text-center">
                                <div className="text-2xl font-bold text-yellow-400">{result.summary.indexRequired}</div>
                                <div className="text-xs text-gray-400">Index required</div>
                            </div>
                            <div className="text-center">
                                <div className="text-2xl font-bold text-red-400">{result.summary.errors}</div>
                                <div className="text-xs text-gray-400">Errors</div>
                            </div>
                            <div className="text-center">
                                <div className="text-2xl font-bold text-gray-200">{result.collectionSize.toLocaleString()}</div>
                                <div className="text-xs text-gray-400">Docs na coleção</div>
                            </div>
                        </div>
                        <div className="mt-2 text-xs text-gray-500">
                            Executado em {new Date(result.runAt).toLocaleString()} · modo: {result.mode}
                        </div>
                    </div>

                    {/* O(result) proof */}
                    <div className="bg-gray-800 rounded-lg p-4">
                        <h3 className="text-sm font-semibold text-gray-400 mb-1 uppercase tracking-wide">Prova O(result)</h3>
                        <p className="text-xs text-gray-500 mb-3">{result.oresultProof.description}</p>
                        <p className="text-xs text-gray-400">
                            Query: <code className="font-mono text-gray-300">{result.oresultProof.queryName}</code>
                        </p>
                        <div className="mt-2 space-y-1">
                            {result.oresultProof.results.map((q, i) => (
                                <div key={i} className="text-sm text-gray-300">
                                    Iteração {i + 1}: <strong>{q.latencyMs.toFixed(1)} ms</strong>
                                    {' '}&mdash; {q.docsReturned} docs retornados
                                    {' '}<StatusBadge status={q.status} />
                                </div>
                            ))}
                        </div>
                        <p className="mt-3 text-xs text-gray-500">
                            Compare rodando com gcp-50k e depois gcp-500k: a latência deve ser ≈ igual (ratio ≈ 1.0).
                        </p>
                    </div>

                    {/* Query tables */}
                    <div className="bg-gray-800 rounded-lg p-4">
                        <QueryTable queries={result.indexedQueries} title="Grupo A — Queries Indexadas (devem suceder no GCP real)" />
                        <QueryTable queries={result.unindexedQueries} title="Grupo B — Queries Sem Índice (devem falhar com FAILED_PRECONDITION no GCP real)" />
                    </div>
                </div>
            )}

            {!result && runStatus === 'idle' && (
                <div className="text-gray-500 text-sm text-center py-12">
                    Faça o seed e rode a validação para ver os resultados.
                </div>
            )}
        </div>
    );
}
