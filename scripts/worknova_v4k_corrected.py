#!/usr/bin/env python3
"""Finish private v4k quote/evidence edit by fixing source's 43–45s narrative flash.

Requires exact prior 30s self-contained chapter (created from on-film authentic
frames) and SHA-pinned prior v4j. Inserts a two-second editorial recap of
previously recorded fictional matching. Copies original AAC bit-for-bit.
NO MODEL, network, browser automation, payment, production or publication.
"""
from __future__ import annotations
import argparse,hashlib,json,shutil,subprocess,tempfile
from pathlib import Path
PARENT_SHA='c0ae70b7ebf6cfee08b49f108e405631198aa1cdf0307b41a86bf116a6fc296e'
THIRTY_SHA='f6b1a264cff3f14f05c02f9cdaae1b2958e8ec49cbc186f7923937bdd1acb738'
AUDIO_MD5='MD5=2959cc9c1f5ee996edaefb3b06a147ea'
FIRST=43;LAST=75;FPS=25;INTRO_FRAMES=50;CHAPTER_FRAMES=800

def sha(p):
 h=hashlib.sha256()
 with open(p,'rb') as f:
  for data in iter(lambda:f.read(1<<20),b''):h.update(data)
 return h.hexdigest()

def run(args,timeout=120):
 x=subprocess.run(args,capture_output=True,text=True,stdin=subprocess.DEVNULL,timeout=timeout)
 if x.returncode:raise RuntimeError('OFFLINE_RENDER_FAILED '+x.stderr[-700:])
 return x.stdout.strip()

def probe(p):
 o=json.loads(run(['ffprobe','-v','error','-count_packets','-show_streams','-show_format','-of','json',str(p)],25))
 v=[s for s in o['streams'] if s['codec_type']=='video'];a=[s for s in o['streams'] if s['codec_type']=='audio']
 if len(v)!=1 or v[0]['codec_name']!='h264' or v[0]['width']!=1920 or v[0]['height']!=1080:
  raise ValueError('H264_1080P_REQUIRED')
 return int(v[0]['nb_read_packets']),round(float(o['format']['duration']),3),len(a)

def audio(p):
 return run(['ffmpeg','-nostdin','-v','error','-i',str(p),'-map','0:a:0','-c:a','copy','-f','hash','-hash','md5','-'],90)

