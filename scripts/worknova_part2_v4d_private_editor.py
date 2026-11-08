#!/usr/bin/env python3
"""Optional private WORKNOVA Part2 v4d 50s preview, from exact hash-pinned v4c.

NO network, no PayPal/Gemini, no publication, no model weights. Uses only
supplied private v4c movie and local Pillow/FFmpeg. Creates a NEW MP4.
Video remains offline synthetic footage. The 50s extract re-encodes preview AAC,
without generating narration. Not a full 170s release or a verified transcript.
"""
from __future__ import annotations
import argparse
import hashlib
import json
import shutil
import subprocess
import tempfile
from pathlib import Path

IN_SHA = '96941f892dc91f4c7508b2d70fdec67ba93acb2738a71b997e781c6dd198d7a8'
OUT_SECONDS=170
FPS=25
SEGMENTS=(('existing-visual',0,112),('a2a-refocus',112,123),('gift-existing',123,135),
          ('churn-isolation',135,144),('invoice-editorial',144,154),('existing-visual',154,170))
BG='#06111F'; PANEL='#0A1B31'; CYAN='#38BDF8'; ICE='#A5F3FC'; LIGHT='#F8FAFC'

def sha256(path):
    h=hashlib.sha256()
    with Path(path).open('rb') as f:
        for data in iter(lambda:f.read(1024*1024),b''):h.update(data)
    return h.hexdigest()

def check_plan():
    previous=0
    for name,a,b in SEGMENTS:
        if a!=previous or b<=a:raise AssertionError('NONCONTIGUOUS_TIMELINE')
        previous=b
    if previous!=OUT_SECONDS or sum(int((b-a)*FPS) for _,a,b in SEGMENTS)!=4250:
        raise AssertionError('INVALID_170S_25FPS_TIMELINE')
    return {'type':'PRIVATE_PART2_VISUAL_EDITOR','input_sha256':IN_SHA,
            'segments':[{'name':n,'film_in':a,'film_out':b,'frames':(b-a)*FPS} for n,a,b in SEGMENTS],
            'preview_film_start':104,'preview_film_end':154,
            'target_preview_frames':1250,'speech_generated':False,'published':False}

