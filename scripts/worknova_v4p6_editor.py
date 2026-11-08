#!/usr/bin/env python3
"""WORKNOVA v4p6: private visual-only stabilised intro and 3x faster editorial scroll.

No new mouse events, browser calls, model inference, provider calls or publication.
Original v4o H264 packets from 22.00-170.00s and AAC from all 170s must match.
Motion between two source stills is an *editorial reconstruction*, never presented
as newly recorded human or automated scrolling.
"""
from __future__ import annotations
import argparse
import hashlib
import json
import subprocess
import tempfile
from pathlib import Path
from PIL import Image

EXPECTED_V4O='219b9e21eba9aa77b473f6cfdcc28e7f7afd36d978e7cf37d970f63094856985'
EXPECTED_BRAND_SHA='77e6ba1d4b87803d58e49ff0b0ba5ee45b5f40ac503db08e1a54a75bf25c6510'
ORIGINAL_AUDIO='MD5=2959cc9c1f5ee996edaefb3b06a147ea'
FPS=25
FRAMES=4250
CUT_SEC=22
CUT_FRAMES=CUT_SEC*FPS
SITE_CROP=(137,77,1514,799)  # actual v4o verified source UI bounds
FRAME_TIMES=(12.04,21.0)
SCROLL_START_FRAME=95
SCROLL_END_FRAME=155
SCROLL_DURATION_SECONDS=(SCROLL_END_FRAME-SCROLL_START_FRAME)/FPS  # 2.40s; formerly 7.20s
SCROLL_PIXEL_TRAVEL=910


def digest(p):
    h=hashlib.sha256()
    with Path(p).open('rb') as f:
        for chunk in iter(lambda:f.read(1024*1024),b''):
            h.update(chunk)
    return h.hexdigest()


def run(cmd,timeout=180):
    result=subprocess.run([str(x) for x in cmd],stdin=subprocess.DEVNULL,capture_output=True,text=True,timeout=timeout)
    if result.returncode:
        raise RuntimeError('FFMPEG_PROCESS_FAILED_'+result.stderr[-900:])
    return result.stdout.strip()


def ffprobe(p):
    j=json.loads(run(['ffprobe','-v','error','-count_packets','-show_streams','-show_format','-of','json',p],45))
    v=[s for s in j['streams'] if s['codec_type']=='video']
    a=[s for s in j['streams'] if s['codec_type']=='audio']
    return dict(packets=int(v[0]['nb_read_packets']),seconds=round(float(j['format']['duration']),3),audio=len(a),codec=v[0]['codec_name'],size=(v[0]['width'],v[0]['height']))


def audio_hash(p):
    return run(['ffmpeg','-nostdin','-v','error','-i',p,'-map','0:a:0','-c:a','copy','-f','hash','-hash','md5','-'],95)


def contract(src,brand,dst):
    for f in (src,brand):
        f=Path(f)
        if not f.is_file() or f.is_symlink():raise ValueError('ORIGINAL_FILE_REQUIRED')
    if digest(src)!=EXPECTED_V4O:raise ValueError('EXACT_V4O_PARENT_SHA_REQUIRED')
    if digest(brand)!=EXPECTED_BRAND_SHA:raise ValueError('PINNED_BRAND_ASSET_REQUIRED')
    with Image.open(brand) as image:
        if image.size!=(1920,1080):raise ValueError('BRAND_OPEN_DIMENSION_MISMATCH')
    if Path(dst).exists() or Path(dst).is_symlink() or Path(dst).with_suffix('.json').exists():
        raise FileExistsError('OUTPUT_OR_RECEIPT_EXISTS__DO_NOT_OVERWRITE')
    if Path(src).resolve()==Path(dst).resolve():raise ValueError('SOURCE_OUTPUT_COLLISION')
    if (ffprobe(src)!={'packets':4250,'seconds':170.0,'audio':1,'codec':'h264','size':(1920,1080)}
        or audio_hash(src)!=ORIGINAL_AUDIO):raise ValueError('ORIGINAL_STREAMS_CHANGED')
    if SITE_CROP!=(137,77,1514,799) or CUT_FRAMES!=550 or FRAME_TIMES!=(12.04,21.0):
        raise ValueError('UNREVIEWED_TIMELINE_CHANGE')
    return True


def extract_frame(f,t,out):
    run(['ffmpeg','-nostdin','-v','error','-ss',str(t),'-i',f,'-frames:v','1','-update','1',out],40)


