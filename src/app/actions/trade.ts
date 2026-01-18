"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { SessionType } from "@prisma/client";
import { redis } from "@/lib/redis";

export async function startCopySession(
    followerId: string,
    masterUserId: string,
    amount: number,
    risk: number,
    type: SessionType,
    autoRenew: boolean = true, // ⚙️ Default Auto-Recopy
    timeConfig: any = null,    // 🕒 Trading Hours (JSON)
    dailyLoss?: number, // 🛡️ Daily Loss Limit
    minEquity?: number, // 🛡️ Hard Stop Equity
    invertCopy: boolean = false // 🔄 Invert Copy
) {
    if (!followerId || !masterUserId) return { success: false, error: "Invalid IDs" };
    if (amount <= 0) return { success: false, error: "Invalid amount" };

    console.log("🚀 startCopySession CALLED");
    console.log("   -> Type:", type);
    console.log("   -> TimeConfig (Raw):", JSON.stringify(timeConfig, null, 2));

    try {
        // 🔍 FILE LOGGING DEBUG
        let fs: any;
        try { fs = require('fs'); } catch { };
        if (fs) {
            const logData = `[${new Date().toISOString()}] startCopySession\nType: ${type}\nTimeConfig: ${JSON.stringify(timeConfig)}\n-------------------\n`;
            try { fs.appendFileSync('debug_trade.log', logData); } catch (e) { console.error("Log failed", e); }
        }

        const result = await prisma.$transaction(async (tx) => {
            // 1. Check Follower (Wallet Check Disabled)
            const follower = await tx.user.findUnique({ where: { id: followerId } });
            if (!follower) throw new Error("Follower not found");

            // 1.5 Fetch Master Profile for Tier Check ⚡
            const masterUser = await tx.user.findUnique({
                where: { id: masterUserId },
                include: { masterProfile: true }
            });
            if (!masterUser || !masterUser.masterProfile) throw new Error("Master not found");

            const masterTier = masterUser.masterProfile.tier; // ROOKIE, PRO, TYCOON

            // ⛔ Constraint: Standard Ticket (Daily) cannot follow Paid Masters
            if (type === "DAILY" && masterUser.masterProfile.monthlyFee > 0) {
                throw new Error("Standard Ticket is for Free Masters only. Please subscribe to copy this Master.");
            }

            // 🏎️ DYNAMIC ALLOCATION LOGIC
            // Money buys Speed.
            const isPaidSession = type === "PAID";
            const isTrial = type === "TRIAL_7DAY"; // Hook them with speed
            const isPremiumMaster = masterTier === "PRO" || masterTier === "TYCOON";

            const lane = (isPaidSession || isTrial || isPremiumMaster)
                ? "TURBO"
                : "STANDARD";

            // 2. Financial Logic (Wallet Deduction) 💳
            // "deduct the money from the card" (Simulated via Wallet Balance)

            let totalCost = amount; // Base Allocation
            let fee = 0;

            // Add Monthly Fee if Paid Session
            if (type === "PAID" && masterUser.masterProfile.monthlyFee > 0) {
                fee = masterUser.masterProfile.monthlyFee;
                totalCost += fee;
            }

            // Check Balance
            if (follower.walletBalance < totalCost) {
                // 🛡️ DISABLED: Strict Funds Check (User Request)
                // throw new Error(`Insufficient funds. Required: $${totalCost.toFixed(2)} (Alloc: $${amount} + Fee: $${fee})`);
                console.warn(`[TEST MODE] Insufficient funds ignored. Required: $${totalCost.toFixed(2)}`);
            }

            // Deduct
            await tx.user.update({
                where: { id: followerId },
                data: { walletBalance: { decrement: totalCost } }
            });

            // 3. Create OR Reactivate Copy Session
            // User: "if the users resubscribed... update back the status isActive to be true"
            // We check for an existing INACTIVE session to reactivate, preserving history/settings?
            // Or just create new?
            // Strategy: Upsert-like behavior. If exists, Update. If not, Create.
            // Actually, `create` is safer for simple logic, but to satisfy "update back", let's try to reuse if ID matches?
            // For now, standard flow is: New Session ID = New Subscription.
            // But let's check if we have a very recent inactive one? 
            // Stick to Creation for robustness unless explicitly asked to Merge. 
            // *Wait*, User said "update back the status".
            // Let's Find ANY session for this master/follower pair.

            const existingSession = await tx.copySession.findFirst({
                where: {
                    followerId: followerId,
                    masterId: masterUserId,
                    // We don't filter by isActive: true here because we want to see if we can revive one.
                },
                orderBy: { createdAt: 'desc' } // Get latest
            });

            let session;

            if (existingSession) {
                if (existingSession.isActive) {
                    return { success: false, error: "You are already copying this master." };
                }

                // REACTIVATE ⚡
                // Update the *existing* session
                session = await tx.copySession.update({
                    where: { id: existingSession.id },
                    data: {
                        isActive: true,
                        allocation: amount, // Update alloc
                        currentEquity: amount, // Reset equity tracking
                        riskFactor: risk,
                        type: type,
                        executionLane: lane,
                        autoRenew: autoRenew,
                        timeConfig: timeConfig ?? existingSession.timeConfig, // Keep old config if null passed? Or overwrite? 
                        invertCopy: invertCopy, // ✅ Update Invert Mode
                        // Usually Start args > Old args.

                        expiry: type === "DAILY" ? new Date(Date.now() + 10 * 365 * 24 * 60 * 60 * 1000) // 10 Years (Unlimited)
                            : type === "TRIAL_7DAY" ? new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
                                : type === "PAID" ? new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) // Paid = 30 Days default
                                    : null
                    }
                });
            } else {
                // CREATE NEW
                session = await tx.copySession.create({
                    data: {
                        followerId: followerId,
                        masterId: masterUserId,
                        allocation: amount,
                        currentEquity: amount,
                        riskFactor: risk,
                        type: type,
                        isActive: true,
                        executionLane: lane,
                        shardId: Math.floor(Math.random() * 10),
                        autoRenew: autoRenew,
                        timeConfig: timeConfig,
                        invertCopy: invertCopy, // ✅ Set Invert Mode
                        expiry: type === "DAILY" ? new Date(Date.now() + 10 * 365 * 24 * 60 * 60 * 1000) // 10 Years (Unlimited)
                            : type === "TRIAL_7DAY" ? new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
                                : type === "PAID" ? new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
                                    : null,
                    }
                });
            }

            // 5. 🎟️ DYNAMIC PROMOTION TRACKING
            if (type === "DAILY") {
                // Update or Create the single UserPromotion record
                await tx.userPromotion.upsert({
                    where: { userId: followerId },
                    update: { dailyUsed: true, dailyActivated: new Date() },
                    create: { userId: followerId, dailyUsed: true, dailyActivated: new Date() }
                });
            } else if (type === "TRIAL_7DAY") {
                await tx.userPromotion.upsert({
                    where: { userId: followerId },
                    update: { welcomeUsed: true, welcomeActivated: new Date() },
                    create: { userId: followerId, welcomeUsed: true, welcomeActivated: new Date() }
                });
            }
            // VIP is typically handled by subscription purchase, but we could track usage/expiry here if needed.

            // 6. Create Audit/Transaction Record for Follower
            await tx.transaction.create({
                data: {
                    userId: followerId,
                    type: "SUBSCRIPTION_PAYMENT", // or DEPOSIT/INVESTMENT
                    amount: -amount,
                    description: `Allocated to Master ${masterUserId}`,
                    status: "COMPLETED"
                }
            });

            // 6. SELF-HEALING STATS: Recalculate true count to prevent drift
            const trueCount = await tx.copySession.count({
                where: { masterId: masterUserId, isActive: true }
            });

            const trueAum = await tx.copySession.aggregate({
                where: {
                    masterId: masterUserId,
                    isActive: true,
                    followerId: { not: masterUserId } // 🛡️ Exclude Self-Investment
                },
                _sum: { allocation: true }
            });

            // Update Master Profile with Truth
            await tx.masterProfile.update({
                where: { userId: masterUserId },
                data: {
                    followersCount: trueCount,
                    aum: trueAum._sum.allocation || 0
                }
            });

            return session;
        });

        revalidatePath("/"); // Refresh dashboard
        return { success: true, data: result };

    } catch (error: any) {
        console.error("Copy Session Error:", error);
        return { success: false, error: error.message || "Failed to start copying" };
    }
}

