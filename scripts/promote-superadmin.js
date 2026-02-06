const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const username = process.argv[2];
  
  if (!username) {
    console.log('Usage: node scripts/promote-superadmin.js <username>');
    process.exit(1);
  }

  try {
    const user = await prisma.user.update({
      where: { username },
      data: { role: 'superadmin' },
    });
    console.log(`Success! User '${user.username}' is now a superadmin.`);
  } catch (e) {
    if (e.code === 'P2025') {
      console.error(`Error: User '${username}' not found.`);
    } else {
      console.error('Error updating user:', e);
    }
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
