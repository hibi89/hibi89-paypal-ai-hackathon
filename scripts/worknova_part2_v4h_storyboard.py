#!/usr/bin/env python3
"""WORKNOVA v4h: real Gift Finder footage and five-agent workflow beats, visuals only.

All supplied media must match recorded SHA256. No network, PayPal/Gemini, model,
voice generation, subtitles, public upload or input modification. 50s private
preview; assemble separately into original v4c's exact 170s master.
"""
from __future__ import annotations
import argparse
import hashlib
import json
import shutil
import subprocess
import tempfile
from pathlib import Path

SOURCE_SHA='4dc5c379c58d0fd64ae5d8b273072638f0cf718cbd646eda0c71afbd6e61d290'
V4D_SHA='4ebfa2497d979e4ac0a7e74de3fb8fd266d6318fa87d8b17bf5c955e90afa3b7'
FPS=25
SCENES=(('DELEGATE',0,8),('A2A NEGOTIATION',8,19),('GIFT FINDER',19,31),
        ('CHURN SAVER',31,40),('INVOICE / DISPUTE',40,50))
# A per-agent three-beat editorial guide, not a voice/subtitle transcript.
BEATS=(
 ('DELEGATE',0,2.64,'Define a limited task','Scope remains with the human'),
 ('DELEGATE',2.64,5.32,'Set the budget and expiry','Synthetic $300 cap / no payment power'),
 ('DELEGATE',5.32,8,'Require explicit consent','No autonomous payment authority'),
 ('A2A NEGOTIATION',8,11.68,'Seller offer  /  $345','Offline buyer-seller simulation'),
 ('A2A NEGOTIATION',11.68,15.36,'Buyer counter  /  $290','Fictional negotiation ledger'),
 ('A2A NEGOTIATION',15.36,19,'Buyer accepts  /  $299','Proposed terms  /  NOT PAID'),
 ('GIFT FINDER',19,23,'Choose constraints','Budget, style and catalog filters'),
 ('GIFT FINDER',23,27,'Inspect local recommendations','Local demo data  /  no external checkout'),
 ('GIFT FINDER',27,31,'Prepare a shortlist','Human review before any purchase'),
 ('CHURN SAVER',31,34,'Review the plan and months left','Offline subscription example'),
 ('CHURN SAVER',34,37,'Apply policy ceiling  /  20%','Fictional retention proposal'),
 ('CHURN SAVER',37,40,'Send draft for human review','No actual subscription changes'),
 ('INVOICE / DISPUTE',40,43.4,'Organize existing evidence','Locally supplied demo facts'),
 ('INVOICE / DISPUTE',43.4,46.8,'Build a draft case','No live invoice or dispute submitted'),
 ('INVOICE / DISPUTE',46.8,50,'Review before any action','Human authorization required'),
)
BG=(6,17,31);NAVY=(10,27,49);CYAN=(56,189,248);WHITE=(245,251,255)

def sha(path:Path):
 h=hashlib.sha256()
 with path.open('rb') as f:
  for b in iter(lambda:f.read(1024*1024),b''):h.update(b)
 return h.hexdigest()

def plan():
 if len(BEATS)!=15 or tuple(x[0] for x in BEATS[::3])!=tuple(x[0] for x in SCENES):
  raise ValueError('FIVE_AGENT_PLAN_DRIFT')
 p=0.0
 for category,a,b,*_ in BEATS:
  if abs(a-p)>.001 or b<=a:raise ValueError('NON_CONTIGUOUS_STORYBOARD')
  if not any(x[0]==category and x[1]<=a and b<=x[2] for x in SCENES):
   raise ValueError('STORYBOARD_CROSSES_SCENE')
  p=b
 if abs(p-50)>.001:raise ValueError('NOT_50S')
 return {'scenes':5,'beats':15,'seconds':50,'frames':1250,
         'source_SHA256':SOURCE_SHA,'v4d_SHA256':V4D_SHA,
         'voice_rendered':False,'external_requests':0,'release_hold':True}

def font(size,bold=False):
 from PIL import ImageFont
 files=['/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf' if bold else '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',
        'C:/Windows/Fonts/arialbd.ttf' if bold else 'C:/Windows/Fonts/arial.ttf']
 for name in files:
  if Path(name).is_file():return ImageFont.truetype(name,size)
 raise ValueError('TRUETYPE_FONT_NOT_INSTALLED')

