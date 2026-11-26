#!/usr/bin/env python3
"""
Complete ONI reverse-engineering extractor finishing all remaining datasets,
Unity 6 Shaders (81) & Materials (285), and FMOD Master Bank.strings.bank events.

Reads C:/Temp/Oxygen (read-only) and emits PlayForge-syncable .txt JSON bundles:
  - data/world_codex_extracted.txt
  - data/shaders_materials_extracted.txt
  - data/fmod_events_extracted.txt
  - data/extraction_manifest.txt (updated master audit manifest)
"""

import argparse
import glob
import json
import os
import re
import struct
from datetime import datetime, timezone

import yaml

from extract_oni_data import parse_ko_po, strip_oni_markup
from extract_oni_media import read_cstr, align4


def extract_world_and_codex(streaming_dir: str, ko: dict) -> dict:
    """Extract Tuning.json, mobs, rooms, worlds, traits, subworlds, geysers, forestBase, codex, and full localized catalogs."""
    wg_dir = os.path.join(streaming_dir, "worldgen")

    # 1) Tuning.json
    tuning = {}
    tpath = os.path.join(streaming_dir, "Tuning.json")
    if os.path.exists(tpath):
        with open(tpath, "r", encoding="utf-8", errors="replace") as f:
            tuning = json.load(f)

    # 2) mobs.yaml (MobLookupTable.add -> 60 species/plants)
    mobs = {}
    mpath = os.path.join(wg_dir, "mobs.yaml")
    if os.path.exists(mpath):
        with open(mpath, "r", encoding="utf-8") as f:
            mdoc = yaml.safe_load(f) or {}
        mob_dict = (mdoc.get("MobLookupTable") or {}).get("add") or mdoc.get("mobs") or {}
        for mid, md in mob_dict.items():
            if not isinstance(md, dict):
                continue
            prefab = str(md.get("prefabName", mid))
            name_ko = ko.get(
                f"STRINGS.CREATURES.SPECIES.{prefab.upper()}.NAME",
                ko.get(f"STRINGS.CREATURES.SPECIES.{mid.upper()}.NAME", prefab),
            )
            mobs[mid] = {
                "prefab": prefab,
                "name_ko": name_ko,
                "location": str(md.get("location", "")),
                "width": int(md.get("width", 1)),
                "height": int(md.get("height", 1)),
                "density": md.get("density", {}),
            }

    # 3) rooms.yaml
    rooms = {}
    rpath = os.path.join(wg_dir, "rooms.yaml")
    if os.path.exists(rpath):
        with open(rpath, "r", encoding="utf-8") as f:
            rdoc = yaml.safe_load(f) or {}
        rooms = rdoc

    # 4) worlds (15)
    worlds = {}
    for wp in sorted(glob.glob(os.path.join(wg_dir, "worlds", "*.yaml"))):
        wid = os.path.splitext(os.path.basename(wp))[0]
        with open(wp, "r", encoding="utf-8") as f:
            wd = yaml.safe_load(f) or {}
        loc_name = str(wd.get("name", ""))
        worlds[wid] = {
            "name_ko": ko.get(loc_name, wid),
            "size": wd.get("worldsize", {}),
            "start_subworld": wd.get("startSubworldName", ""),
            "starting_base": wd.get("startingBaseTemplate", ""),
            "subworld_count": len(wd.get("subworldFiles") or []),
        }

    # 5) traits (18)
    traits = {}
    for tp in sorted(glob.glob(os.path.join(wg_dir, "traits", "*.yaml"))):
        tid = os.path.splitext(os.path.basename(tp))[0]
        with open(tp, "r", encoding="utf-8") as f:
            td = yaml.safe_load(f) or {}
        traits[tid] = {
            "name_ko": ko.get(str(td.get("name", "")), tid),
            "desc": ko.get(str(td.get("description", "")), ""),
            "color_hex": str(td.get("colorHex", "")),
        }

    # 6) subworlds (74)
    subworlds = {}
    for sp in sorted(glob.glob(os.path.join(wg_dir, "subworlds", "**", "*.yaml"), recursive=True)):
        rel = os.path.relpath(sp, os.path.join(wg_dir, "subworlds")).replace("\\", "/")
        sid = os.path.splitext(rel)[0]
        with open(sp, "r", encoding="utf-8") as f:
            sd = yaml.safe_load(f) or {}
        subworlds[sid] = {
            "biome_noise": sd.get("biomeNoise", ""),
            "temp_range": sd.get("temperatureRange", ""),
            "min_child_count": sd.get("minChildCount", 0),
            "biome_count": len(sd.get("biomes") or []),
            "zone_type": sd.get("zoneType", ""),
        }

    # 7) geysers (23)
    geysers = {}
    for gp in sorted(glob.glob(os.path.join(streaming_dir, "templates", "geysers", "*.yaml"))):
        gid = os.path.splitext(os.path.basename(gp))[0]
        with open(gp, "r", encoding="utf-8") as f:
            gd = yaml.safe_load(f) or {}
        info = gd.get("info") or {}
        oth = gd.get("otherEntities") or []
        entity_ids = [str(e.get("id", "")) for e in oth if isinstance(e, dict)]
        geysers[gid] = {
            "size": info.get("size", {}),
            "cell_count": len(gd.get("cells") or []),
            "entities": entity_ids,
        }

    # 8) forestBase.yaml summary
    forest_base = {}
    fb_path = os.path.join(streaming_dir, "templates", "bases", "forestBase.yaml")
    if os.path.exists(fb_path):
        with open(fb_path, "r", encoding="utf-8") as f:
            fb = yaml.safe_load(f) or {}
        forest_base = {
            "info": fb.get("info", {}),
            "cell_count": len(fb.get("cells") or []),
            "building_count": len(fb.get("buildings") or []),
        }

    # 9) Codex (347 files) category index
    codex_dir = os.path.join(streaming_dir, "codex")
    codex_cats = {}
    codex_total = 0
    for cp in sorted(glob.glob(os.path.join(codex_dir, "**", "*.yaml"), recursive=True)):
        codex_total += 1
        rel = os.path.relpath(cp, codex_dir).replace("\\", "/")
        cat = rel.split("/")[0] if "/" in rel else "Root"
        codex_cats.setdefault(cat, []).append(os.path.splitext(os.path.basename(cp))[0])

    # 10) Complete localized ONI catalogs from strings_preinstalled_ko_klei.po
    def collect_po_catalog(prefix: str) -> dict:
        cat = {}
        plen = len(prefix)
        for k, v in ko.items():
            if k.startswith(prefix) and k.endswith(".NAME"):
                mid = k[plen:-5]
                if "." not in mid and v:
                    cat[mid] = v
        return cat

    def collect_po_with_desc(prefix: str, desc_suffix: str = ".DESC") -> dict:
        cat = {}
        plen = len(prefix)
        for k, v in ko.items():
            if k.startswith(prefix) and k.endswith(".NAME"):
                mid = k[plen:-5]
                if "." not in mid and v:
                    desc = ko.get(f"{prefix}{mid}{desc_suffix}", ko.get(f"{prefix}{mid}.DESCRIPTION", ko.get(f"{prefix}{mid}.EFFECT", "")))
                    cat[mid] = {"name_ko": v, "desc": desc[:140]}
        return cat

    po_catalogs = {
        "buildings_ko": collect_po_catalog("STRINGS.BUILDINGS.PREFABS."),
        "creatures_ko": collect_po_catalog("STRINGS.CREATURES.SPECIES."),
        "foods_ko": collect_po_catalog("STRINGS.ITEMS.FOOD."),
        "diseases_ko": collect_po_catalog("STRINGS.DUPLICANTS.DISEASES."),
        "rooms_ko": collect_po_catalog("STRINGS.ROOMS.TYPES."),
        "personalities_ko": collect_po_catalog("STRINGS.DUPLICANTS.PERSONALITIES."),
        "duplicant_traits_ko": collect_po_catalog("STRINGS.DUPLICANTS.TRAITS."),
    }

    # 11) Extra worldgen & POI datasets (POIs 62, StoryTraits 17, Clusters 13, Noise 24, Features 13, Temperatures)
    pois = {}
    for pp in sorted(glob.glob(os.path.join(streaming_dir, "templates", "poi", "**", "*.yaml"), recursive=True)):
        rel = os.path.relpath(pp, os.path.join(streaming_dir, "templates", "poi")).replace("\\", "/")
        pid = os.path.splitext(rel)[0]
        try:
            with open(pp, "r", encoding="utf-8") as f:
                pd = yaml.safe_load(f) or {}
            pois[pid] = {
                "size": (pd.get("info") or {}).get("size", {}),
                "cells": len(pd.get("cells") or []),
                "buildings": len(pd.get("buildings") or []),
            }
        except Exception:
            pass

    story_traits_tpl = [
        os.path.splitext(os.path.basename(p))[0]
        for p in sorted(glob.glob(os.path.join(streaming_dir, "templates", "storytraits", "*.yaml")))
    ]
    clusters = {}
    for cp in sorted(glob.glob(os.path.join(wg_dir, "clusters", "*.yaml"))):
        cid = os.path.splitext(os.path.basename(cp))[0]
        try:
            with open(cp, "r", encoding="utf-8") as f:
                cd = yaml.safe_load(f) or {}
            clusters[cid] = {
                "name_ko": ko.get(str(cd.get("name", "")), cid),
                "worlds": len(cd.get("worldPlacements") or []),
            }
        except Exception:
            pass
    noise_defs = [
        os.path.splitext(os.path.basename(p))[0]
        for p in sorted(glob.glob(os.path.join(wg_dir, "noise", "*.yaml")))
    ]
    feature_defs = [
        os.path.splitext(os.path.relpath(p, os.path.join(wg_dir, "features")).replace("\\", "/"))[0]
        for p in sorted(glob.glob(os.path.join(wg_dir, "features", "**", "*.yaml"), recursive=True))
    ]
    personalities_detail = collect_po_with_desc("STRINGS.DUPLICANTS.PERSONALITIES.", ".DESC")
    rooms_detail = collect_po_with_desc("STRINGS.ROOMS.TYPES.", ".EFFECT")
    diseases_detail = collect_po_with_desc("STRINGS.DUPLICANTS.DISEASES.", ".DESCRIPTION")

    return {
        "extracted_at_utc": datetime.now(timezone.utc).isoformat(),
        "tuning": tuning,
        "mobs": mobs,
        "rooms": rooms,
        "rooms_detail": rooms_detail,
        "diseases_detail": diseases_detail,
        "personalities_detail": personalities_detail,
        "worlds": worlds,
        "clusters": clusters,
        "traits": traits,
        "subworlds": subworlds,
        "geysers": geysers,
        "pois": pois,
        "story_traits_templates": story_traits_tpl,
        "noise_defs": noise_defs,
        "feature_defs": feature_defs,
        "forest_base": forest_base,
        "codex": {"total_files": codex_total, "categories": {k: len(v) for k, v in codex_cats.items()}},
        "po_catalogs_counts": {k: len(v) for k, v in po_catalogs.items()},
        "po_catalogs": po_catalogs,
    }


