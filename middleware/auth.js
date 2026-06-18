const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'tryon-super-secret-key-2026';

function authenticateVendor(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing or invalid authorization header.' });
  }

  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    if (decoded.role !== 'vendor') {
      return res.status(403).json({ error: 'Access denied: Requires vendor role.' });
    }
    req.vendorId = decoded.vendorId;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired token.' });
  }
}

function authenticateCustomer(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing or invalid authorization header.' });
  }

  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    if (decoded.role !== 'customer') {
      return res.status(403).json({ error: 'Access denied: Requires customer role.' });
    }
    req.customerId = decoded.customerId;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired token.' });
  }
}

function authenticateUser(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing or invalid authorization header.' });
  }

  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    if (decoded.role === 'vendor') {
      req.vendorId = decoded.vendorId;
      req.userRole = 'vendor';
    } else if (decoded.role === 'customer') {
      req.customerId = decoded.customerId;
      req.userRole = 'customer';
    } else {
      return res.status(403).json({ error: 'Access denied.' });
    }
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired token.' });
  }
}

module.exports = {
  authenticateVendor,
  authenticateCustomer,
  authenticateUser,
  JWT_SECRET,
};
