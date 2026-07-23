const prisma = require('../lib/prisma');

// The Super Admin Gateway tracking endpoint (can be set in .env)
const GATEWAY_URL = process.env.GATEWAY_URL || 'https://api.villy.com';
const TRACKING_ENDPOINT = `${GATEWAY_URL}/api/internal/log-usage`;

/**
 * Silently reports usage to the Super Admin API Gateway.
 * It is fully asynchronous and does not throw errors, ensuring it never crashes the main thread.
 */
async function reportUsageToGateway(vendorId, method, endpoint, statusCode, latencyMs) {
  try {
    let apiKey = process.env.PUBLIC_GUEST_API_KEY;

    // 1. Fetch the vendor's API Key if we have an owner
    if (vendorId) {
      const vendor = await prisma.vendor.findUnique({
        where: { id: vendorId },
        select: { gatewayApiKey: true }
      });
      if (vendor && vendor.gatewayApiKey) {
        apiKey = vendor.gatewayApiKey;
      }
    }

    if (!apiKey) {
      console.log('[Gateway Tracker] No API key available (no vendor key and no public fallback), skipping.');
      return;
    }

    // 2. Ping the Gateway
    const response = await fetch(TRACKING_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey
      },
      body: JSON.stringify({
        method,
        endpoint,
        statusCode,
        latencyMs
      }),
      // signal: AbortSignal.timeout(3000) // Fast timeout to avoid hanging
    });

    if (!response.ok) {
      console.warn(`[Gateway Tracker] Non-200 response from Gateway: ${response.status}`);
    } else {
      console.log(`[Gateway Tracker] Reported ${statusCode} on ${endpoint} using key ${apiKey.substring(0, 10)}...`);
    }
  } catch (error) {
    console.error(`[Gateway Tracker Error] Failed to report usage: ${error.message}`);
  }
}

module.exports = {
  reportUsageToGateway
};
