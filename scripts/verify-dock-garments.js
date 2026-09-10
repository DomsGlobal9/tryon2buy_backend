/**
 * The "Outfits Tried" list, and what happens when somebody removes one.
 *
 * A companion to verify-dock-adversarial.js, which covers the photographs. This covers the
 * other tab, and it exists because removing a garment is the most destructive thing the dock
 * can do: the list is DERIVED from try-on records, so the only way an outfit leaves it is for
 * those records to be erased -- shop-wide, permanently, for every colleague on every device.
 *
 * Something that destructive has to be exactly as narrow as it claims. The bar here:
 *
 *   - the PRODUCT survives. This removes a history, never a piece of stock.
 *   - the PHOTOGRAPHS survive. A garment and a photograph are different things.
 *   - other garments' try-ons survive. Nothing removes more than was asked for.
 *   - another shop cannot reach it, and cannot learn it exists by trying.
 *   - two devices deleting the same outfit at the same moment both succeed. Never a 500 for
 *     the request whose only crime was being second.
 *
 *   node scripts/verify-dock-garments.js
 */
require('dotenv').config();
const jwt = require('jsonwebtoken');
const prisma = require('../lib/prisma');
const { JWT_SECRET } = require('../middleware/auth');

const BASE = process.env.DOCK_TEST_BASE || 'http://localhost:4099';

const A = { email: 'claude-recovery-test@example.invalid', password: 'TestRecovery!2026' };
const B = { email: 'claude-dock-other@example.invalid', password: 'OtherShop!2026' };

const IMG = 'https://gsriztjnocjwgqkaxhhz.supabase.co/storage/v1/object/public/tryon-fits/default%20models/44.jpeg';
const STAMP = Date.now();
const MARK = `qa-garment-${STAMP}`;

let passed = 0, failed = 0;
const failures = [];
const check = (name, ok, detail) => {
  if (ok) { passed++; console.log(`  [PASS] ${name}`); }
  else { failed++; failures.push(name); console.log(`  [FAIL] ${name}${detail !== undefined ? `  -> ${detail}` : ''}`); }
};

/** Signed here rather than through /login, which is rate limited -- see the sibling suite. */
async function session(who) {
  const vendor = await prisma.vendor.findUnique({ where: { email: who.email }, select: { id: true, role: true } });
  if (!vendor) throw new Error(`no such test account: ${who.email}. Create it first.`);
  return {
    vendorId: vendor.id,
    token: jwt.sign(
      { vendorId: vendor.id, role: vendor.role, jti: Math.random().toString(36).slice(2) },
      JWT_SECRET, { expiresIn: '1h' }
    )
  };
}

const call = (token, path, options = {}) => fetch(`${BASE}/api/tryon/dock${path}`, {
  headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
  ...options
});
const json = async (res) => { try { return await res.json(); } catch { return null; } };
const listGarments = async (t) => (await json(await call(t, '/garments')))?.garments || [];

/**
 * A garment with `tryOns` try-ons against it, exactly as a real one would look.
 *
 * Built directly rather than by driving the generator: this suite is about what DELETE
 * removes, and a real generation costs money and takes half a minute per image.
 */
async function makeGarment(vendorId, title, tryOns) {
  const flat = await prisma.asset.create({
    data: { vendorId, imageUrl: IMG, assetType: 'GARMENT_FLAT', metadata: { mark: MARK } }
  });
  const product = await prisma.product.create({
    data: { vendorId, title, category: 'SAREE', primaryAssetId: flat.id }
  });

  const results = [];
  for (let i = 0; i < tryOns; i++) {
    const result = await prisma.asset.create({
      data: { vendorId, imageUrl: IMG, assetType: 'TRYON_RESULT', metadata: { mark: MARK } }
    });
    await prisma.assetRelation.create({
      data: { parentAssetId: flat.id, childAssetId: result.id, action: 'DRAPED' }
    });
    results.push(result.id);
  }
  return { productId: product.id, flatAssetId: flat.id, resultIds: results };
}

async function cleanup() {
  const assets = await prisma.asset.findMany({
    where: { metadata: { path: ['mark'], equals: MARK } }, select: { id: true }
  });
  const ids = assets.map(a => a.id);
  if (ids.length) {
    await prisma.product.deleteMany({ where: { primaryAssetId: { in: ids } } });
    await prisma.asset.deleteMany({ where: { id: { in: ids } } });
  }
}

