
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    console.log("🔍 DIAGNOSTIC: Checking Broker Account Data...");
    const accounts = await prisma.brokerAccount.findMany({
        include: { user: true }
    });

    if (accounts.length === 0) {
        console.log("❌ No Broker Accounts found in DB.");
    }

    accounts.forEach(acc => {
        console.log(`--------------------------------------------------`);
        console.log(`User: ${acc.user.name} (${acc.userId})`);
        console.log(`BrokerID: ${acc.id}`);
        console.log(`Status:  [${acc.status}]`);
        console.log(`Leverage: ${acc.leverage} (Type: ${typeof acc.leverage})`);
        console.log(`Equity:   ${acc.equity}`);
        console.log(`Balance:  ${acc.balance}`);
        console.log(`--------------------------------------------------`);
    });
}

main()
    .catch(e => console.error(e))
    .finally(async () => await prisma.$disconnect());
