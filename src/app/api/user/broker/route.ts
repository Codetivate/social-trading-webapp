import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

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

        // Check for existing account
        const existing = await prisma.brokerAccount.findFirst({
            where: { userId }
        });

        let account;
        if (existing) {
            account = await prisma.brokerAccount.update({
                where: { id: existing.id },
                data: {
                    server,
                    login,
                    password,
                    status: "CONNECTED",
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
                    balance: 10000.00,
                    equity: 10000.00,
                }
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
        const secret = req.headers.get("x-bridge-secret");
        const userId = req.headers.get("x-user-id");

        // 1. Validate Secret (Simple API Key for now)
        if (secret !== process.env.BROKER_SECRET) {
            return NextResponse.json({ error: "Invalid Bridge Secret" }, { status: 403 });
        }

        if (!userId) {
            return NextResponse.json({ error: "Missing User ID" }, { status: 400 });
        }

        // Check if account already exists
        const account = await prisma.brokerAccount.findFirst({
            where: { userId },
            select: {
                server: true,
                login: true,
                password: true // ⚠️ Sending password to trusted local bridge only
            }
        });

        if (!account) {
            return NextResponse.json({ error: "No Broker Account Found" }, { status: 404 });
        }

        return NextResponse.json(account);
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
        const { balance, equity, margin, leverage, login } = body;

        if (!login) {
            // Fallback: If no login provided, update FIRST account (Legacy behavior)
            // But ideally we should require login. For now, let's try to update based on login if present.
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

        return NextResponse.json({ status: "OK" });
    } catch (error) {
        return NextResponse.json({ error: "Update Failed" }, { status: 500 });
    }
}