export async function getActiveSessions(userId: string) {
    if (!userId) return [];

    try {
        const sessions = await prisma.copySession.findMany({
            where: { followerId: userId, isActive: true },
            include: {
                master: {
                    include: { masterProfile: true }
                }
            }
        });

        return await Promise.all(sessions.map(async s => {
            const mp = s.master.masterProfile;

            // 📊 PnL from Shadow Equity
            const realizedPnl = (s.currentEquity || s.allocation) - s.allocation;

            return {
                id: s.id,
                master: {
                    id: mp?.id || 0,
                    userId: s.masterId,
                    name: mp?.name || s.master.name || "Unknown Master",
                    type: "HUMAN",
                    winRate: mp?.winRate || 0,
                    roi: mp?.roi || 0,
                    pnlText: "0%",
                    followers: mp?.followersCount || 0,
                    balance: 0,
                    risk: mp?.riskScore || 0,
                    drawdown: mp?.drawdown || 0,
                    profitFactor: 0,
                    avatar: mp?.avatar || "/avatars/default.png",
                    isVip: false,
                    desc: mp?.desc || "",
                    tags: mp?.tags || [],
                    joined: new Date(mp?.createdAt || Date.now()).getFullYear().toString(),
                    currentOrders: [],
                    monthlyFee: mp?.monthlyFee || 0,
                    isPremium: (mp?.monthlyFee || 0) > 0
                },
                allocation: s.allocation,
                risk: s.riskFactor,
                startTime: s.createdAt.getTime(),
                pnl: realizedPnl, // ✅ Realized PnL
                orders: [],
                isTrial: s.isTrial,
                type: s.type,
                expiry: s.expiry ? s.expiry.getTime() : null,
                // ✅ Settings
                autoRenew: s.autoRenew,
                invertCopy: s.invertCopy,
                timeConfig: s.timeConfig
            };
        }));
    } catch (e) {
        console.error("Failed to fetch sessions:", e);
        return [];
    }
}

