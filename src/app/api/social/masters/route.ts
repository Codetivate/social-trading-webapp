import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
    try {
        const profiles = await prisma.masterProfile.findMany({
            include: {
                user: {
                    select: {
                        createdAt: true
                    }
                }
            }
        });

        // Map Database Profile to Frontend 'Master' Interface
        const masters = profiles.map(p => ({
            id: p.id,
            userId: p.userId, // Include User ID
            name: p.name,
            type: p.tags.includes("Bot") ? "AI_BOT" : "HUMAN", // Simple heuristic
            winRate: p.winRate,
            roi: p.roi,
            pnlText: `+${(p.roi * 10).toFixed(2)}`, // Placeholder calculation or store PnL in DB
            followers: p.followersCount,
            balance: 10000, // Placeholder: fetch from BrokerAccount if needed
            risk: p.riskScore,
            drawdown: p.drawdown,
            profitFactor: 1.5, // Placeholder
            avatar: p.avatar || `https://api.dicebear.com/7.x/initials/svg?seed=${p.name}`,
            isVip: false, // Removed from DB, defaulting to false or remove prop entirely if Frontend allows
            desc: p.desc || "No description provided.",
            tags: p.tags,
            joined: new Date(p.createdAt).getFullYear().toString(),
            currentOrders: [], // Todo: Fetch open signals
            monthlyFee: p.monthlyFee,
            isPremium: p.monthlyFee > 0
        }));

        return NextResponse.json(masters);
    } catch (error) {
        console.error("Failed to fetch masters:", error);
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
}
