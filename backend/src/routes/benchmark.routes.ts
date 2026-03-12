import { Router } from 'express';
import {
    createRun, completeRun, failRun, updateRun,
    getRun, getAllResults, getResultsByRunId,
} from '../services/benchmark.service';
import { runInsertSingleBenchmark } from '../benchmarks/insert-single.bench';
import { runInsertBatchBenchmark } from '../benchmarks/insert-batch.bench';
import { runQueryFiltersBenchmark } from '../benchmarks/query-filters.bench';
import { runQueryPaginationBenchmark } from '../benchmarks/query-pagination.bench';
import { runQueryVolumeBenchmark } from '../benchmarks/query-volume.bench';
import { runConcurrentOpsBenchmark } from '../benchmarks/concurrent-ops.bench';
import { runCounterIncrementBenchmark } from '../benchmarks/counter-increment.bench';
import { runIndexEffectivenessBenchmark } from '../benchmarks/index-effectiveness.bench';
import { BenchmarkResult } from '../models/benchmark-result.model';
import { runAutoBenchmark, getAutoProgress, getAllAutoRuns } from '../benchmarks/auto-benchmark';

export const benchmarkRoutes = Router();

// Helper to run a benchmark in background and track via run
function runBenchmarkAsync(
    suiteName: string,
    benchFn: () => Promise<BenchmarkResult | BenchmarkResult[]>,
    res: any,
) {
    const run = createRun(suiteName);
    res.json({ runId: run.runId, status: 'running', message: `Benchmark '${suiteName}' started` });

    benchFn()
        .then((result) => {
            const results = Array.isArray(result) ? result : [result];
            completeRun(run.runId, results);
        })
        .catch((err) => {
            failRun(run.runId, err.message);
        });
}

benchmarkRoutes.post('/run/insert-single', (req, res) => {
    runBenchmarkAsync('insert-single', () => runInsertSingleBenchmark(req.body), res);
});

benchmarkRoutes.post('/run/insert-batch', (req, res) => {
    runBenchmarkAsync('insert-batch', () => runInsertBatchBenchmark(req.body), res);
});

benchmarkRoutes.post('/run/query-filters', (req, res) => {
    runBenchmarkAsync('query-filters', () => runQueryFiltersBenchmark(req.body), res);
});

benchmarkRoutes.post('/run/query-pagination', (req, res) => {
    runBenchmarkAsync('query-pagination', () => runQueryPaginationBenchmark(req.body), res);
});

benchmarkRoutes.post('/run/query-volume', (req, res) => {
    runBenchmarkAsync('query-volume', () => runQueryVolumeBenchmark(req.body), res);
});

benchmarkRoutes.post('/run/concurrent', (req, res) => {
    runBenchmarkAsync('concurrent', () => runConcurrentOpsBenchmark(req.body), res);
});

benchmarkRoutes.post('/run/counter-increment', (req, res) => {
    runBenchmarkAsync('counter-increment', () => runCounterIncrementBenchmark(req.body), res);
});

benchmarkRoutes.post('/run/index-effectiveness', (req, res) => {
    runBenchmarkAsync('index-effectiveness', () => runIndexEffectivenessBenchmark(req.body), res);
});

benchmarkRoutes.post('/run/full-suite', (req, res) => {
    const run = createRun('full-suite');
    res.json({ runId: run.runId, status: 'running', message: 'Full benchmark suite started' });

    (async () => {
        const allResults: BenchmarkResult[] = [];
        const suites = [
            { name: 'insert-single', fn: () => runInsertSingleBenchmark({ iterations: 200 }) },
            { name: 'insert-batch', fn: () => runInsertBatchBenchmark({ batchSizes: [10, 50, 100, 500], batchesPerSize: 5 }) },
            { name: 'query-filters', fn: () => runQueryFiltersBenchmark({ iterations: 20 }) },
            { name: 'query-pagination', fn: () => runQueryPaginationBenchmark({ pagesToFetch: 15 }) },
            { name: 'query-volume', fn: () => runQueryVolumeBenchmark({ iterations: 30 }) },
            { name: 'concurrent', fn: () => runConcurrentOpsBenchmark({ concurrentReaders: 10, concurrentWriters: 5, durationSeconds: 10 }) },
            { name: 'counter-increment', fn: () => runCounterIncrementBenchmark({ concurrencyLevels: [1, 5, 10, 20], iterationsPerLevel: 50 }) },
            { name: 'index-effectiveness', fn: () => runIndexEffectivenessBenchmark({ iterations: 20 }) },
        ];

        for (let i = 0; i < suites.length; i++) {
            updateRun(run.runId, {
                progress: Math.round(((i) / suites.length) * 100),
                currentScenario: suites[i].name,
            });
            try {
                const result = await suites[i].fn();
                const results = Array.isArray(result) ? result : [result];
                allResults.push(...results);
            } catch (err: any) {
                console.error(`Suite ${suites[i].name} failed:`, err.message);
            }
        }

        completeRun(run.runId, allResults);
    })().catch((err) => failRun(run.runId, err.message));
});

benchmarkRoutes.get('/status/:runId', (req, res) => {
    const run = getRun(req.params.runId);
    if (!run) return res.status(404).json({ error: 'Run not found' });
    res.json(run);
});

benchmarkRoutes.get('/results', (_req, res) => {
    res.json(getAllResults());
});

benchmarkRoutes.get('/results/:runId', (req, res) => {
    const results = getResultsByRunId(req.params.runId);
    if (results.length === 0) return res.status(404).json({ error: 'No results found' });
    res.json(results);
});

// ====== Auto Benchmark (Seed + Run All + Report) ======

benchmarkRoutes.post('/run/auto', (req, res) => {
    const {
        volume = '10k',
        clearBefore = true,
        suites,
        insertIterations,
        queryIterations,
        concurrentDuration,
    } = req.body;

    const config = { volume, clearBefore, suites, insertIterations, queryIterations, concurrentDuration };

    // Start in background - the function creates the run synchronously
    // so we can get the runId from auto-list immediately
    runAutoBenchmark(config).catch((err) => {
        console.error('Auto benchmark failed:', err.message);
    });

    // Give the promise microtask a tick to create the run, then respond
    Promise.resolve().then(() => {
        const runs = getAllAutoRuns();
        const latestRun = runs[0];
        res.json({
            runId: latestRun?.runId,
            message: `Auto benchmark started with volume: ${volume}`,
            status: 'running',
            pollEndpoint: latestRun ? `/api/benchmarks/auto-progress/${latestRun.runId}` : '/api/benchmarks/auto-list',
        });
    });
});

benchmarkRoutes.get('/auto-progress/:runId', (req, res) => {
    const progress = getAutoProgress(req.params.runId);
    if (!progress) return res.status(404).json({ error: 'Auto benchmark run not found' });
    res.json(progress);
});

benchmarkRoutes.get('/auto-list', (_req, res) => {
    res.json(getAllAutoRuns());
});
