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
    growth: number;
    longPercent: number;
    shortPercent: number;
    // 🆕 Advanced Metrics
    bestTrade: number;
    worstTrade: number;
    bestTradeDate: string;
    worstTradeDate: string;
    lastTradeDate: string;
    avgDuration: string;
    estDeposit: number;
    estWithdrawal: number;
    // 🆕 Account State
    balance: number;
    equity: number;
    tradesPerWeek: number;
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
    growth: number;
    drawdown: number;
};

export type SymbolDistribution = {
    symbol: string;
    count: number;
    percentage: number;
};

export async function getAnalytics(masterId: string, startDate?: Date, endDate?: Date) {
    if (!masterId) return null;

    try {
        // Build Date Filter
        const dateFilter: any = {};
        if (startDate) dateFilter.gte = startDate;
        if (endDate) dateFilter.lte = endDate;

        // Fetch all trade history for this master (Self-Traded)
        const trades = await prisma.tradeHistory.findMany({
            where: {
                followerId: masterId, // Master's own record
                profit: { not: 0 }, // Exclude zero/cancel trades? optional
                closeTime: Object.keys(dateFilter).length > 0 ? dateFilter : undefined
            },
            orderBy: { closeTime: 'asc' }
        });

        // 🏦 Fetch Current Balance for Growth/DD Calc
        const account = await prisma.brokerAccount.findFirst({
            where: { userId: masterId },
            select: { balance: true, equity: true }
        });
        // Approx End Balance. If no account, assume $10,000 baseline
        const endBalance = account?.balance || 10000;

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
                    maxDrawdown: 0,
                    growth: 0,
                    longPercent: 0,
                    shortPercent: 0,
                    bestTrade: 0,
                    worstTrade: 0,
                    bestTradeDate: "-",
                    worstTradeDate: "-",
                    lastTradeDate: "-",
                    avgDuration: "0m",
                    estDeposit: 0,
                    estWithdrawal: 0,
                    balance: 0,
                    equity: 0,
                    tradesPerWeek: 0
                },
                equityCurve: [],
                monthlyResults: [],
                symbolDist: [],
                history: []
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

        const longTrades = trades.filter(t => t.type === "BUY" || t.type === "0").length;
        const shortTrades = trades.filter(t => t.type === "SELL" || t.type === "1").length;
        const totalCount = trades.length;

        // --- SHARPE RATIO CALCULATION (Annualized) ---
        // 1. Group by Day
        const dailyReturns: number[] = [];
        const dailyPnL = new Map<string, number>();

        trades.forEach(t => {
            const day = t.closeTime.toISOString().split('T')[0];
            dailyPnL.set(day, (dailyPnL.get(day) || 0) + t.netProfit);
        });

        // 2. Calculate Daily Returns (%)
        // Simplified: Assuming a fix base equity (e.g. $1000) or cumulative. 
        // For Sharpe, we need percentage returns. 
        // Let's approximate using a base of $1000 + cumulative profit.
        let runningEquity = 1000;

        Array.from(dailyPnL.entries()).sort().forEach(([_, pnl]) => {
            const prevEquity = runningEquity;
            runningEquity += pnl;
            if (prevEquity > 0) {
                const ret = (pnl / prevEquity); // Simple return
                dailyReturns.push(ret);
            }
        });

        let sharpe = 0;
        if (dailyReturns.length > 1) {
            const meanReturn = dailyReturns.reduce((a, b) => a + b, 0) / dailyReturns.length;
            const variance = dailyReturns.reduce((a, b) => a + Math.pow(b - meanReturn, 2), 0) / (dailyReturns.length - 1);
            const stdDev = Math.sqrt(variance);

            // Annualize ( Crypto 365 or Forex 252? Let's use 252 for standard trading days)
            if (stdDev > 0) {
                sharpe = (meanReturn / stdDev) * Math.sqrt(252);
            }
        }

        const totalProfit = totalWinAmt - totalLossAmt;
        const startBalance = endBalance - totalProfit;
        const growth = startBalance > 0 ? (totalProfit / startBalance) * 100 : 0;

        // 🆕 CALC ADVANCED METRICS
        const sortedByProfit = [...trades].sort((a, b) => b.netProfit - a.netProfit);
        const bestTradeObj = sortedByProfit[0];
        const worstTradeObj = sortedByProfit[sortedByProfit.length - 1];

        const lastTradeObj = trades[trades.length - 1]; // Already sorted asc by time

        // Duration
        const totalDurationMs = trades.reduce((acc, t) => acc + (t.closeTime.getTime() - t.openTime.getTime()), 0);
        const avgDurMs = totalDurationMs / trades.length;
        const avgDurHours = Math.floor(avgDurMs / (1000 * 60 * 60));
        const avgDurMins = Math.round((avgDurMs % (1000 * 60 * 60)) / (1000 * 60));
        const avgDurationStr = `${avgDurHours}h ${avgDurMins}m`;

        // Trades per Week
        const firstTrade = trades[0];
        const lastTrade = trades[trades.length - 1];
        let weeksActive = 1;
        if (firstTrade && lastTrade) {
            const diffMs = lastTrade.closeTime.getTime() - firstTrade.closeTime.getTime();
            weeksActive = Math.max(1, diffMs / (1000 * 60 * 60 * 24 * 7));
        }
        const tradesPerWeek = totalCount / weeksActive;

        const stats: AnalyticStats = {
            totalTrades: totalCount,
            tradesPerWeek, // 🆕 Added
            winRate: (wins.length / totalCount) * 100,
            avgWin,
            avgLoss: -avgLoss, // Display as negative
            profitFactor: totalLossAmt > 0 ? totalWinAmt / totalLossAmt : totalWinAmt > 0 ? 999 : 0,
            rrr: avgLoss > 0 ? avgWin / avgLoss : 0,
            sharpe: sharpe,
            expectancy,
            totalProfit,
            maxDrawdown: 0, // Placeholder
            growth,
            longPercent: totalCount > 0 ? (longTrades / totalCount) * 100 : 0,
            shortPercent: totalCount > 0 ? (shortTrades / totalCount) * 100 : 0,
            // 🆕 New Fields
            bestTrade: bestTradeObj ? bestTradeObj.netProfit : 0,
            worstTrade: worstTradeObj ? worstTradeObj.netProfit : 0,
            bestTradeDate: bestTradeObj ? bestTradeObj.closeTime.toISOString().split('T')[0] : "-",
            worstTradeDate: worstTradeObj ? worstTradeObj.closeTime.toISOString().split('T')[0] : "-",
            lastTradeDate: lastTradeObj ? lastTradeObj.closeTime.toISOString() : "-", // Full ISO for "ago" calc
            avgDuration: avgDurationStr,
            estDeposit: startBalance > 0 ? startBalance : 0, // Assumption
            estWithdrawal: 0, // Placeholder until Transaction Integration
            // 🆕 Account State
            balance: account?.balance || 0,
            equity: account?.equity || 0
        };

        // --- 2. EQUITY CURVE & MAX DRAWDOWN (%) ---
        let runningPnL = 0;
        let ddEquity = startBalance;
        let ddPeakEquity = startBalance;
        let maxDDPercent = 0;
        const equityCurve: EquityPoint[] = [];

        trades.forEach(t => {
            runningPnL += t.netProfit;
            ddEquity += t.netProfit;

            if (ddEquity > ddPeakEquity) ddPeakEquity = ddEquity;

            const dd = ddPeakEquity - ddEquity;
            const ddPercent = ddPeakEquity > 0 ? (dd / ddPeakEquity) * 100 : 0;

            if (ddPercent > maxDDPercent) maxDDPercent = ddPercent;

            const currentGrowth = startBalance > 0 ? (runningPnL / startBalance) * 100 : 0;

            equityCurve.push({
                date: t.closeTime.toISOString().split('T')[0],
                profit: runningPnL, // Keep curve as PnL for display consistency
                growth: currentGrowth,
                drawdown: ddPercent
            });
        });

        stats.maxDrawdown = maxDDPercent;

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
            symbolDist,
            history: trades
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

// 👁️ TRACK SEARCH TERM
export async function trackSearch(term: string) {
    if (!term || term.length < 2) return;

    try {
        const sanitizedTerm = term.trim().toLowerCase();

        await prisma.searchQuery.upsert({
            where: { term: sanitizedTerm },
            update: {
                count: { increment: 1 },
                updatedAt: new Date()
            },
            create: {
                term: sanitizedTerm,
                count: 1
            }
        });
    } catch (error) {
        console.error("Search Tracking Error:", error);
        // Fail silently - analytics should not break the app
    }
}
