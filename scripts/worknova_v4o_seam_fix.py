#!/usr/bin/env python3
"""Offline 170s WORKNOVA v4o: replace two one-frame black top-panel flashes.

Only two original 104-114 and 154-161 keyframe-aligned segments are reencoded.
At each segment first frame, repeat the immediately next authentic offline UI frame;
there are no invented clicks, provider calls, audio generation or subtitles.
The source and previous Library kits must remain untouched.
"""
from __future__ import annotations
import argparse
import hashlib
import json
import shutil
import subprocess
import tempfile
from pathlib import Path

EXPECTED_SOURCE='b4e2676bc8fdb12ff5b6b9378a82fe2fde7fda2def6170ee3d57c07429c2e62b'
EXPECTED_AUDIO='MD5=2959cc9c1f5ee996edaefb3b06a147ea'
FPS=25
SECONDS=170
FRAME_COUNT=4250
# Each boundary is already an IDR keyframe in v4n; avoid inaccurate GOP seeks.
REPLACEMENTS=((104,114),(154,161))
ORIGINAL_RANGES=((0,104),(114,154),(161,170))

def digest(path:Path)->str:
    h=hashlib.sha256()
    with Path(path).open('rb') as f:
        for piece in iter(lambda:f.read(1024*1024),b''):h.update(piece)
    return h.hexdigest()

def call(args,timeout=180)->str:
    p=subprocess.run(args,stdin=subprocess.DEVNULL,capture_output=True,text=True,timeout=timeout)
    if p.returncode:
        raise RuntimeError('OFFLINE_FFMPEG_FAILED '+str(p.returncode)+' '+p.stderr[-1100:])
    return p.stdout

def probe(path:Path)->tuple[int,float,int]:
    x=json.loads(call(['ffprobe','-v','error','-count_packets','-show_streams','-show_format','-of','json',str(path)],40))
    vs=[s for s in x['streams'] if s['codec_type']=='video']
    aud=[s for s in x['streams'] if s['codec_type']=='audio']
    if len(vs)!=1 or vs[0]['codec_name']!='h264' or (vs[0]['width'],vs[0]['height'])!=(1920,1080):
        raise ValueError('INVALID_VIDEO_FORMAT')
    return int(vs[0]['nb_read_packets']),round(float(x['format']['duration']),3),len(aud)

def audio_md5(path:Path)->str:
    return call(['ffmpeg','-nostdin','-v','error','-i',str(path),'-map','0:a:0','-c:a','copy','-f','hash','-hash','md5','-'],60).strip()

def ensure(source:Path,dest:Path)->dict:
    if not shutil.which('ffmpeg') or not shutil.which('ffprobe'):
        raise RuntimeError('FFMPEG_REQUIRED')
    if not source.is_file() or source.is_symlink() or digest(source)!=EXPECTED_SOURCE:
        raise ValueError('APPROVED_V4N_PARENT_SHA_REQUIRED')
    if probe(source)!=(FRAME_COUNT,float(SECONDS),1) or audio_md5(source)!=EXPECTED_AUDIO:
        raise ValueError('PARENT_STREAM_OR_AUDIO_CHANGED')
    if dest.exists() or dest.is_symlink() or dest.with_suffix('.json').exists():
        raise FileExistsError('V4O_NO_OVERWRITE')
    if source.resolve()==dest.resolve() or source.parent.resolve()==dest.resolve():
        raise ValueError('SOURCE_OUTPUT_COLLISION')
    if REPLACEMENTS!=((104,114),(154,161)) or ORIGINAL_RANGES!=((0,104),(114,154),(161,170)):
        raise ValueError('EDIT_CONTRACT_CHANGED')
    return {'parent_sha256':EXPECTED_SOURCE,'edit_seconds':[list(x) for x in REPLACEMENTS],
            'edit_frames':425,'preserved_frames':3825,'new_voice':False,
            'new_srt':False,'provider_calls':0,'release_hold':True}

def split_original(src:Path,temp:Path)->list[Path]:
    # The MP4 search index in this inherited concat does NOT support accurate
    # input seeking at 114/161s; use sequential packet copy and split at IDRs.
    call(['ffmpeg','-nostdin','-v','error','-n','-i',str(src),
          '-map','0:v:0','-an','-c:v','copy','-f','segment',
          '-segment_times','104,114,154,161','-segment_time_delta','0.015',
          '-reset_timestamps','1',str(temp/'original_%02d.mp4')],120)
    parts=[temp/f'original_{i:02}.mp4' for i in range(5)]
    if not all(x.is_file() for x in parts):
        raise ValueError('SEQUENTIAL_SPLIT_COUNT_DRIFT')
    wanted=[2600,250,1000,175,225]
    for f,frames in zip(parts,wanted):
        actual=probe(f)[0]
        if actual!=frames:raise ValueError('SPLIT_FRAME_COUNT_DRIFT_'+str(actual))
    return parts

