
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    console.log("🔍 Finding a Master Profile...");
    const master = await prisma.masterProfile.findFirst();

    if (!master) {
        console.error("❌ No Master Profile found! Please run seed_masters.ts first.");
        process.exit(1);
    }

    console.log(`✅ Found Master: ${master.id} (Broker Account: ${master.brokerAccountId})`);

    // Payload mimicking MT5 Broadcaster
    const payload = {
        masterId: master.userId,
        ticket: Math.floor(Math.random() * 1000000).toString(), // String Ticket
        symbol: "EURUSD",
        action: "OPEN",
        type: "BUY",
        price: 1.1050,
        volume: 1.0,
        sl: 1.1000,
        tp: 1.1100
    };

    const BRIDGE_SECRET = process.env.BROKER_SECRET || "AlphaBravoCharlieDeltaEchoFoxtro";

    console.log("🚀 Sending Signal Payload:", payload);

    try {
        const response = await fetch("http://localhost:3000/api/webhook/signal", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "x-bridge-secret": BRIDGE_SECRET
            },
            body: JSON.stringify(payload)
        });

        const data = await response.json();
        console.log("📡 API Response:", response.status, data);

        if (response.ok) {
            console.log("✅ Signal accepted by API.");
        } else {
            console.error("❌ API Rejected Signal:", data);
        }
    } catch (error) {
        console.error("❌ Network Error:", error);
    } finally {
        await prisma.$disconnect();
    }
}

main();
