#!/usr/bin/env python3
"""Deep game-data extractor for C:\\Temp\\Cosmoteer\\Data\\.

Extracts real Cosmoteer rules into data/extracted_rules.json (pure text data,
zero commercial binaries):
- Localized EN names & descriptions from Data/strings/en.rules
- All 5 Factions from Data/factions/factions.rules
- All Buff definitions from Data/buffs/buffs.rules
- All Space Sector Backgrounds from Data/backgrounds/*.rules
- All 20 Projectiles from Data/shots/*/*.rules
- Deep extracted combat/reactor/shield/crew specs for all 96 Terran parts
"""

from __future__ import annotations

import argparse
import json
import os
import re
import sys
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parent.parent
DEFAULT_DATA = Path(r"C:\Temp\Cosmoteer\Data")
CATALOG_PATH = ROOT / "data" / "catalog.json"
DEFAULT_OUT = ROOT / "data" / "extracted_rules.json"


def _strip_comments(text: str) -> str:
    text = re.sub(r"/\*[\s\S]*?\*/", "", text)
    text = re.sub(r"//[^\n]*", "", text)
    return text


def _eval_num(expr: str) -> float | None:
    expr = expr.strip().rstrip("d").rstrip("%").strip()
    m = re.fullmatch(r"(-?\d+(?:\.\d+)?)\s*/\s*(-?\d+(?:\.\d+)?)", expr)
    if m:
        denom = float(m.group(2))
        return float(m.group(1)) / denom if denom != 0 else None
    m2 = re.fullmatch(r"-?\d+(?:\.\d+)?", expr)
    if m2:
        return float(expr)
    return None


def _find_first_number(text: str, key: str) -> float | None:
    # Matches: Key = 123, Key = 2/9, Key = 270d, Key = { BaseValue = 10000; ... }
    pat_obj = re.compile(rf"\b{re.escape(key)}\s*=\s*\{{[^}}]*?\bBaseValue\s*=\s*([0-9./-]+)", re.S)
    m = pat_obj.search(text)
    if m:
        val = _eval_num(m.group(1))
        if val is not None:
            return val
    pat_val = re.compile(rf"(?m)^\s*{re.escape(key)}\s*=\s*([0-9./-]+d?)")
    m2 = pat_val.search(text)
    if m2:
        return _eval_num(m2.group(1))
    return None


def _find_all_numbers(text: str, key: str) -> list[float]:
    vals: list[float] = []
    for m in re.finditer(rf"\b{re.escape(key)}\s*=\s*\{{[^}}]*?\bBaseValue\s*=\s*([0-9./-]+)", text, re.S):
        v = _eval_num(m.group(1))
        if v is not None:
            vals.append(v)
    for m in re.finditer(rf"(?m)^\s*{re.escape(key)}\s*=\s*([0-9./-]+d?)", text):
        v = _eval_num(m.group(1))
        if v is not None:
            vals.append(v)
    return vals


def _find_color_hex(text: str, key: str) -> str | None:
    m = re.search(rf"\b{re.escape(key)}\s*=\s*\[\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)", text)
    if not m:
        return None
    r, g, b = (max(0, min(255, int(m.group(i)))) for i in (1, 2, 3))
    return f"#{r:02x}{g:02x}{b:02x}"


def parse_en_strings(data_root: Path) -> dict[str, str]:
    """Parse key->string pairs from Data/strings/en.rules (Parts/*, Factions/*, Resources/*)."""
    p = data_root / "strings" / "en.rules"
    if not p.is_file():
        return {}
    text = _strip_comments(p.read_text(encoding="utf-8", errors="ignore"))
    result: dict[str, str] = {}
    stack: list[str] = []
    pending_key: str | None = None
    for raw_line in text.splitlines():
        line = raw_line.strip()
        if not line:
            continue
        # Handle inline "Key = \"Value\""
        kv = re.match(r'^([A-Za-z0-9_/-]+)\s*=\s*"((?:\\.|[^"\\])*)"', line)
        if kv:
            full_key = "/".join(stack + [kv.group(1)])
            val = kv.group(2).replace('\\"', '"').replace("\\n", " ")
            if full_key.startswith(("Parts/", "Factions/", "Resources/")):
                result[full_key] = val
            continue
        # Section open: Name { or Name \n {
        open_inline = re.match(r"^([A-Za-z0-9_/-]+)\s*(?:=\s*)?\{$", line)
        if open_inline:
            stack.append(open_inline.group(1))
            pending_key = None
            continue
        if line == "{":
            stack.append(pending_key or "_")
            pending_key = None
            continue
        if line == "}":
            if stack:
                stack.pop()
            pending_key = None
            continue
        key_only = re.match(r"^([A-Za-z0-9_/-]+)\s*$", line)
        if key_only:
            pending_key = key_only.group(1)
    return result


