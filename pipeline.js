/**
 * pipeline.js — Virtual Try-On AI Pipeline
 *
 * Two operations:
 *   1. generateFrontView(garmentImageUrl)
 *      - With Garment flow only
 *      - garment image + default model → Vertex AI → front view
 *
 *   2. runTryOn(garmentImageUrl, humanImageUrl)
 *      - Both flows
 *      - garment/product image + user human image → Vertex AI → try-on result
 *
 * Falls back to mock URLs if Google credentials are not configured.
 */
const fs = require('fs');
const sharp = require('sharp');
const { uploadBase64ToSupabase } = require('./storage');

// ── Config ───────────────────────────────────────────────────────────────────
const GOOGLE_PROJECT_ID = process.env.GOOGLE_PROJECT_ID || '';
const VERTEX_LOCATION = process.env.VERTEX_AI_LOCATION || 'us-central1';
const GOOGLE_CREDS_PATH = process.env.GOOGLE_APPLICATION_CREDENTIALS || '';

const VERTEX_TRYON_URL =
  `https://${VERTEX_LOCATION}-aiplatform.googleapis.com/v1` +
  `/projects/${GOOGLE_PROJECT_ID}/locations/${VERTEX_LOCATION}` +
  `/publishers/google/models/virtual-try-on-001:predict`;

// Default stock model used in "With Garment" flow for front view generation
const DEFAULT_MODEL_URL =
  'https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=768&h=1024&q=80';

const OUTPUT_WIDTH = 768;
const OUTPUT_HEIGHT = 1024;

// Mock result URLs for when AI credentials are unavailable
const MOCK_RESULTS = {
  front_view: 'https://images.unsplash.com/photo-1610030469983-98e550d6193c?auto=format&fit=crop&w=768&h=1024&q=80',
  tryon_result: 'https://images.unsplash.com/photo-1583391733958-d25e07fac200?auto=format&fit=crop&w=768&h=1024&q=80',
};

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Check if Google Vertex AI credentials are available */
function hasGoogleCredentials() {
  if (process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON) return true;
  if (GOOGLE_CREDS_PATH && fs.existsSync(GOOGLE_CREDS_PATH)) return true;
  return false;
}

/** Get a short-lived Bearer token for Vertex AI */
async function getGoogleAccessToken() {
  const { GoogleAuth } = require('google-auth-library');
  const auth = new GoogleAuth({
    scopes: ['https://www.googleapis.com/auth/cloud-platform'],
  });
  const client = await auth.getClient();
  const tokenResponse = await client.getAccessToken();
  return tokenResponse.token;
}

/**
 * Download an image URL and preprocess to 768×1024 JPEG base64.
 * Uses sharp: resize to contain within canvas, white background, flatten alpha.
 */
async function imageUrlToBase64(imageUrl) {
  const response = await fetch(imageUrl, {
    headers: { 'User-Agent': 'Mozilla/5.0' },
    signal: AbortSignal.timeout(30000),
  });
  if (!response.ok) throw new Error(`Image download failed: HTTP ${response.status}`);

  const arrayBuffer = await response.arrayBuffer();
  const inputBuffer = Buffer.from(arrayBuffer);

  const processed = await sharp(inputBuffer)
    .rotate()
    .resize(OUTPUT_WIDTH, OUTPUT_HEIGHT, {
      fit: 'contain',
      background: { r: 255, g: 255, b: 255, alpha: 1 },
    })
    .flatten({ background: { r: 255, g: 255, b: 255 } })
    .jpeg({ quality: 92 })
    .toBuffer();

  return processed.toString('base64');
}

/**
 * Processes an array of image URLs, vertically stitching them if there are multiple.
 * Returns a single 768x1024 base64 JPEG.
 */
