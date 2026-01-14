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
            ticket,         // Follower Ticket (executed)
            followerId,
            masterId,
            masterTicket,   // Master Ticket (link)
            symbol,
            type,
            action,         // OPEN, CLOSE, MODIFY
            volume,
            price,          // Execution Price
            profit,
            commission,
            swap,
            openPrice,
            openTime,
            closePrice,
            closeTime,
            status,
            message
        } = body;

        console.log(`[Webhook] 📥 Execution Report for ${followerId}: ${action} ${symbol} -> ${status}`);

        // 1. UPDATE SIGNAL STATUS
        // We try to find the match PENDING signal to mark it as EXECUTED
        // We match by followerId, masterTicket, and action (approximate) due to potential race conditions
        // or just update based on masterTicket + Last Created?

        let signalUpdateCount = 0;

        // Find the most recent PENDING signal for this ticket/action
        // Note: For CLOSE, there might be a specific CLOSE signal waiting.
        const pendingSignal = await prisma.signal.findFirst({
            where: {
                followerId: followerId,
                ticket: String(masterTicket),
                action: action,
                status: "PENDING"
            },
            orderBy: { createdAt: 'desc' }
        });

        if (pendingSignal) {
            await prisma.signal.update({
                where: { id: pendingSignal.id },
                data: {
                    status: (status === 'FILLED') ? "EXECUTED" : "FAILED",
                    executedTicket: String(ticket), // Update Follower Ticket
                    errorMessage: message,
                    price: Number(price) // Update Execution Price
                }
            });
            signalUpdateCount = 1;
        } else {
            console.log(`[Webhook] ⚠️ No PENDING signal found for ${action} ${masterTicket}. Might be already processed.`);
        }

        // 2. HANDLE CLOSE -> TRADE HISTORY
        let tradeId = null;
        // 🛡️ GUARD: Only create History for VALID tickets.
        // Ignore "Already Closed" (Ticket 0) or Failed trades.
        if (action === 'CLOSE' && status === 'FILLED' && ticket && ticket !== "0") {
            // Calculate Net Profit
            const netProfit = (Number(profit) || 0) + (Number(commission) || 0) + (Number(swap) || 0);

            // Create History
            const trade = await prisma.tradeHistory.create({
                data: {
                    followerId,
                    masterId: masterId || "UNKNOWN",
                    ticket: String(ticket), // Follower Ticket
                    symbol,
                    type, // BUY or SELL
                    volume: Number(volume),
                    openPrice: Number(openPrice) || 0,
                    closePrice: Number(closePrice) || Number(price),
                    openTime: openTime ? new Date(openTime * 1000) : new Date(),
                    closeTime: closeTime ? new Date(closeTime * 1000) : new Date(),
                    profit: Number(profit),
                    commission: Number(commission),
                    swap: Number(swap),
                    netProfit: Number(netProfit),
                    comment: message
                }
            });
            tradeId = trade.id;
            console.log(`[Webhook] ✅ Trade History Created: ${tradeId} | Ticket: ${ticket} | PnL: ${netProfit}`);

            // 3. UPDATE SHADOW EQUITY (Real-Time PnL Tracking)
            if (masterId) {
                await prisma.copySession.updateMany({
                    where: {
                        followerId: followerId,
                        masterId: masterId,
                        isActive: true
                    },
                    data: {
                        currentEquity: { increment: netProfit }
                    }
                });
            }
        } else if (action === 'CLOSE' && ticket === "0") {
            console.log(`[Webhook] ⚠️ Skipped TradeHistory: 'Already Closed' event (Ticket 0).`);
        }

        return NextResponse.json({
            status: "OK",
            updatedSignal: signalUpdateCount > 0,
            tradeHistoryId: tradeId
        });

    } catch (e: any) {
        console.error("[Webhook] ❌ Error processing execution:", e);
        return NextResponse.json({ error: e.message }, { status: 500 });
    }
}
