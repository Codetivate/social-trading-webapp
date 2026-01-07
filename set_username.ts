const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    const PROFILE_ID = 20;
    const USERNAME = "flowcon";

    console.log(`Searching for MasterProfile ID ${PROFILE_ID}...`);

    const profile = await prisma.masterProfile.findUnique({
        where: { id: PROFILE_ID }
    });

    if (!profile) {
        console.error(`❌ Profile ID ${PROFILE_ID} not found!`);
        return;
    }

    console.log(`Found profile: ${profile.name} (Current Username: ${profile.username})`);

    const updated = await prisma.masterProfile.update({
        where: { id: PROFILE_ID },
        data: {
            username: USERNAME,
            isPublic: true // Ensure it's public
        }
    });

    console.log(`✅ SUCCESS: Updated Profile ${updated.id} -> Username: "${updated.username}"`);
}

main()
    .catch(e => console.error(e))
    .finally(async () => await prisma.$disconnect());
