/**
 * storage.js — Supabase Storage upload utilities
 * 
 * Single bucket "tryon-fits" with hyper-organized folder structure:
 *   garments/                       — uploaded garment flat images
 *   vendor-drapes/{uuid}.jpg        — generated front views (garment on default model)
 *   user-uploads/{uuid}.jpg         — user-uploaded human/portrait images
 *   results/tryon-results/          — final try-on output images
 *   results/background-swaps/       — background replacement images
 *   results/outfit-edits/           — blouse/neck modification images
 */
const { v4: uuidv4 } = require('uuid');
const supabase = require('./supabaseClient');

const BUCKET = process.env.SUPABASE_STORAGE_BUCKET || 'tryon-fits';

/**
 * Upload a raw Buffer to Supabase Storage.
 * @param {Buffer} buffer - Image buffer
 * @param {string} folder - Folder path (garments, front-views, human-images, results)
 * @param {string} [ext='jpg'] - File extension
 * @returns {Promise<string>} Public URL of the uploaded file
 */
async function uploadBufferToSupabase(buffer, folder, ext = 'jpg') {
  const filePath = `${folder}/${uuidv4()}.${ext}`;

  const { data, error } = await supabase.storage
    .from(BUCKET)
    .upload(filePath, buffer, {
      contentType: ext === 'png' ? 'image/png' : 'image/jpeg',
      upsert: true,
    });

  if (error) {
    throw new Error(`Supabase upload failed (${folder}): ${error.message}`);
  }

  const { data: publicData } = supabase.storage
    .from(BUCKET)
    .getPublicUrl(filePath);

  return publicData.publicUrl;
}

/**
 * Decode a base64 JPEG string and upload to Supabase Storage.
 * @param {string} base64Str - Base64-encoded JPEG (with or without data: prefix)
 * @param {string} folder - Folder path
 * @returns {Promise<string>} Public URL
 */
async function uploadBase64ToSupabase(base64Str, folder) {
  const raw = base64Str.includes(',') ? base64Str.split(',')[1] : base64Str;
  const buffer = Buffer.from(raw, 'base64');
  return uploadBufferToSupabase(buffer, folder, 'jpg');
}

module.exports = { uploadBufferToSupabase, uploadBase64ToSupabase };
