"""Real Chromium click E2E for the isolated WORKNOVA commerce MVP.

This test launches the actual Node/SQLite server and clicks the unmodified UI.
It is OFFLINE SIMULATION evidence, not Gemini, PayPal, escrow, or owner footage.
External browser requests and provider credentials are denied by construction.
"""
import json
import os
import queue
import re
import shutil
import subprocess
import threading
import time
from pathlib import Path

from playwright.sync_api import expect, sync_playwright

ROOT = Path(__file__).resolve().parents[1]
FORBIDDEN_ENV = re.compile(
    r"PAYPAL|GEMINI|OPENAI|API_KEY|CLIENT_SECRET|PRIVATE_KEY|"
    r"AUTHORIZATION|CREDENTIAL|ACCESS_TOKEN|REFRESH_TOKEN|"
    r"GOOGLE_APPLICATION_CREDENTIALS|NODE_OPTIONS", re.I
)
safe_env = {k: v for k, v in os.environ.items() if not FORBIDDEN_ENV.search(k)}
safe_env.update({
    "WORKNOVA_PORT": "0",
    "NO_PROXY": "127.0.0.1,localhost",
    "no_proxy": "127.0.0.1,localhost",
    "PYTHONDONTWRITEBYTECODE": "1",
})
server = subprocess.Popen(
    ["node", "--experimental-sqlite", "scripts/run_commerce_control_plane.mjs"],
    cwd=ROOT, env=safe_env, stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
    encoding="utf-8", text=True, bufsize=1,
)
lines = queue.Queue()
threading.Thread(
    target=lambda: [lines.put(line) for line in server.stdout], daemon=True
).start()

