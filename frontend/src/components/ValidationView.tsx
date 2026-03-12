import { useState, useEffect, useMemo } from 'react';
import { getAllResults } from '../api/benchmarkApi';
import type { BenchmarkResult, ValidationThresholds, ValidationIssue } from '../types/benchmark.types';
import { DEFAULT_THRESHOLDS } from '../types/benchmark.types';

function getThresholds(suiteName: string, overrides: Record<string, Partial<ValidationThresholds>>): ValidationThresholds {
  const base = DEFAULT_THRESHOLDS[suiteName] || DEFAULT_THRESHOLDS.default;
  const override = overrides[suiteName];
  return override ? { ...base, ...override } : base;
}

function validateResult(result: BenchmarkResult, thresholds: ValidationThresholds): ValidationIssue | null {
  const violations: ValidationIssue['violations'] = [];
  const { metrics } = result;

  if (metrics.latency.mean > thresholds.maxMeanLatencyMs) {
    violations.push({
      field: 'latency.mean',
      label: 'Latencia Media',
      value: metrics.latency.mean,
      threshold: thresholds.maxMeanLatencyMs,
      severity: metrics.latency.mean > thresholds.maxMeanLatencyMs * 2 ? 'critical' : 'warning',
    });
  }

  if (metrics.latency.p95 > thresholds.maxP95LatencyMs) {
    violations.push({
      field: 'latency.p95',
      label: 'P95',
      value: metrics.latency.p95,
      threshold: thresholds.maxP95LatencyMs,
      severity: metrics.latency.p95 > thresholds.maxP95LatencyMs * 2 ? 'critical' : 'warning',
    });
  }

  if (metrics.latency.p99 > thresholds.maxP99LatencyMs) {
    violations.push({
      field: 'latency.p99',
      label: 'P99',
      value: metrics.latency.p99,
      threshold: thresholds.maxP99LatencyMs,
      severity: metrics.latency.p99 > thresholds.maxP99LatencyMs * 2 ? 'critical' : 'warning',
    });
  }

  if (metrics.operationsPerSecond < thresholds.minOpsPerSecond) {
    violations.push({
      field: 'operationsPerSecond',
      label: 'Throughput',
      value: metrics.operationsPerSecond,
      threshold: thresholds.minOpsPerSecond,
      severity: metrics.operationsPerSecond < thresholds.minOpsPerSecond / 2 ? 'critical' : 'warning',
    });
  }

  if (metrics.errorRate > thresholds.maxErrorRate) {
    violations.push({
      field: 'errorRate',
      label: 'Taxa de Erros',
      value: metrics.errorRate,
      threshold: thresholds.maxErrorRate,
      severity: metrics.errorRate > thresholds.maxErrorRate * 3 ? 'critical' : 'warning',
    });
  }

  return violations.length > 0 ? { result, violations } : null;
}

