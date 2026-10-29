"""Record a synthetic, credential-free PayPal hackathon browser walkthrough.

Requires the same installed Python Playwright and Chrome/Chromium used by browser E2E.
Produces a local silent .webm file; NEVER uploads, submits or contacts providers.
"""
import argparse
import os
import queue
import re
import shutil
import subprocess
import sys
import threading
import time
from datetime import datetime
from pathlib import Path
from urllib.parse import urlsplit
from playwright.sync_api import sync_playwright, expect

ROOT = Path(__file__).resolve().parents[1]
SECRET = re.compile(r"(SECRET|TOKEN|PASSWORD|CREDENTIAL|API_KEY|CLIENT_ID|MERCHANT_ID|GEMINI|PAYPAL|OPENAI|AUTHORIZATION|PRIVATE_KEY|NODE_OPTIONS)", re.I)


def chrome_binary():
    candidate = os.environ.get("BROWSER_CHROME_PATH")
    if candidate and Path(candidate).is_file():
        return candidate
    for exe in ("google-chrome", "google-chrome-stable", "chromium", "chrome"):
        path = shutil.which(exe)
        if path:
            return path
    if os.name == "nt":
        for folder in filter(None, (os.environ.get("PROGRAMFILES"), os.environ.get("PROGRAMFILES(X86)"), os.environ.get("LOCALAPPDATA"))):
            path = Path(folder) / "Google" / "Chrome" / "Application" / "chrome.exe"
            if path.is_file():
                return str(path)
    raise RuntimeError("CHROME_OR_CHROMIUM_REQUIRED")


def start_demo():
    env = {k: v for k, v in os.environ.items() if not SECRET.search(k)}
    proc = subprocess.Popen(
        ["node", "--experimental-sqlite", "scripts/run_demo.mjs"],
        cwd=ROOT, env=env, stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
        text=True, encoding="utf-8", errors="replace", bufsize=1,
    )
    lines = queue.Queue()
    threading.Thread(target=lambda: [lines.put(line) for line in proc.stdout], daemon=True).start()
    deadline = time.monotonic() + 20
    while time.monotonic() < deadline:
        try:
            line = lines.get(timeout=0.5)
        except queue.Empty:
            if proc.poll() is not None:
                break
            continue
        match = re.search(r"http://127\.0\.0\.1:\d+", line)
        if match:
            return proc, match.group(0)
    proc.terminate()
    try:
        proc.wait(timeout=4)
    except subprocess.TimeoutExpired:
        proc.kill()
    raise RuntimeError("LOCAL_DEMO_START_FAILED")


