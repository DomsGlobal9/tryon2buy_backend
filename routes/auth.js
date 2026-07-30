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
    const { email, password, expectedRole } = req.body;

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

    // Role-Based Access Control Check
    if (expectedRole && vendor.role !== expectedRole) {
      const portalName = expectedRole === 'b2b_client' ? 'B2B Client Portal' : 'Merchant Studio Portal';
      return res.status(403).json({ error: `Access denied. This account does not have permission to access the ${portalName}.` });
    }

    const token = jwt.sign({ vendorId: vendor.id, role: vendor.role }, JWT_SECRET, { expiresIn: '7d' });

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


// ─── VENDOR PROFILE ───
const { authenticateVendor } = require('../middleware/auth');

router.get('/vendor/profile', authenticateVendor, async (req, res) => {
  try {
    const vendor = await prisma.vendor.findUnique({
      where: { id: req.vendorId },
      select: {
        id: true,
        email: true,
        name: true,
        storeName: true,
        companyName: true,
        businessType: true,
        mobileNumber: true,
      }
    });
    if (!vendor) return res.status(404).json({ error: 'Vendor not found' });
    res.json(vendor);
  } catch (err) {
    console.error('[Get Profile Error]', err);
    res.status(500).json({ error: 'Failed to fetch profile' });
  }
});

router.put('/vendor/profile', authenticateVendor, async (req, res) => {
  try {
    const { companyName, businessType, mobileNumber } = req.body;
    
    const updatedVendor = await prisma.vendor.update({
      where: { id: req.vendorId },
      data: {
        companyName,
        businessType,
        mobileNumber
      },
      select: {
        id: true,
        email: true,
        name: true,
        storeName: true,
        companyName: true,
        businessType: true,
        mobileNumber: true,
      }
    });
    
    res.json({ success: true, vendor: updatedVendor });
  } catch (err) {
    console.error('[Update Profile Error]', err);
    res.status(500).json({ error: 'Failed to update profile' });
  }
});

module.exports = router;
