import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Script} from 'node:vm';

const lens=readFileSync(new URL('../scripts/premium_evidence_overlay.js',import.meta.url),'utf8');
const recorder=readFileSync(new URL('../scripts/record_judge_demo.py',import.meta.url),'utf8');
const voice=readFileSync(new URL('../scripts/render_owner_offline_voice.ps1',import.meta.url),'utf8');
const pkg=JSON.parse(readFileSync(new URL('../package.json',import.meta.url),'utf8'));

test('premium evidence lens parses and is content-only, without a PPT text dump',()=>{
  assert.doesNotThrow(()=>new Script(lens,{filename:'premium_evidence_overlay.js'}));
  assert.match(lens,/ProoflineFilmLens/);
  assert.match(lens,/lens-panel/);
  assert.match(lens,/lens-step-row/);
  assert.match(lens,/lens-tag-row/);
  assert.match(lens,/lens-proof/);
  assert.match(lens,/OWNER REPORT/);
  assert.match(lens,/NO NEW PROVIDER REQUESTS/);
  assert.doesNotMatch(lens,/\.innerHTML\s*=/);
  assert.doesNotMatch(lens,/fetch\(|XMLHttpRequest\s*\(|\.sendBeacon\(/);
  assert.doesNotMatch(lens,/window\.open\(/);
});

test('premium visual mode is conditional and retains standard recording path',()=>{
  assert.match(recorder,/premium_storyboard_cards\(proof\) if premium else storyboard_cards\(proof\)/);
  assert.match(recorder,/if premium:\s+page\.evaluate\("\(card\)=>window\.ProoflineFilmLens\.show\(card\)"/);
  assert.match(recorder,/PREMIUM_EVIDENCE_LAYOUT_OVERFLOW/);
  assert.match(recorder,/page\.evaluate\("document\.getElementById\('owner-evidence-video-slide'\)/);
  assert.match(recorder,/narration_script_version/);
  assert.match(recorder,/"voiceover_included": False/);
  assert.match(recorder,/page\.route\("\*\*\/\*"/);
  assert.match(recorder,/PAYMENT_POST_FORBIDDEN/);
});

test('narration is opt-in Windows-local, no recording by owner required',()=>{
  assert.match(pkg.scripts['video:voice:owner'],/render_owner_offline_voice\.ps1/);
  assert.match(voice,/System\.Speech\.Synthesis\.SpeechSynthesizer/);
  assert.match(voice,/source_commit_sha/);
  assert.match(voice,/source_tracked_tree_clean/);
  assert.match(voice,/Get-FileHash/);
  assert.match(voice,/NO_PROVIDER_REQUESTS NO_PAYMENTS NO_PUBLIC_UPLOAD/);
  assert.doesNotMatch(voice,/Invoke-RestMethod|Invoke-WebRequest|Start-BitsTransfer/);
});
