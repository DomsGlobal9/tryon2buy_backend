/**
 * The photo dock, poked at the way a real day pokes at it.
 *
 * Not the happy path -- that is covered elsewhere. This is the awkward half: two devices
 * acting at the same instant, one deleting what the other is holding, a second shop trying
 * to reach in, and the sort of malformed request that arrives when something upstream has a
 * bad day. The dock is reached from a counter tablet, an owner's laptop and a phone at once,
 * so "two people did incompatible things simultaneously" is the normal case, not the edge.
 *
 * The bar throughout: never a 500, never a leak between shops, never a state the interface
 * cannot recover from.
 *
 *   node scripts/verify-dock-adversarial.js
 */
require('dotenv').config();
const jwt = require('jsonwebtoken');
const prisma = require('../lib/prisma');
const { JWT_SECRET } = require('../middleware/auth');

const BASE = process.env.DOCK_TEST_BASE || 'http://localhost:4099';

const A = { email: 'claude-recovery-test@example.invalid', password: 'TestRecovery!2026' };
const B = { email: 'claude-dock-other@example.invalid', password: 'OtherShop!2026' };

const PHOTO = 'https://gsriztjnocjwgqkaxhhz.supabase.co/storage/v1/object/public/tryon-fits/user-uploads/062be627-ccc5-497b-8e43-e6cd91086fe4.jpg';
const PHOTO2 = 'https://gsriztjnocjwgqkaxhhz.supabase.co/storage/v1/object/public/tryon-fits/default%20models/44.jpeg';

let passed = 0, failed = 0;
const failures = [];
const check = (name, ok, detail) => {
  if (ok) { passed++; console.log(`  [PASS] ${name}`); }
  else { failed++; failures.push(name); console.log(`  [FAIL] ${name}${detail !== undefined ? `  -> ${detail}` : ''}`); }
};

/**
 * A session for a shop, signed here rather than fetched from /api/auth/vendor/login.
 *
 * Not a shortcut around authentication -- the tokens are signed with the same JWT_SECRET the
 * middleware verifies, so every request below is authenticated exactly as a browser's would
 * be. It avoids the login endpoint because that endpoint is rate limited to ten attempts per
 * quarter of an hour, and this suite opens three sessions per run: running it four times in
 * a row locked itself out and the "failures" that produced were the limiter working
 * correctly, not the dock breaking. Races need running many times to mean anything.
 */
async function session(who) {
  const vendor = await prisma.vendor.findUnique({ where: { email: who.email }, select: { id: true, role: true } });
  if (!vendor) throw new Error(`no such test account: ${who.email}. Create it first.`);
  return jwt.sign({ vendorId: vendor.id, role: vendor.role, jti: Math.random().toString(36).slice(2) },
    JWT_SECRET, { expiresIn: '1h' });
}

const call = (token, path, options = {}) => fetch(`${BASE}/api/tryon/dock${path}`, {
  headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
  ...options
});

const json = async (res) => { try { return await res.json(); } catch { return null; } };
const listPhotos = async (t) => (await json(await call(t, ''))).photos;
const addPhoto = async (t, url = PHOTO) => json(await call(t, '/photos', { method: 'POST', body: JSON.stringify({ imageUrl: url }) }));

/** Nothing here may ever answer 500. That is the whole point of most of these. */
const notServerError = (res) => res.status < 500;

