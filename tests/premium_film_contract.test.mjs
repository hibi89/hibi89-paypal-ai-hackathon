import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const html=readFileSync(new URL('../web/offline_demo.html',import.meta.url),'utf8');
const recorder=readFileSync(new URL('../scripts/record_judge_demo.py',import.meta.url),'utf8');
const wrapper=readFileSync(new URL('../scripts/prepare_and_record_video.mjs',import.meta.url),'utf8');
const pkg=JSON.parse(readFileSync(new URL('../package.json',import.meta.url),'utf8'));

test('premium theme preserves the core approval, marketplace, and provenance UI',()=>{
  assert.match(html,/PROOFLINE PREMIUM FILM DESIGN SYSTEM/);
  assert.match(html,/color-scheme:dark/);
  for(const id of ['marketplace-panel','marketplace-brief','marketplace-submit',
    'quote-panel','draft-form','approve-form','dollars','confirm',
    'payment-panel','contract-panel','historical-provider-evidence',
    'proof-map-panel','proof-fake-provider']){
    assert.equal(html.split('id="'+id+'"').length,2,'single ID '+id);
  }
  assert.match(html,/Offline demonstration — NOT REAL AI OR PAYPAL/);
  assert.match(html,/Payment is DISABLED/);
  assert.match(html,/OWNER-REPORTED · NOT INDEPENDENTLY REPRODUCED/);
  assert.match(html,/@media\(prefers-reduced-motion:reduce\)/);
});

test('premium recorder is opt-in and ordinary CI recording remains unchanged',()=>{
  assert.match(recorder,/def capture\(output_dir, pace_ms, premium=False\):/);
  assert.match(recorder,/parser.add_argument\("--premium", action="store_true"/);
  assert.match(recorder,/if not premium:\s+target.click\(\)/);
  // Premium pointer movement must persist across actual captured frames.
  assert.match(recorder,/def film_move_to\(x, y\):/);
  assert.match(recorder,/page.wait_for_timeout\(45 if pace_ms >= 1000 else 4\)/);
  assert.match(recorder,/page.mouse.click\(x,y,delay=140 if pace_ms >= 1000 else 40\)/);
  assert.match(recorder,/page.wait_for_timeout\(min\(7800, max\(950, pace_ms\+1200\)\)\)/);
  assert.match(recorder,/guided_click\("a.hero-cta"\)/);
  assert.match(recorder,/target.type\(value,delay=52 if pace_ms >= 1000 else 5\)/);
  assert.match(recorder,/html\{scroll-behavior:auto!important\}/);
  assert.match(recorder,/video_started < 178|video_started < 178|video_started < 178|time.monotonic\(\)-video_started < 178/);
  assert.match(recorder,/route.abort\(\)/);
  assert.match(recorder,/PAYMENT_POST_FORBIDDEN/);
  assert.match(recorder,/"voiceover_included": False/);
  assert.match(wrapper,/args\[0\]==='--premium'/);
  assert.match(pkg.scripts['video:record:premium:owner'],/--premium --pace-ms 6500/);
});

test('premium presenter captions preserve readable UI and source disclosure',()=>{
  assert.match(recorder,/def caption\(label, placement="bottom"\):/);
  assert.match(recorder,/PREMIUM_CAPTION_LENGTH_OR_PLACEMENT_INVALID/);
  assert.match(recorder,/maxWidth:'min\(62vw,620px\)'/);
  assert.match(recorder,/WebkitLineClamp:'2'/);
  assert.match(recorder,/background:'rgba\(8,17,31,.34\)'/);
  assert.match(recorder,/def keep_caption_off_target\(rect\):/);
  assert.equal((recorder.match(/keep_caption_off_target\(rect\)/g)||[]).length,3);
  assert.match(recorder,/if premium:\s+# The evidence lens already labels its own source/);
  assert.match(recorder,/document.getElementById\('video-presenter-caption'\)\?\.remove\(\)/);
  assert.match(recorder,/HISTORICAL OWNER REPORT \| Gemini \+ PayPal Sandbox; not replayed here/);
  assert.match(recorder,/FAKE API TRACE \| Simulated Gemini and PayPal. Zero real provider calls/);
  assert.match(recorder,/HUMAN APPROVAL \| Exact quote and amount. No payment authorized/);
  assert.doesNotMatch(recorder,/left:premium\?'10%'/);
});
