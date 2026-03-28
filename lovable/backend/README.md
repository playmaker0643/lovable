# CodeBreakers Backend — Setup Guide

## Tech Stack
- **Runtime:** Node.js 18+
- **Framework:** Express.js
- **Database:** MongoDB (local or Atlas)
- **Auth:** JWT (access + refresh tokens)
- **Email:** Nodemailer (Gmail / SMTP)
- **Security:** bcryptjs, helmet, express-rate-limit, express-validator

---

## Quick Start

### 1. Install Dependencies
```bash
cd backend
npm install
```

### 2. Configure Environment Variables
```bash
cp .env.example .env
```
Then edit `.env` with your actual values:

| Variable | Description |
|---|---|
| `MONGO_URI` | MongoDB connection string |
| `JWT_SECRET` | Strong random string for JWT signing |
| `JWT_REFRESH_SECRET` | Separate secret for refresh tokens |
| `EMAIL_USER` | Gmail address for sending emails |
| `EMAIL_PASS` | Gmail App Password (not your account password) |
| `FRONTEND_URL` | Your deployment URL (e.g. https://codebreakers.academy) |
| `ADMIN_EMAIL_1` | `abdulhafiznasir0000@gmail.com` |
| `ADMIN_EMAIL_2` | `abdulnasirubrd2008@gmail.com` |
| `ADMIN_PASSWORD` | `playmaker0643` |

### 3. Gmail App Password Setup
1. Go to [Google Account](https://myaccount.google.com)
2. Security → 2-Step Verification → App Passwords
3. Generate a password for "Mail" → copy it to `EMAIL_PASS`

### 4. Run the Server

**Development (with auto-restart):**
```bash
npm run dev
```

**Production:**
```bash
npm start
```

The server runs on `http://localhost:5000` and serves both the API and the frontend static files.

---

## API Endpoints

### Auth Routes (`/api/auth`)

| Method | Endpoint | Description | Auth |
|---|---|---|---|
| POST | `/api/auth/register` | Register new student | Public |
| POST | `/api/auth/login` | Login (email/regNo + password) | Public |
| POST | `/api/auth/forgot-password` | Send OTP to email | Public |
| POST | `/api/auth/verify-otp` | Verify OTP, get reset token | Public |
| POST | `/api/auth/reset-password` | Reset password with token | Public |
| POST | `/api/auth/refresh-token` | Get new access token | Public |
| GET  | `/api/auth/me` | Get current user profile | 🔒 Token |
| POST | `/api/auth/logout` | Logout & invalidate refresh token | 🔒 Token |

### Student Routes (`/api/students`)
| Method | Endpoint | Auth |
|---|---|---|
| GET | `/api/students` | 🔒 Admin |
| GET | `/api/students/:id` | 🔒 Admin / Self |
| PUT | `/api/students/:id` | 🔒 Admin / Self |
| DELETE | `/api/students/:id` | 🔒 Admin |
| GET | `/api/students/:id/progress` | 🔒 Admin / Self |
| POST | `/api/students/:id/progress` | 🔒 Student (self) |

### Other Routes
- `/api/courses` — Course management
- `/api/lessons` — Lesson management (sequential lock enforced)
- `/api/exams` — Exams + submissions + auto-grading
- `/api/grades` — Grade management + reports
- `/api/messages` — Messaging + notifications + broadcast

---

## How Sequential Lesson Access Works

1. Each lesson has an `order` field (1, 2, 3…)
2. When a student requests `GET /api/lessons/:id`:
   - The server checks if the **previous lesson** (order - 1) is in their `completedLessons` array
   - If not → returns `403 Locked`
3. Student marks a lesson complete via `POST /api/lessons/:id/complete`
4. This unlocks the next lesson automatically

---

## How Student Registration Numbers Work

- Auto-generated in the `User` model `pre('save')` hook
- Format: `CB-{YEAR}-{5-digit random}`
- Example: `CB-2026-47382`
- Guaranteed unique (checks DB before saving)
- Sent to student in welcome email
- Can be used to login instead of email

---

## Authentication Flow

```
Register → JWT token + refresh token + welcome email
Login    → JWT token + refresh token
         → Token stored in localStorage as 'cb_token'
         → Sent as: Authorization: Bearer <token>

Forgot Password:
  1. POST /forgot-password  → OTP sent to email (6-digit, 5 min expiry)
  2. POST /verify-otp       → Verified → short-lived resetToken returned
  3. POST /reset-password   → New password set → confirmation email sent
```

---

## MongoDB Atlas Setup (Production)

1. Create free cluster at [mongodb.com/atlas](https://www.mongodb.com/atlas)
2. Create database user
3. Whitelist your server IP
4. Copy connection string to `MONGO_URI`:
   ```
   mongodb+srv://username:password@cluster.mongodb.net/codebreakers
   ```

---

## Deployment

### Render.com (Recommended — Free)
1. Push code to GitHub
2. New Web Service → connect repo
3. Build command: `cd backend && npm install`
4. Start command: `cd backend && npm start`
5. Add all `.env` variables in Environment settings

### Railway.app
1. Connect GitHub repo
2. Set root directory to `backend`
3. Auto-detects Node.js
4. Add environment variables

### VPS / Ubuntu Server
```bash
# Install Node.js
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# Install PM2
npm install -g pm2

# Start app
cd backend
npm install
pm2 start server.js --name codebreakers
pm2 save
pm2 startup
```
