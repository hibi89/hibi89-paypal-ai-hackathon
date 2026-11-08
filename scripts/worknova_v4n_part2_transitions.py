#!/usr/bin/env python3
"""WORKNOVA private v4n Gift scene transition clean-up, no speech/SRT/API.

Source is SHA-verified v4m 170s. Creates an 11-second 3-keyframe edit by
reusing only original offline video frames and replacing double-exposed text
with a 0.24s left wipe. It splices back at the original 134s I-frame. The rest of the 170s film is stream copied.
Neither source nor prior Library backup is changed.
"""
from __future__ import annotations
import argparse
import hashlib
import json
import shutil
import subprocess
import tempfile
from pathlib import Path

EXPECTED_PARENT_SHA = '061448ab2ff9c2b97bf8b69fa581f38de90c5820a849d4f6f1987672b1c99f1b'
START, END, FPS = 123, 134, 25
TIMES = (124.2, 128.2, 132.2)
STAGES = ('CONSTRAIN', 'MATCH', 'HUMAN REVIEW')
SOURCE_AUDIO_MD5 = 'MD5=2959cc9c1f5ee996edaefb3b06a147ea'


def sha(path):
    h = hashlib.sha256()
    with Path(path).open('rb') as handle:
        for block in iter(lambda: handle.read(1024 * 1024), b''):
            h.update(block)
    return h.hexdigest()


def run(cmd, timeout=150):
    result = subprocess.run(cmd, capture_output=True, text=True, stdin=subprocess.DEVNULL, timeout=timeout)
    if result.returncode:
        raise RuntimeError('OFFLINE_FFMPEG_FAILED: ' + result.stderr[-900:])
    return result.stdout


def probe(path):
    data = json.loads(run(['ffprobe', '-v', 'error', '-count_packets', '-show_streams', '-show_format', '-of', 'json', str(path)], 30))
    video = [x for x in data['streams'] if x['codec_type'] == 'video']
    audio = [x for x in data['streams'] if x['codec_type'] == 'audio']
    if len(video) != 1 or video[0]['codec_name'] != 'h264' or (video[0]['width'], video[0]['height']) != (1920, 1080):
        raise ValueError('WRONG_SOURCE_VIDEO_GEOMETRY')
    return int(video[0]['nb_read_packets']), round(float(data['format']['duration']), 3), len(audio)


def audio_md5(path):
    return run(['ffmpeg', '-nostdin', '-v', 'error', '-i', str(path), '-map', '0:a:0', '-c:a', 'copy', '-f', 'hash', '-hash', 'md5', '-'], 50).strip()


def preflight(source, chapter, output):
    source, chapter, output = map(Path, (source, chapter, output))
    if (END - START) * FPS != 275 or len(TIMES) != 3 or len(STAGES) != 3:
        raise ValueError('V4N_TIMELINE_DRIFT')
    if not source.is_file() or source.is_symlink() or sha(source) != EXPECTED_PARENT_SHA:
        raise ValueError('V4N_UNAPPROVED_PARENT_OR_SYMLINK')
    if probe(source) != (4250, 170.0, 1):
        raise ValueError('V4N_PARENT_STREAMS_WRONG')
    if audio_md5(source) != SOURCE_AUDIO_MD5:
        raise ValueError('V4N_ORIGINAL_AUDIO_MISMATCH')
    if chapter.resolve() == output.resolve():
        raise ValueError('V4N_CHAPTER_OUTPUT_COLLISION')
    if any(p.exists() or p.is_symlink() for p in (chapter, output, output.with_suffix('.json'))):
        raise FileExistsError('V4N_NO_OVERWRITE')
    if not shutil.which('ffmpeg') or not shutil.which('ffprobe'):
        raise RuntimeError('FFMPEG_REQUIRED')
    return {'status': 'PRIVATE_V4N_PREFLIGHT_PASS', 'source_sha256': EXPECTED_PARENT_SHA,
            'range_seconds': [START, END], 'source_frames': list(TIMES),
            'source_type': 'RECORDED_OFFLINE_KEYFRAMES', 'chapter_frames': 275,
            'new_audio': False, 'srt_created': False, 'external_calls': 0, 'release_hold': True}


