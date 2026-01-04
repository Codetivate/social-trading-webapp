
import Redis from "ioredis";

const userId = "a510e860-903d-4c0b-b27e-41309a736d34";
const channel = `events:user:${userId}`;

console.log(`👂 Listening for events on channel: ${channel}`);

// Force IPv4 to avoid Node v17+ localhost/IPv6 issues
const redis = new Redis(process.env.REDIS_URL || "redis://127.0.0.1:6379");

redis.on("error", (err) => {
    console.error("Redis Error:", err.message);
});

redis.subscribe(channel, (err, count) => {
    if (err) {
        console.error("Failed to subscribe: %s", err.message);
    } else {
        console.log(`✅ Subscribed successfully! Listening...`);
    }
});

redis.on("message", (channel, message) => {
    console.log(`\n📢 RECEIVED EVENT on ${channel}:`);
    console.log(message);
    const data = JSON.parse(message);
    if (data.type === 'SESSION_EXPIRED') {
        console.log("   👉 CONFIRMED: Expiry Event Published!");
    }
});