export async function stopCopySession(sessionId: number) {
    console.log("🛑 Server Action: stopCopySession called for ID:", sessionId);
    try {
        const result = await prisma.$transaction(async (tx) => {
            // 1. Get Session & Master ID
            const session = await tx.copySession.findUnique({
                where: { id: sessionId },
                include: { master: { include: { masterProfile: true } } }
            });

            if (!session || !session.isActive) return { error: "Session not found or already inactive" };

            // 2. Mark as Inactive
            const updatedSession = await tx.copySession.update({
                where: { id: sessionId },
                data: { isActive: false }
            });

            // 3. SELF-HEALING STATS: Recalculate true count to prevent drift
            if (session.master.masterProfile) {
                // Count Active Sessions
                const trueCount = await tx.copySession.count({
                    where: { masterId: session.masterId, isActive: true }
                });

                // Sum Active Allocation
                const trueAum = await tx.copySession.aggregate({
                    where: {
                        masterId: session.masterId,
                        isActive: true,
                        followerId: { not: session.masterId } // 🛡️ Exclude Self-Investment
                    },
                    _sum: { allocation: true }
                });

                // Update Master Profile with Truth
                await tx.masterProfile.update({
                    where: { id: session.master.masterProfile.id },
                    data: {
                        followersCount: trueCount, // ✅ Sets to exact DB count, fixing any drift
                        aum: trueAum._sum.allocation || 0
                    }
                });
            }



            return updatedSession;
        });

        console.log("✅ DB Update Success & Stats Decremented:", result);
        revalidatePath("/");
        return { success: true };
    } catch (error) {
        console.error("❌ Stop Copy Error:", error);
        return { success: false, error: "Failed to stop copying" };
    }
}

export async function stopAllActiveSessions(followerId: string) {
    console.log("🛑 Server Action: stopAllActiveSessions called for:", followerId);
    try {
        await prisma.$transaction(async (tx) => {
            // 1. Find all active sessions for this follower
            const activeSessions = await tx.copySession.findMany({
                where: { followerId: followerId, isActive: true },
                include: { master: { include: { masterProfile: true } } }
            });

            if (activeSessions.length === 0) return { success: true, message: "No active sessions found" };

            // 2. Mark ALL as Inactive
            await tx.copySession.updateMany({
                where: { followerId: followerId, isActive: true },
                data: { isActive: false }
            });

            // 3. Recalculate Stats for EACH affected Master
            // Use config-efficient approach: Distinct Master IDs
            const masterIds = Array.from(new Set(activeSessions.map(s => s.masterId)));

            for (const masterId of masterIds) {
                const masterProfile = await tx.masterProfile.findUnique({ where: { userId: masterId } });
                if (!masterProfile) continue;

                const trueCount = await tx.copySession.count({
                    where: { masterId: masterId, isActive: true }
                });

                const trueAum = await tx.copySession.aggregate({
                    where: {
                        masterId: masterId,
                        isActive: true,
                        followerId: { not: masterId } // 🛡️ Exclude Self-Investment
                    },
                    _sum: { allocation: true }
                });

                await tx.masterProfile.update({
                    where: { id: masterProfile.id },
                    data: {
                        followersCount: trueCount,
                        aum: trueAum._sum.allocation || 0
                    }
                });
            }
        });

        revalidatePath("/");
        return { success: true };
    } catch (error) {
        console.error("❌ Stop All Copy Error:", error);
        return { success: false, error: "Failed to stop all sessions" };
    }
}

