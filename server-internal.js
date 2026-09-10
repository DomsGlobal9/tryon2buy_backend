/**
 * server-internal.js — Internal Tryon2Buy Website Backend
 * 
 * This server handles ALL traffic from the main website (www.tryon2buy.com).
 * It includes: Auth routes, Try-On routes, Health check.
 * It does NOT include: External B2B API routes.
 * 
 * Start command: npm run start:internal
 */
const express = require('express');
const path = require('path');
const cors = require('cors');
const dotenv = require('dotenv');
const rateLimit = require('express-rate-limit');

const { hasGoogleCredentials } = require('./pipeline');
const authRoutes = require('./routes/auth');
const tryonRoutes = require('./routes/tryon.routes');
const dockRoutes = require('./routes/dock.routes');
// NOTE: externalRoutes is intentionally NOT imported here

dotenv.config();

const app = express();
app.set('trust proxy', 1);
const PORT = process.env.PORT || 4000;

// CORS: Only allow our own frontends (strict security)
const ALLOWED_ORIGINS = [
  'http://localhost:5173',   // tryon frontend (dev)
  'http://localhost:5174',   // Tryon_To_Buy frontend (dev)
  'http://localhost:3000',   // alternate dev port
  'http://localhost:4000',   // same-origin requests
  'https://tryon2buy.com',   // production frontend
  'https://www.tryon2buy.com',// production frontend (www)
  'https://tryon2buy-frontend.vercel.app' // Vercel deployment
];
app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (Postman, curl, server-to-server)
    if (!origin || ALLOWED_ORIGINS.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  }
}));

app.use(express.json({ limit: '20mb' }));

// Global Rate Limiter for Internal API (300 requests per 5 minutes)
const globalInternalLimiter = rateLimit({
  windowMs: 5 * 60 * 1000, // 5 minutes
  max: 300,
  message: { error: 'Too many requests from this IP, please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
});
app.use(globalInternalLimiter);

// ── Auth Routes ───────────────────────────────────────────────────────────────
app.use('/api/auth', authRoutes);

// ─────────────────────────────────────────────────────────────────────────────
// Health Check
// ─────────────────────────────────────────────────────────────────────────────
app.get('/api/tryon/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'tryon_service_internal',
    port: PORT,
    hasGoogleCreds: hasGoogleCredentials(),
    hasSupabase: !!(process.env.SUPABASE_URL && process.env.SUPABASE_KEY),
  });
});

// ── Internal Try-On Routes ────────────────────────────────────────────────────
app.use('/', tryonRoutes);
// The shop's photo dock. Signed-in accounts only, shared across their devices.
app.use('/', dockRoutes);

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
  console.log('\n🧵 Try-On INTERNAL Service listening on port ' + PORT);
  console.log(`   Health: http://localhost:${PORT}/api/tryon/health`);
  console.log(`   Google credentials: ${hasGoogleCredentials() ? '✅ Found' : '❌ MISSING'}`);
  console.log(`   Supabase: ${process.env.SUPABASE_URL ? '✅ Configured' : '❌ MISSING'}`);
  console.log(`   Mode: INTERNAL (website only — no external API routes loaded)`);
});