def extract_factions(data_root: Path, strings: dict[str, str]) -> list[dict[str, Any]]:
    p = data_root / "factions" / "factions.rules"
    if not p.is_file():
        return []
    text = _strip_comments(p.read_text(encoding="utf-8", errors="ignore"))
    factions: list[dict[str, Any]] = []
    # Split blocks by NameKey = "Factions/..."
    matches = list(re.finditer(r'NameKey\s*=\s*"(Factions/([A-Za-z0-9_]+))"', text))
    for i, m in enumerate(matches):
        start = m.start()
        end = matches[i + 1].start() if i + 1 < len(matches) else len(text)
        chunk = text[start:end]
        name_key = m.group(1)
        fid = m.group(2).lower()
        color = _find_color_hex(chunk, "BorderColor") or "#78b8d4"
        factions.append({
            "id": fid,
            "name_key": name_key,
            "name_en": strings.get(name_key, m.group(2)),
            "description_en": strings.get(name_key + "Desc", ""),
            "color": color,
            "source_file": "factions/factions.rules",
        })
    return factions


def extract_buffs(data_root: Path) -> dict[str, dict[str, Any]]:
    p = data_root / "buffs" / "buffs.rules"
    if not p.is_file():
        return {}
    text = _strip_comments(p.read_text(encoding="utf-8", errors="ignore"))
    buffs: dict[str, dict[str, Any]] = {}
    for m in re.finditer(r"(?m)^([A-Za-z0-9_]+)\s*\{\s*\}", text):
        bid = m.group(1)
        buffs[bid] = {"id": bid, "combine_mode": "Add"}
    for m in re.finditer(r"(?m)^([A-Za-z0-9_]+)\s*\r?\n\{([\s\S]*?)^\}", text):
        bid = m.group(1)
        body = m.group(2)
        combine = re.search(r"CombineMode\s*=\s*([A-Za-z0-9_]+)", body)
        base_val = _find_first_number(body, "BaseValue")
        max_val = _find_first_number(body, "MaxValue")
        color = _find_color_hex(body, "RectBorderColor")
        buffs[bid] = {
            "id": bid,
            "combine_mode": combine.group(1) if combine else "Add",
            **({"base_value": base_val} if base_val is not None else {}),
            **({"max_value": max_val} if max_val is not None else {}),
            **({"color": color} if color else {}),
        }
    return buffs


def extract_backgrounds(data_root: Path) -> list[dict[str, Any]]:
    bg_dir = data_root / "backgrounds"
    if not bg_dir.is_dir():
        return []
    bgs: list[dict[str, Any]] = []
    for f in sorted(bg_dir.glob("bg_*.rules")):
        text = _strip_comments(f.read_text(encoding="utf-8", errors="ignore"))
        colors = re.findall(r"\[(\s*\d+\s*,\s*\d+\s*,\s*\d+(?:\s*,\s*\d+)?\s*)\]", text)
        palette: list[str] = []
        for raw in colors:
            nums = [int(x.strip()) for x in raw.split(",")[:3]]
            if any(n > 15 for n in nums):
                hx = f"#{min(255, nums[0]):02x}{min(255, nums[1]):02x}{min(255, nums[2]):02x}"
                if hx not in palette:
                    palette.append(hx)
            if len(palette) >= 3:
                break
        bgs.append({
            "id": f.stem,
            "palette": palette or ["#07101b", "#13232f"],
            "source_file": f.relative_to(data_root).as_posix(),
        })
    return bgs


