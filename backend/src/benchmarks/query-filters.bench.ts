import { db } from '../config/firebase';
import { Timestamp } from 'firebase-admin/firestore';
import { startTimer, endTimer } from '../utils/timer';
import { buildBenchmarkResult } from '../services/metrics.service';
import { BenchmarkResult } from '../models/benchmark-result.model';

interface FilterScenario {
  name: string;
  buildQuery: (tenantId: string) => FirebaseFirestore.Query;
}

function getDateMonthsAgo(months: number): Date {
  const d = new Date();
  d.setMonth(d.getMonth() - months);
  return d;
}

const scenarios: FilterScenario[] = [
    {
    name: 'tenant only',
    buildQuery: (tid) => db.collection('documents')
      .where('tenantId', '==', tid)
    //   .orderBy('tenantId', 'desc')
      .limit(50),
    },
  {
    name: 'tenant + dataEmissao',
    buildQuery: (tid) => db.collection('documents')
      .where('tenantId', '>=', tid)
      .where('dataEmissao', '>=', Timestamp.fromDate(getDateMonthsAgo(1)))
      .limit(50),
  },
  {
    name: 'tipo + dataEmissao',
    buildQuery: (tid) => db.collection('documents')
      .where('tipo', '==', 'nfe')
      .where('dataEmissao', '>=', Timestamp.fromDate(getDateMonthsAgo(1)))
      .where('dataEmissao', '<=', Timestamp.fromDate(getDateMonthsAgo(1)))
    //   .orderBy('dataEmissao', 'asc')
      .orderBy('tipo', 'desc')
      .limit(50),
  },
  {
    name: 'finalidade + dataEmissao',
    buildQuery: (tid) => db.collection('documents')
      .where('finalidade', '==', '1')
      .where('dataEmissao', '>=', Timestamp.fromDate(getDateMonthsAgo(1)))
      .where('dataEmissao', '<=', Timestamp.fromDate(getDateMonthsAgo(1)))
    //   .orderBy('finalidade', 'asc')
      .limit(50),
  },
  {
    name: 'tipo + tenant + dataEmissao',
    buildQuery: (tid) => db.collection('documents')
      .where('tipo', '==', 'nfe')
      .where('tenantId', '==', tid)
      .where('dataEmissao', '>=', Timestamp.fromDate(getDateMonthsAgo(1)))
      .where('dataEmissao', '<=', Timestamp.fromDate(getDateMonthsAgo(1)))
      .limit(50),
  },
  {
    name: 'tenant + finalidade + dataEmissao',
    buildQuery: (tid) => db.collection('documents')
      .where('tenantId', '==', tid)
      .where('finalidade', '==', '1')
      .where('dataEmissao', '>=', Timestamp.fromDate(getDateMonthsAgo(1)))
      .where('dataEmissao', '<=', Timestamp.fromDate(getDateMonthsAgo(1)))
      .limit(50),
  },
  // Adiciona mais cenarios que vão estourar erros de indices, que não sejam relacionados a orderby com >=, <=, etc
//   { 
//     name: 'tenant + tipo + situacao + dataEmissao',
//     buildQuery: (tid) => db.collection('documents')
//       .where('tenantId', '==', tid)
//       .where('tipo', '==', 'nfe')
//       .where('situacao', '==', 'autorizada')
//       .where('dataEmissao', '>=', Timestamp.fromDate(getDateMonthsAgo(1)))
//       .where('dataEmissao', '<=', Timestamp.fromDate(getDateMonthsAgo(1)))
//       .limit(50),
//   },
];

export async function runQueryFiltersBenchmark(config: {
  iterations?: number;
}): Promise<BenchmarkResult[]> {
  const iterations = 1;
  const results: BenchmarkResult[] = [];

  // Get a valid tenantId from existing data
  const tenantSnap = await db.collection('tenants').limit(1).get();
  if (tenantSnap.empty) {
    throw new Error('No data found. Please seed data first.');
  }
  const tenantId = tenantSnap.docs[0].id;

  const countSnap = await db.collection('documents').count().get();
  const dataVolume = countSnap.data().count;

  for (const scenario of scenarios) {
    const timings: number[] = [];
    let errors = 0;
    const totalStart = startTimer();

    for (let i = 0; i < iterations; i++) {
      const opStart = startTimer();
      try {
        const query = scenario.buildQuery(tenantId);
        await query.get();
        timings.push(endTimer(opStart));
      } catch {
        errors++;
      }
    }

    const totalDuration = endTimer(totalStart);

    results.push(buildBenchmarkResult(
      'query-filters',
      scenario.name,
      { iterations },
      dataVolume,
      timings,
      totalDuration,
      errors,
    ));
  }

  return results;
}
