// CLI gates only. Tests never provide a terminal, credentials or provider network.
import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const cli=fileURLToPath(new URL('../scripts/run_owner_private_gemini_innovation.mjs',import.meta.url));
const required=['--execute','--owner-authorized','--free-tier-confirmed'];
function invoke(args=[]){
 const result=spawnSync(process.execPath,['--experimental-sqlite',cli,...args],{
  encoding:'utf8',timeout:15000,windowsHide:true,
  env:{...process.env,NODE_NO_WARNINGS:'1',
   GEMINI_API_KEY:'FAKE_KEY_CI_MUST_NOT_LEAK_OR_POST'}
 });
 assert.equal(result.error,undefined);
 assert.equal(result.stderr,'');
 assert.ok(result.stdout.startsWith('{'));
 assert.doesNotMatch(result.stdout,/FAKE_KEY_CI_MUST_NOT_LEAK_OR_POST/);
 return {exit:result.status,body:JSON.parse(result.stdout.trim())};
}
test('private $1.50 pilot flag alone remains zero-network dry run',()=>{
 for(const args of [[],['--sandbox-pilot-150'],['--sandbox-pilot-150','--bad-flag'],
  [...required,'--sandbox-pilot-150','--sandbox-pilot-150']]){
  const {exit,body}=invoke(args);
  assert.equal(exit,0);
  assert.equal(body.status,'DRY_RUN_NO_NETWORK');
  assert.equal(body.networkRequests,0);
  assert.equal(body.paymentState,'NOT_PAID');
  assert.equal(body.optionalSmallPilotFlag,'--sandbox-pilot-150');
 }
});
test('legacy and $1.50 execution flags both require private TTY before credentials or disk',()=>{
 for(const args of [required,[...required,'--sandbox-pilot-150']]){
  const {exit,body}=invoke(args);
  assert.equal(exit,2);
  assert.equal(body.status,'PRIVATE_TTY_REQUIRED');
  assert.equal(body.networkRequests,0);
  assert.equal(body.paymentState,'NOT_PAID');
 }
});
