"""Private, offline Kokoro neural English film narration (opt-in assets).

No network APIs, paid calls, auto-downloads, private receipt export or changes to
the original browser recording. Run only after owner explicitly installs local
Kokoro runtime/model assets. The model receives safe, curated captions only.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import re
import subprocess
import sys
import uuid
from datetime import datetime
from pathlib import Path

from mix_private_voice import mix_timeline
from recover_owner_voice_mux import recover

ROOT = Path(__file__).resolve().parents[1]
VOICES = {"af_heart", "af_bella", "af_sarah", "af_nicole", "am_michael",
          "am_adam", "bf_emma", "bf_isabella", "bm_george", "bm_lewis"}


def validated_source(root: Path):
    if subprocess.run(["git", "-C", str(root), "status", "--porcelain"],
                      capture_output=True, text=True, check=True).stdout.strip():
        raise ValueError("CLEAN_GIT_SOURCE_REQUIRED")
    head = subprocess.check_output(["git", "-C", str(root), "rev-parse", "HEAD"],
                                   text=True).strip()
    video_dir = root / "output" / "videos"
    for path in sorted(video_dir.glob("paypal-synthetic-review-*.manifest.json"),
                       key=lambda p: p.stat().st_mtime, reverse=True):
        if path.is_symlink():
            continue
        try:
            d = json.loads(path.read_text(encoding="utf-8-sig"))
            if not (
                d.get("source_commit_sha") == head and
                d.get("source_tracked_tree_clean") is True and
                d.get("presentation_mode") == "GUIDED_REAL_BROWSER_CURSOR_NO_POST_ZOOM" and
                d.get("narration_script_version") == "PROOFLINE_PREMIUM_CUES_V1" and
                d.get("provider_calls") == 0 and
                d.get("payment_posts") == 0 and
                d.get("publicly_uploaded") is False
            ):
                continue
            cues = d["narration_cues"]
            if not isinstance(cues, list) or not (10 <= len(cues) <= 24):
                continue
            if any(not isinstance(c, dict) or
                   not isinstance(c.get("text"), str) or
                   not 4 <= len(c["text"]) <= 250 or
                   type(c.get("at_seconds")) not in (int, float) or
                   not 0 <= c["at_seconds"] < 179 for c in cues):
                continue
            name = d["video_filename"]
            if not re.fullmatch(r"paypal-synthetic-review-\d{8}-\d{6}\.webm", name):
                continue
            source = video_dir / name
            if source.is_symlink() or not source.is_file():
                continue
            if hashlib.sha256(source.read_bytes()).hexdigest() != d["video_sha256"]:
                continue
            return video_dir, source, cues
        except (KeyError, TypeError, ValueError, OSError):
            continue
    raise ValueError("RECORDED_PREMIUM_CLEAN_SOURCE_NOT_FOUND__RECORD_NEW_FILM")


def synthesize(root: Path, voice: str):
    if voice not in VOICES:
        raise ValueError("VOICE_NOT_ALLOWLISTED")
    video_dir, source, cues = validated_source(root)
    assets = root / "output" / "voice-models"
    model = assets / "kokoro-v1.0.fp16.onnx"
    voicepack = assets / "voices-v1.0.bin"
    if (not model.is_file() or model.is_symlink() or
        model.stat().st_size < 150_000_000 or
        not voicepack.is_file() or voicepack.is_symlink() or
        voicepack.stat().st_size < 10_000_000):
        raise ValueError("LOCAL_KOKORO_MODEL_ASSETS_REQUIRED__NO_DOWNLOAD_PERFORMED")
    try:
        import soundfile as sf
        from kokoro_onnx import Kokoro
    except ImportError as exc:
        raise ValueError("LOCAL_KOKORO_RUNTIME_REQUIRED__NO_AUTOINSTALL") from exc
    # Pinned hashes from upstream model-files-v1.1 artifacts; refuse altered
    # models even when filenames and file sizes look plausible.
    if hashlib.sha256(model.read_bytes()).hexdigest() != (
            "f3a290d384fbb27966d462905c71a46cef9e5fd00516b40df32a0b4afe77ac96"):
        raise ValueError("KOKORO_FP16_MODEL_SHA256_MISMATCH")
    if hashlib.sha256(voicepack.read_bytes()).hexdigest() != (
            "bca610b8308e8d99f32e6fe4197e7ec01679264efed0cac9140fe9c29f1fbf7d"):
        raise ValueError("KOKORO_VOICE_FILE_SHA256_MISMATCH")
    kokoro = Kokoro(str(model), str(voicepack))
    if voice not in kokoro.get_voices():
        raise ValueError("REQUESTED_NEURAL_VOICE_NOT_IN_LOCAL_MODEL")

    stamp = datetime.now().strftime("%Y%m%d-%H%M%S") + "-" + uuid.uuid4().hex[:6]
    wav_dir = video_dir / ("private-voice-kokoro-" + stamp)
    wav_dir.mkdir(mode=0o700)
    timeline = []
    for index, cue in enumerate(cues, 1):
        # Offline Kokoro uses local model weights; text does not leave this PC.
        samples, sample_rate = kokoro.create(
            cue["text"], voice=voice, speed=0.96, lang="en-us")
        if sample_rate != 24000 or len(samples) < sample_rate // 4 or (
            len(samples) > sample_rate * 25):
            raise ValueError("NEURAL_AUDIO_RATE_OR_DURATION_INVALID")
        name = f"voice_{index:02d}.wav"
        sf.write(str(wav_dir / name), samples, sample_rate, subtype="PCM_16")
        timeline.append({"file": name, "at_seconds": cue["at_seconds"]})
    (wav_dir / "timeline.json").write_text(
        json.dumps({"items": timeline}, ensure_ascii=False), encoding="utf-8")
    mix_result = mix_timeline(wav_dir / "timeline.json", wav_dir / "narration.wav",
                              rate=24000)
    (wav_dir / "neural_voice_report.json").write_text(json.dumps({
        "status": "PRIVATE_OFFLINE_NEURAL_NARRATION_READY",
        "engine": "Kokoro-82M ONNX FP16 (local)",
        "voice": voice,
        "sourceVideo": source.name,
        "cueCount": len(timeline),
        "sampleRate": 24000,
        "mixDuration": mix_result["seconds"],
        "modelFileSHA256": hashlib.sha256(model.read_bytes()).hexdigest(),
        "voiceFileSHA256": hashlib.sha256(voicepack.read_bytes()).hexdigest(),
        "providerCalls": 0, "publiclyUploaded": False,
        "qualityReviewed": False
    }, indent=2), encoding="utf-8")
    print("PRIVATE_OFFLINE_NEURAL_NARRATION_READY", flush=True)
    print("NEURAL_VOICE " + voice, flush=True)
    print("SAFE_CUES " + str(len(timeline)), flush=True)
    # Existing time-bounded mux and independent media stream verification.
    return recover(root)


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--voice", default="af_heart", choices=sorted(VOICES))
    args = parser.parse_args()
    try:
        synthesize(ROOT, args.voice)
    except (OSError, ValueError, subprocess.SubprocessError) as exc:
        print("NEURAL_VOICE_FAILED " + str(exc), file=sys.stderr)
        sys.exit(2)
