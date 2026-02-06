const { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient()

async function main() {
  const admin = await prisma.user.upsert({
    where: { username: 'admin' },
    update: {},
    create: {
      username: 'admin',
      password: 'admin', // In production, use hashed password
      role: 'admin',
    },
  })

  const superadmin = await prisma.user.upsert({
    where: { username: 'superadmin' },
    update: {},
    create: {
      username: 'superadmin',
      password: 'superadmin', // In production, use hashed password
      role: 'superadmin',
    },
  })
  console.log({ admin, superadmin })
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
