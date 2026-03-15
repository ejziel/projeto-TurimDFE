import { Router } from 'express';
import { db } from '../config/firebase';
import { startTimer, endTimer } from '../utils/timer';
import { extractIndexUrl } from '../utils/query-logger';
import {
    getMultiCounters,
    mergeCounters,
    resolveCountFromCounters,
} from '../services/counter.service';

export const documentRoutes = Router();

const PAGE_SIZE_MAX = 100;

// Campos de igualdade simples (string)
const STRING_FILTERS = ['tipo', 'situacao', 'emitUf', 'papel', 'statusManifestacao', 'cfopPrincipal', 'yearMonth', 'tipo_situacao'] as const;

// Campos sortáveis
const SORT_FIELDS = ['dataEmissao', 'dataColeta', 'valorTotal', 'valorProdutos', 'numero', 'tipo', 'situacao', 'emitUf'];

type CountMode = 'aggregation' | 'counters';

function buildBaseQuery(tenantIds: string[], filters: Record<string, any>) {
    let q: FirebaseFirestore.Query = db.collection('documents');

    if (tenantIds.length === 1) {
        q = q.where('tenantId', '==', tenantIds[0]);
    } else if (tenantIds.length <= 30) {
        q = q.where('tenantId', 'in', tenantIds);
    } else {
        q = q.where('tenantId', 'in', tenantIds.slice(0, 30));
    }

    for (const field of STRING_FILTERS) {
        if (filters[field] !== undefined && filters[field] !== '') {
            q = q.where(field, '==', filters[field]);
        }
    }

    if (filters.temXmlCompleto === 'true') q = q.where('temXmlCompleto', '==', true);
    else if (filters.temXmlCompleto === 'false') q = q.where('temXmlCompleto', '==', false);

    if (filters.temPdf === 'true') q = q.where('temPdf', '==', true);
    else if (filters.temPdf === 'false') q = q.where('temPdf', '==', false);

    if (filters.finalidade) {
        const n = parseInt(filters.finalidade);
        if (!isNaN(n)) q = q.where('finalidade', '==', n);
    }

    return q;
}

// ─── Count via distributed counters ─────────────────────────────────────────

async function countViaCounters(
    tenantIds: string[],
    activeFilters: Record<string, string>,
): Promise<{ total: number; latencyMs: number; resolved: boolean; fallbackReason?: string }> {
    const t0 = startTimer();

    const counters = await getMultiCounters(tenantIds);
    if (counters.length === 0) {
        return { total: 0, latencyMs: endTimer(t0), resolved: false, fallbackReason: 'no_counters_found' };
    }

    const merged = counters.length === 1 ? counters[0] : mergeCounters(counters);
    const count = resolveCountFromCounters(merged, activeFilters);

    if (count === null) {
        return {
            total: 0,
            latencyMs: endTimer(t0),
            resolved: false,
            fallbackReason: 'multi_dimensional_filter',
        };
    }

    return { total: count, latencyMs: endTimer(t0), resolved: true };
}

// ─── Count via Firestore aggregation ────────────────────────────────────────

async function countViaAggregation(
    baseQuery: FirebaseFirestore.Query,
): Promise<{ total: number; latencyMs: number }> {
    const t0 = startTimer();
    const snap = await baseQuery.count().get();
    return { total: snap.data().count, latencyMs: endTimer(t0) };
}