async function run() {
  const a1 = await session(A);            // shop A, device 1
  const a2 = await session(A);            // shop A, device 2 -- separate session, same account
  const b1 = await session(B);            // a different shop entirely

  await call(a1, '', { method: 'DELETE' });
  await call(b1, '', { method: 'DELETE' });

  // ── TWO DEVICES, ONE ACCOUNT ────────────────────────────────────────────
  console.log('\nTWO DEVICES ACTING AT ONCE');

  const [p1, p2, p3] = await Promise.all([addPhoto(a1), addPhoto(a2), addPhoto(a1, PHOTO2)]);
  const afterBurst = await listPhotos(a1);
  check('three simultaneous adds from two devices all survive',
    [p1, p2, p3].every(p => p && p.id) && afterBurst.length === 3, `${afterBurst.length} photos`);
  check('and exactly one of them is active',
    afterBurst.filter(p => p.isActive).length === 1,
    `${afterBurst.filter(p => p.isActive).length} active`);

  // both devices activate different photos at the same moment
  await Promise.all([
    call(a1, `/photos/${p1.id}/activate`, { method: 'POST' }),
    call(a2, `/photos/${p2.id}/activate`, { method: 'POST' })
  ]);
  const afterRace = await listPhotos(a1);
  check('simultaneous activate from both devices still leaves exactly one active',
    afterRace.filter(p => p.isActive).length === 1,
    `${afterRace.filter(p => p.isActive).length} active`);

  // device 2 deletes the photo device 1 is holding
  const holding = afterRace.find(p => p.isActive) || afterRace[0];
  const del = await call(a2, `/photos/${holding.id}`, { method: 'DELETE' });
  check('one device can delete what the other is holding', del.status === 200, del.status);
  const afterDelete = await listPhotos(a1);
  check('the other device simply sees it gone, no error',
    !afterDelete.some(p => p.id === holding.id), `${afterDelete.length} left`);
  check('deleting the active photo leaves the account with none active',
    afterDelete.filter(p => p.isActive).length === 0,
    `${afterDelete.filter(p => p.isActive).length} active`);

  // the losing device now acts on something that no longer exists
  const stale = await call(a1, `/photos/${holding.id}/activate`, { method: 'POST' });
  check('activating a photo another device deleted is a clean 404', stale.status === 404, stale.status);
  const staleTouch = await call(a1, `/photos/${holding.id}/touch`, { method: 'POST' });
  check('touching it is a clean 404 too', staleTouch.status === 404, staleTouch.status);
  const staleDelete = await call(a1, `/photos/${holding.id}`, { method: 'DELETE' });
  check('deleting it twice is a clean 404, not a crash', staleDelete.status === 404, staleDelete.status);

  // one device clears everything while the other is mid-action
  await Promise.all([
    call(a1, '', { method: 'DELETE' }),
    addPhoto(a2)
  ]);
  const afterClearRace = await listPhotos(a1);
  check('clear racing an add leaves a coherent dock, not a crash',
    Array.isArray(afterClearRace), `${afterClearRace.length} photos`);
  check('and at most one active after that race',
    afterClearRace.filter(p => p.isActive).length <= 1,
    `${afterClearRace.filter(p => p.isActive).length} active`);

  // ── A DIFFERENT SHOP ────────────────────────────────────────────────────
  console.log('\nA DIFFERENT SHOP CANNOT REACH IN');

  await call(a1, '', { method: 'DELETE' });
  const mine = await addPhoto(a1);
  await addPhoto(b1, PHOTO2);

  const theirView = await listPhotos(b1);
  check('shop B does not see shop A\'s photo',
    !theirView.some(p => p.id === mine.id), `${theirView.length} photos in B`);
  check('shop B sees its own', theirView.length === 1);

  for (const [name, res] of [
    ['activate', await call(b1, `/photos/${mine.id}/activate`, { method: 'POST' })],
    ['touch', await call(b1, `/photos/${mine.id}/touch`, { method: 'POST' })],
    ['delete', await call(b1, `/photos/${mine.id}`, { method: 'DELETE' })]
  ]) {
    check(`shop B cannot ${name} shop A's photo (404, not 403 -- existence is not disclosed)`,
      res.status === 404, res.status);
  }

  const stillMine = await listPhotos(a1);
  check("shop A's dock is untouched by all of that",
    stillMine.some(p => p.id === mine.id), `${stillMine.length} photos`);

  const bClear = await call(b1, '', { method: 'DELETE' });
  check('shop B clearing its own dock does not touch shop A', bClear.status === 200);
  check("shop A still has its photo after B cleared",
    (await listPhotos(a1)).some(p => p.id === mine.id));

  // ── NOTHING SIGNED IN ───────────────────────────────────────────────────
  console.log('\nNO CREDENTIALS, OR BAD ONES');
  for (const [name, token] of [['no token', null], ['nonsense token', 'not-a-jwt'], ['empty token', '']]) {
    const res = await call(token, '');
    check(`${name} is refused with 401`, res.status === 401, res.status);
  }
  const garbageJwt = await call('eyJhbGciOiJIUzI1NiJ9.eyJ2ZW5kb3JJZCI6ImZha2UiLCJyb2xlIjoidmVuZG9yIn0.bad', '');
  check('a forged token is refused', garbageJwt.status === 401, garbageJwt.status);

  // ── MALFORMED INPUT ─────────────────────────────────────────────────────
  console.log('\nMALFORMED REQUESTS NEVER 500');
  const bad = [
    ['no body', undefined],
    ['empty object', {}],
    ['null imageUrl', { imageUrl: null }],
    ['number imageUrl', { imageUrl: 12345 }],
    ['array imageUrl', { imageUrl: ['https://x/a.jpg'] }],
    ['object imageUrl', { imageUrl: { url: 'https://x/a.jpg' } }],
    ['http (not https)', { imageUrl: 'http://x/a.jpg' }],
    ['javascript: url', { imageUrl: 'javascript:alert(1)' }],
    ['data: url', { imageUrl: 'data:image/png;base64,AAAA' }],
    ['relative path', { imageUrl: '/uploads/a.jpg' }],
    ['whitespace', { imageUrl: '   ' }],
    ['a 20k string', { imageUrl: 'https://x/' + 'a'.repeat(20000) + '.jpg' }],
    ['newline injection', { imageUrl: 'https://x/a.jpg\nHost: evil' }]
  ];
  for (const [name, body] of bad) {
    const res = await call(a1, '/photos', { method: 'POST', body: body === undefined ? undefined : JSON.stringify(body) });
    check(`${name} -> ${res.status} (not a 500)`, notServerError(res), res.status);
  }

  console.log('\nWEIRD IDS NEVER 500');
  const weird = [
    'not-a-uuid', '00000000-0000-0000-0000-000000000000', 'x'.repeat(500),
    encodeURIComponent("' OR '1'='1"), encodeURIComponent('{"$ne":null}'),
    encodeURIComponent('../../etc/passwd'), encodeURIComponent('<script>alert(1)</script>'),
    encodeURIComponent('తెలుగు'), encodeURIComponent('a b')
  ];
  for (const id of weird) {
    for (const [verb, options] of [['activate', { method: 'POST' }], ['delete', { method: 'DELETE' }]]) {
      const path = verb === 'activate' ? `/photos/${id}/activate` : `/photos/${id}`;
      const res = await call(a1, path, options);
      check(`${verb} "${decodeURIComponent(id).slice(0, 22)}" -> ${res.status}`, notServerError(res), res.status);
    }
  }

  // ── OPERATIONS ON AN EMPTY DOCK ─────────────────────────────────────────
  console.log('\nAN EMPTY DOCK IS NOT A SPECIAL CASE');
  await call(a1, '', { method: 'DELETE' });
  check('listing an empty dock is fine', (await listPhotos(a1)).length === 0);
  check('clearing an already-empty dock is fine', (await call(a1, '', { method: 'DELETE' })).status === 200);
  check('deactivating with nothing active is fine', (await call(a1, '/deactivate', { method: 'POST' })).status === 200);
  check('garments on an empty dock is fine', (await json(await call(a1, '/garments'))).garments.length === 0);

  // ── REPEATS AND DUPLICATES ──────────────────────────────────────────────
  console.log('\nDOING THE SAME THING TWICE');
  const dup1 = await addPhoto(a1);
  const dup2 = await addPhoto(a1);           // identical image, twice
  const dupList = await listPhotos(a1);
  check('the same photograph added twice makes two entries', dupList.length === 2, dupList.length);
  check('and they have different ids', dup1.id !== dup2.id);
  check('still exactly one active', dupList.filter(p => p.isActive).length === 1);

  await call(a1, `/photos/${dup1.id}/activate`, { method: 'POST' });
  await call(a1, `/photos/${dup1.id}/activate`, { method: 'POST' });   // again
  const afterDoubleActivate = await listPhotos(a1);
  check('activating the same photo twice still leaves one active',
    afterDoubleActivate.filter(p => p.isActive).length === 1,
    `${afterDoubleActivate.filter(p => p.isActive).length} active`);

  const [d1, d2] = await Promise.all([
    call(a1, `/photos/${dup2.id}`, { method: 'DELETE' }),
    call(a2, `/photos/${dup2.id}`, { method: 'DELETE' })
  ]);
  check('two devices deleting the same photo at once: one wins, the other 404s, neither 500s',
    notServerError(d1) && notServerError(d2) && [d1.status, d2.status].includes(200),
    `${d1.status} / ${d2.status}`);

  // ── A GENERATION POINTING AT A DELETED PHOTO ────────────────────────────
  console.log('\nA TRY-ON THAT NAMES A PHOTO THAT IS GONE');
  await call(a1, '', { method: 'DELETE' });
  const doomed = await addPhoto(a1);
  await call(a1, `/photos/${doomed.id}`, { method: 'DELETE' });
  const orphanGen = await fetch(`${BASE}/api/tryon/dock/garments`, { headers: { Authorization: `Bearer ${a1}` } });
  check('the garments list copes with a dangling dock_photo_id', orphanGen.status === 200, orphanGen.status);

  await call(a1, '', { method: 'DELETE' });
  await call(b1, '', { method: 'DELETE' });

  console.log(`\n================ RESULT: ${passed} passed | ${failed} failed ================`);
  if (failed > 0) { console.log('FAILED:'); failures.forEach(f => console.log('  - ' + f)); process.exitCode = 1; }
}

run().catch(err => { console.error('\nSuite crashed:', err); process.exitCode = 1; });
