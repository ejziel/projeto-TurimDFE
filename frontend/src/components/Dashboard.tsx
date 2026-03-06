import { useState, useEffect, useCallback } from 'react';
import { getSeedStatus, getAllResults, getHealth } from '../api/benchmarkApi';
import { usePolling } from '../hooks/usePolling';
import MetricCard from './common/MetricCard';
import type { BenchmarkResult, HealthStatus } from '../types/benchmark.types';

export default function Dashboard() {
  const [results, setResults] = useState<BenchmarkResult[]>([]);
  const [health, setHealth] = useState<HealthStatus | null>(null);

  const fetchStatus = useCallback(() => getSeedStatus(), []);
  const { data: seedStatus } = usePolling(fetchStatus, 5000);

  useEffect(() => {
    getAllResults().then(setResults).catch(() => {});
    getHealth().then(setHealth).catch(() => {});
  }, []);

  const totalDocs = seedStatus?.counts?.documents || 0;
  const totalRuns = results.length;
  const avgLatency = totalRuns > 0
    ? (results.reduce((s, r) => s + r.metrics.latency.mean, 0) / totalRuns).toFixed(2)
    : '0';
  const bestOps = totalRuns > 0
    ? Math.max(...results.map((r) => r.metrics.operationsPerSecond)).toFixed(0)
    : '0';

  return (
    <div>
      <h2 className="text-2xl font-bold mb-6">Dashboard</h2>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <MetricCard title="Documentos no Firestore" value={totalDocs.toLocaleString()} color="blue" />
        <MetricCard title="Total de Benchmarks" value={totalRuns} color="green" />
        <MetricCard title="Latencia Media (ms)" value={avgLatency} color="orange" />
        <MetricCard title="Melhor Throughput (ops/s)" value={bestOps} color="purple" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-lg shadow p-4">
          <h3 className="font-semibold mb-3">Status do Sistema</h3>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-500">Firestore</span>
              <span className={health?.firestore === 'connected' ? 'text-green-600 font-medium' : 'text-red-600 font-medium'}>
                {health?.firestore || 'checking...'}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Emulator Host</span>
              <span className="font-mono text-xs">{health?.emulatorHost || '-'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Uptime</span>
              <span>{health ? `${Math.floor(health.uptime)}s` : '-'}</span>
            </div>
            {seedStatus?.counts && Object.entries(seedStatus.counts).map(([col, count]) => (
              <div key={col} className="flex justify-between">
                <span className="text-gray-500">{col}</span>
                <span className="font-mono">{count.toLocaleString()}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-white rounded-lg shadow p-4">
          <h3 className="font-semibold mb-3">Benchmarks Recentes</h3>
          {results.length === 0 ? (
            <p className="text-gray-400 text-sm">Nenhum benchmark executado ainda.</p>
          ) : (
            <div className="space-y-2">
              {results.slice(0, 8).map((r, i) => (
                <div key={i} className="flex justify-between text-sm border-b border-gray-100 pb-1">
                  <span className="truncate flex-1">{r.scenarioName}</span>
                  <span className="text-gray-500 mx-2">{r.metrics.latency.mean.toFixed(1)}ms</span>
                  <span className="font-mono text-xs">{r.metrics.operationsPerSecond} ops/s</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
