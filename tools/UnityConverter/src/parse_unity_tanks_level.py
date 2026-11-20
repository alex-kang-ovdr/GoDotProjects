import struct
import os
import glob
import json
import sys
import math


def read_cstr(data: bytes, pos: int):
    end = data.index(b'\x00', pos)
    return data[pos:end].decode('utf8', 'ignore'), end + 1


def align4(pos: int) -> int:
    return (pos + 3) & ~3


def bytes_to_unity_guid(b16: bytes) -> str:
    return ''.join(f'{((b & 0x0F) << 4) | ((b & 0xF0) >> 4):02x}' for b in b16)


def build_guid_map(assets_dir: str) -> dict:
    guid_to_asset = {}
    for mp in glob.glob(os.path.join(assets_dir, '**', '*.meta'), recursive=True):
        with open(mp, 'r', encoding='utf8', errors='ignore') as f:
            for line in f:
                if line.startswith('guid:'):
                    g = line.split(':', 1)[1].strip()
                    rel = os.path.relpath(mp[:-5], assets_dir).replace('\\', '/')
                    guid_to_asset[g] = rel
                    break
    return guid_to_asset


def extract_material_colors(assets_dir: str) -> dict:
    colors = {}
    for mp in sorted(glob.glob(os.path.join(assets_dir, 'Materials', '*.mat'))):
        data = open(mp, 'rb').read()
        idx = data.find(b'_Color\x00')
        if idx != -1 and idx + 24 <= len(data):
            r, g, b, a = struct.unpack('<4f', data[idx + 8:idx + 24])
            colors[os.path.basename(mp)] = [round(r, 4), round(g, 4), round(b, 4), round(a, 4)]
    return colors


def parse_serialized_file_v15(filepath: str, guid_to_asset: dict):
    data = open(filepath, 'rb').read()
    meta_size, file_size, version, data_offset, endian = struct.unpack_from('>IIIIB', data, 0)
    pos = 20
    unity_ver, pos = read_cstr(data, pos)
    _target_platform = struct.unpack_from('<i', data, pos)[0]
    pos += 4
    enable_type_tree = data[pos]
    pos += 1

    type_count = struct.unpack_from('<i', data, pos)[0]
    pos += 4
    types = []
    for _ in range(type_count):
        class_id = struct.unpack_from('<i', data, pos)[0]
        pos += 4
        if class_id < 0:
            pos += 16
        pos += 16
        if enable_type_tree:
            node_count, str_buf_size = struct.unpack_from('<ii', data, pos)
            pos += 8
            pos += node_count * 24 + str_buf_size
        types.append(class_id)

    obj_count = struct.unpack_from('<i', data, pos)[0]
    pos += 4
    objects = []
    for _ in range(obj_count):
        pos = align4(pos)
        path_id, byte_start, byte_size, type_id = struct.unpack_from('<qIIi', data, pos)
        class_id, _is_destroyed, _stripped = struct.unpack_from('<HHB', data, pos + 20)
        pos += 25
        objects.append({
            'path_id': path_id,
            'offset': data_offset + byte_start,
            'size': byte_size,
            'type_id': type_id,
            'class_id': class_id,
        })

    # Script types array
    script_count = struct.unpack_from('<i', data, pos)[0]
    pos += 4
    for _ in range(script_count):
        _local_file_id = struct.unpack_from('<i', data, pos)[0]
        pos = align4(pos + 4)
        _local_path_id = struct.unpack_from('<q', data, pos)[0]
        pos += 8

    # Externals table (1-based index: fileID=1 -> externals[0])
    ext_count = struct.unpack_from('<i', data, pos)[0]
    pos += 4
    externals = []
    for i in range(ext_count):
        _temp_empty, pos = read_cstr(data, pos)
        guid_bytes = data[pos:pos + 16]
        pos += 16
        ext_type = struct.unpack_from('<i', data, pos)[0]
        pos += 4
        ext_path, pos = read_cstr(data, pos)
        guid_hex = bytes_to_unity_guid(guid_bytes)
        externals.append({
            'file_id': i + 1,
            'guid': guid_hex,
            'type': ext_type,
            'path': ext_path,
            'asset': guid_to_asset.get(guid_hex, ext_path),
        })

    return {
        'unity_version': unity_ver,
        'format_version': version,
        'objects': objects,
        'externals': externals,
        'data': data,
    }


