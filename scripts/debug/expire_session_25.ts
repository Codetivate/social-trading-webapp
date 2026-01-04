
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function expireSession25() {
    try {
        const sid = 25; // ✅ Correct Session ID
        console.log(`🔍 Targeting Session ${sid} (Sarah Conservative / TRIAL)...`);

        const soon = new Date(Date.now() + 10000); // 10 seconds

        await prisma.copySession.update({
            where: { id: sid },
            data: { expiry: soon }
        });

        console.log(`✅ Session ${sid} Updated!`);
        console.log(`   New Expiry: ${soon.toISOString()} (In 10 seconds)`);
        console.log(`\n👉 Watch the UI! It should auto-switch to "Copy" in ~10s.`);

    } catch (error) {
        console.error("Error:", error);
    } finally {
        await prisma.$disconnect();
    }
}

expireSession25();
