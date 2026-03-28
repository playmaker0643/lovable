/**
 * Messages Routes — CodeBreakers
 * Real-time messaging between students and instructors
 */
const express  = require('express');
const router   = express.Router();
const mongoose = require('mongoose');
const { protect } = require('../middleware/auth');

// ── Message Schema ────────────────────────────────────────────────
const messageSchema = new mongoose.Schema({
  sender:    { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  recipient: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  content:   { type: String, required: true, maxlength: 2000 },
  isRead:    { type: Boolean, default: false },
  readAt:    { type: Date },
}, { timestamps: true });

// ── Notification Schema ───────────────────────────────────────────
const notificationSchema = new mongoose.Schema({
  recipient:  { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  type:       { type: String, enum: ['lesson', 'exam', 'assignment', 'grade', 'message', 'announcement'], required: true },
  title:      { type: String, required: true },
  body:       { type: String },
  isRead:     { type: Boolean, default: false },
  link:       { type: String },
}, { timestamps: true });

const Message      = mongoose.models.Message      || mongoose.model('Message', messageSchema);
const Notification = mongoose.models.Notification || mongoose.model('Notification', notificationSchema);

router.use(protect);

// ── GET /api/messages/conversations — list all conversations ──────
router.get('/conversations', async (req, res) => {
  try {
    const userId = req.user._id;
    // Get unique conversation partners
    const messages = await Message.find({
      $or: [{ sender: userId }, { recipient: userId }]
    })
    .populate('sender',    'firstName lastName role registrationNumber profileImage')
    .populate('recipient', 'firstName lastName role registrationNumber profileImage')
    .sort({ createdAt: -1 });

    // Group by conversation partner
    const conversations = {};
    messages.forEach(msg => {
      const partnerId = msg.sender._id.toString() === userId.toString()
        ? msg.recipient._id.toString()
        : msg.sender._id.toString();
      if (!conversations[partnerId]) {
        const partner = msg.sender._id.toString() === userId.toString() ? msg.recipient : msg.sender;
        conversations[partnerId] = {
          partner,
          lastMessage: msg,
          unreadCount: 0,
        };
      }
      if (msg.recipient._id.toString() === userId.toString() && !msg.isRead) {
        conversations[partnerId].unreadCount++;
      }
    });

    res.json({ success: true, data: Object.values(conversations) });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// ── GET /api/messages/:partnerId — get conversation thread ────────
router.get('/:partnerId', async (req, res) => {
  try {
    const userId    = req.user._id;
    const partnerId = req.params.partnerId;

    const messages = await Message.find({
      $or: [
        { sender: userId,    recipient: partnerId },
        { sender: partnerId, recipient: userId    },
      ]
    })
    .populate('sender',    'firstName lastName role profileImage')
    .populate('recipient', 'firstName lastName role profileImage')
    .sort({ createdAt: 1 });

    // Mark messages as read
    await Message.updateMany(
      { sender: partnerId, recipient: userId, isRead: false },
      { isRead: true, readAt: new Date() }
    );

    res.json({ success: true, data: messages });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// ── POST /api/messages — send a message ──────────────────────────
router.post('/', async (req, res) => {
  try {
    const { recipientId, content } = req.body;
    if (!recipientId || !content?.trim()) {
      return res.status(400).json({ success: false, message: 'Recipient and message content are required.' });
    }
    const message = await Message.create({
      sender:    req.user._id,
      recipient: recipientId,
      content:   content.trim(),
    });
    await message.populate('sender', 'firstName lastName role profileImage');
    await message.populate('recipient', 'firstName lastName role profileImage');

    // Create notification for recipient
    await Notification.create({
      recipient: recipientId,
      type:      'message',
      title:     `New message from ${req.user.firstName}`,
      body:      content.substring(0, 100),
    });

    res.status(201).json({ success: true, data: message });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// ── GET /api/messages/notifications/me — get my notifications ────
router.get('/notifications/me', async (req, res) => {
  try {
    const notifs = await Notification.find({ recipient: req.user._id }).sort({ createdAt: -1 }).limit(50);
    const unread = notifs.filter(n => !n.isRead).length;
    res.json({ success: true, data: notifs, unreadCount: unread });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// ── PUT /api/messages/notifications/read-all — mark all read ─────
router.put('/notifications/read-all', async (req, res) => {
  try {
    await Notification.updateMany({ recipient: req.user._id, isRead: false }, { isRead: true });
    res.json({ success: true, message: 'All notifications marked as read.' });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// ── POST /api/messages/broadcast — admin sends to all ────────────
router.post('/broadcast', async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ success: false, message: 'Admin only.' });
    }
    const { title, body: msgBody, type = 'announcement', recipientIds } = req.body;
    const User = require('../models/User');
    const targets = recipientIds?.length
      ? recipientIds
      : (await User.find({ role: 'student', isActive: true }).select('_id')).map(u => u._id);

    const notifications = targets.map(id => ({
      recipient: id, type, title, body: msgBody,
    }));
    await Notification.insertMany(notifications);

    res.json({ success: true, message: `Announcement sent to ${targets.length} students.` });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

module.exports = router;
