
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import Redis from "ioredis";

// 🔴 Initialize Redis (Singleton-ish)
const redis = new Redis(process.env.REDIS_URL || "redis://localhost:6379");

export async function POST(req: Request) {
    try {
        const session = await auth();
        if (!session?.user?.id) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const userId = session.user.id;

        console.log(`🔥 [EMERGENCY] KILL SWITCH ACTIVATED BY ${userId}`);

        // 1. Publish KILL Command to Follower's Channel
        const channel = `channel:follower:${userId}`;
        const payload = JSON.stringify({
            action: "KILL",
            reason: "User Manual Emergency Stop",
            timestamp: Date.now()
        });

        await redis.publish(channel, payload);

        // 2. Also publish to all_followers just in case (optional, but safer to target specific)
        // await redis.publish('channel:all_followers', ...); 

        return NextResponse.json({ success: true, message: "Emergency Stop Signal Sent" });

    } catch (error) {
        console.error("Emergency Stop Error:", error);
        return NextResponse.json({ error: "Failed to trigger emergency stop" }, { status: 500 });
    }
}
