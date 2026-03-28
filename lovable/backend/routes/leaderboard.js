/**
 * Leaderboard Route — CodeBreakers
 * GET /api/leaderboard        — overall rankings
 * GET /api/leaderboard/course/:courseId — per-course rankings
 */
const express  = require('express');
const router   = express.Router();
const mongoose = require('mongoose');
const { protect } = require('../middleware/auth');
const User = require('../models/User');

router.use(protect);

// ── Helper: get letter grade ──────────────────────────────────
function getGrade(score) {
  if (score >= 90) return { letter: 'A+', color: '#00ff88' };
  if (score >= 80) return { letter: 'A',  color: '#00f5ff' };
  if (score >= 70) return { letter: 'B',  color: '#c084fc' };
  if (score >= 60) return { letter: 'C',  color: '#ffbe0b' };
  return { letter: 'F', color: '#ff006e' };
}

// ── GET /api/leaderboard ─────────────────────────────────────
router.get('/', async (req, res) => {
  try {
    const { course, limit = 20, period = 'all' } = req.query;

    // Fetch all active students
    const query = { role: 'student', isActive: true };
    if (course) query.course = course;
    const students = await User.find(query).select('firstName lastName registrationNumber course profileImage completedLessons createdAt');

    // Get Grade model
    const Grade = mongoose.models.Grade;
    // Get Attendance model
    const Attendance = mongoose.models.Attendance;

    // Build rankings for each student
    const rankings = await Promise.all(students.map(async (s) => {
      // ── Grade score (avg of all grades) ───────────────────
      let avgGrade = 0;
      if (Grade) {
        const grades = await Grade.find({ student: s._id });
        if (grades.length > 0) {
          avgGrade = Math.round(grades.reduce((sum, g) => sum + g.score, 0) / grades.length);
        }
      }

      // ── Attendance rate ───────────────────────────────────
      let attRate = 0;
      if (Attendance) {
        const dateQuery = {};
        if (period === 'week') {
          dateQuery.date = { $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) };
        } else if (period === 'month') {
          dateQuery.date = { $gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) };
        }
        const attRecords = await Attendance.find({ student: s._id, ...dateQuery });
        if (attRecords.length > 0) {
          const present = attRecords.filter(a => a.status === 'present' || a.status === 'late').length;
          attRate = Math.round((present / attRecords.length) * 100);
        }
      }

      // ── Lessons completed ─────────────────────────────────
      const lessonsCompleted = s.completedLessons?.length || 0;

      // ── Composite score (weighted) ─────────────────────────
      // Grades: 40%, Attendance: 35%, Lessons: 25%
      const compositeScore = Math.round(
        (avgGrade * 0.40) +
        (attRate  * 0.35) +
        (Math.min(lessonsCompleted * 5, 100) * 0.25)
      );

      const grade = getGrade(avgGrade);

      return {
        id:               s._id,
        name:             `${s.firstName} ${s.lastName}`,
        firstName:        s.firstName,
        registrationNumber: s.registrationNumber,
        course:           s.course,
        profileImage:     s.profileImage,
        avgGrade,
        attRate,
        lessonsCompleted,
        compositeScore,
        grade:            grade.letter,
        gradeColor:       grade.color,
        joinedAt:         s.createdAt,
      };
    }));

    // Sort by composite score descending
    rankings.sort((a, b) => b.compositeScore - a.compositeScore);

    // Add rank & badges
    const ranked = rankings.slice(0, parseInt(limit)).map((s, idx) => ({
      ...s,
      rank:  idx + 1,
      badge: idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : null,
      isCurrentUser: s.id.toString() === req.user._id.toString(),
    }));

    // Find current user's rank
    const myRank = rankings.findIndex(s => s.id.toString() === req.user._id.toString()) + 1;

    res.json({
      success: true,
      data:    ranked,
      total:   rankings.length,
      myRank:  myRank || null,
    });
  } catch (err) {
    console.error('Leaderboard error:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── GET /api/leaderboard/course/:course ───────────────────────
router.get('/course/:course', async (req, res) => {
  try {
    req.query.course = req.params.course;
    // Reuse main handler logic by delegating
    const students = await User.find({ role: 'student', isActive: true, course: req.params.course })
      .select('firstName lastName registrationNumber course completedLessons')
      .limit(50);

    res.json({
      success: true,
      course:  req.params.course,
      count:   students.length,
      data:    students.map((s, i) => ({
        rank:             i + 1,
        name:             `${s.firstName} ${s.lastName}`,
        registrationNumber: s.registrationNumber,
        lessonsCompleted: s.completedLessons?.length || 0,
      })),
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
