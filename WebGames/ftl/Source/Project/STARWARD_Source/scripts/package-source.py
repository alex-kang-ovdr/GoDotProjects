#!/usr/bin/env python3
"""Package the public, self-contained game sources using only Python's stdlib.

Run build-offline.cjs first. An explicit allowlist prevents workspace metadata,
credentials, repository internals, and earlier ZIPs from entering the archive.
"""
from pathlib import Path
import json
import shutil
import zipfile

ROOT = Path(__file__).resolve().parent.parent
OUTPUT = ROOT / "artifacts" / "STARWARD_Source.zip"
WEB_COPY = ROOT / "dist" / "STARWARD_Source.zip"
MEMBERS = [
    "README.md",
    "CHANGELOG.md",
    "docs/v3_combat.md",
    "docs/v3_progression.md",
    "docs/v3_architecture.md",
    "docs/v4_equipment.md",
    "docs/v4_tactics.md",
    "docs/v4_validation.md",
    "docs/v5_layouts.md",
    "docs/v5_navigation.md",
    "docs/v5_validation.md",
    "docs/v6_firing_and_abilities.md",
    "docs/v6_world_events_and_quests.md",
    "docs/v6_validation_and_compatibility.md",
    "docs/v7_system_slots.md",
    "docs/v7_crew_grid_combat.md",
    "docs/v7_render_modes.md",
    "docs/v7_validation.md",
    "dist/index.html",
    "dist/style.css",
    "dist/data.js",
    "dist/engine.js",
    "dist/campaign.js",
    "dist/app.js",
    "dist/render3d.js",
    "dist/STARWARD_Offline.html",
    "artifacts/STARWARD_Offline.html",
    "scripts/build-offline.cjs",
    "scripts/package-source.py",
    "tests/verification-v6.json",
    "tests/verification-v7.json",
]

# Screenshot proof remains outside the downloadable source archive. Keeping
# only code, Markdown, fixtures and the offline build reduces download size.

# Include new regression suites and explicit fixture formats automatically,
# without walking the repository or packaging environment/private metadata.
MEMBERS += sorted(path.relative_to(ROOT).as_posix()
                  for path in (ROOT / "tests").glob("*.cjs")
                  if path.is_file() and not path.is_symlink())
MEMBERS += sorted(path.relative_to(ROOT).as_posix()
                  for path in (ROOT / "tests" / "fixtures").rglob("*")
                  if path.is_file() and not path.is_symlink()
                  and path.suffix.lower() in {".json", ".md"}
                  and not any(part.startswith(".") for part in path.relative_to(ROOT).parts))
if len(MEMBERS) != len(set(MEMBERS)):
    raise SystemExit("Duplicate allowlisted source path")

missing = [name for name in MEMBERS if not (ROOT / name).is_file()]
if missing:
    raise SystemExit("Missing required deliverables; finish sources and run the offline build first: " + ", ".join(missing))

OUTPUT.parent.mkdir(parents=True, exist_ok=True)
with zipfile.ZipFile(OUTPUT, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=9) as archive:
    for name in MEMBERS:
        archive.write(ROOT / name, arcname="STARWARD_Source/" + name)

with zipfile.ZipFile(OUTPUT, "r") as archive:
    invalid = archive.testzip()
    if invalid:
        raise SystemExit("ZIP integrity check failed for: " + invalid)
    archive_names = archive.namelist()
    if len(archive_names) != len(MEMBERS):
        raise SystemExit("Unexpected archive member count")
    if any(Path(name).suffix.lower() == ".zip" or any(part.startswith(".") for part in Path(name).parts) for name in archive_names):
        raise SystemExit("Unexpected archive metadata or nested ZIP")

WEB_COPY.parent.mkdir(parents=True, exist_ok=True)
shutil.copyfile(OUTPUT, WEB_COPY)
print(json.dumps({"output": str(OUTPUT), "web_copy": str(WEB_COPY), "bytes": OUTPUT.stat().st_size, "members": archive_names}, ensure_ascii=False, indent=2))
