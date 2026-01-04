
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function checkSession22() {
    try {
        const sid = 22;
        console.log(`🔍 Inspecting Session ${sid}...`);

        const session = await prisma.copySession.findUnique({
            where: { id: sid },
            include: { master: { include: { masterProfile: true } } }
        });

        if (!session) {
            console.log("❌ Session 22 not found.");
            return;
        }

        // console.log(JSON.stringify(session, null, 2)); // Too noisy

        console.log("\n--- Analysis ---");
        console.log(`ID: ${session.id}`);
        console.log(`FollowerID: ${session.followerId}`);
        console.log(`MasterID: ${session.masterId}`);
        console.log(`Type: ${session.type}`);
        console.log(`AutoRenew: ${session.autoRenew}`);
        console.log(`IsActive: ${session.isActive}`);
        console.log(`Expiry: ${session.expiry}`);
        console.log(`Current Time (JS): ${new Date().toISOString()}`);

    } catch (error) {
        console.error("Error:", error);
    } finally {
        await prisma.$disconnect();
    }
}

checkSession22();
