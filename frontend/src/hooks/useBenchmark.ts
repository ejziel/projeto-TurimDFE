import { useState, useCallback } from 'react';
import { runBenchmark, getBenchmarkStatus } from '../api/benchmarkApi';
import type { BenchmarkRun } from '../types/benchmark.types';

export function useBenchmark() {
  const [run, setRun] = useState<BenchmarkRun | null>(null);
  const [polling, setPolling] = useState(false);

  const start = useCallback(async (suite: string, config: Record<string, any> = {}) => {
    const { runId } = await runBenchmark(suite, config);
    setPolling(true);

    const poll = async () => {
      try {
        const status = await getBenchmarkStatus(runId);
        setRun(status);
        if (status.status === 'running') {
          setTimeout(poll, 2000);
        } else {
          setPolling(false);
        }
      } catch {
        setPolling(false);
      }
    };

    poll();
  }, []);

  return { run, polling, start };
}
