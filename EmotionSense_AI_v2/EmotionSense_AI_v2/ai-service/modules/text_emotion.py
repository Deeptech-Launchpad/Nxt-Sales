"""
Text emotion classification via HuggingFace Transformers.

Model: j-hartmann/emotion-english-distilroberta-base
Output: 7-class emotion probability distribution per segment.
       (anger, disgust, fear, joy, neutral, sadness, surprise)
"""
from __future__ import annotations

import logging
import threading
from functools import lru_cache

_logger = logging.getLogger(__name__)
_lock = threading.Lock()

_MODEL  = "j-hartmann/emotion-english-distilroberta-base"
_LABELS = ["anger", "disgust", "fear", "joy", "neutral", "sadness", "surprise"]


@lru_cache(maxsize=1)
def _load():
    from transformers import AutoModelForSequenceClassification, AutoTokenizer
    _logger.info("Loading text-emotion model: %s…", _MODEL)
    tokenizer = AutoTokenizer.from_pretrained(_MODEL)
    model = AutoModelForSequenceClassification.from_pretrained(
        _MODEL,
        low_cpu_mem_usage=True,
        attn_implementation="eager",
    )
    model.eval()
    _logger.info("Text-emotion model ready.")
    return tokenizer, model


def classify(text: str) -> dict:
    if not text.strip():
        return _neutral()

    try:
        import torch
        tokenizer, model = _load()
        with _lock:
            inputs = tokenizer(text[:512], return_tensors="pt", truncation=True, padding=True)
            with torch.no_grad():
                logits = model(**inputs).logits[0].detach().clone()
            probs = torch.softmax(logits, dim=0)
            id2label = model.config.id2label
            scores = {id2label[i].lower(): round(float(probs[i]), 4) for i in range(len(probs))}
            dominant = max(scores, key=scores.get)
        return {"dominant": dominant, "confidence": scores[dominant], "scores": scores}

    except Exception as exc:
        import traceback
        _logger.warning("Text emotion failed: %s\n%s", exc, traceback.format_exc())
        return _neutral()


def _neutral() -> dict:
    s = {e: 0.0 for e in _LABELS}
    s["neutral"] = 1.0
    return {"dominant": "neutral", "confidence": 1.0, "scores": s}


def warmup() -> None:
    _load()
