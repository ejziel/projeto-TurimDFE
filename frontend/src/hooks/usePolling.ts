import { useState, useEffect, useRef, useCallback } from 'react';

export function usePolling<T>(
    fetchFn: () => Promise<T>,
    intervalMs: number,
    enabled = true,
): { data: T | null; loading: boolean; error: string | null; refresh: () => void } {
    const [data, setData] = useState<T | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

    const fetchData = useCallback(async () => {
        setLoading(true);
        try {
            const result = await fetchFn();
            setData(result);
            setError(null);
        } catch (err: any) {
            setError(err.message || 'Fetch error');
        } finally {
            setLoading(false);
        }
    }, [fetchFn]);

    useEffect(() => {
        if (!enabled) return;
        fetchData();
        intervalRef.current = setInterval(fetchData, intervalMs);
        return () => {
            if (intervalRef.current) clearInterval(intervalRef.current);
        };
    }, [fetchData, intervalMs, enabled]);

    return { data, loading, error, refresh: fetchData };
}
