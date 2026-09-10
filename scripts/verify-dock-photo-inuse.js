/**
 * Deleting a photograph somebody else is being fitted with, and the beat that prevents it.
 *
 * A garment had two protections from the day it was written: a heartbeat that keeps it alive
 * while a page has it open, and a check that makes deleting it on another device ask first.
 * A PHOTOGRAPH had neither, which was backwards -- deleting a garment takes an outfit off a
 * list, deleting a photograph takes away the customer standing in front of somebody, along
 * with their try-ons and anything published from them.
 *
 * Two things went wrong because of it, both mid-customer and both silent:
 *
 *   - a fitting that ran longer than twenty minutes between generations had its photograph
 *     swept, because "used" was only recorded on pick and on generate, and a customer who is
 *     deciding is using it the whole time while touching nothing
 *   - a colleague tidying the dock on another device deleted it with no warning at all
 *
 * The bar here:
 *
 *   - an untouched photograph still deletes immediately. This adds a warning, not a lock.
 *   - one in use answers 409 and SURVIVES.
 *   - ?force=1 goes through, because it is the shop's dock and the shop's decision.
 *   - a stale beat stops protecting. A page closed five minutes ago blocks nothing.
 *   - touching keeps it alive AND marks it in use -- the expiry fix and the warning fix are
 *     the same beat, and a suite that only checked one would let the other rot.
 *   - none of it crosses to another shop.
 *
 *   node scripts/verify-dock-photo-inuse.js
 */
require('dotenv').config();
const jwt = require('jsonwebtoken');
const prisma = require('../lib/prisma');
const { JWT_SECRET } = require('../middleware/auth');

const BASE = process.env.DOCK_TEST_BASE || 'http://localhost:4099';
const A = { email: 'claude-recovery-test@example.invalid' };
const B = { email: 'claude-dock-other@example.invalid' };
const IMG = 'https://gsriztjnocjwgqkaxhhz.supabase.co/storage/v1/object/public/tryon-fits/default%20models/44.jpeg';

let passed = 0, failed = 0;
const failures = [];
const check = (name, ok, detail) => {
  if (ok) { passed++; console.log(`  [PASS] ${name}`); }
  else { failed++; failures.push(name); console.log(`  [FAIL] ${name}${detail !== undefined ? `  -> ${detail}` : ''}`); }
};

/** Signed here rather than through /login, which is rate limited -- see the sibling suites. */
async function session(who) {
  const vendor = await prisma.vendor.findUnique({ where: { email: who.email }, select: { id: true, role: true } });
  if (!vendor) throw new Error(`no such test account: ${who.email}`);
  return {
    vendorId: vendor.id,
    token: jwt.sign({ vendorId: vendor.id, role: vendor.role, jti: Math.random().toString(36).slice(2) },
      JWT_SECRET, { expiresIn: '1h' })
  };
}

const call = (token, path, options = {}) => fetch(`${BASE}/api/tryon/dock${path}`, {
  headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
  ...options
});
const json = async (res) => { try { return await res.json(); } catch { return null; } };
const listPhotos = async (t) => (await json(await call(t, '')))?.photos || [];
const addPhoto = async (t) => (await json(await call(t, '/photos', { method: 'POST', body: JSON.stringify({ imageUrl: IMG }) })));
const idOf = (body) => body?.photo?.id || body?.id;
const meta = async (id) => (await prisma.asset.findUnique({ where: { id }, select: { metadata: true } }))?.metadata || {};

/** Pushes the beat back in time, instead of making the suite sleep ninety seconds. */
const ageBeat = async (id, ms) => {
  const m = await meta(id);
  await prisma.asset.update({ where: { id }, data: { metadata: { ...m, inUseAt: Date.now() - ms } } });
};

