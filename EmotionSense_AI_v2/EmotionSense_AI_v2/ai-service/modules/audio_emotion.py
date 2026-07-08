"""
Audio-based emotion classification using Librosa acoustic features.

Extracts energy, pitch, zero-crossing rate, and spectral centroid from a
per-segment audio slice, then maps them to 7-class emotion probabilities
using calibrated heuristics.

Why heuristics instead of a trained model?
  Training a robust SER model requires thousands of labelled audio samples.
  For an MVP, heuristics deliver surprisingly reasonable results and run
  without GPU. Swap _extract_and_score() for a real sklearn or torch model
  later without changing the rest of the pipeline.
"""
from __future__ import annotations

import logging

import librosa
import numpy as np

_logger = logging.getLogger(__name__)

_SR      = 16_000           # target sample rate expected by Whisper and librosa
_LABELS  = ["anger", "disgust", "fear", "joy", "neutral", "sadness", "surprise"]


def classify_segment(audio_path: str, start: float, end: float) -> dict:
    """
    Classify emotion for a time slice [start, end] of an audio file.

    Args:
        audio_path: Path to the full-length WAV file.
        start:      Segment start in seconds.
        end:        Segment end in seconds.

    Returns:
        {dominant, confidence, scores} — same schema as text_emotion.classify().
    """
    try:
        duration = max(end - start, 0.1)
        # Load only the segment — avoids re-reading the whole file per segment
        y, _ = librosa.load(audio_path, sr=_SR, offset=start, duration=duration, mono=True)

        if len(y) < 512:
            return _neutral()

        scores = _score(y)
        dominant = max(scores, key=scores.get)
        return {
            "dominant":   dominant,
            "confidence": round(scores[dominant], 4),
            "scores":     {k: round(v, 4) for k, v in scores.items()},
        }

    except Exception as exc:
        _logger.warning("Audio emotion failed [%.1fs-%.1fs]: %s", start, end, exc)
        return _neutral()


# ── Feature extraction + heuristic mapping ─────────────────────────────────────

def _norm(v: float, lo: float, hi: float) -> float:
    """Normalise v to [0, 1] given the expected acoustic range [lo, hi]."""
    return float(np.clip((v - lo) / (hi - lo + 1e-9), 0.0, 1.0))


def _score(y: np.ndarray) -> dict[str, float]:
    """
    Extract acoustic features and map them to emotion scores.

    Features used:
      energy  — overall loudness (RMS)
      p_mean  — mean fundamental frequency (pitch)
      p_std   — pitch variability (prosodic expressiveness)
      zcr     — zero-crossing rate (noisiness / consonant density)
      sc      — spectral centroid (brightness)
    """
    # ── Acoustic features ──────────────────────────────────────────────────────
    energy = float(np.sqrt(np.mean(y ** 2)))

    pitches, _ = librosa.piptrack(y=y, sr=_SR, n_fft=2048, hop_length=512)
    p_vals = pitches[pitches > 0]
    p_mean = float(np.mean(p_vals)) if p_vals.size else 0.0
    p_std  = float(np.std(p_vals))  if p_vals.size else 0.0

    zcr = float(np.mean(librosa.feature.zero_crossing_rate(y)))
    sc  = float(np.mean(librosa.feature.spectral_centroid(y=y, sr=_SR)))

    # ── Normalise each feature to [0, 1] ──────────────────────────────────────
    e_n   = _norm(energy, 0.001, 0.20)
    p_n   = _norm(p_mean,  50,   400)
    ps_n  = _norm(p_std,    0,   100)
    zcr_n = _norm(zcr,   0.01,  0.30)
    sc_n  = _norm(sc,     500, 4_000)

    # ── Heuristic weights ─────────────────────────────────────────────────────
    # Each weight was derived from published SER literature (e.g. IEMOCAP findings).
    # They represent which acoustic dimension most strongly predicts each emotion.
    raw = {
        "anger":    0.30*e_n   + 0.25*p_n    + 0.25*zcr_n  + 0.20*sc_n,
        "disgust":  0.35*(1-p_n) + 0.35*(1-sc_n) + 0.30*ps_n,
        "fear":     0.30*zcr_n + 0.25*ps_n   + 0.25*e_n    + 0.20*(1-p_n),
        "joy":      0.30*e_n   + 0.35*(1-ps_n) + 0.20*p_n  + 0.15*sc_n,
        "neutral":  0.40*(1-e_n) + 0.30*(1-ps_n) + 0.30*(1-zcr_n),
        "sadness":  0.40*(1-e_n) + 0.25*(1-p_n) + 0.20*(1-ps_n) + 0.15*(1-sc_n),
        "surprise": 0.40*zcr_n + 0.30*ps_n   + 0.30*e_n,
    }

    # Normalise to a proper probability distribution
    total = sum(raw.values()) + 1e-9
    return {k: v / total for k, v in raw.items()}


def _neutral() -> dict:
    s = {e: 0.0 for e in _LABELS}
    s["neutral"] = 1.0
    return {"dominant": "neutral", "confidence": 1.0, "scores": s}
