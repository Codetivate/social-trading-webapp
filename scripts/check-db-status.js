// @ts-nocheck
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function check() {
    try {
        const users = await prisma.user.findMany({
            where: { id: { in: ['cea89d76-eacd-42a2-a4e3-b935352d9734', 'e3a37995-7718-4123-a986-8b9f4a07b55e'] } }
        });
        console.log("Users Found:", users.length);
        users.forEach(u => {
            console.log(`- ID: ${u.id} | Email: ${u.email} | Role: ${u.role}`);
        });
    } catch (e) {
        console.error(e);
    }
}

check().finally(() => prisma.$disconnect());
