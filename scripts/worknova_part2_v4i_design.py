#!/usr/bin/env python3
"""WorkNova v4i: 3-stage Gift Finder editorial storyboard from real offline UI stills.

No TTS, subtitle generation, real network requests, payment, publication, or edits
of original media. v4i is a private visual-design preview pending owner approval.
"""
from __future__ import annotations
import argparse, hashlib, json, shutil, subprocess, tempfile
from pathlib import Path

SOURCE_SHA = '4dc5c379c58d0fd64ae5d8b273072638f0cf718cbd646eda0c71afbd6e61d290'
PARENT_SHA = '70525df7a240fe8d08bbb02bb4ed8feca8401f93980491b90ba9f94440659a44'
STILL_TIMES = (90.5,96.5,99.5)
SLIDE_SECONDS = 4.16
FADE_SECONDS = 0.24
CHAPTER_SECONDS = 50
FPS = 25
GIFT_START, GIFT_END = 19,31
P=(6,17,31);NAVY=(8,28,48);CYAN=(56,189,248);OFFWHITE=(237,246,252)
STAGES = (
    ('01','CONSTRAIN','A BRIEF, NOT A GUESS',
     [('CATEGORY','DESK LIGHTING'),('STYLE','PRACTICAL'),('PRICE LIMIT','$39.00')],
     'FIXED LOCAL CATALOG / SYNTHETIC INPUT'),
    ('02','MATCH','LOCAL, TRACEABLE RESULTS',
     [('CATALOG','OWNER-SUPPLIED LOCAL'),('POLICY','PREFERRED STYLE'),('PRICE LIMIT','$40.00')],
     'LOCAL ITEM / NOT VENDOR-VERIFIED'),
    ('03','REVIEW','A HUMAN DECIDES',
     [('STATUS','OWNER-LOCAL SELECTED'),('PAYMENT','NOT AUTHORIZED'),('ACTION','HUMAN REVIEW')],
     'NOT A PURCHASE OR PAYPAL TRANSACTION'),
)

def checksum(path):
    h=hashlib.sha256()
    with Path(path).open('rb') as f:
        for chunk in iter(lambda:f.read(1024*1024),b''):h.update(chunk)
    return h.hexdigest()

def preflight(source,parent,output):
    for p,expected in ((source,SOURCE_SHA),(parent,PARENT_SHA)):
        p=Path(p)
        if not p.is_file() or p.is_symlink() or checksum(p)!=expected:
            raise ValueError('UNVERIFIED_PRIVATE_SOURCE_OR_SYMLINK')
    out=Path(output)
    if out.exists() or out.is_symlink() or out.with_suffix('.json').exists():
        raise FileExistsError('OUTPUT_EXISTS__NO_OVERWRITE')
    if (GIFT_END-GIFT_START)*FPS!=300 or len(STAGES)!=3 or len(STILL_TIMES)!=3:
        raise ValueError('GIFT_STORYBOARD_CONTRACT_DRIFT')
    if SLIDE_SECONDS*3-FADE_SECONDS*2 != 12:
        raise ValueError('TRANSITIONS_CHANGE_FILM_TIMING')
    return {'status':'V4I_GIFT_FINDER_3_STAGE_PRIVATE_PREFLIGHT',
            'frames':1250,'voice_generated':False,'subtitle_generated':False,
            'source_sha256':SOURCE_SHA,'parent_sha256':PARENT_SHA,'public_release':False}

def font(size,bold=False):
    from PIL import ImageFont
    paths = (['/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf','C:/Windows/Fonts/arialbd.ttf']
             if bold else ['/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf','C:/Windows/Fonts/arial.ttf'])
    for p in paths:
        if Path(p).is_file():return ImageFont.truetype(p,size)
    raise ValueError('NO_TRUETYPE_FONT_AVAILABLE')

