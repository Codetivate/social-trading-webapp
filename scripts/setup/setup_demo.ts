
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
    console.log("🚀 Setting up Demo Environment...");

    // 1. Create/Find Master
    const masterEmail = "master@demo.com";
    let master = await prisma.user.findUnique({ where: { email: masterEmail } });

    if (!master) {
        master = await prisma.user.create({
            data: {
                email: masterEmail,
                name: "Master Trader 👑",
                role: "MASTER",
                walletBalance: 10000,
            }
        });
        console.log("✅ Created Master:", master.id);
    } else {
        console.log("ℹ️ Found Master:", master.id);
    }

    // Ensure Master has a Broker Account
    const existingMasterBroker = await prisma.brokerAccount.findFirst({ where: { userId: master.id } });
    if (existingMasterBroker) {
        await prisma.brokerAccount.update({ where: { id: existingMasterBroker.id }, data: { balance: 10000 } });
    } else {
        await prisma.brokerAccount.create({
            data: {
                userId: master.id,
                login: "206872145",
                server: "Exness-MT5Trial7",
                password: "encrypted_pass",
                balance: 10000,
                status: "CONNECTED"
            }
        });
    }

    // 2. Create/Find Follower
    const followerEmail = "follower@demo.com";
    let follower = await prisma.user.findUnique({ where: { email: followerEmail } });

    if (!follower) {
        follower = await prisma.user.create({
            data: {
                email: followerEmail,
                name: "Follower Joe 👶",
                role: "FOLLOWER",
                walletBalance: 1000,
            }
        });
        console.log("✅ Created Follower:", follower.id);
    } else {
        console.log("ℹ️ Found Follower:", follower.id);
    }

    // Ensure Follower has a Broker Account
    const existingFollowerBroker = await prisma.brokerAccount.findFirst({ where: { userId: follower.id } });
    if (existingFollowerBroker) {
        await prisma.brokerAccount.update({ where: { id: existingFollowerBroker.id }, data: { balance: 1000 } });
    } else {
        await prisma.brokerAccount.create({
            data: {
                userId: follower.id,
                login: "12345678",
                server: "Exness-MT5Trial7",
                password: "encrypted_pass",
                balance: 1000,
                status: "CONNECTED"
            }
        });
    }


    // 3. Create Copy Session
    const session = await prisma.copySession.findFirst({
        where: { followerId: follower.id, masterId: master.id }
    });

    if (!session) {
        await prisma.copySession.create({
            data: {
                followerId: follower.id,
                masterId: master.id,
                allocation: 500, // Partial allocation
                riskFactor: 1.0, // 100% Risk
                type: "TRIAL_7DAY",
                isActive: true
            }
        });
        console.log("✅ Copy Session Created: Follower -> Master");
    } else {
        // Ensure it's active
        await prisma.copySession.update({
            where: { id: session.id },
            data: { isActive: true, riskFactor: 1.0 }
        })
        console.log("ℹ️ Copy Session Active");
    }

    console.log("\n=================================");
    console.log("📋 SETUP COMPLETE. USE THESE IDs:");
    console.log("---------------------------------");
    console.log(`MASTER_ID="${master.id}"`);
    console.log(`FOLLOWER_ID="${follower.id}"`);
    console.log("=================================\n");
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
