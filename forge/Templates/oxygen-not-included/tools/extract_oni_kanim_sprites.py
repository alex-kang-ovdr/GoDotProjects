#!/usr/bin/env python3
"""
Full Klei KAnim (BILD v10 + ANIM v5 + DXT5 Atlas) reverse-engineering compositor
for Oxygen Not Included (C:/Temp/Oxygen).

Composites authentic hand-drawn ONI buildings, Printing Pod, Mealwood plant, and
Duplicant sprites (body_comp_default + head_swap + anim_idle_happy / anim_loco_walk)
using exact 2D affine transforms from ANIM v5 into lightweight transparent PNGs
packed in data/kanim_sprites_extracted.txt for Godot 4.7 WebAssembly rendering.
"""

import argparse
import base64
import io
import json
import os
import struct
from datetime import datetime, timezone

import numpy as np
from PIL import Image

from extract_oni_media import decode_dxt1, decode_dxt5, parse_texture2d_entry, read_cstr, align4

# Sprite recipe list: key -> (build_list, anim_name, preferred_clips, out_size)
BUILDING_RECIPES = {
    "pod": (["hqbase"], "hqbase", ["idle", "on", "working_loop", "off"], 128),
    "diffuser": (["mineraldeoxidizer"], "mineraldeoxidizer", ["working_loop", "on", "off"], 96),
    "electrolyzer": (["electrolyzer"], "electrolyzer", ["working_loop", "on", "off"], 96),
    "generator": (["generatormanual"], "generatormanual", ["working_loop", "on", "off"], 96),
    "coal_gen": (["generatorphos"], "generatorphos", ["working_loop", "on", "off"], 96),
    "hydrogen_gen": (["generatormethane"], "generatormethane", ["working_loop", "on", "off"], 96),
    "steam_turbine": (["steamturbine2"], "steamturbine2", ["working_loop", "on", "off"], 112),
    "battery": (["batterysm"], "batterysm", ["on", "off"], 80),
    "storage": (["storagelocker"], "storagelocker", ["on", "off"], 80),
    "research_station": (["research_center"], "research_center", ["working_loop", "on", "off"], 96),
    "farm_tile": (["farmtile"], "farmtile", ["on", "off"], 64),
    "ladder": (["ladder"], "ladder", ["off", "on"], 64),
    "cot": (["bedlg"], "bedlg", ["off", "on"], 96),
    "liquid_pump": (["pumpliquid"], "pumpliquid", ["working_loop", "on", "off"], 80),
    "liquid_vent": (["ventliquid"], "ventliquid", ["working_loop", "on", "off"], 64),
    "gas_pump": (["pumpgas"], "pumpgas", ["working_loop", "on", "off"], 80),
    "gas_vent": (["ventgas"], "ventgas", ["working_loop", "on", "off"], 64),
    "mealwood": (["meallice"], "meallice", ["idle_full", "grow", "idle"], 80),
    "rocket_steam_engine": (["rocket_steam_engine"], "rocket_steam_engine", ["grounded", "launch", "on", "off"], 112),
    "rocket_research_module": (["rocket_research_module"], "rocket_research_module", ["grounded", "on", "off"], 112),
    "rocket_command_module": (["rocket_command_module"], "rocket_command_module", ["grounded", "on", "off"], 112),
    "geyser_steam": (["geyser_gas_steam"], "geyser_gas_steam", ["erupt", "inactive", "on", "off"], 96),
    "geyser_water": (["geyser_liquid_water_hot"], "geyser_liquid_water_hot", ["erupt", "inactive", "on", "off"], 96),
    "geyser_hydrogen": (["geyser_gas_hydrogen_hot"], "geyser_gas_hydrogen_hot", ["erupt", "inactive", "on", "off"], 96),
    "critter_hatch": (["hatch_build", "hatch"], "hatch", ["idle_loop", "walk_loop", "idle"], 72),
    "critter_puft": (["puft_build", "puft"], "puft", ["idle_loop", "fly_loop", "idle"], 72),
    "critter_lightbug": (["lightbug_build", "lightbug"], "lightbug", ["idle_loop", "fly_loop", "idle"], 72),
}

# Extended KAnim recipes emitted into 2nd shard data/kanim_sprites_ext_extracted.txt (stays well under 1MB/file)
EXTENDED_RECIPES = {
    "door": (["door_manual"], "door_manual", ["closed", "open", "off"], 80),
    "outhouse": (["outhouse"], "outhouse", ["off", "on", "working_loop"], 88),
    "wash_basin": (["wash_basin"], "wash_basin", ["on", "off", "working_loop"], 84),
    "mess_table": (["diningtable"], "diningtable", ["off", "on"], 80),
    "ration_box": (["rationbox"], "rationbox", ["off", "on"], 80),
    "ceiling_light": (["ceilinglight"], "ceilinglight", ["on", "off"], 72),
    "microbe_musher": (["microbemusher"], "microbemusher", ["working_loop", "on", "off"], 88),
    "electric_grill": (["cookstation"], "cookstation", ["working_loop", "on", "off"], 88),
    "co2_skimmer": (["co2filter"], "co2filter", ["working_loop", "on", "off"], 88),
    "water_sieve": (["waterpurifier"], "waterpurifier", ["working_loop", "on", "off"], 96),
    "liquid_reservoir": (["liquidreservoir"], "liquidreservoir", ["on", "off"], 92),
    "gas_reservoir": (["gasstorage"], "gasstorage", ["on", "off"], 92),
    "fridge": (["fridge"], "fridge", ["on", "off"], 80),
    "compost": (["compost"], "compost", ["working_loop", "on", "off"], 84),
    "bristle_blossom": (["bristleblossom"], "bristleblossom", ["idle_full", "grow", "idle"], 76),
    "oxy_fern": (["oxy_fern"], "oxy_fern", ["idle_full", "grow", "idle"], 76),
    "critter_drecko": (["drecko_build", "drecko"], "drecko", ["idle_loop", "walk_loop", "idle"], 72),
    "critter_pacu": (["pacu_build", "pacu"], "pacu", ["swim_loop", "idle_loop", "idle"], 72),
    "critter_slickster": (["oilfloater_build", "oilfloater"], "oilfloater", ["idle_loop", "hover_loop", "idle"], 72),
}

