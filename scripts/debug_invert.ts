
import { PrismaClient } from '@prisma/client';
import fs from 'fs';

const prisma = new PrismaClient();

async function main() {
    const sessions = await prisma.copySession.findMany({
        where: { isActive: true },
        include: { follower: true, master: true }
    });

    const output = sessions.map(s => ({
        id: s.id,
        follower: s.follower.email,
        master: s.master.email,
        invertCopy: s.invertCopy
    }));

    fs.writeFileSync('debug_output.json', JSON.stringify(output, null, 2));
    console.log("Done.");
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
