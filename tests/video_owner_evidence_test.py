"""Pure, no-network safety regression for final-video historical proof cards."""
import sys
import unittest
import json
import tempfile
import hashlib
from pathlib import Path
from unittest.mock import patch
sys.path.insert(0, str(Path(__file__).resolve().parents[1]/"scripts"))
from video_owner_evidence import (
    sanitize_saved_receipt, collect_saved_receipt, storyboard_cards, premium_storyboard_cards,
    LOCAL_STATUS, preserve_private_recording, git_source_snapshot,
)

def valid_receipt():
    return {
        "status": LOCAL_STATUS, "mode": "READ_ONLY_PRIVATE_SQLITE_EVIDENCE_NO_NETWORK",
        "ownerReportedLiveRunNotIndependentlyAttested": True,
        "providerGetPerformedNow": False,"providerPostPerformedNow":False,
        "geminiCallPerformedNow": False,"sqliteWritesPerformed": False,
        "secretsRead": False,"privateIdentifiersPrinted": False,
        "freshRemotePaymentProof": False,"productionOrLivePaymentProof":False,
        "safeToRepeatPayment": False,
        "amountMinor":150,"currency":"USD", "classifiedSkills":["web","payments","qa"],
        "localAuditIntegrity":"PASS",
        "localStates":{"gemini":"COMMITTED","create":"APPROVED","capture":"PAID"},
        "remoteId":"NEVER_EXPOSE_ME",
        "client_secret":"NEVER_EXPOSE_ME",
        "payerEmail":"NEVER_EXPOSE_ME",
    }

class GitSourceSnapshotTests(unittest.TestCase):
    def test_exact_commit_clean_status_and_command(self):
        sha = "a" * 40
        class Result:
            def __init__(self, code, value):
                self.returncode = code
                self.stdout = value
        with patch("subprocess.run", side_effect=[Result(0, sha + "\n"),
                                                  Result(0, "")]) as run:
            self.assertEqual(git_source_snapshot(Path("/fixture")),
                             {"sha": sha, "clean": True})
        self.assertEqual(run.call_args_list[1].args[0],
                         ["git", "status", "--porcelain=v1",
                          "--untracked-files=normal", "--"])
        self.assertFalse(run.call_args_list[1].kwargs["check"])

    def test_untracked_or_dirty_sources_never_get_clean_attestation(self):
        sha = "a" * 40
        class Result:
            def __init__(self, code, value):
                self.returncode = code
                self.stdout = value
        for code, output in ((0, "?? src/new_script.py\n"),
                             (0, " M scripts/record_judge_demo.py\n"),
                             (0, "M  README.md\n"),
                             (1, "")):
            with patch("subprocess.run", side_effect=[Result(0, sha),
                                                      Result(code, output)]):
                self.assertEqual(git_source_snapshot(Path("/fixture")),
                                 {"sha": sha, "clean": False})
        with patch("subprocess.run", side_effect=OSError("git missing")):
            self.assertEqual(git_source_snapshot(Path("/fixture")),
                             {"sha": None, "clean": False})


