/**
 * Verifies session-expiry, per-device guest counting, and refund-on-failure.
 *
 * Runs the REAL routes and the REAL auth middleware in-process, with the database, the AI
 * pipeline, storage and the gateway swapped for in-memory fakes. Nothing here touches the
 * shared production database or spends a generation.
 *
 *   node scripts/verify-credits-refund.js
 */
const path = require('path');
const http = require('http');
const jwt = require('jsonwebtoken');

const root = path.join(__dirname, '..');
const stub = (rel, exportsObj) => {
  const file = require.resolve(path.join(root, rel));
  require.cache[file] = { id: file, filename: file, loaded: true, exports: exportsObj };
};

// ── in-memory database ─────────────────────────────────────────────────────
const db = { vendors: new Map(), guests: new Map(), assets: new Map() };
let seq = 0;
const matches = (row, where) => Object.entries(where).every(([k, cond]) => {
  if (k === 'OR') return cond.some(w => matches(row, w));
  if (cond && typeof cond === 'object') {
    if ('gt' in cond) return row[k] > cond.gt;
    if ('lt' in cond) return row[k] < cond.lt;
    if ('startsWith' in cond) return String(row[k]).startsWith(cond.startsWith);
  }
  return row[k] === cond;
});
const apply = (row, data) => {
  for (const [k, v] of Object.entries(data)) {
    if (v && typeof v === 'object' && 'increment' in v) row[k] += v.increment;
    else if (v && typeof v === 'object' && 'decrement' in v) row[k] -= v.decrement;
    else row[k] = v;
  }
};
const table = (map, uniqueKey) => ({
  findUnique: async ({ where }) => {
    for (const r of map.values()) if (matches(r, where)) return { ...r };
    return null;
  },
  findMany: async ({ where }) => [...map.values()].filter(r => matches(r, where)).map(r => ({ ...r })),
  updateMany: async ({ where, data }) => {
    let count = 0;
    for (const r of map.values()) if (matches(r, where)) { apply(r, data); count++; }
    return { count };
  },
  update: async ({ where, data }) => {
    const r = [...map.values()].find(x => matches(x, where));
    if (!r) throw new Error('not found');
    apply(r, data); return { ...r };
  },
  upsert: async ({ where, create }) => {
    const hit = [...map.values()].find(x => matches(x, where));
    if (hit) return { ...hit };
    const row = { id: `g${++seq}`, ...create };
    map.set(row.id, row); return { ...row };
  },
  create: async ({ data }) => { const row = { id: `a${++seq}`, ...data }; map.set(row.id, row); return { ...row }; },
});
const fakePrisma = {
  vendor: table(db.vendors),
  guestLimit: table(db.guests),
  asset: table(db.assets),
  assetRelation: { create: async () => ({}) },
};

// ── controllable pipeline ──────────────────────────────────────────────────
let pipelineFails = false;
const maybeFail = async () => { if (pipelineFails) throw new Error('simulated AI failure'); };
stub('lib/prisma.js', fakePrisma);
stub('pipeline.js', {
  runTryOn: async () => { await maybeFail(); return { resultImageUrl: 'https://img.test/result.png' }; },
  generateFrontView: async () => ({}),
  changeBackgroundWithGemini: async () => { await maybeFail(); return 'b64'; },
  modifyOutfitWithGemini: async () => { await maybeFail(); return 'b64'; },
});
stub('storage.js', { uploadBufferToSupabase: async () => 'u', uploadBase64ToSupabase: async () => 'https://img.test/new.png' });
stub('services/gatewayTracker.js', { reportUsageToGateway: () => {} });
stub('services/watermarkManager.js', { processWatermark: async (b) => b });

// image downloads inside the routes
const realFetch = global.fetch;
global.fetch = async (url, opts) => {
  if (String(url).startsWith('http://127.0.0.1')) return realFetch(url, opts);
  return { ok: true, arrayBuffer: async () => new ArrayBuffer(8) };
};

