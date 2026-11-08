#!/usr/bin/env python3
"""WORKNOVA private visual-only Part1 quote and historical evidence editorial.

ONLY reframe pixels from a SHA-verified offline v4j recording. Does not synthesize
speech, generate browser events, change quotes, contact PayPal or publish media.
Never overwrites sources. Output is NOT owner-approved or release-ready.
"""
from __future__ import annotations
import argparse
import hashlib
import json
import shutil
import subprocess
import tempfile
from pathlib import Path

EXPECTED_V4J = 'c0ae70b7ebf6cfee08b49f108e405631198aa1cdf0307b41a86bf116a6fc296e'
AUDIO_MD5 = 'MD5=2959cc9c1f5ee996edaefb3b06a147ea'
FPS = 25
WINDOW = (45,75)
QUOTES = (140,130,171)
EVIDENCE = (114,127,100)
FADE_FRAMES = 8
CARDS = (
 ('QUOTE  /  01','RECORDED PROPOSAL','QUOTE WORKSPACE',
  'VERSION 2  /  APPROVED',('Approved amount shown: $15.00','Estimated proposal: $80.00','Source: OFFLINE_MOCK'),
  'Recorded state; this edit does not approve anything.',(310,82,859,463),'f_56.png'),
 ('QUOTE  /  02','SYNTHETIC PROJECT','DEFINE THE WORK',
  'REVISION CONTROL',('Project scope: ecommerce + checkout','An edit increments quote version','Previous approval can be invalidated'),
  'Proposal drafting shown locally; no live AI call.',(869,82,1565,466),'f_56.png'),
 ('QUOTE  /  03','HUMAN DECISION','APPROVAL GATE',
  'A PERSON RETAINS CONTROL',('Human-chosen amount: $15.00','Checkbox shown unchecked in frame','This replay makes no payment request'),
  'Recorded interface, not a newly executed approval.',(355,462,1060,970),'f_56.png'),
 ('EVIDENCE  /  01','HISTORICAL RECEIPT','GEMINI AI',
  '2026-10-28  /  PRIOR LOCAL RESULT',('Owner device: prior saved receipt','Model output was previously reported','No new provider request in this film'),
  'Earlier fictional matches are deterministic, not Gemini.',(205,320,1210,773),'f_64.png'),
 ('EVIDENCE  /  02','HISTORICAL RECEIPT','PAYPAL SANDBOX',
  '2026-10-28  /  PRIOR LOCAL RESULT',('Separate $1.50 Sandbox test','Reported CREATE > APPROVE > CAPTURE','Later provider GET; not repeated here'),
  'Distinct from the $15 offline mock quote; no live charge.',(210,298,1270,784),'f_68.png'),
 ('EVIDENCE  /  03','SOURCE BOUNDARIES','PROVENANCE FIRST',
  'READ-ONLY HISTORICAL CHECK',('Past owner-device receipts only','No fresh PayPal or Gemini request','No payment authority from synthetic UI'),
  'Offline Playwright footage is not human-operated capture.',(209,298,1270,800),'f_72.png'),
)
NAVY='#06111f'; PANEL='#0b1d34'; CYAN='#38bdf8'; WHITE='#f2f7fc'; MUTED='#a5c1d7'; AMBER='#ffcf8c'

def checksum(path:Path)->str:
 h=hashlib.sha256()
 with open(path,'rb') as f:
  for block in iter(lambda:f.read(1024*1024),b''):h.update(block)
 return h.hexdigest()

def run(args,timeout=160):
 cp=subprocess.run(args,stdin=subprocess.DEVNULL,capture_output=True,text=True,timeout=timeout)
 if cp.returncode:raise RuntimeError('OFFLINE_FFMPEG_FAIL '+str(cp.returncode)+' '+cp.stderr[-800:])
 return cp.stdout.strip()

