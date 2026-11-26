#!/usr/bin/env python3
"""
Reverse-engineering media extractor for Oxygen Not Included (C:/Temp/Oxygen).
Extracts textures (Unity 6 v22 Texture2D DXT1/DXT5/RGBA32 -> 64x64 PNG base64),
KAnim skeletal meshes (BILD v10 / ANIM v5) & Unity Mesh metadata,
rendering materials/shaders/ParticleSystems/Sprites, and FMOD FSB5 sound banks
(catalog + real PCM16 SFX downsampled to 22050Hz mono int16 base64)
into PlayForge-syncable .txt JSON datasets under data/.
"""

import argparse
import base64
import io
import json
import os
import struct
import sys
from collections import Counter
from datetime import datetime, timezone

import numpy as np
from PIL import Image

# Element ID -> exact ONI Texture2D name in sharedassets0.assets
ELEMENT_TEXTURE_MAP = {
    "SandStone": "sand_stone",
    "Sand": "sand",
    "Dirt": "dirt",
    "Algae": "algae",
    "Cuprite": "cuprite",
    "Carbon": "carbon",
    "Ice": "ice",
    "DirtyIce": "dirty_ice",
    "Snow": "snow",
    "Granite": "granite",
    "IgneousRock": "igneous_rock",
    "Obsidian": "obsidian",
    "Katairite": "katairite",
    "SlimeMold": "slime_mold",
    "Clay": "clay",
    "GoldAmalgam": "gold_amalgam",
    "IronOre": "iron_oxide",
    "OxyRock": "oxyrocks",
    "BleachStone": "bleach_stone",
    "SedimentaryRock": "sedimentary_rock",
    "Wolframite": "wolframite",
    "Phosphorite": "phosphorite",
    "Salt": "salt",
    "Unobtanium": "neutronium",
}

BUILDING_TILE_TEX_MAP = {
    "tile": "tiles_solid",
    "insulated_tile": "tiles_insulated",
    "metal_tile": "tiles_metal",
}

FX_TEX_NAMES = [
    "liquid_surface_bubble_fx_0",
    "contact_dust_fx_0",
    "attack_beam_fx_0",
    "odor_fx_0",
    "building_upgrade_fx_0",
]

KANIM_TARGETS = [
    "mineraldeoxidizer",
    "electrolyzer",
    "generatormanual",
    "steamturbine2",
    "batterysm",
    "storagelocker",
    "research_center",
    "farmtile",
    "ladder",
    "body_comp_default",
    "head_swap",
    "dig_rock",
    "dig_ice",
    "dig_metal",
    "odor_fx",
]

# Key PCM16 (mode=2) real ONI sound effects to embed for WebAssembly playback
SFX_TARGETS = {
    "click": ("FX.bank", "SG_UI_click_small"),
    "drag": ("FX.bank", "SG_UI_dragTile_v02"),
    "place": ("UI.bank", "SG_UI_placeBuilding_shep_14_v02"),
    "build_done": ("Buildings.bank", "SG_UI_finishBuilding_small_07_v02"),
    "dig_done": ("DuplicantActions.bank", "lazerdrill_v02_LP"),
    "toggle": ("UI.bank", "SG_logic_building_toggle_ON_22_v03"),
}

FREQ_TABLE = {
    1: 8000, 2: 11000, 3: 11025, 4: 16000, 5: 22050,
    6: 24000, 7: 32000, 8: 44100, 9: 48000,
}


def read_cstr(f) -> str:
    b = bytearray()
    while True:
        c = f.read(1)
        if not c or c == b"\x00":
            break
        b.extend(c)
    return b.decode("utf-8", "replace")


def align4(f) -> None:
    p = f.tell()
    rem = p % 4
    if rem:
        f.seek(p + (4 - rem))


def rgb565_to_rgb888(c: np.ndarray) -> np.ndarray:
    r = ((c >> 11) & 0x1F).astype(np.uint16)
    g = ((c >> 5) & 0x3F).astype(np.uint16)
    b = (c & 0x1F).astype(np.uint16)
    r = ((r << 3) | (r >> 2)).astype(np.uint8)
    g = ((g << 2) | (g >> 4)).astype(np.uint8)
    b = ((b << 3) | (b >> 2)).astype(np.uint8)
    return np.stack([r, g, b], axis=-1)