def make_slide(srcshot,index,dest):
    from PIL import Image,ImageDraw
    num,label,headline,details,disclosure=STAGES[index]
    im=Image.new('RGB',(1920,1080),P);d=ImageDraw.Draw(im)
    d.rectangle((0,0,1920,78),fill=NAVY)
    d.text((112,19),'WORKNOVA   /   03 DISCOVER   /   GIFT FINDER',font=font(28,True),fill=OFFWHITE)
    # Understated slate frames; the original source screenshot remains unaltered.
    d.rounded_rectangle((94,122,960,912),radius=27,fill=(10,31,52),outline=(39,111,151),width=3)
    d.rounded_rectangle((1017,105,1836,911),radius=28,fill=(15,42,65),outline=(37,125,165),width=3)
    d.rectangle((149,178,261,185),fill=CYAN)
    d.text((150,227),f'STAGE {num}  /  {label}',font=font(27,True),fill=(140,220,247))
    d.text((150,314),headline,font=font(38,True),fill=OFFWHITE)
    d.text((150,390),'GIFT FINDER',font=font(54,True),fill=OFFWHITE)
    for j,(k,v) in enumerate(details):
        y=529+j*104
        d.rounded_rectangle((146,y-11,880,y+74),radius=13,fill=(16,45,69),outline=(29,80,112),width=2)
        d.ellipse((175,y+13,188,y+26),fill=CYAN)
        d.text((217,y+4),k,font=font(22,True),fill=(153,205,226))
        d.text((485,y+1),v,font=font(26,True),fill=OFFWHITE)
    d.text((150,848),'EDITORIAL REPLAY  /  NOT A LIVE AGENT RUN',font=font(17),fill=(154,185,209))
    shot=Image.open(srcshot).convert('RGB')
    if shot.size!=(1600,900):raise ValueError('SOURCE_UI_SIZE_DRIFT')
    shot=shot.crop((240,0,792,775)).resize((590,789),Image.Resampling.LANCZOS)
    im.paste(shot,(1129,110))
    # Clip-safe HUD and a specific non-interactive documentary focus marker.
    outline=((1125,300,1730,490),(1125,500,1730,635),(1125,585,1730,876))[index]
    d.rounded_rectangle(outline,radius=9,outline=CYAN,width=4)
    d.rounded_rectangle((1140,117,1710,154),radius=8,fill=(9,36,57))
    d.text((1156,123),'ORIGINAL OFFLINE RECORDING / KEYFRAME',font=font(17,True),fill=(175,231,246))
    d.rectangle((0,945,1920,1080),fill=NAVY)
    d.rectangle((0,944,1920,947),fill=(39,101,136))
    d.rounded_rectangle((56,968,412,1051),radius=15,fill=(12,44,66),outline=(33,114,155),width=2)
    d.text((83,976),f'03   GIFT FINDER   /   {num} OF 03',font=font(21,True),fill=OFFWHITE)
    d.text((84,1018),'VISUAL GUIDE / SYNTHETIC',font=font(15),fill=(140,194,218))
    d.text((464,972),disclosure,font=font(26,True),fill=OFFWHITE)
    d.text((464,1018),'No live checkout  /  Selected demo item only',font=font(20),fill=(155,196,216))
    for j in range(3):
        x=1505+116*j
        d.rounded_rectangle((x,1033,x+97,1042),radius=4,fill=CYAN if j<=index else (39,77,100))
    im.save(dest)

def run(cmd,timeout=120):
    r=subprocess.run(cmd,capture_output=True,text=True,timeout=timeout,stdin=subprocess.DEVNULL)
    if r.returncode:raise RuntimeError('FFMPEG_FAILED '+r.stderr[-1200:])
    return r.stdout

def probe(path):
    return json.loads(run(['ffprobe','-v','error','-count_packets','-show_entries',
      'format=duration:stream=codec_type,width,height,nb_read_packets','-of','json',str(path)],timeout=20))

def check_film(path,expected_frames,expected_seconds):
    j=probe(path);v=[x for x in j['streams'] if x['codec_type']=='video']
    if len(v)!=1 or (v[0]['width'],v[0]['height'])!=(1920,1080) or int(v[0]['nb_read_packets'])!=expected_frames:
        raise ValueError('OUTPUT_VIDEO_FRAMES_INVALID')
    if abs(float(j['format']['duration'])-expected_seconds)>.09:raise ValueError('OUTPUT_DURATION_INVALID')

