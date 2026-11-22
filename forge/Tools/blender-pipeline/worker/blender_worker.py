#!/usr/bin/env python3
"""
PlayForge Headless Blender Worker (Isolated Process, JSON/File IPC Only).

License & Isolation Policy (Blender GNU GPL v2+/v3, non-AGPL):
- Keep this script strictly as a thin JSON(MeshRecipe v1) -> GLB adapter; DO NOT place proprietary
  PlayForge AI planner or business logic here.
- SaaS server-side execution does not trigger GPL distribution; if externally distributed, this bpy
  script alone is GPL-scoped while generated .glb outputs remain proprietary data.
- Runs inside unmodified official Blender via:
  blender --background --factory-startup --python-exit-code 1 --python blender_worker.py -- --request req.json --response res.json
"""

import json
import math
import os
import random
import sys
import time
import traceback

import bpy
import bmesh
from mathutils import Euler, Matrix, Vector


SCHEMA_VERSION = 1


def parse_cli_args(argv):
    if "--" in argv:
        args = argv[argv.index("--") + 1:]
    else:
        args = argv[1:]
    req_path = None
    res_path = None
    i = 0
    while i < len(args):
        if args[i] == "--request" and i + 1 < len(args):
            req_path = args[i + 1]
            i += 2
        elif args[i] == "--response" and i + 1 < len(args):
            res_path = args[i + 1]
            i += 2
        else:
            i += 1
    if not req_path or not res_path:
        raise ValueError("Missing required arguments: --request <path> --response <path>")
    return os.path.abspath(req_path), os.path.abspath(res_path)


def hex_to_linear_rgba(hex_str, alpha=1.0):
    text = str(hex_str or "#888888").strip().lstrip("#")
    if len(text) == 3:
        text = "".join(c * 2 for c in text)
    if len(text) != 6:
        text = "888888"
    r = int(text[0:2], 16) / 255.0
    g = int(text[2:4], 16) / 255.0
    b = int(text[4:6], 16) / 255.0

    def srgb_to_linear(c):
        return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4

    return (srgb_to_linear(r), srgb_to_linear(g), srgb_to_linear(b), float(alpha))


def reset_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    scene.unit_settings.system = "METRIC"
    scene.unit_settings.scale_length = 1.0


def build_pbr_material(name, hex_color, profile):
    mat = bpy.data.materials.new(name=name)
    mat.use_nodes = True
    nt = mat.node_tree
    bsdf = nt.nodes.get("Principled BSDF")
    if bsdf is None:
        bsdf = nt.nodes.new("ShaderNodeBsdfPrincipled")
    rgba = hex_to_linear_rgba(hex_color, 1.0)
    bsdf.inputs["Base Color"].default_value = rgba
    bsdf.inputs["Metallic"].default_value = float(profile.get("metallic", 0.08))
    bsdf.inputs["Roughness"].default_value = float(profile.get("roughness", 0.55))

    emission_strength = float(profile.get("emissionStrength", 0.0))
    if emission_strength > 0.0:
        if "Emission Color" in bsdf.inputs:
            bsdf.inputs["Emission Color"].default_value = rgba
        elif "Emission" in bsdf.inputs:
            bsdf.inputs["Emission"].default_value = rgba
        if "Emission Strength" in bsdf.inputs:
            bsdf.inputs["Emission Strength"].default_value = emission_strength
    return mat


def create_material_slots(recipe):
    palette = recipe.get("palette", {})
    mat_profile = recipe.get("materialProfile", {})
    variants = recipe.get("variants", {})

    accent_prof = dict(mat_profile.get("accent", {}))
    if variants.get("glowing"):
        accent_prof["emissionStrength"] = max(float(accent_prof.get("emissionStrength", 0.0)), 2.2)

    mats = {
        "primary": build_pbr_material("Mat_Primary", palette.get("primary", "#8b5a2b"), mat_profile.get("primary", {})),
        "secondary": build_pbr_material("Mat_Secondary", palette.get("secondary", "#d4af37"), mat_profile.get("secondary", {})),
        "accent": build_pbr_material("Mat_Accent", palette.get("accent", "#4fc3f7"), accent_prof),
        "snow": build_pbr_material("Mat_Snow", "#f0f6ff", {"metallic": 0.0, "roughness": 0.72, "emissionStrength": 0.05}),
        "dark": build_pbr_material("Mat_Dark", "#20252e", {"metallic": 0.25, "roughness": 0.5, "emissionStrength": 0.0}),
    }
    return mats


def create_mesh_object(name, bm, material, location=(0, 0, 0), rotation_deg=(0, 0, 0), smooth=False, bevel_width=0.0):
    if bevel_width > 0.0 and len(bm.edges) > 0:
        bmesh.ops.bevel(
            bm,
            geom=list(bm.edges),
            offset=bevel_width,
            segments=2,
            affect="EDGES",
            clamp_overlap=True,
        )
    bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))
    mesh = bpy.data.meshes.new(name)
    bm.to_mesh(mesh)
    bm.free()

    if smooth:
        for poly in mesh.polygons:
            poly.use_smooth = True

    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    if material is not None:
        obj.data.materials.append(material)
    obj.location = Vector(location)
    obj.rotation_euler = Euler(tuple(math.radians(a) for a in rotation_deg), "XYZ")
    return obj


def make_box(name, size, loc, mat, rot_deg=(0, 0, 0), bevel=0.0, smooth=False):
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    sx, sy, sz = size
    bmesh.ops.scale(bm, vec=(sx, sy, sz), verts=bm.verts)
    return create_mesh_object(name, bm, mat, location=loc, rotation_deg=rot_deg, smooth=smooth, bevel_width=bevel)


