/**
 * Posts / Announcements Routes — CodeBreakers
 *
 * POST   /api/posts              — admin creates a post
 * GET    /api/posts              — get all posts (students & admin)
 * GET    /api/posts/:id          — get single post with comments
 * PUT    /api/posts/:id          — admin edits a post
 * DELETE /api/posts/:id          — admin deletes a post
 * POST   /api/posts/:id/comment  — student/admin adds comment
 * DELETE /api/posts/:id/comment/:cid — delete a comment
 * POST   /api/posts/:id/like     — like/unlike a post
 * GET    /api/posts/unread/count — get unread post count for student
 * POST   /api/posts/:id/read     — mark post as read by student
 */
const express  = require('express');
const router   = express.Router();
const mongoose = require('mongoose');
const { protect, authorise } = require('../middleware/auth');

// ── Comment Sub-schema ────────────────────────────────────────
const commentSchema = new mongoose.Schema({
  author:    { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  content:   { type: String, required: true, maxlength: 1000, trim: true },
  likes:     [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  isPinned:  { type: Boolean, default: false },
}, { timestamps: true });

// ── Post Schema ───────────────────────────────────────────────
const postSchema = new mongoose.Schema({
  author:      { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  title:       { type: String, required: true, trim: true, maxlength: 200 },
  content:     { type: String, required: true, trim: true },
  type:        { type: String, enum: ['announcement','lesson','exam','assignment','resource','question','general'], default: 'announcement' },
  course:      { type: String },   // null = all courses
  tags:        [String],
  attachments: [{
    name: String,
    url:  String,
    type: String,  // pdf, image, link
  }],
  isPinned:    { type: Boolean, default: false },
  isPublished: { type: Boolean, default: true },
  comments:    [commentSchema],
  likes:       [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  readBy:      [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  views:       { type: Number, default: 0 },
}, { timestamps: true });

const Post = mongoose.models.Post || mongoose.model('Post', postSchema);

router.use(protect);

// ══════════════════════════════════════════════════════════════
// GET /api/posts — list posts (pinned first, then by date)
// ══════════════════════════════════════════════════════════════
router.get('/', async (req, res) => {
  try {
    const { page = 1, limit = 20, type, course, search } = req.query;
    const query = { isPublished: true };

    if (type)   query.type   = type;
    if (search) query.$or = [
      { title:   { $regex: search, $options: 'i' } },
      { content: { $regex: search, $options: 'i' } },
    ];
    // Students see posts for their course + general posts
    if (req.user.role === 'student') {
      query.$or = [
        { course: req.user.course },
        { course: null },
        { course: { $exists: false } },
      ];
    }
    if (course && req.user.role === 'admin') query.course = course;

    const skip  = (parseInt(page) - 1) * parseInt(limit);
    const posts = await Post.find(query)
      .populate('author', 'firstName lastName role profileImage')
      .populate('comments.author', 'firstName lastName role profileImage')
      .sort({ isPinned: -1, createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const total = await Post.countDocuments(query);

    // Add unread flag & comment count for each post
    const userId = req.user._id.toString();
    const enriched = posts.map(p => {
      const obj        = p.toObject();
      obj.isRead       = p.readBy.some(id => id.toString() === userId);
      obj.likeCount    = p.likes.length;
      obj.isLiked      = p.likes.some(id => id.toString() === userId);
      obj.commentCount = p.comments.length;
      obj.readCount    = p.readBy.length;
      delete obj.readBy; // don't expose full readBy list
      return obj;
    });

    res.json({ success: true, data: enriched, total, pages: Math.ceil(total / limit), page: parseInt(page) });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// ══════════════════════════════════════════════════════════════
// GET /api/posts/unread/count — unread count for student
// ══════════════════════════════════════════════════════════════
router.get('/unread/count', async (req, res) => {
  try {
    const query = {
      isPublished: true,
      readBy: { $ne: req.user._id },
      $or: [{ course: req.user.course }, { course: null }, { course: { $exists: false } }]
    };
    const count = await Post.countDocuments(query);
    res.json({ success: true, count });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// ══════════════════════════════════════════════════════════════
// GET /api/posts/:id — single post
// ══════════════════════════════════════════════════════════════
router.get('/:id', async (req, res) => {
  try {
    const post = await Post.findById(req.params.id)
      .populate('author', 'firstName lastName role profileImage')
      .populate('comments.author', 'firstName lastName role profileImage');
    if (!post) return res.status(404).json({ success: false, message: 'Post not found.' });

    // Increment view count
    await Post.findByIdAndUpdate(req.params.id, { $inc: { views: 1 } });

    const obj        = post.toObject();
    obj.isRead       = post.readBy.some(id => id.toString() === req.user._id.toString());
    obj.isLiked      = post.likes.some(id => id.toString() === req.user._id.toString());
    obj.likeCount    = post.likes.length;
    obj.commentCount = post.comments.length;
    delete obj.readBy;

    res.json({ success: true, data: obj });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// ══════════════════════════════════════════════════════════════
// POST /api/posts — admin creates a post
// ══════════════════════════════════════════════════════════════
router.post('/', authorise('admin'), async (req, res) => {
  try {
    const { title, content, type, course, tags, attachments, isPinned, isPublished } = req.body;
    if (!title?.trim()) return res.status(400).json({ success: false, message: 'Title is required.' });
    if (!content?.trim()) return res.status(400).json({ success: false, message: 'Content is required.' });

    const post = await Post.create({
      author: req.user._id,
      title:  title.trim(),
      content: content.trim(),
      type:    type || 'announcement',
      course:  course || null,
      tags:    tags || [],
      attachments: attachments || [],
      isPinned:    isPinned    || false,
      isPublished: isPublished !== false,
    });

    await post.populate('author', 'firstName lastName role');

    // Emit real-time notification via Socket.io
    const io = req.app.get('io');
    if (io) {
      io.emit('post:new', {
        postId:  post._id,
        title:   post.title,
        type:    post.type,
        author:  post.author.firstName + ' ' + post.author.lastName,
        preview: post.content.substring(0, 100),
      });
    }

    // Create notifications for all relevant students
    const User         = require('../models/User');
    const Notification = mongoose.models.Notification;
    if (Notification) {
      const studentQuery = { role: 'student', isActive: true };
      if (course) studentQuery.course = course;
      const students = await User.find(studentQuery).select('_id');
      if (students.length > 0) {
        await Notification.insertMany(students.map(s => ({
          recipient: s._id,
          type:      'announcement',
          title:     `📢 ${post.title}`,
          body:      post.content.substring(0, 100),
          link:      `/pages/student/posts.html#${post._id}`,
        })));
      }
    }

    res.status(201).json({ success: true, data: post, message: 'Post published successfully!' });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// ══════════════════════════════════════════════════════════════
// PUT /api/posts/:id — admin edits a post
// ══════════════════════════════════════════════════════════════
router.put('/:id', authorise('admin'), async (req, res) => {
  try {
    const allowed = ['title','content','type','course','tags','attachments','isPinned','isPublished'];
    const updates = {};
    allowed.forEach(f => { if (req.body[f] !== undefined) updates[f] = req.body[f]; });
    const post = await Post.findByIdAndUpdate(req.params.id, updates, { new: true })
      .populate('author', 'firstName lastName role');
    if (!post) return res.status(404).json({ success: false, message: 'Post not found.' });
    res.json({ success: true, data: post });
  } catch (err) { res.status(400).json({ success: false, message: err.message }); }
});

// ══════════════════════════════════════════════════════════════
// DELETE /api/posts/:id — admin deletes a post
// ══════════════════════════════════════════════════════════════
router.delete('/:id', authorise('admin'), async (req, res) => {
  try {
    await Post.findByIdAndDelete(req.params.id);
    res.json({ success: true, message: 'Post deleted.' });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// ══════════════════════════════════════════════════════════════
// POST /api/posts/:id/comment — add a comment (student or admin)
// ══════════════════════════════════════════════════════════════
router.post('/:id/comment', async (req, res) => {
  try {
    const { content } = req.body;
    if (!content?.trim()) return res.status(400).json({ success: false, message: 'Comment cannot be empty.' });

    const post = await Post.findById(req.params.id);
    if (!post) return res.status(404).json({ success: false, message: 'Post not found.' });

    post.comments.push({ author: req.user._id, content: content.trim() });
    await post.save();
    await post.populate('comments.author', 'firstName lastName role profileImage');

    const newComment = post.comments[post.comments.length - 1];

    // Real-time notification to admin
    const io = req.app.get('io');
    if (io && req.user.role === 'student') {
      io.to('admins').emit('post:comment', {
        postId:      post._id,
        postTitle:   post.title,
        commenter:   `${req.user.firstName} ${req.user.lastName}`,
        comment:     content.substring(0, 80),
      });
    }

    res.status(201).json({ success: true, data: newComment, message: 'Comment added.' });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// ══════════════════════════════════════════════════════════════
// DELETE /api/posts/:id/comment/:cid
// ══════════════════════════════════════════════════════════════
router.delete('/:id/comment/:cid', async (req, res) => {
  try {
    const post = await Post.findById(req.params.id);
    if (!post) return res.status(404).json({ success: false, message: 'Post not found.' });

    const comment = post.comments.id(req.params.cid);
    if (!comment) return res.status(404).json({ success: false, message: 'Comment not found.' });

    // Only admin or comment author can delete
    if (req.user.role !== 'admin' && comment.author.toString() !== req.user._id.toString()) {
      return res.status(403).json({ success: false, message: 'Not authorised to delete this comment.' });
    }

    comment.deleteOne();
    await post.save();
    res.json({ success: true, message: 'Comment deleted.' });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// ══════════════════════════════════════════════════════════════
// POST /api/posts/:id/like — toggle like
// ══════════════════════════════════════════════════════════════
router.post('/:id/like', async (req, res) => {
  try {
    const post   = await Post.findById(req.params.id);
    if (!post) return res.status(404).json({ success: false, message: 'Post not found.' });

    const userId = req.user._id.toString();
    const idx    = post.likes.findIndex(id => id.toString() === userId);
    const liked  = idx === -1;

    if (liked) post.likes.push(req.user._id);
    else       post.likes.splice(idx, 1);
    await post.save();

    res.json({ success: true, liked, likeCount: post.likes.length });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// ══════════════════════════════════════════════════════════════
// POST /api/posts/:id/read — mark as read
// ══════════════════════════════════════════════════════════════
router.post('/:id/read', async (req, res) => {
  try {
    await Post.findByIdAndUpdate(req.params.id, {
      $addToSet: { readBy: req.user._id }
    });
    res.json({ success: true });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

module.exports = router;
