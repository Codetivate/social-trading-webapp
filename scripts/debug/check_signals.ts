
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
    console.log("🔍 Checking Signals in Database...");

    const signals = await prisma.signal.findMany({
        take: 10,
        orderBy: { createdAt: 'desc' }
    });

    if (signals.length === 0) {
        console.log("❌ No signals found in the database. SmartRouter might be failing.");
    } else {
        console.log(`✅ Found ${signals.length} recent signals:`);
        signals.forEach(s => {
            console.log(`- [${s.status}] ${s.action} ${s.symbol} (Vol: ${s.volume}) -> FollowerID: ${s.followerId}`);
        });
    }

    const sessions = await prisma.copySession.findMany({
        where: { isActive: true }
    });
    console.log(`\nℹ️ Active Copy Sessions: ${sessions.length}`);
    sessions.forEach(s => console.log(`- ${s.masterId} -> ${s.followerId}`));

}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