# 3rd KAnim shard (Automation, Industry, Decor, Gravitas POIs, Pip critter + 3 extra Duplicants)
EXTENDED_RECIPES_2 = {
    "smart_battery": (["smartbattery"], "smartbattery", ["on", "off"], 84),
    "atmo_sensor": (["switchgaspressure"], "switchgaspressure", ["on", "off"], 64),
    "thermo_sensor": (["switchthermal"], "switchthermal", ["on", "off"], 64),
    "logic_not": (["logic_not"], "logic_not", ["on", "off"], 64),
    "mech_door": (["door_external"], "door_external", ["closed", "open", "off"], 84),
    "thermo_aquatuner": (["liquidconditioner"], "liquidconditioner", ["working_loop", "on", "off"], 96),
    "oil_refinery": (["oilrefinery"], "oilrefinery", ["working_loop", "on", "off"], 96),
    "metal_refinery": (["metalrefinery"], "metalrefinery", ["working_loop", "on", "off"], 96),
    "solar_panel": (["solar_panel"], "solar_panel", ["on", "off"], 96),
    "decor_painting": (["gravitas_painting"], "gravitas_painting", ["on", "off"], 76),
    "flower_pot": (["flowervase"], "flowervase", ["off", "on"], 72),
    "sculpture": (["sculpture_marble_amazing_1"], "sculpture_marble_amazing_1", ["amazing_1", "off", "on"], 88),
    "aetn": (["massiveheatsink"], "massiveheatsink", ["working_loop", "on", "off"], 112),
    "poi_vending": (["vendingmachine"], "vendingmachine", ["on", "off"], 84),
    "poi_desk": (["gravitas_desk"], "gravitas_desk", ["on", "off"], 88),
    "critter_pip": (["squirrel_build", "squirrel"], "squirrel", ["idle_loop", "walk_loop", "idle"], 72),
}

# 4th KAnim shard (Space, Ranching, Shipping, FirePole, OxygenMask, Sweepy, Gassy Moo)
EXTENDED_RECIPES_3 = {
    "telescope": (["telescope"], "telescope", ["working_loop", "on", "off"], 96),
    "bunker_door": (["door_bunker"], "door_bunker", ["closed", "open", "off"], 88),
    "fire_pole": (["firepole"], "firepole", ["off", "on"], 64),
    "auto_sweeper": (["conveyor_transferarm"], "conveyor_transferarm", ["working_loop", "on", "off"], 84),
    "sweep_bot": (["sweep_bot"], "sweep_bot", ["idle_loop", "walk_loop", "on"], 72),
    "sweep_station": (["sweep_bot_base_station"], "sweep_bot_base_station", ["on", "off"], 88),
    "conveyor_loader": (["conveyorin"], "conveyorin", ["on", "off"], 84),
    "ranch_station": (["rancherstation"], "rancherstation", ["working_loop", "on", "off"], 92),
    "incubator": (["incubator"], "incubator", ["working_loop", "on", "off"], 88),
    "oxygen_dock": (["oxygen_mask_station"], "oxygen_mask_station", ["on", "off"], 88),
    "critter_moo": (["gassy_moo_build", "gassy_moo"], "gassy_moo", ["idle_loop", "fly_loop", "idle"], 84),
}

# 5th KAnim shard (Space Scanner, Meteors, Medical Clinic, Relaxation, Filters, Conveyor Chute, Rocket Cargo, Suit Forge)
EXTENDED_RECIPES_4 = {
    "space_scanner": (["meteor_detector"], "meteor_detector", ["working_loop", "on", "off"], 92),
    "meteor_rock": (["meteor_rock"], "meteor_rock", ["fall_loop", "idle", "on"], 72),
    "meteor_metal": (["meteor_metal"], "meteor_metal", ["fall_loop", "idle", "on"], 72),
    "medical_cot": (["medical_cot"], "medical_cot", ["off", "on", "working_loop"], 92),
    "apothecary": (["apothecary"], "apothecary", ["working_loop", "on", "off"], 92),
    "massage_table": (["treatment_chair"], "treatment_chair", ["working_loop", "on", "off"], 92),
    "wash_sink": (["wash_sink"], "wash_sink", ["on", "off"], 84),
    "water_cooler": (["watercooler"], "watercooler", ["on", "off"], 84),
    "shower": (["shower"], "shower", ["working_loop", "on", "off"], 88),
    "flush_toilet": (["toiletflush"], "toiletflush", ["on", "off"], 84),
    "jukebot": (["jukebot"], "jukebot", ["working_loop", "on", "off"], 92),
    "arcade_cabinet": (["arcade_cabinet"], "arcade_cabinet", ["working_loop", "on", "off"], 88),
    "gas_filter": (["filter_gas"], "filter_gas", ["working_loop", "on", "off"], 80),
    "liquid_filter": (["filter_liquid"], "filter_liquid", ["working_loop", "on", "off"], 80),
    "conveyor_chute": (["conveyorout"], "conveyorout", ["on", "off"], 80),
    "rocket_cargo_bay": (["rocket_storage_solid"], "rocket_storage_solid", ["grounded", "on", "off"], 108),
    "suit_maker": (["suit_maker"], "suit_maker", ["working_loop", "on", "off"], 96),
}

