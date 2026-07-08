"""
Transcription + speaker diarization + call summary via Google Gemini API.
Sends audio inline (no Files API) to avoid v1/v1beta endpoint mismatch.
"""
from __future__ import annotations

import json
import logging
import mimetypes
import os
import re
import time

_logger = logging.getLogger(__name__)

_PRICING = {
    "gemini-2.5-flash":          {"input": 0.15,  "output": 0.60},
    "gemini-2.5-flash-lite":     {"input": 0.075, "output": 0.30},
    "gemini-2.0-flash":          {"input": 0.10,  "output": 0.40},
    "gemini-2.0-flash-lite":     {"input": 0.075, "output": 0.30},
    "gemini-1.5-flash":          {"input": 0.075, "output": 0.30},
    "gemini-1.5-pro":            {"input": 1.25,  "output": 5.00},
}

_PROMPT = """Analyze this audio call recording and return a single JSON object with exactly two keys.

Key 1 — "segments": array of transcript objects with speaker diarization.
Each object has exactly these fields:
- "speaker": string — use "SPEAKER_00", "SPEAKER_01", "SPEAKER_02", etc. Keep IDs consistent throughout
- "start": number — start time in seconds
- "end": number — end time in seconds
- "text": string — exact verbatim words spoken

Transcript rules:
- One entry per uninterrupted utterance from a single speaker
- Include very short utterances: "Yes", "No", "Okay", "Hello", "Yep"
- Never merge speech from two different speakers into one entry
- Timestamps must be as accurate as possible
- For company names, brand names, and proper nouns: transcribe phonetically — do NOT map an unfamiliar word to a common abbreviation or acronym. For example if a speaker says something that sounds like "AL-tee-us" write "Altius", not "LTS". If unsure, write what you hear phonetically rather than guessing an abbreviation.

Key 2 — "summary": object with exactly these four fields:
- "recipient": name and company of the person who ANSWERED the call (not the caller)
- "call_purpose": what the caller is selling, offering, or discussing — one sentence
- "inquired_personnel": the name of the person the caller specifically asked to speak with
- "outcome": whether the prospect agreed, refused, or was unavailable — one sentence

Return ONLY valid JSON — no markdown fences, no explanation, no other text."""


def _calc_cost(model: str, input_tokens: int, output_tokens: int) -> dict:
    rates = _PRICING.get(model, {"input": 0.10, "output": 0.40})
    usd_to_inr = float(os.getenv("USD_TO_INR", "84"))
    cost_usd = (input_tokens * rates["input"] + output_tokens * rates["output"]) / 1_000_000
    cost_inr = cost_usd * usd_to_inr
    return {
        "model":         model,
        "input_tokens":  input_tokens,
        "output_tokens": output_tokens,
        "total_tokens":  input_tokens + output_tokens,
        "cost_usd":      round(cost_usd, 6),
        "cost_inr":      round(cost_inr, 4),
    }


def transcribe_and_diarize(audio_path: str) -> dict:
    """
    Send audio inline to Gemini; returns transcript segments + call summary + usage.
    Returns {"segments": [...], "summary": {...}, "usage": {...}}
    """
    from google import genai

    model   = os.getenv("GEMINI_MODEL", "gemini-2.5-flash")
    api_key = os.getenv("GEMINI_API_KEY", "")
    if not api_key:
        raise RuntimeError("GEMINI_API_KEY not set in .env")

    t0 = time.perf_counter()
    client = genai.Client(api_key=api_key)

    with open(audio_path, "rb") as f:
        audio_bytes = f.read()

    mime_type = mimetypes.guess_type(audio_path)[0] or "audio/mpeg"
    _logger.info("Sending %.2f MB audio inline to Gemini (%s)…",
                 len(audio_bytes) / 1_048_576, model)

    response = client.models.generate_content(
        model=model,
        contents=[
            genai.types.Part.from_bytes(data=audio_bytes, mime_type=mime_type),
            genai.types.Part.from_text(text=_PROMPT),
        ],
        config=genai.types.GenerateContentConfig(temperature=0.0),
    )

    usage_meta    = getattr(response, "usage_metadata", None)
    input_tokens  = getattr(usage_meta, "prompt_token_count",     0) or 0
    output_tokens = getattr(usage_meta, "candidates_token_count", 0) or 0
    usage = _calc_cost(model, input_tokens, output_tokens)
    _logger.info("Gemini usage: in=%d out=%d | $%.6f (₹%.4f)",
                 input_tokens, output_tokens, usage["cost_usd"], usage["cost_inr"])

    raw = response.text.strip()
    raw = re.sub(r"^```(?:json)?\s*\n?", "", raw, flags=re.MULTILINE)
    raw = re.sub(r"\n?```\s*$",          "", raw, flags=re.MULTILINE)
    raw = raw.strip()

    try:
        parsed = json.loads(raw)
    except json.JSONDecodeError as exc:
        _logger.error("Gemini returned non-JSON:\n%s", raw[:800])
        raise RuntimeError(f"Gemini JSON parse failed: {exc}") from exc

    # Support both {"segments": [...], "summary": {...}} and legacy plain array
    if isinstance(parsed, list):
        raw_segments = parsed
        gemini_summary = None
    else:
        raw_segments   = parsed.get("segments", [])
        gemini_summary = parsed.get("summary")

    segments: list[dict] = []
    for i, seg in enumerate(raw_segments):
        text = str(seg.get("text", "")).strip()
        if not text:
            continue
        segments.append({
            "id":      i,
            "start":   round(float(seg.get("start", 0.0)), 2),
            "end":     round(float(seg.get("end",   0.0)), 2),
            "text":    text,
            "speaker": str(seg.get("speaker", "SPEAKER_00")),
        })

    _logger.info("Gemini done: %d segments in %.1fs", len(segments), time.perf_counter() - t0)
    return {"segments": segments, "summary": gemini_summary, "usage": usage}
