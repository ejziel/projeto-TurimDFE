import { Router } from 'express';
import { getAllResults } from '../services/benchmark.service';

export const validationRoutes = Router();

interface ValidationThresholds {
    maxMeanLatencyMs: number;
    maxP95LatencyMs: number;
    maxP99LatencyMs: number;
    minOpsPerSecond: number;
    maxErrorRate: number;
}

const DEFAULT_THRESHOLDS: Record<string, ValidationThresholds> = {
    'insert-single': { maxMeanLatencyMs: 50, maxP95LatencyMs: 100, maxP99LatencyMs: 200, minOpsPerSecond: 20, maxErrorRate: 0.01 },
    'insert-batch': { maxMeanLatencyMs: 200, maxP95LatencyMs: 500, maxP99LatencyMs: 1000, minOpsPerSecond: 5, maxErrorRate: 0.01 },
    'query-filters': { maxMeanLatencyMs: 100, maxP95LatencyMs: 300, maxP99LatencyMs: 500, minOpsPerSecond: 10, maxErrorRate: 0.01 },
    'query-pagination': { maxMeanLatencyMs: 150, maxP95LatencyMs: 400, maxP99LatencyMs: 600, minOpsPerSecond: 8, maxErrorRate: 0.01 },
    'query-volume': { maxMeanLatencyMs: 200, maxP95LatencyMs: 500, maxP99LatencyMs: 800, minOpsPerSecond: 5, maxErrorRate: 0.02 },
    'concurrent': { maxMeanLatencyMs: 300, maxP95LatencyMs: 800, maxP99LatencyMs: 1500, minOpsPerSecond: 3, maxErrorRate: 0.05 },
    'counter-increment': { maxMeanLatencyMs: 100, maxP95LatencyMs: 300, maxP99LatencyMs: 500, minOpsPerSecond: 10, maxErrorRate: 0.02 },
    'index-effectiveness': { maxMeanLatencyMs: 80, maxP95LatencyMs: 200, maxP99LatencyMs: 400, minOpsPerSecond: 15, maxErrorRate: 0.01 },
    default: { maxMeanLatencyMs: 150, maxP95LatencyMs: 400, maxP99LatencyMs: 800, minOpsPerSecond: 5, maxErrorRate: 0.05 },
};

interface Violation {
    field: string;
    label: string;
    value: number;
    threshold: number;
    severity: 'warning' | 'critical';
}

function getThresholds(suiteName: string, overrides?: Record<string, Partial<ValidationThresholds>>): ValidationThresholds {
    const base = DEFAULT_THRESHOLDS[suiteName] || DEFAULT_THRESHOLDS.default;
    const override = overrides?.[suiteName];
    return override ? { ...base, ...override } : base;
}

// GET /api/validation - returns all results with validation status
validationRoutes.get('/', (_req, res) => {
    const results = getAllResults();
    const thresholds = DEFAULT_THRESHOLDS;

    const validated = results.map((result) => {
        const t = getThresholds(result.suiteName);
        const violations: Violation[] = [];
        const { metrics } = result;

        if (metrics.latency.mean > t.maxMeanLatencyMs) {
            violations.push({
                field: 'latency.mean',
                label: 'Latencia Media',
                value: metrics.latency.mean,
                threshold: t.maxMeanLatencyMs,
                severity: metrics.latency.mean > t.maxMeanLatencyMs * 2 ? 'critical' : 'warning',
            });
        }

        if (metrics.latency.p95 > t.maxP95LatencyMs) {
            violations.push({
                field: 'latency.p95',
                label: 'P95',
                value: metrics.latency.p95,
                threshold: t.maxP95LatencyMs,
                severity: metrics.latency.p95 > t.maxP95LatencyMs * 2 ? 'critical' : 'warning',
            });
        }

        if (metrics.latency.p99 > t.maxP99LatencyMs) {
            violations.push({
                field: 'latency.p99',
                label: 'P99',
                value: metrics.latency.p99,
                threshold: t.maxP99LatencyMs,
                severity: metrics.latency.p99 > t.maxP99LatencyMs * 2 ? 'critical' : 'warning',
            });
        }

        if (metrics.operationsPerSecond < t.minOpsPerSecond) {
            violations.push({
                field: 'operationsPerSecond',
                label: 'Throughput',
                value: metrics.operationsPerSecond,
                threshold: t.minOpsPerSecond,
                severity: metrics.operationsPerSecond < t.minOpsPerSecond / 2 ? 'critical' : 'warning',
            });
        }

        if (metrics.errorRate > t.maxErrorRate) {
            violations.push({
                field: 'errorRate',
                label: 'Taxa de Erros',
                value: metrics.errorRate,
                threshold: t.maxErrorRate,
                severity: metrics.errorRate > t.maxErrorRate * 3 ? 'critical' : 'warning',
            });
        }

        return {
            result,
            violations,
            status: violations.length === 0 ? 'pass' : violations.some((v) => v.severity === 'critical') ? 'critical' : 'warning',
        };
    });

    const summary = {
        total: results.length,
        passing: validated.filter((v) => v.status === 'pass').length,
        warnings: validated.filter((v) => v.status === 'warning').length,
        critical: validated.filter((v) => v.status === 'critical').length,
    };

    res.json({ summary, thresholds, validated });
});

// GET /api/validation/thresholds - returns default thresholds
validationRoutes.get('/thresholds', (_req, res) => {
    res.json(DEFAULT_THRESHOLDS);
});
