"""Record a synthetic, credential-free PayPal hackathon browser walkthrough.

Requires the same installed Python Playwright and Chrome/Chromium used by browser E2E.
Produces a local silent .webm file; NEVER uploads, submits or contacts providers.
"""
import argparse
import hashlib
import json
import os
import queue
import re
import shutil
import subprocess
import sys
import threading
import time
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urlsplit
from playwright.sync_api import sync_playwright, expect
from video_owner_evidence import collect_saved_receipt, storyboard_cards, preserve_private_recording

ROOT = Path(__file__).resolve().parents[1]
SECRET = re.compile(r"(SECRET|TOKEN|PASSWORD|CREDENTIAL|API_KEY|CLIENT_ID|MERCHANT_ID|GEMINI|PAYPAL|OPENAI|AUTHORIZATION|PRIVATE_KEY|NODE_OPTIONS)", re.I)


def git_source_snapshot():
    """Read Git commit and tracked-code cleanliness; no network or file writes."""
    try:
        sha = subprocess.run(
            ["git", "rev-parse", "--verify", "HEAD"], cwd=ROOT,
            capture_output=True, text=True, timeout=4, check=True
        ).stdout.strip()
        if not re.fullmatch(r"[0-9a-f]{40}", sha):
            return {"sha": None, "clean": False}
        clean = all(subprocess.run(
            args, cwd=ROOT, stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL, timeout=4
        ).returncode == 0 for args in (
            ["git", "diff", "--quiet", "--"],
            ["git", "diff", "--cached", "--quiet", "--"],
        ))
        return {"sha": sha, "clean": clean}
    except (OSError, subprocess.SubprocessError):
        return {"sha": None, "clean": False}


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
    source_snapshot = git_source_snapshot()
    binary = chrome_binary()
    # Explicit local read-only snapshot of the owner's earlier evidence.
    # CI has no original private receipt and falls back to owner-reported labels.
    proof = collect_saved_receipt(ROOT)
    output_dir.mkdir(parents=True, exist_ok=True)
    server, address = start_demo()
    video_file = None
    two_verticals_verified = False
    synthetic_protocol_replay_verified = False
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
                video_started = time.monotonic()
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
                def evidence_overlay(card):
                    # Strict allowlisted display data only. Text nodes, never HTML;
                    # original private receipt values/IDs are not copied to a page.
                    page.evaluate("""({heading, eyebrow, lines}) => {
                      let panel=document.getElementById('owner-evidence-video-slide');
                      if(!panel){
                        panel=document.createElement('section');
                        panel.id='owner-evidence-video-slide';
                        Object.assign(panel.style,{
                          position:'fixed',inset:'0',zIndex:'10000',
                          background:'linear-gradient(135deg,#071b38,#142f53)',
                          color:'#ffffff',padding:'64px 74px',
                          font:'22px/1.5 system-ui,sans-serif',
                          display:'flex',flexDirection:'column',
                          justifyContent:'center'
                        });
                        document.body.appendChild(panel);
                      }
                      panel.replaceChildren();
                      const tag=document.createElement('p');
                      tag.textContent='PROOFLINE / SEPARATE HISTORICAL EVIDENCE';
                      Object.assign(tag.style,{
                        color:'#80e0ff',fontSize:'16px',letterSpacing:'2px',
                        fontWeight:'800',margin:'0 0 24px'
                      });
                      panel.appendChild(tag);
                      const headingNode=document.createElement('h2');
                      headingNode.textContent=heading;
                      Object.assign(headingNode.style,{
                        fontSize:'39px',lineHeight:'1.2',margin:'0 0 16px'
                      });
                      panel.appendChild(headingNode);
                      const source=document.createElement('p');
                      source.textContent=eyebrow;
                      Object.assign(source.style,{
                        color:'#ffdf91',fontSize:'19px',
                        fontWeight:'800',margin:'0 0 30px'
                      });
                      panel.appendChild(source);
                      for(const line of lines){
                        const item=document.createElement('p');
                        item.textContent='• '+line;
                        Object.assign(item.style,{
                          fontSize:'20px',margin:'0 0 15px',maxWidth:'1140px'
                        });
                        panel.appendChild(item);
                      }
                      const foot=document.createElement('p');
                      foot.textContent='PRIVATE LOCAL READ-ONLY HISTORY · NO NEW PROVIDER REQUESTS';
                      Object.assign(foot.style,{
                        fontSize:'13px',color:'#a3b9d8',margin:'22px 0 0'
                      });
                      panel.appendChild(foot);
                    }""", card)
                page.goto(address, wait_until="domcontentloaded")
                expect(page.locator("#message")).to_contain_text("Offline demo ready")
                expect(page.locator("#marketplace-submit")).to_be_enabled()
                caption("PROOFLINE | AI should open the first door to work — not just automate existing work. OFFLINE SYNTHETIC DEMO.")
                pause()

                # Show source classes directly in the product before any mock transaction.
                proof_map = page.locator("#proof-map-panel")
                expect(proof_map).to_contain_text("INJECTED FAKE APIS")
                expect(proof_map).to_contain_text("OWNER-REPORTED HISTORY")
                expect(proof_map).to_contain_text("NOT YET SUBMITTED")
                proof_map.scroll_into_view_if_needed()
                caption("EVIDENCE MAP | Offline browser + injected fake APIs are NOT the owner's historical Gemini/PayPal Sandbox receipt.")
                page.wait_for_timeout(min(pace_ms, 4500))

                # Real owner orchestration, injected FAKE Gemini/PayPal only.
                # This opt-in visual trace is a distinct technical evidence
                # class, NOT historical live Sandbox proof.
                page.locator("#protocol-replay-button").click()
                expect(page.locator("#protocol-replay-status")).to_contain_text(
                    "0 real provider calls")
                expect(page.locator("#protocol-replay-list")).to_contain_text(
                    "simulated buyer approved")
                expect(page.locator("#protocol-replay-list")).to_contain_text(
                    "simulated completion only")
                assert page.locator("#protocol-replay-list li").count() >= 7, "FAKE_PROTOCOL_STAGES_MISSING"
                assert post_paths.count("/api/demo/provider-protocol") == 1, "FAKE_PROTOCOL_REPLAY_NOT_EXPLICIT"
                synthetic_protocol_replay_verified = True
                caption("INJECTED FAKE API TRACE | Gemini skills → simulated PayPal order → buyer approval GET → simulated Capture → GET. ZERO real provider calls.")
                page.wait_for_timeout(min(pace_ms, 5000))

                # Show BOTH real, clickable service categories in one marketplace.
                # Category transitions never create a quote or call PayPal/Gemini.
                page.locator("#marketplace-submit").click()
                expect(page.locator(".match-summary")).to_contain_text("AI Work")
                expect(page.locator("#marketplace-choose-synthetic-web")).to_be_visible()
                caption("AI WORK | AI agents, automation and development. Three FICTIONAL specialists, with visible skill gaps.")
                pause()

                page.locator("#marketplace-vertical").select_option("general_services")
                page.locator("#marketplace-submit").click()
                expect(page.locator(".match-summary")).to_contain_text("Global Services")
                expect(page.locator(".profile-card")).to_have_count(3)
                caption("GLOBAL SERVICES | Design, translation, marketing: a second category sharing the SAME marketplace workflow. FICTIONAL profiles.")
                page.wait_for_timeout(min(pace_ms, 5500))

                # Return to AI Work for the common quote -> contract journey.
                page.locator("#marketplace-vertical").select_option("ai_work")
                page.locator("#marketplace-submit").click()
                expect(page.locator(".match-summary")).to_contain_text("AI Work")
                expect(page.locator("#marketplace-choose-synthetic-web")).to_be_visible()
                two_verticals_verified = True
                page.locator("#marketplace-choose-synthetic-web").click()
                expect(page.locator("#scope")).to_have_value(re.compile("Synthetic candidate: synthetic-web"))

                page.locator("#draft-submit").click()
                expect(page.locator("#quote-view")).to_contain_text("Version 2")
                page.locator("#dollars").fill("15.00")
                page.locator("#confirm").check()
                page.locator("#approve-submit").click()
                expect(page.locator("#quote-view")).to_contain_text("APPROVED")
                page.locator("#quote-checkout-preview").click()
                expect(page.locator("#quote-checkout-preview-result")).to_contain_text(
                    "human-approved USD 15.00")
                expect(page.locator("#quote-checkout-preview-result")).to_contain_text(
                    "9 in-memory fake PayPal domain stages")
                caption("APPROVED USD 15 QUOTE → ORDER AND CAPTURE DOMAIN FLOW | 9 FAKE in-memory stages, no API POST or payment.")
                page.wait_for_timeout(min(pace_ms,2200))
                page.locator("#verify-local-bridge").click()
                expect(page.locator("#verify-local-bridge-result")).to_contain_text(
                    "LOCAL PROOF PASS")
                expect(page.locator("#verify-local-bridge-result")).to_contain_text(
                    "fixed USD 1.50")
                caption("DISTINCT PROOFS | USD 15 quote-bound plan plus separate USD 1.50 FAKE Gemini/PayPal adapter replay.")
                page.wait_for_timeout(min(pace_ms,2200))
                caption("OFFLINE MOCK proposal. A HUMAN approves a specific quote version and amount; no payment is authorized.")
                pause()

                # Three attributed provider-evidence slides; do not imply fresh API use.
                # Default caption pace is reduced to make room for both markets
                # while retaining a safety margin under the 3-minute limit.
                for card in storyboard_cards(proof):
                    evidence_overlay(card)
                    pause()
                page.evaluate("document.getElementById('owner-evidence-video-slide')?.remove()")

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
                caption("Technology is the evidence. The marketplace is the mechanism. More opportunity for people is the goal. OFFLINE SYNTHETIC.")
                pause()
                assert not unsafe_requests, "EXTERNAL_REQUEST_BLOCKED"
                assert not any("/orders" in x or "/capture" in x for x in post_paths), "PAYMENT_POST_FORBIDDEN"
                assert time.monotonic()-video_started < 178, "SUBMISSION_VIDEO_EXCEEDS_3_MIN"
                video_file = page.video
                context.close()
                # Playwright sync handles must be resolved before exiting the
                # sync_playwright context; afterwards its event loop is closed.
                source = Path(video_file.path())
            finally:
                browser.close()
        if video_file is None:
            raise RuntimeError("NO_VIDEO_RECORDED")
        if not source.is_file() or source.stat().st_size == 0:
            raise RuntimeError("EMPTY_VIDEO_RECORDING")
        filename = "paypal-synthetic-review-" + datetime.now().strftime("%Y%m%d-%H%M%S") + ".webm"
        dest = output_dir / filename
        # Reject changed source before creating final private output files.
        current_source = git_source_snapshot()
        if current_source != source_snapshot:
            raise RuntimeError("SOURCE_CHANGED_DURING_RECORDING")
        if (dest.exists() or dest.is_symlink() or
                dest.with_suffix(".manifest.json").exists() or
                dest.with_suffix(".manifest.json").is_symlink()):
            raise RuntimeError("OUTPUT_WOULD_OVERWRITE")
        # Manifest is not an attestation of PayPal, Gemini or uploaded footage:
        # it identifies this private, synthetic file for human editorial review.
        manifest = {
            "evidence_class": "OFFLINE_SYNTHETIC_BROWSER_CAPTURE_ONLY",
            "storyboard_version": "OPPORTUNITY_FIRST_V3_FAKE_API_TRACE",
            "demonstrated_categories": (["ai_work", "general_services"] if two_verticals_verified else []),
            "interactive_fake_api_trace_replayed_locally": synthetic_protocol_replay_verified,
            "interactive_fake_api_trace_actual_provider_calls": 0,
            "interactive_fake_api_trace_payment_posts": 0,
            "video_filename": dest.name,
            "video_sha256": hashlib.sha256(source.read_bytes()).hexdigest(),
            "video_bytes": source.stat().st_size,
            "source_commit_sha": source_snapshot["sha"],
            "source_tracked_tree_clean": source_snapshot["clean"],
            "created_utc": datetime.now(timezone.utc).isoformat(),
            "wall_clock_elapsed_seconds": round(time.monotonic() - video_started, 1),
            "media_duration_independently_probed": False,
            "provider_calls": 0,
            "payment_posts": 0,
            "historical_owner_receipt_source": proof["source"],
            "historical_owner_receipt_checked_locally": proof["local_receipt_verified"],
            "proof_disclosure": "OWNER_LOCAL_HISTORY_NOT_FRESH_PROVIDER_API",
            "publicly_uploaded": False,
            "devpost_submitted": False,
            "owner_approval_for_publication": False,
            "notes": "Local synthetic content with historical owner-reported provider disclaimer. Human review required."
        }
        manifest_path = preserve_private_recording(source, dest, manifest)
        print("RECORDED_SYNTHETIC_ONLY " + str(dest))
        print("PRIVATE_VIDEO_MANIFEST " + str(manifest_path))
        print("SOURCE_SCOPE=LOCALHOST_ONLY PROVIDER_CALLS=0 PAYMENT_POSTS=0 PUBLIC_UPLOAD=NO")
        print("OWNER_HISTORICAL_RECEIPT="+
              ("LOCAL_READ_ONLY_MATCH" if proof["local_receipt_verified"]
               else "OWNER_REPORT_ONLY_NOT_VERIFIED_ON_THIS_DEVICE"))
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
    parser.add_argument("--pace-ms", type=int, default=12000)
    args = parser.parse_args()
    if not (200 <= args.pace_ms <= 18000):
        parser.error("pace must be 200–18000 milliseconds")
    try:
        capture(Path(args.output_dir).resolve(), args.pace_ms)
    except Exception as exc:
        # Do not print subprocess environment, traceback or private filesystem internals.
        print("RECORDING_FAILED " + str(exc), file=sys.stderr)
        sys.exit(1)
