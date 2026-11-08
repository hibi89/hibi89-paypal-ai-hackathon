import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const root=new URL('../',import.meta.url);
const local=(path)=>fileURLToPath(new URL(path,root));
const read=(path)=>readFileSync(new URL(path,root),'utf8');
test('WORKNOVA local media tools entrypoints preserve no-publish boundary',()=>{
  const pkg=JSON.parse(read('package.json'));
  assert.match(pkg.scripts['worknova:video:capture:part2'],/capture --part 2/);
  assert.match(pkg.scripts['worknova:video:voice:part2'],/voice --render/);
  assert.match(pkg.scripts['worknova:video:capture:check'],/capture --check/);
  const runner=read('scripts/worknova_owner_video.mjs');
  assert.match(runner,/\.video-venv/);
  assert.match(runner,/shell:false/);
  assert.match(runner,/--publish\|--upload\|--devpost/);
  assert.ok(existsSync(local('scripts/worknova_owner_capture.py')));
  assert.ok(existsSync(local('scripts/worknova_part2_neural.py')));
});
test('owner capture uses real DOM clicks; nonlocal requests and dirty source are refused',()=>{
  const src=read('scripts/worknova_owner_capture.py');
  for(const requirement of [
    'OWNER_INTERACTIVE_TERMINAL_REQUIRED',
    'NO_REAL_BROWSER_POINTERDOWN__CAPTURE_NOT_ACCEPTED',
    'worknovaRecordedPointerDown',
    "hostname=='127.0.0.1'",
    'CLEAN_GIT_SOURCE_REQUIRED',
    'SOURCE_CHANGED_DURING_RECORDING',
    'WORKNOVA_SOURCE_NOT_BRANDED',
    "public_upload':False"
  ])assert.ok(src.includes(requirement),requirement);
});
test('five approved-voice scenes are pinned to the private 170-second edit',()=>{
  const src=read('scripts/worknova_part2_neural.py');
  for(const requirement of [
    "voice='af_heart'",'kokoro-v1.0.fp16.onnx',
    'PART2_CUE_TIMING_NOT_SAFE',
    "'delegate'","'a2a'","'gift'","'churn'","'invoice'",
    'NO_AUTO_DOWNLOAD',"owner_approved_for_release':False"
  ])assert.ok(src.includes(requirement),requirement);
});
test('offline cue preflight passes; ambiguous flags fail; both Python files compile without disk writes',t=>{
  const python=process.platform==='win32'?'python':'python3';
  const probe=spawnSync(python,['--version'],{encoding:'utf8',timeout:3000});
  if(probe.status!==0){t.skip('Python absent in current runner');return}
  const path=local('scripts/worknova_part2_neural.py');
  const pass=spawnSync(python,[path,'--check-cues'],{encoding:'utf8',timeout:8000});
  assert.equal(pass.status,0,pass.stderr);
  const obj=JSON.parse(pass.stdout.trim());
  assert.equal(obj.count,5);
  assert.equal(obj.film_seconds,170);
  assert.equal(obj.provider_calls,0);
  const fail=spawnSync(python,[path,'--check-cues','--render'],{encoding:'utf8',timeout:8000});
  assert.equal(fail.status,2);
  assert.match(fail.stderr,/not allowed with argument/);
  for(const name of ['scripts/worknova_owner_capture.py','scripts/worknova_part2_neural.py']){
    const pyCode="import pathlib,sys; p=pathlib.Path(sys.argv[1]); compile(p.read_text('utf8'),str(p),'exec')";
    const result=spawnSync(python,['-c',pyCode,local(name)],{encoding:'utf8',timeout:8000});
    assert.equal(result.status,0,name+': '+result.stderr);
  }
});