const express = require('express');
const app = express();
app.set('trust proxy', 1);
app.use(express.json());
app.use(require(path.join(root, 'routes/tryon.routes.js')));
const { JWT_SECRET } = require(path.join(root, 'middleware/auth.js'));
const { GUEST_DEVICE_LIMIT, GUEST_NETWORK_LIMIT } = require(path.join(root, 'services/credits'));

// ── harness ────────────────────────────────────────────────────────────────
let pass = 0, fail = 0;
const check = (name, cond, extra = '') => {
  if (cond) { pass++; console.log('  PASS  ' + name); }
  else { fail++; console.log('  FAIL  ' + name + (extra ? '  -> ' + extra : '')); }
};

let base;
const post = async (route, body, { token, ip = '10.0.0.1' } = {}) => {
  const res = await realFetch(base + route, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': ip, ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(body)
  });
  return { status: res.status, body: await res.json().catch(() => ({})) };
};
const gen = (extra = {}, opts) => post('/api/tryon/generate', { garment_image_url: 'g', human_image_url: 'h', ...extra }, opts);
const guestRow = (key) => [...db.guests.values()].find(r => r.ipAddress === key);
const vendorTok = (id, exp) => jwt.sign({ vendorId: id, role: 'vendor', ...(exp ? { exp } : {}) }, JWT_SECRET, exp ? {} : { expiresIn: '1h' });