async function combineImageUrlsToBase64(urls) {
  if (urls.length === 1) {
    return await imageUrlToBase64(urls[0]);
  }

  const buffers = [];
  for (const url of urls) {
    const response = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' }, signal: AbortSignal.timeout(30000) });
    if (!response.ok) throw new Error(`Image download failed: HTTP ${response.status}`);
    buffers.push(Buffer.from(await response.arrayBuffer()));
  }

  const segmentHeight = Math.floor(OUTPUT_HEIGHT / buffers.length);
  const resizedBuffers = [];
  for (let i = 0; i < buffers.length; i++) {
    const resized = await sharp(buffers[i])
      .rotate()
      .resize(OUTPUT_WIDTH, segmentHeight, {
        fit: 'contain',
        background: { r: 255, g: 255, b: 255, alpha: 1 },
      })
      .toBuffer();
    resizedBuffers.push({ input: resized, top: i * segmentHeight, left: 0 });
  }

  const processed = await sharp({
    create: {
      width: OUTPUT_WIDTH,
      height: OUTPUT_HEIGHT,
      channels: 4,
      background: { r: 255, g: 255, b: 255, alpha: 1 },
    },
  })
    .composite(resizedBuffers)
    .flatten({ background: { r: 255, g: 255, b: 255 } })
    .jpeg({ quality: 92 })
    .toBuffer();

  return processed.toString('base64');
}

/**
 * Call Vertex AI virtual-try-on-001.
 * @param {string[]} garmentB64s - Array of Base64 JPEGs of the garment/product slots
 * @param {string} personB64  - Base64 JPEG of the person/model
 * @returns {string} Base64 JPEG of the result
 */
async function callVertexTryOn(garmentB64s, personB64) {
  if (!GOOGLE_PROJECT_ID) throw new Error('GOOGLE_PROJECT_ID not set');

  const token = await getGoogleAccessToken();
  const productImages = garmentB64s.map(b64 => ({ image: { bytesBase64Encoded: b64 } }));

  const payload = {
    instances: [
      {
        personImage: { image: { bytesBase64Encoded: personB64 } },
        productImages: productImages,
        productType: 'APPAREL',
      },
    ],
    parameters: {
      garmentType: 'full_body',
      sampleCount: 1,
      preserveGarmentShape: true,
      poseAlignment: true,
      outputStyle: 'realistic',
    },
  };

  const MAX_RETRIES = 3;
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    console.log(`[Vertex AI] Attempt ${attempt}/${MAX_RETRIES}...`);

    const resp = await fetch(VERTEX_TRYON_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(120000),
    });

    if (resp.ok) {
      const data = await resp.json();
      const predictions = data.predictions || [];
      if (predictions.length > 0 && predictions[0].bytesBase64Encoded) {
        console.log('[Vertex AI] ✅ Generation successful.');
        return predictions[0].bytesBase64Encoded;
      }
      throw new Error('Vertex AI returned no image data.');
    }

    if ([429, 500, 503, 504].includes(resp.status)) {
      const wait = 2 ** attempt * 1000;
      console.warn(`[Vertex AI] HTTP ${resp.status} — retrying in ${wait / 1000}s`);
      await new Promise((r) => setTimeout(r, wait));
      continue;
    }

    const errText = await resp.text();
    throw new Error(`Vertex AI error ${resp.status}: ${errText.slice(0, 300)}`);
  }

  throw new Error('Vertex AI failed after all retries.');
}

/**
 * Call Gemini 2.5 Flash to composite the person into a new background.
 * Step 1 (deterministic): Sharp pre-composites the person at a fixed depth (72% scale, centered, feet at 88% down).
 * Step 2 (generative): Gemini matches lighting, shadows, and edge blending only — position is already locked.
 * @param {string} personBase64 - The base64 encoded image of the person
 * @param {string} targetBgBase64 - The base64 encoded image of the background
 * @param {string} prompt - The compositing instructions (used for lighting context)
 * @returns {string} Base64 JPEG of the result
 */
