/**
 * CodeBreakers — Socket.io Client Manager
 * Handles real-time chat, notifications, and live lesson tracking
 */

window.CBSocket = (function () {
  let socket = null;
  let reconnectAttempts = 0;
  const MAX_RECONNECT = 5;

  // ── Notification badge counter ────────────────────────────────
  let unreadCount = 0;

  // ── Connect to Socket.io server ───────────────────────────────
  function connect() {
    const token = localStorage.getItem('cb_token');
    if (!token) return null;
    if (socket && socket.connected) return socket;

    // Load Socket.io client from CDN if not already loaded
    if (typeof io === 'undefined') {
      const script = document.createElement('script');
      script.src = 'https://cdn.socket.io/4.7.5/socket.io.min.js';
      script.onload = () => _initSocket(token);
      document.head.appendChild(script);
      return null;
    }
    return _initSocket(token);
  }

  function _initSocket(token) {
    socket = io(window.location.origin, {
      auth:          { token },
      reconnection:  true,
      reconnectionAttempts: MAX_RECONNECT,
      reconnectionDelay: 1000,
      transports:    ['websocket', 'polling'],
    });

    // ── Connection events ───────────────────────────────────────
    socket.on('connect', () => {
      console.log('🔌 Socket.io connected:', socket.id);
      reconnectAttempts = 0;
      _updateConnectionStatus(true);
    });

    socket.on('disconnect', (reason) => {
      console.log('🔌 Socket.io disconnected:', reason);
      _updateConnectionStatus(false);
    });

    socket.on('connect_error', (err) => {
      console.warn('Socket connection error:', err.message);
      reconnectAttempts++;
      if (reconnectAttempts >= MAX_RECONNECT) {
        console.warn('Max reconnect attempts reached. Running in offline mode.');
      }
    });

    // ── Incoming message ─────────────────────────────────────────
    socket.on('message:receive', (message) => {
      // Dispatch custom event so any page can listen
      window.dispatchEvent(new CustomEvent('cb:message', { detail: message }));
      // Show toast notification if not on messages page
      if (!window.location.pathname.includes('messages')) {
        showToast(`💬 ${message.sender.firstName}: ${message.content.substring(0, 60)}`, 'info', 5000);
      }
    });

    socket.on('message:sent', (message) => {
      window.dispatchEvent(new CustomEvent('cb:message:sent', { detail: message }));
    });

    // ── Typing indicators ─────────────────────────────────────────
    socket.on('typing:start', ({ senderId }) => {
      window.dispatchEvent(new CustomEvent('cb:typing:start', { detail: { senderId } }));
    });
    socket.on('typing:stop', ({ senderId }) => {
      window.dispatchEvent(new CustomEvent('cb:typing:stop', { detail: { senderId } }));
    });

    // ── Read receipts ─────────────────────────────────────────────
    socket.on('messages:read', ({ by }) => {
      window.dispatchEvent(new CustomEvent('cb:messages:read', { detail: { by } }));
    });

    // ── Real-time notifications ───────────────────────────────────
    socket.on('notification:new', (notif) => {
      unreadCount++;
      _updateNotifBadge();
      window.dispatchEvent(new CustomEvent('cb:notification', { detail: notif }));
      // Show toast
      const icons = { message: '💬', lesson: '📹', exam: '📝', assignment: '📋', announcement: '📢', grade: '⭐' };
      showToast(`${icons[notif.type] || '🔔'} ${notif.title}`, 'info', 5000);
    });

    // ── Online status ─────────────────────────────────────────────
    socket.on('user:online', ({ userId, online }) => {
      window.dispatchEvent(new CustomEvent('cb:user:online', { detail: { userId, online } }));
    });

    // ── Attendance updates (for admin live monitoring) ────────────
    socket.on('attendance:update', (data) => {
      window.dispatchEvent(new CustomEvent('cb:attendance', { detail: data }));
    });

    socket.on('attendance:checkin', (data) => {
      window.dispatchEvent(new CustomEvent('cb:checkin', { detail: data }));
    });

    return socket;
  }

  // ── Update connection status indicator ────────────────────────
  function _updateConnectionStatus(connected) {
    const indicators = document.querySelectorAll('.socket-status');
    indicators.forEach(el => {
      el.style.background = connected ? 'var(--success)' : 'var(--danger)';
      el.title = connected ? 'Connected (real-time)' : 'Disconnected';
    });
  }

  // ── Update notification badge ─────────────────────────────────
  function _updateNotifBadge() {
    const badges = document.querySelectorAll('.notif-count');
    badges.forEach(b => {
      b.textContent = unreadCount > 9 ? '9+' : unreadCount;
      b.style.display = unreadCount > 0 ? 'flex' : 'none';
    });
    // Update dot visibility
    const dots = document.querySelectorAll('.notif-dot');
    dots.forEach(d => d.style.display = unreadCount > 0 ? 'block' : 'none');
  }

  // ── Public API ────────────────────────────────────────────────
  return {
    connect,

    // Send a chat message
    sendMessage(recipientId, content) {
      if (!socket?.connected) return false;
      socket.emit('message:send', { recipientId, content });
      return true;
    },

    // Typing indicators
    startTyping(recipientId) { socket?.emit('typing:start', { recipientId }); },
    stopTyping(recipientId)  { socket?.emit('typing:stop',  { recipientId }); },

    // Mark messages as read
    markRead(senderId) { socket?.emit('messages:read', { senderId }); },

    // Broadcast (admin only)
    broadcast(data) { socket?.emit('admin:broadcast', data); },

    // Report lesson progress (auto-attendance)
    reportLessonProgress(lessonId, progress, duration) {
      socket?.emit('lesson:progress', { lessonId, progress, duration });
    },

    // Disconnect
    disconnect() { socket?.disconnect(); socket = null; },

    // Get socket instance
    get instance() { return socket; },
    get connected() { return socket?.connected || false; },

    // Clear notification count
    clearNotifCount() {
      unreadCount = 0;
      _updateNotifBadge();
    },
  };
})();

// ── Auto-connect on page load if user is logged in ───────────────
document.addEventListener('DOMContentLoaded', () => {
  const token = localStorage.getItem('cb_token');
  if (token) {
    // Slight delay to ensure page is fully loaded
    setTimeout(() => CBSocket.connect(), 500);
  }
});
