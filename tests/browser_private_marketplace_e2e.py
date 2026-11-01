"""Real Chromium clicks in the new private OIDC marketplace workspace.
All browser HTTPS origin requests are intercepted into an isolated loopback
HTTP carrier invoking the real signed synthetic OIDC/SQLite host. This proves
UI and backend integration, NOT actual TLS-browser transport/provider login.
Existing independent Node tests cover the genuine local TLS handshake.
"""
import json
import queue
import shutil
import subprocess
import threading
import time
from urllib.parse import urlsplit
from urllib.request import Request, urlopen
from urllib.error import HTTPError
from playwright.sync_api import sync_playwright,expect

ORIGIN="https://proofline.example.com"
URI=ORIGIN+"/private/marketplace"
process=subprocess.Popen(
 ["node","--experimental-sqlite","scripts/private_marketplace_chromium_fixture.mjs"],
 stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True,bufsize=1
)
items=queue.Queue()
threading.Thread(target=lambda:[items.put(x) for x in process.stdout],daemon=True).start()
def close():
 if process.poll() is None:
  process.terminate()
  try: process.wait(timeout=8)
  except subprocess.TimeoutExpired:
   process.kill()
   process.wait(timeout=3)
try:
 try: line=items.get(timeout=20)
 except queue.Empty: raise AssertionError("PRIVATE_BROWSER_TEST_FIXTURE_NOT_READY")
 fixture=json.loads(line)
 assert fixture["mode"]=="OFFLINE_SIGNED_OIDC_BROWSER_FIXTURE"
 assert fixture["providerCalls"]==0 and fixture["paypalCaptureEnabled"] is False
 assert fixture["origin"]==ORIGIN
 port=fixture["port"]
 assert 1024<=port<=65535
 exe=(shutil.which("google-chrome") or shutil.which("google-chrome-stable")
      or shutil.which("chromium"))
 assert exe, "CHROMIUM_BINARY_REQUIRED"
 def forward(route):
  request=route.request
  parsed=urlsplit(request.url)
  assert parsed.scheme=="https" and parsed.netloc=="proofline.example.com",request.url
  assert request.method in ("GET","POST")
  target=f"http://127.0.0.1:{port}{parsed.path}"
  if parsed.query: target+="?"+parsed.query
  incoming=request.all_headers()
  headers={key:value for key,value in incoming.items()
           if key.lower() in ("cookie","origin","accept","content-type","x-csrf-token")}
  raw=request.post_data_buffer if request.method=="POST" else None
  call=Request(target,data=raw,headers=headers,method=request.method)
  try:
   response=urlopen(call,timeout=8)
  except HTTPError as ex:
   response=ex
  with response:
   body=response.read()
   # Carrier strictly sends no Set-Cookie and no provider redirect; the
   # browser cookie jar is seeded from the signed *test-only* login flow.
   outgoing={key:value for key,value in response.headers.items()
             if key.lower() in ("content-type","cache-control",
                 "content-security-policy","x-content-type-options",
                 "x-frame-options","referrer-policy","vary")}
   route.fulfill(status=response.status,headers=outgoing,body=body)
 with sync_playwright() as p:
  browser=p.chromium.launch(executable_path=exe,headless=True,
     args=["--no-sandbox","--disable-dev-shm-usage"])
  try:
   scenarios=[]
   errors=[]
   post_urls=[]
   def new_actor(role=None):
    ctx=browser.new_context(ignore_https_errors=True)
    ctx.route(ORIGIN+"/**",forward)
    if role:
     ctx.add_cookies([{
      "name":"__Host-proofline_session","value":fixture["sessions"][role],
      "domain":"proofline.example.com","path":"/",
      "secure":True,"httpOnly":True,"sameSite":"Strict"
     }])
    page=ctx.new_page()
    page.on("pageerror",lambda exc:errors.append(str(exc)))
    page.on("request",lambda req:post_urls.append(req.url)
       if req.method=="POST" else None)
    page.goto(URI,wait_until="load",timeout=15000)
    return ctx,page
   ctx,page=new_actor()
   expect(page.locator("#session-status")).to_contain_text("NOT SIGNED IN")
   assert page.locator("#read-quote").is_disabled()
   assert page.locator("#submit").is_disabled()
   assert page.locator("#sign-in").is_visible()
   ctx.close()
   scenarios.append("anonymous-fail-closed")
   # UI navigation only: an explicit fake JSON response + fake IdP page. Backend
   # PKCE, signed cookie and strict Origin are separately tested by Node.
   # This scenario neither contacts nor attests any external identity provider.
   loginctx,loginpage=new_actor()
   start_url=("https://accounts.example.org/oauth2/authorize?"+
     "response_type=code&state="+("A"*43)+
     "&nonce="+("B"*43)+"&code_challenge="+("C"*43)+
     "&code_challenge_method=S256")
   loginctx.route(ORIGIN+"/api/auth/oidc/start-url",lambda route:route.fulfill(
    status=200,headers={"content-type":"application/json","cache-control":"no-store"},
    body=json.dumps({"authorizationUrl":start_url,"loginCompleted":False,
      "merchantOwnershipVerified":False,"paymentAuthorized":False})))
   loginctx.route("https://accounts.example.org/**",lambda route:route.fulfill(
    status=200,headers={"content-type":"text/html","cache-control":"no-store"},
    body="<html><body><h1>OFFLINE FAKE IDP - NO USER AUTHORIZED</h1></body></html>"))
   before_login=len(post_urls)
   loginpage.locator("#sign-in button").click()
   expect(loginpage.locator("h1")).to_contain_text("OFFLINE FAKE IDP")
   assert loginpage.url.startswith("https://accounts.example.org/oauth2/authorize?")
   assert post_urls[before_login:]==[ORIGIN+"/api/auth/oidc/start-url"]
   loginctx.close()
   scenarios.append("browser-json-login-start-to-fake-idp-page-only")
   ctx,buyer=new_actor("buyer")
   expect(buyer.locator("#role")).to_have_text("BUYER")
   assert buyer.locator("#submit").is_disabled()
   assert buyer.locator("#accept").is_disabled()
   assert buyer.locator("#read-quote").is_enabled()
   buyer.locator("#quote-id").fill("projectA")
   buyer.locator("#read-quote").click()
   expect(buyer.locator("#quote-output")).to_contain_text('"id": "projectA"')
   buyer.locator("#contract-id").fill("contractA")
   buyer.locator("#read-contract").click()
   expect(buyer.locator("#contract-output")).to_contain_text('"paymentState": "NOT_CAPTURED"')
   scenarios.append("buyer-real-signed-session-and-read")
   seller_context,seller=new_actor("seller")
   expect(seller.locator("#role")).to_have_text("SELLER")
   assert seller.locator("#submit").is_enabled()
   assert seller.locator("#accept").is_disabled()
   seller.locator("#quote-id").fill("projectA")
   seller.locator("#read-quote").click()
   expect(seller.locator("#quote-output")).to_contain_text("OPERATION FAILED")
   seller.locator("#contract-id").fill("contractA")
   seller.locator("#milestone-id").fill("stepA")
   seller.locator("#delivery-detail").fill("Verified seller delivery through Chromium")
   before=len(post_urls)
   seller.locator("#submit").click()
   expect(seller.locator("#action-status")).to_contain_text("Recorded SUBMITTED")
   expect(seller.locator("#action-output")).to_contain_text('"state": "SUBMITTED"')
   sent=post_urls[before:]
   assert len(sent)==2, sent
   assert sent[0].endswith("/api/auth/oidc/csrf")
   assert sent[1].endswith("/milestones/stepA/submit")
   scenarios.append("seller-submit-only-once-with-fresh-csrf")
   reviewer_context,reviewer=new_actor("reviewer")
   expect(reviewer.locator("#role")).to_have_text("REVIEWER")
   assert reviewer.locator("#submit").is_disabled()
   assert reviewer.locator("#accept").is_enabled()
   reviewer.locator("#contract-id").fill("contractA")
   reviewer.locator("#milestone-id").fill("stepA")
   reviewer.locator("#expected-version").fill("2")
   before=len(post_urls)
   reviewer.locator("#accept").click()
   expect(reviewer.locator("#action-status")).to_contain_text("Recorded ACCEPTED")
   assert len(post_urls)-before==2
   scenarios.append("reviewer-independent-accept")
   buyer.locator("#read-contract").click()
   expect(buyer.locator("#contract-output")).to_contain_text('"state": "ACCEPTED"')
   expect(buyer.locator("#contract-output")).to_contain_text('"paymentState": "NOT_CAPTURED"')
   scenarios.append("buyer-observes-accepted-without-payment")
   before=len(post_urls)
   buyer.locator("#sign-out").click()
   expect(buyer.locator("#session-status")).to_contain_text("SIGNED OUT")
   assert len(post_urls)-before==2
   assert buyer.locator("#read-quote").is_disabled()
   buyer.reload()
   expect(buyer.locator("#session-status")).to_contain_text("NOT SIGNED IN")
   scenarios.append("signed-session-logout-revokes-cookie")
   assert errors==[],errors
   assert not any("/api/paypal/" in url or "/capture" in url
                  for url in post_urls)
   assert not any("accounts.example.org" in url for url in post_urls)
   assert len(scenarios)==7
   reviewer_context.close()
   seller_context.close()
   ctx.close()
   browser.close()
   print(json.dumps({
    "status":"PRIVATE_VERIFIED_MARKETPLACE_CHROMIUM_E2E_PASS",
    "scenarios":scenarios,"browser":"REAL_CHROMIUM_WITH_INTERCEPTED_HTTPS_ORIGIN",
    "realBrowserTLSHandshakeVerifiedHere":False,
    "syntheticSignedOidcSessions":3,
    "externalIdpCalls":0,"paypalCalls":0,"paymentAuthorized":False,
    "browserPageErrors":len(errors)
   }))
  finally:
   if browser.is_connected(): browser.close()
finally:
 close()
