/**
 * Cloudinary Configuration — CodeBreakers
 */
const cloudinary = require('cloudinary').v2;
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const multer = require('multer');

// ── Configure Cloudinary ──────────────────────────────────────────
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key:    process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// ── Storage: Lesson Videos ────────────────────────────────────────
const videoStorage = new CloudinaryStorage({
  cloudinary,
  params: async (req, file) => ({
    folder:         'codebreakers/lessons/videos',
    resource_type:  'video',
    allowed_formats: ['mp4', 'webm', 'mov', 'avi', 'mkv'],
    transformation: [{ quality: 'auto', fetch_format: 'auto' }],
    public_id:      `lesson_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
  }),
});

// ── Storage: Assignment/Material PDFs & Files ─────────────────────
const documentStorage = new CloudinaryStorage({
  cloudinary,
  params: async (req, file) => ({
    folder:          'codebreakers/materials',
    resource_type:   'raw',
    allowed_formats: ['pdf', 'doc', 'docx', 'ppt', 'pptx', 'zip', 'txt'],
    public_id:       `doc_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
  }),
});

// ── Storage: Profile Images ───────────────────────────────────────
const imageStorage = new CloudinaryStorage({
  cloudinary,
  params: async (req, file) => ({
    folder:          'codebreakers/profiles',
    resource_type:   'image',
    allowed_formats: ['jpg', 'jpeg', 'png', 'webp'],
    transformation:  [{ width: 400, height: 400, crop: 'fill', gravity: 'face', quality: 'auto' }],
    public_id:       `profile_${req.user?._id || Date.now()}`,
  }),
});

// ── Storage: Assignment Submissions ──────────────────────────────
const submissionStorage = new CloudinaryStorage({
  cloudinary,
  params: async (req, file) => ({
    folder:          'codebreakers/submissions',
    resource_type:   'raw',
    allowed_formats: ['pdf', 'doc', 'docx', 'zip', 'html', 'js', 'css', 'txt', 'png', 'jpg'],
    public_id:       `submission_${req.user?._id}_${Date.now()}`,
  }),
});

// ── File size limits ──────────────────────────────────────────────
const fileSizeMB = (mb) => mb * 1024 * 1024;

// ── Multer upload instances ───────────────────────────────────────
exports.uploadVideo = multer({
  storage: videoStorage,
  limits:  { fileSize: fileSizeMB(2048) },  // 2 GB
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('video/')) return cb(null, true);
    cb(new Error('Only video files are allowed'));
  },
}).single('video');

exports.uploadDocument = multer({
  storage: documentStorage,
  limits:  { fileSize: fileSizeMB(50) },    // 50 MB
}).array('materials', 10);

exports.uploadImage = multer({
  storage: imageStorage,
  limits:  { fileSize: fileSizeMB(5) },     // 5 MB
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) return cb(null, true);
    cb(new Error('Only image files are allowed'));
  },
}).single('image');

exports.uploadSubmission = multer({
  storage: submissionStorage,
  limits:  { fileSize: fileSizeMB(100) },   // 100 MB
}).array('files', 5);

// ── Delete file from Cloudinary ───────────────────────────────────
exports.deleteFile = async (publicId, resourceType = 'image') => {
  try {
    return await cloudinary.uploader.destroy(publicId, { resource_type: resourceType });
  } catch (err) {
    console.error('Cloudinary delete error:', err);
  }
};

exports.cloudinary = cloudinary;
