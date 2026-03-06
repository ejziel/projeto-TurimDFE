import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import type { BenchmarkResult } from '../../types/benchmark.types';

interface ThroughputChartProps {
  results: BenchmarkResult[];
}

export default function ThroughputChart({ results }: ThroughputChartProps) {
  const data = results.map((r) => ({
    name: r.scenarioName.length > 25 ? r.scenarioName.slice(0, 25) + '...' : r.scenarioName,
    opsPerSec: r.metrics.operationsPerSecond,
  }));

  return (
    <ResponsiveContainer width="100%" height={300}>
      <BarChart data={data} layout="vertical" margin={{ left: 120 }}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis type="number" label={{ value: 'ops/s', position: 'insideBottom', offset: -5 }} />
        <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={120} />
        <Tooltip formatter={(v: number) => [`${v} ops/s`, 'Throughput']} />
        <Bar dataKey="opsPerSec" fill="#10b981" radius={[0, 4, 4, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}
