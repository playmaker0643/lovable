/**
 * Courses Routes — CodeBreakers
 */
const express = require('express');
const router  = express.Router();
const mongoose = require('mongoose');
const { protect, authorise } = require('../middleware/auth');

// Simple inline Course schema (can be extracted to models/Course.js)
const courseSchema = new mongoose.Schema({
  title:       { type: String, required: true, trim: true },
  category:    { type: String, enum: ['Frontend', 'Backend', 'Cybersecurity', 'Full Stack'], required: true },
  level:       { type: String, enum: ['Beginner', 'Intermediate', 'Advanced'], required: true },
  description: { type: String },
  duration:    { type: Number },  // hours
  emoji:       { type: String, default: '📚' },
  isActive:    { type: Boolean, default: true },
  enrolledCount: { type: Number, default: 0 },
}, { timestamps: true });
const Course = mongoose.models.Course || mongoose.model('Course', courseSchema);

router.use(protect);

// GET /api/courses — all students & admin
router.get('/', async (req, res) => {
  try {
    const { category, level } = req.query;
    const query = { isActive: true };
    if (category) query.category = category;
    if (level)    query.level    = level;
    const courses = await Course.find(query).sort({ createdAt: -1 });
    res.json({ success: true, data: courses });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// GET /api/courses/:id
router.get('/:id', async (req, res) => {
  try {
    const course = await Course.findById(req.params.id);
    if (!course) return res.status(404).json({ success: false, message: 'Course not found.' });
    res.json({ success: true, data: course });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// POST /api/courses — admin only
router.post('/', authorise('admin'), async (req, res) => {
  try {
    const course = await Course.create(req.body);
    res.status(201).json({ success: true, data: course });
  } catch (err) { res.status(400).json({ success: false, message: err.message }); }
});

// PUT /api/courses/:id — admin only
router.put('/:id', authorise('admin'), async (req, res) => {
  try {
    const course = await Course.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
    if (!course) return res.status(404).json({ success: false, message: 'Course not found.' });
    res.json({ success: true, data: course });
  } catch (err) { res.status(400).json({ success: false, message: err.message }); }
});

// DELETE /api/courses/:id — admin only
router.delete('/:id', authorise('admin'), async (req, res) => {
  try {
    const course = await Course.findByIdAndDelete(req.params.id);
    if (!course) return res.status(404).json({ success: false, message: 'Course not found.' });
    res.json({ success: true, message: 'Course deleted.' });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

module.exports = router;
