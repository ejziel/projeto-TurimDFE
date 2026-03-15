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

  function avgDocs(counts: number[]): number {
    return counts.length ? Math.round(counts.reduce((a, b) => a + b, 0) / counts.length) : 0;
  }

  // Scenario 1: Single field equality (auto-indexed)
  const singleFieldTimings: number[] = [];
  const singleDocCounts: number[] = [];
  let singleErrors = 0;
  const singleStart = startTimer();
  for (let i = 0; i < iterations; i++) {
    const opStart = startTimer();
    try {
      const snap = await db.collection('documents')
        .where('tenantId', '==', tenantId)
        .limit(50)
        .get();
      singleFieldTimings.push(endTimer(opStart));
      singleDocCounts.push(snap.size);
    } catch { singleErrors++; }
  }
  const r1 = buildBenchmarkResult(
    'index-effectiveness', 'single-field-equality',
    { iterations }, dataVolume, singleFieldTimings, endTimer(singleStart), singleErrors,
  );
  r1.metadata.docsReturnedPerQuery = avgDocs(singleDocCounts);
  results.push(r1);

  // Scenario 2: Two-field composite (indexed)
  const twoFieldTimings: number[] = [];
  const twoDocCounts: number[] = [];
  let twoErrors = 0;
  const twoStart = startTimer();
  for (let i = 0; i < iterations; i++) {
    const opStart = startTimer();
    try {
      const snap = await db.collection('documents')
        .where('tenantId', '==', tenantId)
        .where('tipo', '==', 'nfe')
        .orderBy('dataEmissao', 'desc')
        .limit(50)
        .get();
      twoFieldTimings.push(endTimer(opStart));
      twoDocCounts.push(snap.size);
    } catch { twoErrors++; }
  }
  const r2 = buildBenchmarkResult(
    'index-effectiveness', 'two-field-composite',
    { iterations }, dataVolume, twoFieldTimings, endTimer(twoStart), twoErrors,
  );
  r2.metadata.docsReturnedPerQuery = avgDocs(twoDocCounts);
  results.push(r2);

  // Scenario 3: Three-field composite (indexed)
  const threeFieldTimings: number[] = [];
  const threeDocCounts: number[] = [];
  let threeErrors = 0;
  const threeStart = startTimer();
  for (let i = 0; i < iterations; i++) {
    const opStart = startTimer();
    try {
      const snap = await db.collection('documents')
        .where('tenantId', '==', tenantId)
        .where('tipo', '==', 'nfe')
        .where('situacao', '==', 'autorizada')
        .orderBy('dataEmissao', 'desc')
        .limit(50)
        .get();
      threeFieldTimings.push(endTimer(opStart));
      threeDocCounts.push(snap.size);
    } catch { threeErrors++; }
  }
  const r3 = buildBenchmarkResult(
    'index-effectiveness', 'three-field-composite',
    { iterations }, dataVolume, threeFieldTimings, endTimer(threeStart), threeErrors,
  );
  r3.metadata.docsReturnedPerQuery = avgDocs(threeDocCounts);
  results.push(r3);

  // Scenario 4: Range query on date (indexed)
  const rangeTimings: number[] = [];
  const rangeDocCounts: number[] = [];
  let rangeErrors = 0;
  const rangeStart = startTimer();
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  for (let i = 0; i < iterations; i++) {
    const opStart = startTimer();
    try {
      const snap = await db.collection('documents')
        .where('tenantId', '==', tenantId)
        .where('dataEmissao', '>=', thirtyDaysAgo)
        .orderBy('dataEmissao', 'desc')
        .limit(50)
        .get();
      rangeTimings.push(endTimer(opStart));
      rangeDocCounts.push(snap.size);
    } catch { rangeErrors++; }
  }
  const r4 = buildBenchmarkResult(
    'index-effectiveness', 'range-query-date',
    { iterations }, dataVolume, rangeTimings, endTimer(rangeStart), rangeErrors,
  );
  r4.metadata.docsReturnedPerQuery = avgDocs(rangeDocCounts);
  results.push(r4);

  // Scenario 5: OrderBy on value field (indexed)
  const orderTimings: number[] = [];
  const orderDocCounts: number[] = [];
  let orderErrors = 0;
  const orderStart = startTimer();
  for (let i = 0; i < iterations; i++) {
    const opStart = startTimer();
    try {
      const snap = await db.collection('documents')
        .where('tenantId', '==', tenantId)
        .orderBy('valorTotal', 'desc')
        .limit(50)
        .get();
      orderTimings.push(endTimer(opStart));
      orderDocCounts.push(snap.size);
    } catch { orderErrors++; }
  }
  const r5 = buildBenchmarkResult(
    'index-effectiveness', 'orderby-value-desc',
    { iterations }, dataVolume, orderTimings, endTimer(orderStart), orderErrors,
  );
  r5.metadata.docsReturnedPerQuery = avgDocs(orderDocCounts);
  results.push(r5);

  return results;
}