def make_chapter(source, dest):
    with tempfile.TemporaryDirectory(prefix='worknova-v4n-keyframes-') as folder:
        frames = []
        for i, t in enumerate(TIMES):
            frame = Path(folder) / f'stage_{i}.png'
            run(['ffmpeg', '-nostdin', '-v', 'error', '-n', '-ss', str(t), '-i', str(source), '-frames:v', '1', str(frame)], 40)
            frames.append(frame)
        cmd = ['ffmpeg', '-nostdin', '-v', 'error', '-n']
        for frame in frames:
            cmd += ['-loop', '1', '-framerate', str(FPS), '-t', '4.16', '-i', str(frame)]
        # Wipe (not opacity crossfade): mutually exclusive side pixels, so no superposed headlines.
        graph = ('[0:v]format=yuv420p[a];[1:v]format=yuv420p[b];[2:v]format=yuv420p[c];'
                 '[a][b]xfade=transition=wipeleft:duration=0.24:offset=3.92[ab];'
                 '[ab][c]xfade=transition=wipeleft:duration=0.24:offset=7.84,format=yuv420p[v]')
        cmd += ['-filter_complex', graph, '-map', '[v]', '-frames:v', '275', '-r', '25',
                '-an', '-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '18',
                '-pix_fmt', 'yuv420p', str(dest)]
        run(cmd, 240)
    if probe(dest) != (275, 11.0, 0):
        raise ValueError('V4N_CHAPTER_DRIFT')


def assemble(source, chapter, output):
    if probe(chapter) != (275, 11.0, 0):
        raise ValueError('V4N_INVALID_CHAPTER')
    with tempfile.TemporaryDirectory(prefix='worknova-v4n-splice-') as root:
        root = Path(root)
        pre, post = root / 'pre.mp4', root / 'post.mp4'
        run(['ffmpeg', '-nostdin', '-v', 'error', '-n', '-i', str(source),
             '-frames:v', str(START * FPS), '-map', '0:v:0', '-an', '-c:v', 'copy', str(pre)], 120)
        run(['ffmpeg', '-nostdin', '-v', 'error', '-n', '-i', str(source),
             '-ss', str(END), '-t', str(170-END), '-map', '0:v:0', '-an', '-c:v', 'copy', str(post)], 120)
        if probe(pre)[0] != 3075 or probe(post)[0] != 900 or probe(pre)[2] != 0 or probe(post)[2] != 0:
            raise ValueError('V4N_OUTSIDE_FRAMES_DRIFT')
        mid = root / 'mid.mp4'
        shutil.copyfile(chapter, mid)
        manifest = root / 'concat.txt'
        manifest.write_text("file 'pre.mp4'\nfile 'mid.mp4'\nfile 'post.mp4'\n", encoding='utf8')
        run(['ffmpeg', '-nostdin', '-v', 'error', '-n', '-f', 'concat', '-safe', '0', '-i', str(manifest),
             '-i', str(source), '-map', '0:v:0', '-map', '1:a:0', '-c:v', 'copy', '-c:a', 'copy',
             '-movflags', '+faststart', str(output)], 180)
    if probe(output) != (4250, 170.0, 1) or audio_md5(output) != SOURCE_AUDIO_MD5:
        output.unlink(missing_ok=True)
        raise ValueError('V4N_FINAL_VIDEO_OR_AUDIO_DRIFT')
    return {'status': 'PRIVATE_V4N_VISUAL_REVIEW_NOT_OWNER_APPROVED',
            'source_sha256': EXPECTED_PARENT_SHA, 'film_sha256': sha(output),
            'film_bytes': output.stat().st_size, 'chapter_sha256': sha(chapter),
            'frames': 4250, 'duration_seconds': 170.0, 'edit_seconds': [START, END],
            'edit_reason': 'REMOVE_GIFT_TEXT_CROSSFADE_GHOSTING',
            'audio_packet_md5': SOURCE_AUDIO_MD5, 'new_voice': False,
            'new_subtitles': False, 'provider_calls': 0, 'published': False,
            'release_hold': True, 'owner_visual_approval': False}


def render(source, chapter, output):
    proof = preflight(source, chapter, output)
    chapter.parent.mkdir(parents=True, exist_ok=True)
    output.parent.mkdir(parents=True, exist_ok=True)
    try:
        make_chapter(source, chapter)
        proof = assemble(source, chapter, output)
        output.with_suffix('.json').write_text(json.dumps(proof, indent=2)+'\n', encoding='utf8')
    except Exception:
        output.unlink(missing_ok=True)
        chapter.unlink(missing_ok=True)
        raise
    return proof


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--source', required=True, type=Path)
    parser.add_argument('--chapter-output', required=True, type=Path)
    parser.add_argument('--output', required=True, type=Path)
    parser.add_argument('--check-only', action='store_true')
    args = parser.parse_args()
    out = preflight(args.source, args.chapter_output, args.output) if args.check_only else render(args.source,args.chapter_output,args.output)
    print(json.dumps(out, indent=2))

if __name__ == '__main__':
    main()
