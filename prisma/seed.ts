
import { PrismaClient, UserRole } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
    console.log('🌱 Starting Seeding...')

    // 1. Clean up (Skipped - DB is fresh)
    // await prisma.user.deleteMany()

    // 2. Create Masters
    const masters = [
        {
            name: 'Numsin Ke',
            email: 'numsin_v2@example.com',
            avatar: 'https://api.dicebear.com/9.x/notionists/svg?seed=Numsin',
            tags: ['DayTrading', 'Scalping'],
            roi: 120.5,
            winRate: 68,
            desc: 'New Master',
            fee: 0,
            followers: 0,
            aum: 0,
            riskScore: 5,
            minDeposit: 10,
            leverage: 1000 // ✅ Test Case
        },
        {
            name: 'Alex "Sniper" Chen',
            email: 'alex@example.com',
            avatar: 'https://api.dicebear.com/9.x/notionists/svg?seed=Alex',
            tags: ['Scalper', 'XAUUSD', 'High Risk'],
            roi: 145.5,
            winRate: 78,
            desc: 'Specialized in Gold scalping during NY session. 5 years experience.',
            fee: 50,
            followers: 1240,
            aum: 500000,
            riskScore: 8,
            minDeposit: 500
        }
    ]

    for (const m of masters) {
        // 🗑️ Ensure clean update by deleting first
        try {
            await prisma.user.delete({ where: { email: m.email } });
        } catch (e) { }

        try {
            const user = await prisma.user.upsert({
                where: { email: m.email },
                update: {
                    // If user exists, try to add the broker account if it's Numsin
                    brokerAccounts: m.name === 'Numsin Ke' ? {
                        create: {
                            server: 'Exness-Real',
                            login: '123456',
                            password: 'encrypted',
                            leverage: 0, // ✅ Test Case: 0 (N/A)
                            balance: 10000,
                            equity: 10000,
                            status: 'CONNECTED'
                        }
                    } : undefined
                },
                create: {
                    name: m.name,
                    email: m.email,
                    image: m.avatar,
                    role: 'MASTER',
                    // ✅ Correctly Link Broker Account to User
                    brokerAccounts: m.name === 'Numsin Ke' ? {
                        create: {
                            server: 'Exness-Real',
                            login: '123456',
                            password: 'encrypted',
                            leverage: 1000,
                            balance: 10000,
                            equity: 10000,
                            status: 'CONNECTED'
                        }
                    } : undefined,
                    masterProfile: {
                        create: {
                            name: m.name,
                            desc: m.desc,
                            avatar: m.avatar,
                            tags: m.tags,
                            monthlyFee: m.fee,
                            roi: m.roi,
                            winRate: m.winRate,
                            followersCount: m.followers,
                            aum: m.aum,
                            riskScore: m.riskScore,
                            minDeposit: m.minDeposit,
                            isPublic: true
                        }
                    }
                }
            })
            console.log(`✅ Created/Updated Master: ${user.name}`)
        } catch (err: any) {
            console.error(`❌ Failed to seed ${m.name}:`, err.code, err.message)
        }
    }

    // 3. Create Follower (User)
    try {
        const me = await prisma.user.create({
            data: {
                name: 'Demo User',
                email: 'user@example.com',
                role: 'FOLLOWER',
                image: 'https://api.dicebear.com/9.x/notionists/svg?seed=Felix',
                walletBalance: 10000
            }
        })
        console.log(`✅ Created Follower: ${me.name} (ID: ${me.id})`)
    } catch (e) {
        console.log("⚠️ Follower already exists or creation failed.")
    }

    console.log('🎉 Seeding Complete!')
}

main()
    .then(async () => {
        await prisma.$disconnect()
    })
    .catch(async (e) => {
        console.error(e)
        await prisma.$disconnect()
        process.exit(1)
    })
