import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

test('judge reproduction CI runs the actual full local command, not only individual browser tests',()=>{
 const workflow=readFileSync(new URL('../.github/workflows/test.yml',import.meta.url),'utf8');
 const step=workflow.match(/- name: Full judge one-command reproduction[^\n]*\n([\s\S]*?)\n      - name: Check recorder Python syntax/);
 assert.ok(step,'full reviewer step missing from existing safe workflow');
 const body=step[1];
 assert.match(body,/npm run verify:local \| tee/);
 assert.match(body,/\.browser-venv\/bin:\$PATH/);
 assert.match(body,/VERIFY_LOCAL_TWO_PART_PASS/);
 assert.match(body,/CHROMIUM_LOOPBACK/);
 assert.match(body,/CHROMIUM_PART2/);
 assert.match(body,/JUDGE_ONE_COMMAND_TWO_PART_PASS/);
 assert.match(body,/providerCalls===0&&r\.paymentPosts===0/);
 assert.match(body,/r\.submissionEligible===false&&r\.realProviderVerified===false/);
 assert.doesNotMatch(body,/continue-on-error|upload-artifact|mvp:quick|capture\/order/i);
});