# 6th KAnim shard (Exosuit Dock/Checkpoint, Logic Gates AND/OR/Buffer/Switch/Alarm, Petrol Gen, Rock Crusher, Kiln, Petroleum Rocket Modules)
EXTENDED_RECIPES_5 = {
    "suit_dock": (["changingarea"], "changingarea", ["full", "on", "off"], 88),
    "suit_checkpoint": (["changingarea_arrow"], "changingarea_arrow", ["on", "off"], 80),
    "logic_switch": (["switchpower"], "switchpower", ["on", "off"], 68),
    "logic_and": (["logic_and"], "logic_and", ["on", "off"], 68),
    "logic_or": (["logic_or"], "logic_or", ["on", "off"], 68),
    "logic_buffer": (["logic_buffer"], "logic_buffer", ["on", "off"], 68),
    "logic_alarm": (["alarm_sensor"], "alarm_sensor", ["on", "off"], 72),
    "petrol_gen": (["generatorpetrol"], "generatorpetrol", ["working_loop", "on", "off"], 104),
    "rock_crusher": (["rockrefinery"], "rockrefinery", ["working_loop", "on", "off"], 96),
    "kiln": (["kiln"], "kiln", ["working_loop", "on", "off"], 92),
    "rocket_petroleum_engine": (["rocket_petroleum_engine"], "rocket_petroleum_engine", ["grounded", "launch", "on", "off"], 112),
    "rocket_fuel_tank": (["rocket_liquid_fuel_tank"], "rocket_liquid_fuel_tank", ["grounded", "on", "off"], 108),
    "rocket_oxidizer_tank": (["rocket_oxidizer_tank"], "rocket_oxidizer_tank", ["grounded", "on", "off"], 108),
}

# Duplicant KAnim recipes (combine body_comp_default + body_swap + head_swap + hair_swap + atmosuit)
DUPE_BUILD_SET = ["body_comp_default", "body_swap", "head_swap", "hair_swap", "atmosuit_basic_blue"]


def parse_bild_full(raw: bytes) -> dict:
    """Parse Klei BILD v10 symbols, frames, and string hash table."""
    if len(raw) < 20 or raw[:4] != b"BILD":
        return {}
    pos = 4
    ver, sym_cnt, frame_cnt = struct.unpack_from("<iii", raw, pos)
    pos += 12
    nlen = struct.unpack_from("<i", raw, pos)[0]
    pos += 4
    bname = raw[pos : pos + nlen].decode("utf-8", "replace")
    pos += nlen

    symbols = {}
    for _ in range(sym_cnt):
        if pos + 20 > len(raw):
            break
        shash, spath, scolor, sflags, nframes = struct.unpack_from("<iiiii", raw, pos)
        pos += 20
        frames = []
        for _ in range(nframes):
            if pos + 44 > len(raw):
                break
            src_num, dur, img_idx = struct.unpack_from("<iii", raw, pos)
            pos += 12
            px, py, pw, ph, u0, v0, u1, v1 = struct.unpack_from("<ffffffff", raw, pos)
            pos += 32
            frames.append({
                "src": src_num,
                "dur": max(1, dur),
                "img_idx": img_idx,
                "px": px, "py": py, "pw": pw, "ph": ph,
                "u0": u0, "v0": v0, "u1": u1, "v1": v1,
            })
        symbols[shash] = {"hash": shash, "path": spath, "frames": frames}

    # Parse trailing hash -> name table
    hash_names = {}
    if pos + 4 <= len(raw):
        hcnt = struct.unpack_from("<i", raw, pos)[0]
        pos += 4
        for _ in range(max(0, min(hcnt, 2000))):
            if pos + 8 > len(raw):
                break
            hv, slen = struct.unpack_from("<ii", raw, pos)
            pos += 8
            if 0 <= slen < 256 and pos + slen <= len(raw):
                hash_names[hv] = raw[pos : pos + slen].decode("utf-8", "replace")
                pos += slen
            else:
                break

    for sh, sd in symbols.items():
        sd["name"] = hash_names.get(sh, str(sh))

    return {"name": bname, "symbols": symbols, "hash_names": hash_names}


def parse_anim_full(raw: bytes) -> dict:
    """Parse Klei ANIM v5 clips, frames, and 60-byte affine elements."""
    if len(raw) < 20 or raw[:4] != b"ANIM":
        return {}
    pos = 4
    ver, elem_cnt, frame_cnt, anim_cnt = struct.unpack_from("<iiii", raw, pos)
    pos += 16
    clips = {}
    for _ in range(anim_cnt):
        if pos + 4 > len(raw):
            break
        nlen = struct.unpack_from("<i", raw, pos)[0]
        if not (0 < nlen < 128) or pos + 4 + nlen + 12 > len(raw):
            break
        pos += 4
        cname = raw[pos : pos + nlen].decode("utf-8", "replace")
        pos += nlen
        root_hash, fps, nf = struct.unpack_from("<ifi", raw, pos)
        pos += 12
        frames = []
        ok = True
        for _ in range(nf):
            if pos + 20 > len(raw):
                ok = False
                break
            bx, by, bw, bh, ne = struct.unpack_from("<ffffi", raw, pos)
            pos += 20
            if not (0 <= ne <= 512) or pos + ne * 60 > len(raw):
                ok = False
                break
            elems = []
            for _ in range(ne):
                sh, fnum, fhash, flags = struct.unpack_from("<iiii", raw, pos)
                a, b, g, r, m00, m01, m10, m11, tx, ty, _u = struct.unpack_from("<11f", raw, pos + 16)
                pos += 60
                elems.append({
                    "sym": sh,
                    "frame": fnum,
                    "folder": fhash,
                    "flags": flags,
                    "rgba": (r, g, b, a),
                    "mat": (m00, m01, m10, m11, tx, ty),
                })
            frames.append({"bbox": (bx, by, bw, bh), "elems": elems})
        if not ok:
            break
        clips[cname] = {"name": cname, "fps": fps, "frames": frames}
    return clips


