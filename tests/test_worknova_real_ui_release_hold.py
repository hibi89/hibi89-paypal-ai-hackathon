"""Fail-closed offline media contracts; does not film, pay, publish or upload."""
import os
import re
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))
from worknova_insert_real_demo import (
    SAFE_ORIGINAL_SHA256, validate, EXPECTED_SCENE_STATUS
)
from worknova_one_click_private_video import safe_film


class RealUiReleaseHoldTest(unittest.TestCase):
    def test_only_exact_public_safe_movie_sha_is_authorized(self):
        self.assertEqual(SAFE_ORIGINAL_SHA256,
            "99a440913eb7cac25ab75e9f467300d50c6c6dcc49dd6d8ca77bbc4b5d3f4578")
        self.assertEqual(EXPECTED_SCENE_STATUS,
            "PRIVATE_GENUINE_CHROMIUM_COMMERCE_30S_NOT_PUBLISHED")
        with tempfile.TemporaryDirectory(prefix="worknova-video-guard-") as tmp:
            folder=Path(tmp)
            bogus=folder / "movie.mp4"
            bogus.write_bytes(b"NOT REAL WORKNOVA FILM")
            before=bogus.read_bytes()
            with self.assertRaisesRegex(ValueError,
                "ORIGINAL_MUST_MATCH_PINNED_SAFE_170S_SHA"):
                safe_film(bogus)
            self.assertEqual(bogus.read_bytes(), before)
            self.assertEqual(list(folder.glob("*.manifest.json")), [])

    def test_missing_or_unverified_recording_cannot_be_merged(self):
        with tempfile.TemporaryDirectory(prefix="worknova-review-hold-") as tmp:
            folder=Path(tmp)
            source=folder / "WORKNOVA_AGENTIC_SAFE_170s_PRIVATE.mp4"
            clip=folder / "actual_browser.webm"
            with self.assertRaisesRegex(ValueError, "READ_ONLY_REAL_MEDIA_REQUIRED"):
                validate(source, clip)
            source.write_bytes(b"bad film")
            clip.write_bytes(b"bad video")
            with self.assertRaisesRegex(ValueError,
                "ONLY_SHA_PINNED_PUBLIC_SAFE_170S_FILM_ACCEPTED"):
                validate(source, clip)
            self.assertEqual(list(folder.glob("*.json")), [])

    def test_cli_invalid_or_missing_mode_never_launches_browser(self):
        runner=ROOT / "scripts" / "worknova_one_click_private_video.py"
        result=subprocess.run([sys.executable,str(runner),"--film",
                               "/no/such/private/film.mp4"],
                               cwd=ROOT,text=True,capture_output=True,timeout=10)
        self.assertNotEqual(result.returncode,0)
        self.assertIn("required",result.stderr)
        self.assertNotIn("PUBLISH_PASS",result.stdout)
        for source in ["worknova_commerce_real_capture.py",
                       "worknova_insert_real_demo.py",
                       "worknova_one_click_private_video.py"]:
            data=(ROOT/"scripts"/source).read_text(encoding="utf-8")
            self.assertNotIn("upload-artifact",data)
            self.assertNotIn("paypal.com/v2/checkout",data)
            self.assertNotIn("youtube.upload",data)


if __name__=="__main__":
    unittest.main(verbosity=2)
