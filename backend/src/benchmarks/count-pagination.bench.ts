import { db, gcpMode } from '../config/firebase';
import { startTimer, endTimer } from '../utils/timer';
import { extractIndexUrl } from '../utils/query-logger';

export interface CountPaginationScenario {
    name: string;
    type: 'count' | 'list' | 'count+list';
    filters: Record<string, string>;
    latencies: number[];
    avgLatencyMs: number;
    minLatencyMs: number;
    maxLatencyMs: number;
    total: number | null;       // result of count()
    docsReturned: number | null; // result of list()
    status: 'success' | 'index_required' | 'error';
    indexCreationUrl?: string;
    errorMessage?: string;
}

export interface CountPaginationResult {
    mode: 'gcp' | 'emulator';
    tenantId: string;
    collectionSize: number;
    pageSize: number;
    iterations: number;
    runAt: string;
    scenarios: CountPaginationScenario[];
}

function avg(arr: number[]) { return arr.reduce((a, b) => a + b, 0) / arr.length; }
function min(arr: number[]) { return Math.min(...arr); }
function max(arr: number[]) { return Math.max(...arr); }

async function runCountScenario(
    name: string,
    filters: Record<string, string>,
    tenantId: string,
    iterations: number,
): Promise<CountPaginationScenario> {
    let q: FirebaseFirestore.Query = db.collection('documents').where('tenantId', '==', tenantId);
    for (const [k, v] of Object.entries(filters)) q = q.where(k, '==', v);

    const latencies: number[] = [];
    let total: number | null = null;

    try {
        for (let i = 0; i < iterations; i++) {
            const t0 = startTimer();
            const snap = await q.count().get();
            latencies.push(endTimer(t0));
            total = snap.data().count;
        }
        return {
            name, type: 'count', filters, latencies,
            avgLatencyMs: avg(latencies), minLatencyMs: min(latencies), maxLatencyMs: max(latencies),
            total, docsReturned: null, status: 'success',
        };
    } catch (err: any) {
        const isIndex = err.code === 9 || err.message?.includes('FAILED_PRECONDITION') || err.message?.includes('index');
        return {
            name, type: 'count', filters, latencies: [endTimer(startTimer())],
            avgLatencyMs: 0, minLatencyMs: 0, maxLatencyMs: 0,
            total: null, docsReturned: null,
            status: isIndex ? 'index_required' : 'error',
            indexCreationUrl: isIndex ? extractIndexUrl(err.message) : undefined,
            errorMessage: err.message,
        };
    }
}

async function runListScenario(
    name: string,
    filters: Record<string, string>,
    tenantId: string,
    pageSize: number,
    iterations: number,
): Promise<CountPaginationScenario> {
    let q: FirebaseFirestore.Query = db.collection('documents').where('tenantId', '==', tenantId);
    for (const [k, v] of Object.entries(filters)) q = q.where(k, '==', v);
    q = q.limit(pageSize);

    const latencies: number[] = [];
    let docsReturned: number | null = null;

    try {
        for (let i = 0; i < iterations; i++) {
            const t0 = startTimer();
            const snap = await q.get();
            latencies.push(endTimer(t0));
            docsReturned = snap.size;
        }
        return {
            name, type: 'list', filters, latencies,
            avgLatencyMs: avg(latencies), minLatencyMs: min(latencies), maxLatencyMs: max(latencies),
            total: null, docsReturned, status: 'success',
        };
    } catch (err: any) {
        const isIndex = err.code === 9 || err.message?.includes('FAILED_PRECONDITION') || err.message?.includes('index');
        return {
            name, type: 'list', filters, latencies: [0],
            avgLatencyMs: 0, minLatencyMs: 0, maxLatencyMs: 0,
            total: null, docsReturned: null,
            status: isIndex ? 'index_required' : 'error',
            indexCreationUrl: isIndex ? extractIndexUrl(err.message) : undefined,
            errorMessage: err.message,
        };
    }
}

