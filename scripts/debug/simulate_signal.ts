import fetch from 'node-fetch';

const BRIDGE_SECRET = process.env.BROKER_SECRET || "AlphaBravoCharlieDeltaEchoFoxtro";
const API_URL = "http://localhost:3000/api/webhook/signal";

const MASTER_ID = 397; // Forex King
const MOCK_TICKET = Math.floor(Math.random() * 1000000);

const signal = {
    masterId: MASTER_ID,
    ticket: MOCK_TICKET,
    symbol: "XAUUSD",
    action: "OPEN", // or CLOSE
    type: "BUY",   // or SELL
    lots: 1.0,
    price: 2025.50,
    sl: 2020.00,
    tp: 2040.00,
    comment: "E2E Test Signal"
};

async function sendSignal() {
    console.log(`🚀 Sending Signal [${signal.action} ${signal.type} ${signal.symbol}] for Master ${signal.masterId}...`);

    try {
        const res = await fetch(API_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-bridge-secret': BRIDGE_SECRET
            },
            body: JSON.stringify(signal)
        });

        const data = await res.json();
        console.log(`📬 Response [${res.status}]:`, data);

        if (res.status === 200) {
            console.log("✅ Signal Accepted by API.");
            console.log("👉 Now check Executor logs and Dashboard.");
        } else {
            console.error("❌ Signal Rejected.");
        }

    } catch (e) {
        console.error("🔥 Network Error:", e);
    }
}

sendSignal();
