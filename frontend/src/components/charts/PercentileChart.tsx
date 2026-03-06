import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import type { BenchmarkResult } from '../../types/benchmark.types';

interface PercentileChartProps {
  results: BenchmarkResult[];
}

export default function PercentileChart({ results }: PercentileChartProps) {
  const data = results.map((r) => ({
    name: r.scenarioName.length > 20 ? r.scenarioName.slice(0, 20) + '...' : r.scenarioName,
    p50: r.metrics.latency.median,
    p95: r.metrics.latency.p95,
    p99: r.metrics.latency.p99,
  }));

  return (
    <ResponsiveContainer width="100%" height={300}>
      <BarChart data={data}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis dataKey="name" tick={{ fontSize: 10 }} angle={-20} textAnchor="end" height={60} />
        <YAxis label={{ value: 'ms', angle: -90, position: 'insideLeft' }} />
        <Tooltip />
        <Legend />
        <Bar dataKey="p50" name="P50" fill="#3b82f6" />
        <Bar dataKey="p95" name="P95" fill="#f59e0b" />
        <Bar dataKey="p99" name="P99" fill="#ef4444" />
      </BarChart>
    </ResponsiveContainer>
  );
}
