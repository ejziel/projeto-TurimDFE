import { db } from '../config/firebase';
import { startTimer, endTimer } from '../utils/timer';
import { buildBenchmarkResult } from '../services/metrics.service';
import { BenchmarkResult } from '../models/benchmark-result.model';

export async function runIndexEffectivenessBenchmark(config: {
  iterations?: number;
}): Promise<BenchmarkResult[]> {
  const iterations = config.iterations || 30;
  const results: BenchmarkResult[] = [];

  const tenantSnap = await db.collection('tenants').limit(1).get();
  if (tenantSnap.empty) throw new Error('No data. Seed first.');
  const tenantId = tenantSnap.docs[0].id;

  const countSnap = await db.collection('documents').count().get();
  const dataVolume = countSnap.data().count;

  // Scenario 1: Single field equality (auto-indexed)
  const singleFieldTimings: number[] = [];
  let singleErrors = 0;
  const singleStart = startTimer();
  for (let i = 0; i < iterations; i++) {
    const opStart = startTimer();
    try {
      await db.collection('documents')
        .where('tenantId', '==', tenantId)
        .limit(50)
        .get();
      singleFieldTimings.push(endTimer(opStart));
    } catch { singleErrors++; }
  }
  results.push(buildBenchmarkResult(
    'index-effectiveness',
    'single-field-equality',
    { iterations },
    dataVolume,
    singleFieldTimings,
    endTimer(singleStart),
    singleErrors,
  ));

  // Scenario 2: Two-field composite (indexed)
  const twoFieldTimings: number[] = [];
  let twoErrors = 0;
  const twoStart = startTimer();
  for (let i = 0; i < iterations; i++) {
    const opStart = startTimer();
    try {
      await db.collection('documents')
        .where('tenantId', '==', tenantId)
        .where('tipo', '==', 'nfe')
        .orderBy('dataEmissao', 'desc')
        .limit(50)
        .get();
      twoFieldTimings.push(endTimer(opStart));
    } catch { twoErrors++; }
  }
  results.push(buildBenchmarkResult(
    'index-effectiveness',
    'two-field-composite',
    { iterations },
    dataVolume,
    twoFieldTimings,
    endTimer(twoStart),
    twoErrors,
  ));

  // Scenario 3: Three-field composite (indexed)
  const threeFieldTimings: number[] = [];
  let threeErrors = 0;
  const threeStart = startTimer();
  for (let i = 0; i < iterations; i++) {
    const opStart = startTimer();
    try {
      await db.collection('documents')
        .where('tenantId', '==', tenantId)
        .where('tipo', '==', 'nfe')
        .where('situacao', '==', 'autorizada')
        .orderBy('dataEmissao', 'desc')
        .limit(50)
        .get();
      threeFieldTimings.push(endTimer(opStart));
    } catch { threeErrors++; }
  }
  results.push(buildBenchmarkResult(
    'index-effectiveness',
    'three-field-composite',
    { iterations },
    dataVolume,
    threeFieldTimings,
    endTimer(threeStart),
    threeErrors,
  ));

  // Scenario 4: Range query on date (indexed)
  const rangeTimings: number[] = [];
  let rangeErrors = 0;
  const rangeStart = startTimer();
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  for (let i = 0; i < iterations; i++) {
    const opStart = startTimer();
    try {
      await db.collection('documents')
        .where('tenantId', '==', tenantId)
        .where('dataEmissao', '>=', thirtyDaysAgo)
        .orderBy('dataEmissao', 'desc')
        .limit(50)
        .get();
      rangeTimings.push(endTimer(opStart));
    } catch { rangeErrors++; }
  }
  results.push(buildBenchmarkResult(
    'index-effectiveness',
    'range-query-date',
    { iterations },
    dataVolume,
    rangeTimings,
    endTimer(rangeStart),
    rangeErrors,
  ));

  // Scenario 5: OrderBy on value field (indexed)
  const orderTimings: number[] = [];
  let orderErrors = 0;
  const orderStart = startTimer();
  for (let i = 0; i < iterations; i++) {
    const opStart = startTimer();
    try {
      await db.collection('documents')
        .where('tenantId', '==', tenantId)
        .orderBy('valorTotal', 'desc')
        .limit(50)
        .get();
      orderTimings.push(endTimer(opStart));
    } catch { orderErrors++; }
  }
  results.push(buildBenchmarkResult(
    'index-effectiveness',
    'orderby-value-desc',
    { iterations },
    dataVolume,
    orderTimings,
    endTimer(orderStart),
    orderErrors,
  ));

  return results;
}
