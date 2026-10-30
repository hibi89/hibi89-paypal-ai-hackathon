import test from 'node:test';
import assert from 'node:assert/strict';
import {probePrivateVideoDuration} from '../scripts/prepare_submission_candidate.mjs';

const video={
  status:'LOCAL_SYNTHETIC_WEBM_INTEGRITY_VERIFIED',
  filename:'paypal-synthetic-review-20261030-010203.webm'
};
const fixture=(stdout,status=0)=>({run:(bin,args,options)=>{
  assert.equal(bin,'ffprobe');
  assert.deepEqual(args.slice(0,7),[
    '-v','error','-show_entries','format=duration',
    '-of','default=noprint_wrappers=1:nokey=1','-i'
  ]);
  assert.ok(args[7].endsWith(video.filename));
  assert.equal(options.shell,false);
  assert.equal(options.timeout,12000);
  return {status,stdout};
}});

test('local ffprobe reports verified encoded WebM duration strictly under 180 seconds',()=>{
  const result=probePrivateVideoDuration('/private',video,fixture('153.960000\n'));
  assert.deepEqual(result,{status:'ENCODED_MEDIA_UNDER_THREE_MINUTES',seconds:153.96});
});

test('180 seconds or longer never passes a strictly under-three-minute gate',()=>{
  for(const raw of ['180.000000','184.25','999.99']){
    const result=probePrivateVideoDuration('/private',video,fixture(raw));
    assert.equal(result.status,'ENCODED_MEDIA_TOO_LONG');
  }
});

test('missing ffprobe, failed probes, corrupted outputs and zero length fail closed',()=>{
  assert.deepEqual(
    probePrivateVideoDuration('/private',video,{run:()=>{throw new Error('ENOENT')}}),
    {status:'FFPROBE_UNAVAILABLE_OR_FAILED',seconds:null}
  );
  for(const [out,status] of [['',0],['N/A',0],['154.08\n164.08',0],
    ['1e10',0],['154.08',1]]){
    const result=probePrivateVideoDuration('/private',video,fixture(out,status));
    assert.equal(result.status,'FFPROBE_UNAVAILABLE_OR_FAILED');
    assert.equal(result.seconds,null);
  }
  assert.deepEqual(probePrivateVideoDuration('/private',video,fixture('0.000000')),
    {status:'ENCODED_MEDIA_DURATION_INVALID',seconds:null});
});

test('unverified and maliciously named video files never invoke ffprobe',()=>{
  const fail=()=>{throw new Error('FFPROBE_MUST_NOT_RUN')};
  for(const bad of [
    null,
    {status:'LOCAL_VIDEO_NOT_RECORDED'},
    {...video,filename:'../../secrets.webm'},
    {...video,filename:'https://provider.example/x.webm'}
  ]){
    const result=probePrivateVideoDuration('/private',bad,{run:fail});
    assert.deepEqual(result,{status:'NO_VERIFIED_VIDEO_TO_PROBE',seconds:null});
  }
});
