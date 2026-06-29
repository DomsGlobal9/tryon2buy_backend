const express = require('express');
const { uploadBufferToSupabase } = require('../storage');
const { 
  generateFrontView, 
  runTryOn, 
  changeBackgroundWithGemini, 
  modifyOutfitWithGemini 
} = require('../pipeline');
const { authenticateVendor, authenticateCustomer, authenticateUser, optionalAuthenticateUser } = require('../middleware/auth');
const prisma = require('../lib/prisma');
const upload = require('../lib/upload');
const sharp = require('sharp');

const router = express.Router();
const DEFAULT_VENDOR_ID = 'feb21067-a3ee-4020-b388-16d3a37a29ce';

// ─────────────────────────────────────────────────────────────────────────────
// 2. Upload Image to Supabase Storage
//    POST /api/tryon/upload
//    Body: multipart/form-data with field "image"
//    Query: ?folder=garments|human-images (default: garments)
// ─────────────────────────────────────────────────────────────────────────────
router.post('/api/tryon/upload', upload.single('image'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No image file provided. Use field name "image".' });
    }

    const folder = req.query.folder || 'garments';
    const allowedFolders = ['garments', 'user-uploads', 'vendor-drapes', 'results'];
    if (!allowedFolders.includes(folder)) {
      return res.status(400).json({ error: `Invalid folder. Use: ${allowedFolders.join(', ')}` });
    }

    // Process image: Auto-rotate based on EXIF to fix 90-deg rotation bugs from mobile cameras,
    // and convert to a standard JPEG to ensure maximum compatibility with the AI pipeline.
    const processedBuffer = await sharp(req.file.buffer)
      .rotate()
      .jpeg({ quality: 90 })
      .toBuffer();

    const url = await uploadBufferToSupabase(processedBuffer, folder, 'jpg');

    res.json({ url, folder, size: processedBuffer.length });
  } catch (err) {
    console.error('[Upload] Error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. Generate Front View (With Garment flow ONLY)
//    POST /api/tryon/generate-front-view
//    Body: { garment_image_url, category? }
//    Returns: { garment_id, front_view_url, is_mock }
// ─────────────────────────────────────────────────────────────────────────────
router.post('/api/tryon/generate-front-view', authenticateVendor, async (req, res) => {
  try {
    const { garment_image_url, category } = req.body;

    if (!garment_image_url) {
      return res.status(400).json({ error: 'garment_image_url is required.' });
    }

    // Create Garment record with status PROCESSING
    const garment = await prisma.garment.create({
      data: {
        vendorId: req.vendorId,
        label: garment_image_url,
        category: category || null,
        status: 'PROCESSING',
        metadata: { original_image_url: garment_image_url },
      },
    });

    // Run AI pipeline
    let result;
    try {
      result = await generateFrontView(garment_image_url);
    } catch (pipelineErr) {
      // Update Garment record to FAILED
      await prisma.garment.update({
        where: { id: garment.id },
        data: {
          status: 'FAILED',
        },
      });
      throw pipelineErr;
    }

    // Update Garment record with result
    await prisma.garment.update({
      where: { id: garment.id },
      data: {
        metadata: { original_image_url: garment_image_url, front_view_url: result.frontViewUrl },
        status: 'READY',
      },
    });

    res.json({
      garment_id: garment.id,
      original_image_url: garment_image_url,
      front_view_url: result.frontViewUrl,
      is_mock: false,
    });
  } catch (err) {
    console.error('[GenerateFrontView] Error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. Generate Try-On (Both flows)
//    POST /api/tryon/generate
//    Body: {
//      mode: "with_garment" | "without_garment",
//      garment_image_url,   — original garment (with_garment) or catalog product image (without_garment)
//      human_image_url,     — user's uploaded portrait
//      category?,
//      garment_id?,         — from generate-front-view step (with_garment)
//      catalog_product_id?, — from catalog selection (without_garment)
//      front_view_url?      — for reference/metadata
//    }
//    Returns: { generation_id, result_image_url, is_mock }
// ─────────────────────────────────────────────────────────────────────────────
router.post('/api/tryon/generate', optionalAuthenticateUser, async (req, res) => {
  try {
    const {
      mode = 'with_garment',
      garment_image_url,
      human_image_url,
      category,
      garment_id,
      catalog_product_id,
      front_view_url,
      target_folder,
    } = req.body;

    if (!garment_image_url || !human_image_url) {
      return res.status(400).json({ error: 'garment_image_url and human_image_url are required.' });
    }

    if (!['with_garment', 'without_garment'].includes(mode)) {
      return res.status(400).json({ error: 'mode must be "with_garment" or "without_garment".' });
    }

    // --- CREDIT LIMIT LOGIC ---
    if (req.userRole === 'vendor') {
      const vendor = await prisma.vendor.findUnique({ where: { id: req.vendorId } });
      if (!vendor) {
        return res.status(401).json({ error: 'Vendor not found.' });
      }
      if (!vendor.isUnlimited) {
        const isCustomerTryon = !!req.body.parent_generation_id;
        
        if (isCustomerTryon) {
          if (vendor.userTryonCredits <= 0) {
            return res.status(403).json({ error: 'INSUFFICIENT_CREDITS', message: 'You have used your 10 free user-side try-ons. Please Contact Us.' });
          }
          await prisma.vendor.update({
            where: { id: req.vendorId },
            data: { userTryonCredits: vendor.userTryonCredits - 1 }
          });
        } else {
          if (vendor.drapeCredits <= 0) {
            return res.status(403).json({ error: 'INSUFFICIENT_CREDITS', message: 'You have used your 10 free drapes. Please Contact Us.' });
          }
          await prisma.vendor.update({
            where: { id: req.vendorId },
            data: { drapeCredits: vendor.drapeCredits - 1 }
          });
        }
      }

    } else if (req.userRole === 'guest') {
      const ip = req.ip || req.connection.remoteAddress || 'unknown';
      let guest = await prisma.guestLimit.findUnique({ where: { ipAddress: ip } });
      if (!guest) {
        guest = await prisma.guestLimit.create({ data: { ipAddress: ip, tryonCount: 0 } });
      }
      
      if (guest.tryonCount >= 10) {
        return res.status(401).json({ error: 'GUEST_LIMIT_REACHED', message: 'Login as Vendor for more credits.' });
      }
      
      // Increment guest tryon count
      await prisma.guestLimit.update({
        where: { id: guest.id },
        data: { tryonCount: guest.tryonCount + 1 }
      });
    }
    // Note: If req.userRole === 'vendor', they bypass this and get unlimited.
    // --- END CREDIT LIMIT LOGIC ---

    let primaryGarmentUrl = garment_image_url;
    let garmentUrlsObj = null;

    if (mode === 'with_garment') {
      try {
        const parsed = JSON.parse(garment_image_url);
        if (typeof parsed === 'object' && parsed !== null) {
          garmentUrlsObj = parsed;
          primaryGarmentUrl = parsed.saree || parsed.full || Object.values(parsed)[0] || garment_image_url;
        }
      } catch (e) {
        // It's a plain string, keep as is
      }
    }

    // Determine phase based on parent_generation_id
    const parentGenId = req.body.parent_generation_id || null;
    const phase = parentGenId ? 2 : 1;

    // Create Asset record with status PROCESSING
    const asset = await prisma.asset.create({
      data: {
        vendorId: req.userRole === 'vendor' ? req.vendorId : (req.body.vendorId || null),
        customerId: null,
        garmentId: garment_id || null,
        imageUrl: human_image_url, // Temporary until result is ready
        assetType: mode === 'with_garment' ? 'TRYON_RESULT' : mode.toUpperCase(),
        status: 'PROCESSING',
        metadata: {
          mode,
          phase,
          parentGenerationId: parentGenId,
          catalogProductId: catalog_product_id || null,
          category: category || null,
          garmentImageUrl: primaryGarmentUrl,
          humanImageUrl: human_image_url,
          ...(garmentUrlsObj ? { garment_urls: garmentUrlsObj } : {}),
          ...(front_view_url ? { front_view_url } : {})
        },
      },
    });

    if (parentGenId) {
      await prisma.assetRelation.create({
        data: {
          parentAssetId: parentGenId,
          childAssetId: asset.id,
          action: mode.toUpperCase(),
        }
      });
    }

    // Run virtual try-on pipeline
    const tryOnPayload = garmentUrlsObj || primaryGarmentUrl;
    let result;
    try {
      result = await runTryOn(tryOnPayload, human_image_url, category, target_folder || 'results/tryon-results');
    } catch (pipelineErr) {
      // If AI fails, update record to FAILED
      await prisma.asset.update({
        where: { id: asset.id },
        data: {
          status: 'FAILED',
          metadata: { errorMessage: pipelineErr.message },
        },
      });
      throw pipelineErr;
    }

    // Update generation with result
    await prisma.asset.update({
      where: { id: asset.id },
      data: {
        imageUrl: result.resultImageUrl,
        status: 'COMPLETED',
      },
    });

    res.json({
      generation_id: asset.id,
      mode,
      garment_image_url,
      human_image_url,
      front_view_url: front_view_url || null,
      result_image_url: result.resultImageUrl,
      is_mock: false,
    });
  } catch (err) {
    console.error('[Generate] Error:', err.message);
    res.status(500).json({ error: err.message });
  }
});



// ─── Vendor specific generation library ───
router.get('/api/tryon/vendor/generations', authenticateVendor, async (req, res) => {
  try {
    const masterVendor = await prisma.vendor.findUnique({ where: { email: 'vendor@store.com' } });
    const vendorIds = [req.vendorId];
    if (masterVendor && masterVendor.id !== req.vendorId) {
      vendorIds.push(masterVendor.id);
    }

    const assets = await prisma.asset.findMany({
      where: { vendorId: { in: vendorIds }, assetType: 'TRYON_RESULT' },
      orderBy: { createdAt: 'desc' },
      take: 100,
      include: {
        garment: { select: { id: true, label: true, category: true, metadata: true } },
      },
    });

    const generations = assets.map(a => ({
      id: a.id,
      vendorId: a.vendorId,
      customerId: a.customerId,
      garmentId: a.garmentId,
      mode: a.metadata?.mode || 'with_garment',
      phase: a.metadata?.phase || 1,
      category: a.metadata?.category || null,
      garmentImageUrl: a.metadata?.garmentImageUrl || '',
      humanImageUrl: a.metadata?.humanImageUrl || '',
      resultImageUrl: a.imageUrl,
      status: a.status,
      createdAt: a.createdAt,
      garment: a.garment
    }));

    res.json(generations);
  } catch (err) {
    console.error('[ListVendorGenerations] Error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// 6. Get Single Generation
//    GET /api/tryon/generations/:id
// ─────────────────────────────────────────────────────────────────────────────
router.get('/api/tryon/generations/:id', async (req, res) => {
  try {
    const asset = await prisma.asset.findUnique({
      where: { id: req.params.id },
      include: {
        garment: true,
      },
    });

    if (!asset) {
      return res.status(404).json({ error: 'Generation not found.' });
    }

    const generation = {
      id: asset.id,
      vendorId: asset.vendorId,
      customerId: asset.customerId,
      garmentId: asset.garmentId,
      mode: asset.metadata?.mode || 'with_garment',
      phase: asset.metadata?.phase || 1,
      category: asset.metadata?.category || null,
      garmentImageUrl: asset.metadata?.garmentImageUrl || '',
      humanImageUrl: asset.metadata?.humanImageUrl || '',
      resultImageUrl: asset.imageUrl,
      status: asset.status,
      createdAt: asset.createdAt,
      garment: asset.garment
    };

    res.json(generation);
  } catch (err) {
    console.error('[GetGeneration] Error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── Vendor specific delete generation ───
router.delete('/api/tryon/vendor/generations/:id', authenticateVendor, async (req, res) => {
  try {
    const asset = await prisma.asset.findUnique({
      where: { id: req.params.id },
    });

    if (!asset || asset.vendorId !== req.vendorId) {
      return res.status(404).json({ error: 'Generation not found or unauthorized.' });
    }

    await prisma.asset.delete({
      where: { id: req.params.id },
    });

    res.json({ success: true, message: 'Generation deleted successfully' });
  } catch (err) {
    console.error('[DeleteVendorGeneration] Error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// 6c. Public: Get Vendor Gallery (for customer share link)
//    GET /api/tryon/vendor/:vendorId/gallery
//    Public — no auth needed. Returns all completed Phase 1 drapings.
// ─────────────────────────────────────────────────────────────────────────────
router.get('/api/tryon/vendor/:vendorId/gallery', async (req, res) => {
  try {
    const { vendorId } = req.params;
    
    const masterVendor = await prisma.vendor.findUnique({ where: { email: 'vendor@store.com' } });
    const vendorIds = [];
    if (vendorId === 'demo') {
      if (masterVendor) vendorIds.push(masterVendor.id);
    } else {
      vendorIds.push(vendorId);
    }
    const assets = await prisma.asset.findMany({
      where: {
        vendorId: { in: vendorIds },
        assetType: 'TRYON_RESULT',
        status: { not: 'FAILED' },
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });

    // Filter to ONLY show Phase 1 (Vendor Catalog Drapes)
    // Do not show Phase 2 (Customer Try-on selfies) in the public gallery
    const generations = assets
      .filter(a => a.metadata?.phase === 1 || !a.metadata?.phase)
      .map(a => ({
        id: a.id,
        category: a.metadata?.category || null,
        resultImageUrl: a.imageUrl,
        garmentImageUrl: a.metadata?.garmentImageUrl || '',
        createdAt: a.createdAt,
      }));

    res.json({ vendorId, generations });
  } catch (err) {
    console.error('[VendorPublicGallery] Error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// 6d. Change Background (Gemini Compositing)
//    POST /api/tryon/change-background
// ─────────────────────────────────────────────────────────────────────────────
router.post('/api/tryon/change-background', optionalAuthenticateUser, async (req, res) => {
  const { imageUrl, backgroundId, generationId } = req.body;
  if (!imageUrl || !backgroundId) {
    return res.status(400).json({ error: 'Missing imageUrl or backgroundId' });
  }

  const { getBackground } = require('../prompts');
  const bg = getBackground(backgroundId);
  if (!bg) {
    return res.status(400).json({ error: `Unknown backgroundId: ${backgroundId}` });
  }

  try {
    // --- CREDIT LIMIT LOGIC ---
    if (req.userRole === 'vendor') {
      const vendor = await prisma.vendor.findUnique({ where: { id: req.vendorId } });
      if (!vendor) return res.status(401).json({ error: 'Vendor not found.' });
      if (!vendor.isUnlimited) {
        if (vendor.bgChangeCredits <= 0) {
          return res.status(403).json({ error: 'INSUFFICIENT_CREDITS', message: 'You have used your 10 free background changes. Please Contact Us.' });
        }
        await prisma.vendor.update({ where: { id: req.vendorId }, data: { bgChangeCredits: vendor.bgChangeCredits - 1 } });
      }
    } else if (req.userRole === 'guest') {
      const ip = req.ip || req.connection.remoteAddress || 'unknown';
      let guest = await prisma.guestLimit.findUnique({ where: { ipAddress: ip } });
      if (!guest) guest = await prisma.guestLimit.create({ data: { ipAddress: ip, tryonCount: 0 } });
      if (guest.tryonCount >= 10) {
        return res.status(401).json({ error: 'GUEST_LIMIT_REACHED', message: 'Login as Vendor for more credits.' });
      }
      await prisma.guestLimit.update({ where: { id: guest.id }, data: { tryonCount: guest.tryonCount + 1 } });
    }
    // --- END CREDIT LIMIT LOGIC ---
    // --- END CREDIT LIMIT LOGIC ---

    console.log(`[ChangeBackground] Starting for ${generationId || 'unknown'} → ${bg.name}`);
    
    // 1. Download source image (person) to base64
    const imgResponse = await fetch(imageUrl);
    if (!imgResponse.ok) throw new Error('Failed to download source image');
    const personBase64 = Buffer.from(await imgResponse.arrayBuffer()).toString('base64');

    // 2. Download target background to base64 (resolved from prompts.js)
    const bgResponse = await fetch(bg.imageUrl);
    if (!bgResponse.ok) throw new Error('Failed to download target background image');
    const targetBgBase64 = Buffer.from(await bgResponse.arrayBuffer()).toString('base64');

    // 3. Call pipeline (prompt also resolved from prompts.js)
    const { changeBackgroundWithGemini } = require('../pipeline');
    const resultB64 = await changeBackgroundWithGemini(personBase64, targetBgBase64, bg.prompt);

    // 4. Upload to Supabase
    const { uploadBase64ToSupabase } = require('../storage');
    const newImageUrl = await uploadBase64ToSupabase(resultB64, 'results/background-swaps');

    // 5. Save Asset and AssetRelation for true Asset Lineage tracking
    let newAsset = null;
    if (generationId) {
      const parentAsset = await prisma.asset.findUnique({ where: { id: generationId } });
      if (parentAsset) {
        newAsset = await prisma.asset.create({
          data: {
            vendorId: parentAsset.vendorId,
            customerId: parentAsset.customerId,
            garmentId: parentAsset.garmentId,
            imageUrl: newImageUrl,
            assetType: 'BG_SWAP_RESULT',
            status: 'COMPLETED',
            metadata: { backgroundId, originalSessionId: parentAsset.metadata?.originalSessionId || generationId }
          }
        });
        await prisma.assetRelation.create({
          data: {
            parentAssetId: generationId,
            childAssetId: newAsset.id,
            action: 'BG_SWAP',
            promptUsed: bg.prompt
          }
        });
      }
    }

    res.json({ success: true, url: newImageUrl, asset_id: newAsset?.id, generation_id: newAsset?.id });
  } catch (err) {
    console.error('[ChangeBackground] Error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// 6.5 Modify Outfit (Blouse/Neck with Gemini) - INTERNAL UI
//    POST /api/tryon/modify-outfit
// ─────────────────────────────────────────────────────────────────────────────
router.post('/api/tryon/modify-outfit', optionalAuthenticateUser, async (req, res) => {
  const { imageUrl, modificationType, generationId } = req.body;

  if (!imageUrl || !modificationType) {
    return res.status(400).json({ error: 'Missing imageUrl or modificationType' });
  }

  const { getOutfitModification } = require('../prompts');
  const mod = getOutfitModification(modificationType);
  if (!mod) {
    return res.status(400).json({ error: `Unknown modificationType: ${modificationType}` });
  }

  try {
    // --- CREDIT LIMIT LOGIC ---
    if (req.userRole === 'vendor') {
      const vendor = await prisma.vendor.findUnique({ where: { id: req.vendorId } });
      if (!vendor) return res.status(401).json({ error: 'Vendor not found.' });
      if (!vendor.isUnlimited) {
        if (vendor.blouseChangeCredits <= 0) {
          return res.status(403).json({ error: 'INSUFFICIENT_CREDITS', message: 'You have used your 10 free blouse/neck changes. Please Contact Us.' });
        }
        await prisma.vendor.update({ where: { id: req.vendorId }, data: { blouseChangeCredits: vendor.blouseChangeCredits - 1 } });
      }
    } else if (req.userRole === 'guest') {
      const ip = req.ip || req.connection.remoteAddress || 'unknown';
      let guest = await prisma.guestLimit.findUnique({ where: { ipAddress: ip } });
      if (!guest) guest = await prisma.guestLimit.create({ data: { ipAddress: ip, tryonCount: 0 } });
      if (guest.tryonCount >= 10) {
        return res.status(401).json({ error: 'GUEST_LIMIT_REACHED', message: 'Login as Vendor for more credits.' });
      }
      await prisma.guestLimit.update({ where: { id: guest.id }, data: { tryonCount: guest.tryonCount + 1 } });
    }
    // --- END CREDIT LIMIT LOGIC ---

    console.log(`[ModifyOutfit] Starting for ${generationId || 'unknown'} → ${mod.name}`);
    
    // 1. Download source image to base64
    const imgResponse = await fetch(imageUrl);
    if (!imgResponse.ok) throw new Error('Failed to download source image');
    const personBase64 = Buffer.from(await imgResponse.arrayBuffer()).toString('base64');

    // 2. Call pipeline (prompt resolved from prompts.js)
    const { modifyOutfitWithGemini } = require('../pipeline');
    const resultB64 = await modifyOutfitWithGemini(personBase64, mod.prompt);

    // 3. Upload to Supabase
    const { uploadBase64ToSupabase } = require('../storage');
    const newImageUrl = await uploadBase64ToSupabase(resultB64, 'results/outfit-edits');

    // 4. Save Asset and AssetRelation for true Asset Lineage tracking
    let newAsset = null;
    if (generationId) {
      const parentAsset = await prisma.asset.findUnique({ where: { id: generationId } });
      if (parentAsset) {
        newAsset = await prisma.asset.create({
          data: {
            vendorId: parentAsset.vendorId,
            customerId: parentAsset.customerId,
            garmentId: parentAsset.garmentId,
            imageUrl: newImageUrl,
            assetType: 'OUTFIT_MOD_RESULT',
            status: 'COMPLETED',
            metadata: { modificationType, originalSessionId: parentAsset.metadata?.originalSessionId || generationId }
          }
        });
        await prisma.assetRelation.create({
          data: {
            parentAssetId: generationId,
            childAssetId: newAsset.id,
            action: 'OUTFIT_MOD',
            promptUsed: mod.prompt
          }
        });
      }
    }

    res.json({ success: true, resultImageUrl: newImageUrl, asset_id: newAsset?.id, generation_id: newAsset?.id });
  } catch (err) {
    console.error('[ModifyOutfit] Error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// 7. Proxy Catalog Dresses (Without Garment flow)
//    GET /api/tryon/catalog-dresses
//    Fetches published products from Django catalog service
// ─────────────────────────────────────────────────────────────────────────────
router.get('/api/tryon/catalog-dresses', async (req, res) => {
  const mockDresses = [
    {
      id: 'mock-1',
      name: 'Blue Summer Dress',
      category: 'Dresses',
      fabric: 'Cotton',
      front_view_url: 'https://images.unsplash.com/photo-1572804013309-8c98c41f1484?q=80&w=600&auto=format&fit=crop',
      thumbnail: 'https://images.unsplash.com/photo-1572804013309-8c98c41f1484?q=80&w=200&auto=format&fit=crop',
    },
    {
      id: 'mock-2',
      name: 'Red Evening Gown',
      category: 'Gowns',
      fabric: 'Silk',
      front_view_url: 'https://images.unsplash.com/photo-1566150905458-1bf1fc113f0d?q=80&w=600&auto=format&fit=crop',
      thumbnail: 'https://images.unsplash.com/photo-1566150905458-1bf1fc113f0d?q=80&w=200&auto=format&fit=crop',
    },
    {
      id: 'mock-3',
      name: 'White Casual Shirt',
      category: 'Shirts',
      fabric: 'Linen',
      front_view_url: 'https://images.unsplash.com/photo-1596755094514-f87e32f6b717?q=80&w=600&auto=format&fit=crop',
      thumbnail: 'https://images.unsplash.com/photo-1596755094514-f87e32f6b717?q=80&w=200&auto=format&fit=crop',
    },
  ];

  try {
    const catalogUrl = 'http://localhost:8000/api/catalog/products/';
    const response = await fetch(catalogUrl, { signal: AbortSignal.timeout(3000) });

    if (!response.ok) {
      console.warn(`[Catalog] Django returned ${response.status}. Using mock catalog.`);
      return res.json(mockDresses);
    }

    const products = await response.json();
    if (!products || products.length === 0) {
      console.log('[Catalog] Django returned empty list. Using mock catalog.');
      return res.json(mockDresses);
    }

    // Transform to a simpler format for the frontend SELECT DRESS grid
    const dresses = products.map((p) => ({
      id: p.id,
      name: p.name,
      category: p.category?.name || p.category || 'Uncategorized',
      fabric: p.fabric || '',
      front_view_url:
        p.garment_media?.[0]?.file_url ||
        p.product_media?.[0]?.image_url ||
        p.garmentmedia_set?.[0]?.file_url ||
        p.productmedia_set?.[0]?.image_url ||
        null,
      thumbnail:
        p.garment_media?.[0]?.file_url ||
        p.product_media?.[0]?.image_url ||
        p.garmentmedia_set?.[0]?.file_url ||
        p.productmedia_set?.[0]?.image_url ||
        null,
    }));

    res.json(dresses);
  } catch (err) {
    console.warn('[CatalogDresses] Django unreachable or timeout. Using mock catalog.');
    res.json(mockDresses);
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// 8. Default Models
//    GET /api/tryon/default-models
//    Returns the stock human models for the "With Garment" flow
// ─────────────────────────────────────────────────────────────────────────────
router.get('/api/tryon/default-models', (req, res) => {
  res.json([
    {
      name: "Model 1",
      img: "https://gsriztjnocjwgqkaxhhz.supabase.co/storage/v1/object/public/tryon-fits/default%20models/41.jpeg"
    },
    {
      name: "Model 2",
      img: "https://gsriztjnocjwgqkaxhhz.supabase.co/storage/v1/object/public/tryon-fits/default%20models/42.jpeg"
    },
    {
      name: "Model 3",
      img: "https://gsriztjnocjwgqkaxhhz.supabase.co/storage/v1/object/public/tryon-fits/default%20models/43.jpeg"
    },
    {
      name: "Model 4",
      img: "https://gsriztjnocjwgqkaxhhz.supabase.co/storage/v1/object/public/tryon-fits/default%20models/44.jpeg"
    }
  ]);
});

// ═══════════════════════════════════════════════════════════════════════════════
// EXTERNAL API ENDPOINTS (require x-api-key header)
// These are designed for 3rd-party catalogs and external integrations.
// ═══════════════════════════════════════════════════════════════════════════════

module.exports = router;
