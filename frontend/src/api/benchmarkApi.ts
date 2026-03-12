import axios from 'axios';
import type { BenchmarkResult, BenchmarkRun, DataStatus, HealthStatus } from '../types/benchmark.types';

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

// Validation
export const getValidation = () =>
    api.get('/api/validation').then((r) => r.data);

export const getValidationThresholds = () =>
    api.get('/api/validation/thresholds').then((r) => r.data);
