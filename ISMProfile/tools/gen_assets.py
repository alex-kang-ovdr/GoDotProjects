#!/usr/bin/env python3
"""Port of the Unreal InstancedMeshProfile asset generators, so Godot renders the *same* world.

Ports (bit-for-bit where it matters):
  * FProfileLayout::Generate / Hash   (Source/InstancedMeshProfile/ProfileLayout.cpp)
  * FProfileBlockAppearance atlases   (Source/InstancedMeshProfile/ProfileBlockAppearance.cpp)
  * FRandomStream (UE LCG) used for tree placement

All float math uses numpy.float32 to follow the C++ single-precision evaluation order.
Outputs (under ../godot/assets/):
  layout_<size>_<seed>.bin   header: u32 magic 'ISML', u32 size, i32 seed, u32 count, u32 hash ; then count * (x,y,z,type) u8
  atlas_side.png / atlas_top.png   64x64 RGBA, 4x4 tiles of 16x16
Usage: python gen_assets.py [--seed 1337] [--sizes 24,48,96,144] [--check-hash 48=4078198733,24=711236125]
"""
import argparse
import os
import struct
import sys
import zlib

import numpy as np

F = np.float32
M32 = 0xFFFFFFFF

GRASS, DIRT, SAND, SNOW, LOG, LEAVES, WATER, STONE = 4, 5, 6, 7, 8, 9, 10, 11
PLAINS, FOREST, DESERT, SNOWB, COAST, HIGHLANDS = range(6)


def i32(v):
    v &= M32
    return v - (1 << 32) if v & 0x80000000 else v


def mix_hash(v):
    v &= M32
    v ^= v >> 16
    v = (v * 0x7FEB352D) & M32
    v ^= v >> 15
    v = (v * 0x846CA68B) & M32
    v ^= v >> 16
    return v


def cell_hash(seed, x, y, salt):
    v = ((seed & M32) * 0x9E3779B9) & M32
    v ^= ((x & M32) * 0x85EBCA6B) & M32
    v ^= ((y & M32) * 0xC2B2AE35) & M32
    v ^= salt
    return mix_hash(v)


def hash_noise(seed, x, y):
    return F(cell_hash(seed, x, y, 0x68BC21EB) & 0xFFFF) / F(32767.5) - F(1.0)


def lerp(a, b, t):
    return F(a + F(t * F(b - a)))


def value_noise(seed, x, y, cell):
    gx = int(np.floor(F(x) / F(cell)))
    gy = int(np.floor(F(y) / F(cell)))
    lx = F(x - gx * cell) / F(cell)
    ly = F(y - gy * cell) / F(cell)
    sx = F(F(lx * lx) * F(F(3.0) - F(F(2.0) * lx)))
    sy = F(F(ly * ly) * F(F(3.0) - F(F(2.0) * ly)))
    south = lerp(hash_noise(seed, gx, gy), hash_noise(seed, gx + 1, gy), sx)
    north = lerp(hash_noise(seed, gx, gy + 1), hash_noise(seed, gx + 1, gy + 1), sx)
    return lerp(south, north, sy)


def clampf(v, lo, hi):
    return F(min(max(v, F(lo)), F(hi)))


def sample_climate(seed, size, x, y):
    den = F(max(1, size - 1))
    nx = F(F(F(x) / den) * F(2.0)) - F(1.0)
    ny = F(F(F(y) / den) * F(2.0)) - F(1.0)
    edge = max(abs(nx), abs(ny))
    t = clampf(F(F(nx * F(0.90)) + F(value_noise(seed ^ 0x29D1, x, y, 29) * F(0.25))), -1, 1)
    h = clampf(F(F(-ny * F(0.86)) + F(value_noise(seed ^ 0x61C8, x, y, 31) * F(0.24))), -1, 1)
    c = clampf(F(F(F(F(0.82) - edge) * F(1.75)) + F(value_noise(seed ^ 0x38AB, x, y, 37) * F(0.22))), -1, 1)
    e = value_noise(seed ^ 0x713D, x, y, 19)
    w = value_noise(seed ^ 0x4C91, x, y, 13)
    d = value_noise(seed ^ 0x17A4B, x, y, 23)
    return t, h, c, e, w, d


