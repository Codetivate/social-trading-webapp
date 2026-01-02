"use server";

import { prisma } from "@/lib/prisma";
import { auth } from "@/auth"; // Server-side auth helper
import crypto from "crypto";
import { revalidatePath } from "next/cache";

// 🔐 ENCRYPTION CONFIG
const ALGORITHM = "aes-256-cbc";
const ENCRYPTION_KEY = process.env.BROKER_SECRET || "01234567890123456789012345678901"; // Must be 32 chars
const IV_LENGTH = 16;

function encrypt(text: string) {
    if (!text) return "";
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv(ALGORITHM, Buffer.from(ENCRYPTION_KEY), iv);
    let encrypted = cipher.update(text);
    encrypted = Buffer.concat([encrypted, cipher.final()]);
    return iv.toString("hex") + ":" + encrypted.toString("hex");
}

export async function connectBroker(formData: FormData) {
    const session = await auth();
    if (!session?.user?.id) {
        return { error: "Unauthorized" };
    }

    const login = formData.get("login") as string;
    const server = formData.get("server") as string;
    const password = formData.get("password") as string;
    // const platform = formData.get("platform") as string; // 'mt5' or 'mt4' - unused for now

    if (!login || !server || !password) {
        return { error: "Missing fields" };
    }

    try {
        // 1. Check if already exists for this user
        const existing = await prisma.brokerAccount.findFirst({
            where: { userId: session.user.id, login, server }
        });

        if (existing) {
            return { error: "Broker account already connected" };
        }

        // 2. Encrypt Password
        const encryptedPassword = encrypt(password);

        // 3. Save to DB
        const newAccount = await prisma.brokerAccount.create({
            data: {
                userId: session.user.id,
                login,
                server,
                password: encryptedPassword,
                status: "CONNECTED",
                executionMethod: "SELF_HOSTED"
            }
        });

        // 4. Handle Master Switch Logic 🔄
        // If user is a MASTER, this new account becomes their broadcasting source.
        const user = await prisma.user.findUnique({
            where: { id: session.user.id },
            include: { masterProfile: true }
        });

        if (user?.role === "MASTER" && user.masterProfile) {
            console.log(`Master ${user.name} switched account. Resetting stats...`);

            // Link NEW broker & RESET stats
            await prisma.masterProfile.update({
                where: { userId: session.user.id },
                data: {
                    brokerAccountId: newAccount.id,
                    roi: 0,
                    winRate: 0,
                    drawdown: 0,
                    followersCount: 0
                }
            });

            // Cancel active sessions
            await prisma.copySession.updateMany({
                where: { masterId: session.user.id, isActive: true },
                data: { isActive: false }
            });
        }

        revalidatePath("/dashboard");
        return { success: true };

    } catch (error) {
        console.error("Connect Broker Error:", error);
        return { error: "Failed to connect broker" };
    }
}

export async function getBrokerAccount() {
    const session = await auth();
    if (!session?.user?.id) return null;

    try {
        const account = await prisma.brokerAccount.findFirst({
            where: { userId: session.user.id, status: "CONNECTED" }, // Prioritize CONNECTED accounts
            orderBy: { id: 'desc' }, // Get latest
            select: {
                id: true,
                server: true,
                login: true,
                status: true,
                balance: true,
                equity: true, // ✅ Added Equity
                currency: true
            }
        });
        return account;
    } catch (error) {
        console.error("Get Broker Error:", error);
        return null;
    }
}
