require('dotenv').config();
const prisma = require('./lib/prisma');
const bcrypt = require('bcryptjs');

async function main() {
  const email = 'vendor@store.com';
  const passwordHash = await bcrypt.hash('masterpassword', 10);
  await prisma.vendor.update({
    where: { email },
    data: { passwordHash }
  });
  console.log('Password updated successfully');
}

main().catch(console.error).finally(() => prisma.$disconnect());