def extract_level_art(assets_dir: str):
    guid_to_asset = build_guid_map(assets_dir)
    mat_colors = extract_material_colors(assets_dir)
    prefab_path = os.path.join(assets_dir, 'Prefabs', 'LevelArt.prefab')
    sf = parse_serialized_file_v15(prefab_path, guid_to_asset)
    data = sf['data']
    ext_by_id = {e['file_id']: e['asset'] for e in sf['externals']}

    game_objects = {}
    transforms = {}
    mesh_filters = {}
    mesh_renderers = {}
    box_colliders = {}

    HDR = 28  # m_ObjectHideFlags(4) + m_PrefabParentObject(12) + m_PrefabInternal(12)

    for obj in sf['objects']:
        cid = obj['class_id']
        off = obj['offset']
        end = off + obj['size']
        pid = obj['path_id']

        if cid == 1:  # GameObject
            p = off + HDR
            comp_count = struct.unpack_from('<i', data, p)[0]
            p += 4
            comps = []
            for _ in range(comp_count):
                comp_cid = struct.unpack_from('<i', data, p)[0]
                f_id = struct.unpack_from('<i', data, p + 4)[0]
                p_id = struct.unpack_from('<q', data, p + 8)[0]
                comps.append((comp_cid, f_id, p_id))
                p += 16
            _layer = struct.unpack_from('<I', data, p)[0]
            p += 4
            name_len = struct.unpack_from('<i', data, p)[0]
            p += 4
            name = data[p:p + name_len].decode('utf8', 'ignore')
            game_objects[pid] = {'name': name, 'active': True, 'components': comps}

        elif cid == 4:  # Transform
            base_p = off + HDR
            go_pid = struct.unpack_from('<q', data, base_p + 4)[0]
            rot = struct.unpack_from('<4f', data, base_p + 12)   # x, y, z, w
            pos = struct.unpack_from('<3f', data, base_p + 28)   # x, y, z
            scl = struct.unpack_from('<3f', data, base_p + 40)   # x, y, z
            child_count = struct.unpack_from('<i', data, base_p + 52)[0]
            p = base_p + 56
            children = []
            for _ in range(child_count):
                cp = struct.unpack_from('<q', data, p + 4)[0]
                children.append(cp)
                p += 12
            father_pid = struct.unpack_from('<q', data, p + 4)[0]
            transforms[pid] = {
                'go_pid': go_pid,
                'rot': [round(x, 5) for x in rot],
                'pos': [round(x, 4) for x in pos],
                'scale': [round(x, 4) for x in scl],
                'children': children,
                'father_pid': father_pid,
            }

        elif cid == 33:  # MeshFilter (size=52)
            base_p = off + HDR
            go_pid = struct.unpack_from('<q', data, base_p + 4)[0]
            mesh_fid = struct.unpack_from('<i', data, base_p + 12)[0]
            mesh_pid = struct.unpack_from('<q', data, base_p + 16)[0]
            mesh_filters[go_pid] = {
                'asset': ext_by_id.get(mesh_fid, ''),
                'mesh_path_id': mesh_pid,
            }

        elif cid == 23:  # MeshRenderer
            base_p = off + HDR
            go_pid = struct.unpack_from('<q', data, base_p + 4)[0]
            mats = []
            for scan in range(base_p + 12, end - 12, 2):
                fid = struct.unpack_from('<i', data, scan)[0]
                mpid = struct.unpack_from('<q', data, scan + 4)[0]
                if fid in ext_by_id and ext_by_id[fid].startswith('Materials/') and mpid == 2100000:
                    mats.append(os.path.basename(ext_by_id[fid]))
            mesh_renderers[go_pid] = mats

        elif cid == 65:  # BoxCollider (Unity 5.2: align4 after m_IsTrigger+m_Enabled -> base_p+28)
            base_p = off + HDR
            go_pid = struct.unpack_from('<q', data, base_p + 4)[0]
            if base_p + 52 <= end:
                sx, sy, sz = struct.unpack_from('<3f', data, base_p + 28)
                cx, cy, cz = struct.unpack_from('<3f', data, base_p + 40)
                vals = (sx, sy, sz, cx, cy, cz)
                if all(math.isfinite(v) and abs(v) < 500.0 for v in vals) and sx > 0.05 and sz > 0.05:
                    box_colliders[go_pid] = {
                        'size': [round(sx, 3), round(sy, 3), round(sz, 3)],
                        'center': [round(cx, 3), round(cy, 3), round(cz, 3)],
                    }

    # Build transform tree & compute world transforms (Unity LH) -> Godot RH
    def qmul(q1, q2):
        x1, y1, z1, w1 = q1
        x2, y2, z2, w2 = q2
        return (
            w1 * x2 + x1 * w2 + y1 * z2 - z1 * y2,
            w1 * y2 - x1 * z2 + y1 * w2 + z1 * x2,
            w1 * z2 + x1 * y2 - y1 * x2 + z1 * w2,
            w1 * w2 - x1 * x2 - y1 * y2 - z1 * z2,
        )

    def qrot(q, v):
        vx, vy, vz = v
        qx, qy, qz, qw = q
        # v' = q * (v,0) * q^-1
        tx = 2.0 * (qy * vz - qz * vy)
        ty = 2.0 * (qz * vx - qx * vz)
        tz = 2.0 * (qx * vy - qy * vx)
        return (
            vx + qw * tx + (qy * tz - qz * ty),
            vy + qw * ty + (qz * tx - qx * tz),
            vz + qw * tz + (qx * ty - qy * tx),
        )

    world_cache = {}

    def get_world(t_pid):
        if t_pid in world_cache:
            return world_cache[t_pid]
        t = transforms[t_pid]
        fp = t['father_pid']
        if fp == 0 or fp not in transforms:
            res = (tuple(t['pos']), tuple(t['rot']), tuple(t['scale']))
        else:
            p_pos, p_rot, p_scl = get_world(fp)
            scaled = (t['pos'][0] * p_scl[0], t['pos'][1] * p_scl[1], t['pos'][2] * p_scl[2])
            rpos = qrot(p_rot, scaled)
            wpos = (p_pos[0] + rpos[0], p_pos[1] + rpos[1], p_pos[2] + rpos[2])
            wrot = qmul(p_rot, t['rot'])
            wscl = (p_scl[0] * t['scale'][0], p_scl[1] * t['scale'][1], p_scl[2] * t['scale'][2])
            res = (wpos, wrot, wscl)
        world_cache[t_pid] = res
        return res

    # Collect mesh nodes & collider nodes
    mesh_nodes = []
    collider_nodes = []
    for t_pid, t in transforms.items():
        go_pid = t['go_pid']
        go = game_objects.get(go_pid)
        if not go or not go['active']:
            continue
        wpos, wrot, wscl = get_world(t_pid)
        # Convert Unity LH -> Godot RH: pos(x, y, -z), quat(-x, -y, z, w)
        g_pos = [round(wpos[0], 3), round(wpos[1], 3), round(-wpos[2], 3)]
        g_rot = [round(-wrot[0], 5), round(-wrot[1], 5), round(wrot[2], 5), round(wrot[3], 5)]
        g_scl = [round(wscl[0], 3), round(wscl[1], 3), round(wscl[2], 3)]

        mf = mesh_filters.get(go_pid)
        if mf and mf['asset'].startswith('Models/'):
            mesh_nodes.append({
                'name': go['name'],
                'model': os.path.basename(mf['asset']),
                'materials': mesh_renderers.get(go_pid, []),
                'pos': g_pos,
                'quat': g_rot,
                'scale': g_scl,
            })

        bc = box_colliders.get(go_pid)
        if bc:
            collider_nodes.append({
                'name': go['name'],
                'pos': g_pos,
                'quat': g_rot,
                'scale': g_scl,
                'size': bc['size'],
                'center': [bc['center'][0], bc['center'][1], -bc['center'][2]],
            })

    return {
        'unityVersion': sf['unity_version'],
        'totalBinaryObjects': len(sf['objects']),
        'externalsCount': len(sf['externals']),
        'materialColors': mat_colors,
        'meshNodeCount': len(mesh_nodes),
        'colliderNodeCount': len(collider_nodes),
        'meshNodes': mesh_nodes,
        'colliderNodes': collider_nodes,
    }


if __name__ == '__main__':
    converter_root = os.environ.get('CONVERTER_ROOT') or os.path.abspath(
        os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
    )
    assets_dir = sys.argv[1] if len(sys.argv) > 1 else os.path.join(
        converter_root, 'samples', 'unity-tanks', 'Assets'
    )
    out_json = sys.argv[2] if len(sys.argv) > 2 else os.path.join(
        converter_root, 'reports', 'tanks-level-extracted.json'
    )
    result = extract_level_art(assets_dir)
    os.makedirs(os.path.dirname(os.path.abspath(out_json)), exist_ok=True)
    with open(out_json, 'w', encoding='utf8') as f:
        json.dump(result, f, indent=2, allow_nan=False)
    print(f"Extracted LevelArt.prefab: {result['totalBinaryObjects']} objects -> {result['meshNodeCount']} 3D mesh nodes, {result['colliderNodeCount']} box colliders, {len(result['materialColors'])} materials")
    from collections import Counter
    c = Counter(n['model'] for n in result['meshNodes'])
    print('Top models placed:', c.most_common(15))
    print('Sample nodes:', result['meshNodes'][:5])
