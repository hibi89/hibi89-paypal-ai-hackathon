"""The final offline v4h assembly must never overwrite or use unapproved bytes."""
import importlib.util
from pathlib import Path
import tempfile
import unittest

SCRIPT=Path(__file__).resolve().parents[1]/'scripts'/'worknova_v4h_fullcut.py'
spec=importlib.util.spec_from_file_location('worknova_v4h_fullcut',SCRIPT)
mod=importlib.util.module_from_spec(spec);spec.loader.exec_module(mod)

class V4HFullcutTests(unittest.TestCase):
 def test_exact_approved_version_sha(self):
  self.assertEqual(mod.V4H,'70525df7a240fe8d08bbb02bb4ed8feca8401f93980491b90ba9f94440659a44')
  self.assertNotEqual(mod.V4C,mod.V4H)
 def test_existing_output_is_preserved(self):
  with tempfile.TemporaryDirectory() as d:
   p=Path(d);out=p/'out.mp4';out.write_bytes(b'untouched')
   with self.assertRaisesRegex(FileExistsError,'OUTPUT_EXISTS__NO_OVERWRITE'):
    mod.assemble(p/'x.mp4',p/'y.mp4',out)
   self.assertEqual(out.read_bytes(),b'untouched')
 def test_missing_original_stops_without_creating_video(self):
  with tempfile.TemporaryDirectory() as d:
   p=Path(d);out=p/'out.mp4'
   with self.assertRaisesRegex(ValueError,'ORIGINAL_SOURCE_MISSING_OR_SYMLINK'):
    mod.assemble(p/'missing.mp4',p/'missing2.mp4',out)
   self.assertFalse(out.exists())
 def test_corrupted_inputs_fail_before_processing(self):
  with tempfile.TemporaryDirectory() as d:
   p=Path(d);a=p/'base.mp4';b=p/'part2.mp4';out=p/'out.mp4'
   a.write_bytes(b'wrong');b.write_bytes(b'also wrong')
   with self.assertRaisesRegex(ValueError,'UNAPPROVED_SOURCE_SHA'):
    mod.assemble(a,b,out)
   self.assertFalse(out.exists())

if __name__=='__main__':unittest.main()