def parse_unity_shaders_and_materials(data_dir: str) -> dict:
    """
    Extract all Unity 6 (6000.3.5f2) Shader (ClassID 48) and Material (ClassID 21)
    objects across resources.assets, sharedassets0.assets, and sharedassets2.assets.
    """
    shaders = []
    materials = []

    shader_name_re = re.compile(rb"(?:Klei|Sprites|UI|Hidden|TextMeshPro|Legacy Shaders|Unlit|Standard|Particles|GUI|Custom|Universal Render Pipeline)/[A-Za-z0-9 _/\-\.\(\)]+")
    prop_name_re = re.compile(rb"_[A-Za-z][A-Za-z0-9_]{2,40}")

    for fname in ["resources.assets", "sharedassets0.assets", "sharedassets2.assets"]:
        apath = os.path.join(data_dir, fname)
        if not os.path.exists(apath):
            continue
        with open(apath, "rb") as f:
            hdr = f.read(48)
            _, data_off, _ = struct.unpack(">QQQ", hdr[24:48])
            read_cstr(f)
            f.read(5)
            tcnt = struct.unpack("<i", f.read(4))[0]
            types = []
            for _ in range(tcnt):
                cid = struct.unpack("<i", f.read(4))[0]
                f.read(3)
                if cid == 114:
                    f.read(16)
                f.read(16)
                types.append(cid)
            ocnt = struct.unpack("<i", f.read(4))[0]
            align4(f)
            objs = []
            for _ in range(ocnt):
                align4(f)
                pid, bs, bsz, ti = struct.unpack("<qqIi", f.read(24))
                objs.append((types[ti], data_off + bs, bsz, pid))

            for cid, off, sz, pid in objs:
                if cid == 48:
                    f.seek(off)
                    raw = f.read(min(sz, 16384))
                    # Extract canonical shader path name from SerializedShader.m_ParsedForm
                    m_names = shader_name_re.findall(raw)
                    # Prefer Klei/ or the longest clean shader path
                    sname = ""
                    if m_names:
                        # Last or longest path usually matches m_ParsedForm.m_Name
                        cands = [m.decode("ascii", "ignore").strip() for m in m_names]
                        klei_cands = [c for c in cands if c.startswith("Klei/")]
                        sname = klei_cands[0] if klei_cands else max(cands, key=len)
                    else:
                        # Check plain name length prefix
                        nl = struct.unpack_from("<i", raw, 0)[0]
                        if 0 < nl < 120:
                            sname = raw[4 : 4 + nl].decode("utf-8", "replace")
                        else:
                            sname = f"Shader_{pid}"
                    # Extract shader properties (_MainTex, _Color, etc.)
                    props = sorted(set(p.decode("ascii", "ignore") for p in prop_name_re.findall(raw[:8192])))[:24]
                    shaders.append({
                        "file": fname,
                        "path_id": pid,
                        "name": sname,
                        "byte_size": sz,
                        "properties": props,
                    })
                elif cid == 21:
                    f.seek(off)
                    raw = f.read(min(sz, 8192))
                    nl = struct.unpack_from("<i", raw, 0)[0]
                    mname = raw[4 : 4 + nl].decode("utf-8", "replace") if 0 < nl < 160 else f"Material_{pid}"
                    # Extract shader property names referenced by this material
                    props = sorted(set(p.decode("ascii", "ignore") for p in prop_name_re.findall(raw)))[:20]
                    # Extract RGBA colors (look for known color props followed by 4 floats)
                    colors = {}
                    for cprop in [b"_Color", b"_TintColor", b"_Tint", b"_OutlineColor", b"_EmissionColor"]:
                        ci = raw.find(cprop)
                        if ci >= 0:
                            after = ci + len(cprop)
                            after = (after + 3) & ~3
                            if after + 16 <= len(raw):
                                r, g, b, a = struct.unpack_from("<4f", raw, after)
                                if all(-0.1 <= v <= 10.0 for v in (r, g, b, a)):
                                    colors[cprop.decode("ascii")] = [round(r, 3), round(g, 3), round(b, 3), round(a, 3)]
                    materials.append({
                        "file": fname,
                        "name": mname,
                        "byte_size": sz,
                        "properties": props,
                        "colors": colors,
                    })

    return {
        "extracted_at_utc": datetime.now(timezone.utc).isoformat(),
        "shader_count": len(shaders),
        "material_count": len(materials),
        "klei_shaders": [s["name"] for s in shaders if s["name"].startswith("Klei/")],
        "shaders": shaders,
        "materials": materials,
    }


