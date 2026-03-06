import { db } from '../config/firebase';
import { generateDocumentData } from '../generators/nfe.generator';
import { generateTenants } from '../generators/tenant.generator';
import { NSUSequencer } from '../generators/nsu.generator';
import { startTimer, endTimer } from '../utils/timer';
import { buildBenchmarkResult } from '../services/metrics.service';
import { BenchmarkResult } from '../models/benchmark-result.model';

export async function runInsertBatchBenchmark(config: {
  batchSizes?: number[];
  batchesPerSize?: number;
}): Promise<BenchmarkResult[]> {
  const batchSizes = config.batchSizes || [1, 10, 50, 100, 250, 500];
  const batchesPerSize = config.batchesPerSize || 10;
  const results: BenchmarkResult[] = [];

  const tenants = generateTenants(1, 1);
  const tenant = tenants[0];
  const cnpjInfo = tenant.cnpjs[0];

  for (const batchSize of batchSizes) {
    const nsu = new NSUSequencer();
    const timings: number[] = [];
    let errors = 0;
    let docIndex = 0;

    const totalStart = startTimer();

    for (let b = 0; b < batchesPerSize; b++) {
      const batch = db.batch();
      for (let i = 0; i < batchSize; i++) {
        const doc = generateDocumentData(tenant.id, cnpjInfo, nsu, docIndex++);
        batch.set(db.collection('documents').doc(), doc);
      }

      const opStart = startTimer();
      try {
        await batch.commit();
        timings.push(endTimer(opStart));
      } catch {
        errors++;
      }
    }

    const totalDuration = endTimer(totalStart);
    const countSnap = await db.collection('documents').count().get();

    results.push(buildBenchmarkResult(
      'insert',
      `batch-insert-${batchSize}`,
      { batchSize, batchesPerSize },
      countSnap.data().count,
      timings,
      totalDuration,
      errors,
    ));
  }

  return results;
}
