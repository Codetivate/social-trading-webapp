
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function listSessions() {
    try {
        console.log("🔍 Listing ALL Copy Sessions...");

        const sessions = await prisma.copySession.findMany({
            include: { master: { include: { masterProfile: true } } },
            orderBy: { id: 'desc' }
        });

        if (sessions.length === 0) {
            console.log("❌ No sessions found.");
            return;
        }

        console.table(sessions.map(s => ({
            ID: s.id,
            Master: s.master.masterProfile?.name || "Unknown",
            Type: s.type,
            IsActive: s.isActive,
            AutoRenew: s.autoRenew,
            Expiry: s.expiry ? s.expiry.toISOString() : "NULL",
            CreatedAt: s.createdAt.toISOString()
        })));

    } catch (error) {
        console.error("Error:", error);
    } finally {
        await prisma.$disconnect();
    }
}

listSessions();
