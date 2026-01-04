
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function findUserSessions() {
    try {
        const userId = "a510e860-903d-4c0b-b27e-41309a736d34";
        console.log(`🔍 Finding Active Sessions for User: ${userId}...`);

        const sessions = await prisma.copySession.findMany({
            where: {
                followerId: userId,
                isActive: true
            },
            include: { master: true }
        });

        if (sessions.length === 0) {
            console.log("❌ No active sessions found for this user.");
        } else {
            console.log(`✅ Found ${sessions.length} Active Sessions:`);
            sessions.forEach(s => {
                console.log(`SESSION_ID: ${s.id}`);
                console.log(`MASTER: ${s.master.name}`);
                console.log(`TYPE: ${s.type}`);
            });
        }

    } catch (error) {
        console.error("Error:", error);
    } finally {
        await prisma.$disconnect();
    }
}

findUserSessions();
