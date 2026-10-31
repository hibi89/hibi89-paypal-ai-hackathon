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
   expect(page.locator("#a2a-transcript li")).to_have_count(4)
   expect(page.locator("#a2a-progress")).to_contain_text("paymentState NOT_PAID")
   expect(page.locator("#a2a-progress")).to_contain_text("hash ")
   expect(page.locator("#a2a-output")).to_contain_text("NOT_PAID")
   # Real user-facing feature: browse recorded A2A evidence from SQLite,
   # with no fresh negotiation POST or PayPal provider request.
   expect(page.locator("#a2a-history option")).to_have_count(1)
   assert page.locator("#show-a2a-history").is_enabled()
   count_before_history=sum(method=="POST" for method,_ in requests)
   page.locator("#show-a2a-history").click()
   expect(page.locator("#a2a-history-status")).to_contain_text("No network POST was sent")
   expect(page.locator("#a2a-progress")).to_contain_text("SAVED SQLITE HISTORY / READ ONLY")
   expect(page.locator("#a2a-transcript li")).to_have_count(4)
   assert sum(method=="POST" for method,_ in requests)==count_before_history
   page.locator("#a2a").click()
   expect(page.locator("#message")).to_contain_text("DELEGATION_ALREADY_SPENT")
   page.locator("#category").select_option("gifts")
   page.locator("#limit").fill("39")
   page.locator("#delegate").click()
   expect(page.locator("#delegation-status")).to_contain_text("SYNTHETIC_CONSENT_CREATED")
   page.locator("#gift").click()
   expect(page.locator("#gift-output")).to_contain_text("desk-light-b")
   expect(page.locator("#gift-output")).to_contain_text('"catalogSource": "STATIC_FICTIONAL_ITEMS_NO_LIVE_INVENTORY"')
   expect(page.locator("#gift-output")).to_contain_text("DISABLED")
   # A fresh mandate can prefer a higher-priced PREMIUM fictional light.
   page.locator("#limit").fill("50")
   page.locator("#delegate").click()
   expect(page.locator("#delegation-status")).to_contain_text("SYNTHETIC_CONSENT_CREATED")
   page.locator("#gift-style").select_option("PREMIUM")
   page.locator("#gift-priority").select_option("MATCH_STYLE")
   page.locator("#gift-max-price").fill("50.00")
   page.locator("#gift").click()
   expect(page.locator("#gift-output")).to_contain_text('"id": "desk-light-a"')
   expect(page.locator("#gift-output")).to_contain_text('"reservedMinor": 4300')
   expect(page.locator("#gift-output")).to_contain_text('"paymentAuthorized": false')
   # A max-price below the cheapest fictional mug yields no selection.
   page.locator("#limit").fill("15")
   page.locator("#delegate").click()
   page.locator("#gift-category").select_option("mug")
   page.locator("#gift-max-price").fill("15.00")
   page.locator("#gift").click()
   expect(page.locator("#gift-output")).to_contain_text("NO_ELIGIBLE_GIFT")
   expect(page.locator("#gift-output")).to_contain_text('"reservedMinor": 0')
   # A fresh, still-unused service mandate is revocable from the actual browser.
   page.locator("#category").select_option("services")
   page.locator("#limit").fill("300")
   page.locator("#delegate").click()
   expect(page.locator("#delegation-status")).to_contain_text("SYNTHETIC_CONSENT_CREATED")
   expect(page.locator("#mandate-state")).to_contain_text("ACTIVE / UNUSED")
   assert page.locator("#revoke-mandate").is_enabled()
   with page.expect_response(lambda r:r.url.endswith("/api/demo/innovation/revoke") and r.request.method=="POST") as revoked:
    page.locator("#revoke-mandate").click()
   assert revoked.value.status==200
   expect(page.locator("#mandate-state")).to_contain_text("REVOKED")
   expect(page.locator("#activity")).to_contain_text("DELEGATION_REVOKED")
   assert page.locator("#revoke-mandate").is_disabled()
   a2a_before=sum(method=="POST" and url.endswith("/api/demo/innovation/a2a") for method,url in requests)
   page.locator("#a2a").click()
   expect(page.locator("#message")).to_contain_text("CONFIGURE_SERVICES_MANDATE_FIRST")
   assert sum(method=="POST" and url.endswith("/api/demo/innovation/a2a") for method,url in requests)==a2a_before
   expect(page.locator("#pending-status")).to_contain_text("No pending A2A attempts")
   # Input-driven price policy: exact cents, capped retention, no PayPal update.
   page.locator("#churn-reference").fill("demo-sub-maintenance-101")
   page.locator("#churn-monthly").fill("25.00")
   page.locator("#churn-months").fill("6")
   page.locator("#churn-risk").select_option("HIGH")
   page.locator("#churn-cap").select_option("2000")
   page.locator("#churn").click()
   expect(page.locator("#churn-output")).to_contain_text('"decisionStatus": "DISCOUNT_PROPOSAL"')
   expect(page.locator("#churn-output")).to_contain_text('"monthlyDiscountMinor": 500')
   expect(page.locator("#churn-output")).to_contain_text('"proposedMinor": 2000')
   expect(page.locator("#churn-output")).to_contain_text('"termSavingsMinor": 3000')
   expect(page.locator("#churn-output")).to_contain_text('"paypalPlanChanged": false')
   page.locator("#churn-cap").select_option("0")
   page.locator("#churn").click()
   expect(page.locator("#churn-output")).to_contain_text('"decisionStatus": "PAUSE_REVIEW"')
   expect(page.locator("#churn-output")).to_contain_text('"termSavingsMinor": 0')
   page.locator("#churn-risk").select_option("LOW")
   page.locator("#churn").click()
   expect(page.locator("#churn-output")).to_contain_text('"decisionStatus": "NO_DISCOUNT_RECOMMENDED"')
   expect(page.locator("#activity")).to_contain_text("churn")
   # An input-driven fictional invoice, not a fixed unverified amount.
   page.locator("#invoice-contract").fill("demo-contract-009")
   page.locator("#invoice-amount").fill("293.75")
   page.locator("#invoice-issue").select_option("QUALITY")
   page.locator("#invoice-delivery").select_option("REVIEWED")
   page.locator("#invoice").click()
   expect(page.locator("#invoice-output")).to_contain_text('"reviewState": "MISSING_EVIDENCE"')
   expect(page.locator("#invoice-output")).to_contain_text('"totalMinor": 29375')
   for evidence in ["contract","delivery","review"]:
    page.locator("#invoice-evidence-"+evidence).check()
   page.locator("#invoice").click()
   expect(page.locator("#invoice-output")).to_contain_text('"reviewState": "READY_FOR_HUMAN_REVIEW"')
   expect(page.locator("#invoice-output")).to_contain_text('"paypalInvoiceCreated": false')
   page.locator("#invoice-issue").select_option("NON_DELIVERY")
   page.locator("#invoice").click()
   expect(page.locator("#invoice-output")).to_contain_text('"reviewState": "CONFLICT_REQUIRES_HUMAN_REVIEW"')
   expect(page.locator("#activity")).to_contain_text("invoice")
   posts=sum(method=="POST" for method,_ in requests)
   page.reload()
   expect(page.locator("#activity")).to_contain_text("invoice")
   # After a full browser reload, stored A2A transcripts still reopen via GET.
   expect(page.locator("#a2a-history option")).to_have_count(1)
   page.locator("#show-a2a-history").click()
   expect(page.locator("#a2a-transcript li")).to_have_count(4)
   expect(page.locator("#a2a-output")).to_contain_text("SYNTHETIC_AGREEMENT")
   expect(page.locator("#a2a-history-status")).to_contain_text("No network POST was sent")
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
