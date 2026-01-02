import { Server } from "socket.io";
import { createServer } from "http";
import { redis } from "../lib/redis"; // Shared Redis Client
import Redis from "ioredis";

/**
 * ⚡ Realtime Push Server (Microservice)
 * 
 * This server handles the WebSocket connections from 100k+ followers.
 * It listens to Redis Pub/Sub events and pushes them down the socket.
 */

const PORT = parseInt(process.env.WS_PORT || "3001");
const httpServer = createServer();

// Initialize Socket.io with CORS
const io = new Server(httpServer, {
    cors: {
        origin: "*", // Allow all origins (Secure this in prod!)
        methods: ["GET", "POST"]
    }
});

// Dedicated Redis Subscriber (Pub/Sub requires a dedicated connection)
const subClient = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');

// 🎧 Subscribe to Signals Channel
subClient.subscribe("channel:all_followers", (err: any, count: any) => {
    if (err) console.error("❌ Failed to subscribe: %s", err.message);
    else console.log(`✅ Subscribed to ${count} channels. Listening for signals...`);
});

// 🔄 Message Loop
subClient.on("message", (channel: string, message: string) => {
    console.log(`📩 Received ${message} from ${channel}`);
    // Broadcast to all connected clients (Fan-Out)
    io.emit("signal", JSON.parse(message));
});

io.on("connection", (socket: any) => { // Todo: Define strict Socket type
    console.log(`🔌 Client Connected: ${socket.id}`);

    socket.on("identify", (userId: string) => {
        console.log(`👤 User identified: ${userId}`);
        socket.join(`user:${userId}`);
    });

    socket.on("disconnect", () => {
        console.log(`❌ Client Disconnected: ${socket.id}`);
    });
});

httpServer.listen(PORT, () => {
    console.log(`
🚀 🚀 REALTIME SERVER STARTED 🚀 🚀
-----------------------------------
Listening on Port: ${PORT}
Redis: ${process.env.REDIS_URL || 'localhost:6379'}
-----------------------------------
    `);
});