def find_symbol_frame(sym_frames: list, frame_num: int):
    if not sym_frames:
        return None
    for fr in sym_frames:
        if fr["src"] <= frame_num < fr["src"] + fr["dur"]:
            return fr
    # Fallback closest frame
    return sym_frames[min(len(sym_frames) - 1, max(0, frame_num))]


def decode_atlas_image(tinfo: dict) -> Image.Image:
    w, h, fmt, raw = tinfo["width"], tinfo["height"], tinfo["format"], tinfo["pixels"]
    if fmt == 10:
        rgba = decode_dxt1(raw, w, h)
    elif fmt == 12:
        rgba = decode_dxt5(raw, w, h)
    elif fmt == 4:
        rgba = np.frombuffer(raw[: w * h * 4], dtype=np.uint8).reshape(h, w, 4)
    else:
        return None
    # Note: KAnim UV (v0, v1) uses top-down coordinates matching flipped Unity texture
    rgba = np.flipud(rgba)
    return Image.fromarray(rgba, mode="RGBA")


def composite_kanim_frame(
    frame: dict,
    symbol_sources: list,
    out_size: int = 96,
    filter_out_names: tuple = ("place", "meter", "ui", "glow", "highlight", "snapto"),
    symbol_swap: dict = None,
) -> Image.Image:
    """
    Composite a single KAnim frame into a crisp transparent RGBA PNG.
    symbol_sources: list of (bild_dict, atlas_pil_image) searched in order.
    symbol_swap: optional dict mapping lowercase slot symbol name -> target symbol name in symbol_sources.
    """
    elems = frame["elems"]
    if not elems:
        return None

    # Build fast name -> (sym_dict, atlas_im) and hash -> name lookups across all sources
    name_lookup = {}
    hash_to_name = {}
    for bdict, atlas_im in symbol_sources:
        for h, nm in bdict.get("hash_names", {}).items():
            hash_to_name.setdefault(h, nm)
        for sh, sd in bdict["symbols"].items():
            nm = sd.get("name", "").lower()
            if nm and nm not in name_lookup:
                name_lookup[nm] = (sd, atlas_im)

    # Resolve drawable parts and compute world bounding box
    parts = []
    min_x, min_y = 1e9, 1e9
    max_x, max_y = -1e9, -1e9

    # KAnim elements are stored front-to-back, so reverse to draw back-to-front (painter's algorithm)
    for el in reversed(elems):
        sh = el["sym"]
        fnum = el["frame"]
        a_col = el["rgba"][3]
        if a_col <= 0.02:
            continue

        slot_name = hash_to_name.get(sh, "").lower()
        matched_sym = None
        matched_atlas = None

        if symbol_swap and slot_name in symbol_swap:
            target_nm = symbol_swap[slot_name].lower()
            if target_nm in name_lookup:
                matched_sym, matched_atlas = name_lookup[target_nm]
        else:
            if slot_name and any(bad in slot_name for bad in filter_out_names):
                continue
            for bdict, atlas_im in symbol_sources:
                if sh in bdict["symbols"]:
                    matched_sym = bdict["symbols"][sh]
                    matched_atlas = atlas_im
                    break
            if matched_sym is not None:
                sname_l = matched_sym.get("name", "").lower()
                if any(bad in sname_l for bad in filter_out_names):
                    continue

        if matched_sym is None or matched_atlas is None:
            continue

        sfr = find_symbol_frame(matched_sym["frames"], fnum)
        if sfr is None or sfr["pw"] <= 0.5 or sfr["ph"] <= 0.5:
            continue

        m00, m01, m10, m11, tx, ty = el["mat"]
        # Local rectangle corners in KAnim space (pivot-centered)
        # Note: Klei KAnim uses 2x coordinate scale vs pivot/size in BILD (px, py, pw, ph are in KAnim units)
        x0 = sfr["px"] - sfr["pw"] * 0.5
        x1 = sfr["px"] + sfr["pw"] * 0.5
        y0 = sfr["py"] - sfr["ph"] * 0.5
        y1 = sfr["py"] + sfr["ph"] * 0.5

        # Local->World matrix (3x3)
        M = np.array([[m00, m01, tx], [m10, m11, ty], [0.0, 0.0, 1.0]], dtype=np.float64)
        corners = np.array([[x0, x1, x1, x0], [y0, y0, y1, y1], [1.0, 1.0, 1.0, 1.0]])
        wc = M @ corners
        min_x = min(min_x, float(wc[0].min()))
        max_x = max(max_x, float(wc[0].max()))
        min_y = min(min_y, float(wc[1].min()))
        max_y = max(max_y, float(wc[1].max()))
        parts.append((sfr, matched_atlas, M, el["rgba"], (x0, y0, x1, y1)))

    if not parts or max_x <= min_x or max_y <= min_y:
        return None

    # Render onto high-res working canvas (up to 384px) then downscale with LANCZOS
    pad = 8.0
    world_w = (max_x - min_x) + pad * 2
    world_h = (max_y - min_y) + pad * 2
    work_max = max(out_size * 2, 256)
    scale = min(work_max / world_w, work_max / world_h)
    cw = max(16, int(round(world_w * scale)))
    ch = max(16, int(round(world_h * scale)))

    # World -> Canvas matrix
    W2C = np.array([
        [scale, 0.0, (-min_x + pad) * scale],
        [0.0, scale, (-min_y + pad) * scale],
        [0.0, 0.0, 1.0],
    ], dtype=np.float64)

    canvas = Image.new("RGBA", (cw, ch), (0, 0, 0, 0))

    for sfr, atlas_im, M, rgba, (x0, y0, x1, y1) in parts:
        aw, ah = atlas_im.size
        u0, v0, u1, v1 = sfr["u0"], sfr["v0"], sfr["u1"], sfr["v1"]
        ax0, ay0 = u0 * aw, v0 * ah
        ax1, ay1 = u1 * aw, v1 * ah
        # Crop slightly padded patch from atlas for fast transform
        cx0 = max(0, int(np.floor(min(ax0, ax1))) - 1)
        cy0 = max(0, int(np.floor(min(ay0, ay1))) - 1)
        cx1 = min(aw, int(np.ceil(max(ax0, ax1))) + 1)
        cy1 = min(ah, int(np.ceil(max(ay0, ay1))) + 1)
        if cx1 <= cx0 or cy1 <= cy0:
            continue
        patch = atlas_im.crop((cx0, cy0, cx1, cy1))

        # Apply RGB/Alpha tint if non-identity
        r, g, b, a = rgba
        if abs(r - 1.0) > 0.02 or abs(g - 1.0) > 0.02 or abs(b - 1.0) > 0.02 or abs(a - 1.0) > 0.02:
            pa = np.array(patch, dtype=np.float32)
            pa[:, :, 0] = np.clip(pa[:, :, 0] * r, 0, 255)
            pa[:, :, 1] = np.clip(pa[:, :, 1] * g, 0, 255)
            pa[:, :, 2] = np.clip(pa[:, :, 2] * b, 0, 255)
            pa[:, :, 3] = np.clip(pa[:, :, 3] * a, 0, 255)
            patch = Image.fromarray(pa.astype(np.uint8), mode="RGBA")

        # Patch pixel -> Local KAnim space
        # u spans [ax0..ax1] -> x spans [x0..x1], v spans [ay0..ay1] -> y spans [y0..y1]
        sx = (x1 - x0) / max(1e-6, (ax1 - ax0))
        sy = (y1 - y0) / max(1e-6, (ay1 - ay0))
        P2L = np.array([
            [sx, 0.0, x0 + (cx0 - ax0) * sx],
            [0.0, sy, y0 + (cy0 - ay0) * sy],
            [0.0, 0.0, 1.0],
        ], dtype=np.float64)

        P2C = W2C @ M @ P2L
        if abs(np.linalg.det(P2C[:2, :2])) < 1e-8:
            continue
        C2P = np.linalg.inv(P2C)
        coeffs = (C2P[0, 0], C2P[0, 1], C2P[0, 2], C2P[1, 0], C2P[1, 1], C2P[1, 2])
        warped = patch.transform((cw, ch), Image.Transform.AFFINE, coeffs, resample=Image.Resampling.BICUBIC)
        canvas = Image.alpha_composite(canvas, warped)

    # Trim transparent margins and fit cleanly into square out_size x out_size (bottom-aligned)
    bbox = canvas.getbbox()
    if not bbox:
        return None
    trimmed = canvas.crop(bbox)
    tw, th = trimmed.size
    fit_s = min((out_size - 4) / max(1, tw), (out_size - 4) / max(1, th))
    nw = max(1, int(round(tw * fit_s)))
    nh = max(1, int(round(th * fit_s)))
    resized = trimmed.resize((nw, nh), Image.Resampling.LANCZOS)
    final_im = Image.new("RGBA", (out_size, out_size), (0, 0, 0, 0))
    ox = (out_size - nw) // 2
    oy = out_size - nh - 2  # bottom-aligned to stand cleanly on tile floor
    final_im.paste(resized, (ox, oy), resized)
    return final_im


