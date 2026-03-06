import { db } from '../config/firebase';
import { FieldValue } from 'firebase-admin/firestore';
import { startTimer, endTimer } from '../utils/timer';
import { buildBenchmarkResult } from '../services/metrics.service';
import { BenchmarkResult } from '../models/benchmark-result.model';

export async function runCounterIncrementBenchmark(config: {
  concurrencyLevels?: number[];
  iterationsPerLevel?: number;
}): Promise<BenchmarkResult[]> {
  const levels = config.concurrencyLevels || [1, 5, 10, 20, 50];
  const iterationsPerLevel = config.iterationsPerLevel || 100;
  const results: BenchmarkResult[] = [];

  const countSnap = await db.collection('documents').count().get();
  const dataVolume = countSnap.data().count;

  for (const concurrency of levels) {
    // Create a fresh counter document
    const counterRef = db.collection('benchmark_counters').doc(`test_${concurrency}`);
    await counterRef.set({ value: 0, updatedAt: new Date() });

    const timings: number[] = [];
    let errors = 0;

    const totalStart = startTimer();

    const worker = async () => {
      for (let i = 0; i < Math.ceil(iterationsPerLevel / concurrency); i++) {
        const opStart = startTimer();
        try {
          await counterRef.update({
            value: FieldValue.increment(1),
            updatedAt: new Date(),
          });
          timings.push(endTimer(opStart));
        } catch {
          errors++;
        }
      }
    };

    await Promise.all(Array(concurrency).fill(null).map(() => worker()));

    const totalDuration = endTimer(totalStart);

    // Verify final value
    const finalSnap = await counterRef.get();
    const finalValue = finalSnap.data()?.value || 0;

    results.push(buildBenchmarkResult(
      'counter-increment',
      `counter-concurrency-${concurrency}`,
      { concurrency, iterationsPerLevel, expectedValue: iterationsPerLevel, actualValue: finalValue },
      dataVolume,
      timings,
      totalDuration,
      errors,
    ));

    // Cleanup
    await counterRef.delete();
  }

  return results;
}
