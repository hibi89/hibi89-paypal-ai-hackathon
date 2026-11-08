#!/usr/bin/env python3
"""Private, offline WORKNOVA premium-cut video designer. No external AI, API, payment or publication.

Source requirements: exact v4p6 170s 25fps H264/AAC owner-private film.
Preserves H264 packet content from 10.00s to 161.00s. Synthetic music is original
procedural sound design, not a sampled third-party song. Final concept dashboard
is clearly marked as illustrative, NOT DEPLOYED or a PayPal partnership.
"""
from __future__ import annotations
import hashlib, json, math, os, shutil, subprocess, sys, tempfile, wave
from pathlib import Path
import numpy as np
from PIL import Image, ImageDraw, ImageFont, ImageFilter

ROOT=Path(__file__).resolve().parents[1]/'output'/'worknova-v4q-private'
SRC=None  # provided with --source; NEVER committed to GitHub
EXPECTED_SRC_SHA='a8cb8b4c811672972d68f362dd45e74a471577f62a1945cd4b499c103dcb897d'
W,H,FPS,SECONDS=1920,1080,25,170
C={'bg':'#060b15','navy':'#0b1423','panel':'#0e192a','line':'#21384e','white':'#f2f7fc','muted':'#9bb1c8','accent':'#5be8d5','cyan':'#6bc9fa','blue':'#3985ff','orange':'#e1bb7b'}
FONT='/usr/share/fonts/opentype/inter'
BOLD=FONT+'/InterDisplay-Bold.otf'
SEMI=FONT+'/InterDisplay-SemiBold.otf'
MED=FONT+'/InterDisplay-Medium.otf'
REG=FONT+'/InterDisplay-Regular.otf'

def font(sz,weight='regular'):
 primary={'bold':BOLD,'semi':SEMI,'medium':MED,'regular':REG}[weight]
 fallbacks=([Path('C:/Windows/Fonts/arialbd.ttf'),Path('/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf')]
            if weight in ('bold','semi') else
            [Path('C:/Windows/Fonts/arial.ttf'),Path('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf')])
 chosen=next((p for p in [Path(primary),*fallbacks] if p.is_file()),None)
 if chosen is None:raise FileNotFoundError('INTER_OR_SYSTEM_SANS_FONT_REQUIRED')
 return ImageFont.truetype(str(chosen),sz)

def text(d,x,y,string,sz=28,color=None,weight='regular'):
 d.text((x,y),string,font=font(sz,weight),fill=color or C['white'],stroke_width=0)

def lines(d,x,y,arr,sz=40,dy=56,color=None,weight='regular'):
 for i,s in enumerate(arr):text(d,x,y+dy*i,s,sz,color,weight)

