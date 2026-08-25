"""
EmotionSense AI — Python FastAPI Microservice

Full ML pipeline:
  1. Save upload to temp file
  2. Gemini transcription + diarization → [{id, start, end, text, speaker}]
  3. Per segment: audio emotion (Librosa) + text emotion (HuggingFace) + fusion
  4. Call summary (flan-t5, no API key)
  5. Return structured JSON to Node.js gateway
"""
from __future__ import annotations

# ── Patch accelerate BEFORE any model imports ──────────────────────────────
# accelerate's init_empty_weights() puts model params on meta device, then
# dispatch_model calls .to("cpu") which raises "Cannot copy out of meta tensor".
# Replacing with nullcontext forces direct CPU init for all models.
try:
    from contextlib import nullcontext as _nc
    import accelerate as _acc
    import accelerate.big_modeling as _abm
    _no_meta = lambda *args, **kw: _nc()
    _abm.init_empty_weights = _no_meta
    _acc.init_empty_weights = _no_meta
    try:
        import accelerate.utils as _autils
        _autils.init_empty_weights = _no_meta
    except Exception:
        pass
    # If transformers.modeling_utils was already imported (e.g. uvicorn --reload),
    # patch its local reference too so subsequent from_pretrained calls are safe.
    import sys as _sys
    if "transformers.modeling_utils" in _sys.modules:
        _sys.modules["transformers.modeling_utils"].init_empty_weights = _no_meta
    # Safety net: if dispatch_model is called on an all-CPU device_map,
    # skip the to(device) call — model is already on CPU from normal init.
    _orig_dispatch = _abm.dispatch_model
    def _safe_dispatch(model, device_map=None, **kwargs):
        if device_map is not None and all(str(v) == "cpu" for v in device_map.values()):
            return model
        return _orig_dispatch(model, device_map=device_map, **kwargs)
    _abm.dispatch_model = _safe_dispatch
    _acc.dispatch_model = _safe_dispatch
    if "transformers.modeling_utils" in _sys.modules:
        _tmu = _sys.modules["transformers.modeling_utils"]
        if hasattr(_tmu, "dispatch_model"):
            _tmu.dispatch_model = _safe_dispatch
except Exception:
    pass
# ────────────────────────────────────────────────────────────────────────────

import asyncio
import logging
import os
import tempfile
import time
from pathlib import Path

import soundfile as sf
from dotenv import load_dotenv
from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware

from modules.gemini_transcriber import transcribe_and_diarize
from modules.audio_emotion import classify_segment as classify_audio
from modules.fusion import fuse
from modules.summarizer import generate_call_summary, extract_speaker_names, warmup as warmup_summarizer
from modules.text_emotion import classify as classify_text, warmup as warmup_text

load_dotenv()

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(levelname)s | %(name)s | %(message)s",
)
_logger = logging.getLogger("main")

CALL_SUMMARY_ENABLED = os.getenv("CALL_SUMMARY_ENABLED", "true").lower() == "true"

_analysis_semaphore = asyncio.Semaphore(1)