try:
    address = None
    deadline = time.monotonic() + 20
    while time.monotonic() < deadline:
        if server.poll() is not None:
            raise AssertionError("COMMERCE_SERVER_EXITED_EARLY")
        try:
            line = lines.get(timeout=0.4)
        except queue.Empty:
            continue
        match = re.search(r"http://127\.0\.0\.1:\d+", line)
        if match:
            address = match.group(0)
            break
    assert address, "COMMERCE_LOCALHOST_NOT_READY"

    binary = (os.getenv("BROWSER_CHROME_PATH") or shutil.which("google-chrome")
              or shutil.which("google-chrome-stable") or shutil.which("chromium"))
    if not binary and os.name == "nt":
        roots = [os.getenv("PROGRAMFILES"), os.getenv("PROGRAMFILES(X86)"),
                 os.getenv("LOCALAPPDATA")]
        binary = next((str(p) for r in roots if r
                      for p in [Path(r) / "Google/Chrome/Application/chrome.exe"]
                      if p.is_file()), None)
    assert binary, "SYSTEM_CHROMIUM_NOT_FOUND"

    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(
            executable_path=binary, headless=True,
            args=["--no-sandbox", "--disable-dev-shm-usage"]
        )
        try:
            page = browser.new_page(viewport={"width": 1600, "height": 1000})
            page_errors = []
            external_requests = []
            requests = []
            page.on("pageerror", lambda err: page_errors.append(str(err)))
            page.on("request", lambda req: requests.append((req.method, req.url)))

            def local_only(route):
                url = route.request.url
                if (url == address or url.startswith(address + "/")
                        or url.startswith(("data:", "blob:"))):
                    return route.continue_()
                external_requests.append(url.split(":", 1)[0])
                return route.abort()

            page.route("**/*", local_only)
            response = page.goto(address + "/", wait_until="domcontentloaded")
            assert response and response.status == 200
            expect(page.locator("header .badge")).to_contain_text("OFFLINE SIMULATION")
            expect(page.locator("#progress")).to_have_text("0 / 5 STEPS")
            expect(page.locator("#provider")).to_have_text("0")
            assert not [r for r in requests if r[0] == "POST"], "POST_ON_PAGE_LOAD"

            # GET and refresh never trigger action POST or auto-payment.
            page.reload(wait_until="domcontentloaded")
            expect(page.locator("#progress")).to_have_text("0 / 5 STEPS")
            assert not [r for r in requests if r[0] == "POST"], "POST_ON_REFRESH"

            for index, action in enumerate(("grant", "negotiate", "verify", "license", "review"), 1):
                page.locator('button[data-action="' + action + '"]').click()
                expect(page.locator("#progress")).to_have_text(str(index) + " / 5 STEPS")
                expect(page.locator("#provider")).to_have_text("0")

            expect(page.locator("#reserved")).to_have_text("$460.00")
            expect(page.locator("#remaining")).to_have_text("$40.00")
            expect(page.locator("#status")).to_have_text("READY FOR HUMAN REVIEW")
            expect(page.locator("#audit .trace")).to_have_count(5)
            state = page.evaluate("async () => (await fetch('/api/state')).json()")
            assert state["reservedMinor"] == 46000
            assert state["remainingMinor"] == 4000
            assert state["gate"]["status"] == "HUMAN_PROVIDER_AUTH_REQUIRED"
            assert state["gate"]["settlement"] == "NOT_EXECUTED"
            assert state["evidenceIntegrity"] == "LOCAL_DIGEST_MATCH"
            assert re.fullmatch(r"[0-9a-f]{64}", state["gate"]["auditDigest"])
            assert state["humanReviewReady"] is True
            assert state["realPayments"] == 0
            assert state["paypalProviderCalls"] == 0
            assert state["escrowCreated"] is False
            assert state["genuinePayPalAuthorization"] is False
            assert state["disclosure"].startswith("SIMULATED")
            assert sum(method == "POST" for method, _ in requests) == 5

            # Replaying a completed button is a real browser POST but no new reservation.
            page.locator('button[data-action="negotiate"]').click()
            expect(page.locator("#progress")).to_have_text("5 / 5 STEPS")
            expect(page.locator("#audit .trace")).to_have_count(5)
            expect(page.locator("#reserved")).to_have_text("$460.00")
            page.reload(wait_until="domcontentloaded")
            expect(page.locator("#reserved")).to_have_text("$460.00")
            assert sum(method == "POST" for method, _ in requests) == 6

            page.locator("#unsafe").click()
            expect(page.locator("#message")).to_contain_text("GUARDRAIL_BLOCKED")
            expect(page.locator("#reserved")).to_have_text("$460.00")
            expect(page.locator("#provider")).to_have_text("0")

            page.locator("#reset").click()
            expect(page.locator("#progress")).to_have_text("0 / 5 STEPS")
            page.locator('button[data-action="grant"]').click()
            expect(page.locator("#progress")).to_have_text("1 / 5 STEPS")
            page.locator("#revoke").click()
            expect(page.locator("#audit .trace")).to_have_count(2)
            page.locator('button[data-action="negotiate"]').click()
            expect(page.locator("#message")).to_contain_text("MANDATE_NOT_ACTIVE")
            expect(page.locator("#reserved")).to_have_text("$0.00")
            expect(page.locator("#provider")).to_have_text("0")

            # Full-journey control must drive the actual API from a clean state.
            page.locator("#reset").click()
            expect(page.locator("#progress")).to_have_text("0 / 5 STEPS")
            page.locator("#runall").click()
            expect(page.locator("#progress")).to_have_text("5 / 5 STEPS", timeout=12000)
            expect(page.locator("#reserved")).to_have_text("$460.00")
            expect(page.locator("#remaining")).to_have_text("$40.00")
            expect(page.locator("#audit .trace")).to_have_count(5)
            expect(page.locator("#status")).to_have_text("READY FOR HUMAN REVIEW")
            page.locator("#revoke").click()
            expect(page.locator("#status")).to_have_text("MANDATE REVOKED · REVIEW HOLD")
            revoked_state = page.evaluate("async () => (await fetch('/api/state')).json()")
            assert revoked_state["mandateStatus"] == "REVOKED"
            assert revoked_state["humanReviewReady"] is False
            assert revoked_state["evidenceIntegrity"] == "LOCAL_REVIEW_HOLD"
            assert revoked_state["reservedMinor"] == 46000
            assert revoked_state["paypalProviderCalls"] == 0
            assert not external_requests, "BROWSER_EXTERNAL_REQUEST_BLOCKED"
            assert not page_errors, "BROWSER_JAVASCRIPT_ERROR:" + repr(page_errors)
            assert all(
                url == address or url.startswith(address + "/")
                for _, url in requests
            ), "NON_LOOPBACK_BROWSER_REQUEST"
            assert all(method == "GET" or url.endswith("/api/action")
                       for method, url in requests), "UNEXPECTED_POST_ENDPOINT"
            print(json.dumps({
                "status": "WORKNOVA_COMMERCE_REAL_CHROMIUM_E2E_PASS",
                "actualChromiumClicks": True,
                "fiveStepJourney": True,
                "runAllJourney": True,
                "replayAndRefresh": True,
                "revocationAndLimitDenial": True,
                "reservedMinor": 46000,
                "remainingMinor": 4000,
                "realProviderCalls": 0,
                "externalRequests": 0,
                "syntheticOnly": True,
                "published": False,
            }))
        finally:
            browser.close()
finally:
    if server.poll() is None:
        server.terminate()
        try:
            server.wait(timeout=5)
        except subprocess.TimeoutExpired:
            server.kill()
            server.wait(timeout=5)