def make_cylinder(name, radius1, radius2, depth, loc, mat, segments=16, rot_deg=(0, 0, 0), bevel=0.0, smooth=True):
    bm = bmesh.new()
    bmesh.ops.create_cone(
        bm,
        cap_ends=True,
        cap_tris=False,
        segments=max(4, int(segments)),
        radius1=max(0.001, float(radius1)),
        radius2=max(0.0, float(radius2)),
        depth=max(0.002, float(depth)),
    )
    return create_mesh_object(name, bm, mat, location=loc, rotation_deg=rot_deg, smooth=smooth, bevel_width=bevel)


def make_icosphere(name, radius, loc, mat, subdivisions=2, scale=(1, 1, 1), jitter=0.0, rng=None, smooth=False):
    bm = bmesh.new()
    bmesh.ops.create_icosphere(bm, subdivisions=max(1, min(3, int(subdivisions))), radius=max(0.01, float(radius)))
    if jitter > 0.0 and rng is not None:
        for v in bm.verts:
            factor = 1.0 + rng.uniform(-jitter, jitter)
            v.co.x *= factor
            v.co.y *= factor
            v.co.z *= factor
    bmesh.ops.scale(bm, vec=scale, verts=bm.verts)
    return create_mesh_object(name, bm, mat, location=loc, smooth=smooth)


def make_uv_sphere(name, radius, loc, mat, segments=16, rings=10, scale=(1, 1, 1), smooth=True):
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=max(6, int(segments)), v_segments=max(4, int(rings)), radius=max(0.01, float(radius)))
    bmesh.ops.scale(bm, vec=scale, verts=bm.verts)
    return create_mesh_object(name, bm, mat, location=loc, smooth=smooth)


def make_torus(name, major_r, minor_r, loc, mat, major_seg=20, minor_seg=10, rot_deg=(0, 0, 0), smooth=True):
    bm = bmesh.new()
    rings = []
    for i in range(major_seg):
        theta = (2.0 * math.pi * i) / major_seg
        ct, st = math.cos(theta), math.sin(theta)
        ring = []
        for j in range(minor_seg):
            phi = (2.0 * math.pi * j) / minor_seg
            r = major_r + minor_r * math.cos(phi)
            x = r * ct
            y = r * st
            z = minor_r * math.sin(phi)
            ring.append(bm.verts.new((x, y, z)))
        rings.append(ring)
    for i in range(major_seg):
        r1 = rings[i]
        r2 = rings[(i + 1) % major_seg]
        for j in range(minor_seg):
            jn = (j + 1) % minor_seg
            bm.faces.new((r1[j], r2[j], r2[jn], r1[jn]))
    return create_mesh_object(name, bm, mat, location=loc, rotation_deg=rot_deg, smooth=smooth)


def detail_segments(detail_level, low=8, med=14, high=24):
    if detail_level == "low":
        return low
    if detail_level == "high":
        return high
    return med


# --- Procedural Game Prop Archetypes (Blender Z-up; exported to glTF Y-up) ---

def build_chest(dims, mats, detail, variants, rng):
    w, d, h = dims["width"], dims["depth"], dims["height"]
    objs = []
    base_h = h * 0.60
    lid_h = h * 0.40
    # Main chest body
    objs.append(make_box("Chest_Body", (w, d, base_h), (0, 0, base_h * 0.5), mats["primary"], bevel=min(w, d) * 0.03))
    # Vaulted lid (half cylinder + flat trim)
    lid_rot = (-32, 0, 0) if variants.get("openLid") else (0, 0, 0)
    lid_z = base_h + lid_h * 0.45
    objs.append(make_box("Chest_LidBase", (w * 1.02, d * 1.02, lid_h * 0.5), (0, 0, base_h + lid_h * 0.22), mats["primary"], rot_deg=lid_rot, bevel=0.02))
    objs.append(make_cylinder("Chest_LidArch", d * 0.48, d * 0.48, w * 1.01, (0, 0, lid_z), mats["primary"], segments=detail_segments(detail, 10, 14, 20), rot_deg=(0, 90, 0)))
    # Metallic reinforcement bands
    for bx in (-w * 0.36, 0.0, w * 0.36):
        objs.append(make_box(f"Chest_Band_{bx:.2f}", (w * 0.09, d * 1.06, base_h * 0.96), (bx, 0, base_h * 0.5), mats["secondary"], bevel=0.01))
        objs.append(make_cylinder(f"Chest_LidBand_{bx:.2f}", d * 0.51, d * 0.51, w * 0.09, (bx, 0, lid_z), mats["secondary"], segments=detail_segments(detail, 10, 14, 20), rot_deg=(0, 90, 0)))
    # Bottom trim & lock clasp + glowing gem
    objs.append(make_box("Chest_Rim", (w * 1.05, d * 1.05, h * 0.08), (0, 0, base_h), mats["secondary"], bevel=0.01))
    objs.append(make_box("Chest_LockPlate", (w * 0.18, d * 0.08, h * 0.22), (0, -d * 0.53, base_h * 0.92), mats["secondary"], bevel=0.01))
    objs.append(make_icosphere("Chest_Gem", min(w, h) * 0.08, (0, -d * 0.57, base_h * 0.92), mats["accent"], subdivisions=1, smooth=False))
    return objs


