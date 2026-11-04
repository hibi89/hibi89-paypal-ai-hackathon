"""Pure, no-network safety regression for final-video historical proof cards."""
import sys
import unittest
from pathlib import Path
from unittest.mock import patch
sys.path.insert(0, str(Path(__file__).resolve().parents[1]/"scripts"))
from video_owner_evidence import (
    sanitize_saved_receipt, collect_saved_receipt, storyboard_cards,
    LOCAL_STATUS,
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

class VideoEvidenceSafetyTests(unittest.TestCase):
    def test_verified_read_only_receipt_only_exports_small_allowlist(self):
        result=sanitize_saved_receipt(valid_receipt())
        self.assertTrue(result["local_receipt_verified"])
        self.assertEqual(result["skills"],["web","payments","qa"])
        self.assertNotIn("NEVER_EXPOSE_ME",str(result))
        self.assertEqual(result["payment"],"HISTORICAL_CAPTURE_PAID_LOCALLY_RECORDED")
        self.assertEqual(len(storyboard_cards(result)),3)
        self.assertIn("NOT a fresh provider GET"," ".join(storyboard_cards(result)[1]["lines"]))
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