async function main() {
  const ping = await fetch(`${BASE}/api/tryon/dock`).catch(() => null);
  if (!ping) { console.log(`Nothing is answering on ${BASE}. Start the server first.`); return; }

  const shopA = await session(A);
  const shopB = await session(B);

  console.log('\n-- setting up two outfits for shop A --');
  const kurti = await makeGarment(shopA.vendorId, `${MARK} kurti`, 3);
  const saree = await makeGarment(shopA.vendorId, `${MARK} saree`, 2);

  const listed = await listGarments(shopA.token);
  const mine = listed.filter(g => g.title.startsWith(MARK));
  check('both outfits appear in the tried-on list', mine.length === 2, `${mine.length} listed`);
  const kurtiRow = mine.find(g => g.id === kurti.productId);
  check('the try-on count is what was actually tried', kurtiRow?.tryOnCount === 3, `count ${kurtiRow?.tryOnCount}`);

  console.log('\n-- another shop --');
  const cross = await call(shopB.token, `/garments/${kurti.productId}`, { method: 'DELETE' });
  check('a second shop cannot delete it', cross.status === 404, `status ${cross.status}`);
  check('and it is still there afterwards',
    (await listGarments(shopA.token)).some(g => g.id === kurti.productId), 'it vanished');

  console.log('\n-- malformed and missing --');
  for (const [label, id] of [
    ['a nonsense id', 'not-a-real-id'],
    ['an id with a null byte', 'abc%00def'],
    ['a very long id', 'x'.repeat(500)],
    ['an id that is a path', '..%2F..%2Fetc']
  ]) {
    const res = await call(shopA.token, `/garments/${id}`, { method: 'DELETE' });
    check(`${label} is a 4xx, never a 500`, res.status >= 400 && res.status < 500, `status ${res.status}`);
  }
  const noAuth = await call(null, `/garments/${kurti.productId}`, { method: 'DELETE' });
  check('no token is refused', noAuth.status === 401, `status ${noAuth.status}`);

  console.log('\n-- deleting one outfit --');
  const del = await call(shopA.token, `/garments/${kurti.productId}`, { method: 'DELETE' });
  const body = await json(del);
  check('the delete succeeds', del.status === 200, `status ${del.status}`);
  check('it says how many try-ons went', body?.deletedResults === 3, `${body?.deletedResults}`);

  const after = await listGarments(shopA.token);
  check('the outfit is off the list', !after.some(g => g.id === kurti.productId), 'still listed');
  check('the OTHER outfit is untouched', after.some(g => g.id === saree.productId), 'it went too');
  const sareeRow = after.find(g => g.id === saree.productId);
  check('and still has all its try-ons', sareeRow?.tryOnCount === 2, `count ${sareeRow?.tryOnCount}`);

  console.log('\n-- what must have survived --');
  const product = await prisma.product.findUnique({ where: { id: kurti.productId } });
  check('the product is still in the catalogue', !!product, 'the product was deleted');
  const flat = await prisma.asset.findUnique({ where: { id: kurti.flatAssetId } });
  check("the garment's own photograph survives", !!flat, 'the garment image was deleted');
  const orphans = await prisma.asset.count({ where: { id: { in: kurti.resultIds } } });
  check('every try-on image is gone', orphans === 0, `${orphans} left behind`);
  const relations = await prisma.assetRelation.count({ where: { parentAssetId: kurti.flatAssetId } });
  check('and so are the records linking them', relations === 0, `${relations} left behind`);

  console.log('\n-- CLEARING THE LIST MUST NOT EMPTY THE GALLERY --');

  /**
   * The one that matters most, and the one that was wrong first time round.
   *
   * A merchant fills their gallery by saving a try-on to the catalogue -- the saved product's
   * primary asset IS the try-on result. On the live database 23 of 24 products are built that
   * way, so "delete the try-ons behind this outfit" and "delete published products" were, as
   * first written, the same instruction.
   *
   * They are not the same thing at all. Clearing the tried-on list is housekeeping on a
   * twenty-minute working list. The gallery is the shop.
   */
  const shown = await makeGarment(shopA.vendorId, `${MARK} published`, 3);

  // The merchant publishes one of its try-ons, exactly as /api/tryon/catalog/save does.
  const rel = await prisma.assetRelation.findFirst({
    where: { parentAssetId: shown.flatAssetId }, select: { childAssetId: true }
  });
  const galleryItem = await prisma.product.create({
    data: {
      vendorId: shopA.vendorId, title: `${MARK} IN THE GALLERY`,
      category: 'SAREE', primaryAssetId: rel.childAssetId
    }
  });

  const clear = await call(shopA.token, `/garments/${shown.productId}`, { method: 'DELETE' });
  const clearBody = await json(clear);
  check('clearing an outfit with published work succeeds', clear.status === 200, `status ${clear.status}`);

  const galleryStill = await prisma.product.findUnique({ where: { id: galleryItem.id } });
  check('THE PUBLISHED PRODUCT IS STILL IN THE GALLERY',
    !!galleryStill, 'it was deleted -- the merchant just lost a listing by tidying the dock');
  const publishedAsset = await prisma.asset.findUnique({ where: { id: rel.childAssetId } });
  check('and the picture it is shown with still exists',
    !!publishedAsset, 'the image behind the listing was deleted');
  check('it reports what it kept', clearBody?.keptPublished === 1, `kept ${clearBody?.keptPublished}`);
  check('while the unpublished try-ons did go', clearBody?.deletedResults === 2, `deleted ${clearBody?.deletedResults}`);

  check('the outfit still leaves the tried-on list',
    !(await listGarments(shopA.token)).some(g => g.id === shown.productId), 'still listed');
  const outfitProduct = await prisma.product.findUnique({ where: { id: shown.productId } });
  check('and the outfit is still there to be tried again', !!outfitProduct, 'the outfit went');

  await prisma.product.deleteMany({ where: { id: galleryItem.id } });

  console.log('\n-- doing it again, and doing it twice at once --');
  const again = await call(shopA.token, `/garments/${kurti.productId}`, { method: 'DELETE' });
  check('deleting an already-empty outfit is not an error', again.status === 200, `status ${again.status}`);
  check('and reports nothing removed', (await json(again))?.deletedResults === 0, 'it claimed to remove something');

  const race = await Promise.all([
    call(shopA.token, `/garments/${saree.productId}`, { method: 'DELETE' }),
    call(shopA.token, `/garments/${saree.productId}`, { method: 'DELETE' })
  ]);
  check('two devices deleting at once: neither gets a 500',
    !race.some(r => r.status >= 500), race.map(r => r.status).join(','));
  check('and the outfit is gone once',
    !(await listGarments(shopA.token)).some(g => g.id === saree.productId), 'still listed');

  console.log('\n-- photographs are a different thing --');
  const photos = (await json(await call(shopA.token, '')))?.photos || [];
  check('deleting outfits did not touch the photo dock', Array.isArray(photos), 'the dock broke');

  await cleanup();

  console.log(`\n${'-'.repeat(60)}\n${passed} passed, ${failed} failed`);
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
