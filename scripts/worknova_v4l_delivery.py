#!/usr/bin/env python3
"""WORKNOVA v4l private visual delivery chapter. No TTS/payment/API/overwrite.

Reframes 5 verified frames from owner-provided offline WorkNova source, film
75–94s only. A storyboard/keyframe montage, NOT newly recorded clicks.
"""
from __future__ import annotations
import argparse, hashlib, json, shutil, subprocess, tempfile
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

SOURCE_SHA='22a3fea00b7bde0e6f677c08e78107dab596c08f443c77c32fbed412b02e76a8'
AUTO_SHA='4dc5c379c58d0fd64ae5d8b273072638f0cf718cbd646eda0c71afbd6e61d290'
FILM_START=75
FILM_END=94
FPS=25
STILL_FRAMES=99
FADE_FRAMES=5
STEPS=(
  ('01','CONTRACT CREATED','Quote v2  /  $15.00 USD','Synthetic contract starts PENDING','Local contract only; no captured payment','v4k',76),
  ('02','EVIDENCE SUBMITTED','Owner uploads mock deliverables','Milestone moves to SUBMITTED','Reviewer decision remains separate','v4k',79),
  ('03','REVIEWER REJECTS','Missing requested synthetic assets','Local reviewer marks REJECTED','Revision required; not a payment dispute','v4k',83),
  ('04','OWNER RESUBMITS','Revised synthetic deliverables, v2','Rejected state returns to SUBMITTED','Prior review is not silently reused','v4k',89),
  ('05','REVIEWER ACCEPTS','Local audit event #5 / ACCEPTED','Five-state audit trace retained','ACCEPTED is not PayPal capture','auto',58.5),
)

def sha(p):
 h=hashlib.sha256()
 with Path(p).open('rb') as f:
  for c in iter(lambda:f.read(1024*1024),b''):h.update(c)
 return h.hexdigest()

def run(cmd,timeout=180):
 p=subprocess.run(cmd,stdin=subprocess.DEVNULL,capture_output=True,text=True,timeout=timeout)
 if p.returncode:raise RuntimeError('FFMPEG_FAILED '+p.stderr[-600:])
 return p.stdout

def preflight(source,auto,output,chapter):
 if FILM_END-FILM_START!=19 or len(STEPS)!=5 or len(STEPS)*STILL_FRAMES-(len(STEPS)-1)*FADE_FRAMES!=475:
  raise ValueError('TIMELINE_DRIFT')
 for p,expected in ((source,SOURCE_SHA),(auto,AUTO_SHA)):
  p=Path(p)
  if not p.is_file() or p.is_symlink() or sha(p)!=expected:
   raise ValueError('SOURCE_SHA_OR_SYMLINK_MISMATCH')
 for p in (output,chapter):
  p=Path(p)
  if p.exists() or p.is_symlink() or p.with_suffix('.json').exists():
   raise FileExistsError('OUTPUT_EXISTS_NO_OVERWRITE')
 if Path(output).resolve()==Path(chapter).resolve():raise ValueError('OUTPUT_COLLISION')
 return {'status':'VERIFIED_OFFLINE_STORYBOARD_PREFLIGHT','frames':475,'seconds':[75,94],'new_voice':False,'new_subtitles':False,'external_calls':0,'publish':False}

def font(size,bold=False):
 dirs=[Path('/usr/share/fonts/truetype/dejavu'),Path('C:/Windows/Fonts')]
 names=['DejaVuSans-Bold.ttf','arialbd.ttf'] if bold else ['DejaVuSans.ttf','arial.ttf']
 for d in dirs:
  for name in names:
   if (d/name).is_file():return ImageFont.truetype(str(d/name),size)
 raise FileNotFoundError('FONT_NOT_AVAILABLE')

def screenshot(film,auto,stage,temp):
 _,_,_,_,_,name,t=stage
 src=film if name=='v4k' else auto
 # Accurate short decode from nearby seek; avoid a full 170s repeat for each frame.
 lead=max(0,float(t)-2)
 dst=temp/f'source_{stage[0]}.png'
 run(['ffmpeg','-nostdin','-hide_banner','-loglevel','error','-n',
      '-ss',format(lead,'.2f'),'-i',str(src),'-ss','2', '-frames:v','1',str(dst)],45)
 im=Image.open(dst).convert('RGB')
 if name=='v4k':
  if im.size!=(1920,1080):raise ValueError('FILM_FRAME_SIZE_MISMATCH')
  # Source's middle white UI, without original top/bottom editorial banners.
  bounds={76:(320,85,1370,700),79:(320,85,1370,700),83:(310,90,1380,540),89:(310,85,1380,570)}
  im=im.crop(bounds[t])
 else:
  if im.size!=(1600,900):raise ValueError('AUTO_FRAME_SIZE_MISMATCH')
  # #1..#5 local SQLite audit + ACCEPTED and NOT_CAPTURED readback.
  im=im.crop((190,5,1410,390))
 return im

