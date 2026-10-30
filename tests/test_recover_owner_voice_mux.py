"""No-network integration test of recovery from existing audio and footage."""
import hashlib
import json
import shutil
import subprocess
import sys
import tempfile
import unittest
import wave
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
from recover_owner_voice_mux import recover, probe_duration, match_timeline


def create_dummy(root, ffmpeg):
    vids = root / "output" / "videos"
    vids.mkdir(parents=True)
    source = vids / "paypal-synthetic-review-20261031-120000.webm"
    subprocess.run([ffmpeg, "-y", "-hide_banner", "-loglevel", "error",
                    "-f", "lavfi", "-i", "color=size=320x180:rate=25:color=navy",
                    "-t", "2.0", "-c:v", "libvpx", "-b:v", "100k", str(source)],
                   check=True, timeout=25)
    sha = hashlib.sha256(source.read_bytes()).hexdigest()
    cues = [{"at_seconds": round(.01 + .1 * i, 2),
             "text": "Synthetic voice narration for offline testing"}
            for i in range(13)]
    record = {
        "evidence_class": "OFFLINE_SYNTHETIC_BROWSER_CAPTURE_ONLY",
        "presentation_mode": "GUIDED_REAL_BROWSER_CURSOR_NO_POST_ZOOM",
        "narration_script_version": "PROOFLINE_PREMIUM_CUES_V1",
        "narration_cues": cues,
        "source_tracked_tree_clean": True,
        "source_commit_sha": "a" * 40,
        "provider_calls": 0, "payment_posts": 0,
        "publicly_uploaded": False,
        "video_filename": source.name,
        "video_sha256": sha
    }
    (vids / (source.stem + ".manifest.json")).write_text(
        json.dumps(record), encoding="utf-8")
    audio_dir = vids / "private-voice-20261031-120100-abc123"
    audio_dir.mkdir()
    timeline = {"items": [
        {"file": f"voice_{i + 1:02d}.wav", "at_seconds": cue["at_seconds"]}
        for i, cue in enumerate(cues)
    ]}
    (audio_dir / "timeline.json").write_text(json.dumps(timeline), encoding="utf-8")
    with wave.open(str(audio_dir / "narration.wav"), "wb") as out:
        out.setnchannels(1)
        out.setsampwidth(2)
        out.setframerate(22050)
        out.writeframes(b"\0\0" * 33075)
    return source, sha, audio_dir, timeline


class RecoveryTests(unittest.TestCase):
    def setUp(self):
        self.ffmpeg = shutil.which("ffmpeg")
        if not self.ffmpeg:
            self.skipTest("local ffmpeg needed for synthetic smoke test")

    def test_correct_existing_source_reused_and_bounded_mux_terminates(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            src, sha, voice_dir, _ = create_dummy(root, self.ffmpeg)
            with patch("recover_owner_voice_mux.checked_local_ffmpeg",
                       return_value=self.ffmpeg):
                report = recover(root)
            self.assertEqual(report["status"],
                             "PRIVATE_RECOVERED_NARRATED_DRAFT_NEEDS_OWNER_REVIEW")
            self.assertEqual(report["originalSha256"], sha)
            self.assertEqual(report["cueCount"], 13)
            self.assertEqual(report["providerCalls"], 0)
            self.assertFalse(report["publiclyUploaded"])
            self.assertEqual(hashlib.sha256(src.read_bytes()).hexdigest(), sha)
            new_video = root / "output" / "videos" / report["recoveredVideo"]
            self.assertTrue(new_video.exists())
            dur, meta = probe_duration(self.ffmpeg, new_video)
            self.assertLess(abs(dur - 2.0), 0.5)
            self.assertIn("Video:", meta)
            self.assertIn("Audio:", meta)
            self.assertTrue((voice_dir / "narration.wav").is_file())
            # Never returns a prior unfinished filename or overwrites it.
            self.assertIn("-recovered-", new_video.name)

    def test_timeline_mismatch_blocks_recovery_and_preserves_source(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            src, sha, voice_dir, timeline = create_dummy(root, self.ffmpeg)
            timeline["items"][0]["at_seconds"] = 9.9
            (voice_dir / "timeline.json").write_text(json.dumps(timeline),
                                                      encoding="utf-8")
            with patch("recover_owner_voice_mux.checked_local_ffmpeg",
                       return_value=self.ffmpeg):
                with self.assertRaisesRegex(ValueError,
                                            "EXACTLY_ONE_MATCHED_SOURCE_VIDEO_REQUIRED"):
                    recover(root)
            self.assertEqual(hashlib.sha256(src.read_bytes()).hexdigest(), sha)

    def test_corrupt_original_is_never_claimed_as_recovered(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            src, _, _, _ = create_dummy(root, self.ffmpeg)
            src.write_bytes(src.read_bytes() + b"CORRUPTION_SENTINEL")
            with patch("recover_owner_voice_mux.checked_local_ffmpeg",
                       return_value=self.ffmpeg):
                with self.assertRaisesRegex(ValueError,
                                            "EXACTLY_ONE_MATCHED_SOURCE_VIDEO_REQUIRED"):
                    recover(root)


if __name__ == "__main__":
    unittest.main()
