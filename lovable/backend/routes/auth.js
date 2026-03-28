/**
 * Auth Routes — CodeBreakers
 * POST /api/auth/register
 * POST /api/auth/login
 * POST /api/auth/forgot-password
 * POST /api/auth/verify-otp
 * POST /api/auth/reset-password
 * POST /api/auth/refresh-token
 * GET  /api/auth/me
 * POST /api/auth/logout
 */
const express  = require('express');
const router   = express.Router();
const jwt      = require('jsonwebtoken');
const crypto   = require('crypto');
const rateLimit = require('express-rate-limit');
const { body, validationResult } = require('express-validator');

const User      = require('../models/User');
const { protect } = require('../middleware/auth');
const {
  sendWelcomeEmail,
  sendOTPEmail,
  sendPasswordResetSuccess
} = require('../utils/email');

// ── Rate limiters ─────────────────────────────────────────────────
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,  // 15 min
  max: 10,
  message: { success: false, message: 'Too many login attempts. Please try again in 15 minutes.' }
});
const otpLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,  // 1 hour
  max: 5,
  message: { success: false, message: 'Too many OTP requests. Please try again in 1 hour.' }
});

// ── Helper: generate JWT ──────────────────────────────────────────
const generateToken = (id, role) =>
  jwt.sign({ id, role }, process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRE || '7d' });

const generateRefreshToken = (id) =>
  jwt.sign({ id }, process.env.JWT_REFRESH_SECRET, { expiresIn: process.env.JWT_REFRESH_EXPIRE || '30d' });

// ── Helper: generate 6-digit OTP ─────────────────────────────────
const generateOTP = () => Math.floor(100000 + Math.random() * 900000).toString();

// ══════════════════════════════════════════════════════════════════
// POST /api/auth/register
// ══════════════════════════════════════════════════════════════════
router.post('/register', [
  body('firstName').trim().notEmpty().withMessage('First name is required'),
  body('lastName').trim().notEmpty().withMessage('Last name is required'),
  body('email').isEmail().normalizeEmail().withMessage('Valid email is required'),
  body('password').isLength({ min: 8 }).withMessage('Password must be at least 8 characters'),
  body('course').notEmpty().withMessage('Course selection is required'),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ success: false, message: errors.array()[0].msg });
  }

  try {
    const { firstName, lastName, email, password, phone, dob, course } = req.body;

    // Check if email already exists
    const existing = await User.findOne({ email });
    if (existing) {
      return res.status(409).json({ success: false, message: 'An account with this email already exists.' });
    }

    // Create student — registrationNumber is auto-generated in pre-save hook
    const user = await User.create({
      firstName, lastName, email, password,
      phone, dob, course,
      role: 'student',
    });

    // Send welcome email (non-blocking)
    sendWelcomeEmail(email, firstName, user.registrationNumber, course).catch(console.error);

    const token        = generateToken(user._id, user.role);
    const refreshToken = generateRefreshToken(user._id);

    // Save refresh token
    user.refreshToken = refreshToken;
    user.lastLogin    = new Date();
    await user.save({ validateBeforeSave: false });

    return res.status(201).json({
      success: true,
      message: `Welcome to CodeBreakers, ${firstName}! Your registration number is ${user.registrationNumber}`,
      token,
      refreshToken,
      user:    user.toPublicJSON(),
    });
  } catch (err) {
    console.error('Register error:', err);
    return res.status(500).json({ success: false, message: 'Server error during registration.' });
  }
});

