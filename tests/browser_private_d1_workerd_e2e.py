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
            page.on("pageerror",lambda exc: errors.append("PAGE_SCRIPT_ERROR"))
            page.on("console",lambda msg:
                errors.append("CONSOLE_ERROR") if msg.type=="error" and
                "favicon" not in msg.text.lower() else None)
            view="/__private/attempts/view"
            # Anonymous browser never receives the shell page or its JS.
            anonymous=page.goto(origin+view,wait_until="domcontentloaded")
            assert anonymous is not None and anonymous.status==401,"ANONYMOUS_BROWSER_VIEW_ALLOWED"
            assert page.locator("#rows").count()==0,"ANONYMOUS_BROWSER_SHELL_RENDERED"
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
            expect(page.locator("#rows tr")).to_have_count(2,timeout=8000)
            expect(page.locator("#status")).to_contain_text("2 owner-scoped",timeout=8000)
            for value in ("ciRequest","ciIdentityRequest"):
                assert page.locator("#rows").get_by_text(value,exact=True).count()==1,"OWNER_D1_ROW_MISSING"
            assert page.locator("#rows").get_by_text("PAID",exact=True).count()==0,"PAYMENT_STATUS_INFERRED"
            assert "LOCAL D1 RECORDS ARE NOT PAYPAL TRANSACTIONS" in page.locator(".notice").inner_text()
            assert "IN_FLIGHT (LOCAL)" in page.locator("tbody").inner_text()
            # A user-visible limit change and Refresh must GET the same
            # owner-only data without an API POST, checkout or model call.
            page.locator("#limit").select_option("20")
            expect(page.locator("#status")).to_contain_text("2 owner-scoped",timeout=8000)
            page.locator("#refresh").click()
            expect(page.locator("#rows tr")).to_have_count(2,timeout=8000)
            page.reload(wait_until="domcontentloaded")
            expect(page.locator("#rows tr")).to_have_count(2,timeout=8000)
            assert not errors,"CHROMIUM_CONSOLE_OR_SCRIPT_ERROR"
            assert not blocked,"BROWSER_EXTERNAL_REQUEST_ATTEMPTED"
            assert all(m=="GET" for m,_ in network),"BROWSER_MUTATION_NETWORK_ATTEMPTED"
            assert any(path=="/__private/attempts/view.js" for _,path in network),"BROWSER_JS_MISSING"
            assert any(path=="/__private/attempts/view.css" for _,path in network),"BROWSER_CSS_MISSING"
            assert sum(path.startswith("/__private/attempts?limit=") for _,path in network)>=3,"BROWSER_D1_GET_MISSING"
            print(json.dumps({"status":"REAL_LOCAL_WORKERD_CHROMIUM_OWNER_D1_VIEW_PASS",
                "realChromium":True,"localHttps":True,"renderedRows":2,
                "anonymousBlocked":True,"browserRefreshReadOnly":True,
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
        print(json.dumps({"status":"LOCAL_WORKERD_CHROMIUM_BLOCKED","reason":code}))
        sys.exit(2)
