#!/usr/bin/env python3
"""Zero-omission asset & resource extractor for C:\\Temp\\Cosmoteer\\.

Mirrors 100% of Data/, Standard Mods/, and datahash into extracted_assets/ with
SHA-256 verification, builds a composited 96-part Terran sprite atlas
(extracted_assets/web_atlas.png + web_atlas.json), and writes a compact
Git-tracked metadata index to data/asset_index.json.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import shutil
import sys
from collections import Counter, defaultdict
from pathlib import Path
from typing import Any

try:
    from PIL import Image
except ImportError:
    Image = None

ROOT = Path(__file__).resolve().parent.parent
DEFAULT_SOURCE = Path(r"C:\Temp\Cosmoteer")
DEFAULT_OUT = ROOT / "extracted_assets"
DEFAULT_INDEX = ROOT / "data" / "asset_index.json"
CATALOG_PATH = ROOT / "data" / "catalog.json"

RESOURCE_SUBDIRS = ("Data", "Standard Mods")
ROOT_FILES = ("datahash",)


def sha256_file(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


def collect_source_files(source_root: Path, include_bin: bool = False) -> list[Path]:
    files: list[Path] = []
    for name in ROOT_FILES:
        p = source_root / name
        if p.is_file():
            files.append(p)
    subdirs = list(RESOURCE_SUBDIRS) + (["Bin"] if include_bin else [])
    for sub in subdirs:
        base = source_root / sub
        if not base.exists():
            continue
        for dirpath, dirnames, filenames in os.walk(base):
            dirnames.sort()
            for fn in sorted(filenames):
                files.append(Path(dirpath) / fn)
    return files


def pick_best_png(folder: Path, patterns: list[str]) -> str | None:
    if not folder.is_dir():
        return None
    pngs = sorted([f.name for f in folder.iterdir() if f.is_file() and f.suffix.lower() == ".png"])
    lower_map = {name.lower(): name for name in pngs}
    for pat in patterns:
        if pat.lower() in lower_map:
            return lower_map[pat.lower()]
    for pat in patterns:
        prefix = pat.lower().replace(".png", "")
        for name in pngs:
            ln = name.lower()
            if ln.startswith(prefix) and "_33" not in ln and "_66" not in ln and "normal" not in ln and "emissive" not in ln:
                return name
    return None


def find_wav(data_root: Path, candidates: list[str], fallback_glob: str) -> str | None:
    for rel in candidates:
        if (data_root / rel).is_file():
            return rel.replace("\\", "/")
    hits = sorted(data_root.glob(fallback_glob))
    if hits:
        return hits[0].relative_to(data_root).as_posix()
    return None


def build_part_sprite_map(data_root: Path) -> dict[str, dict[str, Any]]:
    catalog = json.loads(CATALOG_PATH.read_text(encoding="utf-8"))
    terran_root = data_root / "ships" / "terran"
    part_map: dict[str, dict[str, Any]] = {}
    for entry in catalog["parts"]:
        pid: str = entry["id"]
        short = pid.removeprefix("cosmoteer.")
        pdir = terran_root / short
        # Some catalog parts use a directory matching their source rule file parent
        if not pdir.is_dir():
            src_rule = entry.get("source_file", "")
            if src_rule:
                cand = data_root / Path(src_rule).parent
                if cand.is_dir():
                    pdir = cand
        rel_dir = pdir.relative_to(data_root).as_posix() if pdir.is_dir() else ""
        floor = pick_best_png(pdir, ["floor.png", "floor_on.png", "armor.png", "structure.png"])
        roof = pick_best_png(pdir, ["roof.png", "roof_lights.png", "armor.png", "structure.png"])
        walls = pick_best_png(pdir, ["walls.png"])
        turret = pick_best_png(pdir, ["turret.png", "barrel.png", "weapon.png", "emitter.png", "nozzle.png", "doodads_on1.png", "doodads_on.png"])
        blueprint = pick_best_png(pdir, ["blueprints.png", "blueprints_he.png", "blueprint.png"])
        # Fallback to first non-normal PNG if still none
        if not any([floor, roof, blueprint]) and pdir.is_dir():
            any_png = [
                f.name for f in sorted(pdir.iterdir())
                if f.is_file() and f.suffix.lower() == ".png"
                and "normal" not in f.name.lower() and "_33" not in f.name.lower() and "_66" not in f.name.lower()
            ]
            if any_png:
                blueprint = any_png[0]
        rec: dict[str, Any] = {"size": entry["size"]}
        if rel_dir:
            if floor:
                rec["floor"] = f"{rel_dir}/{floor}"
            if roof:
                rec["roof"] = f"{rel_dir}/{roof}"
            if walls:
                rec["walls"] = f"{rel_dir}/{walls}"
            if turret:
                rec["turret"] = f"{rel_dir}/{turret}"
            if blueprint:
                rec["blueprint"] = f"{rel_dir}/{blueprint}"
        part_map[pid] = rec
    return part_map


def build_audio_map(data_root: Path) -> dict[str, str]:
    specs = {
        "shot_laser": (
            ["ships/terran/laser_blaster_small/sounds/small_laser_shot_01.wav"],
            "ships/terran/laser_blaster_small/**/*.wav",
        ),
        "shot_heavy_laser": (
            ["ships/terran/laser_blaster_large/sounds/heavy_laser_shot_01.wav",
             "ships/terran/laser_blaster_large/sounds/heavy_laser_overclocked_shot_01.wav"],
            "ships/terran/laser_blaster_large/**/*.wav",
        ),
        "shot_cannon": (
            ["ships/terran/cannon_med/sounds/cannon_med_shot.wav"],
            "ships/terran/cannon_med/**/*.wav",
        ),
        "shot_missile": (
            ["ships/terran/missile_launcher/he/sounds/launcher_launch_he_01.wav",
             "ships/terran/missile_launcher/nuke/sounds/launcher_launch_nuke.wav"],
            "ships/terran/missile_launcher/**/*.wav",
        ),
        "shot_disruptor": (
            ["ships/terran/disruptor/sounds/disruptor_shot_01.wav",
             "ships/terran/disruptor/sounds/disruptor_overclocked_shot_01.wav"],
            "ships/terran/disruptor/**/*.wav",
        ),
        "shot_ion": (
            ["shots/ion_beam/sounds/ion_beam_loop.wav",
             "ships/terran/ion_beam_emitter/sounds/ion_beam_idle.wav"],
            "shots/ion_beam/**/*.wav",
        ),
        "shot_railgun": (
            ["ships/terran/railgun_loader/sounds/railgun_shot_01.wav",
             "ships/terran/railgun_launcher/sounds/rail.wav"],
            "ships/terran/railgun*/**/*.wav",
        ),
        "shot_flak": (
            ["ships/terran/flak_cannon_large/sounds/flak_cannon_shot_01.wav"],
            "ships/terran/flak_cannon_large/**/*.wav",
        ),
        "shot_chaingun": (
            ["ships/terran/chaingun/sounds/chain_gun_loop_start.wav",
             "ships/terran/chaingun/sounds/chain_gun_loop.wav"],
            "ships/terran/chaingun/**/*.wav",
        ),
        "shield_hit": (
            ["ships/terran/shield_gen_small/sounds/small_shield_hit_01.wav",
             "ships/terran/shield_gen_large/sounds/large_shield_hit_01.wav"],
            "ships/terran/shield_gen*/**/*.wav",
        ),
        "shield_down": (
            ["ships/terran/shield_gen_small/sounds/small_shield_power_down.wav",
             "ships/terran/shield_gen_large/sounds/large_shield_alarm.wav"],
            "ships/terran/shield_gen*/*power*.wav",
        ),
        "intercept": (
            ["ships/terran/point_defense/sounds/point_defense_shot_01.wav"],
            "ships/terran/point_defense/**/*.wav",
        ),
        "fire_ignite": (
            ["statuses/fire/fire.wav"],
            "statuses/fire/**/*.wav",
        ),
        "destroyed": (
            ["common_effects/sounds/explosion_01.wav",
             "ships/terran/ion_beam_prism/sounds/explosion_part_energy/explosion_part_energy_01.wav"],
            "common_effects/sounds/*.wav",
        ),
    }
    audio: dict[str, str] = {}
    for key, (cands, pattern) in specs.items():
        found = find_wav(data_root, cands, pattern)
        if found:
            audio[key] = found
    return audio


def build_web_atlas(data_root: Path, part_map: dict[str, dict[str, Any]], out_dir: Path, cell_px: int = 36) -> dict[str, Any]:
    """Build a composited RGBA sprite atlas for all 96 Terran parts for Web & Desktop runtime."""
    if Image is None:
        return {"generated": False, "reason": "Pillow not installed"}

    tiles: list[tuple[str, str, Any]] = []
    for pid, rec in sorted(part_map.items()):
        w_cells, h_cells = int(rec["size"][0]), int(rec["size"][1])
        tw, th = w_cells * cell_px, h_cells * cell_px

        # Interior/cutaway composite: floor -> walls -> turret (fallback blueprint)
        cutaway = Image.new("RGBA", (tw, th), (0, 0, 0, 0))
        layered = False
        for layer_key in ("floor", "walls", "turret"):
            rel = rec.get(layer_key)
            if not rel:
                continue
            p = data_root / rel
            if not p.is_file():
                continue
            try:
                img = Image.open(p).convert("RGBA").resize((tw, th), Image.Resampling.LANCZOS)
                cutaway.alpha_composite(img)
                layered = True
            except Exception:
                continue
        if not layered and rec.get("blueprint"):
            p = data_root / rec["blueprint"]
            if p.is_file():
                try:
                    img = Image.open(p).convert("RGBA").resize((tw, th), Image.Resampling.LANCZOS)
                    cutaway.alpha_composite(img)
                    layered = True
                except Exception:
                    pass
        if layered:
            tiles.append((pid, "cutaway", cutaway))

        # Exterior/roof composite: roof -> turret (fallback cutaway)
        if rec.get("roof"):
            p = data_root / rec["roof"]
            if p.is_file():
                try:
                    ext = Image.open(p).convert("RGBA").resize((tw, th), Image.Resampling.LANCZOS)
                    if rec.get("turret"):
                        tp = data_root / rec["turret"]
                        if tp.is_file():
                            timg = Image.open(tp).convert("RGBA").resize((tw, th), Image.Resampling.LANCZOS)
                            ext.alpha_composite(timg)
                    tiles.append((pid, "roof", ext))
                except Exception:
                    pass

    # Shelf-pack into a compact atlas (max width 2048)
    atlas_w = 2048
    pad = 2
    x = pad
    y = pad
    row_h = 0
    placements: list[tuple[str, str, int, int, int, int, Any]] = []
    # Sort taller tiles first for tighter packing
    tiles.sort(key=lambda item: (-item[2].height, -item[2].width, item[0], item[1]))
    for pid, variant, img in tiles:
        if x + img.width + pad > atlas_w:
            x = pad
            y += row_h + pad
            row_h = 0
        placements.append((pid, variant, x, y, img.width, img.height, img))
        x += img.width + pad
        row_h = max(row_h, img.height)
    atlas_h = y + row_h + pad

    sheet = Image.new("RGBA", (atlas_w, atlas_h), (0, 0, 0, 0))
    rects: dict[str, dict[str, list[int]]] = {}
    for pid, variant, px, py, pw, ph, img in placements:
        sheet.paste(img, (px, py))
        rects.setdefault(pid, {})[variant] = [px, py, pw, ph]

    atlas_png = out_dir / "web_atlas.png"
    atlas_json = out_dir / "web_atlas.json"
    sheet.save(atlas_png, format="PNG", optimize=True)
    meta = {
        "cell_px": cell_px,
        "width": atlas_w,
        "height": atlas_h,
        "part_count": len(rects),
        "tile_count": len(placements),
        "parts": rects,
    }
    atlas_json.write_text(json.dumps(meta, indent=2) + "\n", encoding="utf-8")
    return {
        "generated": True,
        "atlas_png": "web_atlas.png",
        "atlas_json": "web_atlas.json",
        "width": atlas_w,
        "height": atlas_h,
        "png_bytes": atlas_png.stat().st_size,
        "part_count": len(rects),
        "tile_count": len(placements),
    }


def extract_all(
    source_root: Path,
    out_dir: Path,
    index_path: Path,
    include_bin: bool = False,
    force: bool = False,
    verify_hash: bool = True,
) -> dict[str, Any]:
    if not source_root.is_dir():
        raise FileNotFoundError(f"Source directory not found: {source_root}")

    src_files = collect_source_files(source_root, include_bin=include_bin)
    out_dir.mkdir(parents=True, exist_ok=True)
    # Keep Godot's importer from scanning 12,000+ raw extracted files directly
    (out_dir / ".gdignore").write_text("Ignore raw extracted external assets from Godot editor import.\n", encoding="utf-8")

    ext_counts: Counter[str] = Counter()
    ext_bytes: defaultdict[str, int] = defaultdict(int)
    cat_counts: Counter[str] = Counter()
    cat_bytes: defaultdict[str, int] = defaultdict(int)

    manifest_entries: list[dict[str, Any]] = []
    copied = 0
    reused = 0
    missing = 0
    mismatched = 0
    total_bytes = 0

    for src in src_files:
        rel = src.relative_to(source_root)
        rel_posix = rel.as_posix()
        dst = out_dir / rel
        dst.parent.mkdir(parents=True, exist_ok=True)

        src_stat = src.stat()
        need_copy = force or not dst.is_file()
        if not need_copy:
            dst_stat = dst.stat()
            if dst_stat.st_size != src_stat.st_size or int(dst_stat.st_mtime) != int(src_stat.st_mtime):
                need_copy = True

        if need_copy:
            shutil.copy2(src, dst)
            copied += 1
        else:
            reused += 1

        if not dst.is_file():
            missing += 1
            continue

        dst_size = dst.stat().st_size
        src_hash = sha256_file(src) if verify_hash else ""
        dst_hash = sha256_file(dst) if verify_hash else ""
        if dst_size != src_stat.st_size or (verify_hash and src_hash != dst_hash):
            mismatched += 1

        parts = rel.parts
        category = "/".join(parts[:2]) if len(parts) >= 2 else parts[0]
        ext = src.suffix.lower() or "(none)"

        ext_counts[ext] += 1
        ext_bytes[ext] += dst_size
        cat_counts[category] += 1
        cat_bytes[category] += dst_size
        total_bytes += dst_size

        manifest_entries.append({
            "path": rel_posix,
            "size": dst_size,
            "ext": ext,
            "category": category,
            **({"sha256": dst_hash} if verify_hash else {}),
        })

    data_out = out_dir / "Data"
    part_sprites = build_part_sprite_map(data_out)
    audio_map = build_audio_map(data_out)
    atlas_info = build_web_atlas(data_out, part_sprites, out_dir)

    summary = {
        "source_root": str(source_root),
        "include_bin": include_bin,
        "source_files": len(src_files),
        "extracted_files": len(manifest_entries),
        "copied": copied,
        "reused": reused,
        "missing_files": missing,
        "mismatched_files": mismatched,
        "total_bytes": total_bytes,
        "by_extension": {k: {"files": ext_counts[k], "bytes": ext_bytes[k]} for k in sorted(ext_counts)},
        "by_category": {k: {"files": cat_counts[k], "bytes": cat_bytes[k]} for k in sorted(cat_counts)},
        "atlas": atlas_info,
    }

    full_manifest_path = out_dir / "full_manifest.json"
    full_manifest_path.write_text(
        json.dumps({"summary": summary, "files": manifest_entries}, indent=2) + "\n",
        encoding="utf-8",
    )

    # Compact Git-tracked metadata index (zero commercial binary payloads)
    index_payload = {
        "version": 1,
        "summary": {
            "source_files": summary["source_files"],
            "extracted_files": summary["extracted_files"],
            "missing_files": summary["missing_files"],
            "mismatched_files": summary["mismatched_files"],
            "total_bytes": summary["total_bytes"],
            "by_extension": summary["by_extension"],
            "by_category": summary["by_category"],
            "terran_parts_mapped": len(part_sprites),
            "audio_sfx_mapped": len(audio_map),
        },
        "part_sprites": part_sprites,
        "audio_sfx": audio_map,
    }
    index_path.parent.mkdir(parents=True, exist_ok=True)
    index_path.write_text(json.dumps(index_payload, indent=2) + "\n", encoding="utf-8")
    return summary


def main() -> int:
    parser = argparse.ArgumentParser(description="Extract 100% of Cosmoteer assets & resources without omissions.")
    parser.add_argument("--source", type=Path, default=Path(os.environ.get("COSMOTEER_ROOT", str(DEFAULT_SOURCE))))
    parser.add_argument("--out", type=Path, default=DEFAULT_OUT)
    parser.add_argument("--index", type=Path, default=DEFAULT_INDEX)
    parser.add_argument("--include-bin", action="store_true", help="Also mirror Bin/ binaries")
    parser.add_argument("--force", action="store_true", help="Re-copy all files even if size & mtime match")
    parser.add_argument("--skip-hash", action="store_true", help="Skip SHA-256 verification")
    args = parser.parse_args()

    summary = extract_all(
        args.source,
        args.out,
        args.index,
        include_bin=args.include_bin,
        force=args.force,
        verify_hash=not args.skip_hash,
    )
    print(
        f"Extracted {summary['extracted_files']}/{summary['source_files']} files "
        f"({summary['total_bytes'] / (1024 * 1024):.1f} MB) | "
        f"copied={summary['copied']} reused={summary['reused']} "
        f"missing={summary['missing_files']} mismatched={summary['mismatched_files']}"
    )
    if summary["atlas"].get("generated"):
        a = summary["atlas"]
        print(
            f"Built Web Atlas: {a['width']}x{a['height']} "
            f"({a['png_bytes'] / 1024:.1f} KB, {a['part_count']} parts, {a['tile_count']} tiles)"
        )
    if summary["missing_files"] or summary["mismatched_files"]:
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
