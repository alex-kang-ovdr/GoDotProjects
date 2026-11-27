#!/usr/bin/env python3
"""
Don't Starve Together (DST) 로컬 설치본 에셋 전수 추출기 & KAnim 2D 아핀 컴포지터.
대상: C:\\Program Files (x86)\\Steam\\steamapps\\common\\Don't Starve Together\\data

산출물:
1) forge/Templates/dont-starve-together/data/
   - dst_textures_extracted.txt       (원작 지형 타일 8종 + 초상화 6종 + 인벤토리/제작/요리 아이콘 32종 PNG base64)
   - dst_kanim_sprites_extracted.txt  (원작 BILD v6 + ANIM v4 아핀 조립 스프라이트 21종 투명 PNG base64)
   - dst_audio_extracted.txt          (FMOD FSB5 155개 뱅크 20,891샘플 인벤토리 + 실제 원작 PCM16 SFX 10종)
   - dst_shaders_extracted.txt        (shaders.zip 70종 .ksh 셰이더 목록 + 핵심 GLSL 소스)
   - extraction_manifest.json         (빌드 식별·추출 수량·검증 통계)
2) forge/Templates/dont-starve-together/extracted_assets/ (로컬 파일 탐색/미리보기용 실제 PNG/GLSL/WAV)
"""

import argparse
import base64
import io
import json
import os
import re
import struct
import wave
import xml.etree.ElementTree as ET
import zipfile
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
from PIL import Image

DST_ROOT_DEFAULT = Path(r"C:\Program Files (x86)\Steam\steamapps\common\Don't Starve Together")
TEMPLATE_ROOT = Path(__file__).resolve().parent.parent
DATA_OUT = TEMPLATE_ROOT / "data"
FILES_OUT = TEMPLATE_ROOT / "extracted_assets"

FREQ_TABLE = {
    1: 8000, 2: 11000, 3: 11025, 4: 16000, 5: 22050,
    6: 24000, 7: 32000, 8: 44100, 9: 48000,
}


# ---------------------------------------------------------------------------
# 1. KTEX / DXT1 / DXT3 / DXT5 Vector Decoder
# ---------------------------------------------------------------------------

def rgb565_to_rgb888(c: np.ndarray) -> np.ndarray:
    r = ((c >> 11) & 0x1F).astype(np.uint16)
    g = ((c >> 5) & 0x3F).astype(np.uint16)
    b = (c & 0x1F).astype(np.uint16)
    r = ((r << 3) | (r >> 2)).astype(np.uint8)
    g = ((g << 2) | (g >> 4)).astype(np.uint8)
    b = ((b << 3) | (b >> 2)).astype(np.uint8)
    return np.stack([r, g, b], axis=-1)