export default function ValidationView() {
  const [results, setResults] = useState<BenchmarkResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [thresholdOverrides, setThresholdOverrides] = useState<Record<string, Partial<ValidationThresholds>>>({});
  const [showConfig, setShowConfig] = useState(false);
  const [filterSeverity, setFilterSeverity] = useState<'all' | 'warning' | 'critical'>('all');

  useEffect(() => {
    getAllResults()
      .then(setResults)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const issues = useMemo(() => {
    const allIssues: ValidationIssue[] = [];
    for (const r of results) {
      const thresholds = getThresholds(r.suiteName, thresholdOverrides);
      const issue = validateResult(r, thresholds);
      if (issue) allIssues.push(issue);
    }
    return allIssues;
  }, [results, thresholdOverrides]);

  const filtered = useMemo(() => {
    if (filterSeverity === 'all') return issues;
    return issues.filter((i) => i.violations.some((v) => v.severity === filterSeverity));
  }, [issues, filterSeverity]);

  const criticalCount = issues.filter((i) => i.violations.some((v) => v.severity === 'critical')).length;
  const warningCount = issues.filter((i) => i.violations.some((v) => v.severity === 'warning' && !i.violations.some((v2) => v2.severity === 'critical'))).length;

  const handleThresholdChange = (suite: string, field: keyof ValidationThresholds, value: string) => {
    const num = parseFloat(value);
    if (isNaN(num)) return;
    setThresholdOverrides((prev) => ({
      ...prev,
      [suite]: { ...prev[suite], [field]: num },
    }));
  };

  const suites = [...new Set(results.map((r) => r.suiteName))];

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold">Validacao</h2>
        <div className="flex gap-2">
          <button
            onClick={() => setShowConfig(!showConfig)}
            className="px-4 py-2 bg-gray-200 text-gray-700 rounded text-sm hover:bg-gray-300"
          >
            {showConfig ? 'Ocultar Limites' : 'Configurar Limites'}
          </button>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div className="bg-white rounded-lg shadow p-4 border-l-4 border-red-500">
          <p className="text-sm text-gray-500">Criticos</p>
          <p className="text-3xl font-bold text-red-600">{criticalCount}</p>
        </div>
        <div className="bg-white rounded-lg shadow p-4 border-l-4 border-yellow-500">
          <p className="text-sm text-gray-500">Alertas</p>
          <p className="text-3xl font-bold text-yellow-600">{warningCount}</p>
        </div>
        <div className="bg-white rounded-lg shadow p-4 border-l-4 border-green-500">
          <p className="text-sm text-gray-500">Dentro do Padrao</p>
          <p className="text-3xl font-bold text-green-600">{results.length - issues.length}</p>
        </div>
      </div>

      {/* Threshold config */}
      {showConfig && (
        <div className="bg-white rounded-lg shadow p-6 mb-6">
          <h3 className="font-semibold mb-4">Limites por Suite</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left">
                  <th className="pb-2">Suite</th>
                  <th className="pb-2">Mean Max (ms)</th>
                  <th className="pb-2">P95 Max (ms)</th>
                  <th className="pb-2">P99 Max (ms)</th>
                  <th className="pb-2">Min Ops/s</th>
                  <th className="pb-2">Max Error Rate</th>
                </tr>
              </thead>
              <tbody>
                {suites.map((suite) => {
                  const t = getThresholds(suite, thresholdOverrides);
                  return (
                    <tr key={suite} className="border-b border-gray-100">
                      <td className="py-2 font-medium">{suite}</td>
                      <td className="py-2">
                        <input type="number" value={t.maxMeanLatencyMs} onChange={(e) => handleThresholdChange(suite, 'maxMeanLatencyMs', e.target.value)} className="w-20 border rounded px-2 py-1 text-sm" />
                      </td>
                      <td className="py-2">
                        <input type="number" value={t.maxP95LatencyMs} onChange={(e) => handleThresholdChange(suite, 'maxP95LatencyMs', e.target.value)} className="w-20 border rounded px-2 py-1 text-sm" />
                      </td>
                      <td className="py-2">
                        <input type="number" value={t.maxP99LatencyMs} onChange={(e) => handleThresholdChange(suite, 'maxP99LatencyMs', e.target.value)} className="w-20 border rounded px-2 py-1 text-sm" />
                      </td>
                      <td className="py-2">
                        <input type="number" value={t.minOpsPerSecond} onChange={(e) => handleThresholdChange(suite, 'minOpsPerSecond', e.target.value)} className="w-20 border rounded px-2 py-1 text-sm" />
                      </td>
                      <td className="py-2">
                        <input type="number" step="0.01" value={t.maxErrorRate} onChange={(e) => handleThresholdChange(suite, 'maxErrorRate', e.target.value)} className="w-20 border rounded px-2 py-1 text-sm" />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Severity filter */}
      <div className="flex gap-2 mb-4">
        {(['all', 'critical', 'warning'] as const).map((sev) => (
          <button
            key={sev}
            onClick={() => setFilterSeverity(sev)}
            className={`px-3 py-1 rounded text-sm ${
              filterSeverity === sev ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
            }`}
          >
            {sev === 'all' ? 'Todos' : sev === 'critical' ? 'Criticos' : 'Alertas'}
          </button>
        ))}
      </div>

      {/* Issues list */}
      {filtered.length === 0 ? (
        <div className="bg-white rounded-lg shadow p-8 text-center text-gray-400">
          {results.length === 0
            ? 'Nenhum resultado disponivel. Execute um benchmark primeiro.'
            : 'Todos os benchmarks estao dentro dos padroes definidos.'}
        </div>
      ) : (
        <div className="space-y-4">
          {filtered.map((issue, idx) => {
            const hasCritical = issue.violations.some((v) => v.severity === 'critical');
            return (
              <div
                key={idx}
                className={`bg-white rounded-lg shadow p-4 border-l-4 ${
                  hasCritical ? 'border-red-500' : 'border-yellow-500'
                }`}
              >
                <div className="flex items-center justify-between mb-2">
                  <div>
                    <span className="font-semibold">{issue.result.scenarioName}</span>
                    <span className="text-gray-400 text-sm ml-2">({issue.result.suiteName})</span>
                  </div>
                  <div className="flex items-center gap-3 text-sm text-gray-500">
                    <span>Volume: {issue.result.dataVolume.toLocaleString()}</span>
                    <span>{new Date(issue.result.completedAt).toLocaleString('pt-BR')}</span>
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                  {issue.violations.map((v, vi) => (
                    <div
                      key={vi}
                      className={`rounded px-3 py-2 text-sm ${
                        v.severity === 'critical' ? 'bg-red-50 text-red-800' : 'bg-yellow-50 text-yellow-800'
                      }`}
                    >
                      <span className="font-medium">{v.label}:</span>{' '}
                      <span className="font-mono">
                        {v.field === 'errorRate' ? (v.value * 100).toFixed(1) + '%' : v.value.toFixed(2)}
                      </span>
                      <span className="text-gray-500 ml-1">
                        (limite: {v.field === 'errorRate' ? (v.threshold * 100).toFixed(1) + '%' : v.field === 'operationsPerSecond' ? `min ${v.threshold}` : v.threshold})
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