// 🛡️ SECURITY: Force Stop All Followers (Used when Master goes Private)
export async function forceStopMasterSessions(masterUserId: string) {
    console.log("🛑 Server Action: forceStopMasterSessions called for Master:", masterUserId);
    try {
        await prisma.$transaction(async (tx) => {
            // 1. Mark ALL active sessions for this Master as Inactive
            await tx.copySession.updateMany({
                where: { masterId: masterUserId, isActive: true },
                data: { isActive: false }
            });

            // 2. Reset Master Stats to 0 (or strictly recalculate)
            await tx.masterProfile.update({
                where: { userId: masterUserId },
                data: {
                    followersCount: 0,
                    aum: 0
                }
            });
        });

        revalidatePath("/");
        return { success: true };
    } catch (error) {
        console.error("❌ Force Stop Error:", error);
        return { success: false, error: "Failed to stop followers" };
    }
}



// 🎟️ DYNAMIC TICKET STATUS CHECK
// 🎟️ DYNAMIC TICKET STATUS CHECK
export async function getTicketStatuses(userId: string) {
    if (!userId) return null;

    try {
        const promo = await prisma.userPromotion.findUnique({
            where: { userId }
        });

        if (!promo) {
            return {
                dailyUsed: false,
                welcomeUsed: false,
            };
        }

        // 🕒 Calculate Midnight GMT+7 in UTC
        const now = new Date();
        const utcNow = now.getTime();
        const offset = 7 * 60 * 60 * 1000;
        const localTime = new Date(utcNow + offset);
        localTime.setUTCHours(0, 0, 0, 0); // Midnight GMT+7
        const midnightGmt7InUtc = new Date(localTime.getTime() - offset);

        // Check Logic
        // For dailyUsed, we just check the boolean flag, OR if we want to be stricter, check 'dailyActivated' vs midnight.
        // The schema has 'dailyUsed' boolean, let's rely on that first, but for 'DAILY resets', checking timestamp is better.
        // If 'dailyActivated' is BEFORE midnight today, then it should be considered NOT used (reset).

        let isDailyUsed = promo.dailyUsed;
        if (promo.dailyActivated && promo.dailyActivated < midnightGmt7InUtc) {
            isDailyUsed = false; // Reset if last activation was yesterday
        }

        // Welcome Used is simple boolean
        const isWelcomeUsed = promo.welcomeUsed;

        return {
            dailyUsed: isDailyUsed,
            welcomeUsed: isWelcomeUsed,
        };

    } catch (e) {
        console.error("Get Ticket Status Error:", e);
        return null;
    }
}

// --- 🧠 AI RISK SCORE ALGORITHM ---
// Standardized volatility-based scoring used by top platforms (ZuluTrade/Exness)
function calculateRiskScore(maxDrawdown: number, dailyReturns: number[]): number {
    // 1. Volatility Score (StdDev of Daily Returns)
    let volatilityScore = 1;
    if (dailyReturns.length > 1) {
        const mean = dailyReturns.reduce((a, b) => a + b, 0) / dailyReturns.length;
        const variance = dailyReturns.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / (dailyReturns.length - 1);
        const stdDev = Math.sqrt(variance);

        // Thresholds: <1% (1), 1-2.5% (2), 2.5-4.5% (3), 4.5-7% (4), >7% (5)
        if (stdDev < 1.0) volatilityScore = 1;
        else if (stdDev < 2.5) volatilityScore = 2;
        else if (stdDev < 4.5) volatilityScore = 3;
        else if (stdDev < 7.0) volatilityScore = 4;
        else volatilityScore = 5;
    }

    // 2. Drawdown Score (Max Peak-to-Valley Loss)
    // Thresholds: <10% (1), 10-20% (2), 20-35% (3), 35-50% (4), >50% (5)
    let ddScore = 1;
    if (maxDrawdown < 10) ddScore = 1;
    else if (maxDrawdown < 20) ddScore = 2;
    else if (maxDrawdown < 35) ddScore = 3;
    else if (maxDrawdown < 50) ddScore = 4;
    else ddScore = 5;

    // Final Score is MAX of both factors (Safety First)
    return Math.max(volatilityScore, ddScore);
}

