/**
 * Students Routes — CodeBreakers
 * GET    /api/students          (admin only) — list all students
 * GET    /api/students/:id      (admin/self) — get single student
 * PUT    /api/students/:id      (admin/self) — update profile
 * DELETE /api/students/:id      (admin only) — delete student
 * GET    /api/students/:id/progress            — get lesson progress
 * POST   /api/students/:id/progress            — update lesson progress
 */
const express  = require('express');
const router   = express.Router();
const User     = require('../models/User');
const { protect, authorise } = require('../middleware/auth');

// ── All routes require authentication ─────────────────────────────
router.use(protect);

// ── GET /api/students  (admin only) ──────────────────────────────
router.get('/', authorise('admin'), async (req, res) => {
  try {
    const { page = 1, limit = 20, course, search, status } = req.query;
    const query = { role: 'student' };

    if (course)  query.course   = course;
    if (status === 'active')   query.isActive = true;
    if (status === 'inactive') query.isActive = false;
    if (search) {
      query.$or = [
        { firstName:          { $regex: search, $options: 'i' } },
        { lastName:           { $regex: search, $options: 'i' } },
        { email:              { $regex: search, $options: 'i' } },
        { registrationNumber: { $regex: search, $options: 'i' } },
      ];
    }

    const skip     = (parseInt(page) - 1) * parseInt(limit);
    const students = await User.find(query).skip(skip).limit(parseInt(limit)).sort({ createdAt: -1 });
    const total    = await User.countDocuments(query);

    res.status(200).json({
      success: true,
      count:   students.length,
      total,
      pages:   Math.ceil(total / limit),
      page:    parseInt(page),
      data:    students.map(s => s.toPublicJSON()),
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── GET /api/students/:id ─────────────────────────────────────────
router.get('/:id', async (req, res) => {
  try {
    // Only admin or the student themselves can view
    if (req.user.role !== 'admin' && req.user._id.toString() !== req.params.id) {
      return res.status(403).json({ success: false, message: 'Access denied.' });
    }
    const student = await User.findOne({ _id: req.params.id, role: 'student' });
    if (!student) return res.status(404).json({ success: false, message: 'Student not found.' });
    res.status(200).json({ success: true, data: student.toPublicJSON() });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── PUT /api/students/:id ─────────────────────────────────────────
router.put('/:id', async (req, res) => {
  try {
    if (req.user.role !== 'admin' && req.user._id.toString() !== req.params.id) {
      return res.status(403).json({ success: false, message: 'Access denied.' });
    }
    const allowed = ['firstName', 'lastName', 'phone', 'dob', 'profileImage'];
    if (req.user.role === 'admin') allowed.push('course', 'isActive');

    const updates = {};
    allowed.forEach(field => { if (req.body[field] !== undefined) updates[field] = req.body[field]; });

    const student = await User.findByIdAndUpdate(req.params.id, updates, { new: true, runValidators: true });
    if (!student) return res.status(404).json({ success: false, message: 'Student not found.' });

    res.status(200).json({ success: true, data: student.toPublicJSON() });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── DELETE /api/students/:id (admin only) ─────────────────────────
router.delete('/:id', authorise('admin'), async (req, res) => {
  try {
    const student = await User.findOneAndDelete({ _id: req.params.id, role: 'student' });
    if (!student) return res.status(404).json({ success: false, message: 'Student not found.' });
    res.status(200).json({ success: true, message: 'Student removed successfully.' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── GET /api/students/:id/progress ───────────────────────────────
router.get('/:id/progress', async (req, res) => {
  try {
    if (req.user.role !== 'admin' && req.user._id.toString() !== req.params.id) {
      return res.status(403).json({ success: false, message: 'Access denied.' });
    }
    const student = await User.findById(req.params.id).populate('completedLessons', 'title order');
    if (!student) return res.status(404).json({ success: false, message: 'Student not found.' });
    res.status(200).json({ success: true, data: { completedLessons: student.completedLessons } });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── POST /api/students/:id/progress ──────────────────────────────
router.post('/:id/progress', async (req, res) => {
  try {
    if (req.user._id.toString() !== req.params.id) {
      return res.status(403).json({ success: false, message: 'Access denied.' });
    }
    const { lessonId } = req.body;
    const student = await User.findById(req.params.id);
    if (!student) return res.status(404).json({ success: false, message: 'Student not found.' });

    if (!student.completedLessons.includes(lessonId)) {
      student.completedLessons.push(lessonId);
      await student.save({ validateBeforeSave: false });
    }
    res.status(200).json({ success: true, message: 'Progress updated.' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