def text_assets(directory):
    # Optional Pillow is not needed for --check-plan.
    from PIL import Image,ImageDraw,ImageFont
    directory=Path(directory)
    font_candidates=(
        ('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',
         '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf'),
        ('C:/Windows/Fonts/arial.ttf','C:/Windows/Fonts/arialbd.ttf'),
    )
    fonts=next(((Path(reg),Path(bold)) for reg,bold in font_candidates
                if Path(reg).is_file() and Path(bold).is_file()),None)
    if fonts is None:raise ValueError('LOCAL_TRUETYPE_FONT_REQUIRED__NO_FONT_DOWNLOAD')
    def ff(sz,bold=False):return ImageFont.truetype(str(fonts[1] if bold else fonts[0]),sz)
    def rr(d,rect,fill,stroke=None,rad=26,width=1):
        d.rounded_rectangle(rect,radius=rad,fill=fill,outline=stroke,width=width)
    def label(d,pos,s,sz=28,color=LIGHT,bold=False):d.text(pos,s,font=ff(sz,bold),fill=color)
    # A2A overlay stays entirely in the unused right-hand UI whitespace.
    a=Image.new('RGBA',(1920,1080),(0,0,0,0));da=ImageDraw.Draw(a)
    rr(da,(850,235,1485,805),(6,17,31,244),(56,189,248,160),30,3)
    da.rectangle((892,285,982,293),fill=CYAN)
    label(da,(890,320),'AGENT NEGOTIATION TRACE',24,ICE,True)
    label(da,(890,374),'Buyer  /  Seller',40,LIGHT,True)
    for i,(l,v) in enumerate([('SELLER OFFER','$345'),('BUYER COUNTER','$290'),
                               ('SELLER COUNTER','$299'),('BUYER ACCEPT','$299')]):
        y=460+63*i
        label(da,(892,y),l,23,'#CDD7E4')
        label(da,(1320,y-3),v,28,ICE,True)
    da.line((892,723,1440,723),fill=(105,134,162,160),width=2)
    label(da,(891,751),'Offline agreement  |  NOT PAID',20,'#B7C8DA')
    outa=directory/'v4d_a2a_overlay.png';a.save(outa)
    # Invoice overlay covers only empty background to the right of product form.
    b=Image.new('RGBA',(1920,1080),(0,0,0,0));db=ImageDraw.Draw(b)
    rr(db,(850,235,1485,803),(6,17,31,244),(56,189,248,160),30,3)
    db.rectangle((893,286,982,294),fill=CYAN)
    label(db,(892,320),'INVOICE / DISPUTE COPILOT',24,ICE,True)
    label(db,(892,375),'Human review first',38,LIGHT,True)
    for i,(num,line) in enumerate([('01','Prepare a local draft'),('02','Organize case evidence'),
                                   ('03','Review before action')]):
        y=468+72*i
        label(db,(895,y),num,27,CYAN,True)
        label(db,(951,y+2),line,24,LIGHT)
    db.line((893,713,1437,713),fill=(105,134,162,160),width=2)
    label(db,(891,744),'No live invoice or dispute submitted',19,'#B7C8DA')
    outb=directory/'v4d_invoice_overlay.png';b.save(outb)
    # Churn replaces a misleading mixed Gift+Churn split-screen with a truthful
    # reframe of Churn's right-hand UI only; window border/left editorial panel.
    c=Image.new('RGB',(1920,1080),BG);dc=ImageDraw.Draw(c)
    dc.rectangle((0,0,1920,76),fill=PANEL)
    label(dc,(125,18),'WORKNOVA   /   04  /  RETAIN   /   CHURN SAVER',28,LIGHT,True)
    dc.rectangle((0,946,1920,1080),fill=PANEL)
    label(dc,(126,982),'OFFLINE FICTIONAL PROPOSAL  /  NO PAYPAL SUBSCRIPTION CHANGE',21,'#B6C8D9')
    rr(dc,(100,160,872,860),(10,27,49),(49,105,145),32,3)
    dc.rectangle((149,216,233,223),fill=CYAN)
    label(dc,(150,269),'RETENTION INTELLIGENCE',24,ICE,True)
    label(dc,(150,341),'CHURN SAVER',58,LIGHT,True)
    label(dc,(150,438),'A reviewable offer,',34,LIGHT)
    label(dc,(150,484),'not an automatic charge.',32,LIGHT)
    for i,s in enumerate(['Fictional 20% policy ceiling','Draft-only recommendation','Human review before action']):
        y=587+69*i
        dc.ellipse((150,y+8,165,y+23),fill=CYAN)
        label(dc,(185,y),s,25,'#CEDFED')
    # Border around authentic dynamic footage overlaid at x=915, y=93; crop of
    # the right UI only (source coordinates 660..1394 x 76..853).
    rr(dc,(909,88,1755,956),(15,43,68),CYAN,23,3)
    outc=directory/'v4d_churn_bg.png';c.save(outc)
    return outa,outb,outc