async function run() {
  const a = await session(A);
  const b = await session(B);
  await call(a.token, '', { method: 'DELETE' });

  console.log('\n-- an untouched photograph deletes exactly as it always did --');
  const plain = idOf(await addPhoto(a.token));
  const plainRes = await call(a.token, `/photos/${plain}`, { method: 'DELETE' });
  check('no beat, no warning: it just goes', plainRes.status === 200, `status ${plainRes.status}`);
  check('and it is actually gone', !(await listPhotos(a.token)).some(p => p.id === plain));

  console.log('\n-- one somebody is being fitted with --');
  const held = idOf(await addPhoto(a.token));
  const touchRes = await call(a.token, `/photos/${held}/touch`, { method: 'POST' });
  check('the page can say it has this open', touchRes.status === 200, `status ${touchRes.status}`);

  const m = await meta(held);
  check('touching records inUseAt (this is what makes the delete ask)', typeof m.inUseAt === 'number', JSON.stringify(m));
  check('touching also records lastUsedAt (this is what stops it expiring)', typeof m.lastUsedAt === 'number', JSON.stringify(m));
  check('and they are the same beat, not two clocks drifting apart',
    Math.abs((m.inUseAt || 0) - (m.lastUsedAt || 0)) < 1000);

  const blocked = await call(a.token, `/photos/${held}`, { method: 'DELETE' });
  const blockedBody = await json(blocked);
  check('deleting it answers 409, not 200', blocked.status === 409, `status ${blocked.status}`);
  check('and says why, so the interface can make it a question', blockedBody?.inUse === true, JSON.stringify(blockedBody));
  check('THE PHOTOGRAPH SURVIVES -- the fitting is not interrupted',
    (await listPhotos(a.token)).some(p => p.id === held), 'it was deleted despite being in use');

  console.log('\n-- but the shop can still say yes --');
  const forced = await call(a.token, `/photos/${held}?force=1`, { method: 'DELETE' });
  check('?force=1 goes through', forced.status === 200, `status ${forced.status}`);
  check('and it is gone', !(await listPhotos(a.token)).some(p => p.id === held));

  console.log('\n-- a page that closed five minutes ago protects nothing --');
  const stale = idOf(await addPhoto(a.token));
  await call(a.token, `/photos/${stale}/touch`, { method: 'POST' });
  await ageBeat(stale, 5 * 60 * 1000);
  const staleRes = await call(a.token, `/photos/${stale}`, { method: 'DELETE' });
  check('a stale beat does not block a delete', staleRes.status === 200, `status ${staleRes.status}`);

  console.log('\n-- the beat is what keeps a long fitting alive --');
  const fitting = idOf(await addPhoto(a.token));
  await prisma.asset.update({
    where: { id: fitting },
    data: { metadata: { ...(await meta(fitting)), lastUsedAt: Date.now() - (19 * 60 * 1000) } }
  });
  await call(a.token, `/photos/${fitting}/touch`, { method: 'POST' });
  const after = await meta(fitting);
  check('a photograph 19 minutes old is pushed back to now by one beat',
    Date.now() - after.lastUsedAt < 5000, `age ${Date.now() - after.lastUsedAt}ms`);
  check('so it is still in the dock', (await listPhotos(a.token)).some(p => p.id === fitting));

  console.log('\n-- and none of it crosses to another shop --');
  const mine = idOf(await addPhoto(a.token));
  await call(a.token, `/photos/${mine}/touch`, { method: 'POST' });
  const rivalTouch = await call(b.token, `/photos/${mine}/touch`, { method: 'POST' });
  check('a rival cannot beat on my photograph', rivalTouch.status === 404, `status ${rivalTouch.status}`);
  const rivalForce = await call(b.token, `/photos/${mine}?force=1`, { method: 'DELETE' });
  check('nor force-delete it', rivalForce.status === 404, `status ${rivalForce.status}`);
  check('it is still mine', (await listPhotos(a.token)).some(p => p.id === mine));

  console.log('\n-- clearing the whole dock still clears it --');
  /**
   * The regression this exists to stop coming back.
   *
   * clear() empties the dock by calling deletePhoto in a loop. The moment deletePhoto learned
   * to refuse a photograph in use, clear started silently skipping exactly the ones a
   * colleague had open -- and counting them as removed anyway, because { inUse: true } is
   * truthy. The shop pressed clear, the dock stayed, and the response said it had worked.
   *
   * The suites all missed it because they clear at the START of a run, before any heartbeat
   * has marked anything. So this one adds, beats, and only then clears.
   */
  const kept = [];
  for (let i = 0; i < 3; i++) kept.push(idOf(await addPhoto(a.token)));
  for (const id of kept) await call(a.token, `/photos/${id}/touch`, { method: 'POST' });
  // Everything in the dock, not just the three added here -- earlier sections leave some
  // behind on purpose, and the count must describe the dock, not this paragraph.
  const beforeClear = (await listPhotos(a.token)).length;
  const cleared = await json(await call(a.token, '', { method: 'DELETE' }));
  const leftBehind = await listPhotos(a.token);
  check('clearing removes photographs even while they are in use',
    leftBehind.length === 0, `${leftBehind.length} left behind`);
  check('and the count it reports is the number actually removed',
    cleared?.removed === beforeClear, `said ${cleared?.removed}, dock held ${beforeClear}`);


  console.log('\n-- two devices forcing at the same moment --');
  const contested = idOf(await addPhoto(a.token));
  const both = await Promise.all([
    call(a.token, `/photos/${contested}?force=1`, { method: 'DELETE' }),
    call(a.token, `/photos/${contested}?force=1`, { method: 'DELETE' })
  ]);
  check('neither gets a 500', both.every(r => r.status !== 500), both.map(r => r.status).join(','));
  check('one wins, the other is told it is already gone',
    both.some(r => r.status === 200) && both.some(r => r.status === 404), both.map(r => r.status).join(','));

  await call(a.token, '', { method: 'DELETE' });

  console.log('\n' + '-'.repeat(60));
  console.log(`${passed} passed, ${failed} failed`);
  if (failed) { console.log('FAILED:'); failures.forEach(f => console.log('  - ' + f)); }
  process.exitCode = failed ? 1 : 0;
}

run().catch(e => { console.error('\nsuite error:', e.message); process.exitCode = 1; })
     .finally(() => prisma.$disconnect());
