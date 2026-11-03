"""Real Chromium render against an ephemeral local HTTPS workerd + D1 fixture.
CI-only: no provider egress, public deployment, real credentials or disk screenshots.
The verified 32-byte synthetic session cookie is supplied on stdin, not argv/logs.
"""
import json
import re
import shutil
import sys
from urllib.parse import urlsplit
from playwright.sync_api import sync_playwright, expect

PHASE='START'
def mark(name):
    global PHASE
    PHASE=name

def checked_origin(text):
    u=urlsplit(text)
    if (u.scheme!="https" or u.hostname!="127.0.0.1" or
        u.port is None or u.port < 1024 or u.port > 65535 or
        u.path or u.query or u.fragment or u.username or u.password or
        text!=f"https://127.0.0.1:{u.port}"):
        raise AssertionError("LOCAL_HTTPS_ORIGIN_REQUIRED")
    return text

def main():
    if len(sys.argv)!=3 or sys.argv[2] not in ("active","revoked"):
        raise AssertionError("EXPLICIT_SYNTHETIC_MODE_REQUIRED")
    origin=checked_origin(sys.argv[1])
    mode=sys.argv[2]
    obj=json.load(sys.stdin)
    cookie=obj.get("sessionCookie")
    if not isinstance(cookie,str) or not re.fullmatch(r"__Host-proofline_session=[A-Za-z0-9_-]{43}",cookie):
        raise AssertionError("SYNTHETIC_SIGNED_SESSION_REQUIRED")
    binary=(shutil.which("google-chrome") or
            shutil.which("google-chrome-stable") or shutil.which("chromium"))
    if not binary:
        raise AssertionError("CHROMIUM_NOT_INSTALLED")
    mark('CHROMIUM_LAUNCH')
    with sync_playwright() as playwright:
        browser=playwright.chromium.launch(
            executable_path=binary,headless=True,
            args=["--no-sandbox","--disable-dev-shm-usage",
                  "--disable-background-networking","--no-first-run"])
        try:
            context=browser.new_context(
                ignore_https_errors=True,  # strictly ephemeral loopback self-signed cert
                service_workers="block")
            network=[]
            blocked=[]
            errors=[]
            def filter_route(route):
                url=route.request.url
                if not url.startswith(origin+"/"):
                    blocked.append("OUTSIDE_LOCAL_ORIGIN")
                    route.abort()
                else:
                    network.append((route.request.method,url[len(origin):]))
                    route.continue_()
            context.route("**/*",filter_route)
            page=context.new_page()
            # Anonymous 401 is a *required* auth denial and Chrome may log it
            # as a console error. Do not mix that with authenticated UI errors.
            # Register pageerror/console listeners on the signed-in page only.
            view="/__private/attempts/view"
            # Anonymous browser never receives the shell page or its JS.
            mark('ANONYMOUS_NAVIGATION')
            anonymous=page.goto(origin+view,wait_until="domcontentloaded")
            assert anonymous is not None and anonymous.status==401,"ANONYMOUS_BROWSER_VIEW_ALLOWED"
            assert page.locator("#rows").count()==0,"ANONYMOUS_BROWSER_SHELL_RENDERED"
            mark('SYNTHETIC_COOKIE_SET')
            context.add_cookies([{
                "name":"__Host-proofline_session",
                "value":cookie.split("=",1)[1],
                "url":origin+"/",
                "secure":True,"httpOnly":True,"sameSite":"Strict"
            }])
            page= context.new_page()
            page.on("pageerror",lambda exc: errors.append("PAGE_SCRIPT_ERROR"))
            page.on("console",lambda msg:
                errors.append("CONSOLE_ERROR") if msg.type=="error" and
                "favicon" not in msg.text.lower() else None)
            mark('AUTHENTICATED_NAVIGATION')
            response=page.goto(origin+view,wait_until="domcontentloaded")
            if mode=="revoked":
                assert response is not None and response.status==401,"REVOKED_BROWSER_VIEW_ALLOWED"
                assert page.locator("#rows").count()==0,"REVOKED_BROWSER_SHELL_RENDERED"
                assert not any(x[1].startswith("/__private/attempts?") for x in network),"REVOKED_BROWSER_DATA_ATTEMPTED"
                assert not blocked,"BROWSER_EXTERNAL_REQUEST_ATTEMPTED"
                print(json.dumps({"status":"LOCAL_WORKERD_CHROMIUM_REVOKED_SESSION_BLOCKED",
                  "realChromium":True,"localHttps":True,"revokedCookieBlocked":True,
                  "externalRequests":0,"paymentPosts":0}))
                return
            assert response is not None and response.status==200,"AUTH_BROWSER_VIEW_UNAVAILABLE"
            expect(page.locator("h1")).to_contain_text("Recent attempt evidence")
            mark('D1_ROWS_RENDER')
            expect(page.locator("#rows tr")).to_have_count(2,timeout=8000)
            expect(page.locator("#status")).to_contain_text("2 owner-scoped",timeout=8000)
            for value in ("ciRequest","ciIdentityRequest"):
                assert page.locator("#rows").get_by_text(value,exact=True).count()==1,"OWNER_D1_ROW_MISSING"
            assert page.locator("#rows").get_by_text("PAID",exact=True).count()==0,"PAYMENT_STATUS_INFERRED"
            assert "LOCAL D1 RECORDS ARE NOT PAYPAL TRANSACTIONS" in page.locator(".notice").inner_text()
            assert "IN_FLIGHT (LOCAL)" in page.locator("tbody").inner_text()
            # A user-visible limit change and Refresh must GET the same
            # owner-only data without an API POST, checkout or model call.
            mark('BROWSER_REFRESH_AND_RELOAD')
            page.locator("#limit").select_option("20")
            expect(page.locator("#status")).to_contain_text("2 owner-scoped",timeout=8000)
            page.locator("#refresh").click()
            expect(page.locator("#rows tr")).to_have_count(2,timeout=8000)
            page.reload(wait_until="domcontentloaded")
            expect(page.locator("#rows tr")).to_have_count(2,timeout=8000)
            mark('CONSOLE_NETWORK_VERIFY')
            assert not errors,"CHROMIUM_CONSOLE_OR_SCRIPT_ERROR"
            assert not blocked,"BROWSER_EXTERNAL_REQUEST_ATTEMPTED"
            assert all(m=="GET" for m,_ in network),"BROWSER_MUTATION_NETWORK_ATTEMPTED"
            assert any(path=="/__private/attempts/view.js" for _,path in network),"BROWSER_JS_MISSING"
            assert any(path=="/__private/attempts/view.css" for _,path in network),"BROWSER_CSS_MISSING"
            assert sum(path.startswith("/__private/attempts?limit=") for _,path in network)>=3,"BROWSER_D1_GET_MISSING"
            # Owner audits are a deliberately clicked, session-scoped
            # READ-ONLY POST; initial navigation and refresh must remain GET-only.
            mark('BROWSER_D1_AUDIT_CLICK')
            expect(page.locator('#audit-panel')).to_be_hidden()
            row=page.locator('#rows tr').filter(has_text='ciIdentityRequest')
            expect(row).to_have_count(1)
            row.locator('button.audit-action').click()
            expect(page.locator('#audit-panel')).to_be_visible()
            expect(page.locator('#audit-status')).to_contain_text(
                '2 internal D1 audit event(s)',timeout=8000)
            expect(page.locator('#audit-events li')).to_have_count(2,timeout=8000)
            expect(page.locator('#audit-events')).to_contain_text('CLAIM_CREATED')
            expect(page.locator('#audit-events')).to_contain_text('REMOTE_ID_BOUND')
            assert 'ORDER_FIXTURE_001' not in page.locator('#audit-panel').inner_text(), 'RAW_REMOTE_ORDER_LEAKED'
            assert page.locator('#audit-older').is_hidden(), 'UNEXPECTED_AUDIT_CURSOR'
            # The OTHER owner-bound attempt is seeded with 52 explicitly
            # synthetic audit baselines plus its original real D1 insert
            # trigger. Prove the 50+3 page boundary through a live browser.
            mark('BROWSER_D1_AUDIT_PAGINATION')
            historic=page.locator('#rows tr').filter(has_text='ciRequest')
            expect(historic).to_have_count(1)
            historic.locator('button.audit-action').click()
            expect(page.locator('#audit-status')).to_contain_text(
                '50 internal D1 audit event(s)',timeout=8000)
            expect(page.locator('#audit-events li')).to_have_count(50,timeout=8000)
            expect(page.locator('#audit-older')).to_be_visible()
            page.locator('#audit-older').click()
            expect(page.locator('#audit-status')).to_contain_text(
                '53 internal D1 audit event(s)',timeout=8000)
            expect(page.locator('#audit-events li')).to_have_count(53,timeout=8000)
            assert page.locator('#audit-older').is_hidden(), 'AUDIT_PAGE_CURSOR_NOT_EXHAUSTED'
            audit_lines=page.locator('#audit-events li').all_inner_texts()
            assert audit_lines[0].startswith('CLAIM_CREATED'), 'OLD_AUDIT_PAGE_NOT_PREPENDED'
            assert sum('MIGRATION_BASELINE' in s for s in audit_lines)==52, 'AUDIT_HISTORY_LOST_OR_DUPLICATED'
            assert 'ORDER_FIXTURE_001' not in page.locator('#audit-panel').inner_text(), 'AUDIT_PAGE_RAW_ORDER_LEAK'
            assert [p for m,p in network if m=='POST']==[
                '/__private/paypal/claim-audit',
                '/__private/paypal/claim-audit',
                '/__private/paypal/claim-audit'
            ],'AUDIT_VIEW_UNEXPECTED_NETWORK_POST'
            assert not errors,'AUDIT_BROWSER_CONSOLE_ERROR'
            assert not blocked,'AUDIT_BROWSER_EXTERNAL_REQUEST'
            # Unlike the owner audit inspection, the quote workbench has
            # two separately authorized same-origin local D1 writes.
            mark('QUOTE_UI_BROWSER_WRITE')
            quote_response=page.goto(origin+"/__private/quotes/view",wait_until="domcontentloaded")
            assert quote_response is not None and quote_response.status==200,"QUOTE_BROWSER_VIEW_UNAVAILABLE"
            expect(page.locator("h1")).to_contain_text("Quotes and human approval")
            expect(page.locator("#status")).to_contain_text("Showing 3 D1 owner quotes",timeout=8000)
            scope_text="Chromium-created owner service with saved deliverables and an audit checklist"
            page.locator("#scope").fill(scope_text)
            page.locator("#draft button").click()
            expect(page.locator("#status")).to_contain_text("Draft saved to real D1.",timeout=8000)
            quote=page.locator("article.quote").filter(has_text=scope_text)
            expect(quote).to_have_count(1,timeout=8000)
            quote_id=quote.locator("h3").inner_text()
            assert re.fullmatch(r"q_[a-f0-9]{32}",quote_id),"BROWSER_QUOTE_ID_INVALID"
            expect(quote).to_contain_text("Status: PROPOSED")
            quote.locator(".approval input[type=number]").fill("26375")
            quote.locator(".approval input[type=checkbox]").check()
            quote.locator(".approval button").click()
            expect(page.locator("#status")).to_contain_text(
                "Amount approved and saved to D1; no PayPal action.",timeout=8000)
            expect(quote).to_contain_text("Human approved: USD 263.75",timeout=8000)
            page.reload(wait_until="domcontentloaded")
            expect(page.locator("#status")).to_contain_text("Showing 4 D1 owner quotes",timeout=8000)
            saved_quote=page.locator("article.quote").filter(has_text=scope_text)
            expect(saved_quote).to_have_count(1)
            expect(saved_quote).to_contain_text("Human approved: USD 263.75")
            assert saved_quote.locator(".approval").count()==0,"BROWSER_APPROVED_QUOTE_EDITABLE"
            post_paths=[path for method,path in network if method=="POST"]
            assert post_paths==[
                "/__private/paypal/claim-audit",
                "/__private/paypal/claim-audit",
                "/__private/paypal/claim-audit",
                "/__private/quotes",f"/__private/quotes/{quote_id}/approve"
            ],"BROWSER_UNEXPECTED_MUTATION_ENDPOINT"
            assert not errors,"QUOTE_CHROMIUM_CONSOLE_OR_SCRIPT_ERROR"
            assert not blocked,"QUOTE_BROWSER_EXTERNAL_REQUEST_ATTEMPTED"
            assert any(path=="/__private/quotes/view.js" for _,path in network),"QUOTE_BROWSER_JS_MISSING"
            assert any(path=="/__private/quotes/view.css" for _,path in network),"QUOTE_BROWSER_CSS_MISSING"
            print(json.dumps({"status":"REAL_LOCAL_WORKERD_CHROMIUM_OWNER_D1_VIEW_PASS",
                "realChromium":True,"localHttps":True,"renderedRows":2,
                "anonymousBlocked":True,"browserRefreshReadOnly":True,
                "browserQuoteD1CreateApprove":True,"quoteApiPosts":2,
                "realLocalD1AuditButton":True,"auditEventsRead":55,
                "auditOlderPageLoaded":True,"auditPagesVerified":3,
                "browserQuoteD1CountAfterReload":4,
                "scriptAndStylesLoaded":True,"pageErrors":0,"externalRequests":0,
                "paymentPosts":0,"realIdpCalls":0,"providerCalls":0,
                "publicDeployment":False,"remoteD1Verified":False}))
        finally:
            browser.close()

if __name__=="__main__":
    try:
        main()
    except Exception as exc:
        # Never print raw exceptions, network URLs or bearer/session material.
        message=str(exc)
        code=message if re.fullmatch(r"[A-Z_]{4,80}",message) else "BROWSER_ASSERTION_FAILED"
        print(json.dumps({"status":"LOCAL_WORKERD_CHROMIUM_BLOCKED",
                          "phase":PHASE,"reason":code,
                          "exceptionType":type(exc).__name__}))
        sys.exit(2)
