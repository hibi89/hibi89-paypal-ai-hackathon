#!/usr/bin/env python3
"""One owner-local command: real browser recording → private 170s review cut.

All source media is read-only. No provider, network beyond loopback, publish,
customer information, model download, payment, or replacement of original MP4.
"""
from __future__ import annotations
import argparse
import hashlib
import json
import shutil
import sys
from pathlib import Path
from worknova_commerce_real_capture import verify_source, record
from worknova_insert_real_demo import (
    SAFE_ORIGINAL_SHA256, EXPECTED_SECONDS, probe, render, sha,
)


def safe_film(path):
    if not path.is_file() or path.is_symlink():
        raise ValueError("ORIGINAL_SAFE_170S_VIDEO_REQUIRED")
    if sha(path) != SAFE_ORIGINAL_SHA256:
        raise ValueError("ORIGINAL_MUST_MATCH_PINNED_SAFE_170S_SHA")
    metadata = probe(path)
    if abs(float(metadata["format"]["duration"]) - EXPECTED_SECONDS) > .1:
        raise ValueError("ORIGINAL_VIDEO_TIMELINE_NOT_170S")
    if not shutil.which("ffmpeg"):
        raise ValueError("FFMPEG_REQUIRED_BEFORE_ANY_CAPTURE")
    return {"sha256": SAFE_ORIGINAL_SHA256,
            "seconds": EXPECTED_SECONDS, "readOnly": True}


def main():
    parser = argparse.ArgumentParser(
        description="Private WORKNOVA real UI 30s + safe owner 170s film"
    )
    parser.add_argument("--film", type=Path, required=True,
                        help="Local extracted WORKNOVA_AGENTIC_SAFE_170s_PRIVATE.mp4")
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument("--check", action="store_true")
    mode.add_argument("--run", action="store_true")
    parser.add_argument("--output-dir", type=Path,
                        default=Path("output") / "videos")
    args = parser.parse_args()
    try:
        head = verify_source()
        baseline = safe_film(args.film)
        if args.check:
            print(json.dumps({
                "status": "WORKNOVA_SAFE_REAL_VIDEO_ONE_COMMAND_PREFLIGHT_PASS",
                "source_sha": head, "original": baseline,
                "videoGenerated": False, "providerCalls": 0,
                "ownerApproved": False, "published": False,
            }))
            return 0
        # Capture is a distinct immutable file + manifest; if the final mux fails,
        # this original browser recording remains available for diagnosis.
        clip = record(args.output_dir, head)
        movie = render(args.film, clip, args.output_dir)
        if verify_source() != head:
            raise ValueError("SOURCE_CHANGED_BETWEEN_CAPTURE_AND_FINAL_VIDEO")
        print(json.dumps({
            "status": "WORKNOVA_PRIVATE_170S_REAL_UI_REVIEW_CREATED_NOT_RELEASED",
            "source_sha": head, "clip": str(clip), "film": str(movie),
            "base_film_sha256": baseline["sha256"],
            "new_review_sha256": sha(movie),
            "voiceApproved": False, "subtitleApproved": False,
            "providerCalls": 0, "published": False, "ownerApprovalRequired": True,
        }))
        return 0
    except (OSError, ValueError, RuntimeError, ImportError,
            KeyError, TypeError) as err:
        print("WORKNOVA_ONE_COMMAND_PRIVATE_VIDEO_STOP " + str(err),
              file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
