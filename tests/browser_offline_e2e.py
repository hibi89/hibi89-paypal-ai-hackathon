"""Chromium E2E against the REAL local offline demo. No payment/AI credentials."""
import os, re, select, shutil, subprocess, time
from pathlib import Path
from playwright.sync_api import sync_playwright, expect

root=Path(__file__).resolve().parents[1]
node=subprocess.Popen(["node","--experimental-sqlite","scripts/run_demo.mjs"],
    cwd=root,stdout=subprocess.PIPE,stderr=subprocess.STDOUT,text=True,bufsize=1)
try:
    deadline=time.monotonic()+20
    address=None
    while time.monotonic()<deadline:
        if node.poll() is not None:
            raise AssertionError("offline demo failed to start")
        if select.select([node.stdout],[],[],0.5)[0]:
            line=node.stdout.readline()
            match=re.search(r"http://127\.0\.0\.1:\d+",line)
            if match:
                address=match.group(0)
                break
    assert address, "offline demo URL missing"
    binary=(os.getenv("BROWSER_CHROME_PATH") or shutil.which("google-chrome")
        or shutil.which("google-chrome-stable") or shutil.which("chromium"))
    assert binary, "system Chromium/Chrome missing"
    with sync_playwright() as p:
        browser=p.chromium.launch(executable_path=binary,headless=True,
            args=["--no-sandbox","--disable-dev-shm-usage"])
        try:
            page=browser.new_page()
            requests=[]
            page.on("request",lambda r:requests.append((r.method,r.url)))
            page.goto(address)
            expect(page.locator("#message")).to_contain_text("Offline demo ready")
            expect(page.locator("#quote-view")).to_contain_text("Version 1")
            page.reload()
            expect(page.locator("#message")).to_contain_text("Offline demo ready")
            page.locator("#refresh").click()
            assert not any(method=="POST" for method,_ in requests)
            page.evaluate("""() => {
              const e=document.getElementById('draft-form');
              e.dispatchEvent(new Event('submit',{cancelable:true}));
              e.dispatchEvent(new Event('submit',{cancelable:true}));
            }""")
            expect(page.locator("#quote-view")).to_contain_text("Version 2")
            assert sum(method=="POST" and url.endswith("/draft")
                for method,url in requests)==1
            page.locator("#dollars").fill("17.55")
            page.locator("#confirm").check()
            page.evaluate("""() => {
              const e=document.getElementById('approve-form');
              e.dispatchEvent(new Event('submit',{cancelable:true}));
              e.dispatchEvent(new Event('submit',{cancelable:true}));
            }""")
            expect(page.locator("#quote-view")).to_contain_text("APPROVED")
            expect(page.locator("#quote-view")).to_contain_text("$17.55")
            assert sum(method=="POST" and url.endswith("/approve")
                for method,url in requests)==1
            total=sum(method=="POST" for method,_ in requests)
            page.reload()
            expect(page.locator("#quote-view")).to_contain_text("APPROVED")
            assert sum(method=="POST" for method,_ in requests)==total
            page.locator("#draft-submit").click()
            expect(page.locator("#quote-view")).to_contain_text("Version 3")
            expect(page.locator("#quote-view")).to_contain_text("Not approved")
            page.locator("#payment-status").click()
            expect(page.locator("#message")).to_contain_text("No payment action executed")
            assert not any(method=="POST" and "/orders" in url
                for method,url in requests)
            print("CHROMIUM_BROWSER_E2E_PASS: actual loopback, F5, double-click, approval, payment blocked")
        finally:
            browser.close()
finally:
    node.terminate()
    try: node.wait(timeout=5)
    except subprocess.TimeoutExpired:
        node.kill(); node.wait()