def build_crate(dims, mats, detail, variants, rng):
    w, d, h = dims["width"], dims["depth"], dims["height"]
    objs = []
    frame = min(w, d, h) * 0.11
    objs.append(make_box("Crate_Core", (w * 0.92, d * 0.92, h * 0.92), (0, 0, h * 0.5), mats["primary"], bevel=frame * 0.12))
    # 4 vertical corner posts
    for sx in (-1, 1):
        for sy in (-1, 1):
            objs.append(make_box(f"Crate_Post_{sx}_{sy}", (frame, frame, h), (sx * (w * 0.5 - frame * 0.5), sy * (d * 0.5 - frame * 0.5), h * 0.5), mats["secondary"], bevel=0.008))
    # Top and bottom rim rails
    for sz in (frame * 0.5, h - frame * 0.5):
        for sy in (-1, 1):
            objs.append(make_box(f"Crate_RailX_{sy}_{sz:.2f}", (w, frame, frame), (0, sy * (d * 0.5 - frame * 0.5), sz), mats["secondary"]))
        for sx in (-1, 1):
            objs.append(make_box(f"Crate_RailY_{sx}_{sz:.2f}", (frame, d, frame), (sx * (w * 0.5 - frame * 0.5), 0, sz), mats["secondary"]))
    # Diagonal cross braces on front/back
    diag_len = math.hypot(w - frame * 2, h - frame * 2)
    diag_ang = math.degrees(math.atan2(h - frame * 2, w - frame * 2))
    for sy in (-1, 1):
        objs.append(make_box(f"Crate_Brace_{sy}", (diag_len, frame * 0.55, frame * 0.75), (0, sy * (d * 0.47), h * 0.5), mats["secondary"], rot_deg=(0, diag_ang, 0)))
    return objs


def build_tree(dims, mats, detail, variants, rng):
    w, d, h = dims["width"], dims["depth"], dims["height"]
    objs = []
    segs = detail_segments(detail, 7, 10, 16)
    trunk_h = h * 0.42
    trunk_r = min(w, d) * 0.14
    objs.append(make_cylinder("Tree_Trunk", trunk_r * 1.25, trunk_r * 0.65, trunk_h, (0, 0, trunk_h * 0.5), mats["secondary"], segments=segs, smooth=False))

    if variants.get("pine") or variants.get("snowy"):
        tiers = 3 if detail != "high" else 4
        for i in range(tiers):
            t = i / max(1, tiers - 1)
            cone_r = (min(w, d) * 0.52) * (1.0 - t * 0.48)
            cone_h = h * (0.34 - t * 0.04)
            z_center = trunk_h * 0.85 + i * (h * 0.18) + cone_h * 0.35
            objs.append(make_cylinder(f"Tree_PineTier_{i}", cone_r, 0.01, cone_h, (0, 0, z_center), mats["primary"], segments=segs, smooth=False))
            if variants.get("snowy"):
                objs.append(make_cylinder(f"Tree_SnowCap_{i}", cone_r * 0.78, 0.01, cone_h * 0.45, (0, 0, z_center + cone_h * 0.32), mats["snow"], segments=segs, smooth=False))
    else:
        canopy_r = min(w, d) * 0.36
        base_z = trunk_h + canopy_r * 0.55
        offsets = [
            (0.0, 0.0, canopy_r * 0.38, 1.05),
            (canopy_r * 0.62, canopy_r * 0.2, 0.0, 0.78),
            (-canopy_r * 0.58, canopy_r * 0.25, 0.05, 0.82),
            (0.05, -canopy_r * 0.6, 0.02, 0.76),
            (-0.15, 0.15, canopy_r * 0.85, 0.68),
        ]
        for idx, (ox, oy, oz, sc) in enumerate(offsets):
            objs.append(make_icosphere(f"Tree_Canopy_{idx}", canopy_r * sc, (ox, oy, base_z + oz), mats["primary"], subdivisions=2 if detail != "low" else 1, jitter=0.08, rng=rng, smooth=False))
        if variants.get("glowing"):
            objs.append(make_icosphere("Tree_GlowFruit", canopy_r * 0.16, (canopy_r * 0.5, -canopy_r * 0.4, base_z - canopy_r * 0.1), mats["accent"], subdivisions=1, smooth=True))
    return objs


def build_sword(dims, mats, detail, variants, rng):
    w, d, h = dims["width"], dims["depth"], dims["height"]
    objs = []
    blade_len = h * 0.72
    grip_len = h * 0.20
    blade_w = max(0.06, min(w, h * 0.14))
    blade_d = max(0.02, blade_w * 0.32)

    # Pommel + grip + guard + tapered blade + tip
    pommel_r = blade_w * 0.45
    objs.append(make_icosphere("Sword_Pommel", pommel_r, (0, 0, pommel_r), mats["secondary"], subdivisions=2, smooth=True))
    objs.append(make_cylinder("Sword_Grip", blade_w * 0.24, blade_w * 0.27, grip_len, (0, 0, pommel_r * 1.6 + grip_len * 0.5), mats["dark"], segments=10, smooth=True))
    guard_z = pommel_r * 1.6 + grip_len
    objs.append(make_box("Sword_Guard", (blade_w * 3.1, blade_d * 2.1, blade_w * 0.42), (0, 0, guard_z), mats["secondary"], bevel=blade_d * 0.25))
    objs.append(make_icosphere("Sword_GuardGem", blade_w * 0.28, (0, 0, guard_z), mats["accent"], subdivisions=1, smooth=False))

    # Blade body (diamond cross-section prism)
    bm = bmesh.new()
    z0 = guard_z + blade_w * 0.2
    z1 = z0 + blade_len * 0.82
    z2 = z0 + blade_len
    hw0, hd0 = blade_w * 0.5, blade_d * 0.5
    hw1, hd1 = blade_w * 0.34, blade_d * 0.38
    v0 = [bm.verts.new((-hw0, 0, z0)), bm.verts.new((0, hd0, z0)), bm.verts.new((hw0, 0, z0)), bm.verts.new((0, -hd0, z0))]
    v1 = [bm.verts.new((-hw1, 0, z1)), bm.verts.new((0, hd1, z1)), bm.verts.new((hw1, 0, z1)), bm.verts.new((0, -hd1, z1))]
    tip = bm.verts.new((0, 0, z2))
    bm.faces.new(list(reversed(v0)))
    for i in range(4):
        ni = (i + 1) % 4
        bm.faces.new((v0[i], v0[ni], v1[ni], v1[i]))
        bm.faces.new((v1[i], v1[ni], tip))
    blade_mat = mats["accent"] if variants.get("glowing") else mats["primary"]
    objs.append(create_mesh_object("Sword_Blade", bm, blade_mat, smooth=False))
    return objs


