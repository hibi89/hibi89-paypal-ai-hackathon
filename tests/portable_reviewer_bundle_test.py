"""Extract reviewer-only ZIP and run the actual application on loopback."""
import hashlib
import json
import os
import queue
import re
import subprocess
import sys
import tempfile
import threading
import unittest
from pathlib import Path
from urllib.error import HTTPError
from urllib.request import Request, build_opener, ProxyHandler
from zipfile import ZipFile

ROOT = Path(__file__).resolve().parents[1]
BUILDER = ROOT / "scripts" / "pack_offline_reviewer.py"
PREFIX = "worknova-offline-reviewer/"
OPENER = build_opener(ProxyHandler({}))


class ReviewerBundleTest(unittest.TestCase):
    def create(self, folder):
        archive = Path(folder) / "bundle.zip"
        result = subprocess.run(
            [sys.executable, str(BUILDER), "--out", str(archive)],
            cwd=ROOT, capture_output=True, text=True, timeout=30, check=True)
        report = json.loads(result.stdout)
        self.assertEqual(report["status"], "OFFLINE_REVIEWER_ZIP_VERIFIED")
        self.assertFalse(report["paymentAuthorized"])
        self.assertFalse(report["remoteUpload"])
        return archive

    def test_file_scope_integrity_and_no_overwrite(self):
        with tempfile.TemporaryDirectory(prefix="worknova-zips-") as tmp:
            archive = self.create(tmp)
            with ZipFile(archive) as z:
                names = z.namelist()
                self.assertTrue(all(name.startswith(PREFIX) for name in names))
                self.assertTrue(all(not any(word in name.lower()
                    for word in (".env", "node_modules", "private.sqlite",
                                 ".git/", "output/", "tests/"))
                    for name in names))
                manifest = json.loads(z.read(PREFIX + "MANIFEST.json"))
                self.assertGreater(len(manifest["files"]), 10)
                self.assertIn("src/offline_demo_server.mjs", manifest["files"])
                self.assertIn("web/innovation_dashboard.html", manifest["files"])
                brand = z.read(PREFIX + "REVIEWER_README.md").decode("utf-8")
                self.assertTrue(brand.startswith("# WORKNOVA"))
                self.assertIn("SYNTHETIC OFFLINE DEMO ONLY", brand)
                self.assertIn("No actual PayPal or Gemini calls", brand)
                self.assertNotIn("Proofline", brand)
                package = json.loads(z.read(PREFIX + "package.json"))
                self.assertEqual(package["name"], "worknova-offline-reviewer")
                for path, digest in manifest["files"].items():
                    self.assertEqual(hashlib.sha256(z.read(PREFIX + path)).hexdigest(), digest)
            again = subprocess.run(
                [sys.executable, str(BUILDER), "--out", str(archive)],
                cwd=ROOT, capture_output=True, text=True, timeout=30)
            self.assertNotEqual(again.returncode, 0)
            self.assertIn("REVIEWER_ZIP_ALREADY_EXISTS_NO_OVERWRITE", again.stderr)
            checked = subprocess.run([sys.executable, str(BUILDER), "--check"],
                cwd=ROOT, capture_output=True, text=True, timeout=30, check=True)
            self.assertFalse(json.loads(checked.stdout)["savedLocally"])

    def test_fresh_unpack_runs_both_parts_without_install_or_provider(self):
        with tempfile.TemporaryDirectory(prefix="worknova-run-") as tmp:
            archive = self.create(tmp)
            with ZipFile(archive) as z:
                z.extractall(Path(tmp) / "extract")
            cwd = Path(tmp) / "extract" / "worknova-offline-reviewer"
            self.assertFalse((cwd / "node_modules").exists())
            self.assertEqual(json.loads((cwd / "package.json").read_text())["scripts"],
                {"demo": "node --experimental-sqlite scripts/run_demo.mjs"})
            clean_env = {k: v for k, v in os.environ.items()
                         if not re.search(
                            "SECRET|TOKEN|PASSWORD|CREDENTIAL|API_KEY|CLIENT_ID|MERCHANT_ID|"
                            "GEMINI|PAYPAL|OPENAI|AUTHORIZATION|PRIVATE_KEY|NODE_OPTIONS",
                            k, re.I)}
            proc = subprocess.Popen(["node", "--experimental-sqlite",
                                     "scripts/run_demo.mjs"], cwd=cwd,
                env=clean_env, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL,
                text=True, bufsize=1)
            lines = queue.Queue()
            threading.Thread(target=lambda: [lines.put(line) for line in proc.stdout],
                             daemon=True).start()
            try:
                base = None
                for _ in range(8):
                    line = lines.get(timeout=5)
                    match = re.search(r"http://127[.]0[.]0[.]1:[0-9]{1,5}", line)
                    if match:
                        base = match.group()
                        break
                self.assertIsNotNone(base, "No local address; archive runtime incomplete")
                for path, expected in (
                    ("/", b"marketplace"),
                    ("/demo/innovation", b"Five agentic commerce skills"),
                    ("/demo/innovation.js", b"/api/demo/innovation/"),
                ):
                    with OPENER.open(Request(base + path, method="GET"), timeout=6) as res:
                        self.assertEqual(res.status, 200)
                        self.assertIn(expected.lower(), res.read().lower())
                with OPENER.open(Request(base + "/api/demo/innovation/state"), timeout=6) as res:
                    state = json.load(res)
                self.assertEqual(state["part"], "PART_2")
                self.assertFalse(state["realGemini"])
                self.assertFalse(state["realPayPal"])
                self.assertEqual(state["paymentState"], "NOT_PAID")
                with self.assertRaises(HTTPError) as denied:
                    OPENER.open(Request(base + "/api/demo/innovation/state", data=b"{}",
                        headers={"Content-Type": "application/json"}, method="POST"),
                        timeout=6)
                self.assertEqual(denied.exception.code, 405)
            finally:
                proc.terminate()
                try:
                    proc.wait(timeout=8)
                except subprocess.TimeoutExpired:
                    proc.kill()
                    proc.wait(timeout=5)


if __name__ == "__main__":
    unittest.main(verbosity=2)
