/* CodeBreakers - Shared App Utilities */

// Toast notifications
window.showToast = function (message, type = 'info', duration = 3500) {
  let container = document.getElementById('toast-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toast-container';
    document.body.appendChild(container);
  }
  const icons = { success: 'fa-check-circle', danger: 'fa-times-circle', info: 'fa-info-circle', warning: 'fa-exclamation-triangle' };
  const colors = { success: '#00ff88', danger: '#ff006e', info: '#00f5ff', warning: '#ffbe0b' };
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.innerHTML = `<i class="fas ${icons[type]||icons.info}" style="color:${colors[type]}"></i><p>${message}</p>`;
  container.appendChild(toast);
  setTimeout(() => { toast.style.opacity = '0'; toast.style.transform = 'translateX(100%)'; toast.style.transition = 'all 0.3s'; setTimeout(() => toast.remove(), 300); }, duration);
};

// Modal helpers
window.openModal = function (id) {
  const m = document.getElementById(id);
  if (m) m.classList.add('active');
};
window.closeModal = function (id) {
  const m = document.getElementById(id);
  if (m) m.classList.remove('active');
};
document.addEventListener('click', function (e) {
  if (e.target.classList.contains('modal-overlay')) e.target.classList.remove('active');
  if (e.target.classList.contains('modal-close')) {
    const overlay = e.target.closest('.modal-overlay');
    if (overlay) overlay.classList.remove('active');
  }
});

// Tabs
window.initTabs = function () {
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', function () {
      const container = this.closest('.tabs').parentElement;
      container.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      container.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));
      this.classList.add('active');
      const pane = container.querySelector(`#${this.dataset.tab}`);
      if (pane) pane.classList.add('active');
    });
  });
};

// Sidebar toggle (mobile)
window.initSidebar = function () {
  const toggle = document.getElementById('sidebarToggle');
  const sidebar = document.getElementById('sidebar');
  if (toggle && sidebar) {
    toggle.addEventListener('click', () => sidebar.classList.toggle('open'));
  }
};

// Navbar scroll
window.initNavbar = function () {
  const navbar = document.getElementById('navbar');
  if (navbar) window.addEventListener('scroll', () => navbar.classList.toggle('scrolled', window.scrollY > 50));
};

// Simulate Auth (localStorage-based demo)
window.Auth = {
  loginStudent(data) { localStorage.setItem('cb_student', JSON.stringify(data)); },
  loginAdmin(data)   { localStorage.setItem('cb_admin', JSON.stringify(data)); },
  getStudent()       { try { return JSON.parse(localStorage.getItem('cb_student')); } catch { return null; } },
  getAdmin()         { try { return JSON.parse(localStorage.getItem('cb_admin')); } catch { return null; } },
  logoutStudent()    { localStorage.removeItem('cb_student'); window.location.href = '/pages/login.html'; },
  logoutAdmin()      { localStorage.removeItem('cb_admin'); window.location.href = '/pages/login.html'; },
  requireStudent()   { if (!this.getStudent()) window.location.href = '/pages/login.html'; },
  requireAdmin()     { if (!this.getAdmin()) window.location.href = '/pages/login.html'; },
};

// Generate unique student ID
window.generateStudentID = function () {
  const year = new Date().getFullYear();
  const rand = Math.floor(10000 + Math.random() * 90000);
  return `CB-${year}-${rand}`;
};

// Format date
window.formatDate = function (dateStr) {
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
};

// Chart bar renderer (canvas-free simple bars)
window.renderBarChart = function (canvasId, labels, data, color = '#00f5ff') {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const W = canvas.width = canvas.offsetWidth;
  const H = canvas.height = canvas.offsetHeight || 220;
  const max = Math.max(...data, 1);
  const barW = (W - 40) / data.length - 10;
  ctx.clearRect(0, 0, W, H);
  data.forEach((val, i) => {
    const x = 20 + i * ((W - 40) / data.length);
    const barH = ((val / max) * (H - 60));
    const y = H - barH - 30;
    const grad = ctx.createLinearGradient(0, y, 0, H - 30);
    grad.addColorStop(0, color);
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.roundRect ? ctx.roundRect(x, y, barW, barH, 4) : ctx.rect(x, y, barW, barH);
    ctx.fill();
    ctx.fillStyle = '#8892a4';
    ctx.font = '11px Rajdhani, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(labels[i], x + barW / 2, H - 8);
    ctx.fillStyle = color;
    ctx.fillText(val, x + barW / 2, y - 6);
  });
};

document.addEventListener('DOMContentLoaded', function () {
  initTabs();
  initSidebar();
  initNavbar();
});
