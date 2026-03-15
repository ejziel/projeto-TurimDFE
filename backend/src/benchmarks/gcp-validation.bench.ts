import { db, gcpMode } from '../config/firebase';
import { startTimer, endTimer } from '../utils/timer';
import { logQuery, extractIndexUrl } from '../utils/query-logger';

export type QueryStatus = 'success' | 'index_required' | 'error';

export interface QueryOutcome {
  queryName: string;
  status: QueryStatus;
  latencyMs: number;
  docsReturned: number;
  indexCreationUrl?: string;
  errorMessage?: string;
  filters: Record<string, unknown>;
}

export interface GcpValidationResult {
  mode: 'gcp' | 'emulator';
  collectionSize: number;
  tenantId: string;
  runAt: string;
  indexedQueries: QueryOutcome[];
  unindexedQueries: QueryOutcome[];
  oresultProof: {
    queryName: string;
    description: string;
    results: QueryOutcome[];
  };
  summary: {
    passed: number;
    indexRequired: number;
    errors: number;
    totalQueries: number;
  };
}

async function runQuery(
  queryName: string,
  filters: Record<string, unknown>,
  queryFn: () => Promise<FirebaseFirestore.QuerySnapshot>,
): Promise<QueryOutcome> {
  const t0 = startTimer();
  try {
    const snap = await queryFn();
    const latencyMs = endTimer(t0);
    const outcome: QueryOutcome = {
      queryName,
      status: 'success',
      latencyMs,
      docsReturned: snap.size,
      filters,
    };
    logQuery({
      event: 'query_result',
      suite: 'gcp-validation',
      queryName,
      filters,
      docsReturned: snap.size,
      latencyMs,
      indexUsed: true,
      status: 'success',
    });
    return outcome;
  } catch (err: any) {
    const latencyMs = endTimer(t0);
    // gRPC code 9 = FAILED_PRECONDITION = missing index
    if (err.code === 9 || err.message?.includes('FAILED_PRECONDITION') || err.message?.includes('index')) {
      const indexCreationUrl = extractIndexUrl(err.message || '');
      const outcome: QueryOutcome = {
        queryName,
        status: 'index_required',
        latencyMs,
        docsReturned: 0,
        indexCreationUrl,
        filters,
      };
      logQuery({
        event: 'query_result',
        suite: 'gcp-validation',
        queryName,
        filters,
        docsReturned: 0,
        latencyMs,
        indexUsed: false,
        status: 'index_required',
        indexCreationUrl,
      });
      return outcome;
    }
    const outcome: QueryOutcome = {
      queryName,
      status: 'error',
      latencyMs,
      docsReturned: 0,
      errorMessage: err.message,
      filters,
    };
    logQuery({
      event: 'query_result',
      suite: 'gcp-validation',
      queryName,
      filters,
      docsReturned: 0,
      latencyMs,
      indexUsed: false,
      status: 'error',
      errorMessage: err.message,
    });
    return outcome;
  }
}