def extract_shots(data_root: Path) -> dict[str, dict[str, Any]]:
    shots_dir = data_root / "shots"
    if not shots_dir.is_dir():
        return {}
    shots: dict[str, dict[str, Any]] = {}
    for subdir in sorted(p for p in shots_dir.iterdir() if p.is_dir()):
        rule_file = subdir / f"{subdir.name}.rules"
        if not rule_file.is_file():
            cands = sorted(subdir.glob("*.rules"))
            if not cands:
                continue
            rule_file = cands[0]
        raw_text = rule_file.read_text(encoding="utf-8", errors="ignore")
        text = _strip_comments(raw_text)
        rng = _find_first_number(text, "Range")
        speed = _find_first_number(text, "Speed")
        pen = _find_first_number(text, "Penetration")
        damages = _find_all_numbers(text, "Damage")
        total_damages = _find_all_numbers(text, "TotalDamage")
        radii = _find_all_numbers(text, "Radius")
        aoe_radius = max([r for r in radii if r >= 1.5], default=0.0)
        vcolor = _find_color_hex(text, "VertexColor")
        has_drain = "ResourceDrain" in text
        has_fire = "Fire" in text and ("FireChance" in text or "StartFire" in text or "FireDamage" in text)
        # Ion beam damage is written as 2500 * (&~/HitInterval)
        if not damages:
            m_ion = re.search(r"Damage\s*=\s*\{\s*BaseValue\s*=\s*(\d+(?:\.\d+)?)\s*\*", text)
            if m_ion:
                damages = [float(m_ion.group(1))]
        primary_dmg = max(damages) if damages else (max(total_damages) if total_damages else 0.0)
        struct_dmg = min(damages) if len(damages) >= 2 else primary_dmg * 0.75
        shots[subdir.name] = {
            "id": subdir.name,
            "range": rng if rng is not None else 200.0,
            "speed": speed if speed is not None else 200.0,
            "damage": primary_dmg,
            "structural_damage": struct_dmg,
            "penetration": pen if pen is not None else 0.0,
            "aoe_radius": aoe_radius,
            "resource_drain": has_drain,
            "ignites_fire": has_fire,
            **({"color": vcolor} if vcolor else {}),
            "source_file": rule_file.relative_to(data_root).as_posix(),
        }
    return shots


def extract_part_specs(data_root: Path, strings: dict[str, str], shots: dict[str, dict[str, Any]]) -> dict[str, dict[str, Any]]:
    catalog = json.loads(CATALOG_PATH.read_text(encoding="utf-8"))
    specs: dict[str, dict[str, Any]] = {}
    for entry in catalog["parts"]:
        pid: str = entry["id"]
        src_rel = entry.get("source", "") or entry.get("source_file", "")
        rule_path = data_root / src_rel if src_rel else None
        text = ""
        if rule_path and rule_path.is_file():
            text = _strip_comments(rule_path.read_text(encoding="utf-8", errors="ignore"))

        name_key_m = re.search(r'NameKey\s*=\s*"([^"]+)"', text)
        desc_key_m = re.search(r'DescriptionKey\s*=\s*"([^"]+)"', text)
        name_key = name_key_m.group(1) if name_key_m else ""
        desc_key = desc_key_m.group(1) if desc_key_m else (name_key + "Desc" if name_key else "")

        rec: dict[str, Any] = {
            "id": pid,
            "size": entry["size"],
            "max_health": entry.get("max_health"),
            "name_en": strings.get(name_key, pid.removeprefix("cosmoteer.").replace("_", " ").title()),
            "description_en": strings.get(desc_key, ""),
            "source_file": src_rel,
        }

        # Extract real numeric specs from rule text
        for field, rkey in [
            ("fire_interval", "FireInterval"),
            ("fire_delay", "FireDelay"),
            ("firing_arc_deg", "FiringArc"),
            ("rotate_speed_deg", "RotateSpeed"),
            ("shield_radius", "Radius"),
            ("shield_arc_deg", "Arc"),
            ("crew_capacity", "Crew"),
            ("production_interval", "Interval"),
            ("battery_capacity", "MaxResources"),
        ]:
            val = _find_first_number(text, rkey)
            if val is not None:
                rec[field] = val

        # Detect referenced shot from Data/shots/<shot_id>/
        shot_m = re.search(r"shots/([a-z0-9_]+)/", text)
        if shot_m and shot_m.group(1) in shots:
            rec["shot_id"] = shot_m.group(1)

        specs[pid] = rec
    return specs


