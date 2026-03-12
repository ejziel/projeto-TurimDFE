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
    memoryUsage: { heapUsed: number; heapTotal: number; rss: number };
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

export interface SeedProgress {
  status: 'idle' | 'seeding' | 'completed' | 'error';
  volume: string;
  totalDocs: number;
  seededDocs: number;
  totalEvents: number;
  seededEvents: number;
  phase: string;
  startedAt?: number;
  completedAt?: number;
  error?: string;
}

export interface DataStatus {
  counts: Record<string, number>;
  seedProgress: SeedProgress;
}

export interface HealthStatus {
  status: string;
  firestore: string;
  emulatorHost: string;
  projectId: string;
  uptime: number;
  timestamp: string;
}

export interface ValidationThresholds {
  maxMeanLatencyMs: number;
  maxP95LatencyMs: number;
  maxP99LatencyMs: number;
  minOpsPerSecond: number;
  maxErrorRate: number;
}

export interface ValidationIssue {
  result: BenchmarkResult;
  violations: {
    field: string;
    label: string;
    value: number;
    threshold: number;
    severity: 'warning' | 'critical';
  }[];
}

export const DEFAULT_THRESHOLDS: Record<string, ValidationThresholds> = {
  'insert-single': { maxMeanLatencyMs: 50, maxP95LatencyMs: 100, maxP99LatencyMs: 200, minOpsPerSecond: 20, maxErrorRate: 0.01 },
  'insert-batch': { maxMeanLatencyMs: 200, maxP95LatencyMs: 500, maxP99LatencyMs: 1000, minOpsPerSecond: 5, maxErrorRate: 0.01 },
  'query-filters': { maxMeanLatencyMs: 100, maxP95LatencyMs: 300, maxP99LatencyMs: 500, minOpsPerSecond: 10, maxErrorRate: 0.01 },
  'query-pagination': { maxMeanLatencyMs: 150, maxP95LatencyMs: 400, maxP99LatencyMs: 600, minOpsPerSecond: 8, maxErrorRate: 0.01 },
  'query-volume': { maxMeanLatencyMs: 200, maxP95LatencyMs: 500, maxP99LatencyMs: 800, minOpsPerSecond: 5, maxErrorRate: 0.02 },
  'concurrent': { maxMeanLatencyMs: 300, maxP95LatencyMs: 800, maxP99LatencyMs: 1500, minOpsPerSecond: 3, maxErrorRate: 0.05 },
  'counter-increment': { maxMeanLatencyMs: 100, maxP95LatencyMs: 300, maxP99LatencyMs: 500, minOpsPerSecond: 10, maxErrorRate: 0.02 },
  'index-effectiveness': { maxMeanLatencyMs: 80, maxP95LatencyMs: 200, maxP99LatencyMs: 400, minOpsPerSecond: 15, maxErrorRate: 0.01 },
  default: { maxMeanLatencyMs: 150, maxP95LatencyMs: 400, maxP99LatencyMs: 800, minOpsPerSecond: 5, maxErrorRate: 0.05 },
};