async function runCountPlusList(
    name: string,
    filters: Record<string, string>,
    tenantId: string,
    pageSize: number,
    iterations: number,
): Promise<CountPaginationScenario> {
    let base: FirebaseFirestore.Query = db.collection('documents').where('tenantId', '==', tenantId);
    for (const [k, v] of Object.entries(filters)) base = base.where(k, '==', v);

    const latencies: number[] = [];
    let total: number | null = null;
    let docsReturned: number | null = null;

    try {
        for (let i = 0; i < iterations; i++) {
            const t0 = startTimer();
            const [countSnap, listSnap] = await Promise.all([
                base.count().get(),
                base.limit(pageSize).get(),
            ]);
            latencies.push(endTimer(t0));
            total = countSnap.data().count;
            docsReturned = listSnap.size;
        }
        return {
            name, type: 'count+list', filters, latencies,
            avgLatencyMs: avg(latencies), minLatencyMs: min(latencies), maxLatencyMs: max(latencies),
            total, docsReturned, status: 'success',
        };
    } catch (err: any) {
        const isIndex = err.code === 9 || err.message?.includes('FAILED_PRECONDITION') || err.message?.includes('index');
        return {
            name, type: 'count+list', filters, latencies: [0],
            avgLatencyMs: 0, minLatencyMs: 0, maxLatencyMs: 0,
            total: null, docsReturned: null,
            status: isIndex ? 'index_required' : 'error',
            indexCreationUrl: isIndex ? extractIndexUrl(err.message) : undefined,
            errorMessage: err.message,
        };
    }
}

export async function runCountPaginationBenchmark(config: {
    iterations?: number;
    pageSize?: number;
}): Promise<CountPaginationResult> {
    const iterations = config.iterations ?? 3;
    const pageSize = config.pageSize ?? 20;

    const tenantSnap = await db.collection('tenants').limit(1).get();
    if (tenantSnap.empty) throw new Error('No data. Run seed first.');
    const tenantId = tenantSnap.docs[0].id;

    const countSnap = await db.collection('documents').count().get();
    const collectionSize = countSnap.data().count;

    const scenarios: CountPaginationScenario[] = await Promise.all([
        // Count only — single filter
        runCountScenario('count_base', {}, tenantId, iterations),
        runCountScenario('count_tipo_nfe', { tipo: 'nfe' }, tenantId, iterations),
        runCountScenario('count_situacao_autorizada', { situacao: 'autorizada' }, tenantId, iterations),
        runCountScenario('count_emitUf_SP', { emitUf: 'SP' }, tenantId, iterations),
        // Count — combined filters (may require composite index)
        runCountScenario('count_tipo_situacao', { tipo: 'nfe', situacao: 'autorizada' }, tenantId, iterations),

        // List only — single filter
        runListScenario('list_base', {}, tenantId, pageSize, iterations),
        runListScenario('list_tipo_nfe', { tipo: 'nfe' }, tenantId, pageSize, iterations),
        runListScenario('list_situacao_autorizada', { situacao: 'autorizada' }, tenantId, pageSize, iterations),
        // List — combined filters
        runListScenario('list_tipo_situacao', { tipo: 'nfe', situacao: 'autorizada' }, tenantId, pageSize, iterations),

        // Count + List in parallel (custo real de uma página com total)
        runCountPlusList('count+list_base', {}, tenantId, pageSize, iterations),
        runCountPlusList('count+list_tipo', { tipo: 'nfe' }, tenantId, pageSize, iterations),
        runCountPlusList('count+list_tipo_situacao', { tipo: 'nfe', situacao: 'autorizada' }, tenantId, pageSize, iterations),
    ]);

    return {
        mode: gcpMode ? 'gcp' : 'emulator',
        tenantId,
        collectionSize,
        pageSize,
        iterations,
        runAt: new Date().toISOString(),
        scenarios,
    };
}
