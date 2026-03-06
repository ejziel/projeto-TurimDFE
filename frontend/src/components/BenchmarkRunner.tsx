import { useState } from 'react';
import { useBenchmark } from '../hooks/useBenchmark';
import StatusBadge from './common/StatusBadge';
import LoadingSpinner from './common/LoadingSpinner';
import LatencyChart from './charts/LatencyChart';
import ThroughputChart from './charts/ThroughputChart';
import PercentileChart from './charts/PercentileChart';

const SUITES = [
  { id: 'insert-single', label: 'Insercao Unitaria', desc: 'Testa latencia de insercao de documentos individuais' },
  { id: 'insert-batch', label: 'Insercao em Batch', desc: 'Compara performance de batch writes com diferentes tamanhos' },
  { id: 'query-filters', label: 'Queries com Filtros', desc: 'Testa queries usando os indices compostos planejados' },
  { id: 'query-pagination', label: 'Paginacao por Cursor', desc: 'Testa paginacao cursor-based em diferentes profundidades' },
  { id: 'query-volume', label: 'Escalabilidade por Volume', desc: 'Mede latencia de queries no volume atual de dados' },
  { id: 'concurrent', label: 'Operacoes Concorrentes', desc: 'Leituras e escritas simultaneas' },
  { id: 'counter-increment', label: 'Incremento de Contadores', desc: 'FieldValue.increment com diferentes niveis de concorrencia' },
  { id: 'index-effectiveness', label: 'Efetividade de Indices', desc: 'Compara queries com 1, 2 e 3 campos indexados' },
  { id: 'full-suite', label: 'Suite Completa', desc: 'Executa todos os benchmarks em sequencia' },
];

export default function BenchmarkRunner() {
  const [selectedSuite, setSelectedSuite] = useState(SUITES[0].id);
  const { run, polling, start } = useBenchmark();

  const handleRun = () => {
    start(selectedSuite);
  };

  const results = run?.results || [];

  return (
    <div>
      <h2 className="text-2xl font-bold mb-6">Executar Benchmarks</h2>

      <div className="bg-white rounded-lg shadow p-6 mb-6">
        <div className="flex flex-col md:flex-row gap-4 items-start md:items-end">
          <div className="flex-1">
            <label className="block text-sm font-medium text-gray-700 mb-1">Suite de Benchmark</label>
            <select
              value={selectedSuite}
              onChange={(e) => setSelectedSuite(e.target.value)}
              disabled={polling}
              className="w-full border border-gray-300 rounded px-3 py-2 text-sm"
            >
              {SUITES.map((s) => (
                <option key={s.id} value={s.id}>{s.label}</option>
              ))}
            </select>
            <p className="text-xs text-gray-400 mt-1">
              {SUITES.find((s) => s.id === selectedSuite)?.desc}
            </p>
          </div>
          <button
            onClick={handleRun}
            disabled={polling}
            className="px-6 py-2 bg-green-600 text-white rounded hover:bg-green-700 disabled:bg-gray-400 font-medium"
          >
            {polling ? 'Executando...' : 'Executar'}
          </button>
        </div>
      </div>

      {/* Run status */}
      {run && (
        <div className="bg-white rounded-lg shadow p-6 mb-6">
          <div className="flex items-center justify-between mb-2">
            <h3 className="font-semibold">{run.currentScenario}</h3>
            <StatusBadge status={run.status} />
          </div>
          {run.status === 'running' && (
            <div>
              <div className="w-full bg-gray-200 rounded-full h-3 mb-2">
                <div className="bg-green-600 h-3 rounded-full transition-all" style={{ width: `${run.progress}%` }} />
              </div>
              <LoadingSpinner size="sm" />
            </div>
          )}
          {run.error && <p className="text-red-600 text-sm">{run.error}</p>}
        </div>
      )}

      {/* Results */}
      {results.length > 0 && (
        <div className="space-y-6">
          {/* Summary table */}
          <div className="bg-white rounded-lg shadow p-6">
            <h3 className="font-semibold mb-4">Resultados</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left">
                    <th className="pb-2">Cenario</th>
                    <th className="pb-2">Ops</th>
                    <th className="pb-2">Ops/s</th>
                    <th className="pb-2">Mean (ms)</th>
                    <th className="pb-2">P95 (ms)</th>
                    <th className="pb-2">P99 (ms)</th>
                    <th className="pb-2">Erros</th>
                  </tr>
                </thead>
                <tbody>
                  {results.map((r, i) => (
                    <tr key={i} className="border-b border-gray-100">
                      <td className="py-2 font-medium">{r.scenarioName}</td>
                      <td className="py-2 font-mono">{r.metrics.totalOperations}</td>
                      <td className="py-2 font-mono">{r.metrics.operationsPerSecond}</td>
                      <td className="py-2 font-mono">{r.metrics.latency.mean.toFixed(2)}</td>
                      <td className="py-2 font-mono">{r.metrics.latency.p95.toFixed(2)}</td>
                      <td className="py-2 font-mono">{r.metrics.latency.p99.toFixed(2)}</td>
                      <td className="py-2">{r.metrics.errors}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Charts */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-white rounded-lg shadow p-4">
              <h3 className="font-semibold mb-3">Throughput (ops/s)</h3>
              <ThroughputChart results={results} />
            </div>
            <div className="bg-white rounded-lg shadow p-4">
              <h3 className="font-semibold mb-3">Percentis de Latencia</h3>
              <PercentileChart results={results} />
            </div>
          </div>

          {results.length > 0 && results[0].rawTimings.length > 0 && (
            <div className="bg-white rounded-lg shadow p-4">
              <h3 className="font-semibold mb-3">Distribuicao de Latencia</h3>
              <LatencyChart timings={results[0].rawTimings} title={results[0].scenarioName} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
