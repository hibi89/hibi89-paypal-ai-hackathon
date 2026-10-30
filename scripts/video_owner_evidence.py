"""Sanitized read-only historical Gemini / PayPal Sandbox video evidence.

Never contacts providers, never executes payment, never exports user identifiers
or SQLite files. A LOCAL receipt is not a fresh remote PayPal/Gemini attestation.
"""
import json
import os
import re
import subprocess
import shutil
from pathlib import Path

SAFE_SKILLS = ("web", "design", "payments", "automation", "data", "qa")
SENSITIVE_ENV = re.compile(
    r"SECRET|TOKEN|PASSWORD|CREDENTIAL|API_KEY|CLIENT_ID|MERCHANT_ID|"
    r"GEMINI|PAYPAL|OPENAI|AUTHORIZATION|PRIVATE_KEY|NODE_OPTIONS", re.I
)
LOCAL_STATUS = "LOCAL_PROVIDER_RESULT_RECORDED_NOT_FRESH_GET"


def git_source_snapshot(root):
    """Read exact Git SHA and all non-ignored worktree changes, without network.

    Untracked source modules/assets must not be presented as committed code.
    Git status output is handled only in memory and never printed; ignored
    recordings and isolated toolchain files are checked separately.
    """
    try:
        sha = subprocess.run(
            ["git", "rev-parse", "--verify", "HEAD"], cwd=root,
            capture_output=True, text=True, timeout=4, check=True
        ).stdout.strip()
        if not re.fullmatch(r"[0-9a-f]{40}", sha):
            return {"sha": None, "clean": False}
        state = subprocess.run(
            ["git", "status", "--porcelain=v1", "--untracked-files=normal", "--"],
            cwd=root, capture_output=True, text=True, timeout=4, check=False
        )
        return {"sha": sha, "clean": state.returncode == 0
                and isinstance(state.stdout, str) and len(state.stdout) == 0}
    except (OSError, subprocess.SubprocessError):
        return {"sha": None, "clean": False}


def sanitize_saved_receipt(report):
    """Expose only a tiny allowlist of observed boolean facts and taxonomy."""
    fallback = {
        "source": "OWNER_REPORTED_2026_10_28_NOT_VERIFIED_ON_THIS_DEVICE",
        "skills": ["web", "payments", "qa"],
        "payment": "HISTORICAL_OWNER_REPORT_ONLY",
        "amount": "USD 1.50 (owner reported)",
        "local_receipt_verified": False,
    }
    if not isinstance(report, dict):
        return fallback
    skills = report.get("classifiedSkills")
    if not isinstance(report.get("localStates"), dict):
        return fallback
    if (report.get("status") != LOCAL_STATUS
        or report.get("mode") != "READ_ONLY_PRIVATE_SQLITE_EVIDENCE_NO_NETWORK"
        or report.get("ownerReportedLiveRunNotIndependentlyAttested") is not True
        or any(report.get(k) is not False for k in (
            "providerGetPerformedNow", "providerPostPerformedNow",
            "geminiCallPerformedNow", "sqliteWritesPerformed", "secretsRead",
            "privateIdentifiersPrinted", "freshRemotePaymentProof",
            "productionOrLivePaymentProof", "safeToRepeatPayment"))
        or report.get("localAuditIntegrity") != "PASS"
        or report.get("amountMinor") != 150
        or report.get("currency") != "USD"
        or not isinstance(skills, list) or not skills
        or len(skills) > len(SAFE_SKILLS)
        or len(set(map(str, skills))) != len(skills)
        or any(type(s) is not str or s not in SAFE_SKILLS for s in skills)
        or report.get("localStates", {}).get("gemini") != "COMMITTED"
        or report.get("localStates", {}).get("create") != "APPROVED"
        or report.get("localStates", {}).get("capture") != "PAID"):
        return fallback
    return {
        "source": "OWNER_LOCAL_SQLITE_READ_ONLY_RECORDED_NOT_FRESH_GET",
        "skills": sorted(skills, key=SAFE_SKILLS.index),
        "payment": "HISTORICAL_CAPTURE_PAID_LOCALLY_RECORDED",
        "amount": "USD 1.50 (human approved, Sandbox)",
        "local_receipt_verified": True,
    }


def collect_saved_receipt(root):
    """Read only the existing local receipt via the dedicated safe inspector.

    The inspector explicitly opens the original SQLite immutable and query_only.
    Its output is parsed into a strict allowlist, not copied to a public file.
    """
    env = {k: v for k, v in os.environ.items()
           if not SENSITIVE_ENV.search(k)}
    try:
        result = subprocess.run(
            ["node", "--experimental-sqlite", "scripts/print_owner_mvp_receipt.mjs"],
            cwd=root, env=env, capture_output=True, text=True, timeout=10,
            encoding="utf-8", errors="replace", check=False
        )
        if result.returncode != 0 or len(result.stdout) > 16384:
            return sanitize_saved_receipt(None)
        return sanitize_saved_receipt(json.loads(result.stdout))
    except (OSError, ValueError, subprocess.TimeoutExpired):
        return sanitize_saved_receipt(None)



