"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { SessionType } from "@prisma/client";

export async function startCopySession(
    followerId: string,
    masterUserId: string,
    amount: number,
    risk: number,
    type: SessionType,
    dailyLoss?: number, // 🛡️ Daily Loss Limit
    minEquity?: number  // 🛡️ Hard Stop Equity
) {
    if (!followerId || !masterUserId) return { success: false, error: "Invalid IDs" };
    if (amount <= 0) return { success: false, error: "Invalid amount" };

    try {
        const result = await prisma.$transaction(async (tx) => {
            // 1. Check Follower Wallet (DISABLED FOR SELF-HOSTED DEMO)
            const follower = await tx.user.findUnique({ where: { id: followerId } });
            if (!follower) throw new Error("Follower not found");
            // if (follower.walletBalance < amount) throw new Error("Insufficient wallet balance");

            // 2. Deduct from Follower (DISABLED)
            // await tx.user.update({
            //     where: { id: followerId },
            //     data: { walletBalance: { decrement: amount } }
            // });

            // 3. Create OR Reactivate Copy Session
            // Check if there is already an active session for this pair
            const existingSession = await tx.copySession.findFirst({
                where: {
                    followerId: followerId,
                    masterId: masterUserId,
                    isActive: true
                }
            });

            if (existingSession) {
                return { success: false, error: "You are already copying this master." };
            }

            // 3.5 🛡️ UPDATE RISK GUARDS (Global for Account)
            // Since we only support 1 Broker Account per user in this demo:
            if (dailyLoss !== undefined || minEquity !== undefined) {
                await tx.brokerAccount.updateMany({
                    where: { userId: followerId, status: "CONNECTED" },
                    data: {
                        maxDailyLoss: dailyLoss || 0,
                        minEquity: minEquity || 0
                    }
                });
            }

            // 4. Create new COPY SESSION
            const session = await tx.copySession.create({
                data: {
                    followerId: followerId,
                    masterId: masterUserId,
                    allocation: amount,
                    currentEquity: amount, // ✅ Init Shadow Equity
                    riskFactor: risk,
                    type: type,
                    isActive: true,
                    // 🕒 Expiration Logic
                    expiry: type === "DAILY" ? new Date(Date.now() + 4 * 60 * 60 * 1000)
                        : type === "TRIAL_7DAY" ? new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
                            : type === "GOLDEN" ? new Date(Date.now() + 24 * 60 * 60 * 1000)
                                : type === "VIP" ? new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) // Default 30 days for VIP session if not infinite
                                    : null,
                }
            });

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
            } else if (type === "GOLDEN") {
                // 🎫 Deduct Golden Ticket
                await tx.user.update({
                    where: { id: followerId },
                    data: { goldenTickets: { decrement: 1 } }
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
                where: { masterId: masterUserId, isActive: true },
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
                expiry: s.expiry ? s.expiry.getTime() : null
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
                    where: { masterId: session.masterId, isActive: true },
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
                    where: { masterId: masterId, isActive: true },
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
                isVipActive: false,
                vipStart: null,
                vipExpiry: null,
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

        // VIP Check
        const isVipActive = promo.isVipActive && promo.vipExpiry ? promo.vipExpiry > now : false;

        return {
            dailyUsed: isDailyUsed,
            welcomeUsed: isWelcomeUsed,
            isVipActive,
            vipStart: promo.createdAt.getTime(), // Using creation as start surrogate if needed
            vipExpiry: promo.vipExpiry ? promo.vipExpiry.getTime() : null,
        };

    } catch (e) {
        console.error("Get Ticket Status Error:", e);
        return null;
    }
}
