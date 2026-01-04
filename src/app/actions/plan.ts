"use server";

import { prisma } from "@/lib/prisma";
import { MasterTier } from "@prisma/client";

export async function updateMasterPlan(userId: string, planId: string) {
    if (!userId) return { success: false, error: "User ID required" };

    // Define Plan Logic (Centralized Source of Truth)
    const PLANS = {
        "ROOKIE": { limit: 10, aum: 50000, fee: 20 },
        "PRO": { limit: 500, aum: 500000, fee: 10 },
        "TYCOON": { limit: 999999, aum: 999999999, fee: 5 }
    };

    const targetPlan = PLANS[planId as keyof typeof PLANS];
    if (!targetPlan) return { success: false, error: "Invalid Plan ID" };

    try {
        await prisma.masterProfile.update({
            where: { userId: userId },
            data: {
                tier: planId as MasterTier,
                followersLimit: targetPlan.limit,
                aumLimit: targetPlan.aum,
                gpShare: targetPlan.fee
            }
        });

        return { success: true };
    } catch (error) {
        console.error("Update plan error:", error);
        return { success: false, error: "Failed to update plan" };
    }
}
