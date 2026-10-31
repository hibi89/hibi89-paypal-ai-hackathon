"""Chromium E2E against the REAL local offline demo. No payment/AI credentials."""
import os, queue, re, shutil, subprocess, threading, time, tempfile
from pathlib import Path
from playwright.sync_api import sync_playwright, expect

root=Path(__file__).resolve().parents[1]
fd, reviewer_path=tempfile.mkstemp(prefix="paypal-review-fixture-")
os.close(fd)
os.unlink(reviewer_path)
env={**os.environ,"PAYPAL_BROWSER_TEST_TOKEN_FILE":reviewer_path}
node=subprocess.Popen(["node","--experimental-sqlite","scripts/run_demo.mjs"],
    cwd=root,stdout=subprocess.PIPE,stderr=subprocess.STDOUT,text=True,
    encoding="utf-8",bufsize=1,env=env)
output_lines=queue.Queue()
def collect_output(stream):
    for line in stream:
        output_lines.put(line)
threading.Thread(target=collect_output,args=(node.stdout,),daemon=True).start()
try:
    deadline=time.monotonic()+20
    address=None
    while time.monotonic()<deadline:
        try:
            line=output_lines.get(timeout=min(0.5,deadline-time.monotonic()))
        except queue.Empty:
            if node.poll() is not None:
                raise AssertionError("offline demo failed to start")
            continue
        match=re.search(r"http://127\.0\.0\.1:\d+",line)
        if match:
            address=match.group(0)
            break
    assert address, "offline demo URL missing"
    binary=(os.getenv("BROWSER_CHROME_PATH") or shutil.which("google-chrome")
        or shutil.which("google-chrome-stable") or shutil.which("chromium"))
    if not binary and os.name=="nt":
        roots=[os.getenv("PROGRAMFILES"),os.getenv("PROGRAMFILES(X86)"),
            os.getenv("LOCALAPPDATA")]
        candidates=[Path(root)/"Google"/"Chrome"/"Application"/"chrome.exe"
            for root in roots if root]
        binary=next((str(path) for path in candidates if path.is_file()),None)
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
            # Judge proof map is an explanatory, noninteractive source boundary:
            # it must not turn historical reports or fake APIs into provider proof.
            proof_map=page.locator("#proof-map-panel")
            expect(proof_map).to_be_visible()
            expect(page.locator("#proof-browser")).to_contain_text("OFFLINE BROWSER")
            expect(page.locator("#proof-browser")).to_contain_text("Global Services")
            expect(page.locator("#proof-fake-provider")).to_contain_text("INJECTED FAKE APIS")
            expect(page.locator("#proof-fake-provider")).to_contain_text("Provider calls: 0")
            expect(page.locator("#proof-owner-history")).to_contain_text("OWNER-REPORTED HISTORY")
            expect(page.locator("#proof-owner-history")).to_contain_text("not independently reproduced")
            expect(page.locator("#proof-release")).to_contain_text("NOT YET SUBMITTED")
            evidence=page.locator("#historical-provider-evidence")
            expect(evidence).to_contain_text("OWNER-REPORTED")
            expect(evidence).to_contain_text("NOT INDEPENDENTLY REPRODUCED")
            expect(evidence).to_contain_text("web, payments, qa")
            expect(evidence).to_contain_text("USD 1.50")
            expect(evidence).to_contain_text("PPL_OWNER_REAL_SANDBOX_LOCAL_RECEIPT_20261028.md")
            expect(evidence).to_contain_text("browser walkthrough below remains synthetic")
            for private_marker in ["checkoutnow", "PayerID", "client_secret", "access_token"]:
                assert private_marker not in page.locator("body").inner_text()
            assert sum(method=="POST" for method,_ in requests)==0
            before_disclosure=len(requests)
            evidence.locator("summary").click()
            assert len(requests)==before_disclosure
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
            expect(page.locator("#evidence-details")).to_contain_text("SQLite integrity: PASS")
            expect(page.locator("#evidence-details")).to_contain_text("local audit chain: PASS")
            expect(page.locator("#evidence-details")).to_contain_text("approved 0")
            before_evidence=sum(method=="POST" for method,_ in requests)
            page.locator("#evidence-refresh").click()
            expect(page.locator("#evidence-details")).to_contain_text("Provider transactions measured: NO")
            assert sum(method=="POST" for method,_ in requests)==before_evidence
            expect(page.locator("#quote-view")).to_contain_text("Version 1")
            page.reload()
            expect(page.locator("#message")).to_contain_text("Offline demo ready")
            page.locator("#refresh").click()
            # A read-only refresh is asynchronous. Do not issue a synthetic
            # submit while its runOnce guard is still busy: that would test
            # a dropped click rather than the actual quote draft path.
            expect(page.locator("#message")).to_contain_text("Read-only GET completed")
            assert sum(method=="POST" for method,_ in requests)==before_match+1
            # Second deliberate match after reload is safe. Candidate choice
            # only prepares local scope; it does NOT post draft or approve.
            page.locator("#marketplace-submit").click()
            expect(page.locator("#marketplace-choose-synthetic-web")).to_be_visible()
            before_prepare=sum(method=="POST" for method,_ in requests)
            page.locator("#marketplace-choose-synthetic-web").click()
            expect(page.locator("#scope")).to_have_value(
                re.compile(r"ecommerce website with PayPal checkout.*Synthetic candidate: synthetic-web"))
            expect(page.locator("#marketplace-selection-status")).to_contain_text(
                "No quote submitted")
            assert sum(method=="POST" for method,_ in requests)==before_prepare
            page.evaluate("""() => {
              const e=document.getElementById('draft-form');
              e.dispatchEvent(new Event('submit',{cancelable:true}));
              e.dispatchEvent(new Event('submit',{cancelable:true}));
            }""")
            expect(page.locator("#quote-view")).to_contain_text("Version 2")
            expect(page.locator("#quote-view")).to_contain_text("Synthetic candidate: synthetic-web")
            assert sum(method=="POST" and url.endswith("/draft")
                for method,url in requests)==1
            # Candidate binding is an explicit second action AFTER the draft.
            page.locator("#marketplace-confirm-synthetic-web").click()
            expect(page.locator("#marketplace-selection-status")).to_contain_text("Saved on server")
            assert sum(method=="POST" and url.endswith("/api/demo/marketplace/selection")
                for method,url in requests)==1
            proof=page.evaluate("""async () => {
              const r=await fetch('/api/demo/marketplace/selection?quoteId=sample-project',
                {credentials:'same-origin',cache:'no-store'});
              return {status:r.status,data:await r.json()};
            }""")
            assert proof["status"]==200
            assert proof["data"]["profileId"]=="synthetic-web"
            assert proof["data"]["quoteVersion"]==2
            assert proof["data"]["paymentAuthorized"] is False
            page.locator("#dollars").fill("17.55")
            page.locator("#confirm").check()
            page.evaluate("""() => {
              const e=document.getElementById('approve-form');
              e.dispatchEvent(new Event('submit',{cancelable:true}));
              e.dispatchEvent(new Event('submit',{cancelable:true}));
            }""")
            expect(page.locator("#quote-view")).to_contain_text("APPROVED")
            expect(page.locator("#quote-view")).to_contain_text("$17.55")
            page.locator("#evidence-refresh").click()
            expect(page.locator("#evidence-details")).to_contain_text("approved 1")
            expect(page.locator("#evidence-details")).to_contain_text("local audit chain: PASS")
            assert sum(method=="POST" and url.endswith("/approve")
                for method,url in requests)==1
            total=sum(method=="POST" for method,_ in requests)
            page.reload()
            expect(page.locator("#quote-view")).to_contain_text("APPROVED")
            assert sum(method=="POST" for method,_ in requests)==total
            page.locator("#draft-submit").click()
            expect(page.locator("#quote-view")).to_contain_text("Version 3")
            expect(page.locator("#quote-view")).to_contain_text("Not approved")
            page.locator("#reject-reason").fill("Please narrow the delivery scope")
            page.locator("#reject-submit").click()
            expect(page.locator("#quote-view")).to_contain_text("REJECTED")
            expect(page.locator("#quote-view")).to_contain_text("Please narrow the delivery scope")
            expect(page.locator("#approve-submit")).to_be_disabled()
            expect(page.locator("#reject-submit")).to_be_disabled()
            page.reload()
            expect(page.locator("#quote-view")).to_contain_text("Version 3 · REJECTED")
            expect(page.locator("#quote-view")).to_contain_text("Please narrow the delivery scope")
            expect(page.locator("#approve-submit")).to_be_disabled()
            page.locator("#draft-submit").click()
            expect(page.locator("#quote-view")).to_contain_text("Version 4")
            expect(page.locator("#quote-view")).not_to_contain_text("REJECTED")
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

            # The quote was revised to version 4; another approval is essential.
            # Quote v4 changed: prior v2 candidate proof cannot silently approve.
            page.locator("#dollars").fill("15.00")
            page.locator("#confirm").check()
            page.locator("#approve-submit").click()
            expect(page.locator("#message")).to_contain_text("QUOTE_SELECTION_STALE")
            expect(page.locator("#quote-view")).to_contain_text("Not approved")
            page.locator("#marketplace-brief").fill(
                "Build an ecommerce website with PayPal checkout")
            page.locator("#marketplace-submit").click()
            expect(page.locator("#marketplace-choose-synthetic-web")).to_be_visible()
            page.locator("#marketplace-choose-synthetic-web").click()
            page.locator("#marketplace-confirm-synthetic-web").click()
            expect(page.locator("#marketplace-selection-status")).to_contain_text("quote version 4")
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

            # The interactive offline demo uses the same CSRF-protected
            # synthetic session switch as the manual judge walkthrough.
            page.locator("#demo-role-toggle").click()
            expect(page.locator("#demo-session-role")).to_contain_text("synthetic reviewer")
            expect(page.locator("#session-role")).to_contain_text("reviewer")
            expect(page.locator("#contract-fulfillment")).to_have_text("SUBMITTED")
            assert page.locator("#draft-panel").is_hidden()
            assert page.locator("#marketplace-panel").is_hidden()
            assert page.locator("#delivery-form").is_hidden()
            before_reload=sum(method=="POST" for method,_ in requests)
            page.reload()
            assert sum(method=="POST" for method,_ in requests)==before_reload
            page.locator("#review-note").fill("Missing synthetic source assets")
            page.locator("#review-reject").click()
            expect(page.locator("#contract-fulfillment")).to_have_text("REJECTED")
            expect(page.locator("#contract-payment")).to_have_text("NOT_CAPTURED")
            assert sum(method=="POST" and "/api/contracts/" in url and url.endswith("/reject")
                for method,url in requests)==1
            page.locator("#demo-role-toggle").click()
            expect(page.locator("#demo-session-role")).to_contain_text("synthetic owner")
            expect(page.locator("#contract-fulfillment")).to_have_text("REJECTED")
            page.locator("#delivery-note").fill("Revised synthetic project files")
            page.locator("#delivery-submit").click()
            expect(page.locator("#contract-fulfillment")).to_have_text("SUBMITTED")
            page.locator("#demo-role-toggle").click()
            expect(page.locator("#demo-session-role")).to_contain_text("synthetic reviewer")
            expect(page.locator("#contract-fulfillment")).to_have_text("SUBMITTED")
            page.locator("#review-accept").click()
            expect(page.locator("#contract-fulfillment")).to_have_text("ACCEPTED")
            page.locator("#demo-role-toggle").click()
            expect(page.locator("#demo-session-role")).to_contain_text("synthetic owner")
            page.locator("#contract-refresh").click()
            expect(page.locator("#contract-fulfillment")).to_have_text("ACCEPTED")
            expect(page.locator("#contract-payment")).to_have_text("NOT_CAPTURED")
            # Judge-visible ledger timeline; only GET reads, not new payment actions.
            expect(page.locator("#contract-events")).to_contain_text("CREATED")
            expect(page.locator("#contract-events")).to_contain_text("REJECTED")
            expect(page.locator("#contract-events")).to_contain_text("ACCEPTED")
            assert sum(method=="POST" and "/orders" in url for method,url in requests)==0
            assert sum(method=="POST" and "/orders" in url
                for method,url in requests)==0
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
            # Mobile viewport and the second owner-approved category must remain
            # independently clickable, without changing shared payment authority.
            mobile=browser.new_page(viewport={"width":390,"height":844},device_scale_factor=1)
            try:
                mobile_requests=[]
                mobile.on("request",lambda req: mobile_requests.append((req.method,req.url)))
                mobile.goto(address)
                expect(mobile.locator("#marketplace-vertical")).to_be_visible()
                overflow=mobile.evaluate("""() => ({
                    width:window.innerWidth,
                    scroll:document.documentElement.scrollWidth,
                    body:document.body.scrollWidth,
                    bodyClient:document.body.clientWidth,
                    over:[...document.querySelectorAll('body *')]
                      .map(el=>({tag:el.tagName,id:el.id,className:String(el.className||'').slice(0,24),
                        right:Math.round(el.getBoundingClientRect().right*100)/100,
                        x:Math.round(el.getBoundingClientRect().left*100)/100,
                        scroll:el.scrollWidth,client:el.clientWidth}))
                      .filter(x=>x.right>window.innerWidth-20||x.x< -2||x.scroll>x.client+2)
                      .sort((a,b)=>b.right-a.right)
                      .slice(0,25)
                })""")
                assert overflow["scroll"]<=overflow["width"]+2, \
                    f"Mobile horizontal overflow diagnostics: {overflow}"
                mobile.locator("#marketplace-vertical").select_option("general_services")
                expect(mobile.locator("#marketplace-brief")).to_have_value(
                    re.compile(r"logo and brand identity"))
                mobile.locator("#marketplace-submit").click()
                expect(mobile.locator("#marketplace-results")).to_contain_text("Demo Creative Designer")
                expect(mobile.locator("#marketplace-choose-synthetic-creative")).to_be_visible()
                mobile.locator("#marketplace-choose-synthetic-creative").click()
                expect(mobile.locator("#scope")).to_have_value(
                    re.compile(r"Synthetic candidate: synthetic-creative"))
                assert sum(method=="POST" and url.endswith("/api/demo/marketplace")
                    for method,url in mobile_requests)==1
                assert not any(method=="POST" and "/orders" in url
                    for method,url in mobile_requests)
            finally:
                mobile.close()
            print("CHROMIUM_BROWSER_E2E_PASS: two-vertical-mobile+marketplace+quote+contract+subscription+integration, no provider/payment POST")
        finally:
            browser.close()
finally:
    node.terminate()
    try: node.wait(timeout=5)
    except subprocess.TimeoutExpired:
        node.kill(); node.wait()

    try: Path(reviewer_path).unlink(missing_ok=True)
    except OSError: pass