class VideoEvidenceSafetyTests(unittest.TestCase):
    def test_recording_and_manifest_saved_as_exclusive_pair(self):
        with tempfile.TemporaryDirectory() as temp:
            root=Path(temp)
            original=root/"playwright-temp.webm"
            dest=root/"paypal-synthetic-review-20261030-160101.webm"
            payload=b"TEST_WEBM_SYNTHETIC"
            original.write_bytes(payload)
            report={"video_filename":dest.name,"video_bytes":len(payload),
                    "video_sha256":hashlib.sha256(payload).hexdigest(),
                    "provider_calls":0,"payment_posts":0}
            manifest=preserve_private_recording(original,dest,report)
            self.assertFalse(original.exists())
            self.assertEqual(dest.read_bytes(),payload)
            self.assertEqual(json.loads(manifest.read_text()),report)

    def test_existing_video_or_orphaned_manifest_cannot_be_overwritten(self):
        with tempfile.TemporaryDirectory() as temp:
            root=Path(temp)
            source=root/"playwright-source.webm"
            dest=root/"paypal-synthetic-review-20261030-160102.webm"
            manifest=dest.with_suffix(".manifest.json")
            source.write_bytes(b"NEW_CAPTURE")
            manifest.write_text("OLDER_OWNER_MANIFEST",encoding="utf-8")
            with self.assertRaisesRegex(RuntimeError,"PRIVATE_RECORDING_ALREADY_EXISTS"):
                preserve_private_recording(source,dest,{})
            self.assertEqual(manifest.read_text(),"OLDER_OWNER_MANIFEST")
            self.assertFalse(dest.exists())
            self.assertEqual(source.read_bytes(),b"NEW_CAPTURE")
            manifest.unlink()
            dest.write_bytes(b"OLDER_OWNER_VIDEO")
            with self.assertRaisesRegex(RuntimeError,"PRIVATE_RECORDING_ALREADY_EXISTS"):
                preserve_private_recording(source,dest,{})
            self.assertEqual(dest.read_bytes(),b"OLDER_OWNER_VIDEO")
            self.assertFalse(manifest.exists())
            self.assertEqual(source.read_bytes(),b"NEW_CAPTURE")

    def test_invalid_manifest_rolls_back_only_new_output_not_source(self):
        with tempfile.TemporaryDirectory() as temp:
            root=Path(temp)
            original=root/"playwright-source.webm"
            dest=root/"paypal-synthetic-review-20261030-160103.webm"
            original.write_bytes(b"NEW_CAPTURE")
            with self.assertRaises(TypeError):
                preserve_private_recording(original,dest,{"bad":{1,2}})
            self.assertEqual(original.read_bytes(),b"NEW_CAPTURE")
            self.assertFalse(dest.exists())
            self.assertFalse(dest.with_suffix(".manifest.json").exists())

    def test_existing_manifest_symlink_is_never_replaced(self):
        with tempfile.TemporaryDirectory() as temp:
            root=Path(temp)
            original=root/"playwright-source.webm"
            dest=root/"paypal-synthetic-review-20261030-160104.webm"
            manifest=dest.with_suffix(".manifest.json")
            protected=root/"owner-protected-evidence"
            protected.write_text("ORIGINAL_OWNER_DATA",encoding="utf-8")
            original.write_bytes(b"NEW_CAPTURE")
            try:
                manifest.symlink_to(protected)
            except (OSError,NotImplementedError):
                self.skipTest("OS does not permit symlink creation")
            with self.assertRaisesRegex(RuntimeError,"PRIVATE_RECORDING_ALREADY_EXISTS"):
                preserve_private_recording(original,dest,{})
            self.assertEqual(protected.read_text(),"ORIGINAL_OWNER_DATA")
            self.assertTrue(manifest.is_symlink())
            self.assertFalse(dest.exists())
            self.assertEqual(original.read_bytes(),b"NEW_CAPTURE")

    def test_verified_read_only_receipt_only_exports_small_allowlist(self):
        result=sanitize_saved_receipt(valid_receipt())
        self.assertTrue(result["local_receipt_verified"])
        self.assertEqual(result["skills"],["web","payments","qa"])
        self.assertNotIn("NEVER_EXPOSE_ME",str(result))
        self.assertEqual(result["payment"],"HISTORICAL_CAPTURE_PAID_LOCALLY_RECORDED")
        self.assertEqual(len(storyboard_cards(result)),3)
        self.assertIn("NOT a fresh provider GET"," ".join(storyboard_cards(result)[1]["lines"]))
    def test_premium_lens_keeps_historical_proof_visible_without_dense_slides(self):
        for proof in (sanitize_saved_receipt(valid_receipt()),
                      sanitize_saved_receipt(None)):
            cards=premium_storyboard_cards(proof)
            self.assertEqual([c["scene"] for c in cards],
                             ["gemini","paypal","provenance"])
            for c in cards:
                self.assertTrue(c["sourceLabel"].startswith("OWNER"))
                self.assertLess(len(c["title"]),50)
                self.assertLess(len(c["subtitle"]),160)
                self.assertLess(len(c["note"]),140)
                self.assertNotIn("NEVER_EXPOSE_ME", str(c))
            self.assertEqual(cards[0]["tags"],
                             [s.upper() for s in proof["skills"]])
            self.assertIn("not",cards[1]["subtitle"].lower())
            self.assertIn("separate",cards[2]["subtitle"].lower())
        self.assertIn("READ-ONLY MATCH",premium_storyboard_cards(
            sanitize_saved_receipt(valid_receipt()))[0]["sourceLabel"])
        self.assertIn("RECEIPT NOT PRESENT",premium_storyboard_cards(
            sanitize_saved_receipt(None))[0]["sourceLabel"])

    def test_rejects_provider_activity_or_invalid_user_claim(self):
        for key,value in [
            ("providerGetPerformedNow",True),("providerPostPerformedNow",True),
            ("geminiCallPerformedNow",True),("sqliteWritesPerformed",True),
            ("secretsRead",True),("privateIdentifiersPrinted",True),
            ("freshRemotePaymentProof",True),("productionOrLivePaymentProof",True),
            ("status","UNVERIFIED"),("classifiedSkills",["web","secret"]),
            ("amountMinor",151),("localStates",None),
        ]:
            r=valid_receipt();r[key]=value
            self.assertFalse(sanitize_saved_receipt(r)["local_receipt_verified"],key)
    def test_missing_private_evidence_never_claims_verified(self):
        fallback=sanitize_saved_receipt(None)
        self.assertFalse(fallback["local_receipt_verified"])
        text=str(storyboard_cards(fallback))
        self.assertIn("OWNER REPORT",text)
        self.assertIn("not replayed or verified on this machine",text)
        self.assertNotIn("NEVER_EXPOSE_ME",text)
    def test_subprocess_receipt_not_called_with_provider_keys(self):
        class StubResult:
            returncode=0
            stdout='{}'
        env={"PATH":"test-path","GEMINI_API_KEY":"DUMMY_SENTINEL",
             "PAYPAL_CLIENT_SECRET":"DUMMY_SENTINEL","NODE_OPTIONS":"--bad"}
        with patch.dict("os.environ",env,clear=True):
            with patch("subprocess.run",return_value=StubResult()) as run:
                result=collect_saved_receipt(Path("."))
        self.assertFalse(result["local_receipt_verified"])
        called_env=run.call_args.kwargs["env"]
        self.assertEqual(called_env,{"PATH":"test-path"})
        self.assertEqual(run.call_args.kwargs["timeout"],10)
        self.assertEqual(run.call_args.kwargs["check"],False)

if __name__=="__main__":
    unittest.main(verbosity=2)