app = FastAPI(
    title="EmotionSense AI",
    description="Whisper + PyAnnote + Librosa + HuggingFace + flan-t5 call summary",
    version="2.0.0",
    docs_url="/docs",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── Startup: pre-load all models ───────────────────────────────────────────────

@app.on_event("startup")
async def _preload() -> None:
    _logger.info("Pre-loading ML models …")
    loop = asyncio.get_running_loop()

    try:
        await loop.run_in_executor(None, warmup_text)
        _logger.info("Text-emotion model ready.")
    except MemoryError:
        _logger.warning("Text-emotion model skipped — not enough RAM; will retry on first request.")
    except Exception as exc:
        _logger.warning("Text-emotion model preload failed (%s); will retry on first request.", exc)

    if CALL_SUMMARY_ENABLED:
        try:
            await loop.run_in_executor(None, warmup_summarizer)
            _logger.info("Summariser model ready.")
        except MemoryError:
            _logger.warning("Summariser model skipped — not enough RAM; will retry on first request.")
        except Exception as exc:
            _logger.warning("Summariser model preload failed (%s); will retry on first request.", exc)

    _logger.info("Startup complete — accepting requests.")


# ── Endpoints ──────────────────────────────────────────────────────────────────

@app.get("/health")
def health():
    return {"status": "ok", "service": "emotion-sense-ai", "version": "2.0.0"}


@app.post("/analyze")
async def analyze(file: UploadFile = File(...)):
    """
    Full multimodal emotion analysis.

    Returns per-segment transcript, speaker IDs, text + audio + fused emotion,
    and a structured call summary — all from local models, no external API key.
    """
    if _analysis_semaphore.locked():
        raise HTTPException(status_code=429, detail="Server busy — previous analysis still running. Please wait.")

    async with _analysis_semaphore:
        return await _run_analysis(file)


async def _run_analysis(file: UploadFile):
    t_start = time.perf_counter()

    # ── Step 1: save upload ────────────────────────────────────────────────────
    suffix = Path(file.filename or "audio.wav").suffix.lower() or ".wav"
    fd, tmp_path = tempfile.mkstemp(suffix=suffix)
    os.close(fd)

    try:
        content = await file.read()
        with open(tmp_path, "wb") as fh:
            fh.write(content)

        _logger.info("Received '%s' (%d bytes)", file.filename, len(content))

        try:
            audio_duration = round(sf.info(tmp_path).duration, 2)
        except Exception:
            audio_duration = 0.0

        loop = asyncio.get_running_loop()

        # ── Steps 2+3: Gemini transcription + diarization + summary ──────────
        gemini_result  = await loop.run_in_executor(None, transcribe_and_diarize, tmp_path)
        aligned        = gemini_result["segments"]
        gemini_usage   = gemini_result["usage"]
        gemini_summary = gemini_result.get("summary")

        if not aligned:
            return _empty_response(audio_duration, t_start)

        unique_speakers = sorted({s["speaker"] for s in aligned})

        # ── Step 4: Per-segment emotion (text + audio + fusion) ────────────────
        async def _enrich(seg: dict) -> dict:
            text_emo, audio_emo = await asyncio.gather(
                loop.run_in_executor(None, classify_text,  seg["text"]),
                loop.run_in_executor(None, classify_audio, tmp_path, seg["start"], seg["end"]),
            )
            return {**seg, "text_emotion": text_emo, "audio_emotion": audio_emo, "final_emotion": fuse(text_emo, audio_emo)}

        enriched: list[dict] = list(await asyncio.gather(*[_enrich(s) for s in aligned]))

        # ── Step 5: Speaker name extraction (regex over transcript) ─────────────
        speaker_name_map: dict = {}
        call_summary = gemini_summary  # prefer Gemini's summary

        try:
            speaker_name_map = await loop.run_in_executor(
                None, extract_speaker_names, enriched
            )
        except Exception as exc:
            _logger.warning("Speaker name extraction failed: %s", exc)

        for seg in enriched:
            seg["speaker_label"] = speaker_name_map.get(seg["speaker"], seg["speaker"])

        # Fallback to flan-t5 only if Gemini summary was missing
        if call_summary is None and CALL_SUMMARY_ENABLED and enriched:
            labeled_transcript = "\n".join(
                f"{seg['speaker_label']}: {seg['text']}" for seg in enriched if seg.get("text")
            )
            try:
                call_summary = await loop.run_in_executor(
                    None, generate_call_summary, labeled_transcript
                )
            except Exception as exc:
                _logger.warning("Call summary fallback failed: %s", exc)

        elapsed_ms = int((time.perf_counter() - t_start) * 1000)
        _logger.info("%d segments | %d speakers | %d ms", len(enriched), len(unique_speakers), elapsed_ms)

        named_speakers = [speaker_name_map.get(sp, sp) for sp in unique_speakers]

        # ── Step 6: Return to Node.js gateway ─────────────────────────────────
        return {
            "status":             "success",
            "audio_duration_sec": audio_duration,
            "speakers":           named_speakers,
            "segments":           enriched,
            "call_summary":       call_summary,
            "gemini_usage":       gemini_usage,
            "processing_time_ms": elapsed_ms,
        }

    except Exception as exc:
        _logger.exception("Pipeline error: %s", exc)
        raise HTTPException(status_code=500, detail=f"Analysis failed: {exc}")

    finally:
        try:
            os.unlink(tmp_path)
        except Exception:
            pass


def _empty_response(audio_duration: float, t_start: float) -> dict:
    return {
        "status":             "success",
        "audio_duration_sec": audio_duration,
        "speakers":           [],
        "segments":           [],
        "call_summary":       None,
        "processing_time_ms": int((time.perf_counter() - t_start) * 1000),
    }


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
