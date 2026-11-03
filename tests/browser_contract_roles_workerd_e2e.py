"""CI-only real Chromium contract role UI against ephemeral local HTTPS Workerd+D1.
Synthetic signed role cookies only via stdin. Never performs provider requests.
"""
import json
import re
import shutil
import sys
from urllib.parse import urlsplit
from playwright.sync_api import sync_playwright, expect

PHASE="START"
def phase(p):
    global PHASE
    PHASE=p
def origin_check(origin):
    u=urlsplit(origin)
    if (u.scheme!="https" or u.hostname!="127.0.0.1" or
        u.port is None or u.port<1024 or u.port>65535 or u.path or u.query or
        u.fragment or u.username or u.password or
        origin!=f"https://127.0.0.1:{u.port}"):
        raise AssertionError("LOCAL_HTTPS_ORIGIN_REQUIRED")
    return origin
def main():
    if len(sys.argv)!=2:
        raise AssertionError("EXPLICIT_LOCAL_TEST_REQUIRED")
    origin=origin_check(sys.argv[1])
    secrets=json.load(sys.stdin)
    credentials={
        "OWNER":("__Host-proofline_session",secrets.get("ownerCookie")),
        "SELLER":("__Host-proofline_contract_role",secrets.get("sellerCookie")),
        "REVIEWER":("__Host-proofline_contract_role",secrets.get("reviewerCookie"))
    }
    for label,(name,token) in credentials.items():
        if not isinstance(token,str) or not re.fullmatch(r"[A-Za-z0-9_-]{43}",token):
            raise AssertionError("LOCAL_"+label+"_COOKIE_REQUIRED")
    binary=(shutil.which("google-chrome") or
            shutil.which("google-chrome-stable") or shutil.which("chromium"))
    if not binary:
        raise AssertionError("CHROMIUM_NOT_INSTALLED")
    blocked=[]
    network=[]
    errors=[]
    with sync_playwright() as playwright:
        browser=playwright.chromium.launch(executable_path=binary,headless=True,
            args=["--no-sandbox","--disable-dev-shm-usage","--disable-background-networking","--no-first-run"])
        try:
            pages={}
            for label,(name,token) in credentials.items():
                context=browser.new_context(ignore_https_errors=True,service_workers="block")
                context.add_cookies([{"name":name,"value":token,"url":origin+"/",
                    "secure":True,"httpOnly":True,"sameSite":"Strict"}])
                def route_guard(route):
                    url=route.request.url
                    if not url.startswith(origin+"/"):
                        blocked.append("OUTSIDE_LOCAL_ORIGIN")
                        route.abort()
                    else:
                        network.append((route.request.method,url[len(origin):]))
                        route.continue_()
                context.route("**/*",route_guard)
                page=context.new_page()
                page.on("pageerror",lambda e:errors.append("PAGE_SCRIPT_ERROR"))
                page.on("console",lambda m:
                    errors.append("CONSOLE_ERROR") if m.type=="error" and
                    "favicon" not in m.text.lower() else None)
                response=page.goto(origin+"/__private/contracts/view",wait_until="domcontentloaded")
                assert response is not None and response.status==200,"ROLE_PAGE_UNAVAILABLE"
                expect(page.locator("h1")).to_contain_text("Contracts and milestone review")
                expect(page.locator("#role")).to_contain_text("Authenticated contract role:",timeout=8000)
                pages[label]=(context,page)
            owner=pages["OWNER"][1]
            phase("BUYER_CREATE_BROWSER")
            expect(owner.locator("#role")).to_contain_text("BUYER")
            expect(owner.locator("#status")).to_contain_text("Showing 1 D1 contracts")
            form=owner.locator("#contract-form")
            for key,value in {
                "quoteId":"ciQuote","quoteVersion":"1","sellerId":"ciSeller",
                "reviewerId":"ciReviewer","milestoneId":"browser1",
                "milestoneTitle":"Browser-delivered milestone with independently reviewed source archive"
            }.items():
                form.locator(f'[name="{key}"]').fill(value)
            form.get_by_role("button",name="Create D1 contract").click()
            expect(owner.locator("#status")).to_contain_text("Contract saved to D1; no payment executed.",timeout=8000)
            contract_title="Browser-delivered milestone"
            item=lambda page:page.locator("article.contract").filter(has_text=contract_title)
            expect(item(owner)).to_have_count(1,timeout=8000)
            expect(item(owner)).to_contain_text("State: PENDING")
            owner.reload(wait_until="domcontentloaded")
            expect(owner.locator("#status")).to_contain_text("Showing 2 D1 contracts",timeout=8000)
            seller=pages["SELLER"][1]
            phase("SELLER_BROWSER_SUBMIT")
            seller.reload(wait_until="domcontentloaded")
            expect(seller.locator("#role")).to_contain_text("SELLER")
            expect(item(seller)).to_have_count(1,timeout=8000)
            def act(page,button_label,detail):
                contract=item(page)
                frm=contract.locator("form.action").filter(has_text=button_label)
                expect(frm).to_have_count(1,timeout=8000)
                frm.locator("textarea").fill(detail)
                if "Accept" in button_label:
                    frm.locator('input[type="checkbox"]').check()
                frm.get_by_role("button",name=button_label).click()
                expect(page.locator("#status")).to_contain_text("Milestone state saved to D1; no PayPal action.",timeout=8000)
            act(seller,"Submit delivery for review","Signed delivery, checksum and test plan")
            expect(item(seller)).to_contain_text("State: SUBMITTED",timeout=8000)
            reviewer=pages["REVIEWER"][1]
            phase("REVIEWER_BROWSER_REJECT")
            reviewer.reload(wait_until="domcontentloaded")
            expect(reviewer.locator("#role")).to_contain_text("REVIEWER")
            act(reviewer,"Reject and request corrections","Need independent regression evidence")
            expect(item(reviewer)).to_contain_text("State: REJECTED",timeout=8000)
            phase("SELLER_BROWSER_RESUBMIT")
            seller.reload(wait_until="domcontentloaded")
            act(seller,"Submit delivery for review","Added reviewer-requested regression details")
            expect(item(seller)).to_contain_text("State: SUBMITTED",timeout=8000)
            phase("REVIEWER_BROWSER_ACCEPT")
            reviewer.reload(wait_until="domcontentloaded")
            act(reviewer,"Accept milestone (no payment)","Evidence verified and final delivery accepted")
            expect(item(reviewer)).to_contain_text("State: ACCEPTED",timeout=8000)
            owner.reload(wait_until="domcontentloaded")
            expect(item(owner)).to_contain_text("State: ACCEPTED",timeout=8000)
            phase("NETWORK_CONSOLE_ASSERT")
            posts=[path for method,path in network if method=="POST"]
            assert len(posts)==5,"BROWSER_POST_COUNT_UNEXPECTED"
            assert posts[0]=="/__private/contracts","BROWSER_CONTRACT_CREATE_MISSING"
            assert all(p.startswith("/__private/contracts/") and "/milestones/browser1/" in p for p in posts[1:]),"BROWSER_UNEXPECTED_MUTATION_PATH"
            assert not blocked,"EXTERNAL_REQUEST_ATTEMPTED"
            assert not errors,"BROWSER_SCRIPT_OR_CONSOLE_ERROR"
            print(json.dumps({"status":"LOCAL_WORKERD_CHROMIUM_3ROLE_D1_CONTRACT_PASS",
              "realChromium":True,"localHttps":True,"threeRoleViewsRendered":True,
              "buyerContractCreated":True,"sellerSubmits":2,"reviewerRejects":1,
              "reviewerAccepts":1,"finalState":"ACCEPTED","browserPosts":5,
              "externalRequests":0,"browserErrors":0,"providerCalls":0,
              "paymentAuthorized":False,"publicDeployment":False}))
        finally:
            browser.close()
if __name__=="__main__":
    try:
        main()
    except Exception as exc:
        msg=str(exc)
        reason=msg if re.fullmatch(r"[A-Z_]{4,80}",msg) else "BROWSER_ASSERTION_FAILED"
        print(json.dumps({"status":"LOCAL_WORKERD_CHROMIUM_ROLE_TEST_BLOCKED",
                          "phase":PHASE,"reason":reason,
                          "exceptionType":type(exc).__name__}))
        sys.exit(2)
