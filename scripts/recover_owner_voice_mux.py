"""Recover a private Proofline narration film from EXISTING voice WAV + video.

This is an offline, fail-closed repair tool after a stalled FFmpeg apad/-shortest
mux.  It does not resynthesize speech, rerecord, change historical source media,
run provider calls, overwrite files, or publish the resulting local movie.
Python 3.11 stdlib except the ALREADY installed pinned imageio-ffmpeg binary.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import math
import os
import re
import subprocess
import sys
import uuid
import wave
from datetime import datetime
from pathlib import Path

MAX_VIDEO_SECONDS = 179.5
MUX_TIMEOUT_SECONDS = 75
BAD_ENV = re.compile(
    r"SECRET|TOKEN|PASSWORD|CREDENTIAL|API_KEY|CLIENT_ID|MERCHANT_ID|"
    r"GEMINI|PAYPAL|OPENAI|AUTHORIZATION|PRIVATE_KEY|NODE_OPTIONS", re.I
)


def checked_local_ffmpeg():
    import imageio_ffmpeg
    exe = Path(imageio_ffmpeg.get_ffmpeg_exe()).resolve()
    if not exe.is_file():
        raise ValueError("PINNED_FFMPEG_BINARY_NOT_FOUND")
    return str(exe)


def sanitized_env():
    return {k: v for k, v in os.environ.items() if not BAD_ENV.search(k)}


def probe_duration(ffmpeg, path):
    # FFmpeg metadata probe does NOT decode/re-encode or alter source media.
    result = subprocess.run(
        [ffmpeg, "-hide_banner", "-nostdin", "-i", str(path)],
        capture_output=True, text=True, encoding="utf-8", errors="replace",
        timeout=12, shell=False, env=sanitized_env()
    )
    detail = result.stderr or ""
    match = re.search(r"Duration:\s*(\d{2}):(\d{2}):(\d{2}(?:\.\d+)?)", detail)
    if not match:
        raise ValueError("ENCODED_DURATION_UNAVAILABLE")
    hours, minutes, seconds = map(float, match.groups())
    duration = hours * 3600 + minutes * 60 + seconds
    if not math.isfinite(duration) or not (1.0 < duration < MAX_VIDEO_SECONDS):
        raise ValueError("ENCODED_DURATION_OUT_OF_BOUNDS")
    return duration, detail


def safe_manifest(video_dir, record):
    if not isinstance(record, dict) or (
        record.get("evidence_class") != "OFFLINE_SYNTHETIC_BROWSER_CAPTURE_ONLY" or
        record.get("presentation_mode") != "GUIDED_REAL_BROWSER_CURSOR_NO_POST_ZOOM" or
        record.get("narration_script_version") != "PROOFLINE_PREMIUM_CUES_V1" or
        record.get("source_tracked_tree_clean") is not True or
        record.get("provider_calls") != 0 or
        record.get("payment_posts") != 0 or
        record.get("publicly_uploaded") is not False
    ):
        return None
    filename = record.get("video_filename")
    digest = record.get("video_sha256")
    source_sha = record.get("source_commit_sha")
    cues = record.get("narration_cues")
    if (type(filename) is not str or
        not re.fullmatch(r"paypal-synthetic-review-\d{8}-\d{6}\.webm", filename) or
        type(digest) is not str or not re.fullmatch("[0-9a-f]{64}", digest) or
        type(source_sha) is not str or not re.fullmatch("[0-9a-f]{40}", source_sha) or
        not isinstance(cues, list) or not (10 <= len(cues) <= 24)):
        return None
    movie = video_dir / filename
    if not movie.is_file() or movie.is_symlink():
        return None
    return movie, digest, source_sha, cues


def match_timeline(video_dir, timeline):
    items = timeline.get("items") if isinstance(timeline, dict) else None
    if not isinstance(items, list) or not (10 <= len(items) <= 24):
        raise ValueError("SAVED_NARRATION_TIMELINE_INVALID")
    candidates = []
    for manifest_path in video_dir.glob("paypal-synthetic-review-*.manifest.json"):
        if manifest_path.is_symlink():
            continue
        try:
            record = json.loads(manifest_path.read_text(encoding="utf-8-sig"))
            info = safe_manifest(video_dir, record)
            if info is None:
                continue
            movie, digest, source_sha, cues = info
            if len(items) != len(cues):
                continue
            if any(
                type(item) is not dict or type(cue) is not dict or
                item.get("file") != f"voice_{i:02d}.wav" or
                type(item.get("at_seconds")) not in (int, float) or
                type(cue.get("at_seconds")) not in (int, float) or
                not math.isfinite(item["at_seconds"]) or
                not math.isfinite(cue["at_seconds"]) or
                abs(item["at_seconds"] - cue["at_seconds"]) > 0.011
                for i, (item, cue) in enumerate(zip(items, cues), 1)
            ):
                continue
            if hashlib.sha256(movie.read_bytes()).hexdigest() != digest:
                continue
            candidates.append((movie, digest, source_sha))
        except (OSError, ValueError, KeyError, TypeError):
            continue
    if len(candidates) != 1:
        raise ValueError("EXACTLY_ONE_MATCHED_SOURCE_VIDEO_REQUIRED")
    return candidates[0], len(items)


def recover(root):
    root = root.resolve()
    video_dir = root / "output" / "videos"
    if not video_dir.is_dir():
        raise ValueError("LOCAL_VIDEO_FOLDER_MISSING")
    # Refuse if previous FFmpeg is still running? Owner has already interrupted it.
    # A new output uses an exclusive unique filename, never the damaged draft.
    voice_dirs = sorted(
        (p for p in video_dir.glob("private-voice-*")
         if p.is_dir() and not p.is_symlink()
         and (p / "timeline.json").is_file()
         and (p / "narration.wav").is_file()),
        key=lambda p: p.stat().st_mtime, reverse=True
    )
    if not voice_dirs:
        raise ValueError("SAVED_VOICE_WAV_NOT_FOUND")
    audio_dir = voice_dirs[0]
    timeline = json.loads((audio_dir / "timeline.json").read_text(encoding="utf-8-sig"))
    (source_video, original_digest, original_source_sha), cue_count = match_timeline(video_dir, timeline)
    narration = audio_dir / "narration.wav"
    if narration.is_symlink() or not narration.is_file():
        raise ValueError("SAVED_VOICE_WAV_INVALID")
    with wave.open(str(narration), "rb") as voice:
        if (voice.getframerate() != 22050 or voice.getnchannels() != 1 or
            voice.getsampwidth() != 2 or voice.getnframes() <= 22050):
            raise ValueError("SAVED_VOICE_WAV_FORMAT_UNEXPECTED")
    ffmpeg = checked_local_ffmpeg()
    length, original_probe = probe_duration(ffmpeg, source_video)
    if "Video:" not in original_probe:
        raise ValueError("SOURCE_VIDEO_STREAM_MISSING")
    stamp = datetime.now().strftime("%Y%m%d-%H%M%S")
    suffix = uuid.uuid4().hex[:8]
    movie = video_dir / f"proofline-premium-narrated-recovered-{stamp}-{suffix}.webm"
    report_file = audio_dir / f"recovery-{stamp}-{suffix}.json"
    if movie.exists() or movie.is_symlink() or report_file.exists() or report_file.is_symlink():
        raise FileExistsError("RECOVERY_OUTPUT_ALREADY_EXISTS")
    # -t gives a finite limit. No -af apad and NO -shortest (the former
    # combination was reported to run indefinitely on the owner machine).
    # Natural audio EOF is fine: the remaining video plays without narration.
    cmd = [ffmpeg, "-hide_banner", "-nostdin", "-loglevel", "error", "-n",
           "-i", str(source_video), "-i", str(narration),
           "-map", "0:v:0", "-map", "1:a:0",
           "-c:v", "copy", "-c:a", "libopus", "-b:a", "96k",
           "-t", f"{min(length + 0.5, 179.8):.3f}", str(movie)]
    print("OFFLINE_BOUNDED_MUX_START", flush=True)
    try:
        done = subprocess.run(cmd, capture_output=True, text=True,
                              encoding="utf-8", errors="replace", shell=False,
                              env=sanitized_env(), timeout=MUX_TIMEOUT_SECONDS)
    except subprocess.TimeoutExpired as exc:
        raise ValueError("BOUNDED_FFMPEG_TIMEOUT_OLD_FILES_PRESERVED") from exc
    if done.returncode != 0 or not movie.is_file() or movie.stat().st_size < 10240:
        raise ValueError("BOUNDED_FFMPEG_FAILED_OLD_FILES_PRESERVED")
    out_length, out_probe = probe_duration(ffmpeg, movie)
    if "Video:" not in out_probe or "Audio:" not in out_probe:
        raise ValueError("OUTPUT_VIDEO_OR_VOICE_STREAM_MISSING")
    if abs(out_length - length) > 1.5:
        raise ValueError("OUTPUT_DURATION_DOES_NOT_MATCH_ORIGINAL")
    report = {
        "status": "PRIVATE_RECOVERED_NARRATED_DRAFT_NEEDS_OWNER_REVIEW",
        "originalVideo": source_video.name,
        "originalSha256": original_digest,
        "originalSourceSha": original_source_sha,
        "narrationWav": narration.name,
        "recoveredVideo": movie.name,
        "recoveredSha256": hashlib.sha256(movie.read_bytes()).hexdigest(),
        "originalSeconds": round(length, 2),
        "recoveredSeconds": round(out_length, 2),
        "cueCount": cue_count,
        "voiceIncluded": True,
        "paymentPosts": 0, "providerCalls": 0,
        "publiclyUploaded": False, "ownerApproved": False,
        "editorialReview": "PENDING"
    }
    # Exclusive report: no overwrite, no exposing owner-private files to GitHub.
    with report_file.open("x", encoding="utf-8") as handle:
        json.dump(report, handle, indent=2)
    print("PRIVATE_NARRATED_RECOVERY_PASS " + str(movie), flush=True)
    print("INDEPENDENT_MEDIA_DURATION_SECONDS " + f"{out_length:.2f}", flush=True)
    print("NO_PROVIDER_REQUESTS NO_PAYMENT NO_PUBLIC_UPLOAD", flush=True)
    return report


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--root", type=Path, default=Path(__file__).resolve().parents[1])
    args = parser.parse_args()
    try:
        recover(args.root)
    except (OSError, ValueError, wave.Error, subprocess.SubprocessError) as exc:
        print("VOICE_RECOVERY_FAILED " + str(exc), file=sys.stderr)
        sys.exit(2)
