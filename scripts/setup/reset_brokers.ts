
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    console.log('🧹 Clearing BrokerAccount table...');
    try {
        const deleted = await prisma.brokerAccount.deleteMany({});
        console.log(`✅ Deleted ${deleted.count} broker accounts.`);
    } catch (e) {
        console.error('❌ Error deleting broker accounts:', e);
    } finally {
        await prisma.$disconnect();
    }
}

main();
