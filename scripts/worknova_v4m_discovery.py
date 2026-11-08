#!/usr/bin/env python3
"""WORKNOVA v4m: private film-only lower-third clarity pass, preserving clicks/audio.

Only frames 12:00–43:00 receive a redesigned cinematic footer. All source
UI pixels above y=989 remain visible; no click, transaction or subtitle is made.
"""
from __future__ import annotations
import argparse, hashlib, json, subprocess, tempfile
from pathlib import Path

SOURCE_SHA='6e869be80d3a63e335527b90b18bcdd24237ab660aea258067e0794423e3511c'
START, END, FPS = 12, 43, 25
STEPS = (
    (0, 6, '01 / VISION', 'A WIDER WORLD OF OPPORTUNITY'),
    (6, 12, '02 / EVIDENCE', 'OFFLINE DEMO AND PROVENANCE'),
    (12, 19, '03 / AI WORK', 'EXPLORE FICTIONAL SPECIALISTS'),
    (19, 24, '04 / GLOBAL SERVICES', 'EXPLORE A SECOND SERVICE MARKET'),
    (24, 31, '05 / QUOTE', 'HUMAN REVIEW BEFORE APPROVAL'),
)
def pick_font(bold):
    dirs=(Path('/usr/share/fonts/truetype/dejavu'),Path('C:/Windows/Fonts'))
    names=('DejaVuSans-Bold.ttf','arialbd.ttf') if bold else ('DejaVuSans.ttf','arial.ttf')
    for folder in dirs:
        for name in names:
            p=folder/name
            if p.is_file():return str(p)
    raise FileNotFoundError('FONT_MISSING')
FONT=pick_font(False)
BOLD=pick_font(True)

def digest(path):
    h=hashlib.sha256()
    with Path(path).open('rb') as f:
        for chunk in iter(lambda:f.read(1024*1024),b''): h.update(chunk)
    return h.hexdigest()

def run(*args,timeout=240):
    p=subprocess.run(args,stdin=subprocess.DEVNULL,text=True,capture_output=True,timeout=timeout)
    if p.returncode:raise RuntimeError('FFMPEG_FAILED '+p.stderr[-1200:])
    return p.stdout

def probe(path):
    data=json.loads(run('ffprobe','-v','error','-count_packets','-show_streams','-show_format','-of','json',str(path),timeout=30))
    vid=[x for x in data['streams'] if x['codec_type']=='video']
    aud=[x for x in data['streams'] if x['codec_type']=='audio']
    if len(vid)!=1 or vid[0]['codec_name']!='h264' or (vid[0]['width'],vid[0]['height'])!=(1920,1080):raise ValueError('INVALID_1080P_VIDEO')
    return int(vid[0]['nb_read_packets']),round(float(data['format']['duration']),3),len(aud)

def audio_md5(path):
    return run('ffmpeg','-nostdin','-v','error','-i',str(path),'-map','0:a:0','-c:a','copy','-f','hash','-hash','md5','-',timeout=60).strip()

def preflight(source,chapter,out):
    if (END-START)*FPS!=775 or len(STEPS)!=5 or STEPS[0][0]!=0 or STEPS[-1][1]!=31:
        raise ValueError('TIMELINE_DRIFT')
    if any(STEPS[i][1]!=STEPS[i+1][0] for i in range(4)):
        raise ValueError('STAGE_GAP')
    if not source.is_file() or source.is_symlink() or digest(source)!=SOURCE_SHA:
        raise ValueError('UNAPPROVED_SOURCE_SHA_OR_SYMLINK')
    if probe(source)!=(4250,170.0,1):raise ValueError('PARENT_STREAM_MISMATCH')
    if out.resolve()==chapter.resolve():raise ValueError('OUTPUT_COLLISION')
    if any(p.exists() or p.is_symlink() for p in (chapter,out,out.with_suffix('.json'))):
        raise FileExistsError('NO_ORIGINAL_OVERWRITE')
    if not all(Path(p).is_file() for p in (FONT,BOLD)):raise FileNotFoundError('FONT_MISSING')
    return {'source_sha256':SOURCE_SHA,'edited_seconds':[START,END],'edited_frames':775,'voice_changed':False,'srt_created':False,'external_calls':0,'release_hold':True}

def esc(s):
    return s.replace('\\','\\\\').replace(':','\\:').replace("'","\\'").replace('%','\\%')

