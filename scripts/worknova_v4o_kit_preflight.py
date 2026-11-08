#!/usr/bin/env python3
"""Fail-closed read-only verifier for private WORKNOVA v4o ZIP (no extraction)."""
import argparse
import hashlib
import json
import stat
import subprocess
import sys
import zipfile
from pathlib import Path

SHA = '219b9e21eba9aa77b473f6cfdcc28e7f7afd36d978e7cf37d970f63094856985'
SIZE = 25494944
FILM = 'FILM/WORKNOVA_v4o_170s_PRIVATE.mp4'
REPORT = 'REPORT/WORKNOVA_v4o_170s_PRIVATE.json'
NAMES = frozenset([FILM, REPORT, 'QA/WORKNOVA_v4o_2Seams_BeforeAfter.jpg',
    'scripts/worknova_v4o_seam_fix.py', 'tests/test_worknova_v4o_seam_fix.py',
    'docs/WORKNOVA_V4O_SEAM_REPAIR_PROOF_20261109.md', 'MANIFEST.json'])

def require(ok, why):
    if not ok:
        raise ValueError(why)

def digest(data):
    return hashlib.sha256(data).hexdigest()

def probe_stdin(data):
    try:
        p = subprocess.run(['ffprobe', '-v', 'error', '-show_entries',
            'format=duration:stream=index,codec_type,codec_name,width,height,nb_frames',
            '-of', 'json', 'pipe:0'], input=data, stdout=subprocess.PIPE,
            stderr=subprocess.PIPE, timeout=30, check=False)
    except (OSError, subprocess.TimeoutExpired) as e:
        raise ValueError('V4O_FFPROBE_UNAVAILABLE_OR_TIMEOUT') from e
    require(p.returncode == 0, 'V4O_FFPROBE_FAILED')
    try:
        return json.loads(p.stdout)
    except (ValueError, UnicodeError) as e:
        raise ValueError('V4O_FFPROBE_INVALID_JSON') from e

def inspect(path, *, expected_sha=SHA, expected_size=SIZE, probe=probe_stdin):
    path = Path(path)
    require(path.is_file() and not path.is_symlink(), 'V4O_KIT_NOT_REGULAR_FILE')
    require(0 < path.stat().st_size <= 100*1024*1024, 'V4O_KIT_SIZE_INVALID')
    try:
        with zipfile.ZipFile(path) as z:
            infos = z.infolist()
            names = [i.filename for i in infos]
            require(len(names) == len(NAMES) and set(names) == NAMES,
                'V4O_KIT_MEMBER_SET_INVALID')
            require(sum(i.file_size for i in infos) <= 60*1024*1024,
                'V4O_KIT_UNCOMPRESSED_SIZE_INVALID')
            for i in infos:
                require(not i.is_dir() and not stat.S_ISLNK(i.external_attr >> 16),
                    'V4O_KIT_NONREGULAR_ENTRY')
                require(i.file_size > 0 and i.compress_size > 0 and
                    i.file_size/i.compress_size <= 250, 'V4O_KIT_ZIP_BOMB_GUARD')
            manifest = json.loads(z.read('MANIFEST.json'))
            require(manifest.get('status') == 'PRIVATE_DESIGN_REVIEW_NOT_APPROVED'
                and manifest.get('release_hold') is True
                and manifest.get('no_external_calls') is True
                and manifest.get('no_voice_generated') is True
                and manifest.get('no_srt_generated') is True,
                'V4O_MANIFEST_APPROVAL_OR_PROVIDER_CONTRACT_INVALID')
            entries = manifest.get('entries')
            require(isinstance(entries, dict) and set(entries) == NAMES-{'MANIFEST.json'},
                'V4O_MANIFEST_ENTRIES_INVALID')
            for name in sorted(entries):
                content = z.read(name)
                require(len(content) == entries[name].get('size')
                    and digest(content) == entries[name].get('sha256'),
                    'V4O_ENTRY_HASH_OR_SIZE_MISMATCH')
            film = z.read(FILM)
            report = json.loads(z.read(REPORT))
    except (zipfile.BadZipFile, EOFError, RuntimeError, KeyError,
            TypeError, UnicodeError, json.JSONDecodeError) as e:
        raise ValueError('V4O_KIT_INVALID_OR_CORRUPTED') from e
    require(len(film) == expected_size and digest(film) == expected_sha,
        'V4O_PINNED_FILM_HASH_OR_SIZE_MISMATCH')
    require(manifest.get('film_sha256') == expected_sha
        and manifest.get('frames') == 4250 and manifest.get('film_seconds') == 170,
        'V4O_MANIFEST_FILM_PROOF_MISMATCH')
    require(report.get('status') == 'V4O_PRIVATE_VISUAL_REVIEW_NOT_APPROVED'
        and report.get('film_sha256') == expected_sha
        and report.get('bytes') == expected_size
        and report.get('duration_seconds') == 170 and report.get('frames') == 4250
        and report.get('audio_md5') == 'MD5=2959cc9c1f5ee996edaefb3b06a147ea'
        and report.get('full_av_decode') == 'PASS'
        and report.get('release_hold') is True
        and report.get('provider_calls') == 0
        and report.get('preserved_frames') == 3825
        and report.get('new_voice') is False and report.get('new_srt') is False,
        'V4O_REPORT_NOT_PRIVATE_OR_INCONSISTENT')
    media = probe(film)
    videos = [x for x in media.get('streams', []) if x.get('codec_type') == 'video']
    audios = [x for x in media.get('streams', []) if x.get('codec_type') == 'audio']
    try:
        duration = float(media['format']['duration'])
    except (KeyError, TypeError, ValueError) as e:
        raise ValueError('V4O_DURATION_UNVERIFIED') from e
    require(abs(duration-170) <= 0.01 and len(videos) == 1 and len(audios) == 1
        and videos[0].get('codec_name') == 'h264'
        and videos[0].get('width') == 1920 and videos[0].get('height') == 1080
        and int(videos[0].get('nb_frames', 0)) == 4250
        and audios[0].get('codec_name') == 'aac', 'V4O_MEDIA_FORMAT_UNVERIFIED')
    return {'status':'LOCAL_PRIVATE_V4O_ZIP_VERIFIED_NOT_APPROVED',
        'filename':'WORKNOVA_v4o_170s_PRIVATE.mp4','sha256':expected_sha,
        'bytes':expected_size,'mediaDurationSeconds':duration,
        'mediaDurationProbed':True,'frames':4250,'resolution':'1920x1080',
        'memberCount':len(NAMES),'ownerVisualApproval':False,
        'publiclyUploaded':False,'providerCalls':0,'newVoice':False,
        'newSubtitles':False,'releaseHold':True,
        'note':'Private media integrity only; no release, provider proof or final visual signoff.'}

def main(argv=None):
    parser = argparse.ArgumentParser(description='Read-only private WORKNOVA v4o ZIP preflight')
    parser.add_argument('--kit', required=True)
    args = parser.parse_args(argv)
    try:
        print(json.dumps(inspect(Path(args.kit)), sort_keys=True))
        return 0
    except (ValueError, OSError) as e:
        why = str(e)
        if not why.startswith('V4O_'):
            why = 'V4O_KIT_UNVERIFIED'
        print(json.dumps({'status':'LOCAL_PRIVATE_V4O_ZIP_REJECTED',
            'reason':why,'ownerVisualApproval':False,
            'publiclyUploaded':False,'releaseHold':True}),file=sys.stderr)
        return 2

if __name__ == '__main__':
    raise SystemExit(main())
