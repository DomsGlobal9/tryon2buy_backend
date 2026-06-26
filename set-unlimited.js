require('dotenv').config();
const prisma = require('./lib/prisma');

async function main() {
  await prisma.vendor.update({
    where: { email: 'vendor@store.com' },
    data: { isUnlimited: true }
  });
  
  console.log('Successfully set vendor@store.com to isUnlimited: true');
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
