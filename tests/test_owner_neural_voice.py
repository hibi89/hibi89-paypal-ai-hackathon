"""Offline neural narration fail-closed tests with no model or network."""
import inspect
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0,str(Path(__file__).resolve().parents[1]/"scripts"))
from render_owner_neural_voice import synthesize, sample_voice, load_engine, VOICES


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

    def test_sample_is_local_fixed_script_and_never_accesses_private_recording(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp)
            class DummyVoice:
                def create(self, text, voice, speed, lang):
                    self_text = text
                    assert "Talent is everywhere" in self_text
                    assert "Proofline" in self_text
                    assert voice == "af_heart"
                    assert lang == "en-us"
                    return ([0.0] * 24000, 24000)
            class DummyWriter:
                @staticmethod
                def write(path, samples, rate, subtype):
                    Path(path).write_bytes(b"LOCAL_TEST_WAV")
            with patch("render_owner_neural_voice.load_engine",
                       return_value=(DummyVoice(),DummyWriter(),None,None)):
                with patch("render_owner_neural_voice.validated_source") as source:
                    sample=sample_voice(root,"af_heart")
                    source.assert_not_called()
            self.assertEqual(sample.read_bytes(), b"LOCAL_TEST_WAV")
            self.assertTrue(sample.parent.name=="private-neural-samples")

    def test_kokoro_receives_explicit_espeak_data_root_on_windows(self):
        # Kokoro's Tokenizer resets the eSpeak data path when EspeakConfig
        # is omitted. A successful phonemizer precheck alone is insufficient.
        source = inspect.getsource(load_engine)
        self.assertIn("EspeakConfig(", source)
        self.assertIn("data_path=str(ascii_root)", source)
        self.assertIn("espeak_config=espeak_config", source)

    def test_allowlisted_neural_voices_are_english(self):
        self.assertTrue({"af_heart","am_michael"}.issubset(VOICES))
        self.assertTrue(all(s.startswith(("af_","am_","bf_","bm_")) for s in VOICES))


if __name__=="__main__":
    unittest.main()