def decode_dxt1(raw: bytes, w: int, h: int) -> np.ndarray:
    bw, bh = max(1, w // 4), max(1, h // 4)
    needed = bw * bh * 8
    arr = np.frombuffer(raw[:needed], dtype=np.uint8).reshape(bh, bw, 8)
    c0 = arr[:, :, 0].astype(np.uint16) | (arr[:, :, 1].astype(np.uint16) << 8)
    c1 = arr[:, :, 2].astype(np.uint16) | (arr[:, :, 3].astype(np.uint16) << 8)
    bits = (
        arr[:, :, 4].astype(np.uint32)
        | (arr[:, :, 5].astype(np.uint32) << 8)
        | (arr[:, :, 6].astype(np.uint32) << 16)
        | (arr[:, :, 7].astype(np.uint32) << 24)
    )
    rgb0 = rgb565_to_rgb888(c0).astype(np.uint16)
    rgb1 = rgb565_to_rgb888(c1).astype(np.uint16)
    gt = (c0 > c1)[:, :, None]
    rgb2 = np.where(gt, (2 * rgb0 + rgb1 + 1) // 3, (rgb0 + rgb1) // 2)
    rgb3 = np.where(gt, (rgb0 + 2 * rgb1 + 1) // 3, 0)
    palette = np.stack([rgb0, rgb1, rgb2, rgb3], axis=2).astype(np.uint8)  # (bh, bw, 4, 3)

    out = np.zeros((bh, bw, 16, 4), dtype=np.uint8)
    out[:, :, :, 3] = 255
    for p in range(16):
        idx = (bits >> (2 * p)) & 3
        iy = np.arange(bh)[:, None]
        ix = np.arange(bw)[None, :]
        out[:, :, p, :3] = palette[iy, ix, idx]
    return out.reshape(bh, bw, 4, 4, 4).transpose(0, 2, 1, 3, 4).reshape(bh * 4, bw * 4, 4)


def decode_dxt5(raw: bytes, w: int, h: int) -> np.ndarray:
    bw, bh = max(1, w // 4), max(1, h // 4)
    needed = bw * bh * 16
    arr = np.frombuffer(raw[:needed], dtype=np.uint8).reshape(bh, bw, 16)

    # Color part (bytes 8..16)
    c0 = arr[:, :, 8].astype(np.uint16) | (arr[:, :, 9].astype(np.uint16) << 8)
    c1 = arr[:, :, 10].astype(np.uint16) | (arr[:, :, 11].astype(np.uint16) << 8)
    bits = (
        arr[:, :, 12].astype(np.uint32)
        | (arr[:, :, 13].astype(np.uint32) << 8)
        | (arr[:, :, 14].astype(np.uint32) << 16)
        | (arr[:, :, 15].astype(np.uint32) << 24)
    )
    rgb0 = rgb565_to_rgb888(c0).astype(np.uint16)
    rgb1 = rgb565_to_rgb888(c1).astype(np.uint16)
    rgb2 = (2 * rgb0 + rgb1 + 1) // 3
    rgb3 = (rgb0 + 2 * rgb1 + 1) // 3
    palette = np.stack([rgb0, rgb1, rgb2, rgb3], axis=2).astype(np.uint8)

    # Alpha part (bytes 0..8)
    a0 = arr[:, :, 0].astype(np.uint16)
    a1 = arr[:, :, 1].astype(np.uint16)
    abits = np.zeros((bh, bw), dtype=np.uint64)
    for b_i in range(6):
        abits |= arr[:, :, 2 + b_i].astype(np.uint64) << (8 * b_i)

    gt = a0 > a1
    ap = np.zeros((bh, bw, 8), dtype=np.uint16)
    ap[:, :, 0] = a0
    ap[:, :, 1] = a1
    ap[:, :, 2] = np.where(gt, (6 * a0 + 1 * a1) // 7, (4 * a0 + 1 * a1) // 5)
    ap[:, :, 3] = np.where(gt, (5 * a0 + 2 * a1) // 7, (3 * a0 + 2 * a1) // 5)
    ap[:, :, 4] = np.where(gt, (4 * a0 + 3 * a1) // 7, (2 * a0 + 3 * a1) // 5)
    ap[:, :, 5] = np.where(gt, (3 * a0 + 4 * a1) // 7, (1 * a0 + 4 * a1) // 5)
    ap[:, :, 6] = np.where(gt, (2 * a0 + 5 * a1) // 7, 0)
    ap[:, :, 7] = np.where(gt, (1 * a0 + 6 * a1) // 7, 255)
    ap_u8 = ap.astype(np.uint8)

    out = np.zeros((bh, bw, 16, 4), dtype=np.uint8)
    iy = np.arange(bh)[:, None]
    ix = np.arange(bw)[None, :]
    for p in range(16):
        cidx = (bits >> (2 * p)) & 3
        aidx = ((abits >> np.uint64(3 * p)) & np.uint64(7)).astype(np.int64)
        out[:, :, p, :3] = palette[iy, ix, cidx]
        out[:, :, p, 3] = ap_u8[iy, ix, aidx]
    return out.reshape(bh, bw, 4, 4, 4).transpose(0, 2, 1, 3, 4).reshape(bh * 4, bw * 4, 4)


def parse_texture2d_entry(f, off: int, sz: int, data_dir: str):
    """Parse Unity 6000.3.5f2 Texture2D header & StreamingInfo."""
    f.seek(off)
    raw = f.read(sz)
    pos = 0
    nlen = struct.unpack_from("<i", raw, pos)[0]
    pos += 4
    name = raw[pos : pos + nlen].decode("utf-8", "replace")
    pos += nlen
    pos = (pos + 3) & ~3
    pos += 4  # m_ForcedFallbackFormat + flags
    w, h, img_sz, mips_s, fmt = struct.unpack_from("<iiiii", raw, pos)
    pos += 20
    # Find StreamingInfo path (ends with .resS) near the tail of the object
    ress_idx = raw.find(b".resS")
    pixels = None
    stream_path = ""
    if ress_idx > 0:
        # Walk back to find path length prefix
        for back in range(10, 64):
            cand = ress_idx + 5 - back
            if cand >= 16:
                plen = struct.unpack_from("<i", raw, cand - 4)[0]
                if plen == back:
                    stream_path = raw[cand : cand + plen].decode("ascii", "ignore")
                    s_off = struct.unpack_from("<Q", raw, cand - 16)[0]
                    s_sz = struct.unpack_from("<I", raw, cand - 8)[0]
                    rp = os.path.join(data_dir, stream_path)
                    if os.path.exists(rp) and s_sz > 0:
                        with open(rp, "rb") as rf:
                            rf.seek(s_off)
                            pixels = rf.read(s_sz)
                    break
    return {
        "name": name,
        "width": w,
        "height": h,
        "format": fmt,
        "image_size": img_sz,
        "stream_path": stream_path,
        "pixels": pixels,
    }


def decode_texture_to_png_b64(info: dict, target_size: int = 64, crop_mode: str = "none"):
    w, h, fmt, raw = info["width"], info["height"], info["format"], info["pixels"]
    if not raw or w <= 0 or h <= 0:
        return None
    if fmt == 10:
        rgba = decode_dxt1(raw, w, h)
    elif fmt == 12:
        rgba = decode_dxt5(raw, w, h)
    elif fmt == 4:
        rgba = np.frombuffer(raw[: w * h * 4], dtype=np.uint8).reshape(h, w, 4)
    else:
        return None
    rgba = np.flipud(rgba)
    img = Image.fromarray(rgba, mode="RGBA")
    if crop_mode == "terrain" and w >= 512 and h >= 512:
        img = img.crop((128, 128, 384, 384))
    elif crop_mode == "autotile" and w >= 512 and h >= 512:
        # Top-left single isolated tile cell from ONI 4x4 autotile sheet
        img = img.crop((16, 16, 224, 224))
    img = img.resize((target_size, target_size), Image.Resampling.LANCZOS)
    buf = io.BytesIO()
    img.save(buf, format="PNG", optimize=True)
    return base64.b64encode(buf.getvalue()).decode("ascii")


def parse_kanim_bild(raw: bytes) -> dict:
    """Parse Klei KAnim BILD v10 binary header, symbols, and UV bounds."""
    if len(raw) < 20 or raw[:4] != b"BILD":
        return {}
    pos = 4
    ver, sym_cnt, frame_cnt = struct.unpack_from("<iii", raw, pos)
    pos += 12
    nlen = struct.unpack_from("<i", raw, pos)[0]
    pos += 4
    bname = raw[pos : pos + nlen].decode("utf-8", "replace")
    pos += nlen
    symbols = []
    for _ in range(min(sym_cnt, 128)):
        if pos + 20 > len(raw):
            break
        shash, spath, scolor, sflags, nframes = struct.unpack_from("<iiiii", raw, pos)
        pos += 20
        frames = []
        for _ in range(min(nframes, 64)):
            if pos + 44 > len(raw):
                break
            src_num, dur, img_idx = struct.unpack_from("<iii", raw, pos)
            pos += 12
            px, py, pw, ph, u0, v0, u1, v1 = struct.unpack_from("<ffffffff", raw, pos)
            pos += 32
            frames.append({
                "src": src_num, "dur": dur,
                "pivot": [round(px, 2), round(py, 2)],
                "size": [round(pw, 2), round(ph, 2)],
                "uv": [round(u0, 4), round(v0, 4), round(u1, 4), round(v1, 4)],
            })
        symbols.append({"hash": shash, "frame_count": nframes, "first_frame": frames[0] if frames else None})
    return {
        "version": ver,
        "build_name": bname,
        "symbol_count": sym_cnt,
        "frame_count": frame_cnt,
        "symbols_preview": symbols[:12],
    }


def parse_kanim_anim(raw: bytes) -> dict:
    """Parse Klei KAnim ANIM v5 header and animation clip names (exact v5 layout)."""
    if len(raw) < 20 or raw[:4] != b"ANIM":
        return {}
    pos = 4
    ver, elem_cnt, frame_cnt, anim_cnt = struct.unpack_from("<iiii", raw, pos)
    pos += 16
    clips = []
    # Exact KAnim v5 layout: name(i32 len + bytes), root_hash(i32), fps(f32), num_frames(i32)
    # Per frame: bbox(4*f32=16B), num_elements(i32=4B), per element: 4*i32 + 10*f32 = 56B (or 48B)
    for _ in range(min(max(0, anim_cnt), 32)):
        if pos + 4 > len(raw):
            break
        nlen = struct.unpack_from("<i", raw, pos)[0]
        if not (0 < nlen < 128) or pos + 4 + nlen + 12 > len(raw):
            break
        pos += 4
        cname = raw[pos : pos + nlen].decode("utf-8", "replace")
        pos += nlen
        root_hash, fps, cf_cnt = struct.unpack_from("<ifi", raw, pos)
        pos += 12
        if not (0 <= cf_cnt <= 20000):
            break
        clips.append({"name": cname, "fps": round(fps, 1), "frames": cf_cnt})
        # Advance across frames (detect stride 48 vs 56 via next frame/clip sanity)
        ok = True
        for _ in range(cf_cnt):
            if pos + 20 > len(raw):
                ok = False
                break
            pos += 16
            nelems = struct.unpack_from("<i", raw, pos)[0]
            pos += 4
            if not (0 <= nelems <= 512) or pos + nelems * 48 > len(raw):
                ok = False
                break
            pos += nelems * 48
        if not ok:
            break
    return {
        "version": ver,
        "element_count": elem_cnt,
        "frame_count": frame_cnt,
        "anim_count": anim_cnt,
        "clips": clips[:16],
    }


def parse_unity_assets(data_dir: str):
    """Scan resources.assets, sharedassets0.assets, sharedassets2.assets."""
    needed_tex = set(ELEMENT_TEXTURE_MAP.values()) | set(BUILDING_TILE_TEX_MAP.values()) | set(FX_TEX_NAMES)
    needed_tex_lookup = {k.lower(): k for k in needed_tex}
    needed_kanim = set()
    for base in KANIM_TARGETS:
        needed_kanim.add(base + "_build")
        needed_kanim.add(base + "_anim")
        needed_kanim.add(base + "_a_anim")

    extracted_tex = {}
    extracted_kanim_builds = {}
    extracted_kanim_anims = {}

    inventory = {
        "textures_total": 0,
        "kanim_textassets_total": 0,
        "sprites_total": 0,
        "materials_total": 0,
        "shaders_total": 0,
        "meshes_total": 0,
        "particle_systems_total": 0,
        "texture_formats": Counter(),
        "material_samples": [],
        "sprite_fx_samples": [],
    }

    for fname in ["resources.assets", "sharedassets0.assets", "sharedassets2.assets"]:
        apath = os.path.join(data_dir, fname)
        if not os.path.exists(apath):
            continue
        with open(apath, "rb") as f:
            hdr = f.read(48)
            file_sz, data_off, unk = struct.unpack(">QQQ", hdr[24:48])
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
                if cid == 28:
                    inventory["textures_total"] += 1
                    f.seek(off)
                    nlen = struct.unpack("<i", f.read(4))[0]
                    if 0 < nlen < 200:
                        name = f.read(nlen).decode("utf-8", "replace")
                        align4(f)
                        f.read(4)
                        w, h, _isz, _ms, fmt = struct.unpack("<iiiii", f.read(20))
                        inventory["texture_formats"][str(fmt)] += 1
                        if name.lower() in needed_tex_lookup and name not in extracted_tex:
                            tinfo = parse_texture2d_entry(f, off, sz, data_dir)
                            cmode = "terrain" if name in ELEMENT_TEXTURE_MAP.values() else ("autotile" if name in BUILDING_TILE_TEX_MAP.values() else "none")
                            b64 = decode_texture_to_png_b64(tinfo, target_size=64, crop_mode=cmode)
                            if b64:
                                extracted_tex[name] = {
                                    "orig_w": w,
                                    "orig_h": h,
                                    "unity_format": fmt,
                                    "size": 64,
                                    "png_b64": b64,
                                }
                elif cid == 49:
                    inventory["kanim_textassets_total"] += 1
                    f.seek(off)
                    nlen = struct.unpack("<i", f.read(4))[0]
                    if 0 < nlen < 200:
                        name = f.read(nlen).decode("utf-8", "replace")
                        if name in needed_kanim:
                            align4(f)
                            slen = struct.unpack("<i", f.read(4))[0]
                            blob = f.read(min(slen, 262144))
                            if blob[:4] == b"BILD":
                                extracted_kanim_builds[name] = parse_kanim_bild(blob)
                            elif blob[:4] == b"ANIM":
                                extracted_kanim_anims[name] = parse_kanim_anim(blob)
                elif cid == 213:
                    inventory["sprites_total"] += 1
                    if len(inventory["sprite_fx_samples"]) < 40:
                        f.seek(off)
                        nlen = struct.unpack("<i", f.read(4))[0]
                        if 0 < nlen < 120:
                            nm = f.read(nlen).decode("utf-8", "replace")
                            if any(w in nm.lower() for w in ["fx", "smoke", "spark", "bubble", "beam", "icon", "overlay", "gas", "water"]):
                                inventory["sprite_fx_samples"].append(nm)
                elif cid == 21:
                    inventory["materials_total"] += 1
                    if len(inventory["material_samples"]) < 50:
                        f.seek(off)
                        nlen = struct.unpack("<i", f.read(4))[0]
                        if 0 < nlen < 120:
                            inventory["material_samples"].append(f.read(nlen).decode("utf-8", "replace"))
                elif cid == 48:
                    inventory["shaders_total"] += 1
                elif cid == 43:
                    inventory["meshes_total"] += 1
                elif cid == 198:
                    inventory["particle_systems_total"] += 1

    inventory["texture_formats"] = dict(inventory["texture_formats"])
    return extracted_tex, extracted_kanim_builds, extracted_kanim_anims, inventory


def extract_fmod_banks(streaming_dir: str) -> dict:
    """Scan all FMOD .bank files, build full FSB5 catalog, and extract real PCM16 SFX."""
    bank_files = [
        "FX.bank", "UI.bank", "Buildings.bank", "DuplicantActions.bank",
        "DuplicantVoices.bank", "Environment.bank", "Ambiences.bank", "Music.bank",
    ]
    target_by_bank = {}
    for key, (bf, sname) in SFX_TARGETS.items():
        target_by_bank.setdefault(bf, {})[sname] = key

    catalog = {}
    total_samples = 0
    total_pcm16 = 0
    total_vorbis = 0
    sfx_embedded = {}

    for bf in bank_files:
        bp = os.path.join(streaming_dir, bf)
        if not os.path.exists(bp):
            continue
        raw = open(bp, "rb").read()
        pos = 0
        bank_entries = []
        while True:
            idx = raw.find(b"FSB5", pos)
            if idx < 0:
                break
            ver, n, shdr_sz, name_sz, data_sz, mode = struct.unpack("<IIIIII", raw[idx + 4 : idx + 28])
            total_samples += n
            if mode == 2:
                total_pcm16 += n
            elif mode == 15:
                total_vorbis += n
            hdr_len = 60 if ver == 1 else 64
            sh_pos = idx + hdr_len
            name_off = idx + hdr_len + shdr_sz
            data_off = name_off + name_sz

            sample_names = []
            want_map = target_by_bank.get(bf, {})
            for k in range(n):
                hdr64 = struct.unpack("<Q", raw[sh_pos : sh_pos + 8])[0]
                sh_pos += 8
                has_chunks = hdr64 & 1
                freq_idx = (hdr64 >> 1) & 0xF
                ch = 2 if ((hdr64 >> 5) & 1) else 1
                off_val = ((hdr64 >> 6) & 0xFFFFFFF) * 16
                nsamples = (hdr64 >> 34) & 0x3FFFFFFF
                freq = FREQ_TABLE.get(freq_idx, 48000)
                while has_chunks:
                    c32 = struct.unpack("<I", raw[sh_pos : sh_pos + 4])[0]
                    sh_pos += 4
                    has_chunks = c32 & 1
                    csize = (c32 >> 1) & 0xFFFFFF
                    ctype = (c32 >> 25) & 0x7F
                    if ctype == 1:
                        ch = raw[sh_pos]
                    elif ctype == 2:
                        freq = struct.unpack("<I", raw[sh_pos : sh_pos + 4])[0]
                    sh_pos += csize

                sname = f"sample_{k}"
                if name_sz > 0:
                    rel = struct.unpack("<I", raw[name_off + k * 4 : name_off + k * 4 + 4])[0]
                    s0 = name_off + rel
                    s1 = raw.find(b"\x00", s0)
                    sname = raw[s0:s1].decode("utf-8", "replace")
                if len(sample_names) < 12:
                    sample_names.append(sname)

                if mode == 2 and sname in want_map:
                    out_key = want_map[sname]
                    byte_len = nsamples * ch * 2
                    pcm_bytes = raw[data_off + off_val : data_off + off_val + byte_len]
                    arr = np.frombuffer(pcm_bytes, dtype=np.int16)
                    if ch > 1:
                        arr = arr.reshape(-1, ch).mean(axis=1).astype(np.int16)
                    # Cap duration to 0.28s and downsample to 16000Hz mono for crisp lightweight WebAssembly SFX
                    target_hz = 16000
                    max_src = min(len(arr), int(freq * 0.28))
                    arr = arr[:max_src]
                    new_len = max(1, int(len(arr) * target_hz / freq))
                    xs = np.linspace(0, len(arr) - 1, new_len)
                    ds = np.interp(xs, np.arange(len(arr)), arr.astype(np.float32)).astype(np.int16)
                    sfx_embedded[out_key] = {
                        "source_bank": bf,
                        "source_name": sname,
                        "orig_hz": freq,
                        "orig_channels": ch,
                        "mix_rate": target_hz,
                        "samples": len(ds),
                        "pcm16_b64": base64.b64encode(ds.tobytes()).decode("ascii"),
                    }

            bank_entries.append({
                "mode": "PCM16" if mode == 2 else ("Vorbis" if mode == 15 else f"mode_{mode}"),
                "sample_count": n,
                "data_bytes": data_sz,
                "preview_names": sample_names,
            })
            pos = idx + 4
        catalog[bf] = bank_entries

    return {
        "total_banks": len(catalog),
        "total_samples": total_samples,
        "pcm16_samples": total_pcm16,
        "vorbis_samples": total_vorbis,
        "banks": catalog,
        "sfx_pcm16": sfx_embedded,
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
    os.makedirs(args.out, exist_ok=True)

    extracted_tex, kanim_builds, kanim_anims, render_inv = parse_unity_assets(data_dir)
    audio_data = extract_fmod_banks(streaming_dir)

    # Assemble textures dataset mapped by Element ID / Building ID / FX name
    textures_doc = {
        "extracted_at_utc": datetime.now(timezone.utc).isoformat(),
        "element_textures": {
            el: extracted_tex[tname]
            for el, tname in ELEMENT_TEXTURE_MAP.items()
            if tname in extracted_tex
        },
        "building_textures": {
            bid: extracted_tex[tname]
            for bid, tname in BUILDING_TILE_TEX_MAP.items()
            if tname in extracted_tex
        },
        "fx_textures": {
            fn: extracted_tex[fn]
            for fn in FX_TEX_NAMES
            if fn in extracted_tex
        },
    }

    kanim_doc = {
        "extracted_at_utc": datetime.now(timezone.utc).isoformat(),
        "total_kanim_assets_scanned": render_inv["kanim_textassets_total"],
        "unity_meshes_scanned": render_inv["meshes_total"],
        "builds": kanim_builds,
        "anims": kanim_anims,
    }

    rendering_doc = {
        "extracted_at_utc": datetime.now(timezone.utc).isoformat(),
        "inventory": render_inv,
    }

    def write_txt(name: str, obj: dict) -> int:
        p = os.path.join(args.out, name)
        with open(p, "w", encoding="utf-8") as f:
            json.dump(obj, f, ensure_ascii=False, separators=(",", ":"))
        return os.path.getsize(p)

    sz_tex = write_txt("textures_extracted.txt", textures_doc)
    sz_kanim = write_txt("kanim_meshes_extracted.txt", kanim_doc)
    sz_render = write_txt("rendering_fx_extracted.txt", rendering_doc)
    sz_audio = write_txt("audio_extracted.txt", audio_data)

    summary = {
        "textures_embedded": {
            "elements": len(textures_doc["element_textures"]),
            "buildings": len(textures_doc["building_textures"]),
            "fx": len(textures_doc["fx_textures"]),
            "file_bytes": sz_tex,
        },
        "kanim_meshes": {
            "builds_parsed": len(kanim_builds),
            "anims_parsed": len(kanim_anims),
            "total_kanim_assets": render_inv["kanim_textassets_total"],
            "file_bytes": sz_kanim,
        },
        "rendering_inventory": {
            "textures_total": render_inv["textures_total"],
            "sprites_total": render_inv["sprites_total"],
            "materials_total": render_inv["materials_total"],
            "shaders_total": render_inv["shaders_total"],
            "particle_systems_total": render_inv["particle_systems_total"],
            "file_bytes": sz_render,
        },
        "audio_fmod": {
            "total_banks": audio_data["total_banks"],
            "total_samples": audio_data["total_samples"],
            "pcm16_samples": audio_data["pcm16_samples"],
            "vorbis_samples": audio_data["vorbis_samples"],
            "sfx_embedded": list(audio_data["sfx_pcm16"].keys()),
            "file_bytes": sz_audio,
        },
    }
    print(json.dumps(summary, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
