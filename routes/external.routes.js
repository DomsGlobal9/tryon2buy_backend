const express = require('express');
const { runTryOn, changeBackgroundWithGemini, modifyOutfitWithGemini } = require('../pipeline');
const { uploadBase64ToSupabase } = require('../storage');
const prisma = require('../lib/prisma');

const router = express.Router();

// ── API Key Authentication Middleware ────────────
function requireApiKey(req, res, next) {
  const apiKey = req.headers['x-api-key'];
  const validKey = process.env.TRYON_API_KEY;

  if (!validKey) {
    console.error('[Auth] TRYON_API_KEY not set in .env — rejecting request.');
    return res.status(500).json({ error: 'Server misconfigured: API key not set.' });
  }

  if (!apiKey || apiKey !== validKey) {
    return res.status(401).json({ error: 'Unauthorized — invalid or missing x-api-key header.' });
  }

  next();
}

// ─────────────────────────────────────────────────────────────────────────────
// EXT-1. Virtual Try-On
//    POST /api/external/tryon
//    Body: { garmentImageUrl, humanImageUrl, category }
//    Returns: { resultImageUrl, processingTimeMs }
// ─────────────────────────────────────────────────────────────────────────────
router.post('/api/external/tryon', requireApiKey, async (req, res) => {
  const startTime = Date.now();
  const { garmentImageUrl, humanImageUrl, category } = req.body;

  if (!garmentImageUrl || !humanImageUrl) {
    return res.status(400).json({
      error: 'Missing required fields: garmentImageUrl and humanImageUrl.',
    });
  }

  try {
    console.log(`[External API] Try-On request: category=${category || 'N/A'}`);

    // Call the same pipeline used by internal routes
    const { resultImageUrl, is_mock } = await runTryOn(garmentImageUrl, humanImageUrl, category);

    const processingTimeMs = Date.now() - startTime;
    console.log(`[External API] ✅ Try-On completed in ${processingTimeMs}ms`);

    res.json({
      success: true,
      resultImageUrl,
      processingTimeMs,
      is_mock,
    });
  } catch (err) {
    console.error('[External API] Try-On failed:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// EXT-2. Background Change (Gemini Compositing)
//    POST /api/external/change-background
//    Body: { imageUrl, targetBgUrl, prompt }
//    Returns: { resultImageUrl, processingTimeMs }
// ─────────────────────────────────────────────────────────────────────────────
router.post('/api/external/change-background', requireApiKey, async (req, res) => {
  const startTime = Date.now();
  const { imageUrl, backgroundId } = req.body;

  if (!imageUrl || !backgroundId) {
    return res.status(400).json({
      error: 'Missing required fields: imageUrl and backgroundId.',
    });
  }

  const { getBackground } = require('../prompts');
  const bg = getBackground(backgroundId);
  if (!bg) {
    return res.status(400).json({ error: `Unknown backgroundId: ${backgroundId}` });
  }

  try {
    console.log(`[External API] Background change request → ${bg.name}`);

    // 1. Download source image (person) to base64
    const imgResponse = await fetch(imageUrl);
    if (!imgResponse.ok) throw new Error('Failed to download source image.');
    const personBase64 = Buffer.from(await imgResponse.arrayBuffer()).toString('base64');

    // 2. Download target background to base64 (resolved from prompts.js)
    const bgResponse = await fetch(bg.imageUrl);
    if (!bgResponse.ok) throw new Error('Failed to download target background image.');
    const targetBgBase64 = Buffer.from(await bgResponse.arrayBuffer()).toString('base64');

    // 3. Call Gemini pipeline (prompt resolved from prompts.js)
    const resultB64 = await changeBackgroundWithGemini(personBase64, targetBgBase64, bg.prompt);

    // 4. Upload result to Supabase
    const resultImageUrl = await uploadBase64ToSupabase(resultB64, 'results/background-swaps');

    const processingTimeMs = Date.now() - startTime;
    console.log(`[External API] ✅ Background change completed in ${processingTimeMs}ms`);

    res.json({
      success: true,
      resultImageUrl,
      processingTimeMs,
    });
  } catch (err) {
    console.error('[External API] Background change failed:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// EXT-3. Outfit Modification (Blouse/Neck with Gemini)
//    POST /api/external/modify-outfit
//    Body: { imageUrl, prompt }
//    Returns: { resultImageUrl, processingTimeMs }
// ─────────────────────────────────────────────────────────────────────────────
router.post('/api/external/modify-outfit', requireApiKey, async (req, res) => {
  const startTime = Date.now();
  const { imageUrl, modificationType } = req.body;

  if (!imageUrl || !modificationType) {
    return res.status(400).json({
      error: 'Missing required fields: imageUrl and modificationType.',
    });
  }

  const { getOutfitModification } = require('../prompts');
  const mod = getOutfitModification(modificationType);
  if (!mod) {
    return res.status(400).json({ error: `Unknown modificationType: ${modificationType}` });
  }

  try {
    console.log(`[External API] Outfit modification request → ${mod.name}`);

    // 1. Download source image to base64
    const imgResponse = await fetch(imageUrl);
    if (!imgResponse.ok) throw new Error('Failed to download source image.');
    const personBase64 = Buffer.from(await imgResponse.arrayBuffer()).toString('base64');

    // 2. Call Gemini pipeline (prompt resolved from prompts.js)
    const resultB64 = await modifyOutfitWithGemini(personBase64, mod.prompt);

    // 3. Upload result to Supabase
    const resultImageUrl = await uploadBase64ToSupabase(resultB64, 'results/outfit-edits');

    const processingTimeMs = Date.now() - startTime;
    console.log(`[External API] ✅ Outfit modification completed in ${processingTimeMs}ms`);

    res.json({
      success: true,
      resultImageUrl,
      processingTimeMs,
    });
  } catch (err) {
    console.error('[External API] Outfit modification failed:', err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
