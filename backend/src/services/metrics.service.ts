import { BenchmarkResult, BenchmarkMetrics } from '../models/benchmark-result.model';
import { computeStatistics, computeOpsPerSecond } from '../utils/statistics';
import { v4 as uuid } from 'uuid';

export function buildBenchmarkResult(
  suiteName: string,
  scenarioName: string,
  config: Record<string, any>,
  dataVolume: number,
  timings: number[],
  totalDurationMs: number,
  errors: number,
): BenchmarkResult {
  const latency = computeStatistics(timings);
  const opsPerSecond = computeOpsPerSecond(timings.length, totalDurationMs);
  const mem = process.memoryUsage();

  return {
    runId: uuid(),
    suiteName,
    scenarioName,
    startedAt: new Date(Date.now() - totalDurationMs).toISOString(),
    completedAt: new Date().toISOString(),
    config,
    dataVolume,
    metrics: {
      totalOperations: timings.length,
      totalDurationMs: Number(totalDurationMs.toFixed(3)),
      operationsPerSecond: opsPerSecond,
      latency,
      errors,
      errorRate: timings.length > 0 ? Number((errors / (timings.length + errors)).toFixed(4)) : 0,
    },
    rawTimings: timings.length > 1000
      ? downsample(timings, 1000)
      : timings.map((t) => Number(t.toFixed(3))),
    metadata: {
      nodeVersion: process.version,
      platform: process.platform,
      memoryUsage: {
        heapUsed: mem.heapUsed,
        heapTotal: mem.heapTotal,
        rss: mem.rss,
      },
    },
  };
}

function downsample(arr: number[], targetSize: number): number[] {
  const step = arr.length / targetSize;
  const result: number[] = [];
  for (let i = 0; i < targetSize; i++) {
    result.push(Number(arr[Math.floor(i * step)].toFixed(3)));
  }
  return result;
}