def build_staff(dims, mats, detail, variants, rng):
    w, d, h = dims["width"], dims["depth"], dims["height"]
    objs = []
    segs = detail_segments(detail, 8, 12, 18)
    shaft_r = max(0.025, min(w, d) * 0.14)
    shaft_h = h * 0.78
    objs.append(make_cylinder("Staff_Shaft", shaft_r * 0.85, shaft_r * 1.1, shaft_h, (0, 0, shaft_h * 0.5), mats["primary"], segments=segs))
    objs.append(make_cylinder("Staff_Collar", shaft_r * 1.65, shaft_r * 1.35, h * 0.08, (0, 0, shaft_h), mats["secondary"], segments=segs))
    orb_r = max(0.08, min(w, d) * 0.36)
    orb_z = shaft_h + orb_r * 1.35
    objs.append(make_icosphere("Staff_Orb", orb_r, (0, 0, orb_z), mats["accent"], subdivisions=2, smooth=True))
    objs.append(make_torus("Staff_Ring", orb_r * 1.35, shaft_r * 0.45, (0, 0, orb_z), mats["secondary"], rot_deg=(75, 25, 0)))
    return objs


def build_tower(dims, mats, detail, variants, rng):
    w, d, h = dims["width"], dims["depth"], dims["height"]
    objs = []
    segs = detail_segments(detail, 8, 12, 16)
    r = min(w, d) * 0.45
    body_h = h * 0.68
    roof_h = h * 0.30
    objs.append(make_cylinder("Tower_Base", r * 1.15, r * 0.95, h * 0.14, (0, 0, h * 0.07), mats["secondary"], segments=segs, smooth=False))
    objs.append(make_cylinder("Tower_Shaft", r * 0.95, r * 0.85, body_h, (0, 0, h * 0.12 + body_h * 0.5), mats["primary"], segments=segs, smooth=False))
    crown_z = h * 0.12 + body_h
    objs.append(make_cylinder("Tower_Crown", r * 1.05, r * 1.05, h * 0.08, (0, 0, crown_z), mats["secondary"], segments=segs, smooth=False))
    # Battlements
    for i in range(6):
        ang = (2.0 * math.pi * i) / 6.0
        mx = math.cos(ang) * r * 0.92
        my = math.sin(ang) * r * 0.92
        objs.append(make_box(f"Tower_Merlon_{i}", (r * 0.35, r * 0.28, h * 0.09), (mx, my, crown_z + h * 0.07), mats["primary"], rot_deg=(0, 0, math.degrees(ang))))
    # Conical roof + spire
    objs.append(make_cylinder("Tower_Roof", r * 1.08, 0.02, roof_h, (0, 0, crown_z + roof_h * 0.52), mats["secondary"], segments=segs, smooth=False))
    # Glowing window + doorway
    objs.append(make_box("Tower_Door", (r * 0.55, r * 0.35, h * 0.22), (0, -r * 0.92, h * 0.15), mats["dark"]))
    objs.append(make_box("Tower_Window", (r * 0.32, r * 0.28, h * 0.14), (0, -r * 0.85, h * 0.56), mats["accent"]))
    return objs


def build_house(dims, mats, detail, variants, rng):
    w, d, h = dims["width"], dims["depth"], dims["height"]
    objs = []
    wall_h = h * 0.58
    roof_h = h * 0.42
    objs.append(make_box("House_Foundation", (w * 1.06, d * 1.06, h * 0.08), (0, 0, h * 0.04), mats["dark"]))
    objs.append(make_box("House_Walls", (w, d, wall_h), (0, 0, h * 0.08 + wall_h * 0.5), mats["primary"], bevel=0.02))
    # Gable roof prism
    bm = bmesh.new()
    hw, hd = w * 0.58, d * 0.58
    z0 = h * 0.08 + wall_h - 0.02
    z1 = z0 + roof_h
    p = [
        bm.verts.new((-hw, -hd, z0)),
        bm.verts.new((hw, -hd, z0)),
        bm.verts.new((0, -hd, z1)),
        bm.verts.new((-hw, hd, z0)),
        bm.verts.new((hw, hd, z0)),
        bm.verts.new((0, hd, z1)),
    ]
    bm.faces.new((p[0], p[1], p[2]))
    bm.faces.new((p[5], p[4], p[3]))
    bm.faces.new((p[0], p[3], p[4], p[1]))
    bm.faces.new((p[1], p[4], p[5], p[2]))
    bm.faces.new((p[2], p[5], p[3], p[0]))
    objs.append(create_mesh_object("House_Roof", bm, mats["secondary"], smooth=False))
    # Door, windows, chimney
    objs.append(make_box("House_Door", (w * 0.22, d * 0.08, wall_h * 0.58), (0, -d * 0.51, h * 0.08 + wall_h * 0.29), mats["dark"]))
    for sx in (-w * 0.28, w * 0.28):
        objs.append(make_box(f"House_Window_{sx:.2f}", (w * 0.16, d * 0.07, wall_h * 0.24), (sx, -d * 0.51, h * 0.08 + wall_h * 0.55), mats["accent"]))
    objs.append(make_box("House_Chimney", (w * 0.14, d * 0.14, roof_h * 0.9), (w * 0.26, d * 0.12, z0 + roof_h * 0.55), mats["dark"]))
    return objs