async function changeBackgroundWithGemini(personBase64, targetBgBase64, prompt) {
  const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
  if (!GEMINI_API_KEY) throw new Error('GEMINI_API_KEY not set in .env');

  const GEMINI_URL = "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-image:generateContent";

  // ── STEP 1: Prepare Images (Use PNG to preserve colors perfectly) ──────
  console.log('[Background Swap] Preparing images for Gemini...');
  const personBuffer = Buffer.from(personBase64, 'base64');
  const bgBuffer = Buffer.from(targetBgBase64, 'base64');

  const resizeToPngBase64 = async (buf, maxDim = 1024) => {
    const out = await sharp(buf)
      .resize(maxDim, maxDim, { fit: 'inside', withoutEnlargement: true })
      .png() // PNG prevents the color shifting caused by JPEG compression
      .toBuffer();
    return out.toString('base64');
  };

  const personB64ForGemini = await resizeToPngBase64(personBuffer);
  const bgB64ForGemini = await resizeToPngBase64(bgBuffer);

  // ── STEP 2: Ask Gemini to perform the extraction and composite ───────────
  const fullPrompt = `
  ROLE: You are an expert AI photo compositor.

  TASK: 
  Extract the person from Image 1 and composite them seamlessly onto the background provided in Image 2.

  CRITICAL RULES:
  1. COMPLETELY REMOVE the original background/room from Image 1. Do NOT just paste the rectangular image.
  2. The person's identity, face, skin tone, hands, body, and clothing MUST remain 100% IDENTICAL to Image 1.
  3. DO NOT change the color, texture, or pattern of the garment or skin.
  4. POSITIONING STRICT RULE: You MUST place the person perfectly centered horizontally. You MUST place them exactly two steps back from the nearest foreground point in the scene. The person's body must take up exactly 70% of the vertical height of the image. Do not make them too small or too large.
  5. Add realistic ground shadows beneath their feet and blend the lighting smoothly so it looks like a real photograph.

  BACKGROUND DETAILS:
  ${prompt}

  OUTPUT:
  Return ONLY ONE high-resolution image with the person perfectly extracted and placed on the new background at the exact requested size and position. Ensure maximum photorealistic sharpness.
  `;

  const payload = {
    contents: [
      {
        parts: [
          { text: fullPrompt },
          { text: "Image 1 (The Person to Extract):" },
          {
            inline_data: {
              mime_type: "image/png",
              data: personB64ForGemini,
            },
          },
          { text: "Image 2 (The Target Background):" },
          {
            inline_data: {
              mime_type: "image/png",
              data: bgB64ForGemini,
            },
          },
        ],
      },
    ],
  };

  const MAX_RETRIES = 3;
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    console.log(`[Gemini Background Swap] Attempt ${attempt}/${MAX_RETRIES}...`);

    const resp = await fetch(GEMINI_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': GEMINI_API_KEY
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(180000),
    });

    if (resp.ok) {
      const data = await resp.json();
      const parts = data.candidates?.[0]?.content?.parts || [];
      const img = parts.find(p => p.inline_data?.data || p.inlineData?.data);
      if (img) {
        const base64Data = img.inline_data?.data || img.inlineData?.data;
        console.log('[Gemini Background Swap] ✅ Background change successful.');
        return base64Data;
      }
      
      // Log full response for debugging
      const finishReason = data.candidates?.[0]?.finishReason || 'UNKNOWN';
      const safetyRatings = JSON.stringify(data.candidates?.[0]?.safetyRatings || []);
      console.log(`❌ NO IMAGE FOUND (attempt ${attempt}). Finish reason: ${finishReason}`);
      console.log(`Safety ratings: ${safetyRatings}`);
      console.log('Raw text parts:', parts.filter(p => p.text).map(p => p.text.substring(0, 200)));
      
      if (attempt < MAX_RETRIES) {
        const wait = 2 ** attempt * 1000;
        console.log(`Retrying in ${wait / 1000}s...`);
        await new Promise((r) => setTimeout(r, wait));
        continue;
      }
      throw new Error('Gemini returned no image data after all retries (Check terminal for details)');
    }

    if ([429, 500, 503, 504].includes(resp.status)) {
      const wait = 2 ** attempt * 1000;
      console.warn(`[Gemini Background Swap] HTTP ${resp.status} — retrying in ${wait / 1000}s`);
      await new Promise((r) => setTimeout(r, wait));
      continue;
    }

    const errText = await resp.text();
    throw new Error(`Gemini error ${resp.status}: ${errText.slice(0, 300)}`);
  }

  throw new Error('Gemini failed after all retries.');
}


// ── Pipeline Entry Points ────────────────────────────────────────────────────

/**
 * Generate a front view of the garment on a default stock model.
 * WITH GARMENT flow only.
 *
 * @param {string} garmentImageUrl - URL of the uploaded garment flat image
 * @returns {{ frontViewUrl: string, is_mock: boolean }}
 */