def pill(d,x,y,w,h,label,fill='#0b2932',outline='#22625d',color=None,size=22):
 d.rounded_rectangle((x,y,x+w,y+h),radius=11,fill=fill,outline=outline,width=2)
 text(d,x+18,y+(h-size)//2-4,label,size,color or C['accent'],'semi')

def base(glowx=1450,glowy=450,grid=True):
 # Premium charcoal radial illumination, subdued technical grid, small grain.
 y,x=np.ogrid[:H,:W]
 rr=((x-glowx)/880)**2+((y-glowy)/820)**2
 glow=np.exp(-rr*2.7)
 vert=y/H
 r=(5+9*glow+3*vert).astype('uint8');g=(11+30*glow+4*vert).astype('uint8');b=(21+45*glow+12*vert).astype('uint8')
 arr=np.stack([np.broadcast_to(r,(H,W)),np.broadcast_to(g,(H,W)),np.broadcast_to(b,(H,W))],axis=-1)
 im=Image.fromarray(arr,'RGB');d=ImageDraw.Draw(im,'RGBA')
 if grid:
  for xx in range(80,W,135):d.line((xx,0,xx,H),fill=(100,160,190,9),width=1)
  for yy in range(90,H,135):d.line((0,yy,W,yy),fill=(100,160,190,9),width=1)
 # Fine hairline borders and edge ticks
 d.line((74,91,1846,91),fill=(150,194,224,45),width=2)
 d.line((74,981,1846,981),fill=(150,194,224,40),width=2)
 for xx in (74,1846):
  for yy in (91,981):d.line((xx-11,yy,xx+11,yy),fill=(80,214,224,95),width=2)
 return im

def insignia(d,x=116,y=132,r=14):
 # A fully original brand symbol for the film asset, not a copied trademark.
 d.ellipse((x-r,y-r,x+r,y+r),fill=C['accent'])
 d.ellipse((x-r//3,y-r//3,x+r//3,y+r//3),fill=C['bg'])

def header(d,kicker,idx):
 insignia(d,112,143,11)
 text(d,141,125,'WORKNOVA',30,C['white'],'bold')
 text(d,1515,126,idx,19,C['muted'],'semi')
 text(d,112,192,kicker,18,C['accent'],'semi')

def network(d,cx=1370,cy=535,scale=1):
 nodes=[(-250,-150),(-45,-240),(150,-160),(265,-25),(162,176),(-38,239),(-242,150),(-18,-15)]
 nodes=[(int(cx+dx*scale),int(cy+dy*scale)) for dx,dy in nodes]
 paths=[(0,1),(1,2),(2,3),(3,4),(4,5),(5,6),(6,0),(0,7),(1,7),(2,7),(3,7),(4,7),(5,7),(6,7)]
 for a,b in paths:d.line((nodes[a],nodes[b]),fill=(91,232,213,67),width=2)
 for i,(x,y) in enumerate(nodes):
  r=7 if i<7 else 11
  d.ellipse((x-r*2,y-r*2,x+r*2,y+r*2),outline=(67,189,244,55),width=2)
  d.ellipse((x-r,y-r,x+r,y+r),fill=(100,218,236,210))
 for rad in (280,365):d.ellipse((cx-rad,cy-rad,cx+rad,cy+rad),outline=(80,180,230,22),width=2)

def opener_a():
 im=base(glowx=1600,glowy=550);d=ImageDraw.Draw(im,'RGBA');header(d,'THE OPPORTUNITY / 01','PRIVATE CONCEPT FILM')
 text(d,108,335,'WORK SHOULD',100,C['white'],'bold')
 text(d,108,454,'OPEN DOORS.',111,C['accent'],'bold')
 d.line((112,647,475,647),fill=C['accent'],width=4)
 lines(d,112,687,['AI should help more people find meaningful work,','not simply automate the jobs they already have.'],29,45,C['muted'])
 network(d,1550,475,0.7)
 text(d,110,1007,'AI WORK   /   GLOBAL SERVICES',18,C['muted'],'medium')
 return im

def opener_b():
 im=base(glowx=1380,glowy=520);d=ImageDraw.Draw(im,'RGBA');header(d,'THE PLATFORM / 02','PRIVATE CONCEPT FILM')
 text(d,106,325,'WORK',166,C['white'],'bold')
 text(d,106,493,'NOVA',166,C['accent'],'bold')
 d.line((113,700,680,700),fill=C['cyan'],width=3)
 text(d,110,741,'TWO SERVICE MARKETS',29,C['white'],'semi')
 text(d,110,787,'FIVE BOUNDED AGENT WORKFLOWS',28,C['muted'],'medium')
 pill(d,111,874,530,58,'ONE HUMAN PAYMENT GATE',size=21)
 network(d,1430,550,0.95)
 text(d,110,1007,'PROTOTYPE / OFFLINE REPRODUCIBLE DEMO',18,C['muted'],'medium')
 return im

def opener_c():
 im=base(glowx=1590,glowy=470);d=ImageDraw.Draw(im,'RGBA');header(d,'THE CORE PRINCIPLE / 03','PRIVATE CONCEPT FILM')
 text(d,106,323,'AI MOVES WORK',118,C['white'],'bold')
 text(d,106,470,'FORWARD.',118,C['white'],'bold')
 text(d,106,648,'PEOPLE MOVE MONEY.',79,C['accent'],'bold')
 d.line((112,795,1800,795),fill=(120,211,216,115),width=2)
 pill(d,112,852,292,56,'CONSENT',size=22)
 pill(d,427,852,367,56,'VERSIONED QUOTES',size=22)
 pill(d,819,852,357,56,'EVIDENCE',size=22)
 pill(d,1200,852,385,56,'HUMAN APPROVAL',size=22)
 text(d,110,1007,'OFFLINE DEMO / NO LIVE PAYPAL TRANSACTION',18,C['muted'],'medium')
 return im

def dashboard():
 im=base(1310,510);d=ImageDraw.Draw(im,'RGBA')
 header(d,'THE PRODUCT VISION / 01','FUTURE VISION  /  CONCEPT UI')
 text(d,110,245,'THE COMMERCE CONTROL PLANE',79,C['white'],'bold')
 text(d,114,338,'One place for work, agents, consent and payment boundaries.',28,C['muted'],'medium')
 # Window
 d.rounded_rectangle((106,417,1814,913),radius=28,fill=(9,24,42,246),outline=(73,144,179,90),width=3)
 d.rounded_rectangle((106,417,1814,486),radius=27,fill=(17,42,63,236))
 # Flatten bottom of title bar
 d.rectangle((106,459,1814,486),fill=(17,42,63,236))
 for i,c in enumerate(('#5ce3d1','#81cdf2','#efb977')):
  xx=145+i*27;d.ellipse((xx,444,xx+12,456),fill=c)
 text(d,264,435,'WORKNOVA  /  CONTROL CENTER',28,C['white'],'semi')
 pill(d,1500,431,263,42,'CONCEPT ONLY',fill='#183036',outline='#386b62',size=18)
 # KPIs: metadata, not fabricated performance metrics
 metrics=[(145,517,450,'02','SERVICE MARKETS','AI Work   /   Global Services'),
          (577,517,924,'05','AGENT WORKFLOWS','Scoped, offline skills'),
          (1051,517,1455,'HUMAN','PAYMENT AUTHORITY','Manual review is required')]
 for x,y,right,val,label,desc in metrics:
  d.rounded_rectangle((x,y,right,y+151),radius=14,fill=(12,34,52,252),outline=(45,88,119,140),width=2)
  text(d,x+22,y+15,label,19,C['muted'],'medium')
  text(d,x+22,y+42,val,51,C['accent'] if val!='HUMAN' else C['white'],'bold')
  text(d,x+22,y+106,desc,20,C['muted'],'regular')
 # PayPal source proof deliberately distinct from synthetic data
 d.rounded_rectangle((1480,517,1763,668),radius=14,fill=(12,34,52,252),outline=(52,112,166,130),width=2)
 text(d,1500,532,'PAYPAL PATHWAY',19,C['muted'],'medium')
 text(d,1500,572,'SANDBOX',39,C['cyan'],'bold')
 text(d,1500,622,'Historical owner test',18,C['muted'],'regular')
 text(d,155,697,'GOVERNED COMMERCE FLOW',19,C['white'],'semi')
 stages=[('FIND WORK','Request'),('MATCH','Skills'),('VERSIONED QUOTE','Amount'),('HUMAN REVIEW','Approval'),('PAYPAL','Sandbox')]
 xstarts=[145,475,805,1135,1465]
 for i,((name,sub),x) in enumerate(zip(stages,xstarts)):
  w=298
  fill=(14,38,54,246) if i!=3 else (26,49,54,246)
  d.rounded_rectangle((x,737,x+w,847),radius=15,fill=fill,outline=(68,116,146,180),width=2)
  d.ellipse((x+17,757,x+34,774),fill=C['accent'] if i!=4 else C['cyan'])
  text(d,x+42,752,name,20,C['white'],'semi')
  text(d,x+21,798,sub,20,C['muted'])
  if i<4:
   # connecting bus with arrow marker, under glowing dot overlay
   d.line((x+w+5,791,xstarts[i+1]-4,791),fill=(99,235,224,140),width=3)
   d.polygon([(xstarts[i+1]-13,784),(xstarts[i+1]-4,791),(xstarts[i+1]-13,798)],fill=(99,235,224,180))
 # Footer outside concept window
 text(d,112,943,'OUR ENGINEERING',19,C['accent'],'semi')
 text(d,309,943,'Versioned quotes   •   Scoped consent   •   Replay-safe operations   •   Evidence audit',20,C['white'],'medium')
 text(d,112,1008,'PAYPAL OPPORTUNITY',19,C['cyan'],'semi')
 text(d,348,1008,'More trusted routes to digital-service checkout   /   Hypothesis, not measured uplift',19,C['muted'])
 text(d,1371,1040,'NOT DEPLOYED  /  NO PARTNERSHIP CLAIM',15,C['muted'])
 return im

def endcard():
 im=base(glowx=1320,glowy=550);d=ImageDraw.Draw(im,'RGBA')
 network(d,1490,550,0.9)
 insignia(d,116,239,16)
 text(d,159,210,'THE NEXT GENERATION OF WORK',24,C['accent'],'semi')
 text(d,106,364,'WORKNOVA',153,C['white'],'bold')
 d.line((116,570,870,570),fill=C['accent'],width=6)
 text(d,111,643,'AI assists. Humans authorize.',44,C['white'],'semi')
 text(d,113,716,'A safer path from opportunity to payment.',28,C['muted'],'medium')
 pill(d,112,829,343,58,'OFFLINE PROTOTYPE',size=22)
 text(d,112,1007,'ILLUSTRATIVE DESIGN  /  NO LIVE TRANSACTIONS',18,C['muted'])
 return im

def write_images():
 root=ROOT/'assets';root.mkdir(parents=True,exist_ok=True)
 for name,fn in [('open1',opener_a),('open2',opener_b),('open3',opener_c),('control_plane',dashboard),('endcard',endcard)]:
  p=root/(name+'.png');fn().save(p,optimize=False);print('IMAGE',p)
 # 90px transparent shimmering dot for flow, small original graphics
 glow=Image.new('RGBA',(96,96),(0,0,0,0));d=ImageDraw.Draw(glow,'RGBA')
 for r in range(46,0,-1):
  alpha=int(0.3*(1-r/47)**2*255)
  d.ellipse((48-r,48-r,48+r,48+r),fill=(73,235,214,alpha))
 d.ellipse((41,41,55,55),fill=(222,255,247,235))
 glow.save(root/'pulse.png')

def run(cmd,timeout=180):
 z=subprocess.run([str(s) for s in cmd],capture_output=True,text=True,stdin=subprocess.DEVNULL,timeout=timeout)
 if z.returncode:raise RuntimeError(f'CMD FAILED {z.returncode}: '+z.stderr[-1100:])
 return z.stdout

def soundscape():
 """Reproducible procedural synthesis at 24kHz, no third-party recordings.

Layered fifths and ninths, 96bpm brushed rhythm, gently shaped envelopes.
Output 24kHz stereo PCM16; ffmpeg resamples for final mix.
"""
 path=ROOT/'assets'/'WORKNOVA_original_procedural_score.wav'
 if path.exists():return path
 sr=24000;n=SECONDS*sr
 t=np.arange(n,dtype=np.float32)/sr
 music=np.zeros(n,dtype=np.float32)
 # 4 original suspended-color chord voicings rotate every 12.5s.
 roots=[65.406,73.416,82.407,73.416]   # C2,D2,E2,D2
 chord_sets=[(0,7,14,19),(0,5,12,19),(0,7,12,21),(0,5,12,17)]
 for k in range(14):
  start=k*12.5;end=min((k+1)*12.5,SECONDS); i=int(start*sr);j=int(end*sr)
  if i>=n:break
  local=t[i:j]-start;root=roots[k%4]; env=np.minimum(1,local/1.5)*np.minimum(1,np.maximum(0,(end-start-local)/1.2))
  # slow soft analog-like pad, partials detuned for depth.
  for p,interval in enumerate(chord_sets[k%4]):
   freq=root*2**(interval/12)
   val=(np.sin(2*np.pi*freq*local+0.37*p)+0.18*np.sin(2*np.pi*(freq*1.005)*local+0.7*p)+0.11*np.sin(2*np.pi*(2*freq)*local))/(1.29)
   music[i:j]+=(0.030 if p<2 else 0.021)*val*env
 # soft bass pulse and airy hats at 96bpm, original and fully synthesized
 beat=60/96
 rng=np.random.default_rng(20261109)
 for k in range(math.ceil(SECONDS/beat)):
  start=k*beat;i=round(start*sr)
  if i>=n:break
  length=min(int(sr*.36),n-i)
  u=np.arange(length,dtype=np.float32)/sr
  root=roots[(int(start/12.5))%4]
  # Rounded low sine pulse with short pitch slide
  freq=root/2 + 12*np.exp(-u*19)
  phase=2*np.pi*np.cumsum(freq)/sr
  music[i:i+length]+=0.13*np.sin(phase)*np.exp(-u*16)
  if k%2:
   noise=rng.standard_normal(min(int(sr*.12),n-i)).astype(np.float32)
   m=noise.size
   # highpassed-ish via sample differencing
   high=noise-np.convolve(noise,np.ones(23,dtype=np.float32)/23,'same')
   music[i:i+m]+=0.012*high*np.exp(-np.arange(m,dtype=np.float32)/sr*35)
 # Cinematic rising noise swell for 161s concept opening, extremely soft
 for when in (0,10,22,94,161,168):
  i=int(when*sr);L=min(int(0.65*sr),n-i)
  if L<=0:continue
  u=np.arange(L,dtype=np.float32)/sr
  noise=rng.standard_normal(L).astype(np.float32)
  w=np.sin(np.pi*np.linspace(0,1,L,dtype=np.float32))**2
  music[i:i+L]+=0.008*(noise-np.roll(noise,40))*w
 # Fade in, keep mid quiet, slight more energy for final reveal, fade out
 env=np.ones(n,dtype=np.float32)*0.60
 env*=np.clip(t/3,0,1)
 env*=np.clip((SECONDS-t)/2.5,0,1)
 env*=1+0.35*np.clip((t-158)/4,0,1)
 music*=env
 # Normalize safe and create restrained stereo field
 peak=float(np.max(np.abs(music)))
 if peak>0: music*=0.62/peak
 # 48ms phase-delayed channel for subtle spaciousness, no sampled SFX
 lag=round(sr*.048)
 left=music
 right=0.92*music+0.08*np.concatenate((np.zeros(lag,dtype=np.float32),music[:-lag]))
 stereo=np.stack((left,right),axis=1)
 pcm=np.int16(np.clip(stereo,-.99,.99)*32767)
 with wave.open(str(path),'wb') as wf:
  wf.setnchannels(2);wf.setsampwidth(2);wf.setframerate(sr);wf.writeframes(pcm.tobytes())
 print('SCORE',path,'PEAK',peak)
 return path

def render_clips():
 a=ROOT/'assets';out=ROOT/'output';out.mkdir(exist_ok=True)
 opening=out/'opening_10s_private_v2.mp4'
 if not opening.exists():
  cmd=['ffmpeg','-nostdin','-v','error','-y']
  # Crossfade the final 0.5s into the exact first preserved source frame
  # to avoid a jarring editorial-to-real-UI jump at the 10-second IDR.
  bridge=a/'bridge_at_10s.png'
  if not bridge.exists():
   run(['ffmpeg','-nostdin','-v','error','-y','-ss','10.0','-i',SRC,'-frames:v','1',bridge],30)
  for nm,sec in [('open1',4),('open2',4),('open3',3),('bridge_at_10s',0.5)]:
   cmd+=['-loop','1','-framerate','25','-t',str(sec),'-i',a/(nm+'.png')]
  graph=('[0:v][1:v]xfade=transition=fade:duration=0.5:offset=3.5[o1];'
         '[o1][2:v]xfade=transition=fade:duration=0.5:offset=7.0[o2];'
         '[o2][3:v]xfade=transition=fade:duration=0.5:offset=9.5,format=yuv420p[v]')
  cmd+=['-filter_complex',graph,'-map','[v]','-frames:v','250','-r','25','-an','-c:v','libx264','-preset','veryfast','-crf','17','-pix_fmt','yuv420p',opening]
  run(cmd,180)
 ending=out/'future_concept_9s_private.mp4'
 if not ending.exists():
  # Five-plus-second legible illustrative UI, moving pulse, clean final brand endframe.
  cmd=['ffmpeg','-nostdin','-v','error','-y','-loop','1','-framerate','25','-t','6.5','-i',a/'control_plane.png',
       '-loop','1','-framerate','25','-t','3','-i',a/'endcard.png',
       '-loop','1','-framerate','25','-t','6.5','-i',a/'pulse.png']
  graph=("[0:v][2:v]overlay=x='150+252*min(t,6.1)':y=746:eval=frame:format=auto[concept];"
         "[concept]format=yuv420p[c];[1:v]format=yuv420p[e];"
         "[c][e]xfade=transition=fade:duration=0.5:offset=6.0,format=yuv420p[v]")
  cmd+=['-filter_complex',graph,'-map','[v]','-frames:v','225','-r','25','-an','-c:v','libx264','-preset','veryfast','-crf','17','-pix_fmt','yuv420p',ending]
  run(cmd,180)
 return opening,ending

def ffprobe(path):
 return json.loads(run(['ffprobe','-v','error','-show_entries','format=duration:stream=codec_type,codec_name,width,height,nb_frames','-of','json',path],30))

def assemble(opening,ending,score):
 target=ROOT/'output'/'WORKNOVA_v4q3_PREMIUM_PRIVATE_170s.mp4'
 if target.exists():raise FileExistsError('DO_NOT_OVERWRITE_REVIEW_FILM')
 if not SRC.is_file() or digest(SRC)!=EXPECTED_SRC_SHA:raise ValueError('SOURCE_SHA_MISMATCH')
 if abs(float(ffprobe(SRC)['format']['duration'])-170)>0.01:raise ValueError('SOURCE_DURATION_DRIFT')
 with tempfile.TemporaryDirectory(prefix='worknova-v4q-') as td:
  tmp=Path(td)
  # Existing IDR keyframes at 10s and 161s. Packet-copy middle only.
  run(['ffmpeg','-nostdin','-v','error','-y','-i',SRC,'-map','0:v:0','-an','-c:v','copy',
      '-f','segment','-segment_times','10,161','-segment_time_delta','0.014','-reset_timestamps','1',tmp/'segment_%02d.mp4'],80)
  parts=[tmp/f'segment_{i:02d}.mp4' for i in range(3)]
  for p,expected in zip(parts,(10,151,9)):
   if not p.is_file() or abs(float(ffprobe(p)['format']['duration'])-expected)>.08:raise ValueError('SEGMENT_KEYFRAME_MISMATCH_'+str(p))
  lst=tmp/'segments.txt'
  lst.write_text(f"file '{opening}'\nfile '{parts[1]}'\nfile '{ending}'\n",encoding='utf8')
  silent=tmp/'silent.mp4'
  run(['ffmpeg','-nostdin','-v','error','-y','-f','concat','-safe','0','-i',lst,'-map','0:v:0','-c:v','copy','-movflags','+faststart',silent],90)
  probe=ffprobe(silent)
  if abs(float(probe['format']['duration'])-170)>.06:raise ValueError('OUTPUT_VIDEO_LENGTH_DRIFT')
  # User's approved legacy audio is input #1; #2 is entirely original instrumental.
  filt=("[1:a]aresample=48000,volume=1.0[original];"
        "[2:a]aresample=48000,volume=0.20[bed];"
        "[original][bed]amix=inputs=2:duration=first:dropout_transition=0:normalize=0,"
        "alimiter=limit=0.92:latency=1[out]")
  run(['ffmpeg','-nostdin','-v','error','-y','-i',silent,'-i',SRC,'-i',score,
      '-filter_complex',filt,'-map','0:v:0','-map','[out]','-c:v','copy',
      '-c:a','aac','-b:a','192k','-ar','48000','-ac','2','-movflags','+faststart','-t','170',target],180)
 return target

def digest(p):
 h=hashlib.sha256()
 with open(p,'rb') as f:
  for chunk in iter(lambda:f.read(2**20),b''):h.update(chunk)
 return h.hexdigest()

if __name__=='__main__':
 import argparse
 p=argparse.ArgumentParser(description='PRIVATE offline premium video build; no publishing or providers')
 p.add_argument('--source',type=Path,help='Local exact-SHA v4p6 video; never modified or uploaded')
 p.add_argument('--work-dir',type=Path,help='New EMPTY private build directory (e.g. output/worknova-v4q-private)')
 p.add_argument('--check-plan',action='store_true',help='No files, no network, no model inference')
 a=p.parse_args()
 if a.check_plan:
  print(json.dumps({'status':'PRIVATE_PREMIUM_EDIT_PLAN_ONLY','parent_sha256':EXPECTED_SRC_SHA,
   'original_video_preserve_seconds':[10,161],'original_video_packet_count':3775,
   'opening_seconds':10,'ending_seconds':9,'total_seconds':170,'fps':25,
   'soundtrack':'original procedural synthesizer, no samples',
   'dashboard':'CONCEPT UI / NOT DEPLOYED','payment_or_provider_calls':0,
   'public_release':False,'voice_inference':False},indent=2))
  raise SystemExit(0)
 if not a.source or not a.work_dir:p.error('--source and --work-dir required')
 raw_source=a.source.expanduser()
 raw_work_dir=a.work_dir.expanduser()
 if raw_source.is_symlink() or raw_work_dir.is_symlink():
  raise SystemExit('SYMLINK_SOURCE_OR_DESTINATION_FORBIDDEN')
 SRC=raw_source.resolve()
 ROOT=raw_work_dir.resolve()
 if not SRC.is_file() or digest(SRC)!=EXPECTED_SRC_SHA:
  raise SystemExit('EXACT_V4P6_PRIVATE_SOURCE_HASH_REQUIRED')
 if ROOT.exists() and (not ROOT.is_dir() or any(ROOT.iterdir())):
  raise SystemExit('WORK_DIR_MUST_BE_EMPTY__NO_ORIGINAL_OVERWRITE')
 if SRC==ROOT or SRC.parent==ROOT:raise SystemExit('SOURCE_OUTPUT_COLLISION')
 ROOT.mkdir(parents=True,exist_ok=True)
 write_images();score=soundscape();op,ending=render_clips();output=assemble(op,ending,score)
 print('PRIVATE_PREMIUM_OUTPUT',output,'SHA256',digest(output),json.dumps(ffprobe(output)))
