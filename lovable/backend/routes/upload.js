/**
 * Upload Routes — CodeBreakers
 * Handles Cloudinary uploads for videos, documents, images, submissions
 *
 * POST /api/upload/video        — upload lesson video (admin)
 * POST /api/upload/materials    — upload lesson materials (admin)
 * POST /api/upload/avatar       — upload profile image (any auth user)
 * POST /api/upload/submission   — upload assignment submission (student)
 * DELETE /api/upload/:publicId  — delete a file (admin)
 */
const express  = require('express');
const router   = express.Router();
const { protect, authorise } = require('../middleware/auth');
const {
  uploadVideo,
  uploadDocument,
  uploadImage,
  uploadSubmission,
  deleteFile,
} = require('../config/cloudinary');

// ── Multer error handler wrapper ──────────────────────────────────
const handleUpload = (uploadFn) => (req, res, next) => {
  uploadFn(req, res, (err) => {
    if (err) {
      return res.status(400).json({
        success: false,
        message: err.message || 'File upload failed.',
      });
    }
    next();
  });
};

// ══════════════════════════════════════════════════════════════════
// POST /api/upload/video — Upload lesson video (admin only)
// ══════════════════════════════════════════════════════════════════
router.post(
  '/video',
  protect,
  authorise('admin'),
  handleUpload(uploadVideo),
  (req, res) => {
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'No video file provided.' });
    }
    res.status(200).json({
      success:   true,
      message:   'Video uploaded successfully.',
      url:       req.file.path,
      publicId:  req.file.filename,
      duration:  req.file.duration || null,
      format:    req.file.format   || null,
      size:      req.file.size,
    });
  }
);

// ══════════════════════════════════════════════════════════════════
// POST /api/upload/materials — Upload lesson materials (admin only)
// ══════════════════════════════════════════════════════════════════
router.post(
  '/materials',
  protect,
  authorise('admin'),
  handleUpload(uploadDocument),
  (req, res) => {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ success: false, message: 'No files provided.' });
    }
    const files = req.files.map((f) => ({
      name:     f.originalname,
      url:      f.path,
      publicId: f.filename,
      size:     f.size,
    }));
    res.status(200).json({ success: true, message: 'Materials uploaded.', files });
  }
);

// ══════════════════════════════════════════════════════════════════
// POST /api/upload/avatar — Upload profile image (any auth user)
// ══════════════════════════════════════════════════════════════════
router.post(
  '/avatar',
  protect,
  handleUpload(uploadImage),
  async (req, res) => {
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'No image file provided.' });
    }
    // Update user's profileImage in DB
    const User = require('../models/User');
    await User.findByIdAndUpdate(req.user._id, { profileImage: req.file.path });

    res.status(200).json({
      success:  true,
      message:  'Profile image updated.',
      url:      req.file.path,
      publicId: req.file.filename,
    });
  }
);

// ══════════════════════════════════════════════════════════════════
// POST /api/upload/submission — Student submits assignment files
// ══════════════════════════════════════════════════════════════════
router.post(
  '/submission',
  protect,
  authorise('student'),
  handleUpload(uploadSubmission),
  async (req, res) => {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ success: false, message: 'No files provided.' });
    }
    const files = req.files.map((f) => ({
      name:     f.originalname,
      url:      f.path,
      publicId: f.filename,
      size:     f.size,
    }));
    res.status(200).json({
      success: true,
      message: 'Assignment files uploaded successfully.',
      files,
    });
  }
);

// ══════════════════════════════════════════════════════════════════
// DELETE /api/upload/:publicId — Delete a file from Cloudinary
// ══════════════════════════════════════════════════════════════════
router.delete('/:publicId(*)', protect, authorise('admin'), async (req, res) => {
  try {
    const { publicId }    = req.params;
    const { resourceType } = req.query;   // ?resourceType=video|image|raw
    const result = await deleteFile(publicId, resourceType || 'image');
    res.status(200).json({ success: true, message: 'File deleted.', result });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
