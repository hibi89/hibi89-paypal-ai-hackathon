"""Offline visual QA contract: authentic source, no TTS, no source overwrite."""
import importlib.util
from pathlib import Path
import tempfile
import unittest

ROOT=Path(__file__).resolve().parents[1]

def load(name,path):
    spec=importlib.util.spec_from_file_location(name,path)
    module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
    return module

d=load('v4i_design',ROOT/'scripts/worknova_part2_v4i_design.py')
c=load('v4i_fullcut',ROOT/'scripts/worknova_v4i_fullcut.py')

class V4iVisualSafety(unittest.TestCase):
    def test_12s_three_stage_contract(self):
        self.assertEqual((d.GIFT_START,d.GIFT_END),(19,31))
        self.assertEqual(len(d.STAGES),3)
        self.assertEqual(d.SLIDE_SECONDS*3-d.FADE_SECONDS*2,12)
        self.assertEqual(len(d.STILL_TIMES),3)
    def test_actual_recording_values_not_fabricated(self):
        self.assertIn(('STYLE','PRACTICAL'),d.STAGES[0][3])
        self.assertIn(('PRICE LIMIT','$39.00'),d.STAGES[0][3])
        self.assertIn(('CATALOG','OWNER-SUPPLIED LOCAL'),d.STAGES[1][3])
        self.assertIn(('PRICE LIMIT','$40.00'),d.STAGES[1][3])
        self.assertIn(('PAYMENT','NOT AUTHORIZED'),d.STAGES[2][3])
    def test_recording_and_film_hash_pinned(self):
        self.assertEqual(len(d.SOURCE_SHA),64)
        self.assertEqual(len(d.PARENT_SHA),64)
        self.assertEqual(len(c.V4C),64)
        self.assertEqual(c.V4I,'5c421dd6d729869b9278b6f9f7a9a4213fab6c4457b9bb71ab9cbf2e4ab166f2')
    def test_wrong_source_rejected_before_output(self):
        with tempfile.TemporaryDirectory() as td:
            p=Path(td);a=p/'a.webm';b=p/'b.mp4';o=p/'out.mp4'
            a.write_bytes(b'fake');b.write_bytes(b'fake')
            with self.assertRaisesRegex(ValueError,'UNVERIFIED_PRIVATE_SOURCE'):
                d.preflight(a,b,o)
            self.assertFalse(o.exists())
    def test_existing_output_never_overwritten(self):
        with tempfile.TemporaryDirectory() as td:
            p=Path(td);a=p/'a.webm';b=p/'b.mp4';o=p/'out.mp4'
            o.write_bytes(b'preserved')
            with self.assertRaises((ValueError,FileExistsError)):
                d.preflight(a,b,o)
            self.assertEqual(o.read_bytes(),b'preserved')
    def test_exact_snapshots_are_stills_not_fake_clicks(self):
        self.assertEqual(d.STILL_TIMES,(90.5,96.5,99.5))
        self.assertTrue(any('EDITORIAL REPLAY' in str(x) for x in d.make_slide.__code__.co_consts))
    def test_assembler_requires_no_audio_on_part2_input(self):
        src=(ROOT/'scripts/worknova_v4i_fullcut.py').read_text()
        self.assertIn('packets(chapter)!=(1250,50.0,0)',src)
        self.assertIn('audio_md5(dest)!=before_audio',src)
    def test_visual_stage_slide_shape(self):
        from PIL import Image
        with tempfile.TemporaryDirectory() as td:
            p=Path(td);snap=p/'snapshot.png';out=p/'slide.png'
            Image.new('RGB',(1600,900),(240,240,240)).save(snap)
            d.make_slide(snap,0,out)
            with Image.open(out) as rendered:
                self.assertEqual(rendered.size,(1920,1080))

if __name__=='__main__':unittest.main()
