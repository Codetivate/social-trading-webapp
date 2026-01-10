"use server";

import { prisma } from "@/lib/prisma";
import { UserRole } from "@prisma/client";
import { MasterProfile } from "@/types"; // Ensure this type matches your Prisma schema or is mapped correctly
import { revalidatePath } from "next/cache";

// --- 📥 GET USER PROFILE ---
export async function getUserProfile(userId: string) {
    if (!userId) return null;

    try {
        const user = await prisma.user.findUnique({
            where: { id: userId },
            include: {
                masterProfile: true, // Fetch related master profile if exists
                brokerAccounts: true, // Fetch connected broker accounts
                followerProfile: true // ✅ Fetch follower profile for favorites
            }
        });

        if (!user) return null;

        return {
            id: user.id,
            name: user.name,
            email: user.email,
            image: user.image,
            role: user.role as UserRole,
            masterProfile: user.masterProfile,
            brokerAccount: user.brokerAccounts?.[0] || null, // Return the first/primary broker account if exists
            favorites: user.followerProfile?.favorites || [] // ✅ Return favorites or empty array
        };
    } catch (error) {
        console.error("Error fetching user profile:", error);
        return null; // Handle error gracefully
    }
}

// --- 📤 UPDATE USER PROFILE (Basic Info) ---
export async function updateUserProfile(userId: string, data: { name?: string; image?: string; isVip?: boolean }) {
    if (!userId) return { success: false, error: "User ID required" };

    try {
        await prisma.user.update({
            where: { id: userId },
            data: {
                ...data
            }
        });
        return { success: true };
    } catch (error) {
        console.error("Error updating user profile:", error);
        return { success: false, error: "Failed to update profile" };
    }
}

// --- 📤 UPDATE MASTER PROFILE ---
export async function updateMasterProfile(userId: string, data: Partial<MasterProfile>) {
    if (!userId) return { success: false, error: "User ID required" };

    try {
        // 🛡️ UNIQ CHECK: Check if username is taken by another user
        if (data.username) {
            const existing = await prisma.masterProfile.findFirst({
                where: {
                    username: { equals: data.username, mode: "insensitive" },
                    userId: { not: userId } // Exclude self
                }
            });
            if (existing) {
                return { success: false, error: `Username "${data.username}" is already taken.` };
            }
        }

        await prisma.masterProfile.upsert({
            where: { userId: userId },
            update: {
                desc: data.desc,
                name: data.name,
                username: data.username, // ✅ Save Username
                avatar: data.avatar,
                tags: data.tags,
                monthlyFee: data.monthlyFee,
                minDeposit: data.minDeposit, // ✅ Added
                winRate: data.winRate, // ✅ Added
                roi: data.roi, // ✅ Added
                isPublic: data.isPublic // ✅ Save Visibility
            },
            create: {
                userId: userId,
                name: data.name || "New Master",
                username: data.username, // ✅ Save Username
                desc: data.desc || "",
                avatar: data.avatar || "",
                tags: data.tags || [],
                monthlyFee: data.monthlyFee || 0,
                minDeposit: data.minDeposit || 10,
                roi: data.roi || 0,
                winRate: data.winRate || 0,
                drawdown: 0,
                followersCount: 0,
            }
        });

        return { success: true };
    } catch (error) {
        console.error("Update master profile error:", error);
        return { success: false, error: "Failed to update master profile" };
    }
}


// --- 🌟 ACTIVATE MASTER ACCOUNT ---
export async function activateMasterAccount(userId: string, fee: number) {
    if (!userId) return { success: false, error: "User ID required" };

    try {
        await prisma.$transaction(async (tx) => {
            // 1. Verify Broker Connection 🏦
            const brokerAccount = await tx.brokerAccount.findFirst({
                where: { userId, status: "CONNECTED" },
                orderBy: { createdAt: 'desc' }
            });

            if (!brokerAccount) {
                throw new Error("No connected MT5 account found. Please connect a broker first.");
            }

            // 2. Update User Role
            const user = await tx.user.update({
                where: { id: userId },
                data: { role: UserRole.MASTER }
            });

            // 3. Generate Master Identity 🎨
            const fullName = user.name || "New Trader";
            const nameParts = fullName.split(" ");
            const firstName = nameParts[0];
            const lastName = nameParts.length > 1 ? nameParts.slice(1).join(" ") : "";
            const shortLast = lastName ? lastName.substring(0, 2) : "";
            const displayName = shortLast ? `${firstName} ${shortLast}` : firstName;

            // Random Modern Avatar (Notion Style)
            const seed = Math.random().toString(36).substring(7);
            const randomAvatar = `https://api.dicebear.com/9.x/notionists/svg?seed=${seed}`;

            // 4. Smart Update or Create Master Profile 🧠
            const existingProfile = await tx.masterProfile.findUnique({ where: { userId } });

            if (existingProfile) {
                // Preserve manual edits found in 'existingProfile', backfill empty ones with defaults
                await tx.masterProfile.update({
                    where: { userId },
                    data: {
                        monthlyFee: fee,
                        brokerAccountId: brokerAccount.id, // 🔗 Link Broker
                        // Only overwrite if currently empty/invalid
                        avatar: (existingProfile.avatar && existingProfile.avatar.length > 10) ? undefined : randomAvatar,
                        name: (existingProfile.name && existingProfile.name !== "New Master") ? undefined : displayName,
                        tags: (existingProfile.tags && existingProfile.tags.length > 0) ? undefined : ["DayTrading"],
                        isPublic: true // ✅ Force Public
                    }
                });
            } else {
                // Create fresh with all defaults
                await tx.masterProfile.create({
                    data: {
                        userId: userId,
                        name: displayName,
                        monthlyFee: fee,
                        desc: "New Master",
                        tags: ["DayTrading"],
                        avatar: randomAvatar,
                        roi: 0,
                        winRate: 0,
                        drawdown: 0,
                        followersCount: 0,
                        minDeposit: 10, // ✅ Default Min Deposit
                        brokerAccountId: brokerAccount.id, // 🔗 Link Broker
                        isPublic: true // ✅ Public by default
                    }
                });
            }
        });

        return { success: true };
    } catch (error) {
        console.error("Activate Master Error:", error);
        const errorMessage = error instanceof Error ? error.message : "Failed to activate master account.";
        return { success: false, error: errorMessage };
    }
}


