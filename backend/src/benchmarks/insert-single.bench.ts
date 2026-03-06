import { db } from '../config/firebase';
import { generateDocumentData } from '../generators/nfe.generator';
import { generateTenants } from '../generators/tenant.generator';
import { NSUSequencer } from '../generators/nsu.generator';
import { startTimer, endTimer } from '../utils/timer';
import { buildBenchmarkResult } from '../services/metrics.service';
import { BenchmarkResult } from '../models/benchmark-result.model';

export async function runInsertSingleBenchmark(config: {
  iterations?: number;
}): Promise<BenchmarkResult> {
  const iterations = config.iterations || 500;
  const tenants = generateTenants(1, 1);
  const tenant = tenants[0];
  const cnpjInfo = tenant.cnpjs[0];
  const nsu = new NSUSequencer();

  const timings: number[] = [];
  let errors = 0;

  const totalStart = startTimer();

  for (let i = 0; i < iterations; i++) {
    const doc = generateDocumentData(tenant.id, cnpjInfo, nsu, i);
    const opStart = startTimer();
    try {
      await db.collection('documents').add(doc);
      timings.push(endTimer(opStart));
    } catch {
      errors++;
    }
  }

  const totalDuration = endTimer(totalStart);

  // Get collection size for context
  const countSnap = await db.collection('documents').count().get();
  const dataVolume = countSnap.data().count;

  return buildBenchmarkResult(
    'insert',
    'single-insert',
    { iterations },
    dataVolume,
    timings,
    totalDuration,
    errors,
  );
}