def build_pillar(dims, mats, detail, variants, rng):
    w, d, h = dims["width"], dims["depth"], dims["height"]
    objs = []
    segs = detail_segments(detail, 8, 12, 20)
    r = min(w, d) * 0.42
    objs.append(make_box("Pillar_Plinth", (w, d, h * 0.12), (0, 0, h * 0.06), mats["secondary"], bevel=0.02))
    objs.append(make_cylinder("Pillar_BaseRing", r * 1.15, r * 0.95, h * 0.08, (0, 0, h * 0.16), mats["secondary"], segments=segs, smooth=False))
    objs.append(make_cylinder("Pillar_Shaft", r * 0.88, r * 0.82, h * 0.64, (0, 0, h * 0.52), mats["primary"], segments=segs, smooth=False))
    objs.append(make_cylinder("Pillar_CapitalRing", r * 0.9, r * 1.18, h * 0.08, (0, 0, h * 0.88), mats["secondary"], segments=segs, smooth=False))
    objs.append(make_box("Pillar_Abacus", (w * 1.02, d * 1.02, h * 0.08), (0, 0, h * 0.96), mats["secondary"], bevel=0.015))
    return objs


def build_rock(dims, mats, detail, variants, rng):
    w, d, h = dims["width"], dims["depth"], dims["height"]
    objs = []
    sub = 2 if detail != "low" else 1
    objs.append(make_icosphere("Rock_Main", 0.5, (0, 0, h * 0.45), mats["primary"], subdivisions=sub, scale=(w, d, h * 0.9), jitter=0.22, rng=rng, smooth=False))
    objs.append(make_icosphere("Rock_SideA", 0.34, (w * 0.28, -d * 0.15, h * 0.28), mats["secondary"], subdivisions=1, scale=(w * 0.7, d * 0.7, h * 0.6), jitter=0.24, rng=rng, smooth=False))
    objs.append(make_icosphere("Rock_SideB", 0.26, (-w * 0.26, d * 0.18, h * 0.22), mats["primary"], subdivisions=1, scale=(w * 0.6, d * 0.6, h * 0.5), jitter=0.24, rng=rng, smooth=False))
    return objs


def build_crystal(dims, mats, detail, variants, rng):
    w, d, h = dims["width"], dims["depth"], dims["height"]
    objs = []
    base_r = min(w, d) * 0.48
    objs.append(make_icosphere("Crystal_RockBase", base_r, (0, 0, h * 0.12), mats["secondary"], subdivisions=1, scale=(1.1, 1.0, 0.45), jitter=0.18, rng=rng, smooth=False))
    shards = [
        (0.0, 0.0, h * 0.48, min(w, d) * 0.22, h * 0.86, (4, -3, 12)),
        (base_r * 0.42, base_r * 0.15, h * 0.34, min(w, d) * 0.15, h * 0.58, (-18, 22, 30)),
        (-base_r * 0.38, -base_r * 0.2, h * 0.30, min(w, d) * 0.14, h * 0.52, (20, -24, -15)),
        (-base_r * 0.12, base_r * 0.40, h * 0.26, min(w, d) * 0.12, h * 0.44, (26, 12, 50)),
    ]
    for idx, (sx, sy, sz, sr, sh, rot) in enumerate(shards):
        bm = bmesh.new()
        bmesh.ops.create_cone(bm, cap_ends=True, cap_tris=True, segments=6, radius1=sr, radius2=sr * 0.72, depth=sh * 0.72)
        bmesh.ops.translate(bm, vec=(0, 0, -sh * 0.14), verts=bm.verts)
        # Add pointed crystal tip
        top_verts = [v for v in bm.verts if v.co.z > sh * 0.18]
        tip = bm.verts.new((0, 0, sh * 0.5))
        if len(top_verts) >= 3:
            ordered = sorted(top_verts, key=lambda v: math.atan2(v.co.y, v.co.x))
            for i in range(len(ordered)):
                bm.faces.new((ordered[i], ordered[(i + 1) % len(ordered)], tip))
        objs.append(create_mesh_object(f"Crystal_Shard_{idx}", bm, mats["accent"], location=(sx, sy, sz), rotation_deg=rot, smooth=False))
    return objs


def build_barrel(dims, mats, detail, variants, rng):
    w, d, h = dims["width"], dims["depth"], dims["height"]
    objs = []
    segs = detail_segments(detail, 10, 16, 24)
    r = min(w, d) * 0.46
    # Bulged barrel using 3 stacked tapered cylinders
    objs.append(make_cylinder("Barrel_Bottom", r * 0.88, r, h * 0.34, (0, 0, h * 0.17), mats["primary"], segments=segs, smooth=True))
    objs.append(make_cylinder("Barrel_Mid", r, r, h * 0.34, (0, 0, h * 0.50), mats["primary"], segments=segs, smooth=True))
    objs.append(make_cylinder("Barrel_Top", r, r * 0.88, h * 0.34, (0, 0, h * 0.83), mats["primary"], segments=segs, smooth=True))
    # Metallic hoops
    for hz, hr in ((h * 0.18, r * 0.96), (h * 0.50, r * 1.03), (h * 0.82, r * 0.96)):
        objs.append(make_cylinder(f"Barrel_Hoop_{hz:.2f}", hr, hr, h * 0.06, (0, 0, hz), mats["secondary"], segments=segs, smooth=True))
    return objs


