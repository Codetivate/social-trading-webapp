
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function checkExpiryState() {
    try {
        console.log("🔍 Inspecting Active Sessions...");

        // 1. Find the target session
        const session = await prisma.copySession.findFirst({
            where: { isActive: true },
            orderBy: { createdAt: 'desc' },
            include: { master: { include: { masterProfile: true } } }
        });

        if (!session) {
            console.log("❌ No active session found.");
            return;
        }

        console.log(`\n📋 Found Active Session:`);
        console.log(`   ID: ${session.id}`);
        console.log(`   FollowerID: ${session.followerId}`);
        console.log(`   Master: ${session.master.masterProfile?.name}`);
        console.log(`   Type: ${session.type}`);
        console.log(`   AutoRenew: ${session.autoRenew}`);
        console.log(`   Expiry (JS Date): ${session.expiry}`);
        console.log(`   IsActive: ${session.isActive}`);

        // 2. Check DB Time
        const dbTimeRes: any = await prisma.$queryRaw`SELECT NOW() as db_time`;
        const dbTime = dbTimeRes[0].db_time;
        console.log(`\n🕒 DB Server Time: ${dbTime}`);

        // 3. Test the exact SQL Query used by Executor
        console.log(`\n🧪 Testing Executor SQL Query...`);

        // Replicating executor.py query logic
        const matches: any = await prisma.$queryRaw`
            SELECT "id", "masterId", "type", "expiry"
            FROM "CopySession"
            WHERE "followerId" = ${session.followerId}
              AND "isActive" = true
              AND "expiry" < NOW()
              AND (
                  "type" IN ('TRIAL_7DAY') 
                  OR "autoRenew" = false
              )
        `;

        if (matches.length > 0) {
            console.log("✅ MATCH FOUND! The DB Query sees it as expired.");
            console.log(matches);
            console.log("\n👉 If Engine isn't stopping it, CHECK THE ENGINE LOGS.");
            console.log("   It might be checking a different FollowerID or not polling.");
        } else {
            console.log("❌ NO MATCH. The SQL Query does NOT see it as expired.");
            console.log("   Reasons could be:");

            // Debug failure reason
            const s: any = session;
            if (new Date(s.expiry!) >= new Date(dbTime)) {
                console.log(`   - Expiry is NOT < NOW(). (Expiry: ${s.expiry}, Now: ${dbTime})`);
            }
            if (s.type !== 'TRIAL_7DAY' && s.type !== 'WELCOME' && s.autoRenew !== false) {
                console.log(`   - Type/Renew mismatch. (Type: ${s.type}, AutoRenew: ${s.autoRenew})`);
            }
        }

    } catch (error) {
        console.error("Error:", error);
    } finally {
        await prisma.$disconnect();
    }
}

checkExpiryState();
