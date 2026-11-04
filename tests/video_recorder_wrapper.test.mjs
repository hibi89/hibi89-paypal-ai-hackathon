import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

test('offline recording command is deliberately separate from normal app startup',()=>{
  const manifest=JSON.parse(readFileSync(new URL('../package.json',import.meta.url),'utf8'));
  assert.equal(manifest.scripts['video:record:offline'],'node scripts/run_record_demo.mjs');
  assert.ok(!manifest.scripts.demo.includes('record'));
  const wrapper=fileURLToPath(new URL('../scripts/run_record_demo.mjs',import.meta.url));
  const child=spawnSync(process.execPath,[wrapper,'--help'],{
    encoding:'utf8',timeout:10000,env:{PATH:process.env.PATH||''}
  });
  assert.equal(child.status,0,child.stderr);
  assert.match(child.stdout,/Local synthetic silent WebM only/);
  const recorder=readFileSync(new URL('../scripts/record_judge_demo.py',import.meta.url),'utf8');
  assert.match(recorder,/EXTERNAL_REQUEST_BLOCKED/);
  assert.match(recorder,/PAYMENT_POST_FORBIDDEN/);
  assert.match(recorder,/PUBLIC_UPLOAD=NO/);
});
