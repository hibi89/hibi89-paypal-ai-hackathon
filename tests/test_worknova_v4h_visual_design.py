"""Offline fail-closed WorkNova v4h visual storyboard checks."""
import importlib.util
import tempfile
from pathlib import Path
import unittest

SCRIPT=Path(__file__).resolve().parents[1]/'scripts'/'worknova_part2_v4h_storyboard.py'
spec=importlib.util.spec_from_file_location('worknova_part2_v4h_storyboard',SCRIPT)
mod=importlib.util.module_from_spec(spec);spec.loader.exec_module(mod)

class V4HStoryboardTests(unittest.TestCase):
 def test_all_five_agents_have_three_contiguous_editorial_beats(self):
  d=mod.plan()
  self.assertEqual(d['beats'],15)
  self.assertEqual(d['frames'],1250)
  self.assertEqual(len(mod.SCENES),5)
  self.assertEqual([x[0] for x in mod.SCENES],['DELEGATE','A2A NEGOTIATION','GIFT FINDER','CHURN SAVER','INVOICE / DISPUTE'])
  self.assertFalse(d['voice_rendered'])
  self.assertEqual(d['external_requests'],0)
 def test_refuse_unknown_source_without_write(self):
  with tempfile.TemporaryDirectory() as d:
   p=Path(d);a=p/'v4d.mp4';b=p/'owner.webm';out=p/'out.mp4'
   a.write_bytes(b'fake footage');b.write_bytes(b'fake browser')
   with self.assertRaisesRegex(ValueError,'UNVERIFIED_VIDEO_SOURCE'):
    mod.render(a,b,out)
   self.assertFalse(out.exists())
 def test_refuse_output_overwrite_even_with_fake_inputs(self):
  with tempfile.TemporaryDirectory() as d:
   p=Path(d);o=p/'out.mp4';o.write_bytes(b'existing')
   with self.assertRaisesRegex(ValueError,'UNVERIFIED_VIDEO_SOURCE'):
    mod.render(p/'missing-a',p/'missing-b',o)
   self.assertEqual(o.read_bytes(),b'existing')
 def test_no_hardcoded_inconsistent_selection_values(self):
  raw=SCRIPT.read_text(encoding='utf-8')
  self.assertNotIn("'SELECTION','Fictional desk-light-b'",raw)
  self.assertIn('gift_original_keyframe_seconds',raw)
  self.assertIn('OFFLINE RECORDING  /  KEYFRAME REPLAY',raw)
  self.assertNotIn('kokoro_onnx',raw)

if __name__=='__main__':unittest.main()