def choose_biome(clim, size, x, y):
    t, h, c, e, w, d = clim
    center = size // 2
    quarter = size // 4
    far = size - quarter - 1
    core_r = max(3, size // 30)

    def is_core(cx, cy):
        return (x - cx) ** 2 + (y - cy) ** 2 <= core_r ** 2

    if is_core(center, far):
        return PLAINS
    if is_core(center, quarter):
        return FOREST
    if is_core(far, far):
        return DESERT
    if is_core(quarter, center):
        return SNOWB
    hr = max(5, size // 12)
    if (x - quarter) ** 2 + (y - quarter) ** 2 < hr ** 2 or (c > F(0.45) and w > F(0.35)):
        return HIGHLANDS
    if x <= max(5, size // 14) or c < F(-0.05):
        return COAST
    if t < F(-0.28):
        return SNOWB
    if t > F(0.28) and h < F(0.18):
        return DESERT
    if h > F(0.22):
        return FOREST
    return PLAINS


def round_to_int(v):
    return int(np.floor(F(v) + F(0.5)))


def terrain_height(seed, x, y, clim, biome):
    t, h, c, e, w, d = clim
    detail = value_noise(seed ^ 0x5F356, x, y, 7)
    peaks = F(F(3.0) + F(abs(w) * F(4.0))) if biome == HIGHLANDS else F(0.0)
    base = F(4.0)
    base = F(base + F(c * F(1.8)))
    base = F(base - F(e * F(1.3)))
    base = F(base + F(d * F(1.0)))
    base = F(base + F(detail * F(1.4)))
    base = F(base + peaks)
    if biome == COAST:
        return max(0, min(3, round_to_int(F(base - F(1.0)))))
    return max(1, min(11, round_to_int(base)))


def surface_material(seed, x, y, height, clim, biome):
    t, h, c, e, w, d = clim
    var = cell_hash(seed, x, y, 0xA511E9B3)
    if biome == DESERT:
        return STONE if var % 19 == 0 else SAND
    if biome == SNOWB:
        return STONE if (height > 9 and var % 7 == 0) else SNOW
    if biome == COAST:
        return WATER if (height <= 1 and c < F(-0.25)) else SAND
    if biome == HIGHLANDS:
        return SNOW if (t < F(-0.48) and height >= 10 and var % 3 == 0) else STONE
    return DIRT if var % 29 == 0 else GRASS


class RandomStream:
    """UE 5.6 source-engine FRandomStream: LCG, uint32 Seed, mantissa from Seed>>9."""

    def __init__(self, seed):
        self.s = seed & M32

    def fraction(self):
        # Engine/Source/Runtime/Core/Public/Math/RandomStream.h: bits = 0x3F800000 | (Seed >> 9); return f - 1
        self.s = (self.s * 196314165 + 907633515) & M32
        f = struct.unpack('<f', struct.pack('<I', 0x3F800000 | (self.s >> 9)))[0]
        return float(F(f) - F(1.0))

    def rand_range(self, lo, hi):
        rng = (hi - lo) + 1
        return lo + int(np.trunc(F(self.fraction()) * F(rng)))


def add_tree(x, y, ground, mats):
    for z in range(ground + 1, ground + 5):
        mats[(x, y, z)] = LOG
    for z in range(ground + 3, ground + 6):
        radius = 1 if z == ground + 5 else 2
        for dy in range(-radius, radius + 1):
            for dx in range(-radius, radius + 1):
                if abs(dx) + abs(dy) > radius + 1:
                    continue
                cell = (x + dx, y + dy, z)
                if cell not in mats:
                    mats[cell] = LEAVES


def generate(seed, size):
    n = size * size
    clim = [None] * n
    biomes = [0] * n
    heights = [0] * n
    for y in range(size):
        for x in range(size):
            i = y * size + x
            clim[i] = sample_climate(seed, size, x, y)
            biomes[i] = choose_biome(clim[i], size, x, y)
            heights[i] = terrain_height(seed, x, y, clim[i], biomes[i])
    mats = {}
    for y in range(size):
        for x in range(size):
            i = y * size + x
            m = surface_material(seed, x, y, heights[i], clim[i], biomes[i])
            nb = [heights[i - 1] if x > 0 else heights[i],
                  heights[i + 1] if x + 1 < size else heights[i],
                  heights[i - size] if y > 0 else heights[i],
                  heights[i + size] if y + 1 < size else heights[i]]
            exposed = biomes[i] not in (DESERT, COAST) and max(abs(heights[i] - nb[0]), abs(heights[i] - nb[1])) >= 3
            exposed_y = max(abs(heights[i] - nb[2]), abs(heights[i] - nb[3])) >= 3
            if exposed or exposed_y:
                m = STONE
            mats[(x, y, heights[i])] = m
    center = size // 2
    forest_y = size // 4
    fi = forest_y * size + center
    sites = []
    if size >= 17 and biomes[fi] == FOREST:
        sites.append((center, forest_y))
        add_tree(center, forest_y, heights[fi], mats)
    rs = RandomStream(seed ^ 0x51F15E)
    attempts = max(24, min(420, n // 80))
    for _ in range(attempts):
        x = rs.rand_range(4, size - 5)
        y = rs.rand_range(4, size - 5)
        i = y * size + x
        if biomes[i] != FOREST or cell_hash(seed, x, y, 0x3C6EF372) % 5 != 0:
            continue
        if any(abs(x - sx) < 6 and abs(y - sy) < 6 for sx, sy in sites):
            continue
        sites.append((x, y))
        add_tree(x, y, heights[i], mats)
    blocks = [(x, y, z, t) for (x, y, z), t in mats.items()]
    for x, y, z, t in blocks:
        assert 0 <= x < size and 0 <= y < size and 0 <= z <= 16 and 0 <= t <= 11
    blocks.sort(key=lambda b: (b[2], b[1], b[0]))
    return blocks


def layout_hash(blocks):
    r = 2166136261

    def add(v):
        nonlocal r
        for sh in (0, 8, 16, 24):
            r ^= (v >> sh) & 0xFF
            r = (r * 16777619) & M32

    for x, y, z, t in sorted(blocks, key=lambda b: (b[2], b[1], b[0])):
        add(x); add(y); add(z); add(t)
    add(len(blocks))
    return r


# ---------------------------------------------------------------- atlas
def pixel_hash(x, y, salt):
    v = ((x & M32) * 0x45D9F3B + (y & M32) * 0x119DE1F3 + (salt & M32) * 0x27D4EB2D) & M32
    v ^= v >> 16
    v = (v * 0x7FEB352D) & M32
    v ^= v >> 15
    return v


def shade(base, delta):
    return tuple(max(0, min(255, c + delta)) for c in base)


def tile_pixels(t):
    px = {}
    for y in range(16):
        for x in range(16):
            noise = pixel_hash(x, y, t + 17)
            if t == 2:
                ox = x + ((y // 4) & 1) * 4
                mortar = (y % 4 == 0) or (ox % 8 == 0)
                c = (61, 62, 58) if mortar else shade((126, 127, 119), noise % 19 - 9)
            elif t == 3:
                seam = y % 4 == 0
                joint = x == ((y // 4) * 5 + 3) % 16 and y % 4 == 2
                knot = (x == 4 and y == 6) or (x == 12 and y == 13)
                c = (91, 55, 27) if (seam or joint) else shade((166, 112, 55), noise % 17 - 8)
                if knot:
                    c = (83, 48, 24)
            elif t <= 1:
                cx, cy = x // 4, y // 4
                crack = ((x + (pixel_hash(cx, cy, 3) & 1)) % 4 == 0) or ((y + ((pixel_hash(cx, cy, 9) >> 1) & 1)) % 4 == 0)
                c = (54, 55, 52) if crack else shade((119, 120, 114), noise % 31 - 15)
                if t == 1 and not crack and ((noise >> 5) % 5 == 0):
                    c = shade((75, 111, 54), (noise >> 9) % 21 - 10)
            elif t == 4:
                grass = y < 4 or (y < 7 and ((x * 3 + y) % 7 == 0))
                if grass:
                    c = shade((78, 143, 47), (noise >> 5) % 21 - 10)
                else:
                    c = shade((126, 82, 45), noise % 27 - 13)
                    if (noise >> 9) % 13 == 0:
                        c = (78, 53, 34)
            elif t == 5:
                c = shade((133, 88, 48), noise % 29 - 14)
                if (noise >> 7) % 13 == 0:
                    c = (78, 53, 34)
                elif (noise >> 9) % 9 == 0:
                    c = (164, 111, 60)
            elif t == 6:
                band = ((y // 3) & 1) * 5
                c = shade((218, 199, 132), band + noise % 15 - 7)
                if (noise >> 8) % 17 == 0:
                    c = (244, 229, 166)
                elif (noise >> 10) % 19 == 0:
                    c = (174, 151, 94)
            elif t == 7:
                c = shade((236, 244, 245), noise % 13 - 6)
                if (x + y * 3) % 17 == 0:
                    c = (183, 211, 220)
                elif (noise >> 9) % 23 == 0:
                    c = (255, 255, 250)
            elif t == 8:
                groove = (x % 4 == 0) or (x % 7 == 0 and (y // 3) % 2 == 0)
                c = shade((73, 49, 27), noise % 13 - 6) if groove else shade((126, 83, 40), (noise >> 4) % 25 - 12)
                if not groove and (y + x * 2) % 13 == 0:
                    c = (166, 112, 55)
            elif t == 9:
                cl = ((x // 3) + (y // 3) * 2) % 4
                base = (35, 91, 38) if cl == 0 else ((54, 121, 48) if cl == 1 else (68, 139, 52))
                c = shade(base, noise % 19 - 9)
                if (noise >> 8) % 15 == 0:
                    c = (25, 66, 32)
                elif (noise >> 10) % 17 == 0:
                    c = (100, 158, 61)
            elif t == 10:
                wave = (y + ((x // 4) & 1)) % 5
                c = shade((47, 133, 196) if wave == 0 else (39, 104, 174), noise % 13 - 6)
                if wave == 0 and x % 3 != 0:
                    c = (92, 177, 221)
                elif wave == 1 and (x + y) % 7 == 0:
                    c = (143, 207, 232)
            else:
                c = shade((119, 123, 122), noise % 25 - 12)
                if (x + y * 5) % 29 == 0:
                    c = (78, 83, 83)
                elif (noise >> 8) % 21 == 0:
                    c = (153, 157, 154)
            px[(x, y)] = c
    return px


def tile_top_pixels(t):
    if t not in (4, 8):
        return tile_pixels(t)
    px = {}
    for y in range(16):
        for x in range(16):
            noise = pixel_hash(x, y, t + 41)
            if t == 4:
                tuft = (noise >> 5) % 7
                base = (43, 105, 35) if tuft == 0 else ((78, 145, 49) if tuft <= 2 else (96, 164, 55))
                c = shade(base, (noise >> 11) % 17 - 8)
                if (x + 2 * y) % 11 == 0:
                    c = (137, 180, 67)
            else:
                dist = max(abs(x - 7), abs(y - 7))
                ring = dist in (2, 5, 7)
                c = shade((105, 67, 32), noise % 11 - 5) if ring else shade((174, 119, 58), (noise >> 5) % 19 - 9)
                if (x == 7 and y >= 7) or (y == 7 and 7 <= x < 11):
                    c = (81, 51, 28)
            px[(x, y)] = c
    return px


def atlas(top):
    img = np.zeros((64, 64, 4), dtype=np.uint8)
    img[..., 3] = 255
    for t in range(12):
        tile = tile_top_pixels(t) if top else tile_pixels(t)
        tx, ty = (t % 4) * 16, (t // 4) * 16
        for (x, y), c in tile.items():
            img[ty + y, tx + x, :3] = c
    return img


def write_png(path, img):
    h, w, _ = img.shape
    raw = b''.join(b'\x00' + img[y].tobytes() for y in range(h))

    def chunk(tag, data):
        c = struct.pack('>I', len(data)) + tag + data
        return c + struct.pack('>I', zlib.crc32(tag + data) & M32)

    png = b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>IIBBBBB', w, h, 8, 6, 0, 0, 0)) \
        + chunk(b'IDAT', zlib.compress(raw, 9)) + chunk(b'IEND', b'')
    with open(path, 'wb') as f:
        f.write(png)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--seed', type=int, default=1337)
    ap.add_argument('--sizes', default='24,48,96,144')
    ap.add_argument('--check-hash', default='', help='size=hash,... expected Unreal hashes (exit 1 on mismatch)')
    ap.add_argument('--out', default=os.path.join(os.path.dirname(__file__), '..', 'godot', 'assets'))
    a = ap.parse_args()
    os.makedirs(a.out, exist_ok=True)
    expected = {}
    for part in filter(None, a.check_hash.split(',')):
        k, v = part.split('=')
        expected[int(k)] = int(v)
    ok = True
    for size in [int(s) for s in a.sizes.split(',')]:
        blocks = generate(a.seed, size)
        h = layout_hash(blocks)
        status = ''
        if size in expected:
            status = 'MATCH' if expected[size] == h else f'MISMATCH (expected {expected[size]})'
            ok &= expected[size] == h
        print(f'size={size} seed={a.seed} blocks={len(blocks)} hash={h} {status}')
        with open(os.path.join(a.out, f'layout_{size}_{a.seed}.bin'), 'wb') as f:
            f.write(struct.pack('<IIiII', 0x4C4D5349, size, a.seed, len(blocks), h))
            for b in blocks:
                f.write(bytes(b))
    write_png(os.path.join(a.out, 'atlas_side.png'), atlas(False))
    write_png(os.path.join(a.out, 'atlas_top.png'), atlas(True))
    sys.exit(0 if ok else 1)


if __name__ == '__main__':
    main()
