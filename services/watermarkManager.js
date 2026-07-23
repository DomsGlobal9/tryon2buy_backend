const prisma = require('../lib/prisma');
const { applyWatermarkToBase64 } = require('../pipeline');

/**
 * Applies or skips the watermark based on the vendor's ClientConfig.
 * 
 * @param {string} resultB64 - The generated base64 image.
 * @param {string|null} vendorId - The ID of the vendor owning the asset.
 * @returns {Promise<string>} The base64 string, either watermarked or clean.
 */
async function processWatermark(resultB64, vendorId) {
  // If no vendor ID is provided (e.g. guest user), always apply the watermark
  if (!vendorId) {
    return await applyWatermarkToBase64(resultB64);
  }

  try {
    const config = await prisma.clientConfig.findUnique({
      where: { vendorId: vendorId },
      select: { skipWatermark: true }
    });

    if (config && config.skipWatermark) {
      // Vendor has premium watermark-skip feature enabled
      console.log(`[Watermark Manager] Skipping watermark for vendor ${vendorId}`);
      return resultB64;
    }
  } catch (error) {
    console.error(`[Watermark Manager Error] Failed to check config for vendor ${vendorId}: ${error.message}`);
  }

  // Fallback: Default to applying the watermark
  return await applyWatermarkToBase64(resultB64);
}

module.exports = {
  processWatermark
};