def build_lantern(dims, mats, detail, variants, rng):
    w, d, h = dims["width"], dims["depth"], dims["height"]
    objs = []
    r = min(w, d) * 0.42
    objs.append(make_cylinder("Lantern_Base", r * 1.05, r * 0.85, h * 0.14, (0, 0, h * 0.07), mats["secondary"], segments=8, smooth=False))
    objs.append(make_cylinder("Lantern_Core", r * 0.62, r * 0.62, h * 0.48, (0, 0, h * 0.38), mats["accent"], segments=12, smooth=True))
    for i in range(4):
        ang = (math.pi * 0.5) * i + math.pi * 0.25
        objs.append(make_box(f"Lantern_Strut_{i}", (r * 0.16, r * 0.16, h * 0.52), (math.cos(ang) * r * 0.72, math.sin(ang) * r * 0.72, h * 0.38), mats["secondary"]))
    objs.append(make_cylinder("Lantern_Cap", r * 1.08, r * 0.32, h * 0.20, (0, 0, h * 0.72), mats["secondary"], segments=8, smooth=False))
    objs.append(make_torus("Lantern_Handle", r * 0.32, r * 0.07, (0, 0, h * 0.90), mats["secondary"], rot_deg=(90, 0, 0)))
    return objs


def build_table(dims, mats, detail, variants, rng):
    w, d, h = dims["width"], dims["depth"], dims["height"]
    objs = []
    top_t = h * 0.10
    leg_h = h - top_t
    leg_w = min(w, d) * 0.10
    objs.append(make_box("Table_Top", (w, d, top_t), (0, 0, h - top_t * 0.5), mats["primary"], bevel=top_t * 0.18))
    for sx in (-1, 1):
        for sy in (-1, 1):
            objs.append(make_box(f"Table_Leg_{sx}_{sy}", (leg_w, leg_w, leg_h), (sx * (w * 0.42), sy * (d * 0.40), leg_h * 0.5), mats["secondary"], bevel=leg_w * 0.1))
    objs.append(make_box("Table_ApronX", (w * 0.84, d * 0.76, h * 0.09), (0, 0, leg_h - h * 0.06), mats["secondary"]))
    return objs


def build_robot(dims, mats, detail, variants, rng):
    w, d, h = dims["width"], dims["depth"], dims["height"]
    objs = []
    # Feet & legs
    for sx in (-1, 1):
        objs.append(make_box(f"Robot_Leg_{sx}", (w * 0.22, d * 0.28, h * 0.34), (sx * w * 0.18, 0, h * 0.17), mats["secondary"], bevel=0.02))
        objs.append(make_box(f"Robot_Arm_{sx}", (w * 0.18, d * 0.22, h * 0.34), (sx * w * 0.44, 0, h * 0.54), mats["secondary"], bevel=0.02))
    # Torso + glowing chest core
    objs.append(make_box("Robot_Torso", (w * 0.58, d * 0.42, h * 0.36), (0, 0, h * 0.54), mats["primary"], bevel=0.03))
    objs.append(make_cylinder("Robot_Core", min(w, h) * 0.08, min(w, h) * 0.08, d * 0.08, (0, -d * 0.22, h * 0.56), mats["accent"], rot_deg=(90, 0, 0)))
    # Head + visor + antenna
    objs.append(make_box("Robot_Head", (w * 0.38, d * 0.36, h * 0.22), (0, 0, h * 0.85), mats["primary"], bevel=0.03))
    objs.append(make_box("Robot_Visor", (w * 0.30, d * 0.06, h * 0.08), (0, -d * 0.19, h * 0.86), mats["accent"], bevel=0.01))
    objs.append(make_cylinder("Robot_Antenna", w * 0.025, w * 0.015, h * 0.10, (0, 0, h * 0.98), mats["secondary"]))
    objs.append(make_uv_sphere("Robot_AntennaTip", w * 0.045, (0, 0, h * 1.03), mats["accent"]))
    return objs


def build_car(dims, mats, detail, variants, rng):
    w, d, h = dims["width"], dims["depth"], dims["height"]
    objs = []
    segs = detail_segments(detail, 12, 18, 24)
    wheel_r = h * 0.24
    wheel_w = w * 0.18
    # Lower body & cabin
    objs.append(make_box("Car_Body", (w * 0.92, d, h * 0.38), (0, 0, wheel_r + h * 0.18), mats["primary"], bevel=0.04))
    objs.append(make_box("Car_Cabin", (w * 0.78, d * 0.52, h * 0.34), (0, d * 0.05, wheel_r + h * 0.50), mats["secondary"], bevel=0.04))
    # 4 wheels
    for sx in (-1, 1):
        for sy in (-1, 1):
            objs.append(make_cylinder(f"Car_Wheel_{sx}_{sy}", wheel_r, wheel_r, wheel_w, (sx * (w * 0.45), sy * (d * 0.30), wheel_r), mats["dark"], segments=segs, rot_deg=(0, 90, 0)))
    # Glowing headlights
    for sx in (-w * 0.28, w * 0.28):
        objs.append(make_box(f"Car_Headlight_{sx:.2f}", (w * 0.16, d * 0.04, h * 0.10), (sx, -d * 0.51, wheel_r + h * 0.20), mats["accent"]))
    return objs


def make_capsule(name, radius, total_height, loc, mat, segments=14, rot_deg=(0, 0, 0), smooth=True):
    bm = bmesh.new()
    r = max(0.008, float(radius))
    h = max(r * 2.02, float(total_height))
    cyl_h = max(0.004, h - r * 2.0)
    bmesh.ops.create_cone(
        bm,
        cap_ends=False,
        cap_tris=False,
        segments=max(6, int(segments)),
        radius1=r,
        radius2=r,
        depth=cyl_h,
    )
    top_cap = bmesh.ops.create_uvsphere(bm, u_segments=max(6, int(segments)), v_segments=8, radius=r)
    bmesh.ops.translate(bm, vec=(0, 0, cyl_h * 0.5), verts=top_cap["verts"])
    bot_cap = bmesh.ops.create_uvsphere(bm, u_segments=max(6, int(segments)), v_segments=8, radius=r)
    bmesh.ops.translate(bm, vec=(0, 0, -cyl_h * 0.5), verts=bot_cap["verts"])
    return create_mesh_object(name, bm, mat, location=loc, rotation_deg=rot_deg, smooth=smooth)


