import Redis from "ioredis";

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';

const parsedUrl = new URL(REDIS_URL);
const redis = new Redis({
    host: parsedUrl.hostname,
    port: parseInt(parsedUrl.port || "6379"),
    username: parsedUrl.username,
    password: parsedUrl.password,
    tls: REDIS_URL.includes("rediss://") ? { rejectUnauthorized: false } : undefined
});
const STREAM_KEY = 'stream:signals';
const GROUP_NAME = 'router_group';
const CONSUMER_NAME = 'router_worker_1';

/**
 * ⚡ Realtime Router (The Brain)
 * 
 * Ideally, this runs as a separate worker process.
 * It reads from the Redis Stream (signals from Python) and 'Routes' them.
 * 
 * Routing Logic:
 * 1. Read Signal from Stream
 * 2. (Future) Check "Who is copying this Master?" (Fan-Out)
 * 3. Publish to `channel:all_followers` (for now, broadcast to everyone)
 */
async function startRouter() {
    console.log("🚀 Realtime Router Started...");

    try {
        // Create Consumer Group (idempotent)
        await redis.xgroup('CREATE', STREAM_KEY, GROUP_NAME, '$', 'MKSTREAM');
    } catch (e) {
        // Ignore "BUSYGROUP Consumer Group name already exists"
    }

    while (true) {
        try {
            // Read new messages efficiently (Block for 5s if empty)
            const result = await (redis as any).xreadgroup(
                'GROUP', GROUP_NAME, CONSUMER_NAME,
                'BLOCK', 5000,
                'COUNT', 1,
                'STREAMS', STREAM_KEY, '>'
            );

            if (result) {
                const [stream, messages] = result[0]; // First stream result

                for (const msg of messages) {
                    const [id, fields] = msg;
                    // Fields is [ 'payload', '{"ticket":...}', 'timestamp', '123...' ]
                    // Parse fields array manually or use a helper
                    const payloadStr = fields[1]; // Value of 'payload' key

                    console.log(`⚡ Processing Signal ${id}:`, payloadStr);

                    // --- ROUTING LOGIC ---
                    // For now, we just BROADCAST to everyone connected to the WS Server
                    await redis.publish("channel:all_followers", payloadStr);

                    // Acknowledge message (mark as processed)
                    await redis.xack(STREAM_KEY, GROUP_NAME, id);
                }
            }
        } catch (error) {
            console.error("Router Error:", error);
            await new Promise(r => setTimeout(r, 1000)); // Backoff
        }
    }
}

// Start if run directly
if (require.main === module) {
    startRouter();
}
