"""Offline, zero-provider tests for the exact WorkNova v4l visual storyboard."""
import importlib.util
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch

HERE=Path(__file__).resolve().parent
CANDIDATES=(HERE/'worknova_v4l_delivery.py',HERE.parent/'scripts'/'worknova_v4l_delivery.py',HERE.parent/'SOURCE'/'worknova_v4l_delivery.py')
SRC=next((p for p in CANDIDATES if p.exists()),CANDIDATES[0])
spec=importlib.util.spec_from_file_location('worknova_v4l_delivery',SRC)
m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)

class DeliveryDesignTests(unittest.TestCase):
 def test_only_expected_originals(self):
  self.assertEqual(len(m.SOURCE_SHA),64)
  self.assertEqual(len(m.AUTO_SHA),64)
  self.assertNotEqual(m.SOURCE_SHA,m.AUTO_SHA)
 def test_five_recorded_synthetic_states(self):
  self.assertEqual([s[1] for s in m.STEPS],['CONTRACT CREATED','EVIDENCE SUBMITTED','REVIEWER REJECTS','OWNER RESUBMITS','REVIEWER ACCEPTS'])
  self.assertEqual([s[0] for s in m.STEPS],['01','02','03','04','05'])
  self.assertTrue(all(len(s)==7 for s in m.STEPS))
  self.assertIn('ACCEPTED is not PayPal capture',m.STEPS[-1][4])
 def test_scene_math(self):
  self.assertEqual((m.FILM_START,m.FILM_END,m.FPS),(75,94,25))
  self.assertEqual(m.STILL_FRAMES*5-m.FADE_FRAMES*4,19*25)
 def test_wrong_source_fails_closed_without_writes(self):
  with tempfile.TemporaryDirectory() as td:
   root=Path(td); a=root/'a.mp4';b=root/'b.webm';o=root/'out.mp4';c=root/'scene.mp4'
   a.write_bytes(b'fake');b.write_bytes(b'fake')
   with self.assertRaisesRegex(ValueError,'SOURCE_SHA_OR_SYMLINK_MISMATCH'):
    m.preflight(a,b,o,c)
   self.assertFalse(o.exists());self.assertFalse(c.exists())
 def test_existing_output_cannot_be_overwritten(self):
  with tempfile.TemporaryDirectory() as td:
   p=Path(td);original=p/'output.mp4';original.write_bytes(b'preserve source')
   # The invalid source check runs first; this still proves the output remains untouched.
   with self.assertRaises(ValueError):
    m.preflight(p/'absent1',p/'absent2',original,p/'other.mp4')
   self.assertEqual(original.read_bytes(),b'preserve source')
 def test_output_alias_guard_with_pinned_inputs(self):
  with tempfile.TemporaryDirectory() as td:
   p=Path(td);o=p/'new.mp4';o.write_bytes(b'keep')
   with self.assertRaisesRegex(FileExistsError,'OUTPUT_EXISTS_NO_OVERWRITE'):
    with patch.object(m,'sha',side_effect=[m.SOURCE_SHA,m.AUTO_SHA]):
     with patch.object(Path,'is_file',return_value=True):
      m.preflight(p/'source.mp4',p/'auto.webm',o,p/'chapter.mp4')
   self.assertEqual(o.read_bytes(),b'keep')
 def test_cli_rejects_forged_inputs(self):
  with tempfile.TemporaryDirectory() as td:
   p=Path(td);r=subprocess.run([sys.executable,str(SRC), '--source',str(p/'no.mp4'),
      '--auto-source',str(p/'no.webm'),'--output',str(p/'out.mp4'),
      '--chapter-output',str(p/'cut.mp4'),'--check-only'],capture_output=True,text=True,timeout=7)
   self.assertNotEqual(r.returncode,0)
   self.assertIn('SOURCE_SHA_OR_SYMLINK_MISMATCH',r.stderr)
 def test_no_external_fetch_or_voice(self):
  s=SRC.read_text(encoding='utf8')
  for forbidden in ('requests.get(', 'urllib.request', 'https://api.',
       'paypal.com/v2/checkout','--render-voice', '--publish','subtitles_from_voice'):
   self.assertNotIn(forbidden,s)

if __name__=='__main__':unittest.main()