def card(stage,img,dst):
 no,title,kicker,statement,disclosure,_,_=stage
 W,H=1920,1080
 out=Image.new('RGB',(W,H),(6,17,31));d=ImageDraw.Draw(out)
 for y in range(0,H):
  z=y/H
  d.line((0,y,W,y),fill=(int(6+4*z),int(17+15*z),int(31+23*z)))
 d.rounded_rectangle((62,65,1858,1016),radius=35,outline=(40,104,147),width=3,fill=(9,27,46))
 d.text((105,94),'WORKNOVA',font=font(42,True),fill=(234,246,255))
 d.text((1500,115),'PART 1 / DELIVERY',font=font(24),fill=(145,191,222))
 d.line((105,166,1815,166),fill=(56,189,248),width=3)
 d.text((105,228),f'{no} / 05',font=font(36,True),fill=(56,189,248))
 d.text((105,294),title,font=font(38,True),fill=(240,248,255))
 d.rounded_rectangle((105,370,590,438),radius=15,fill=(23,63,94),outline=(53,152,201),width=2)
 d.text((121,387),kicker,font=font(24,True),fill=(242,247,253))
 def wrapped(text,x,y,maxwidth,lineheight=43,col=(210,228,242),size=25):
  words=text.split();lines=[];line=''
  for word in words:
   cur=(line+' '+word).strip()
   if d.textlength(cur,font=font(size))>maxwidth and line:
    lines.append(line);line=word
   else:line=cur
  if line:lines.append(line)
  for i,l in enumerate(lines):d.text((x,y+i*lineheight),l,font=font(size),fill=col)
  return y+len(lines)*lineheight
 yy=wrapped(statement,109,484,480)
 yy=wrapped(disclosure,109,yy+47,480,col=(250,204,148),size=24)
 d.rounded_rectangle((101,755,585,839),radius=18,fill=(13,41,60),outline=(54,144,191),width=2)
 d.text((124,770),'PAYMENT',font=font(18,True),fill=(152,190,216))
 d.text((124,801),'NOT_CAPTURED',font=font(25,True),fill=(249,208,160))
 # Original recorded UI screenshot, no reenactment.
 d.rounded_rectangle((643,209,1820,875),radius=24,fill=(17,45,68),outline=(54,148,204),width=3)
 d.text((679,229),'RECORDED OFFLINE UI  /  EDITORIAL REPLAY',font=font(23,True),fill=(170,216,244))
 avail=(1111,570)
 ratio=min(avail[0]/img.width,avail[1]/img.height)
 sz=(round(img.width*ratio),round(img.height*ratio))
 scaled=img.resize(sz,Image.Resampling.LANCZOS)
 x=680+(avail[0]-sz[0])//2;y=289+(avail[1]-sz[1])//2
 out.paste(scaled,(x,y));d.rounded_rectangle((x-1,y-1,x+sz[0]+1,y+sz[1]+1),outline=(83,150,202),width=2)
 # Separate the visual storyboard from real provider/payment proof.
 d.text((105,917),'LOCAL SYNTHETIC CONTRACT  /  NO LIVE PAYPAL OR GEMINI',font=font(24),fill=(167,202,227))
 for i in range(5):
  x=113+339*i
  fill=(56,189,248) if i==int(no)-1 else (36,73,104)
  d.rounded_rectangle((x,973,x+315,986),radius=5,fill=fill)
 out.save(dst,optimize=False)

def probe(path):
 j=json.loads(run(['ffprobe','-v','error','-count_packets','-show_streams','-show_format','-of','json',str(path)],30))
 v=[s for s in j['streams'] if s['codec_type']=='video']
 a=[s for s in j['streams'] if s['codec_type']=='audio']
 if len(v)!=1 or v[0]['codec_name']!='h264' or (v[0]['width'],v[0]['height'])!=(1920,1080):raise ValueError('INVALID_VIDEO')
 return int(v[0]['nb_read_packets']),float(j['format']['duration']),len(a)

def audio_md5(path):
 return run(['ffmpeg','-nostdin','-v','error','-i',str(path),'-map','0:a:0','-c:a','copy','-f','hash','-hash','md5','-']).strip()

