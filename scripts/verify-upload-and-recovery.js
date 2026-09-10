/**
 * The photo coming IN, and the result coming back OUT when the wire drops.
 *
 * Covers the four backend changes that shipped alongside the dock and had no tests of their
 * own -- the ones a shopper actually meets on a phone:
 *
 *   UPLOAD     a photograph taken with the camera, which iOS hands over unlabelled
 *   RECOVERY   collecting a generation whose response was lost
 *   GATEWAY    the usage ping that must never hold a socket open
 *   ORPHANS    the storage sweep, checked for what it does NOT delete
 *
 * Everything destructive here runs in its dry mode, and every row it creates is marked and
 * removed at the end.
 *
 *   node scripts/verify-upload-and-recovery.js
 */
require('dotenv').config();
const sharp = require('sharp');
const prisma = require('../lib/prisma');
const { execFileSync } = require('child_process');
const path = require('path');

const BASE = process.env.DOCK_TEST_BASE || 'http://localhost:4099';
const STAMP = Date.now();
const MARK = `qa-upload-${STAMP}`;

let passed = 0, failed = 0;
const failures = [];
const check = (name, ok, detail) => {
  if (ok) { passed++; console.log(`  [PASS] ${name}`); }
  else { failed++; failures.push(name); console.log(`  [FAIL] ${name}${detail !== undefined ? `  -> ${detail}` : ''}`); }
};

/** A real, decodable JPEG -- not a made-up buffer, because sharp is the thing being trusted. */
async function jpeg(width = 240, height = 320) {
  return sharp({
    create: { width, height, channels: 3, background: { r: 200, g: 120, b: 90 } }
  }).jpeg().toBuffer();
}

/**
 * Post a file the way a browser does, with control over the label.
 *
 * The label is the whole point: iOS sends a perfectly good photograph as
 * application/octet-stream, or with no type at all, and the question is whether the server
 * looks at the label or at the bytes.
 */
async function postFile(buffer, { filename = 'photo.jpg', contentType, folder = 'user-uploads' } = {}) {
  const form = new FormData();
  const blob = contentType === undefined
    ? new Blob([buffer])                      // no type at all
    : new Blob([buffer], { type: contentType });
  form.append('image', blob, filename);

  const res = await fetch(`${BASE}/api/tryon/upload?folder=${encodeURIComponent(folder)}`, {
    method: 'POST', body: form
  });
  let body = null;
  try { body = await res.json(); } catch { /* not json */ }
  return { status: res.status, body };
}

async function uploads() {
  console.log('\n-- UPLOAD: a photograph taken on a phone --');

  const photo = await jpeg();

  const labelled = await postFile(photo, { contentType: 'image/jpeg' });
  check('a photograph labelled image/jpeg is accepted', labelled.status === 200, `${labelled.status} ${JSON.stringify(labelled.body)}`);

  /**
   * The camera case, and the reason the fix exists.
   *
   * iOS hands a File back from IndexedDB with an empty type, and FormData then sends
   * application/octet-stream. The same bytes were accepted one way and refused the other, and
   * the shopper was told their photograph was invalid -- so they took another, and got the
   * same message, because the picture was never the problem.
   */
  const octet = await postFile(photo, { contentType: 'application/octet-stream' });
  check('THE SAME PHOTOGRAPH sent as application/octet-stream is accepted',
    octet.status === 200, `${octet.status} ${JSON.stringify(octet.body)}`);

  const untyped = await postFile(photo, { contentType: undefined });
  check('and with no content type at all', untyped.status === 200, `${untyped.status} ${JSON.stringify(untyped.body)}`);

  check('all three produce a usable url',
    [labelled, octet, untyped].every(r => typeof r.body?.url === 'string' && r.body.url.startsWith('https://')),
    'one of them returned no url');

  // The other half of the bargain: relaxing the label must not let a non-image through.
  const notAnImage = Buffer.from('this is not a picture, it is a sentence'.repeat(50));
  const lying = await postFile(notAnImage, { filename: 'photo.jpg', contentType: 'application/octet-stream' });
  check('a NON-image wearing the same label is still refused',
    lying.status >= 400, `it was accepted: ${lying.status}`);
  check('and is refused as a bad request, not a server fault',
    lying.status >= 400 && lying.status < 500, `status ${lying.status}`);

  const wrongType = await postFile(notAnImage, { filename: 'notes.txt', contentType: 'text/plain' });
  check('something openly declared as text is refused', wrongType.status >= 400, `status ${wrongType.status}`);

  const badFolder = await postFile(photo, { contentType: 'image/jpeg', folder: '../../etc' });
  check('an unknown folder is refused', badFolder.status === 400, `status ${badFolder.status}`);

  const empty = await fetch(`${BASE}/api/tryon/upload?folder=user-uploads`, { method: 'POST', body: new FormData() });
  check('no file at all is a clear 400', empty.status === 400, `status ${empty.status}`);

  /**
   * Phone photographs arrive sideways. The endpoint calls .rotate(), which applies the EXIF
   * orientation and clears it -- so a portrait taken in landscape orientation comes out the
   * right way up rather than 90 degrees over.
   */
  const sideways = await sharp({ create: { width: 400, height: 200, channels: 3, background: { r: 10, g: 90, b: 200 } } })
    .withMetadata({ orientation: 6 })   // "rotate 90 clockwise"
    .jpeg().toBuffer();
  const rotated = await postFile(sideways, { contentType: 'image/jpeg' });
  check('a sideways phone photo uploads', rotated.status === 200, `status ${rotated.status}`);
  if (rotated.body?.url) {
    const fetched = Buffer.from(await (await fetch(rotated.body.url)).arrayBuffer());
    const meta = await sharp(fetched).metadata();
    check('and comes back the right way up (400x200 -> 200x400)',
      meta.width === 200 && meta.height === 400, `${meta.width}x${meta.height}`);
  }
  console.log('');
}

