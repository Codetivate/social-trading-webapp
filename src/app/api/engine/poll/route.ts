
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import * as fs from 'fs';

// 🔐 Secret Key (Shared with executor.py)
const BRIDGE_SECRET = process.env.BROKER_SECRET || "AlphaBravoCharlieDeltaEchoFoxtro";

// 💡 IN-MEMORY QUEUE for Demo purposes (In prod, use Redis/Database)
// This simulates "Signals waiting to be executed by followers"
let SIGNAL_QUEUE: any[] = [];

// Method to push signals (Called by the Broadcaster Logic usually)
// For this simple example, we'll pretend there's one signal every time for testing
const MOCK_SIGNAL = {
    id: "sig_1",
    masterId: "1001",
    symbol: "GBPUSD",
    type: "BUY",
    volume: 0.01,
    timestamp: Date.now()
};

export async function GET(req: NextRequest) {
    // 1. Authenticate
    const secret = req.headers.get("x-bridge-secret");
    if (secret !== BRIDGE_SECRET) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const followerId = searchParams.get("followerId");

    if (!followerId) {
        return NextResponse.json({ error: "Missing followerId" }, { status: 400 });
    }

    // 2. Fetch Pending Signals (BigInt Handling)
    // 2. Fetch Pending Signals (BigInt Handling)
    try {
        const signals = await prisma.signal.findMany({
            where: {
                followerId: followerId,
                status: "PENDING"
            },
            orderBy: { createdAt: 'asc' },
            // 🧹 Force new Query Plan by using explicit select
            select: {
                id: true,
                followerId: true,
                masterId: true,
                ticket: true,
                symbol: true,
                action: true,
                type: true,
                volume: true,
                price: true,
                sl: true,
                tp: true,
                status: true,
                executedTicket: true
            }
        });

        // ⚠️ Serialize BigInt for JSON
        const safeSignals = signals.map(s => ({
            ...s,
            ticket: s.ticket.toString(),
            executedTicket: s.executedTicket ? s.executedTicket.toString() : null
        }));

        return NextResponse.json({
            status: "OK",
            signals: safeSignals
        });
    } catch (e: any) {
        fs.appendFileSync('debug.log', `[Engine] ❌ Poll Error for ${followerId}: ${e?.message}\n`);
        console.error("Poll Error:", e);
        return NextResponse.json({ error: "Internal Error check debug.log" }, { status: 500 });
    }
}

// 3. ACKNOWLEDGMENT ENDPOINT
export async function POST(req: NextRequest) {
    // Authenticate
    const secret = req.headers.get("x-bridge-secret");
    if (secret !== BRIDGE_SECRET) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    try {
        const body = await req.json();
        const { signalId, status, ticket, comment } = body;

        if (!signalId || !status) {
            return NextResponse.json({ error: "Missing fields" }, { status: 400 });
        }

        console.log(`[Engine] 📝 ACK Signal ${signalId}: ${status} (Ticket: ${ticket})`);

        // Update DB
        const updated = await prisma.signal.update({
            where: { id: signalId },
            data: {
                status: status,
                executedTicket: ticket ? String(ticket) : undefined,
                errorMessage: comment
            }
        });

        return NextResponse.json({ status: "UPDATED", id: updated.id });
    } catch (e) {
        console.error("Ack Error:", e);
        return NextResponse.json({ error: "Internal Error" }, { status: 500 });
    }
}
