import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const loc=(path)=>fileURLToPath(new URL('../'+path,import.meta.url));
const read=(path)=>readFileSync(loc(path),'utf8');

test('WORKNOVA automatic recording has independent safe entrypoints',()=>{
  const pkg=JSON.parse(read('package.json'));
  assert.match(pkg.scripts['worknova:video:capture:auto:check'],/auto --check/);
  assert.match(pkg.scripts['worknova:video:capture:auto'],/auto --run/);
  const launcher=read('scripts/worknova_owner_video.mjs');
  assert.match(launcher,/auto:'scripts\/worknova_auto_capture.py'/);
  const code=read('scripts/worknova_auto_capture.py');
  for(const invariant of [
    'verify_source','PLAYWRIGHT_AUTOMATED_NOT_HUMAN',
    'owner_operated_clicks_claimed','publication_approved',
    'demonstrated_skills','provider_calls','payment_posts',
    'SOURCE_CHANGED_DURING_AUTO_CAPTURE','worknova=True'
  ])assert.ok(code.includes(invariant),invariant);
  assert.doesNotMatch(code,/requests\.post|paypal\.com|youtube\.com|urllib\.request|pip install/);
});

test('actual WORKNOVA auto capture reuses full five-skill browser steps with truth labels',()=>{
  const code=read('scripts/record_judge_demo.py');
  assert.match(code,/def capture\(output_dir, pace_ms, worknova=False\)/);
  assert.match(code,/worknova-automated-two-part-/);
  assert.match(code,/paypal-synthetic-review-" \+ datetime\.now\(\)\.strftime\("%Y%m%d-%H%M%S"\)/);
  assert.match(code,/1600 if worknova else 1280/);
  assert.match(code,/context\.add_init_script\(script=CURSOR_JS\)/);
  assert.match(code,/owner_operated_clicks_claimed": False/);
  assert.match(code,/capture_mode": "PLAYWRIGHT_AUTOMATED_OFFLINE_BROWSER"/);
  for(const selector of [
    '#marketplace-submit','#marketplace-vertical','#draft-submit',
    '#approve-submit','#contract-create','#delivery-submit',
    '#review-reject','#review-accept','#delegate','#a2a',
    '#gift','#churn','#invoice'
  ])assert.ok(code.includes(selector),selector);
  assert.match(code,/label\.replace\("PROOFLINE", "WORKNOVA"\)/);
  assert.match(code,/tag\.textContent=video_brand/);
  assert.match(code,/EXTERNAL_REQUEST_BLOCKED/);
  assert.match(code,/PAYMENT_POST_FORBIDDEN/);
});

test('one-click Windows auto capture uses no manual capture, download or publishing',()=>{
  const cmd=read('scripts/WORKNOVA-Film-Auto.cmd');
  assert.match(cmd,/worknova:video:capture:auto:check/);
  assert.match(cmd,/worknova:video:capture:auto\b/);
  assert.doesNotMatch(cmd,/capture:part1|capture:part2|pip install|npm publish|gh release|git push/);
});

test('Python auto script and extended recorder compile',t=>{
  const python=process.platform==='win32'?'python':'python3';
  const probe=spawnSync(python,['--version'],{encoding:'utf8',timeout:3000});
  if(probe.status!==0){t.skip('Python unavailable');return}
  const code="import pathlib,sys;p=pathlib.Path(sys.argv[1]);compile(p.read_text('utf8'),str(p),'exec')";
  for(const path of ['scripts/worknova_auto_capture.py','scripts/record_judge_demo.py']){
    const r=spawnSync(python,['-c',code,loc(path)],{encoding:'utf8',timeout:8000});
    assert.equal(r.status,0,path+': '+r.stderr);
  }
});
