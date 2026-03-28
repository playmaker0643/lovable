/**
 * Attendance Routes — CodeBreakers
 * Auto-tracks attendance when students watch lessons
 *
 * POST /api/attendance/lesson       — record lesson watch event (auto-track)
 * POST /api/attendance/class        — record virtual class attendance
 * GET  /api/attendance/me           — student's own attendance
 * GET  /api/attendance/student/:id  — admin: specific student
 * GET  /api/attendance/report       — admin: full report
 * GET  /api/attendance/today        — admin: today's attendance
 */
const express  = require('express');
const router   = express.Router();
const mongoose = require('mongoose');
const { protect, authorise } = require('../middleware/auth');

// ── Attendance Schema ─────────────────────────────────────────────
const attendanceSchema = new mongoose.Schema({
  student:    { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  lesson:     { type: mongoose.Schema.Types.ObjectId, ref: 'Lesson' },
  type:       { type: String, enum: ['lesson', 'class', 'exam'], default: 'lesson' },
  date:       { type: Date, default: Date.now },
  dateOnly:   { type: String },             // "YYYY-MM-DD" for easy daily grouping
  status:     { type: String, enum: ['present', 'late', 'absent'], default: 'present' },

  // ── Video watch tracking ──────────────────────────────────────
  watchedSeconds:  { type: Number, default: 0 },
  totalSeconds:    { type: Number, default: 0 },
  watchPercent:    { type: Number, default: 0 },
  completed:       { type: Boolean, default: false },

  // ── Session info ──────────────────────────────────────────────
  checkInTime:   { type: Date },
  checkOutTime:  { type: Date },
  ipAddress:     { type: String },
  device:        { type: String },
}, { timestamps: true });

// Compound index: one record per student per lesson per day
attendanceSchema.index({ student: 1, lesson: 1, dateOnly: 1 }, { unique: true, sparse: true });
attendanceSchema.index({ student: 1, date: -1 });
attendanceSchema.index({ dateOnly: 1 });

const Attendance = mongoose.models.Attendance || mongoose.model('Attendance', attendanceSchema);

router.use(protect);

// ══════════════════════════════════════════════════════════════════
// POST /api/attendance/lesson
// Called automatically from the frontend video player as student watches
// ══════════════════════════════════════════════════════════════════
router.post('/lesson', async (req, res) => {
  try {
    const { lessonId, watchedSeconds, totalSeconds, completed } = req.body;
    if (!lessonId) return res.status(400).json({ success: false, message: 'lessonId is required.' });

    const today      = new Date().toISOString().split('T')[0];
    const watchPct   = totalSeconds > 0 ? Math.round((watchedSeconds / totalSeconds) * 100) : 0;

    // Determine status based on watch percentage
    let status = 'absent';
    if (watchPct >= 80)  status = 'present';
    else if (watchPct >= 30) status = 'late';

    // Upsert — update existing record for this student+lesson+day or create new
    const attendance = await Attendance.findOneAndUpdate(
      { student: req.user._id, lesson: lessonId, dateOnly: today },
      {
        $set: {
          student:        req.user._id,
          lesson:         lessonId,
          type:           'lesson',
          dateOnly:       today,
          date:           new Date(),
          watchedSeconds: watchedSeconds || 0,
          totalSeconds:   totalSeconds   || 0,
          watchPercent:   watchPct,
          status,
          completed:      completed || watchPct >= 80,
          checkInTime:    new Date(),
          ipAddress:      req.ip,
          device:         req.headers['user-agent']?.substring(0, 100),
        },
      },
      { upsert: true, new: true, runValidators: false }
    );

    // Emit real-time update to admins via Socket.io
    const io = req.app.get('io');
    if (io) {
      io.to('admins').emit('attendance:update', {
        studentId:  req.user._id,
        lessonId,
        watchPct,
        status,
        completed:  completed || watchPct >= 80,
        timestamp:  new Date(),
      });
    }

    // Auto-mark lesson complete if watched ≥ 80%
    if ((completed || watchPct >= 80)) {
      const User = require('../models/User');
      await User.findByIdAndUpdate(
        req.user._id,
        { $addToSet: { completedLessons: lessonId } },
        { new: false }
      );
    }

    res.status(200).json({
      success:     true,
      message:     'Attendance recorded.',
      watchPercent: watchPct,
      status,
      completed:   completed || watchPct >= 80,
    });
  } catch (err) {
    // Ignore duplicate key errors (race condition on upsert)
    if (err.code === 11000) return res.status(200).json({ success: true, message: 'Already recorded.' });
    console.error('Attendance error:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// ══════════════════════════════════════════════════════════════════
// POST /api/attendance/class  — Virtual class check-in
// ══════════════════════════════════════════════════════════════════
router.post('/class', async (req, res) => {
  try {
    const today = new Date().toISOString().split('T')[0];
    const now   = new Date();

    // Class starts at 8:00 AM — late if after 8:15 AM
    const classStartHour = 8, classStartMin = 0, lateAfterMin = 15;
    const isLate = now.getHours() > classStartHour ||
      (now.getHours() === classStartHour && now.getMinutes() > classStartMin + lateAfterMin);

    const attendance = await Attendance.findOneAndUpdate(
      { student: req.user._id, type: 'class', dateOnly: today },
      {
        $set: {
          student:     req.user._id,
          type:        'class',
          dateOnly:    today,
          date:        now,
          status:      isLate ? 'late' : 'present',
          checkInTime: now,
          ipAddress:   req.ip,
          device:      req.headers['user-agent']?.substring(0, 100),
        },
      },
      { upsert: true, new: true, runValidators: false }
    );

    const io = req.app.get('io');
    if (io) {
      io.to('admins').emit('attendance:checkin', {
        studentId:   req.user._id,
        studentName: req.user.firstName + ' ' + req.user.lastName,
        status:      isLate ? 'late' : 'present',
        timestamp:   now,
      });
    }

    res.status(200).json({
      success:    true,
      message:    isLate ? 'Marked as late.' : 'Check-in successful!',
      status:     isLate ? 'late' : 'present',
      checkInTime: now,
    });
  } catch (err) {
    if (err.code === 11000) return res.status(200).json({ success: true, message: 'Already checked in today.' });
    res.status(500).json({ success: false, message: err.message });
  }
});

// ══════════════════════════════════════════════════════════════════
// GET /api/attendance/me — Student's own attendance
// ══════════════════════════════════════════════════════════════════
router.get('/me', async (req, res) => {
  try {
    const { month, year } = req.query;
    const query = { student: req.user._id };

    if (month && year) {
      const start = new Date(year, month - 1, 1);
      const end   = new Date(year, month, 0, 23, 59, 59);
      query.date  = { $gte: start, $lte: end };
    }

    const records = await Attendance.find(query)
      .populate('lesson', 'title order duration')
      .sort({ date: -1 });

    // Stats
    const present = records.filter(r => r.status === 'present').length;
    const late    = records.filter(r => r.status === 'late').length;
    const absent  = records.filter(r => r.status === 'absent').length;
    const total   = records.length;
    const rate    = total > 0 ? Math.round(((present + late) / total) * 100) : 0;

    // Current streak
    let streak = 0;
    const sorted = [...records].sort((a, b) => new Date(b.date) - new Date(a.date));
    for (const r of sorted) {
      if (r.status === 'present' || r.status === 'late') streak++;
      else break;
    }

    res.status(200).json({
      success: true,
      data:    records,
      stats: { present, late, absent, total, rate, streak },
    });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// ══════════════════════════════════════════════════════════════════
// GET /api/attendance/student/:id — Admin: specific student
// ══════════════════════════════════════════════════════════════════
router.get('/student/:id', authorise('admin'), async (req, res) => {
  try {
    const records = await Attendance.find({ student: req.params.id })
      .populate('lesson', 'title order')
      .sort({ date: -1 })
      .limit(100);

    const present = records.filter(r => r.status === 'present').length;
    const late    = records.filter(r => r.status === 'late').length;
    const total   = records.length;
    const rate    = total > 0 ? Math.round(((present + late) / total) * 100) : 0;

    res.status(200).json({
      success: true,
      data:    records,
      stats:   { present, late, absent: total - present - late, total, rate },
    });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// ══════════════════════════════════════════════════════════════════
// GET /api/attendance/today — Admin: today's summary
// ══════════════════════════════════════════════════════════════════
router.get('/today', authorise('admin'), async (req, res) => {
  try {
    const today   = new Date().toISOString().split('T')[0];
    const records = await Attendance.find({ dateOnly: today })
      .populate('student', 'firstName lastName registrationNumber course')
      .populate('lesson',  'title order')
      .sort({ date: -1 });

    const present = records.filter(r => r.status === 'present').length;
    const late    = records.filter(r => r.status === 'late').length;
    const absent  = records.filter(r => r.status === 'absent').length;

    res.status(200).json({
      success: true,
      date:    today,
      data:    records,
      stats:   { present, late, absent, total: records.length },
    });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// ══════════════════════════════════════════════════════════════════
// GET /api/attendance/report — Admin: paginated full report
// ══════════════════════════════════════════════════════════════════
router.get('/report', authorise('admin'), async (req, res) => {
  try {
    const { page = 1, limit = 50, course, status, dateFrom, dateTo } = req.query;
    const query = {};

    if (status)   query.status = status;
    if (dateFrom || dateTo) {
      query.date = {};
      if (dateFrom) query.date.$gte = new Date(dateFrom);
      if (dateTo)   query.date.$lte = new Date(dateTo + 'T23:59:59');
    }

    // Filter by course (via student lookup)
    if (course) {
      const User  = require('../models/User');
      const users = await User.find({ role: 'student', course }).select('_id');
      query.student = { $in: users.map(u => u._id) };
    }

    const skip    = (parseInt(page) - 1) * parseInt(limit);
    const records = await Attendance.find(query)
      .populate('student', 'firstName lastName registrationNumber course')
      .populate('lesson',  'title order')
      .sort({ date: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const total = await Attendance.countDocuments(query);

    // Aggregate stats
    const stats = await Attendance.aggregate([
      { $match: query },
      { $group: {
        _id:           '$status',
        count:         { $sum: 1 },
        avgWatchPct:   { $avg: '$watchPercent' },
      }},
    ]);

    res.status(200).json({
      success: true,
      data:    records,
      total,
      pages:   Math.ceil(total / limit),
      page:    parseInt(page),
      stats,
    });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

module.exports = router;
