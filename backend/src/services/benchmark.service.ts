import { BenchmarkResult, BenchmarkRun } from '../models/benchmark-result.model';
import { v4 as uuid } from 'uuid';

const runs: Map<string, BenchmarkRun> = new Map();
const allResults: BenchmarkResult[] = [];

export function createRun(suiteName: string): BenchmarkRun {
  const run: BenchmarkRun = {
    runId: uuid(),
    status: 'running',
    progress: 0,
    currentScenario: suiteName,
    results: [],
    startedAt: new Date().toISOString(),
  };
  runs.set(run.runId, run);
  return run;
}

export function updateRun(runId: string, update: Partial<BenchmarkRun>): void {
  const run = runs.get(runId);
  if (run) {
    Object.assign(run, update);
  }
}

export function completeRun(runId: string, results: BenchmarkResult[]): void {
  const run = runs.get(runId);
  if (run) {
    run.status = 'completed';
    run.progress = 100;
    run.completedAt = new Date().toISOString();
    run.results = results;
    allResults.push(...results);
  }
}

export function failRun(runId: string, error: string): void {
  const run = runs.get(runId);
  if (run) {
    run.status = 'failed';
    run.completedAt = new Date().toISOString();
    run.error = error;
  }
}

export function getRun(runId: string): BenchmarkRun | undefined {
  return runs.get(runId);
}

export function getAllResults(): BenchmarkResult[] {
  return [...allResults].sort((a, b) =>
    new Date(b.completedAt).getTime() - new Date(a.completedAt).getTime(),
  );
}

export function getResultsByRunId(runId: string): BenchmarkResult[] {
  const run = runs.get(runId);
  return run?.results || [];
}