def decode_dxt1(raw: bytes, w: int, h: int) -> np.ndarray:
    bw, bh = max(1, (w + 3) // 4), max(1, (h + 3) // 4)
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
    palette = np.stack([rgb0, rgb1, rgb2, rgb3], axis=2).astype(np.uint8)

    out = np.zeros((bh, bw, 16, 4), dtype=np.uint8)
    out[:, :, :, 3] = 255
    iy = np.arange(bh)[:, None]
    ix = np.arange(bw)[None, :]
    for p in range(16):
        idx = (bits >> (2 * p)) & 3
        out[:, :, p, :3] = palette[iy, ix, idx]
        out[:, :, p, 3] = np.where((~gt[:, :, 0]) & (idx == 3), 0, 255)
    return out.reshape(bh, bw, 4, 4, 4).transpose(0, 2, 1, 3, 4).reshape(bh * 4, bw * 4, 4)[:h, :w]


def decode_dxt5(raw: bytes, w: int, h: int) -> np.ndarray:
    bw, bh = max(1, (w + 3) // 4), max(1, (h + 3) // 4)
    needed = bw * bh * 16
    arr = np.frombuffer(raw[:needed], dtype=np.uint8).reshape(bh, bw, 16)

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

    a0 = arr[:, :, 0].astype(np.uint16)
    a1 = arr[:, :, 1].astype(np.uint16)
    abits = np.zeros((bh, bw), dtype=np.uint64)
    for bi in range(6):
        abits |= arr[:, :, 2 + bi].astype(np.uint64) << (8 * bi)

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
    return out.reshape(bh, bw, 4, 4, 4).transpose(0, 2, 1, 3, 4).reshape(bh * 4, bw * 4, 4)[:h, :w]


def decode_ktex(raw: bytes, flip_y: bool = True) -> Image.Image:
    """Decode Klei KTEX (.tex) mip0 into RGBA PIL Image."""
    if len(raw) < 18 or raw[:4] != b"KTEX":
        raise ValueError("Invalid KTEX magic")
    header = struct.unpack_from("<I", raw, 4)[0]
    pfmt = (header >> 4) & 0x1F
    mips = (header >> 13) & 0x1F
    w, h, pitch, dsz = struct.unpack_from("<HHHI", raw, 8)
    data_off = 8 + mips * 10
    pix = raw[data_off : data_off + dsz]
    if pfmt == 0:
        rgba = decode_dxt1(pix, w, h)
    elif pfmt == 2:
        rgba = decode_dxt5(pix, w, h)
    elif pfmt == 4:
        rgba = np.frombuffer(pix[: w * h * 4], dtype=np.uint8).reshape(h, w, 4)
    else:
        # Fallback try DXT5 if block size matches
        rgba = decode_dxt5(pix, w, h)
    if flip_y:
        rgba = np.flipud(rgba)
    return Image.fromarray(rgba, mode="RGBA")


def pil_to_png_b64(im: Image.Image) -> str:
    buf = io.BytesIO()
    im.save(buf, format="PNG", optimize=True)
    return base64.b64encode(buf.getvalue()).decode("ascii")


def save_png(im: Image.Image, path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    im.save(path, format="PNG", optimize=True)


# ---------------------------------------------------------------------------
# 2. DST BILD v6 & ANIM v4 Parser + 2D Affine Compositor
# ---------------------------------------------------------------------------

def parse_bild_v6(raw: bytes) -> dict:
    if len(raw) < 20 or raw[:4] != b"BILD":
        return {}
    ver, scnt, fcnt = struct.unpack_from("<iii", raw, 4)
    pos = 16
    nlen = struct.unpack_from("<i", raw, pos)[0]; pos += 4
    bname = raw[pos : pos + nlen].decode("utf-8", "replace"); pos += nlen
    acnt = struct.unpack_from("<i", raw, pos)[0]; pos += 4
    atlases = []
    for _ in range(acnt):
        al = struct.unpack_from("<i", raw, pos)[0]; pos += 4
        atlases.append(raw[pos : pos + al].decode("utf-8", "replace")); pos += al

    sym_list = []
    for _ in range(scnt):
        sh, nf = struct.unpack_from("<Ii", raw, pos); pos += 8
        frames = []
        for _ in range(nf):
            fnum, dur, px, py, pw, ph, vb_start, vb_cnt = struct.unpack_from("<iiffffii", raw, pos)
            pos += 32
            frames.append({
                "fnum": fnum, "dur": max(1, dur),
                "px": px, "py": py, "pw": pw, "ph": ph,
                "vb_start": vb_start, "vb_cnt": vb_cnt,
            })
        sym_list.append((sh, frames))

    vcnt = struct.unpack_from("<i", raw, pos)[0]; pos += 4
    verts = np.frombuffer(raw[pos : pos + vcnt * 24], dtype="<f4").reshape(vcnt, 6)
    pos += vcnt * 24

    hash_names = {}
    if pos + 4 <= len(raw):
        hcnt = struct.unpack_from("<i", raw, pos)[0]; pos += 4
        for _ in range(max(0, min(hcnt, 4000))):
            if pos + 8 > len(raw):
                break
            hv, sl = struct.unpack_from("<Ii", raw, pos); pos += 8
            if 0 <= sl < 256 and pos + sl <= len(raw):
                hash_names[hv] = raw[pos : pos + sl].decode("utf-8", "replace")
                pos += sl
            else:
                break

    symbols = {}
    for sh, frames in sym_list:
        for fr in frames:
            vs, vc = fr["vb_start"], fr["vb_cnt"]
            if vc > 0 and vs + vc <= vcnt:
                vslice = verts[vs : vs + vc]
                # verts columns: x, y, z, u, v, w (OpenGL bottom-left UV)
                fr["u0"] = float(vslice[:, 3].min())
                fr["u1"] = float(vslice[:, 3].max())
                fr["v0"] = float(vslice[:, 4].min())
                fr["v1"] = float(vslice[:, 4].max())
                fr["atlas_idx"] = int(round(float(vslice[0, 5])))
            else:
                fr["u0"] = fr["u1"] = fr["v0"] = fr["v1"] = 0.0
                fr["atlas_idx"] = 0
        symbols[sh] = {"hash": sh, "name": hash_names.get(sh, f"0x{sh:08x}"), "frames": frames}

    return {"name": bname, "version": ver, "atlases": atlases, "symbols": symbols, "hash_names": hash_names}


def parse_anim_v4(raw: bytes) -> dict:
    if len(raw) < 24 or raw[:4] != b"ANIM":
        return {}
    ver, ecnt, fcnt, evcnt, acnt = struct.unpack_from("<iiiii", raw, 4)
    pos = 24
    clips = {}
    for _ in range(acnt):
        if pos + 4 > len(raw):
            break
        nl = struct.unpack_from("<i", raw, pos)[0]; pos += 4
        aname = raw[pos : pos + nl].decode("utf-8", "replace"); pos += nl
        facing, bhash, fps, nf = struct.unpack_from("<BIfi", raw, pos); pos += 13
        frames = []
        for _ in range(nf):
            bx, by, bw, bh, nev = struct.unpack_from("<ffffi", raw, pos); pos += 20
            pos += nev * 4
            nel = struct.unpack_from("<i", raw, pos)[0]; pos += 4
            elems = []
            for _ in range(nel):
                sh, fnum, fhash = struct.unpack_from("<IiI", raw, pos)
                ma, mb, mc, md, mtx, mty, mz = struct.unpack_from("<7f", raw, pos + 12)
                pos += 40
                elems.append({
                    "sym": sh, "frame": fnum, "folder": fhash,
                    "mat": (ma, mb, mc, md, mtx, mty), "z": mz,
                })
            frames.append({"bbox": (bx, by, bw, bh), "elems": elems})
        key = f"{aname}__f{facing}"
        clips[key] = {"name": aname, "facing": facing, "fps": fps, "frames": frames}
        if aname not in clips or facing in (8, 255, 1, 4):
            clips[aname] = clips[key]
    return clips


def load_anim_zip(anim_dir: Path, zname: str) -> dict:
    zp = anim_dir / zname
    if not zp.exists():
        return {}
    out = {"bild": None, "anims": None, "atlases": []}
    with zipfile.ZipFile(zp) as z:
        nl = set(z.namelist())
        if "build.bin" in nl:
            out["bild"] = parse_bild_v6(z.read("build.bin"))
            for aname in out["bild"].get("atlases", []):
                if aname in nl:
                    # Keep flip_y=True -> standard PIL top-down image; OpenGL v=0 is bottom so flip v -> 1-v when cropping
                    out["atlases"].append(decode_ktex(z.read(aname), flip_y=True))
                else:
                    out["atlases"].append(None)
        if "anim.bin" in nl:
            out["anims"] = parse_anim_v4(z.read("anim.bin"))
    return out


def find_bild_frame(sym_frames: list, fnum: int):
    for fr in sym_frames:
        if fr["fnum"] <= fnum < fr["fnum"] + fr["dur"]:
            return fr
    return sym_frames[min(len(sym_frames) - 1, max(0, fnum))] if sym_frames else None


def composite_dst_frame(frame: dict, build_sources: list, out_size: int = 128, skip_names: tuple = ("shadow", "fx_glow", "swap_")) -> Image.Image:
    elems = frame.get("elems", [])
    if not elems:
        return None

    parts = []
    min_x, min_y = 1e9, 1e9
    max_x, max_y = -1e9, -1e9

    # Painter's algorithm: ANIM stores front-to-back, draw reversed (back-to-front)
    for el in reversed(elems):
        sh = el["sym"]
        fnum = el["frame"]
        matched_sym = None
        matched_atlases = None
        for bsrc in build_sources:
            bild = bsrc.get("bild")
            if bild and sh in bild["symbols"]:
                matched_sym = bild["symbols"][sh]
                matched_atlases = bsrc.get("atlases", [])
                break
        if not matched_sym:
            continue
        sname = matched_sym["name"].lower()
        if any(bad in sname for bad in skip_names):
            continue
        sfr = find_bild_frame(matched_sym["frames"], fnum)
        if not sfr or sfr["pw"] <= 1.0 or sfr["ph"] <= 1.0:
            continue
        aidx = sfr["atlas_idx"]
        if aidx >= len(matched_atlases) or matched_atlases[aidx] is None:
            continue
        atlas = matched_atlases[aidx]
        aw, ah = atlas.size
        # Crop from top-down PIL image (OpenGL v=0 bottom -> pil_y = (1 - v) * ah)
        cx0 = max(0, int(round(sfr["u0"] * aw)))
        cx1 = min(aw, int(round(sfr["u1"] * aw)))
        cy0 = max(0, int(round((1.0 - sfr["v1"]) * ah)))
        cy1 = min(ah, int(round((1.0 - sfr["v0"]) * ah)))
        if cx1 - cx0 < 2 or cy1 - cy0 < 2:
            continue

        ma, mb, mc, md, mtx, mty = el["mat"]
        # DST BILD local rect centered at (px, py) with size (pw, ph)
        x0 = sfr["px"] - sfr["pw"] * 0.5
        x1 = sfr["px"] + sfr["pw"] * 0.5
        y0 = sfr["py"] - sfr["ph"] * 0.5
        y1 = sfr["py"] + sfr["ph"] * 0.5
        corners = []
        for lx, ly in [(x0, y0), (x1, y0), (x1, y1), (x0, y1)]:
            wx = ma * lx + mc * ly + mtx
            wy = mb * lx + md * ly + mty
            corners.append((wx, wy))
            min_x = min(min_x, wx); max_x = max(max_x, wx)
            min_y = min(min_y, wy); max_y = max(max_y, wy)

        parts.append((atlas.crop((cx0, cy0, cx1, cy1)), (x0, y0, x1, y1), (ma, mb, mc, md, mtx, mty)))

    if not parts or max_x <= min_x or max_y <= min_y:
        return None

    bw = max_x - min_x
    bh = max_y - min_y
    pad = 4
    scale = (out_size - pad * 2) / max(bw, bh)
    w_out = max(16, int(round(bw * scale)) + pad * 2)
    h_out = max(16, int(round(bh * scale)) + pad * 2)
    canvas = Image.new("RGBA", (out_size, out_size), (0, 0, 0, 0))
    ox = (out_size - w_out) * 0.5 + pad - min_x * scale
    oy = (out_size - h_out) * 0.5 + pad - min_y * scale

    for crop_im, (x0, y0, x1, y1), (ma, mb, mc, md, mtx, mty) in parts:
        cw, ch = crop_im.size
        # Map destination canvas pixel (dx, dy) -> world (wx, wy) -> local (lx, ly) -> crop pixel (sx, sy)
        # Forward: [wx, wy]^T = [[ma, mc], [mb, md]] * [lx, ly]^T + [mtx, mty]^T
        # Forward canvas: dx = wx * scale + ox, dy = wy * scale + oy
        # Combine: M_total = scale * [[ma, mc], [mb, md]] * diag((x1-x0)/cw, (y1-y0)/ch)
        sx_scale = (x1 - x0) / float(cw)
        sy_scale = (y1 - y0) / float(ch)
        A = np.array([
            [scale * ma * sx_scale, scale * mc * sy_scale, scale * (ma * x0 + mc * y0 + mtx) + ox],
            [scale * mb * sx_scale, scale * md * sy_scale, scale * (mb * x0 + md * y0 + mty) + oy],
            [0.0, 0.0, 1.0],
        ], dtype=np.float64)
        det = A[0, 0] * A[1, 1] - A[0, 1] * A[1, 0]
        if abs(det) < 1e-6:
            continue
        invA = np.linalg.inv(A)
        coeffs = (invA[0, 0], invA[0, 1], invA[0, 2], invA[1, 0], invA[1, 1], invA[1, 2])
        warped = crop_im.transform((out_size, out_size), Image.Transform.AFFINE, coeffs, resample=Image.Resampling.BILINEAR)
        canvas = Image.alpha_composite(canvas, warped)

    return canvas


def pick_clip(anims: dict, preferred: list):
    if not anims:
        return None
    # DST ANIM v4 facing bitmask: 8 = DOWN (front), 255 = ALL, 1 = RIGHT, 4 = LEFT, 2 = UP (back)
    for pref in preferred:
        for f in (8, 255, 1, 4, 0, 2):
            k = f"{pref}__f{f}"
            if k in anims and anims[k]["frames"]:
                return anims[k]
        if pref in anims and anims[pref]["frames"]:
            return anims[pref]
    # Substring fallback (prefer front/side facing)
    for pref in preferred:
        for f in (8, 255, 1, 4):
            for k, v in anims.items():
                if pref in v["name"].lower() and v["facing"] == f and v["frames"]:
                    return v
        for k, v in anims.items():
            if pref in v["name"].lower() and v["frames"]:
                return v
    for v in anims.values():
        if v["frames"]:
            return v
    return None


# ---------------------------------------------------------------------------
# 3. FMOD FSB5 Scanner & PCM16 SFX Extractor
# ---------------------------------------------------------------------------

def extract_fmod_fsb5(sound_dir: Path) -> tuple:
    fsb_files = sorted(f for f in os.listdir(sound_dir) if f.lower().endswith(".fsb"))
    bank_catalog = []
    total_samples = 0
    pcm16_samples = 0
    mode_counts = {}
    extracted_sfx = {}

    # Target keywords for core DST SFX from PCM16 banks
    sfx_keywords = {
        "ui_click": ["click", "button", "select", "ui", "tick", "menu"],
        "craft": ["craft", "build", "hammer", "place", "anvil", "forge"],
        "gather": ["chop", "mine", "pick", "dig", "wood", "rock", "grass"],
        "attack": ["swing", "whoosh", "hit", "slash", "attack", "swipe"],
        "hurt": ["hurt", "impact", "damage", "pain", "thud", "crunch"],
        "eat": ["eat", "chomp", "bite", "cook", "boil", "sizzle"],
        "fire": ["fire", "burn", "flame", "torch", "ignite", "ember"],
        "boss_roar": ["roar", "scream", "growl", "stomp", "boss", "grunt"],
        "magic": ["magic", "lunar", "shadow", "rift", "portal", "spell"],
        "ghost": ["ghost", "haunt", "revive", "soul", "whisper"],
    }

    for sf in fsb_files:
        fp = sound_dir / sf
        raw = fp.read_bytes()
        if len(raw) < 60 or raw[:4] != b"FSB5":
            continue
        ver, nsamples, shsz, ntsz, dsz, mode = struct.unpack_from("<6I", raw, 4)
        total_samples += nsamples
        mode_counts[str(mode)] = mode_counts.get(str(mode), 0) + nsamples
        if mode == 2:
            pcm16_samples += nsamples
        bank_catalog.append({
            "bank": sf, "samples": nsamples, "mode": mode, "size_bytes": len(raw),
        })

        # Parse PCM16 (mode == 2) sample headers & name table
        if mode != 2 or nsamples == 0:
            continue
        hdr_size = 60 if ver == 1 else 64
        sh_off = hdr_size
        nt_off = sh_off + shsz
        data_off = nt_off + ntsz

        # Parse sample headers
        s_entries = []
        pos = sh_off
        for i in range(nsamples):
            if pos + 8 > nt_off:
                break
            val = struct.unpack_from("<Q", raw, pos)[0]
            pos += 8
            has_next = val & 1
            freq_idx = (val >> 1) & 0xF
            ch = 2 if ((val >> 5) & 1) else 1
            data_rel = ((val >> 7) & 0x7FFFFFF) * 16
            sample_len = (val >> 34) & 0x3FFFFFFF
            freq = FREQ_TABLE.get(freq_idx, 22050)
            while has_next and pos + 4 <= nt_off:
                chdr = struct.unpack_from("<I", raw, pos)[0]
                pos += 4
                has_next = chdr & 1
                csz = (chdr >> 1) & 0xFFFFFF
                ctype = (chdr >> 25) & 0x7F
                if ctype == 4 and csz >= 4 and pos + 4 <= nt_off:
                    freq = struct.unpack_from("<I", raw, pos)[0]
                pos += csz
            s_entries.append((data_rel, sample_len, freq, ch))

        # Parse sample names
        names = []
        if ntsz >= nsamples * 4:
            for i in range(nsamples):
                rel = struct.unpack_from("<I", raw, nt_off + i * 4)[0]
                npos = nt_off + rel
                end = raw.find(b"\x00", npos, data_off)
                nm = raw[npos:end].decode("utf-8", "replace") if end != -1 else f"sample_{i}"
                names.append(nm)
        else:
            names = [f"{sf}_{i}" for i in range(len(s_entries))]

        # Match needed SFX keys
        for idx, (drel, slen, freq, ch) in enumerate(s_entries):
            if len(extracted_sfx) >= len(sfx_keywords):
                break
            nm_l = names[idx].lower()
            for sfx_key, kws in sfx_keywords.items():
                if sfx_key in extracted_sfx:
                    continue
                if any(kw in nm_l for kw in kws):
                    byte_len = slen * ch * 2
                    start = data_off + drel
                    if start + byte_len > len(raw) or slen < 800 or slen > freq * 2.5:
                        continue
                    pcm = np.frombuffer(raw[start : start + byte_len], dtype="<i2")
                    if ch == 2:
                        pcm = pcm.reshape(-1, 2).mean(axis=1).astype("<i2")
                    # Downsample to ~11025 Hz & cap at 0.85s for lightweight WebAssembly embedding
                    step = max(1, int(round(freq / 11025.0)))
                    pcm_ds = pcm[::step]
                    out_rate = max(8000, freq // step)
                    max_frames = int(out_rate * 0.85)
                    pcm_ds = pcm_ds[:max_frames]
                    pcm_bytes = pcm_ds.tobytes()
                    extracted_sfx[sfx_key] = {
                        "bank": sf,
                        "sample_name": names[idx],
                        "orig_rate": freq,
                        "rate": out_rate,
                        "channels": 1,
                        "frames": len(pcm_ds),
                        "pcm16_b64": base64.b64encode(pcm_bytes).decode("ascii"),
                    }
                    # Save actual WAV to extracted_assets/audio/
                    wav_p = FILES_OUT / "audio" / f"{sfx_key}.wav"
                    wav_p.parent.mkdir(parents=True, exist_ok=True)
                    with wave.open(str(wav_p), "wb") as wf:
                        wf.setnchannels(1)
                        wf.setsampwidth(2)
                        wf.setframerate(out_rate)
                        wf.writeframes(pcm_bytes)
                    break

    return {
        "total_banks": len(bank_catalog),
        "total_samples": total_samples,
        "pcm16_samples": pcm16_samples,
        "mode_counts": mode_counts,
        "sfx_pcm16": extracted_sfx,
        "banks": bank_catalog,
    }, extracted_sfx


# ---------------------------------------------------------------------------
# 4. Main Extraction Pipeline
# ---------------------------------------------------------------------------

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--source", default=str(DST_ROOT_DEFAULT))
    args = parser.parse_args()

    dst_root = Path(args.source)
    data_dir = dst_root / "data"
    version = (dst_root / "version.txt").read_text(encoding="utf-8").strip()

    DATA_OUT.mkdir(parents=True, exist_ok=True)
    FILES_OUT.mkdir(parents=True, exist_ok=True)
    (FILES_OUT / ".gdignore").write_text("# Ignore raw extracted reference assets during Godot project import\n", encoding="utf-8")

    # A. Seamless Terrain Turf Textures (8 core biomes from levels/textures/*noise*.tex) + Portraits (6) + Icons (35)
    print("[1/4] Decoding KTEX seamless turf textures, portraits, and XML inventory atlases...")
    tile_sources = {
        "grass": "mini_grass_noise.tex",
        "forest": "mini_forest_noise.tex",
        "yellowgrass": "mini_grass2_noise.tex",
        "rocky": "noise_rocky.tex",
        "meteor": "noise_meteor.tex",
        "farmsoil": "Ground_noise_dirt.tex",
        "marsh": "mini_marsh_noise.tex",
        "ocean_ice": "ocean_noise.tex",
        "cave": "noise_cave.tex",
        "ruins": "noise_ruinsbrick.tex",
    }
    tiles_b64 = {}
    for tn, tex_fn in tile_sources.items():
        tp = data_dir / "levels" / "textures" / tex_fn
        if tp.exists():
            im = decode_ktex(tp.read_bytes(), flip_y=True)
            w, h = im.size
            resized = im.resize((128, 128), Image.Resampling.LANCZOS)
            save_png(resized, FILES_OUT / "tiles" / f"{tn}.png")
            tiles_b64[tn] = {"orig_w": w, "orig_h": h, "size": 128, "source": tex_fn, "png_b64": pil_to_png_b64(resized)}

    portrait_chars = ["wilson", "willow", "wolfgang", "wendy", "wathgrithr", "wx78"]
    portraits_b64 = {}
    for pc in portrait_chars:
        pp = data_dir / "bigportraits" / f"{pc}.tex"
        if pp.exists():
            im = decode_ktex(pp.read_bytes(), flip_y=True)
            # Trim transparent border then fit 96x96
            bbox = im.getbbox()
            if bbox:
                im = im.crop(bbox)
            im.thumbnail((96, 96), Image.Resampling.LANCZOS)
            save_png(im, FILES_OUT / "portraits" / f"{pc}.png")
            portraits_b64[pc] = {"w": im.width, "h": im.height, "png_b64": pil_to_png_b64(im)}

    # Inventory icons from images.zip (inventoryimages1~3.xml + .tex)
    target_icons = {
        "axe": "axe.tex", "pickaxe": "pickaxe.tex", "campfire": "campfire.tex", "torch": "torch.tex",
        "researchlab": "researchlab.tex", "spear": "spear.tex", "armorwood": "armorwood.tex",
        "footballhat": "footballhat.tex", "cookpot": "cookpot.tex", "farm_plot": "farm_hoe.tex",
        "boat_item": "boat_item.tex", "mast": "mast_item.tex", "telltale_heart": "reviver.tex",
        "sword_lunarplant": "sword_lunarplant.tex", "lunarplanthat": "lunarplanthat.tex",
        "armor_lunarplant": "armor_lunarplant.tex", "twigs": "twigs.tex", "flint": "flint.tex",
        "cutgrass": "cutgrass.tex", "log": "log.tex", "rocks": "rocks.tex", "goldnugget": "goldnugget.tex",
        "pigskin": "pigskin.tex", "purebrilliance": "purebrilliance.tex", "berries": "berries.tex",
        "carrot": "carrot.tex", "meat": "meat.tex", "monstermeat": "monstermeat.tex",
        "egg": "bird_egg.tex", "ice": "ice.tex", "meatballs": "meatballs.tex", "perogies": "perogies.tex",
        "baconeggs": "baconeggs.tex", "bonestew": "bonestew.tex", "wetgoop": "wetgoop.tex",
        "nightsword": "nightsword.tex", "armorruins": "armorruins.tex", "thulecite": "thulecite.tex",
        "nightmarefuel": "nightmarefuel.tex", "lightbulb": "lightbulb.tex", "honey": "honey.tex",
        "dragonfruit": "dragonfruit.tex", "fish": "fish.tex", "dragonpie": "dragonpie.tex",
        "honeyham": "honeyham.tex", "fishsticks": "fishsticks.tex",
        "voidclothhat": "voidclothhat.tex", "armor_voidcloth": "armor_voidcloth.tex",
        "voidcloth_scythe": "voidcloth_scythe.tex", "horrorfuel": "horrorfuel.tex",
    }
    inv_icons_b64 = {}
    total_atlas_elements = 0
    with zipfile.ZipFile(data_dir / "databundles" / "images.zip") as iz:
        for idx in ("1", "2", "3", ""):
            xname = f"images/inventoryimages{idx}.xml"
            tname = f"images/inventoryimages{idx}.tex"
            if xname not in iz.namelist():
                continue
            tex_bytes = iz.read(tname) if tname in iz.namelist() else ((data_dir / "images" / f"inventoryimages{idx}.tex").read_bytes() if (data_dir / "images" / f"inventoryimages{idx}.tex").exists() else None)
            if tex_bytes is None:
                continue
            root = ET.fromstring(iz.read(xname))
            elems = root.findall(".//Element")
            if idx != "":
                total_atlas_elements += len(elems)
            needed_in_atlas = {}
            for el in elems:
                ename = el.attrib.get("name", "")
                for k, want in target_icons.items():
                    if k not in inv_icons_b64 and ename == want:
                        needed_in_atlas[k] = el.attrib
            if needed_in_atlas:
                atlas_im = decode_ktex(tex_bytes, flip_y=True)
                aw, ah = atlas_im.size
                for k, attr in needed_in_atlas.items():
                    u1, u2 = float(attr["u1"]), float(attr["u2"])
                    v1, v2 = float(attr["v1"]), float(attr["v2"])
                    cx0, cx1 = int(round(u1 * aw)), int(round(u2 * aw))
                    cy0, cy1 = int(round((1.0 - v2) * ah)), int(round((1.0 - v1) * ah))
                    icon = atlas_im.crop((cx0, cy0, cx1, cy1)).resize((48, 48), Image.Resampling.LANCZOS)
                    save_png(icon, FILES_OUT / "icons" / f"{k}.png")
                    inv_icons_b64[k] = {"size": 48, "atlas": f"inventoryimages{idx}", "png_b64": pil_to_png_b64(icon)}

    tex_bundle = {
        "source_version": version,
        "total_inventory_atlas_elements": total_atlas_elements,
        "terrain_tiles": tiles_b64,
        "portraits": portraits_b64,
        "icons": inv_icons_b64,
    }
    (DATA_OUT / "dst_textures_extracted.txt").write_text(json.dumps(tex_bundle, ensure_ascii=False), encoding="utf-8")
    print(f"  -> tiles={len(tiles_b64)}, portraits={len(portraits_b64)}, icons={len(inv_icons_b64)} (atlas total={total_atlas_elements})")

    # B. KAnim BILD v6 + ANIM v4 2D Affine Compositing
    print("[2/4] Compositing authentic DST KAnim sprites (BILD v6 + ANIM v4)...")
    anim_dir = data_dir / "anim"
    player_anim = load_anim_zip(anim_dir, "player_basic.zip")
    deerclops_anim = load_anim_zip(anim_dir, "deerclops_basic.zip")
    spider_anim = load_anim_zip(anim_dir, "ds_spider_basic.zip")
    hound_anim = load_anim_zip(anim_dir, "hound_basic.zip")

    kanim_recipes = {
        # Characters (6 + ghost)
        "wilson": (["wilson.zip"], player_anim, ["idle_loop", "run_loop", "idle"], 128),
        "willow": (["willow.zip"], player_anim, ["idle_loop", "run_loop", "idle"], 128),
        "wolfgang": (["wolfgang.zip"], player_anim, ["idle_loop", "run_loop", "idle"], 128),
        "wendy": (["wendy.zip"], player_anim, ["idle_loop", "run_loop", "idle"], 128),
        "wathgrithr": (["wathgrithr.zip"], player_anim, ["idle_loop", "run_loop", "idle"], 128),
        "wx78": (["wx78.zip"], player_anim, ["idle_loop", "run_loop", "idle"], 128),
        "ghost": (["ghost_wilson_build.zip", "ghost_build.zip"], load_anim_zip(anim_dir, "ghost_build.zip"), ["idle", "appear"], 112),
        # Resources (6)
        "evergreen": (["evergreen_new.zip"], load_anim_zip(anim_dir, "evergreen_tall_old.zip"), ["idle_tall", "sway1_loop_tall", "idle"], 144),
        "boulder": (["rock2.zip"], None, ["full", "med", "idle"], 112),
        "sapling": (["sapling.zip"], None, ["sway", "idle"], 96),
        "grass_tuft": (["grass1.zip", "grass.zip"], None, ["idle", "sway"], 96),
        "berrybush": (["berrybush.zip"], None, ["idle", "berries"], 112),
        "lunar_crystal": (["lunar_rift_crystals.zip"], None, ["full", "med", "idle"], 128),
        # Structures (4)
        "campfire": (["campfire_fire.zip", "campfire.zip"], None, ["level3", "level2", "idle"], 112),
        "researchlab": (["researchlab.zip"], None, ["idle", "researchlab"], 144),
        "cookpot": (["cook_pot.zip"], None, ["idle_empty", "idle", "cooking_loop"], 128),
        "farm_plot": (["farm_plant_carrot.zip", "farm_soil.zip"], None, ["crop_full", "full", "idle"], 112),
        # Creatures & Bosses (8)
        "spider": (["spider_build.zip"], spider_anim, ["idle", "walk_loop"], 112),
        "hound": (["hound.zip"], hound_anim, ["idle", "run_loop"], 112),
        "crawlinghorror": (["shadow_insanity1_basic.zip"], None, ["idle_loop", "walk_loop", "idle"], 128),
        "terrorbeak": (["shadow_insanity2_basic.zip"], None, ["idle_loop", "walk_loop", "idle"], 128),
        "deerclops": (["deerclops_build.zip"], deerclops_anim, ["idle_loop", "walk_loop", "idle"], 160),
        "mutated_deerclops": (["deerclops_mutated.zip", "deerclops_build.zip"], deerclops_anim, ["idle_loop", "walk_loop", "idle"], 160),
        "bearger": (["bearger_build.zip"], load_anim_zip(anim_dir, "bearger_basic.zip"), ["idle_loop", "walk_loop", "idle"], 160),
        "dragonfly": (["dragonfly_build.zip"], load_anim_zip(anim_dir, "dragonfly_basic.zip"), ["idle", "idle_loop", "walk_loop"], 160),
        "moose": (["goosemoose_build.zip"], load_anim_zip(anim_dir, "goosemoose_basic.zip"), ["idle", "idle_loop", "walk_loop"], 160),
        "fuelweaver": (["stalker_atrium_build.zip"], load_anim_zip(anim_dir, "stalker_basic.zip"), ["idle", "idle_loop", "walk_loop"], 160),
        "celestial_champion": (["alterguardian_phase3.zip"], None, ["idle", "idle_loop", "walk_loop"], 160),
        # Caves & Ruins (4)
        "cave_entrance": (["cave_entrance.zip"], None, ["open", "idle"], 128),
        "ancient_altar": (["statue_ruins_gem.zip", "statue_ruins.zip"], None, ["idle_full", "full", "idle"], 144),
        "mushtree": (["mushroom_tree_tall.zip"], None, ["idle_loop", "idle"], 144),
        "lightflower": (["bulb_plant_triple.zip"], None, ["idle", "idle_loop"], 112),
    }

    kanim_sprites = {}
    for key, (bfiles, ext_anim, prefs, sz) in kanim_recipes.items():
        bsrcs = [load_anim_zip(anim_dir, bf) for bf in bfiles]
        bsrcs = [b for b in bsrcs if b]
        anims = ext_anim.get("anims") if (ext_anim and ext_anim.get("anims")) else None
        if not anims:
            for bs in bsrcs:
                if bs.get("anims"):
                    anims = bs["anims"]
                    break
        clip = pick_clip(anims, prefs)
        im = None
        if clip:
            im = composite_dst_frame(clip["frames"][0], bsrcs, out_size=sz)
        # Fallback: crop primary largest symbol from build.bin if no anim matched
        if im is None and bsrcs and bsrcs[0].get("bild") and bsrcs[0].get("atlases"):
            bild = bsrcs[0]["bild"]
            atlas = bsrcs[0]["atlases"][0]
            if atlas:
                aw, ah = atlas.size
                best_area = 0.0
                best_crop = None
                for sd in bild["symbols"].values():
                    if not sd["frames"]:
                        continue
                    fr = sd["frames"][0]
                    area = fr["pw"] * fr["ph"]
                    if area > best_area:
                        cx0, cx1 = max(0, int(round(fr["u0"] * aw))), min(aw, int(round(fr["u1"] * aw)))
                        cy0, cy1 = max(0, int(round((1.0 - fr["v1"]) * ah))), min(ah, int(round((1.0 - fr["v0"]) * ah)))
                        if cx1 - cx0 > 4 and cy1 - cy0 > 4:
                            best_area = area
                            best_crop = atlas.crop((cx0, cy0, cx1, cy1))
                if best_crop:
                    best_crop.thumbnail((sz, sz), Image.Resampling.LANCZOS)
                    im = best_crop
        if im is not None:
            save_png(im, FILES_OUT / "kanim_sprites" / f"{key}.png")
            kanim_sprites[key] = {
                "w": im.width, "h": im.height,
                "clip": clip["name"] if clip else "symbol_fallback",
                "png_b64": pil_to_png_b64(im),
            }
            print(f"    [OK] {key}: {im.width}x{im.height} clip={kanim_sprites[key]['clip']}")
        else:
            print(f"    [WARN] {key}: failed to composite")

    kanim_bundle = {
        "source_version": version,
        "sprite_count": len(kanim_sprites),
        "sprites": kanim_sprites,
    }
    (DATA_OUT / "dst_kanim_sprites_extracted.txt").write_text(json.dumps(kanim_bundle, ensure_ascii=False), encoding="utf-8")

    # C. FMOD FSB5 Audio Extraction
    print("[3/4] Scanning all 155 FMOD FSB5 banks & extracting PCM16 SFX...")
    audio_bundle, extracted_sfx = extract_fmod_fsb5(data_dir / "sound")
    (DATA_OUT / "dst_audio_extracted.txt").write_text(json.dumps(audio_bundle, ensure_ascii=False), encoding="utf-8")
    print(f"  -> banks={audio_bundle['total_banks']}, total_samples={audio_bundle['total_samples']}, pcm16_samples={audio_bundle['pcm16_samples']}, extracted_sfx={list(extracted_sfx.keys())}")

    # D. 70 Shaders (.ksh) GLSL Extraction
    print("[4/4] Extracting all 70 .ksh GLSL shaders...")
    shader_list = []
    key_glsl = {}
    key_shader_names = {"ground", "anim", "lighting", "postprocess_colourcube", "postprocess_lunacy", "ocean", "overheat", "moonstorm", "waves", "minimap"}
    with zipfile.ZipFile(data_dir / "databundles" / "shaders.zip") as szip:
        for sname in sorted(szip.namelist()):
            if not sname.endswith(".ksh"):
                continue
            raw = szip.read(sname)
            base_nm = Path(sname).stem
            chunks = [c.decode("ascii", "replace") for c in re.findall(rb"[ -~\r\n\t]{40,}", raw)]
            glsl_src = "\n// --- STAGE ---\n".join(chunks)
            shader_list.append({"name": base_nm, "file": sname, "bytes": len(raw), "stages": len(chunks)})
            # Save all 70 GLSL sources to extracted_assets/shaders/
            sp = FILES_OUT / "shaders" / f"{base_nm}.glsl"
            sp.parent.mkdir(parents=True, exist_ok=True)
            sp.write_text(glsl_src, encoding="utf-8")
            if base_nm in key_shader_names:
                key_glsl[base_nm] = glsl_src[:4000]

    shader_bundle = {
        "source_version": version,
        "shader_count": len(shader_list),
        "shaders": shader_list,
        "key_glsl": key_glsl,
    }
    (DATA_OUT / "dst_shaders_extracted.txt").write_text(json.dumps(shader_bundle, ensure_ascii=False), encoding="utf-8")

    # E. Extraction Manifest
    manifest = {
        "extracted_at": datetime.now(timezone.utc).isoformat(),
        "source_path": str(dst_root),
        "source_version": version,
        "counts": {
            "terrain_tiles": len(tiles_b64),
            "portraits": len(portraits_b64),
            "inventory_icons_embedded": len(inv_icons_b64),
            "inventory_atlas_elements_total": total_atlas_elements,
            "kanim_sprites_composited": len(kanim_sprites),
            "fmod_banks": audio_bundle["total_banks"],
            "fmod_samples_total": audio_bundle["total_samples"],
            "fmod_pcm16_samples": audio_bundle["pcm16_samples"],
            "sfx_embedded": len(extracted_sfx),
            "shaders_total": len(shader_list),
        },
        "bundle_bytes": {
            "dst_textures_extracted.txt": (DATA_OUT / "dst_textures_extracted.txt").stat().st_size,
            "dst_kanim_sprites_extracted.txt": (DATA_OUT / "dst_kanim_sprites_extracted.txt").stat().st_size,
            "dst_audio_extracted.txt": (DATA_OUT / "dst_audio_extracted.txt").stat().st_size,
            "dst_shaders_extracted.txt": (DATA_OUT / "dst_shaders_extracted.txt").stat().st_size,
        },
    }
    (DATA_OUT / "extraction_manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")
    print("\n=== EXTRACTION COMPLETE ===")
    print(json.dumps(manifest, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
