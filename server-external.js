/**
 * server-external.js — External B2B API Server
 * 
 * This server handles ALL traffic from external clients (Django, Shopify, etc.).
 * It includes: External API routes (drape, tryon, background, outfit).
 * It does NOT include: Auth routes, Internal Try-On routes.
 * 
 * All endpoints require x-api-key authentication (handled inside external.routes.js).
 * 
 * Start command: npm run start:external
 */
const express = require('express');
const path = require('path');
const cors = require('cors');
const dotenv = require('dotenv');
const rateLimit = require('express-rate-limit');

const { hasGoogleCredentials } = require('./pipeline');
const externalRoutes = require('./routes/external.routes');
// NOTE: authRoutes and tryonRoutes are intentionally NOT imported here

dotenv.config();

const app = express();
app.set('trust proxy', 1);
const PORT = process.env.EXTERNAL_PORT || process.env.PORT || 4001;

// CORS: Open for external B2B clients (they call from their own servers/domains)
// Security is enforced via x-api-key header, not CORS
app.use(cors());

app.use(express.json({ limit: '20mb' }));

// Global Rate Limiter for External API (100 requests per minute)
const globalExternalLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 100,
  message: { error: 'Too many requests from this IP, please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
});
app.use(globalExternalLimiter);

// ─────────────────────────────────────────────────────────────────────────────
// Health Check
// ─────────────────────────────────────────────────────────────────────────────
app.get('/api/external/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'tryon_service_external',
    port: PORT,
    hasGoogleCreds: hasGoogleCredentials(),
    hasSupabase: !!(process.env.SUPABASE_URL && process.env.SUPABASE_KEY),
  });
});

// ── External B2B API Routes ──────────────────────────────────────────────────
app.use('/', externalRoutes);

// Global Error Handler to always return JSON (prevents HTML error pages)
app.use((err, req, res, next) => {
  console.error('Global Error Handler caught:', err);
  res.status(500).json({ 
    error: err.message || 'Internal Server Error',
    stack: process.env.NODE_ENV === 'development' ? err.stack : undefined
  });
});

// ── Start Server ─────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log('\n🔌 Try-On EXTERNAL API listening on port ' + PORT);
  console.log(`   Health: http://localhost:${PORT}/api/external/health`);
  console.log(`   Google credentials: ${hasGoogleCredentials() ? '✅ Found' : '❌ MISSING'}`);
  console.log(`   Supabase: ${process.env.SUPABASE_URL ? '✅ Configured' : '❌ MISSING'}`);
  console.log(`   Mode: EXTERNAL (B2B API only — no website routes loaded)`);
});