def make_wedge(name, size, loc, mat, rot_deg=(0, 0, 0), bevel=0.0, smooth=False):
    bm = bmesh.new()
    hx, hy, hz = size[0] * 0.5, size[1] * 0.5, size[2] * 0.5
    v0 = bm.verts.new((-hx, -hy, -hz))
    v1 = bm.verts.new((hx, -hy, -hz))
    v2 = bm.verts.new((hx, hy, -hz))
    v3 = bm.verts.new((-hx, hy, -hz))
    v4 = bm.verts.new((-hx, hy, hz))
    v5 = bm.verts.new((hx, hy, hz))
    bm.faces.new((v0, v3, v2, v1))  # bottom
    bm.faces.new((v3, v4, v5, v2))  # back
    bm.faces.new((v0, v1, v5, v4))  # slope
    bm.faces.new((v0, v4, v3))      # left
    bm.faces.new((v1, v2, v5))      # right
    return create_mesh_object(name, bm, mat, location=loc, rotation_deg=rot_deg, smooth=smooth, bevel_width=bevel)


def build_custom_parts(parts, mats):
    objs = []
    part_mat_cache = {}
    for idx, part in enumerate(parts):
        name = part.get("name") or f"Part_{idx + 1}"
        shape = part.get("shape", "box")
        pos = tuple(float(v) for v in part.get("position", [0, 0, 0]))
        rot = tuple(float(v) for v in part.get("rotationDeg", [0, 0, 0]))
        sc = tuple(float(v) for v in part.get("scale", [1, 1, 1]))
        base_mat = mats.get(part.get("materialSlot", "primary"), mats["primary"])
        if any(k in part for k in ("color", "metallic", "roughness", "emissionStrength")):
            hex_col = part.get("color") or "#888888"
            prof = {
                "metallic": float(part.get("metallic", 0.2)),
                "roughness": float(part.get("roughness", 0.45)),
                "emissionStrength": float(part.get("emissionStrength", 0.0)),
            }
            cache_key = (hex_col, round(prof["metallic"], 2), round(prof["roughness"], 2), round(prof["emissionStrength"], 2))
            if cache_key not in part_mat_cache:
                part_mat_cache[cache_key] = build_pbr_material(f"Mat_Part_{len(part_mat_cache) + 1}", hex_col, prof)
            mat = part_mat_cache[cache_key]
        else:
            mat = base_mat
        bevel = float(part.get("bevel", 0.0))
        smooth = bool(part.get("smooth", False))
        segs = int(part.get("segments", 16))
        top_ratio = float(part.get("topRadiusRatio", 1.0))

        if shape == "box":
            objs.append(make_box(name, sc, pos, mat, rot_deg=rot, bevel=bevel, smooth=smooth))
        elif shape == "cylinder":
            r_bot = sc[0] * 0.5
            r_top = max(0.0, r_bot * top_ratio)
            objs.append(make_cylinder(name, r_bot, r_top, sc[2], pos, mat, segments=segs, rot_deg=rot, bevel=bevel, smooth=smooth))
        elif shape == "cone":
            objs.append(make_cylinder(name, sc[0] * 0.5, 0.0, sc[2], pos, mat, segments=segs, rot_deg=rot, smooth=smooth))
        elif shape == "sphere":
            objs.append(make_uv_sphere(name, 0.5, pos, mat, segments=segs, scale=sc, smooth=True))
        elif shape == "icosphere":
            objs.append(make_icosphere(name, 0.5, pos, mat, subdivisions=2, scale=sc, smooth=smooth))
        elif shape == "torus":
            objs.append(make_torus(name, sc[0] * 0.5, max(0.02, sc[2] * 0.18), pos, mat, major_seg=segs, rot_deg=rot, smooth=True))
        elif shape == "capsule":
            r = max(0.01, min(sc[0], sc[1]) * 0.5)
            objs.append(make_capsule(name, r, sc[2], pos, mat, segments=segs, rot_deg=rot, smooth=True))
        elif shape == "wedge":
            objs.append(make_wedge(name, sc, pos, mat, rot_deg=rot, bevel=bevel, smooth=smooth))
    return objs


ARCHETYPE_BUILDERS = {
    "chest": build_chest,
    "crate": build_crate,
    "tree": build_tree,
    "sword": build_sword,
    "staff": build_staff,
    "tower": build_tower,
    "house": build_house,
    "pillar": build_pillar,
    "rock": build_rock,
    "crystal": build_crystal,
    "barrel": build_barrel,
    "lantern": build_lantern,
    "table": build_table,
    "robot": build_robot,
    "car": build_car,
}


def compute_world_bounds(objects):
    min_v = Vector((float("inf"), float("inf"), float("inf")))
    max_v = Vector((float("-inf"), float("-inf"), float("-inf")))
    bpy.context.view_layer.update()
    for obj in objects:
        if obj.type != "MESH":
            continue
        for corner in obj.bound_box:
            wc = obj.matrix_world @ Vector(corner)
            min_v.x = min(min_v.x, wc.x)
            min_v.y = min(min_v.y, wc.y)
            min_v.z = min(min_v.z, wc.z)
            max_v.x = max(max_v.x, wc.x)
            max_v.y = max(max_v.y, wc.y)
            max_v.z = max(max_v.z, wc.z)
    if not math.isfinite(min_v.x):
        return Vector((0, 0, 0)), Vector((0, 0, 0))
    return min_v, max_v


