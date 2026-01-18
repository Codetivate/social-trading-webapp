import { prisma } from "@/lib/prisma";
import * as fs from 'fs';

export type SignalPayload = {
    masterId: string;
    ticket: string; // ✅ String to prevent overflow
    symbol: string;
    action: "OPEN" | "MODIFY" | "CLOSE";
    type?: "BUY" | "SELL";
    price?: number;
    volume?: number;
    sl?: number;
    tp?: number;
    // 📊 PnL Data (on Close)
    openPrice?: number;
    openTime?: number; // ✅ UNIX Timestamp from MT5
    profit?: number;
    swap?: number;
    commission?: number;
    closeTime?: number;
};

export class SmartRouter {
    /**
     * Entry point for all incoming master signals.
     * 1. Validates the signal.
     * 2. Finds active followers.
     * 3. Calculates position size (risk management).
     * 4. Dispatches to execution queue (or direct execution).
     */
    static async dispatch(signal: SignalPayload) {
        fs.appendFileSync('debug.log', `[SmartRouter] Dispatching ticket ${signal.ticket} from Master ${signal.masterId}\n`);
        console.log(`[SmartRouter] 🚀 Processing ${signal.action} for ${signal.symbol} (Master: ${signal.masterId})`);

        // 0. 💾 PERSIST MASTER HISTORY (If Close & PnL provided)
        if (signal.action === "CLOSE" && signal.profit !== undefined) {
            try {
                // Check if already exists to avoid dupes
                const exists = await prisma.tradeHistory.findFirst({
                    where: { ticket: signal.ticket, followerId: signal.masterId }
                });

                if (!exists) {
                    await prisma.tradeHistory.create({
                        data: {
                            followerId: signal.masterId, // Self-Referential for Master Record
                            masterId: signal.masterId,
                            ticket: String(signal.ticket),
                            symbol: signal.symbol,
                            type: signal.type || "UNKNOWN",
                            volume: Number(signal.volume || 0),
                            openPrice: Number(signal.openPrice || 0),
                            closePrice: Number(signal.price || 0),
                            openTime: signal.openTime ? new Date(signal.openTime * 1000) : new Date(), // ✅ Use real Open Time
                            closeTime: signal.closeTime ? new Date(signal.closeTime * 1000) : new Date(),
                            profit: Number(signal.profit),
                            commission: Number(signal.commission || 0),
                            swap: Number(signal.swap || 0),
                            netProfit: Number(signal.profit) + Number(signal.commission || 0) + Number(signal.swap || 0)
                        }
                    });
                    console.log(`[SmartRouter] 📜 Persisted Master Trade History: ${signal.ticket}`);
                } else if (exists.closePrice === 0 && Number(signal.price || 0) > 0) {
                    // 🩹 HEAL ZERO PRICE
                    await prisma.tradeHistory.update({
                        where: { id: exists.id },
                        data: {
                            closePrice: Number(signal.price),
                            netProfit: Number(signal.profit) + Number(signal.commission || 0) + Number(signal.swap || 0)
                        }
                    });
                    console.log(`[SmartRouter] 🩹 Healed Zero Price for ${signal.ticket}: ${signal.price}`);
                }
            } catch (e) {
                console.error("[SmartRouter] Failed to persist master history:", e);
            }
        }

        // 1. Find Active Copy Sessions for this Master
        const sessions = await prisma.copySession.findMany({
            where: {
                masterId: signal.masterId,
                isActive: true
            },
            include: {
                follower: {
                    select: { id: true, name: true }
                }
            }
        });

        fs.appendFileSync('debug.log', `[SmartRouter] Found ${sessions.length} sessions for master ${signal.masterId}\n`);
        console.log(`[SmartRouter] 🔎 Found ${sessions.length} active followers.`);

        // 2. Dispatch to each follower (Sequentially to prevent race conditions)
        for (const session of sessions) {
            await this.routeToFollower({
                id: session.follower.id,
                name: session.follower.name ?? "Valued Trader"
            }, signal, session);
        }
    }

