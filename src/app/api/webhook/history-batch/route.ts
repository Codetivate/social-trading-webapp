
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
    try {
        // 1. Auth Check (Server-to-Server)
        const secret = req.headers.get("x-bridge-secret");
        const userId = req.headers.get("x-user-id");

        if (secret !== process.env.BROKER_SECRET || !userId) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
        }

        const body = await req.json();
        const { history, masterId } = body;

        if (!Array.isArray(history)) {
            return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
        }

        // 2. Find Broker Account
        const brokerAccount = await prisma.brokerAccount.findFirst({
            where: { userId: userId, status: "CONNECTED" },
            select: { id: true, totalDeposits: true, totalWithdrawals: true }
        });

        if (!brokerAccount) {
            return NextResponse.json({ error: "No Broker Account" }, { status: 404 });
        }

        let addedDeposits = 0;
        let addedWithdrawals = 0;

        // 3. Upsert Logic
        // We use a transaction or parallel promises
        const ops = history.map(async (h: any) => {
            // Calculate Totals Accumulation (Simple heuristic: if this deal is NEW, add to total)
            // But 'upsert' makes it hard to know if it's new without a double-check.
            // Given this is a 'Sync' (idempotent), calculating totals incrementally is risky if run multiple times.
            // BETTER STRATEGY: Upsert all, THEN run an aggregation query to set the totals accurately.

            // Map fields
            let openPrice = h.price;
            let closePrice = h.price;
            let openTime = new Date(h.time * 1000);
            let closeTime = new Date(h.time * 1000);

            // Prepare Data
            return prisma.tradeHistory.upsert({
                where: {
                    // Composite ID check? Ideally we have unique constraint on Ticket+Deal?
                    // Currently schema only has ID. We use custom ID convention or search.
                    // Let's rely on `id` field being `hist_<ticket>_<deal>`.
                    id: `hist_${h.ticket}_${h.deal}`
                },
                update: {
                    profit: h.profit,
                    swap: h.swap,
                    commission: h.commission,
                    netProfit: h.profit + h.swap + h.commission
                },
                create: {
                    id: `hist_${h.ticket}_${h.deal}`,
                    followerId: userId, // It's the User's history
                    masterId: masterId || "SELF",
                    brokerAccountId: brokerAccount.id,
                    symbol: h.symbol,
                    ticket: h.ticket,
                    deal: h.deal,
                    type: h.type, // BUY, SELL, DEPOSIT, WITHDRAWAL
                    volume: h.volume,
                    openPrice: openPrice,
                    closePrice: closePrice,
                    openTime: openTime,
                    closeTime: closeTime,
                    profit: h.profit,
                    swap: h.swap,
                    commission: h.commission,
                    netProfit: h.profit + h.swap + h.commission,
                    magic: h.magic ? parseInt(h.magic) : 0,
                    comment: h.comment
                }
            });
        });

        await Promise.all(ops);

        // 4. Update Totals (Aggregation for Accuracy)
        // This ensures that even if we sync 10 times, the total is correct.
        const agg = await prisma.tradeHistory.groupBy({
            by: ['type'],
            where: {
                brokerAccountId: brokerAccount.id,
                type: { in: ['DEPOSIT', 'WITHDRAWAL'] }
            },
            _sum: {
                profit: true
            }
        });

        let newTotalDeposits = 0;
        let newTotalWithdrawals = 0;

        agg.forEach(group => {
            if (group.type === 'DEPOSIT') newTotalDeposits = group._sum.profit || 0;
            if (group.type === 'WITHDRAWAL') newTotalWithdrawals = group._sum.profit || 0;
        });

        await prisma.brokerAccount.update({
            where: { id: brokerAccount.id },
            data: {
                totalDeposits: newTotalDeposits,
                totalWithdrawals: Math.abs(newTotalWithdrawals) // Store as positive magnitude usually, or keep negative?
                // Standard convention: Withdrawals are negative in profit, but "Total Withdrawals" usually implies magnitude.
                // Let's store absolute value for 'Total Withdrawals' if intended for display "Total Withdrawn: $5000".
                // User asked for "deposite and withdral total".
            }
        });

        console.log(`[HISTORY] Batch Processed. Deps: ${newTotalDeposits}, Wds: ${newTotalWithdrawals}`);

        return NextResponse.json({ count: history.length });
    } catch (e) {
        console.error("History Batch Error:", e);
        return NextResponse.json({ error: String(e) }, { status: 500 });
    }
}