def check(src,part,out):
 if out.exists() or out.is_symlink() or out.with_suffix('.json').exists():
  raise FileExistsError('OUTPUT_EXISTS__NO_OVERWRITE')
 for p,expected in ((src,PARENT_SHA),(part,THIRTY_SHA)):
  if not p.is_file() or p.is_symlink() or sha(p)!=expected:
   raise ValueError('UNVERIFIED_OR_SYMLINK_SOURCE__STOP')
 if probe(src)!=(4250,170.0,1) or probe(part)!=(750,30.0,0) or audio(src)!=AUDIO_MD5:
  raise ValueError('SOURCE_TIMELINE_OR_AAC_INVALID')
 if (FIRST,FIRST+INTRO_FRAMES//FPS+30,LAST,CHAPTER_FRAMES)!=(43,75,75,800):
  raise ValueError('CHAPTER_TIME_CONTRACT_DRIFT')
 return True

def create_intro(src,out,tmp):
 from PIL import Image,ImageDraw,ImageFont
 inter=Path('/usr/share/fonts/opentype/inter')
 def font(sz,bold=False):
  f=inter/('InterDisplay-Bold.otf' if bold else 'InterDisplay-Medium.otf')
  if not f.is_file():f=Path('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf')
  return ImageFont.truetype(str(f),sz)
 thumb=tmp/'match_38.png'
 run(['ffmpeg','-nostdin','-v','error','-i',str(src),'-ss','33','-frames:v','1',str(thumb)],60)
 original=Image.open(thumb).convert('RGB')
 base=Image.new('RGB',(1920,1080),(6,17,31));d=ImageDraw.Draw(base)
 d.rectangle((0,0,1920,12),fill=(56,189,248))
 d.text((102,70),'WORKNOVA    /    PART 1    /    OFFLINE MATCHING',font=font(30),fill=(240,248,255))
 d.text((104,154),'FROM MATCH TO QUOTE',font=font(70,True),fill=(241,248,254))
 d.text((104,244),'HANDOFF  /  FICTIONAL CANDIDATES FROM EARLIER RECORDED UI',font=font(25),fill=(56,189,248))
 # Crop genuine previously captured marketplace matching, not recreated providers.
 crop=original.crop((365,286,1555,925))
 box=(103,321,1115,943);w=box[2]-box[0];h=box[3]-box[1]
 ratio=min(w/crop.width,h/crop.height)
 crop=crop.resize((round(crop.width*ratio),round(crop.height*ratio)),Image.Resampling.LANCZOS)
 d.rounded_rectangle((82,300,1137,960),radius=26,fill=(9,28,48),outline=(39,101,147),width=4)
 base.paste(crop,(box[0]+(w-crop.width)//2,box[1]+(h-crop.height)//2))
 d=ImageDraw.Draw(base)
 d.rounded_rectangle((1180,304,1837,956),radius=27,fill=(11,34,58),outline=(41,108,150),width=3)
 d.rounded_rectangle((1225,354,1790,360),radius=3,fill=(56,189,248))
 d.text((1220,401),'HUMAN REVIEW NEXT',font=font(35,True),fill=(240,248,255))
 items=['Three fictional specialist profiles','Offline deterministic candidate matching','Quote version and amount reviewed by a person']
 for n,line in enumerate(items):
  y=500+n*103
  d.ellipse((1217,y+12,1232,y+27),fill=(56,189,248))
  # Two-line safe wrap
  words=line.split();row='';split=[]
  for word in words:
   cand=(row+' '+word).strip()
   if d.textbbox((0,0),cand,font=font(25))[2]>515 and row:
    split.append(row);row=word
   else:row=cand
  if row:split.append(row)
  for i,line2 in enumerate(split):d.text((1250,y+i*33),line2,font=font(25),fill=(166,196,218))
 d.line((1215,816,1791,816),fill=(60,119,153),width=2)
 d.text((1220,852),'EDITORIAL RECAP; NO NEW CLICK.',font=font(24),fill=(251,202,140))
 d.text((101,991),'AUTOMATED FICTIONAL DEMO    •    NO LIVE GEMINI/PAYPAL    •    NO PAYMENT AUTHORIZATION',font=font(22),fill=(162,190,215))
 card=tmp/'intro.png';base.save(card)
 run(['ffmpeg','-nostdin','-v','error','-n','-loop','1','-framerate','25','-t','2',
      '-i',str(card),'-frames:v','50','-r','25','-an','-c:v','libx264',
      '-preset','ultrafast','-crf','18','-pix_fmt','yuv420p',str(out)],80)
 if probe(out)!=(50,2.0,0):raise ValueError('2S_INTRO_FRAME_MISMATCH')
 return card

def render(src,part,out,chapter_output=None):
 check(src,part,out)
 if chapter_output and (chapter_output.exists() or chapter_output.is_symlink()):raise FileExistsError('CHAPTER_EXISTS__NO_OVERWRITE')
 out.parent.mkdir(parents=True,exist_ok=True)
 with tempfile.TemporaryDirectory(prefix='worknova-v4k-corrected-') as td:
  t=Path(td)
  intro=t/'intro.mp4';prem=t/'prem.mp4';new=t/'new.mp4';pre=t/'pre.mp4';post=t/'post.mp4';doc=t/'chapters.txt';lst=t/'concat.txt'
  create_intro(src,intro,t)
  shutil.copyfile(part,prem)
  doc.write_text("file 'intro.mp4'\nfile 'prem.mp4'\n")
  run(['ffmpeg','-nostdin','-v','error','-n','-f','concat','-safe','0','-i',str(doc),
       '-map','0:v:0','-c:v','copy',str(new)],95)
  if probe(new)!=(800,32.0,0):raise ValueError('32_SECOND_CHAPTER_INVALID')
  if chapter_output:shutil.copyfile(new,chapter_output)
  run(['ffmpeg','-nostdin','-v','error','-n','-i',str(src),'-frames:v','1075',
       '-map','0:v:0','-an','-c:v','copy',str(pre)],75)
  run(['ffmpeg','-nostdin','-v','error','-n','-i',str(src),'-ss','75','-t','95',
       '-map','0:v:0','-an','-c:v','copy',str(post)],75)
  if probe(pre)[0]!=1075 or probe(post)[0]!=2375:
   raise ValueError('OUTSIDE_SEGMENTS_NOT_EXACT')
  lst.write_text("file 'pre.mp4'\nfile 'new.mp4'\nfile 'post.mp4'\n")
  try:
   run(['ffmpeg','-nostdin','-v','error','-n','-f','concat','-safe','0','-i',str(lst),
        '-i',str(src),'-map','0:v:0','-map','1:a:0','-c:v','copy','-c:a','copy',
        '-movflags','+faststart',str(out)],150)
   if probe(out)!=(4250,170.0,1) or audio(out)!=AUDIO_MD5:
    raise ValueError('WHOLE_FILM_OR_AAC_DRIFT')
  except Exception:
   out.unlink(missing_ok=True);raise
  report={'status':'WORKNOVA_PRIVATE_V4K_PART1_DESIGN_NOT_FINAL',
   'full_sha256':sha(out),'full_bytes':out.stat().st_size,
   'chapter_32s_sha256':sha(new),'chapter_seconds':[43,75],
   'source_v4j_sha256':PARENT_SHA,'source_30s_sha256':THIRTY_SHA,
   'frames':4250,'duration_seconds':170.0,'aac_packet_md5':AUDIO_MD5,
   'original_voice_preserved':True,'new_voice':False,'new_subtitles':False,
   'ai_or_paypal_requests':0,'published':False,'release_hold':True,
   'owner_approval':False}
  out.with_suffix('.json').write_text(json.dumps(report,indent=2)+'\n',encoding='utf8')
  return report

def main():
 a=argparse.ArgumentParser()
 a.add_argument('--source',required=True,type=Path)
 a.add_argument('--chapter30',required=True,type=Path)
 a.add_argument('--output',required=True,type=Path)
 a.add_argument('--chapter-output',type=Path)
 x=a.parse_args()
 print(json.dumps(render(x.source,x.chapter30,x.output,x.chapter_output),indent=2))

if __name__=='__main__':main()
