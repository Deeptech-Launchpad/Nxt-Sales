"""
Late fusion: merge text emotion (HuggingFace) and audio emotion (Librosa).

Strategy:
  - Base weights: text=0.6, audio=0.4  (NLP semantics > acoustic heuristics)
  - Confidence scaling: each weight is multiplied by the branch's max confidence,
    then re-normalised. A low-confidence Whisper segment won't pollute the result.
"""
from __future__ import annotations

_LABELS      = ["anger", "disgust", "fear", "joy", "neutral", "sadness", "surprise"]
_TEXT_WEIGHT  = 0.6
_AUDIO_WEIGHT = 0.4


def fuse(text_result: dict, audio_result: dict) -> dict:
    """
    Weighted average of per-class emotion scores from both modalities.

    Args:
        text_result:  Output of text_emotion.classify()  — {dominant, confidence, scores}
        audio_result: Output of audio_emotion.classify_segment() — same schema

    Returns:
        {dominant, confidence, scores} — same schema as both inputs.
    """
    t_scores = text_result.get("scores", {})
    a_scores = audio_result.get("scores", {})

    # Per-branch confidence — how much we trust each branch's output
    t_conf = max(t_scores.values(), default=0.0)
    a_conf = max(a_scores.values(), default=0.0)

    # Scale base weights by confidence, then re-normalise so they sum to 1
    tw = _TEXT_WEIGHT  * t_conf
    aw = _AUDIO_WEIGHT * a_conf
    total = tw + aw or 1.0         # guard against both being 0.0
    tw /= total
    aw /= total

    # Fused score per emotion class
    fused = {
        e: round(tw * t_scores.get(e, 0.0) + aw * a_scores.get(e, 0.0), 4)
        for e in _LABELS
    }

    dominant = max(fused, key=fused.get)
    return {
        "dominant":   dominant,
        "confidence": round(fused[dominant], 4),
        "scores":     fused,
    }
