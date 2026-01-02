
import { PrismaClient } from '@prisma/client';
import { Analyst } from '../src/lib/ai/analyst';

const prisma = new PrismaClient();

async function main() {
    console.log("🧠 Starting AI Analysis Job...");

    // 1. Fetch Masters
    const masters = await prisma.user.findMany({
        where: { role: 'MASTER' },
        include: {
            masterProfile: true,
            brokerAccounts: true
        }
    });

    console.log(`🔎 Analyzing ${masters.length} Masters...`);

    for (const master of masters) {
        if (!master.masterProfile) continue;

        // 2. Fetch Recent Signals (Last 50)
        const signals = await prisma.signal.findMany({
            where: { masterId: master.id },
            take: 50,
            orderBy: { createdAt: 'desc' }
        });

        if (signals.length === 0) {
            console.log(`   - ${master.name}: No trades yet.`);
            continue;
        }

        // 3. Get Equity Data
        // Ideally we track historical equity. For now using current.
        const account = master.brokerAccounts[0]; // Primary account
        const currentEquity = account?.equity || 10000;
        const maxEquity = Math.max(currentEquity, 10000); // Mock peak

        // 4. Run Analysis
        const riskScore = Analyst.calculateRiskScore(signals, currentEquity, maxEquity);
        const tags = Analyst.generateTags(signals);

        // Mock Win Rate/ROI for demo visualization
        const mockWinRate = 50 + Math.random() * 40; // 50-90%
        const mockRoi = (Math.random() * 200) - 50; // -50% to +150%

        console.log(`   - ${master.name}: Risk ${riskScore}/100 | Tags: [${tags.join(', ')}]`);

        // 5. Update Profile
        await prisma.masterProfile.update({
            where: { id: master.masterProfile.id },
            data: {
                riskScore: riskScore,
                tags: tags,
                winRate: Math.round(mockWinRate),
                roi: Math.round(mockRoi)
            }
        });
    }

    console.log("✅ Analysis Complete.");
}

main()
    .catch(e => console.error(e))
    .finally(async () => await prisma.$disconnect());
