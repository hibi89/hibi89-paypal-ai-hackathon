#!/usr/bin/env python3
"""Private automatic WORKNOVA UI capture using verified existing Playwright journey.

Real local product UI is exercised automatically. This is NEVER owner-manual footage.
No real payment, provider APIs, account credentials, public upload or model downloads.
"""
from __future__ import annotations

import sys
sys.dont_write_bytecode = True

import argparse
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def preflight() -> str:
    from worknova_owner_capture import verify_source
    from record_judge_demo import chrome_binary
    from playwright.sync_api import sync_playwright  # noqa: F401
    head = verify_source()
    chrome = Path(chrome_binary())
    if not chrome.is_file():
        raise ValueError("LOCAL_CHROMIUM_NOT_FOUND")
    return head


def main() -> int:
    parser = argparse.ArgumentParser(
        description="WORKNOVA local synthetic browser AUTO recording; no owner clicks, no upload"
    )
    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument("--check", action="store_true")
    group.add_argument("--run", action="store_true")
    parser.add_argument("--pace-ms", type=int, default=5500)
    parser.add_argument("--output-dir", type=Path, default=ROOT / "output" / "videos")
    args = parser.parse_args()
    try:
        if not 200 <= args.pace_ms <= 8500:
            raise ValueError("AUTO_CAPTURE_PACE_OUT_OF_RANGE")
        head = preflight()
        if args.check:
            print(json.dumps({
                "status": "WORKNOVA_AUTO_CAPTURE_PREFLIGHT_PASS",
                "sourceSHA": head, "mode": "PLAYWRIGHT_AUTOMATED_NOT_HUMAN",
                "externalProviderCalls": 0, "paymentCalls": 0,
                "published": False
            }), flush=True)
            return 0

        from record_judge_demo import capture
        destination = capture(args.output_dir.resolve(), args.pace_ms, worknova=True)
        manifest = json.loads(destination.with_suffix(".manifest.json").read_text(encoding="utf-8"))
        if (manifest.get("product") != "WORKNOVA"
                or manifest.get("source_sha") != head
                or manifest.get("demonstrated_categories") != ["ai_work", "general_services"]
                or manifest.get("demonstrated_skills") != ["delegate", "a2a", "gift", "churn", "invoice"]
                or manifest.get("provider_calls") != 0
                or manifest.get("payment_posts") != 0
                or manifest.get("owner_operated_clicks_claimed") is not False
                or manifest.get("publication_approved") is not False):
            raise ValueError("AUTOMATED_FILM_PROVENANCE_CHECK_FAILED")
        from worknova_owner_capture import verify_source
        if verify_source() != head:
            raise ValueError("SOURCE_CHANGED_DURING_AUTO_CAPTURE")
        print("WORKNOVA_AUTOMATED_PRIVATE_CAPTURE_READY " + str(destination), flush=True)
        print("PART1=AI_WORK_GLOBAL_SERVICES PART2=FIVE_SKILLS", flush=True)
        print("HUMAN_CLICKS_CLAIMED=NO PROVIDER_CALLS=0 UPLOAD=NO RELEASE_HOLD", flush=True)
        return 0
    except (OSError, ValueError, RuntimeError, ImportError) as error:
        print("WORKNOVA_AUTO_CAPTURE_STOP " + str(error), file=sys.stderr, flush=True)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
