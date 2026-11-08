#!/usr/bin/env python3
"""Offline WORKNOVA v4d Part2 voice/subtitle/mux orchestration, never publishes.

Default --check-only validates the pinned private 170s film and local voice
assets without creating files. --render explicitly creates NEW local files.
Original approved video, narration and model are never modified or copied.
"""
from __future__ import annotations
import argparse
import hashlib
import json
import subprocess
import sys
import uuid
from datetime import datetime, timezone
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
SCRIPT_DIR=Path(__file__).resolve().parent
V4D_SHA='d74482b77770259a5cf18f4cd81a6e4b15264ce401431ef65d3e21530dbaebdb'

def sha256(path:Path):
    h=hashlib.sha256()
    with path.open('rb') as f:
        for data in iter(lambda:f.read(1024*1024),b''):h.update(data)
    return h.hexdigest()

def verify_video(path:Path):
    if not path.is_file() or path.is_symlink():
        raise ValueError('VERIFIED_PRIVATE_V4D_VIDEO_REQUIRED')
    if sha256(path)!=V4D_SHA:
        raise ValueError('V4D_VIDEO_SHA256_MISMATCH__STOP')
    return {'video_sha256':V4D_SHA,'video_source':str(path.resolve())}

def run(args):
    result=subprocess.run(args,stdin=subprocess.DEVNULL,capture_output=True,text=True,timeout=360)
    if result.returncode:
        raise ValueError('OFFLINE_STEP_FAILED_'+str(Path(args[1]).name)+'_'+result.stderr[-400:].strip())
    return result.stdout

def finish(video:Path,model_dir:Path,output_base:Path,render=False):
    info=verify_video(video)
    voice=SCRIPT_DIR/'worknova_part2_neural.py'
    captions=SCRIPT_DIR/'worknova_subtitles_from_voice.py'
    mux=SCRIPT_DIR/'worknova_private_voice_mux.py'
    if not all(p.is_file() for p in (voice,captions,mux)):
        raise ValueError('GITHUB_VOICE_TOOLCHAIN_FILES_MISSING')
    run([sys.executable,str(voice),'--check-cues'])
    run([sys.executable,str(voice),'--check-model','--model-dir',str(model_dir)])
    if not render:
        return {'status':'PRIVATE_OFFLINE_V4D_VOICE_PREFLIGHT_PASS__NO_WRITE',
                **info,'voice':'af_heart','network_requests':0,'public_upload':False,
                'release_hold':True}
    if output_base.exists() and (output_base.is_symlink() or not output_base.is_dir()):
        raise ValueError('OUTPUT_BASE_INVALID')
    stamp=datetime.now(timezone.utc).strftime('%Y%m%d-%H%M%S')+'-'+uuid.uuid4().hex[:8]
    session=output_base/('worknova-v4d-voice-'+stamp)
    if session.exists():raise FileExistsError('OUTPUT_SESSION_EXISTS__NO_OVERWRITE')
    session.mkdir(parents=True,exist_ok=False)
    # Every stage writes a distinct filename in this new session, never source files.
    run([sys.executable,str(voice),'--render','--model-dir',str(model_dir),
         '--output-dir',str(session)])
    wavs=list(session.glob('worknova-part2-kokoro-af-heart-*.wav'))
    if len(wavs)!=1:raise ValueError('EXACTLY_ONE_MODEL_BACKED_WAV_REQUIRED')
    wav=wavs[0];manifest=wav.with_suffix('.json')
    if not manifest.is_file():raise ValueError('KOKORO_PROVENANCE_MANIFEST_REQUIRED')
    run([sys.executable,str(captions),'--wav',str(wav),'--report',str(manifest),
         '--output',str(session/'WORKNOVA_Part2_EN_KO_VoiceTimed.srt')])
    run([sys.executable,str(mux),'--video',str(video),'--part2-wav',str(wav),
         '--output-dir',str(session)])
    mp4s=list(session.glob('worknova-private-af-heart-part2-*.mp4'))
    if len(mp4s)!=1:raise ValueError('EXACTLY_ONE_PRIVATE_MUX_OUTPUT_REQUIRED')
    report={'status':'PRIVATE_V4D_VOICE_MUX_PREVIEW__OWNER_REVIEW_REQUIRED',
            **info,'voice':'af_heart','wav_sha256':sha256(wav),
            'mixed_mp4_sha256':sha256(mp4s[0]),
            'part2_wav':wav.name,'mixed_mp4':mp4s[0].name,
            'subtitle':'WORKNOVA_Part2_EN_KO_VoiceTimed.srt',
            'provider_calls':0,'payments':0,'published':False,'release_hold':True,
            'owner_full_listening_review':False,'voice_word_alignment':False}
    (session/'PRIVATE_WORKNOVA_V4D_VOICE_RECEIPT.json').write_text(
        json.dumps(report,indent=2,ensure_ascii=False)+'\n',encoding='utf-8')
    return {**report,'output_folder':str(session)}

def main():
    p=argparse.ArgumentParser(description='WORKNOVA v4d private local Part2 Kokoro synthesis')
    p.add_argument('--video',required=True,type=Path)
    p.add_argument('--model-dir',required=True,type=Path)
    p.add_argument('--output-dir',type=Path,default=ROOT/'output'/'videos')
    a=p.add_mutually_exclusive_group()
    a.add_argument('--render',action='store_true',help='Create private model-backed WAV/SRT/MP4')
    a.add_argument('--check-only',action='store_true',help='No new files (default)')
    args=p.parse_args()
    try:
        print(json.dumps(finish(args.video,args.model_dir,args.output_dir,args.render),
                         indent=2,ensure_ascii=False))
        return 0
    except (ValueError,FileNotFoundError,FileExistsError,OSError,subprocess.TimeoutExpired) as exc:
        print('WORKNOVA_OFFLINE_VOICE_STOP '+str(exc),file=sys.stderr)
        return 2

if __name__=='__main__':raise SystemExit(main())
