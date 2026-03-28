/**
 * CodeBreakers — Frontend API Helper
 * Centralised fetch wrapper with JWT auth headers
 */

const API_BASE = '/api';

// ── Core fetch wrapper ────────────────────────────────────────────
async function apiFetch(endpoint, options = {}) {
  const token = localStorage.getItem('cb_token');

  // Don't set Content-Type for FormData (browser sets it with boundary)
  const isFormData = options.body instanceof FormData;

  const headers = {
    ...(isFormData ? {} : { 'Content-Type': 'application/json' }),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...options.headers,
  };

  const config = {
    ...options,
    headers,
  };

  try {
    const res  = await fetch(API_BASE + endpoint, config);
    const data = await res.json();

    // Auto-logout on 401
    if (res.status === 401) {
      localStorage.removeItem('cb_token');
      localStorage.removeItem('cb_refresh_token');
      localStorage.removeItem('cb_student');
      localStorage.removeItem('cb_admin');
      // Redirect to appropriate login page
      const path = window.location.pathname;
      if (path.includes('/admin/')) {
        window.location.href = '/pages/admin/login.html';
      } else {
        window.location.href = '/pages/student/login.html';
      }
      return;
    }

    return { ok: res.ok, status: res.status, data };
  } catch (err) {
    console.error('API Error:', err);
    return { ok: false, status: 0, data: { message: 'Network error. Please check your connection.' } };
  }
}