def probe(path):
 x=json.loads(run(['ffprobe','-v','error','-count_packets','-show_streams','-show_format','-of','json',str(path)],30))
 vs=[a for a in x['streams'] if a['codec_type']=='video']
 aud=[a for a in x['streams'] if a['codec_type']=='audio']
 if len(vs)!=1 or vs[0]['codec_name']!='h264' or (vs[0]['width'],vs[0]['height'])!=(1920,1080):
  raise ValueError('VIDEO_STREAM_MISMATCH')
 return int(vs[0]['nb_read_packets']),round(float(x['format']['duration']),3),len(aud)

def audio_md5(path):
 return run(['ffmpeg','-nostdin','-v','error','-i',str(path),'-map','0:a:0','-c:a','copy','-f','hash','-hash','md5','-'],90)

def check_inputs(src,out):
 src=Path(src);out=Path(out)
 if not src.is_file() or src.is_symlink() or checksum(src)!=EXPECTED_V4J:
  raise ValueError('UNVERIFIED_V4J_SOURCE__STOP')
 if out.exists() or out.is_symlink() or out.with_suffix('.json').exists():
  raise FileExistsError('OUTPUT_EXISTS__NO_OVERWRITE')
 if (len(CARDS)!=6 or sum(QUOTES)-2*FADE_FRAMES!=17*FPS or
      sum(EVIDENCE)-2*FADE_FRAMES!=13*FPS or WINDOW!=(45,75)):
  raise ValueError('SCENE_TIMELINE_CONTRACT_DRIFT')
 if probe(src)!=(4250,170.0,1) or audio_md5(src)!=AUDIO_MD5:
  raise ValueError('PARENT_FRAME_OR_AAC_MISMATCH')
 return True

def font(name,size):
 from PIL import ImageFont
 candidates=[Path('/usr/share/fonts/opentype/inter')/name,
             Path('/usr/share/fonts/truetype/dejavu')/'DejaVuSans.ttf']
 for p in candidates:
  if p.is_file():return ImageFont.truetype(str(p),size)
 raise FileNotFoundError('LOCAL_FONT_REQUIRED')

