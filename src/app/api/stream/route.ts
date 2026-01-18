
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

    // 0. Lookup Broker Account to get Login ID (for Account-Based Streaming)
    // Use Global Prisma to avoid "Too many connections"
    const prisma = await import("@/lib/prisma").then(m => m.prisma);

    const account = await prisma.brokerAccount.findFirst({
        where: { userId: userId, status: "CONNECTED" },
        select: { login: true }
    });

    if (!account) {
        console.warn(`[SSE] ⚠️ No Connected Broker Account found for User ${userId}. Streaming might be limited.`);
    }

    // 0b. Fetch Active CopySessions to Get Master IDs for Master PnL Streaming
    const activeSessions = await prisma.copySession.findMany({
        where: { followerId: userId, isActive: true },
        select: { masterId: true }
    });
    const masterIds = activeSessions.map(s => s.masterId).filter(Boolean);

    // Create a stream
    const customStream = new ReadableStream({
        async start(controller) {
            // 1. Subscribe to User's Event Channel
            const userChannel = `events:user:${userId}`;
            console.log(`[SSE] 🟢 Client Connected! User: ${userId} | Channel: ${userChannel}`);

            // 1b. Subscribe to Account Channel (if available)
            let accountChannel: string | null = null;
            if (account?.login) {
                accountChannel = `events:account:${account.login}`;
                console.log(`[SSE] 🟢 Also Listening to Account: ${accountChannel}`);
            }

            // 1c. Subscribe to Master Channels (for Master PnL Streaming)
            const masterChannels: string[] = masterIds.map(id => `events:master:${id}`);
            if (masterChannels.length > 0) {
                console.log(`[SSE] 📡 Listening to ${masterChannels.length} Master Channel(s): ${masterChannels.join(', ')}`);
            }

            try {
                await subRedis.subscribe(userChannel);
                if (accountChannel) await subRedis.subscribe(accountChannel);
                for (const mc of masterChannels) {
                    await subRedis.subscribe(mc);
                }

                console.log(`[SSE] Connected for ${userId}`);

                // 2. Listen for messages
                subRedis.on("message", (chn, message) => {
                    // Forward if channel matches any subscription (User, Account, or Master)
                    const isMasterChannel = masterChannels.includes(chn);
                    if (chn === userChannel || (accountChannel && chn === accountChannel) || isMasterChannel) {
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
            // Global Prisma - Do NOT disconnect
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
