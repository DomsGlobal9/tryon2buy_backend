require('dotenv').config();
const prisma = require('./lib/prisma');
const bcrypt = require('bcryptjs');

async function main() {
  const hash = await bcrypt.hash('doms123', 10);
  
  await prisma.vendor.upsert({
    where: { email: 'vendor@store.com' },
    update: { passwordHash: hash },
    create: {
      email: 'vendor@store.com',
      passwordHash: hash,
      name: 'Master Vendor',
      storeName: 'TryOn2Buy Master Store'
    }
  });
  
  console.log('Successfully updated vendor@store.com password to doms123');
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
