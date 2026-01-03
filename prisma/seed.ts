
import { PrismaClient, UserRole } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
    console.log('🌱 Starting Seeding...')

    // 1. Clean up
    await prisma.user.deleteMany()

    // 2. Create Masters
    const masters = [
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
        },
        {
            name: 'Sarah Conservative',
            email: 'sarah@example.com',
            avatar: 'https://api.dicebear.com/9.x/notionists/svg?seed=Sarah',
            tags: ['Swing', 'Forex', 'Low Drawdown'],
            roi: 24.0,
            winRate: 65,
            desc: 'Slow and steady wins the race. Strict risk management (1% per trade).',
            fee: 30,
            followers: 850,
            aum: 250000,
            riskScore: 3,
            minDeposit: 100
        },
        {
            name: 'Crypto King',
            email: 'king@example.com',
            avatar: 'https://api.dicebear.com/9.x/notionists/svg?seed=King',
            tags: ['Crypto', 'BTC', 'Volatile'],
            roi: 320.1,
            winRate: 45,
            desc: 'High variance crypto trading. Not for the faint of heart.',
            fee: 100,
            followers: 3200,
            aum: 1200000,
            riskScore: 9,
            minDeposit: 1000
        }
    ]

    for (const m of masters) {
        const user = await prisma.user.create({
            data: {
                name: m.name,
                email: m.email,
                image: m.avatar,
                role: 'MASTER',
                isVip: true,
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
                        isPublic: true,
                        drawdown: Math.floor(Math.random() * 10) + 1
                    }
                }
            }
        })
        console.log(`✅ Created Master: ${user.name}`)
    }

    // 3. Create Follower (User)
    const me = await prisma.user.create({
        data: {
            name: 'Demo User',
            email: 'user@example.com',
            role: 'FOLLOWER',
            image: 'https://api.dicebear.com/9.x/notionists/svg?seed=Felix',
            goldenTickets: 3,
            walletBalance: 10000,
            // @ts-ignore: Schema update pending
            userPromotion: {
                create: {
                    welcomeUsed: false,
                    dailyUsed: false,
                    isVipActive: false
                }
            }
        }
    })
    console.log(`✅ Created Follower: ${me.name} (ID: ${me.id})`)

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
