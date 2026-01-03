import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

const BRIDGE_SECRET = process.env.BROKER_SECRET || "AlphaBravoCharlieDeltaEchoFoxtro";

export async function POST(req: NextRequest) {
    const secret = req.headers.get("x-bridge-secret");
    if (secret !== BRIDGE_SECRET) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    try {
        const body = await req.json();
        const { userId, balance, equity } = body;

        console.log(`[Analytics] 📈 Equity Snap for ${userId}: $${equity}`);

        // 1. Save Snapshot
        await prisma.equitySnapshot.create({
            data: {
                userId, // Master's User ID
                balance: Number(balance),
                equity: Number(equity)
            }
        });

        // 2. Update Master Stats (Simple Calculation)
        // ROI = ((Equity - InitialBalance) / InitialBalance) * 100?
        // For now, we just update the MasterProfile 'aum' (Assets Under Management ~ Equity)
        // and maybe calculating drawdown if we had history.

        // Let's check for existing MasterProfile
        const profile = await prisma.masterProfile.findUnique({
            where: { userId }
        });

        if (profile) {
            // Update AUM
            await prisma.masterProfile.update({
                where: { userId },
                data: {
                    aum: Number(equity),
                    // We could update max drawdown here if we tracked peak equity
                }
            });
        }

        return NextResponse.json({ status: "OK" });
    } catch (e: any) {
        console.error("[Analytics] Error:", e);
        return NextResponse.json({ error: e.message }, { status: 500 });
    }
}
