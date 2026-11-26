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
import struct
import sys
import wave
from collections import Counter, defaultdict
from pathlib import Path
from typing import Any

try:
    from PIL import Image, ImageChops
except ImportError:
    Image = None
    ImageChops = None

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
        floor = pick_best_png(pdir, ["floor.png", "floor_on1.png", "floor_on.png", "armor.png", "structure.png"])
        roof = pick_best_png(pdir, ["roof.png", "roof_lights.png", "armor.png", "structure.png"])
        walls = pick_best_png(pdir, ["walls.png"])
        ext_walls = pick_best_png(pdir, ["external_walls.png"])
        doodad = pick_best_png(pdir, ["reactor.png", "doodads_on1.png", "doodads_on_a1.png", "doodads_on.png", "doodad_external.png"])
        glow = pick_best_png(pdir, ["reactor_core_on.png", "lights1.png", "lights.png", "OClights.png"])
        roof_glow = pick_best_png(pdir, ["roof_glows.png", "doodad_external.png"])
        turret = pick_best_png(pdir, ["turret_on.png", "turret.png", "barrel.png", "barrel1.png", "weapon.png", "emitter.png", "nozzle.png"])
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
            if ext_walls:
                rec["ext_walls"] = f"{rel_dir}/{ext_walls}"
            if doodad:
                rec["doodad"] = f"{rel_dir}/{doodad}"
            if glow:
                rec["glow"] = f"{rel_dir}/{glow}"
            if roof_glow:
                rec["roof_glow"] = f"{rel_dir}/{roof_glow}"
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
        "shot_cannon_large": (
            ["ships/terran/cannon_large/sounds/cannon_large_shot.wav",
             "ships/terran/cannon_large/sounds/cannon_large_shot_01.wav"],
            "ships/terran/cannon_large/**/*.wav",
        ),
        "shot_cannon_deck": (
            ["ships/terran/cannon_deck/sounds/cannon_deck_shot.wav",
             "ships/terran/cannon_deck/sounds/deck_cannon_shot_01.wav"],
            "ships/terran/cannon_deck/**/*.wav",
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


def _collect_extra_sprites(data_root: Path) -> list[tuple[str, Any]]:
    """Load authentic Cosmoteer environment, asteroid, crew, projectile, and explosion sprites."""
    specs: list[tuple[str, str, tuple[int, int]]] = [
        ("cloud_1", "backgrounds/cloud1.png", (256, 256)),
        ("cloud_2", "backgrounds/cloud2.png", (256, 256)),
        ("cloud_3", "backgrounds/cloud3.png", (256, 256)),
        ("cloud_4", "backgrounds/cloud4.png", (256, 256)),
        ("star", "backgrounds/star.png", (32, 32)),
        ("ast_iron", "doodads/asteroids/iron/asteroid_iron_m.png", (96, 96)),
        ("ast_copper", "doodads/asteroids/copper/asteroid_copper_m.png", (96, 96)),
        ("ast_carbon", "doodads/asteroids/carbon/asteroid_carbon_m.png", (96, 96)),
        ("ast_gold", "doodads/asteroids/gold/asteroid_gold_m.png", (96, 96)),
        ("ast_tristeel", "doodads/asteroids/tritanium/asteroid_tritanium_m.png", (96, 96)),
        ("ast_uranium", "doodads/asteroids/uranium/asteroid_uranium_m.png", (96, 96)),
        ("ast_diamond", "doodads/asteroids/sulfur/asteroid_sulfur_m.png", (96, 96)),
        ("ast_hyperium", "doodads/asteroids/hyperium/asteroid_hyperium_m.png", (96, 96)),
        ("ast_plain", "doodads/asteroids/plain/asteroid_m.png", (96, 96)),
        ("crew_walk", "crew/walk_a1.png", (48, 48)),
        ("crew_carry", "crew/carry_a1.png", (48, 48)),
        ("crew_idle", "crew/idle_a1.png", (48, 48)),
        ("crew_operate", "crew/operate_a1.png", (48, 48)),
        ("battery", "resources/battery/battery_large.png", (36, 36)),
        ("shot_laser_small", "shots/laser_bolt_small/laser_bolt_small.png", (24, 64)),
        ("shot_laser_large", "shots/laser_bolt_large/laser_bolt_large.png", (32, 80)),
        ("shot_bullet_med", "shots/bullet_med/bullet_med.png", (24, 48)),
        ("shot_bullet_large", "shots/bullet_large/bullet_large.png", (36, 64)),
        ("shot_railgun", "shots/bullet_railgun/bullet_railgun.png", (32, 96)),
        ("shot_missile_he", "shots/missile_he/missile_he.png", (28, 64)),
        ("shot_missile_emp", "shots/missile_emp/missile_emp.png", (28, 64)),
        ("shot_missile_nuke", "shots/missile_nuke/missile_nuke.png", (36, 72)),
        ("shot_missile_thermal", "shots/missile_thermal/missile_thermal.png", (28, 64)),
        ("shot_mine", "shots/mine/mine_armed.png", (48, 48)),
        ("shot_pd", "shots/pd_shot/pd_shot.png", (16, 36)),
        ("shot_resonance", "shots/resonance_beam/resonance_beam.png", (32, 64)),
        ("exp_small", "common_effects/particles/explosions/small_part_explode.png", (96, 96)),
        ("exp_med", "common_effects/particles/explosions/med_part_explode.png", (128, 128)),
        ("exp_big", "common_effects/particles/explosions/big_part_explode.png", (160, 160)),
        ("exp_spark", "common_effects/particles/explode_spark.png", (48, 48)),
        ("fire_0", "statuses/fire/fire00.png", (64, 64)),
        ("fire_1", "statuses/fire/fire04.png", (64, 64)),
        ("fire_2", "statuses/fire/fire08.png", (64, 64)),
        ("fire_3", "statuses/fire/fire12.png", (64, 64)),
        ("debris", "common_effects/particles/debris.png", (64, 64)),
        ("flame", "common_effects/particles/flame.png", (64, 96)),
        ("damage_cracks", "common_effects/particles/noise_cracks.png", (96, 96)),
        ("shield_energy", "ships/terran/shield_gen_small/shield_energy.png", (96, 96)),
    ]
    out: list[tuple[str, Any]] = []
    for key, rel, target_size in specs:
        p = data_root / rel
        if not p.is_file():
            continue
        try:
            img = Image.open(p).convert("RGBA")
            img.thumbnail(target_size, Image.Resampling.LANCZOS)
            out.append((key, img))
        except Exception:
            continue
    return out


def _decode_cosmoteer_roof_mask(img: Any) -> Any:
    """Convert Cosmoteer roof.png green-channel hull paint mask into neutral painted warship steel."""
    rgba = img.convert("RGBA")
    w, h = rgba.size
    src = rgba.load()
    out = Image.new("RGBA", (w, h))
    dst = out.load()
    for py in range(h):
        for px in range(w):
            r, g, b, a = src[px, py]
            if a > 0 and g > r + 15 and g > b + 15:
                base = r if r > b else b
                mask = (g - base) / 255.0
                nr = min(255, int(r + mask * 194.0))
                ng = min(255, int(base + mask * 204.0))
                nb = min(255, int(b + mask * 216.0))
                dst[px, py] = (nr, ng, nb, a)
            else:
                dst[px, py] = (r, g, b, a)
    return out


def _additive_composite(base: Any, glow: Any) -> Any:
    """Additive emissive blend matching Cosmoteer's GPU glow pass (preserves base alpha & avoids blackening)."""
    g = glow.convert("RGBA")
    if base.size != g.size:
        g = g.resize(base.size, Image.Resampling.LANCZOS)
    # Premultiply glow RGB by its own alpha so transparent areas add zero
    br, bg, bb, ba = base.split()
    gr, gg, gb, ga = g.split()
    gr = ImageChops.multiply(gr, ga)
    gg = ImageChops.multiply(gg, ga)
    gb = ImageChops.multiply(gb, ga)
    return Image.merge("RGBA", (
        ImageChops.add(br, gr),
        ImageChops.add(bg, gg),
        ImageChops.add(bb, gb),
        ba,
    ))


def build_web_atlas(data_root: Path, part_map: dict[str, dict[str, Any]], out_dir: Path, cell_px: int = 44) -> dict[str, Any]:
    """Build a composited HD RGBA sprite atlas (96 Terran parts + glows + turrets + environment/crew/shots/fire/debris)."""
    if Image is None:
        return {"generated": False, "reason": "Pillow not installed"}

    TURRETED_PARTS = {
        "cosmoteer.laser_blaster_small", "cosmoteer.laser_blaster_large",
        "cosmoteer.cannon_med", "cosmoteer.cannon_large", "cosmoteer.cannon_deck",
        "cosmoteer.disruptor", "cosmoteer.flak_cannon_large", "cosmoteer.chaingun",
        "cosmoteer.point_defense", "cosmoteer.resonance_beam_turret",
        "cosmoteer.mining_laser_small", "cosmoteer.ion_beam_prism",
        "cosmoteer.tractor_beam_emitter", "cosmoteer.manipulator_beam_emitter",
    }

    tiles: list[tuple[str, str, Any]] = []
    for pid, rec in sorted(part_map.items()):
        w_cells, h_cells = int(rec["size"][0]), int(rec["size"][1])
        tw, th = w_cells * cell_px, h_cells * cell_px

        # Interior/cutaway composite: floor -> walls -> ext_walls -> doodad -> glow -> turret
        cutaway = Image.new("RGBA", (tw, th), (0, 0, 0, 0))
        layered = False
        for layer_key in ("floor", "walls", "ext_walls", "doodad", "glow", "turret"):
            rel = rec.get(layer_key)
            if not rel:
                continue
            p = data_root / rel
            if not p.is_file():
                continue
            try:
                raw_img = Image.open(p)
                if layer_key == "turret":
                    raw_img = _decode_cosmoteer_roof_mask(raw_img)
                img = raw_img.convert("RGBA").resize((tw, th), Image.Resampling.LANCZOS)
                if layer_key == "glow" and layered:
                    cutaway = _additive_composite(cutaway, img)
                else:
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
            tiles.append(("part", f"{pid}|cutaway", cutaway))

        # Exterior/roof composite: decode Cosmoteer green hull-paint mask + exterior glow vents
        if rec.get("roof"):
            p = data_root / rec["roof"]
            if p.is_file():
                try:
                    ext = _decode_cosmoteer_roof_mask(Image.open(p)).resize((tw, th), Image.Resampling.LANCZOS)
                    for extra_k in ("ext_walls", "roof_glow"):
                        erel = rec.get(extra_k)
                        if not erel:
                            continue
                        ep = data_root / erel
                        if ep.is_file():
                            eimg = Image.open(ep).convert("RGBA").resize((tw, th), Image.Resampling.LANCZOS)
                            if extra_k == "roof_glow":
                                ext = _additive_composite(ext, eimg)
                            else:
                                ext.alpha_composite(eimg)
                    if rec.get("turret") and pid not in TURRETED_PARTS:
                        tp = data_root / rec["turret"]
                        if tp.is_file():
                            timg = _decode_cosmoteer_roof_mask(Image.open(tp)).resize((tw, th), Image.Resampling.LANCZOS)
                            ext.alpha_composite(timg)
                    tiles.append(("part", f"{pid}|roof", ext))
                except Exception:
                    pass

        # Separate rotating turret layer for turreted weapons
        if pid in TURRETED_PARTS and rec.get("turret"):
            tp = data_root / rec["turret"]
            if tp.is_file():
                try:
                    timg = _decode_cosmoteer_roof_mask(Image.open(tp)).resize((tw, th), Image.Resampling.LANCZOS)
                    tiles.append(("part", f"{pid}|turret", timg))
                except Exception:
                    pass

    # Add environment, asteroid, crew, projectile, and explosion sprites
    for skey, simg in _collect_extra_sprites(data_root):
        tiles.append(("sprite", skey, simg))

    # Shelf-pack into a compact atlas (max width 2048)
    atlas_w = 2048
    pad = 2
    x = pad
    y = pad
    row_h = 0
    placements: list[tuple[str, str, int, int, int, int, Any]] = []
    tiles.sort(key=lambda item: (-item[2].height, -item[2].width, item[0], item[1]))
    for kind, ident, img in tiles:
        if x + img.width + pad > atlas_w:
            x = pad
            y += row_h + pad
            row_h = 0
        placements.append((kind, ident, x, y, img.width, img.height, img))
        x += img.width + pad
        row_h = max(row_h, img.height)
    atlas_h = y + row_h + pad

    sheet = Image.new("RGBA", (atlas_w, atlas_h), (0, 0, 0, 0))
    rects: dict[str, dict[str, list[int]]] = {}
    sprite_rects: dict[str, list[int]] = {}
    for kind, ident, px, py, pw, ph, img in placements:
        sheet.paste(img, (px, py))
        if kind == "part":
            pid, variant = ident.split("|", 1)
            rects.setdefault(pid, {})[variant] = [px, py, pw, ph]
        else:
            sprite_rects[ident] = [px, py, pw, ph]

    atlas_png = out_dir / "web_atlas.png"
    atlas_json = out_dir / "web_atlas.json"
    sheet.save(atlas_png, format="PNG", optimize=True)
    meta = {
        "version": 2,
        "cell_px": cell_px,
        "width": atlas_w,
        "height": atlas_h,
        "part_count": len(rects),
        "sprite_count": len(sprite_rects),
        "tile_count": len(placements),
        "parts": rects,
        "sprites": sprite_rects,
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
        "sprite_count": len(sprite_rects),
        "tile_count": len(placements),
    }


def build_web_sfx(data_root: Path, audio_map: dict[str, str], out_dir: Path, target_rate: int = 22050, max_sec: float = 1.2) -> dict[str, Any]:
    """Export compact 16-bit mono 22050Hz WAVs for Web Godot (WASM) HTTP audio streaming."""
    sfx_dir = out_dir / "web_sfx"
    sfx_dir.mkdir(parents=True, exist_ok=True)
    exported: dict[str, int] = {}
    for kind, rel in sorted(audio_map.items()):
        src = data_root / rel
        if not src.is_file():
            continue
        try:
            with wave.open(str(src), "rb") as w:
                nch = w.getnchannels()
                sw = w.getsampwidth()
                rate = w.getframerate()
                nframes = min(w.getnframes(), int(rate * max_sec))
                raw = w.readframes(nframes)
            if sw not in (2, 3) or nframes <= 0:
                continue
            if sw == 2:
                samples = struct.unpack(f"<{len(raw) // 2}h", raw)
            else:
                samples = [struct.unpack("<h", raw[i + 1:i + 3])[0] for i in range(0, len(raw) - 2, 3)]
            # Mix down to mono
            if nch >= 2:
                mono = [int((samples[i] + samples[i + 1]) * 0.5) for i in range(0, len(samples) - 1, nch)]
            else:
                mono = list(samples)
            # Linear resample to target_rate
            if rate != target_rate and len(mono) > 1:
                out_len = max(1, int(len(mono) * target_rate / rate))
                step = (len(mono) - 1) / max(1, out_len - 1)
                resampled = []
                for idx in range(out_len):
                    pos = idx * step
                    i0 = int(pos)
                    frac = pos - i0
                    i1 = min(len(mono) - 1, i0 + 1)
                    resampled.append(int(mono[i0] * (1.0 - frac) + mono[i1] * frac))
                mono = resampled
            dst = sfx_dir / f"{kind}.wav"
            with wave.open(str(dst), "wb") as ow:
                ow.setnchannels(1)
                ow.setsampwidth(2)
                ow.setframerate(target_rate)
                ow.writeframes(struct.pack(f"<{len(mono)}h", *mono))
            exported[kind] = dst.stat().st_size
        except Exception:
            continue
    return {"count": len(exported), "total_bytes": sum(exported.values()), "files": exported}


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
