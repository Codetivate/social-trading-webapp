
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
    console.log("🚀 Setting up Real Demo Accounts...");

    // --- MASTER SETUP ---
    const masterId = "0c13bf41-fad5-4884-8be5-c6bb2532cca5";
    const masterCreds = {
        login: "206872145",
        password: "Nes#633689",
        server: "Exness-MT5Trial7"
    };

    console.log(`\n👑 Configuring Master (${masterId})...`);

    // 1. Create/Update Master User
    await prisma.user.upsert({
        where: { id: masterId },
        update: {
            name: "Master Nes 👑",
            role: "MASTER",
            masterProfile: {
                upsert: {
                    create: { name: "Master Nes 👑", monthlyFee: 50, roi: 125.5, followersCount: 120 },
                    update: { name: "Master Nes 👑" }
                }
            }
        },
        create: {
            id: masterId,
            email: "master.nes@demo.com",
            name: "Master Nes 👑",
            role: "MASTER",
            walletBalance: 5000,
            masterProfile: {
                create: { name: "Master Nes 👑", monthlyFee: 50, roi: 125.5, followersCount: 120 }
            }
        }
    });

    // 2. Updated Broker Account for Master
    const existingMasterBroker = await prisma.brokerAccount.findFirst({ where: { userId: masterId } });
    if (existingMasterBroker) {
        await prisma.brokerAccount.update({ where: { id: existingMasterBroker.id }, data: { ...masterCreds, balance: 10000, status: "CONNECTED" } });
    } else {
        await prisma.brokerAccount.create({ data: { userId: masterId, ...masterCreds, balance: 10000, status: "CONNECTED" } });
    }


    // --- FOLLOWER SETUP ---
    const followerId = "8011748e-e183-428a-9c24-8aa4afd553fc";
    const followerCreds = {
        login: "206872179",
        password: "Nes#633689",
        server: "Exness-MT5Trial7"
    };

    console.log(`\n👶 Configuring Follower (${followerId})...`);

    // 1. Create/Update Follower User
    await prisma.user.upsert({
        where: { id: followerId },
        update: {
            name: "Follower Nes",
            role: "FOLLOWER",
            walletBalance: 2000
        },
        create: {
            id: followerId,
            email: "follower.nes@demo.com",
            name: "Follower Nes",
            role: "FOLLOWER",
            walletBalance: 2000
        }
    });

    // 2. Upsert Broker Account for Follower
    const existingFollowerBroker = await prisma.brokerAccount.findFirst({ where: { userId: followerId } });
    if (existingFollowerBroker) {
        await prisma.brokerAccount.update({ where: { id: existingFollowerBroker.id }, data: { ...followerCreds, balance: 2000, status: "CONNECTED" } });
    } else {
        await prisma.brokerAccount.create({ data: { userId: followerId, ...followerCreds, balance: 2000, status: "CONNECTED" } });
    }


    // --- COPY SESSION ---
    console.log(`\n🔗 Linking Accounts...`);
    const session = await prisma.copySession.findFirst({
        where: { followerId, masterId }
    });

    if (!session) {
        await prisma.copySession.create({
            data: {
                followerId,
                masterId,
                allocation: 1000,
                riskFactor: 1.0,
                type: "PAID",
                isActive: true
            }
        });
        console.log("✅ Created Copy Session");
    } else {
        await prisma.copySession.update({
            where: { id: session.id },
            data: { isActive: true }
        });
        console.log("ℹ️ Session Adjusted to Active");
    }

    console.log("\n✅ DONE. Database ready for Python Scripts.");
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
