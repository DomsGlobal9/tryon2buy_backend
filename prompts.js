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

module.exports = {
  getBackground,
  getBlouseModification,
  getNeckModification,
  getOutfitModification,
  listBackgrounds,
  listBlouseModifications,
  listNeckModifications
};
