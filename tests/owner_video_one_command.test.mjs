import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const script=fileURLToPath(new URL('../scripts/prepare_and_record_video.mjs',import.meta.url));
function probe(args) {
  return spawnSync(process.execPath,[script,...args],{
    encoding:'utf8',timeout:10000,
    env:{PATH:process.env.PATH||'',SystemRoot:process.env.SystemRoot||''}
  });
}
test('one-command owner video setup advertises private recording without side effects',()=>{
  const manifest=JSON.parse(readFileSync(new URL('../package.json',import.meta.url)));
  assert.equal(manifest.scripts['video:record:owner'],
    'node scripts/prepare_and_record_video.mjs');
  const help=probe(['--help']);
  assert.equal(help.status,0,help.stderr);
  assert.match(help.stdout,/Local synthetic video ONLY; no upload/);
  assert.match(help.stdout,/Python 3/);
  const source=readFileSync(new URL('../scripts/prepare_and_record_video.mjs',import.meta.url),'utf8');
  assert.match(source,/VIDEO_PYTHON_BIN/);
  assert.match(source,/LOCAL_VIDEO_INTEGRITY_VERIFICATION_FAILED/);
});
test('invalid owner video flags fail before installing or recording',()=>{
  for(const args of [['--unknown'],['--pace-ms'],['--pace-ms','0'],
      ['--pace-ms','18001'],['--pace-ms','abc'],['--pace-ms','200','--extra']]){
    const result=probe(args);
    assert.equal(result.status,2,JSON.stringify(args)+' '+result.stderr);
    assert.match(result.stderr,/INVALID_VIDEO_FLAGS/);
    assert.doesNotMatch(result.stdout,/Preparing isolated Python video environment/);
  }
});
test('private video workdirs remain ignored and no deployment/Devpost command is bundled',()=>{
  const ignore=readFileSync(new URL('../.gitignore',import.meta.url),'utf8');
  assert.match(ignore,/^\.video-venv\/$/m);
  assert.match(ignore,/^output\/$/m);
  const source=readFileSync(new URL('../scripts/prepare_and_record_video.mjs',import.meta.url),'utf8');
  assert.ok(source.includes('scripts/check_recorded_video.py'));
  assert.ok(!source.includes('devpost.com'));
  assert.ok(!source.includes('api-m.paypal.com'));
});
