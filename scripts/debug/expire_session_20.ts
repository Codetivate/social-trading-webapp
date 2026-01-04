
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function expireSession20() {
    try {
        const sid = 20; // ⚠️ Assuming Session 20 is the TRIAL ticket from earlier logs
        console.log(`🔍 Targeting Session ${sid} (TRIAL_7DAY)...`);

        // 1. Find Session
        const session = await prisma.copySession.findUnique({
            where: { id: sid }
        });

        if (!session) {
            console.log("❌ Session 20 not found.");
            return;
        }

        console.log(`   Current State: Type=${session.type}, Expiry=${session.expiry}`);

        // 2. Set Expiry to SOON.
        // AutoRenew is irrelevant for TRIAL tickets (Engine ignores it/Treats as False)
        const soon = new Date(Date.now() + 10000); // 10 seconds

        await prisma.copySession.update({
            where: { id: sid },
            data: {
                expiry: soon      // ⏳ Expire in 10s
            }
        });

        console.log(`✅ Session ${sid} Updated!`);
        console.log(`   Type: ${session.type}`);
        console.log(`   New Expiry: ${soon.toISOString()} (In 10 seconds)`);
        console.log(`\n👉 Watch the UI! It should auto-switch to "Copy" in ~10s.`);

    } catch (error) {
        console.error("Error:", error);
    } finally {
        await prisma.$disconnect();
    }
}

expireSession20();
