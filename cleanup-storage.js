require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const BUCKET = 'tryon-fits';
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);

async function deleteAllFilesInFolder(folderPath) {
    console.log(`Scanning folder: ${folderPath}...`);
    
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

    // Filter out potential subdirectories or placeholders, keeping only actual files
    const filesToRemove = data
        .filter(f => f.id) // Files usually have IDs, folders usually don't in list() output
        .map(x => `${folderPath}/${x.name}`);
    
    if (filesToRemove.length === 0) {
        console.log(`  - No deletable files in ${folderPath}`);
        return;
    }

    console.log(`  - Found ${filesToRemove.length} files. Deleting...`);
    const { error: removeError } = await supabase.storage.from(BUCKET).remove(filesToRemove);
    
    if (removeError) {
         console.error(`❌ Error deleting from ${folderPath}:`, removeError.message);
    } else {
         console.log(`✅ Successfully deleted ${filesToRemove.length} files from ${folderPath}`);
    }
}

async function run() {
    console.log('🧹 Starting Supabase Storage Cleanup...\n');
    console.log('WARNING: This will delete generated results and user uploads to free up space.');
    console.log('NOTE: Base models in "default models" will NOT be touched.\n');

    // Folders that contain auto-generated or temporary user-uploaded data
    const foldersToClean = [
        'results/tryon-results', 
        'results/background-swaps', 
        'results/outfit-edits', 
        'vendor-drapes', 
        'user-uploads', 
        'garments'
    ];
    
    for (const folder of foldersToClean) {
        await deleteAllFilesInFolder(folder);
    }
    
    console.log('\n✨ Cleanup complete! Check your Supabase dashboard to see freed up storage space.');
}

run();
