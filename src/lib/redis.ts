import Redis from 'ioredis';

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';

// 🔌 Use a singleton pattern to avoid multiple connections in Lambda/Serverless environments
const globalForRedis = global as unknown as { redis: Redis };

export const redis =
    globalForRedis.redis ||
    new Redis(REDIS_URL, {
        maxRetriesPerRequest: 3,
        retryStrategy(times: number) {
            const delay = Math.min(times * 50, 2000);
            return delay;
        },
    });

if (process.env.NODE_ENV !== 'production') globalForRedis.redis = redis;

export async function checkRedisConnection(): Promise<boolean> {
    try {
        const status = await redis.ping();
        return status === 'PONG';
    } catch (error) {
        console.warn("⚠️ Redis Connection Failed:", error);
        return false;
    }
}
