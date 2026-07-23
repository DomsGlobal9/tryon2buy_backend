// =============================================================================
// prompts.js — Single source of truth for ALL AI prompts
// =============================================================================
// External callers and the internal UI only need to send an ID.
// The actual prompt strings never leave the backend.
// =============================================================================

// ─────────────────────────────────────────────────────────────────────────────
// BACKGROUND PROMPTS
// id → { name, imageUrl, prompt }
// ─────────────────────────────────────────────────────────────────────────────
const BACKGROUND_PROMPTS = {
  bg1: {
    name: 'Ancient Temple',
    imageUrl: 'https://gsriztjnocjwgqkaxhhz.supabase.co/storage/v1/object/public/tryon-fits/bg1.png',
    prompt: `Place the person in a serene marble temple hallway. STRICT DEPTH RULE: the person must stand at a fixed depth position that is exactly two steps behind the nearest foreground point of the scene — never in the foreground, never far in the background. Lock this depth strictly and do not vary it. The person must be centered horizontally on the stone floor. Match warm sunlight casting geometric shadows, hanging pink floral vines, brass oil lamps, and a view of a white temple dome through an archway. Preserve all facial features, pose, and outfit details exactly. Do not alter clothing colors or textures.`
  },
  bg2: {
    name: 'Festive Palace',
    imageUrl: 'https://gsriztjnocjwgqkaxhhz.supabase.co/storage/v1/object/public/tryon-fits/bg2.png',
    prompt: `Place the person in the festive palace courtyard. STRICT DEPTH RULE: the person must stand at a fixed depth position that is exactly two steps behind the nearest foreground point of the scene — never in the foreground, never far in the background. Lock this depth strictly and do not vary it. The person must be centered horizontally on the marble floor. Match golden festive lighting, reflections, and palace ambience. Preserve face, pose, and outfit details exactly. Do not alter clothing colors or textures.`
  },
  bg3: {
    name: 'Luxury Boutique',
    imageUrl: 'https://gsriztjnocjwgqkaxhhz.supabase.co/storage/v1/object/public/tryon-fits/bg3.png',
    prompt: `Place the person in the luxury fashion boutique. STRICT DEPTH RULE: the person must stand at a fixed depth position that is exactly two steps behind the nearest foreground point of the scene — never in the foreground, never far in the background. Lock this depth strictly and do not vary it. The person must be centered horizontally in the open floor space. Match premium indoor lighting and floor reflections. Preserve face, body, and outfit details exactly. Do not alter clothing colors or textures.`
  },
  bg4: {
    name: 'Hotel Lobby',
    imageUrl: 'https://gsriztjnocjwgqkaxhhz.supabase.co/storage/v1/object/public/tryon-fits/bg4.png',
    prompt: `Place the person in the luxury hotel lobby. STRICT DEPTH RULE: the person must stand at a fixed depth position that is exactly two steps behind the nearest foreground point of the scene — never in the foreground, never far in the background. Lock this depth strictly and do not vary it. The person must be centered horizontally on the marble walkway. Match elegant warm lighting, floor reflections, and premium fashion campaign aesthetics. Preserve all facial and clothing details exactly. Do not alter clothing colors or textures.`
  },
  bg5: {
    name: 'Floral Archway',
    imageUrl: 'https://gsriztjnocjwgqkaxhhz.supabase.co/storage/v1/object/public/tryon-fits/bg5.jpg',
    prompt: `Place the person under a beautiful arched Mughal-style corridor. STRICT DEPTH RULE: the person must stand at a fixed depth position that is exactly two steps behind the nearest foreground point of the scene — never in the foreground, never far in the background. Lock this depth strictly and do not vary it. The person must be centered horizontally on the intricately patterned tiled floor. Match the warm natural lighting, painted floral wall frescoes, hanging brass lanterns, and lush pink bougainvillea flowers framing the entrance. Preserve all facial features, pose, and outfit details exactly. Do not alter clothing colors or textures.`
  },
  bg6: {
    name: 'Golden Palace',
    imageUrl: 'https://gsriztjnocjwgqkaxhhz.supabase.co/storage/v1/object/public/tryon-fits/bg6.jpg',
    prompt: `Place the person in a grand, opulent golden palace hall. STRICT DEPTH RULE: the person must stand at a fixed depth position that is exactly two steps behind the nearest foreground point of the scene — never in the foreground, never far in the background. Lock this depth strictly and do not vary it. The person must be centered horizontally on the highly reflective polished marble floor. Match the luxurious golden lighting from the massive crystal chandelier, ornate arches, and golden pillars. Preserve all facial features, pose, and outfit details exactly. Do not alter clothing colors or textures.`
  },
  bg7: {
    name: 'Tropical Garden',
    imageUrl: 'https://gsriztjnocjwgqkaxhhz.supabase.co/storage/v1/object/public/tryon-fits/bg7.jpg',
    prompt: `Place the person on a serene tropical garden path. STRICT DEPTH RULE: the person must stand at a fixed depth position that is exactly two steps behind the nearest foreground point of the scene — never in the foreground, never far in the background. Lock this depth strictly and do not vary it. The person must be centered horizontally on the carved stone walkway. Match the lush green outdoor lighting, surrounding palm trees, mango trees with hanging fruit, and vibrant green grass. Preserve all facial features, pose, and outfit details exactly. Do not alter clothing colors or textures.`
  },
  bg8: {
    name: 'Beach Resort',
    imageUrl: 'https://gsriztjnocjwgqkaxhhz.supabase.co/storage/v1/object/public/tryon-fits/bg8.png',
    prompt: `Place the person at a luxurious tropical beach resort. STRICT DEPTH RULE: the person must stand at a fixed depth position that is exactly two steps behind the nearest foreground point of the scene — never in the foreground, never far in the background. Lock this depth strictly and do not vary it. The person must be centered horizontally on the light stone pathway beside the sandy beach. Match the bright, sunny outdoor lighting, turquoise ocean water in the background, palm trees casting shadows, and the wooden thatched-roof structure on the right. Preserve all facial features, pose, and outfit details exactly. Do not alter clothing colors or textures.`
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// BLOUSE SLEEVE MODIFICATION PROMPTS
// id → { name, imageUrl, prompt }
// imageUrl: thumbnail shown in the UI selector
// prompt: exact AI instructions injected into Gemini
// ─────────────────────────────────────────────────────────────────────────────
const BLOUSE_MODIFICATION_PROMPTS = {
  'elbow-sleeve': {
    name: 'Elbow Sleeve',
    imageUrl: '/assets/blouse/elbow_sleeve.png',
    prompt: `Redesign the garment to a Half Sleeve style.
- Extend the sleeve fabric down to the midpoint of the lower extension.
- Create a clean, smooth, tailored garment edge.
- Maintain the exact same coverage for the main bodice.`
  },
  'full-sleeve': {
    name: 'Full Sleeve',
    imageUrl: '/assets/blouse/full_sleeve.png',
    prompt: `Redesign the garment to a Full Sleeve style.
- Extend the sleeve fabric completely down the length of the lower extension to the wrist line.
- Create a clean, smooth, tailored garment edge at the bottom.
- Maintain the exact same coverage for the main bodice.`
  },
  'sleeveless': {
    name: 'Sleeveless',
    imageUrl: '/assets/blouse/sleeve_less.png',
    prompt: `Redesign the garment to a Sleeveless style.
- Remove fabric from the sleeve extensions entirely.
- Create a clean, smooth, tailored garment edge at the main shoulder seam.
- Maintain the exact same coverage for the main bodice.`
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// NECK MODIFICATION PROMPTS
// id → { name, imageUrl, prompt }
// ─────────────────────────────────────────────────────────────────────────────
const NECK_MODIFICATION_PROMPTS = {
  'boat-neck': {
    name: 'Boat Neck',
    imageUrl: '/assets/neck/boat_neck.png',
    prompt: `Change the neckline of this garment to a Boat Neck style. Keep everything else exactly the same.`
  },
  'round-neck': {
    name: 'Round Neck',
    imageUrl: '/assets/neck/round_neck.png',
    prompt: `Change the neckline of this garment to a Classic Round Neck style. Keep everything else exactly the same.`
  },
  'collar-neck': {
    name: 'Collar Neck',
    imageUrl: '/assets/neck/collar_neck.png',
    prompt: `Change the neckline of this garment to a High Round Neck (Mandarin Collar) style with a small keyhole opening at the back. Keep everything else exactly the same.`
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// Lookup helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Get a background entry by ID.
 * @returns {{ name, imageUrl, prompt } | null}
 */
function getBackground(id) {
  return BACKGROUND_PROMPTS[id] || null;
}

/**
 * Get a blouse modification entry by ID.
 * @returns {{ name, imageUrl, prompt } | null}
 */
function getBlouseModification(id) {
  return BLOUSE_MODIFICATION_PROMPTS[id] || null;
}

/**
 * Get a neck modification entry by ID.
 * @returns {{ name, imageUrl, prompt } | null}
 */
function getNeckModification(id) {
  return NECK_MODIFICATION_PROMPTS[id] || null;
}

/**
 * Get any outfit modification (blouse or neck) by ID.
 * Checks blouse first, then neck.
 * @returns {{ name, imageUrl, prompt } | null}
 */
function getOutfitModification(id) {
  return BLOUSE_MODIFICATION_PROMPTS[id] || NECK_MODIFICATION_PROMPTS[id] || null;
}

/**
 * List all backgrounds (for UI and external API discovery).
 */
function listBackgrounds() {
  return Object.entries(BACKGROUND_PROMPTS).map(([id, val]) => ({
    id,
    name: val.name,
    imageUrl: val.imageUrl
  }));
}

/**
 * List all blouse modification options (for UI and external API discovery).
 */
function listBlouseModifications() {
  return Object.entries(BLOUSE_MODIFICATION_PROMPTS).map(([id, val]) => ({
    id,
    name: val.name,
    imageUrl: val.imageUrl
  }));
}

/**
 * List all neck modification options (for UI and external API discovery).
 */
function listNeckModifications() {
  return Object.entries(NECK_MODIFICATION_PROMPTS).map(([id, val]) => ({
    id,
    name: val.name,
    imageUrl: val.imageUrl
  }));
}

// ─────────────────────────────────────────────────────────────────────────────
// MODEL PROMPTS (Base Models for Catalog Draping)
// id → imageUrl
// ─────────────────────────────────────────────────────────────────────────────
const MODEL_PROMPTS = {
  // SAREE / DEFAULT models
  'saree-1': 'https://gsriztjnocjwgqkaxhhz.supabase.co/storage/v1/object/public/tryon-fits/default models/41.jpeg',
  'saree-2': 'https://gsriztjnocjwgqkaxhhz.supabase.co/storage/v1/object/public/tryon-fits/default models/42.jpeg',
  'saree-3': 'https://gsriztjnocjwgqkaxhhz.supabase.co/storage/v1/object/public/tryon-fits/default models/43.jpeg',
  'saree-4': 'https://gsriztjnocjwgqkaxhhz.supabase.co/storage/v1/object/public/tryon-fits/default models/44.jpeg',
  
  // LEHANGA models
  'lehanga-1': 'https://gsriztjnocjwgqkaxhhz.supabase.co/storage/v1/object/public/tryon-fits/default models/lehanga/lehanga1.jpg',
  'lehanga-2': 'https://gsriztjnocjwgqkaxhhz.supabase.co/storage/v1/object/public/tryon-fits/default models/lehanga/lehanga2.jpg',
  'lehanga-3': 'https://gsriztjnocjwgqkaxhhz.supabase.co/storage/v1/object/public/tryon-fits/default models/lehanga/lehanga3.jpg',
  'lehanga-4': 'https://gsriztjnocjwgqkaxhhz.supabase.co/storage/v1/object/public/tryon-fits/default models/lehanga/lehanga4.jpg',
  
  // ANARKALI models
  'anarkali-1': 'https://gsriztjnocjwgqkaxhhz.supabase.co/storage/v1/object/public/tryon-fits/default models/anarkali/anarkali1.jpg',
  'anarkali-2': 'https://gsriztjnocjwgqkaxhhz.supabase.co/storage/v1/object/public/tryon-fits/default models/anarkali/anarkali2.jpg',
  'anarkali-3': 'https://gsriztjnocjwgqkaxhhz.supabase.co/storage/v1/object/public/tryon-fits/default models/anarkali/anarkali3.jpg',
  'anarkali-4': 'https://gsriztjnocjwgqkaxhhz.supabase.co/storage/v1/object/public/tryon-fits/default models/anarkali/anarkali4.jpg',
  
  // SHARARA models
  'sharara-1': 'https://gsriztjnocjwgqkaxhhz.supabase.co/storage/v1/object/public/tryon-fits/default models/sharara/shrara1.jpg',
  'sharara-2': 'https://gsriztjnocjwgqkaxhhz.supabase.co/storage/v1/object/public/tryon-fits/default models/sharara/shrara2.jpg',
  'sharara-3': 'https://gsriztjnocjwgqkaxhhz.supabase.co/storage/v1/object/public/tryon-fits/default models/sharara/shrara3.jpg',
  'sharara-4': 'https://gsriztjnocjwgqkaxhhz.supabase.co/storage/v1/object/public/tryon-fits/default models/sharara/sharara4.jpg',
  
  // KURTHI models
  'kurthi-1': 'https://gsriztjnocjwgqkaxhhz.supabase.co/storage/v1/object/public/tryon-fits/default models/kurti/kurti1.jpg',
  'kurthi-2': 'https://gsriztjnocjwgqkaxhhz.supabase.co/storage/v1/object/public/tryon-fits/default models/kurti/kurti2.jpg',
  'kurthi-3': 'https://gsriztjnocjwgqkaxhhz.supabase.co/storage/v1/object/public/tryon-fits/default models/kurti/kurti3.jpg',
  'kurthi-4': 'https://gsriztjnocjwgqkaxhhz.supabase.co/storage/v1/object/public/tryon-fits/default models/kurti/kurti4.jpg'
};

/**
 * Resolves a model ID to its URL, or selects a random model for a category if no ID is passed.
 * @param {string} modelId 
 * @param {string} category 
 * @returns {string} URL of the selected model
 */
function getModelResolution(modelId, category) {
  // If an explicit ID is passed and it exists, use it
  if (modelId && MODEL_PROMPTS[modelId]) {
    return MODEL_PROMPTS[modelId];
  }

  // Otherwise, use random fallback based on category
  const safeCategory = category || 'DEFAULT';
  const normalizedCat = safeCategory.toUpperCase();
  
  let prefix = 'saree-'; // Default for SAREE or DEFAULT

  if (normalizedCat === 'LEHANGA') prefix = 'lehanga-';
  else if (normalizedCat === 'ANARKALI') prefix = 'anarkali-';
  else if (normalizedCat === 'SHARARA') prefix = 'sharara-';
  else if (normalizedCat === 'KURTHI') prefix = 'kurthi-';

  // Randomly pick 1 through 4
  const randomNum = Math.floor(Math.random() * 4) + 1;
  const targetId = prefix + randomNum;

  return MODEL_PROMPTS[targetId];
}

// ─────────────────────────────────────────────────────────────────────────────
// CATEGORY-SPECIFIC TRY-ON PROMPTS
// Used by pipeline.js to inject perfect ethnic fashion vocabulary
// ─────────────────────────────────────────────────────────────────────────────
const CATEGORY_PROMPTS = {
  'SAREE': `THE SAREE (from Saree Reference):
Faithfully reproduce every detail of the saree draping. Preserve the complete pallu with its full length and natural fall over the shoulder, maintain every pleat at the waist with their exact crispness, and keep the precise wrapping pattern around the body. Transfer the exact color palette, weave pattern, embroidery, zari borders, and motifs — the fabric must be identical, not approximated. 
CRITICAL BORDER RULE (MANDATORY): The pallu MUST stop exactly at the woven zari border. DO NOT invent or extend any plain fabric below the border to touch the floor. There must be ZERO plain fabric hanging beneath the bottom horizontal border. If the border ends above the floor, leave it hanging in the air. Do NOT draw a fabric train on the floor.`,
  
  'LEHANGA': `THE LEHANGA SET (from Garment Reference):
Faithfully reproduce the Lehenga set. 
1. SKIRT (Lehenga): Preserve the exact volume, heavy flare, and pleating of the Lehenga skirt from the reference. Transfer the exact borders, embroidery, and fabric texture.
2. BLOUSE (Choli): Reproduce the exact cut, neckline, and sleeve length of the top/blouse. 
3. DUPATTA RULE (CRITICAL): Carefully analyze the Garment Reference. If a Dupatta (scarf/veil) is explicitly shown in the reference images, you MUST drape it elegantly across the shoulder or arms exactly matching its pattern, color, and border. IF NO DUPATTA IS SHOWN IN THE REFERENCE, YOU MUST NOT INVENT OR GENERATE A DUPATTA. Leave the shoulders and arms completely free of any extra draped fabric. Do not hallucinate a dupatta if one is missing.`,
  
  'ANARKALI': `THE ANARKALI SUIT (from Garment Reference):
Faithfully reproduce the Anarkali suit. 
1. SILHOUETTE: Preserve the long, frock-style flared silhouette from the waist down, maintaining the exact fabric volume, weight, and drape. 
2. TOP: Reproduce the fitted bodice, neckline, and sleeves exactly. 
3. BOTTOMS: Preserve the churidar/pants as shown. 
4. DUPATTA RULE (CRITICAL): Carefully analyze the Garment Reference. If a Dupatta (scarf/veil) is explicitly shown in the reference images, you MUST drape it elegantly across the shoulder or neck exactly matching its pattern, color, and border. IF NO DUPATTA IS SHOWN IN THE REFERENCE, YOU MUST NOT INVENT OR GENERATE A DUPATTA. Leave the shoulders and chest completely free of any extra draped fabric.`,
  
  'SHARARA': `THE SHARARA SUIT (from Garment Reference):
Faithfully reproduce the Sharara suit. 
1. BOTTOMS: It is critical to maintain the unique wide, flared, ruffled structure of the Sharara pants from the knee down. 
2. TOP: Preserve the exact length, side slits, and neckline of the Kurti (tunic). 
3. DUPATTA RULE (CRITICAL): Carefully analyze the Garment Reference. If a Dupatta (scarf/veil) is explicitly shown in the reference images, you MUST drape it elegantly across the shoulder or neck exactly matching its pattern, color, and border. IF NO DUPATTA IS SHOWN IN THE REFERENCE, YOU MUST NOT INVENT OR GENERATE A DUPATTA. Leave the shoulders and chest completely free of any extra draped fabric.`,
  
  'KURTHI': `THE KURTHI SET (from Garment Reference):
Faithfully reproduce the Kurthi outfit. 
1. TOP: Preserve the exact length of the tunic, the depth of the side slits, the neckline, and the sleeve style. 
2. BOTTOMS: If bottoms (leggings, palazzos, or pants) are visible, reproduce them exactly. 
3. DUPATTA RULE (CRITICAL): Carefully analyze the Garment Reference. If a Dupatta (scarf/veil) is explicitly shown in the reference images, you MUST drape it elegantly across the shoulder or neck exactly matching its pattern, color, and border. IF NO DUPATTA IS SHOWN IN THE REFERENCE, YOU MUST NOT INVENT OR GENERATE A DUPATTA. Leave the shoulders and chest completely free of any extra draped fabric.`,
  
  'DEFAULT': `THE OUTFIT (from Garment Reference):
Faithfully reproduce every detail of the outfit. Preserve the exact silhouette, neckline, sleeve style, and pant/skirt structure. Transfer the exact color palette, weave pattern, and embroidery. The outfit must conform naturally to the customer's body without altering the customer's proportions.
DUPATTA RULE (CRITICAL): Carefully analyze the Garment Reference. If a Dupatta (scarf/veil) is explicitly shown in the reference images, drape it exactly. IF NO DUPATTA IS SHOWN, YOU MUST NOT INVENT OR GENERATE ONE.`
};

/**
 * Get category specific try-on instructions
 * @param {string} category 
 */
function getCategoryPrompt(category) {
  if (!category) return CATEGORY_PROMPTS['DEFAULT'];
  const normalizedCat = category.toUpperCase();
  return CATEGORY_PROMPTS[normalizedCat] || CATEGORY_PROMPTS['DEFAULT'];
}

/**
 * Assemble the full, highly-detailed global prompt for Gemini.
 * Injects category instructions and blouse logic automatically.
 * @param {string} category 
 * @param {boolean} hasBlouse 
 * @returns {string} The full prompt string
 */
function getFullTryOnPrompt(category, hasBlouse) {
  const isSaree = (!category || category.toUpperCase() === 'SAREE');
  const categoryInstruction = getCategoryPrompt(category);
  
  let blouseInstruction = '';
  if (isSaree) {
    blouseInstruction = hasBlouse
      ? `\nTHE BLOUSE (from Blouse Reference — separate image):
A separate blouse image has been provided (this may be a fully stitched blouse or an unstitched flat piece of fabric). 
1. Transfer the exact fabric texture, color, and embroidery from this Blouse Reference image.
2. If the reference is unstitched flat fabric, you MUST construct a standard, modest regular neckline (strictly NO collar necks) with standard half-sleeves.
3. If the reference is a stitched blouse, copy its exact neckline and sleeves (but NEVER invent a collar if one isn't clearly there). 
The blouse must be tailored to fit the customer's body naturally. Ignore any blouse visible in the Saree Reference.\n`
      : `\nTHE BLOUSE (No separate image provided):
CRITICAL: Analyze the Saree Reference image carefully.
1. IF A BLOUSE IS VISIBLE: You MUST copy its exact neckline, sleeve length, color, fabric texture, and embroidery. Do NOT redesign it. Do NOT invent new patterns. Reproduce the visible blouse with 100% pixel-perfect accuracy.
2. IF NO BLOUSE IS VISIBLE (e.g. folded fabric flat-lay): You MUST generate a modest, matching blouse (standard round neckline, half-sleeves) that complements the saree. Do NOT leave the customer bare.\n`;
  }

  return `You are a professional fashion photographer conducting a virtual fitting session for Indian ethnic wear. The customer walked into your fitting room and put on the outfit from the garment reference. Your job is to photograph them wearing it — nothing else changes about the person.

═══════════════════════════════════════════════════════════════════
RULE #1 — ABSOLUTE IDENTITY LOCK (HIGHEST PRIORITY — OVERRIDES ALL OTHER INSTRUCTIONS)
═══════════════════════════════════════════════════════════════════
The customer's face is FORENSIC EVIDENCE. You are NOT allowed to alter it in any way.

EXPRESSION LOCK:
- If the customer is NOT smiling → the output must NOT smile. No smile. No micro-smile. No lip curl. Zero teeth visible unless teeth were already visible in the input.
- If the customer IS smiling → preserve that exact smile. Same tooth visibility, same lip curvature, same crow's feet.
- Do NOT "improve" the expression. Do NOT make them look "happier" or more "photogenic." The expression must be a forensic copy of the input.

FACE LOCK:
- Same bone structure, same jawline, same cheek contour, same nose shape, same eyebrow arch and thickness.
- Same eye shape, same iris color, same eyelid crease, same under-eye texture (dark circles, lines — keep them).
- Same skin texture with visible pores, blemishes, fine lines, and natural imperfections. Do NOT smooth, blur, or airbrush the skin.
- Same makeup — if they have kajal, keep kajal. If they have no makeup, keep no makeup. Do NOT add or remove makeup.

BODY LOCK:
- Same body shape, proportions, weight, and posture. The outfit conforms to THEIR body — never reshape the body to fit the outfit.
- Same skin tone uniformly across face, neck, arms, hands, and stomach — no lightening, no darkening, no evening out.
- Hands and arms must remain anatomically natural — visible knuckle creases, natural finger curvature, correct finger count, organic skin folds.

HAIR LOCK:
- Same hairstyle, volume, parting, color, and flyaway strands. Do NOT restyle, smooth, or add volume.

═══════════════════════════════════════════════════════════════════
RULE #2 — THE GARMENT & STRICT ISOLATION
═══════════════════════════════════════════════════════════════════
ISOLATION COMMAND: You must extract ONLY the fabric and the garment from the Garment Reference images. You MUST completely ignore and remove any mannequins, hangers, headless bodies, floor textures, flat-lay surfaces, or backgrounds present in the Garment Reference. NEVER copy the background of the clothes into the final output.

${categoryInstruction}
${blouseInstruction}
═══════════════════════════════════════════════════════════════════
RULE #3 — THE SCENE (BACKGROUND LOCK)
═══════════════════════════════════════════════════════════════════
You must strictly use the background from the CUSTOMER image (the person to dress). Keep the identical background, walls, floor, furniture, objects, and ambient lighting from the customer photo. Under absolutely no circumstances should the background from the Garment Reference appear in the final output. The garment must interact naturally with the existing light direction of the customer's scene — casting soft ground shadows, receiving ambient color spill, with natural shadow gradients where fabric meets skin.

═══════════════════════════════════════════════════════════════════
RULE #4 — PHOTOGRAPHIC QUALITY
═══════════════════════════════════════════════════════════════════
Shot on 85mm portrait lens, soft ambient lighting matching the customer's environment. The result must be indistinguishable from a real, unretouched photograph. Render natural skin texture with pores and fine lines. The fabric must show realistic micro-wrinkles, natural drape weight, and material-appropriate light interaction (silk sheen, cotton matte, chiffon translucency). No fused fingers, no extra digits, no warped anatomy, no plastic skin, no floating fabric edges. No beauty filters. No airbrushing.

Produce exactly one final photograph.`;
}

module.exports = {
  getBackground,
  getBlouseModification,
  getNeckModification,
  getOutfitModification,
  listBackgrounds,
  listBlouseModifications,
  listNeckModifications,
  getCategoryPrompt,
  getFullTryOnPrompt,
  getModelResolution
};
