"""Fast real-browser test for premium in-product evidence typography, CSP, clipping.
No provider calls, payment writes, microphone, external network, or publication.
"""
import os
import queue
import re
import shutil
import subprocess
import sys
import threading
import time
from pathlib import Path
from urllib.parse import urlsplit
from playwright.sync_api import sync_playwright, expect

ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/"scripts"))
from video_owner_evidence import premium_storyboard_cards, sanitize_saved_receipt


def run():
    env={k:v for k,v in os.environ.items() if not re.search(
        r"SECRET|TOKEN|PASSWORD|CREDENTIAL|API_KEY|CLIENT_ID|MERCHANT_ID|GEMINI|PAYPAL|OPENAI|AUTHORIZATION|PRIVATE_KEY|NODE_OPTIONS",k,re.I)}
    proc=subprocess.Popen(["node","--experimental-sqlite","scripts/run_demo.mjs"],
        cwd=ROOT,env=env,stdout=subprocess.PIPE,stderr=subprocess.STDOUT,
        text=True,encoding="utf-8",errors="replace")
    messages=queue.Queue()
    threading.Thread(target=lambda:[messages.put(line) for line in proc.stdout],daemon=True).start()
    try:
        target=None
        deadline=time.monotonic()+20
        while time.monotonic()<deadline:
            try: line=messages.get(timeout=.4)
            except queue.Empty: continue
            m=re.search(r"http://127\.0\.0\.1:\d+",line)
            if m:target=m.group(0);break
        assert target,"LOCAL_SERVER_NOT_STARTED"
        browser_path=(os.getenv("BROWSER_CHROME_PATH") or shutil.which("google-chrome")
            or shutil.which("chromium") or shutil.which("chrome"))
        if not browser_path and os.name=="nt":
            for key in ("PROGRAMFILES","PROGRAMFILES(X86)","LOCALAPPDATA"):
                base=os.getenv(key)
                if base and (Path(base)/"Google"/"Chrome"/"Application"/"chrome.exe").is_file():
                    browser_path=str(Path(base)/"Google"/"Chrome"/"Application"/"chrome.exe");break
        assert browser_path,"CHROME_REQUIRED"
        with sync_playwright() as p:
            browser=p.chromium.launch(executable_path=browser_path,headless=True,
                args=["--no-sandbox","--disable-dev-shm-usage"])
            try:
                page=browser.new_page(viewport={"width":1280,"height":900})
                forbidden=[]
                def intercept(route):
                    u=urlsplit(route.request.url)
                    if u.scheme not in ("http","https") or u.netloc!=urlsplit(target).netloc:
                        forbidden.append("blocked")
                        route.abort()
                    else:
                        if route.request.method not in ("GET","HEAD"):
                            forbidden.append("unsafe method")
                            route.abort()
                        else:route.continue_()
                page.route("**/*",intercept)
                page.goto(target,wait_until="domcontentloaded")
                expect(page.locator("#message")).to_contain_text("Offline demo ready")
                # Uses trusted Playwright execution context, not an unsafe-inline HTML script.
                page.evaluate((ROOT/"scripts"/"premium_evidence_overlay.js").read_text(encoding="utf-8"))
                for card in premium_storyboard_cards(sanitize_saved_receipt(None)):
                    page.evaluate("(card)=>window.ProoflineFilmLens.show(card)",card)
                    expect(page.locator("#proofline-film-lens .lens-panel")).to_be_visible()
                    details=page.evaluate("""() => {
                      const p=document.querySelector('#proofline-film-lens .lens-panel');
                      const b=p.getBoundingClientRect();
                      const nodes=[...p.querySelectorAll('h2,.lens-sub,.lens-source,.lens-content,.lens-footer')];
                      const inside=nodes.every(n=>{
                        const r=n.getBoundingClientRect();
                        return r.top>=b.top-1&&r.bottom<=b.bottom+1&&r.left>=b.left-1&&r.right<=b.right+1;
                      });
                      const bg=getComputedStyle(p).backgroundColor;
                      const title=getComputedStyle(p.querySelector('h2')).fontSize;
                      return {inside,scroll:p.scrollHeight,client:p.clientHeight,
                        width:b.width,height:b.height,bg,title,
                        text:p.innerText};
                    }""")
                    assert details["inside"],"EVIDENCE_ELEMENT_CLIPPED"
                    assert details["scroll"]<=details["client"]+2,"EVIDENCE_PANEL_OVERFLOW"
                    assert details["width"]>=600 and details["height"]>=680,"EVIDENCE_PANEL_TOO_SMALL"
                    assert float(details["title"].rstrip("px"))>=40,"EVIDENCE_HEADLINE_TOO_SMALL"
                    assert "NO NEW PROVIDER REQUESTS" in details["text"]
                    assert "OWNER REPORT" in details["text"]
                assert not forbidden,"EXTERNAL_OR_UNEXPECTED_POST_BLOCKED"
                page.evaluate("()=>window.ProoflineFilmLens.hide()")
                assert page.locator("#proofline-film-lens").count()==0
                print("PREMIUM_EVIDENCE_REAL_CHROMIUM_CSP_LAYOUT_PASS")
            finally:browser.close()
    finally:
        if proc.poll() is None:
            proc.terminate()
            try:proc.wait(timeout=5)
            except subprocess.TimeoutExpired:proc.kill();proc.wait(timeout=5)

if __name__=="__main__":
    run()
