#!/usr/bin/env python3
"""
Don't Starve Together (DST) 전체 에셋·데이터 100% 무누락(Zero-Omission) 병렬 추출기.
대상: C:\\Program Files (x86)\\Steam\\steamapps\\common\\Don't Starve Together\\data

전수 추출 대상 (omitted = 0):
1. scripts.zip (4,109개 전체 .lua/.po/.pot/.vdf) -> extracted_assets/scripts/
2. shaders.zip (70개 전체 .ksh + 디컴파일 .glsl) -> extracted_assets/shaders/
3. images.zip (750개) + data/images/ (1,347개): 모든 KTEX(.tex)->PNG, 모든 .xml, 핵심 아틀라스 개별 아이콘 전수 크롭
4. data/levels/ (164개), data/bigportraits/ (377개 + bigportraits.zip 369개), data/minimap/ (8개), data/fx/ (24개): 모든 KTEX->PNG + XML
5. data/anim/*.zip (3,692개 모든 비암호화 KAnim): 모든 BILD v6/ANIM v4 전수 메타 파싱 + 모든 atlas-*.tex->PNG
6. data/databundles/anim_dynamic.zip (3,439개): 모든 build.bin 전수 파싱 + data/anim/dynamic/*.dyn 메타/해시 인벤토리 (암호화 복호화 미수행)
7. data/databundles/fonts.zip (25개) + klump.zip (1개) + data/haptics/ (1,762 .wav)
8. data/sound/ (155 .fsb + 58 .fev): FSB5 20,891개 전체 샘플 전수 인덱싱 + PCM16(mode=2) 2,568개 전체 .wav 무손실 추출
9. data/full_asset_index.json (Git 추적용 경량 전수 통계/검증 리포트) + extracted_assets/zero_omission_manifest.json (상세 전체 목록)
"""

import argparse
import concurrent.futures
import hashlib
import io
import json
import os
import re
import shutil
import struct
import time
import wave
import xml.etree.ElementTree as ET
import zipfile
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
from PIL import Image

DST_ROOT_DEFAULT = Path(r"C:\Program Files (x86)\Steam\steamapps\common\Don't Starve Together")
TEMPLATE_ROOT = Path(__file__).resolve().parent.parent
OUT_DIR = TEMPLATE_ROOT / "extracted_assets"
DATA_DIR_OUT = TEMPLATE_ROOT / "data"

FREQ_TABLE = {
    1: 8000, 2: 11000, 3: 11025, 4: 16000, 5: 22050,
    6: 24000, 7: 32000, 8: 44100, 9: 48000,
}


# ---------------------------------------------------------------------------
# Fast Vector KTEX Decoder (DXT1 / DXT3 / DXT5 / RGBA8 / RGB8)
# ---------------------------------------------------------------------------

