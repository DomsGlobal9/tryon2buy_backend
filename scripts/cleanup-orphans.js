require('dotenv').config();
const prisma = require('../lib/prisma');
const supabase = require('../supabaseClient');

/**
 * Reclaims storage by deleting ONLY files nothing points at any more.
 *
 * Replaces the approach in cleanup-smart.js, which asked the wrong question. That script
 * protected files by WHO OWNED THEM -- specifically, whatever assets belonged to a single
 * hardcoded vendor (vendor@store.com) -- and force-wiped six folders outright. Three things
 * followed from that:
 *
 *   - every other vendor's drapes were deleted while their database rows survived, leaving
 *     rows pointing at images that no longer existed
 *   - `garments` was force-wiped, and that folder holds the Sample Materials the workspace
 *     hardcodes. One run silently broke that feature
 *   - anything new, belonging to anyone, was deleted the moment the script ran
 *
 * The right question is not "whose is this" but "is anything still pointing at it". The
 * database can answer that for every vendor at once, which is what this does.
 *
 * This matters more now than it did. Dock photographs expire after twenty minutes and their
 * rows are deleted, so the files behind them become orphans quickly and in volume -- exactly
 * the thing a collector should be reclaiming, and exactly the thing the old script could not
 * distinguish from a file someone was still using.
 *
 *   node scripts/cleanup-orphans.js              # report only, deletes nothing
 *   node scripts/cleanup-orphans.js --apply      # actually delete
 *   node scripts/cleanup-orphans.js --apply --min-age-hours=6
 */

const BUCKET = process.env.SUPABASE_STORAGE_BUCKET || 'tryon-fits';

const args = process.argv.slice(2);
const APPLY = args.includes('--apply');
const MIN_AGE_HOURS = Number(
  (args.find(a => a.startsWith('--min-age-hours=')) || '').split('=')[1] || 24
);

/**
 * Files the application owns that no database row will ever reference.
 *
 * Everything else is protected by being pointed at from the database. These are not, so they
 * have to be named. A file added here is a file the code hardcodes a URL to -- if you add a
 * new sample or backdrop, it belongs in this list, or the collector will eventually take it.
 */
const ALWAYS_KEEP = [
  // Stock models used for catalogue draping, and the dupatta style references.
  /^default models\//i,
  /^lehanga_duppatta1\.jpg$/i,
  /^lehangaduppatta2\.jpg$/i,

  // Backdrops offered in the Change Background panel (prompts.js resolves these by id).
  /^bg\d+\.(png|jpg|jpeg)$/i,

  // Sample Materials, hardcoded in SampleWorkspaceModal.jsx. The old script wiped these.
  /^garments\/_DSC0149\.jpg$/i,
  /^garments\/91be8c6a-9213-4627-b78d-088db18a08f3\.jpg$/i,
  /^garments\/blouse1\.JPG$/i,
  /^garments\/blouse2\.JPG$/i
];

/** Folders that hold generated or uploaded material. Anything else is left alone entirely. */
const SWEEPABLE_ROOTS = [
  'garments',
  'user-uploads',
  'human-images',
  'front-views',
  'vendor-drapes',
  'results'
];

const marker = `/object/public/${BUCKET}/`;

/** Turns a public URL into the path inside the bucket, or null if it is not one of ours. */
function toStoragePath(url) {
  if (typeof url !== 'string') return null;
  const at = url.indexOf(marker);
  if (at === -1) return null;
  try {
    return decodeURIComponent(url.slice(at + marker.length).split('?')[0]);
  } catch {
    return url.slice(at + marker.length).split('?')[0];
  }
}

function addUrl(set, url) {
  const path = toStoragePath(url);
  if (path) set.add(path);
}

/** Pulls every URL out of a metadata blob, whatever shape it happens to be. */
function addFromMetadata(set, metadata) {
  if (!metadata || typeof metadata !== 'object') return;

  for (const value of Object.values(metadata)) {
    if (typeof value === 'string') {
      addUrl(set, value);
    } else if (value && typeof value === 'object') {
      // garment_urls is { saree: url, blouse: url }, and nested shapes may appear later.
      addFromMetadata(set, value);
    }
  }
}

/**
 * Every storage path the database still refers to, across every vendor.
 *
 * Deliberately greedy: it walks all of metadata rather than the handful of keys in use today,
 * because a key added later that nobody remembers to add here would mean quietly deleting
 * live images. Over-protecting wastes space; under-protecting loses pictures.
 */
