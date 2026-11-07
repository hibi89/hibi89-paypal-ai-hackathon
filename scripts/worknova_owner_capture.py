#!/usr/bin/env python3
"""WORKNOVA owner-operated private capture of the actual localhost demo.

The human operator moves and clicks the mouse. Playwright only launches an
isolated visible Chromium browser, blocks requests beyond localhost, records
rendered frames, and counts DOM pointerdown events. Never publishes or pays.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import subprocess
import sys
import threading
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urlsplit

ROOT = Path(__file__).resolve().parents[1]
CURSOR_JS = r"""(() => {
  function install() {
    if (document.getElementById('worknova-owner-cursor')) return;
    const style=document.createElement('style');
    style.textContent=`#worknova-owner-cursor{position:fixed;left:0;top:0;width:20px;height:20px;
      z-index:2147483647;pointer-events:none;opacity:0;border:2px solid #fff;
      border-radius:50%;background:#12a7ddb0;box-shadow:0 0 0 3px #0b355aa0,0 0 13px #38bdf8;
      transform:translate(-50%,-50%)}
      .worknova-owner-ripple{position:fixed;left:0;top:0;width:16px;height:16px;
      pointer-events:none;z-index:2147483646;border:2px solid #a5f3fc;border-radius:50%;
      animation:worknova-ripple .48s ease-out forwards}
      @keyframes worknova-ripple{to{transform:translate(-50%,-50%) scale(3.5);opacity:0}}`;
    document.head.append(style);
    const cursor=document.createElement('div');cursor.id='worknova-owner-cursor';document.body.append(cursor);
    document.addEventListener('pointermove',e=>{
      cursor.style.left=e.clientX+'px';cursor.style.top=e.clientY+'px';cursor.style.opacity='1';
    },{passive:true});
    document.addEventListener('pointerdown',e=>{
      const ring=document.createElement('div');ring.className='worknova-owner-ripple';
      ring.style.left=e.clientX+'px';ring.style.top=e.clientY+'px';document.body.append(ring);
      setTimeout(()=>ring.remove(),520);
      window.worknovaRecordedPointerDown?.();
    },{passive:true});
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});
  else install();
})();"""


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open('rb') as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b''):
            digest.update(chunk)
    return digest.hexdigest()


def verify_source() -> str:
    for name in ('offline_demo.html', 'innovation_dashboard.html'):
        source = (ROOT / 'web' / name).read_text(encoding='utf-8')
        if '<title>WORKNOVA' not in source or 'Proofline' in source or 'proofline</' in source:
            raise ValueError('WORKNOVA_SOURCE_NOT_BRANDED__UPDATE_REPO_FIRST')
    head = subprocess.check_output(['git','rev-parse','HEAD'],cwd=ROOT,
                                   stderr=subprocess.DEVNULL,text=True,timeout=8).strip()
    if len(head)!=40:
        raise ValueError('SOURCE_SHA_NOT_VERIFIED')
    dirty = subprocess.check_output(['git','status','--porcelain'],cwd=ROOT,
                                    stderr=subprocess.DEVNULL,text=True,timeout=8)
    if dirty.strip():
        raise ValueError('CLEAN_GIT_SOURCE_REQUIRED__DO_NOT_RECORD_UNCOMMITTED_FILES')
    return head


def preflight() -> None:
    head = verify_source()
    # No browser launches, provider calls or file writes during preflight.
    from record_judge_demo import chrome_binary
    from playwright.sync_api import sync_playwright  # noqa: F401
    chrome = Path(chrome_binary())
    if not chrome.is_file():
        raise ValueError('LOCAL_CHROMIUM_NOT_FOUND')
    print(json.dumps({'status':'WORKNOVA_MANUAL_CAPTURE_PREFLIGHT_PASS',
        'sourceSHA':head,'browserPresent':True,'mode':'OWNER_MANUAL_ONLY',
        'newPayments':0,'providerCalls':0,'upload':False}),flush=True)


def record(part: int, output_dir: Path) -> Path:
    if not sys.stdin.isatty():
        raise ValueError('OWNER_INTERACTIVE_TERMINAL_REQUIRED')
    head = verify_source()
    from record_judge_demo import start_demo, chrome_binary
    from playwright.sync_api import sync_playwright
    browser_bin = chrome_binary()
    output_dir.mkdir(parents=True,exist_ok=True)
    from uuid import uuid4
    stamp=datetime.now().strftime('%Y%m%d-%H%M%S')+'-'+uuid4().hex[:6]
    dest=output_dir / f'worknova-owner-clicks-part{part}-{stamp}.webm'
    sidecar=dest.with_suffix('.manifest.json')
    if dest.exists() or sidecar.exists():
        raise FileExistsError('OWNER_CAPTURE_WOULD_OVERWRITE')
    server,local_origin=start_demo()
    origin=urlsplit(local_origin)
    clicks=[0]
    blocked=[0]
    video_path=None
    try:
        if origin.scheme!='http' or origin.hostname!='127.0.0.1' or not origin.port:
            raise ValueError('LOOPBACK_ORIGIN_REQUIRED')
        with sync_playwright() as pw:
            browser=pw.chromium.launch(executable_path=browser_bin,headless=False,
              args=['--no-first-run','--disable-background-networking'])
            try:
                context=browser.new_context(viewport={'width':1600,'height':900},
                    record_video_dir=str(output_dir),record_video_size={'width':1600,'height':900})
                try:
                    def route_guard(route):
                        url=urlsplit(route.request.url)
                        if (url.scheme=='http' and url.hostname=='127.0.0.1' and
                            url.port==origin.port):
                            route.continue_()
                        else:
                            blocked[0]+=1
                            route.abort()
                    context.route('**/*',route_guard)
                    context.expose_binding('worknovaRecordedPointerDown',
                        lambda _source: clicks.__setitem__(0,clicks[0]+1))
                    context.add_init_script(script=CURSOR_JS)
                    page=context.new_page()
                    page.goto(local_origin+('/demo/innovation' if part==2 else '/demo'),
                              wait_until='domcontentloaded',timeout=15000)
                    page.locator('body').wait_for(state='visible')
                    print('WORKNOVA_OWNER_MANUAL_BROWSER_OPEN',flush=True)
                    print('Operate the browser with YOUR mouse. Use fictional data only.',flush=True)
                    print('Keep browser open; press Enter here when the scene is finished.',flush=True)
                    done=threading.Event()
                    def stop():
                        try:
                            input()
                        except EOFError:
                            pass
                        finally:
                            done.set()
                    threading.Thread(target=stop,daemon=True).start()
                    while not done.is_set():
                        if page.is_closed():
                            raise ValueError('OWNER_CLOSED_BROWSER_EARLY')
                        page.wait_for_timeout(250)
                    footage=page.video
                finally:
                    context.close()
                video_path=Path(footage.path()) if footage is not None else None
            finally:
                browser.close()
        if blocked[0]:
            raise ValueError('EXTERNAL_REQUEST_BLOCKED__EVIDENCE_NOT_CLEAN')
        if clicks[0]<1:
            raise ValueError('NO_REAL_BROWSER_POINTERDOWN__CAPTURE_NOT_ACCEPTED')
        if video_path is None or not video_path.is_file() or video_path.stat().st_size<1000:
            raise ValueError('VIDEO_CAPTURE_MISSING_OR_EMPTY')
        if verify_source()!=head:
            raise ValueError('SOURCE_CHANGED_DURING_RECORDING')
        # Never overwrite a source recording or an earlier owner take.
        video_path.rename(dest)
        sidecar.write_text(json.dumps({
            'state':'PRIVATE_OWNER_MANUAL_OFFLINE_CAPTURE_NOT_PUBLISHED',
            'product':'WORKNOVA','part':part,'source_sha':head,
            'video_filename':dest.name,'video_sha256':sha256(dest),
            'bytes':dest.stat().st_size,'resolution':'1600x900',
            'pointerdown_events_observed':clicks[0],
            'actual_operator_identity_independently_verified':False,
            'provider_calls':0,'payment_posts':0,'external_requests_allowed':0,
            'public_upload':False,'devpost_submitted':False,
            'publication_approved':False,'created_utc':datetime.now(timezone.utc).isoformat()
        },indent=2)+'\n',encoding='utf-8')
        print('WORKNOVA_PRIVATE_OWNER_CAPTURE_READY '+str(dest),flush=True)
        print('POINTERDOWN_EVENTS='+str(clicks[0])+' PROVIDER_CALLS=0 UPLOAD=NO RELEASE_HOLD',flush=True)
        return dest
    finally:
        if server.poll() is None:
            server.terminate()
            try:
                server.wait(timeout=5)
            except subprocess.TimeoutExpired:
                server.kill()
                server.wait(timeout=5)


def main() -> int:
    parser=argparse.ArgumentParser(description='Private owner-click recording, no API/provider calls')
    parser.add_argument('--part',type=int,choices=(1,2),default=2)
    parser.add_argument('--check',action='store_true',help='verify local prerequisites without launching')
    parser.add_argument('--output-dir',type=Path,default=ROOT/'output'/'videos')
    args=parser.parse_args()
    try:
        if args.check:
            preflight()
        else:
            record(args.part,args.output_dir.resolve())
        return 0
    except (OSError,ValueError,subprocess.SubprocessError,ImportError,RuntimeError) as exc:
        print('WORKNOVA_OWNER_CAPTURE_STOP '+str(exc),file=sys.stderr,flush=True)
        return 2


if __name__=='__main__':
    raise SystemExit(main())