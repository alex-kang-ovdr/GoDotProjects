#!/usr/bin/env python3
"""Validate packaging, portable links and preserved evidence. No game test claims."""
from pathlib import Path
from urllib.parse import unquote, urlparse
import argparse
import csv
import hashlib
import json
import re
import sys

ROOT = Path(__file__).resolve().parents[1]
REPORT = ROOT / "analysis/package_validation.json"
MANIFEST = ROOT / "PACKAGE_MANIFEST.json"


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def files():
    return sorted(p for p in ROOT.rglob("*") if p.is_file() and "__pycache__" not in p.parts and p.suffix != ".pyc" and p not in (MANIFEST, REPORT))


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--write-manifest", action="store_true", help="Create a new manifest for an intentionally updated package.")
    args = parser.parse_args()
    errors, checks = [], []
    baseline = json.loads((ROOT / "docs/baseline_integrity.json").read_text())
    for entry in baseline["files"]:
        p = ROOT / entry["file"]
        if not p.is_file() or sha(p) != entry["sha256"] or p.stat().st_size != entry["bytes"]:
            errors.append(f"Baseline changed: {entry['file']}")
    checks.append({"name": "baseline_bytes_and_hashes", "files": len(baseline["files"])})

    local_links, markdown_files = 0, 0
    for p in sorted(ROOT.rglob("*.md")):
        markdown_files += 1
        content = p.read_text(encoding="utf-8")
        fences = re.findall(r"^\s*```", content, flags=re.M)
        if len(fences) % 2:
            errors.append(f"Unclosed code fence: {p.relative_to(ROOT)}")
        prose = re.sub(r"^\s*```.*?^\s*```[^\n]*", "", content, flags=re.M | re.S)
        for target in re.findall(r"!?\[[^\]\n]+\]\(([^)\n]+)\)", prose):
            target = target.strip().split(' "', 1)[0].strip("<>")
            if urlparse(target).scheme or target.startswith("#"):
                continue
            path = unquote(target.split("#", 1)[0].split("?", 1)[0])
            if not path:
                continue
            local_links += 1
            if not (p.parent / path).resolve().exists():
                errors.append(f"Broken local link: {p.relative_to(ROOT)} -> {target}")
    checks.append({"name": "markdown_fences_and_local_file_links", "markdown_files": markdown_files, "local_links": local_links,
                   "scope_note": "Checks file targets, not remote URLs or Markdown heading fragments."})

    json_count = 0
    for p in files():
        if p.suffix == ".json":
            try:
                json.loads(p.read_text(encoding="utf-8")); json_count += 1
            except Exception as exc:
                errors.append(f"Invalid JSON: {p.relative_to(ROOT)}: {exc}")
    checks.append({"name": "all_delivered_json_parses", "files": json_count})

    with (ROOT / "docs/rules_verified_parameters.csv").open(encoding="utf-8-sig", newline="") as f:
        rules = list(csv.DictReader(f))
    source_ids = {s["source_id"] for s in json.loads((ROOT / "docs/rules_sources.json").read_text())["sources"]}
    for r in rules:
        try:
            json.loads(r["value_json"])
        except Exception:
            errors.append(f"Invalid rule value_json: {r.get('rule_id')}")
        if r["source_id"] not in source_ids:
            errors.append(f"Missing rule source: {r['source_id']}")
    checks.append({"name": "rule_values_and_source_references", "rows": len(rules)})

    cases = json.loads((ROOT / "analysis/planned_acceptance_cases.json").read_text())
    if len({c["case_id"] for c in cases}) != len(cases) or not all(c["status"] == "planned_not_executed" and c["observed_result"] is None for c in cases):
        errors.append("Acceptance plan contains a duplicate ID or an unsupported execution claim")
    checks.append({"name": "planned_cases_are_not_test_results", "cases": len(cases)})

    index = json.loads((ROOT / "analysis/source_index.json").read_text())
    if not all(s.get("url", "").startswith("https://") for s in index["sources"]):
        errors.append("Source index lacks a portable absolute source URL")
    checks.append({"name": "portable_source_urls", "records": len(index["sources"])})

    if args.write_manifest:
        entries = [{"path": str(p.relative_to(ROOT)), "bytes": p.stat().st_size, "sha256": sha(p)} for p in files()]
        MANIFEST.write_text(json.dumps({"schema_version": 1, "package_date_kst": "2026-11-17",
            "excluded": ["PACKAGE_MANIFEST.json", "analysis/package_validation.json", "__pycache__", "*.pyc"],
            "files": entries}, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    if not MANIFEST.is_file():
        errors.append("Missing PACKAGE_MANIFEST.json; release author must create it with --write-manifest")
    else:
        manifest = json.loads(MANIFEST.read_text())
        expected = {e["path"] for e in manifest["files"]}
        actual = {str(p.relative_to(ROOT)) for p in files()}
        if expected != actual:
            errors.append(f"Manifest file-set mismatch: added={sorted(actual - expected)}, missing={sorted(expected - actual)}")
        for e in manifest["files"]:
            p = ROOT / e["path"]
            if not p.is_file() or sha(p) != e["sha256"] or p.stat().st_size != e["bytes"]:
                errors.append(f"Manifest mismatch: {e['path']}")
        checks.append({"name": "package_file_set_and_hashes", "files": len(manifest["files"])})
    report = {"status": "passed" if not errors else "failed", "checks": checks, "errors": errors,
              "game_runtime_tests_executed": False, "remote_url_availability_tested": False}
    REPORT.parent.mkdir(exist_ok=True)
    REPORT.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(report, ensure_ascii=False, indent=2))
    return 0 if not errors else 1


if __name__ == "__main__":
    sys.exit(main())