def editorial_card(source:Path,card_no:int,dest:Path):
 from PIL import Image,ImageDraw,ImageFilter
 # All video labels are descriptions of on-screen pixels, NOT new actions.
 item=CARDS[card_no]; seq,smalltitle,main,sub,bullets,warning,region,sfile=item
 img=Image.new('RGB',(1920,1080),NAVY)
 d=ImageDraw.Draw(img)
 for y in range(0,1080,4):
  k=int(y/1080*18)
  d.line((0,y,1920,y),fill=(6,17+k//3,31+k),width=4)
 d.rectangle((0,0,1920,12),fill=CYAN)
 d.text((100,72),'WORKNOVA    /    PART 1    /    HUMAN-LED MARKETPLACE',font=font('InterDisplay-SemiBold.otf',30),fill=WHITE)
 d.text((100,153),main,font=font('InterDisplay-Bold.otf',68),fill=WHITE)
 d.text((104,242),seq+'    •    '+smalltitle,font=font('InterDisplay-Medium.otf',25),fill=CYAN)
 # Foreground source frame enlarged in a studio border; source bytes trace to v4j.
 src=Image.open(source).convert('RGB'); cut=src.crop(region)
 box=(102,324,1124,938)
 target_w=box[2]-box[0];target_h=box[3]-box[1]
 ratio=min(target_w/cut.width,target_h/cut.height)
 newsize=(round(cut.width*ratio),round(cut.height*ratio))
 cut=cut.resize(newsize,Image.Resampling.LANCZOS)
 px=box[0]+(target_w-newsize[0])//2;py=box[1]+(target_h-newsize[1])//2
 d.rounded_rectangle((81,303,1145,959),radius=25,fill='#091d33',outline='#24547c',width=4)
 img.paste(cut,(px,py))
 d=ImageDraw.Draw(img)
 d.rounded_rectangle((1175,303,1838,958),radius=24,fill='#0b223a',outline='#28668c',width=3)
 d.rounded_rectangle((1222,353,1792,359),radius=3,fill=CYAN)
 d.text((1216,399),sub,font=font('InterDisplay-SemiBold.otf',29),fill=WHITE)
 ys=(500,575,650)
 for i,(b,y) in enumerate(zip(bullets,ys)):
  d.ellipse((1216,y+10,1229,y+23),fill=CYAN)
  d.text((1251,y),b,font=font('InterDisplay-Regular.otf',24),fill=MUTED)
 d.line((1215,737,1789,737),fill='#39759c',width=2)
 # The red flags are always visible and far above 12px small print.
 import textwrap
 for i,line in enumerate(textwrap.wrap(warning,width=42)):
  d.text((1216,778+i*38),line,font=font('InterDisplay-Medium.otf',23),fill=AMBER)
 d.text((100,992),'OFFLINE / SYNTHETIC UI REFRAME      •      HISTORICAL RECEIPTS SEPARATE      •      NO NEW PROVIDER CALLS',
   font=font('InterDisplay-Medium.otf',21),fill=MUTED)
 # Tracker shows visual stage order, no click/running automation claim.
 for idx in range(6):
  xx=120+idx*288
  d.rounded_rectangle((xx,1040,xx+250,1048),radius=4,fill=CYAN if idx==card_no else '#2a4963')
 dest.parent.mkdir(parents=True,exist_ok=True)
 img.save(dest,optimize=False)

def render_part(images,frames,out):
 fps=25
 args=['ffmpeg','-nostdin','-hide_banner','-loglevel','error','-n']
 for f,n in zip(images,frames): args.extend(['-loop','1','-framerate','25','-t',str(n/fps),'-i',str(f)])
 graph=';'.join(f'[{i}:v]format=yuv420p[v{i}]' for i in range(3))+';'
 d=FADE_FRAMES/fps
 x1=(frames[0]-FADE_FRAMES)/fps;x2=(frames[0]+frames[1]-2*FADE_FRAMES)/fps
 graph+=f'[v0][v1]xfade=transition=fade:duration={d}:offset={x1}[x1];'
 graph+=f'[x1][v2]xfade=transition=fade:duration={d}:offset={x2},format=yuv420p[vout]'
 args+=['-filter_complex',graph,'-map','[vout]','-frames:v',str(sum(frames)-2*FADE_FRAMES),
        '-r','25','-an','-c:v','libx264','-preset','ultrafast','-crf','18',
        '-pix_fmt','yuv420p','-movflags','+faststart',str(out)]
 run(args,240)
 actual=probe(out)
 if actual!=(sum(frames)-2*FADE_FRAMES,round((sum(frames)-2*FADE_FRAMES)/fps,3),0):
  raise ValueError('EDITORIAL_CHAPTER_FRAME_DRIFT '+repr(actual))

def render(parent:Path,full_output:Path,chapter_output:Path|None=None):
 check_inputs(parent,full_output)
 if chapter_output and (chapter_output.exists() or chapter_output.is_symlink()):
  raise FileExistsError('CHAPTER_EXISTS__NO_OVERWRITE')
 if not (shutil.which('ffmpeg') and shutil.which('ffprobe')):raise ValueError('FFMPEG_REQUIRED')
 full_output.parent.mkdir(parents=True,exist_ok=True)
 with tempfile.TemporaryDirectory(prefix='worknova-v4k-') as folder:
  p=Path(folder)
  timestamps=(56,56,56,64,68,72)
  for t in set(timestamps):
   run(['ffmpeg','-nostdin','-v','error','-ss',str(t),'-i',str(parent),'-frames:v','1',str(p/f'f_{t}.png')],35)
  cards=[]
  for n,item in enumerate(CARDS):
   path=p/f'card{n}.png';editorial_card(p/item[7],n,path);cards.append(path)
  q=p/'quote.mp4';e=p/'evidence.mp4';b=p/'bridge30.mp4'
  render_part(cards[:3],QUOTES,q)
  render_part(cards[3:],EVIDENCE,e)
  lst=p/'chapters.txt'
  lst.write_text("file 'quote.mp4'\nfile 'evidence.mp4'\n",encoding='utf8')
  run(['ffmpeg','-nostdin','-v','error','-n','-f','concat','-safe','0','-i',str(lst),
       '-map','0:v:0','-c:v','copy',str(b)],90)
  if probe(b)!=(750,30.0,0):raise ValueError('CHAPTER_30S_INVALID')
  if chapter_output:shutil.copyfile(b,chapter_output)
  pre=p/'pre.mp4';post=p/'post.mp4';chap=p/'chapter.mp4';final_list=p/'full.txt'
  run(['ffmpeg','-nostdin','-v','error','-n','-i',str(parent),'-frames:v','1125',
       '-map','0:v:0','-an','-c:v','copy',str(pre)],60)
  run(['ffmpeg','-nostdin','-v','error','-n','-i',str(parent),'-ss','75','-t','95',
       '-map','0:v:0','-an','-c:v','copy',str(post)],60)
  if probe(pre)[0]!=1125 or probe(post)[0]!=2375:
   raise ValueError('ORIGINAL_SEGMENT_FRAME_DRIFT')
  shutil.copyfile(b,chap)
  final_list.write_text("file 'pre.mp4'\nfile 'chapter.mp4'\nfile 'post.mp4'\n",encoding='utf8')
  try:
   run(['ffmpeg','-nostdin','-v','error','-n','-f','concat','-safe','0','-i',str(final_list),
        '-i',str(parent),'-map','0:v:0','-map','1:a:0','-c:v','copy','-c:a','copy',
        '-movflags','+faststart',str(full_output)],150)
   if probe(full_output)!=(4250,170.0,1) or audio_md5(full_output)!=AUDIO_MD5:
    raise ValueError('FINAL_VIDEO_OR_ORIGINAL_AUDIO_MISMATCH')
  except Exception:
   full_output.unlink(missing_ok=True)
   raise
  result={'status':'PRIVATE_WORKNOVA_V4K_DESIGN_REVIEW__NOT_FINAL',
    'source_sha256':EXPECTED_V4J,'full_sha256':checksum(full_output),
    'chapter_sha256':checksum(b),'full_bytes':full_output.stat().st_size,
    'chapter_bytes':b.stat().st_size,'film_seconds':170.0,
    'chapter_film_seconds':[45,75],'full_frames':4250,
    'previous_quote_offline_usd':15.0,'historical_sandbox_usd':1.50,
    'original_aac_md5':AUDIO_MD5,'no_new_voice':True,'no_new_subtitles':True,
    'real_paypal_calls':0,'real_gemini_calls':0,'public_upload':False,
    'owner_approved':False,'release_hold':True}
  full_output.with_suffix('.json').write_text(json.dumps(result,indent=2)+'\n',encoding='utf8')
  return result

def main():
 ap=argparse.ArgumentParser(description='v4k private Part1 quote/evidence editorial')
 ap.add_argument('--check-plan',action='store_true')
 ap.add_argument('--source',type=Path)
 ap.add_argument('--output',type=Path)
 ap.add_argument('--chapter-output',type=Path)
 a=ap.parse_args()
 if a.check_plan:
  print(json.dumps({'parent_sha256':EXPECTED_V4J,'replace_window':[45,75],
    'quote_frames':sum(QUOTES)-16,'evidence_frames':sum(EVIDENCE)-16,
    'storyboard_beats':[x[2] for x in CARDS],
    'no_new_voice':True,'no_new_subtitles':True,'public_release':False},indent=2));return
 if not (a.source and a.output):ap.error('--source and --output required')
 print(json.dumps(render(a.source,a.output,a.chapter_output),indent=2))

if __name__=='__main__':main()
