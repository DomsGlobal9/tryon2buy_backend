require('dotenv').config();
const prisma = require('./lib/prisma');
const bcrypt = require('bcryptjs');

async function main() {
  const email = 'vendor@store.com';
  const existingVendor = await prisma.vendor.findUnique({ where: { email } });

  if (!existingVendor) {
    const passwordHash = await bcrypt.hash('masterpassword', 10);
    const vendor = await prisma.vendor.create({
      data: {
        email,
        passwordHash,
        name: 'Master Vendor',
        storeName: 'TryOn Master Gallery',
        tryonCredits: 9999,
        isUnlimited: true
      },
    });
    console.log(`Created Master Vendor: ${vendor.email} with ID ${vendor.id}`);
  } else {
    // Ensure they have unlimited status
    await prisma.vendor.update({
      where: { email },
      data: { isUnlimited: true }
    });
    console.log(`Master Vendor ${existingVendor.email} already exists. Updated to unlimited.`);
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
