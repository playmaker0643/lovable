/**
 * Lessons Routes — CodeBreakers
 * Sequential access enforced — students can only access a lesson
 * if the previous lesson is in their completedLessons array.
 */
const express   = require('express');
const router    = express.Router();
const mongoose  = require('mongoose');
const { protect, authorise } = require('../middleware/auth');
const User      = require('../models/User');

// Inline Lesson schema
const lessonSchema = new mongoose.Schema({
  title:       { type: String, required: true, trim: true },
  description: { type: String },
  course:      { type: mongoose.Schema.Types.ObjectId, ref: 'Course', required: true },
  order:       { type: Number, required: true },
  videoUrl:    { type: String },
  duration:    { type: Number },  // minutes
  materials:   [{ name: String, url: String }],
  isPublished: { type: Boolean, default: true },
}, { timestamps: true });

const Lesson = mongoose.models.Lesson || mongoose.model('Lesson', lessonSchema);

router.use(protect);

// GET /api/lessons?course=:courseId — list lessons for a course
router.get('/', async (req, res) => {
  try {
    const { course } = req.query;
    if (!course) return res.status(400).json({ success: false, message: 'Course ID is required.' });

    const lessons = await Lesson.find({ course, isPublished: true }).sort({ order: 1 });

    // For students: annotate each lesson with locked/unlocked status
    if (req.user.role === 'student') {
      const student    = await User.findById(req.user._id).select('completedLessons');
      const completed  = student.completedLessons.map(id => id.toString());

      const annotated = lessons.map((lesson, idx) => {
        const lessonObj  = lesson.toObject();
        const prevLesson = idx > 0 ? lessons[idx - 1] : null;
        lessonObj.isCompleted = completed.includes(lesson._id.toString());
        lessonObj.isLocked    = idx > 0 && !completed.includes(prevLesson._id.toString());
        return lessonObj;
      });
      return res.json({ success: true, data: annotated });
    }

    res.json({ success: true, data: lessons });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// GET /api/lessons/:id — single lesson (with sequential lock check)
router.get('/:id', async (req, res) => {
  try {
    const lesson  = await Lesson.findById(req.params.id).populate('course', 'title');
    if (!lesson)  return res.status(404).json({ success: false, message: 'Lesson not found.' });

    if (req.user.role === 'student') {
      // Check if previous lesson is completed
      const prevLesson = await Lesson.findOne({ course: lesson.course, order: lesson.order - 1 });
      if (prevLesson) {
        const student = await User.findById(req.user._id).select('completedLessons');
        const done    = student.completedLessons.map(id => id.toString());
        if (!done.includes(prevLesson._id.toString())) {
          return res.status(403).json({
            success: false,
            message: 'Complete the previous lesson first to unlock this one.',
            locked: true
          });
        }
      }
    }
    res.json({ success: true, data: lesson });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// POST /api/lessons — admin only
router.post('/', authorise('admin'), async (req, res) => {
  try {
    const lesson = await Lesson.create(req.body);
    res.status(201).json({ success: true, data: lesson });
  } catch (err) { res.status(400).json({ success: false, message: err.message }); }
});

// PUT /api/lessons/:id — admin only
router.put('/:id', authorise('admin'), async (req, res) => {
  try {
    const lesson = await Lesson.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
    if (!lesson) return res.status(404).json({ success: false, message: 'Lesson not found.' });
    res.json({ success: true, data: lesson });
  } catch (err) { res.status(400).json({ success: false, message: err.message }); }
});

// DELETE /api/lessons/:id — admin only
router.delete('/:id', authorise('admin'), async (req, res) => {
  try {
    await Lesson.findByIdAndDelete(req.params.id);
    res.json({ success: true, message: 'Lesson deleted.' });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// POST /api/lessons/:id/complete — mark lesson complete (student)
router.post('/:id/complete', async (req, res) => {
  try {
    const lesson  = await Lesson.findById(req.params.id);
    if (!lesson)  return res.status(404).json({ success: false, message: 'Lesson not found.' });

    const student = await User.findById(req.user._id);
    if (!student.completedLessons.includes(req.params.id)) {
      student.completedLessons.push(req.params.id);
      await student.save({ validateBeforeSave: false });
    }
    res.json({ success: true, message: 'Lesson marked as complete!' });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

module.exports = router;