// ══════════════════════════════════════════════════════════════════
// POST /api/auth/login
// ══════════════════════════════════════════════════════════════════
router.post('/login', loginLimiter, [
  body('identifier').trim().notEmpty().withMessage('Email or registration number is required'),
  body('password').notEmpty().withMessage('Password is required'),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ success: false, message: errors.array()[0].msg });
  }

  try {
    const { identifier, password } = req.body;
    const idLower = identifier.toLowerCase().trim();

    // ── Admin hardcoded check ─────────────────────────────────────
    const adminEmails = [
      process.env.ADMIN_EMAIL_1,
      process.env.ADMIN_EMAIL_2,
    ].filter(Boolean).map(e => e.toLowerCase());

    if (adminEmails.includes(idLower)) {
      if (password !== process.env.ADMIN_PASSWORD) {
        return res.status(401).json({ success: false, message: 'Incorrect password for admin account.' });
      }
      const adminNames = {
        [process.env.ADMIN_EMAIL_1?.toLowerCase()]: 'Abdulhafiz Nasir',
        [process.env.ADMIN_EMAIL_2?.toLowerCase()]: 'Abdussalam Nasir',
      };
      const token = generateToken('admin_' + idLower, 'admin');
      return res.status(200).json({
        success: true,
        message: 'Admin login successful.',
        token,
        user: { email: idLower, name: adminNames[idLower] || 'Admin', role: 'admin' }
      });
    }

    // ── Student/DB lookup ─────────────────────────────────────────
    // Support login by email OR registration number
    const isRegNo = idLower.toUpperCase().startsWith('CB-');
    const query   = isRegNo
      ? { registrationNumber: identifier.toUpperCase() }
      : { email: idLower };

    const user = await User.findOne(query).select('+password +refreshToken');
    if (!user) {
      return res.status(401).json({ success: false, message: 'Invalid credentials. Please check and try again.' });
    }

    // Check account status
    if (!user.isActive) {
      return res.status(403).json({ success: false, message: 'Your account has been deactivated. Please contact admin.' });
    }

    // Verify password
    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      return res.status(401).json({ success: false, message: 'Invalid credentials. Please check and try again.' });
    }

    const token        = generateToken(user._id, user.role);
    const refreshToken = generateRefreshToken(user._id);

    user.refreshToken = refreshToken;
    user.lastLogin    = new Date();
    await user.save({ validateBeforeSave: false });

    return res.status(200).json({
      success: true,
      message: 'Login successful.',
      token,
      refreshToken,
      user:    user.toPublicJSON(),
    });
  } catch (err) {
    console.error('Login error:', err);
    return res.status(500).json({ success: false, message: 'Server error during login.' });
  }
});

// ══════════════════════════════════════════════════════════════════
// POST /api/auth/forgot-password
// Send OTP to email
// ══════════════════════════════════════════════════════════════════
router.post('/forgot-password', otpLimiter, [
  body('identifier').trim().notEmpty().withMessage('Email or registration number is required'),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ success: false, message: errors.array()[0].msg });
  }

  try {
    const { identifier } = req.body;
    const isRegNo = identifier.toUpperCase().startsWith('CB-');
    const query   = isRegNo
      ? { registrationNumber: identifier.toUpperCase() }
      : { email: identifier.toLowerCase() };

    const user = await User.findOne(query).select('+otp +otpExpires');

    // Always return success to prevent email enumeration
    if (!user) {
      return res.status(200).json({
        success: true,
        message: 'If an account exists with this identifier, an OTP has been sent.',
        email: maskEmail(identifier)
      });
    }

    // Generate OTP
    const otp     = generateOTP();
    const expMins = parseInt(process.env.OTP_EXPIRE_MINUTES) || 5;

    user.otp        = otp;
    user.otpExpires = new Date(Date.now() + expMins * 60 * 1000);
    await user.save({ validateBeforeSave: false });

    // Send OTP email
    await sendOTPEmail(user.email, otp, user.firstName);

    return res.status(200).json({
      success: true,
      message: 'OTP sent to your email address.',
      email: maskEmail(user.email)
    });
  } catch (err) {
    console.error('Forgot password error:', err);
    return res.status(500).json({ success: false, message: 'Failed to send OTP. Please try again.' });
  }
});

