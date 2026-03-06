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
    name: 'tenant + dataEmissao (last 30d)',
    buildQuery: (tid) => db.collection('documents')
      .where('tenantId', '==', tid)
      .where('dataEmissao', '>=', Timestamp.fromDate(getDateMonthsAgo(1)))
      .orderBy('dataEmissao', 'desc')
      .limit(50),
  },
  {
    name: 'tenant + tipo=nfe + dataEmissao',
    buildQuery: (tid) => db.collection('documents')
      .where('tenantId', '==', tid)
      .where('tipo', '==', 'nfe')
      .orderBy('dataEmissao', 'desc')
      .limit(50),
  },
  {
    name: 'tenant + situacao=autorizada + dataEmissao',
    buildQuery: (tid) => db.collection('documents')
      .where('tenantId', '==', tid)
      .where('situacao', '==', 'autorizada')
      .orderBy('dataEmissao', 'desc')
      .limit(50),
  },
  {
    name: 'tenant + papel=destinatario + dataEmissao',
    buildQuery: (tid) => db.collection('documents')
      .where('tenantId', '==', tid)
      .where('papel', '==', 'destinatario')
      .orderBy('dataEmissao', 'desc')
      .limit(50),
  },
  {
    name: 'tenant + emitUf=SP + dataEmissao',
    buildQuery: (tid) => db.collection('documents')
      .where('tenantId', '==', tid)
      .where('emitUf', '==', 'SP')
      .orderBy('dataEmissao', 'desc')
      .limit(50),
  },
  {
    name: 'tenant + statusManifestacao=ciencia + dataEmissao',
    buildQuery: (tid) => db.collection('documents')
      .where('tenantId', '==', tid)
      .where('statusManifestacao', '==', 'ciencia')
      .orderBy('dataEmissao', 'desc')
      .limit(50),
  },
  {
    name: 'tenant + temXmlCompleto=false + dataColeta',
    buildQuery: (tid) => db.collection('documents')
      .where('tenantId', '==', tid)
      .where('temXmlCompleto', '==', false)
      .orderBy('dataColeta', 'desc')
      .limit(50),
  },
  {
    name: 'tenant + tipo=nfe + situacao=autorizada + dataEmissao',
    buildQuery: (tid) => db.collection('documents')
      .where('tenantId', '==', tid)
      .where('tipo', '==', 'nfe')
      .where('situacao', '==', 'autorizada')
      .orderBy('dataEmissao', 'desc')
      .limit(50),
  },
  {
    name: 'tenant + cfopPrincipal=5102 + dataEmissao',
    buildQuery: (tid) => db.collection('documents')
      .where('tenantId', '==', tid)
      .where('cfopPrincipal', '==', '5102')
      .orderBy('dataEmissao', 'desc')
      .limit(50),
  },
  {
    name: 'tenant + valorTotal DESC (top by value)',
    buildQuery: (tid) => db.collection('documents')
      .where('tenantId', '==', tid)
      .orderBy('valorTotal', 'desc')
      .limit(50),
  },
];

export async function runQueryFiltersBenchmark(config: {
  iterations?: number;
}): Promise<BenchmarkResult[]> {
  const iterations = config.iterations || 30;
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
