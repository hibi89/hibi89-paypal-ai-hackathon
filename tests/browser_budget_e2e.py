"""Chromium UI: real local HTML → budget → negotiation → human approval → reserve.
All data synthetic, no PayPal/Gemini calls, no public deployment.
"""
import os,queue,re,shutil,subprocess,threading,time
from pathlib import Path
from playwright.sync_api import sync_playwright,expect

ROOT=Path(__file__).resolve().parents[1]
node=subprocess.Popen(["node","--experimental-sqlite","scripts/run_demo.mjs"],
 cwd=ROOT,stdout=subprocess.PIPE,stderr=subprocess.STDOUT,
 text=True,encoding="utf-8",errors="replace",bufsize=1)
lines=queue.Queue()
threading.Thread(target=lambda:[lines.put(x) for x in node.stdout],
 daemon=True).start()
try:
 deadline=time.monotonic()+20
 address=None
 while time.monotonic()<deadline and not address:
  try:line=lines.get(timeout=0.5)
  except queue.Empty:
   if node.poll() is not None:raise AssertionError("LOCAL_SERVER_EXITED")
   continue
  match=re.search(r"http://127\.0\.0\.1:\d+",line)
  if match:address=match.group(0)
 assert address,"LOCAL_SERVER_URL_MISSING"
 binary=(os.getenv("BROWSER_CHROME_PATH") or shutil.which("google-chrome")
  or shutil.which("google-chrome-stable") or shutil.which("chromium"))
 assert binary,"CHROMIUM_REQUIRED"
 with sync_playwright() as p:
  browser=p.chromium.launch(executable_path=binary,headless=True,
   args=["--no-sandbox","--disable-dev-shm-usage"])
  try:
   page=browser.new_page()
   requests=[]
   page.on("request",lambda r:requests.append((r.method,r.url)))
   page.goto(address)
   expect(page.locator("#message")).to_contain_text("Offline demo ready")
   assert not any(method=="POST" for method,_ in requests)
   # Confirm a real user budget action; no implicit reserve on form entry.
   page.locator('#agent-budget-form input[name="limit"]').fill("350.00")
   page.locator("#agent-budget-form button").click()
   expect(page.locator("#agent-budget-result")).to_contain_text("Offline budget configured")
   expect(page.locator("#agent-budget-result")).to_contain_text("Limit: $350.00")
   expect(page.locator("#agent-budget-result")).to_contain_text("Reserved: $0.00")
   page.locator("#draft-submit").click()
   expect(page.locator("#quote-view")).to_contain_text("Version 2")
   page.locator("#agent-negotiation-form button").click()
   expect(page.locator("#agent-negotiation-result")).to_contain_text("OFFLINE proposal:")
   proposal=page.locator("#agent-negotiation-result").inner_text()
   match=re.search(r"\$(\d+\.\d{2})",proposal)
   assert match,"PROPOSAL_USD_AMOUNT_MISSING"
   dollars=match.group(1)
   assert page.locator("#agent-budget-reserve").is_enabled()
   before_early=sum(method=="POST" and url.endswith("/api/demo/budget/reserve")
    for method,url in requests)
   page.locator("#agent-budget-reserve").click()
   expect(page.locator("#agent-budget-result")).to_contain_text("APPROVE_EXACT_PROPOSAL_FIRST")
   assert sum(method=="POST" and url.endswith("/api/demo/budget/reserve")
    for method,url in requests)==before_early
   page.locator("#dollars").fill(dollars)
   page.locator("#confirm").check()
   page.locator("#approve-submit").click()
   expect(page.locator("#quote-view")).to_contain_text("APPROVED")
   expect(page.locator("#quote-view")).to_contain_text("$"+dollars)
   page.locator("#agent-budget-reserve").click()
   expect(page.locator("#agent-budget-result")).to_contain_text("SQLite budget reserved.")
   expect(page.locator("#agent-budget-result")).to_contain_text("Reserved: $"+dollars)
   expect(page.locator("#agent-budget-history")).to_contain_text("sample-project · v2")
   assert sum(method=="POST" and url.endswith("/api/demo/budget/reserve")
    for method,url in requests)==1
   page.locator("#agent-budget-reserve").click()
   expect(page.locator("#agent-budget-result")).to_contain_text("SQLite budget reserved.")
   assert sum(method=="POST" and url.endswith("/api/demo/budget/reserve")
    for method,url in requests)==2
   total_posts=sum(method=="POST" for method,_ in requests)
   page.reload()
   expect(page.locator("#message")).to_contain_text("Offline demo ready")
   assert sum(method=="POST" for method,_ in requests)==total_posts
   page.locator("#agent-budget-history-refresh").click()
   expect(page.locator("#agent-budget-history")).to_contain_text(
    "sample-project · v2 · $"+dollars)
   assert sum(method=="POST" for method,_ in requests)==total_posts
   page.locator("#payment-status").click()
   expect(page.locator("#message")).to_contain_text("No payment action executed")
   assert sum(method=="POST" for method,_ in requests)==total_posts
   assert not any(method=="POST" and "/orders" in url for method,url in requests)
   assert not any("paypal.com" in url or "generativelanguage.googleapis.com" in url
    for _,url in requests)
   print("CHROMIUM_UNIFIED_BUDGET_E2E_PASS: configure→negotiate→human approval→reserve→replay→reload; no payment")
  finally:browser.close()
finally:
 node.terminate()
 try:node.wait(timeout=6)
 except subprocess.TimeoutExpired:node.kill()
