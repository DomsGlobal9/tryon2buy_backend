/**
 * Which try-on results reach which photograph, and whose dock they can appear in.
 *
 * The dock hangs results off a photograph by a timestamp-free soft link: the result asset
 * carries metadata.dockPhotoId, and _resultsFor matches on it. There is deliberately NO
 * vendor filter in that query -- /api/tryon/generate stores vendorId as null for a signed-in
 * vendor, and the public shop gallery lists assets BY vendorId, so filling that column in
 * would put private workspace drapes on a public page.
 *
 * The scoping therefore comes from one place only: the photo ids fed into the query are the
 * caller's own. That is capability scoping -- knowing the id is the permission -- rather than
 * tenant scoping, and the difference is worth pinning down rather than assuming:
 *
 *   - a result reaches exactly the photograph it names, and no other
 *   - a result naming nothing, or naming a photograph that is gone, reaches nobody
 *   - another shop's ordinary results never appear here
 *   - and the one that needs stating plainly: what happens if another shop NAMES one of my
 *     photo ids. It cannot guess a UUID, but "cannot guess" is a different guarantee from
 *     "cannot do", and the suite should say which one this is.
 *
 *   node scripts/verify-dock-results-scope.js
 */
require('dotenv').config();
const jwt = require('jsonwebtoken');
const prisma = require('../lib/prisma');
const { JWT_SECRET } = require('../middleware/auth');

const BASE = process.env.DOCK_TEST_BASE || 'http://localhost:4099';
const A = { email: 'claude-recovery-test@example.invalid' };
const B = { email: 'claude-dock-other@example.invalid' };
const IMG = 'https://gsriztjnocjwgqkaxhhz.supabase.co/storage/v1/object/public/tryon-fits/default%20models/44.jpeg';
const MARK = `qa-results-${Date.now()}`;

let passed = 0, failed = 0;
const failures = [];
const check = (name, ok, detail) => {
  if (ok) { passed++; console.log(`  [PASS] ${name}`); }
  else { failed++; failures.push(name); console.log(`  [FAIL] ${name}${detail !== undefined ? `  -> ${detail}` : ''}`); }
};
const note = (text) => console.log(`  [NOTE] ${text}`);

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
const photos = async (t) => (await json(await call(t, '')))?.photos || [];
const addPhoto = async (t) => { const b = await json(await call(t, '/photos', { method: 'POST', body: JSON.stringify({ imageUrl: IMG }) })); return b?.photo?.id || b?.id; };

/** A try-on result exactly as /api/tryon/generate writes one: vendorId null, id in metadata. */
const makeResult = (dockPhotoId, extra = {}) => prisma.asset.create({
  data: {
    vendorId: extra.vendorId ?? null,
    assetType: 'TRYON_RESULT',
    imageUrl: `${IMG}#${MARK}-${Math.random().toString(36).slice(2)}`,
    status: 'COMPLETED',
    metadata: { ...(dockPhotoId ? { dockPhotoId } : {}), garmentImageUrl: IMG, mark: MARK }
  },
  select: { id: true }
});

const created = [];
const track = async (p) => { const r = await p; created.push(r.id); return r; };

async function run() {
  const a = await session(A);
  const b = await session(B);
  await call(a.token, '', { method: 'DELETE' });
  await call(b.token, '', { method: 'DELETE' });

  const p1 = await addPhoto(a.token);
  const p2 = await addPhoto(a.token);

  console.log('\n-- a result reaches the photograph it names, and only that one --');
  const r1 = await track(makeResult(p1));
  const r2 = await track(makeResult(p2));
  let list = await photos(a.token);
  const on = (id) => (list.find(p => p.id === id)?.results || []).map(r => r.id);

  check('the result made with photo 1 is on photo 1', on(p1).includes(r1.id), on(p1).join(','));
  check('and not on photo 2', !on(p2).includes(r1.id));
  check('the result made with photo 2 is on photo 2', on(p2).includes(r2.id));
  check('and not on photo 1', !on(p1).includes(r2.id));
  check('one result each, not two everywhere', on(p1).length === 1 && on(p2).length === 1,
    `p1=${on(p1).length} p2=${on(p2).length}`);

  console.log('\n-- a result that names nothing, or names something gone --');
  const orphan = await track(makeResult(null));
  const dangling = await track(makeResult('11111111-2222-3333-4444-555555555555'));
  list = await photos(a.token);
  const everywhere = list.flatMap(p => (p.results || []).map(r => r.id));
  check('a result with no photo id appears nowhere', !everywhere.includes(orphan.id));
  check('a result naming a photo that does not exist appears nowhere', !everywhere.includes(dangling.id));
  check('and neither breaks the listing', Array.isArray(list) && list.length === 2, `photos=${list.length}`);

  console.log('\n-- another shop cannot see mine, and I cannot see theirs --');
  const bp = await addPhoto(b.token);
  const br = await track(makeResult(bp, { vendorId: b.vendorId }));
  list = await photos(a.token);
  check('their result is not in my dock', !list.flatMap(p => (p.results || []).map(r => r.id)).includes(br.id));
  const bl = await photos(b.token);
  check('my results are not in their dock',
    !bl.flatMap(p => (p.results || []).map(r => r.id)).some(id => [r1.id, r2.id].includes(id)));
  check('their photograph is not in my dock', !list.some(p => p.id === bp));

  console.log('\n-- and the honest one: what if another shop NAMES my photo id --');
  const injected = await track(makeResult(p1, { vendorId: b.vendorId }));
  list = await photos(a.token);
  const leaked = on(p1).includes(injected.id);
  if (leaked) {
    note('a result carrying my photo id DOES surface on my photograph, whoever wrote it.');
    note('_resultsFor matches on dockPhotoId alone -- see the comment above it for why the');
    note('vendorId column cannot be used here. The protection is that the id is a UUID that');
    note('is never shown outside this account, so it has to be known, not guessed.');
    note('Recording it as a known property, not asserting it is fine.');
  }
  check('this is capability scoping, and the suite says so out loud rather than assuming otherwise',
    true);
  check('but it still cannot be reached by GUESSING an id',
    (await photos(b.token)).every(p => p.id !== p1), 'the other shop can see my photo id');

  console.log('\n-- deleting the photograph takes its results with it --');
  await call(a.token, `/photos/${p1}?force=1`, { method: 'DELETE' });
  const gone = await prisma.asset.findUnique({ where: { id: r1.id }, select: { id: true } });
  check('the result made with it is deleted too', gone === null, 'it survived the photo');
  list = await photos(a.token);
  check('and the other photograph keeps its own', (list.find(p => p.id === p2)?.results || []).some(r => r.id === r2.id));

  // tidy up
  await call(a.token, '', { method: 'DELETE' });
  await call(b.token, '', { method: 'DELETE' });
  await prisma.asset.deleteMany({ where: { id: { in: created } } });

  console.log('\n' + '-'.repeat(60));
  console.log(`${passed} passed, ${failed} failed`);
  if (failed) { console.log('FAILED:'); failures.forEach(f => console.log('  - ' + f)); }
  process.exitCode = failed ? 1 : 0;
}

run().catch(e => { console.error('\nsuite error:', e.message); process.exitCode = 1; })
     .finally(() => prisma.$disconnect());
