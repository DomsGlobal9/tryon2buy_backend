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
    name: 'Temple Colonnade',
    imageUrl: 'https://gsriztjnocjwgqkaxhhz.supabase.co/storage/v1/object/public/tryon-fits/bg1.png',
    prompt: `Place the person in the sunlit marble temple colonnade. PLACEMENT: stand them in the exact centre of the open walkway, level with the second pair of tall brass lamps, about a third of the way down the corridor — not at the mouth of it and not back at the distant shrine. Their head should reach roughly the height where the carved arch begins to curve, so the arch and the shrine beyond stay visible above them. Leave a clear stretch of sunlit marble in front of their feet. FRAMING: the whole person must be inside the frame — head not cropped, both feet visible and not cut off by the bottom edge, with a little of the ground still showing below the feet. Keep the person's scale believable against the architecture and objects around them. BLENDING: make the placement invisible. Light the person with low golden sunlight raking in from the left, warm on that side of the face and body and cooler in shadow on the other, with a faint amber glow from the nearby lamp flames, so they are lit by this scene rather than by the light of their original photo. Ground them with a soft contact shadow where they meet the polished cream marble floor, falling in the same direction and with the same softness as the other shadows in the scene. Match the scene's exposure, white balance and colour grade across the whole frame. Keep the person's edges natural — no halo, no cut-out outline, no colour fringe, no visible seam. Both rows of brass oil lamps must stay visible down either side, and the domed shrine framed in the arch must remain unobstructed behind them. IDENTITY AND GARMENT LOCK — highest priority, overriding every other instruction here: change NOTHING about the person. The face, hair, skin tone, expression, the position of every finger, the angle of both hands, the arms, the shoulders, the legs, the stance and the body proportions must remain exactly as they are in the input. The outfit must remain pixel-identical: same colour, same print and motif placement, same embroidery, same border, same pleats, same drape and folds, same sheen, same jewellery. Do not restyle, redraw, straighten, smooth, slim, retouch, re-pose or re-render any part of the person or the garment. Treat the person as a fixed cut-out being PLACED into the scene, never repainted.`
  },
  bg2: {
    name: 'Banana Leaf Mandap',
    imageUrl: 'https://gsriztjnocjwgqkaxhhz.supabase.co/storage/v1/object/public/tryon-fits/bg10.png',
    prompt: `Place the person on the lawn in front of the banana-leaf backdrop. PLACEMENT: stand them on the grass roughly one step in front of the leaf wall, centred on it so the hanging marigold strands fall behind both shoulders. Their head should stay below the top edge of the leaf wall, so the wall reads as a backdrop behind them rather than something they overlap. Keep a band of mown grass visible between their feet and the bottom of the frame. FRAMING: the whole person must be inside the frame — head not cropped, both feet visible and not cut off by the bottom edge, with a little of the ground still showing below the feet. Keep the person's scale believable against the architecture and objects around them. BLENDING: make the placement invisible. Light the person with bright but diffused open-shade daylight from above, with green light bouncing up from the lawn onto the underside of the garment, so they are lit by this scene rather than by the light of their original photo. Ground them with a soft contact shadow where they meet the grass, falling in the same direction and with the same softness as the other shadows in the scene. Match the scene's exposure, white balance and colour grade across the whole frame. Keep the person's edges natural — no halo, no cut-out outline, no colour fringe, no visible seam. The brass lamps, clay pots, coconuts and potted banana saplings at either side must all stay visible and unobstructed. IDENTITY AND GARMENT LOCK — highest priority, overriding every other instruction here: change NOTHING about the person. The face, hair, skin tone, expression, the position of every finger, the angle of both hands, the arms, the shoulders, the legs, the stance and the body proportions must remain exactly as they are in the input. The outfit must remain pixel-identical: same colour, same print and motif placement, same embroidery, same border, same pleats, same drape and folds, same sheen, same jewellery. Do not restyle, redraw, straighten, smooth, slim, retouch, re-pose or re-render any part of the person or the garment. Treat the person as a fixed cut-out being PLACED into the scene, never repainted.`
  },
  bg3: {
    name: 'Rose Haveli Alcove',
    imageUrl: 'https://gsriztjnocjwgqkaxhhz.supabase.co/storage/v1/object/public/tryon-fits/bg13.png',
    prompt: `Place the person inside the scalloped marble arch of the haveli alcove. PLACEMENT: stand them centred within the arch opening, on the patterned marble panel and a step in front of the wooden console table. Their head should sit below the hanging brass lamp so the lamp stays visible above them, and their silhouette should fit comfortably inside the scalloped arch without touching its edges. FRAMING: the whole person must be inside the frame — head not cropped, both feet visible and not cut off by the bottom edge, with a little of the ground still showing below the feet. Keep the person's scale believable against the architecture and objects around them. BLENDING: make the placement invisible. Light the person with soft diffused indoor daylight together with a warm pool of light from the brass pendant lamp directly overhead, so they are lit by this scene rather than by the light of their original photo. Ground them with a soft contact shadow where they meet the inlaid black-and-white marble floor, falling in the same direction and with the same softness as the other shadows in the scene. Match the scene's exposure, white balance and colour grade across the whole frame. Keep the person's edges natural — no halo, no cut-out outline, no colour fringe, no visible seam. The carved white columns either side, the framed portrait and the lilies on the console must stay visible. IDENTITY AND GARMENT LOCK — highest priority, overriding every other instruction here: change NOTHING about the person. The face, hair, skin tone, expression, the position of every finger, the angle of both hands, the arms, the shoulders, the legs, the stance and the body proportions must remain exactly as they are in the input. The outfit must remain pixel-identical: same colour, same print and motif placement, same embroidery, same border, same pleats, same drape and folds, same sheen, same jewellery. Do not restyle, redraw, straighten, smooth, slim, retouch, re-pose or re-render any part of the person or the garment. Treat the person as a fixed cut-out being PLACED into the scene, never repainted.`
  },
  bg4: {
    name: 'Candlelit Barn Chapel',
    imageUrl: 'https://gsriztjnocjwgqkaxhhz.supabase.co/storage/v1/object/public/tryon-fits/bg14.png',
    prompt: `Place the person on the white aisle runner of the timber chapel. PLACEMENT: stand them centred on the runner about a third of the way up the aisle from the camera, between the two nearest rows of pews. Their head should stay below the lowest iron chandelier so the chandeliers and the timber roof stay visible above, and the floral altar arch must remain visible beyond them at the end of the aisle. FRAMING: the whole person must be inside the frame — head not cropped, both feet visible and not cut off by the bottom edge, with a little of the ground still showing below the feet. Keep the person's scale believable against the architecture and objects around them. BLENDING: make the placement invisible. Light the person with warm amber candlelight from the iron chandeliers above and the candles along the pews, falling mainly from overhead with soft warm fill on the face, against deep blue twilight in the windows behind, so they are lit by this scene rather than by the light of their original photo. Ground them with a soft contact shadow where they meet the pale aisle runner, falling in the same direction and with the same softness as the other shadows in the scene. Match the scene's exposure, white balance and colour grade across the whole frame. Keep the person's edges natural — no halo, no cut-out outline, no colour fringe, no visible seam. The pews with their draped fabric on both sides, and the petals scattered along the runner, must stay visible. IDENTITY AND GARMENT LOCK — highest priority, overriding every other instruction here: change NOTHING about the person. The face, hair, skin tone, expression, the position of every finger, the angle of both hands, the arms, the shoulders, the legs, the stance and the body proportions must remain exactly as they are in the input. The outfit must remain pixel-identical: same colour, same print and motif placement, same embroidery, same border, same pleats, same drape and folds, same sheen, same jewellery. Do not restyle, redraw, straighten, smooth, slim, retouch, re-pose or re-render any part of the person or the garment. Treat the person as a fixed cut-out being PLACED into the scene, never repainted.`
  },
  bg5: {
    name: 'Diwali Palace Corridor',
    imageUrl: 'https://gsriztjnocjwgqkaxhhz.supabase.co/storage/v1/object/public/tryon-fits/bg2.png',
    prompt: `Place the person on the polished marble walkway of the lamp-lit palace corridor. PLACEMENT: stand them in the exact centre of the clear lane between the two rows of lit diyas, about a third of the way down the corridor and in front of the shallow marble step. No diya, brass plate or flower bowl may overlap their feet — the lane they stand in must stay clear. Their head should stay below the cusped arch so the arch and the lit pavilion beyond remain visible. FRAMING: the whole person must be inside the frame — head not cropped, both feet visible and not cut off by the bottom edge, with a little of the ground still showing below the feet. Keep the person's scale believable against the architecture and objects around them. BLENDING: make the placement invisible. Light the person with warm candlelight rising from the oil lamps at floor level, so the light falls on the person from below and from the sides rather than flat from the front, against the blue evening sky through the far arch, so they are lit by this scene rather than by the light of their original photo. Ground them with a soft contact shadow where they meet the marble walkway, falling in the same direction and with the same softness as the other shadows in the scene. Match the scene's exposure, white balance and colour grade across the whole frame. Keep the person's edges natural — no halo, no cut-out outline, no colour fringe, no visible seam. The marigold garlands running the full height of the pillars, the rows of diyas either side and the flame reflections in the marble must stay visible. IDENTITY AND GARMENT LOCK — highest priority, overriding every other instruction here: change NOTHING about the person. The face, hair, skin tone, expression, the position of every finger, the angle of both hands, the arms, the shoulders, the legs, the stance and the body proportions must remain exactly as they are in the input. The outfit must remain pixel-identical: same colour, same print and motif placement, same embroidery, same border, same pleats, same drape and folds, same sheen, same jewellery. Do not restyle, redraw, straighten, smooth, slim, retouch, re-pose or re-render any part of the person or the garment. Treat the person as a fixed cut-out being PLACED into the scene, never repainted.`
  },
  bg6: {
    name: 'Marigold Haldi Stage',
    imageUrl: 'https://gsriztjnocjwgqkaxhhz.supabase.co/storage/v1/object/public/tryon-fits/bg15.png',
    prompt: `Place the person on the patterned floor in front of the marigold screens. PLACEMENT: stand them on the patterned tiles in the open floor in front of the low stage, centred between the two bamboo chairs but clearly in front of them — standing on the floor, never seated and never on the platform. Their head should stay below the top of the tall arched flower screens so the screens read as a backdrop behind them. FRAMING: the whole person must be inside the frame — head not cropped, both feet visible and not cut off by the bottom edge, with a little of the ground still showing below the feet. Keep the person's scale believable against the architecture and objects around them. BLENDING: make the placement invisible. Light the person with bright clean midday daylight filtered through the pale yellow canopy overhead, giving a soft warm-yellow cast, so they are lit by this scene rather than by the light of their original photo. Ground them with a soft contact shadow where they meet the yellow-and-white geometric tiled floor, falling in the same direction and with the same softness as the other shadows in the scene. Match the scene's exposure, white balance and colour grade across the whole frame. Keep the person's edges natural — no halo, no cut-out outline, no colour fringe, no visible seam. Both bamboo chairs, the gold urli stands and the full height of the orange, yellow and ivory flower screens must stay visible. IDENTITY AND GARMENT LOCK — highest priority, overriding every other instruction here: change NOTHING about the person. The face, hair, skin tone, expression, the position of every finger, the angle of both hands, the arms, the shoulders, the legs, the stance and the body proportions must remain exactly as they are in the input. The outfit must remain pixel-identical: same colour, same print and motif placement, same embroidery, same border, same pleats, same drape and folds, same sheen, same jewellery. Do not restyle, redraw, straighten, smooth, slim, retouch, re-pose or re-render any part of the person or the garment. Treat the person as a fixed cut-out being PLACED into the scene, never repainted.`
  },
  bg7: {
    name: 'Mountain Floral Aisle',
    imageUrl: 'https://gsriztjnocjwgqkaxhhz.supabase.co/storage/v1/object/public/tryon-fits/bg16.png',
    prompt: `Place the person on the white fabric runner at the mountain overlook. PLACEMENT: stand them centred on the white runner in the gap between the two banks of white flowers, far enough forward that the flowers sit at about their hip height rather than swallowing them. Their head must stay below the mountain ridge line so the peak and the sky remain visible above their shoulders. FRAMING: the whole person must be inside the frame — head not cropped, both feet visible and not cut off by the bottom edge, with a little of the ground still showing below the feet. Keep the person's scale believable against the architecture and objects around them. BLENDING: make the placement invisible. Light the person with cool bright high-altitude daylight with a crisp rim light from the open sky behind, giving a clean neutral white balance, so they are lit by this scene rather than by the light of their original photo. Ground them with a soft contact shadow where they meet the white fabric runner, falling in the same direction and with the same softness as the other shadows in the scene. Match the scene's exposure, white balance and colour grade across the whole frame. Keep the person's edges natural — no halo, no cut-out outline, no colour fringe, no visible seam. The white hydrangeas and anthuriums on both sides, the stone bench and the mountain skyline must stay visible. IDENTITY AND GARMENT LOCK — highest priority, overriding every other instruction here: change NOTHING about the person. The face, hair, skin tone, expression, the position of every finger, the angle of both hands, the arms, the shoulders, the legs, the stance and the body proportions must remain exactly as they are in the input. The outfit must remain pixel-identical: same colour, same print and motif placement, same embroidery, same border, same pleats, same drape and folds, same sheen, same jewellery. Do not restyle, redraw, straighten, smooth, slim, retouch, re-pose or re-render any part of the person or the garment. Treat the person as a fixed cut-out being PLACED into the scene, never repainted.`
  },
  bg8: {
    name: 'Marigold Temple Steps',
    imageUrl: 'https://gsriztjnocjwgqkaxhhz.supabase.co/storage/v1/object/public/tryon-fits/bg17.png',
    prompt: `Place the person in the flagstone courtyard at the foot of the carved temple steps. PLACEMENT: stand them on the flat flagstone courtyard in front of the lowest step — on the level ground, never on the steps themselves — centred on the carved wooden doorway above and behind them. Their head should stay below the carved lintel of that doorway so the facade and its carvings stay visible. FRAMING: the whole person must be inside the frame — head not cropped, both feet visible and not cut off by the bottom edge, with a little of the ground still showing below the feet. Keep the person's scale believable against the architecture and objects around them. BLENDING: make the placement invisible. Light the person with soft overcast daylight with a warm sandstone bounce, even and almost shadowless from overhead, the way light falls in a temple forecourt, so they are lit by this scene rather than by the light of their original photo. Ground them with a soft contact shadow where they meet the flagstone courtyard, falling in the same direction and with the same softness as the other shadows in the scene. Match the scene's exposure, white balance and colour grade across the whole frame. Keep the person's edges natural — no halo, no cut-out outline, no colour fringe, no visible seam. The full flight of marigold-strewn steps, the studded wooden door and the carved sandstone facade must stay visible behind them. IDENTITY AND GARMENT LOCK — highest priority, overriding every other instruction here: change NOTHING about the person. The face, hair, skin tone, expression, the position of every finger, the angle of both hands, the arms, the shoulders, the legs, the stance and the body proportions must remain exactly as they are in the input. The outfit must remain pixel-identical: same colour, same print and motif placement, same embroidery, same border, same pleats, same drape and folds, same sheen, same jewellery. Do not restyle, redraw, straighten, smooth, slim, retouch, re-pose or re-render any part of the person or the garment. Treat the person as a fixed cut-out being PLACED into the scene, never repainted.`
  },
  bg9: {
    name: 'Haldi Flower Curtain',
    imageUrl: 'https://gsriztjnocjwgqkaxhhz.supabase.co/storage/v1/object/public/tryon-fits/bg18.png',
    prompt: `Place the person on the lawn in front of the scalloped flower curtain. PLACEMENT: stand them on the grass a step in front of the flower curtain and slightly to one side of the cane peacock chair, so the chair stays fully visible beside them and is not blocked. Their head should stay below the scalloped top edge of the curtain. Keep a band of lawn visible between their feet and the bottom of the frame. FRAMING: the whole person must be inside the frame — head not cropped, both feet visible and not cut off by the bottom edge, with a little of the ground still showing below the feet. Keep the person's scale believable against the architecture and objects around them. BLENDING: make the placement invisible. Light the person with bright tropical daylight under a pale yellow drape, warm and slightly diffused, with green bounce from the lawn, so they are lit by this scene rather than by the light of their original photo. Ground them with a soft contact shadow where they meet the mown grass, falling in the same direction and with the same softness as the other shadows in the scene. Match the scene's exposure, white balance and colour grade across the whole frame. Keep the person's edges natural — no halo, no cut-out outline, no colour fringe, no visible seam. The cane peacock chair, the brass urlis of rose petals, the white flower border along the base and the palms against the sky must stay visible. IDENTITY AND GARMENT LOCK — highest priority, overriding every other instruction here: change NOTHING about the person. The face, hair, skin tone, expression, the position of every finger, the angle of both hands, the arms, the shoulders, the legs, the stance and the body proportions must remain exactly as they are in the input. The outfit must remain pixel-identical: same colour, same print and motif placement, same embroidery, same border, same pleats, same drape and folds, same sheen, same jewellery. Do not restyle, redraw, straighten, smooth, slim, retouch, re-pose or re-render any part of the person or the garment. Treat the person as a fixed cut-out being PLACED into the scene, never repainted.`
  },
  bg10: {
    name: 'Bougainvillea Courtyard',
    imageUrl: 'https://gsriztjnocjwgqkaxhhz.supabase.co/storage/v1/object/public/tryon-fits/bg5.jpg',
    prompt: `Place the person on the patterned tile floor of the frescoed courtyard. PLACEMENT: stand them centred in the opening of the carved arch, on the patterned tiles and in front of the frescoed wall. Their head should stay below the hanging brass lanterns so the lanterns remain visible above them, and their silhouette should sit inside the arch without overlapping the bougainvillea at the edges. FRAMING: the whole person must be inside the frame — head not cropped, both feet visible and not cut off by the bottom edge, with a little of the ground still showing below the feet. Keep the person's scale believable against the architecture and objects around them. BLENDING: make the placement invisible. Light the person with warm low sunlight on the sandstone with pools of amber cast by the hanging brass lanterns overhead, so they are lit by this scene rather than by the light of their original photo. Ground them with a soft contact shadow where they meet the patterned tile floor, falling in the same direction and with the same softness as the other shadows in the scene. Match the scene's exposure, white balance and colour grade across the whole frame. Keep the person's edges natural — no halo, no cut-out outline, no colour fringe, no visible seam. The painted floral frescoes, the carved arch, the hanging lanterns and the magenta bougainvillea framing both sides must stay visible. IDENTITY AND GARMENT LOCK — highest priority, overriding every other instruction here: change NOTHING about the person. The face, hair, skin tone, expression, the position of every finger, the angle of both hands, the arms, the shoulders, the legs, the stance and the body proportions must remain exactly as they are in the input. The outfit must remain pixel-identical: same colour, same print and motif placement, same embroidery, same border, same pleats, same drape and folds, same sheen, same jewellery. Do not restyle, redraw, straighten, smooth, slim, retouch, re-pose or re-render any part of the person or the garment. Treat the person as a fixed cut-out being PLACED into the scene, never repainted.`
  },
  bg11: {
    name: 'Starlit Garden Aisle',
    imageUrl: 'https://gsriztjnocjwgqkaxhhz.supabase.co/storage/v1/object/public/tryon-fits/bg20.png',
    prompt: `Place the person on the pale aisle runner of the night garden. PLACEMENT: stand them centred on the runner between the two nearest pairs of glowing flower lamps, so the lamps sit at about knee to waist height beside them and light their lower half. Their head should stay below the swags of string lights, and the floral arch further down the aisle must remain visible beyond them. FRAMING: the whole person must be inside the frame — head not cropped, both feet visible and not cut off by the bottom edge, with a little of the ground still showing below the feet. Keep the person's scale believable against the architecture and objects around them. BLENDING: make the placement invisible. Light the person with a warm low glow from the illuminated flower lamps at knee height and the canopy of string lights above, against a dark night sky — light the person warmly from the sides and below, never with daylight, so they are lit by this scene rather than by the light of their original photo. Ground them with a soft contact shadow where they meet the pale aisle runner, falling in the same direction and with the same softness as the other shadows in the scene. Match the scene's exposure, white balance and colour grade across the whole frame. Keep the person's edges natural — no halo, no cut-out outline, no colour fringe, no visible seam. The illuminated flower lamps on both sides, the strings of bulbs overhead and the floral arch down the aisle must stay visible. IDENTITY AND GARMENT LOCK — highest priority, overriding every other instruction here: change NOTHING about the person. The face, hair, skin tone, expression, the position of every finger, the angle of both hands, the arms, the shoulders, the legs, the stance and the body proportions must remain exactly as they are in the input. The outfit must remain pixel-identical: same colour, same print and motif placement, same embroidery, same border, same pleats, same drape and folds, same sheen, same jewellery. Do not restyle, redraw, straighten, smooth, slim, retouch, re-pose or re-render any part of the person or the garment. Treat the person as a fixed cut-out being PLACED into the scene, never repainted.`
  },
  bg12: {
    name: 'Sunflower Terrace Mandap',
    imageUrl: 'https://gsriztjnocjwgqkaxhhz.supabase.co/storage/v1/object/public/tryon-fits/bg21.png',
    prompt: `Place the person on the patterned terrace tiles in front of the sunflower arch. PLACEMENT: stand them on the patterned tiles in the open floor in front of the low yellow stage, centred on the sunflower arch behind — on the tiled floor, never on the stage. Their head should stay below the top of the sunflower arch so the arch, the hanging flower balls and the hills beyond stay visible. FRAMING: the whole person must be inside the frame — head not cropped, both feet visible and not cut off by the bottom edge, with a little of the ground still showing below the feet. Keep the person's scale believable against the architecture and objects around them. BLENDING: make the placement invisible. Light the person with clear bright daylight from a high open sky, slightly cool in the shadows with warm bounce off the yellow drapes, so they are lit by this scene rather than by the light of their original photo. Ground them with a soft contact shadow where they meet the blue-and-yellow patterned terrace tiles, falling in the same direction and with the same softness as the other shadows in the scene. Match the scene's exposure, white balance and colour grade across the whole frame. Keep the person's edges natural — no halo, no cut-out outline, no colour fringe, no visible seam. The sunflower and marigold arch, the gold finial stands, the hanging flower balls and the green hills beyond the balustrade must stay visible. IDENTITY AND GARMENT LOCK — highest priority, overriding every other instruction here: change NOTHING about the person. The face, hair, skin tone, expression, the position of every finger, the angle of both hands, the arms, the shoulders, the legs, the stance and the body proportions must remain exactly as they are in the input. The outfit must remain pixel-identical: same colour, same print and motif placement, same embroidery, same border, same pleats, same drape and folds, same sheen, same jewellery. Do not restyle, redraw, straighten, smooth, slim, retouch, re-pose or re-render any part of the person or the garment. Treat the person as a fixed cut-out being PLACED into the scene, never repainted.`
  },
  bg13: {
    name: 'Marigold Doorway',
    imageUrl: 'https://gsriztjnocjwgqkaxhhz.supabase.co/storage/v1/object/public/tryon-fits/bg22.png',
    prompt: `Place the person on the tiled forecourt below the marigold-draped doorway. PLACEMENT: stand them on the flat tiled forecourt in front of the three steps — on the level ground, never on the steps — centred on the marigold-draped doorway behind them. Their head should stay below the garlanded lintel so the doorway and its marigold frame stay visible, and the white kolam on the step must not be covered. FRAMING: the whole person must be inside the frame — head not cropped, both feet visible and not cut off by the bottom edge, with a little of the ground still showing below the feet. Keep the person's scale believable against the architecture and objects around them. BLENDING: make the placement invisible. Light the person with warm early-evening light with amber pools from the hanging filament bulbs overhead and a soft glow from the lit interior beyond the door, so they are lit by this scene rather than by the light of their original photo. Ground them with a soft contact shadow where they meet the tiled forecourt, falling in the same direction and with the same softness as the other shadows in the scene. Match the scene's exposure, white balance and colour grade across the whole frame. Keep the person's edges natural — no halo, no cut-out outline, no colour fringe, no visible seam. The orange marigold garlands framing the doorway, the banks of marigolds either side, the terracotta pots and the white kolam must stay visible. IDENTITY AND GARMENT LOCK — highest priority, overriding every other instruction here: change NOTHING about the person. The face, hair, skin tone, expression, the position of every finger, the angle of both hands, the arms, the shoulders, the legs, the stance and the body proportions must remain exactly as they are in the input. The outfit must remain pixel-identical: same colour, same print and motif placement, same embroidery, same border, same pleats, same drape and folds, same sheen, same jewellery. Do not restyle, redraw, straighten, smooth, slim, retouch, re-pose or re-render any part of the person or the garment. Treat the person as a fixed cut-out being PLACED into the scene, never repainted.`
  },
  bg14: {
    name: 'Tuberose Gateway',
    imageUrl: 'https://gsriztjnocjwgqkaxhhz.supabase.co/storage/v1/object/public/tryon-fits/bg23.png',
    prompt: `Place the person on the lawn in front of the antique wooden gateway. PLACEMENT: stand them on the grass centred in the opening of the wooden gateway, a step in front of it, so the carved frame surrounds them and the hanging tuberose strands fall on either side of them rather than across them. Their head should stay below the carved beam at the top of the gateway. FRAMING: the whole person must be inside the frame — head not cropped, both feet visible and not cut off by the bottom edge, with a little of the ground still showing below the feet. Keep the person's scale believable against the architecture and objects around them. BLENDING: make the placement invisible. Light the person with soft golden late-afternoon light filtering through the tree canopy above, dappled and warm, with long gentle shadows across the grass, so they are lit by this scene rather than by the light of their original photo. Ground them with a soft contact shadow where they meet the lawn, falling in the same direction and with the same softness as the other shadows in the scene. Match the scene's exposure, white balance and colour grade across the whole frame. Keep the person's edges natural — no halo, no cut-out outline, no colour fringe, no visible seam. The carved wooden gateway, the hanging tuberose strands, the brass urlis, the white chrysanthemums and the seated Nandi figures must stay visible. IDENTITY AND GARMENT LOCK — highest priority, overriding every other instruction here: change NOTHING about the person. The face, hair, skin tone, expression, the position of every finger, the angle of both hands, the arms, the shoulders, the legs, the stance and the body proportions must remain exactly as they are in the input. The outfit must remain pixel-identical: same colour, same print and motif placement, same embroidery, same border, same pleats, same drape and folds, same sheen, same jewellery. Do not restyle, redraw, straighten, smooth, slim, retouch, re-pose or re-render any part of the person or the garment. Treat the person as a fixed cut-out being PLACED into the scene, never repainted.`
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
  'anarkali-1': 'https://gsriztjnocjwgqkaxhhz.supabase.co/storage/v1/object/public/tryon-fits/default%20models/anarkali/ChatGPT%20Image%20Aug%2020,%202026,%2005_55_11%20PM.png',
  'anarkali-2': 'https://gsriztjnocjwgqkaxhhz.supabase.co/storage/v1/object/public/tryon-fits/default%20models/anarkali/ChatGPT%20Image%20Aug%2020,%202026,%2005_55_23%20PM.png',
  'anarkali-3': 'https://gsriztjnocjwgqkaxhhz.supabase.co/storage/v1/object/public/tryon-fits/default%20models/anarkali/ChatGPT%20Image%20Aug%2020,%202026,%2005_55_52%20PM.png',
  'anarkali-4': 'https://gsriztjnocjwgqkaxhhz.supabase.co/storage/v1/object/public/tryon-fits/default%20models/anarkali/ChatGPT%20Image%20Aug%2020,%202026,%2005_56_15%20PM.png',
  
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
function getFullTryOnPrompt(category, hasBlouse, dupattaStyleId = null) {
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

  let dupattaInstruction = '';
  if (dupattaStyleId === 'style_1') {
    dupattaInstruction = `\nTHE DUPATTA (from Dupatta Style Reference):
CRITICAL STRUCTURAL BLUEPRINT MANDATE: A separate 'Dupatta Style Reference' image has been provided. You MUST use this image as an absolute structural blueprint for the drape.
1. FORENSIC CLONE: Copy the EXACT drape path, pleating, and positioning of the dupatta shown in the style reference. 
2. EXACT PATH (ASYMMETRICAL COWL): The dupatta MUST sweep in a deep, loose U-shape across the lower torso/waist, gather tightly at ONE single shoulder, and flow exclusively down the back. 
3. PROHIBITED ACTIONS: NEVER drape the dupatta over both shoulders. NEVER drape the dupatta horizontally straight across the upper chest. NEVER wrap it around the neck.
4. BARE ARMS COMMAND: The customer's arms, elbows, and hands MUST remain 100% bare, exposed, and visible. Keep all fabric strictly confined to the torso, skirt front, and shoulder.
5. TEXTURE TRANSFER: The color, texture, and borders of the dupatta must perfectly match the Garment Reference, but the structural SHAPE must be a 1:1 clone of the Dupatta Style Reference.\n`;
  } else if (dupattaStyleId === 'style_2') {
    dupattaInstruction = `\nTHE DUPATTA (from Dupatta Style Reference):
CRITICAL STRUCTURAL BLUEPRINT MANDATE: A separate 'Dupatta Style Reference' image has been provided. You MUST use this image as an absolute structural blueprint for the drape.
1. FORENSIC CLONE: Copy the EXACT drape path, pleating, and positioning of the dupatta shown in the style reference. 
2. EXACT PATH (FRONT PLEAT & ARM DRAPE): The dupatta MUST be pinned securely at ONE single shoulder, and fall gracefully down the front of the body on that SAME side, flowing freely over the arm and hand on that side. 
3. PROHIBITED ACTIONS: NEVER sweep the dupatta across the front stomach or waist in a U-shape to the opposite side. It must stay on the side it is pinned to. NEVER drape it over both shoulders. NEVER wrap it around the neck.
4. TEXTURE TRANSFER: The color, texture, and borders of the dupatta must perfectly match the Garment Reference, but the structural SHAPE must be a 1:1 clone of the Dupatta Style Reference.\n`;
  } else if (dupattaStyleId === 'default' || dupattaStyleId === true) {
    // Fallback if just boolean true was passed (legacy)
    dupattaInstruction = `\nTHE DUPATTA (from Dupatta Style Reference):
CRITICAL STRUCTURAL BLUEPRINT MANDATE: A separate 'Dupatta Style Reference' image has been provided. You MUST use this image as an absolute structural blueprint for the drape.
1. FORENSIC CLONE: Copy the EXACT drape path, pleating, and positioning of the dupatta shown in the style reference. 
2. EXPOSED ARMS & EXACT PATH: Force the fabric to follow that exact path shown in the reference.
3. The customer's arms and hands MUST remain completely bare, exposed, and visible.
4. The color, texture, and borders of the dupatta must perfectly match the Garment Reference, but the structural SHAPE must be a 1:1 clone of the Dupatta Style Reference.\n`;
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
${dupattaInstruction}
═══════════════════════════════════════════════════════════════════
RULE #3 — THE SCENE (BACKGROUND LOCK)
═══════════════════════════════════════════════════════════════════
You must strictly use the background from the CUSTOMER image (the person to dress). Keep the identical background, walls, floor, furniture, objects, and ambient lighting from the customer photo. Under absolutely no circumstances should the background from the Garment Reference appear in the final output. The garment must interact naturally with the existing light direction of the customer's scene — casting soft ground shadows, receiving ambient color spill, with natural shadow gradients where fabric meets skin.

═══════════════════════════════════════════════════════════════════
RULE #4 — PHOTOGRAPHIC QUALITY
═══════════════════════════════════════════════════════════════════
Shot on 85mm portrait lens, soft ambient lighting matching the customer's environment. The result must be indistinguishable from a real, unretouched photograph. Render natural skin texture with pores and fine lines. The fabric must show realistic micro-wrinkles, natural drape weight, and material-appropriate light interaction. No beauty filters. No airbrushing.

═══════════════════════════════════════════════════════════════════
RULE #5 — ANATOMY & HAND PRESERVATION (ANTI-MUTATION BINDING)
═══════════════════════════════════════════════════════════════════
CRITICAL: You are strictly forbidden from generating extra limbs, extra hands, or extra fingers. 
- The person must have exactly two arms and two hands. 
- If the customer's hands are visible, they must remain perfectly preserved with exactly five fingers per hand. 
- You MUST perfectly mask out and erase any hands belonging to the original garment model. 
- Do NOT blend the garment model's hands into the customer's hands. 
- If fabric is draped near the hands, it must flow AROUND the hands naturally without causing finger fusion or amputation.

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