def make_chapter(source,auto,dest):
 with tempfile.TemporaryDirectory(prefix='worknova-v4l-frames-') as tmp:
  root=Path(tmp);imgs=[]
  for s in STEPS:
   p=root/f"slide_{s[0]}.png";card(s,screenshot(source,auto,s,root),p);imgs.append(p)
  args=['ffmpeg','-nostdin','-v','error','-n']
  for p in imgs:args+=['-loop','1','-framerate','25','-t','3.96','-i',str(p)]
  graph=';'.join(f'[{i}:v]format=yuv420p[v{i}]' for i in range(5))+';'
  graph+='[v0][v1]xfade=transition=fade:duration=0.20:offset=3.76[x1];'
  graph+='[x1][v2]xfade=transition=fade:duration=0.20:offset=7.52[x2];'
  graph+='[x2][v3]xfade=transition=fade:duration=0.20:offset=11.28[x3];'
  graph+='[x3][v4]xfade=transition=fade:duration=0.20:offset=15.04,format=yuv420p[out]'
  args+=['-filter_complex',graph,'-map','[out]','-r','25','-frames:v','475',
        '-c:v','libx264','-preset','ultrafast','-crf','19','-pix_fmt','yuv420p','-an',str(dest)]
  run(args,200)
 if probe(dest)!=(475,19.0,0):raise ValueError('CHAPTER_FRAMES_OR_DURATION_INVALID')

def assemble(source,chapter,out):
 if probe(source)!=(4250,170.0,1) or probe(chapter)!=(475,19.0,0):raise ValueError('SOURCE_OR_CHAPTER_PROBE_MISMATCH')
 expected=audio_md5(source)
 with tempfile.TemporaryDirectory(prefix='worknova-v4l-splice-') as tmp:
  t=Path(tmp);pre=t/'before.mp4';mid=t/'middle.mp4';post=t/'after.mp4'
  run(['ffmpeg','-nostdin','-v','error','-n','-i',str(source),'-frames:v','1875',
       '-map','0:v:0','-an','-c:v','copy',str(pre)],110)
  run(['ffmpeg','-nostdin','-v','error','-n','-i',str(source),'-ss','94','-t','76',
       '-map','0:v:0','-an','-c:v','copy',str(post)],110)
  if probe(pre)[0]!=1875 or probe(post)[0]!=1900:raise ValueError('ORIGINAL_OUTSIDE_FRAMES_DRIFT')
  shutil.copyfile(chapter,mid)
  manifest=t/'cuts.txt';manifest.write_text("file 'before.mp4'\nfile 'middle.mp4'\nfile 'after.mp4'\n")
  try:
   run(['ffmpeg','-nostdin','-v','error','-n','-f','concat','-safe','0','-i',str(manifest),
        '-i',str(source),'-map','0:v:0','-map','1:a:0','-c:v','copy','-c:a','copy',
        '-movflags','+faststart',str(out)],170)
   if probe(out)!=(4250,170.0,1) or audio_md5(out)!=expected:raise ValueError('FINAL_AUDIO_VIDEO_MISMATCH')
  except Exception:
   out.unlink(missing_ok=True)
   raise
 return {'status':'PRIVATE_V4L_VISUAL_ONLY_NOT_FINAL','full_sha256':sha(out),
         'full_bytes':out.stat().st_size,'chapter_sha256':sha(chapter),
         'frames':4250,'seconds':170.0,'original_aac_md5':expected,
         'chapter_film_seconds':[75,94], 'parent_sha256':SOURCE_SHA,
         'offline_source_sha256':AUTO_SHA,'narration_created':False,
         'subtitles_created':False,'provider_calls':0,'release_hold':True,
         'owner_visual_approval':False,'offline_editorial_replay':True}

def main():
 a=argparse.ArgumentParser(description='Private, no-audio WorkNova delivery storyboard')
 a.add_argument('--source',type=Path,required=True)
 a.add_argument('--auto-source',type=Path,required=True)
 a.add_argument('--output',type=Path,required=True)
 a.add_argument('--chapter-output',type=Path,required=True)
 a.add_argument('--check-only',action='store_true')
 opts=a.parse_args()
 try:
  report=preflight(opts.source,opts.auto_source,opts.output,opts.chapter_output)
  if not opts.check_only:
   opts.output.parent.mkdir(parents=True,exist_ok=True)
   opts.chapter_output.parent.mkdir(parents=True,exist_ok=True)
   make_chapter(opts.source,opts.auto_source,opts.chapter_output)
   report=assemble(opts.source,opts.chapter_output,opts.output)
   opts.output.with_suffix('.json').write_text(json.dumps(report,indent=2)+'\n')
  print(json.dumps(report,indent=2))
 except Exception as e:
  raise SystemExit('WORKNOVA_V4L_STOP '+str(e))
if __name__=='__main__':main()
