/**
 * index.js — Try-On Service API (Express, port 4000)
 */
const express = require('express');
const path = require('path');
const cors = require('cors');
const dotenv = require('dotenv');

const { hasGoogleCredentials } = require('./pipeline');
const authRoutes = require('./routes/auth');
const tryonRoutes = require('./routes/tryon.routes');
const externalRoutes = require('./routes/external.routes');

dotenv.config();

const app = express();
app.set('trust proxy', true);
const PORT = process.env.PORT || 4000;

// CORS: Allow specific origins (our frontends + any future domains)
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
      callback(null, true); // Open for now; tighten in production
    }
  }
}));

app.use(express.json({ limit: '20mb' }));

// ── Auth Routes ───────────────────────────────────────────────────────────────
app.use('/api/auth', authRoutes);

// ─────────────────────────────────────────────────────────────────────────────
// 1. Health Check
// ─────────────────────────────────────────────────────────────────────────────
app.get('/api/tryon/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'tryon_service',
    port: PORT,
    hasGoogleCreds: hasGoogleCredentials(),
    hasSupabase: !!(process.env.SUPABASE_URL && process.env.SUPABASE_KEY),
  });
});

// ── Modular API Routes ────────────────────────────────────────────────────────
app.use('/', tryonRoutes);
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
  console.log('\n🧵 Try-On Service listening on port ' + PORT);
  console.log(`   Health: http://localhost:${PORT}/api/tryon/health`);
  console.log(`   Google credentials: ${hasGoogleCredentials() ? '✅ Found' : '❌ MISSING'}`);
  console.log(`   Supabase: ${process.env.SUPABASE_URL ? '✅ Configured' : '❌ MISSING'}`);
});