def render(source,parent,output):
    preflight(source,parent,output)
    if not shutil.which('ffmpeg') or not shutil.which('ffprobe'):
        raise ValueError('FFMPEG_TOOLS_REQUIRED')
    with tempfile.TemporaryDirectory(prefix='worknova-v4i-') as t:
        t=Path(t);slides=[]
        for j,sec in enumerate(STILL_TIMES):
            snap=t/f'source_{j}.png'
            run(['ffmpeg','-nostdin','-v','error','-n','-ss',str(sec),'-i',str(source),
                 '-frames:v','1',str(snap)],timeout=35)
            slide=t/f'stage_{j}.png';make_slide(snap,j,slide);slides.append(slide)
        gift=t/'gift_12s.mp4'
        args=['ffmpeg','-nostdin','-v','error','-n']
        for slide in slides:
            args.extend(['-loop','1','-framerate','25','-t',str(SLIDE_SECONDS),'-i',str(slide)])
        args.extend(['-filter_complex',
            '[0:v]format=yuv420p[v0];[1:v]format=yuv420p[v1];[2:v]format=yuv420p[v2];'
            '[v0][v1]xfade=transition=fade:duration=0.24:offset=3.92[x1];'
            '[x1][v2]xfade=transition=fade:duration=0.24:offset=7.84,format=yuv420p[v]',
            '-map','[v]','-frames:v','300','-r','25','-an','-c:v','libx264',
            '-preset','ultrafast','-crf','18',str(gift)])
        run(args,timeout=110);check_film(gift,300,12)
        stage=t/'candidate.mp4'
        filters=('[0:v]split=2[a][b];'
                 '[a]trim=start_frame=0:end_frame=475,setpts=PTS-STARTPTS,format=yuv420p[pre];'
                 '[b]trim=start_frame=775:end_frame=1250,setpts=PTS-STARTPTS,format=yuv420p[post];'
                 '[pre][1:v][post]concat=n=3:v=1:a=0,format=yuv420p[vid]')
        run(['ffmpeg','-nostdin','-v','error','-n','-i',str(parent),'-i',str(gift),
             '-filter_complex',filters,'-map','[vid]','-frames:v','1250','-r','25',
             '-an','-c:v','libx264','-preset','ultrafast','-crf','18','-movflags','+faststart',
             str(stage)],timeout=180)
        check_film(stage,1250,50)
        out=Path(output);out.parent.mkdir(parents=True,exist_ok=True)
        shutil.copyfile(stage,out)
        result={'status':'WORKNOVA_V4I_PRIVATE_VISUAL_PREVIEW__NOT_FINAL',
                'sha256':checksum(out),'bytes':out.stat().st_size,
                'frames':1250,'duration':50.0,'source_sha256':SOURCE_SHA,
                'v4h_parent_sha256':PARENT_SHA,'gift_stills_seconds':list(STILL_TIMES),
                'gift_editorial_stages':['CONSTRAIN','MATCH','REVIEW'],
                'new_voice':False,'new_subtitles':False,'published':False,'release_hold':True}
        out.with_suffix('.json').write_text(json.dumps(result,indent=2)+'\n',encoding='utf-8')
        return result

def main():
    p=argparse.ArgumentParser()
    p.add_argument('--check-plan',action='store_true')
    p.add_argument('--source',type=Path)
    p.add_argument('--v4h',type=Path)
    p.add_argument('--output',type=Path)
    a=p.parse_args()
    if a.check_plan:
        print(json.dumps({'stages':list(STAGES),'gift_seconds':[19,31],
          'frame_count':1250,'source_sha256':SOURCE_SHA,'v4h_sha256':PARENT_SHA,
          'voice_run':False,'published':False}));return
    if not (a.source and a.v4h and a.output):p.error('--source --v4h --output required')
    print(json.dumps(render(a.source,a.v4h,a.output),indent=2))
if __name__=='__main__':main()