(async () => {
  const server = http.createServer(app).listen(0);
  await new Promise(r => server.once('listening', r));
  base = `http://127.0.0.1:${server.address().port}`;

  console.log('\n1. Expired logins');
  {
    const past = Math.floor(Date.now() / 1000) - 60;
    const r = await gen({}, { token: vendorTok('v1', past) });
    check('our expired token -> 401 SESSION_EXPIRED', r.status === 401 && r.body.error === 'SESSION_EXPIRED', JSON.stringify(r));
    const foreign = jwt.sign({ role: 'vendor' }, 'another-system-secret', { expiresIn: '1h' });
    const r2 = await gen({ guest_device_id: 'device-foreign-1' }, { token: foreign, ip: '10.9.9.9' });
    check('foreign-signed token still treated as guest (unchanged)', r2.status === 200, JSON.stringify(r2));
    const r3 = await gen({ guest_device_id: 'device-garbage-1' }, { token: 'expired.dummy.token', ip: '10.9.9.8' });
    check('garbage token still treated as guest (unchanged)', r3.status === 200, JSON.stringify(r3));
    check('expired login charged nobody', db.guests.size === 2 && !guestRow('10.0.0.1'));
  }

  console.log('\n2. Refund on failure -- guest');
  {
    pipelineFails = true;
    const r = await gen({ guest_device_id: 'device-aaaa-1' }, { ip: '10.1.1.1' });
    check('failed generation returns 500', r.status === 500);
    check('guest credit given back', guestRow('10.1.1.1#device-aaaa-1').tryonCount === 0, String(guestRow('10.1.1.1#device-aaaa-1')?.tryonCount));
    pipelineFails = false;
    const ok = await gen({ guest_device_id: 'device-aaaa-1' }, { ip: '10.1.1.1' });
    check('successful generation keeps the charge', ok.status === 200 && guestRow('10.1.1.1#device-aaaa-1').tryonCount === 1);
  }

  console.log('\n3. Refund on failure -- vendor, every route and bucket');
  {
    db.vendors.set('v2', { id: 'v2', isUnlimited: false, drapeCredits: 3, userTryonCredits: 3, bgChangeCredits: 3, blouseChangeCredits: 3 });
    const tok = vendorTok('v2');
    pipelineFails = true;
    await gen({}, { token: tok });
    await gen({ parent_generation_id: 'p1' }, { token: tok });
    await post('/api/tryon/change-background', { imageUrl: 'https://img.test/x.png', backgroundId: 'bg1' }, { token: tok });
    await post('/api/tryon/modify-outfit', { imageUrl: 'https://img.test/x.png', modificationType: 'elbow-sleeve' }, { token: tok });
    const v = db.vendors.get('v2');
    check('drape credit refunded', v.drapeCredits === 3, String(v.drapeCredits));
    check('customer try-on credit refunded', v.userTryonCredits === 3, String(v.userTryonCredits));
    check('background credit refunded', v.bgChangeCredits === 3, String(v.bgChangeCredits));
    check('outfit-edit credit refunded', v.blouseChangeCredits === 3, String(v.blouseChangeCredits));
    pipelineFails = false;
    const ok = await post('/api/tryon/change-background', { imageUrl: 'https://img.test/x.png', backgroundId: 'bg1' }, { token: tok });
    check('successful background change keeps its charge', ok.status === 200 && db.vendors.get('v2').bgChangeCredits === 2, JSON.stringify(ok));
  }

  console.log('\n4. Vendor limits');
  {
    db.vendors.set('v3', { id: 'v3', isUnlimited: false, drapeCredits: 1, userTryonCredits: 0, bgChangeCredits: 0, blouseChangeCredits: 0 });
    const tok = vendorTok('v3');
    const a = await gen({}, { token: tok });
    const b = await gen({}, { token: tok });
    check('last credit spendable', a.status === 200);
    check('then 403 INSUFFICIENT_CREDITS', b.status === 403 && b.body.error === 'INSUFFICIENT_CREDITS');
    check('never goes negative', db.vendors.get('v3').drapeCredits === 0);
    db.vendors.set('v4', { id: 'v4', isUnlimited: true, drapeCredits: 0, userTryonCredits: 0, bgChangeCredits: 0, blouseChangeCredits: 0 });
    const u = await gen({}, { token: vendorTok('v4') });
    check('unlimited vendor unaffected', u.status === 200 && db.vendors.get('v4').drapeCredits === 0);
    const gone = await gen({}, { token: vendorTok('deleted-vendor') });
    check('deleted account -> 401 SESSION_EXPIRED (was "Vendor not found")', gone.status === 401 && gone.body.error === 'SESSION_EXPIRED');
  }

  console.log('\n5. Guests per device, with a network ceiling');
  {
    const ip = '10.2.2.2';
    for (let i = 0; i < GUEST_DEVICE_LIMIT; i++) await gen({ guest_device_id: 'device-shop-A' }, { ip });
    const over = await gen({ guest_device_id: 'device-shop-A' }, { ip });
    check(`device A stops at ${GUEST_DEVICE_LIMIT}`, over.status === 401 && over.body.error === 'GUEST_LIMIT_REACHED');
    const other = await gen({ guest_device_id: 'device-shop-B' }, { ip });
    check('device B on the SAME Wi-Fi still has its own tries', other.status === 200, JSON.stringify(other));
    // fill the network
    let d = 0;
    while (db.guests.size < 100) {
      const r = await gen({ guest_device_id: `device-fill-${d++}` }, { ip });
      if (r.status !== 200) break;
    }
    const total = [...db.guests.values()].filter(r => r.ipAddress.startsWith(ip)).reduce((s, r) => s + r.tryonCount, 0);
    check(`network ceiling holds at ${GUEST_NETWORK_LIMIT}`, total === GUEST_NETWORK_LIMIT, String(total));
    const fresh = await gen({ guest_device_id: 'device-brand-new' }, { ip });
    check('new device on a full network is refused', fresh.status === 401);
  }

  console.log('\n6. Old cached site (no device id) behaves exactly as before');
  {
    const ip = '10.3.3.3';
    for (let i = 0; i < 10; i++) await gen({}, { ip });
    const over = await gen({}, { ip });
    check('counted per IP, stops at 10', over.status === 401 && guestRow(ip).tryonCount === 10);
    const junk = await gen({ guest_device_id: '<script>' }, { ip });
    check('malformed device id ignored -> falls back to IP', junk.status === 401 && !guestRow(`${ip}#<script>`));
  }

  server.close();
  console.log('\n' + '='.repeat(52) + `\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
