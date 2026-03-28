/* CodeBreakers - Home Page JS */
document.addEventListener('DOMContentLoaded', function () {

  // Navbar scroll effect
  const navbar = document.getElementById('navbar');
  window.addEventListener('scroll', () => {
    navbar && navbar.classList.toggle('scrolled', window.scrollY > 50);
  });

  // Hamburger menu
  const hamburger = document.getElementById('hamburger');
  const navLinks = document.getElementById('navLinks');
  if (hamburger && navLinks) {
    hamburger.addEventListener('click', () => {
      navLinks.classList.toggle('open');
    });
  }

  // Animated counters
  const counters = document.querySelectorAll('.stat-num');
  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        const target = parseInt(entry.target.dataset.target);
        let current = 0;
        const step = Math.ceil(target / 60);
        const timer = setInterval(() => {
          current += step;
          if (current >= target) { current = target; clearInterval(timer); }
          entry.target.textContent = current;
        }, 25);
        observer.unobserve(entry.target);
      }
    });
  }, { threshold: 0.5 });
  counters.forEach(c => observer.observe(c));

  // Terminal typing animation
  const terminalBody = document.getElementById('terminalBody');
  const lines = [
    { type: 'cmd', text: 'init --platform codebreakers' },
    { type: 'output', text: '✓ Platform initialized successfully' },
    { type: 'cmd', text: 'load --courses frontend backend security' },
    { type: 'output', text: '✓ 40+ courses loaded | 500+ students enrolled' },
    { type: 'cmd', text: 'start --sandbox --live-preview' },
    { type: 'output', text: '✓ Coding console ready (HTML/CSS/JS/Node/Python)' },
    { type: 'cmd', text: 'run --security-scan' },
    { type: 'output', text: '✓ Security training modules activated' },
    { type: 'comment', text: '# Ready to break the code? Join us!' },
    { type: 'cmd', text: '_', cursor: true },
  ];

  let lineIdx = 0;
  // Clear initial line
  if (terminalBody) terminalBody.innerHTML = '';

  function addLine() {
    if (lineIdx >= lines.length) return;
    const line = lines[lineIdx++];
    const div = document.createElement('div');

    if (line.type === 'cmd') {
      div.className = 't-line';
      const prompt = document.createElement('span');
      prompt.className = 't-prompt';
      prompt.textContent = '$';
      const cmd = document.createElement('span');
      cmd.className = 't-cmd';
      if (line.cursor) {
        cmd.innerHTML = '<span class="cursor"></span>';
      } else {
        cmd.textContent = line.text;
      }
      div.appendChild(prompt);
      div.appendChild(cmd);
    } else if (line.type === 'output') {
      div.className = 't-output';
      div.textContent = line.text;
    } else if (line.type === 'comment') {
      div.className = 't-comment';
      div.textContent = line.text;
    }

    terminalBody.appendChild(div);
    terminalBody.scrollTop = terminalBody.scrollHeight;
    setTimeout(addLine, line.type === 'output' ? 300 : 500);
  }

  setTimeout(addLine, 800);

  // Scroll reveal
  const revealEls = document.querySelectorAll('.feature-card, .course-card, .founder-card');
  const revealObs = new IntersectionObserver((entries) => {
    entries.forEach(e => {
      if (e.isIntersecting) {
        e.target.style.opacity = '1';
        e.target.style.transform = 'translateY(0)';
      }
    });
  }, { threshold: 0.1 });
  revealEls.forEach(el => {
    el.style.opacity = '0';
    el.style.transform = 'translateY(30px)';
    el.style.transition = 'opacity 0.6s ease, transform 0.6s ease';
    revealObs.observe(el);
  });
});
