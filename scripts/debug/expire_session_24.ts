
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function expireSession24() {
    try {
        const sid = 24;
        console.log(`🔍 Targeting Session ${sid} (Standard/DAILY)...`);

        // 1. Find Session
        const session = await prisma.copySession.findUnique({
            where: { id: sid }
        });

        if (!session) {
            console.log("❌ Session 24 not found.");
            return;
        }

        console.log(`   Current State: AutoRenew=${session.autoRenew}, Expiry=${session.expiry}`);

        // 2. DISABLE AutoRenew (to insure it STOPS instead of Renews) 
        //    AND set Expiry to SOON.
        const soon = new Date(Date.now() + 10000); // 10 seconds

        await prisma.copySession.update({
            where: { id: sid },
            data: {
                autoRenew: false, // 🛑 Disable functionality so we see the STOP
                expiry: soon      // ⏳ Expire in 10s
            }
        });

        console.log(`✅ Session ${sid} Updated!`);
        console.log(`   AutoRenew: FALSE`);
        console.log(`   New Expiry: ${soon.toISOString()} (In 10 seconds)`);
        console.log(`\n👉 Watch the UI! It should auto-switch to "Copy" in ~10s.`);

    } catch (error) {
        console.error("Error:", error);
    } finally {
        await prisma.$disconnect();
    }
}

expireSession24();
