export interface LatencyMetrics {
  min: number;
  max: number;
  mean: number;
  median: number;
  p95: number;
  p99: number;
  stddev: number;
}

export interface BenchmarkMetrics {
  totalOperations: number;
  totalDurationMs: number;
  operationsPerSecond: number;
  latency: LatencyMetrics;
  errors: number;
  errorRate: number;
}

export interface BenchmarkResult {
  runId: string;
  suiteName: string;
  scenarioName: string;
  startedAt: string;
  completedAt: string;
  config: Record<string, any>;
  dataVolume: number;
  metrics: BenchmarkMetrics;
  rawTimings: number[];
  metadata: {
    nodeVersion: string;
    platform: string;
    memoryUsage: {
      heapUsed: number;
      heapTotal: number;
      rss: number;
    };
  };
}

export interface BenchmarkRun {
  runId: string;
  status: 'running' | 'completed' | 'failed';
  progress: number;
  currentScenario: string;
  results: BenchmarkResult[];
  startedAt: string;
  completedAt?: string;
  error?: string;
}