// GET /api/documents/list
documentRoutes.get('/list', async (req, res) => {
    try {
        const {
            tenantId,
            limit = '20',
            page = '0',
            orderBy = '',
            orderDir = 'desc',
            countMode = 'aggregation',
            skipCount = '',
            knownTotal = '',
            ...rawFilters
        } = req.query as Record<string, string>;

        if (!tenantId) return res.status(400).json({ error: 'tenantId is required' });

        const tenantIds = tenantId.split(',').map(s => s.trim()).filter(Boolean);
        if (tenantIds.length === 0) return res.status(400).json({ error: 'tenantId is required' });

        const pageSize = Math.min(Math.max(parseInt(limit) || 20, 1), PAGE_SIZE_MAX);
        const pageNum = Math.max(parseInt(page) || 0, 0);
        const dir: 'asc' | 'desc' = orderDir === 'asc' ? 'asc' : 'desc';
        const mode: CountMode = countMode === 'counters' ? 'counters' : 'aggregation';
        const shouldSkipCount = skipCount === 'true' && knownTotal;

        const baseQuery = buildBaseQuery(tenantIds, rawFilters);

        const sortedQuery = SORT_FIELDS.includes(orderBy)
            ? baseQuery.orderBy(orderBy, dir)
            : baseQuery;

        // Build active filters map
        const activeFilters: Record<string, string> = {};
        for (const key of [...STRING_FILTERS, 'temXmlCompleto', 'temPdf', 'finalidade']) {
            if (rawFilters[key] !== undefined && rawFilters[key] !== '') {
                activeFilters[key] = rawFilters[key];
            }
        }

        // ─── Resolve count ────────────────────────────────────────
        let total: number;
        let countLatencyMs: number;
        let countSource: 'aggregation' | 'counters' | 'skipped' | 'counters_fallback_aggregation';

        if (shouldSkipCount) {
            // Pagination — reuse known total
            total = parseInt(knownTotal) || 0;
            countLatencyMs = 0;
            countSource = 'skipped';
        } else if (mode === 'counters') {
            // Try distributed counters first
            const counterResult = await countViaCounters(tenantIds, activeFilters);
            if (counterResult.resolved) {
                total = counterResult.total;
                countLatencyMs = counterResult.latencyMs;
                countSource = 'counters';
            } else {
                // Fallback to aggregation for multi-dimensional filters
                const aggResult = await countViaAggregation(baseQuery);
                total = aggResult.total;
                countLatencyMs = aggResult.latencyMs;
                countSource = 'counters_fallback_aggregation';
            }
        } else {
            // Direct aggregation
            const aggResult = await countViaAggregation(baseQuery);
            total = aggResult.total;
            countLatencyMs = aggResult.latencyMs;
            countSource = 'aggregation';
        }

        // ─── List query (always runs) ────────────────────────────
        const t0List = startTimer();
        const listSnap = await sortedQuery.offset(pageNum * pageSize).limit(pageSize).get();
        const listLatencyMs = endTimer(t0List);

        const toISO = (v: any): string | null =>
            v?.toDate ? v.toDate().toISOString() : (v instanceof Date ? v.toISOString() : v ?? null);

        const docs = listSnap.docs.map((d) => {
            const data = d.data();
            return {
                id: d.id,
                tipo: data.tipo,
                situacao: data.situacao,
                tipo_situacao: data.tipo_situacao,
                emitUf: data.emitUf,
                emitCnpj: data.emitCnpj,
                emitNome: data.emitNome,
                emitFantasia: data.emitFantasia,
                cnpjDestinatario: data.cnpjDestinatario,
                destNome: data.destNome,
                destUf: data.destUf,
                valorTotal: data.valorTotal,
                valorProdutos: data.valorProdutos,
                valorFrete: data.valorFrete,
                valorDesconto: data.valorDesconto,
                dataEmissao: toISO(data.dataEmissao),
                dataColeta: toISO(data.dataColeta),
                papel: data.papel,
                chaveAcesso: data.chaveAcesso,
                tenantId: data.tenantId,
                statusManifestacao: data.statusManifestacao ?? null,
                finalidade: data.finalidade,
                cfopPrincipal: data.cfopPrincipal,
                temXmlCompleto: data.temXmlCompleto,
                temPdf: data.temPdf,
                numero: data.numero,
                serie: data.serie,
                yearMonth: data.yearMonth,
                naturezaOperacao: data.naturezaOperacao,
                nsu: data.nsu,
            };
        });

        res.json({
            docs,
            total,
            page: pageNum,
            limit: pageSize,
            countLatencyMs,
            listLatencyMs,
            countSource,
            hasMore: pageNum * pageSize + docs.length < total,
            filters: activeFilters,
            orderBy: orderBy || null,
            orderDir: dir,
        });
    } catch (err: any) {
        const isIndexRequired =
            err.code === 9 ||
            err.message?.includes('FAILED_PRECONDITION') ||
            err.message?.includes('index');
        res.status(isIndexRequired ? 422 : 500).json({
            error: isIndexRequired ? 'index_required' : 'query_error',
            message: err.message,
            indexCreationUrl: isIndexRequired ? extractIndexUrl(err.message) : undefined,
        });
    }
});

// GET /api/documents/tenants
documentRoutes.get('/tenants', async (_req, res) => {
    try {
        const tenantSnap = await db.collection('tenants').limit(50).get();
        const tenants = tenantSnap.docs.map((d) => ({
            id: d.id,
            name: d.data().name ?? d.id,
            tradeName: d.data().tradeName ?? null,
        }));

        const cnpjSnap = await db.collection('cnpj_registry').limit(500).get();
        const cnpjsByTenant: Record<string, { cnpj: string; companyName: string; uf: string }[]> = {};
        for (const doc of cnpjSnap.docs) {
            const data = doc.data();
            const tid = data.tenantId;
            if (!cnpjsByTenant[tid]) cnpjsByTenant[tid] = [];
            cnpjsByTenant[tid].push({
                cnpj: doc.id,
                companyName: data.companyName ?? doc.id,
                uf: data.uf ?? '',
            });
        }

        const result = tenants.map(t => ({
            ...t,
            cnpjs: cnpjsByTenant[t.id] ?? [],
        }));

        res.json(result);
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});