async function recovery() {
  console.log('-- RECOVERY: the result whose response was lost --');

  const unknown = await fetch(`${BASE}/api/tryon/generation-status/${MARK}-nothing-here`);
  const unknownBody = await unknown.json().catch(() => null);
  check('an unknown key is a 404, not a crash', unknown.status === 404, `status ${unknown.status}`);
  check('and says UNKNOWN rather than guessing', unknownBody?.status === 'UNKNOWN', JSON.stringify(unknownBody));

  const vendor = await prisma.vendor.findFirst({ select: { id: true } });

  // A finished generation the caller never received.
  const done = await prisma.asset.create({
    data: {
      vendorId: vendor.id, imageUrl: 'https://example.invalid/done.jpg',
      assetType: 'TRYON_RESULT', status: 'COMPLETED',
      metadata: { mark: MARK, clientRequestId: `${MARK}-done` }
    }
  });
  const got = await fetch(`${BASE}/api/tryon/generation-status/${MARK}-done`);
  const gotBody = await got.json().catch(() => null);
  check('a finished generation is handed over', got.status === 200 && gotBody?.status === 'COMPLETED', JSON.stringify(gotBody));
  check('with the picture it produced', gotBody?.result_image_url === done.imageUrl, gotBody?.result_image_url);

  // A failure, whose real reason must stay on the server.
  await prisma.asset.create({
    data: {
      vendorId: vendor.id, imageUrl: 'https://example.invalid/failed.jpg',
      assetType: 'TRYON_RESULT', status: 'FAILED',
      metadata: { mark: MARK, clientRequestId: `${MARK}-failed`, errorMessage: 'Gemini refused: SAFETY_BLOCK at layer 3' }
    }
  });
  const bad = await fetch(`${BASE}/api/tryon/generation-status/${MARK}-failed`);
  const badBody = await bad.json().catch(() => null);
  check('a failed generation reports as failed', badBody?.status === 'FAILED', JSON.stringify(badBody));
  check('WITHOUT describing our internals to the caller',
    !/gemini|safety_block|layer 3/i.test(JSON.stringify(badBody)), JSON.stringify(badBody));

  // Older than the two-hour window: deliberately not found, so the lookup stays bounded.
  const old = await prisma.asset.create({
    data: {
      vendorId: vendor.id, imageUrl: 'https://example.invalid/old.jpg',
      assetType: 'TRYON_RESULT', status: 'COMPLETED',
      metadata: { mark: MARK, clientRequestId: `${MARK}-old` }
    }
  });
  await prisma.$executeRaw`UPDATE tryon_assets SET created_at = NOW() - INTERVAL '3 hours' WHERE id = ${old.id}`;
  const stale = await fetch(`${BASE}/api/tryon/generation-status/${MARK}-old`);
  check('a key older than the window is not served', stale.status === 404, `status ${stale.status}`);

  // Awkward keys must not become 500s.
  for (const [label, key] of [
    ['a key with a null byte', 'abc%00def'],
    ['a very long key', 'x'.repeat(600)],
    ['a key that looks like a path', '..%2F..%2Fadmin'],
    ['a key with quotes', "a'or'1'='1"]
  ]) {
    const r = await fetch(`${BASE}/api/tryon/generation-status/${key}`);
    check(`${label} is a 4xx, never a 500`, r.status >= 400 && r.status < 500, `status ${r.status}`);
  }
  console.log('');
}

