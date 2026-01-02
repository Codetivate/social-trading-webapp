
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const MASTER_ID = "0c13bf41-fad5-4884-8be5-c6bb2532cca5";
const FOLLOWER_ID = "8011748e-e183-428a-9c24-8aa4afd553fc"; // From executor.py

async function main() {
    console.log('🕵️ checking DB state...');

    // 1. Ensure Master Exists
    let master = await prisma.user.findUnique({ where: { id: MASTER_ID } });
    if (!master) {
        console.log('⚠️ Master not found. Creating Mock Master...');
        master = await prisma.user.create({
            data: {
                id: MASTER_ID,
                email: "master@demo.com",
                name: "Master Trader",
                role: "MASTER",
            }
        });
    }

    // 2. Ensure Follower Exists
    let follower = await prisma.user.findUnique({ where: { id: FOLLOWER_ID } });
    if (!follower) {
        console.log('⚠️ Follower not found. Creating Mock Follower...');
        follower = await prisma.user.create({
            data: {
                id: FOLLOWER_ID,
                email: "follower@demo.com",
                name: "Follower Nes",
                role: "FOLLOWER",
            }
        });
    } else {
        console.log("✅ Follower found: ", follower.name);
    }

    // 3. Ensure Follower has Broker Account
    const followerBroker = await prisma.brokerAccount.findFirst({ where: { userId: FOLLOWER_ID } });
    if (!followerBroker) {
        console.log('⚠️ Follower has no broker account. Creating Mock...');
        await prisma.brokerAccount.create({
            data: {
                userId: FOLLOWER_ID,
                server: "Exness-MT5Trial7",
                login: "12345678", // Mock login
                password: "password",
                status: "CONNECTED"
            }
        });
    }

    // 4. Ensure Copy Session Exists
    const session = await prisma.copySession.findFirst({
        where: { followerId: FOLLOWER_ID, masterId: MASTER_ID }
    });

    if (!session) {
        console.log('⚠️ No Copy Session found. Creating one...');
        await prisma.copySession.create({
            data: {
                followerId: FOLLOWER_ID,
                masterId: MASTER_ID,
                allocation: 1000,
                riskFactor: 1.0,
                type: "PAID",
                isActive: true
            }
        });
        console.log("✅ Copy Session Created!");
    } else {
        console.log("✅ Copy Session Exists. Active:", session.isActive);
        if (!session.isActive) {
            await prisma.copySession.update({
                where: { id: session.id },
                data: { isActive: true }
            });
            console.log("🔄 Reactivated Session.");
        }
    }
}

main()
    .catch(e => console.error(e))
    .finally(async () => await prisma.$disconnect());
