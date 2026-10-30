"""No-network, stdlib-only private WebM/manifest integrity regressions."""
import hashlib
import json
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
from check_recorded_video import verify


class RecordedVideoIntegrityTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix="paypal-private-video-")
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.video = self.root / "paypal-synthetic-review-20261030-160100.webm"
        self.manifest = self.video.with_suffix(".manifest.json")
        payload = bytes.fromhex("1a45dfa3") + b"synthetic-local-video-bytes"
        self.video.write_bytes(payload)
        self.data = {
            "video_filename": self.video.name,
            "video_sha256": hashlib.sha256(payload).hexdigest(),
            "video_bytes": len(payload),
            "evidence_class": "OFFLINE_SYNTHETIC_BROWSER_CAPTURE_ONLY",
            "storyboard_version": "OPPORTUNITY_FIRST_V3_FAKE_API_TRACE",
            "demonstrated_categories": ["ai_work", "general_services"],
            "interactive_fake_api_trace_replayed_locally": True,
            "interactive_fake_api_trace_actual_provider_calls": 0,
            "interactive_fake_api_trace_payment_posts": 0,
            "provider_calls": 0,
            "payment_posts": 0,
            "publicly_uploaded": False,
            "devpost_submitted": False,
            "owner_approval_for_publication": False,
            "media_duration_independently_probed": False,
            "wall_clock_elapsed_seconds": 142.2,
        }
        self.save()

    def save(self):
        self.manifest.write_text(json.dumps(self.data), encoding="utf-8")

    def test_symlinked_video_never_reads_original_private_recording(self):
        original = self.root / "existing-private-owner-recording"
        original.write_bytes(self.video.read_bytes())
        self.video.unlink()
        try:
            self.video.symlink_to(original)
        except (NotImplementedError, OSError):
            self.skipTest("host does not permit symlinks")
        with self.assertRaisesRegex(ValueError, "LOCAL_VIDEO_UNAVAILABLE"):
            verify(self.root)
        self.assertTrue(self.video.is_symlink())
        self.assertEqual(original.read_bytes(), bytes.fromhex("1a45dfa3") +
                         b"synthetic-local-video-bytes")

    def test_valid_pair_is_accepted(self):
        with patch("builtins.print"):
            self.assertEqual(verify(self.root), self.video)

    def test_manifest_and_video_names_must_match_before_read(self):
        other = self.root / "paypal-synthetic-review-20261030-160101.webm"
        other.write_bytes(b"unrelated-private-video")
        self.data["video_filename"] = other.name
        self.save()
        with self.assertRaisesRegex(ValueError, "VIDEO_MANIFEST_NAME_MISMATCH"):
            verify(self.root)
        self.assertEqual(other.read_bytes(), b"unrelated-private-video")

    def test_manifest_symlink_is_not_followed(self):
        protected = self.root / "original-private-record"
        protected.write_text("DO_NOT_READ_OR_REPLACE", encoding="utf-8")
        self.manifest.unlink()
        try:
            self.manifest.symlink_to(protected)
        except (NotImplementedError, OSError):
            self.skipTest("host does not permit symlinks")
        with self.assertRaisesRegex(ValueError, "PRIVATE_MANIFEST_UNSAFE"):
            verify(self.root)
        self.assertEqual(protected.read_text(), "DO_NOT_READ_OR_REPLACE")

    def test_output_directory_symlink_is_not_followed(self):
        link = self.root.parent / (self.root.name + "-link")
        try:
            link.symlink_to(self.root, target_is_directory=True)
        except (NotImplementedError, OSError):
            self.skipTest("host does not permit symlinks")
        try:
            with self.assertRaisesRegex(ValueError, "LOCAL_VIDEO_DIRECTORY_UNSAFE"):
                verify(link)
        finally:
            link.unlink(missing_ok=True)

    def test_oversized_manifest_rejected_before_parse(self):
        self.manifest.write_bytes(b"x" * (256 * 1024 + 1))
        with self.assertRaisesRegex(ValueError, "PRIVATE_MANIFEST_UNSAFE"):
            verify(self.root)

    def test_any_unsafe_candidate_blocks_fallback_to_older_recording(self):
        protected = self.root / "private-original"
        protected.write_text("KEEP_PRIVATE", encoding="utf-8")
        rogue = self.root / "paypal-synthetic-review-20261030-160101.manifest.json"
        try:
            rogue.symlink_to(protected)
        except (NotImplementedError, OSError):
            self.skipTest("host does not permit symlinks")
        with self.assertRaisesRegex(ValueError, "PRIVATE_MANIFEST_UNSAFE"):
            verify(self.root)
        self.assertEqual(protected.read_text(), "KEEP_PRIVATE")


if __name__ == "__main__":
    unittest.main(verbosity=2)