// --- ⬇️ DOWNGRADE TO FOLLOWER ---
export async function downgradeMaster(userId: string) {
    if (!userId) return { success: false, error: 'User ID required' };

    try {
        await prisma.$transaction(async (tx) => {
            // 1. Stop all active sessions & Refund/Cancel
            await tx.copySession.updateMany({
                where: { masterId: userId, isActive: true },
                data: { isActive: false }
            });

            // 2. Reset Master Stats (Optional, but cleaner)
            await tx.masterProfile.update({
                where: { userId },
                data: {
                    followersCount: 0,
                    aum: 0,
                    isPublic: false // ✅ Force Private
                }
            });

            // 3. Downgrade Role
            await tx.user.update({
                where: { id: userId },
                data: { role: 'FOLLOWER' }
            });
        });

        return { success: true };
    } catch (error) {
        console.error('Downgrade Master Error:', error);
        return { success: false, error: 'Failed to downgrade.' };
    }
}

// --- 🛑 RESET MASTER STATS (Switching Account) ---
export async function resetMasterStats(userId: string) {
    if (!userId) return;

    try {
        // 1. Reset Performance Metrics
        await prisma.masterProfile.update({
            where: { userId },
            data: {
                roi: 0,
                winRate: 0,
                drawdown: 0,
                followersCount: 0,
            }
        });

        // 2. Refund/Cancel Active Sessions 
        await prisma.copySession.updateMany({
            where: { masterId: userId, isActive: true },
            data: { isActive: false }
        });

        console.log(`Master stats reset for ${userId}`);
    } catch (error) {
        console.error("Reset Master Stats Error:", error);
    }
}

// --- 🔌 DISCONNECT BROKER ---
export async function disconnectBroker(userId: string) {
    if (!userId) return { success: false, error: "User ID required" };

    try {
        // Find the connected broker account
        // Update status to DISCONNECTED for ALL connected accounts (Fixes duplicate sessions)
        const result = await prisma.brokerAccount.updateMany({
            where: {
                userId: userId,
                status: "CONNECTED"
            },
            data: {
                status: "DISCONNECTED",
                pid: null, // Clear process ID
                port: null // Clear port
            }
        });

        if (result.count === 0) {
            return { success: false, error: "No connected broker account found." };
        }

        return { success: true };

        return { success: true };
    } catch (error) {
        console.error("Disconnect Broker Error:", error);
        return { success: false, error: "Failed to disconnect broker." };
    }
}

// --- 📊 GET ACTIVE POSITIONS ---
export async function getOpenPositions(userId: string) {
    if (!userId) return [];

    try {
        const brokerAccount = await prisma.brokerAccount.findFirst({
            where: { userId, status: "CONNECTED" },
            include: {
                positions: {
                    orderBy: { openTime: 'desc' }
                }
            }
        });

        if (!brokerAccount) return [];

        // Return simpler structure
        return brokerAccount.positions.map(pos => ({
            ticket: String(pos.ticket), // BigInt to String
            symbol: pos.symbol,
            type: pos.type,
            volume: pos.volume,
            openPrice: pos.openPrice,
            currentPrice: pos.currentPrice,
            profit: pos.profit,
            sl: pos.sl,
            tp: pos.tp,
            openTime: pos.openTime
        }));
    } catch (error) {
        console.error("Fetch Positions Error:", error);
        return [];
    }
}

// (VIP Logic Removed)

// --- ❤️ TOGGLE FAVORITE ---
export async function toggleFavorite(userId: string, masterId: number) {
    if (!userId) return { success: false, error: "User ID required" };

    try {
        // 1. Get or Create FollowerProfile
        let profile = await prisma.followerProfile.findUnique({
            where: { userId }
        });

        if (!profile) {
            profile = await prisma.followerProfile.create({
                data: {
                    userId,
                    favorites: [] // Init empty
                }
            });
        }

        // 2. Toggle Logic
        let newFavorites = [...profile.favorites];
        if (newFavorites.includes(masterId)) {
            // Remove
            newFavorites = newFavorites.filter(id => id !== masterId);
        } else {
            // Add
            newFavorites.push(masterId);
        }

        // 3. Save
        await prisma.followerProfile.update({
            where: { userId },
            data: { favorites: newFavorites }
        });

        revalidatePath('/'); // Refresh UI
        return { success: true, favorites: newFavorites };
    } catch (error) {
        console.error("Toggle Favorite Error:", error);
        return { success: false, error: "Failed to update favorites" };
    }
}

