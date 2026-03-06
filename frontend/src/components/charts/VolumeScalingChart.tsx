import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import type { BenchmarkResult } from '../../types/benchmark.types';

interface VolumeScalingChartProps {
  results: BenchmarkResult[];
}

export default function VolumeScalingChart({ results }: VolumeScalingChartProps) {
  // Group by volume and compute average latency
  const volumeMap = new Map<number, { mean: number[]; p95: number[]; p99: number[] }>();

  for (const r of results) {
    if (!volumeMap.has(r.dataVolume)) {
      volumeMap.set(r.dataVolume, { mean: [], p95: [], p99: [] });
    }
    const entry = volumeMap.get(r.dataVolume)!;
    entry.mean.push(r.metrics.latency.mean);
    entry.p95.push(r.metrics.latency.p95);
    entry.p99.push(r.metrics.latency.p99);
  }

  const data = Array.from(volumeMap.entries())
    .sort(([a], [b]) => a - b)
    .map(([volume, metrics]) => ({
      volume: volume.toLocaleString(),
      mean: Number((metrics.mean.reduce((a, b) => a + b, 0) / metrics.mean.length).toFixed(2)),
      p95: Number((metrics.p95.reduce((a, b) => a + b, 0) / metrics.p95.length).toFixed(2)),
      p99: Number((metrics.p99.reduce((a, b) => a + b, 0) / metrics.p99.length).toFixed(2)),
    }));

  if (data.length < 2) {
    return <p className="text-gray-400 text-sm text-center py-8">Execute benchmarks em diferentes volumes para ver a escalabilidade.</p>;
  }

  return (
    <ResponsiveContainer width="100%" height={300}>
      <LineChart data={data}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis dataKey="volume" label={{ value: 'Documentos', position: 'insideBottom', offset: -5 }} />
        <YAxis label={{ value: 'ms', angle: -90, position: 'insideLeft' }} />
        <Tooltip />
        <Legend />
        <Line type="monotone" dataKey="mean" name="Mean" stroke="#3b82f6" strokeWidth={2} />
        <Line type="monotone" dataKey="p95" name="P95" stroke="#f59e0b" strokeWidth={2} />
        <Line type="monotone" dataKey="p99" name="P99" stroke="#ef4444" strokeWidth={2} />
      </LineChart>
    </ResponsiveContainer>
  );
}
