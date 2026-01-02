
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    const signals = await prisma.signal.findMany({
        take: 10,
        orderBy: { createdAt: 'desc' }
    });

    console.log("Recent Signals in DB:");
    signals.forEach(s => {
        // Convert BigInt to string for display
        const ticket = s.ticket.toString();
        console.log(`[${s.status}] Action: ${s.action} Ticket: ${ticket} Symbol: ${s.symbol} FollowerID: ${s.followerId} (${s.id})`);
    });
}

main()
    .catch(e => console.error(e))
    .finally(async () => await prisma.$disconnect());