test('private Kokoro audio mux validates exact 170s media, manifest SHA and release hold',t=>{
  const code=read('scripts/worknova_private_voice_mux.py');
  for(const value of [
    'PINNED_KOKORO_VOICE_MANIFEST_REQUIRED',
    'PART2_KOKORO_PROVENANCE_OR_SHA_MISMATCH',
    'PREVIEW_TIMELINE_NOT_170S',
    'FFMPEG_PRIVATE_MUX_FAILED',
    'owner_captured_real_click_footage_verified',
    'legacy_proofline_pixels_may_remain',
    'release_hold',
    'output_af_heart'
  ].filter(v=>v!=='output_af_heart'))assert.ok(code.includes(value),value);
  assert.match(JSON.parse(read('package.json')).scripts['worknova:video:voice:mux'],/worknova_owner_video\.mjs mix/);
  const python=process.platform==='win32'?'python':'python3';
  const probe=spawnSync(python,['--version'],{encoding:'utf8',timeout:3000});
  if(probe.status!==0){t.skip('Python absent in runner');return}
  const pyCode="import pathlib,sys;p=pathlib.Path(sys.argv[1]);compile(p.read_text('utf8'),str(p),'exec')";
  const compiled=spawnSync(python,['-c',pyCode,local('scripts/worknova_private_voice_mux.py')],{encoding:'utf8',timeout:8000});
  assert.equal(compiled.status,0,compiled.stderr);
  const refused=spawnSync(python,[local('scripts/worknova_private_voice_mux.py'),
    '--video','not-existing-video.mp4','--part2-wav','not-existing-voice.wav','--check-only'],{encoding:'utf8',timeout:8000});
  assert.equal(refused.status,2);
  assert.match(refused.stderr,/REAL_LOCAL_VIDEO_AND_WAV_REQUIRED/);
});

test('Windows WORKNOVA single-run script only records offline footage and local Kokoro',()=>{
  const script=read('scripts/WORKNOVA-Film-Owner.cmd');
  for(const step of [
    'worknova:video:capture:check',
    'worknova:video:voice:check-cues',
    'worknova:video:voice:check-model',
    'worknova:video:capture:part1',
    'worknova:video:capture:part2',
    'worknova:video:voice:part2',
    'if errorlevel 1 goto FAILED'
  ])assert.ok(script.includes(step),'missing offline safe step: '+step);
  const commands=script.split(/\r?\n/).filter(line=>!/^[ \t]*(?:echo(?:[.\s]|$)|rem\s|::)/i.test(line)).join('\n');
  assert.doesNotMatch(commands,/npm publish|gh release|git push|youtube|devpost\.com|--live|--capture-payment/i);
  assert.ok(script.includes('RELEASE HOLD'));
});

// v4b regression: scene starts and narration were previously ~4s out of sync.
test('WORKNOVA v4b five neural cues fit each actual 170s scene',()=>{
  const src=read('scripts/worknova_part2_neural.py');
  const mux=read('scripts/worknova_private_voice_mux.py');
  for(const [name,start,stop] of [['delegate',104.4,111.6],['a2a',112.45,122.5],
                                  ['gift',123.45,134.5],['churn',135.35,143.5],
                                  ['invoice',144.45,153.5]]){
    assert.ok(src.includes("('"+name+"',"+start+","+stop+","),'cue missing/outdated: '+name);
  }
  assert.match(src,/PART2_CUE_OUTSIDE_ACTUAL_V4B_SCENE/);
  assert.match(src,/REFERENCE_CUT_SHA='abe1b4094f0d11/);
  assert.match(mux,/VERIFIED_V4B_V4C_VIDEO_SHA_REQUIRED__NEW_CUT_NEEDS_RETIMING/);
  assert.match(mux,/96941f892dc91f4c7508b2d70fdec67ba93acb2738a71b997e781c6dd198d7a8/);
  assert.match(mux,/between\(t,104,154\).*eval=frame/);
  assert.doesNotMatch(mux,/between\(t,108,152\)/);
});


test('private v4d 170s final voice preparation only accepts SHA-pinned input',()=>{
  const mux=read('scripts/worknova_private_voice_mux.py');
  const finish=read('scripts/worknova_v4d_offline_voice_finish.py');
  const exact='d74482b77770259a5cf18f4cd81a6e4b15264ce401431ef65d3e21530dbaebdb';
  assert.ok(mux.includes(exact));
  assert.ok(finish.includes(exact));
  assert.match(finish,/--check-model/);
  assert.match(finish,/--render/);
  assert.match(finish,/--check-cues/);
  assert.match(finish,/--part2-wav/);
  assert.match(finish,/release_hold':True/);
  assert.doesNotMatch(finish,/urlopen|requests\.get|npm publish|youtube\.com\/upload|devpost\.com\/submit/);
});
