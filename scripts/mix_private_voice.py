"""Assemble already-synthesized owner-local narration WAV clips at actual filmed cue timestamps.

Pure Python 3.11 stdlib, no external providers, no downloading, no payments.
Never overwrites an existing mix; manifest and original WebM remain untouched.
"""
import argparse
import json
import math
import sys
import wave
from pathlib import Path

RATE = 22050
WIDTH = 2
CHANNELS = 1
MAX_SECONDS = 179.0
GAP_SECONDS = 0.18


def mix_timeline(timeline_path: Path, output: Path):
    root = timeline_path.resolve().parent
    data = json.loads(timeline_path.read_text(encoding="utf-8-sig"))
    items = data.get("items")
    if not isinstance(items, list) or not (1 <= len(items) <= 24):
        raise ValueError("NARRATION_CUE_COUNT_INVALID")
    if output.exists() or output.is_symlink():
        raise FileExistsError("NARRATION_MIX_ALREADY_EXISTS")
    pcm = bytearray()
    last_end = 0
    lines = []
    for item in items:
        if not isinstance(item, dict):
            raise ValueError("INVALID_CUE")
        seconds = item.get("at_seconds")
        name = item.get("file")
        if type(seconds) not in (float, int) or not math.isfinite(seconds) or not (0 <= seconds < MAX_SECONDS):
            raise ValueError("INVALID_CUE_TIME")
        if type(name) is not str or not name.startswith("voice_") or not name.endswith(".wav"):
            raise ValueError("INVALID_CUE_FILE")
        clip = (root / name).resolve()
        if clip.parent != root or not clip.is_file() or clip.is_symlink():
            raise ValueError("CUE_FILE_NOT_LOCAL")
        with wave.open(str(clip), "rb") as wav:
            if wav.getframerate() != RATE or wav.getsampwidth() != WIDTH or wav.getnchannels() != CHANNELS or wav.getcomptype() != "NONE":
                raise ValueError("VOICE_WAV_FORMAT_UNEXPECTED")
            frames = wav.readframes(wav.getnframes())
        if not frames:
            raise ValueError("EMPTY_CUE_AUDIO")
        planned = round(seconds * RATE)
        start = max(planned, last_end + round(GAP_SECONDS * RATE) if lines else 0)
        end = start + len(frames) // WIDTH
        if end / RATE >= MAX_SECONDS:
            raise ValueError("VOICE_EXCEEDS_THREE_MINUTE_SAFETY_MARGIN")
        if len(pcm) < start * WIDTH:
            pcm.extend(b"\x00" * (start * WIDTH - len(pcm)))
        pcm.extend(frames)
        lines.append({"cue": len(lines)+1, "start_seconds": round(start/RATE, 2),
                      "end_seconds": round(end/RATE, 2)})
        last_end = end
    if not output.parent.is_dir():
        raise ValueError("OUTPUT_DIRECTORY_REQUIRED")
    with wave.open(str(output), "wb") as wav:
        wav.setnchannels(CHANNELS)
        wav.setsampwidth(WIDTH)
        wav.setframerate(RATE)
        wav.writeframes(pcm)
    return {"status": "LOCAL_VOICE_WAV_MIX_CREATED",
            "cue_count": len(lines), "seconds": round(last_end/RATE, 2),
            "cue_timing": lines, "external_provider_calls": 0}


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--timeline", required=True, type=Path)
    parser.add_argument("--output", required=True, type=Path)
    args = parser.parse_args()
    try:
        print(json.dumps(mix_timeline(args.timeline, args.output)))
    except (OSError, ValueError, wave.Error, KeyError) as exc:
        print("VOICE_MIX_FAILED " + str(exc), file=sys.stderr)
        sys.exit(1)
