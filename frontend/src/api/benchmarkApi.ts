import axios from 'axios';
import type { BenchmarkResult, BenchmarkRun, DataStatus, HealthStatus, GcpValidationResult, DocumentListResponse, CountPaginationResult, TenantInfo, BackfillProgress } from '../types/benchmark.types';

const api = axios.create({
    baseURL: import.meta.env.VITE_API_URL || 'http://localhost:3001',
});

// Health
export const getHealth = () => api.get<HealthStatus>('/api/health').then((r) => r.data);

// Seed
export const seedGenerate = (volume: string) =>
    api.post('/api/seed/generate', { volume }).then((r) => r.data);

export const getSeedStatus = () =>
    api.get<DataStatus>('/api/seed/status').then((r) => r.data);

export const clearSeedData = () =>
    api.delete('/api/seed/clear').then((r) => r.data);

// Benchmarks
export const runBenchmark = (suite: string, config: Record<string, any> = {}) =>
    api.post<{ runId: string }>(`/api/benchmarks/run/${suite}`, config).then((r) => r.data);

export const getBenchmarkStatus = (runId: string) =>
    api.get<BenchmarkRun>(`/api/benchmarks/status/${runId}`).then((r) => r.data);

export const getAllResults = () =>
    api.get<BenchmarkResult[]>('/api/benchmarks/results').then((r) => r.data);

export const getRunResults = (runId: string) =>
    api.get<BenchmarkResult[]>(`/api/benchmarks/results/${runId}`).then((r) => r.data);

// Auto Benchmark
export const startAutoBenchmark = (config: {
    volume?: string;
    clearBefore?: boolean;
    suites?: string[];
    insertIterations?: number;
    queryIterations?: number;
    concurrentDuration?: number;
}) =>
    api.post<{ runId: string; message: string; status: string; pollEndpoint: string }>('/api/benchmarks/run/auto', config).then((r) => r.data);

export const getAutoProgress = (runId: string) =>
    api.get(`/api/benchmarks/auto-progress/${runId}`).then((r) => r.data);

export const getAutoList = () =>
    api.get('/api/benchmarks/auto-list').then((r) => r.data);

// GCP Validation
export const runGcpValidation = (config: { iterations?: number } = {}) =>
    api.post<{ runId: string; status: string; message: string }>('/api/benchmarks/run/gcp-validation', config).then((r) => r.data);

export const getGcpValidationResult = (runId: string) =>
    api.get<{ status: string; gcpValidation: GcpValidationResult | null }>(`/api/benchmarks/gcp-validation/${runId}`).then((r) => r.data);

export const getGcpValidationLatest = () =>
    api.get<GcpValidationResult>('/api/benchmarks/gcp-validation-latest').then((r) => r.data);

// Documents
export const getDocumentTenants = () =>
    api.get<TenantInfo[]>('/api/documents/tenants').then((r) => r.data);

export const listDocuments = (params: {
    tenantId: string;
    tipo?: string;
    situacao?: string;
    emitUf?: string;
    papel?: string;
    statusManifestacao?: string;
    temXmlCompleto?: string;
    temPdf?: string;
    finalidade?: string;
    cfopPrincipal?: string;
    yearMonth?: string;
    tipo_situacao?: string;
    orderBy?: string;
    orderDir?: 'asc' | 'desc';
    limit?: number;
    page?: number;
    skipCount?: string;
    knownTotal?: string;
    countMode?: 'aggregation' | 'counters';
}) => api.get<DocumentListResponse>('/api/documents/list', { params }).then((r) => r.data);

// Count + Pagination Benchmark
export const runCountPaginationBenchmark = (config: { iterations?: number; pageSize?: number } = {}) =>
    api.post<{ runId: string; status: string; message: string }>('/api/benchmarks/run/count-pagination', config).then((r) => r.data);

export const getCountPaginationResult = (runId: string) =>
    api.get<{ status: string; result: CountPaginationResult | null }>(`/api/benchmarks/count-pagination/${runId}`).then((r) => r.data);

export const getCountPaginationLatest = () =>
    api.get<CountPaginationResult>('/api/benchmarks/count-pagination-latest').then((r) => r.data);

// Validation
export const getValidation = () =>
    api.get('/api/validation').then((r) => r.data);

export const getValidationThresholds = () =>
    api.get('/api/validation/thresholds').then((r) => r.data);

// Counters
export const startBackfill = () =>
    api.post('/api/counters/backfill').then((r) => r.data);

export const getBackfillProgress = () =>
    api.get<BackfillProgress>('/api/counters/backfill-progress').then((r) => r.data);

export const getCountersSummary = (tenantIds: string[]) =>
    api.get('/api/counters/summary', { params: { tenantIds: tenantIds.join(',') } }).then((r) => r.data);

export const clearCounters = () =>
    api.delete('/api/counters/clear').then((r) => r.data);
