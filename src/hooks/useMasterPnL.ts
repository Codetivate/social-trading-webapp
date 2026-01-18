import { useState, useEffect, useCallback, useRef } from 'react';

/**
 * useMasterPnL - Polls Master's unrealized PnL every 10 seconds
 * Falls back to cached value if fetch fails (NO FLICKERING)
 */
export function useMasterPnL(masterId: string | undefined) {
    const [pnl, setPnL] = useState<number | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
    const [error, setError] = useState<string | null>(null);

    // 🛡️ ANTI-FLICKER: Store last known valid value
    const lastValidPnL = useRef<number | null>(null);

    const fetchPnL = useCallback(async () => {
        if (!masterId) return;

        setIsLoading(true);
        setError(null);

        try {
            const res = await fetch(`/api/master/${masterId}/pnl?t=${Date.now()}`, {
                cache: 'no-store'
            });

            if (res.ok) {
                const data = await res.json();
                const newPnL = data.unrealizedPnL;

                // 🛡️ Only update if we got a valid number
                if (newPnL !== null && newPnL !== undefined && !isNaN(newPnL)) {
                    lastValidPnL.current = newPnL;
                    setPnL(newPnL);
                    setLastUpdated(new Date());
                }
                // If null/undefined returned, KEEP previous cached value (no flicker)
            } else {
                setError(`HTTP ${res.status}`);
                // Keep previous cached value
            }
        } catch (e) {
            setError('Network error');
            // Keep previous cached value
        } finally {
            setIsLoading(false);
        }
    }, [masterId]);

    useEffect(() => {
        if (!masterId) return;

        // Initial fetch
        fetchPnL();

        // Poll every 10 seconds
        const interval = setInterval(fetchPnL, 10000);

        return () => clearInterval(interval);
    }, [masterId, fetchPnL]);

    // 🛡️ ANTI-FLICKER: Return last valid value if current is null
    const displayPnL = pnl ?? lastValidPnL.current;

    return { pnl: displayPnL, isLoading, lastUpdated, error };
}
