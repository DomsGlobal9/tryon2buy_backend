// Background and blouse changes start from the picture on screen, which carries a full-width
// watermark across the garment. Google redrew that haze into the fabric, then a second watermark
// went on top, so every edit lost quality and two edits stacked two logos. Now each watermarked
// result also keeps a clean twin, and edits start from the twin.
//
// The twin's name is an HMAC of the watermarked file's path, keyed with the Supabase service_role key,
// so the server can find it from the watermarked URL but nobody else can guess it -- a predictable
// name (same id, another folder) would let anyone strip the watermark by editing the URL. The twin
// URL never leaves the server.
const crypto = require('crypto');
const sharp = require('sharp');
const { uploadBufferToPath, BUCKET } = require('../storage');

const SECRET = process.env.SUPABASE_KEY?.trim() || ''; // the service_role key (private), as in supabaseClient.js
const PUBLIC_MARKER = `/storage/v1/object/public/${BUCKET}/`;

/** results/... path inside our bucket, or null for anything else (other hosts, other folders). */
function resultPathOf(url) {
  if (typeof url !== 'string') return null;
  const i = url.indexOf(PUBLIC_MARKER);
  if (i < 0) return null;
  const filePath = decodeURIComponent(url.slice(i + PUBLIC_MARKER.length).split('?')[0]);
  return filePath.startsWith('results/') && !filePath.startsWith('results/clean/') ? filePath : null;
}

function twinPathOf(url) {
  const filePath = resultPathOf(url);
  if (!filePath || !SECRET) return null;
  const name = crypto.createHmac('sha256', SECRET).update(filePath).digest('hex').slice(0, 40);
  return `results/clean/${name}.jpg`;
}

/** Keep the clean picture next to a watermarked result. Never fails the request. */
async function saveCleanTwin(watermarkedUrl, cleanB64) {
  const twinPath = twinPathOf(watermarkedUrl);
  if (!twinPath) return;
  try {
    const jpeg = await sharp(Buffer.from(cleanB64, 'base64')).jpeg({ quality: 95, chromaSubsampling: '4:4:4' }).toBuffer();
    await uploadBufferToPath(jpeg, twinPath, 'jpg');
  } catch (err) {
    console.warn('[CleanCopy] Could not keep the clean picture:', err.message);
  }
}

/** The picture an edit should start from: the clean twin when there is one, else the URL itself. */
async function editSourceFor(imageUrl) {
  const twinPath = twinPathOf(imageUrl);
  if (!twinPath) return imageUrl;
  const twinUrl = imageUrl.slice(0, imageUrl.indexOf(PUBLIC_MARKER) + PUBLIC_MARKER.length) + twinPath;
  try {
    const head = await fetch(twinUrl, { method: 'HEAD', signal: AbortSignal.timeout(10000) });
    return head.ok ? twinUrl : imageUrl;
  } catch {
    return imageUrl;
  }
}

module.exports = { saveCleanTwin, editSourceFor };
