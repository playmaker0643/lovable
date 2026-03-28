/**
 * Grades Routes — CodeBreakers
 */
const express  = require('express');
const router   = express.Router();
const mongoose = require('mongoose');
const { protect, authorise } = require('../middleware/auth');

const gradeSchema = new mongoose.Schema({
  student:    { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  course:     { type: mongoose.Schema.Types.ObjectId, ref: 'Course' },
  assessment: { type: String, required: true }, // exam title or assignment title
  type:       { type: String, enum: ['exam', 'assignment', 'project'], required: true },
  score:      { type: Number, required: true, min: 0, max: 100 },
  maxScore:   { type: Number, default: 100 },
  feedback:   { type: String },
  gradedBy:   { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  gradedAt:   { type: Date, default: Date.now },
}, { timestamps: true });

const Grade = mongoose.models.Grade || mongoose.model('Grade', gradeSchema);

router.use(protect);

// GET /api/grades — own grades (student) or all (admin)
router.get('/', async (req, res) => {
  try {
    const query = req.user.role === 'student' ? { student: req.user._id } : {};
    if (req.query.student && req.user.role === 'admin') query.student = req.query.student;
    if (req.query.type)   query.type   = req.query.type;
    if (req.query.course) query.course = req.query.course;

    const grades = await Grade.find(query)
      .populate('student', 'firstName lastName registrationNumber')
      .sort({ gradedAt: -1 });

    // Calculate stats
    const scores = grades.map(g => g.score);
    const avg    = scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : 0;

    res.json({ success: true, data: grades, stats: { average: avg, count: grades.length } });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// POST /api/grades — admin adds a grade
router.post('/', authorise('admin'), async (req, res) => {
  try {
    const grade = await Grade.create({ ...req.body, gradedBy: req.user._id });
    res.status(201).json({ success: true, data: grade });
  } catch (err) { res.status(400).json({ success: false, message: err.message }); }
});

// PUT /api/grades/:id — admin edits a grade
router.put('/:id', authorise('admin'), async (req, res) => {
  try {
    const grade = await Grade.findByIdAndUpdate(req.params.id, req.body, { new: true });
    if (!grade) return res.status(404).json({ success: false, message: 'Grade not found.' });
    res.json({ success: true, data: grade });
  } catch (err) { res.status(400).json({ success: false, message: err.message }); }
});

// DELETE /api/grades/:id — admin only
router.delete('/:id', authorise('admin'), async (req, res) => {
  try {
    await Grade.findByIdAndDelete(req.params.id);
    res.json({ success: true, message: 'Grade deleted.' });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// GET /api/grades/report/:studentId — full report
router.get('/report/:studentId', async (req, res) => {
  try {
    if (req.user.role !== 'admin' && req.user._id.toString() !== req.params.studentId) {
      return res.status(403).json({ success: false, message: 'Access denied.' });
    }
    const grades = await Grade.find({ student: req.params.studentId }).sort({ gradedAt: -1 });
    const exams  = grades.filter(g => g.type === 'exam');
    const assigns= grades.filter(g => g.type === 'assignment');
    const avg    = g => g.length ? Math.round(g.reduce((a,b) => a+b.score,0)/g.length) : 0;

    res.json({
      success: true,
      data: { grades, summary: { examAvg: avg(exams), assignmentAvg: avg(assigns), overall: avg(grades), totalGraded: grades.length } }
    });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

module.exports = router;
