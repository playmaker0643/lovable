/**
 * User Model — CodeBreakers
 * Handles both students and admins
 */
const mongoose = require('mongoose');
const bcrypt   = require('bcryptjs');

const userSchema = new mongoose.Schema({
  // ── Identity ─────────────────────────────────────────────────
  firstName:  { type: String, required: true, trim: true },
  lastName:   { type: String, required: true, trim: true },
  email:      { type: String, required: true, unique: true, lowercase: true, trim: true },
  password:   { type: String, required: true, minlength: 8, select: false },

  // ── Role ─────────────────────────────────────────────────────
  role: { type: String, enum: ['student', 'admin'], default: 'student' },

  // ── Student-specific ─────────────────────────────────────────
  registrationNumber: { type: String, unique: true, sparse: true },
  phone:    { type: String, trim: true },
  dob:      { type: Date },
  course:   { type: String },

  // ── Progress ─────────────────────────────────────────────────
  completedLessons: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Lesson' }],
  enrolledCourses:  [{ type: mongoose.Schema.Types.ObjectId, ref: 'Course' }],

  // ── Account State ─────────────────────────────────────────────
  isActive:     { type: Boolean, default: true },
  isVerified:   { type: Boolean, default: false },
  profileImage: { type: String, default: '' },

  // ── OTP / Password Reset ──────────────────────────────────────
  otp:              { type: String, select: false },
  otpExpires:       { type: Date,   select: false },
  resetToken:       { type: String, select: false },
  resetTokenExpires:{ type: Date,   select: false },

  // ── Tokens ────────────────────────────────────────────────────
  refreshToken: { type: String, select: false },

  // ── Timestamps ────────────────────────────────────────────────
  lastLogin: { type: Date },
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// ── Virtual: full name ────────────────────────────────────────────
userSchema.virtual('fullName').get(function () {
  return `${this.firstName} ${this.lastName}`;
});

// ── Pre-save: hash password ───────────────────────────────────────
userSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next();
  const salt = await bcrypt.genSalt(12);
  this.password = await bcrypt.hash(this.password, salt);
  next();
});

// ── Pre-save: auto-generate registration number for students ──────
userSchema.pre('save', async function (next) {
  if (this.role === 'student' && !this.registrationNumber) {
    const year = new Date().getFullYear();
    let unique = false;
    let regNo;
    while (!unique) {
      const rand = Math.floor(10000 + Math.random() * 90000);
      regNo = `CB-${year}-${rand}`;
      const existing = await mongoose.model('User').findOne({ registrationNumber: regNo });
      if (!existing) unique = true;
    }
    this.registrationNumber = regNo;
  }
  next();
});

// ── Method: compare password ──────────────────────────────────────
userSchema.methods.comparePassword = async function (candidatePassword) {
  return bcrypt.compare(candidatePassword, this.password);
};

// ── Method: safe public profile ───────────────────────────────────
userSchema.methods.toPublicJSON = function () {
  return {
    id:                 this._id,
    firstName:          this.firstName,
    lastName:           this.lastName,
    fullName:           this.fullName,
    email:              this.email,
    role:               this.role,
    registrationNumber: this.registrationNumber,
    course:             this.course,
    phone:              this.phone,
    isActive:           this.isActive,
    isVerified:         this.isVerified,
    profileImage:       this.profileImage,
    createdAt:          this.createdAt,
    lastLogin:          this.lastLogin,
  };
};

module.exports = mongoose.model('User', userSchema);