def extract_nebulas(data_root: Path) -> list[dict[str, Any]]:
    neb_dir = data_root / "nebulas"
    if not neb_dir.is_dir():
        return []
    out: list[dict[str, Any]] = []
    for f in sorted(neb_dir.glob("*/*.rules")):
        if "particle" in f.as_posix().lower():
            continue
        text = _strip_comments(f.read_text(encoding="utf-8", errors="ignore"))
        out.append({
            "id": f.parent.name,
            "rule_file": f.relative_to(data_root).as_posix(),
            "has_buff": "Buff" in text or "Debuff" in text,
            "has_lightning": "Lightning" in text,
        })
    return out


def extract_planets(data_root: Path) -> list[dict[str, Any]]:
    pdir = data_root / "planets"
    if not pdir.is_dir():
        return []
    out: list[dict[str, Any]] = []
    for f in sorted(pdir.glob("planet_*.rules")):
        text = _strip_comments(f.read_text(encoding="utf-8", errors="ignore"))
        color = _find_color_hex(text, "Color") or _find_color_hex(text, "HaloColor") or "#6da8d6"
        out.append({
            "id": f.stem,
            "color": color,
            "source_file": f.relative_to(data_root).as_posix(),
        })
    return out


def extract_sectors(data_root: Path) -> list[dict[str, Any]]:
    sdir = data_root / "modes" / "career" / "sectors"
    if not sdir.is_dir():
        return []
    out: list[dict[str, Any]] = []
    for f in sorted(sdir.glob("*/*.rules")):
        out.append({
            "id": f.parent.name,
            "source_file": f.relative_to(data_root).as_posix(),
        })
    return out


def extract_ai_profiles(data_root: Path) -> list[str]:
    adir = data_root / "ai"
    if not adir.is_dir():
        return []
    return [f.stem for f in sorted(adir.glob("ai_*.rules"))]


def extract_all_rules(data_root: Path, out_path: Path) -> dict[str, Any]:
    strings = parse_en_strings(data_root)
    factions = extract_factions(data_root, strings)
    buffs = extract_buffs(data_root)
    backgrounds = extract_backgrounds(data_root)
    shots = extract_shots(data_root)
    part_specs = extract_part_specs(data_root, strings, shots)
    nebulas = extract_nebulas(data_root)
    planets = extract_planets(data_root)
    sectors = extract_sectors(data_root)
    ai_profiles = extract_ai_profiles(data_root)

    payload = {
        "version": 2,
        "summary": {
            "strings_loaded": len(strings),
            "factions_count": len(factions),
            "buffs_count": len(buffs),
            "backgrounds_count": len(backgrounds),
            "shots_count": len(shots),
            "part_specs_count": len(part_specs),
            "nebulas_count": len(nebulas),
            "planets_count": len(planets),
            "sectors_count": len(sectors),
            "ai_profiles_count": len(ai_profiles),
        },
        "factions": factions,
        "buffs": buffs,
        "backgrounds": backgrounds,
        "nebulas": nebulas,
        "planets": planets,
        "sectors": sectors,
        "ai_profiles": ai_profiles,
        "shots": shots,
        "part_specs": part_specs,
    }
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(json.dumps(payload, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    return payload["summary"]


def main() -> int:
    parser = argparse.ArgumentParser(description="Extract deep Cosmoteer rules (shots, buffs, factions, backgrounds, strings, part specs).")
    parser.add_argument("--data", type=Path, default=Path(os.environ.get("COSMOTEER_DATA", str(DEFAULT_DATA))))
    parser.add_argument("--out", type=Path, default=DEFAULT_OUT)
    args = parser.parse_args()
    summary = extract_all_rules(args.data, args.out)
    print(
        f"Extracted rules -> {args.out.name}: "
        f"{summary['part_specs_count']} parts, {summary['shots_count']} shots, "
        f"{summary['factions_count']} factions, {summary['buffs_count']} buffs, "
        f"{summary['backgrounds_count']} backgrounds, {summary['strings_loaded']} EN strings "
        f"({args.out.stat().st_size / 1024:.1f} KB)"
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