def make_scroll_stills(src,temp):
    """Two real source views inside an expressly editorial product-tour browser.

    This is a moving montage, not a newly executed browser scroll or click.
    Crops deliberately exclude existing video caption strips and film headers.
    """
    from PIL import ImageDraw,ImageFont
    first=temp/'site_vision.png';second=temp/'site_search.png';target=temp/'match_at_22s.png'
    extract_frame(src,12.04,first)
    extract_frame(src,21.0,second)
    extract_frame(src,22.04,target)
    a=Image.open(first).convert('RGB')
    b=Image.open(second).convert('RGB')
    block_w=1320;block_h=820;gap=90
    top=a.crop((315,95,1335,729)).resize((block_w,block_h),Image.Resampling.LANCZOS)
    bottom=b.crop((315,95,1335,729)).resize((block_w,block_h),Image.Resampling.LANCZOS)
    page=Image.new('RGB',(block_w,block_h*2+gap),'#f3f6fc')
    page.paste(top,(0,0));page.paste(bottom,(0,block_h+gap))
    pd=ImageDraw.Draw(page)
    pd.line((0,block_h+gap//2,block_w,block_h+gap//2),fill='#cfdfef',width=2)
    canvas=temp/'real_offline_stills_for_editorial_scroll.png'
    page.save(canvas)

    W,H=1920,1080
    backdrop=Image.new('RGB',(W,H),'#061322')
    d=ImageDraw.Draw(backdrop)
    for yy in range(0,H,5):
        val=int(yy/H*21)
        d.rectangle((0,yy,W,yy+5),fill=(6,19+val//2,34+val))
    d.rounded_rectangle((230,155,1690,894),radius=29,fill='#0b1f35',outline='#307dac',width=3)
    d.rounded_rectangle((255,181,1665,875),radius=21,fill='#f3f6fc')
    d.rectangle((255,181,1665,230),fill='#0e2c49')
    for i,c in enumerate(('#fa8486','#ffcb60','#47dcad')):
        x=291+i*29
        d.ellipse((x,198,x+15,213),fill=c)
    def ff(size,bold=False):
        candidates=([Path('/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf'),Path('C:/Windows/Fonts/arialbd.ttf')] if bold else
                    [Path('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'),Path('C:/Windows/Fonts/arial.ttf')])
        path=next((p for p in candidates if p.is_file()),None)
        if path is None:raise FileNotFoundError('LOCAL_TRUE_TYPE_FONT_REQUIRED')
        return ImageFont.truetype(str(path),size)
    d.text((412,195),'WORKNOVA     /     LOCAL DEMO',font=ff(19,True),fill='#e3f2ff')
    d.text((1410,195),'SCROLL  ↓',font=ff(18,True),fill='#89d9ff')
    d.text((230,58),'WORKNOVA',font=ff(42,True),fill='#e2f7ff')
    d.text((540,70),'PRODUCT WALKTHROUGH   /   DISCOVER TO MATCH',font=ff(24),fill='#75ccf6')
    d.text((240,921),'RECORDED OFFLINE UI  /  EDITORIAL SCROLL RECONSTRUCTION',font=ff(23,True),fill='#9bdfff')
    d.text((240,968),'FICTIONAL SPECIALISTS      •      HUMAN APPROVAL      •      NO LIVE PAYPAL OR GEMINI',
           font=ff(19),fill='#a7bed4')
    d.line((260,1023,1660,1023),fill='#284960',width=2)
    d.rounded_rectangle((260,1018,890,1029),radius=5,fill='#43bbea')
    d.text((1491,969),'01 / DISCOVER',font=ff(18,True),fill='#8fd5fa')
    # This fill will be completely replaced by the 1320x610 moving viewport.
    backdrop_path=temp/'film_browser_frame.png'
    backdrop.save(backdrop_path)
    return canvas,backdrop_path,target


def make_opening(brand,page,base,target,out):
    # 11s stable brand + 11.6s browser editorial tour -0.6s brand fade =22s.
    # Last 0.8s of page sequence fades to EXACT original t=22.04 screenshot.
    # Precisely 60 source frames/2.4s of eased page movement, then hold.
    # Prior 180-frame motion was too slow for this 170s demo.
    scroll=(f'if(lt(n,{SCROLL_START_FRAME}),0,'
            f'if(gt(n,{SCROLL_END_FRAME}),{SCROLL_PIXEL_TRAVEL},'
            f'{SCROLL_PIXEL_TRAVEL}*(0.5-0.5*cos(PI*(n-{SCROLL_START_FRAME})/'
            f'{SCROLL_END_FRAME-SCROLL_START_FRAME}))))')
    filt=(f"[1:v]crop=1320:610:0:'{scroll}',format=rgba[scroll];"
          '[2:v]format=rgba[base];'
          '[base][scroll]overlay=300:230:shortest=1:format=auto,format=yuv420p[page];'
          '[3:v]format=yuv420p[target];'
          '[page][target]xfade=transition=fade:duration=0.8:offset=10.8,format=yuv420p[pg];'
          '[0:v]fade=t=in:st=0:d=0.65,format=yuv420p[brand];'
          '[brand][pg]xfade=transition=fade:duration=0.6:offset=10.4,format=yuv420p[out]')
    run(['ffmpeg','-nostdin','-hide_banner','-loglevel','error','-n',
         '-loop','1','-framerate','25','-t','11','-i',brand,
         '-loop','1','-framerate','25','-t','11.6','-i',page,
         '-loop','1','-framerate','25','-t','11.6','-i',base,
         '-loop','1','-framerate','25','-t','0.8','-i',target,
         '-filter_complex',filt,'-map','[out]','-frames:v','550','-r','25',
         '-c:v','libx264','-preset','veryfast','-crf','18','-pix_fmt','yuv420p',
         '-an',out],220)
    if ffprobe(out)['packets']!=CUT_FRAMES:
        raise ValueError('OPENING_NOT_550_FRAMES')


def packet_hashes(src):
    j=json.loads(run(['ffprobe','-v','error','-select_streams','v:0',
     '-show_packets','-show_data_hash','sha256',
     '-show_entries','packet=data_hash','-of','json',src],120))
    return [x.get('data_hash') for x in j['packets']]


def make(src,brand,out):
    src=Path(src);brand=Path(brand);out=Path(out)
    contract(src,brand,out)
    out.parent.mkdir(parents=True,exist_ok=True)
    with tempfile.TemporaryDirectory(prefix='worknova-v4p-') as td:
        t=Path(td)
        page,base,target=make_scroll_stills(src,t)
        opening=t/'editorial_opening_22s.mp4'
        make_opening(brand,page,base,target,opening)
        # Sequential segment split at verified v4o IDR 22s; input-seeking
        # the inherited concatenated MP4 was previously proven unsafe.
        run(['ffmpeg','-nostdin','-v','error','-n','-i',src,'-map','0:v:0','-an',
             '-c:v','copy','-f','segment','-segment_times','22',
             '-segment_time_delta','0.015','-reset_timestamps','1',t/'source_%02d.mp4'],120)
        p0=t/'source_00.mp4';p1=t/'source_01.mp4'
        if (ffprobe(p0)['packets'],ffprobe(p1)['packets'])!=(550,3700):
            raise ValueError('GOP_BOUNDARY_SPLIT_NOT_22S')
        lst=t/'chapters.txt';lst.write_text("file 'editorial_opening_22s.mp4'\nfile 'source_01.mp4'\n")
        try:
            run(['ffmpeg','-nostdin','-v','error','-n','-f','concat','-safe','0','-i',lst,
                 '-i',src,'-map','0:v:0','-map','1:a:0','-c:v','copy','-c:a','copy',
                 '-movflags','+faststart',out],180)
            if ffprobe(out)!=ffprobe(src):
                raise ValueError('FINAL_VIDEO_170S_OR_FRAMES_MISMATCH')
            if audio_hash(out)!=ORIGINAL_AUDIO:
                raise ValueError('ORIGINAL_AUDIO_BITSTREAM_CHANGED')
            orig=packet_hashes(src);new=packet_hashes(out)
            if len(orig)!=FRAMES or len(new)!=FRAMES or orig[550:]!=new[550:]:
                raise ValueError('AFTER_22S_VIDEO_PACKET_PARITY_FAILED')
            run(['ffmpeg','-nostdin','-v','error','-i',out,'-f','null','-'],180)
        except Exception:
            out.unlink(missing_ok=True)
            raise
    receipt={
       'status':'PRIVATE_V4P_STABLE_OPEN_SCROLL__VISUAL_REVIEW_REQUIRED',
       'parent_v4o_sha256':EXPECTED_V4O,'approved_brand_sha256':EXPECTED_BRAND_SHA,'new_video_sha256':digest(out),
       'new_video_bytes':out.stat().st_size,'duration_seconds':170.0,'frames':4250,
       'edited_film_seconds':[0,22],'brand_open_mode':'stable_image_fade'
       ,'editorial_browser_tour_start':10.4,'editorial_browser_tour_end':22.0,
       'page_sequence':'framed_fast_editorial_scroll_of_two_real_offline_ui_stills',
       'scroll_duration_seconds':SCROLL_DURATION_SECONDS,'scroll_faster_factor':3.0,
       'new_clicks_recorded':False,'synthetic_editorial_scroll':True,
       'h264_packets_preserved_after_22s':3700,
       'original_aac_packet_md5':ORIGINAL_AUDIO,'new_voice':False,'new_srt':False,
       'provider_calls':0,'payments':0,'public_upload':False,'release_hold':True,
       'owner_visual_approval':False}
    out.with_suffix('.json').write_text(json.dumps(receipt,ensure_ascii=False,indent=2)+'\n')
    return receipt


def main():
    p=argparse.ArgumentParser(description='Private 0-22s stable opener/scroll; no provider/voice/publication')
    p.add_argument('--source',type=Path)
    p.add_argument('--brand',type=Path)
    p.add_argument('--output',type=Path)
    p.add_argument('--check-plan',action='store_true')
    a=p.parse_args()
    if a.check_plan:
        print(json.dumps({'source_sha256':EXPECTED_V4O,'brand_sha256':EXPECTED_BRAND_SHA,'change_seconds':[0,22],
          'uncut_h264_packets':3700,'total_frames':4250,'audio_md5':ORIGINAL_AUDIO,
          'editorial_not_new_browser_scroll':True,'no_voice_no_publish':True,
          'scroll_duration_seconds':SCROLL_DURATION_SECONDS,'scroll_faster_factor':3.0}));return
    if not (a.source and a.brand and a.output):p.error('source/brand/output required')
    print(json.dumps(make(a.source,a.brand,a.output),ensure_ascii=False,indent=2))

if __name__=='__main__':main()
