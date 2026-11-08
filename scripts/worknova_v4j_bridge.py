#!/usr/bin/env python3
"""WORKNOVA v4j: replace a long static agent bridge with five editorial feature cards.

Source: owner-supplied approved 1920x1080 Part2 bridge still from the private
WORKNOVA handoff. The five cards describe previously demonstrated OFFLINE
synthetic UI. They do NOT create fake browser clicks or call any service.

Use with an existing SHA-pinned 170s v4i private movie. Original film, approved
voice/click/music AAC, source image and source recording are never modified.
No TTS, subtitles, provider APIs, publication or data upload.
"""
from __future__ import annotations
import argparse
import hashlib
import json
from pathlib import Path
import shutil
import subprocess
import tempfile

EXPECTED_V4I='e6697900a1f93acc4860bf72c780c6674e29b1cb78ae49c1966a7749efc2af0f'
EXPECTED_BRIDGE_IMAGE='8859ff303dc44d276c6bbd05a37a3c8514476114bef755525715a2131a79ad50'
FPS=25
FILM_SECONDS=170
BRIDGE_START=94
BRIDGE_END=104
BRIDGE_SECONDS=10
STILL_FRAMES=58
FADE_FRAMES=10
STEPS=(
 ('01','DELEGATE','SCOPED CONSENT','Limited task access. Human control.','No payment authority'),
 ('02','NEGOTIATE','FICTIONAL OFFERS','Buyer and seller propose local terms.','Human review required'),
 ('03','DISCOVER','LOCAL CATALOG','Gift Finder checks sample item data.','No vendor verification'),
 ('04','RETAIN','RETENTION DRAFT','Churn Saver prepares an offer.','No subscription changes'),
 ('05','RESOLVE','EVIDENCE FIRST','Invoice and dispute draft for review.','No external submission'),
)

INK=(6,17,31)
NAVY=(10,27,49)
WHITE=(238,246,253)
CYAN=(56,189,248)
AMBER=(251,202,140)
MUTED=(158,189,216)


def checksum(path:Path):
    h=hashlib.sha256()
    with Path(path).open('rb') as f:
        for data in iter(lambda:f.read(1024*1024),b''):
            h.update(data)
    return h.hexdigest()


def check_inputs(bridge_image:Path,source_video:Path,out:Path):
    for path,expected in ((bridge_image,EXPECTED_BRIDGE_IMAGE),(source_video,EXPECTED_V4I)):
        if not path.is_file() or path.is_symlink() or checksum(path)!=expected:
            raise ValueError('SOURCE_NOT_VERIFIED_OR_SYMLINK__STOP')
    if out.exists() or out.is_symlink() or out.with_suffix('.json').exists():
        raise FileExistsError('OUTPUT_EXISTS__NO_OVERWRITE')
    if BRIDGE_END-BRIDGE_START!=BRIDGE_SECONDS or len(STEPS)!=5:
        raise ValueError('STORYBOARD_CONTRACT_DRIFT')
    if STILL_FRAMES + (len(STEPS)-1)*(STILL_FRAMES-FADE_FRAMES)!=BRIDGE_SECONDS*FPS:
        raise ValueError('ANIMATION_FRAME_MATH_DRIFT')
    return {'status':'VERIFIED_V4J_DESIGN_PREFLIGHT','frames':250,
            'parent_sha256':EXPECTED_V4I,'original_voice_unchanged':True,
            'new_voice':False,'new_subtitles':False,'public_upload':False}


def fonts():
    from PIL import ImageFont
    candidate_dirs=(Path('/usr/share/fonts/opentype/inter'),Path('C:/Windows/Fonts'),Path('/usr/share/fonts/truetype/dejavu'))
    for directory in candidate_dirs:
        if (directory/'InterDisplay-Bold.otf').is_file():
            return (ImageFont.truetype(directory/'InterDisplay-Bold.otf',47),
                    ImageFont.truetype(directory/'InterDisplay-SemiBold.otf',31),
                    ImageFont.truetype(directory/'InterDisplay-Medium.otf',25),
                    ImageFont.truetype(directory/'InterDisplay-Regular.otf',20))
        if (directory/'arialbd.ttf').is_file():
            return (ImageFont.truetype(directory/'arialbd.ttf',47),
                    ImageFont.truetype(directory/'arialbd.ttf',31),
                    ImageFont.truetype(directory/'arial.ttf',25),
                    ImageFont.truetype(directory/'arial.ttf',20))
        if (directory/'DejaVuSans-Bold.ttf').is_file():
            return (ImageFont.truetype(directory/'DejaVuSans-Bold.ttf',47),
                    ImageFont.truetype(directory/'DejaVuSans-Bold.ttf',31),
                    ImageFont.truetype(directory/'DejaVuSans.ttf',25),
                    ImageFont.truetype(directory/'DejaVuSans.ttf',20))
    raise ValueError('LOCAL_TRUETYPE_FONT_REQUIRED')


