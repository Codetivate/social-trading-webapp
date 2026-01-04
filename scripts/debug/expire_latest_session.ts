
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function expireLatestSession() {
    try {
        // Find the active session for 'Crypto King' (or just the latest active one)
        const session = await prisma.copySession.findFirst({
            where: {
                isActive: true,
                master: {
                    masterProfile: {
                        name: { contains: "Crypto" } // Target the user's master
                    }
                }
            },
            include: {
                master: { include: { masterProfile: true } }
            },
            orderBy: { createdAt: 'desc' }
        });

        if (!session) {
            console.log("❌ No active 'Crypto King' session found.");
            console.log("   Trying ANY active session...");
            const typeAny = await prisma.copySession.findFirst({
                where: { isActive: true },
                include: { master: { include: { masterProfile: true } } }
            });
            if (!typeAny) {
                console.log("❌ No active sessions at all.");
                return;
            }
            // Use this one if found
            return setExpiry(typeAny);
        }

        await setExpiry(session);

    } catch (error) {
        console.error("Error expiring session:", error);
    } finally {
        await prisma.$disconnect();
    }
}

async function setExpiry(session: any) {
    console.log(`🔍 Found Active Session: ID ${session.id}`);
    console.log(`   Master: ${session.master.masterProfile?.name || session.masterId}`);
    console.log(`   Current Expiry: ${session.expiry}`);

    // Set expiry to 60 SECONDS IN FUTURE
    const future = new Date(Date.now() + 65000); // 65s to be safe

    await prisma.copySession.update({
        where: { id: session.id },
        data: {
            expiry: future
        }
    });

    console.log(`✅ Session ${session.id} Updated!`);
    console.log(`   New Expiry: ${future.toISOString()} (In ~60 seconds)`);
    console.log(`\n👉 GO TO THE UI NOW! You should see the timer counting down.`);
    console.log(`   Wait 1 minute, and the Engine will kill it.`);
}
// expireLatestSession(); // Renamed key func to call properly


expireLatestSession();
