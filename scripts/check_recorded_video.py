"""Verify a private offline browser recording and its manifest. No network or uploads.

This is a reproducibility/integrity check of a synthetic file only, not a
provider attestation, media-duration probe, or approval to publish.
"""
import argparse
import hashlib
import json
import sys
from pathlib import Path

BASE = Path(__file__).resolve().parents[1]

def verify(directory):
    if not directory.is_dir():
        raise ValueError("LOCAL_VIDEO_DIRECTORY_MISSING")
    manifests = sorted(directory.glob("paypal-synthetic-review-*.manifest.json"),
                       key=lambda p: p.stat().st_mtime, reverse=True)
    if not manifests:
        raise ValueError("PRIVATE_MANIFEST_NOT_FOUND")
    path = manifests[0]
    data = json.loads(path.read_text(encoding="utf-8"))
    name = data.get("video_filename")
    if not isinstance(name, str) or not name.startswith("paypal-synthetic-review-") or not name.endswith(".webm"):
        raise ValueError("UNSAFE_VIDEO_FILENAME")
    video = directory / name
    if video.resolve().parent != directory.resolve() or video.is_symlink() or not video.is_file():
        raise ValueError("LOCAL_VIDEO_UNAVAILABLE")
    stat = video.stat()
    if stat.st_size <= 0 or stat.st_size > 250*1024*1024:
        raise ValueError("VIDEO_SIZE_UNSAFE")
    digest = hashlib.sha256()
    with video.open("rb") as source:
        for chunk in iter(lambda: source.read(1024*1024), b""):
            digest.update(chunk)
    if data.get("video_sha256") != digest.hexdigest() or data.get("video_bytes") != stat.st_size:
        raise ValueError("VIDEO_MANIFEST_INTEGRITY_MISMATCH")
    if data.get("evidence_class") != "OFFLINE_SYNTHETIC_BROWSER_CAPTURE_ONLY":
        raise ValueError("REAL_PROVIDER_CLAIM_FORBIDDEN")
    version = data.get("storyboard_version")
    if version in ("OPPORTUNITY_FIRST_V2", "OPPORTUNITY_FIRST_V3_FAKE_API_TRACE"):
        if data.get("demonstrated_categories") != ["ai_work", "general_services"]:
            raise ValueError("TWO_CATEGORY_VIDEO_EVIDENCE_MISSING")
    if version == "OPPORTUNITY_FIRST_V3_FAKE_API_TRACE":
        if (data.get("interactive_fake_api_trace_replayed_locally") is not True
            or data.get("interactive_fake_api_trace_actual_provider_calls") != 0
            or data.get("interactive_fake_api_trace_payment_posts") != 0):
            raise ValueError("FAKE_API_TRACE_MANIFEST_INVALID")
    if data.get("provider_calls") != 0 or data.get("payment_posts") != 0:
        raise ValueError("PROVIDER_ACTIVITY_CLAIM_FORBIDDEN")
    if data.get("publicly_uploaded") is not False or data.get("devpost_submitted") is not False:
        raise ValueError("UNAUTHORIZED_RELEASE_CLAIM")
    if data.get("owner_approval_for_publication") is not False or data.get("media_duration_independently_probed") is not False:
        raise ValueError("UNVERIFIED_PUBLICATION_OR_DURATION")
    elapsed = data.get("wall_clock_elapsed_seconds")
    if not isinstance(elapsed, (int,float)) or isinstance(elapsed,bool) or not (0 < elapsed < 178):
        raise ValueError("VIDEO_RECORDING_TIME_LIMIT_UNVERIFIED")
    if video.with_suffix(".manifest.json") != path:
        raise ValueError("MANIFEST_PATH_MISMATCH")
    print("LOCAL_VIDEO_INTEGRITY_PASS " + video.name + " bytes=" + str(stat.st_size))
    print("OFFLINE_SYNTHETIC_ONLY PUBLIC_UPLOAD=NO DEVPOST=NO MEDIA_DURATION_INDEPENDENTLY_VERIFIED=NO")
    return video

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Validate ignored local synthetic video + hash manifest")
    parser.add_argument("--dir", default=str(BASE / "output" / "videos"))
    args = parser.parse_args()
    try:
        verify(Path(args.dir).resolve())
    except Exception as e:
        print("LOCAL_VIDEO_INTEGRITY_FAIL: " + str(e), file=sys.stderr)
        sys.exit(1)
