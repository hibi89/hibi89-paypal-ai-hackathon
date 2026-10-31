"""Actual Chromium owner→seller→reviewer mock, 0 provider/PayPal calls."""
import os,queue,re,shutil,subprocess,threading,time
from pathlib import Path
from playwright.sync_api import sync_playwright,expect

root=Path(__file__).resolve().parents[1]
node=subprocess.Popen(
    ["node","--experimental-sqlite","scripts/run_demo.mjs","--synthetic-seller"],
    cwd=root,stdout=subprocess.PIPE,stderr=subprocess.STDOUT,text=True,bufsize=1
)
lines=queue.Queue()
threading.Thread(target=lambda:[lines.put(x) for x in node.stdout],daemon=True).start()
try:
    deadline=time.monotonic()+20
    address=None
    while time.monotonic()<deadline and not address:
        try:line=lines.get(timeout=0.5)
        except queue.Empty:continue
        match=re.search(r"http://127\.0\.0\.1:\d+",line)
        if match:address=match.group(0)
    assert address,"OFFLINE_SELLER_SERVER_NOT_STARTED"
    binary=(os.getenv("BROWSER_CHROME_PATH") or shutil.which("google-chrome")
        or shutil.which("google-chrome-stable") or shutil.which("chromium"))
    assert binary,"CHROMIUM_NOT_INSTALLED"
    with sync_playwright() as p:
        browser=p.chromium.launch(executable_path=binary,headless=True,
            args=["--no-sandbox","--disable-dev-shm-usage"])
        try:
            page=browser.new_page()
            network=[]
            page.on("request",lambda r:network.append((r.method,r.url)))
            page.goto(address)
            expect(page.locator("#message")).to_contain_text("Offline demo ready")
            assert sum(method=="POST" for method,_ in network)==0
            # Existing owner approval remains an explicit step, no auto-order.
            page.locator("#draft-submit").click()
            expect(page.locator("#quote-view")).to_contain_text("Version 2")
            page.locator("#dollars").fill("29.00")
            page.locator("#confirm").check()
            page.locator("#approve-submit").click()
            expect(page.locator("#quote-view")).to_contain_text("APPROVED")
            page.locator("#contract-create").click()
            expect(page.locator("#contract-fulfillment")).to_have_text("PENDING")
            expect(page.locator("#contract-assign-seller")).to_be_visible()
            page.locator("#contract-assign-seller").click()
            expect(page.locator("#contract-message")).to_contain_text("Fictional seller assigned")
            # Role switch uses server-issued HttpOnly synthetic cookie.
            page.locator("#demo-role-toggle").click()
            expect(page.locator("#demo-session-role")).to_contain_text("synthetic seller")
            expect(page.locator("#contract-fulfillment")).to_have_text("PENDING")
            expect(page.locator("#delivery-form")).to_be_visible()
            expect(page.locator("#contract-events")).to_contain_text("CREATED")
            page.locator("#delivery-form button").click()
            expect(page.locator("#contract-fulfillment")).to_have_text("SUBMITTED")
            expect(page.locator("#contract-events")).to_contain_text("synthetic-seller")
            page.reload()
            expect(page.locator("#contract-fulfillment")).to_have_text("SUBMITTED")
            # Reviewer alone can reject.
            page.locator("#demo-role-toggle").click()
            expect(page.locator("#demo-session-role")).to_contain_text("synthetic reviewer")
            expect(page.locator("#review-actions")).to_be_visible()
            page.locator("#review-reject").click()
            expect(page.locator("#contract-fulfillment")).to_have_text("REJECTED")
            # Reviewer -> owner -> seller for explicit rework.
            page.locator("#demo-role-toggle").click()
            expect(page.locator("#demo-session-role")).to_contain_text("synthetic owner")
            page.locator("#demo-role-toggle").click()
            expect(page.locator("#demo-session-role")).to_contain_text("synthetic seller")
            page.locator("#delivery-form button").click()
            expect(page.locator("#contract-fulfillment")).to_have_text("SUBMITTED")
            page.locator("#demo-role-toggle").click()
            expect(page.locator("#demo-session-role")).to_contain_text("synthetic reviewer")
            page.locator("#review-accept").click()
            expect(page.locator("#contract-fulfillment")).to_have_text("ACCEPTED")
            expect(page.locator("#contract-events")).to_contain_text("ACCEPTED")
            expect(page.locator("#contract-payment")).to_have_text("NOT_CAPTURED")
            assert all("/paypal.com/" not in url and "generativelanguage.googleapis.com" not in url
                for _,url in network)
            assert sum(method=="POST" and "/api/demo/workflow/" in url
                for method,url in network)>=5
            print("CHROMIUM_SYNTHETIC_SELLER_REVIEWER_E2E_PASS: owner→seller→reviewer→rework→accept; payment NOT_CAPTURED")
        finally:browser.close()
finally:
    node.terminate()
    try:node.wait(timeout=6)
    except subprocess.TimeoutExpired:node.kill()
