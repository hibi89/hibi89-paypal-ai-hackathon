"""No-network negative and preflight tests for private WorkNova v4d narration flow."""
import importlib.util
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

SCRIPT=Path(__file__).resolve().parents[1]/'scripts'/'worknova_v4d_offline_voice_finish.py'
spec=importlib.util.spec_from_file_location('worknova_v4d_offline_voice_finish',SCRIPT)
m=importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)

class PrivateVoiceTests(unittest.TestCase):
    def test_requires_exact_v4d_sha(self):
        self.assertEqual(len(m.V4D_SHA),64)
        with tempfile.TemporaryDirectory() as d:
            p=Path(d)/'wrong.mp4';p.write_bytes(b'fake')
            with self.assertRaisesRegex(ValueError,'SHA256_MISMATCH'):
                m.verify_video(p)
    def test_missing_video_fails_closed(self):
        with tempfile.TemporaryDirectory() as d:
            with self.assertRaisesRegex(ValueError,'VERIFIED_PRIVATE'):
                m.finish(Path(d)/'absent.mp4',Path(d),Path(d)/'out')
            self.assertFalse((Path(d)/'out').exists())
    def test_symlink_rejected(self):
        with tempfile.TemporaryDirectory() as d:
            p=Path(d);(p/'target').write_text('hello')
            try:(p/'link.mp4').symlink_to(p/'target')
            except (OSError,NotImplementedError):self.skipTest('symlink unavailable')
            with self.assertRaisesRegex(ValueError,'VERIFIED_PRIVATE'):
                m.verify_video(p/'link.mp4')
    def test_verified_preflight_does_not_render_or_write(self):
        with tempfile.TemporaryDirectory() as d:
            tmp=Path(d)
            for filename in ('worknova_part2_neural.py','worknova_subtitles_from_voice.py',
                             'worknova_private_voice_mux.py'):
                (tmp/filename).write_text('# test fixture, no actual model or synthesis')
            calls=[]
            with patch.object(m,'SCRIPT_DIR',tmp), \
                 patch.object(m,'verify_video',return_value={'video_sha256':m.V4D_SHA}), \
                 patch.object(m,'run',side_effect=lambda a:calls.append(a)):
                output=m.finish(tmp/'synthetic-placeholder.mp4',tmp/'missing-model',
                                tmp/'no-create',render=False)
            self.assertEqual(output['status'],'PRIVATE_OFFLINE_V4D_VOICE_PREFLIGHT_PASS__NO_WRITE')
            self.assertEqual(len(calls),2)
            self.assertTrue(any('--check-model' in a for a in calls))
            self.assertFalse((tmp/'no-create').exists())
    def test_check_only_does_not_create_folders_without_model(self):
        # A mismatched video must STOP before attempting to read model or create output.
        with tempfile.TemporaryDirectory() as d:
            p=Path(d);(p/'wrong.mp4').write_bytes(b'bad')
            with self.assertRaisesRegex(ValueError,'V4D_VIDEO_SHA256_MISMATCH'):
                m.finish(p/'wrong.mp4',p/'model',p/'new-output',render=False)
            self.assertFalse((p/'new-output').exists())

if __name__=='__main__':unittest.main()
