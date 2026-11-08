"""Offline regression for the source-SHA-pinned v4p6 visual editor.
These synthetic fixtures are NOT user-viewing approval or actual browser scrolling.
"""
from __future__ import annotations
import importlib.util
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch
from PIL import Image

SCRIPT=Path(__file__).resolve().parents[1]/'scripts'/'worknova_v4p6_editor.py'
spec=importlib.util.spec_from_file_location('worknova_v4p6_editor',SCRIPT)
m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)

class VisualContractTests(unittest.TestCase):
 def test_plan_is_exact_and_no_publication(self):
  self.assertEqual(m.CUT_SEC,22)
  self.assertEqual(m.FRAMES,4250)
  self.assertEqual(m.CUT_FRAMES,550)
  self.assertEqual(m.SCROLL_DURATION_SECONDS,2.4)
  self.assertEqual(m.SCROLL_END_FRAME-m.SCROLL_START_FRAME,60)
  self.assertEqual(len(m.EXPECTED_V4O),64)
  self.assertEqual(len(m.EXPECTED_BRAND_SHA),64)
  self.assertEqual(m.ORIGINAL_AUDIO,'MD5=2959cc9c1f5ee996edaefb3b06a147ea')
  result=subprocess.run([sys.executable,str(SCRIPT),'--check-plan'],capture_output=True,text=True,check=True)
  d=json.loads(result.stdout)
  self.assertEqual(d['uncut_h264_packets'],3700)
  self.assertTrue(d['editorial_not_new_browser_scroll'])
  self.assertTrue(d['no_voice_no_publish'])
  self.assertEqual(d['scroll_duration_seconds'],2.4)
  self.assertEqual(d['scroll_faster_factor'],3.0)
 def test_missing_source_fails_closed(self):
  with tempfile.TemporaryDirectory() as d:
   root=Path(d);brand=root/'brand.png';Image.new('RGB',(1920,1080)).save(brand)
   out=root/'out.mp4'
   with self.assertRaisesRegex(ValueError,'ORIGINAL_FILE_REQUIRED'):
    m.contract(root/'absent.mp4',brand,out)
   self.assertFalse(out.exists())
 def test_source_hash_mismatch_prevents_output(self):
  with tempfile.TemporaryDirectory() as d:
   root=Path(d);src=root/'fake.mp4';src.write_bytes(b'not a real film')
   brand=root/'brand.png';Image.new('RGB',(1920,1080)).save(brand)
   out=root/'out.mp4'
   with self.assertRaisesRegex(ValueError,'EXACT_V4O_PARENT_SHA_REQUIRED'):
    m.contract(src,brand,out)
   self.assertFalse(out.exists())
 def test_mutated_brand_rejected_even_when_film_hash_is_mocked(self):
  with tempfile.TemporaryDirectory() as d:
   root=Path(d);src=root/'fake.mp4';src.write_bytes(b'synthetically verified film')
   brand=root/'brand.png';Image.new('RGB',(1920,1080),'red').save(brand)
   with patch.object(m,'digest',side_effect=lambda p:m.EXPECTED_V4O if p==src else '0'*64):
    with self.assertRaisesRegex(ValueError,'PINNED_BRAND_ASSET_REQUIRED'):
     m.contract(src,brand,root/'new.mp4')
 def test_output_overwrite_fails_before_ffmpeg(self):
  with tempfile.TemporaryDirectory() as d:
   root=Path(d);src=root/'dummy.mp4';src.write_bytes(b'x')
   brand=root/'brand.png';Image.new('RGB',(1920,1080)).save(brand)
   out=root/'old.mp4';out.write_bytes(b'keep me')
   def h(p):return m.EXPECTED_V4O if p==src else m.EXPECTED_BRAND_SHA
   with patch.object(m,'digest',side_effect=h):
    with self.assertRaisesRegex(FileExistsError,'DO_NOT_OVERWRITE'):
     m.contract(src,brand,out)
   self.assertEqual(out.read_bytes(),b'keep me')
 def test_stills_only_source_crops_and_concept_banner(self):
  with tempfile.TemporaryDirectory() as d:
   root=Path(d)
   def mock_extract(_src,t,dst):
    color='navy' if abs(t-12.04)<0.01 else 'white'
    Image.new('RGB',(1920,1080),color).save(dst)
   with patch.object(m,'extract_frame',side_effect=mock_extract):
    canvas,background,target=m.make_scroll_stills(root/'fixture.mp4',root)
   with Image.open(canvas) as im:self.assertEqual(im.size,(1320,1730))
   with Image.open(background) as im:self.assertEqual(im.size,(1920,1080))
   with Image.open(target) as im:self.assertEqual(im.size,(1920,1080))
 def test_source_has_no_api_or_cloud_transports(self):
  src=SCRIPT.read_text(encoding='utf8')
  for forbidden in ('requests.post(', 'urllib.request', 'paypal.com/v2/checkout', 'openai.api_key'):
   self.assertNotIn(forbidden,src)

if __name__=='__main__':unittest.main()
