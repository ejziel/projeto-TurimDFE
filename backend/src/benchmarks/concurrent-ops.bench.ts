import { db } from '../config/firebase';
import { generateDocumentData } from '../generators/nfe.generator';
import { generateTenants } from '../generators/tenant.generator';
import { NSUSequencer } from '../generators/nsu.generator';
import { startTimer, endTimer } from '../utils/timer';
import { buildBenchmarkResult } from '../services/metrics.service';
import { BenchmarkResult } from '../models/benchmark-result.model';

export async function runConcurrentOpsBenchmark(config: {
  concurrentReaders?: number;
  concurrentWriters?: number;
  durationSeconds?: number;
}): Promise<BenchmarkResult[]> {
  const readers = config.concurrentReaders || 10;
  const writers = config.concurrentWriters || 5;
  const durationMs = (config.durationSeconds || 15) * 1000;

  const tenantSnap = await db.collection('tenants').limit(1).get();
  if (tenantSnap.empty) throw new Error('No data. Seed first.');
  const tenantId = tenantSnap.docs[0].id;

  const countSnap = await db.collection('documents').count().get();
  const dataVolume = countSnap.data().count;

  const tenants = generateTenants(1, 1);
  const cnpjInfo = tenants[0].cnpjs[0];
  const nsu = new NSUSequencer();

  const readTimings: number[] = [];
  const writeTimings: number[] = [];
  let readErrors = 0;
  let writeErrors = 0;

  const endTime = Date.now() + durationMs;

  // Reader worker
  const readerWorker = async () => {
    while (Date.now() < endTime) {
      const opStart = startTimer();
      try {
        await db.collection('documents')
          .where('tenantId', '==', tenantId)
          .orderBy('dataEmissao', 'desc')
          .limit(50)
          .get();
        readTimings.push(endTimer(opStart));
      } catch {
        readErrors++;
      }
    }
  };

  // Writer worker
  let writeIdx = 0;
  const writerWorker = async () => {
    while (Date.now() < endTime) {
      const doc = generateDocumentData(tenants[0].id, cnpjInfo, nsu, writeIdx++);
      const opStart = startTimer();
      try {
        await db.collection('documents').add(doc);
        writeTimings.push(endTimer(opStart));
      } catch {
        writeErrors++;
      }
    }
  };

  const totalStart = startTimer();

  await Promise.all([
    ...Array(readers).fill(null).map(() => readerWorker()),
    ...Array(writers).fill(null).map(() => writerWorker()),
  ]);

  const totalDuration = endTimer(totalStart);

  return [
    buildBenchmarkResult(
      'concurrent',
      `concurrent-reads-${readers}r-${writers}w`,
      { concurrentReaders: readers, concurrentWriters: writers, durationMs },
      dataVolume,
      readTimings,
      totalDuration,
      readErrors,
    ),
    buildBenchmarkResult(
      'concurrent',
      `concurrent-writes-${readers}r-${writers}w`,
      { concurrentReaders: readers, concurrentWriters: writers, durationMs },
      dataVolume,
      writeTimings,
      totalDuration,
      writeErrors,
    ),
  ];
}
