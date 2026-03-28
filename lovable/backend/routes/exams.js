/**
 * Exams Routes — CodeBreakers
 */
const express  = require('express');
const router   = express.Router();
const mongoose = require('mongoose');
const { protect, authorise } = require('../middleware/auth');

// ── Exam Schema ───────────────────────────────────────────────────
const examSchema = new mongoose.Schema({
  title:       { type: String, required: true, trim: true },
  course:      { type: mongoose.Schema.Types.ObjectId, ref: 'Course', required: true },
  description: { type: String },
  duration:    { type: Number, default: 60 }, // minutes
  passScore:   { type: Number, default: 70 },
  maxAttempts: { type: Number, default: 2 },
  availableFrom: { type: Date },
  availableUntil:{ type: Date },
  questions: [{
    question: { type: String, required: true },
    options:  [{ type: String }],
    correct:  { type: Number, required: true }, // index of correct option
    points:   { type: Number, default: 1 },
  }],
  isPublished: { type: Boolean, default: false },
}, { timestamps: true });

// ── Submission Schema ─────────────────────────────────────────────
const submissionSchema = new mongoose.Schema({
  exam:      { type: mongoose.Schema.Types.ObjectId, ref: 'Exam', required: true },
  student:   { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  answers:   [{ type: Number }],
  score:     { type: Number },
  passed:    { type: Boolean },
  attempt:   { type: Number, default: 1 },
  startedAt: { type: Date },
  submittedAt:{ type: Date, default: Date.now },
}, { timestamps: true });

const Exam       = mongoose.models.Exam       || mongoose.model('Exam', examSchema);
const Submission = mongoose.models.Submission || mongoose.model('Submission', submissionSchema);

router.use(protect);

// GET /api/exams?course=:id
router.get('/', async (req, res) => {
  try {
    const query = {};
    if (req.query.course)   query.course      = req.query.course;
    if (req.user.role !== 'admin') query.isPublished = true;

    const now   = new Date();
    if (req.user.role === 'student') {
      query.$or = [
        { availableFrom: { $lte: now }, availableUntil: { $gte: now } },
        { availableFrom: null },
      ];
    }
    const exams = await Exam.find(query).select('-questions.correct').sort({ createdAt: -1 });
    res.json({ success: true, data: exams });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// GET /api/exams/:id
router.get('/:id', async (req, res) => {
  try {
    const selectFields = req.user.role === 'admin' ? '' : '-questions.correct';
    const exam = await Exam.findById(req.params.id).select(selectFields);
    if (!exam) return res.status(404).json({ success: false, message: 'Exam not found.' });
    res.json({ success: true, data: exam });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// POST /api/exams — admin only
router.post('/', authorise('admin'), async (req, res) => {
  try {
    const exam = await Exam.create(req.body);
    res.status(201).json({ success: true, data: exam });
  } catch (err) { res.status(400).json({ success: false, message: err.message }); }
});

// PUT /api/exams/:id — admin only
router.put('/:id', authorise('admin'), async (req, res) => {
  try {
    const exam = await Exam.findByIdAndUpdate(req.params.id, req.body, { new: true });
    if (!exam) return res.status(404).json({ success: false, message: 'Exam not found.' });
    res.json({ success: true, data: exam });
  } catch (err) { res.status(400).json({ success: false, message: err.message }); }
});

// DELETE /api/exams/:id — admin only
router.delete('/:id', authorise('admin'), async (req, res) => {
  try {
    await Exam.findByIdAndDelete(req.params.id);
    res.json({ success: true, message: 'Exam deleted.' });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// POST /api/exams/:id/submit — student submits exam
router.post('/:id/submit', async (req, res) => {
  try {
    const exam = await Exam.findById(req.params.id);
    if (!exam) return res.status(404).json({ success: false, message: 'Exam not found.' });

    // Check attempt count
    const prevAttempts = await Submission.countDocuments({ exam: req.params.id, student: req.user._id });
    if (prevAttempts >= exam.maxAttempts) {
      return res.status(403).json({ success: false, message: `Maximum attempts (${exam.maxAttempts}) reached.` });
    }

    const { answers } = req.body;
    // Grade exam
    let correct = 0;
    exam.questions.forEach((q, i) => {
      if (answers[i] === q.correct) correct++;
    });
    const score  = Math.round((correct / exam.questions.length) * 100);
    const passed = score >= exam.passScore;

    const submission = await Submission.create({
      exam:        req.params.id,
      student:     req.user._id,
      answers,
      score,
      passed,
      attempt:     prevAttempts + 1,
      submittedAt: new Date(),
    });

    res.status(201).json({
      success: true,
      data: { score, passed, correct, total: exam.questions.length, attempt: prevAttempts + 1 }
    });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// GET /api/exams/:id/results — get all submissions (admin) or own (student)
router.get('/:id/results', async (req, res) => {
  try {
    const query = { exam: req.params.id };
    if (req.user.role === 'student') query.student = req.user._id;
    const results = await Submission.find(query).populate('student', 'firstName lastName registrationNumber').sort({ createdAt: -1 });
    res.json({ success: true, data: results });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

module.exports = router;
