"""Real Chromium sign-in form -> fake OIDC issuer -> PKCE callback -> private session.

Two actual loopback TLS 1.3 sockets are reached through a strict local CONNECT
proxy. Fake IdP issues test-only RS256 assertions; no live identity provider,
merchant verification, paid Gemini, PayPal or public network is involved.
"""
import json,queue,shutil,subprocess,threading
from playwright.sync_api import sync_playwright,expect

APP="https://proofline.example.com"
IDP="https://accounts.example.org"
proc=subprocess.Popen(
 ["node","--experimental-sqlite",
  "scripts/private_marketplace_chromium_fixture.mjs","--browser-login"],
 stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True,bufsize=1
)
lines=queue.Queue()
threading.Thread(target=lambda:[lines.put(line) for line in proc.stdout],
 daemon=True).start()
try:
 try: fixture=json.loads(lines.get(timeout=25))
 except queue.Empty: raise AssertionError("LOCAL_FAKE_IDP_NOT_READY")
 assert fixture["mode"]=="OFFLINE_CHROMIUM_REAL_OIDC_BROWSER_LOGIN",fixture
 assert fixture["fakeProviderAuthorizeRequests"]==0
 assert fixture["paypalCaptureEnabled"] is False
 proxy_port=fixture["proxyPort"]
 assert isinstance(proxy_port,int) and 1024<=proxy_port<=65535
 executable=(shutil.which("google-chrome") or
    shutil.which("google-chrome-stable") or shutil.which("chromium"))
 assert executable,"CHROMIUM_NOT_INSTALLED"
 with sync_playwright() as p:
  browser=p.chromium.launch(executable_path=executable,
   headless=True,args=["--no-sandbox","--disable-dev-shm-usage"])
  try:
   ctx=browser.new_context(
    proxy={"server":f"http://127.0.0.1:{proxy_port}"},
    ignore_https_errors=True,  # Only two ephemeral local certs in this test.
    service_workers="block")
   page=ctx.new_page()
   errors=[]
   outbound=[]
   sessions=[]
   page.on("pageerror",lambda err:errors.append(str(err)))
   page.on("request",lambda request:outbound.append(
    (request.method,request.url)))
   page.on("response",lambda resp:sessions.append(
    (resp.status,resp.url)))
   response=page.goto(APP+"/private/marketplace",wait_until="load",
    timeout=15000)
   assert response.status==200
   details=response.security_details()
   assert details["protocol"].startswith("TLS"),details
   expect(page.locator("#session-status")).to_contain_text("NOT SIGNED IN")
   assert page.locator("#read-contract").is_disabled()
   assert page.locator("#sign-in button").is_enabled()
   # Real browser form navigation; no preseeded session/cookie/route.fulfill.
   page.locator("#sign-in button").click()
   expect(page.locator("h1")).to_contain_text("Identity verification complete")
   assert page.url.startswith(APP+"/api/auth/oidc/callback?"),page.url
   callback_url=page.url
   assert any(url.startswith(IDP+"/oauth2/authorize?") for _,url in outbound)
   assert any(method=="POST" and url==APP+"/api/auth/oidc/start"
    for method,url in outbound)
   assert any(status==303 and url.startswith(IDP+"/oauth2/authorize?")
    for status,url in sessions)
   # The page must not print the CSRF token or access token in HTML.
   html=page.content()
   assert "csrfToken" not in html
   assert "access_token" not in html
   assert "refresh_token" not in html
   cookies=ctx.cookies([APP])
   signed=[c for c in cookies if c["name"]=="__Host-proofline_session"]
   assert len(signed)==1 and signed[0]["secure"] and signed[0]["httpOnly"]
   assert signed[0]["sameSite"]=="Strict"
   assert not any(c["name"]=="__Host-proofline_oidc" and c["value"]
     for c in cookies)
   page.locator('a[href="/private/marketplace"]').click()
   expect(page.locator("#session-status")).to_contain_text("SIGNED IN")
   expect(page.locator("#role")).to_have_text("BUYER")
   assert page.locator("#submit").is_disabled()
   page.locator("#quote-id").fill("projectA")
   page.locator("#read-quote").click()
   expect(page.locator("#quote-output")).to_contain_text('"id": "projectA"')
   page.locator("#contract-id").fill("contractA")
   page.locator("#read-contract").click()
   expect(page.locator("#contract-output")).to_contain_text("NOT_CAPTURED")
   # One-shot PKCE callback cannot be repeated even though the session still
   # exists; consumption must not create another auth session.
   repeated=page.goto(callback_url,wait_until="load",timeout=15000)
   assert repeated.status in (400,401,403),repeated.status
   page.goto(APP+"/private/marketplace",wait_until="load",
    timeout=15000)
   expect(page.locator("#role")).to_have_text("BUYER")
   page.locator("#sign-out").click()
   expect(page.locator("#session-status")).to_contain_text("SIGNED OUT")
   page.reload()
   expect(page.locator("#session-status")).to_contain_text("NOT SIGNED IN")
   assert len(errors)==0,errors
   assert all(url.startswith(APP+"/") or url.startswith(IDP+"/")
    for _,url in outbound),outbound
   assert not any("/api/paypal/" in url or "/api/gemini/" in url
    for _,url in outbound)
   assert sum(method=="POST" and url==APP+"/api/auth/oidc/start"
    for method,url in outbound)==1
   assert sum(method=="POST" and url==APP+"/api/auth/oidc/logout"
    for method,url in outbound)==1
   print(json.dumps({
    "status":"REAL_CHROMIUM_FAKE_IDP_PKCE_LOGIN_PASS",
    "tlsProtocol":details["protocol"],
    "browserNavigationUsesRealHttps":True,
    "fakeIdentityProvider":"SYNTHETIC_LOOPBACK_ONLY",
    "realProviderCalls":0,"paypalCalls":0,
    "preseededBrowserSession":False,"authCodeReplayDenied":True,
    "loginVerified":True,"logoutVerified":True,
    "browserPageErrors":0,"paymentAuthorized":False
   }))
   ctx.close()
  finally: browser.close()
finally:
 if proc.poll() is None:
  proc.terminate()
  try: proc.wait(timeout=8)
  except subprocess.TimeoutExpired:
   proc.kill()
   proc.wait(timeout=4)
