/**
 * POST /api/analyze
 *
 * Data flow through this route:
 *
 *  1. React sends multipart/form-data with field name "file"
 *  2. Multer middleware (uploadMiddleware) saves it to /uploads/<timestamp-name>
 *  3. We rebuild a FormData object and pipe the saved file to Python FastAPI
 *  4. Python returns a structured emotion JSON payload
 *  5. We forward that JSON verbatim to the React client
 *  6. The temp file is deleted in the `finally` block — always, even on error
 *
 * Why re-stream instead of forwarding the raw request?
 *   Multer already consumed the request stream. We must re-open the saved file
 *   as a read-stream to create a new multipart body for Axios.
 */
import express from "express";
import axios from "axios";
import FormData from "form-data";
import fs from "fs";
import { uploadMiddleware } from "../middleware/upload.js";

const router = express.Router();

router.post("/analyze", uploadMiddleware, async (req, res, next) => {
  // Read at request time so dotenv (called in server.js) has already run
  const AI_SERVICE_URL = process.env.AI_SERVICE_URL || "http://localhost:8000";
  if (!req.file) {
    return res.status(400).json({ error: "No audio file provided. Send a file in the 'file' field." });
  }

  const { path: filePath, originalname: fileName, mimetype, size } = req.file;

  try {
    // ── Build new multipart body for the Python service ──────────────────────
    const form = new FormData();
    form.append("file", fs.createReadStream(filePath), {
      filename: fileName,
      contentType: mimetype,
    });

    console.log(
      `[Gateway] → AI service | file="${fileName}" size=${(size / 1024).toFixed(1)} KB`
    );

    // ── Forward to Python FastAPI ─────────────────────────────────────────────
    const aiResponse = await axios.post(`${AI_SERVICE_URL}/analyze`, form, {
      headers: {
        ...form.getHeaders(), // sets Content-Type: multipart/form-data; boundary=...
      },
      // 60-minute timeout: CPU diarization can take 10-15× real-time
      timeout: 3_600_000,
      // Allow large file bodies through Axios (default limit is 10 MB)
      maxBodyLength: Infinity,
      maxContentLength: Infinity,
    });

    console.log(
      `[Gateway] ← AI service | ${aiResponse.data?.segments?.length ?? 0} segments in ${aiResponse.data?.processing_time_ms} ms`
    );

    // Return the emotion JSON directly to the React client
    return res.status(200).json(aiResponse.data);

  } catch (err) {
    if (err.response) {
      // The Python service responded with an error status
      console.error(`[Gateway] AI service error ${err.response.status}:`, err.response.data);
      return res.status(err.response.status).json({
        error: "AI service returned an error",
        detail: err.response.data,
      });
    }
    // Network error, timeout, or DNS failure
    console.error("[Gateway] Could not reach AI service:", err.message);
    return next(
      Object.assign(new Error("AI service is unreachable. Is it running?"), { status: 503 })
    );

  } finally {
    // Delete the temp file regardless of success or failure
    fs.unlink(filePath, (e) => {
      if (e) console.warn(`[Gateway] Could not delete temp file ${filePath}:`, e.message);
    });
  }
});

export default router;