export async function runGcpValidation(config: {
  iterations?: number;
}): Promise<GcpValidationResult> {
  const iterations = config.iterations || 5;

  // Get tenant to scope queries
  const tenantSnap = await db.collection('tenants').limit(1).get();
  if (tenantSnap.empty) throw new Error('No data. Seed first (e.g. gcp-5k).');
  const tenantId = tenantSnap.docs[0].id;

  // Collection size
  const countSnap = await db.collection('documents').count().get();
  const collectionSize = countSnap.data().count;

  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const currentYearMonth = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`;

  // ─── GROUP A: Indexed queries (should succeed on real GCP) ───────────────

  const indexedQueries: QueryOutcome[] = [];

  // A1: tenantId + tipo + dataEmissao (composite index exists)
  for (let i = 0; i < iterations; i++) {
    indexedQueries.push(await runQuery(
      'A1_tipo_nfe_recentes',
      { tenantId, tipo: 'nfe', orderBy: 'dataEmissao desc', limit: 50 },
      () => db.collection('documents')
        .where('tenantId', '==', tenantId)
        .where('tipo', '==', 'nfe')
        .orderBy('dataEmissao', 'desc')
        .limit(50)
        .get(),
    ));
  }

  // A2: tenantId + tipo_situacao + dataEmissao (new computed field index)
  for (let i = 0; i < iterations; i++) {
    indexedQueries.push(await runQuery(
      'A2_tipo_situacao_computed',
      { tenantId, tipo_situacao: 'nfe_autorizada', orderBy: 'dataEmissao desc', limit: 50 },
      () => db.collection('documents')
        .where('tenantId', '==', tenantId)
        .where('tipo_situacao', '==', 'nfe_autorizada')
        .orderBy('dataEmissao', 'desc')
        .limit(50)
        .get(),
    ));
  }

  // A3: tenantId + yearMonth + valorTotal (new yearMonth index)
  for (let i = 0; i < iterations; i++) {
    indexedQueries.push(await runQuery(
      'A3_yearMonth_valor',
      { tenantId, yearMonth: currentYearMonth, orderBy: 'valorTotal desc', limit: 50 },
      () => db.collection('documents')
        .where('tenantId', '==', tenantId)
        .where('yearMonth', '==', currentYearMonth)
        .orderBy('valorTotal', 'desc')
        .limit(50)
        .get(),
    ));
  }

  // A4: tenantId + situacao + dataEmissao (composite index exists)
  for (let i = 0; i < iterations; i++) {
    indexedQueries.push(await runQuery(
      'A4_situacao_autorizada',
      { tenantId, situacao: 'autorizada', orderBy: 'dataEmissao desc', limit: 100 },
      () => db.collection('documents')
        .where('tenantId', '==', tenantId)
        .where('situacao', '==', 'autorizada')
        .orderBy('dataEmissao', 'desc')
        .limit(100)
        .get(),
    ));
  }

  // ─── GROUP B: Unindexed queries (should fail FAILED_PRECONDITION on GCP) ─

  const unindexedQueries: QueryOutcome[] = [];

  // B1: 3-field filter without composite index (tipo + situacao + emitUf + dataEmissao — no such index)
  for (let i = 0; i < iterations; i++) {
    unindexedQueries.push(await runQuery(
      'B1_unindexed_tipo_situacao_uf',
      { tenantId, tipo: 'nfe', situacao: 'autorizada', emitUf: 'SP' },
      () => db.collection('documents')
        .where('tenantId', '==', tenantId)
        .where('tipo', '==', 'nfe')
        .where('situacao', '==', 'autorizada')
        .where('emitUf', '==', 'SP')
        .orderBy('dataEmissao', 'desc')
        .limit(50)
        .get(),
    ));
  }

  // B2: Range on valor without tenantId index (no [tenantId, valorProdutos] composite)
  for (let i = 0; i < iterations; i++) {
    unindexedQueries.push(await runQuery(
      'B2_unindexed_valor_range',
      { tenantId, valorProdutos_gte: 10000, orderBy: 'dataEmissao desc' },
      () => db.collection('documents')
        .where('tenantId', '==', tenantId)
        .where('valorProdutos', '>=', 10000)
        .orderBy('dataEmissao', 'desc')
        .limit(50)
        .get(),
    ));
  }

  // B3: tipo_situacao + valorTotal range (no such composite)
  for (let i = 0; i < iterations; i++) {
    unindexedQueries.push(await runQuery(
      'B3_unindexed_tipo_situacao_valor_range',
      { tenantId, tipo_situacao: 'nfe_autorizada', valorTotal_gte: 5000 },
      () => db.collection('documents')
        .where('tenantId', '==', tenantId)
        .where('tipo_situacao', '==', 'nfe_autorizada')
        .where('valorTotal', '>=', 5000)
        .orderBy('valorTotal', 'desc')
        .limit(50)
        .get(),
    ));
  }

  // ─── O(result) proof query (single iteration captured, compare across seeds) ─
  const oresultQuery = await runQuery(
    'ORESULT_tipo_situacao_indexed',
    { tenantId, tipo_situacao: 'nfe_autorizada', limit: 20 },
    () => db.collection('documents')
      .where('tenantId', '==', tenantId)
      .where('tipo_situacao', '==', 'nfe_autorizada')
      .orderBy('dataEmissao', 'desc')
      .limit(20)
      .get(),
  );

  // ─── Summary ──────────────────────────────────────────────────────────────
  const allQueries = [...indexedQueries, ...unindexedQueries];
  const passed = allQueries.filter(q => q.status === 'success').length;
  const indexRequired = allQueries.filter(q => q.status === 'index_required').length;
  const errors = allQueries.filter(q => q.status === 'error').length;

  return {
    mode: gcpMode ? 'gcp' : 'emulator',
    collectionSize,
    tenantId,
    runAt: new Date().toISOString(),
    indexedQueries,
    unindexedQueries,
    oresultProof: {
      queryName: 'ORESULT_tipo_situacao_indexed',
      description: 'Same query at different collection sizes. Latency should be ~constant (O(result), not O(collection)).',
      results: [oresultQuery],
    },
    summary: {
      passed,
      indexRequired,
      errors,
      totalQueries: allQueries.length,
    },
  };
}
