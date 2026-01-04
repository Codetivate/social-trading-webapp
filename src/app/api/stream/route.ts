
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import Redis from "ioredis";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
    const session = await auth();
    if (!session?.user?.id) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = session.user.id;
    const encoder = new TextEncoder();

    // Create a dedicated Redis client for this subscription
    // We cannot reuse the global one because 'subscribe' blocks it.
    const subRedis = new Redis(process.env.REDIS_URL || "redis://127.0.0.1:6379");

    // Create a stream
    const customStream = new ReadableStream({
        async start(controller) {
            // 1. Subscribe to User's Event Channel
            const channel = `events:user:${userId}`;
            console.log(`[SSE] 🟢 Client Connected! User: ${userId} | Channel: ${channel}`);

            try {
                await subRedis.subscribe(channel);
                console.log(`[SSE] Connected for ${userId} on ${channel}`);

                // 2. Listen for messages
                subRedis.on("message", (chn, message) => {
                    if (chn === channel) {
                        // SSE Format: "data: ... \n\n"
                        const payload = `data: ${message}\n\n`;
                        controller.enqueue(encoder.encode(payload));
                    }
                });

                // 3. Send initial Ping to confirm connection
                controller.enqueue(encoder.encode(`data: {"type":"CONNECTED"}\n\n`));

            } catch (err) {
                console.error("[SSE] Subscription Error:", err);
                controller.error(err);
            }
        },
        cancel() {
            // Cleanup when client disconnects
            console.log(`[SSE] Disconnected: ${userId}`);
            subRedis.quit();
        }
    });

    return new NextResponse(customStream, {
        headers: {
            "Content-Type": "text/event-stream",
            "Cache-Control": "no-cache, no-transform",
            "Connection": "keep-alive",
        },
    });
}