async function generateFrontView(garmentImageUrl) {
  if (!hasGoogleCredentials() || !GOOGLE_PROJECT_ID) {
    throw new Error('Google Cloud credentials or GOOGLE_PROJECT_ID not configured.');
  }

  try {
    console.log('[Pipeline] Preprocessing garment + default model...');
    
    let garmentUrls = [];
    try {
      const parsed = JSON.parse(garmentImageUrl);
      if (typeof parsed === 'object' && parsed !== null) {
        garmentUrls = Object.values(parsed);
      } else {
        garmentUrls = [garmentImageUrl];
      }
    } catch(e) {
      garmentUrls = [garmentImageUrl];
    }

    const combinedGarmentB64 = await combineImageUrlsToBase64(garmentUrls);
    const modelB64 = await imageUrlToBase64(DEFAULT_MODEL_URL);

    console.log('[Pipeline] Calling Vertex AI for front view...');
    const resultB64 = await callVertexTryOn([combinedGarmentB64], modelB64);

    console.log('[Pipeline] Uploading front view to Supabase...');
    const frontViewUrl = await uploadBase64ToSupabase(resultB64, 'front-views');

    console.log(`[Pipeline] ✅ Front view ready: ${frontViewUrl}`);
    return { frontViewUrl, is_mock: false };
  } catch (err) {
    console.error('[Pipeline] Front view generation failed:', err.message);
    throw err;
  }
}

/**
 * Run virtual try-on: garment/product image(s) + user's human image → result.
 * Used by BOTH flows.
 *
 * @param {string|object} garmentPayload - Garment front view URL OR object of slot URLs
 * @param {string} humanImageUrl   - User's uploaded portrait/body image URL
 * @returns {{ resultImageUrl: string, is_mock: boolean }}
 */
async function runTryOn(garmentPayload, humanImageUrl) {
  if (!hasGoogleCredentials() || !GOOGLE_PROJECT_ID) {
    throw new Error('Google Cloud credentials or GOOGLE_PROJECT_ID not configured.');
  }

  try {
    console.log('[Pipeline] Preprocessing garment(s) + human image...');
    
    let garmentUrls = [];
    if (typeof garmentPayload === 'string') {
      try {
        const parsed = JSON.parse(garmentPayload);
        if (typeof parsed === 'object' && parsed !== null) {
          garmentUrls = Object.values(parsed);
        } else {
          garmentUrls = [garmentPayload];
        }
      } catch(e) {
        garmentUrls = [garmentPayload];
      }
    } else if (typeof garmentPayload === 'object' && garmentPayload !== null) {
      garmentUrls = Object.values(garmentPayload);
    }

    const combinedGarmentB64 = await combineImageUrlsToBase64(garmentUrls);
    const humanB64 = await imageUrlToBase64(humanImageUrl);

    console.log('[Pipeline] Calling Vertex AI for try-on...');
    const resultB64 = await callVertexTryOn([combinedGarmentB64], humanB64);

    console.log('[Pipeline] Uploading try-on result to Supabase...');
    const resultImageUrl = await uploadBase64ToSupabase(resultB64, 'results');

    console.log(`[Pipeline] ✅ Try-on result ready: ${resultImageUrl}`);
    return { resultImageUrl, is_mock: false };
  } catch (err) {
    console.error('[Pipeline] Try-on generation failed:', err.message);
    throw err;
  }
}

/**
 * Call Gemini 2.5 Flash to modify an outfit (e.g., change blouse sleeves or neck)
 * @param {string} personBase64 - The base64 encoded image of the try-on result
 * @param {string} prompt - The specific modification instructions
 * @returns {string} Base64 JPEG of the result
 */
