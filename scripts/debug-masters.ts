
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    console.log("Searching for 'Numsin Ke'...");
    const masters = await prisma.masterProfile.findMany({
        where: { name: { contains: "Numsin" } }
    });
    console.log(`Found ${masters.length} matches:`);
    masters.forEach(m => console.log(`- ID: ${m.id}, Name: ${m.name}, UserID: ${m.userId}`));
}

main()
    .catch((e) => console.error(e))
    .finally(async () => {
        await prisma.$disconnect();
    });
