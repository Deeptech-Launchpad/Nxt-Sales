/**
 * Multer upload middleware
 *
 * Handles the multipart/form-data request arriving from the React frontend.
 * Files are written to /uploads as a temporary staging area; analyze.js
 * streams the file onward to Python and then deletes the temp copy.
 *
 * Limits
 *   - Max file size : 50 MB
 *   - Allowed types : MP3, WAV, M4A, OGG, FLAC
 */
import multer from "multer";
import path from "path";
import fs from "fs";

// Ensure the uploads directory exists — Docker volumes may not pre-create it
const UPLOAD_DIR = path.resolve("uploads");
if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

// Disk storage — writing to disk keeps memory pressure low for large audio files
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
  filename: (_req, file, cb) => {
    // Prefix with timestamp so concurrent uploads never collide
    const safe = file.originalname.replace(/\s+/g, "_").replace(/[^a-zA-Z0-9._-]/g, "");
    cb(null, `${Date.now()}-${safe}`);
  },
});

const ALLOWED_MIMES = new Set([
  "audio/mpeg",    // .mp3
  "audio/wav",     // .wav
  "audio/x-wav",  // .wav (alternate MIME on some browsers)
  "audio/mp4",     // .m4a
  "audio/ogg",     // .ogg
  "audio/flac",    // .flac
  "audio/x-flac", // .flac (alternate)
]);

const fileFilter = (_req, file, cb) => {
  if (ALLOWED_MIMES.has(file.mimetype)) {
    cb(null, true);
  } else {
    const err = new Error(
      `Unsupported audio type "${file.mimetype}". Upload an MP3, WAV, M4A, OGG or FLAC file.`
    );
    err.status = 415;
    cb(err, false);
  }
};

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 50 * 1024 * 1024 }, // 50 MB
});

// Export as a named single-file middleware so routes can call it directly
export const uploadMiddleware = upload.single("file");
