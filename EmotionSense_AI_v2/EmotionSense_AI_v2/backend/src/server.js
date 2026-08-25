/**
 * EmotionSense AI — Node.js API Gateway (Task B)
 *
 * ┌─────────────┐    multipart/form-data    ┌──────────────┐    multipart/form-data    ┌─────────────────┐
 * │  React UI   │ ────────────────────────► │  This server  │ ────────────────────────► │ Python FastAPI   │
 * │ (port 5173) │                           │  (port 4000)  │                           │  (port 8000)     │
 * └─────────────┘ ◄──────────────────────── └──────────────┘ ◄──────────────────────── └─────────────────┘
 *                      structured JSON                              emotion JSON
 *
 * Why a Node.js gateway instead of React → Python directly?
 *   - Keeps the Python service private (not exposed to the browser)
 *   - Centralises auth, rate-limiting, logging and error normalisation
 *   - Enables easy swap of the AI backend (e.g. cloud API) without touching the UI
 */
import express from "express";
import cors from "cors";
import morgan from "morgan";
import dotenv from "dotenv";
import analyzeRouter from "./routes/analyze.js";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 4000;

// ── Middleware ─────────────────────────────────────────────────────────────────
app.use(
  cors({
    origin: process.env.FRONTEND_URL || "http://localhost:5173",
    methods: ["GET", "POST"],
  })
);
app.use(morgan("dev")); // request logging
app.use(express.json());

// ── Routes ─────────────────────────────────────────────────────────────────────
// All ML analysis endpoints live under /api
app.use("/api", analyzeRouter);

// Liveness probe — used by Docker health checks and load balancers
app.get("/health", (_req, res) => {
  res.json({
    status: "ok",
    service: "emotion-sense-gateway",
    version: "1.0.0",
    ai_service: process.env.AI_SERVICE_URL,
  });
});

// ── Global error handler ───────────────────────────────────────────────────────
// Catches any error passed via next(err) in routes
app.use((err, _req, res, _next) => {
  console.error("[Gateway]", err.message);
  res.status(err.status || 500).json({
    error: err.message || "Internal server error",
    code: err.code || "INTERNAL_ERROR",
  });
});

app.listen(PORT, () => {
  console.log(`\n✅ API Gateway running on http://localhost:${PORT}`);
  console.log(`   Forwarding requests → ${process.env.AI_SERVICE_URL || "http://localhost:8000"}`);
  console.log(`   Allowing CORS from   → ${process.env.FRONTEND_URL || "http://localhost:5173"}\n`);
});
