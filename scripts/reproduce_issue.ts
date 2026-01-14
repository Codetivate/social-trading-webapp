
import { startCopySession } from '../src/app/actions/trade';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    // Follower: cea89d76-eacd-42a2-a4e3-b935352d9734 (Login 11062253)
    // Master: e3a37995-7718-4123-a986-8b9f4a07b55e (Login 334564084)
    const followerId = 'cea89d76-eacd-42a2-a4e3-b935352d9734';
    const masterId = 'e3a37995-7718-4123-a986-8b9f4a07b55e';

    console.log("🛠️ Testing Backend Logic Directly...");

    // 1. Force explicit TimeConfig with EQUITY mode
    const timeConfig = {
        mode: "24/7",
        start: "09:00",
        end: "17:00",
        copyMode: "EQUITY" // 👈 The test subject
    };

    console.log("   -> Calling startCopySession with:", JSON.stringify(timeConfig));

    const result = await startCopySession(
        followerId,
        masterId,
        5000,   // Amount
        100,    // Risk
        "DAILY",
        true,   // AutoRenew
        timeConfig,
        undefined,
        undefined,
        false   // Invert
    );

    console.log("   -> Result:", result.success ? "SUCCESS" : "FAILED", result.error || "");

    if (result.success) {
        // Verify DB
        const session = await prisma.copySession.findFirst({
            where: { followerId, masterId },
            orderBy: { createdAt: 'desc' }
        });
        console.log("   -> [VERIFY] DB TimeConfig:", session?.timeConfig);

        const dbConfig = session?.timeConfig as any;
        if (dbConfig?.copyMode === "EQUITY") {
            console.log("   ✅ SUCCESS: Persistence Verified!");
        } else {
            console.log("   ❌ FAILED: Persistence Lost!");
        }
    }
}

main()
    .catch(console.error)
    .finally(async () => await prisma.$disconnect());
