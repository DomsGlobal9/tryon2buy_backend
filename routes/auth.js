const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const prisma = require('../lib/prisma');
const { JWT_SECRET } = require('../middleware/auth');
const rateLimit = require('express-rate-limit');

const router = express.Router();

// Strict Rate Limiter for Login (10 attempts per 15 minutes)
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10,
  message: { error: 'Too many login attempts from this IP. Please try again after 15 minutes.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// ─── VENDOR REGISTRATION ───
router.post('/vendor/register', async (req, res) => {
  try {
    const { email, password, name, storeName } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required.' });
    }

    const existingVendor = await prisma.vendor.findUnique({ where: { email } });
    if (existingVendor) {
      return res.status(400).json({ error: 'Email is already registered.' });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const vendor = await prisma.vendor.create({
      data: {
        email,
        passwordHash,
        name,
        storeName,
      },
    });

    const token = jwt.sign({ vendorId: vendor.id, role: 'vendor' }, JWT_SECRET, { expiresIn: '7d' });

    res.json({
      success: true,
      token,
      vendor: {
        id: vendor.id,
        email: vendor.email,
        name: vendor.name,
        storeName: vendor.storeName,
        drapeCredits: vendor.drapeCredits,
        userTryonCredits: vendor.userTryonCredits,
        bgChangeCredits: vendor.bgChangeCredits,
        blouseChangeCredits: vendor.blouseChangeCredits,
        isUnlimited: vendor.isUnlimited,
      },
    });
  } catch (err) {
    console.error('[Vendor Register Error]', err);
    res.status(500).json({ error: 'Failed to register vendor.' });
  }
});

// ─── VENDOR LOGIN ───
router.post('/vendor/login', loginLimiter, async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required.' });
    }

    const vendor = await prisma.vendor.findUnique({ where: { email } });
    if (!vendor) {
      return res.status(401).json({ error: 'Invalid email or password.' });
    }

    const isValid = await bcrypt.compare(password, vendor.passwordHash);
    if (!isValid) {
      return res.status(401).json({ error: 'Invalid email or password.' });
    }

    const token = jwt.sign({ vendorId: vendor.id, role: 'vendor' }, JWT_SECRET, { expiresIn: '7d' });

    res.json({
      success: true,
      token,
      vendor: {
        id: vendor.id,
        email: vendor.email,
        name: vendor.name,
        storeName: vendor.storeName,
        drapeCredits: vendor.drapeCredits,
        userTryonCredits: vendor.userTryonCredits,
        bgChangeCredits: vendor.bgChangeCredits,
        blouseChangeCredits: vendor.blouseChangeCredits,
        isUnlimited: vendor.isUnlimited,
      },
    });
  } catch (err) {
    console.error('[Vendor Login Error]', err);
    res.status(500).json({ error: 'Failed to log in vendor.' });
  }
});



module.exports = router;
