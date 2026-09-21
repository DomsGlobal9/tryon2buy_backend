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
    if (!['vendor', 'merchant', 'b2b_client'].includes(decoded.role)) {
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
    if (['vendor', 'merchant', 'b2b_client'].includes(decoded.role)) {
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

function optionalAuthenticateUser(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    req.userRole = 'guest';
    return next();
  }

  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    if (['vendor', 'merchant', 'b2b_client'].includes(decoded.role)) {
      req.vendorId = decoded.vendorId;
      req.userRole = 'vendor';
    } else if (decoded.role === 'customer') {
      req.customerId = decoded.customerId;
      req.userRole = 'customer';
    } else {
      req.userRole = 'guest';
    }
  } catch (err) {
    /**
     * An expired login is refused, not quietly downgraded to a guest.
     *
     * This used to fall through to guest for every failure. For a vendor whose seven-day
     * login had lapsed that meant their try-ons were silently charged to the free guest
     * allowance of whatever network they were on, and after ten of them they were told
     * "Free Trial Ended -- Login as Vendor" instead of "please log in again".
     *
     * Only TokenExpiredError is refused, and that is deliberate. jsonwebtoken checks the
     * signature before the expiry, so this error can only come from a token WE signed. A
     * token signed by some other system, or a malformed one, fails earlier with
     * JsonWebTokenError and keeps the old guest behaviour -- no integration that happens to
     * send its own Authorization header can start failing because of this.
     */
    if (err && err.name === 'TokenExpiredError') {
      return res.status(401).json({
        error: 'SESSION_EXPIRED',
        message: 'Your session has expired. Please log in again.'
      });
    }
    req.userRole = 'guest';
  }
  next();
}

module.exports = {
  authenticateVendor,
  authenticateCustomer,
  authenticateUser,
  optionalAuthenticateUser,
  JWT_SECRET,
};
