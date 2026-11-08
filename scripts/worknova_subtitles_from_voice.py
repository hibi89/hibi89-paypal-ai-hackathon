#!/usr/bin/env python3
"""Generate a private bilingual scene-level SRT from actual Kokoro render timings.

Input must be the SHA-matched 170s mono PCM WAV + its verified-source report
written by scripts/worknova_part2_neural.py. Output is cue-level, NOT word-level
alignment or independently attested model inference. Never publishes anything.
"""
from __future__ import annotations
import argparse
import hashlib
import json
import sys
import wave
from pathlib import Path

PLAN_ID='worknova-v4b-part2-20261108'
REFERENCE_SHA='abe1b4094f0d11b526a5c467a1b79939c18a45c9f6adab4524ac66d8337c2494'
MODEL_SHA='f3a290d384fbb27966d462905c71a46cef9e5fd00516b40df32a0b4afe77ac96'
VOICE_SHA='bca610b8308e8d99f32e6fe4197e7ec01679264efed0cac9140fe9c29f1fbf7d'
SCENES=(
 ('delegate',104.4,111.6,'Delegate a limited task with consent and an expiry. No payment authority is granted.',
  '만료 시간이 있는 제한된 작업을 위임합니다. 결제 권한은 부여되지 않습니다.'),
 ('a2a',112.45,122.5,'Buyer and seller agents exchange fictional offers, counteroffers and terms. Human review stays in control.',
  '구매자와 판매자 에이전트가 가상 제안과 역제안을 교환합니다. 사람의 검토가 최종 통제합니다.'),
 ('gift',123.45,134.5,'Gift Finder checks a sample catalog against the budget and constraints. Recommendations remain local demonstrations.',
  '기프트 파인더가 샘플 목록과 예산·조건을 비교합니다. 추천은 로컬 시연입니다.'),
 ('churn',135.35,143.5,'Churn Saver drafts a retention offer for review. No live PayPal subscription is changed.',
  '이탈 방지 에이전트가 검토할 유지 제안을 작성합니다. 실제 PayPal 구독은 변경되지 않습니다.'),
 ('invoice',144.45,153.5,'Invoice and Dispute Copilot organizes local evidence into a draft. A person reviews before any action.',
  '인보이스·분쟁 코파일럿이 로컬 증거로 초안을 만들고, 실행 전 사람이 검토합니다.'),
)

def checksum(p):
    h=hashlib.sha256()
    with p.open('rb') as f:
        for chunk in iter(lambda:f.read(1024*1024),b''):h.update(chunk)
    return h.hexdigest()

def clock(sec):
    ms=round(sec*1000)
    h,ms=divmod(ms,3600000);m,ms=divmod(ms,60000);s,ms=divmod(ms,1000)
    return f'{h:02d}:{m:02d}:{s:02d},{ms:03d}'

def verify(wav,report):
    if not wav.is_file() or wav.is_symlink() or not report.is_file() or report.is_symlink():
        raise ValueError('ACTUAL_WAV_AND_MANIFEST_REQUIRED')
    body=json.loads(report.read_text(encoding='utf8'))
    needed={'status':'PRIVATE_WORKNOVA_PART2_KOKORO_READY__NOT_MIXED',
            'voice':'af_heart','engine':'local Kokoro ONNX FP16',
            'cue_plan_id':PLAN_ID,'reference_cut_sha256':REFERENCE_SHA,
            'sample_rate':24000,'audio_seconds':170.0,'cue_count':5,
            'source_model_sha256':MODEL_SHA,'source_voicepack_sha256':VOICE_SHA,
            'provider_calls':0,'payments':0,'uploaded':False,
            'owner_approved_for_release':False}
    if any(body.get(k)!=v for k,v in needed.items()):
        raise ValueError('KOKORO_REPORT_PINNED_METADATA_MISMATCH')
    if checksum(wav)!=body.get('sha256'):
        raise ValueError('WAV_SHA256_MISMATCH')
    with wave.open(str(wav),'rb') as wf:
        if (wf.getnchannels()!=1 or wf.getsampwidth()!=2 or
            wf.getframerate()!=24000 or wf.getnframes()!=170*24000):
            raise ValueError('WAV_NOT_170S_24K_MONO_PCM16')
    cues=body.get('cues')
    if not isinstance(cues,list) or len(cues)!=5:
        raise ValueError('FIVE_VOICE_SCENES_REQUIRED')
    output=[]
    for i,((name,start,allocated,english,korean),cue) in enumerate(zip(SCENES,cues),1):
        if (not isinstance(cue,dict) or cue.get('scene')!=name or cue.get('text')!=english or
            abs(float(cue.get('at_seconds',-1))-start)>0.02 or
            abs(float(cue.get('allocated_until_seconds',-1))-allocated)>0.02):
            raise ValueError('CUE_TEXT_OR_WINDOW_MISMATCH__'+name)
        dur=float(cue.get('spoken_seconds',0))
        if not 0.8<=dur<=allocated-start-0.20:
            raise ValueError('SPOKEN_DURATION_OVERFLOW__'+name)
        end=min(start+dur+0.08,allocated)
        output.append(f'{i}\n{clock(start)} --> {clock(end)}\n{english}\n{korean}')
    return '\n\n'.join(output)+'\n',{'validated_cues':5,'voice':'af_heart',
                                  'timing_source':'manifest-recorded synthesized cue lengths',
                                  'full_auditory_review':False,'word_level_alignment':False,
                                  'public_release':False}

def main():
    p=argparse.ArgumentParser(description='Manifest-derived bilingual SRT; no network or publishing')
    p.add_argument('--wav',type=Path,required=True)
    p.add_argument('--report',type=Path,help='Default: same filename .json')
    p.add_argument('--output',type=Path)
    p.add_argument('--check-only',action='store_true')
    a=p.parse_args()
    try:
        srt,summary=verify(a.wav,a.report or a.wav.with_suffix('.json'))
        if not a.check_only:
            dest=a.output or a.wav.with_suffix('.srt')
            if dest.exists() or dest.resolve()==a.wav.resolve():
                raise FileExistsError('EXISTING_SUBTITLE_NO_OVERWRITE')
            dest.parent.mkdir(parents=True,exist_ok=True)
            with dest.open('x',encoding='utf8') as f:f.write(srt)
            summary['new_srt']=str(dest)
        print(json.dumps(summary,ensure_ascii=False,indent=2))
        return 0
    except (OSError,ValueError,TypeError,KeyError,OverflowError,EOFError,json.JSONDecodeError,wave.Error) as e:
        print('WORKNOVA_PRIVATE_SUBTITLE_STOP '+str(e),file=sys.stderr)
        return 2
if __name__=='__main__':raise SystemExit(main())