def cards(folder:Path):
 from PIL import Image,ImageDraw
 folder.mkdir(parents=True,exist_ok=True)
 canvas=Image.new('RGB',(1920,1080),BG)
 d=ImageDraw.Draw(canvas)
 d.rectangle((0,0,1920,76),fill=NAVY)
 d.text((120,18),'WORKNOVA   /   03   /   DISCOVER   /   GIFT FINDER',fill=WHITE,font=font(28,True))
 d.rounded_rectangle((100,144,990,903),radius=25,fill=(12,30,52),outline=(35,105,147),width=3)
 d.rectangle((158,201,251,208),fill=CYAN)
 d.text((160,259),'CONSTRAINED DISCOVERY',fill=(153,232,248),font=font(28,True))
 d.text((158,338),'GIFT FINDER',fill=WHITE,font=font(65,True))
 d.text((158,444),'A local demo catalog',fill=WHITE,font=font(31))
 d.text((158,489),'with a clear human boundary.',fill=WHITE,font=font(30))
 for ii,(key,value) in enumerate((('CATEGORY','Desk lighting'),('STYLE','Preference-based'),
                  ('BUDGET','User-set price ceiling'),('SELECTION','Locally evaluated item'))):
  y=603+70*ii
  d.ellipse((159,y+12,174,y+27),fill=CYAN)
  d.text((191,y),key,fill=(159,206,228),font=font(21,True))
  d.text((490,y-3),value,fill=WHITE,font=font(26))
 d.rounded_rectangle((1093,83,1774,995),radius=21,fill=(17,46,72),outline=CYAN,width=3)
 d.text((1150,104),'OFFLINE RECORDING  /  KEYFRAME REPLAY',fill=(171,229,243),font=font(18,True))
 canvas.save(folder/'gift_frame.png')
 file_list=[]
 for i,(cat,a,b,headline,disclosure) in enumerate(BEATS):
  j=next(j for j,x in enumerate(SCENES) if x[0]==cat)
  s=i%3
  im=Image.new('RGB',(1920,136),NAVY)
  draw=ImageDraw.Draw(im)
  draw.rectangle((0,0,1920,2),fill=(35,95,128))
  draw.rounded_rectangle((61,30,425,109),radius=15,fill=(14,45,70),outline=(45,100,135),width=2)
  draw.text((85,42),f'{j+1:02d}   {cat}',font=font(24,True),fill=WHITE)
  draw.text((85,78),f'BEAT {s+1} OF 3  /  SYNTHETIC',font=font(15),fill=(157,199,224))
  draw.text((470,24),headline,font=font(32,True),fill=WHITE)
  draw.text((472,76),disclosure,font=font(21),fill=(177,205,224))
  for step in range(3):
   x=1530+step*112
   draw.rounded_rectangle((x,101,x+94,109),radius=4,
                          fill=CYAN if step<=s else (40,73,93))
  fn=folder/f'beat_{i:02d}.png';im.save(fn)
  file_list.append((fn,b-a))
 return file_list

def run(args,timeout=180):
 r=subprocess.run(args,capture_output=True,text=True,timeout=timeout)
 if r.returncode:raise RuntimeError('FFMPEG_FAILED '+str(r.returncode)+' '+r.stderr[-1700:])
 return r.stdout

def probe(path):
 return json.loads(run(['ffprobe','-v','error','-count_packets','-show_entries',
    'format=duration:stream=codec_type,codec_name,width,height,nb_read_packets',
    '-of','json',str(path)],timeout=25))

