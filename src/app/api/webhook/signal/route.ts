import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { SmartRouter, SignalPayload } from "@/lib/smart-router";
import * as fs from 'fs';

// 🔐 Secret Key for the Python Bridge (Match with broadcaster.py)
// 🔐 Secret Key for the Python Bridge (Match with broadcaster.py)
const BRIDGE_SECRET = process.env.BROKER_SECRET || "AlphaBravoCharlieDeltaEchoFoxtro";

export async function POST(req: NextRequest) {
    try {
        // 1. Authenticate the Bridge
        const secret = req.headers.get("x-bridge-secret");
        if (secret !== BRIDGE_SECRET) {
            return NextResponse.json({ error: "Unauthorized Bridge" }, { status: 401 });
        }

        const body: SignalPayload = await req.json();
        fs.appendFileSync('debug.log', `[Webhook] Signal Recv: ${JSON.stringify(body)}\n`);
        console.log(`[Webhook] 📥 Received Signal:`, JSON.stringify(body));
        const { masterId, ticket, symbol, action } = body;

        // 2. Pass to Smart Router (Fire and Forget or Await?)
        // Awaiting ensures we catch initial errors, but might slow down the bridge.
        // For sub-second latency, we should probably fire-and-forget or offload to a queue.
        // For MVP, we await to see logs.
        await SmartRouter.dispatch(body);

        return NextResponse.json({ status: "ACK", ticket });

    } catch (error: any) {
        fs.appendFileSync('debug.log', `[Webhook] ❌ Signal Processing Error: ${error?.message}\n${error?.stack}\n`);
        console.error("Signal Processing Error:", error);
        return NextResponse.json({ error: "Internal Error" }, { status: 500 });
    }
}
