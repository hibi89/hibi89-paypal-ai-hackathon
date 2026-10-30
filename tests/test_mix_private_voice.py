"""Owner narration mixer tests. No network, microphone, Windows voices, or providers."""
import json
import sys
import tempfile
import unittest
import wave
from pathlib import Path

sys.path.insert(0,str(Path(__file__).resolve().parents[1]/"scripts"))
from mix_private_voice import mix_timeline, RATE

def wav(path, frames=RATE//4):
    with wave.open(str(path),"wb") as file:
        file.setnchannels(1)
        file.setsampwidth(2)
        file.setframerate(RATE)
        file.writeframes(b"\x19\x22"*frames)


class OfflineVoiceTests(unittest.TestCase):
    def test_valid_cues_are_ordered_and_never_overwrite(self):
        with tempfile.TemporaryDirectory() as temp:
            root=Path(temp)
            wav(root/"voice_01.wav")
            wav(root/"voice_02.wav")
            timeline=root/"timeline.json"
            timeline.write_text(json.dumps({"items":[
                {"file":"voice_01.wav","at_seconds":0},
                {"file":"voice_02.wav","at_seconds":0.1}
            ]}),encoding="utf-8-sig")
            out=root/"narration.wav"
            report=mix_timeline(timeline,out)
            self.assertEqual(report["cue_count"],2)
            self.assertEqual(report["external_provider_calls"],0)
            self.assertGreater(report["cue_timing"][1]["start_seconds"],.25)
            self.assertGreater(report["seconds"],.6)
            with wave.open(str(out),"rb") as source:
                self.assertEqual(source.getframerate(),RATE)
                self.assertEqual(source.getnchannels(),1)
                self.assertEqual(source.getsampwidth(),2)
            with self.assertRaises(FileExistsError):
                mix_timeline(timeline,out)

    def test_path_traversal_empty_or_out_of_range_fail_closed(self):
        with tempfile.TemporaryDirectory() as temp:
            root=Path(temp)
            wav(root/"voice_01.wav")
            input=root/"timeline.json"
            for items in (
                [],[{"file":"../outside.wav","at_seconds":1}],
                [{"file":"voice_01.wav","at_seconds":-2}],
                [{"file":"voice_01.wav","at_seconds":200}],
                [{"file":"voice_01.wav","at_seconds":"secret"}],
                [{"file":"voice_01.wav","at_seconds":float("inf")}],
            ):
                input.write_text(json.dumps({"items":items}),encoding="utf-8")
                with self.assertRaises(ValueError):
                    mix_timeline(input,root/"result.wav")
                self.assertFalse((root/"result.wav").exists())


if __name__=="__main__":
    unittest.main()
