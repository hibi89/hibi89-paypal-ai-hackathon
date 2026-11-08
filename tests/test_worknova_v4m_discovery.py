"""Offline guard regressions for private WORKNOVA v4m discovery footer."""
import importlib.util
import tempfile
import unittest
from pathlib import Path
from unittest import mock

SCRIPT = Path(__file__).with_name('worknova_v4m_discovery.py')
SPEC = importlib.util.spec_from_file_location('worknova_v4m_discovery', SCRIPT)
M = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(M)

class V4mDiscoveryTests(unittest.TestCase):
    def test_exact_edit_window_and_stages(self):
        self.assertEqual((M.START,M.END,M.FPS),(12,43,25))
        self.assertEqual((M.END-M.START)*M.FPS,775)
        self.assertEqual(len(M.STEPS),5)
        self.assertEqual([(s[0],s[1]) for s in M.STEPS],[(0,6),(6,12),(12,19),(19,24),(24,31)])

    def test_provenance_disclosures(self):
        self.assertIn('preserving clicks/audio', M.__doc__ or '')
        self.assertEqual(len(M.SOURCE_SHA),64)
        self.assertIn('quote',M.STEPS[-1][2].lower())
        self.assertEqual(M.STEPS[0][0],0)

    def test_source_hash_guards_fail_closed(self):
        with tempfile.TemporaryDirectory() as tmp:
            d=Path(tmp); source=d/'wrong.mp4';source.write_bytes(b'wrong movie')
            with self.assertRaisesRegex(ValueError,'UNAPPROVED_SOURCE'):
                M.preflight(source,d/'new.mp4',d/'output.mp4')

    def test_symlink_rejected(self):
        with tempfile.TemporaryDirectory() as tmp:
            d=Path(tmp);p=d/'source.mp4';p.write_bytes(b'unapproved');link=d/'link.mp4';link.symlink_to(p)
            with self.assertRaisesRegex(ValueError,'SYMLINK'):
                M.preflight(link,d/'chapter.mp4',d/'out.mp4')

    def test_collision_rejected_before_render(self):
        with tempfile.TemporaryDirectory() as tmp:
            d=Path(tmp);inp=d/'input.mp4';inp.write_bytes(b'valid for mock')
            with mock.patch.object(M,'digest',return_value=M.SOURCE_SHA), mock.patch.object(M,'probe',return_value=(4250,170.0,1)):
                with self.assertRaisesRegex(ValueError,'OUTPUT_COLLISION'):
                    M.preflight(inp,d/'same.mp4',d/'same.mp4')
                collision=d/'existing.mp4';collision.write_bytes(b'original')
                with self.assertRaises(FileExistsError):
                    M.preflight(inp,d/'chapter.mp4',collision)
                self.assertEqual(collision.read_bytes(),b'original')

    def test_bad_timeline_fails_closed(self):
        with tempfile.TemporaryDirectory() as tmp:
            d=Path(tmp)
            with mock.patch.object(M,'STEPS',((0,4,'a','b'),(5,31,'c','d'))):
                with self.assertRaisesRegex(ValueError,'TIMELINE_DRIFT'):
                    M.preflight(d/'missing.mp4',d/'chapter.mp4',d/'out.mp4')

    def test_stage_text_is_known_and_non_transactional(self):
        all_text=' '.join(s[2]+' '+s[3] for s in M.STEPS).lower()
        for word in ('vision','evidence','ai work','global services','quote'):
            self.assertIn(word,all_text)
        self.assertNotIn('captured',all_text)
        self.assertNotIn('paid',all_text)

if __name__ == '__main__':unittest.main()
