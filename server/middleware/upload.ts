import multer from 'multer';
import path from 'path';
import fs from 'fs';

const MEDIA_STORAGE_PATH = process.env.MEDIA_STORAGE_PATH || './uploads/media';
const VIDEO_STORAGE_PATH = process.env.VIDEO_STORAGE_PATH || './uploads/videos';

// Ensure directories exist
[MEDIA_STORAGE_PATH, VIDEO_STORAGE_PATH].forEach((dir) => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
});

const imageStorage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, path.resolve(MEDIA_STORAGE_PATH)),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname);
    const uniqueName = `${Date.now()}-${Math.random().toString(36).substring(2, 11)}${ext}`;
    cb(null, uniqueName);
  },
});

export const uploadImages = multer({
  storage: imageStorage,
  limits: { fileSize: 10 * 1024 * 1024, files: 3 }, // 10MB, max 3 files
  fileFilter: (_req, file, cb) => {
    const allowed = ['image/jpeg', 'image/png', 'image/webp'];
    if (allowed.includes(file.mimetype)) cb(null, true);
    else cb(new Error('Only JPEG, PNG, WebP images allowed'));
  },
});

const videoStorage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, path.resolve(VIDEO_STORAGE_PATH)),
  filename: (req, _file, cb) => {
    const campaignId = (req as any).params?.id || 'unknown';
    cb(null, `${campaignId}-source-${Date.now()}.mp4`);
  },
});

export const uploadVideo = multer({
  storage: videoStorage,
  limits: { fileSize: 4 * 1024 * 1024 * 1024 }, // 4GB
  fileFilter: (_req, file, cb) => {
    if (file.mimetype === 'video/mp4' || file.mimetype === 'video/quicktime') cb(null, true);
    else cb(new Error('Only MP4/MOV video files allowed'));
  },
});
