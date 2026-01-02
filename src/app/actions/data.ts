"use server";

import { prisma } from "@/lib/prisma";
import { UserRole } from "@prisma/client";
import { Master } from "@/types";

// 📥 FETCH MASTERS (Public)
export async function fetchMasters(): Promise<Master[]> {
    try {
        const masters = await prisma.masterProfile.findMany({
            where: {
                isPublic: true, // ✅ Filter Private Masters
                user: {
                    role: 'MASTER' // ✅ Filter Downgraded Masters
                }
            },
            include: { user: true },
            orderBy: { followersCount: 'desc' }
        });

        return masters.map(m => ({
            id: m.id,
            userId: m.userId,
            name: m.name,
            type: "HUMAN",
            winRate: m.winRate,
            roi: m.roi,
            pnlText: "0%", // Todo: Calc from history
            followers: m.followersCount,
            balance: 0, // Hidden
            risk: m.riskScore,
            drawdown: m.drawdown,
            profitFactor: 0,
            avatar: m.avatar || "/avatars/default.png",
            isVip: false, // Todo: Add VIP logic to MasterProfile
            desc: m.desc || "",
            tags: m.tags,
            joined: new Date(m.createdAt).getFullYear().toString(),
            currentOrders: [],
            monthlyFee: m.monthlyFee,
            isPremium: m.monthlyFee > 0,
            isPublic: m.isPublic
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