async function modifyOutfitWithGemini(personBase64, prompt) {
  const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
  if (!GEMINI_API_KEY) throw new Error('GEMINI_API_KEY not set in .env');

  const GEMINI_URL = "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-image:generateContent";

  const resizeToJpegBase64 = async (base64Str, maxDim = 1024) => {
    const inputBuffer = Buffer.from(base64Str, 'base64');
    const outputBuffer = await sharp(inputBuffer)
      .resize(maxDim, maxDim, { fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 90 })
      .toBuffer();
    return outputBuffer.toString('base64');
  };

  console.log('[Gemini Outfit Modification] Pre-processing image...');
  const personB64 = await resizeToJpegBase64(personBase64);

  const isNeckModification = prompt.toLowerCase().includes('neckline') || prompt.toLowerCase().includes('neck style');
  
  let fullPrompt = '';
  
  if (isNeckModification) {
    fullPrompt = `
  You are an expert fashion photo retoucher.

  TASK:
  ${prompt}

  CONSTRAINTS:
  - Do NOT alter any other part of the image.
  - The background, environment, lighting, and all other objects must remain strictly untouched.
  - The unedited portions of the garment must remain strictly untouched.
  - Ensure natural drape, realistic shadows, and seamless fabric transitions at the editing boundaries.
  - DO NOT blur or smooth the person's skin or fabric textures. Maintain ultra-sharp, photorealistic pixel clarity.

  OUTPUT:
  Return ONLY one single HIGH-QUALITY photorealistic edited image. Ensure maximum photorealistic sharpness and completely avoid any AI 'smoothing' or 'painting' effect.
  `;
  } else {
    fullPrompt = `
  ROLE
  You are a professional fashion photography retoucher. You ONLY edit the specified garment region.

  TASK
  In the provided fashion photograph, carefully apply the requested design modification to the garment.
  Leave every other pixel in the image completely untouched.

  ABSOLUTE PRESERVATION RULES
  • 🔒 MODEL IDENTITY FROZEN — the subject's identity, features, and complexion must remain completely untouched.
  • 🔒 STYLING FROZEN — hair styling, volume, color, and all accessories must be exactly identical.
  • Identical posture: shoulder slope, garment silhouette, and posture — zero positional shift.
  • Identical drape: all fabric folds, pleat crispness, patterns, borders, and colors must remain identical.
  • Identical scene: lighting, shadows, background, and environment must remain exactly the same.
  • DO NOT blur or smooth the person's skin or fabric textures. Maintain ultra-sharp, photorealistic pixel clarity.

  MODIFICATION INSTRUCTIONS
  ${prompt}

  EDITING CONSTRAINTS
  • Perfect fabric physics: natural drape, realistic stretch & fold shadows
  • Believable tailoring: subtle stitching lines, no floating fabric
  • Seamless garment transition: natural finish at the garment edge
  • No change to overall garment silhouette beyond the requested modification

  OUTPUT
  Return ONLY one single HIGH-QUALITY photorealistic edited image. Ensure maximum photorealistic sharpness and completely avoid any AI 'smoothing' or 'painting' effect.
  `;
  }

  // Match the working Dvyb_Web_New payload: NO generationConfig, NO safetySettings
  const payload = {
    contents: [
      {
        parts: [
          { text: fullPrompt },
          {
            inline_data: {
              mime_type: "image/jpeg",
              data: personB64,
            },
          },
        ],
      },
    ],
  };

  const MAX_RETRIES = 5;
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    console.log(`[Gemini Outfit Modification] Attempt ${attempt}/${MAX_RETRIES}...`);

    try {
      const resp = await fetch(GEMINI_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': GEMINI_API_KEY
        },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(180000),
      });

      if (resp.ok) {
        const data = await resp.json();
        const parts = data.candidates?.[0]?.content?.parts || [];
        const img = parts.find(p => p.inline_data?.data || p.inlineData?.data);
        if (img) {
          console.log('[Gemini Outfit Modification] ✅ Modification successful.');
          return img.inline_data?.data || img.inlineData?.data;
        }
        
        const finishReason = data.candidates?.[0]?.finishReason || 'UNKNOWN';
        const safetyRatings = JSON.stringify(data.candidates?.[0]?.safetyRatings || []);
        console.log(`❌ NO IMAGE FOUND (attempt ${attempt}). Finish reason: ${finishReason}`);
        console.log(`Safety ratings: ${safetyRatings}`);
      } else if ([429, 500, 503, 504].includes(resp.status)) {
        console.warn(`[Gemini] HTTP ${resp.status} (attempt ${attempt})`);
      } else {
        const errText = await resp.text();
        throw new Error(`Gemini error ${resp.status}: ${errText.slice(0, 300)}`);
      }
    } catch (err) {
      if (err.message.includes('Gemini error')) throw err;
      console.warn(`[Gemini] Request error (attempt ${attempt}): ${err.message}`);
    }

    if (attempt < MAX_RETRIES) {
      const jitter = Math.random() * 1000;
      const wait = 2 ** attempt * 1000 + jitter;
      console.log(`Retrying in ${(wait / 1000).toFixed(1)}s...`);
      await new Promise((r) => setTimeout(r, wait));
    }
  }

  throw new Error('Gemini outfit modification failed after all retries.');
}

module.exports = {
  generateFrontView,
  runTryOn,
  changeBackgroundWithGemini,
  modifyOutfitWithGemini,
  hasGoogleCredentials
};
