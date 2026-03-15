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
    gcpMode?: boolean;
    emulatorHost: string;
    projectId: string;
    uptime: number;
    timestamp: string;
}

export type QueryStatus = 'success' | 'index_required' | 'error';

export interface QueryOutcome {
    queryName: string;
    status: QueryStatus;
    latencyMs: number;
    docsReturned: number;
    indexCreationUrl?: string;
    errorMessage?: string;
    filters: Record<string, unknown>;
}

export interface GcpValidationResult {
    mode: 'gcp' | 'emulator';
    collectionSize: number;
    tenantId: string;
    runAt: string;
    indexedQueries: QueryOutcome[];
    unindexedQueries: QueryOutcome[];
    oresultProof: {
        queryName: string;
        description: string;
        results: QueryOutcome[];
    };
    summary: {
        passed: number;
        indexRequired: number;
        errors: number;
        totalQueries: number;
    };
}

export interface TenantCnpj {
    cnpj: string;
    companyName: string;
    uf: string;
}

export interface TenantInfo {
    id: string;
    name: string;
    tradeName: string | null;
    cnpjs: TenantCnpj[];
}

export interface DocumentRow {
    id: string;
    tipo: string;
    situacao: string;
    tipo_situacao: string;
    emitUf: string;
    emitCnpj: string;
    emitNome: string;
    emitFantasia: string;
    cnpjDestinatario: string;
    destNome: string;
    destUf: string;
    valorTotal: number;
    valorProdutos: number;
    valorFrete: number;
    valorDesconto: number;
    dataEmissao: string | null;
    dataColeta: string | null;
    papel: string;
    chaveAcesso: string;
    tenantId: string;
    statusManifestacao: string | null;
    finalidade: number;
    cfopPrincipal: string;
    temXmlCompleto: boolean;
    temPdf: boolean;
    numero: number;
    serie: number;
    yearMonth: string;
    naturezaOperacao: string;
    nsu: string;
}

export type CountSource = 'aggregation' | 'counters' | 'skipped' | 'counters_fallback_aggregation';

export interface DocumentListResponse {
    docs: DocumentRow[];
    total: number;
    page: number;
    limit: number;
    countLatencyMs: number;
    listLatencyMs: number;
    countSource: CountSource;
    hasMore: boolean;
    filters: Record<string, string>;
    orderBy: string | null;
    orderDir: 'asc' | 'desc';
}

export interface BackfillProgress {
    status: 'idle' | 'running' | 'completed' | 'error';
    processed: number;
    total: number;
    tenants: number;
    phase: string;
    startedAt?: number;
    completedAt?: number;
    durationMs?: number;
    error?: string;
}

export interface DocumentListError {
    error: 'index_required' | 'query_error';
    message: string;
    indexCreationUrl?: string;
}

export interface CountPaginationScenario {
    name: string;
    type: 'count' | 'list' | 'count+list';
    filters: Record<string, string>;
    latencies: number[];
    avgLatencyMs: number;
    minLatencyMs: number;
    maxLatencyMs: number;
    total: number | null;
    docsReturned: number | null;
    status: 'success' | 'index_required' | 'error';
    indexCreationUrl?: string;
    errorMessage?: string;
}

export interface CountPaginationResult {
    mode: 'gcp' | 'emulator';
    tenantId: string;
    collectionSize: number;
    pageSize: number;
    iterations: number;
    runAt: string;
    scenarios: CountPaginationScenario[];
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
