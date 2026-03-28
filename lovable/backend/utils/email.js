/**
 * Email Utility — CodeBreakers
 * Sends transactional emails via Nodemailer
 */
const nodemailer = require('nodemailer');

// ── Create transporter ────────────────────────────────────────────
const createTransporter = () => nodemailer.createTransport({
  host:   process.env.EMAIL_HOST,
  port:   parseInt(process.env.EMAIL_PORT) || 587,
  secure: process.env.EMAIL_SECURE === 'true',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

// ── Base email sender ─────────────────────────────────────────────
const sendEmail = async ({ to, subject, html }) => {
  const transporter = createTransporter();
  const mailOptions = {
    from:    process.env.EMAIL_FROM || 'CodeBreakers <noreply@codebreakers.academy>',
    to,
    subject,
    html,
  };
  return transporter.sendMail(mailOptions);
};

// ── Email Templates ───────────────────────────────────────────────
const baseTemplate = (content) => `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8"/>
  <style>
    body { font-family: 'Segoe UI', Arial, sans-serif; background:#060a10; margin:0; padding:0; }
    .wrapper { max-width:580px; margin:40px auto; background:#0d1117; border:1px solid rgba(0,245,255,0.15); border-radius:16px; overflow:hidden; }
    .header { background:linear-gradient(135deg,rgba(0,245,255,0.1),rgba(123,47,247,0.12)); padding:32px; text-align:center; border-bottom:1px solid rgba(0,245,255,0.15); }
    .header img { height:40px; }
    .header h1 { color:#e2e8f0; font-size:1.4rem; margin:12px 0 0; letter-spacing:2px; }
    .header span { color:#00f5ff; }
    .body { padding:36px 40px; }
    .body p { color:#8892a4; font-size:0.95rem; line-height:1.8; margin-bottom:16px; }
    .otp-box { background:rgba(0,245,255,0.06); border:1px solid rgba(0,245,255,0.25); border-radius:12px; padding:24px; text-align:center; margin:24px 0; }
    .otp-code { font-size:2.8rem; font-weight:900; color:#00f5ff; letter-spacing:12px; font-family:monospace; }
    .otp-timer { font-size:0.82rem; color:#8892a4; margin-top:8px; }
    .btn { display:inline-block; background:linear-gradient(135deg,#00f5ff,#7b2ff7); color:#000; padding:14px 32px; border-radius:10px; text-decoration:none; font-weight:700; font-size:0.95rem; letter-spacing:1px; margin:16px 0; }
    .divider { border:none; border-top:1px solid rgba(255,255,255,0.06); margin:24px 0; }
    .footer { background:rgba(0,0,0,0.3); padding:20px 40px; text-align:center; }
    .footer p { color:#4a5568; font-size:0.78rem; margin:0; }
    .reg-tag { display:inline-block; background:rgba(0,245,255,0.08); border:1px solid rgba(0,245,255,0.25); color:#00f5ff; padding:6px 16px; border-radius:50px; font-size:0.85rem; font-family:monospace; letter-spacing:2px; margin:8px 0; }
    .warning { background:rgba(255,0,110,0.08); border:1px solid rgba(255,0,110,0.25); border-radius:10px; padding:14px 18px; color:#ff006e; font-size:0.85rem; margin-top:16px; }
  </style>
</head>
<body>
  <div class="wrapper">
    <div class="header">
      <h1>Code<span>Breakers</span></h1>
    </div>
    <div class="body">${content}</div>
    <div class="footer">
      <p>&copy; ${new Date().getFullYear()} CodeBreakers. All rights reserved.</p>
      <p style="margin-top:4px;">This is an automated message — please do not reply.</p>
    </div>
  </div>
</body>
</html>`;

// ── Send OTP Email ────────────────────────────────────────────────
exports.sendOTPEmail = async (to, otp, firstName) => {
  const content = `
    <p>Hi <strong style="color:#e2e8f0;">${firstName}</strong>,</p>
    <p>We received a request to reset your CodeBreakers account password. Use the OTP code below to continue:</p>
    <div class="otp-box">
      <div class="otp-code">${otp}</div>
      <div class="otp-timer">⏱ This code expires in <strong>${process.env.OTP_EXPIRE_MINUTES || 5} minutes</strong></div>
    </div>
    <p>If you did not request a password reset, please ignore this email. Your password will remain unchanged.</p>
    <div class="warning">⚠️ Never share this code with anyone. CodeBreakers staff will never ask for your OTP.</div>`;
  return sendEmail({ to, subject: '🔐 Your CodeBreakers OTP Code', html: baseTemplate(content) });
};

// ── Send Welcome Email ─────────────────────────────────────────────
exports.sendWelcomeEmail = async (to, firstName, registrationNumber, course) => {
  const content = `
    <p>Hi <strong style="color:#e2e8f0;">${firstName}</strong>, welcome to <strong style="color:#00f5ff;">CodeBreakers</strong>! 🎉</p>
    <p>Your account has been created successfully. Here are your details:</p>
    <div class="otp-box" style="text-align:left;">
      <p style="margin:0 0 8px;"><strong style="color:#e2e8f0;">Course:</strong> <span style="color:#00f5ff;">${course}</span></p>
      <p style="margin:0 0 8px;"><strong style="color:#e2e8f0;">Email:</strong> ${to}</p>
      <p style="margin:0;"><strong style="color:#e2e8f0;">Registration Number:</strong></p>
      <div class="reg-tag" style="margin-top:8px;">${registrationNumber}</div>
    </div>
    <p>Save your registration number — you can use it to log in alongside your email.</p>
    <p>You can now access your courses, practice in the code sandbox, and track your progress.</p>
    <a href="${process.env.FRONTEND_URL}/pages/login.html" class="btn">🚀 Start Learning</a>
    <hr class="divider"/>
    <p style="font-size:0.82rem;">If you have any questions, message your instructor directly through the platform's messaging system.</p>`;
  return sendEmail({ to, subject: '🚀 Welcome to CodeBreakers!', html: baseTemplate(content) });
};

// ── Send Password Reset Success Email ─────────────────────────────
exports.sendPasswordResetSuccess = async (to, firstName) => {
  const content = `
    <p>Hi <strong style="color:#e2e8f0;">${firstName}</strong>,</p>
    <p>Your CodeBreakers password has been <strong style="color:#00ff88;">successfully reset</strong>.</p>
    <p>You can now log in with your new password.</p>
    <a href="${process.env.FRONTEND_URL}/pages/login.html" class="btn">🔐 Sign In</a>
    <div class="warning" style="margin-top:20px;">If you did not make this change, please contact us immediately at <a href="mailto:security@codebreakers.academy" style="color:#ff006e;">security@codebreakers.academy</a></div>`;
  return sendEmail({ to, subject: '✅ Password Reset Successful', html: baseTemplate(content) });
};
