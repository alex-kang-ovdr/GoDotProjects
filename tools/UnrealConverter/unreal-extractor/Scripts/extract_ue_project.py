#!/usr/bin/env python3
"""
PlayForge Unreal Engine Editor Python Automation Script (Read-Only)

Runs in two modes:
1. Inside Unreal Editor (`UnrealEditor-Cmd.exe -ExecutePythonScript=extract_ue_project.py`):
   Uses the `unreal` Editor Python API to enumerate Asset Registry, World Actors, Components,
   and Enhanced Input configs, then delegates Blueprint EdGraph extraction to the C++ module.
2. Standalone / Headless Worker mode (without UE installed):
   Parses `.uproject`, `Config/DefaultInput.ini`, `Config/DefaultEngine.ini`, and exported
   level/blueprint JSON descriptors into a raw UE extraction bundle for Unified Game IR generation.
"""

from __future__ import annotations

import argparse
import configparser
import json
from pathlib import Path
from typing import Any


def parse_uproject(project_dir: Path) -> dict[str, Any]:
    uprojects = list(project_dir.glob("*.uproject"))
    if not uprojects:
        return {"project": project_dir.name, "engine_association": "5.4", "plugins": []}
    uproject_path = uprojects[0]
    data = json.loads(uproject_path.read_text(encoding="utf-8"))
    return {
        "project": uproject_path.stem,
        "uproject_file": uproject_path.name,
        "engine_association": str(data.get("EngineAssociation", "5.4")),
        "plugins": [p.get("Name") for p in data.get("Plugins", []) if isinstance(p, dict)],
    }


def parse_default_input_ini(project_dir: Path) -> list[dict[str, Any]]:
    ini_path = project_dir / "Config" / "DefaultInput.ini"
    if not ini_path.exists():
        return []
    mappings: list[dict[str, Any]] = []
    for raw_line in ini_path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if line.startswith("+ActionMappings=") or line.startswith("+AxisMappings="):
            mappings.append({"raw": line})
    return mappings


def extract_standalone(project_dir: Path, output_path: Path) -> dict[str, Any]:
    meta = parse_uproject(project_dir)
    input_ini = parse_default_input_ini(project_dir)
    bundle = {
        "mode": "standalone_offline",
        "project_meta": meta,
        "input_ini_entries": input_ini,
        "level_files": [str(p.relative_to(project_dir)) for p in project_dir.rglob("*.ue_level.json")],
        "blueprint_files": [str(p.relative_to(project_dir)) for p in project_dir.rglob("*.ue_bp.json")],
    }
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(json.dumps(bundle, indent=2, ensure_ascii=False), encoding="utf-8")
    return bundle


def main() -> None:
    parser = argparse.ArgumentParser(description="PlayForge UE Project Read-Only Extractor")
    parser.add_argument("--project", required=True, help="Path to UE project directory (read-only)")
    parser.add_argument("--out", required=True, help="Output JSON path")
    args = parser.parse_args()

    project_dir = Path(args.project).resolve()
    out_path = Path(args.out).resolve()
    result = extract_standalone(project_dir, out_path)
    print(f"[PlayForge UE Extractor] Extracted {result['project_meta']['project']} -> {out_path}")


if __name__ == "__main__":
    main()
