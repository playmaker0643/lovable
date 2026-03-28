/**
 * CodeBreakers Backend — Main Server
 * Node.js + Express + MongoDB + Socket.io
 */
require('dotenv').config();
const express    = require('express');
const http       = require('http');
const { Server } = require('socket.io');
const cors       = require('cors');
const helmet     = require('helmet');
const morgan     = require('morgan');
const path       = require('path');
const jwt        = require('jsonwebtoken');
const connectDB  = require('./config/db');

const app    = express();
const server = http.createServer(app);

// ── Socket.io setup ───────────────────────────────────────────────
const io = new Server(server, {
  cors: {
    origin:      process.env.FRONTEND_URL || '*',
    methods:     ['GET', 'POST'],
    credentials: true,
  },
  pingTimeout:  60000,
  pingInterval: 25000,
});

// Make io accessible in routes
app.set('io', io);

// ── Connect to MongoDB ────────────────────────────────────────────
connectDB();

// ── Security Middleware ───────────────────────────────────────────
app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors({
  origin:      process.env.FRONTEND_URL || '*',
  credentials: true,
}));

// ── Body Parsing ──────────────────────────────────────────────────
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// ── Logging ───────────────────────────────────────────────────────
if (process.env.NODE_ENV === 'development') app.use(morgan('dev'));

// ── Serve Frontend Static Files ───────────────────────────────────
app.use(express.static(path.join(__dirname, '..')));

// ── API Routes ────────────────────────────────────────────────────
app.use('/api/auth',       require('./routes/auth'));
app.use('/api/students',   require('./routes/students'));
app.use('/api/courses',    require('./routes/courses'));
app.use('/api/lessons',    require('./routes/lessons'));
app.use('/api/exams',      require('./routes/exams'));
app.use('/api/grades',     require('./routes/grades'));
app.use('/api/messages',   require('./routes/messages'));
app.use('/api/upload',      require('./routes/upload'));
app.use('/api/attendance',  require('./routes/attendance'));
app.use('/api/leaderboard', require('./routes/leaderboard'));
app.use('/api/posts',      require('./routes/posts'));

// ── Serve index.html for all non-API routes (SPA fallback) ───────
app.get(/^(?!\/api).*/, (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'index.html'));
});

// ── Global Error Handler ──────────────────────────────────────────
app.use((err, req, res, next) => {
  console.error('Server Error:', err.stack);
  res.status(err.status || 500).json({
    success: false,
    message: process.env.NODE_ENV === 'development' ? err.message : 'Internal server error',
  });
});

// ══════════════════════════════════════════════════════════════════
//  SOCKET.IO — Real-time Chat & Notifications
// ══════════════════════════════════════════════════════════════════

// Track online users: userId → socketId
const onlineUsers = new Map();

// ── JWT auth middleware for Socket.io ─────────────────────────────
io.use((socket, next) => {
  const token = socket.handshake.auth?.token || socket.handshake.query?.token;
  if (!token) return next(new Error('Authentication required'));
  try {
    const decoded  = jwt.verify(token, process.env.JWT_SECRET);
    socket.userId  = decoded.id;
    socket.role    = decoded.role;
    next();
  } catch {
    next(new Error('Invalid token'));
  }
});

io.on('connection', (socket) => {
  const userId = socket.userId;
  console.log(`🔌 Socket connected: user=${userId} role=${socket.role}`);

  // ── Mark user online ────────────────────────────────────────────
  onlineUsers.set(userId, socket.id);
  socket.join(`user:${userId}`);                // personal room
  if (socket.role === 'admin') socket.join('admins');

  // Broadcast online status
  io.emit('user:online', { userId, online: true });

  // ── Send message ────────────────────────────────────────────────
  socket.on('message:send', async (data) => {
    try {
      const { recipientId, content } = data;
      if (!recipientId || !content?.trim()) return;

      const mongoose = require('mongoose');
      const Message  = mongoose.model('Message');

      const message = await Message.create({
        sender:    userId,
        recipient: recipientId,
        content:   content.trim(),
      });

      await message.populate('sender',    'firstName lastName role profileImage');
      await message.populate('recipient', 'firstName lastName role profileImage');

      // Deliver to recipient's personal room (works even if they have multiple tabs)
      io.to(`user:${recipientId}`).emit('message:receive', message);

      // Confirm delivery to sender
      socket.emit('message:sent', message);

      // Create DB notification for recipient
      const Notification = mongoose.model('Notification');
      await Notification.create({
        recipient: recipientId,
        type:      'message',
        title:     `New message from ${message.sender.firstName}`,
        body:      content.substring(0, 100),
      });

      // Push real-time notification
      io.to(`user:${recipientId}`).emit('notification:new', {
        type:  'message',
        title: `New message from ${message.sender.firstName}`,
        body:  content.substring(0, 100),
      });
    } catch (err) {
      socket.emit('error', { message: 'Failed to send message.' });
    }
  });

  // ── Typing indicator ────────────────────────────────────────────
  socket.on('typing:start', ({ recipientId }) => {
    io.to(`user:${recipientId}`).emit('typing:start', { senderId: userId });
  });
  socket.on('typing:stop', ({ recipientId }) => {
    io.to(`user:${recipientId}`).emit('typing:stop', { senderId: userId });
  });

  // ── Mark messages as read ───────────────────────────────────────
  socket.on('messages:read', async ({ senderId }) => {
    try {
      const mongoose = require('mongoose');
      const Message  = mongoose.model('Message');
      await Message.updateMany(
        { sender: senderId, recipient: userId, isRead: false },
        { isRead: true, readAt: new Date() }
      );
      io.to(`user:${senderId}`).emit('messages:read', { by: userId });
    } catch {}
  });

  // ── Admin broadcast notification ────────────────────────────────
  socket.on('admin:broadcast', async (data) => {
    if (socket.role !== 'admin') return;
    io.emit('notification:new', {
      type:  data.type || 'announcement',
      title: data.title,
      body:  data.body,
    });
  });

  // ── Lesson progress (video watch events) ───────────────────────
  socket.on('lesson:progress', async (data) => {
    try {
      const { lessonId, progress, duration } = data;
      // Emit to admins for live monitoring
      io.to('admins').emit('student:lesson:progress', {
        userId, lessonId, progress, duration, timestamp: new Date(),
      });
    } catch {}
  });

  // ── Disconnect ──────────────────────────────────────────────────
  socket.on('disconnect', () => {
    onlineUsers.delete(userId);
    io.emit('user:online', { userId, online: false });
    console.log(`🔌 Socket disconnected: user=${userId}`);
  });
});

// Export io for use in routes
module.exports.io = io;
module.exports.onlineUsers = onlineUsers;

// ── Start Server ──────────────────────────────────────────────────
const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`\n🚀 CodeBreakers Server running on port ${PORT}`);
  console.log(`📡 Environment: ${process.env.NODE_ENV}`);
  console.log(`🌐 URL: http://localhost:${PORT}`);
  console.log(`🔌 Socket.io: enabled\n`);
});

module.exports.app = app;
module.exports.server = server;
