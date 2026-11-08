import importlib.util
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

SCRIPT = Path(__file__).with_name('worknova_v4n_part2_transitions.py')
if not SCRIPT.is_file():
    SCRIPT = Path(__file__).resolve().parent.parent / 'scripts/worknova_v4n_part2_transitions.py'
spec=importlib.util.spec_from_file_location('worknova_v4n_part2_transitions',SCRIPT)
m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)

class V4NSceneSafety(unittest.TestCase):
    def test_exact_film_coordinates(self):
        self.assertEqual((m.START,m.END,m.FPS),(123,134,25))
        self.assertEqual((m.END-m.START)*m.FPS,275)
        self.assertEqual(len(m.TIMES),3)
    def test_time_separated_evidence(self):
        self.assertEqual(m.STAGES,('CONSTRAIN','MATCH','HUMAN REVIEW'))
        self.assertEqual(m.TIMES,(124.2,128.2,132.2))
    def test_sha_pin_and_original_audio(self):
        self.assertEqual(len(m.EXPECTED_PARENT_SHA),64)
        self.assertEqual(m.SOURCE_AUDIO_MD5,'MD5=2959cc9c1f5ee996edaefb3b06a147ea')
    def test_reject_wrong_source_before_actions(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp); fake=root/'wrong.mp4';fake.write_bytes(b'fake')
            with self.assertRaisesRegex(ValueError,'UNAPPROVED_PARENT'):
                m.preflight(fake,root/'a.mp4',root/'b.mp4')
    def test_no_output_clobber(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp); src=root/'src.mp4';src.write_bytes(b'safe')
            with patch.object(m,'sha',return_value=m.EXPECTED_PARENT_SHA),patch.object(m,'probe',return_value=(4250,170.0,1)),patch.object(m,'audio_md5',return_value=m.SOURCE_AUDIO_MD5):
                prior=root/'prior.mp4';prior.write_bytes(b'preserved')
                with self.assertRaisesRegex(FileExistsError,'NO_OVERWRITE'):
                    m.preflight(src,root/'ch.mp4',prior)
                self.assertEqual(prior.read_bytes(),b'preserved')
    def test_output_collision_prevented(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp); src=root/'src.mp4';src.write_bytes(b'safe'); out=root/'out.mp4'
            with patch.object(m,'sha',return_value=m.EXPECTED_PARENT_SHA),patch.object(m,'probe',return_value=(4250,170.0,1)),patch.object(m,'audio_md5',return_value=m.SOURCE_AUDIO_MD5):
                with self.assertRaisesRegex(ValueError,'COLLISION'):
                    m.preflight(src,out,out)
    def test_symlink_source_rejected(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp); x=root/'a';x.write_bytes(b'x');link=root/'b';link.symlink_to(x)
            with self.assertRaisesRegex(ValueError,'SYMLINK'):
                m.preflight(link,root/'c',root/'d')
    def test_no_speech_subtitles_upload_or_payment_code(self):
        source=SCRIPT.read_text(encoding='utf8')
        self.assertIn("'new_voice': False",source)
        self.assertIn("'new_subtitles': False",source)
        self.assertIn("'provider_calls': 0",source)
        self.assertIn("'release_hold': True",source)
        self.assertNotIn('requests.post(',source)
        self.assertNotIn('paypal.com',source)
        self.assertNotIn('Gemini',source)

if __name__=='__main__':unittest.main()
