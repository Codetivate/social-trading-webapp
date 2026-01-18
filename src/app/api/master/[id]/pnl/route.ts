import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import Redis from "ioredis";

export const dynamic = "force-dynamic";

// Redis client for reading cached state
const redis = new Redis(process.env.REDIS_URL || "redis://127.0.0.1:6379");

/**
 * GET /api/master/[id]/pnl
 * Returns the Master's cached unrealized PnL from Redis.
 * The Broadcaster pushes this data to `state:master:{masterId}:tickets`.
 */
export async function GET(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const session = await auth();
    if (!session?.user?.id) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id: masterId } = await params; // Next.js 16: params is now a Promise
    if (!masterId) {
        return NextResponse.json({ error: "Missing masterId" }, { status: 400 });
    }

    try {
        // Fetch the cached state from Redis (set by Broadcaster)
        const stateKey = `state:master:${masterId}:tickets`;
        const stateData = await redis.get(stateKey);

        if (!stateData) {
            // No data available yet (Broadcaster not running or no positions)
            return NextResponse.json({
                masterId,
                unrealizedPnL: null,
                positionCount: 0,
                timestamp: null,
                source: "NO_DATA"
            });
        }

        const state = JSON.parse(stateData);

        return NextResponse.json({
            masterId,
            unrealizedPnL: state.unrealizedPnL ?? 0, // Read directly from Redis
            positionCount: state.count || 0,
            equity: state.equity || 0,
            timestamp: state.timestamp,
            source: "REDIS_CACHE"
        });

    } catch (error) {
        console.error("[API] Error fetching Master PnL:", error);
        return NextResponse.json({
            masterId,
            unrealizedPnL: null,
            error: "Failed to fetch",
            source: "ERROR"
        }, { status: 500 });
    }
}
