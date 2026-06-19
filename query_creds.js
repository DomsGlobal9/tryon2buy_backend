require('dotenv').config();
const prisma = require('./lib/prisma');

async function getAllCreds() {
  console.log("\n=== VENDOR ACCOUNTS ===");
  const vendors = await prisma.vendor.findMany();
  if (vendors.length === 0) {
    console.log("No vendors found.");
  } else {
    vendors.forEach((v, i) => {
      console.log(`${i+1}. Email: ${v.email} | Store: ${v.storeName || v.name || 'Unnamed'}`);
    });
  }

  console.log("\n=== CUSTOMER ACCOUNTS ===");
  const customers = await prisma.customer.findMany();
  if (customers.length === 0) {
    console.log("No customers found.");
  } else {
    customers.forEach((c, i) => {
      console.log(`${i+1}. Phone/Email: ${c.phone || c.email} | Name: ${c.name || 'Unnamed'}`);
    });
  }
  
  await prisma.$disconnect();
}

getAllCreds().catch(e => {
  console.error(e);
  prisma.$disconnect();
});
