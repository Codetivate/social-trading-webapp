
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    console.log('🕵️ Checking Copy Sessions...');
    const sessions = await prisma.copySession.findMany({
        include: { follower: true, master: true }
    });

    if (sessions.length === 0) console.log("No sessions found.");

    sessions.forEach(s => {
        console.log(`- ID: ${s.id} | ${s.follower.name} (${s.followerId}) -> ${s.master.name} (${s.masterId}) | Active: ${s.isActive}`);
    });
}

main()
    .catch(e => console.error(e))
    .finally(async () => await prisma.$disconnect());
