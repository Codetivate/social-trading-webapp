
import { PrismaClient } from '@prisma/client';
import fs from 'fs';

const prisma = new PrismaClient();

async function main() {
    // Follower: cea89d76-eacd-42a2-a4e3-b935352d9734 (Login 11062253)
    // Master: e3a37995-7718-4123-a986-8b9f4a07b55e (Login 334564084)

    console.log("Querying Session...");

    const session = await prisma.copySession.findFirst({
        where: {
            followerId: 'cea89d76-eacd-42a2-a4e3-b935352d9734',
            masterId: 'e3a37995-7718-4123-a986-8b9f4a07b55e',
            isActive: true
        },
        include: {
            follower: true,
            master: true
        }
    });

    if (session) {
        console.log("Session Found:");
        console.log(`  ID: ${session.id}`);
        console.log(`  Follower: ${session.follower.email} / ${session.followerId}`);
        console.log(`  Master: ${session.master.email} / ${session.masterId}`);
        console.log(`  InvertCopy: ${session.invertCopy}`);
        console.log(`  RiskFactor: ${session.riskFactor}`);
        console.log(`  TimeConfig:`, session.timeConfig);
    } else {
        console.log("No Active Session Found for this pair.");
    }
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
