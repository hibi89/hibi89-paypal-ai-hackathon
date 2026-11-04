"""Minimal, deterministic OFFLINE reviewer ZIP. No provider calls or upload."""
import argparse
import hashlib
import json
import re
import tempfile
from pathlib import Path
from zipfile import ZipFile, ZipInfo, ZIP_DEFLATED

ROOT = Path(__file__).resolve().parents[1]
DEFAULT = ROOT / "output" / "submission" / "proofline-offline-reviewer.zip"
PREFIX = "proofline-offline-reviewer/"
ENTRY = "scripts/run_demo.mjs"
IMPORT = re.compile(r"(?:\bfrom\s*|\bimport\s*[(]?\s*)['\"](\.[^'\"\r\n]+)['\"]")
ASSETS = frozenset({".html", ".js", ".css", ".svg"})
README = """# Proofline — private offline reviewer package

Node.js 22.5+ is required. No Git, npm install, account, API key or Internet
access is needed after receiving the ZIP. Extract the entire directory.
Inside proofline-offline-reviewer, run: npm run demo
Open the printed http://127.0.0.1:PORT on the same computer.
Use AI Work and Global Services; /demo/innovation has all five skills.
Stop with Ctrl+C; local synthetic state is disposable.

SYNTHETIC OFFLINE DEMO ONLY. No actual PayPal or Gemini calls; no real sellers,
paid orders, deployed checkout or autonomous payment. Any earlier owner-reported
provider evidence is separate and NOT independently reproduced by this bundle.
This local ZIP is NOT a public release, YouTube video or Devpost submission.
"""
PACKAGE = {
    "name": "proofline-offline-reviewer", "version": "0.1.0",
    "private": True, "type": "module",
    "scripts": {"demo": "node --experimental-sqlite scripts/run_demo.mjs"},
    "engines": {"node": ">=22.5.0"}, "license": "MIT",
}


def read_safe(file):
    if file.is_symlink() or not file.is_file():
        raise ValueError("UNSAFE_REVIEWER_FILE")
    real = file.resolve()
    if not real.is_relative_to(ROOT) or file.stat().st_size > 2 * 1024 * 1024:
        raise ValueError("REVIEWER_FILE_BOUNDARY_FAILED")
    return real.read_bytes()


def sources():
    files, seen, pending = {}, set(), [ENTRY]
    while pending:
        name = pending.pop()
        if name in seen:
            continue
        if not (name == ENTRY or name.startswith("src/")) or not name.endswith((".mjs", ".js")):
            raise ValueError("REVIEWER_DEPENDENCY_OUT_OF_SCOPE")
        seen.add(name)
        data = read_safe(ROOT / name)
        files[name] = data
        for match in IMPORT.finditer(data.decode("utf-8")):
            target = (ROOT / name).parent.joinpath(match.group(1)).resolve()
            if not target.is_relative_to(ROOT):
                raise ValueError("REVIEWER_IMPORT_ESCAPED_ROOT")
            relative = target.relative_to(ROOT).as_posix()
            if relative not in seen:
                pending.append(relative)
    for asset in sorted((ROOT / "web").rglob("*")):
        if asset.is_symlink():
            raise ValueError("UNSAFE_REVIEWER_ASSET")
        if asset.is_dir():
            continue
        if asset.suffix not in ASSETS:
            raise ValueError("REVIEWER_ASSET_EXTENSION_REJECTED")
        files[asset.relative_to(ROOT).as_posix()] = read_safe(asset)
    if not any(p.startswith("src/") for p in files) or (
        "web/offline_demo.html" not in files or
        "web/innovation_dashboard.html" not in files
    ):
        raise ValueError("REVIEWER_TWO_PART_RUNTIME_MISSING")
    files["LICENSE"] = read_safe(ROOT / "LICENSE")
    files["package.json"] = (json.dumps(PACKAGE, indent=2) + "\n").encode()
    files["REVIEWER_README.md"] = README.encode()
    if sum(map(len, files.values())) > 12 * 1024 * 1024:
        raise ValueError("REVIEWER_BUNDLE_TOO_LARGE")
    return files


def verify_zip(path):
    with ZipFile(path, "r") as archive:
        paths = archive.namelist()
        if len(paths) != len(set(paths)) or any(
            not p.startswith(PREFIX) or ".." in Path(p).parts or p.endswith("/")
            for p in paths
        ):
            raise ValueError("REVIEWER_ZIP_PATH_INVALID")
        manifest_path = PREFIX + "MANIFEST.json"
        manifest = json.loads(archive.read(manifest_path))
        if (manifest.get("schemaVersion") != 1 or
            manifest.get("evidenceClass") != "OFFLINE_SYNTHETIC_NO_PROVIDER" or
            manifest.get("providerCalls") != 0 or
            manifest.get("paymentAuthorized") is not False or
            manifest.get("submitted") is not False):
            raise ValueError("REVIEWER_ZIP_PROVENANCE_INVALID")
        indexed = manifest.get("files")
        if not isinstance(indexed, dict) or set(paths) != {
            PREFIX + name for name in indexed
        } | {manifest_path}:
            raise ValueError("REVIEWER_ZIP_MANIFEST_MISMATCH")
        for name, sha in indexed.items():
            if hashlib.sha256(archive.read(PREFIX + name)).hexdigest() != sha:
                raise ValueError("REVIEWER_ZIP_HASH_MISMATCH")
        return {"status": "OFFLINE_REVIEWER_ZIP_VERIFIED",
                "files": len(indexed), "bytes": path.stat().st_size,
                "providerCalls": 0, "paymentAuthorized": False,
                "published": False}


def build(out):
    out = Path(out)
    if out.is_symlink() or out.exists():
        raise ValueError("REVIEWER_ZIP_ALREADY_EXISTS_NO_OVERWRITE")
    files = sources()
    manifest = {"schemaVersion": 1,
                "evidenceClass": "OFFLINE_SYNTHETIC_NO_PROVIDER",
                "providerCalls": 0, "paymentAuthorized": False, "submitted": False,
                "files": {p: hashlib.sha256(data).hexdigest()
                          for p, data in sorted(files.items())}}
    files["MANIFEST.json"] = (json.dumps(manifest, sort_keys=True, indent=2)
                              + "\n").encode()
    out.parent.mkdir(parents=True, exist_ok=True)
    try:
        with out.open("xb") as stream:
            with ZipFile(stream, "w", compression=ZIP_DEFLATED, compresslevel=9) as z:
                for name, data in sorted(files.items()):
                    entry = ZipInfo(PREFIX + name, date_time=(2026, 1, 1, 0, 0, 0))
                    entry.create_system = 3
                    entry.external_attr = 0o100644 << 16
                    entry.compress_type = ZIP_DEFLATED
                    z.writestr(entry, data, compress_type=ZIP_DEFLATED, compresslevel=9)
        return verify_zip(out)
    except Exception:
        out.unlink(missing_ok=True)
        raise


def main():
    parser = argparse.ArgumentParser(description="Local private reviewer ZIP (no upload)")
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument("--out", type=Path, default=DEFAULT)
    mode.add_argument("--check", action="store_true")
    args = parser.parse_args()
    if args.check:
        with tempfile.TemporaryDirectory(prefix="proofline-reviewer-") as folder:
            result = build(Path(folder) / "reviewer.zip")
    else:
        result = build(args.out)
    print(json.dumps({**result, "savedLocally": not args.check,
                      "releaseAuthorized": False, "remoteUpload": False}))


if __name__ == "__main__":
    main()