def make_card(source_image:Path,idx:int,dest:Path):
    from PIL import Image,ImageDraw
    base=Image.open(source_image).convert('RGBA')
    if base.size!=(1920,1080):raise ValueError('BRIDGE_RESOLUTION_DRIFT')
    layer=Image.new('RGBA',base.size,(0,0,0,0))
    d=ImageDraw.Draw(layer)
    # Right-hand feature card: original ring motif remains visible outside it.
    d.rounded_rectangle((1011,289,1828,784),radius=32,
                        fill=(4,20,38,226),outline=(49,146,202,215),width=3)
    d.rounded_rectangle((1052,333,1800,339),radius=3,fill=(*CYAN,235))
    title,semi,regular,small=fonts()
    no,slug,headline,sub,disclaimer=STEPS[idx]
    d.text((1056,366),f'{no} / 05',font=semi,fill=(*CYAN,255))
    d.text((1240,366),slug,font=semi,fill=(*MUTED,255))
    d.text((1055,454),headline,font=title,fill=(*WHITE,255))
    d.text((1056,535),sub,font=regular,fill=(*WHITE,255))
    d.line(((1055,617),(1778,617)),fill=(59,117,156,160),width=2)
    d.text((1056,648),'OFFLINE SYNTHETIC DEMO',font=small,fill=(*CYAN,255))
    d.text((1056,694),disclaimer,font=regular,fill=(*AMBER,255))
    # Five-step lower tracker, distinct content every ~2s (not fake playback).
    for j in range(len(STEPS)):
        x=1024+154*j
        fill=CYAN if j==idx else ((51,91,126) if j<idx else (34,59,83))
        d.rounded_rectangle((x,826,x+134,837),radius=5,fill=(*fill,255))
        d.text((x+11,856),STEPS[j][0],font=small,fill=(*(WHITE if j==idx else MUTED),255))
    # Deliberately retain the existing owner brand, date-less visual and no-payment footer.
    base=Image.alpha_composite(base,layer)
    base.convert('RGB').save(dest,optimize=False)


def run(cmd,timeout=120):
    p=subprocess.run(cmd,stdin=subprocess.DEVNULL,capture_output=True,text=True,timeout=timeout)
    if p.returncode:
        raise RuntimeError('OFFLINE_FFMPEG_STEP_FAILED '+str(p.returncode)+' '+p.stderr[-700:])
    return p.stdout


def probe(path):
    j=json.loads(run(['ffprobe','-v','error','-count_packets','-show_streams','-show_format','-of','json',str(path)],20))
    v=[x for x in j['streams'] if x['codec_type']=='video']
    a=[x for x in j['streams'] if x['codec_type']=='audio']
    if len(v)!=1 or v[0]['codec_name']!='h264' or v[0]['width']!=1920 or v[0]['height']!=1080:
        raise ValueError('VIDEO_GEOMETRY_OR_CODEC_INVALID')
    return int(v[0]['nb_read_packets']),float(j['format']['duration']),len(a)


def audio_md5(path):
    return run(['ffmpeg','-nostdin','-v','error','-i',str(path),'-map','0:a:0','-c:a','copy',
                '-f','hash','-hash','md5','-'],50).strip()


def make_bridge(image:Path,dest:Path):
    if dest.exists():raise FileExistsError('BRIDGE_WOULD_OVERWRITE')
    if checksum(image)!=EXPECTED_BRIDGE_IMAGE:raise ValueError('SOURCE_BRIDGE_SHA_MISMATCH')
    with tempfile.TemporaryDirectory(prefix='worknova-v4j-cards-') as folder:
        tmp=Path(folder)
        slides=[]
        for n in range(len(STEPS)):
            f=tmp/f'card{n}.png';make_card(image,n,f);slides.append(f)
        args=['ffmpeg','-nostdin','-hide_banner','-loglevel','error','-n']
        for f in slides:
            args.extend(['-loop','1','-framerate','25','-t','2.32','-i',str(f)])
        graph=';'.join(f'[{i}:v]format=yuv420p[v{i}]' for i in range(5))+';'
        graph+='[v0][v1]xfade=transition=fade:duration=0.40:offset=1.92[x1];'
        graph+='[x1][v2]xfade=transition=fade:duration=0.40:offset=3.84[x2];'
        graph+='[x2][v3]xfade=transition=fade:duration=0.40:offset=5.76[x3];'
        graph+='[x3][v4]xfade=transition=fade:duration=0.40:offset=7.68,format=yuv420p[vout]'
        args+=['-filter_complex',graph,'-map','[vout]','-r','25','-frames:v','250',
               '-an','-c:v','libx264','-preset','ultrafast','-crf','18',
               '-pix_fmt','yuv420p','-movflags','+faststart',str(dest)]
        run(args,150)
        if probe(dest)!=(250,10.0,0):
            dest.unlink(missing_ok=True)
            raise ValueError('BRIDGE_TIMING_OR_FRAME_COUNT_INVALID')
    return {'bridge_sha256':checksum(dest),'bytes':dest.stat().st_size,'frames':250}


