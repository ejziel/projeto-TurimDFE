import { db } from '../config/firebase';
import { FieldValue } from 'firebase-admin/firestore';

// ─── Collection name ─────────────────────────────────────────────────────────
const COLLECTION = 'doc_counters';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface TenantCounters {
    tenantId: string;
    total: number;
    byTipo: Record<string, number>;
    bySituacao: Record<string, number>;
    byTipoSituacao: Record<string, number>;
    byEmitUf: Record<string, number>;
    byPapel: Record<string, number>;
    byManifestacao: Record<string, number>;
    byFinalidade: Record<string, number>;
    byTemXml: Record<string, number>;
    byTemPdf: Record<string, number>;
    byYearMonth: Record<string, number>;
    updatedAt: any;
}

export interface BackfillProgress {
    status: 'idle' | 'running' | 'completed' | 'error';
    processed: number;
    total: number;
    tenants: number;
    phase: string;
    startedAt?: number;
    completedAt?: number;
    durationMs?: number;
    error?: string;
}

// ─── Progress tracking ──────────────────────────────────────────────────────

let _progress: BackfillProgress = {
    status: 'idle', processed: 0, total: 0, tenants: 0, phase: '',
};

export function getBackfillProgress(): BackfillProgress {
    return { ..._progress };
}

function setProgress(update: Partial<BackfillProgress>) {
    _progress = { ..._progress, ...update };
}

// ─── Dimension keys ─────────────────────────────────────────────────────────
// Each dimension of a document that we want to count.
// This defines the mapping from doc data to counter field paths.

function getDimensionUpdates(data: Record<string, any>, delta: number): Record<string, any> {
    const inc = (n: number) => FieldValue.increment(n);
    const manif = data.statusManifestacao ?? 'sem_manifestacao';

    return {
        total: inc(delta),
        [`byTipo.${data.tipo}`]: inc(delta),
        [`bySituacao.${data.situacao}`]: inc(delta),
        [`byTipoSituacao.${data.tipo_situacao}`]: inc(delta),
        [`byEmitUf.${data.emitUf}`]: inc(delta),
        [`byPapel.${data.papel}`]: inc(delta),
        [`byManifestacao.${manif}`]: inc(delta),
        [`byFinalidade.f${data.finalidade}`]: inc(delta),
        [`byTemXml.${String(data.temXmlCompleto)}`]: inc(delta),
        [`byTemPdf.${String(data.temPdf)}`]: inc(delta),
        [`byYearMonth.${data.yearMonth}`]: inc(delta),
        updatedAt: FieldValue.serverTimestamp(),
    };
}

// Accumulate counts in-memory (for backfill — much faster than FieldValue.increment)
function accumulateInMemory(
    counters: Map<string, Record<string, any>>,
    tenantId: string,
    data: Record<string, any>,
) {
    if (!counters.has(tenantId)) {
        counters.set(tenantId, {
            total: 0,
            byTipo: {}, bySituacao: {}, byTipoSituacao: {},
            byEmitUf: {}, byPapel: {}, byManifestacao: {},
            byFinalidade: {}, byTemXml: {}, byTemPdf: {},
            byYearMonth: {},
        });
    }

    const c = counters.get(tenantId)!;
    c.total++;
    c.byTipo[data.tipo] = (c.byTipo[data.tipo] ?? 0) + 1;
    c.bySituacao[data.situacao] = (c.bySituacao[data.situacao] ?? 0) + 1;
    c.byTipoSituacao[data.tipo_situacao] = (c.byTipoSituacao[data.tipo_situacao] ?? 0) + 1;
    c.byEmitUf[data.emitUf] = (c.byEmitUf[data.emitUf] ?? 0) + 1;
    c.byPapel[data.papel] = (c.byPapel[data.papel] ?? 0) + 1;

    const manif = data.statusManifestacao ?? 'sem_manifestacao';
    c.byManifestacao[manif] = (c.byManifestacao[manif] ?? 0) + 1;

    c.byFinalidade[`f${data.finalidade}`] = (c.byFinalidade[`f${data.finalidade}`] ?? 0) + 1;
    c.byTemXml[String(data.temXmlCompleto)] = (c.byTemXml[String(data.temXmlCompleto)] ?? 0) + 1;
    c.byTemPdf[String(data.temPdf)] = (c.byTemPdf[String(data.temPdf)] ?? 0) + 1;
    c.byYearMonth[data.yearMonth] = (c.byYearMonth[data.yearMonth] ?? 0) + 1;
}

// ─── Public API ─────────────────────────────────────────────────────────────

/**
 * Increment counters for a newly inserted document.
 * Use this for real-time inserts (not for bulk seeding).
 */
