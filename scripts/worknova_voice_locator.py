#!/usr/bin/env python3
"""Read-only, bounded offline search for the owner's previously approved Kokoro files.

No network, no downloads, no copying or user database access. Only caller-provided
roots are examined. Exactly matching sha256 hashes are required; symlinks ignored.
"""
from __future__ import annotations
import argparse
import hashlib
import json
import os
import sys
from pathlib import Path

MODEL_FILE = 'kokoro-v1.0.fp16.onnx'
VOICE_FILE = 'voices-v1.0.bin'
MODEL_SHA = 'f3a290d384fbb27966d462905c71a46cef9e5fd00516b40df32a0b4afe77ac96'
VOICE_SHA = 'bca610b8308e8d99f32e6fe4197e7ec01679264efed0cac9140fe9c29f1fbf7d'
MODEL_MIN_SIZE = 150_000_000
VOICE_MIN_SIZE = 10_000_000
SKIP = {'.git', 'node_modules', '__pycache__', '.next', '.pytest_cache', 'venv', '.venv'}

def checksum(path):
    h=hashlib.sha256()
    with path.open('rb') as f:
        for chunk in iter(lambda:f.read(1024*1024),b''):h.update(chunk)
    return h.hexdigest()

def candidate_ok(folder):
    """Verify both local files, never following a symlink."""
    m=folder/MODEL_FILE
    v=folder/VOICE_FILE
    try:
        if (not m.is_file() or not v.is_file() or m.is_symlink() or v.is_symlink() or
            m.stat().st_size<MODEL_MIN_SIZE or v.stat().st_size<VOICE_MIN_SIZE):
            return False
        return checksum(m)==MODEL_SHA and checksum(v)==VOICE_SHA
    except (OSError,PermissionError):return False

def discover(roots,max_depth=7,max_dirs=3500):
    if max_dirs<1 or not 0<=max_depth<=12:raise ValueError('UNSAFE_SEARCH_LIMIT')
    visited=0
    matches=[]
    truncated=False
    for given in roots:
        root=Path(given).expanduser()
        if not root.is_dir() or root.is_symlink():continue
        stack=[(root,0)]
        while stack:
            here,depth=stack.pop()
            if visited>=max_dirs:
                truncated=True
                break
            visited+=1
            if candidate_ok(here):matches.append(str(here.resolve()))
            if depth>=max_depth:continue
            try:
                dirs=[Path(ent.path) for ent in os.scandir(here) if ent.is_dir(follow_symlinks=False)
                      and ent.name not in SKIP and not ent.name.startswith('.git')]
                stack.extend((p,depth+1) for p in sorted(dirs,reverse=True))
            except (OSError,PermissionError):continue
        if truncated:break
    return {'status':'PINNED_KOKORO_FOUND' if matches else 'PINNED_KOKORO_NOT_FOUND',
            'verified_model_dirs':sorted(set(matches)),'directories_visited':visited,
            'limit_reached':truncated,'network_requests':0,'files_copied':0,
            'public_upload':False,'model_sha256_required':MODEL_SHA,'voice_sha256_required':VOICE_SHA}

def main():
    p=argparse.ArgumentParser(description='Read-only offline model+voicepack locator')
    p.add_argument('--root',action='append',type=Path,required=True,
                   help='Explicit local folder to inspect; repeat for multiple roots')
    p.add_argument('--max-depth',type=int,default=7)
    p.add_argument('--max-dirs',type=int,default=3500)
    a=p.parse_args()
    try:
        result=discover(a.root,a.max_depth,a.max_dirs)
        print(json.dumps(result,ensure_ascii=False,indent=2))
        return 0 if result['verified_model_dirs'] else 2
    except ValueError as e:
        print('WORKNOVA_VOICE_LOCATOR_STOP '+str(e),file=sys.stderr)
        return 2
if __name__=='__main__':raise SystemExit(main())
