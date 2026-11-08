#!/usr/bin/env python3
"""Private offline 170s WorkNova assembly. NO upload, payment or voice synthesis."""
import argparse
import hashlib
import json
from pathlib import Path
import subprocess
import tempfile

V4C='96941f892dc91f4c7508b2d70fdec67ba93acb2738a71b997e781c6dd198d7a8'
V4D='4ebfa2497d979e4ac0a7e74de3fb8fd266d6318fa87d8b17bf5c955e90afa3b7'

def sha(path):
 h=hashlib.sha256()
 with path.open('rb') as f:
  for x in iter(lambda:f.read(1024*1024),b''):h.update(x)
 return h.hexdigest()

def call(args):
 return subprocess.run(args,capture_output=True,text=True,check=True,timeout=120).stdout

def packets(path):
 j=json.loads(call(['ffprobe','-v','error','-count_packets','-show_streams','-show_format','-of','json',str(path)]))
 v=[s for s in j['streams'] if s['codec_type']=='video'];a=[s for s in j['streams'] if s['codec_type']=='audio']
 if len(v)!=1 or (v[0]['width'],v[0]['height'])!=(1920,1080) or len(a)>1:
  raise ValueError('INVALID_VIDEO_STREAMS')
 return int(v[0]['nb_read_packets']),float(j['format']['duration']),len(a)

def audio_md5(path):
 return call(['ffmpeg','-nostdin','-v','error','-i',str(path),'-map','0:a:0',
              '-c:a','copy','-f','hash','-hash','md5','-']).strip()

def assemble(base,chapter,dest):
 base,chapter,dest=map(Path,(base,chapter,dest))
 if dest.exists() or dest.is_symlink() or dest.with_suffix('.json').exists():
  raise FileExistsError('OUTPUT_EXISTS__NO_OVERWRITE')
 if not all(p.is_file() and not p.is_symlink() for p in (base,chapter)):
  raise ValueError('ORIGINAL_SOURCE_MISSING_OR_SYMLINK')
 if sha(base)!=V4C or sha(chapter)!=V4D:raise ValueError('UNAPPROVED_SOURCE_SHA__STOP')
 if packets(base)!=(4250,170.0,1) or packets(chapter)!=(1250,50.0,1):
  raise ValueError('UNEXPECTED_SOURCE_STREAMS')
 before_audio=audio_md5(base)
 dest.parent.mkdir(parents=True,exist_ok=True)
 with tempfile.TemporaryDirectory(prefix='worknova-cut-') as tmp:
  p=Path(tmp);parts=[p/'pre.mp4',p/'middle.mp4',p/'post.mp4']
  calls=[['-i',str(base),'-frames:v','2600'],
         ['-i',str(chapter)],
         ['-i',str(base),'-ss','154','-t','16']]
  for seg,opts,count in zip(parts,calls,(2600,1250,400)):
   call(['ffmpeg','-nostdin','-v','error','-n',*opts,
         '-map','0:v:0','-an','-c:v','copy',str(seg)])
   if packets(seg)[0]!=count:raise ValueError('SEGMENT_FRAME_MISMATCH')
  manifest=p/'concat.txt'
  manifest.write_text(''.join(f"file '{f.name}'\n" for f in parts))
  try:
   call(['ffmpeg','-nostdin','-v','error','-n','-f','concat','-safe','0',
         '-i',str(manifest),'-i',str(base),'-map','0:v:0','-map','1:a:0',
         '-c:v','copy','-c:a','copy','-movflags','+faststart',str(dest)])
   if packets(dest)!=(4250,170.0,1) or audio_md5(dest)!=before_audio:
    raise ValueError('FINAL_FRAMES_OR_AUDIO_NOT_PRESERVED')
  except Exception:
   if dest.exists():dest.unlink()
   raise
 result={'status':'PRIVATE_170S_VISUAL_ONLY__NOT_FINAL',
         'output_sha256':sha(dest),'output_bytes':dest.stat().st_size,
         'v4c_sha256':V4C,'part2_v4d_sha256':V4D,'seconds':170,'frames':4250,
         'part2_window_seconds':[104,154],'aac_md5':before_audio,
         'new_kokoro_part2_voice':False,'real_payment_or_ai_api':False,
         'owner_full_review':False,'public_release':False,'release_hold':True}
 dest.with_suffix('.json').write_text(json.dumps(result,indent=2)+'\n')
 return result

if __name__=='__main__':
 ap=argparse.ArgumentParser()
 ap.add_argument('--v4c',type=Path,required=True)
 ap.add_argument('--part2',type=Path,required=True)
 ap.add_argument('--output',type=Path,required=True)
 args=ap.parse_args()
 try:print(json.dumps(assemble(args.v4c,args.part2,args.output),indent=2))
 except Exception as ex:raise SystemExit('WORKNOVA_ASSEMBLY_STOP '+str(ex))
