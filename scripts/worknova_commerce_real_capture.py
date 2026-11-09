#!/usr/bin/env python3
"""Private 30s genuine Chromium/Node UI scene: automated clicks, fake money only.

Never publishes, contacts providers, uses private user credentials, or edits film.
The browser shows the real local app, not a simulated slide/video animation.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import queue
import re
import subprocess
import sys
import threading
import time
import uuid
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urlsplit

ROOT = Path(__file__).resolve().parents[1]
SENSITIVE = re.compile(
    r"SECRET|TOKEN|PASSWORD|CREDENTIAL|API_KEY|CLIENT_ID|MERCHANT_ID|"
    r"GEMINI|PAYPAL|OPENAI|AUTHORIZATION|PRIVATE_KEY|NODE_OPTIONS", re.I
)
ACTIONS = ("grant", "negotiate", "verify", "license", "review")


def sha256(path):
    h = hashlib.sha256()
    with path.open("rb") as source:
        for data in iter(lambda: source.read(1024 * 1024), b""):
            h.update(data)
    return h.hexdigest()


def verify_source():
    sha = subprocess.check_output(
        ["git", "rev-parse", "HEAD"], cwd=ROOT, text=True, timeout=8
    ).strip()
    if not re.fullmatch(r"[a-f0-9]{40}", sha):
        raise ValueError("GIT_SHA_REQUIRED")
    if subprocess.check_output(
        ["git", "status", "--porcelain"], cwd=ROOT, text=True, timeout=8
    ).strip():
        raise ValueError("CLEAN_GIT_SOURCE_REQUIRED")
    if os.environ.get("GITHUB_SHA") and sha != os.environ["GITHUB_SHA"]:
        raise ValueError("GITHUB_RUN_SHA_MISMATCH")
    from record_judge_demo import chrome_binary
    if not Path(chrome_binary()).is_file():
        raise ValueError("LOCAL_CHROME_NOT_AVAILABLE")
    from playwright.sync_api import sync_playwright  # noqa: F401
    return sha


def launch():
    env = {k: v for k, v in os.environ.items() if not SENSITIVE.search(k)}
    proc = subprocess.Popen(
        ["node", "--experimental-sqlite", "scripts/run_commerce_control_plane.mjs"],
        cwd=ROOT, env=env, stdin=subprocess.DEVNULL,
        stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
        text=True, encoding="utf-8", errors="replace", bufsize=1,
    )
    lines = queue.Queue()
    threading.Thread(
        target=lambda: [lines.put(line) for line in proc.stdout],
        daemon=True,
    ).start()
    try:
        for _ in range(16):
            try:
                line = lines.get(timeout=1.5)
            except queue.Empty:
                if proc.poll() is not None:
                    break
                continue
            match = re.search(r"http://127[.]0[.]0[.]1:[0-9]{1,5}", line)
            if match:
                return proc, match.group()
    finally:
        if proc.poll() is not None:
            proc.stdout.close()
    proc.terminate()
    proc.wait(timeout=5)
    raise ValueError("LOCAL_COMMERCE_DEMO_DID_NOT_START")


def record(destination, head):
    from playwright.sync_api import sync_playwright, expect
    from record_judge_demo import chrome_binary
    from worknova_owner_capture import CURSOR_JS

    destination = destination.resolve()
    if destination.is_symlink():
        raise ValueError("OUTPUT_DIR_SYMLINK_REJECTED")
    destination.mkdir(parents=True, exist_ok=True)
    stamp = datetime.now().strftime("%Y%m%d-%H%M%S") + "-" + uuid.uuid4().hex[:6]
    output = destination / ("worknova-commerce-real-browser-" + stamp + ".webm")
    report_path = output.with_suffix(".manifest.json")
    if output.exists() or report_path.exists():
        raise FileExistsError("NO_OVERWRITE_POLICY")

    proc, address = launch()
    blocked = []
    posts = []
    video = None
    report_state = None
    start = time.monotonic()
    try:
        with sync_playwright() as p:
            browser = p.chromium.launch(
                executable_path=chrome_binary(), headless=True,
                args=["--no-sandbox", "--disable-dev-shm-usage",
                      "--disable-background-networking"],
            )
            try:
                context = browser.new_context(
                    viewport={"width": 1600, "height": 900},
                    record_video_dir=str(destination),
                    record_video_size={"width": 1600, "height": 900},
                )
                try:
                    context.add_init_script(script=CURSOR_JS)
                    page = context.new_page()
                    page.set_default_timeout(12000)
                    expected_port = urlsplit(address).port

                    def local_only(route):
                        request = route.request
                        parsed = urlsplit(request.url)
                        if parsed.scheme != "http" or parsed.hostname != "127.0.0.1" or parsed.port != expected_port:
                            blocked.append(request.url)
                            route.abort()
                            return
                        if request.method == "POST":
                            posts.append(parsed.path)
                        route.continue_()

                    page.route("**/*", local_only)
                    page.goto(address + "/", wait_until="domcontentloaded", timeout=15000)
                    expect(page.locator("#progress")).to_have_text("0 / 5 STEPS")
                    page.evaluate("""() => {
                      const badge = document.createElement('div');
                      badge.textContent = 'LIVE LOCAL UI • AUTOMATED CHROMIUM CLICKS • SYNTHETIC ONLY';
                      Object.assign(badge.style, {
                        position:'fixed', bottom:'12px', right:'14px',
                        zIndex:'2147483600', padding:'7px 13px',
                        font:'700 12px Segoe UI, sans-serif',
                        letterSpacing:'.04em', background:'#071320e8',
                        color:'#8dffe2', border:'1px solid #2f8091',
                        borderRadius:'7px', pointerEvents:'none'
                      });
                      document.body.append(badge);
                    }""")

                    def until(second):
                        delay = second - (time.monotonic() - start)
                        if delay > 0:
                            page.wait_for_timeout(round(delay * 1000))

                    for number, (action, second) in enumerate(
                        zip(ACTIONS, (3, 7, 11, 15, 19)), 1
                    ):
                        until(second)
                        page.locator('button[data-action="' + action + '"]').click()
                        expect(page.locator("#progress")).to_have_text(
                            str(number) + " / 5 STEPS"
                        )
                        expect(page.locator("#provider")).to_have_text("0")
                    until(23)
                    approved = page.evaluate(
                        "async () => (await fetch('/api/state')).json()"
                    )
                    if (approved["step"] != 5 or
                        approved["reservedMinor"] != 46000 or
                        approved["remainingMinor"] != 4000 or
                        approved["paypalProviderCalls"] != 0 or
                        approved["realPayments"] != 0 or
                        approved["humanReviewReady"] is not True or
                        not re.fullmatch(r"[0-9a-f]{64}",
                            approved["gate"]["auditDigest"])):
                        raise ValueError("RECORDED_REVIEW_STATE_INVALID")
                    until(24)
                    page.locator("#unsafe").click()
                    expect(page.locator("#progress")).to_have_text("5 / 5 STEPS")
                    until(27)
                    page.locator("#revoke").click()
                    expect(page.locator("#status")).to_have_text(
                        "MANDATE REVOKED · REVIEW HOLD"
                    )
                    report_state = page.evaluate(
                        "async () => (await fetch('/api/state')).json()"
                    )
                    if (report_state["humanReviewReady"] is not False or
                        report_state["mandateStatus"] != "REVOKED" or
                        report_state["reservedMinor"] != 46000 or
                        report_state["paypalProviderCalls"] != 0 or
                        report_state["realPayments"] != 0):
                        raise ValueError("REVOCATION_VIDEO_STATE_INVALID")
                    until(30)
                    video = page.video
                finally:
                    context.close()
            finally:
                browser.close()
        if len(posts) != 7 or any(path != "/api/action" for path in posts):
            raise ValueError("SEVEN_LOCAL_ONLY_SYNTHETIC_ACTIONS_REQUIRED")
        if blocked:
            raise ValueError("EXTERNAL_BROWSER_REQUEST_BLOCKED__NO_FILM")
        if video is None:
            raise ValueError("VIDEO_CAPTURE_NOT_AVAILABLE")
        tmp = Path(video.path())
        if not tmp.is_file() or tmp.stat().st_size < 10_000:
            raise ValueError("CAPTURED_VIDEO_EMPTY")
        if verify_source() != head:
            raise ValueError("SOURCE_CHANGED_DURING_CAPTURE")
        if output.exists():
            raise FileExistsError("OUTPUT_COLLISION")
        tmp.rename(output)
        metadata = {
            "status": "PRIVATE_GENUINE_CHROMIUM_COMMERCE_30S_NOT_PUBLISHED",
            "source_sha": head,
            "original_server": "127.0.0.1_ONLY",
            "capture_mode": "AUTOMATED_ACTUAL_CHROMIUM_BROWSER",
            "owner_operated_clicks_claimed": False,
            "steps": list(ACTIONS),
            "actual_step_clicks": 5,
            "policy_probe_clicks": 1,
            "revoke_clicks": 1,
            "local_http_post_actions": 7,
            "reservedMinor": 46000,
            "remainingMinor": 4000,
            "review_ready_before_revoke": True,
            "review_ready_after_revoke": False,
            "provider_calls": 0,
            "payment_posts": 0,
            "external_requests": 0,
            "published": False,
            "devpost_submitted": False,
            "release_hold": True,
            "clip_sha256": sha256(output),
            "clip_bytes": output.stat().st_size,
            "clip_filename": output.name,
            "created_utc": datetime.now(timezone.utc).isoformat(),
        }
        report_path.write_text(json.dumps(metadata, indent=2) + "\n", encoding="utf-8")
        print("WORKNOVA_PRIVATE_REAL_CHROMIUM_COMMERCE_CAPTURE_PASS " + str(output))
        print("FIVE_STEPS+SAFETY+REVOKE PROVIDER=0 OWNER_CLICKS_CLAIMED=NO UPLOAD=NO")
        return output
    finally:
        if proc.poll() is None:
            proc.terminate()
            try:
                proc.wait(timeout=6)
            except subprocess.TimeoutExpired:
                proc.kill()
                proc.wait(timeout=5)
        if proc.stdout:
            proc.stdout.close()


def main():
    parser = argparse.ArgumentParser(description="Private factual offline commerce UI footage")
    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument("--check", action="store_true")
    group.add_argument("--run", action="store_true")
    parser.add_argument("--output-dir", type=Path, default=ROOT / "output" / "videos")
    args = parser.parse_args()
    try:
        head = verify_source()
        if args.check:
            print(json.dumps({
                "status": "WORKNOVA_REAL_COMMERCE_CAPTURE_PREFLIGHT_PASS",
                "source_sha": head, "mode": "AUTOMATED_NOT_OWNER_CLICKS",
                "provider_calls": 0, "published": False,
            }))
        else:
            record(args.output_dir, head)
        return 0
    except (OSError, ValueError, RuntimeError, ImportError, subprocess.SubprocessError) as exc:
        print("WORKNOVA_REAL_COMMERCE_CAPTURE_STOP " + str(exc), file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
