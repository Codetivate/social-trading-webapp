import { prisma } from "../src/lib/prisma";

async function main() {
    const trades = await prisma.tradeHistory.findMany({
        take: 5,
        orderBy: { createdAt: 'desc' }
    });

    console.log("----- RECENT TRADE HISTORY -----");
    if (trades.length === 0) {
        console.log("No trades found.");
    } else {
        trades.forEach(t => {
            console.log(`ID: ${t.id}`);
            console.log(`  Ticket: ${t.ticket}`);
            console.log(`  Symbol: ${t.symbol}`);
            console.log(`  Action: ${t.type}`);
            console.log(`  Vol: ${t.volume}`);
            console.log(`  Open: ${t.openPrice} @ ${t.openTime}`);
            console.log(`  Close: ${t.closePrice} @ ${t.closeTime}`);
            console.log(`  Profit: ${t.profit}`);
            console.log(`  Swap: ${t.swap}`);
            console.log(`  Comm: ${t.commission}`);
            console.log(`  Net: ${t.netProfit}`);
            console.log("--------------------------------");
        });
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
