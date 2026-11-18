#!/usr/bin/env python3
"""Build a portable source index from the delivered evidence ledgers."""
from pathlib import Path
import csv
import json

ROOT = Path(__file__).resolve().parents[1]


def main():
    raw = json.loads((ROOT / "raw/source_manifest.json").read_text())
    rules = json.loads((ROOT / "docs/rules_sources.json").read_text())
    meta = json.loads((ROOT / "docs/vision_meta_sources.json").read_text())
    rows = []
    for i, r in enumerate(raw["records"], 1):
        rows.append({"source_id": f"RAW{i:03}", "family": "official_static", "title": r["file"],
                     "url": r["source_url"], "local_path": r["file"],
                     "observed_at": r["retrieved_at_utc"], "version_or_scope": r.get("ddragon_version"),
                     "locale": r.get("locale"), "source_sha256": r["source_sha256"],
                     "stored_sha256": r["stored_sha256"]})
    for r in rules["sources"]:
        rows.append({"source_id": r["source_id"], "family": "rules", "title": r["title"],
                     "url": r["url"], "local_path": "docs/rules_sources.json", "observed_at": r.get("retrieved_at"),
                     "version_or_scope": r.get("evidence_patch"), "locale": None,
                     "source_sha256": None, "stored_sha256": None})
    for r in meta["sources"]:
        rows.append({"source_id": r["id"], "family": "vision_meta", "title": r["title"],
                     "url": r["url"], "local_path": "docs/vision_meta_sources.json", "observed_at": r.get("observed_at"),
                     "version_or_scope": r.get("scope"), "locale": None,
                     "source_sha256": None, "stored_sha256": None})
    common = [
        ("D01", "Riot Developer Portal / League of Legends", "https://developer.riotgames.com/docs/lol", "official_documentation"),
        ("D02", "Data Dragon versions", "https://ddragon.leagueoflegends.com/api/versions.json", "discovery_snapshot"),
        ("D03", "KR realm", "https://ddragon.leagueoflegends.com/realms/kr.json", "discovery_snapshot"),
        ("D04", "Official patch schedule", "https://support.riotgames.com/en-us/league-of-legends/gameplay/patch-schedule-league-of-legends", "observed_2026-11-17"),
    ]
    for key, title, url, scope in common:
        rows.append({"source_id": key, "family": "common", "title": title, "url": url,
                     "local_path": "docs/98_sources_and_reconstruction_ledger.md", "observed_at": "2026-11-17 KST",
                     "version_or_scope": scope, "locale": None, "source_sha256": None, "stored_sha256": None})
    assert len({r["source_id"] for r in rows}) == len(rows)
    assert all(r["url"].startswith("https://") for r in rows)
    out = ROOT / "analysis"
    out.mkdir(exist_ok=True)
    index = {"observed_on_kst": "2026-11-17", "source_records": len(rows), "unique_urls": len({r["url"] for r in rows}),
             "note": "Repeated URLs retain distinct evidence contexts; source hashes refer to acquired original bytes only when available.", "sources": rows}
    (out / "source_index.json").write_text(json.dumps(index, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    with (out / "source_index.csv").open("w", encoding="utf-8-sig", newline="") as f:
        w = csv.DictWriter(f, fieldnames=list(rows[0])); w.writeheader(); w.writerows(rows)
    conflicts = [{"ledger": "rules", **r} for r in rules["conflicts"]] + [{"ledger": "vision_meta", **r} for r in meta["conflicts"]]
    (out / "source_conflicts.json").write_text(json.dumps({"count": len(conflicts), "records": conflicts}, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"source_records": len(rows), "unique_urls": index["unique_urls"], "conflict_records": len(conflicts)}))


if __name__ == "__main__":
    main()