    private static async routeToFollower(follower: { id: string, name: string }, signal: SignalPayload, session: any) {
        try {
            // 🔒 IDEMPOTENCY CHECK: Ensure we haven't processed this ticket for this follower yet
            const existing = await prisma.signal.findFirst({
                where: {
                    followerId: follower.id,
                    ticket: signal.ticket, // ✅ Direct String
                    action: signal.action
                },
                select: { id: true } // 🧹 Force new query plan
            });

            if (existing) {
                console.log(`   ⏭️ Skipping duplicate signal for ${follower.name} (Ticket: ${signal.ticket})`);
                return true;
            }

            console.log(`   🔍 Calculating volume for ${follower.name}...`);
            let masterAccount = null;
            let followerAccount = null;

            try {
                // 1. Fetch Balances (Safe Fetch)
                [masterAccount, followerAccount] = await Promise.all([
                    prisma.brokerAccount.findFirst({ where: { userId: signal.masterId } }),
                    prisma.brokerAccount.findFirst({ where: { userId: follower.id } })
                ]);
            } catch (dbError) {
                console.error(`   ⚠️ Failed to fetch accounts for sizing:`, dbError);
                // Continue with default volume
            }

            let finalVolume = 0.01;

            if (masterAccount?.balance && followerAccount?.balance && signal.volume) {
                // 🏦 SHADOW EQUITY LOGIC
                // If allocation is set, we treat that as the "Account Size" for this master loop.
                const followerEquity = (session.allocation && session.allocation > 0)
                    ? session.allocation
                    : followerAccount.balance;

                // Calculate Ratio
                // Example: Allocation 1000 / Master 10000 = 0.1
                const balanceRatio = followerEquity / masterAccount.balance;
                const riskFactor = session.riskFactor || 1.0;

                // Raw Volume = 0.1 (Master Vol) * 0.1 (Ratio) * 1.0 (Risk) = 0.01
                let rawVolume = signal.volume * balanceRatio * riskFactor;

                // Round to 2 decimals
                finalVolume = Math.round(rawVolume * 100) / 100;

                console.log(`   🧮 Calc (Shadow Equity: ${followerEquity}): ${signal.volume} * (${followerEquity}/${masterAccount.balance}) = ${rawVolume.toFixed(4)} => ${finalVolume}`);
            } else {
                console.log(`   ⚠️ Missing balance data. Defaulting to 0.01 Lots to be safe.`);
            }

            // 🛑 Constraint 1: Minimum Volume Floor (0.01)
            finalVolume = Math.max(0.01, finalVolume);

            // 🛑 Constraint 2: Maximum Volume Cap (Absolute Safety Cap based on Master's Volume)
            // Even if Follower has 1M balance, we don't exceed what the Master traded if that's the logic desired.
            // Or usually, it's capped by "Master's Volume" to avoid whale manipulation?
            // User Request: "guard check Max Order based on the master only"
            if (signal.volume) {
                finalVolume = Math.min(finalVolume, signal.volume);
            }

            console.log(`   👉 Routing to ${follower.name} (${follower.id}): ${signal.action} ${finalVolume} lots`);

            // Persist to Database (Persistent Queue)
            await prisma.signal.create({
                data: {
                    followerId: follower.id,
                    masterId: signal.masterId, // Internal User ID
                    ticket: String(signal.ticket), // ✅ String Ticket
                    symbol: signal.symbol,
                    action: signal.action,
                    type: signal.type ?? null,
                    volume: finalVolume,
                    price: signal.price ?? null, // Important for Slippage Check
                    sl: signal.sl ?? null,
                    tp: signal.tp ?? null,
                    status: "PENDING"
                }
            });

            return true;
        } catch (error: any) {
            fs.appendFileSync('debug.log', `[SmartRouter] ❌ Error routing to ${follower.name}: ${error?.message}\n`);
            console.error(`   ❌ Failed to route to ${follower.name}`, error);
            return false;
        }
    }
}