def extract_fmod_strings_bank(streaming_dir: str) -> dict:
    """
    Parse FMOD Studio 2.x Master Bank.strings.bank (LIST/PROJ/STDT Packed RadixTree24).
    Recovers FMOD path tokens, root prefixes (event:/, snapshot:/, vca:/), and
    radix tree statistics.
    """
    p = os.path.join(streaming_dir, "Master Bank.strings.bank")
    if not os.path.exists(p):
        return {"total_tokens": 0, "total_guids_est": 0, "root_markers": [], "sample_tokens": []}
    raw = open(p, "rb").read()

    stdt_idx = raw.find(b"STDT")
    if stdt_idx < 0:
        return {"total_tokens": 0, "total_guids_est": 0, "root_markers": [], "sample_tokens": []}
    chunk_len = struct.unpack_from("<I", raw, stdt_idx + 4)[0]
    body = raw[stdt_idx + 8 : stdt_idx + 8 + chunk_len]

    # Locate string buffer inside STDT (runs of null-terminated UTF-8 tokens surrounding event:/)
    ev_pos = body.find(b"event:/")
    tokens = []
    root_markers = []
    node_count_est = 0
    if ev_pos > 0:
        # Walk backward from ev_pos to find beginning of null-terminated ASCII token buffer
        s_start = ev_pos
        while s_start > 0 and (body[s_start - 1] == 0 or 32 <= body[s_start - 1] <= 126):
            s_start -= 1
        # Walk forward from ev_pos to find end of token buffer
        s_end = ev_pos
        while s_end < len(body) and (body[s_end] == 0 or 32 <= body[s_end] <= 126):
            s_end += 1
        seg_raw = body[s_start:s_end]
        tokens = [t.decode("ascii", "ignore") for t in seg_raw.split(b"\x00") if len(t) >= 2]
        for mk in ["event:/", "snapshot:/", "vca:/", "bus:/", "bank:/"]:
            if mk.encode("ascii") in seg_raw:
                root_markers.append(mk)
        # Estimate radix node count from trailing u24 parent index array
        tail = body[s_end:]
        if len(tail) >= 30:
            u24_vals = [tail[i] | (tail[i + 1] << 8) | (tail[i + 2] << 16) for i in range(0, len(tail) - 2, 3)]
            valid = [v for v in u24_vals if v < 30000]
            node_count_est = (max(valid) + 1) if valid else 0

    # Categorize notable ONI audio domains found in STDT token table
    domains = {}
    for dom in ["Buildings", "Duplicants", "Creatures", "Environment", "UI", "Music", "Ambience", "Plants", "FX", "Rockets"]:
        hits = [t for t in tokens if dom.lower() in t.lower()]
        if hits:
            domains[dom] = len(hits)

    return {
        "extracted_at_utc": datetime.now(timezone.utc).isoformat(),
        "stdt_bytes": chunk_len,
        "radix_nodes_est": node_count_est,
        "total_tokens": len(tokens),
        "root_markers": root_markers,
        "domain_token_counts": domains,
        "sample_tokens": tokens[:150],
    }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--source", default=r"C:\Temp\Oxygen")
    parser.add_argument(
        "--out",
        default=r"D:\Github\GoDotProjects-worktrees\breath-sim\forge\Templates\oxygen-not-included\data",
    )
    args = parser.parse_args()

    data_dir = os.path.join(args.source, "OxygenNotIncluded_Data")
    streaming_dir = os.path.join(data_dir, "StreamingAssets")
    po_path = os.path.join(streaming_dir, "strings", "strings_preinstalled_ko_klei.po")
    ko = parse_ko_po(po_path) if os.path.exists(po_path) else {}

    world_codex = extract_world_and_codex(streaming_dir, ko)
    shaders_mats = parse_unity_shaders_and_materials(data_dir)
    fmod_events = extract_fmod_strings_bank(streaming_dir)

    os.makedirs(args.out, exist_ok=True)

    def write_txt(name: str, obj: dict) -> int:
        p = os.path.join(args.out, name)
        with open(p, "w", encoding="utf-8") as f:
            json.dump(obj, f, ensure_ascii=False, separators=(",", ":"))
        return os.path.getsize(p)

    sz_wc = write_txt("world_codex_extracted.txt", world_codex)
    sz_sm = write_txt("shaders_materials_extracted.txt", shaders_mats)
    sz_fe = write_txt("fmod_events_extracted.txt", fmod_events)

    # Update master extraction_manifest.txt with complete audit across all datasets, assets, and shaders
    mf_path = os.path.join(args.out, "extraction_manifest.txt")
    manifest = {}
    if os.path.exists(mf_path):
        with open(mf_path, "r", encoding="utf-8") as f:
            manifest = json.load(f)
    counts = manifest.setdefault("counts", {})
    counts.update({
        "mobs": len(world_codex["mobs"]),
        "worlds": len(world_codex["worlds"]),
        "traits": len(world_codex["traits"]),
        "subworlds": len(world_codex["subworlds"]),
        "geysers": len(world_codex["geysers"]),
        "codex_files": world_codex["codex"]["total_files"],
        "po_buildings_ko": world_codex["po_catalogs_counts"]["buildings_ko"],
        "po_creatures_ko": world_codex["po_catalogs_counts"]["creatures_ko"],
        "po_foods_ko": world_codex["po_catalogs_counts"]["foods_ko"],
        "po_diseases_ko": world_codex["po_catalogs_counts"]["diseases_ko"],
        "po_rooms_ko": world_codex["po_catalogs_counts"]["rooms_ko"],
        "po_personalities_ko": world_codex["po_catalogs_counts"]["personalities_ko"],
        "po_duplicant_traits_ko": world_codex["po_catalogs_counts"]["duplicant_traits_ko"],
        "poi_templates": len(world_codex["pois"]),
        "clusters": len(world_codex["clusters"]),
        "story_traits_templates": len(world_codex["story_traits_templates"]),
        "noise_defs": len(world_codex["noise_defs"]),
        "feature_defs": len(world_codex["feature_defs"]),
        "unity_shaders_total": shaders_mats["shader_count"],
        "klei_shaders_total": len(shaders_mats["klei_shaders"]),
        "unity_materials_total": shaders_mats["material_count"],
        "fmod_stdt_tokens": fmod_events["total_tokens"],
        "fmod_radix_nodes_est": fmod_events["radix_nodes_est"],
        "godot_ported_shaders": 5,
    })
    # Merge texture/kanim/audio totals if present
    kanim_ext_n = 0
    ext_p = os.path.join(args.out, "kanim_sprites_ext_extracted.txt")
    if os.path.exists(ext_p):
        with open(ext_p, "r", encoding="utf-8") as ef:
            kanim_ext_n = len(json.load(ef).get("building_sprites", {}))
    for extra_name, key_map in [
        ("buildings_extracted.txt", lambda d: {
            "buildings": len(d),
        }),
        ("textures_extracted.txt", lambda d: {
            "embedded_element_textures": len(d.get("element_textures", {})),
            "embedded_building_textures": len(d.get("building_textures", {})),
            "embedded_fx_textures": len(d.get("fx_textures", {})),
        }),
        ("kanim_sprites_extracted.txt", lambda d: {
            "embedded_kanim_building_sprites": len(d.get("building_sprites", {})) + kanim_ext_n,
            "embedded_kanim_duplicant_sprites": len(d.get("duplicant_sprites", [])),
        }),
        ("audio_extracted.txt", lambda d: {
            "fmod_banks_total": d.get("total_banks", 0),
            "fmod_samples_total": d.get("total_samples", 0),
            "fmod_pcm16_samples": d.get("pcm16_samples", 0),
            "fmod_vorbis_samples": d.get("vorbis_samples", 0),
            "embedded_pcm16_sfx": len(d.get("sfx_pcm16", {})),
        }),
    ]:
        ep = os.path.join(args.out, extra_name)
        if os.path.exists(ep):
            with open(ep, "r", encoding="utf-8") as ef:
                counts.update(key_map(json.load(ef)))
    manifest["finalized_at_utc"] = datetime.now(timezone.utc).isoformat()
    with open(mf_path, "w", encoding="utf-8") as f:
        json.dump(manifest, f, ensure_ascii=False, indent=2)

    print(json.dumps({
        "world_codex": {
            "mobs": len(world_codex["mobs"]),
            "worlds": len(world_codex["worlds"]),
            "traits": len(world_codex["traits"]),
            "subworlds": len(world_codex["subworlds"]),
            "geysers": len(world_codex["geysers"]),
            "codex_files": world_codex["codex"]["total_files"],
            "po_catalogs": world_codex["po_catalogs_counts"],
            "file_bytes": sz_wc,
        },
        "shaders_materials": {
            "shaders": shaders_mats["shader_count"],
            "klei_shaders": len(shaders_mats["klei_shaders"]),
            "klei_shader_samples": shaders_mats["klei_shaders"][:15],
            "materials": shaders_mats["material_count"],
            "file_bytes": sz_sm,
        },
        "fmod_events": {
            "stdt_bytes": fmod_events["stdt_bytes"],
            "radix_nodes_est": fmod_events["radix_nodes_est"],
            "total_tokens": fmod_events["total_tokens"],
            "root_markers": fmod_events["root_markers"],
            "domain_token_counts": fmod_events["domain_token_counts"],
            "file_bytes": sz_fe,
        },
    }, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
