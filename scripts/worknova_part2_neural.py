#!/usr/bin/env python3
"""Private offline WORKNOVA Part 2 narration via owner-supplied Kokoro ONNX FP16.

All model weights and audio remain in gitignored output/. No model downloads,
network requests, PayPal/Gemini calls, audio publication or source overwrites.
Cue positions are aligned to the existing 170-second private WORKNOVA edit,
NOT to any unseen or freshly filmed owner footage.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import shutil
import sys
import uuid
from datetime import datetime, timezone
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
MAX_FILM_SECONDS=170.0
MODEL_SHA='f3a290d384fbb27966d462905c71a46cef9e5fd00516b40df32a0b4afe77ac96'
VOICE_SHA='bca610b8308e8d99f32e6fe4197e7ec01679264efed0cac9140fe9c29f1fbf7d'
CUES=(
    ('delegate',108.35,116.0,'A person delegates a specific task. Their consent expires and never authorizes payment.'),
    ('a2a',116.35,125.0,'Buyer and seller agents negotiate fictional terms. Every offer and counteroffer is recorded.'),
    ('gift',125.35,134.0,'Gift Finder compares sample or owner-provided items against the requested budget.'),
    ('churn',134.35,143.0,'Churn Saver proposes a retention offer. It cannot change an actual PayPal subscription.'),
    ('invoice',143.35,152.0,'Invoice and Dispute Copilot drafts a case from local evidence for human review.'),
)


def check_cues():
    prior=0.0
    for name,start,end,words in CUES:
        if not name or not 0<=prior<=start<end<=MAX_FILM_SECONDS or not 25<=len(words)<=120:
            raise ValueError('INVALID_PART2_CUE_SEQUENCE')
        if end-start<6.0:
            raise ValueError('PART2_CUE_TOO_SHORT')
        prior=end
    return {'status':'WORKNOVA_FIVE_AGENT_CUES_VALID','count':len(CUES),
        'film_seconds':MAX_FILM_SECONDS,'scenes':[x[0] for x in CUES],
        'provider_calls':0,'published':False}


def file_hash(path):
    h=hashlib.sha256()
    with path.open('rb') as file:
        for data in iter(lambda:file.read(1024*1024),b''):
            h.update(data)
    return h.hexdigest()


def check_model(model_dir:Path):
    model=model_dir/'kokoro-v1.0.fp16.onnx'
    voicepack=model_dir/'voices-v1.0.bin'
    if (not model.is_file() or model.is_symlink() or model.stat().st_size<150_000_000 or
        not voicepack.is_file() or voicepack.is_symlink() or voicepack.stat().st_size<10_000_000):
        raise ValueError('OWNER_LOCAL_KOKORO_MODEL_AND_VOICEPACK_REQUIRED__NO_AUTO_DOWNLOAD')
    if file_hash(model)!=MODEL_SHA or file_hash(voicepack)!=VOICE_SHA:
        raise ValueError('OWNER_KOKORO_MODEL_HASH_MISMATCH__STOP')
    return model,voicepack


def load_kokoro(model,voicepack):
    try:
        from kokoro_onnx import Kokoro,EspeakConfig
        import soundfile as sf  # noqa: F401
        import numpy as np  # noqa: F401
    except ImportError as exc:
        raise ValueError('OWNER_LOCAL_VIDEO_VENV_KOKORO_SOUNDFILE_NUMPY_REQUIRED') from exc
    espeak_config=None
    if sys.platform=='win32':
        try:
            import espeakng_loader
        except ImportError as exc:
            raise ValueError('WINDOWS_ESPEAKNG_LOADER_REQUIRED') from exc
        data=Path(espeakng_loader.__file__).resolve().parent/'espeak-ng-data'
        if not (data/'phontab').is_file():
            raise ValueError('LOCAL_ESPEAK_PHONTAB_MISSING')
        # The tokenizer's Windows C runtime needs an ASCII path. Reuse the
        # owner's existing short path from the prior successful Kokoro render.
        drive=os.environ.get('SystemDrive','C:')
        if not drive.isascii() or len(drive)!=2 or drive[1]!=':':
            raise ValueError('WINDOWS_ASCII_SYSTEM_DRIVE_REQUIRED')
        root=Path(drive+'/')/'kokoro-espeak-data'
        dest=root/'espeak-ng-data'
        if not (dest/'phontab').is_file():
            root.mkdir(parents=True,exist_ok=True)
            if dest.exists():
                raise ValueError('PARTIAL_ASCII_ESPEAK_COPY__MANUAL_REVIEW_REQUIRED')
            shutil.copytree(data,dest)
        espeak_config=EspeakConfig(data_path=str(root),
            lib_path=str(Path(espeakng_loader.get_library_path()).resolve()))
    engine=Kokoro(str(model),str(voicepack),espeak_config=espeak_config)
    if 'af_heart' not in engine.get_voices():
        raise ValueError('OWNER_APPROVED_AF_HEART_NOT_AVAILABLE')
    return engine


def render(model_dir:Path,out_dir:Path):
    check_cues()
    model,voicepack=check_model(model_dir)
    engine=load_kokoro(model,voicepack)
    import numpy as np
    import soundfile as sf
    sr=24000
    stream=np.zeros(round(MAX_FILM_SECONDS*sr),dtype=np.float32)
    cue_report=[]
    for name,start,end,words in CUES:
        samples,rate=engine.create(words,voice='af_heart',speed=0.96,lang='en-us')
        samples=np.asarray(samples,dtype=np.float32).flatten()
        duration=len(samples)/rate if rate else 0
        if rate!=sr or duration<0.8 or duration > end-start-0.30:
            raise ValueError('PART2_CUE_TIMING_NOT_SAFE__'+name+'__'+format(duration,'.2f'))
        if not np.all(np.isfinite(samples)) or np.max(np.abs(samples))>1.0:
            raise ValueError('PART2_CUE_AUDIO_INVALID__'+name)
        a=round(start*sr);b=a+len(samples)
        # Small click-free fade in/out, no speech retiming or volume boost.
        fade=min(len(samples)//6,round(.07*sr))
        if fade:
            samples[:fade]*=np.linspace(0,1,fade,dtype=np.float32)
            samples[-fade:]*=np.linspace(1,0,fade,dtype=np.float32)
        stream[a:b]=samples
        cue_report.append({'scene':name,'at_seconds':start,'spoken_seconds':round(duration,3),
                           'allocated_until_seconds':end,'text':words})
    if np.max(np.abs(stream))>0.99:
        raise ValueError('PART2_MASTER_CLIPPING_RISK')
    out_dir.mkdir(parents=True,exist_ok=True)
    stamp=datetime.now().strftime('%Y%m%d-%H%M%S')+'-'+uuid.uuid4().hex[:6]
    dest=out_dir/('worknova-part2-kokoro-af-heart-'+stamp+'.wav')
    report=dest.with_suffix('.json')
    if dest.exists() or report.exists():
        raise FileExistsError('WORKNOVA_PART2_AUDIO_WOULD_OVERWRITE')
    sf.write(str(dest),stream,sr,subtype='PCM_16')
    body={'status':'PRIVATE_WORKNOVA_PART2_KOKORO_READY__NOT_MIXED',
          'voice':'af_heart','engine':'local Kokoro ONNX FP16','audio_seconds':170.0,
          'sample_rate':sr,'cue_count':len(cue_report),'cues':cue_report,
          'sha256':file_hash(dest),'bytes':dest.stat().st_size,
          'source_model_sha256':MODEL_SHA,'source_voicepack_sha256':VOICE_SHA,
          'provider_calls':0,'payments':0,'uploaded':False,'owner_approved_for_release':False,
          'created_utc':datetime.now(timezone.utc).isoformat()}
    report.write_text(json.dumps(body,indent=2)+'\n',encoding='utf8')
    print('WORKNOVA_PRIVATE_KOKORO_PART2_READY '+str(dest),flush=True)
    print('SHA256 '+body['sha256'],flush=True)
    print('PUBLISH=NO PROVIDER_CALLS=0 RELEASE_HOLD',flush=True)
    return dest


def main():
    parser=argparse.ArgumentParser(description='Private WorkNova five-scene neural narration')
    group=parser.add_mutually_exclusive_group(required=True)
    group.add_argument('--check-cues',action='store_true',help='offline cue validation, no models required')
    group.add_argument('--check-model',action='store_true',help='validate local Kokoro model hashes, no inference')
    group.add_argument('--render',action='store_true',help='synthesize owner-local approved af_heart speech')
    parser.add_argument('--model-dir',type=Path,default=ROOT/'output'/'voice-models')
    parser.add_argument('--output-dir',type=Path,default=ROOT/'output'/'videos')
    args=parser.parse_args()
    try:
        print(json.dumps(check_cues()),flush=True)
        if args.check_model or args.render:
            check_model(args.model_dir.resolve())
            if args.check_model:
                print('OWNER_LOCAL_KOKORO_FP16_HASHES_VERIFIED NO_RENDER_NO_NETWORK',flush=True)
        if args.render:
            render(args.model_dir.resolve(),args.output_dir.resolve())
        return 0
    except (OSError,ValueError,RuntimeError,ImportError) as exc:
        print('WORKNOVA_PART2_KOKORO_STOP '+str(exc),file=sys.stderr,flush=True)
        return 2


if __name__=='__main__':
    raise SystemExit(main())