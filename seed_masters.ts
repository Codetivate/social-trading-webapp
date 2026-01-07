
import { PrismaClient, UserRole } from '@prisma/client';
const prisma = new PrismaClient();

const POSITIVE_MASTERS = [
    { name: "Atlas Prime", desc: "Steady compounding.", roi: 245.5, winRate: 78, tags: ["Safe", "Gold", "Swing"] },
    { name: "Forex King", desc: "High leverage scalping.", roi: 180.2, winRate: 65, tags: ["Risky", "Forex", "Scalper"] },
    { name: "Crypto Whale", desc: "BTC/ETH breakouts.", roi: 540.0, winRate: 45, tags: ["Crypto", "Volatile"] },
    { name: "Stable Growth", desc: "Low drawdown strategy.", roi: 35.5, winRate: 92, tags: ["Safe", "Indices"] },
    { name: "Quantum AI", desc: "Algorithmic purity.", roi: 120.8, winRate: 88, tags: ["AI", "Auto"] },
    { name: "Trend Surfer", desc: "Following major trends.", roi: 95.0, winRate: 60, tags: ["Trend", "Swing"] },
    { name: "Night Owl", desc: "Asian session scalps.", roi: 65.4, winRate: 72, tags: ["Scalper", "Forex"] },
    { name: "Grid Master", desc: "Martingale recovery.", roi: 320.1, winRate: 99, tags: ["High Risk", "Grid"] },
    { name: "Gold Digger", desc: "XAUUSD specialist.", roi: 210.5, winRate: 70, tags: ["Gold", "Commodities"] },
    { name: "Zen Trader", desc: "Patience pays.", roi: 45.0, winRate: 85, tags: ["Safe", "Swing"] }
];

const NEGATIVE_MASTERS = [
    { name: "Rekt Capital", desc: "High risk, bad luck.", roi: -95.5, winRate: 20, tags: ["High Risk", "Gambler"] },
    { name: "YOLO King", desc: "All in, all out.", roi: -60.2, winRate: 35, tags: ["Risky", "Forex"] },
    { name: "Falling Knife", desc: "Catching the bottom.", roi: -45.0, winRate: 40, tags: ["Crypto", "Counter-Trend"] },
    { name: "Panic Seller", desc: "Selling low.", roi: -30.5, winRate: 30, tags: ["Indices", "Bad Emotion"] },
    { name: "Bag Holder", desc: "Diamond hands.", roi: -80.8, winRate: 15, tags: ["Crypto", "HODL"] },
    { name: "Margin Call", desc: "Living on the edge.", roi: -99.0, winRate: 5, tags: ["High Risk", "Leverage"] },
    { name: "FOMO Trader", desc: "Buying the top.", roi: -25.4, winRate: 45, tags: ["Scalper", "News"] },
    { name: "Revenge Trade", desc: "Trading on tilt.", roi: -50.1, winRate: 25, tags: ["High Risk", "Aggressive"] },
    { name: "Stop Loss Hunter", desc: "Getting hunted.", roi: -15.5, winRate: 48, tags: ["Forex", "Day"] },
    { name: "Liquidated", desc: "Account reset.", roi: -100.0, winRate: 0, tags: ["Safe?", "System Failure"] }
];

async function main() {
    console.log("🌱 Cleaning old mocks...");
    // Optional: Delete existing mocks (filtered by names or just clear all non-essential?)
    // For safety, let's just create new ones and maybe delete based on name pattern if re-run.

    // Create Users First
    const allMasters = [...POSITIVE_MASTERS, ...NEGATIVE_MASTERS];

    for (const m of allMasters) {
        const email = `${m.name.replace(/\s/g, '').toLowerCase()}@mock.com`;

        // Upsert User
        const user = await prisma.user.upsert({
            where: { email },
            update: { role: 'MASTER' },
            create: {
                email,
                name: m.name,
                role: 'MASTER',
                walletBalance: 10000,
                kycStatus: "APPROVED"
            }
        });

        // Upsert Master Profile
        const netProfit = (m.roi * 1000); // Rough correlation: 10% roi = $1000 profit for $10k acc

        await prisma.masterProfile.upsert({
            where: { userId: user.id },
            update: {
                name: m.name,
                desc: m.desc,
                roi: m.roi,
                winRate: m.winRate,
                tags: m.tags,
                isPublic: true,
                drawdown: m.roi < 0 ? Math.abs(m.roi) + 10 : 10, // Losers have high drawdown
                profitFactor: m.roi > 0 ? 2.5 : 0.5,
                netProfit: netProfit,
                riskScore: m.roi < 0 ? 9 : 3,
                aum: Math.abs(netProfit) * 10 + 5000,
                followersCount: Math.floor(Math.random() * 500),
                avatar: `https://api.dicebear.com/9.x/avataaars/svg?seed=${m.name.replace(/\s/g, '')}`
            },
            create: {
                userId: user.id,
                username: m.name.replace(/\s/g, '').toLowerCase(),
                name: m.name,
                desc: m.desc,
                roi: m.roi,
                winRate: m.winRate,
                tags: m.tags,
                isPublic: true,
                drawdown: m.roi < 0 ? Math.abs(m.roi) + 10 : 10,
                profitFactor: m.roi > 0 ? 2.5 : 0.5,
                netProfit: netProfit,
                riskScore: m.roi < 0 ? 9 : 3,
                aum: Math.abs(netProfit) * 10 + 5000,
                followersCount: Math.floor(Math.random() * 500),
                avatar: `https://api.dicebear.com/9.x/avataaars/svg?seed=${m.name.replace(/\s/g, '')}`
            }
        });

        console.log(`✅ Seeded: ${m.name} (${m.roi}%)`);
    }

    console.log("DONE");
}

main()
    .catch(e => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