// ── Convenience methods ───────────────────────────────────────────
window.API = {
  get:    (url)          => apiFetch(url, { method: 'GET' }),
  post:   (url, body)    => apiFetch(url, { method: 'POST',   body: JSON.stringify(body) }),
  put:    (url, body)    => apiFetch(url, { method: 'PUT',    body: JSON.stringify(body) }),
  delete: (url)          => apiFetch(url, { method: 'DELETE' }),
  patch:  (url, body)    => apiFetch(url, { method: 'PATCH',  body: JSON.stringify(body) }),

  // ── Auth ────────────────────────────────────────────────────────
  auth: {
    register:       (data) => apiFetch('/auth/register',       { method: 'POST', body: JSON.stringify(data) }),
    login:          (data) => apiFetch('/auth/login',          { method: 'POST', body: JSON.stringify(data) }),
    me:             ()     => apiFetch('/auth/me',             { method: 'GET' }),
    logout:         ()     => apiFetch('/auth/logout',         { method: 'POST' }),
    forgotPassword: (data) => apiFetch('/auth/forgot-password',{ method: 'POST', body: JSON.stringify(data) }),
    verifyOtp:      (data) => apiFetch('/auth/verify-otp',     { method: 'POST', body: JSON.stringify(data) }),
    resetPassword:  (data) => apiFetch('/auth/reset-password', { method: 'POST', body: JSON.stringify(data) }),
    refreshToken:   (data) => apiFetch('/auth/refresh-token',  { method: 'POST', body: JSON.stringify(data) }),
  },

  // ── Students ────────────────────────────────────────────────────
  students: {
    list:           (params = '') => apiFetch(`/students?${params}`,       { method: 'GET' }),
    get:            (id)          => apiFetch(`/students/${id}`,           { method: 'GET' }),
    update:         (id, data)    => apiFetch(`/students/${id}`,           { method: 'PUT',    body: JSON.stringify(data) }),
    delete:         (id)          => apiFetch(`/students/${id}`,           { method: 'DELETE' }),
    getProgress:    (id)          => apiFetch(`/students/${id}/progress`,  { method: 'GET' }),
    updateProgress: (id, data)    => apiFetch(`/students/${id}/progress`,  { method: 'POST',   body: JSON.stringify(data) }),
  },

  // ── Courses ─────────────────────────────────────────────────────
  courses: {
    list:   (params = '') => apiFetch(`/courses?${params}`, { method: 'GET' }),
    get:    (id)          => apiFetch(`/courses/${id}`,     { method: 'GET' }),
    create: (data)        => apiFetch('/courses',           { method: 'POST',   body: JSON.stringify(data) }),
    update: (id, data)    => apiFetch(`/courses/${id}`,     { method: 'PUT',    body: JSON.stringify(data) }),
    delete: (id)          => apiFetch(`/courses/${id}`,     { method: 'DELETE' }),
  },

  // ── Lessons ─────────────────────────────────────────────────────
  lessons: {
    list:     (courseId)  => apiFetch(`/lessons?course=${courseId}`, { method: 'GET' }),
    get:      (id)        => apiFetch(`/lessons/${id}`,              { method: 'GET' }),
    create:   (data)      => apiFetch('/lessons',                    { method: 'POST', body: JSON.stringify(data) }),
    update:   (id, data)  => apiFetch(`/lessons/${id}`,             { method: 'PUT',  body: JSON.stringify(data) }),
    delete:   (id)        => apiFetch(`/lessons/${id}`,             { method: 'DELETE' }),
    complete: (id)        => apiFetch(`/lessons/${id}/complete`,     { method: 'POST' }),
  },

  // ── Exams ───────────────────────────────────────────────────────
  exams: {
    list:    (courseId)  => apiFetch(`/exams?course=${courseId}`, { method: 'GET' }),
    get:     (id)        => apiFetch(`/exams/${id}`,              { method: 'GET' }),
    create:  (data)      => apiFetch('/exams',                    { method: 'POST', body: JSON.stringify(data) }),
    update:  (id, data)  => apiFetch(`/exams/${id}`,             { method: 'PUT',  body: JSON.stringify(data) }),
    delete:  (id)        => apiFetch(`/exams/${id}`,             { method: 'DELETE' }),
    submit:  (id, data)  => apiFetch(`/exams/${id}/submit`,      { method: 'POST', body: JSON.stringify(data) }),
    results: (id)        => apiFetch(`/exams/${id}/results`,     { method: 'GET' }),
  },

  // ── Grades ──────────────────────────────────────────────────────
  grades: {
    list:   (params = '')  => apiFetch(`/grades?${params}`,            { method: 'GET' }),
    report: (studentId)    => apiFetch(`/grades/report/${studentId}`,  { method: 'GET' }),
    create: (data)         => apiFetch('/grades',                      { method: 'POST', body: JSON.stringify(data) }),
    update: (id, data)     => apiFetch(`/grades/${id}`,               { method: 'PUT',  body: JSON.stringify(data) }),
    delete: (id)           => apiFetch(`/grades/${id}`,               { method: 'DELETE' }),
  },

  // ── Messages ─────────────────────────────────────────────────────
  messages: {
    conversations:  ()            => apiFetch('/messages/conversations',    { method: 'GET' }),
    thread:         (partnerId)   => apiFetch(`/messages/${partnerId}`,     { method: 'GET' }),
    send:           (data)        => apiFetch('/messages',                  { method: 'POST', body: JSON.stringify(data) }),
    notifications:  ()            => apiFetch('/messages/notifications/me', { method: 'GET' }),
    markAllRead:    ()            => apiFetch('/messages/notifications/read-all', { method: 'PUT' }),
    broadcast:      (data)        => apiFetch('/messages/broadcast',        { method: 'POST', body: JSON.stringify(data) }),
  },

  // ── Attendance ───────────────────────────────────────────────────
  attendance: {
    recordLesson:   (data)        => apiFetch('/attendance/lesson',          { method: 'POST', body: JSON.stringify(data) }),
    checkIn:        ()            => apiFetch('/attendance/class',           { method: 'POST' }),
    me:             (params = '') => apiFetch(`/attendance/me?${params}`,    { method: 'GET' }),
    student:        (id)          => apiFetch(`/attendance/student/${id}`,   { method: 'GET' }),
    today:          ()            => apiFetch('/attendance/today',           { method: 'GET' }),
    report:         (params = '') => apiFetch(`/attendance/report?${params}`,{ method: 'GET' }),
  },

  // ── Posts / Announcements ────────────────────────────────────────
  posts: {
    list:        (params = '') => apiFetch(`/posts?${params}`,        { method: 'GET' }),
    get:         (id)          => apiFetch(`/posts/${id}`,            { method: 'GET' }),
    create:      (data)        => apiFetch('/posts',                  { method: 'POST', body: JSON.stringify(data) }),
    update:      (id, data)    => apiFetch(`/posts/${id}`,            { method: 'PUT',  body: JSON.stringify(data) }),
    delete:      (id)          => apiFetch(`/posts/${id}`,            { method: 'DELETE' }),
    comment:     (id, data)    => apiFetch(`/posts/${id}/comment`,    { method: 'POST', body: JSON.stringify(data) }),
    deleteComment:(id, cid)    => apiFetch(`/posts/${id}/comment/${cid}`, { method: 'DELETE' }),
    like:        (id)          => apiFetch(`/posts/${id}/like`,       { method: 'POST' }),
    markRead:    (id)          => apiFetch(`/posts/${id}/read`,       { method: 'POST' }),
    unreadCount: ()            => apiFetch('/posts/unread/count',     { method: 'GET' }),
  },

  // ── Leaderboard ──────────────────────────────────────────────────
  leaderboard: {
    overall: (params = '') => apiFetch(`/leaderboard?${params}`,              { method: 'GET' }),
    course:  (courseId)    => apiFetch(`/leaderboard/course/${courseId}`,     { method: 'GET' }),
  },

  // ── Upload ───────────────────────────────────────────────────────
  upload: {
    video:      (formData) => apiFetch('/upload/video',      { method: 'POST', body: formData, headers: {} }),
    materials:  (formData) => apiFetch('/upload/materials',  { method: 'POST', body: formData, headers: {} }),
    avatar:     (formData) => apiFetch('/upload/avatar',     { method: 'POST', body: formData, headers: {} }),
    submission: (formData) => apiFetch('/upload/submission', { method: 'POST', body: formData, headers: {} }),
    delete:     (publicId, resourceType = 'image') =>
                             apiFetch(`/upload/${publicId}?resourceType=${resourceType}`, { method: 'DELETE' }),
  },
};

// ── Token auto-refresh ────────────────────────────────────────────
// Refresh access token 1 minute before expiry (every 6 minutes)
setInterval(async () => {
  const token = localStorage.getItem('cb_token');
  if (!token) return;
  try {
    const payload = JSON.parse(atob(token.split('.')[1]));
    const expiry  = payload.exp * 1000;
    const now     = Date.now();
    // If token expires within 2 minutes, refresh it
    if (expiry - now < 2 * 60 * 1000) {
      const refreshToken = localStorage.getItem('cb_refresh_token');
      if (!refreshToken) return;
      const res = await fetch('/api/auth/refresh-token', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ refreshToken })
      });
      const data = await res.json();
      if (res.ok && data.token) {
        localStorage.setItem('cb_token', data.token);
        localStorage.setItem('cb_refresh_token', data.refreshToken);
      }
    }
  } catch { /* ignore */ }
}, 6 * 60 * 1000);
