import { redis } from '@/lib/redis';
import { SignalPayload } from '@/lib/smart-router';

/**
 * 🚀 Ingestion Service (High Scale)
 * 
 * Instead of writing to the DB directly, we push signals to a high-speed Redis Stream.
 * This ensures the Master never waits for database locks.
 */
export class IngestionService {
    private static STREAM_KEY = 'stream:signals';

    /**
     * Push a signal to the processing queue (Redis Stream)
     * Latency: ~2ms
     */
    static async pushSignal(signal: any): Promise<string> {
        try {
            // XADD stream * key value
            const id = await redis.xadd(
                this.STREAM_KEY,
                '*', // Auto-generate ID (Timestamp-Sequence)
                'payload', JSON.stringify(signal),
                'timestamp', Date.now().toString()
            );
            return id as string;
        } catch (error) {
            console.error("❌ Failed to push signal to Redis:", error);
            throw new Error("Ingestion Failed");
        }
    }

    /**
     * For debugging: Read recent signals from the stream
     */
    static async getRecentSignals(count = 10) {
        // XRANGE stream - + COUNT 10
        return await redis.xrange(this.STREAM_KEY, '-', '+', 'COUNT', count);
    }
}
