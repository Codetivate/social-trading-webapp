/**
 * 🧹 Cleanup Script: Remove Mock/Seed Masters
 * Run: npx ts-node prisma/cleanup.ts
 */

import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
    console.log('🧹 Starting Database Cleanup...')

    // 1. Delete ALL mock domain users (@mock.com, @example.com)
    console.log('🔍 Finding mock users...')

    const mockUsers = await prisma.user.findMany({
        where: {
            OR: [
                { email: { endsWith: '@mock.com' } },
                { email: { endsWith: '@example.com' } },
            ]
        },
        select: { id: true, email: true, name: true }
    })

    console.log(`Found ${mockUsers.length} mock users to delete`)

    // 2. Delete Mock Users (Cascade deletes profiles, sessions, etc.)
    for (const user of mockUsers) {
        try {
            await prisma.user.delete({
                where: { id: user.id },
            })
            console.log(`✅ Deleted mock user: ${user.name} (${user.email})`)
        } catch (e: any) {
            console.error(`❌ Error deleting ${user.email}:`, e.message)
        }
    }

    // 3. Optional: Clean up orphaned data
    console.log('\n🔍 Checking for orphaned data...')

    // Delete MasterProfiles where user doesn't exist
    const orphanedProfiles = await prisma.masterProfile.findMany({
        where: {
            user: undefined
        }
    }).catch(() => [])

    if (orphanedProfiles.length > 0) {
        console.log(`Found ${orphanedProfiles.length} orphaned profiles`)
    }

    // 4. List remaining real users
    const realUsers = await prisma.user.findMany({
        select: {
            id: true,
            email: true,
            name: true,
            role: true,
        },
        take: 20
    })

    console.log('\n📋 Remaining Real Users:')
    realUsers.forEach(u => {
        console.log(`   - ${u.name} (${u.email}) [${u.role}]`)
    })

    console.log('\n🎉 Cleanup Complete!')
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