export async function incrementCounters(tenantId: string, docData: Record<string, any>): Promise<void> {
    const ref = db.collection(COLLECTION).doc(tenantId);
    const updates = getDimensionUpdates(docData, 1);
    await ref.set(updates, { merge: true });
}

/**
 * Decrement counters for a deleted document.
 */
export async function decrementCounters(tenantId: string, docData: Record<string, any>): Promise<void> {
    const ref = db.collection(COLLECTION).doc(tenantId);
    const updates = getDimensionUpdates(docData, -1);
    await ref.set(updates, { merge: true });
}

/**
 * Batch increment for multiple documents (used during seeding).
 * Accumulates in-memory first, then writes all counter docs at once.
 */
export async function batchIncrementCounters(docs: { tenantId: string; data: Record<string, any> }[]): Promise<void> {
    const counters = new Map<string, Record<string, any>>();
    for (const d of docs) {
        accumulateInMemory(counters, d.tenantId, d.data);
    }

    // Write using FieldValue.increment for each accumulated value
    const batch = db.batch();
    for (const [tenantId, c] of counters) {
        const ref = db.collection(COLLECTION).doc(tenantId);
        const updates: Record<string, any> = {
            total: FieldValue.increment(c.total),
            updatedAt: FieldValue.serverTimestamp(),
        };

        for (const dim of ['byTipo', 'bySituacao', 'byTipoSituacao', 'byEmitUf', 'byPapel', 'byManifestacao', 'byFinalidade', 'byTemXml', 'byTemPdf', 'byYearMonth'] as const) {
            for (const [key, val] of Object.entries(c[dim])) {
                updates[`${dim}.${key}`] = FieldValue.increment(val as number);
            }
        }

        batch.set(ref, updates, { merge: true });
    }

    await batch.commit();
}

/**
 * Read counters for a single tenant.
 */
export async function getCounters(tenantId: string): Promise<TenantCounters | null> {
    const snap = await db.collection(COLLECTION).doc(tenantId).get();
    if (!snap.exists) return null;
    return { tenantId, ...snap.data() } as TenantCounters;
}

/**
 * Read counters for multiple tenants.
 */
export async function getMultiCounters(tenantIds: string[]): Promise<TenantCounters[]> {
    if (tenantIds.length === 0) return [];
    const refs = tenantIds.map(id => db.collection(COLLECTION).doc(id));
    const snaps = await db.getAll(...refs);
    return snaps
        .filter(s => s.exists)
        .map(s => ({ tenantId: s.id, ...s.data() } as TenantCounters));
}

/**
 * Merge multiple tenant counters into one aggregate (for multi-tenant views).
 */
export function mergeCounters(counters: TenantCounters[]): TenantCounters {
    const merged: TenantCounters = {
        tenantId: '_merged',
        total: 0,
        byTipo: {}, bySituacao: {}, byTipoSituacao: {},
        byEmitUf: {}, byPapel: {}, byManifestacao: {},
        byFinalidade: {}, byTemXml: {}, byTemPdf: {},
        byYearMonth: {},
        updatedAt: counters[0]?.updatedAt ?? null,
    };

    const addMap = (target: Record<string, number>, source: Record<string, number> | undefined) => {
        if (!source) return;
        for (const [k, v] of Object.entries(source)) {
            target[k] = (target[k] ?? 0) + v;
        }
    };

    for (const c of counters) {
        merged.total += c.total ?? 0;
        addMap(merged.byTipo, c.byTipo);
        addMap(merged.bySituacao, c.bySituacao);
        addMap(merged.byTipoSituacao, c.byTipoSituacao);
        addMap(merged.byEmitUf, c.byEmitUf);
        addMap(merged.byPapel, c.byPapel);
        addMap(merged.byManifestacao, c.byManifestacao);
        addMap(merged.byFinalidade, c.byFinalidade);
        addMap(merged.byTemXml, c.byTemXml);
        addMap(merged.byTemPdf, c.byTemPdf);
        addMap(merged.byYearMonth, c.byYearMonth);
    }

    return merged;
}

/**
 * Try to resolve a count from counters for a given filter combination.
 * Returns null if the filter combination can't be resolved from counters
 * (i.e., multi-dimensional filters require count() aggregation).
 */