export async function refreshMasterStats(masterId: string) {
    if (!masterId) return { success: false };

    try {
        // Fetch Trade History for Risk Analysis (New DB Logic)
        const trades = await prisma.tradeHistory.findMany({
            where: { followerId: masterId },
            orderBy: { closeTime: 'asc' },
            select: { netProfit: true, closeTime: true }
        });

        // 🏦 Fetch Real Account Balance for Accurate Drawdown
        const account = await prisma.brokerAccount.findFirst({
            where: { userId: masterId },
            select: { balance: true }
        });

        // If no linked account, assume a standard $10,000 prop firm size or $1,000 retail
        // But if trades exist, we can infer starting balance if we assume current balance is correct.
        const currentBalance = account?.balance || 10000;

        // 📊 Calculate Stats for Formula
        let maxDrawdown = 0;
        let riskScore = 1; // Default Safe
        let roi = 0; // Performance (Cumulative Growth %)

        if (trades.length > 0) {
            // 1. Calculate Total Realized Profit to Back-Calculate Starting Balance
            const totalRealizedProfit = trades.reduce((sum, t) => sum + t.netProfit, 0);

            // Start Balance = Current Balance - Net Profit
            // (Ignoring Deposits/Withdrawals for now as simple heuristic, consistent with analytics.ts)
            let equity = currentBalance - totalRealizedProfit;
            if (equity <= 0) equity = 1000; // Fallback to prevent divide by zero if user blew account

            const startBalance = equity; // Snapshot for reference

            // 2. Max Drawdown % (Peak-to-Valley) based on Equity Curve
            let peakEquity = startBalance;
            let currentDrawdownPct = 0;

            // 3. Daily Returns for Volatility
            const dailyPnL = new Map<string, number>();

            trades.forEach(t => {
                // Update Equity
                equity += t.netProfit;

                // Track Peak
                if (equity > peakEquity) peakEquity = equity;

                // Calculate Drawdown from Peak
                const dd = peakEquity - equity;
                const ddPct = peakEquity > 0 ? (dd / peakEquity) * 100 : 0;

                if (ddPct > maxDrawdown) maxDrawdown = ddPct;

                // Daily PnL Aggregation
                const day = t.closeTime.toISOString().split('T')[0];
                dailyPnL.set(day, (dailyPnL.get(day) || 0) + t.netProfit);
            });

            // 4. Calculate Daily Volatility (Returns %)
            const dailyReturns: number[] = [];
            // We need to re-simulate equity day-by-day for accurate returns
            let dayStartEquity = startBalance;

            // Sort days to be sure
            const sortedDays = Array.from(dailyPnL.keys()).sort();

            sortedDays.forEach(day => {
                const profit = dailyPnL.get(day) || 0;
                if (dayStartEquity > 0) {
                    const ret = (profit / dayStartEquity) * 100;
                    dailyReturns.push(ret);
                }
                dayStartEquity += profit;
            });

            // 5. Calculate AI Score
            riskScore = calculateRiskScore(maxDrawdown, dailyReturns);

            // 6. Calculate ROI (Cumulative Growth %)
            // Same formula as data.ts: ((currentBalance - startBalance) / startBalance) * 100
            roi = startBalance > 0 ? parseFloat((((currentBalance - startBalance) / startBalance) * 100).toFixed(2)) : 0;
        }

        const stats = await prisma.$transaction(async (tx) => {
            // Count Followers (Exclude Self)
            const followersCount = await tx.copySession.count({
                where: {
                    masterId: masterId,
                    isActive: true,
                    followerId: { not: masterId } // 🛡️ Exclude Self
                }
            });

            // Sum AUM (Exclude Self)
            const trueAum = await tx.copySession.aggregate({
                where: {
                    masterId: masterId,
                    isActive: true,
                    followerId: { not: masterId } // 🛡️ Exclude Self
                },
                _sum: { allocation: true }
            });

            // Update Master Profile with Stats AND Risk
            const updatedProfile = await tx.masterProfile.update({
                where: { userId: masterId },
                data: {
                    followersCount: followersCount,
                    aum: trueAum._sum.allocation || 0,
                    riskScore: riskScore, // 🧠 AI Update
                    drawdown: parseFloat(maxDrawdown.toFixed(2)), // Persist DD too
                    roi: roi // ✅ Performance (Cumulative Growth %)
                }
            });

            return { ...updatedProfile, riskScore };
        });

        // 🚀 REAL-TIME UPDATE via Redis
        if (stats) {
            await redis.publish("channel:master_updates", JSON.stringify(stats));
        }

        revalidatePath('/');
        // ✅ Return 'joined' as the first trade date if available
        const firstTradeDate = (trades.length > 0 && trades[0].closeTime) ? trades[0].closeTime.toISOString() : null;
        return { success: true, ...stats, joined: firstTradeDate };
    } catch (error) {
        console.error("Refresh Stats Error:", error);
        return { success: false, error: "Failed to refresh stats" };
    }
}