async function referencedPaths() {
  const referenced = new Set();

  const assets = await prisma.asset.findMany({ select: { imageUrl: true, metadata: true } });
  for (const asset of assets) {
    addUrl(referenced, asset.imageUrl);
    addFromMetadata(referenced, asset.metadata);
  }

  const garments = await prisma.garment.findMany({ select: { label: true, metadata: true } });
  for (const garment of garments) {
    // label holds the original image URL on rows written by generate-front-view.
    addUrl(referenced, garment.label);
    addFromMetadata(referenced, garment.metadata);
  }

  return referenced;
}

/**
 * Every file under a prefix, following folders and paging past Supabase's limit.
 *
 * The old script asked for 1000 entries once and treated that as the whole folder, so on a
 * bucket bigger than that it silently ignored the rest -- which, for a script whose job is
 * deleting, is the safer half of the mistake but still means it never finished the job.
 */
async function listAll(prefix) {
  const files = [];
  const pageSize = 100;

  const walk = async (dir) => {
    let offset = 0;
    for (;;) {
      const { data, error } = await supabase.storage.from(BUCKET).list(dir, {
        limit: pageSize,
        offset,
        sortBy: { column: 'name', order: 'asc' }
      });
      if (error) throw new Error(`listing ${dir}: ${error.message}`);
      if (!data || data.length === 0) return;

      for (const entry of data) {
        const path = dir ? `${dir}/${entry.name}` : entry.name;
        if (entry.id) {
          files.push({ path, createdAt: entry.created_at || entry.updated_at || null });
        } else {
          await walk(path); // a folder
        }
      }

      if (data.length < pageSize) return;
      offset += pageSize;
    }
  };

  await walk(prefix);
  return files;
}

const isProtectedByName = (path) => ALWAYS_KEEP.some(re => re.test(path));

function isTooNew(file) {
  if (!file.createdAt) return true; // no timestamp: treat as new and leave it alone
  const ageHours = (Date.now() - new Date(file.createdAt).getTime()) / 3_600_000;
  return ageHours < MIN_AGE_HOURS;
}

async function run() {
  console.log(`\nStorage collector — bucket "${BUCKET}"`);
  console.log(APPLY ? '  MODE: APPLY (files will be deleted)' : '  MODE: report only (nothing will be deleted)');
  console.log(`  Ignoring anything newer than ${MIN_AGE_HOURS}h\n`);

  const referenced = await referencedPaths();
  console.log(`  ${referenced.size} files are still referenced by the database`);

  let scanned = 0, keptReferenced = 0, keptNamed = 0, keptYoung = 0;
  const orphans = [];

  for (const root of SWEEPABLE_ROOTS) {
    const files = await listAll(root);
    scanned += files.length;

    for (const file of files) {
      if (referenced.has(file.path)) { keptReferenced++; continue; }
      if (isProtectedByName(file.path)) { keptNamed++; continue; }
      // A file uploaded moments ago may not have its row yet -- the upload and the database
      // write are two steps, and deleting between them would destroy a live image.
      if (isTooNew(file)) { keptYoung++; continue; }
      orphans.push(file.path);
    }
    console.log(`  scanned ${String(files.length).padStart(5)}  in ${root}`);
  }

  console.log(`\n  ${scanned} files scanned`);
  console.log(`  ${keptReferenced} kept — still referenced`);
  console.log(`  ${keptNamed} kept — named in ALWAYS_KEEP`);
  console.log(`  ${keptYoung} kept — newer than ${MIN_AGE_HOURS}h`);
  console.log(`  ${orphans.length} orphaned`);

  if (orphans.length > 0) {
    console.log('\n  first few orphans:');
    orphans.slice(0, 10).forEach(p => console.log(`    ${p}`));
    if (orphans.length > 10) console.log(`    ... and ${orphans.length - 10} more`);
  }

  if (!APPLY) {
    console.log('\n  Nothing deleted. Re-run with --apply to delete the orphans above.\n');
    return;
  }

  // Supabase caps how many paths one remove() accepts; batch rather than hope.
  let deleted = 0;
  for (let i = 0; i < orphans.length; i += 100) {
    const batch = orphans.slice(i, i + 100);
    const { error } = await supabase.storage.from(BUCKET).remove(batch);
    if (error) {
      console.error(`  batch starting ${i} failed: ${error.message}`);
      continue;
    }
    deleted += batch.length;
  }
  console.log(`\n  ${deleted} files deleted.\n`);
}

run()
  .catch(err => { console.error('\nFailed:', err.message, '\n'); process.exitCode = 1; })
  .finally(() => process.exit());
