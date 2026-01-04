
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function expireSession22() {
    try {
        const sid = 22;
        console.log(`🔍 Targeting Session ${sid} (Numsin)...`);

        // 1. Find Session
        const session = await prisma.copySession.findUnique({
            where: { id: sid }
        });

        if (!session) {
            console.log("❌ Session 22 not found.");
            return;
        }

        console.log(`   Current State: AutoRenew=${session.autoRenew}, Expiry=${session.expiry}`);

        // 2. Set AutoRenew = FALSE and Expiry = NOW + 10s
        // (Giving 10s so user can see it active for a moment, then die)
        const soon = new Date(Date.now() + 10000);

        await prisma.copySession.update({
            where: { id: sid },
            data: {
                autoRenew: false, // 🛑 Disable functionality
                expiry: soon      // ⏳ Expire in 10s
            }
        });

        console.log(`✅ Session ${sid} Updated!`);
        console.log(`   AutoRenew: FALSE`);
        console.log(`   New Expiry: ${soon.toISOString()} (In 10 seconds)`);
        console.log(`\n👉 Watch the Engine Logs! In ~10s, it should say:`);
        console.log(`   "[🛑] EXPIRED: Session 22... Soft Stop"`);

    } catch (error) {
        console.error("Error:", error);
    } finally {
        await prisma.$disconnect();
    }
}

expireSession22();
