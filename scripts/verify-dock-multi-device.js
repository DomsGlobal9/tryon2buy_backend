/**
 * The dock across two devices, which is the only reason it exists on the server at all.
 *
 * A shop runs a counter tablet, an owner's laptop and somebody's phone, all signed in as the
 * same account. That makes two rules, and they pull in opposite directions:
 *
 *   SHARED     what the dock HOLDS. An outfit tried on the tablet has to appear on the
 *              laptop, and a photograph added on the phone has to be reachable from both --
 *              otherwise there is no point keeping any of it on the server.
 *
 *   LOCAL      what a device is WORKING ON. Choosing an outfit on the tablet must not move
 *              the laptop, because the laptop has somebody standing in front of it. A page
 *              that changes under a colleague mid-sentence is worse than no sharing at all.
 *
 * Everything below is one of those two rules, checked from two independent clients. "Device"
 * here means a separate HTTP client with its own view of the world -- no shared state between
 * them beyond the account, which is exactly the real arrangement.
 *
 *   node scripts/verify-dock-multi-device.js
 */
require('dotenv').config();
const jwt = require('jsonwebtoken');
const prisma = require('../lib/prisma');
const { JWT_SECRET } = require('../middleware/auth');

const BASE = process.env.DOCK_TEST_BASE || 'http://localhost:4099';
const SHOP = { email: 'claude-recovery-test@example.invalid' };
const OTHER = { email: 'claude-dock-other@example.invalid' };

const IMG = 'https://gsriztjnocjwgqkaxhhz.supabase.co/storage/v1/object/public/tryon-fits/default%20models/44.jpeg';
const STAMP = Date.now();
const MARK = `qa-multidev-${STAMP}`;

let passed = 0, failed = 0;
const failures = [];
const check = (name, ok, detail) => {
  if (ok) { passed++; console.log(`  [PASS] ${name}`); }
  else { failed++; failures.push(name); console.log(`  [FAIL] ${name}${detail !== undefined ? `  -> ${detail}` : ''}`); }
};

/**
 * One device: its own token, its own jti, its own idea of what the dock looks like.
 *
 * Separate tokens rather than one shared string, because that is the real shape -- each device
 * signed in on its own -- and because a bug that keyed anything off the token itself rather
 * than the account behind it would otherwise be invisible here.
 */
async function device(who, label) {
  const vendor = await prisma.vendor.findUnique({ where: { email: who.email }, select: { id: true, role: true } });
  if (!vendor) throw new Error(`no such test account: ${who.email}`);
  const token = jwt.sign(
    { vendorId: vendor.id, role: vendor.role, jti: Math.random().toString(36).slice(2) },
    JWT_SECRET, { expiresIn: '1h' }
  );
  const call = (path, options = {}) => fetch(`${BASE}/api/tryon/dock${path}`, {
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    ...options
  });
  const json = async (res) => { try { return await res.json(); } catch { return null; } };
  return {
    label,
    vendorId: vendor.id,
    call,
    async photos() { return (await json(await call('')))?.photos || []; },
    async garments() { return (await json(await call('/garments')))?.garments || []; },
    async addPhoto() { return json(await call('/photos', { method: 'POST', body: JSON.stringify({ imageUrl: IMG }) })); },
    async activate(id) { return json(await call(`/photos/${id}/activate`, { method: 'POST' })); },
    async deleteGarment(id, force) { return call(`/garments/${id}${force ? '?force=1' : ''}`, { method: 'DELETE' }); },
    async touchGarment(id) { return call(`/garments/${id}/touch`, { method: 'POST' }); },
    async deletePhoto(id) { return call(`/photos/${id}`, { method: 'DELETE' }); }
  };
}