def normalize_and_parent(root_name, objects, mode="bottom_center"):
    min_v, max_v = compute_world_bounds(objects)
    if mode == "bottom_center":
        cx = (min_v.x + max_v.x) * 0.5
        cy = (min_v.y + max_v.y) * 0.5
        offset = Vector((-cx, -cy, -min_v.z))
        for obj in objects:
            obj.location += offset
    root = bpy.data.objects.new(root_name, None)
    bpy.context.collection.objects.link(root)
    for obj in objects:
        obj.parent = root
    bpy.context.view_layer.update()
    return root


def collect_metrics(objects, duration_ms):
    depsgraph = bpy.context.evaluated_depsgraph_get()
    vertex_count = 0
    triangle_count = 0
    mesh_count = 0
    materials = set()
    for obj in objects:
        if obj.type != "MESH":
            continue
        mesh_count += 1
        eval_obj = obj.evaluated_get(depsgraph)
        eval_mesh = eval_obj.to_mesh()
        eval_mesh.calc_loop_triangles()
        vertex_count += len(eval_mesh.vertices)
        triangle_count += len(eval_mesh.loop_triangles)
        for mat in eval_mesh.materials:
            if mat is not None:
                materials.add(mat.name)
        eval_obj.to_mesh_clear()

    min_v, max_v = compute_world_bounds(objects)
    # Convert Blender Z-up bounds to glTF Y-up bounds: (x, z, -y)
    gltf_min = [round(min_v.x, 4), round(min_v.z, 4), round(-max_v.y, 4)]
    gltf_max = [round(max_v.x, 4), round(max_v.z, 4), round(-min_v.y, 4)]
    gltf_size = [round(gltf_max[i] - gltf_min[i], 4) for i in range(3)]
    return {
        "objectCount": len(objects),
        "meshCount": mesh_count,
        "vertexCount": vertex_count,
        "triangleCount": triangle_count,
        "materialCount": len(materials),
        "boundingBox": {
            "min": gltf_min,
            "max": gltf_max,
            "size": gltf_size,
        },
        "durationMs": int(duration_ms),
    }


def export_glb(filepath, y_up=True, apply_modifiers=True):
    kwargs = {
        "filepath": filepath,
        "export_format": "GLB",
        "export_yup": bool(y_up),
        "export_apply": bool(apply_modifiers),
        "export_materials": "EXPORT",
        "use_selection": False,
    }
    bpy.ops.export_scene.gltf(**kwargs)


def run_job(req_path, res_path):
    started = time.perf_counter()
    with open(req_path, "r", encoding="utf-8") as f:
        request = json.load(f)

    if int(request.get("schemaVersion", 0)) != SCHEMA_VERSION:
        raise ValueError(f"Unsupported request schemaVersion: {request.get('schemaVersion')}")

    job_id = str(request.get("jobId") or "unknown")
    recipe = request.get("recipe")
    if not isinstance(recipe, dict):
        raise ValueError("Missing recipe object in request.json")

    output_cfg = request.get("output") or {}
    rel_glb = str(output_cfg.get("glbPath") or "output.glb")
    req_dir = os.path.dirname(req_path)
    out_glb = os.path.abspath(os.path.join(req_dir, rel_glb))
    if os.path.commonpath([req_dir, out_glb]) != req_dir:
        raise ValueError("Output glbPath escapes job directory")

    reset_scene()
    mats = create_material_slots(recipe)
    archetype = str(recipe.get("archetype", "crate")).lower()
    dims = recipe.get("dimensions") or {"width": 1.0, "depth": 1.0, "height": 1.0}
    detail = str(recipe.get("detailLevel", "medium")).lower()
    variants = recipe.get("variants") or {}
    rng = random.Random(int(recipe.get("seed", 42)))

    objects = []
    if archetype in ARCHETYPE_BUILDERS:
        objects.extend(ARCHETYPE_BUILDERS[archetype](dims, mats, detail, variants, rng))
    parts = recipe.get("parts") or []
    if parts:
        objects.extend(build_custom_parts(parts, mats))
    if not objects:
        raise ValueError(f"Archetype '{archetype}' produced zero geometry objects")

    root_name = str(recipe.get("name") or "GeneratedProp")
    normalize_and_parent(root_name, objects, mode=str(output_cfg.get("normalizePivot", "bottom_center")))

    export_glb(
        out_glb,
        y_up=bool(output_cfg.get("yUp", True)),
        apply_modifiers=bool(output_cfg.get("applyModifiers", True)),
    )

    if not os.path.isfile(out_glb):
        raise RuntimeError("GLB export finished without creating output file")

    duration_ms = (time.perf_counter() - started) * 1000.0
    metrics = collect_metrics(objects, duration_ms)
    version_str = ".".join(str(v) for v in bpy.app.version)

    response = {
        "schemaVersion": SCHEMA_VERSION,
        "jobId": job_id,
        "ok": True,
        "engine": {
            "id": "blender-cli",
            "version": version_str,
        },
        "artifact": {
            "glbPath": rel_glb,
            "format": "GLB",
            "bytes": os.path.getsize(out_glb),
        },
        "metrics": metrics,
        "warnings": [],
    }
    with open(res_path, "w", encoding="utf-8") as f:
        json.dump(response, f, indent=2)


def main():
    res_path = None
    try:
        req_path, res_path = parse_cli_args(sys.argv)
        run_job(req_path, res_path)
    except Exception as exc:
        err_payload = {
            "schemaVersion": SCHEMA_VERSION,
            "ok": False,
            "error": str(exc),
            "traceback": traceback.format_exc(limit=8),
        }
        if res_path:
            try:
                with open(res_path, "w", encoding="utf-8") as f:
                    json.dump(err_payload, f, indent=2)
            except Exception:
                pass
        sys.stderr.write(f"[PlayForge Blender Worker Error] {exc}\n")
        sys.exit(1)


if __name__ == "__main__":
    main()
