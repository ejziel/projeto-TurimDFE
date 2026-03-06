import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import type { BenchmarkResult } from '../../types/benchmark.types';

interface ComparisonChartProps {
  results: BenchmarkResult[];
}

export default function ComparisonChart({ results }: ComparisonChartProps) {
  // Group by suite, take latest result per scenario
  const scenarioMap = new Map<string, BenchmarkResult>();
  for (const r of results) {
    const existing = scenarioMap.get(r.scenarioName);
    if (!existing || new Date(r.completedAt) > new Date(existing.completedAt)) {
      scenarioMap.set(r.scenarioName, r);
    }
  }

  const data = Array.from(scenarioMap.values())
    .slice(0, 15)
    .map((r) => ({
      name: r.scenarioName.length > 20 ? r.scenarioName.slice(0, 20) + '...' : r.scenarioName,
      mean: r.metrics.latency.mean,
      opsPerSec: r.metrics.operationsPerSecond,
    }));

  return (
    <ResponsiveContainer width="100%" height={300}>
      <BarChart data={data}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis dataKey="name" tick={{ fontSize: 10 }} angle={-20} textAnchor="end" height={60} />
        <YAxis yAxisId="left" label={{ value: 'ms', angle: -90, position: 'insideLeft' }} />
        <YAxis yAxisId="right" orientation="right" label={{ value: 'ops/s', angle: 90, position: 'insideRight' }} />
        <Tooltip />
        <Legend />
        <Bar yAxisId="left" dataKey="mean" name="Latencia (ms)" fill="#3b82f6" />
        <Bar yAxisId="right" dataKey="opsPerSec" name="Throughput (ops/s)" fill="#10b981" />
      </BarChart>
    </ResponsiveContainer>
  );
}