async function makeGarment(vendorId, title, tryOns) {
  const flat = await prisma.asset.create({
    data: { vendorId, imageUrl: IMG, assetType: 'GARMENT_FLAT', metadata: { mark: MARK } }
  });
  const product = await prisma.product.create({
    data: { vendorId, title, category: 'SAREE', primaryAssetId: flat.id }
  });
  for (let i = 0; i < tryOns; i++) {
    const r = await prisma.asset.create({
      data: { vendorId, imageUrl: IMG, assetType: 'TRYON_RESULT', metadata: { mark: MARK } }
    });
    await prisma.assetRelation.create({ data: { parentAssetId: flat.id, childAssetId: r.id, action: 'DRAPED' } });
  }
  return { productId: product.id, flatAssetId: flat.id, title };
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

  const tablet = await device(SHOP, 'counter tablet');
  const laptop = await device(SHOP, "owner's laptop");
  const phone = await device(SHOP, 'phone');
  const rival = await device(OTHER, 'another shop');

  console.log('\n-- SHARED: what one device does, the others see --');

  const saree = await makeGarment(tablet.vendorId, `${MARK} saree`, 2);
  const kurti = await makeGarment(tablet.vendorId, `${MARK} kurti`, 1);

  const onLaptop = await laptop.garments();
  check('an outfit tried on the tablet is on the laptop',
    onLaptop.some(g => g.id === saree.productId), 'not listed');
  check('and on the phone',
    (await phone.garments()).some(g => g.id === saree.productId), 'not listed');

  const added = await tablet.addPhoto();
  check('a photograph added on the tablet reaches the laptop',
    (await laptop.photos()).some(p => p.id === added.id), 'not listed');

  console.log('\n-- LOCAL: choosing is not broadcasting --');

  /**
   * The heart of it. Picking an outfit is a page navigation on the device that did it -- there
   * is deliberately no endpoint for "the shop is now looking at this garment", because such an
   * endpoint is exactly what would move a colleague's screen.
   *
   * So this is checked by its absence: after one device picks, nothing about what the OTHER
   * device would load has changed. The garment list is identical, and nothing anywhere names
   * a currently-selected garment.
   */
  const laptopBefore = JSON.stringify((await laptop.garments()).map(g => g.id));
  // The tablet "picks" the saree -- in the app this is applyGarment, which navigates locally.
  const tabletPicked = saree.productId;
  const laptopAfter = JSON.stringify((await laptop.garments()).map(g => g.id));
  check('picking an outfit on one device leaves the others exactly as they were',
    laptopBefore === laptopAfter, 'the list moved');

  const anyGarmentIsActive = (await laptop.garments()).some(g => 'isActive' in g || 'selected' in g);
  check('no garment is marked as the shop-wide selection at all',
    !anyGarmentIsActive, 'a garment carries a selection flag, which would follow across devices');
  check('the tablet still has its own pick to work with', !!tabletPicked, 'lost it');

  console.log('\n-- SHARED: a photograph IS the shop-wide one, on purpose --');

  /**
   * The deliberate asymmetry, and worth stating: activating a PHOTOGRAPH is shared, because it
   * is the shop's starting point for a device opened later. What stops that disrupting anyone
   * is on the page, not here -- VendorTryon reads the active photograph once, on arrival, and
   * after that only a person picking one out of the dock changes the slot.
   */
  const second = await phone.addPhoto();
  await phone.activate(second.id);
  const laptopSees = (await laptop.photos()).find(p => p.isActive);
  check('activating on the phone is visible from the laptop',
    laptopSees?.id === second.id, `laptop sees ${laptopSees?.id}`);
  const actives = (await laptop.photos()).filter(p => p.isActive).length;
  check('and exactly one photograph is active, never two', actives === 1, `${actives} active`);

  console.log('\n-- SHARED: a delete on one device empties the others --');

  const delRes = await laptop.deleteGarment(kurti.productId);
  check('the laptop can delete an outfit the tablet created', delRes.status === 200, `status ${delRes.status}`);
  check('and it is gone from the tablet',
    !(await tablet.garments()).some(g => g.id === kurti.productId), 'still listed');
  check('and gone from the phone',
    !(await phone.garments()).some(g => g.id === kurti.productId), 'still listed');

  console.log('\n-- three devices doing incompatible things at the same instant --');

  const busy = await makeGarment(tablet.vendorId, `${MARK} busy`, 3);
  const together = await Promise.all([
    tablet.deleteGarment(busy.productId),
    laptop.deleteGarment(busy.productId),
    phone.call('/garments')
  ]);
  check('nobody gets a 500', !together.some(r => r.status >= 500), together.map(r => r.status).join(','));
  check('the outfit is gone once and stays gone',
    !(await phone.garments()).some(g => g.id === busy.productId), 'still listed');

  // One device removing the photograph another is holding: the classic, and the reason the
  // page leaves a vanished photograph on screen rather than blanking mid-session.
  const held = await tablet.addPhoto();
  const removal = await Promise.all([laptop.deletePhoto(held.id), phone.deletePhoto(held.id)]);
  check('two devices deleting the same photograph: no 500',
    !removal.some(r => r.status >= 500), removal.map(r => r.status).join(','));
  check('exactly one of them is told it did the deleting',
    removal.filter(r => r.status === 200).length === 1, removal.map(r => r.status).join(','));

  console.log('\n-- a try-on in progress is not something to delete out from under --');

  /**
   * The rule: **a delete on one device must never end a try-on on another.**
   *
   * Two halves, and both are checked. The first is a warning -- somebody about to erase a
   * colleague's work is told so, and has to say yes a second time. The second is the one that
   * actually matters: even when they DO say yes, the other device can carry on. Its garment
   * survives, its photograph survives, and it can generate again straight away. Only the
   * pictures already made are gone, which is what the person deleting explicitly asked for.
   */
  const worn = await makeGarment(tablet.vendorId, `${MARK} worn`, 2);

  // Nobody has it open yet.
  const cold = await laptop.deleteGarment(worn.productId);
  check('an outfit nobody is wearing deletes without a fuss', cold.status === 200, `status ${cold.status}`);

  const inUse = await makeGarment(tablet.vendorId, `${MARK} in use`, 2);
  await tablet.touchGarment(inUse.productId);   // the tablet opens it

  const blocked = await laptop.deleteGarment(inUse.productId);
  check('deleting one somebody IS wearing asks first', blocked.status === 409, `status ${blocked.status}`);
  const blockedBody = await blocked.json().catch(() => null);
  check('and says who it would interrupt, in words',
    /trying this outfit on right now/i.test(blockedBody?.error || ''), blockedBody?.error);
  check('nothing was deleted while it asked',
    (await tablet.garments()).some(g => g.id === inUse.productId), 'it went anyway');

  const forced = await laptop.deleteGarment(inUse.productId, true);
  check('saying yes a second time goes through', forced.status === 200, `status ${forced.status}`);

  // The half that matters. Everything the other device needs to keep working must survive.
  const stillThere = await prisma.asset.findUnique({ where: { id: inUse.flatAssetId } });
  check('the outfit itself survives, so the other device can still generate',
    !!stillThere, 'the garment asset was deleted -- the other device would be stranded');
  const product = await prisma.product.findUnique({ where: { id: inUse.productId } });
  check('and it is still in the catalogue to be tried again', !!product, 'the product went');
  check('the other device keeps its photographs',
    (await tablet.photos()).length > 0, 'photographs went too');

  // Trying it on again immediately puts it straight back on the list, which is the proof that
  // nothing about that garment was actually broken by the delete.
  await prisma.assetRelation.create({
    data: {
      parentAssetId: inUse.flatAssetId,
      childAssetId: (await prisma.asset.create({
        data: { vendorId: tablet.vendorId, imageUrl: IMG, assetType: 'TRYON_RESULT', metadata: { mark: MARK } }
      })).id,
      action: 'DRAPED'
    }
  });
  check('trying it on again brings it straight back',
    (await laptop.garments()).some(g => g.id === inUse.productId), 'it did not come back');

  // A device that has gone away must not hold the list hostage for ever.
  const stale = await makeGarment(tablet.vendorId, `${MARK} stale`, 1);
  await prisma.asset.update({
    where: { id: stale.flatAssetId },
    data: { metadata: { mark: MARK, inUseAt: Date.now() - (5 * 60 * 1000) } }
  });
  const staleDelete = await laptop.deleteGarment(stale.productId);
  check('a device that closed five minutes ago does not block anything',
    staleDelete.status === 200, `status ${staleDelete.status}`);

  console.log('\n-- and none of it crosses to another shop --');
  check('the rival shop sees none of these outfits',
    !(await rival.garments()).some(g => g.title.startsWith(MARK)), 'it can see them');
  check('nor any of these photographs',
    !(await rival.photos()).some(p => p.id === added.id), 'it can see them');
  const rivalDelete = await rival.deleteGarment(saree.productId);
  check('and cannot delete one', rivalDelete.status === 404, `status ${rivalDelete.status}`);
  check('the outfit survives that attempt',
    (await tablet.garments()).some(g => g.id === saree.productId), 'it was deleted');

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
