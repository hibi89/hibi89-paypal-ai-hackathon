"""Independent real-Chromium E2E: Global Services -> quote -> unpaid contract.

A fresh loopback server isolates this test from the AI Work browser journey.
No external network requests, credentials, provider APIs or actual payments.
"""
import queue
import re
import shutil
import subprocess
import threading
import time
from pathlib import Path
from playwright.sync_api import sync_playwright, expect

ROOT = Path(__file__).resolve().parents[1]
server = subprocess.Popen(
    ["node", "--experimental-sqlite", "scripts/run_demo.mjs"],
    cwd=ROOT, stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
    text=True, encoding="utf-8", errors="replace", bufsize=1,
)
lines = queue.Queue()
def read_server_output():
    for line in server.stdout:
        lines.put(line)
threading.Thread(target=read_server_output, daemon=True).start()

try:
    deadline = time.monotonic() + 20
    address = None
    while time.monotonic() < deadline:
        try:
            line = lines.get(timeout=0.5)
        except queue.Empty:
            if server.poll() is not None:
                raise AssertionError("OFFLINE_SERVER_START_FAILED")
            continue
        match = re.search(r"http://127\.0\.0\.1:\d+", line)
        if match:
            address = match.group(0)
            break
    assert address, "OFFLINE_SERVER_URL_MISSING"
    chrome = (shutil.which("google-chrome") or shutil.which("google-chrome-stable")
              or shutil.which("chromium"))
    assert chrome, "CHROMIUM_NOT_INSTALLED"
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(
            executable_path=chrome, headless=True,
            args=["--no-sandbox", "--disable-dev-shm-usage"],
        )
        try:
            page = browser.new_page()
            requests = []
            page.on("request", lambda req: requests.append((req.method, req.url)))
            page.goto(address)
            expect(page.locator("#message")).to_contain_text("Offline demo ready")
            assert not any(method == "POST" for method, _ in requests), (
                "Page load must not submit a transaction")
            page.locator("#marketplace-vertical").select_option("general_services")
            expect(page.locator("#marketplace-brief")).to_have_value(
                re.compile("logo and brand identity"))
            page.locator("#marketplace-submit").click()
            expect(page.locator(".match-summary")).to_contain_text("Global Services")
            expect(page.locator(".profile-card")).to_have_count(3)
            expect(page.locator("#marketplace-choose-synthetic-creative")).to_be_visible()
            # All three archetype cards remain visible and user can browse
            # two more sets, including earlier history, without submitting a quote.
            expect(page.locator(".profile-tier")).to_have_count(3)
            expect(page.locator("#marketplace-next-recommendations")).to_be_enabled()
            page.locator("#marketplace-next-recommendations").click()
            expect(page.locator("#marketplace-history-round-2")).to_be_visible()
            page.locator("#marketplace-next-recommendations").click()
            expect(page.locator("#marketplace-history-round-3")).to_be_visible()
            expect(page.locator("#marketplace-next-recommendations")).to_be_disabled()
            page.locator("#marketplace-history-round-1").click()
            expect(page.locator("#marketplace-choose-synthetic-creative")).to_be_visible()
            before_choice = sum(method == "POST" for method, _ in requests)
            page.locator("#marketplace-choose-synthetic-creative").click()
            expect(page.locator("#scope")).to_have_value(
                re.compile("Synthetic candidate: synthetic-creative"))
            expect(page.locator("#marketplace-selection-status")).to_contain_text(
                "No quote submitted")
            assert sum(method == "POST" for method, _ in requests) == before_choice, (
                "Choosing a fictional candidate must not silently submit a quote")
            page.locator("#draft-submit").click()
            expect(page.locator("#quote-view")).to_contain_text("Version 2")
            expect(page.locator("#quote-view")).to_contain_text("synthetic-creative")
            expect(page.locator("#quote-view")).to_contain_text("Not approved")
            page.locator("#dollars").fill("29.00")
            page.locator("#confirm").check()
            page.locator("#approve-submit").click()
            expect(page.locator("#quote-view")).to_contain_text("APPROVED")
            expect(page.locator("#quote-view")).to_contain_text("$29.00")
            expect(page.locator("#contract-fulfillment")).to_have_text("NO_CONTRACT")
            page.locator("#contract-create").click()
            expect(page.locator("#contract-fulfillment")).to_have_text("PENDING")
            expect(page.locator("#contract-payment")).to_have_text("NOT_CAPTURED")
            expect(page.locator("#contract-events")).to_contain_text("CREATED")

            # Merely switching verticals must not rewrite the approved scope,
            # change quote amount or send an external payment.
            page.locator("#marketplace-vertical").select_option("ai_work")
            page.locator("#marketplace-submit").click()
            expect(page.locator(".match-summary")).to_contain_text("AI Work")
            expect(page.locator("#quote-view")).to_contain_text("synthetic-creative")
            expect(page.locator("#quote-view")).to_contain_text("$29.00")
            page.reload()
            expect(page.locator("#message")).to_contain_text("Offline demo ready")
            expect(page.locator("#contract-fulfillment")).to_have_text("PENDING")
            expect(page.locator("#contract-payment")).to_have_text("NOT_CAPTURED")
            expect(page.locator("#quote-view")).to_contain_text("synthetic-creative")
            assert not any(
                method == "POST" and ("/orders" in url or "/capture" in url)
                for method, url in requests
            ), "REAL_PAYMENT_POST_FORBIDDEN"
            assert not any(
                not url.startswith(address) for _, url in requests
            ), "EXTERNAL_BROWSER_REQUEST_FORBIDDEN"
            print(
                "CHROMIUM_GLOBAL_SERVICES_E2E_PASS: match -> draft -> "
                "explicit USD29 approval -> contract -> category switch -> reload, "
                "payment NOT_CAPTURED, no provider calls"
            )
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
