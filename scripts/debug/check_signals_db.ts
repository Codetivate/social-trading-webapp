
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    console.log('🕵️ Checking Signals...');
    const signals = await prisma.signal.findMany({
        orderBy: { createdAt: 'desc' },
        take: 20
    });

    if (signals.length === 0) console.log("No signals found.");

    signals.forEach(s => {
        console.log(`- ID: ${s.id} | Ticket: ${s.ticket} | Action: ${s.action} | Status: ${s.status} | Created: ${s.createdAt.toISOString()}`);
    });
}

main()
    .catch(e => console.error(e))
    .finally(async () => await prisma.$disconnect());
