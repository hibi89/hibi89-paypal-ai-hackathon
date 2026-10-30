import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

test('offline video wrapper strips fake payment and AI secrets before child execution',
  {skip:process.platform==='win32'?'Unix-only interpreter test':false},()=>{
    const tmp=mkdtempSync(join(tmpdir(),'paypal-recorder-wrapper-'));
    try{
      const stub=join(tmp,'fake-python.sh');
      writeFileSync(stub,`#!/bin/sh
if [ -n "\${GEMINI_API_KEY+x}" ] || [ -n "\${PAYPAL_SANDBOX_CLIENT_SECRET+x}" ] || [ -n "\${NODE_OPTIONS+x}" ]; then
  echo "SENSITIVE_ENV_LEAKED"
  exit 91
fi
if [ "$1" != "scripts/record_judge_demo.py" ] || [ "$2" != "--pace-ms" ] || [ "$3" != "200" ]; then
  echo "ARGUMENTS_MISMATCH"
  exit 92
fi
echo "OFFLINE_WRAPPER_ARGS_AND_ENV_OK"
`,{mode:0o700});
      const wrapper=fileURLToPath(new URL('../scripts/run_record_demo.mjs',import.meta.url));
      const proc=spawnSync(process.execPath,[wrapper,'--pace-ms','200'],{
        encoding:'utf8',timeout:10000,
        env:{...process.env,VIDEO_PYTHON_BIN:stub,
          GEMINI_API_KEY:'DUMMY_ONLY',
          PAYPAL_SANDBOX_CLIENT_SECRET:'DUMMY_ONLY',
          NODE_OPTIONS:'--no-warnings'}
      });
      assert.equal(proc.status,0,proc.stderr+' '+proc.stdout);
      assert.match(proc.stdout,/OFFLINE_WRAPPER_ARGS_AND_ENV_OK/);
      assert.doesNotMatch(proc.stdout,/DUMMY_ONLY/);
    }finally{
      rmSync(tmp,{recursive:true,force:true});
    }
  });
