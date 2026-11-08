"""Strict offline contract checks for WORKNOVA v4o black-panel flash repair.

No film, provider access, generated speech or network is needed for these tests.
"""
from __future__ import annotations
import importlib.util
from pathlib import Path
import subprocess
import tempfile
import unittest
from unittest.mock import patch

SCRIPT=Path(__file__).resolve().parents[1]/'scripts'/'worknova_v4o_seam_fix.py'
if not SCRIPT.is_file():
    SCRIPT=Path(__file__).resolve().parent/'worknova_v4o_seam_fix.py'
if not SCRIPT.is_file():
    raise FileNotFoundError('v4o script missing from scripts/ or beside test')
spec=importlib.util.spec_from_file_location('worknova_v4o',SCRIPT)
v=importlib.util.module_from_spec(spec)
spec.loader.exec_module(v)

class TestV4OSeamRepair(unittest.TestCase):
    def test_exact_parent_digest_pinned(self):
        self.assertEqual(v.EXPECTED_SOURCE,'b4e2676bc8fdb12ff5b6b9378a82fe2fde7fda2def6170ee3d57c07429c2e62b')

    def test_original_and_repair_ranges_cover_170_seconds(self):
        self.assertEqual(v.ORIGINAL_RANGES,((0,104),(114,154),(161,170)))
        self.assertEqual(v.REPLACEMENTS,((104,114),(154,161)))
        spans=sorted(v.ORIGINAL_RANGES+v.REPLACEMENTS)
        self.assertEqual(spans[0][0],0)
        self.assertEqual(spans[-1][1],170)
        self.assertTrue(all(a[1]==b[0] for a,b in zip(spans,spans[1:])))

    def test_only_425_frames_reencoded(self):
        changed=sum((b-a)*v.FPS for a,b in v.REPLACEMENTS)
        unchanged=sum((b-a)*v.FPS for a,b in v.ORIGINAL_RANGES)
        self.assertEqual((changed,unchanged,changed+unchanged),(425,3825,4250))

    def test_approved_aac_digest_pinned(self):
        self.assertEqual(v.EXPECTED_AUDIO,'MD5=2959cc9c1f5ee996edaefb3b06a147ea')

    def test_missing_original_rejected(self):
        with tempfile.TemporaryDirectory() as t:
            with self.assertRaises(ValueError):
                v.ensure(Path(t)/'nonexistent.mp4',Path(t)/'out.mp4')

    def test_unapproved_original_bytes_rejected(self):
        with tempfile.TemporaryDirectory() as t:
            src=Path(t)/'fake.mp4';src.write_bytes(b'not a verified film')
            with self.assertRaisesRegex(ValueError,'APPROVED_V4N_PARENT_SHA_REQUIRED'):
                v.ensure(src,Path(t)/'out.mp4')

    def test_symlink_original_rejected(self):
        with tempfile.TemporaryDirectory() as t:
            source=Path(t)/'film.mp4';source.write_bytes(b'foo')
            alias=Path(t)/'alias.mp4';alias.symlink_to(source)
            with self.assertRaises(ValueError):
                v.ensure(alias,Path(t)/'out.mp4')

    def test_original_file_never_overwritten(self):
        with tempfile.TemporaryDirectory() as t:
            src=Path(t)/'trusted.mp4';src.write_bytes(b'123')
            with patch.object(v,'digest',return_value=v.EXPECTED_SOURCE),\
                 patch.object(v,'probe',return_value=(4250,170.0,1)),\
                 patch.object(v,'audio_md5',return_value=v.EXPECTED_AUDIO):
                with self.assertRaises(FileExistsError):v.ensure(src,src)
                out=Path(t)/'existing.mp4';out.write_bytes(b'keep')
                with self.assertRaises(FileExistsError):v.ensure(src,out)
                self.assertEqual(out.read_bytes(),b'keep')

    def test_expected_source_wrong_aac_blocked(self):
        with tempfile.TemporaryDirectory() as t:
            src=Path(t)/'trusted.mp4';src.write_bytes(b'123')
            with patch.object(v,'digest',return_value=v.EXPECTED_SOURCE),\
                 patch.object(v,'probe',return_value=(4250,170.0,1)),\
                 patch.object(v,'audio_md5',return_value='MD5=WRONG'):
                with self.assertRaisesRegex(ValueError,'PARENT_STREAM_OR_AUDIO_CHANGED'):
                    v.ensure(src,Path(t)/'new.mp4')

    def test_packet_parity_for_outside_ranges(self):
        original=[str(i) for i in range(4250)]
        revised=original.copy()
        for start,end in ((2600,2850),(3850,4025)):
            for i in range(start,end):revised[i]='reencoded'+str(i)
        with patch.object(v,'packet_hashes',side_effect=(original,revised)):
            result=v.prove_original_parity(Path('parent'),Path('new'))
        self.assertEqual(result['outside_edit_h264_packet_sha256_equal'],3825)
        self.assertEqual(result['edited_video_packets'],425)

    def test_original_packet_mutation_outside_ranges_fails(self):
        a=[str(i) for i in range(4250)];b=a.copy()
        b[2600]='changed';b[3850]='changed';b[1234]='unexpected'
        with patch.object(v,'packet_hashes',side_effect=(a,b)):
            with self.assertRaisesRegex(ValueError,'OUTSIDE_EDIT_VIDEO_PACKET_MISMATCH_1234'):
                v.prove_original_parity(Path('parent'),Path('new'))

    def test_no_changes_fails(self):
        a=[str(i) for i in range(4250)]
        with patch.object(v,'packet_hashes',side_effect=(a,a.copy())):
            with self.assertRaisesRegex(ValueError,'SEAM_SEGMENT_NOT_CHANGED'):
                v.prove_original_parity(Path('parent'),Path('new'))

    def test_repair_filter_repeats_next_recorded_frame(self):
        outputs=[]
        def fake_call(args,timeout=180):
            outputs.append(args)
            return ''
        with patch.object(v,'call',side_effect=fake_call),patch.object(v,'probe',return_value=(250,10.0,0)):
            v.fix_seam(Path('previous.mp4'),104,114,Path('fresh.mp4'))
        joined=' '.join(outputs[0])
        self.assertIn('trim=start_frame=1:end_frame=2',joined)
        self.assertIn('trim=start_frame=1:end_frame=250',joined)
        self.assertNotIn('lavfi',joined)

    def test_sequential_split_avoids_random_keyframe_seek(self):
        with tempfile.TemporaryDirectory() as t:
            paths=[Path(t)/f'original_{i:02}.mp4' for i in range(5)]
            def fake_call(args,timeout=180):
                for p in paths:p.write_bytes(b'dummy')
                self.assertNotIn('-ss',args)
                self.assertIn('-segment_times',args)
                return ''
            with patch.object(v,'call',side_effect=fake_call),\
                 patch.object(v,'probe',side_effect=[(n,sec,0) for n,sec in zip((2600,250,1000,175,225),(104,10,40,7,9))]):
                got=v.split_original(Path('src.mp4'),Path(t))
            self.assertEqual(got,paths)

    def test_check_plan_no_output_or_credentials(self):
        proc=subprocess.run(['python',str(SCRIPT),'--check-plan'],capture_output=True,text=True,timeout=10)
        self.assertEqual(proc.returncode,0,proc.stderr)
        self.assertIn('"external_calls": 0',proc.stdout)
        self.assertIn('"new_voice": false',proc.stdout)
        self.assertIn('"release_hold": true',proc.stdout)

if __name__=='__main__':unittest.main()
