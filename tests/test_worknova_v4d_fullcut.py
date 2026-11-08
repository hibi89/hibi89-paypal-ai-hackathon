"""Fast zero-network safety tests for private 170s v4d assembler."""
import importlib.util
from pathlib import Path
import tempfile
import unittest

SCRIPT=Path(__file__).resolve().parents[1]/'scripts'/'worknova_v4d_fullcut.py'
spec=importlib.util.spec_from_file_location('worknova_v4d_fullcut',SCRIPT)
m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)

class FullcutTests(unittest.TestCase):
 def test_approved_sha_and_170s_contract(self):
  self.assertEqual(len(m.V4C),64)
  self.assertEqual(len(m.V4D),64)
  self.assertNotEqual(m.V4C,m.V4D)
 def test_nonexistent_source_is_rejected(self):
  with tempfile.TemporaryDirectory() as d:
   p=Path(d)
   with self.assertRaisesRegex(ValueError,'ORIGINAL_SOURCE_MISSING_OR_SYMLINK'):
    m.assemble(p/'no.mp4',p/'missing.mp4',p/'out.mp4')
   self.assertFalse((p/'out.mp4').exists())
 def test_existing_output_is_untouched(self):
  with tempfile.TemporaryDirectory() as d:
   p=Path(d);o=p/'out.mp4';o.write_bytes(b'keep')
   with self.assertRaisesRegex(FileExistsError,'OUTPUT_EXISTS__NO_OVERWRITE'):
    m.assemble(p/'no.mp4',p/'missing.mp4',o)
   self.assertEqual(o.read_bytes(),b'keep')
 def test_wrong_file_checksum_is_rejected(self):
  with tempfile.TemporaryDirectory() as d:
   p=Path(d);a=p/'a.mp4';b=p/'b.mp4';a.write_bytes(b'a');b.write_bytes(b'b')
   with self.assertRaisesRegex(ValueError,'UNAPPROVED_SOURCE_SHA__STOP'):
    m.assemble(a,b,p/'out.mp4')
   self.assertFalse((p/'out.mp4').exists())

if __name__=='__main__':unittest.main()