def render_chapter(source,chapter):
    f=[
        'drawbox=x=0:y=988:w=1920:h=92:color=0x061827@1:t=fill',
        'drawbox=x=0:y=988:w=1920:h=3:color=0x39bdf5@1:t=fill',
        f"drawtext=fontfile={esc(BOLD)}:text='WORKNOVA  /  PART 1  /  DISCOVER':fontcolor=0x75d9ff:fontsize=18:x=128:y=1001",
        f"drawtext=fontfile={esc(FONT)}:text='SYNTHETIC  /  NO PAYMENTS':fontcolor=0x8dabc3:fontsize=17:x=128:y=1047",
    ]
    for i,(a,b,head,detail) in enumerate(STEPS):
        gate=f"between(t\\,{a}\\,{b-0.001})"
        f.append(f"drawtext=fontfile={esc(BOLD)}:text='{esc(head)}':fontcolor=white:fontsize=28:x=545:y=1007:enable='{gate}'")
        f.append(f"drawtext=fontfile={esc(FONT)}:text='{esc(detail)}':fontcolor=0xcbdff0:fontsize=20:x=545:y=1047:enable='{gate}'")
        f.append(f"drawbox=x={1545+i*59}:y=1022:w=47:h=8:color=0x38bdf8:t=fill:enable='{gate}'")
    # Exact existing 31s live motion and cursor are retained outside the newly drawn footer.
    run('ffmpeg','-nostdin','-hide_banner','-v','error','-n','-ss',str(START),'-i',str(source),
        '-an','-vf',','.join(f),'-frames:v','775','-r',str(FPS),'-c:v','libx264',
        '-preset','veryfast','-crf','18','-pix_fmt','yuv420p',str(chapter),timeout=300)
    if probe(chapter)!=(775,31.0,0):raise ValueError('CHAPTER_COUNT_DRIFT')

def assemble(source,chapter,out):
    orig_audio=audio_md5(source)
    with tempfile.TemporaryDirectory(prefix='worknova-v4m-') as tmp:
        t=Path(tmp)
        before=t/'before.mp4';after=t/'after.mp4';cuts=t/'cuts.txt'
        run('ffmpeg','-nostdin','-v','error','-n','-i',str(source),'-frames:v',str(START*FPS),'-map','0:v:0','-an','-c:v','copy',str(before),timeout=100)
        run('ffmpeg','-nostdin','-v','error','-n','-i',str(source),'-ss',str(END),'-t',str(170-END),'-map','0:v:0','-an','-c:v','copy',str(after),timeout=100)
        if probe(before)[0]!=300 or probe(after)[0]!=3175:raise ValueError('OUTSIDE_FRAME_COUNT_DRIFT')
        cuts.write_text("file 'before.mp4'\nfile 'middle.mp4'\nfile 'after.mp4'\n")
        (t/'middle.mp4').write_bytes(chapter.read_bytes())
        try:
            run('ffmpeg','-nostdin','-v','error','-n','-f','concat','-safe','0','-i',str(cuts),'-i',str(source),
                '-map','0:v:0','-map','1:a:0','-c:v','copy','-c:a','copy','-movflags','+faststart',str(out),timeout=180)
            if probe(out)!=(4250,170.0,1) or audio_md5(out)!=orig_audio:raise ValueError('FINAL_STREAM_DRIFT')
        except Exception:
            out.unlink(missing_ok=True)
            raise
    return {'status':'PRIVATE_VISUAL_REVIEW_CANDIDATE_NOT_OWNER_APPROVED','full_sha256':digest(out),
            'full_bytes':out.stat().st_size,'chapter_sha256':digest(chapter),'frames':4250,'seconds':170.0,
            'audio_md5':orig_audio,'edited_seconds':[12,43], 'source_sha256':SOURCE_SHA,
            'voice_rendered':False,'srt_created':False,'live_provider_calls':0,'release_hold':True}

def main():
    p=argparse.ArgumentParser()
    p.add_argument('--source',required=True,type=Path)
    p.add_argument('--chapter',required=True,type=Path)
    p.add_argument('--output',required=True,type=Path)
    p.add_argument('--check-only',action='store_true')
    a=p.parse_args()
    info=preflight(a.source,a.chapter,a.output)
    if not a.check_only:
        a.chapter.parent.mkdir(parents=True,exist_ok=True)
        a.output.parent.mkdir(parents=True,exist_ok=True)
        render_chapter(a.source,a.chapter)
        info=assemble(a.source,a.chapter,a.output)
        a.output.with_suffix('.json').write_text(json.dumps(info,indent=2)+'\n')
    print(json.dumps(info,indent=2))
if __name__=='__main__':main()
