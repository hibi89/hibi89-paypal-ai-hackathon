"""Offline neural narration fail-closed tests with no model or network."""
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0,str(Path(__file__).resolve().parents[1]/"scripts"))
from render_owner_neural_voice import synthesize, VOICES


class OfflineNeuralSafety(unittest.TestCase):
    def test_unapproved_voice_never_loads_models_or_accesses_video(self):
        with tempfile.TemporaryDirectory() as tmp:
            with patch("render_owner_neural_voice.validated_source") as probe:
                with self.assertRaisesRegex(ValueError, "VOICE_NOT_ALLOWLISTED"):
                    synthesize(Path(tmp), "unapproved-cloud-voice")
                probe.assert_not_called()

    def test_missing_model_refuses_without_download_or_voice_calls(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp)
            vids=root/"output"/"videos"
            vids.mkdir(parents=True)
            fake=vids/"paypal-synthetic-review-20261031-120000.webm"
            fake.write_bytes(b"synthetic-video")
            with patch("render_owner_neural_voice.validated_source",
                       return_value=(vids,fake,[{"text":"safe", "at_seconds":0.2}])):
                with self.assertRaisesRegex(ValueError,
                    "LOCAL_KOKORO_MODEL_ASSETS_REQUIRED__NO_DOWNLOAD_PERFORMED"):
                    synthesize(root,"af_heart")
            self.assertFalse((vids/"private-voice-kokoro").exists())
            self.assertEqual(fake.read_bytes(),b"synthetic-video")

    def test_allowlisted_neural_voices_are_english(self):
        self.assertTrue({"af_heart","am_michael"}.issubset(VOICES))
        self.assertTrue(all(s.startswith(("af_","am_","bf_","bm_")) for s in VOICES))


if __name__=="__main__":
    unittest.main()