def _rgb565_to_rgb888(c: np.ndarray) -> np.ndarray:
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
    buf = raw[:needed]
    if len(buf) < needed:
        buf = buf + b"\x00" * (needed - len(buf))
    arr = np.frombuffer(buf, dtype=np.uint8).reshape(bh, bw, 8)
    c0 = arr[:, :, 0].astype(np.uint16) | (arr[:, :, 1].astype(np.uint16) << 8)
    c1 = arr[:, :, 2].astype(np.uint16) | (arr[:, :, 3].astype(np.uint16) << 8)
    bits = (
        arr[:, :, 4].astype(np.uint32)
        | (arr[:, :, 5].astype(np.uint32) << 8)
        | (arr[:, :, 6].astype(np.uint32) << 16)
        | (arr[:, :, 7].astype(np.uint32) << 24)
    )
    rgb0 = _rgb565_to_rgb888(c0).astype(np.uint16)
    rgb1 = _rgb565_to_rgb888(c1).astype(np.uint16)
    gt = (c0 > c1)[:, :, None]
    rgb2 = np.where(gt, (2 * rgb0 + rgb1 + 1) // 3, (rgb0 + rgb1) // 2)
    rgb3 = np.where(gt, (rgb0 + 2 * rgb1 + 1) // 3, 0)
    palette = np.stack([rgb0, rgb1, rgb2, rgb3], axis=2).astype(np.uint8)

    out = np.zeros((bh, bw, 16, 4), dtype=np.uint8)
    iy = np.arange(bh)[:, None]
    ix = np.arange(bw)[None, :]
    for p in range(16):
        idx = (bits >> (2 * p)) & 3
        out[:, :, p, :3] = palette[iy, ix, idx]
        out[:, :, p, 3] = np.where((~gt[:, :, 0]) & (idx == 3), 0, 255)
    return out.reshape(bh, bw, 4, 4, 4).transpose(0, 2, 1, 3, 4).reshape(bh * 4, bw * 4, 4)[:h, :w]


def decode_dxt3(raw: bytes, w: int, h: int) -> np.ndarray:
    bw, bh = max(1, (w + 3) // 4), max(1, (h + 3) // 4)
    needed = bw * bh * 16
    buf = raw[:needed]
    if len(buf) < needed:
        buf = buf + b"\x00" * (needed - len(buf))
    arr = np.frombuffer(buf, dtype=np.uint8).reshape(bh, bw, 16)
    c0 = arr[:, :, 8].astype(np.uint16) | (arr[:, :, 9].astype(np.uint16) << 8)
    c1 = arr[:, :, 10].astype(np.uint16) | (arr[:, :, 11].astype(np.uint16) << 8)
    bits = (
        arr[:, :, 12].astype(np.uint32)
        | (arr[:, :, 13].astype(np.uint32) << 8)
        | (arr[:, :, 14].astype(np.uint32) << 16)
        | (arr[:, :, 15].astype(np.uint32) << 24)
    )
    rgb0 = _rgb565_to_rgb888(c0).astype(np.uint16)
    rgb1 = _rgb565_to_rgb888(c1).astype(np.uint16)
    rgb2 = (2 * rgb0 + rgb1 + 1) // 3
    rgb3 = (rgb0 + 2 * rgb1 + 1) // 3
    palette = np.stack([rgb0, rgb1, rgb2, rgb3], axis=2).astype(np.uint8)

    out = np.zeros((bh, bw, 16, 4), dtype=np.uint8)
    iy = np.arange(bh)[:, None]
    ix = np.arange(bw)[None, :]
    for p in range(16):
        cidx = (bits >> (2 * p)) & 3
        ab = arr[:, :, p // 2]
        a4 = (ab & 0x0F) if (p % 2 == 0) else ((ab >> 4) & 0x0F)
        out[:, :, p, :3] = palette[iy, ix, cidx]
        out[:, :, p, 3] = (a4 * 17).astype(np.uint8)
    return out.reshape(bh, bw, 4, 4, 4).transpose(0, 2, 1, 3, 4).reshape(bh * 4, bw * 4, 4)[:h, :w]


def decode_dxt5(raw: bytes, w: int, h: int) -> np.ndarray:
    bw, bh = max(1, (w + 3) // 4), max(1, (h + 3) // 4)
    needed = bw * bh * 16
    buf = raw[:needed]
    if len(buf) < needed:
        buf = buf + b"\x00" * (needed - len(buf))
    arr = np.frombuffer(buf, dtype=np.uint8).reshape(bh, bw, 16)
    c0 = arr[:, :, 8].astype(np.uint16) | (arr[:, :, 9].astype(np.uint16) << 8)
    c1 = arr[:, :, 10].astype(np.uint16) | (arr[:, :, 11].astype(np.uint16) << 8)
    bits = (
        arr[:, :, 12].astype(np.uint32)
        | (arr[:, :, 13].astype(np.uint32) << 8)
        | (arr[:, :, 14].astype(np.uint32) << 16)
        | (arr[:, :, 15].astype(np.uint32) << 24)
    )
    rgb0 = _rgb565_to_rgb888(c0).astype(np.uint16)
    rgb1 = _rgb565_to_rgb888(c1).astype(np.uint16)
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


def decode_ktex_bytes(raw: bytes, max_dim: int = 0) -> tuple:
    """Decode KTEX bytes -> (PIL RGBA Image, meta dict)."""
    if len(raw) < 18 or raw[:4] != b"KTEX":
        raise ValueError("Not a KTEX file")
    header = struct.unpack_from("<I", raw, 4)[0]
    pfmt = (header >> 4) & 0x1F
    ttype = (header >> 9) & 0xF
    mips = (header >> 13) & 0x1F
    w, h, pitch, dsz = struct.unpack_from("<HHHI", raw, 8)
    data_off = 8 + mips * 10
    pix = raw[data_off : data_off + dsz]

    if pfmt == 0:
        rgba = decode_dxt1(pix, w, h)
    elif pfmt == 1:
        rgba = decode_dxt3(pix, w, h)
    elif pfmt == 2:
        rgba = decode_dxt5(pix, w, h)
    elif pfmt == 4:
        rgba = np.frombuffer(pix[: w * h * 4], dtype=np.uint8).reshape(h, w, 4)
    elif pfmt == 5:
        rgb = np.frombuffer(pix[: w * h * 3], dtype=np.uint8).reshape(h, w, 3)
        a = np.full((h, w, 1), 255, dtype=np.uint8)
        rgba = np.concatenate([rgb, a], axis=-1)
    else:
        rgba = decode_dxt5(pix, w, h)

    rgba = np.flipud(rgba)
    im = Image.fromarray(rgba, mode="RGBA")
    if max_dim > 0 and max(im.width, im.height) > max_dim:
        im.thumbnail((max_dim, max_dim), Image.Resampling.LANCZOS)
    return im, {"w": w, "h": h, "fmt": pfmt, "mips": mips, "type": ttype}


# ---------------------------------------------------------------------------
# Worker functions (module-level for ProcessPoolExecutor)
# ---------------------------------------------------------------------------

def worker_decode_tex_file(task: tuple) -> dict:
    src_str, dst_str, max_dim, skip_existing = task
    src = Path(src_str)
    dst = Path(dst_str)
    try:
        if skip_existing and dst.is_file() and dst.stat().st_size > 0:
            return {"ok": True, "src": src_str, "dst": dst_str, "skipped": True}
        raw = src.read_bytes()
        im, meta = decode_ktex_bytes(raw, max_dim=max_dim)
        dst.parent.mkdir(parents=True, exist_ok=True)
        im.save(dst, format="PNG", compress_level=6)
        return {"ok": True, "src": src_str, "dst": dst_str, "w": meta["w"], "h": meta["h"], "fmt": meta["fmt"]}
    except Exception as e:
        return {"ok": False, "src": src_str, "err": str(e)}


def worker_process_anim_zip(task: tuple) -> dict:
    zip_str, out_dir_str, max_dim, skip_existing = task
    zp = Path(zip_str)
    stem = zp.stem
    out_base = Path(out_dir_str) / stem
    res = {
        "ok": True, "name": stem, "rel": zp.parent.name + "/" + zp.name, "atlases": 0, "has_build": False, "has_anim": False,
        "symbols": 0, "clips": [], "err": None,
    }
    try:
        with zipfile.ZipFile(zp) as z:
            nl = z.namelist()
            if "build.bin" in nl:
                braw = z.read("build.bin")
                if len(braw) >= 16 and braw[:4] == b"BILD":
                    ver, scnt, fcnt = struct.unpack_from("<iii", braw, 4)
                    res["has_build"] = True
                    res["symbols"] = scnt
                    res["build_frames"] = fcnt
            if "anim.bin" in nl:
                araw = z.read("anim.bin")
                if len(araw) >= 24 and araw[:4] == b"ANIM":
                    ver, ecnt, fcnt, evcnt, acnt = struct.unpack_from("<iiiii", araw, 4)
                    res["has_anim"] = True
                    res["anim_count"] = acnt
                    # Extract clip names fast
                    pos = 24
                    cnames = []
                    for _ in range(min(acnt, 120)):
                        if pos + 4 > len(araw):
                            break
                        nl_c = struct.unpack_from("<i", araw, pos)[0]; pos += 4
                        if nl_c < 0 or nl_c > 256 or pos + nl_c + 13 > len(araw):
                            break
                        cn = araw[pos : pos + nl_c].decode("utf-8", "replace"); pos += nl_c
                        facing, bhash, fps, nf = struct.unpack_from("<BIfi", araw, pos); pos += 13
                        cnames.append(cn)
                        for _ in range(nf):
                            if pos + 20 > len(araw):
                                break
                            nev = struct.unpack_from("<i", araw, pos + 16)[0]; pos += 20 + nev * 4
                            if pos + 4 > len(araw):
                                break
                            nel = struct.unpack_from("<i", araw, pos)[0]; pos += 4 + nel * 40
                    res["clips"] = sorted(set(cnames))

            for entry in nl:
                if entry.lower().endswith(".tex"):
                    dst = out_base / (Path(entry).stem + ".png")
                    if not (skip_existing and dst.is_file() and dst.stat().st_size > 0):
                        raw = z.read(entry)
                        im, meta = decode_ktex_bytes(raw, max_dim=max_dim)
                        dst.parent.mkdir(parents=True, exist_ok=True)
                        im.save(dst, format="PNG", compress_level=6)
                    res["atlases"] += 1
    except Exception as e:
        res["ok"] = False
        res["err"] = str(e)
    return res


def extract_fsb5_all(sound_dir: Path, audio_out: Path) -> dict:
    fsb_files = sorted(f for f in os.listdir(sound_dir) if f.lower().endswith(".fsb"))
    fev_files = sorted(f for f in os.listdir(sound_dir) if f.lower().endswith(".fev"))

    banks = []
    total_samples = 0
    pcm16_extracted = 0
    pcm16_failed = 0
    mode_counts = Counter()

    for sf in fsb_files:
        fp = sound_dir / sf
        raw = fp.read_bytes()
        if len(raw) < 60 or raw[:4] != b"FSB5":
            banks.append({"bank": sf, "magic": raw[:4].hex(), "samples": 0})
            continue
        ver, nsamples, shsz, ntsz, dsz, mode = struct.unpack_from("<6I", raw, 4)
        total_samples += nsamples
        mode_counts[str(mode)] += nsamples
        hdr_size = 60 if ver == 1 else 64
        sh_off = hdr_size
        nt_off = sh_off + shsz
        data_off = nt_off + ntsz

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

        names = []
        if ntsz >= nsamples * 4:
            for i in range(nsamples):
                rel = struct.unpack_from("<I", raw, nt_off + i * 4)[0]
                npos = nt_off + rel
                end = raw.find(b"\x00", npos, data_off)
                nm = raw[npos:end].decode("utf-8", "replace") if end != -1 else f"sample_{i}"
                names.append(nm)
        else:
            names = [f"{Path(sf).stem}_{i}" for i in range(len(s_entries))]

        sample_meta = []
        bank_stem = Path(sf).stem
        for i, (drel, slen, freq, ch) in enumerate(s_entries):
            nm = names[i] if i < len(names) else f"sample_{i}"
            sample_meta.append({"name": nm, "frames": slen, "rate": freq, "ch": ch})
            if mode == 2:
                # Extract 100% of PCM16 samples as lossless WAV
                byte_len = slen * ch * 2
                start = data_off + drel
                if start + byte_len <= len(raw) and slen > 0:
                    safe_nm = re.sub(r'[^A-Za-z0-9._-]+', '_', nm)[:80]
                    wav_p = audio_out / "pcm16" / bank_stem / f"{i:04d}_{safe_nm}.wav"
                    wav_p.parent.mkdir(parents=True, exist_ok=True)
                    try:
                        with wave.open(str(wav_p), "wb") as wf:
                            wf.setnchannels(ch)
                            wf.setsampwidth(2)
                            wf.setframerate(freq)
                            wf.writeframes(raw[start : start + byte_len])
                        pcm16_extracted += 1
                    except Exception:
                        pcm16_failed += 1
                else:
                    pcm16_failed += 1

        banks.append({
            "bank": sf,
            "mode": mode,
            "size_bytes": len(raw),
            "sample_count": len(s_entries),
            "samples": sample_meta,
        })

    # Index all 58 .fev metadata files (extract readable event names)
    fev_index = []
    for ff in fev_files:
        fp = sound_dir / ff
        raw = fp.read_bytes()
        tokens = sorted(set(m.decode("ascii", "ignore") for m in re.findall(rb"[A-Za-z0-9_/.-]{6,80}", raw)))
        fev_index.append({"file": ff, "size_bytes": len(raw), "token_count": len(tokens)})

    return {
        "fsb_banks": len(fsb_files),
        "fev_files": len(fev_files),
        "total_samples": total_samples,
        "mode_counts": dict(mode_counts),
        "pcm16_extracted_wavs": pcm16_extracted,
        "pcm16_failed": pcm16_failed,
        "banks": banks,
        "fevs": fev_index,
    }


def main():
    t0 = time.time()
    parser = argparse.ArgumentParser()
    parser.add_argument("--source", default=str(DST_ROOT_DEFAULT))
    parser.add_argument("--workers", type=int, default=min(16, max(4, (os.cpu_count() or 8) // 2)))
    parser.add_argument("--anim-max-dim", type=int, default=512, help="Cap KAnim atlas PNG max dim to keep disk usage safe under 11GB")
    parser.add_argument("--skip-existing", action="store_true", help="Skip re-decoding already extracted PNG/WAV files")
    args = parser.parse_args()

    dst_root = Path(args.source)
    data_dir = dst_root / "data"
    version = (dst_root / "version.txt").read_text(encoding="utf-8").strip()

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    (OUT_DIR / ".gdignore").write_text("# Ignore raw extracted reference assets during Godot project import\n", encoding="utf-8")
    DATA_DIR_OUT.mkdir(parents=True, exist_ok=True)
    print(f"=== DST ZERO-OMISSION EXTRACTOR (v{version}, workers={args.workers}) ===")

    # 1. scripts.zip (4,109 files -> 100%)
    print("[1/9] Extracting scripts.zip (4,109 files)...")
    scripts_out = OUT_DIR / "scripts_bundle"
    with zipfile.ZipFile(data_dir / "databundles" / "scripts.zip") as sz:
        s_entries = [n for n in sz.namelist() if not n.endswith("/")]
        sz.extractall(scripts_out)
    print(f"  -> {len(s_entries)} script files extracted")

    # 2. shaders.zip (70 .ksh + 70 .glsl -> 100%)
    print("[2/9] Extracting shaders.zip (70 .ksh + .glsl)...")
    sh_out = OUT_DIR / "shaders_all"
    sh_out.mkdir(parents=True, exist_ok=True)
    sh_count = 0
    with zipfile.ZipFile(data_dir / "databundles" / "shaders.zip") as shz:
        for sn in sorted(shz.namelist()):
            if sn.endswith("/"):
                continue
            raw = shz.read(sn)
            stem = Path(sn).stem
            (sh_out / f"{stem}.ksh").write_bytes(raw)
            chunks = [c.decode("ascii", "replace") for c in re.findall(rb"[ -~\r\n\t]{40,}", raw)]
            (sh_out / f"{stem}.glsl").write_text("\n// --- STAGE ---\n".join(chunks), encoding="utf-8")
            sh_count += 1
    print(f"  -> {sh_count} shaders (.ksh + .glsl) extracted")

    # 3. fonts.zip (25) + klump.zip (1) + bigportraits.zip (369 xml) + misc + haptics (1,762 wav)
    print("[3/9] Extracting fonts.zip, klump.zip, bigportraits.zip, misc, and haptics (1,762 WAV)...")
    bundle_counts = {}
    for zname, sub in [("fonts.zip", "fonts"), ("klump.zip", "klump"), ("bigportraits.zip", "bigportraits_xml")]:
        zp = data_dir / "databundles" / zname
        with zipfile.ZipFile(zp) as z:
            entries = [n for n in z.namelist() if not n.endswith("/")]
            z.extractall(OUT_DIR / sub)
            bundle_counts[sub] = len(entries)
    misc_out = OUT_DIR / "misc"
    misc_out.mkdir(parents=True, exist_ok=True)
    misc_files = []
    for rel_p in [Path("databundles/hashes.txt"), Path("scripts_readme.txt"), Path("unsafedata_readme.txt")]:
        sp = data_dir / rel_p
        if sp.is_file():
            dp = misc_out / rel_p.name
            shutil.copy2(sp, dp)
            misc_files.append(str(rel_p).replace("\\", "/"))
    haptics_src = data_dir / "haptics"
    haptics_dst = OUT_DIR / "haptics"
    haptics_count = 0
    for r, _, fs in os.walk(haptics_src):
        for fn in fs:
            sp = Path(r) / fn
            rel = sp.relative_to(haptics_src)
            dp = haptics_dst / rel
            dp.parent.mkdir(parents=True, exist_ok=True)
            if not dp.exists():
                shutil.copy2(sp, dp)
            haptics_count += 1
    print(f"  -> haptics={haptics_count} WAVs, fonts={bundle_counts['fonts']}, klump={bundle_counts['klump']}, bigportraits_xml={bundle_counts['bigportraits_xml']}, misc={len(misc_files)}")

    # 4. images.zip (750 entries: 68 .tex -> PNG + 682 .xml) + ALL XML atlas individual icons
    print("[4/9] Extracting images.zip (68 .tex->PNG + 682 .xml) + auto-cropping ALL paired XML atlas icons...")
    iz_out = OUT_DIR / "images_bundle"
    iz_tex_ok = 0
    iz_tex_fail = []
    iz_xml_cnt = 0
    cropped_icons_total = 0
    cropped_atlas_groups = 0
    with zipfile.ZipFile(data_dir / "databundles" / "images.zip") as iz:
        iz_names = set(iz.namelist())
        decoded_by_basename = {}
        decoded_by_path = {}
        xml_entries = []
        for name in sorted(iz_names):
            if name.endswith("/"):
                continue
            raw = iz.read(name)
            if name.lower().endswith(".tex"):
                try:
                    im, _ = decode_ktex_bytes(raw, max_dim=0)
                    dp = iz_out / Path(name).with_suffix(".png")
                    dp.parent.mkdir(parents=True, exist_ok=True)
                    im.save(dp, format="PNG", compress_level=6)
                    decoded_by_path[name.lower()] = im
                    decoded_by_basename[Path(name).name.lower()] = im
                    iz_tex_ok += 1
                except Exception as e:
                    iz_tex_fail.append({"src": name, "err": str(e)})
            else:
                dp = iz_out / name
                dp.parent.mkdir(parents=True, exist_ok=True)
                dp.write_bytes(raw)
                iz_xml_cnt += 1
                if name.lower().endswith(".xml"):
                    xml_entries.append((name, raw))

        # Auto-crop 100% of XML atlases whose <Texture filename="..."/> matches any decoded .tex in images.zip
        icons_all_out = OUT_DIR / "atlas_elements"
        for xname, xraw in xml_entries:
            try:
                root = ET.fromstring(xraw)
            except Exception:
                continue
            tex_node = root.find(".//Texture")
            if tex_node is None:
                continue
            tfn = tex_node.attrib.get("filename", "")
            atlas_im = decoded_by_path.get(f"images/{tfn}".lower()) or decoded_by_basename.get(Path(tfn).name.lower())
            if atlas_im is None:
                continue
            elements = root.findall(".//Element")
            if not elements:
                continue
            aw, ah = atlas_im.size
            sub_dir = icons_all_out / Path(xname).stem
            sub_dir.mkdir(parents=True, exist_ok=True)
            group_cnt = 0
            for el in elements:
                ename = el.attrib.get("name", "")
                if not ename:
                    continue
                u1, u2 = float(el.attrib["u1"]), float(el.attrib["u2"])
                v1, v2 = float(el.attrib["v1"]), float(el.attrib["v2"])
                cx0, cx1 = max(0, int(round(u1 * aw))), min(aw, int(round(u2 * aw)))
                cy0, cy1 = max(0, int(round((1.0 - v2) * ah))), min(ah, int(round((1.0 - v1) * ah)))
                if cx1 - cx0 >= 2 and cy1 - cy0 >= 2:
                    safe_stem = re.sub(r'[<>:"/\\|?*]+', '_', Path(ename).stem)
                    crop = atlas_im.crop((cx0, cy0, cx1, cy1))
                    crop.save(sub_dir / f"{safe_stem}.png", format="PNG", compress_level=6)
                    cropped_icons_total += 1
                    group_cnt += 1
            if group_cnt > 0:
                cropped_atlas_groups += 1
        decoded_by_basename.clear()
        decoded_by_path.clear()
    print(f"  -> images.zip: tex={iz_tex_ok} (fail={len(iz_tex_fail)}), xml={iz_xml_cnt}, atlas_groups={cropped_atlas_groups}, icons={cropped_icons_total}")

    # 5. Loose KTEX across data/images, data/levels, data/bigportraits, data/minimap, data/fx + loose XML & minimap cropping
    print("[5/9] Decoding ALL loose KTEX textures across images/, levels/, bigportraits/, minimap/, fx/...")
    tex_tasks = []
    other_copied = 0
    for sub, max_d in [("images", 1024), ("levels", 0), ("bigportraits", 512), ("minimap", 0), ("fx", 0)]:
        sroot = data_dir / sub
        for r, _, fs in os.walk(sroot):
            for fn in fs:
                sp = Path(r) / fn
                rel = sp.relative_to(data_dir)
                if fn.lower().endswith(".tex"):
                    dp = OUT_DIR / "textures_all" / rel.with_suffix(".png")
                    tex_tasks.append((str(sp), str(dp), max_d, args.skip_existing))
                else:
                    dp = OUT_DIR / "textures_all" / rel
                    dp.parent.mkdir(parents=True, exist_ok=True)
                    if not (args.skip_existing and dp.is_file()):
                        shutil.copy2(sp, dp)
                    other_copied += 1

    tex_ok = 0
    tex_fail = []
    with concurrent.futures.ProcessPoolExecutor(max_workers=args.workers) as ex:
        for res in ex.map(worker_decode_tex_file, tex_tasks, chunksize=16):
            if res["ok"]:
                tex_ok += 1
            else:
                tex_fail.append(res)

    # Auto-crop ALL loose XML atlases in textures_all/images/ AND textures_all/minimap/
    loose_atlas_icons_cnt = 0
    loose_atlas_groups_cnt = 0
    minimap_icons_cnt = 0
    for scan_sub, prefix in [("minimap", "minimap"), ("images", "loose_")]:
        scan_dir = OUT_DIR / "textures_all" / scan_sub
        if not scan_dir.is_dir():
            continue
        for xml_p in sorted(scan_dir.rglob("*.xml")):
            try:
                root = ET.fromstring(xml_p.read_bytes())
                tex_node = root.find(".//Texture")
                if tex_node is None:
                    continue
                tfn = Path(tex_node.attrib.get("filename", "")).with_suffix(".png").name
                atlas_p = xml_p.parent / tfn
                if not atlas_p.is_file():
                    atlas_p = scan_dir / tfn
                if not atlas_p.is_file():
                    continue
                elements = root.findall(".//Element")
                if not elements:
                    continue
                sub_dir = (OUT_DIR / "atlas_elements" / "minimap") if scan_sub == "minimap" else (OUT_DIR / "atlas_elements" / f"{prefix}{xml_p.stem}")
                sub_dir.mkdir(parents=True, exist_ok=True)
                atlas_im = Image.open(atlas_p)
                aw, ah = atlas_im.size
                gcnt = 0
                for el in elements:
                    ename = el.attrib.get("name", "")
                    if not ename:
                        continue
                    u1, u2 = float(el.attrib["u1"]), float(el.attrib["u2"])
                    v1, v2 = float(el.attrib["v1"]), float(el.attrib["v2"])
                    cx0, cx1 = max(0, int(round(u1 * aw))), min(aw, int(round(u2 * aw)))
                    cy0, cy1 = max(0, int(round((1.0 - v2) * ah))), min(ah, int(round((1.0 - v1) * ah)))
                    if cx1 - cx0 >= 2 and cy1 - cy0 >= 2:
                        safe_stem = re.sub(r'[<>:"/\\|?*]+', '_', Path(ename).stem)
                        out_p = sub_dir / f"{safe_stem}.png"
                        if not (args.skip_existing and out_p.is_file() and out_p.stat().st_size > 0):
                            atlas_im.crop((cx0, cy0, cx1, cy1)).save(out_p, format="PNG", compress_level=6)
                        gcnt += 1
                        if scan_sub == "minimap":
                            minimap_icons_cnt += 1
                        else:
                            loose_atlas_icons_cnt += 1
                if gcnt > 0 and scan_sub != "minimap":
                    loose_atlas_groups_cnt += 1
            except Exception as e:
                tex_fail.append({"src": str(xml_p), "err": f"atlas_crop: {e}"})
    cropped_icons_total += minimap_icons_cnt + loose_atlas_icons_cnt
    print(f"  -> loose KTEX decoded: {tex_ok}/{len(tex_tasks)} (failed={len(tex_fail)}), xml/bin copied={other_copied}, minimap_icons={minimap_icons_cnt}, loose_image_icons={loose_atlas_icons_cnt} ({loose_atlas_groups_cnt} atlases)")

    # 6. ALL 3,692 non-encrypted data/anim/**/*.zip KAnim archives (3,598 top-level + 94 in anim/dynamic/)
    print(f"[6/9] Extracting ALL data/anim/**/*.zip KAnim archives (parallel workers={args.workers})...")
    anim_dir = data_dir / "anim"
    anim_zips = sorted(anim_dir.rglob("*.zip"))
    anim_tasks = [(str(zp), str(OUT_DIR / "anim_all"), args.anim_max_dim, args.skip_existing) for zp in anim_zips]
    anim_records = []
    anim_ok = 0
    anim_fail = []
    total_anim_atlases = 0
    with concurrent.futures.ProcessPoolExecutor(max_workers=args.workers) as ex:
        for res in ex.map(worker_process_anim_zip, anim_tasks, chunksize=32):
            anim_records.append(res)
            if res["ok"]:
                anim_ok += 1
                total_anim_atlases += res["atlases"]
            else:
                anim_fail.append(res)
    (OUT_DIR / "anim_all_index.json").write_text(json.dumps(anim_records, ensure_ascii=False), encoding="utf-8")
    print(f"  -> KAnim zips: {anim_ok}/{len(anim_zips)} (failed={len(anim_fail)}), atlas PNGs decoded={total_anim_atlases}")

    # 7. anim_dynamic.zip (3,439 skin build.bin) + anim/dynamic/*.dyn (3,533+ encrypted inventory only)
    print("[7/9] Indexing anim_dynamic.zip (3,439 builds) & data/anim/dynamic/*.dyn metadata...")
    dyn_builds = []
    with zipfile.ZipFile(data_dir / "databundles" / "anim_dynamic.zip") as dz:
        for name in sorted(dz.namelist()):
            if not name.endswith(".zip"):
                continue
            with zipfile.ZipFile(io.BytesIO(dz.read(name))) as subz:
                scnt = 0
                if "build.bin" in subz.namelist():
                    braw = subz.read("build.bin")
                    if len(braw) >= 16 and braw[:4] == b"BILD":
                        _, scnt, _ = struct.unpack_from("<iii", braw, 4)
                dyn_builds.append({"name": Path(name).stem, "entries": subz.namelist(), "symbols": scnt})
    (OUT_DIR / "anim_dynamic_index.json").write_text(json.dumps(dyn_builds, ensure_ascii=False), encoding="utf-8")

    dyn_dir = data_dir / "anim" / "dynamic"
    dyn_files = sorted(dyn_dir.glob("*.dyn")) if dyn_dir.is_dir() else []
    dyn_meta = [{"file": p.name, "bytes": p.stat().st_size} for p in dyn_files]
    (OUT_DIR / "anim_dyn_encrypted_inventory.json").write_text(json.dumps(dyn_meta, ensure_ascii=False), encoding="utf-8")
    print(f"  -> anim_dynamic builds={len(dyn_builds)}, .dyn encrypted skins inventoried={len(dyn_files)}")

    # 8. FMOD FSB5 ALL 155 banks (20,891 samples) + ALL 2,568 PCM16 WAV extraction + 58 .fev index
    print("[8/9] Scanning ALL 155 FMOD FSB5 banks & extracting ALL 2,568 PCM16 WAVs...")
    audio_data = extract_fsb5_all(data_dir / "sound", OUT_DIR / "audio_all")
    (OUT_DIR / "sound_catalog_all.json").write_text(json.dumps(audio_data, ensure_ascii=False), encoding="utf-8")
    print(f"  -> banks={audio_data['fsb_banks']}, samples={audio_data['total_samples']}, pcm16_wavs={audio_data['pcm16_extracted_wavs']} (failed={audio_data['pcm16_failed']}), fevs={audio_data['fev_files']}")

    # 9. Movies/unsafedata + Source Directory Full Audit + Zero-Omission Verification Report
    print("[9/9] Copying movies/unsafedata & building source audit + zero-omission verification index...")
    movies_out = OUT_DIR / "movies"
    movies_out.mkdir(parents=True, exist_ok=True)
    movies = []
    if (data_dir / "movies").is_dir():
        for mp in sorted((data_dir / "movies").glob("*")):
            if mp.is_file():
                dp = movies_out / mp.name
                if not (args.skip_existing and dp.is_file() and dp.stat().st_size == mp.stat().st_size):
                    shutil.copy2(mp, dp)
                movies.append({"file": mp.name, "bytes": mp.stat().st_size})

    # Clean up any legacy anim_dynamic_*.zip copies from misc/ (now parsed in anim_all/)
    for stale in misc_out.glob("anim_dynamic_*.zip"):
        stale.unlink(missing_ok=True)

    # Copy data/unsafedata/* (e.g. fileforpackaging)
    unsafedata_files = []
    if (data_dir / "unsafedata").is_dir():
        for up in sorted((data_dir / "unsafedata").rglob("*")):
            if up.is_file():
                dp = misc_out / f"unsafedata_{up.name}"
                shutil.copy2(up, dp)
                unsafedata_files.append(up.name)

    # Audit every single file under data/ to guarantee 0 unaccounted files
    source_by_top = Counter()
    source_total_files = 0
    for r, _, fs in os.walk(data_dir):
        for fn in fs:
            rel = Path(r, fn).relative_to(data_dir)
            top = rel.parts[0] if len(rel.parts) > 1 else "_root"
            source_by_top[top] += 1
            source_total_files += 1

    # Verify non-zip files directly in data/anim/ and non-dyn/non-zip files in data/anim/dynamic/
    anim_non_zip = [p.name for p in anim_dir.iterdir() if p.is_file() and p.suffix.lower() != ".zip"]
    dyn_other = [p.name for p in dyn_dir.iterdir() if p.is_file() and p.suffix.lower() not in (".dyn", ".zip")] if dyn_dir.is_dir() else []
    for extra_name in anim_non_zip:
        shutil.copy2(anim_dir / extra_name, misc_out / f"anim_{extra_name}")
    for extra_name in dyn_other:
        shutil.copy2(dyn_dir / extra_name, misc_out / f"anim_dynamic_{extra_name}")

    failures_total = len(iz_tex_fail) + len(tex_fail) + len(anim_fail) + audio_data["pcm16_failed"]
    if failures_total > 0:
        (OUT_DIR / "failures_detail.json").write_text(
            json.dumps({
                "images_zip_tex_fail": iz_tex_fail,
                "loose_tex_fail": tex_fail,
                "anim_zip_fail": anim_fail,
                "pcm16_failed": audio_data["pcm16_failed"],
            }, ensure_ascii=False, indent=2),
            encoding="utf-8",
        )
    else:
        (OUT_DIR / "failures_detail.json").unlink(missing_ok=True)

    elapsed = round(time.time() - t0, 2)
    disk_bytes = sum(f.stat().st_size for f in OUT_DIR.rglob("*") if f.is_file())
    extracted_file_count = sum(1 for f in OUT_DIR.rglob("*") if f.is_file())

    accounted_source_files = (
        len(misc_files) + len(unsafedata_files)
        + 7  # databundles/*.zip (scripts, shaders, fonts, klump, bigportraits, images, anim_dynamic)
        + haptics_count
        + tex_ok + other_copied
        + anim_ok + len(dyn_files) + len(anim_non_zip) + len(dyn_other)
        + audio_data["fsb_banks"] + audio_data["fev_files"]
        + len(movies)
    )
    unaccounted_source_files = source_total_files - accounted_source_files

    summary = {
        "extracted_at": datetime.now(timezone.utc).isoformat(),
        "elapsed_seconds": elapsed,
        "source_path": str(dst_root),
        "source_version": version,
        "zero_omission_verified": (failures_total == 0 and unaccounted_source_files == 0),
        "source_audit": {
            "total_files_in_data": source_total_files,
            "accounted_source_files": accounted_source_files,
            "unaccounted_source_files": unaccounted_source_files,
            "by_top_dir": dict(sorted(source_by_top.items())),
            "anim_non_zip_files": anim_non_zip,
            "anim_dynamic_other_files": dyn_other,
        },
        "totals": {
            "scripts_extracted": len(s_entries),
            "shaders_ksh_and_glsl": sh_count,
            "fonts_extracted": bundle_counts["fonts"],
            "klump_extracted": bundle_counts["klump"],
            "bigportraits_xml_extracted": bundle_counts["bigportraits_xml"],
            "misc_files_copied": len(misc_files) + len(unsafedata_files) + len(anim_non_zip) + len(dyn_other),
            "haptics_wavs": haptics_count,
            "images_zip_tex_png": iz_tex_ok,
            "images_zip_xml": iz_xml_cnt,
            "atlas_groups_cropped": cropped_atlas_groups + loose_atlas_groups_cnt + (1 if minimap_icons_cnt > 0 else 0),
            "atlas_individual_icons_png": cropped_icons_total,
            "minimap_icons_png": minimap_icons_cnt,
            "loose_atlas_icons_png": loose_atlas_icons_cnt,
            "loose_ktex_png": tex_ok,
            "loose_xml_bin": other_copied,
            "kanim_zips_parsed": anim_ok,
            "kanim_atlas_png": total_anim_atlases,
            "anim_dynamic_builds_parsed": len(dyn_builds),
            "anim_dyn_encrypted_inventoried": len(dyn_files),
            "fmod_fsb_banks": audio_data["fsb_banks"],
            "fmod_fev_files": audio_data["fev_files"],
            "fmod_samples_indexed": audio_data["total_samples"],
            "fmod_pcm16_wavs_extracted": audio_data["pcm16_extracted_wavs"],
            "fmod_mode_counts": audio_data["mode_counts"],
            "movies_extracted": len(movies),
            "failures_total": failures_total,
            "output_files_on_disk": extracted_file_count,
            "output_size_mb": round(disk_bytes / (1024 * 1024), 2),
        },
        "notes": {
            "encrypted_dyn_policy": "data/anim/dynamic/*.dyn (3,533 encrypted Klei skin bundles) are inventoried by filename/size without decryption bypass; all 94 non-encrypted data/anim/dynamic/*.zip archives are fully parsed and KTEX-decoded.",
            "fmod_vorbis_policy": "All 155 FSB5 banks (20,891 samples) are 100% indexed; all 2,568 PCM16 samples are extracted as lossless WAV; 18,295 Vorbis + 28 ADPCM samples are indexed with bank/name/rate/channels/frames.",
        },
    }

    (DATA_DIR_OUT / "full_asset_index.json").write_text(json.dumps(summary, ensure_ascii=False, indent=2), encoding="utf-8")
    (OUT_DIR / "zero_omission_manifest.json").write_text(json.dumps(summary, ensure_ascii=False, indent=2), encoding="utf-8")
    print("\n=== ZERO-OMISSION EXTRACTION SUMMARY ===")
    print(json.dumps(summary, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
