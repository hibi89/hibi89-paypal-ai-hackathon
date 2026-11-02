"""Genuine Chromium TLS socket against optional 127.0.0.1 HTTPS marketplace.
A strict test-only CONNECT proxy maps one hostname to a local ephemeral TLS
server. An ephemeral self-signed cert is accepted in this isolated browser
context only; this does NOT validate a public trusted certificate or IdP.
"""
import json,queue,shutil,subprocess,threading,collections,re
from playwright.sync_api import sync_playwright,expect,Error as PlaywrightError
from local_loopback_connect_proxy import LocalLoopbackConnectProxy

ORIGIN="https://proofline.example.com"
proxy=None
process=subprocess.Popen(
 ["node","--experimental-sqlite","scripts/private_marketplace_chromium_fixture.mjs",
  "--tls-only"],stdout=subprocess.PIPE,stderr=subprocess.PIPE,
 text=True,bufsize=1
)
lines=queue.Queue()
# Drain BOTH subprocess pipes. An unread stderr pipe can block a child process
# and, more importantly, previous failures discarded its fatal error code.
# Only emit fixed error-code summaries, never untrusted raw logs/cookies.
runtime_codes=collections.deque(maxlen=12)
def collect_stdout():
 for line in process.stdout: lines.put(line)
def collect_stderr():
 for line in process.stderr:
  match=re.search(r"FIXTURE_(?:FAILED|FATAL|PROXY)_[A-Z0-9_]+",line)
  if match: runtime_codes.append(match.group(0))
  elif "Error [" in line:
   match=re.search(r"Error \[([A-Z0-9_]+)\]",line)
   runtime_codes.append("NODE_ERROR_"+(match.group(1) if match else "UNKNOWN"))
threading.Thread(target=collect_stdout,daemon=True).start()
threading.Thread(target=collect_stderr,daemon=True).start()
def fixture_state():
 return "exit="+str(process.poll())+" codes="+(",".join(runtime_codes) or "NO_FATAL_CODE")
