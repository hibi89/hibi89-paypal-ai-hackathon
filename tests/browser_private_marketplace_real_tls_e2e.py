"""Genuine Chromium TLS socket against optional 127.0.0.1 HTTPS marketplace.
A strict test-only CONNECT proxy maps one hostname to a local ephemeral TLS
server. An ephemeral self-signed cert is accepted in this isolated browser
context only; this does NOT validate a public trusted certificate or IdP.
"""
import json,queue,shutil,subprocess,threading
from playwright.sync_api import sync_playwright,expect

ORIGIN="https://proofline.example.com"
process=subprocess.Popen(
 ["node","--experimental-sqlite","scripts/private_marketplace_chromium_fixture.mjs",
  "--real-tls-proxy"],stdout=subprocess.PIPE,stderr=subprocess.PIPE,
 text=True,bufsize=1
)
lines=queue.Queue()
threading.Thread(target=lambda:[lines.put(x) for x in process.stdout],
 daemon=True).start()
try:
 try: fixture=json.loads(lines.get(timeout=25))
 except queue.Empty: raise AssertionError("TLS_LOCAL_FIXTURE_NOT_READY")
 assert fixture["mode"]=="OFFLINE_CHROMIUM_REAL_TLS_TUNNEL"
 assert fixture["providerCalls"]==0 and fixture["paypalCaptureEnabled"] is False
 assert fixture["origin"]==ORIGIN
 port=fixture["proxyPort"]
 assert isinstance(port,int) and 1024<=port<=65535
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
    page=ctx.new_page()
    page.on("pageerror",lambda e:errors.append(str(e)))
    page.on("request",lambda request:requests.append((request.method,request.url)))
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
    "scenarios":["anonymous","buyer","seller","reviewer","accepted-no-payment"],
    "browserPageErrors":len(errors),"realIdpCalls":0,"paypalCalls":0,
    "paymentAuthorized":False
   }))
  finally: browser.close()
finally:
 if process.poll() is None:
  process.terminate()
  try: process.wait(timeout=8)
  except subprocess.TimeoutExpired:
   process.kill()
   process.wait(timeout=4)