// ══════════════════════════════════════════════════════════════════
// POST /api/auth/verify-otp
// ══════════════════════════════════════════════════════════════════
router.post('/verify-otp', [
  body('identifier').trim().notEmpty(),
  body('otp').isLength({ min: 6, max: 6 }).withMessage('Invalid OTP format'),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ success: false, message: errors.array()[0].msg });
  }

  try {
    const { identifier, otp } = req.body;
    const isRegNo = identifier.toUpperCase().startsWith('CB-');
    const query   = isRegNo
      ? { registrationNumber: identifier.toUpperCase() }
      : { email: identifier.toLowerCase() };

    const user = await User.findOne(query).select('+otp +otpExpires +resetToken +resetTokenExpires');

    if (!user || !user.otp) {
      return res.status(400).json({ success: false, message: 'Invalid or expired OTP. Please request a new one.' });
    }

    if (new Date() > user.otpExpires) {
      user.otp = undefined; user.otpExpires = undefined;
      await user.save({ validateBeforeSave: false });
      return res.status(400).json({ success: false, message: 'OTP has expired. Please request a new one.' });
    }

    if (user.otp !== otp) {
      return res.status(400).json({ success: false, message: 'Incorrect OTP. Please check and try again.' });
    }

    // OTP is valid — generate a short-lived reset token
    const resetToken       = crypto.randomBytes(32).toString('hex');
    const expMins          = parseInt(process.env.RESET_TOKEN_EXPIRE_MINUTES) || 15;
    user.resetToken        = resetToken;
    user.resetTokenExpires = new Date(Date.now() + expMins * 60 * 1000);
    user.otp               = undefined;
    user.otpExpires        = undefined;
    await user.save({ validateBeforeSave: false });

    return res.status(200).json({
      success: true,
      message: 'OTP verified successfully.',
      resetToken
    });
  } catch (err) {
    console.error('Verify OTP error:', err);
    return res.status(500).json({ success: false, message: 'Server error. Please try again.' });
  }
});

// ══════════════════════════════════════════════════════════════════
// POST /api/auth/reset-password
// ══════════════════════════════════════════════════════════════════
router.post('/reset-password', [
  body('resetToken').notEmpty().withMessage('Reset token is required'),
  body('newPassword').isLength({ min: 8 }).withMessage('Password must be at least 8 characters'),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ success: false, message: errors.array()[0].msg });
  }

  try {
    const { resetToken, newPassword } = req.body;

    const user = await User.findOne({
      resetToken,
      resetTokenExpires: { $gt: Date.now() }
    }).select('+resetToken +resetTokenExpires');

    if (!user) {
      return res.status(400).json({ success: false, message: 'Reset token is invalid or has expired. Please request a new OTP.' });
    }

    // Update password
    user.password           = newPassword;
    user.resetToken         = undefined;
    user.resetTokenExpires  = undefined;
    await user.save();

    // Send confirmation email (non-blocking)
    sendPasswordResetSuccess(user.email, user.firstName).catch(console.error);

    return res.status(200).json({ success: true, message: 'Password reset successfully. You can now log in.' });
  } catch (err) {
    console.error('Reset password error:', err);
    return res.status(500).json({ success: false, message: 'Server error. Please try again.' });
  }
});

// ══════════════════════════════════════════════════════════════════
// GET /api/auth/me  (protected)
// ══════════════════════════════════════════════════════════════════
router.get('/me', protect, async (req, res) => {
  const user = await User.findById(req.user._id);
  res.status(200).json({ success: true, user: user.toPublicJSON() });
});

// ══════════════════════════════════════════════════════════════════
// POST /api/auth/refresh-token
// ══════════════════════════════════════════════════════════════════
router.post('/refresh-token', async (req, res) => {
  const { refreshToken } = req.body;
  if (!refreshToken) {
    return res.status(401).json({ success: false, message: 'No refresh token provided.' });
  }
  try {
    const decoded = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET);
    const user    = await User.findById(decoded.id).select('+refreshToken');
    if (!user || user.refreshToken !== refreshToken) {
      return res.status(401).json({ success: false, message: 'Invalid refresh token.' });
    }
    const newToken        = generateToken(user._id, user.role);
    const newRefreshToken = generateRefreshToken(user._id);
    user.refreshToken     = newRefreshToken;
    await user.save({ validateBeforeSave: false });
    res.status(200).json({ success: true, token: newToken, refreshToken: newRefreshToken });
  } catch (err) {
    res.status(401).json({ success: false, message: 'Refresh token expired. Please log in again.' });
  }
});

// ══════════════════════════════════════════════════════════════════
// POST /api/auth/logout  (protected)
// ══════════════════════════════════════════════════════════════════
router.post('/logout', protect, async (req, res) => {
  await User.findByIdAndUpdate(req.user._id, { refreshToken: undefined }, { validateBeforeSave: false });
  res.status(200).json({ success: true, message: 'Logged out successfully.' });
});

// ── Helper: mask email for display ───────────────────────────────
function maskEmail(email) {
  if (!email || !email.includes('@')) return email;
  const [local, domain] = email.split('@');
  const masked = local.slice(0, 2) + '***' + local.slice(-1);
  return `${masked}@${domain}`;
}

module.exports = router;