try:
 try: fixture=json.loads(lines.get(timeout=25))
 except queue.Empty: raise AssertionError("TLS_LOCAL_FIXTURE_NOT_READY "+fixture_state())
 assert fixture["mode"]=="OFFLINE_CHROMIUM_REAL_TLS_TUNNEL"
 assert fixture["providerCalls"]==0 and fixture["paypalCaptureEnabled"] is False
 assert fixture["origin"]==ORIGIN
 tls_port=fixture["tlsPort"]
 assert isinstance(tls_port,int) and 1024<=tls_port<=65535
 assert fixture["proxyPort"] is None,"NODE_CONNECT_PROXY_MUST_BE_DISABLED"
 assert process.poll() is None,"TLS_FIXTURE_EXITED_AFTER_READY "+fixture_state()
 # Independent local test-only proxy forwards encrypted TCP bytes unchanged
 # to the Node HTTPS listener. Invalid hosts and early browser close are
 # isolated per Python thread instead of terminating the Node TLS process.
 proxy=LocalLoopbackConnectProxy(tls_port).start()
 port=proxy.port
 browser_binary=(shutil.which("google-chrome") or
    shutil.which("google-chrome-stable") or shutil.which("chromium"))
 assert browser_binary,"CHROMIUM_NOT_INSTALLED"
 with sync_playwright() as playwright:
  browser=playwright.chromium.launch(
   executable_path=browser_binary,headless=True,
   args=["--no-sandbox","--disable-dev-shm-usage"])
  try:
   errors=[]
   requests=[]
   def new_page(role):
    ctx=browser.new_context(
     proxy={"server":f"http://127.0.0.1:{port}"},
     ignore_https_errors=True, # ONLY ephemeral self-signed test certificate
     service_workers="block")
    if role:
     ctx.add_cookies([{
      "name":"__Host-proofline_session","value":fixture["sessions"][role],
      "domain":"proofline.example.com","path":"/","secure":True,
      "httpOnly":True,"sameSite":"Strict"
     }])
    def instrument_page():
     candidate=ctx.new_page()
     candidate.on("pageerror",lambda e:errors.append(str(e)))
     candidate.on("request",lambda request:requests.append((request.method,request.url)))
     return candidate
    page=instrument_page()
    try:
     response=page.goto(ORIGIN+"/private/marketplace",
       wait_until="load",timeout=15000)
    except PlaywrightError as exc:
     # The *first* browser operation is an idempotent GET with no credentials
     # or server mutation. Retry only one transient local CONNECT failure;
     # never retry callback, logout, quote, provider or payment POST.
     if "net::ERR_PROXY_CONNECTION_FAILED" not in str(exc): raise
     # Do not send a separate probe CONNECT that starts and abruptly
     # abandons a TLS tunnel; Chromium itself is the network assertion.
     if process.poll() is not None:
      raise AssertionError("TLS_LOCAL_FIXTURE_STOPPED_BEFORE_FIRST_GET "+
       fixture_state()) from exc
     page.close()
     page=instrument_page()
     response=page.goto(ORIGIN+"/private/marketplace",
       wait_until="load",timeout=15000)
    assert response and response.status==200
    # This comes from Chromium's actual network stack; no fulfill/route.
    tls=response.security_details()
    assert isinstance(tls,dict) and str(tls.get("protocol","")).startswith("TLS"),tls
    assert tls.get("subjectName")=="proofline.example.com",tls
    addr=response.server_addr()
    assert isinstance(addr,dict) and addr.get("ipAddress")=="127.0.0.1",addr
    assert isinstance(addr.get("port"),int),addr
    assert response.header_value("content-security-policy").find("script-src 'self'")>=0
    return ctx,page,tls
   anonctx,anonymous,_=new_page(None)
   expect(anonymous.locator("#session-status")).to_contain_text("NOT SIGNED IN")
   assert anonymous.locator("#submit").is_disabled()
   anonctx.close()
   # Real Chromium sign-in click -> actual loopback TLS JSON PKCE start ->
   # locally intercepted fictional IdP -> top-level callback -> HttpOnly session.
   # Never contact a real IdP or infer merchant/payment authority.
   authctx,authpage,_=new_page(None)
   fake_idp_visits=[]
   def local_fake_idp(route):
    from urllib.parse import urlsplit,parse_qs,quote
    from html import escape
    url=urlsplit(route.request.url)
    args=parse_qs(url.query)
    assert url.scheme=="https" and url.netloc=="accounts.example.org"
    assert url.path=="/oauth2/authorize"
    for name in ("state","nonce","code_challenge"):
     assert len(args.get(name,[]))==1 and len(args[name][0])==43
    assert args.get("response_type")==["code"]
    assert args.get("code_challenge_method")==["S256"]
    callback=(ORIGIN+"/api/auth/oidc/callback?state="+
      quote(args["state"][0],safe="")+
      "&code=CHROMIUM_VISIBLE_FAKE_BUYER_CODE_2026")
    fake_idp_visits.append(route.request.url)
    route.fulfill(status=200,headers={"content-type":"text/html; charset=utf-8",
       "cache-control":"no-store"},
      body="<html><body><a id='fictional-complete' href='"+
       escape(callback,quote=True)+"'>Finish fictional OIDC sign-in</a></body></html>")
   authctx.route("https://accounts.example.org/**",local_fake_idp)
   before_auth=len(requests)
   authpage.locator("#sign-in button").click()
   expect(authpage.locator("#fictional-complete")).to_be_visible()
   assert len(fake_idp_visits)==1
   # Preserve the one-time browser-bound cookie for an explicit replay probe.
   # Reinstating this *already-spent* cookie must never redeem a callback twice.
   challenge_cookies=[cookie for cookie in authctx.cookies([ORIGIN])
       if cookie["name"]=="__Host-proofline_oidc"]
   assert len(challenge_cookies)==1
   assert challenge_cookies[0]["secure"] and challenge_cookies[0]["httpOnly"]
   assert challenge_cookies[0]["sameSite"]=="Lax"
   spent_challenge_cookie=challenge_cookies[0].copy()
   authpage.locator("#fictional-complete").click()
   expect(authpage.locator("h1")).to_have_text("Identity verification complete.")
   assert "/api/auth/oidc/callback?" in authpage.url
   completed_callback_url=authpage.url
   auth_cookies=authctx.cookies([ORIGIN])
   sessions=[cookie for cookie in auth_cookies
       if cookie["name"]=="__Host-proofline_session"]
   assert len(sessions)==1 and sessions[0]["secure"] is True
   assert sessions[0]["httpOnly"] is True
   assert "proofline_session" not in authpage.evaluate("document.cookie")
   authpage.locator("a[href='/private/marketplace']").click()
   expect(authpage.locator("#role")).to_have_text("BUYER")
   expect(authpage.locator("#session-status")).to_contain_text("MERCHANT ENTITLEMENT NOT VERIFIED")
   assert authpage.locator("#submit").is_disabled()
   assert authpage.locator("#accept").is_disabled()
   auth_requests=requests[before_auth:]
   assert sum(method=="POST" and url==ORIGIN+"/api/auth/oidc/start-url"
       for method,url in auth_requests)==1,auth_requests
   assert sum(url.startswith("https://accounts.example.org/")
       for method,url in auth_requests)==1,auth_requests
   assert not any("/api/paypal/" in url or "/milestones/" in url
       for method,url in auth_requests),auth_requests
   # Logout is a real browser POST under TLS, and must revoke the server
   # session as well as clear the browser cookie. Back/reload cannot restore it.
   previously_signed_session=sessions[0].copy()
   authpage.locator("#sign-out").click()
   expect(authpage.locator("#session-status")).to_contain_text("SIGNED OUT")
   authpage.reload(wait_until="load")
   expect(authpage.locator("#session-status")).to_contain_text("NOT SIGNED IN")
   assert authpage.locator("#read-contract").is_disabled()
   assert authpage.locator("#submit").is_disabled()
   # A captured old cookie must remain invalid even if put back into the jar.
   authctx.add_cookies([previously_signed_session])
   authpage.reload(wait_until="load")
   expect(authpage.locator("#session-status")).to_contain_text("NOT SIGNED IN")
   assert authpage.locator("#read-contract").is_disabled()
   # Replay original callback with the valid but spent PKCE browser cookie.
   authctx.add_cookies([spent_challenge_cookie])
   replay=authctx.new_page()
   repeated=replay.goto(completed_callback_url,wait_until="load",timeout=15000)
   assert repeated and repeated.status==401,repeated.status if repeated else None
   assert "Identity verification complete." not in replay.content()
   assert not any(cookie["name"]=="__Host-proofline_session"
       and cookie["value"]!=previously_signed_session["value"]
       for cookie in authctx.cookies([ORIGIN]))
   replay.close()
   assert not any("/api/paypal/" in url or "/milestones/" in url
       for method,url in requests[before_auth:]),requests[before_auth:]
   del requests[before_auth:]
   authctx.close()
   buyerctx,buyer,tls=new_page("buyer")
   expect(buyer.locator("#role")).to_have_text("BUYER")
   assert buyer.locator("#submit").is_disabled()
   buyer.locator("#contract-id").fill("contractA")
   buyer.locator("#read-contract").click()
   expect(buyer.locator("#contract-output")).to_contain_text("NOT_CAPTURED")
   sellerctx,seller,_=new_page("seller")
   expect(seller.locator("#role")).to_have_text("SELLER")
   seller.locator("#contract-id").fill("contractA")
   seller.locator("#milestone-id").fill("stepA")
   seller.locator("#delivery-detail").fill("Chromium genuine TLS seller delivery")
   seller.locator("#submit").click()
   expect(seller.locator("#action-status")).to_contain_text("Recorded SUBMITTED")
   assert seller.locator("#accept").is_disabled()
   reviewerctx,reviewer,_=new_page("reviewer")
   expect(reviewer.locator("#role")).to_have_text("REVIEWER")
   reviewer.locator("#contract-id").fill("contractA")
   reviewer.locator("#milestone-id").fill("stepA")
   reviewer.locator("#expected-version").fill("2")
   reviewer.locator("#accept").click()
   expect(reviewer.locator("#action-status")).to_contain_text("Recorded ACCEPTED")
   buyer.locator("#read-contract").click()
   expect(buyer.locator("#contract-output")).to_contain_text('"state": "ACCEPTED"')
   expect(buyer.locator("#contract-output")).to_contain_text("NOT_CAPTURED")
   assert not errors,errors
   assert all(url.startswith(ORIGIN+"/") for _,url in requests),requests
   assert not any("/api/paypal/" in url for _,url in requests)
   assert sum(method=="POST" and "/milestones/" in url
      for method,url in requests)==2
   assert sum(method=="POST" and url.endswith("/api/auth/oidc/csrf")
      for method,url in requests)==2
   for context in (reviewerctx,sellerctx,buyerctx): context.close()
   print(json.dumps({
    "status":"PRIVATE_MARKETPLACE_REAL_CHROMIUM_TLS_PASS",
    "tlsProtocol":tls["protocol"],"certificateSubject":tls["subjectName"],
    "socketEncrypted":True,"certificateSelfSignedTrustException":True,
    "browserOriginIntercepted":False,"proxyTarget":"LOOPBACK_ONLY",
    "scenarios":["anonymous","real-browser-json-pkce-fake-idp-callback","real-tls-logout-revocation","spent-pkce-callback-replay-denied","buyer","seller","reviewer","accepted-no-payment"],
    "browserPageErrors":len(errors),"realIdpCalls":0,"paypalCalls":0,
    "paymentAuthorized":False
   }))
  finally: browser.close()
finally:
 if proxy is not None:proxy.close()
 if process.poll() is None:
  process.terminate()
  try: process.wait(timeout=8)
  except subprocess.TimeoutExpired:
   process.kill()
   process.wait(timeout=4)