def render(v4d:Path,source:Path,out:Path):
 plan()
 if not shutil.which('ffmpeg') or not shutil.which('ffprobe'):
  raise ValueError('FFMPEG_FFPROBE_REQUIRED')
 for p,digest in ((v4d,V4D_SHA),(source,SOURCE_SHA)):
  if not p.is_file() or p.is_symlink() or sha(p)!=digest:
   raise ValueError('UNVERIFIED_VIDEO_SOURCE_SHA_OR_SYMLINK')
 if out.exists() or out.is_symlink() or out.with_suffix('.json').exists():
  raise FileExistsError('OUTPUT_EXISTS__NO_OVERWRITE')
 # Work from a clean new directory and atomically publish only verified results.
 with tempfile.TemporaryDirectory(prefix='worknova-v4h-') as td:
  tmp=Path(td);stage=tmp/'stage'
  file_list=cards(stage)
  concat=tmp/'beat.ffconcat'
  lines=['ffconcat version 1.0']
  for image,duration in file_list:
   lines.append(f"file '{image.as_posix()}'")
   lines.append(f'duration {duration:.3f}')
  lines.append(f"file '{file_list[-1][0].as_posix()}'")
  concat.write_text('\n'.join(lines)+'\n','utf8')
  footer=tmp/'footers.mp4'
  run(['ffmpeg','-nostdin','-hide_banner','-loglevel','error','-n',
       '-f','concat','-safe','0','-i',str(concat),'-vf','fps=25,format=yuv420p',
       '-frames:v','1250','-r','25','-an','-c:v','libx264','-preset','ultrafast',
       '-crf','18',str(footer)],timeout=90)
  gift=tmp/'gift12.mp4'
  # Original VP8 recording intermittently scrolls into unrelated agents within
  # this chapter. Three independently sampled *actual* Gift Finder keyframes
  # avoid falsely showing Delegate/A2A/Churn while the Gift chapter is titled.
  # These are storyboard stills, not re-enacted clicks or a live AI execution.
  from PIL import Image
  snaps=[]
  for idx,second in enumerate((90.5,96.5,99.5)):
   original=tmp/f'gift_source_{idx}.png'
   run(['ffmpeg','-nostdin','-hide_banner','-loglevel','error','-n',
        '-ss',str(second),'-i',str(source),'-frames:v','1',str(original)],timeout=30)
   im=Image.open(original).convert('RGB')
   if im.size!=(1600,900):raise ValueError('UNEXPECTED_SOURCE_SNAPSHOT_SIZE')
   im=im.crop((240,0,792,775)).resize((650,910),Image.Resampling.LANCZOS)
   shot=tmp/f'gift_keyframe_{idx}.png';im.save(shot)
   snaps.append(shot)
  shots_list=tmp/'giftshots.ffconcat'
  entries=['ffconcat version 1.0']
  for image in snaps:
   entries.append(f"file '{image.as_posix()}'")
   entries.append('duration 4.0')
  entries.append(f"file '{snaps[-1].as_posix()}'")
  shots_list.write_text('\n'.join(entries)+'\n','utf8')
  shot_video=tmp/'gift_keyframes_12s.mp4'
  run(['ffmpeg','-nostdin','-hide_banner','-loglevel','error','-n',
       '-f','concat','-safe','0','-i',str(shots_list),
       '-vf','fps=25,format=yuv420p','-frames:v','300','-an',
       '-c:v','libx264','-preset','ultrafast','-crf','19',str(shot_video)],timeout=90)
  run(['ffmpeg','-nostdin','-hide_banner','-loglevel','error','-n',
       '-i',str(shot_video),'-loop','1','-framerate','25',
       '-i',str(stage/'gift_frame.png'),
       '-filter_complex','[1:v][0:v]overlay=1110:84:shortest=1,format=yuv420p[v]',
       '-map','[v]','-frames:v','300','-r','25','-an',
       '-c:v','libx264','-preset','ultrafast','-crf','19',str(gift)],timeout=100)
  dest=tmp/'candidate.mp4'
  flt=('[0:v]split=2[a][b];'
       '[a]trim=start_frame=0:end_frame=475,setpts=PTS-STARTPTS,format=yuv420p[pre];'
       '[b]trim=start_frame=775:end_frame=1250,setpts=PTS-STARTPTS,format=yuv420p[post];'
       '[pre][1:v][post]concat=n=3:v=1:a=0,format=yuv420p[vid];'
       '[vid][2:v]overlay=0:944:shortest=1,format=yuv420p[vout]')
  run(['ffmpeg','-nostdin','-hide_banner','-loglevel','error','-n',
       '-i',str(v4d),'-i',str(gift),'-i',str(footer),'-filter_complex',flt,
       '-map','[vout]','-map','0:a:0','-frames:v','1250','-r','25',
       '-c:v','libx264','-preset','ultrafast','-crf','18',
       '-pix_fmt','yuv420p','-c:a','copy','-movflags','+faststart',str(dest)],timeout=180)
  report=probe(dest)
  vids=[x for x in report['streams'] if x['codec_type']=='video']
  if len(vids)!=1 or int(vids[0]['nb_read_packets'])!=1250 or abs(float(report['format']['duration'])-50)>.1:
   raise ValueError('FRAME_COUNT_OR_50S_DURATION_MISMATCH')
  out.parent.mkdir(parents=True,exist_ok=True)
  shutil.copyfile(dest,out)
  result={'status':'WORKNOVA_V4H_PRIVATE_50S_VISUAL_STORYBOARD',
    'sha256':sha(out),'bytes':out.stat().st_size,'frames':1250,
    'duration':float(report['format']['duration']),'source_ui_sha256':SOURCE_SHA,
    'v4d_parent_sha256':V4D_SHA,'gift_original_keyframe_seconds':[90.5,96.5,99.5],
    'gift_motion_source_type':'KEYFRAMES_FROM_ORIGINAL_OFFLINE_RECORDING',
    'storyboard_beats':15,'voice_generated':False,'subtitles_generated':False,
    'real_paypal_or_ai_calls':False,'published':False,'release_hold':True}
  out.with_suffix('.json').write_text(json.dumps(result,indent=2)+'\n','utf8')
  return result

def main():
 p=argparse.ArgumentParser()
 p.add_argument('--check-plan',action='store_true')
 p.add_argument('--v4d',type=Path)
 p.add_argument('--ui-source',type=Path)
 p.add_argument('--output',type=Path)
 a=p.parse_args()
 if a.check_plan:print(json.dumps(plan(),indent=2));return
 if not a.v4d or not a.ui_source or not a.output:p.error('--v4d --ui-source --output required')
 print(json.dumps(render(a.v4d,a.ui_source,a.output),indent=2))
if __name__=='__main__':main()
