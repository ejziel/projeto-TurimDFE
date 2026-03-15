import { Router } from 'express';
import {
    backfillCounters,
    clearCounters,
    getBackfillProgress,
    getCounters,
    getMultiCounters,
    mergeCounters,
} from '../services/counter.service';
import { startTimer, endTimer } from '../utils/timer';

export const counterRoutes = Router();

// POST /api/counters/backfill — rebuild counters from existing documents
counterRoutes.post('/backfill', async (_req, res) => {
    try {
        // Start in background — don't block the HTTP response
        backfillCounters().catch(err => {
            console.error('[counters] Backfill failed:', err.message);
        });
        res.json({ status: 'started', message: 'Backfill started in background. Poll /api/counters/backfill-progress for status.' });
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

// GET /api/counters/backfill-progress
counterRoutes.get('/backfill-progress', (_req, res) => {
    res.json(getBackfillProgress());
});

// DELETE /api/counters/clear — clear all counter documents
counterRoutes.delete('/clear', async (_req, res) => {
    try {
        await clearCounters();
        res.json({ status: 'ok', message: 'Counter documents cleared' });
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

// GET /api/counters/:tenantId — get counters for a single tenant
counterRoutes.get('/tenant/:tenantId', async (req, res) => {
    try {
        const t0 = startTimer();
        const counters = await getCounters(req.params.tenantId);
        const latencyMs = endTimer(t0);
        if (!counters) return res.status(404).json({ error: 'No counters found for tenant' });
        res.json({ counters, latencyMs });
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

// GET /api/counters/summary?tenantIds=id1,id2,id3 — get merged counters for multiple tenants
counterRoutes.get('/summary', async (req, res) => {
    try {
        const tenantIds = ((req.query.tenantIds as string) ?? '').split(',').map(s => s.trim()).filter(Boolean);
        if (tenantIds.length === 0) return res.status(400).json({ error: 'tenantIds is required' });

        const t0 = startTimer();
        const all = await getMultiCounters(tenantIds);
        const latencyMs = endTimer(t0);

        if (all.length === 0) return res.status(404).json({ error: 'No counters found' });

        const merged = all.length === 1 ? all[0] : mergeCounters(all);
        res.json({ counters: merged, tenantCount: all.length, latencyMs });
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});