def fix_seam(segment:Path,start:int,end:int,out:Path)->None:
    # Directly concatenate the true second source frame (once) then frames 1..N-1.
    # A concat filter rather than tpad avoids a rounding loss at 25 fps.
    n=(end-start)*FPS
    graph=('[0:v]split=2[a][b];'
           '[a]trim=start_frame=1:end_frame=2,setpts=PTS-STARTPTS[first];'
           f'[b]trim=start_frame=1:end_frame={n},setpts=PTS-STARTPTS[rest];'
           '[first][rest]concat=n=2:v=1:a=0,format=yuv420p[v]')
    args=['ffmpeg','-nostdin','-v','error','-n','-i',str(segment),
          '-an','-filter_complex',graph,'-map','[v]','-frames:v',str(n),
          '-r',str(FPS),'-c:v','libx264','-preset','veryfast','-crf','18',
          '-pix_fmt','yuv420p',str(out)]
    call(args,160)
    if probe(out)!=(n,float(end-start),0):
        raise ValueError('SINGLE_FRAME_REPLACEMENT_COUNT_DRIFT')

def packet_hashes(path:Path)->list[str]:
    x=json.loads(call(['ffprobe','-v','error','-select_streams','v:0',
            '-show_packets','-show_data_hash','sha256',
            '-show_entries','packet=data_hash','-of','json',str(path)],120))
    return [e.get('data_hash','') for e in x['packets']]

def prove_original_parity(before:Path,after:Path)->dict:
    a=packet_hashes(before);b=packet_hashes(after)
    if len(a)!=FRAME_COUNT or len(b)!=FRAME_COUNT:raise ValueError('PACKET_COUNT_CHANGED')
    segments=[(0,2600),(2850,3850),(4025,4250)]
    checked=0
    for left,right in segments:
        if a[left:right]!=b[left:right]:
            mismatch=next(i for i in range(left,right) if a[i]!=b[i])
            raise ValueError(f'OUTSIDE_EDIT_VIDEO_PACKET_MISMATCH_{mismatch}')
        checked+=right-left
    if checked!=3825:raise ValueError('OUTSIDE_EDIT_FRAME_COUNT_DRIFT')
    if a[2600:2850]==b[2600:2850] or a[3850:4025]==b[3850:4025]:
        raise ValueError('SEAM_SEGMENT_NOT_CHANGED')
    return {'outside_edit_h264_packet_sha256_equal':checked,'outside_edit_total':3825,
            'edited_video_packets':425}

def render(src:Path,out:Path)->dict:
    result=ensure(src,out)
    out.parent.mkdir(parents=True,exist_ok=True)
    with tempfile.TemporaryDirectory(prefix='worknova-v4o-') as td:
        t=Path(td)
        parts=split_original(src,t)
        fixed_one=t/'fixed_104_114.mp4'
        fixed_two=t/'fixed_154_161.mp4'
        fix_seam(parts[1],104,114,fixed_one)
        fix_seam(parts[3],154,161,fixed_two)
        parts=[parts[0],fixed_one,parts[2],fixed_two,parts[4]]
        lst=t/'concat.txt'
        lst.write_text(''.join(f"file '{p.name}'\n" for p in parts),encoding='utf8')
        try:
            call(['ffmpeg','-nostdin','-v','error','-n','-f','concat','-safe','0','-i',str(lst),
                  '-i',str(src),'-map','0:v:0','-map','1:a:0',
                  '-c:v','copy','-c:a','copy','-movflags','+faststart',str(out)],150)
            if probe(out)!=(FRAME_COUNT,float(SECONDS),1):raise ValueError('FINAL_FORMAT_DRIFT')
            if audio_md5(out)!=EXPECTED_AUDIO:raise ValueError('APPROVED_AUDIO_NOT_PRESERVED')
            result.update(prove_original_parity(src,out))
            call(['ffmpeg','-nostdin','-v','error','-i',str(out),'-f','null','-'],180)
        except Exception:
            out.unlink(missing_ok=True)
            raise
    result.update({'status':'V4O_PRIVATE_VISUAL_REVIEW_NOT_APPROVED',
                  'film_sha256':digest(out),'bytes':out.stat().st_size,
                  'duration_seconds':SECONDS,'frames':FRAME_COUNT,
                  'audio_md5':EXPECTED_AUDIO,'full_av_decode':'PASS'})
    out.with_suffix('.json').write_text(json.dumps(result,indent=2)+'\n',encoding='utf8')
    return result

def main():
    p=argparse.ArgumentParser(description='Offline WORKNOVA v4o exact-seam black-frame fix')
    p.add_argument('--check-plan',action='store_true')
    p.add_argument('--source',type=Path)
    p.add_argument('--output',type=Path)
    a=p.parse_args()
    if a.check_plan:
        print(json.dumps({'approved_source_sha256':EXPECTED_SOURCE,
             'edit_seconds':[list(i) for i in REPLACEMENTS],
             'planned_total_frames':FRAME_COUNT,'unchanged_frames':3825,
             'new_voice':False,'new_subtitles':False,'external_calls':0,
             'release_hold':True}));return
    if a.source is None or a.output is None:p.error('--source --output required')
    print(json.dumps(render(a.source,a.output),indent=2))
if __name__=='__main__':main()
