"""Chromium E2E against the REAL local offline demo. No payment/AI credentials."""
import os, re, select, shutil, subprocess, time, tempfile
from pathlib import Path
from playwright.sync_api import sync_playwright, expect

root=Path(__file__).resolve().parents[1]
fd, reviewer_path=tempfile.mkstemp(prefix="paypal-review-fixture-")
os.close(fd)
os.unlink(reviewer_path)
env={**os.environ,"PAYPAL_BROWSER_TEST_TOKEN_FILE":reviewer_path}
node=subprocess.Popen(["node","--experimental-sqlite","scripts/run_demo.mjs"],
    cwd=root,stdout=subprocess.PIPE,stderr=subprocess.STDOUT,text=True,bufsize=1,env=env)
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
            # Real Chromium click exercises the fictional matcher UI and API.
            expect(page.locator("#marketplace-results")).to_contain_text("DATA_INSUFFICIENT")
            before_match=sum(method=="POST" for method,_ in requests)
            page.locator("#marketplace-brief").fill(
                "Build an ecommerce website with PayPal checkout")
            page.locator("#marketplace-submit").click()
            expect(page.locator("#marketplace-results")).to_contain_text("Demo Web Specialist")
            expect(page.locator("#marketplace-results")).to_contain_text("eligible demo match")
            expect(page.locator("#marketplace-results")).to_contain_text("DATA_INSUFFICIENT")
            assert sum(method=="POST" and url.endswith("/api/demo/marketplace")
                for method,url in requests)==1
            assert sum(method=="POST" for method,_ in requests)==before_match+1
            page.reload()
            assert sum(method=="POST" for method,_ in requests)==before_match+1
            expect(page.locator("#quote-view")).to_contain_text("Version 1")
            page.reload()
            expect(page.locator("#message")).to_contain_text("Offline demo ready")
            page.locator("#refresh").click()
            # A read-only refresh is asynchronous. Do not issue a synthetic
            # submit while its runOnce guard is still busy: that would test
            # a dropped click rather than the actual quote draft path.
            expect(page.locator("#message")).to_contain_text("Read-only GET completed")
            assert sum(method=="POST" for method,_ in requests)==before_match+1
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
            token=Path(reviewer_path).read_text().strip()
            assert token.startswith("paypal_test_review=")
            assert re.fullmatch(r"[a-f0-9]{64}",token.split("=",1)[1])
            expect(page.locator("#contract-payment")).to_have_text("NOT_CAPTURED")
            expect(page.locator("#contract-fulfillment")).to_have_text("NO_CONTRACT")
            initial_posts=sum(method=="POST" for method,_ in requests)
            page.reload()
            expect(page.locator("#contract-message")).to_contain_text("Offline contract UI ready")
            assert sum(method=="POST" for method,_ in requests)==initial_posts

            # The quote was revised to version 3; another approval is essential.
            page.locator("#dollars").fill("15.00")
            page.locator("#confirm").check()
            page.locator("#approve-submit").click()
            expect(page.locator("#quote-view")).to_contain_text("APPROVED")
            page.locator("#contract-create").click()
            expect(page.locator("#contract-fulfillment")).to_have_text("PENDING")
            expect(page.locator("#contract-payment")).to_have_text("NOT_CAPTURED")
            page.reload()
            expect(page.locator("#contract-fulfillment")).to_have_text("PENDING")
            page.evaluate("""() => {
                const f=document.getElementById("delivery-form");
                f.dispatchEvent(new Event("submit",{cancelable:true}));
                f.dispatchEvent(new Event("submit",{cancelable:true}));
            }""")
            expect(page.locator("#contract-fulfillment")).to_have_text("SUBMITTED")
            assert sum(method=="POST" and url.endswith("/submit") for method,url in requests)==1

            # Server generated reviewer cookie is injected by the local test
            # harness; the browser cannot change its identity by a role selector.
            context=browser.new_context()
            try:
                context.add_cookies([{"name":"paypal_test_review",
                    "value":token.split("=",1)[1],"url":address,
                    "httpOnly":True,"sameSite":"Strict"}])
                reviewer=context.new_page()
                review_requests=[]
                reviewer.on("request",lambda r:review_requests.append((r.method,r.url)))
                reviewer.goto(address)
                expect(reviewer.locator("#session-role")).to_contain_text("reviewer")
                expect(reviewer.locator("#contract-fulfillment")).to_have_text("SUBMITTED")
                assert reviewer.locator("#draft-panel").is_hidden()
                assert reviewer.locator("#delivery-form").is_hidden()
                reviewer.reload()
                assert not any(method=="POST" for method,_ in review_requests)
                reviewer.locator("#review-note").fill("Missing synthetic source assets")
                reviewer.locator("#review-reject").click()
                expect(reviewer.locator("#contract-fulfillment")).to_have_text("REJECTED")
                expect(reviewer.locator("#contract-payment")).to_have_text("NOT_CAPTURED")
                assert sum(method=="POST" and url.endswith("/reject")
                    for method,url in review_requests)==1
                page.locator("#contract-refresh").click()
                expect(page.locator("#contract-fulfillment")).to_have_text("REJECTED")
                page.locator("#delivery-note").fill("Revised synthetic project files")
                page.locator("#delivery-submit").click()
                expect(page.locator("#contract-fulfillment")).to_have_text("SUBMITTED")
                reviewer.locator("#contract-refresh").click()
                expect(reviewer.locator("#contract-fulfillment")).to_have_text("SUBMITTED")
                reviewer.locator("#review-accept").click()
                expect(reviewer.locator("#contract-fulfillment")).to_have_text("ACCEPTED")
                page.locator("#contract-refresh").click()
                expect(page.locator("#contract-fulfillment")).to_have_text("ACCEPTED")
                expect(page.locator("#contract-payment")).to_have_text("NOT_CAPTURED")
                assert sum(method=="POST" and "/orders" in url
                    for method,url in requests+review_requests)==0
            finally:
                context.close()
            # D12 subscription lifecycle is a separate, server-owned local
            # scenario. F5/GET only reads; no provider/API/payment calls.
            expect(page.locator("#subscription-state")).to_have_text("NOT_STARTED")
            expect(page.locator("#subscription-payment")).to_have_text("NOT_VERIFIED")
            before_sub=sum(method=="POST" for method,_ in requests)
            page.reload()
            expect(page.locator("#subscription-message")).to_contain_text("Subscription OFFLINE scenario ready")
            page.locator("#subscription-refresh").click()
            assert sum(method=="POST" for method,_ in requests)==before_sub
            page.locator("#subscription-start").click()
            expect(page.locator("#subscription-state")).to_have_text("ACTIVE")
            expect(page.locator("#subscription-payment")).to_have_text("NOT_VERIFIED")
            page.locator("#subscription-fail").click()
            expect(page.locator("#subscription-state")).to_have_text("RECOVERY_REQUIRED")
            assert page.locator("#subscription-recover").is_enabled()
            page.reload()
            expect(page.locator("#subscription-state")).to_have_text("RECOVERY_REQUIRED")
            page.locator("#subscription-recover").click()
            expect(page.locator("#subscription-state")).to_have_text("ACTIVE")
            expect(page.locator("#subscription-message")).to_contain_text("NO actual provider GET")
            page.locator("#subscription-cancel").click()
            expect(page.locator("#subscription-state")).to_have_text("CANCELLED")
            assert page.locator("#subscription-start").is_disabled()
            assert page.locator("#subscription-recover").is_disabled()
            assert page.locator("#subscription-cancel").is_disabled()
            page.reload()
            expect(page.locator("#subscription-state")).to_have_text("CANCELLED")
            assert sum(method=="POST" and "/api/demo/subscription/actions/" in url
                for method,url in requests)==4
            assert not any(method=="POST" and "/v1/billing" in url for method,url in requests)
            assert not any(method=="POST" and "/orders" in url for method,url in requests)
            expect(page.locator("#contract-payment")).to_have_text("NOT_CAPTURED")
            expect(page.locator("#integration-paypal")).to_have_text("NOT_TESTED")
            expect(page.locator("#integration-state")).to_have_text("LOCAL_DEMO_INCOMPLETE")
            before_integration=sum(method=="POST" for method,_ in requests)
            page.locator("#integration-refresh").click()
            expect(page.locator("#integration-message")).to_contain_text("GET-only local integration")
            assert sum(method=="POST" for method,_ in requests)==before_integration
            page.reload()
            expect(page.locator("#integration-state")).to_have_text("LOCAL_DEMO_INCOMPLETE")
            assert sum(method=="POST" for method,_ in requests)==before_integration
            print("CHROMIUM_BROWSER_E2E_PASS: marketplace+quote+contract+subscription+integration, no provider/payment POST")
        finally:
            browser.close()
finally:
    node.terminate()
    try: node.wait(timeout=5)
    except subprocess.TimeoutExpired:
        node.kill(); node.wait()

    try: Path(reviewer_path).unlink(missing_ok=True)
    except OSError: pass