export function resolveCountFromCounters(
    counters: TenantCounters,
    filters: Record<string, string>,
): number | null {
    const activeFilters = Object.entries(filters).filter(([, v]) => v !== '' && v !== undefined);

    // No filters → total
    if (activeFilters.length === 0) {
        return counters.total;
    }

    // Single filter → dimension lookup
    if (activeFilters.length === 1) {
        const [key, value] = activeFilters[0];
        switch (key) {
            case 'tipo': return counters.byTipo?.[value] ?? 0;
            case 'situacao': return counters.bySituacao?.[value] ?? 0;
            case 'tipo_situacao': return counters.byTipoSituacao?.[value] ?? 0;
            case 'emitUf': return counters.byEmitUf?.[value] ?? 0;
            case 'papel': return counters.byPapel?.[value] ?? 0;
            case 'statusManifestacao': return counters.byManifestacao?.[value] ?? 0;
            case 'finalidade': return counters.byFinalidade?.[`f${value}`] ?? 0;
            case 'temXmlCompleto': return counters.byTemXml?.[value] ?? 0;
            case 'temPdf': return counters.byTemPdf?.[value] ?? 0;
            case 'yearMonth': return counters.byYearMonth?.[value] ?? 0;
            default: return null;
        }
    }

    // Multi-dimensional filter → can't resolve from single-dimension counters
    return null;
}

// ─── Backfill ─────────────────────────────────────────────────────────────────
// Scans the entire `documents` collection and rebuilds counter documents
// from scratch. Uses cursor-based pagination to handle millions of docs.

export async function backfillCounters(): Promise<void> {
    if (_progress.status === 'running') {
        throw new Error('Backfill already in progress');
    }

    const startedAt = Date.now();
    setProgress({
        status: 'running', processed: 0, total: 0, tenants: 0,
        phase: 'Counting total documents...', startedAt, error: undefined,
    });

    try {
        // Step 1: Get total doc count
        const countSnap = await db.collection('documents').count().get();
        const total = countSnap.data().count;
        setProgress({ total, phase: `Scanning ${total.toLocaleString()} documents...` });

        // Step 2: Scan all documents with cursor-based pagination
        const counters = new Map<string, Record<string, any>>();
        let lastDoc: FirebaseFirestore.DocumentSnapshot | undefined;
        let processed = 0;
        const BATCH_SIZE = 5000;

        while (true) {
            let query: FirebaseFirestore.Query = db.collection('documents')
                .orderBy('__name__')
                .limit(BATCH_SIZE);

            if (lastDoc) {
                query = query.startAfter(lastDoc);
            }

            const snap = await query.get();
            if (snap.empty) break;

            for (const doc of snap.docs) {
                const data = doc.data();
                accumulateInMemory(counters, data.tenantId, data);
            }

            lastDoc = snap.docs[snap.docs.length - 1];
            processed += snap.size;
            setProgress({
                processed,
                tenants: counters.size,
                phase: `Scanning... ${processed.toLocaleString()} / ${total.toLocaleString()} (${counters.size} tenants)`,
            });
        }

        // Step 3: Delete existing counter documents
        setProgress({ phase: `Deleting old counters...` });
        const existingSnap = await db.collection(COLLECTION).get();
        if (!existingSnap.empty) {
            const delBatch = db.batch();
            existingSnap.docs.forEach(d => delBatch.delete(d.ref));
            await delBatch.commit();
        }

        // Step 4: Write new counter documents
        setProgress({ phase: `Writing ${counters.size} counter documents...` });
        const BATCH_LIMIT = 450;
        const entries = Array.from(counters.entries());

        for (let i = 0; i < entries.length; i += BATCH_LIMIT) {
            const chunk = entries.slice(i, i + BATCH_LIMIT);
            const batch = db.batch();
            for (const [tenantId, data] of chunk) {
                const ref = db.collection(COLLECTION).doc(tenantId);
                batch.set(ref, {
                    ...data,
                    tenantId,
                    updatedAt: FieldValue.serverTimestamp(),
                });
            }
            await batch.commit();
        }

        const completedAt = Date.now();
        setProgress({
            status: 'completed',
            processed,
            tenants: counters.size,
            phase: `Backfill complete: ${counters.size} tenants, ${processed.toLocaleString()} docs scanned`,
            completedAt,
            durationMs: completedAt - startedAt,
        });

        console.log(`[counters] Backfill complete in ${((completedAt - startedAt) / 1000).toFixed(1)}s — ${counters.size} tenants, ${processed.toLocaleString()} docs`);
    } catch (err: any) {
        setProgress({
            status: 'error',
            phase: `Error: ${err.message}`,
            error: err.message,
        });
        throw err;
    }
}

/**
 * Clear all counter documents.
 */
export async function clearCounters(): Promise<void> {
    const snap = await db.collection(COLLECTION).get();
    if (snap.empty) return;
    const batch = db.batch();
    snap.docs.forEach(d => batch.delete(d.ref));
    await batch.commit();

    setProgress({
        status: 'idle', processed: 0, total: 0, tenants: 0, phase: '',
    });
}
