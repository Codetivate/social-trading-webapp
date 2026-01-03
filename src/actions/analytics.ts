"use server";

import { prisma } from "@/lib/prisma";

export async function getAnalytics(userId: string) {
    if (!userId) return null;

    // 1. Fetch Equity Snapshots (Last 30 days)
    const snapshots = await prisma.equitySnapshot.findMany({
        where: { userId },
        orderBy: { timestamp: "asc" },
        // take: 100 // Limit for chart performance?
    });

    // 2. Fetch Trade History (All Time)
    const trades = await prisma.tradeHistory.findMany({
        where: {
            // OR master or follower? For now assuming we look at Master or Follower specifically
            OR: [
                { masterId: userId },
                { followerId: userId }
            ]
        },
        orderBy: { closeTime: "asc" }
    });

    // 3. Calculate Stats
    const totalTrades = trades.length;
    const wins = trades.filter(t => t.netProfit > 0).length;
    const winRate = totalTrades > 0 ? (wins / totalTrades) * 100 : 0;

    const totalProfit = trades.reduce((sum, t) => sum + t.netProfit, 0);

    // Initial Balance (Approximation from first snapshot or trade)
    const initialBalance = snapshots.length > 0 ? snapshots[0].balance : 0;
    const currentEquity = snapshots.length > 0 ? snapshots[snapshots.length - 1].equity : 0;

    // ROI
    const roi = initialBalance > 0 ? ((currentEquity - initialBalance) / initialBalance) * 100 : 0;

    // Drawdown (Simplified: Peak - Current) / Peak
    let peak = 0;
    let maxDrawdown = 0;

    for (const snap of snapshots) {
        if (snap.equity > peak) peak = snap.equity;
        const dd = peak > 0 ? (peak - snap.equity) / peak : 0;
        if (dd > maxDrawdown) maxDrawdown = dd;
    }

    return {
        snapshots: snapshots.map(s => ({
            time: s.timestamp.toISOString(),
            equity: s.equity,
            balance: s.balance
        })),
        trades: trades.map(t => ({
            id: t.id,
            symbol: t.symbol,
            profit: t.netProfit,
            time: t.closeTime.toISOString()
        })),
        stats: {
            winRate,
            totalProfit,
            roi,
            maxDrawdown: maxDrawdown * 100,
            equity: currentEquity,
            riskReward: (() => {
                const wins = trades.filter(t => t.netProfit > 0);
                const losses = trades.filter(t => t.netProfit < 0);
                const avgWin = wins.length > 0 ? wins.reduce((sum, t) => sum + t.netProfit, 0) / wins.length : 0;
                const avgLoss = losses.length > 0 ? Math.abs(losses.reduce((sum, t) => sum + t.netProfit, 0) / losses.length) : 0;
                return avgLoss > 0 ? parseFloat((avgWin / avgLoss).toFixed(2)) : 0;
            })()
        }
    };
}
