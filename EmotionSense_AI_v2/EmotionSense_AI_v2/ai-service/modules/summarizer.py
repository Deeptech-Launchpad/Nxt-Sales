"""
Call summary extraction using a local flan-t5 model.
No API key required — runs entirely on device.
"""
from __future__ import annotations

import logging
import re
from collections import defaultdict
from functools import lru_cache

_logger = logging.getLogger(__name__)

_MODEL = "google/flan-t5-base"
_MIN_CHARS = 80


@lru_cache(maxsize=1)
def _load():
    from transformers import AutoTokenizer, T5ForConditionalGeneration
    _logger.info("Loading summariser model: %s", _MODEL)
    tokenizer = AutoTokenizer.from_pretrained(_MODEL)
    model = T5ForConditionalGeneration.from_pretrained(
        _MODEL,
        low_cpu_mem_usage=True,
        attn_implementation="eager",
    )
    model.eval()
    _logger.info("Summariser ready.")
    return tokenizer, model


def _ask(tokenizer, model, prompt: str) -> str:
    try:
        import torch
        inputs = tokenizer(prompt, return_tensors="pt", truncation=True, max_length=512)
        with torch.no_grad():
            outputs = model.generate(**inputs, max_new_tokens=80, do_sample=False)
        text = tokenizer.decode(outputs[0], skip_special_tokens=True).strip()
        text = re.sub(r"^(SPEAKER_\d+|Speaker\s+\d+[^:]*):\s*", "", text)
        return text
    except Exception as exc:
        import traceback
        _logger.warning("Summariser QA failed: %s\n%s", exc, traceback.format_exc())
        return "N/A"


def _extract_name_regex(lines: list[str]) -> str:
    """
    Extract a speaker's OWN name from their lines using self-identification patterns.
    Only matches phrases where the speaker identifies themselves, not names they address others by.
    """
    text = " ".join(lines)
    _skip = {"the", "a", "an", "this", "that", "calling", "just", "speaking",
             "sorry", "thank", "yes", "no", "ok", "okay", "it", "about"}
    patterns = [
        r"this is ([A-Z][a-z]{1,})",          # "this is Manoj"
        r"(?:^|[\.,]\s*)([A-Z][a-z]{2,})\s+speaking",  # "Butterworth, Dan speaking"
        r"my name is ([A-Z][a-z]{1,})",        # "my name is..."
        r"I'?m ([A-Z][a-z]{1,})\b",            # "I'm Dan"
        r"\bI am ([A-Z][a-z]{1,})\b",          # "I am..."
    ]
    for pattern in patterns:
        m = re.search(pattern, text)
        if m:
            name = m.group(1).strip()
            if name.lower() not in _skip and len(name) > 1:
                return name
    return ""


_HOLD_RE = re.compile(
    r"(thanks for holding|please hold|hold the line|we will be with you|"
    r"our business hours|did you know that we offer|if you know (your party|the extension)|"
    r"to leave a message|your (estimated )?wait time|press \d+ to|thank you for (calling|holding))",
    re.IGNORECASE,
)

_ADDRESS_RE = [
    re.compile(r"(?:hey|hi|hello)[,\s]+([A-Z][a-z]{2,})", re.IGNORECASE),
    re.compile(r"(?:can i speak (?:with|to)|speak with)\s+([A-Z][a-z]{2,})", re.IGNORECASE),
    re.compile(r"is (?:this|that)\s+([A-Z][a-z]{2,})\??", re.IGNORECASE),
    re.compile(r"\bfor\s+([A-Z][a-z]{2,})\s*please", re.IGNORECASE),
]

_SKIP_WORDS = {
    "the", "a", "an", "this", "that", "calling", "just", "speaking",
    "sorry", "thank", "yes", "no", "ok", "okay", "it", "about",
    "you", "me", "him", "her", "them", "us", "we", "they", "can",
    "hello", "hi", "hey", "sure", "yeah", "pardon", "right", "well",
    "what", "who", "how", "there", "here", "hold", "please", "bye",
}


def extract_speaker_names(segments: list) -> dict:
    from collections import Counter

    speaker_lines: dict[str, list[str]] = defaultdict(list)
    for seg in segments:
        sp = seg.get("speaker", "SPEAKER_00")
        text = seg.get("text", "").strip()
        if text:
            speaker_lines[sp].append(text)

    ordered_speakers = []
    seen = set()
    for seg in segments:
        sp = seg.get("speaker", "SPEAKER_00")
        if sp not in seen:
            ordered_speakers.append(sp)
            seen.add(sp)

    # Pass 1 — self-identified names
    self_names: dict[str, str] = {}
    for sp, lines in speaker_lines.items():
        name = _extract_name_regex(lines)
        if name:
            self_names[sp] = name

    # Build skip set from already-known names so we don't re-assign them
    known = {n.lower() for n in self_names.values()}

    # Pass 2 — addressed names: "Hey Linda" before a different speaker responds
    addressed: dict[str, list[str]] = defaultdict(list)
    for i, seg in enumerate(segments):
        text = seg.get("text", "").strip()
        current_sp = seg.get("speaker")
        for pattern in _ADDRESS_RE:
            m = pattern.search(text)
            if m:
                name = m.group(1).strip()
                if name.lower() in known or name.lower() in _SKIP_WORDS or len(name) < 3:
                    continue
                # Find the next segment from a different speaker
                for j in range(i + 1, min(i + 5, len(segments))):
                    next_sp = segments[j].get("speaker")
                    if next_sp and next_sp != current_sp:
                        addressed[next_sp].append(name)
                        break

    mapping: dict[str, str] = {}
    for idx, sp in enumerate(ordered_speakers, start=1):
        label = f"Speaker {idx}"
        all_text = " ".join(speaker_lines.get(sp, []))

        if _HOLD_RE.search(all_text):
            label = f"Speaker {idx} (Hold Message)"
        elif sp in self_names:
            label = f"Speaker {idx} ({self_names[sp]})"
        elif sp in addressed and addressed[sp]:
            name = Counter(addressed[sp]).most_common(1)[0][0]
            label = f"Speaker {idx} ({name})"

        mapping[sp] = label

    return mapping


def generate_call_summary(transcript: str) -> dict:
    if len(transcript.strip()) < _MIN_CHARS:
        return {"recipient": "", "call_purpose": "", "inquired_personnel": "", "outcome": ""}

    tokenizer, model = _load()
    ctx = transcript[:2000]

    recipient = _ask(tokenizer, model,
        f"Transcript:\n{ctx}\n\nWho answered this call? Give name and company."
    )
    call_purpose = _ask(tokenizer, model,
        f"Transcript:\n{ctx}\n\nWhat is the caller selling or discussing? One sentence."
    )
    inquired_personnel = _ask(tokenizer, model,
        f"Transcript:\n{ctx}\n\nWhich person did the caller ask to speak with? Name only."
    )
    outcome = _ask(tokenizer, model,
        f"Transcript:\n{ctx}\n\nDid the prospect agree or refuse? One sentence."
    )

    return {
        "recipient":           recipient,
        "call_purpose":        call_purpose,
        "inquired_personnel":  inquired_personnel,
        "outcome":             outcome,
    }


def warmup() -> None:
    _load()