def premium_storyboard_cards(proof):
    """Condensed human-readable evidence lens, never raw receipt fields.
    This presentation is available ONLY to the opt-in premium recorder.
    Original detailed storyboard_cards() remains unchanged for standard CI.
    """
    verified = proof["local_receipt_verified"]
    source = ("OWNER-REPORTED · LOCAL RECEIPT READ-ONLY MATCH"
              if verified else "OWNER REPORT ONLY · RECEIPT NOT PRESENT HERE")
    return [
        {
            "scene": "gemini", "indexLabel": "01 / 03",
            "title": "AI identified the skills.",
            "subtitle": "A previous Gemini classification, clearly separated from today's synthetic matching.",
            "sourceLabel": source,
            "tags": [str(skill).upper() for skill in proof["skills"]],
            "note": ("Saved local result checked read-only. No fresh Gemini call."
                     if verified else
                     "Original provider result not present. Owner report only; no Gemini call."),
        },
        {
            "scene": "paypal", "indexLabel": "02 / 03",
            "title": "Human approval first.",
            "subtitle": "A separately reported October 28 Sandbox sequence—not a payment performed in this video.",
            "sourceLabel": source,
            "tags": [],
            "note": ("Local saved capture state checked read-only, not a fresh PayPal GET."
                     if verified else
                     "Previously reported by owner; not reproduced or verified on this machine."),
        },
        {
            "scene": "provenance", "indexLabel": "03 / 03",
            "title": "Proof has a source.",
            "subtitle": "Simulation and historical evidence stay on different sides of the line.",
            "sourceLabel": source,
            "tags": [],
            "note": ("Owner-local history checked read-only. No new provider calls."
                     if verified else
                     "Historical provider activity not verified in this local session."),
        },
    ]

def storyboard_cards(proof):
    verified = proof["local_receipt_verified"]
    source = ("OWNER DEVICE · PREVIOUS LOCAL RECEIPT PASSED READ-ONLY CHECK"
              if verified else
              "OWNER REPORT · ORIGINAL RECEIPT NOT VERIFIED ON THIS MACHINE")
    return [
        {
            "heading": "01 / GEMINI AI — 2026-10-28",
            "eyebrow": source,
            "lines": [
                "Gemini API classified the owner's original project brief.",
                "Previously reported skills: " + ", ".join(proof["skills"]),
                ("Consistent saved local model result found — NO fresh Gemini call."
                 if verified else
                 "Original provider output is not present in this CI/synthetic session."),
                "The 3 fictional profiles shown earlier are deterministic matching, NOT live Gemini.",
            ],
        },
        {
            "heading": "02 / PAYPAL SANDBOX — 2026-10-28",
            "eyebrow": source,
            "lines": [
                "Human-approved test amount: " + proof["amount"],
                "Previously reported sequence: Orders CREATE → separate Sandbox buyer APPROVE",
                "Owner-authorized CAPTURE → later PayPal provider GET verification",
                ("Saved local capture state PAID and audit PASS — NOT a fresh provider GET."
                 if verified else
                 "Sequence reported by owner; not replayed or verified on this machine."),
                "Sandbox only: NO Live charge, no second payment, no browser payment POST.",
            ],
        },
        {
            "heading": "03 / PROVENANCE & SAFETY",
            "eyebrow": "READ CAREFULLY · TWO DIFFERENT EVIDENCE SOURCES",
            "lines": [
                "SOURCE A: synthetic browser with fictional sellers and local SQLite audit.",
                "SOURCE B: owner-reported Oct 28 Gemini + PayPal Sandbox one-shot.",
                ("Local receipt rechecked READ-ONLY; original provider APIs NOT contacted."
                 if verified else
                 "Original private receipt unavailable; historical owner claim ONLY."),
                "No order/capture IDs, tokens, buyer data or private SQLite shown.",
                "Not independently provider-attested; no production integration claimed.",
            ],
        },
    ]


def preserve_private_recording(source_path, dest_path, manifest):
    """Exclusively save a private video and manifest without replacing earlier evidence.

    The original Playwright recording stays intact until both outputs exist.
    If a write fails, only newly created outputs are rolled back.
    """
    source, dest = Path(source_path), Path(dest_path)
    manifest_path = dest.with_suffix(".manifest.json")
    if source == dest or any(path.exists() or path.is_symlink()
                             for path in (dest, manifest_path)):
        raise RuntimeError("PRIVATE_RECORDING_ALREADY_EXISTS")
    made_video = False
    made_manifest = False
    try:
        with source.open("rb") as original:
            with dest.open("xb") as output:
                made_video = True
                shutil.copyfileobj(original, output, length=1024 * 1024)
        with manifest_path.open("x", encoding="utf-8") as output:
            made_manifest = True
            output.write(json.dumps(manifest, indent=2) + "\n")
    except BaseException:
        if made_manifest:
            manifest_path.unlink(missing_ok=True)
        if made_video:
            dest.unlink(missing_ok=True)
        raise
    source.unlink()
    return manifest_path
