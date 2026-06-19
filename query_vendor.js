require('dotenv').config();
const prisma = require('./lib/prisma');

async function checkVendor() {
  const vendor = await prisma.vendor.findUnique({
    where: { email: 'vendor@store.com' },
    include: {
      garments: {
        orderBy: { createdAt: 'desc' }
      },
      generations: {
        orderBy: { createdAt: 'desc' },
        take: 5
      }
    }
  });

  if (!vendor) {
    console.log("No vendor found with email vendor@store.com");
    return;
  }

  console.log(`\n=== Vendor: ${vendor.storeName || vendor.name || 'Unnamed'} (${vendor.email}) ===`);
  console.log(`\n👗 Garments Uploaded: ${vendor.garments.length}`);
  vendor.garments.forEach((g, i) => {
    const status = g.status === 'READY' ? '✅ READY' : (g.status === 'FAILED' ? '❌ FAILED' : '⏳ PENDING');
    const image = g.metadata?.front_view_url || g.metadata?.original_image_url || g.label || 'No Image';
    console.log(`  ${i+1}. [${status}] ${g.category || 'NO_CATEGORY'} - ${image}`);
  });

  console.log(`\n✨ Tryon Generations: ${vendor.generations.length} total (Showing latest 5)`);
  vendor.generations.forEach((g, i) => {
    const status = g.status === 'COMPLETED' ? '✅ SUCCESS' : (g.status === 'FAILED' ? '❌ FAILED' : '⏳ PENDING');
    console.log(`  ${i+1}. [${status}] Mode: ${g.mode} | Result: ${g.resultImageUrl || 'None'}`);
  });
  
  await prisma.$disconnect();
}

checkVendor().catch(e => {
  console.error(e);
  prisma.$disconnect();
});
