#!/usr/bin/env python3
"""Private film compositing: replace 45–75s editorial clip with actual Chromium UI.

Requires a SHA-pinned, owner-held 170s safe film and a locally recorded,
manifest-proven 30s real offline browser scene. Read-only sources; no upload.
"""
from __future__ import annotations
import argparse
import hashlib
import json
import re
import shutil
import subprocess
import sys
import uuid
from datetime import datetime, timezone
from pathlib import Path

SAFE_ORIGINAL_SHA256 = "99a440913eb7cac25ab75e9f467300d50c6c6dcc49dd6d8ca77bbc4b5d3f4578"
EXPECTED_SECONDS = 170.0
INSERT_START, INSERT_SECONDS = 45, 30
EXPECTED_SCENE_STATUS = "PRIVATE_GENUINE_CHROMIUM_COMMERCE_30S_NOT_PUBLISHED"


def sha(path):
    h = hashlib.sha256()
    with path.open("rb") as inp:
        for chunk in iter(lambda: inp.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


def probe(path):
    command = shutil.which("ffprobe")
    if not command:
        raise ValueError("FFPROBE_REQUIRED_FOR_REAL_FILM_QA")
    result = subprocess.run(
        [command, "-v", "error", "-show_entries",
         "format=duration:stream=codec_type,codec_name,width,height",
         "-of", "json", str(path)],
        capture_output=True, text=True, timeout=25,
    )
    if result.returncode:
        raise ValueError("MEDIA_FFPROBE_FAILED")
    return json.loads(result.stdout)


def validate(original, clip):
    for path in (original, clip):
        if not path.is_file() or path.is_symlink():
            raise ValueError("READ_ONLY_REAL_MEDIA_REQUIRED")
    if original.resolve() == clip.resolve():
        raise ValueError("FILM_CLIP_MUST_BE_DISTINCT")
    if sha(original) != SAFE_ORIGINAL_SHA256:
        raise ValueError("ONLY_SHA_PINNED_PUBLIC_SAFE_170S_FILM_ACCEPTED")
    manifest_file = clip.with_suffix(".manifest.json")
    if not manifest_file.is_file() or manifest_file.is_symlink():
        raise ValueError("ACTUAL_BROWSER_CAPTURE_MANIFEST_REQUIRED")
    metadata = json.loads(manifest_file.read_text(encoding="utf-8"))
    if (metadata.get("status") != EXPECTED_SCENE_STATUS or
        metadata.get("capture_mode") != "AUTOMATED_ACTUAL_CHROMIUM_BROWSER" or
        metadata.get("owner_operated_clicks_claimed") is not False or
        metadata.get("steps") != ["grant", "negotiate", "verify", "license", "review"] or
        metadata.get("actual_step_clicks") != 5 or
        metadata.get("local_http_post_actions") != 7 or
        metadata.get("reservedMinor") != 46000 or
        metadata.get("remainingMinor") != 4000 or
        metadata.get("review_ready_before_revoke") is not True or
        metadata.get("review_ready_after_revoke") is not False or
        metadata.get("provider_calls") != 0 or
        metadata.get("payment_posts") != 0 or
        metadata.get("external_requests") != 0 or
        metadata.get("published") is not False or
        metadata.get("release_hold") is not True or
        metadata.get("devpost_submitted") is not False or
        not re.fullmatch(r"[a-f0-9]{40}", str(metadata.get("source_sha"))) or
        clip.name != metadata.get("clip_filename") or
        clip.stat().st_size != metadata.get("clip_bytes") or
        sha(clip) != metadata.get("clip_sha256")):
        raise ValueError("CAPTURE_IS_NOT_PROVEN_ACTUAL_OFFLINE_BROWSER")
    source = probe(original)
    scene = probe(clip)
    film_duration = float(source.get("format", {}).get("duration", 0))
    scene_duration = float(scene.get("format", {}).get("duration", 0))
    base_streams = source.get("streams", [])
    movie = [x for x in base_streams if x.get("codec_type") == "video"]
    audio = [x for x in base_streams if x.get("codec_type") == "audio"]
    scene_video = [x for x in scene.get("streams", [])
                   if x.get("codec_type") == "video"]
    if (abs(film_duration - EXPECTED_SECONDS) > .1 or
        len(movie) != 1 or movie[0].get("codec_name") != "h264" or
        (movie[0].get("width"), movie[0].get("height")) != (1920, 1080) or
        len(audio) != 1 or audio[0].get("codec_name") != "aac"):
        raise ValueError("BASE_SAFE_FILM_FORMAT_OR_LENGTH_INVALID")
    if (not 27 <= scene_duration <= 38 or len(scene_video) != 1 or
        scene_video[0].get("width", 0) < 1280 or
        scene_video[0].get("height", 0) < 720):
        raise ValueError("ACTUAL_BROWSER_CLIP_TIMELINE_INVALID")
    return {
        "film_seconds": film_duration,
        "actual_browser_clip_seconds": scene_duration,
        "film_sha256": SAFE_ORIGINAL_SHA256,
        "clip_sha256": metadata["clip_sha256"],
        "capture_source_sha": metadata["source_sha"],
        "mode": "PRIVATE_REAL_UI_OVERLAY_NO_PROVIDER_NO_PUBLISH",
        "release_hold": True,
    }


def render(original, clip, output_dir):
    verified = validate(original, clip)
    ffmpeg = shutil.which("ffmpeg")
    if not ffmpeg:
        raise ValueError("FFMPEG_REQUIRED")
    output_dir = output_dir.resolve()
    if output_dir.is_symlink():
        raise ValueError("OUTPUT_DIR_SYMLINK_REJECTED")
    output_dir.mkdir(parents=True, exist_ok=True)
    stamp = datetime.now().strftime("%Y%m%d-%H%M%S") + "-" + uuid.uuid4().hex[:6]
    dest = output_dir / ("WORKNOVA_ACTUAL_UI_170s_PRIVATE_" + stamp + ".mp4")
    sidecar = dest.with_suffix(".json")
    if dest.exists() or sidecar.exists():
        raise FileExistsError("NO_ORIGINAL_OVERWRITE")
    # A 0.6-second alpha fade at either end avoids changing the original
    # timeline. Base AAC audio is stream-copied, not synthesized or replaced.
    filters = (
        "[1:v]scale=1920:1080:flags=lanczos,setsar=1,fps=25,"
        "tpad=stop_mode=clone:stop_duration=5,trim=duration=30,"
        "format=yuva420p,"
        "fade=t=in:st=0:d=0.6:alpha=1,"
        "fade=t=out:st=29.4:d=0.6:alpha=1,"
        "setpts=PTS-STARTPTS+45/TB[scene];"
        "[0:v][scene]overlay=0:0:format=auto:shortest=0:eof_action=pass,"
        "format=yuv420p[out]"
    )
    args = [
        ffmpeg, "-nostdin", "-hide_banner", "-loglevel", "error", "-n",
        "-i", str(original), "-i", str(clip),
        "-filter_complex", filters,
        "-map", "[out]", "-map", "0:a:0", "-c:v", "libx264",
        "-preset", "medium", "-crf", "18", "-pix_fmt", "yuv420p",
        "-c:a", "copy", "-movflags", "+faststart",
        "-t", str(EXPECTED_SECONDS), str(dest),
    ]
    try:
        done = subprocess.run(args, text=True, capture_output=True, timeout=600)
        if done.returncode:
            raise ValueError("PRIVATE_VIDEO_OVERLAY_FAILED: " + done.stderr[-300:])
        info = probe(dest)
        if (abs(float(info.get("format", {}).get("duration", 0)) - 170) > .15 or
            not any(s.get("codec_name") == "aac"
                    for s in info.get("streams", []))):
            raise ValueError("FINAL_PRIVATE_VIDEO_DURATION_OR_AUDIO_INVALID")
        report = {
            "status": "PRIVATE_REAL_BROWSER_REVIEW_CUT_NOT_OWNER_APPROVED",
            "video_filename": dest.name,
            "video_sha256": sha(dest),
            "video_bytes": dest.stat().st_size,
            **verified,
            "replacement_window_seconds": [INSERT_START,
                                           INSERT_START + INSERT_SECONDS],
            "real_browser_provenance": "AUTOMATED_CHROMIUM_LOCAL_NODE",
            "original_video_untouched": True,
            "original_aac_stream_copied": True,
            "video_reencoded_for_overlay": True,
            "audio_listening_approved": False,
            "new_voice_generated": False,
            "new_subtitles_generated": False,
            "owner_approved": False,
            "public_upload": False,
            "devpost_submitted": False,
            "created_utc": datetime.now(timezone.utc).isoformat(),
        }
        sidecar.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
        print("WORKNOVA_PRIVATE_ACTUAL_UI_170S_REVIEW_READY " + str(dest))
        print("SOURCE_FILM_PRESERVED=YES SYNTHETIC_UI=YES PUBLISH=NO")
        return dest
    except Exception:
        dest.unlink(missing_ok=True)
        raise


def main():
    parser = argparse.ArgumentParser(description="Private genuine-UI film compositor")
    parser.add_argument("--film", type=Path, required=True)
    parser.add_argument("--clip", type=Path, required=True)
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument("--check-only", action="store_true")
    mode.add_argument("--render", action="store_true")
    parser.add_argument("--output-dir", type=Path, default=Path("output") / "videos")
    args = parser.parse_args()
    try:
        proof = validate(args.film, args.clip)
        if args.check_only:
            print(json.dumps({"status": "PRIVATE_FILM_AND_ACTUAL_UI_CLIP_PREFLIGHT_PASS",
                              **proof}))
        else:
            render(args.film, args.clip, args.output_dir)
        return 0
    except (OSError, ValueError, KeyError, TypeError,
            subprocess.SubprocessError) as exc:
        print("WORKNOVA_REAL_VIDEO_COMPOSITOR_STOP " + str(exc), file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
