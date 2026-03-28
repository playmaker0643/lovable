/**
 * Auth Middleware — JWT verification & role guards
 */
const jwt  = require('jsonwebtoken');
const User = require('../models/User');

// ── Verify JWT token ──────────────────────────────────────────────
exports.protect = async (req, res, next) => {
  let token;

  // Check Authorization header (Bearer token)
  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer ')) {
    token = req.headers.authorization.split(' ')[1];
  }
  // Also check cookie (optional)
  else if (req.cookies && req.cookies.cb_token) {
    token = req.cookies.cb_token;
  }

  if (!token) {
    return res.status(401).json({ success: false, message: 'Not authorised. Please log in.' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user    = await User.findById(decoded.id).select('-password');

    if (!user) {
      return res.status(401).json({ success: false, message: 'User no longer exists.' });
    }
    if (!user.isActive) {
      return res.status(403).json({ success: false, message: 'Account is deactivated. Contact admin.' });
    }

    req.user = user;
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ success: false, message: 'Session expired. Please log in again.' });
    }
    return res.status(401).json({ success: false, message: 'Invalid token.' });
  }
};

// ── Role guard ────────────────────────────────────────────────────
exports.authorise = (...roles) => (req, res, next) => {
  if (!roles.includes(req.user.role)) {
    return res.status(403).json({
      success: false,
      message: `Role '${req.user.role}' is not permitted to access this resource.`
    });
  }
  next();
};

// ── Admin only shorthand ──────────────────────────────────────────
exports.adminOnly = [exports.protect, exports.authorise('admin')];

// ── Student only shorthand ────────────────────────────────────────
exports.studentOnly = [exports.protect, exports.authorise('student')];