def assemble(source:Path,bridge:Path,dest:Path):
    if dest.exists() or dest.is_symlink() or dest.with_suffix('.json').exists():
        raise FileExistsError('OUTPUT_EXISTS__NO_OVERWRITE')
    if not source.is_file() or source.is_symlink() or checksum(source)!=EXPECTED_V4I or probe(source)!=(4250,170.0,1):
        raise ValueError('SOURCE_V4I_SHA_OR_STREAMS_MISMATCH')
    if not bridge.is_file() or bridge.is_symlink() or probe(bridge)!=(250,10.0,0):
        raise ValueError('INVALID_10S_V4J_BRIDGE')
    old_audio=audio_md5(source)
    dest.parent.mkdir(parents=True,exist_ok=True)
    with tempfile.TemporaryDirectory(prefix='worknova-v4j-splice-') as folder:
        t=Path(folder)
        before=t/'pre.mp4';after=t/'post.mp4';lst=t/'list.txt'
        run(['ffmpeg','-nostdin','-v','error','-n','-i',str(source),'-frames:v','2350',
             '-map','0:v:0','-an','-c:v','copy',str(before)],90)
        run(['ffmpeg','-nostdin','-v','error','-n','-i',str(source),'-ss','104','-t','66',
             '-map','0:v:0','-an','-c:v','copy',str(after)],90)
        if probe(before)[0]!=2350 or probe(after)[0]!=1650:
            raise ValueError('SEGMENT_FRAMES_NOT_2350_250_1650')
        # Concat list is private, generated in our controlled temporary folder.
        # Concat demuxer requires relative files under its own directory.
        bridge_local=t/'bridge.mp4'
        shutil.copyfile(bridge,bridge_local)
        lst.write_text(''.join(f"file '{x.name}'\n" for x in (before,bridge_local,after)))
        try:
            run(['ffmpeg','-nostdin','-v','error','-n','-f','concat','-safe','0',
                 '-i',str(lst),'-i',str(source),'-map','0:v:0','-map','1:a:0',
                 '-c:v','copy','-c:a','copy','-movflags','+faststart',str(dest)],150)
            if probe(dest)!=(4250,170.0,1) or audio_md5(dest)!=old_audio:
                raise ValueError('FINAL_TIMING_OR_AUDIO_NOT_IDENTICAL')
        except Exception:
            dest.unlink(missing_ok=True)
            raise
    return {'status':'PRIVATE_V4J_VISUAL_DESIGN_REVIEW_NOT_FINAL',
            'sha256':checksum(dest),'bytes':dest.stat().st_size,
            'duration':170.0,'frames':4250,'geometry':'1920x1080',
            'source_sha256':EXPECTED_V4I,'bridge_sha256':checksum(bridge),
            'bridge_film_seconds':[94,104],
            'original_aac_packet_md5':old_audio,
            'no_new_voice':True,'no_new_subtitles':True,
            'no_provider_calls':True,'public_release':False,'release_hold':True}


def render(image:Path,source:Path,bridge_dest:Path,full_dest:Path):
    check_inputs(image,source,full_dest)
    if bridge_dest.exists() or bridge_dest.is_symlink():
        raise FileExistsError('BRIDGE_OUTPUT_EXISTS__NO_OVERWRITE')
    if not shutil.which('ffmpeg') or not shutil.which('ffprobe'):
        raise RuntimeError('OFFLINE_FFMPEG_AND_FFPROBE_REQUIRED')
    bridge_dest.parent.mkdir(parents=True,exist_ok=True)
    b=make_bridge(image,bridge_dest)
    result=assemble(source,bridge_dest,full_dest)
    result['generated_bridge']=b
    full_dest.with_suffix('.json').write_text(json.dumps(result,indent=2)+'\n',encoding='utf8')
    return result


def main():
    p=argparse.ArgumentParser(description='Private offline WorkNova v4j 10s agent bridge design')
    p.add_argument('--check-plan',action='store_true')
    p.add_argument('--brand-bridge',type=Path)
    p.add_argument('--source',type=Path)
    p.add_argument('--bridge-output',type=Path)
    p.add_argument('--full-output',type=Path)
    a=p.parse_args()
    if a.check_plan:
        print(json.dumps({'step_labels':[x[1] for x in STEPS],
          'source_sha256':EXPECTED_V4I,'bridge_image_sha256':EXPECTED_BRIDGE_IMAGE,
          'replace_seconds':[94,104],'still_frames':STILL_FRAMES,
          'fade_frames':FADE_FRAMES,'total_frames':250,
          'voice_render':False,'subtitles_render':False,'release_hold':True},indent=2))
        return 0
    if not (a.brand_bridge and a.source and a.bridge_output and a.full_output):
        p.error('--brand-bridge --source --bridge-output --full-output required')
    print(json.dumps(render(a.brand_bridge,a.source,a.bridge_output,a.full_output),indent=2))

if __name__=='__main__':main()
