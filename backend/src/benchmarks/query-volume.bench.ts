import { db } from '../config/firebase';
import { startTimer, endTimer } from '../utils/timer';
import { buildBenchmarkResult } from '../services/metrics.service';
import { BenchmarkResult } from '../models/benchmark-result.model';

export async function runQueryVolumeBenchmark(config: {
  iterations?: number;
}): Promise<BenchmarkResult> {
  const iterations = config.iterations || 50;

  const tenantSnap = await db.collection('tenants').limit(1).get();
  if (tenantSnap.empty) throw new Error('No data. Seed first.');
  const tenantId = tenantSnap.docs[0].id;

  const countSnap = await db.collection('documents').count().get();
  const dataVolume = countSnap.data().count;

  const queries = [
    () => db.collection('documents')
      .where('tenantId', '==', tenantId)
      .orderBy('dataEmissao', 'desc')
      .limit(50).get(),
    () => db.collection('documents')
      .where('tenantId', '==', tenantId)
      .where('tipo', '==', 'nfe')
      .orderBy('dataEmissao', 'desc')
      .limit(50).get(),
    () => db.collection('documents')
      .where('tenantId', '==', tenantId)
      .where('situacao', '==', 'autorizada')
      .orderBy('dataEmissao', 'desc')
      .limit(50).get(),
    () => db.collection('documents')
      .where('tenantId', '==', tenantId)
      .where('emitUf', '==', 'SP')
      .orderBy('dataEmissao', 'desc')
      .limit(50).get(),
    () => db.collection('documents')
      .where('tenantId', '==', tenantId)
      .where('papel', '==', 'destinatario')
      .orderBy('dataEmissao', 'desc')
      .limit(50).get(),
  ];

  const timings: number[] = [];
  let errors = 0;
  const totalStart = startTimer();

  for (let i = 0; i < iterations; i++) {
    const queryFn = queries[i % queries.length];
    const opStart = startTimer();
    try {
      await queryFn();
      timings.push(endTimer(opStart));
    } catch {
      errors++;
    }
  }

  const totalDuration = endTimer(totalStart);

  return buildBenchmarkResult(
    'query-volume',
    `volume-scaling-${dataVolume}`,
    { iterations, dataVolume },
    dataVolume,
    timings,
    totalDuration,
    errors,
  );
}
