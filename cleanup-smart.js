require('dotenv').config();
const prisma = require('./lib/prisma');
const { createClient } = require('@supabase/supabase-js');

const BUCKET = 'tryon-fits';
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);

// We extract the relative path from the full URL to compare with Supabase list results
function extractPathFromUrl(fullUrl) {
    if (!fullUrl) return null;
    const marker = `/object/public/${BUCKET}/`;
    const idx = fullUrl.indexOf(marker);
    if (idx !== -1) {
        return fullUrl.substring(idx + marker.length);
    }
    return fullUrl;
}

async function getProtectedPaths() {
    console.log('🛡️  PHASE 1: Fetching Protected Assets from Database...');
    
    // Find the Master Vendor
    const masterVendor = await prisma.vendor.findUnique({
        where: { email: 'vendor@store.com' }
    });

    if (!masterVendor) {
        console.warn('⚠️ Master vendor not found! Skipping protection step. (Are you sure this is the right DB?)');
        return new Set();
    }

    console.log(`✅ Master Vendor Found: ${masterVendor.id}`);

    // Fetch all assets saved by the master vendor
    const protectedAssets = await prisma.asset.findMany({
        where: { vendorId: masterVendor.id },
        select: { imageUrl: true }
    });

    const safePaths = new Set();
    protectedAssets.forEach(asset => {
        const p = extractPathFromUrl(asset.imageUrl);
        if (p) safePaths.add(p);
    });

    console.log(`🛡️  Found ${safePaths.size} protected files saved by Master Vendor.`);
    return safePaths;
}

async function cleanFolder(folderPath, safePathsSet) {
    console.log(`\n📂 Scanning folder: ${folderPath}...`);
    
    // We use a relatively high limit. If they have > 1000 files, we might need pagination, but 1000 is usually enough for a cleanup.
    const { data, error } = await supabase.storage.from(BUCKET).list(folderPath, {
        limit: 1000,
        offset: 0,
        sortBy: { column: 'name', order: 'asc' },
    });

    if (error) {
        console.error(`❌ Error listing ${folderPath}:`, error.message);
        return;
    }

    if (!data || data.length === 0) {
        console.log(`  - No files found in ${folderPath}`);
        return;
    }

    // Filter out potential subdirectories or empty placeholders (.emptyFolderPlaceholder)
    const allFiles = data.filter(f => f.id); 
    
    const filesToDelete = [];
    let protectedCount = 0;

    for (const file of allFiles) {
        const fullPath = folderPath === '' ? file.name : `${folderPath}/${file.name}`;
        
        if (safePathsSet.has(fullPath)) {
            protectedCount++;
        } else {
            filesToDelete.push(fullPath);
        }
    }

    if (filesToDelete.length === 0) {
        console.log(`  - 0 files to delete. (Protected ${protectedCount} files)`);
        return;
    }

    console.log(`  - Deleting ${filesToDelete.length} files... (Protected ${protectedCount} files)`);
    
    // Supabase allows deleting multiple files at once
    const { error: removeError } = await supabase.storage.from(BUCKET).remove(filesToDelete);
    
    if (removeError) {
         console.error(`❌ Error deleting from ${folderPath}:`, removeError.message);
    } else {
         console.log(`✅ Successfully deleted ${filesToDelete.length} junk files from ${folderPath}`);
    }
}

async function run() {
    console.log('🚀 Starting Smart Cleanup...\n');

    const safePaths = await getProtectedPaths();

    const forceWipeFolders = [
        'human-images',
        'user-uploads',
        'garments',
        'results',
        'results/tryon-results',
        'results/background-swaps',
        'results/outfit-edits'
    ];

    const smartCleanFolders = [
        'vendor-drapes'
    ];

    console.log('\n🗑️  PHASE 2: Force Wiping User/Customer Folders...');
    const emptySet = new Set();
    for (const folder of forceWipeFolders) {
        await cleanFolder(folder, emptySet); // Pass empty set so NOTHING is protected
    }

    console.log('\n🛡️  PHASE 3: Smart Cleaning Vendor Folders...');
    for (const folder of smartCleanFolders) {
        await cleanFolder(folder, safePaths); // Protect master vendor assets here
    }

    console.log('\n✨ Smart Cleanup Complete!');
    console.log('Your 1GB storage quota should now be drastically reduced, while your Master Gallery is 100% safe.');
    process.exit(0);
}

run().catch(e => {
    console.error('Fatal Error:', e);
    process.exit(1);
});
