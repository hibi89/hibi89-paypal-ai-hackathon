#!/usr/bin/env python3
"""WORKNOVA private 170s review mux: never overwrite, upload or claim publication.

This only adds already synthesized, owner-model-verified af_heart Part2 WAV
(from worknova_part2_neural.py) to an existing private 170s editorial MP4.
It DOES NOT replace legacy pixels or establish owner-operated browser filming.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import shutil
import subprocess
import sys
import uuid
from datetime import datetime, timezone
from pathlib import Path


def sha256(path:Path) -> str:
    h=hashlib.sha256()
    with path.open('rb') as f:
        for chunk in iter(lambda:f.read(1024*1024),b''):
            h.update(chunk)
    return h.hexdigest()


def probe(path:Path):
    tool=shutil.which('ffprobe')
    if not tool:raise ValueError('FFPROBE_NOT_INSTALLED')
    res=subprocess.run([tool,'-v','error','-show_entries',
        'format=duration:stream=codec_type,codec_name,width,height,sample_rate,channels',
        '-of','json',str(path)],capture_output=True,text=True,timeout=20)
    if res.returncode:raise ValueError('FFPROBE_REJECTED_MEDIA')
    result=json.loads(res.stdout)
    if 'format' not in result:raise ValueError('MEDIA_FORMAT_UNAVAILABLE')
    return result


def validate(video:Path,wav:Path):
    if not video.is_file() or not wav.is_file() or video.is_symlink() or wav.is_symlink():
        raise ValueError('REAL_LOCAL_VIDEO_AND_WAV_REQUIRED')
    if video.resolve()==wav.resolve():raise ValueError('ORIGINAL_VIDEO_AND_VOICE_MUST_DIFFER')
    report_path=wav.with_suffix('.json')
    if not report_path.is_file() or report_path.is_symlink():
        raise ValueError('PINNED_KOKORO_VOICE_MANIFEST_REQUIRED')
    report=json.loads(report_path.read_text('utf8'))
    if (report.get('source_model_sha256')!='f3a290d384fbb27966d462905c71a46cef9e5fd00516b40df32a0b4afe77ac96' or
        report.get('source_voicepack_sha256')!='bca610b8308e8d99f32e6fe4197e7ec01679264efed0cac9140fe9c29f1fbf7d' or
        [x.get('scene') for x in report.get('cues',[]) if isinstance(x,dict)]!=
          ['delegate','a2a','gift','churn','invoice'] or
        report.get('status')!='PRIVATE_WORKNOVA_PART2_KOKORO_READY__NOT_MIXED' or
        report.get('voice')!='af_heart' or report.get('audio_seconds')!=170.0 or
        report.get('sample_rate')!=24000 or report.get('cue_count')!=5 or
        report.get('provider_calls')!=0 or report.get('payments')!=0 or
        report.get('uploaded') is not False or
        report.get('owner_approved_for_release') is not False or
        report.get('sha256')!=sha256(wav)):
        raise ValueError('PART2_KOKORO_PROVENANCE_OR_SHA_MISMATCH')
    v=probe(video);a=probe(wav)
    vd=float(v['format']['duration']);ad=float(a['format']['duration'])
    if abs(vd-170)>0.10 or abs(ad-170)>0.10:
        raise ValueError('PREVIEW_TIMELINE_NOT_170S__RETIMING_REQUIRED')
    vs=[x for x in v['streams'] if x['codec_type']=='video']
    v_audio=[x for x in v['streams'] if x['codec_type']=='audio']
    a_audio=[x for x in a['streams'] if x['codec_type']=='audio']
    if (len(vs)!=1 or vs[0]['codec_name']!='h264' or
        (vs[0].get('width'),vs[0].get('height'))!=(1920,1080) or
        len(v_audio)!=1 or len(a_audio)!=1 or a_audio[0]['sample_rate']!='24000'):
        raise ValueError('PRIVATE_1080P_H264_AND_24K_KOKORO_WAV_REQUIRED')
    return report


def mux(video:Path,wav:Path,out_dir:Path):
    report=validate(video,wav)
    ffmpeg=shutil.which('ffmpeg')
    if not ffmpeg:raise ValueError('FFMPEG_NOT_INSTALLED')
    out_dir.mkdir(parents=True,exist_ok=True)
    name='worknova-private-af-heart-part2-'+datetime.now().strftime('%Y%m%d-%H%M%S')+'-'+uuid.uuid4().hex[:6]
    dest=out_dir/(name+'.mp4')
    sidecar=out_dir/(name+'.json')
    if dest.exists() or sidecar.exists() or dest.resolve() in (video.resolve(),wav.resolve()):
        raise FileExistsError('OUTPUT_SOURCE_COLLISION_STOP')
    # The existing 170s cut has original ambient music and Part1 voice. Part2
    # scenes currently have no voice; duck bed for 108s..152s and add speech.
    # A limiter avoids introducing digital clipping without increasing speech speed.
    filters=("[0:a]aresample=48000,aformat=channel_layouts=stereo,"
             "volume='if(between(t,108,152),0.60,1)'[bed];"
             "[1:a]aresample=48000,aformat=channel_layouts=stereo,volume=1.0[narr];"
             "[bed][narr]amix=inputs=2:duration=first:dropout_transition=0:normalize=0,"
             "alimiter=limit=0.90[out]")
    cmd=[ffmpeg,'-nostdin','-hide_banner','-loglevel','error','-n',
        '-i',str(video),'-i',str(wav),'-filter_complex',filters,
        '-map','0:v:0','-map','[out]','-c:v','copy',
        '-c:a','aac','-b:a','192k','-ar','48000','-ac','2',
        '-movflags','+faststart','-t','170.0',str(dest)]
    try:
        run=subprocess.run(cmd,capture_output=True,text=True,timeout=300)
        if run.returncode:raise ValueError('FFMPEG_PRIVATE_MUX_FAILED__'+run.stderr[-500:])
        result=probe(dest)
        secs=float(result['format']['duration'])
        if abs(secs-170)>0.15:raise ValueError('OUTPUT_LENGTH_NOT_170S')
        metadata={
            'status':'WORKNOVA_PRIVATE_MIXED_REVIEW_NOT_FINAL',
            'video_name':dest.name,'video_sha256':sha256(dest),'duration_seconds':secs,
            'input_video_sha256':sha256(video),'input_af_heart_sha256':report['sha256'],
            'approved_narration_engine':'owner-local Kokoro FP16 af_heart',
            'part2_cue_count':5,
            'legacy_proofline_pixels_may_remain':True,
            'owner_captured_real_click_footage_verified':False,
            'fully_listened_owner_approved':False,
            'provider_calls':0,'payment_posts':0,
            'public_upload':False,'devpost_submitted':False,'release_hold':True,
            'created_utc':datetime.now(timezone.utc).isoformat()}
        sidecar.write_text(json.dumps(metadata,indent=2)+'\n',encoding='utf8')
        print('PRIVATE_WORKNOVA_PART2_MIX_PASS '+str(dest),flush=True)
        print('SHA256 '+metadata['video_sha256']+' RELEASE_HOLD NO_PUBLICATION',flush=True)
        return dest
    except Exception:
        # Only remove the newly-created incomplete destination, never inputs.
        if dest.exists():dest.unlink()
        raise


def main():
    p=argparse.ArgumentParser(description='Private voice mux, no upload/provider calls')
    p.add_argument('--video',type=Path,required=True)
    p.add_argument('--part2-wav',type=Path,required=True)
    p.add_argument('--output-dir',type=Path,default=Path('output')/'videos')
    p.add_argument('--check-only',action='store_true')
    a=p.parse_args()
    try:
        validate(a.video,a.part2_wav)
        if a.check_only:
            print('WORKNOVA_PART2_MUX_INPUTS_VALID__NO_WRITE NO_PUBLISH',flush=True)
        else:
            mux(a.video,a.part2_wav,a.output_dir)
        return 0
    except (OSError,ValueError,subprocess.SubprocessError,KeyError,TypeError) as exc:
        print('WORKNOVA_PRIVATE_MUX_STOP '+str(exc),file=sys.stderr,flush=True)
        return 2

if __name__=='__main__':
    raise SystemExit(main())