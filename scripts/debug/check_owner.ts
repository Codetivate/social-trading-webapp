
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function check() {
    const s = await prisma.copySession.findUnique({ where: { id: 22 } });
    if (!s) return console.log("No Session 22");

    const target = "e4c9c90a-004f-4763-a9e6-7e8ab6dbb654"; // ID from logs
    const match = s.followerId === target;

    console.log(`Session 22 Owner: ${s.followerId}`);
    console.log(`Engine Target : ${target}`);
    console.log(`MATCH: ${match ? "YES" : "NO"}`);
    console.log(`IsActive: ${s.isActive}`);
    console.log(`AutoRenew: ${s.autoRenew}`);
}
check();
