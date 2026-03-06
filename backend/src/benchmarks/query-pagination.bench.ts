import { db } from '../config/firebase';
import { startTimer, endTimer } from '../utils/timer';
import { buildBenchmarkResult } from '../services/metrics.service';
import { BenchmarkResult } from '../models/benchmark-result.model';

export async function runQueryPaginationBenchmark(config: {
  pageSize?: number;
  pagesToFetch?: number;
}): Promise<BenchmarkResult[]> {
  const pageSizes = [25, 50, 100];
  const pagesToFetch = config.pagesToFetch || 20;
  const results: BenchmarkResult[] = [];

  const tenantSnap = await db.collection('tenants').limit(1).get();
  if (tenantSnap.empty) throw new Error('No data. Seed first.');
  const tenantId = tenantSnap.docs[0].id;

  const countSnap = await db.collection('documents').count().get();
  const dataVolume = countSnap.data().count;

  for (const pageSize of pageSizes) {
    const timings: number[] = [];
    let errors = 0;
    const totalStart = startTimer();

    let lastDoc: FirebaseFirestore.QueryDocumentSnapshot | null = null;

    for (let page = 0; page < pagesToFetch; page++) {
      let query = db.collection('documents')
        .where('tenantId', '==', tenantId)
        .orderBy('dataEmissao', 'desc')
        .limit(pageSize);

      if (lastDoc) {
        query = query.startAfter(lastDoc);
      }

      const opStart = startTimer();
      try {
        const snapshot = await query.get();
        timings.push(endTimer(opStart));

        if (snapshot.empty) break;
        lastDoc = snapshot.docs[snapshot.docs.length - 1];
      } catch {
        errors++;
        break;
      }
    }

    const totalDuration = endTimer(totalStart);

    results.push(buildBenchmarkResult(
      'pagination',
      `cursor-pagination-${pageSize}`,
      { pageSize, pagesToFetch },
      dataVolume,
      timings,
      totalDuration,
      errors,
    ));
  }

  return results;
}
