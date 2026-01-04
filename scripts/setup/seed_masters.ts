import { PrismaClient, UserRole } from '@prisma/client';

const prisma = new PrismaClient();

const MASTERS_DATA = [
    {
        email: "guard_ai@hydra.bot",
        name: "SignalTrade Guard AI",
        desc: "Official House Bot. Low risk, steady growth grid strategy.",
        avatar: "https://api.dicebear.com/7.x/bottts/svg?seed=Guard",
        tags: ["Safe", "Grid", "AI"],
        roi: 145.5,
        winRate: 98.2,
        drawdown: 5.5,
        riskScore: 2,
        followers: 1250,
        fee: 0
    },
    {
        email: "gold_hunter@hydra.bot",
        name: "Gold Hunter",
        desc: "High volatility XAUUSD scalper. High risk, high reward.",
        avatar: "https://api.dicebear.com/7.x/bottts/svg?seed=Gold",
        tags: ["Aggressive", "Gold", "Scalping"],
        roi: 320.0,
        winRate: 65.4,
        drawdown: 25.0,
        riskScore: 8,
        followers: 890,
        fee: 50, // $50/mo
    },
    {
        email: "master_keng@hydra.com",
        name: "Master Keng 🇹🇭",
        desc: "Professional day trader specializing in Forex majors.",
        avatar: "https://api.dicebear.com/7.x/avataaars/svg?seed=Keng",
        tags: ["Day Trade", "Manual", "Forex"],
        roi: 89.4,
        winRate: 88.0,
        drawdown: 18.2,
        riskScore: 6,
        followers: 5420,
        fee: 100
    },
    {
        email: "crypto_whale@hydra.com",
        name: "Crypto Whale",
        desc: "Long term swing trading on BTC and ETH.",
        avatar: "https://api.dicebear.com/7.x/avataaars/svg?seed=Whale",
        tags: ["Crypto", "Swing", "DCA"],
        roi: 450.2,
        winRate: 55.0,
        drawdown: 35.0,
        riskScore: 9,
        followers: 3200,
        fee: 200
    }
];

async function main() {
    console.log("🌱 Starting Master Seeding...");

    for (const master of MASTERS_DATA) {
        // 1. Check if user exists
        const existingUser = await prisma.user.findUnique({
            where: { email: master.email }
        });

        if (existingUser) {
            console.log(`⚠️ User ${master.email} already exists. Skipping.`);
            continue;
        }

        // 2. Create User
        const user = await prisma.user.create({
            data: {
                email: master.email,
                name: master.name,
                avatar: master.avatar,
                role: UserRole.MASTER,
                kycStatus: "APPROVED"
            }
        });

        // 3. Create Master Profile
        await prisma.masterProfile.create({
            data: {
                userId: user.id,
                name: master.name,
                desc: master.desc,
                avatar: master.avatar,
                tags: master.tags,
                roi: master.roi,
                winRate: master.winRate,
                drawdown: master.drawdown,
                riskScore: master.riskScore,
                followersCount: master.followers,
                monthlyFee: master.fee,
                minDeposit: 100
            }
        });

        console.log(`✅ Created Master: ${master.name}`);
    }

    console.log("✨ Seeding Complete!");
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
