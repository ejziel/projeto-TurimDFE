import { LatencyMetrics } from '../models/benchmark-result.model';

export function computeStatistics(timings: number[]): LatencyMetrics {
  if (timings.length === 0) {
    return { min: 0, max: 0, mean: 0, median: 0, p95: 0, p99: 0, stddev: 0 };
  }

  const sorted = [...timings].sort((a, b) => a - b);
  const n = sorted.length;
  const sum = sorted.reduce((a, b) => a + b, 0);
  const mean = sum / n;

  const variance = sorted.reduce((acc, v) => acc + (v - mean) ** 2, 0) / n;
  const stddev = Math.sqrt(variance);

  return {
    min: Number(sorted[0].toFixed(3)),
    max: Number(sorted[n - 1].toFixed(3)),
    mean: Number(mean.toFixed(3)),
    median: Number(sorted[Math.floor(n / 2)].toFixed(3)),
    p95: Number(sorted[Math.floor(n * 0.95)].toFixed(3)),
    p99: Number(sorted[Math.floor(n * 0.99)].toFixed(3)),
    stddev: Number(stddev.toFixed(3)),
  };
}

export function computeOpsPerSecond(totalOps: number, totalDurationMs: number): number {
  if (totalDurationMs === 0) return 0;
  return Number(((totalOps / totalDurationMs) * 1000).toFixed(2));
}
