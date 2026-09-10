const express = require('express');
const { runTryOn, changeBackgroundWithGemini, modifyOutfitWithGemini } = require('../pipeline');
const { uploadBase64ToSupabase } = require('../storage');
const prisma = require('../lib/prisma');
const { getModelResolution } = require('../prompts');

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
// EXT-1. User Side Try-On (Customer App)
//    POST /api/external/tryon
//    Body: { garmentImageUrl, humanImageUrl, category, returnBase64 }
//    Returns: { resultImageUrl (if !returnBase64), resultBase64 (if returnBase64), processingTimeMs }
// ─────────────────────────────────────────────────────────────────────────────
router.post('/api/external/tryon', requireApiKey, async (req, res) => {
  const startTime = Date.now();
  const { garmentImageUrl, humanImageUrl, category, returnBase64 } = req.body;

  if (!garmentImageUrl || !humanImageUrl) {
    return res.status(400).json({
      error: 'Missing required fields: garmentImageUrl and humanImageUrl.',
    });
  }

  let garmentPayload = garmentImageUrl;

  try {
    console.log(`[External API] Try-On request: category=${category || 'N/A'}`);

    // Call the pipeline with the skipUpload flag and explicitly disable watermarks
    const { resultImageUrl, resultB64, is_mock } = await runTryOn(garmentPayload, humanImageUrl, category, 'results/tryon-results', !!returnBase64, false);

    const processingTimeMs = Date.now() - startTime;
    console.log(`[External API] ✅ Try-On completed in ${processingTimeMs}ms`);

    const responsePayload = {
      success: true,
      processingTimeMs,
      is_mock,
    };

    if (returnBase64) {
      responsePayload.resultBase64 = resultB64;
    } else {
      responsePayload.resultImageUrl = resultImageUrl;
    }

    res.json(responsePayload);
  } catch (err) {
    console.error('[External API] Try-On failed:', err.message);
    res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// EXT-2. Background Change (Gemini Compositing)
//    POST /api/external/change-background
//    Body: { imageUrl, targetBgUrl, prompt, returnBase64 }
//    Returns: { resultImageUrl (if !returnBase64), resultBase64 (if returnBase64), processingTimeMs }
// ─────────────────────────────────────────────────────────────────────────────
router.post('/api/external/change-background', requireApiKey, async (req, res) => {
  const startTime = Date.now();
  const { imageUrl, backgroundId, returnBase64 } = req.body;

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

    // 4. Optionally upload result to Supabase
    let resultImageUrl = null;
    if (!returnBase64) {
      resultImageUrl = await uploadBase64ToSupabase(resultB64, 'results/background-swaps');
    }

    const processingTimeMs = Date.now() - startTime;
    console.log(`[External API] ✅ Background change completed in ${processingTimeMs}ms`);

    const responsePayload = {
      success: true,
      processingTimeMs,
    };

    if (returnBase64) {
      responsePayload.resultBase64 = resultB64;
    } else {
      responsePayload.resultImageUrl = resultImageUrl;
    }

    res.json(responsePayload);
  } catch (err) {
    console.error('[External API] Background change failed:', err.message);
    res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// EXT-3. Outfit Modification (Blouse/Neck with Gemini)
//    POST /api/external/modify-outfit
//    Body: { imageUrl, modificationType, returnBase64 }
//    Returns: { resultImageUrl (if !returnBase64), resultBase64 (if returnBase64), processingTimeMs }
// ─────────────────────────────────────────────────────────────────────────────
router.post('/api/external/modify-outfit', requireApiKey, async (req, res) => {
  const startTime = Date.now();
  const { imageUrl, modificationType, returnBase64 } = req.body;

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

    // 3. Optionally upload result to Supabase
    let resultImageUrl = null;
    if (!returnBase64) {
      resultImageUrl = await uploadBase64ToSupabase(resultB64, 'results/outfit-edits');
    }

    const processingTimeMs = Date.now() - startTime;
    console.log(`[External API] ✅ Outfit modification completed in ${processingTimeMs}ms`);

    const responsePayload = {
      success: true,
      processingTimeMs,
    };

    if (returnBase64) {
      responsePayload.resultBase64 = resultB64;
    } else {
      responsePayload.resultImageUrl = resultImageUrl;
    }

    res.json(responsePayload);
  } catch (err) {
    console.error('[External API] Outfit modification failed:', err.message);
    res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
});
// ─────────────────────────────────────────────────────────────────────────────
// EXT-4. Draping (Vendor Catalog)
//    POST /api/external/drape
//    Body: { flatlayImageUrl, blouseImageUrl, category, returnBase64, modelId, customModelUrl, garmentImages }
//    Returns: { resultImageUrl (if !returnBase64), resultBase64 (if returnBase64), processingTimeMs }
// ─────────────────────────────────────────────────────────────────────────────
router.post('/api/external/drape', requireApiKey, async (req, res) => {
  const startTime = Date.now();
  const { flatlayImageUrl, blouseImageUrl, category, returnBase64, modelId, customModelUrl, garmentImages } = req.body;

  if (!flatlayImageUrl && !garmentImages) {
    return res.status(400).json({
      error: 'Missing required field: Provide either flatlayImageUrl or garmentImages.',
    });
  }

  // 1. Custom URL -> 2. Specific Model ID -> 3. Random Category Fallback
  const targetModelUrl = customModelUrl ? customModelUrl : getModelResolution(modelId, category);

  // If the developer passes a full garmentImages object, use it directly. 
  // Otherwise, fall back to the old string-based URLs.
  let garmentPayload = garmentImages || flatlayImageUrl;
  if (!garmentImages && blouseImageUrl) {
    garmentPayload = { saree: flatlayImageUrl, blouse: blouseImageUrl };
  }

  try {
    console.log(`[External API] Drape request: category=${category || 'SAREE'}, model=${customModelUrl ? 'CUSTOM' : (modelId || 'RANDOM_FALLBACK')}`);

    // Call the pipeline with the resolved model, saving to 'vendor-drapes', and explicitly disable watermarks
    const { resultImageUrl, resultB64, is_mock } = await runTryOn(
      garmentPayload, 
      targetModelUrl, 
      category || 'SAREE', 
      'vendor-drapes', 
      !!returnBase64,
      false // Explicitly disable watermark for external draping
    );

    const processingTimeMs = Date.now() - startTime;
    console.log(`[External API] ✅ Drape completed in ${processingTimeMs}ms`);

    const responsePayload = {
      success: true,
      processingTimeMs,
      is_mock,
    };

    if (returnBase64) {
      responsePayload.resultBase64 = resultB64;
    } else {
      responsePayload.resultImageUrl = resultImageUrl;
    }

    res.json(responsePayload);
  } catch (err) {
    console.error('[External API] Drape failed:', err.message);
    res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
});

module.exports = router;
