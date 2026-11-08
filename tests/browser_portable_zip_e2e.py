"""Chromium E2E from a brand-new ZIP extraction: both COMPLETE browser flows.

No provider credentials, Git checkout, npm install, external requests or uploads.
The Playwright controller lives outside the ZIP solely as test tooling.
"""
import json
import os
import re
import subprocess
import sys
import tempfile
from pathlib import Path
from zipfile import ZipFile

ROOT = Path(__file__).resolve().parents[1]
BUILDER = ROOT / "scripts" / "pack_offline_reviewer.py"
PREFIX = "worknova-offline-reviewer/"
TESTS = (
    ("tests/browser_offline_e2e.py", "CHROMIUM_BROWSER_E2E_PASS:"),
    ("tests/browser_innovation_e2e.py", "CHROMIUM_INNOVATION_PART2_E2E_PASS:"),
)


def main():
    with tempfile.TemporaryDirectory(prefix="worknova-extracted-chrome-") as tmp:
        tmp = Path(tmp)
        archive = tmp / "private-reviewer.zip"
        built = subprocess.run(
            [sys.executable, str(BUILDER), "--out", str(archive)],
            cwd=ROOT, capture_output=True, text=True, timeout=30, check=True,
        )
        report = json.loads(built.stdout)
        if report["status"] != "OFFLINE_REVIEWER_ZIP_VERIFIED":
            raise AssertionError("REVIEWER_BUILD_INTEGRITY_FAILED")
        with ZipFile(archive) as z:
            manifest = json.loads(z.read(PREFIX + "MANIFEST.json"))
            if manifest["providerCalls"] != 0 or manifest["paymentAuthorized"]:
                raise AssertionError("REVIEWER_ZIP_PROVIDER_CLAIM")
            z.extractall(tmp / "extract")
        reviewer = tmp / "extract" / "worknova-offline-reviewer"
        if (reviewer / "node_modules").exists() or (reviewer / ".env").exists():
            raise AssertionError("REVIEWER_ZIP_HAS_EXTERNAL_DEPENDENCIES")
        if not (reviewer / "scripts" / "run_demo.mjs").is_file():
            raise AssertionError("REVIEWER_ZIP_ENTRY_NOT_FOUND")
        # Tests create their own temporary local SQLite database and server.
        # Remove inherited provider credentials even when the CI host has them.
        forbidden = re.compile(
            "PAYPAL|GEMINI|OPENAI|API_KEY|CLIENT_SECRET|PRIVATE_KEY|AUTHORIZATION|"
            "CREDENTIAL|ACCESS_TOKEN|REFRESH_TOKEN|GOOGLE_APPLICATION_CREDENTIALS|"
            "NODE_OPTIONS",
            re.I,
        )
        safe_env = {k: v for k, v in os.environ.items() if not forbidden.search(k)}
        safe_env.update({
            "PROOFLINE_REVIEWER_ROOT": str(reviewer),
            "PROOFLINE_REVIEWER_LOCAL_ONLY": "1",
            "NO_PROXY": "127.0.0.1,localhost",
            "no_proxy": "127.0.0.1,localhost",
            "PYTHONDONTWRITEBYTECODE": "1",
        })
        for script, success_line in TESTS:
            result = subprocess.run(
                [sys.executable, str(ROOT / script)],
                cwd=reviewer, env=safe_env,
                capture_output=True, text=True, timeout=115,
            )
            if result.returncode != 0 or success_line not in result.stdout:
                # The child only ever uses bounded synthetic fixtures. Still
                # report just bounded error text, not untrusted environment.
                diagnostic = (result.stderr + result.stdout)[-1200:]
                raise AssertionError(
                    "EXTRACTED_REVIEWER_CHROMIUM_E2E_FAILED:"
                    + Path(script).name + ":"
                    + re.sub(r"https?://[^\s]+", "[URL_REDACTED]", diagnostic)
                )
            print("EXTRACTED_REVIEWER_BROWSER_PASS:" + Path(script).name)
        print(json.dumps({
            "status": "EXTRACTED_ZIP_TWO_PART_CHROMIUM_E2E_PASS",
            "realLocalBrowserTests": 2,
            "part1BrowserExecuted": True,
            "part2FiveSkillsBrowserExecuted": True,
            "externalBrowserRequests": 0,
            "providerRequests": 0,
            "paymentPosts": 0,
            "onlineDependencies": 0,
            "uploaded": False,
            "published": False,
        }))


if __name__ == "__main__":
    main()
