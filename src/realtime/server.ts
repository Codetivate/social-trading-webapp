import { Server } from "socket.io";
// @ts-ignore
import Redis from "ioredis";
import dotenv from "dotenv";

dotenv.config();

const REDIS_URL = process.env.REDIS_URL || "redis://localhost:6379";
const PORT = parseInt(process.env.SOCKET_PORT || "3001");

async function startServer() {
    console.log(`[Socket] Starting Realtime Server on Port ${PORT}...`);

    // 1. Setup Redis Subscriber via ioredis
    // @ts-ignore
    const redisSubscriber = new Redis(REDIS_URL);

    if (REDIS_URL.includes("upstash")) {
        console.log(`[Socket] Connected to Redis Cloud`);
    } else {
        console.log(`[Socket] Connected to Redis Local`);
    }

    // 2. Setup Socket.io
    const io = new Server(PORT, {
        cors: {
            origin: "*", // Allow all for dev
            methods: ["GET", "POST"],
        },
    });

    io.on("connection", (socket) => {
        console.log(`[Socket] Client Connected: ${socket.id}`);

        socket.on("disconnect", () => {
            // console.log(`[Socket] Client Disconnected: ${socket.id}`);
        });
    });

    // 3. Bridge: Redis -> Socket
    // ioredis uses .subscribe(channel) and then .on('message')
    redisSubscriber.subscribe("channel:all_followers", (err: any) => {
        if (err) console.error("Redis Subscribe Error:", err);
    });

    // 🚀 New Channel: Live Executions from Followers
    redisSubscriber.subscribe("channel:executions", (err: any) => {
        if (err) console.error("Redis Subscribe Exec Error:", err);
    });

    // 🆕 Profile Updates
    redisSubscriber.subscribe("channel:master_updates", (err: any) => {
        if (err) console.error("Redis Subscribe Master Update Error:", err);
    });

    redisSubscriber.on("message", (channel: string, message: string) => {
        try {
            const payload = JSON.parse(message);

            if (channel === "channel:all_followers") {
                io.emit("signal", payload);
                // console.log(`[Socket] ⚡ Signal: ${payload.ticket} (${payload.action})`);
            } else if (channel === "channel:executions") {
                io.emit("execution", payload);
                console.log(`[Socket] ✅ Execution: ${payload.masterTicket} -> ${payload.followerTicket}`);
            } else if (channel === "channel:master_updates") {
                io.emit("master_updated", payload);
                console.log(`[Socket] 🔄 Master Update: ${payload.username}`);
            }

        } catch (e) {
            console.error("[Socket] Failed to parse message:", e);
        }
    });

    console.log(`[Socket] 🚀 Listening for signals...`);
}

startServer().catch((err) => {
    console.error("[Socket] Fatal Error:", err);
});
