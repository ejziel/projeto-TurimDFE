import { useState, useEffect } from 'react';
import { getAllResults } from '../api/benchmarkApi';
import type { BenchmarkResult } from '../types/benchmark.types';
import VolumeScalingChart from './charts/VolumeScalingChart';
import ComparisonChart from './charts/ComparisonChart';

export default function ResultsTable() {
  const [results, setResults] = useState<BenchmarkResult[]>([]);
  const [sortField, setSortField] = useState<string>('completedAt');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  useEffect(() => {
    getAllResults().then(setResults).catch(() => {});
  }, []);

  const handleSort = (field: string) => {
    if (sortField === field) {
      setSortDir(sortDir === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDir('desc');
    }
  };

  const sorted = [...results].sort((a, b) => {
    let av: any, bv: any;
    switch (sortField) {
      case 'scenarioName': av = a.scenarioName; bv = b.scenarioName; break;
      case 'dataVolume': av = a.dataVolume; bv = b.dataVolume; break;
      case 'opsPerSec': av = a.metrics.operationsPerSecond; bv = b.metrics.operationsPerSecond; break;
      case 'mean': av = a.metrics.latency.mean; bv = b.metrics.latency.mean; break;
      case 'p95': av = a.metrics.latency.p95; bv = b.metrics.latency.p95; break;
      case 'p99': av = a.metrics.latency.p99; bv = b.metrics.latency.p99; break;
      case 'errors': av = a.metrics.errors; bv = b.metrics.errors; break;
      default: av = a.completedAt; bv = b.completedAt;
    }
    if (av < bv) return sortDir === 'asc' ? -1 : 1;
    if (av > bv) return sortDir === 'asc' ? 1 : -1;
    return 0;
  });

  const exportCSV = () => {
    const header = 'Cenario,Suite,Volume,Ops,Ops/s,Min,Mean,Median,P95,P99,Max,StdDev,Erros,Data\n';
    const rows = results.map((r) =>
      [r.scenarioName, r.suiteName, r.dataVolume, r.metrics.totalOperations,
        r.metrics.operationsPerSecond, r.metrics.latency.min, r.metrics.latency.mean,
        r.metrics.latency.median, r.metrics.latency.p95, r.metrics.latency.p99,
        r.metrics.latency.max, r.metrics.latency.stddev, r.metrics.errors, r.completedAt,
      ].join(','),
    ).join('\n');

    const blob = new Blob([header + rows], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `benchmark-results-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const SortHeader = ({ field, label }: { field: string; label: string }) => (
    <th
      className="pb-2 cursor-pointer hover:text-blue-600 select-none"
      onClick={() => handleSort(field)}
    >
      {label} {sortField === field ? (sortDir === 'asc' ? '\u25B2' : '\u25BC') : ''}
    </th>
  );

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold">Resultados</h2>
        <button onClick={exportCSV} className="px-4 py-2 bg-gray-700 text-white rounded text-sm hover:bg-gray-800">
          Exportar CSV
        </button>
      </div>

      {results.length === 0 ? (
        <div className="bg-white rounded-lg shadow p-8 text-center text-gray-400">
          Nenhum resultado disponivel. Execute um benchmark primeiro.
        </div>
      ) : (
        <>
          <div className="bg-white rounded-lg shadow p-6 mb-6 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left">
                  <SortHeader field="scenarioName" label="Cenario" />
                  <SortHeader field="dataVolume" label="Volume" />
                  <SortHeader field="opsPerSec" label="Ops/s" />
                  <SortHeader field="mean" label="Mean (ms)" />
                  <SortHeader field="p95" label="P95 (ms)" />
                  <SortHeader field="p99" label="P99 (ms)" />
                  <SortHeader field="errors" label="Erros" />
                  <SortHeader field="completedAt" label="Data" />
                </tr>
              </thead>
              <tbody>
                {sorted.map((r, i) => (
                  <tr key={i} className="border-b border-gray-100 hover:bg-gray-50">
                    <td className="py-2 font-medium">{r.scenarioName}</td>
                    <td className="py-2 font-mono">{r.dataVolume.toLocaleString()}</td>
                    <td className="py-2 font-mono">{r.metrics.operationsPerSecond}</td>
                    <td className="py-2 font-mono">{r.metrics.latency.mean.toFixed(2)}</td>
                    <td className="py-2 font-mono">{r.metrics.latency.p95.toFixed(2)}</td>
                    <td className="py-2 font-mono">{r.metrics.latency.p99.toFixed(2)}</td>
                    <td className="py-2">{r.metrics.errors}</td>
                    <td className="py-2 text-xs text-gray-500">{new Date(r.completedAt).toLocaleString('pt-BR')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-white rounded-lg shadow p-4">
              <h3 className="font-semibold mb-3">Escalabilidade por Volume</h3>
              <VolumeScalingChart results={results} />
            </div>
            <div className="bg-white rounded-lg shadow p-4">
              <h3 className="font-semibold mb-3">Comparacao de Cenarios</h3>
              <ComparisonChart results={results} />
            </div>
          </div>
        </>
      )}
    </div>
  );
}