async function gatewayPing() {
  console.log('-- GATEWAY: the usage ping must not hold a socket --');

  const src = require('fs').readFileSync(path.join(__dirname, '..', 'services', 'gatewayTracker.js'), 'utf8');
  check('the ping carries a timeout', /AbortSignal\.timeout\(\s*\d+\s*\)/.test(src), 'no timeout found');
  const commentedOut = /^\s*\/\/\s*signal:\s*AbortSignal\.timeout/m.test(src);
  check('and it is not commented out again', !commentedOut, 'the timeout line is commented out');

  /**
   * The behaviour, not just the line. Pointed at an address that accepts the connection and
   * then says nothing, the ping has to give up on its own -- that is the difference between
   * a slow Gateway costing three seconds and a slow Gateway costing every socket on the box.
   */
  const net = require('net');
  const blackhole = net.createServer(() => { /* accept, never answer */ });
  await new Promise(r => blackhole.listen(0, '127.0.0.1', r));
  const port = blackhole.address().port;

  const started = Date.now();
  try {
    await fetch(`http://127.0.0.1:${port}/whatever`, {
      method: 'POST', signal: AbortSignal.timeout(3000)
    });
  } catch { /* expected */ }
  const waited = Date.now() - started;
  blackhole.close();

  check('a silent gateway is abandoned in about three seconds',
    waited >= 2500 && waited < 6000, `waited ${waited}ms`);
  console.log('');
}

async function orphanSweep() {
  console.log('-- ORPHANS: the storage sweep, and what it leaves alone --');

  const vendor = await prisma.vendor.findFirst({ select: { id: true } });
  const keeper = await prisma.asset.create({
    data: {
      vendorId: vendor.id,
      imageUrl: 'https://gsriztjnocjwgqkaxhhz.supabase.co/storage/v1/object/public/tryon-fits/user-uploads/keep-me.jpg',
      assetType: 'HUMAN_MODEL', status: 'COMPLETED', metadata: { mark: MARK }
    }
  });

  const before = {
    assets: await prisma.asset.count(),
    products: await prisma.product.count()
  };

  let out = '';
  try {
    out = execFileSync(process.execPath, [path.join(__dirname, 'cleanup-orphans.js')],
      { cwd: path.join(__dirname, '..'), encoding: 'utf8', timeout: 120000 });
  } catch (e) {
    out = String(e.stdout || '') + String(e.stderr || '');
  }

  check('the sweep runs without --apply', out.length > 0, 'no output at all');
  check('and says plainly that it deleted nothing',
    /Nothing deleted|Re-run with --apply/i.test(out), out.slice(-200).replace(/\s+/g, ' '));

  const after = {
    assets: await prisma.asset.count(),
    products: await prisma.product.count()
  };
  check('a dry run removes no asset rows', after.assets === before.assets, `${before.assets} -> ${after.assets}`);
  check('and no products', after.products === before.products, `${before.products} -> ${after.products}`);
  const stillThere = await prisma.asset.findUnique({ where: { id: keeper.id } });
  check('a file something still points at is not an orphan', !!stillThere, 'the referenced asset went');
  console.log('');
}

async function cleanup() {
  const rows = await prisma.asset.findMany({
    where: { metadata: { path: ['mark'], equals: MARK } }, select: { id: true }
  });
  const ids = rows.map(r => r.id);
  if (ids.length) {
    await prisma.product.deleteMany({ where: { primaryAssetId: { in: ids } } });
    await prisma.asset.deleteMany({ where: { id: { in: ids } } });
  }
}

async function main() {
  const ping = await fetch(`${BASE}/api/tryon/health`).catch(() => null);
  if (!ping) { console.log(`Nothing is answering on ${BASE}. Start the server first.`); return; }

  await uploads();
  await recovery();
  await gatewayPing();
  await orphanSweep();
  await cleanup();

  console.log('─'.repeat(60));
  console.log(`${passed} passed, ${failed} failed`);
  if (failures.length) failures.forEach(f => console.log(`  - ${f}`));
  await prisma.$disconnect();
  process.exit(failed ? 1 : 0);
}

main().catch(async (e) => {
  console.error(e);
  await cleanup().catch(() => {});
  await prisma.$disconnect();
  process.exit(1);
});
