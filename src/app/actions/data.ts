"use server";

import { prisma } from "@/lib/prisma";
import { UserRole } from "@prisma/client";
import { Master } from "@/types";
import { unstable_noStore as noStore } from 'next/cache';

// 📥 FETCH MASTERS (Public)
export async function fetchMasters(): Promise<Master[]> {
    noStore(); // ⚡ Force Dynamic Fetch (No Cache)
    try {
        const masters = await prisma.masterProfile.findMany({
            where: {
                isPublic: true, // ✅ Filter Private Masters
                user: {
                    role: 'MASTER' // ✅ Filter Downgraded Masters
                }
            },
            include: {
                user: true,
                brokerAccount: true // ✅ Fetch Linked Broker Logic
            },
            orderBy: { followersCount: 'desc' }
        });

        return await Promise.all(masters.map(async m => {
            // 📊 Calc Stats from History
            let rr = 0; // Default N/A
            let roi = m.roi; // Default to DB value

            try {
                const trades = await prisma.tradeHistory.findMany({
                    where: { masterId: m.userId },
                    take: 200, // Limit to 200 for perf, but enough for recent stats
                    orderBy: { closeTime: 'desc' },
                    select: { netProfit: true }
                });

                if (trades.length > 0) {
                    const wins = trades.filter(t => t.netProfit > 0);
                    const losses = trades.filter(t => t.netProfit < 0);

                    const avgWin = wins.length > 0 ? wins.reduce((sum, t) => sum + t.netProfit, 0) / wins.length : 0;
                    const avgLoss = losses.length > 0 ? Math.abs(losses.reduce((sum, t) => sum + t.netProfit, 0) / losses.length) : 0;

                    if (avgLoss > 0) {
                        rr = parseFloat((avgWin / avgLoss).toFixed(2));
                    }

                    // 💰 Calc Dynamic ROI
                    // ROI = Total Profit / (Current Equity - Total Profit) * 100
                    // This assumes the Current Equity is the result of Starting + Profit.
                    if (m.brokerAccount?.equity) {
                        const totalProfit = trades.reduce((sum, t) => sum + t.netProfit, 0);
                        const currentEquity = m.brokerAccount.equity;
                        const originalEquity = currentEquity - totalProfit;

                        if (originalEquity > 0) {
                            roi = parseFloat(((totalProfit / originalEquity) * 100).toFixed(2));
                        }
                    }
                }
            } catch (e) { console.error("Stats Calc Error", e); }

            return {
                id: m.id,
                userId: m.userId,
                masterUserId: m.userId,
                name: m.name,
                type: "HUMAN",
                winRate: m.winRate,
                roi: roi, // ✅ Real ROI
                pnlText: "0%",
                followers: m.followersCount,
                aum: m.aum, // ✅ Mapped from DB
                balance: 0,
                risk: m.riskScore,
                drawdown: m.drawdown,
                profitFactor: 0,
                avatar: m.avatar || "/avatars/default.png",
                isVip: false,
                desc: m.desc || "",
                tags: m.tags,
                joined: new Date(m.createdAt).getFullYear().toString(),
                currentOrders: [],
                monthlyFee: m.monthlyFee,
                minDeposit: m.minDeposit,
                isPremium: m.monthlyFee > 0,
                isPublic: m.isPublic,
                leverage: (m.brokerAccount?.equity && m.brokerAccount.equity > 0) ? (m.brokerAccount.leverage || 0) : 0, // ✅ Show N/A if no equity synced
                riskReward: rr // ✅ Real DB RR
            };
        }));
    } catch (error) {
        console.error("Fetch Masters Error:", error);
        return [];
    }
}

// 📥 FETCH FOLLOWER (Private)
export async function fetchFollower(userId: string) {
    if (!userId) return null;
    try {
        const profile = await prisma.followerProfile.findUnique({
            where: { userId }
        });
        return profile;
    } catch (error) {
        return null;
    }
}

// 📥 HELPER: Get UserID by Name (Fallback for Mock/Stale IDs)
export async function getUserIdByName(name: string): Promise<string | null> {
    try {
        const master = await prisma.masterProfile.findFirst({
            where: { name: name },
            select: { userId: true }
        });
        return master?.userId || null;
    } catch (e) {
        return null;
    }
}

// 📥 FETCH USER ROLE (Private)
export async function fetchUserRole(userId: string): Promise<UserRole | null> {
    if (!userId) return null;
    try {
        const user = await prisma.user.findUnique({
            where: { id: userId },
            select: { role: true }
        });
        return user?.role || null;
    } catch (error) {
        return null;
    }
}
