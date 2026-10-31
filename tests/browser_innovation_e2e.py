"""Real Chromium E2E of Part 2, no real AI or payment providers."""
import queue,re,shutil,subprocess,threading,time
from pathlib import Path
from playwright.sync_api import sync_playwright,expect
root=Path(__file__).resolve().parents[1]
process=subprocess.Popen(["node","--experimental-sqlite","scripts/run_demo.mjs"],cwd=root,
 stdout=subprocess.PIPE,stderr=subprocess.STDOUT,encoding="utf-8",text=True,bufsize=1)
lines=queue.Queue()
threading.Thread(target=lambda:[lines.put(v) for v in process.stdout],daemon=True).start()
try:
 address=None
 deadline=time.monotonic()+20
 while time.monotonic()<deadline and not address:
  try:line=lines.get(timeout=0.5)
  except queue.Empty:
   if process.poll() is not None:raise AssertionError("SERVER_EXITED")
   continue
  match=re.search(r"http://127\.0\.0\.1:\d+",line)
  if match:address=match.group(0)
 assert address,"SERVER_NOT_READY"
 binary=shutil.which("google-chrome") or shutil.which("google-chrome-stable") or shutil.which("chromium")
 assert binary,"CHROMIUM_REQUIRED"
 with sync_playwright() as p:
  browser=p.chromium.launch(executable_path=binary,headless=True,args=["--no-sandbox","--disable-dev-shm-usage"])
  try:
   page=browser.new_page()
   requests=[]
   errors=[]
   page.on("request",lambda r:requests.append((r.method,r.url)))
   page.on("pageerror",lambda e:errors.append(str(e)))
   page.goto(address+"/demo/innovation")
   expect(page.locator("h1")).to_contain_text("Five agentic commerce skills")
   expect(page.locator("#activity")).to_contain_text("NOT_PAID")
   assert not any(method=="POST" for method,_ in requests)
   page.locator("#delegate").click()
   expect(page.locator("#delegation-status")).to_contain_text("SYNTHETIC_CONSENT_CREATED")
   page.locator("#a2a").click()
   expect(page.locator("#a2a-output")).to_contain_text("SYNTHETIC_AGREEMENT")
   expect(page.locator("#a2a-output")).to_contain_text("NOT_PAID")
   page.locator("#a2a").click()
   expect(page.locator("#message")).to_contain_text("DELEGATION_ALREADY_SPENT")
   page.locator("#category").select_option("gifts")
   page.locator("#limit").fill("39")
   page.locator("#delegate").click()
   expect(page.locator("#delegation-status")).to_contain_text("SYNTHETIC_CONSENT_CREATED")
   page.locator("#gift").click()
   expect(page.locator("#gift-output")).to_contain_text("desk-light-b")
   expect(page.locator("#gift-output")).to_contain_text("DISABLED")
   page.locator("#churn").click()
   expect(page.locator("#churn-output")).to_contain_text('"paypalPlanChanged": false')
   page.locator("#invoice").click()
   expect(page.locator("#invoice-output")).to_contain_text('"paypalInvoiceCreated": false')
   expect(page.locator("#activity")).to_contain_text("invoice")
   posts=sum(method=="POST" for method,_ in requests)
   page.reload()
   expect(page.locator("#activity")).to_contain_text("invoice")
   assert sum(method=="POST" for method,_ in requests)==posts
   page.locator("#refresh").click()
   expect(page.locator("#message")).to_contain_text("Read-only audit completed locally")
   assert sum(method=="POST" for method,_ in requests)==posts
   page.locator('nav a[href="/demo"]').click()
   expect(page.locator("#marketplace-panel")).to_be_visible()
   assert not errors,errors
   assert not any("paypal.com" in url or "generativelanguage.googleapis.com" in url for _,url in requests)
   print("CHROMIUM_INNOVATION_PART2_E2E_PASS: five skills, buyer consent and GET/no provider")
  finally:browser.close()
finally:
 process.terminate()
 try:process.wait(timeout=6)
 except subprocess.TimeoutExpired:process.kill();process.wait(timeout=5)
