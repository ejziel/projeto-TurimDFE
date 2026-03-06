export function startTimer(): bigint {
  return process.hrtime.bigint();
}

export function endTimer(start: bigint): number {
  const elapsed = process.hrtime.bigint() - start;
  return Number(elapsed) / 1_000_000; // nanoseconds to milliseconds
}

export async function measureAsync<T>(fn: () => Promise<T>): Promise<{ result: T; durationMs: number }> {
  const start = startTimer();
  const result = await fn();
  const durationMs = endTimer(start);
  return { result, durationMs };
}
