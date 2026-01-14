import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = 'force-dynamic'; // ⚡ FORCE NO CACHING
export const revalidate = 0;

export async function POST(req: NextRequest) {
    try {
        const session = await auth();

        if (!session?.user?.id) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const body = await req.json();
        const { server, login, password } = body;

        if (!server || !login || !password) {
            return NextResponse.json({ error: "Missing fields" }, { status: 400 });
        }

        const userId = session.user.id;

        // 🛡️ VERIFY CREDENTIALS (Python Script)
        // Spawn a python process to check connection nicely
        let verificationResult: any = {};
        try {
            const { spawn } = require('child_process');
            const pythonProcess = spawn('python', [
                'src/engine/verify.py',
                '--login', login,
                '--password', password,
                '--server', server
            ]);

            verificationResult = await new Promise((resolve) => {
                let dataString = '';
                pythonProcess.stdout.on('data', (data: any) => {
                    dataString += data.toString();
                });

                pythonProcess.on('close', (code: number) => {
                    try {
                        resolve(JSON.parse(dataString));
                    } catch (e) {
                        // Fallback for non-JSON output
                        resolve({ success: code === 0, error: "Validation Script Failed" });
                    }
                });
            });

            if (!verificationResult.success) {
                return NextResponse.json({
                    error: `Broker Connection Failed: ${verificationResult.error || 'Unknown Error'}`
                }, { status: 400 });
            }

        } catch (e) {
            console.error("Verification Spawn Failed:", e);
            // Optional: allow bypass if script fails? No, stricter is better.
            return NextResponse.json({ error: "Verification Service Unavailable" }, { status: 500 });
        }

        // Check for existing account
        const existing = await prisma.brokerAccount.findFirst({
            where: { userId }
        });

        // 📊 Extract Verify Data
        const vData = verificationResult.data || {};
        const balance = vData.balance || 0;
        const equity = vData.equity || 0;
        const leverage = vData.leverage || 0;

        let account: any;
        if (existing) {
            account = await prisma.brokerAccount.update({
                where: { id: existing.id },
                data: {
                    server,
                    login,
                    password,
                    status: "CONNECTED",
                    balance: balance,
                    equity: equity,
                    leverage: leverage,
                    updatedAt: new Date(),
                }
            });
        } else {
            account = await prisma.brokerAccount.create({
                data: {
                    userId: session.user.id,
                    server,
                    login,
                    password,
                    status: "CONNECTED",
                    balance: balance,
                    equity: equity,
                    leverage: leverage,
                }
            });
        }

        // 📜 IMPORT HISTORY (Background)
        let importedDeposits = 0;
        let importedWithdrawals = 0;

        if (vData.history && Array.isArray(vData.history)) {
            // Processing deals to generic TradeHistory (Best Effort)
            const historyOps = vData.history
                .map((h: any) => {
                    let masterId = "SELF";
                    // Try to parse Master from comment "CPY:..."
                    if (h.comment && h.comment.startsWith("CPY")) {
                        masterId = "IMPORTED";
                    }

                    // Determine Type
                    let pType = h.type === 0 ? "BUY" : (h.type === 1 ? "SELL" : "UNKNOWN");
                    if (h.type === 2) { // MT5 Balance Deal
                        if (h.profit >= 0) {
                            pType = "DEPOSIT";
                            importedDeposits += h.profit;
                        } else {
                            pType = "WITHDRAWAL";
                            importedWithdrawals += (h.profit); // Usually negative
                        }
                    }

                    return prisma.tradeHistory.upsert({
                        where: { id: `hist_${h.ticket}_${h.time}` }, // Unique ID Key
                        update: {}, // Skip if exists
                        create: {
                            id: `hist_${h.ticket}_${h.time}`, // Unique ID
                            followerId: userId,
                            masterId: masterId,
                            brokerAccountId: account.id, // Link to Account
                            symbol: h.symbol || "BALANCE",
                            ticket: String(h.ticket),
                            deal: String(h.ticket),
                            type: pType,
                            volume: h.volume,
                            openPrice: 0,
                            closePrice: h.price,
                            openTime: new Date(h.time * 1000),
                            closeTime: new Date(h.time * 1000),
                            profit: h.profit,
                            swap: h.swap,
                            commission: h.commission,
                            netProfit: h.profit + h.swap + h.commission
                        }
                    }).catch(err => console.error("History Import Skip:", err.message));
                });

            // Execute parallel
            Promise.all(historyOps).then(async () => {
                console.log(`[IMPORT] Imported ${historyOps.length} records.`);

                // Update Totals on Account
                await prisma.brokerAccount.update({
                    where: { id: account.id },
                    data: {
                        totalDeposits: importedDeposits,
                        totalWithdrawals: Math.abs(importedWithdrawals)
                    }
                });

                // 🚀 TRIGGER FULL HISTORY SYNC (Background)
                console.log("[CONNECT] Spawning Full History Sync (Background)...");
                const { spawn } = require("child_process"); // Lazy import
                const pythonProcess = spawn("python", [
                    "src/engine/broadcaster.py",
                    "--user-id", userId,
                    "--sync-history", "3650", // 10 Years (Optimized)
                    "--exit-after-sync"
                ], { detached: true, stdio: "ignore", windowsHide: true });
                pythonProcess.unref();

            });
        }

        return NextResponse.json({ status: "OK", account });
    } catch (error) {
        console.error("Broker connection error:", error);
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
}
export async function GET(req: NextRequest) {
    try {
        // A. AUTH METHOD 1: USER SESSION (Frontend)
        const session = await auth();
        let userId = session?.user?.id;

        // B. AUTH METHOD 2: BRIDGE SECRET (Engine)
        if (!userId) {
            const secret = req.headers.get("x-bridge-secret");
            const bridgeUserId = req.headers.get("x-user-id");

            if (secret === process.env.BROKER_SECRET && bridgeUserId) {
                userId = bridgeUserId;
            } else {
                return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
            }
        }

        if (!userId) {
            return NextResponse.json({ error: "Missing User ID" }, { status: 400 });
        }

        // Check if account already exists AND is connected
        let account = await prisma.brokerAccount.findFirst({
            where: { userId, status: "CONNECTED" },
            select: {
                server: true,
                login: true,
                password: true, // ⚠️ Sending password to trusted local bridge only
                userId: true,   // ✅ Fetch Owner ID for session lookup
            }
        });

        // 🔄 FALLBACK: Lookup by MT5 Login (if userId failed)
        if (!account) {
            account = await prisma.brokerAccount.findFirst({
                where: { login: userId, status: "CONNECTED" }, // Treat the passed ID as a login
                select: {
                    server: true,
                    login: true,
                    password: true,
                    userId: true,
                }
            });
        }

        if (account) {
            // ✅ Update the userId to the real one so we can fetch sessions correctly
            userId = account.userId;
        }

        // 2. Fetch Active Sessions (for Real-Time UI UI)
        const activeSessions = await prisma.copySession.findMany({
            where: { followerId: userId, isActive: true },
            select: { id: true, masterId: true, type: true, expiry: true }
        });

        if (!account) {
            return NextResponse.json({ error: "No Broker Account Found" }, { status: 404 });
        }

        return NextResponse.json({ ...account, activeSessions });
    } catch (error) {
        console.error("Bridge fetch error:", error);
        return NextResponse.json({ error: "Internal Error" }, { status: 500 });
    }
}


export async function PUT(req: NextRequest) {
    try {
        const secret = req.headers.get("x-bridge-secret");
        const userId = req.headers.get("x-user-id");

        if (secret !== process.env.BROKER_SECRET) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
        if (!userId) return NextResponse.json({ error: "Missing User ID" }, { status: 400 });

        const body = await req.json();
        const { balance, equity, leverage, login, floating } = body;

        if (!login) {
            await prisma.brokerAccount.updateMany({
                where: { userId },
                data: { balance, equity, leverage, updatedAt: new Date() }
            });
        } else {
            await prisma.brokerAccount.updateMany({
                where: {
                    userId,
                    login: String(login)
                },
                data: {
                    balance,
                    equity,
                    leverage,
                    updatedAt: new Date()
                }
            });
        }

        if (floating && typeof floating === 'object') {
            const tickets = Object.keys(floating);

            // 1. Reset PnL for active sessions first
            await prisma.copySession.updateMany({
                where: { followerId: userId, isActive: true },
                data: { unrealizedPnL: 0 }
            });

            if (tickets.length > 0) {
                // 2. Find Signals
                const signals = await prisma.signal.findMany({
                    where: { ticket: { in: tickets } },
                    select: { ticket: true, masterId: true }
                });

                // 3. Aggregate PnL
                const masterPnlMap: Record<string, number> = {};
                signals.forEach(sig => {
                    const pnl = floating[sig.ticket] || 0;
                    masterPnlMap[sig.masterId] = (masterPnlMap[sig.masterId] || 0) + pnl;
                });

                // 4. Update Sessions
                for (const [masterId, pnl] of Object.entries(masterPnlMap)) {
                    await prisma.copySession.updateMany({
                        where: { followerId: userId, masterId: masterId, isActive: true },
                        data: { unrealizedPnL: pnl }
                    });
                }
            }
        }

        // 📈 PROESS OPEN POSITIONS (Sync)
        const { positions } = body;
        if (Array.isArray(positions)) {
            // Find existing broker account ID
            const brokerAccount = await prisma.brokerAccount.findFirst({
                where: { userId },
                select: { id: true }
            });

            if (brokerAccount) {
                const activeTickets = positions.map(p => BigInt(p.ticket));

                // 1. UPSERT ACTIVE POSITIONS
                for (const pos of positions) {
                    await prisma.position.upsert({
                        where: { ticket: BigInt(pos.ticket) },
                        update: {
                            symbol: pos.symbol,
                            volume: Number(pos.volume),
                            currentPrice: Number(pos.currentPrice),
                            profit: Number(pos.profit),
                            swap: Number(pos.swap),
                            commission: Number(pos.commission),
                            sl: pos.sl ? Number(pos.sl) : null,
                            tp: pos.tp ? Number(pos.tp) : null,
                            updatedAt: new Date()
                        },
                        create: {
                            ticket: BigInt(pos.ticket),
                            symbol: pos.symbol,
                            type: pos.type,
                            volume: Number(pos.volume),
                            openPrice: Number(pos.openPrice),
                            currentPrice: Number(pos.currentPrice),
                            profit: Number(pos.profit), // Floating PnL
                            swap: Number(pos.swap),
                            commission: Number(pos.commission),
                            sl: pos.sl ? Number(pos.sl) : null,
                            tp: pos.tp ? Number(pos.tp) : null,
                            openTime: new Date(Number(pos.openTime) * 1000), // MT5 Timestamp is seconds
                            brokerAccountId: brokerAccount.id
                        }
                    });
                }

                // 2. DELETE CLOSED POSITIONS (Not in payload)
                // If it's not in the 'positions' array from MT5, it's closed (or filtered out).
                // We delete positions associated with this BrokerAccount that are NOT in activeTickets
                await prisma.position.deleteMany({
                    where: {
                        brokerAccountId: brokerAccount.id,
                        ticket: { notIn: activeTickets }
                    }
                });
            }
        }

        return NextResponse.json({ status: "OK" });
    } catch (error) {
        console.error("Broker Update Error:", error);
        return NextResponse.json({ error: "Update Failed", details: String(error) }, { status: 500 });
    }
}
