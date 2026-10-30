"""Interactive actual-Chromium proof lab: explicit synthetic API replay only.

All network requests must stay on a fresh loopback Node demo. No real
Gemini/PayPal calls, payment POST, owner SQLite or public website.
"""
import queue
import re
import shutil
import subprocess
import threading
import time
from pathlib import Path
from playwright.sync_api import sync_playwright, expect

ROOT=Path(__file__).resolve().parents[1]
server=subprocess.Popen(
    ["node","--experimental-sqlite","scripts/run_demo.mjs"],
    cwd=ROOT,stdout=subprocess.PIPE,stderr=subprocess.STDOUT,
    text=True,encoding="utf-8",errors="replace",bufsize=1,
)
lines=queue.Queue()
def collect():
    for line in server.stdout:
        lines.put(line)
threading.Thread(target=collect,daemon=True).start()
try:
    deadline=time.monotonic()+20
    address=None
    while time.monotonic()<deadline:
        try:
            line=lines.get(timeout=0.5)
        except queue.Empty:
            if server.poll() is not None:
                raise AssertionError("SYNTHETIC_PROTOCOL_DEMO_SERVER_STOPPED")
            continue
        match=re.search(r"http://127\.0\.0\.1:\d+",line)
        if match:
            address=match.group(0)
            break
    assert address,"SYNTHETIC_PROTOCOL_LOCAL_SERVER_REQUIRED"
    chrome=(shutil.which("google-chrome") or
            shutil.which("google-chrome-stable") or
            shutil.which("chromium"))
    assert chrome,"CHROMIUM_NOT_INSTALLED"
    with sync_playwright() as playwright:
        browser=playwright.chromium.launch(executable_path=chrome,headless=True,
            args=["--no-sandbox","--disable-dev-shm-usage"])
        try:
            page=browser.new_page()
            requests=[]
            page.on("request",lambda request:requests.append((request.method,request.url)))
            page.goto(address)
            expect(page.locator("#message")).to_contain_text("Offline demo ready")
            button=page.locator("#protocol-replay-button")
            expect(button).to_be_enabled()
            expect(page.locator("#protocol-replay-list")).to_be_hidden()
            assert sum(method=="POST" for method,_ in requests)==0
            button.click()
            expect(page.locator("#protocol-replay-status")).to_contain_text(
                "0 real provider calls")
            output=page.locator("#protocol-replay-list")
            expect(output).to_be_visible()
            expect(output).to_contain_text("Gemini skill classification")
            expect(output).to_contain_text("buyer action pending")
            expect(output).to_contain_text("simulated buyer approved")
            expect(output).to_contain_text("simulated completion only")
            assert output.locator("li").count()>=7
            expect(page.locator("#protocol-replay-detail")).to_contain_text(
                "Human consent checkpoints: 5")
            expect(page.locator("#protocol-replay-detail")).to_contain_text(
                "fake capture: 1")
            assert sum(method=="POST" for method,_ in requests)==1,requests
            assert any(method=="POST" and url.endswith(
                "/api/demo/provider-protocol") for method,url in requests)
            assert not any("/orders" in url or "/capture" in url
                           for _,url in requests)
            assert not any(not url.startswith(address) for _,url in requests)
            for private in ["FICTIONALORDER","FICTIONALCAPTURE",
                            "access_token","PayerID","checkoutnow"]:
                assert private not in page.locator("body").inner_text()
            page.reload()
            expect(page.locator("#protocol-replay-button")).to_be_enabled()
            expect(page.locator("#protocol-replay-list")).to_be_hidden()
            assert sum(method=="POST" for method,_ in requests)==1,(
                "Page reload must never rerun fake or real payment logic")
            assert not any(not url.startswith(address) for _,url in requests)
            print("CHROMIUM_SYNTHETIC_PROVIDER_PROTOCOL_PASS: manual click -> "
                  "real adapter code with injected fakes -> explicit consent -> "
                  "no provider/payment POST; F5 GET-only")
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