def pil_to_b64(im: Image.Image) -> str:
    buf = io.BytesIO()
    im.save(buf, format="PNG", optimize=True)
    return base64.b64encode(buf.getvalue()).decode("ascii")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--source", default=r"C:\Temp\Oxygen")
    parser.add_argument(
        "--out",
        default=r"D:\Github\GoDotProjects-worktrees\breath-sim\forge\Templates\oxygen-not-included\data",
    )
    parser.add_argument(
        "--preview",
        default=r"C:\Users\taru0\.gemini\antigravity\brain\1389b77b-b61b-4d5c-952f-e487c213d497\scratch\kanim_sprites_preview.png",
    )
    args = parser.parse_args()

    data_dir = os.path.join(args.source, "OxygenNotIncluded_Data")
    assets_path = os.path.join(data_dir, "sharedassets0.assets")

    # Collect required asset names
    need_builds = set(DUPE_BUILD_SET)
    need_anims = {"anim_idle_happy", "anim_loco_walk"}
    need_tex = set()
    all_recipes = {}
    all_recipes.update(BUILDING_RECIPES)
    all_recipes.update(EXTENDED_RECIPES)
    all_recipes.update(EXTENDED_RECIPES_2)
    all_recipes.update(EXTENDED_RECIPES_3)
    all_recipes.update(EXTENDED_RECIPES_4)
    all_recipes.update(EXTENDED_RECIPES_5)
    for _k, (blist, aname, _clips, _sz) in all_recipes.items():
        for b in blist:
            need_builds.add(b)
        need_anims.add(aname)
    for b in list(need_builds):
        need_tex.add(b + "_0")
        if b.endswith("_0"):
            need_tex.add(b)
    # Also check common duplicant head/hair/eye/mouth atlas names
    extra_dupe_names = ["head_swap", "body_comp_default", "eyes_0", "mouth_0", "hair_0", "hat_0", "head_0"]

    need_ta_exact = set()
    for b in need_builds:
        need_ta_exact.add(b + "_build")
    for a in need_anims:
        need_ta_exact.add(a + "_anim")
    for e in extra_dupe_names:
        need_ta_exact.add(e + "_build")
        need_tex.add(e + "_0")

    builds_parsed = {}
    anims_parsed = {}
    atlases_pil = {}

    with open(assets_path, "rb") as f:
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
            objs.append((types[ti], data_off + bs, bsz))

        for cid, off, sz in objs:
            if cid not in (28, 49):
                continue
            f.seek(off)
            nl = struct.unpack("<i", f.read(4))[0]
            if not (0 < nl < 128):
                continue
            nm = f.read(nl).decode("utf-8", "replace")
            if cid == 49 and nm in need_ta_exact:
                align4(f)
                slen = struct.unpack("<i", f.read(4))[0]
                blob = f.read(slen)
                if nm.endswith("_build"):
                    builds_parsed[nm[:-6]] = parse_bild_full(blob)
                elif nm.endswith("_anim"):
                    anims_parsed[nm[:-5]] = parse_anim_full(blob)
            elif cid == 28 and nm in need_tex:
                tinfo = parse_texture2d_entry(f, off, sz, data_dir)
                if tinfo["pixels"]:
                    im = decode_atlas_image(tinfo)
                    if im is not None:
                        atlases_pil[nm] = im

    print(f"Loaded builds={len(builds_parsed)}, anims={len(anims_parsed)}, atlases={len(atlases_pil)}")

    out_buildings = {}
    out_buildings_ext = {}
    out_buildings_ext2 = {}
    out_buildings_ext3 = {}
    out_buildings_ext4 = {}
    out_buildings_ext5 = {}
    preview_list = []

    for key, (blist, aname, pref_clips, out_sz) in all_recipes.items():
        clips = anims_parsed.get(aname, {})
        sources = []
        for b in blist:
            bd = builds_parsed.get(b)
            at = atlases_pil.get(b + "_0")
            if bd and at:
                sources.append((bd, at))
        if not clips or not sources:
            print(f"  SKIP {key}: clips={bool(clips)} sources={len(sources)}")
            continue

        # Select idle clip and working clip (prefer clips matching pref_clips with richest symbol count)
        base_filter = ("place", "meter", "ui", "highlight", "snapto", "glow") if key.startswith("critter_") else ("place", "meter", "ui", "highlight", "snapto")

        def first_drawable_image(clip_list):
            for c in clip_list:
                if not c or not c.get("frames"):
                    continue
                # Pick frame with most elements for critters so full body is visible
                frames_to_try = sorted(
                    range(len(c["frames"])),
                    key=lambda idx_f: len(c["frames"][idx_f]["elems"]),
                    reverse=True,
                )[:2] if key.startswith("critter_") else [0, len(c["frames"]) // 2]
                for fi in frames_to_try:
                    im = composite_kanim_frame(
                        c["frames"][fi], sources, out_size=out_sz,
                        filter_out_names=base_filter,
                    )
                    if im is not None:
                        return c, im
            return None, None

        ordered_clips = []
        for pc in pref_clips:
            if pc in clips:
                ordered_clips.append(clips[pc])
        # For critters, sort fallback clips by max element count descending to skip 1-element fx/burrow clips
        rest_clips = [c for c in clips.values() if c not in ordered_clips]
        if key.startswith("critter_"):
            rest_clips.sort(key=lambda c: max((len(fr["elems"]) for fr in c.get("frames", [])), default=0), reverse=True)
        ordered_clips.extend(rest_clips)

        chosen_idle, im_idle = first_drawable_image(ordered_clips)
        chosen_work = chosen_idle
        im_work = im_idle
        if chosen_idle is not None:
            work_cands = [c for c in ordered_clips if any(w in c["name"].lower() for w in ("work", "walk", "fly", "erupt", "launch", "on"))]
            if work_cands:
                cw, iw = first_drawable_image(work_cands)
                if cw is not None and iw is not None:
                    chosen_work, im_work = cw, iw
            elif len(chosen_idle["frames"]) > 1:
                w_frames = chosen_idle["frames"]
                iw2 = composite_kanim_frame(
                    w_frames[len(w_frames) // 2], sources, out_size=out_sz,
                    filter_out_names=("place", "meter", "ui", "highlight", "snapto"),
                )
                if iw2 is not None:
                    im_work = iw2

        if im_idle is not None:
            target_dict = (
                out_buildings if key in BUILDING_RECIPES else
                out_buildings_ext if key in EXTENDED_RECIPES else
                out_buildings_ext2 if key in EXTENDED_RECIPES_2 else
                out_buildings_ext3 if key in EXTENDED_RECIPES_3 else
                out_buildings_ext4 if key in EXTENDED_RECIPES_4 else
                out_buildings_ext5
            )
            target_dict[key] = {
                "size": out_sz,
                "idle_clip": chosen_idle["name"],
                "work_clip": chosen_work["name"],
                "idle_b64": pil_to_b64(im_idle),
                "work_b64": pil_to_b64(im_work) if im_work is not None else pil_to_b64(im_idle),
            }
            preview_list.append((key, im_idle))

    # Composite 3 distinct Duplicants using head_swap + hair_swap + body_swap + body_comp_default
    out_dupes = []
    dupe_sources = []
    for bn in ["head_swap", "hair_swap", "body_swap", "body_comp_default"]:
        if bn in builds_parsed and (bn + "_0") in atlases_pil:
            dupe_sources.append((builds_parsed[bn], atlases_pil[bn + "_0"]))

    idle_clips = anims_parsed.get("anim_idle_happy", {})
    walk_clips = anims_parsed.get("anim_loco_walk", {})
    idle_clip = idle_clips.get("idle_default") or next((c for c in idle_clips.values() if c["frames"]), None)
    walk_clip = walk_clips.get("walk_loop") or next((c for c in walk_clips.values() if c["frames"]), None)

    if dupe_sources and idle_clip:
        # 3 authentic ONI Duplicant presets (민수 / 서연 / 지호)
        presets = [
            {
                "snapto_headshape": "headshape_001", "snapto_eyes": "eyes_001", "snapto_mouth": "mouth_001",
                "snapto_hair": "hair_001", "torso": "torso_001",
                "arm_sleeve": "arm_sleeve_001", "arm_lower_sleeve": "arm_lower_sleeve_001",
                "arm_upper": "arm_upper_001", "arm_lower": "arm_lower_001", "leg_skin": "leg_skin_001",
            },
            {
                "snapto_headshape": "headshape_002", "snapto_eyes": "eyes_003", "snapto_mouth": "mouth_002",
                "snapto_hair": "hair_005", "torso": "torso_002",
                "arm_sleeve": "arm_sleeve_002", "arm_lower_sleeve": "arm_lower_sleeve_002",
                "arm_upper": "arm_upper_002", "arm_lower": "arm_lower_002", "leg_skin": "leg_skin_002",
            },
            {
                "snapto_headshape": "headshape_003", "snapto_eyes": "eyes_005", "snapto_mouth": "mouth_003",
                "snapto_hair": "hair_009", "torso": "torso_003",
                "arm_sleeve": "arm_sleeve_003", "arm_lower_sleeve": "arm_lower_sleeve_003",
                "arm_upper": "arm_upper_003", "arm_lower": "arm_lower_003", "leg_skin": "leg_skin_003",
            },
            {
                "snapto_headshape": "headshape_004", "snapto_eyes": "eyes_002", "snapto_mouth": "mouth_004",
                "snapto_hair": "hair_011", "torso": "torso_004",
                "arm_sleeve": "arm_sleeve_004", "arm_lower_sleeve": "arm_lower_sleeve_004",
                "arm_upper": "arm_upper_004", "arm_lower": "arm_lower_004", "leg_skin": "leg_skin_004",
            },
            {
                "snapto_headshape": "headshape_001", "snapto_eyes": "eyes_004", "snapto_mouth": "mouth_005",
                "snapto_hair": "hair_015", "torso": "torso_005",
                "arm_sleeve": "arm_sleeve_005", "arm_lower_sleeve": "arm_lower_sleeve_005",
                "arm_upper": "arm_upper_005", "arm_lower": "arm_lower_005", "leg_skin": "leg_skin_005",
            },
            {
                "snapto_headshape": "headshape_002", "snapto_eyes": "eyes_001", "snapto_mouth": "mouth_006",
                "snapto_hair": "hair_020", "torso": "torso_006",
                "arm_sleeve": "arm_sleeve_006", "arm_lower_sleeve": "arm_lower_sleeve_006",
                "arm_upper": "arm_upper_006", "arm_lower": "arm_lower_006", "leg_skin": "leg_skin_006",
            },
        ]
        dupe_filter = ("snapto", "skirt", "necklace", "headfx", "hat", "goggles", "helmet", "backpack", "suit", "fx")
        for idx_p, swap_map in enumerate(presets):
            im_i = composite_kanim_frame(
                idle_clip["frames"][0],
                dupe_sources,
                out_size=80,
                filter_out_names=dupe_filter,
                symbol_swap=swap_map,
            )
            im_w0 = im_i
            im_w1 = im_i
            if walk_clip and len(walk_clip["frames"]) >= 4:
                wf = walk_clip["frames"]
                im_w0 = composite_kanim_frame(
                    wf[0], dupe_sources, out_size=80,
                    filter_out_names=dupe_filter,
                    symbol_swap=swap_map,
                ) or im_i
                im_w1 = composite_kanim_frame(
                    wf[len(wf) // 2], dupe_sources, out_size=80,
                    filter_out_names=dupe_filter,
                    symbol_swap=swap_map,
                ) or im_i
            if im_i is not None:
                out_dupes.append({
                    "id": idx_p,
                    "size": 80,
                    "idle_b64": pil_to_b64(im_i),
                    "walk0_b64": pil_to_b64(im_w0),
                    "walk1_b64": pil_to_b64(im_w1),
                })
                preview_list.append((f"dupe_{idx_p}", im_i))

        # Also composite authentic Atmo-Suit wearing Duplicant (atmosuit_basic_blue + head_swap + body_comp_default)
        suit_sources = []
        for bn in ["atmosuit_basic_blue", "head_swap", "hair_swap", "body_comp_default"]:
            if bn in builds_parsed and (bn + "_0") in atlases_pil:
                suit_sources.append((builds_parsed[bn], atlases_pil[bn + "_0"]))
        out_suit_dupe = {}
        if suit_sources and idle_clip:
            suit_swap = {
                "snapto_headshape": "headshape_001", "snapto_eyes": "eyes_001",
                "snapto_mouth": "mouth_001", "snapto_hair": "hair_001",
            }
            suit_filter = ("snapto", "skirt", "necklace", "headfx", "hat", "goggles", "fx")
            sim_i = composite_kanim_frame(idle_clip["frames"][0], suit_sources, out_size=84, filter_out_names=suit_filter, symbol_swap=suit_swap)
            sim_w0, sim_w1 = sim_i, sim_i
            if walk_clip and len(walk_clip["frames"]) >= 4:
                wf = walk_clip["frames"]
                sim_w0 = composite_kanim_frame(wf[0], suit_sources, out_size=84, filter_out_names=suit_filter, symbol_swap=suit_swap) or sim_i
                sim_w1 = composite_kanim_frame(wf[len(wf) // 2], suit_sources, out_size=84, filter_out_names=suit_filter, symbol_swap=suit_swap) or sim_i
            if sim_i is not None:
                out_suit_dupe = {
                    "size": 84,
                    "idle_b64": pil_to_b64(sim_i),
                    "walk0_b64": pil_to_b64(sim_w0),
                    "walk1_b64": pil_to_b64(sim_w1),
                }
                preview_list.append(("dupe_atmosuit", sim_i))

    doc = {
        "extracted_at_utc": datetime.now(timezone.utc).isoformat(),
        "building_sprites": out_buildings,
        "duplicant_sprites": out_dupes[:3],
    }
    os.makedirs(args.out, exist_ok=True)
    out_path = os.path.join(args.out, "kanim_sprites_extracted.txt")
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(doc, f, ensure_ascii=False, separators=(",", ":"))

    ext_doc = {
        "extracted_at_utc": datetime.now(timezone.utc).isoformat(),
        "building_sprites": out_buildings_ext,
    }
    ext_path = os.path.join(args.out, "kanim_sprites_ext_extracted.txt")
    with open(ext_path, "w", encoding="utf-8") as f:
        json.dump(ext_doc, f, ensure_ascii=False, separators=(",", ":"))

    ext2_doc = {
        "extracted_at_utc": datetime.now(timezone.utc).isoformat(),
        "building_sprites": out_buildings_ext2,
        "duplicant_sprites": out_dupes[3:],
    }
    ext2_path = os.path.join(args.out, "kanim_sprites_ext2_extracted.txt")
    with open(ext2_path, "w", encoding="utf-8") as f:
        json.dump(ext2_doc, f, ensure_ascii=False, separators=(",", ":"))

    ext3_doc = {
        "extracted_at_utc": datetime.now(timezone.utc).isoformat(),
        "building_sprites": out_buildings_ext3,
    }
    ext3_path = os.path.join(args.out, "kanim_sprites_ext3_extracted.txt")
    with open(ext3_path, "w", encoding="utf-8") as f:
        json.dump(ext3_doc, f, ensure_ascii=False, separators=(",", ":"))

    ext4_doc = {
        "extracted_at_utc": datetime.now(timezone.utc).isoformat(),
        "building_sprites": out_buildings_ext4,
    }
    ext4_path = os.path.join(args.out, "kanim_sprites_ext4_extracted.txt")
    with open(ext4_path, "w", encoding="utf-8") as f:
        json.dump(ext4_doc, f, ensure_ascii=False, separators=(",", ":"))

    ext5_doc = {
        "extracted_at_utc": datetime.now(timezone.utc).isoformat(),
        "building_sprites": out_buildings_ext5,
        "atmosuit_duplicant": out_suit_dupe if 'out_suit_dupe' in locals() else {},
    }
    ext5_path = os.path.join(args.out, "kanim_sprites_ext5_extracted.txt")
    with open(ext5_path, "w", encoding="utf-8") as f:
        json.dump(ext5_doc, f, ensure_ascii=False, separators=(",", ":"))

    # Build visual preview sheet
    if preview_list and args.preview:
        cols = 10
        rows = (len(preview_list) + cols - 1) // cols
        cell = 104
        sheet = Image.new("RGBA", (cols * cell, rows * cell), (22, 28, 36, 255))
        for i, (_nm, im) in enumerate(preview_list):
            r, c = divmod(i, cols)
            thumb = im.resize((96, 96), Image.Resampling.LANCZOS)
            sheet.paste(thumb, (c * cell + 4, r * cell + 4), thumb)
        os.makedirs(os.path.dirname(args.preview), exist_ok=True)
        sheet.save(args.preview)

    print(json.dumps({
        "buildings_composited_main": len(out_buildings),
        "buildings_composited_ext": len(out_buildings_ext),
        "buildings_composited_ext2": len(out_buildings_ext2),
        "buildings_composited_ext3": len(out_buildings_ext3),
        "buildings_composited_ext4": len(out_buildings_ext4),
        "buildings_composited_ext5": len(out_buildings_ext5),
        "ext5_keys": list(out_buildings_ext5.keys()),
        "atmosuit_composited": bool(ext5_doc["atmosuit_duplicant"]),
        "duplicants_composited": len(out_dupes),
        "main_file_bytes": os.path.getsize(out_path),
        "ext_file_bytes": os.path.getsize(ext_path),
        "ext2_file_bytes": os.path.getsize(ext2_path),
        "ext3_file_bytes": os.path.getsize(ext3_path),
        "ext4_file_bytes": os.path.getsize(ext4_path),
        "ext5_file_bytes": os.path.getsize(ext5_path),
    }, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