def capture(output_dir, pace_ms):
    binary = chrome_binary()
    output_dir.mkdir(parents=True, exist_ok=True)
    server, address = start_demo()
    video_file = None
    unsafe_requests = []
    post_paths = []
    try:
        with sync_playwright() as p:
            browser = p.chromium.launch(executable_path=binary, headless=True,
                                        args=["--no-sandbox", "--disable-dev-shm-usage"])
            try:
                context = browser.new_context(
                    viewport={"width": 1280, "height": 900},
                    record_video_dir=str(output_dir),
                    record_video_size={"width": 1280, "height": 900},
                )
                page = context.new_page()
                page.set_default_timeout(10000)

                def intercept(route):
                    url = urlsplit(route.request.url)
                    if url.scheme not in ("http", "https") or url.hostname != "127.0.0.1" or url.netloc != urlsplit(address).netloc:
                        unsafe_requests.append(route.request.url)
                        route.abort()
                    else:
                        if route.request.method == "POST":
                            post_paths.append(url.path)
                        route.continue_()

                page.route("**/*", intercept)
                pause = lambda: page.wait_for_timeout(pace_ms)
                def caption(label):
                    # Presenter captions are part of the video, never injected into
                    # the trusted application or sent to a provider.
                    page.evaluate("""(label) => {
                      let e=document.getElementById('video-presenter-caption');
                      if(!e){
                        e=document.createElement('div');
                        e.id='video-presenter-caption';
                        Object.assign(e.style,{
                          position:'fixed',left:'4%',right:'4%',bottom:'8px',
                          background:'rgba(11,22,39,.94)',color:'#fff',
                          font:'bold 20px/1.35 system-ui,sans-serif',
                          padding:'12px 18px',borderRadius:'9px',
                          zIndex:'9999',pointerEvents:'none',textAlign:'center'
                        });
                        document.body.append(e);
                      }
                      e.textContent=label;
                    }""",label)
                page.goto(address, wait_until="domcontentloaded")
                expect(page.locator("#message")).to_contain_text("Offline demo ready")
                expect(page.locator("#marketplace-submit")).to_be_enabled()
                caption("PROOFLINE | AI-assisted work, human authorization, accountable evidence. OFFLINE SYNTHETIC DEMO.")
                pause()

                page.locator("#marketplace-submit").click()
                expect(page.locator("#marketplace-choose-synthetic-web")).to_be_visible()
                page.locator("#marketplace-choose-synthetic-web").click()
                expect(page.locator("#scope")).to_have_value(re.compile("Synthetic candidate: synthetic-web"))
                caption("Three FICTIONAL profiles. Deterministic matching shows missing skills; no real seller network or AI model in this browser.")
                pause()

                page.locator("#draft-submit").click()
                expect(page.locator("#quote-view")).to_contain_text("Version 2")
                page.locator("#dollars").fill("15.00")
                page.locator("#confirm").check()
                page.locator("#approve-submit").click()
                expect(page.locator("#quote-view")).to_contain_text("APPROVED")
                caption("OFFLINE MOCK proposal. A HUMAN approves a specific quote version and amount; no payment is authorized.")
                pause()

                page.locator("#contract-create").click()
                expect(page.locator("#contract-fulfillment")).to_have_text("PENDING")
                page.locator("#delivery-submit").click()
                expect(page.locator("#contract-fulfillment")).to_have_text("SUBMITTED")
                caption("Owner creates an unpaid contract and submits a synthetic delivery for an independent reviewer decision.")
                pause()

                page.locator("#demo-role-toggle").click()
                expect(page.locator("#demo-session-role")).to_contain_text("synthetic reviewer")
                page.locator("#review-reject").click()
                expect(page.locator("#contract-fulfillment")).to_have_text("REJECTED")
                caption("Synthetic reviewer REJECTED delivery. The owner must revise and resubmit; previous review cannot be silently reused.")
                pause()

                page.locator("#demo-role-toggle").click()
                expect(page.locator("#demo-session-role")).to_contain_text("synthetic owner")
                page.locator("#delivery-note").fill("Revised synthetic project deliverables, version 2")
                page.locator("#delivery-submit").click()
                expect(page.locator("#contract-fulfillment")).to_have_text("SUBMITTED")
                page.locator("#demo-role-toggle").click()
                expect(page.locator("#demo-session-role")).to_contain_text("synthetic reviewer")
                page.locator("#review-accept").click()
                expect(page.locator("#contract-fulfillment")).to_have_text("ACCEPTED")
                page.locator("#demo-role-toggle").click()
                expect(page.locator("#demo-session-role")).to_contain_text("synthetic owner")
                expect(page.locator("#contract-events")).to_contain_text("REJECTED")
                expect(page.locator("#contract-events")).to_contain_text("ACCEPTED")
                expect(page.locator("#contract-payment")).to_have_text("NOT_CAPTURED")
                caption("Read-only SQLite audit timeline: CREATED → SUBMITTED → REJECTED → RESUBMITTED → ACCEPTED. Payment remains NOT_CAPTURED.")
                pause()

                page.locator("#evidence-refresh").click()
                expect(page.locator("#evidence-details")).to_contain_text("local audit chain: PASS")
                page.locator("#historical-provider-evidence summary").click()
                expect(page.locator("#historical-provider-evidence")).to_contain_text("NOT INDEPENDENTLY REPRODUCED")
                caption("Separate owner-observed 2026-10-28 Gemini + PayPal SANDBOX test. Historical proof only; this browser never contacts providers.")
                pause()

                page.reload()
                expect(page.locator("#contract-events")).to_contain_text("ACCEPTED")
                caption("MIT open source | run the local demo from lead/paypal. DB health and audit counts are synthetic; production integration is future work.")
                pause()
                assert not unsafe_requests, "EXTERNAL_REQUEST_BLOCKED"
                assert not any("/orders" in x or "/capture" in x for x in post_paths), "PAYMENT_POST_FORBIDDEN"
                video_file = page.video
                context.close()
            finally:
                browser.close()
        if video_file is None:
            raise RuntimeError("NO_VIDEO_RECORDED")
        source = Path(video_file.path())
        if not source.is_file() or source.stat().st_size == 0:
            raise RuntimeError("EMPTY_VIDEO_RECORDING")
        filename = "paypal-synthetic-review-" + datetime.now().strftime("%Y%m%d-%H%M%S") + ".webm"
        dest = output_dir / filename
        if dest.exists():
            raise RuntimeError("OUTPUT_WOULD_OVERWRITE")
        shutil.move(source, dest)
        print("RECORDED_SYNTHETIC_ONLY " + str(dest))
        print("SOURCE_SCOPE=LOCALHOST_ONLY PROVIDER_CALLS=0 PAYMENT_POSTS=0 PUBLIC_UPLOAD=NO")
        return dest
    finally:
        if server.poll() is None:
            server.terminate()
            try:
                server.wait(timeout=5)
            except subprocess.TimeoutExpired:
                server.kill()
                server.wait(timeout=5)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Private OFFLINE browser walkthrough recording; never publishes.")
    parser.add_argument("--output-dir", default=str(ROOT / "output" / "videos"))
    parser.add_argument("--pace-ms", type=int, default=14000)
    args = parser.parse_args()
    if not (200 <= args.pace_ms <= 18000):
        parser.error("pace must be 200–18000 milliseconds")
    try:
        capture(Path(args.output_dir).resolve(), args.pace_ms)
    except Exception as exc:
        # Do not print subprocess environment, traceback or private filesystem internals.
        print("RECORDING_FAILED " + str(exc), file=sys.stderr)
        sys.exit(1)
