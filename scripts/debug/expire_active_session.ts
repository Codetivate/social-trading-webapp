
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function expireActiveSession() {
    try {
        const userId = "a510e860-903d-4c0b-b27e-41309a736d34";

        // 1. Find the FIRST Active Session
        const session = await prisma.copySession.findFirst({
            where: {
                followerId: userId,
                isActive: true
            },
            include: { master: true }
        });

        if (!session) {
            console.log("❌ No active sessions found to expire.");
            return;
        }

        console.log(`🎯 Target Found: Session ${session.id}`);
        console.log(`   Master: ${session.master.name}`);
        console.log(`   Type: ${session.type}`);

        // 2. Set Expiry to 5 seconds from now
        const soon = new Date(Date.now() + 5000);

        await prisma.copySession.update({
            where: { id: session.id },
            data: {
                expiry: soon,
                // Ensure AutoRenew is OFF so it actually stops
                autoRenew: false
            }
        });

        console.log(`✅ Session ${session.id} Updated!`);
        console.log(`   New Expiry: ${soon.toISOString()} (In 5 seconds)`);
        console.log(`\n👉 Watch the UI! It should auto-switch to "Copy" in ~5s.`);

    } catch (error) {
        console.error("Error:", error);
    } finally {
        await prisma.$disconnect();
    }
}

expireActiveSession();
