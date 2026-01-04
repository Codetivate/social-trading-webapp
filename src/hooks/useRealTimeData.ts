
import { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';

export type BrokerStats = {
    balance: number;
    equity: number;
    margin: number;
    freeMargin: number;
    leverage: number;
    login: number;
    positions: any[];
    floating: Record<string, number>;
    activeSessions?: { id: number; masterId: string; type: string; expiry: Date | string }[];
};

export function useRealTimeData() {
    const { data: session } = useSession();
    const [stats, setStats] = useState<BrokerStats | null>(null);
    const [lastUpdated, setLastUpdated] = useState<Date>(new Date());
    const [isConnected, setIsConnected] = useState(false);

    useEffect(() => {
        if (!session?.user?.id) return;

        // A. POLLING (For Equity/Balance - Keep this for robustness)
        const poll = async () => {
            try {
                // ⚡ Anti-Cache Pattern
                const res = await fetch('/api/user/broker?t=' + Date.now(), {
                    cache: 'no-store',
                    headers: { 'Pragma': 'no-cache' }
                });
                if (res.ok) {
                    const data = await res.json();
                    setStats(prev => {
                        // Preserve activeSessions if we have a pending real-time update? 
                        // Actually, server is authority. But server takes 1s to update.
                        // We will let SSE override/prune this.
                        return data;
                    });
                    setLastUpdated(new Date());
                    setIsConnected(true);
                } else {
                    setIsConnected(false);
                }
            } catch (e) {
                console.error("Pulse Failed", e);
                setIsConnected(false);
            }
        };

        const interval = setInterval(poll, 1000); // 1s sync
        poll(); // Initial

        // B. STREAMING (Server-Sent Events) for Instant Events
        // This is the "Socket" part the user requested
        let eventSource: EventSource | null = null;
        try {
            eventSource = new EventSource('/api/stream');

            eventSource.onmessage = (event) => {
                const data = JSON.parse(event.data);

                if (data.type === 'SESSION_EXPIRED') {
                    // ⚡ INSTANT LOCAL UPDATE
                    setStats(prev => {
                        if (!prev) return null;
                        return {
                            ...prev,
                            // Remove the expired session immediately
                            activeSessions: prev.activeSessions?.filter(s => s.id !== data.sessionId) || []
                        };
                    });
                    // Also trigger a refresh to get official state
                    poll();
                }
            };

            eventSource.onerror = (e) => {
                console.warn("SSE Error (Retrying...)", e);
                // EventSource auto-reconnects usually
            };

        } catch (e) {
            console.error("SSE Setup Failed", e);
        }

        return () => {
            clearInterval(interval);
            if (eventSource) eventSource.close();
        };
    }, [session?.user?.id]);

    return { stats, lastUpdated, isConnected };
}
