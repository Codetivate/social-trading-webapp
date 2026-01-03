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
        const {
            followerId, masterId,
            ticket, symbol, type, volume,
            openPrice, closePrice,
            openTime, closeTime,
            profit, commission, swap
        } = body;

        console.log(`[Analytics] 💰 Trade Result for ${followerId}: ${profit > 0 ? 'Win' : 'Loss'} (${profit})`);

        // Calculate Net Profit
        const netProfit = (profit || 0) + (commission || 0) + (swap || 0);

        // 🔗 RESOLVE MASTER USER ID & SHADOW EQUITY
        let realMasterUserId = masterId || "UNKNOWN";

        // Try to find the original Signal to link Master User ID correctly
        const originalSignal = await prisma.signal.findFirst({
            where: {
                followerId: followerId,
                executedTicket: String(ticket) // Link via Follower Ticket
            }
        });

        if (originalSignal) {
            realMasterUserId = originalSignal.masterId; // ✅ Correct User ID

            // 🏦 UPDATE SHADOW EQUITY
            await prisma.copySession.updateMany({
                where: {
                    followerId: followerId,
                    masterId: realMasterUserId,
                    isActive: true
                },
                data: {
                    currentEquity: { increment: netProfit } // ✅ Live Update
                }
            });
        }

        // Save to DB
        const trade = await prisma.tradeHistory.create({
            data: {
                followerId,
                masterId: realMasterUserId, // ✅ Storing User ID now
                ticket: String(ticket),
                symbol,
                type,
                volume: Number(volume),
                openPrice: Number(openPrice),
                closePrice: Number(closePrice),
                openTime: new Date(openTime * 1000), // MT5 sends unix timestamp
                closeTime: new Date(closeTime * 1000),
                profit: Number(profit),
                commission: Number(commission),
                swap: Number(swap),
                netProfit: Number(netProfit)
            }
        });

        // Optional: Update Follower Profile aggregation here?
        // Or do it in a separate job. For now just store the log.

        return NextResponse.json({ status: "OK", id: trade.id });
    } catch (e: any) {
        console.error("[Analytics] Error:", e);
        return NextResponse.json({ error: e.message }, { status: 500 });
    }
}
