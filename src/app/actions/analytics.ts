"use server";

import { prisma } from "@/lib/prisma";
import { startOfMonth, format } from "date-fns";

export type AnalyticStats = {
    totalTrades: number;
    winRate: number;
    avgWin: number;
    avgLoss: number;
    profitFactor: number;
    rrr: number;
    sharpe: number;
    expectancy: number;
    totalProfit: number;
    maxDrawdown: number;
};

export type MonthlyResult = {
    month: string;
    profit: number;
    trades: number;
    winRate: number;
};

export type EquityPoint = {
    date: string; // ISO date
    profit: number; // Cumulative PnL
};

export type SymbolDistribution = {
    symbol: string;
    count: number;
    percentage: number;
};

export async function getAnalytics(masterId: string) {
    if (!masterId) return null;

    try {
        // Fetch all trade history for this master (Self-Traded)
        const trades = await prisma.tradeHistory.findMany({
            where: {
                followerId: masterId, // Master's own record
                profit: { not: 0 } // Exclude zero/cancel trades? optional
            },
            orderBy: { closeTime: 'asc' }
        });

        if (trades.length === 0) {
            return {
                stats: {
                    totalTrades: 0,
                    winRate: 0,
                    avgWin: 0,
                    avgLoss: 0,
                    profitFactor: 0,
                    rrr: 0,
                    sharpe: 0,
                    expectancy: 0,
                    totalProfit: 0,
                    maxDrawdown: 0
                },
                equityCurve: [],
                monthlyResults: [],
                symbolDist: []
            };
        }

        // --- 1. BASIC STATS ---
        const wins = trades.filter(t => t.netProfit > 0);
        const losses = trades.filter(t => t.netProfit <= 0);

        const totalWinAmt = wins.reduce((sum, t) => sum + t.netProfit, 0);
        const totalLossAmt = Math.abs(losses.reduce((sum, t) => sum + t.netProfit, 0));

        const avgWin = wins.length > 0 ? totalWinAmt / wins.length : 0;
        const avgLoss = losses.length > 0 ? totalLossAmt / losses.length : 0; // Absolute value

        // Expectancy = (Win% * AvgWin) - (Loss% * AvgLoss)
        const winProb = wins.length / trades.length;
        const lossProb = losses.length / trades.length;
        const expectancy = (winProb * avgWin) - (lossProb * avgLoss);

        const stats: AnalyticStats = {
            totalTrades: trades.length,
            winRate: (wins.length / trades.length) * 100,
            avgWin,
            avgLoss: -avgLoss, // Display as negative
            profitFactor: totalLossAmt > 0 ? totalWinAmt / totalLossAmt : totalWinAmt > 0 ? 999 : 0,
            rrr: avgLoss > 0 ? avgWin / avgLoss : 0,
            sharpe: 0, // Placeholder
            expectancy,
            totalProfit: totalWinAmt - totalLossAmt,
            maxDrawdown: 0 // Need equity curve
        };

        // --- 2. EQUITY CURVE & MAX DRAWDOWN ---
        let runningPnL = 0;
        let peakPnL = -Infinity;
        let maxDD = 0;
        const equityCurve: EquityPoint[] = [];

        trades.forEach(t => {
            runningPnL += t.netProfit;
            if (runningPnL > peakPnL) peakPnL = runningPnL;
            const dd = peakPnL - runningPnL;
            if (dd > maxDD) maxDD = dd;

            equityCurve.push({
                date: t.closeTime.toISOString().split('T')[0],
                profit: runningPnL
            });
        });

        stats.maxDrawdown = maxDD;

        // --- 3. MONTHLY BREAKDOWN ---
        const monthMap = new Map<string, MonthlyResult>();

        trades.forEach(t => {
            // Format: "YYYY-MM"
            const monthKey = t.closeTime.toISOString().slice(0, 7);
            if (!monthMap.has(monthKey)) {
                monthMap.set(monthKey, { month: monthKey, profit: 0, trades: 0, winRate: 0 });
            }
            const m = monthMap.get(monthKey)!;
            m.profit += t.netProfit;
            m.trades += 1;
            if (t.netProfit > 0) m.winRate += 1; // Count wins temporarily
        });

        const monthlyResults = Array.from(monthMap.values()).map(m => ({
            ...m,
            winRate: (m.winRate / m.trades) * 100
        })).sort((a, b) => a.month.localeCompare(b.month));

        // --- 4. SYMBOL DISTRIBUTION ---
        const symbolMap = new Map<string, number>();
        trades.forEach(t => {
            const sym = t.symbol.split('.')[0]; // Clean symbol (e.g., EURUSD.pro -> EURUSD)
            symbolMap.set(sym, (symbolMap.get(sym) || 0) + 1);
        });

        const sortedSymbols = Array.from(symbolMap.entries())
            .sort((a, b) => b[1] - a[1]) // Descending
            .slice(0, 5); // Top 5

        const symbolDist: SymbolDistribution[] = sortedSymbols.map(([sym, count]) => ({
            symbol: sym,
            count,
            percentage: (count / trades.length) * 100
        }));

        return {
            stats,
            equityCurve,
            monthlyResults,
            symbolDist
        };

    } catch (error) {
        console.error("Analytics Error:", error);
        return null;
    }
}

export async function getTradeHistory(masterId: string, limit = 50) {
    if (!masterId) return [];
    try {
        return await prisma.tradeHistory.findMany({
            where: { followerId: masterId },
            orderBy: { closeTime: 'desc' },
            take: limit
        });
    } catch (error) {
        console.error("History Error:", error);
        return [];
    }
}