def do_render_part2(source,output,workdir):
    """Render just the affected 50s at full 1080p if whole-film render is costly."""
    source=Path(source);output=Path(output)
    if not source.is_file() or source.is_symlink():raise ValueError('PRIVATE_V4C_SOURCE_REQUIRED')
    if sha256(source)!=IN_SHA:raise ValueError('V4C_HASH_MISMATCH__DO_NOT_EDIT_DIFFERENT_CUT')
    if output.exists() or source.resolve()==output.resolve():raise FileExistsError('EXISTING_OUTPUT_NO_OVERWRITE')
    for bin in ['ffmpeg','ffprobe']:
        if not shutil.which(bin):raise ValueError(bin.upper()+'_REQUIRED')
    d=Path(workdir);d.mkdir(parents=True,exist_ok=True)
    a2a,invoice,churn=text_assets(d)
    # -ss before input: local chapter timestamps begin at 0 = original 104s.
    # Output 50 sec: Delegate 8, A2A 11, Gift 12, Churn 9, Invoice 10.
    flt=(
      '[0:v]split=5[p0][p1][p2][p3][p4];'
      '[p0]trim=start_frame=0:end_frame=200,setpts=N/(25*TB),format=yuv420p[v0];'
      '[p1]trim=start_frame=225:end_frame=375,setpts=(PTS-STARTPTS)*11/6,'
          'fps=25,tpad=stop_mode=clone:stop_duration=1,trim=end_frame=275,'
          'setpts=N/(25*TB),format=yuv420p[a2base];'
      '[a2base][1:v]overlay=shortest=1:format=auto,format=yuv420p[v1];'
      '[p2]trim=start_frame=475:end_frame=775,setpts=N/(25*TB),format=yuv420p[v2];'
      '[p3]trim=start_frame=775:end_frame=1000,setpts=N/(25*TB),'
            'crop=735:775:660:76,scale=820:864:flags=lanczos,format=yuv420p[churnui];'
      '[3:v][churnui]overlay=x=922:y=91:shortest=1:format=auto,format=yuv420p[v3];'
      '[p4]trim=start_frame=1000:end_frame=1250,setpts=N/(25*TB),format=yuv420p[i0];'
      '[i0][2:v]overlay=shortest=1:format=auto,format=yuv420p[v4];'
      '[v0][v1][v2][v3][v4]concat=n=5:v=1:a=0,format=yuv420p[outv]'
    )
    cmd=['ffmpeg','-nostdin','-hide_banner','-loglevel','error','-y',
         '-ss','104','-t','50','-i',str(source),
         '-loop','1','-framerate','25','-i',str(a2a),
         '-loop','1','-framerate','25','-i',str(invoice),
         '-loop','1','-framerate','25','-i',str(churn),
         '-filter_complex',flt,'-map','[outv]','-map','0:a:0',
         '-frames:v','1250','-t','50','-c:v','libx264','-preset','ultrafast','-crf','21',
         '-pix_fmt','yuv420p','-r','25','-c:a','aac','-b:a','192k',
         '-movflags','+faststart',str(output)]
    try:
        subprocess.run(cmd,check=True,timeout=170)
        data=json.loads(subprocess.check_output(['ffprobe','-v','error','-show_format','-show_streams','-count_frames','-of','json',str(output)],timeout=60))
        duration=float(data['format']['duration'])
        frames=[int(x['nb_read_frames']) for x in data['streams'] if x['codec_type']=='video']
        if len(frames)!=1 or frames[0]!=1250 or abs(duration-50)>0.1:raise ValueError('PART2_PREVIEW_NOT_50S_1250_FRAMES')
        return {'file':str(output),'seconds':duration,'frames':frames[0],
                'sha256':sha256(output),'bytes':output.stat().st_size,
                'parent_v4c_sha256':IN_SHA,'note':'ONLY FILM 104-154s. NOT A FULL 170s V4D MASTER.',
                'narration_generated':False,'provider_calls':0,'public_release':False,
                'release_hold':True,'status':'PRIVATE_PART2_50S_VISUAL_PREVIEW'}
    except Exception:
        if output.is_file():output.unlink()
        raise

def main():
    ap=argparse.ArgumentParser()
    ap.add_argument('--check-plan',action='store_true')
    ap.add_argument('--source',type=Path)
    ap.add_argument('--output',type=Path)
    a=ap.parse_args()
    report=check_plan()
    if a.check_plan:
        print(json.dumps(report,indent=2));return
    if not a.source or not a.output:ap.error('--source and --output required')
    with tempfile.TemporaryDirectory(prefix='worknova-v4d-editor-') as wd:
        print(json.dumps(do_render_part2(a.source,a.output,wd),indent=2))
if __name__=='__main__':main()
