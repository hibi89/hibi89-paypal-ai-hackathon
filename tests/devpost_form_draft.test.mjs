import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,mkdtempSync,mkdirSync,writeFileSync,rmSync,existsSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {buildDevpostFormFields,generateLocalDevpostDraft} from '../scripts/build_devpost_form_fields.mjs';
const root=new URL('../',import.meta.url);
const draft=readFileSync(new URL('docs/DEVPOST_FINAL_REVIEW_PACKET_EN_20261105.md',root),'utf8');
test('real English draft extracts full editable Devpost fields while remaining unpublished',()=>{
 const r=buildDevpostFormFields(draft);
 assert.equal(r.schemaVersion,1);
 assert.equal(r.state,'OWNER_REVIEW_REQUIRED_NOT_SUBMITTED');
 assert.match(r.projectTitle,/Proofline/);
 assert.match(r.tagline,/opportunity/i);
 assert.equal(r.devpostSubmitted,false);
 assert.equal(r.publicYouTubeUrl,null);
 assert.equal(r.devpostReceiptUrl,null);
 assert.equal(r.hostedDemoUrl,null);
 assert.equal(r.defaultMainSourceReleased,false);
 assert.equal(r.ownerAuthorizedPublication,false);
 assert.equal(r.offlineBrowserProviderCalls,0);
 assert.equal(r.actualPaymentAuthorized,false);
 for(const heading of ['Inspiration','What it does','How we built it','What we learned']){
  assert.ok(r.descriptionMarkdown.includes('### '+heading));
 }
 assert.match(r.descriptionMarkdown,/not independently reproduced in CI/i);
 assert.match(r.reviewerInstructions,/git switch lead\/paypal/);
 assert.match(r.reviewerInstructions,/npm run demo/);
});
test('cannot transform tampered or prematurely published copy into an owner-ready packet',()=>{
 for(const altered of [
  draft.replace('DRAFT — NOT PUBLISHED','PUBLISHED'),
  draft.replace('NOT SUBMITTED','SUBMITTED'),
  draft.replace('RELEASE HOLD','RELEASE APPROVED'),
  draft.replace('not independently reproduced in CI','independently reproduced in CI'),
  draft.replace('## Inspiration','## MISSING'),
  draft.replace('## What we learned','## Inspiration'),
  draft.replace('git switch lead/paypal','git switch main'),
  draft.replace('draft PR #28','published production')
 ])assert.throws(()=>buildDevpostFormFields(altered));
});
test('safe local generation only touches ignored output and --check never writes',()=>{
 const tmp=mkdtempSync(join(tmpdir(),'proofline-fields-'));
 try{
  mkdirSync(join(tmp,'docs'));
  writeFileSync(join(tmp,'docs','DEVPOST_FINAL_REVIEW_PACKET_EN_20261105.md'),draft);
  const checked=generateLocalDevpostDraft({root:tmp,write:false});
  assert.equal(checked.devpostSubmitted,false);
  assert.equal(existsSync(join(tmp,'output')),false);
  const written=generateLocalDevpostDraft({root:tmp});
  const stored=JSON.parse(readFileSync(join(tmp,'output','submission','devpost_form_draft.json'),'utf8'));
  assert.deepEqual(stored,written);
  assert.equal(stored.ownerAuthorizedPublication,false);
 }finally{rmSync(tmp,{recursive:true,force:true})}
});
test('cli refuses unknown flags, and no-output check mode succeeds',()=>{
 const path=fileURLToPath(new URL('../scripts/build_devpost_form_fields.mjs',import.meta.url));
 const bad=spawnSync(process.execPath,[path,'--publish'],{encoding:'utf8',timeout:10000});
 assert.equal(bad.status,1);assert.match(bad.stderr,/LOCAL_DEVPOST_FLAGS_REJECTED/);
 const good=spawnSync(process.execPath,[path,'--check'],{encoding:'utf8',timeout:10000});
 assert.equal(good.status,0,good.stderr);
 const result=JSON.parse(good.stdout);
 assert.equal(result.output,'VALIDATED_NO_WRITE');
 assert.equal(result.publicYouTubeUrl,null);
 assert.equal(result.devpostSubmitted,false);
});
