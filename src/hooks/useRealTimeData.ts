
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
};

export function useRealTimeData() {
    const { data: session } = useSession();
    const [stats, setStats] = useState<BrokerStats | null>(null);
    const [lastUpdated, setLastUpdated] = useState<Date>(new Date());
    const [isConnected, setIsConnected] = useState(false);

    useEffect(() => {
        if (!session?.user?.id) return;

        // In a real implementation, we would use an EventSource (SSE) or WebSocket.
        // For this MVP, we will poll the API which now reads from Redis cache.
        // But since we want "Real Time Streaming", let's setup a clean interval 
        // that acts as a poor man's socket.

        // Better: Hook into the existing /api/user/broker endpoint 
        // which returns the latest cached state.

        const poll = async () => {
            try {
                const res = await fetch('/api/user/broker');
                if (res.ok) {
                    const data = await res.json();
                    setStats(data);
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

        return () => clearInterval(interval);
    }, [session?.user?.id]);

    return { stats, lastUpdated, isConnected };
}
