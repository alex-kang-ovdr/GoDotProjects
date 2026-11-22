import os
import re
import json
import wave
import struct
import base64
import shutil
import subprocess
from pathlib import Path
from PIL import Image

REPO_ROOT = Path(__file__).resolve().parents[3]
CONVERTER_ROOT = REPO_ROOT / 'tools' / 'UnityConverter'
PORTED_ROOT = CONVERTER_ROOT / 'ported'
TEMPLATES_ROOT = REPO_ROOT / 'forge' / 'Templates'
def resolve_godot_exe() -> Path:
    env_bin = os.environ.get('GODOT_BIN') or os.environ.get('GODOT_EXECUTABLE')
    if env_bin and Path(env_bin).exists():
        return Path(env_bin)
    candidates = [
        REPO_ROOT / 'Godot_v4.7.2-stable_win64_console.exe',
        REPO_ROOT.parent / 'GoDotProjects' / 'Godot_v4.7.2-stable_win64_console.exe',
        REPO_ROOT.parent.parent / 'GoDotProjects' / 'Godot_v4.7.2-stable_win64_console.exe',
    ]
    for c in candidates:
        if c.exists():
            return c
    found = shutil.which('godot')
    if found:
        return Path(found)
    raise FileNotFoundError('Godot 4.7.2 console executable not found; set GODOT_BIN env var.')


GODOT_EXE = resolve_godot_exe()
FBX_EXPORTER_GD = CONVERTER_ROOT / 'src' / 'export_fbx_meshes_to_tres.gd'

MAX_FILE_BYTES = 1024 * 1024
MAX_PROJECT_BYTES = 8 * 1024 * 1024


def write_text(path: Path, text: str):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text.replace('\r\n', '\n'), encoding='utf-8')


def png_to_imagetexture_tres(src_png: Path, dst_tres: Path, max_dim: int = 0, use_rgb: bool = False):
    im = Image.open(src_png)
    if max_dim > 0 and max(im.width, im.height) > max_dim:
        scale = max_dim / max(im.width, im.height)
        im = im.resize((max(1, int(round(im.width * scale))), max(1, int(round(im.height * scale)))), Image.Resampling.LANCZOS)
    fmt = 'RGB8' if use_rgb else 'RGBA8'
    im = im.convert('RGB' if use_rgb else 'RGBA')
    b64 = base64.b64encode(im.tobytes()).decode('ascii')
    content = (
        '[gd_resource type="ImageTexture" format=4]\n\n'
        '[sub_resource type="Image" id="Image_1"]\n'
        'data = {\n'
        f'"data": PackedByteArray("{b64}"),\n'
        f'"format": "{fmt}",\n'
        f'"height": {im.height},\n'
        '"mipmaps": false,\n'
        f'"width": {im.width}\n'
        '}\n\n'
        '[resource]\n'
        'image = SubResource("Image_1")\n'
    )
    write_text(dst_tres, content)
    return dst_tres.stat().st_size


def wav_to_audiostream_tres(src_wav: Path, dst_tres: Path, target_rate: int = 16000, max_seconds: float = 8.0, loop: bool = False):
    """Convert PCM WAV to compact Godot 4 format=4 8-bit signed AudioStreamWAV .tres (< 350 KB)."""
    with wave.open(str(src_wav), 'rb') as wf:
        ch = wf.getnchannels()
        sw = wf.getsampwidth()
        sr = wf.getframerate()
        nframes = wf.getnframes()
        max_src_frames = min(nframes, int(sr * max_seconds))
        raw = wf.readframes(max_src_frames)

    if sw == 2:
        total_samples = len(raw) // 2
        samples = struct.unpack(f'<{total_samples}h', raw)
    elif sw == 3:
        # 24-bit little-endian signed PCM -> top 16-bit signed integer
        total_samples = len(raw) // 3
        samples = [struct.unpack('<h', raw[i * 3 + 1:i * 3 + 3])[0] for i in range(total_samples)]
    elif sw == 1:
        # 8-bit unsigned WAV PCM -> signed 16-bit
        samples = [(b - 128) << 8 for b in raw]
        total_samples = len(samples)
    else:
        raise ValueError(f'Unsupported WAV sample width {sw * 8}-bit for {src_wav}')
    # Mix down to mono
    if ch == 2:
        mono = [(samples[i] + samples[i + 1]) // 2 for i in range(0, total_samples - 1, 2)]
    else:
        mono = list(samples)

    # Resample linearly to target_rate & quantize to signed 8-bit PCM (Godot AudioStreamWAV format=0)
    out_len = max(1, int(len(mono) * target_rate / sr))
    out_bytes = bytearray(out_len)
    ratio = len(mono) / out_len
    for i in range(out_len):
        idx = min(len(mono) - 1, int(i * ratio))
        # Signed 16-bit [-32768..32767] -> signed 8-bit [-128..127] stored as unsigned byte
        s8 = max(-128, min(127, mono[idx] >> 8))
        out_bytes[i] = s8 & 0xFF

    b64 = base64.b64encode(bytes(out_bytes)).decode('ascii')
    loop_lines = f'loop_mode = 1\nloop_end = {out_len}\n' if loop else ''
    content = (
        '[gd_resource type="AudioStreamWAV" format=4]\n\n'
        '[resource]\n'
        'format = 0\n'
        f'mix_rate = {target_rate}\n'
        'stereo = false\n'
        f'{loop_lines}'
        f'data = PackedByteArray("{b64}")\n'
    )
    write_text(dst_tres, content)
    return dst_tres.stat().st_size


def export_fbx_models(ported_project_dir: Path, dst_models_dir: Path):
    dst_models_dir.mkdir(parents=True, exist_ok=True)
    tmp_gd = ported_project_dir / '_export_fbx_tmp.gd'
    shutil.copy2(FBX_EXPORTER_GD, tmp_gd)
    try:
        res = subprocess.run(
            [str(GODOT_EXE), '--headless', '--path', str(ported_project_dir), '--script', 'res://_export_fbx_tmp.gd', '--', f'--out={dst_models_dir.as_posix()}'],
            capture_output=True, text=True, check=True, timeout=60
        )
        print(res.stdout.strip())
    finally:
        if tmp_gd.exists():
            tmp_gd.unlink()


def collect_asset_paths(tpl_dir: Path):
    assets = []
    for p in sorted(tpl_dir.rglob('*')):
        if not p.is_file():
            continue
        rel = p.relative_to(tpl_dir).as_posix()
        if rel in ('metadata.json', 'showcase.json', 'README.md', 'project.godot'):
            continue
        if rel.startswith('.') or rel.startswith('tests/'):
            continue
        if p.suffix in ('.gd', '.tscn', '.godot', '.import', '.uid'):
            continue
        assets.append(rel)
    return assets


def validate_template_budget(tpl_dir: Path):
    total = 0
    count = 0
    for p in tpl_dir.rglob('*'):
        if not p.is_file():
            continue
        rel = p.relative_to(tpl_dir).as_posix()
        if rel in ('metadata.json', 'showcase.json', 'README.md') or rel.startswith('.'):
            continue
        sz = p.stat().st_size
        if sz > MAX_FILE_BYTES:
            raise RuntimeError(f'File exceeds 1MB limit ({sz} B): {tpl_dir.name}/{rel}')
        total += sz + len(rel)
        count += 1
    if count > 512 or total > MAX_PROJECT_BYTES:
        raise RuntimeError(f'Template {tpl_dir.name} exceeds budget: {count} files, {total/1048576:.2f} MB')
    return count, total


def build_template_2d_roguelike():
    src = PORTED_ROOT / 'godot-2d-roguelike'
    dst = TEMPLATES_ROOT / 'unity-2d-roguelike'
    if dst.exists():
        shutil.rmtree(dst)
    dst.mkdir(parents=True)

    # 1. SpriteSheet PNG -> format=4 ImageTexture .tres (306 KB)
    png_to_imagetexture_tres(
        src / 'assets' / 'sprites' / 'Scavengers_SpriteSheet.png',
        dst / 'assets' / 'sprites' / 'Scavengers_SpriteSheet.tres',
    )
    shutil.copy2(src / 'assets' / 'sprites' / 'sprite_manifest.json', dst / 'assets' / 'sprites' / 'sprite_manifest.json')

    # 2. 12 WAV -> AudioStreamWAV .tres
    for wf in sorted((src / 'assets' / 'audio').glob('*.wav')):
        is_music = 'music' in wf.stem.lower()
        wav_to_audiostream_tres(
            wf,
            dst / 'assets' / 'audio' / f'{wf.stem}.tres',
            target_rate=16000 if is_music else 22050,
            max_seconds=12.0 if is_music else 2.5,
            loop=is_music,
        )

    # 3. 56 AtlasTexture .tres (update ext_resource from .png -> .tres) & 3 SpriteFrames .tres
    for f in sorted((src / 'resources' / 'atlas').glob('*.tres')):
        txt = f.read_text(encoding='utf-8').replace('Scavengers_SpriteSheet.png', 'Scavengers_SpriteSheet.tres')
        write_text(dst / 'resources' / 'atlas' / f.name, txt)
    for f in sorted((src / 'resources' / 'animations').glob('*.tres')):
        write_text(dst / 'resources' / 'animations' / f.name, f.read_text(encoding='utf-8'))

    # 4. Scripts (update .wav -> .tres in sound_manager.gd)
    for f in sorted((src / 'scripts').glob('*.gd')):
        txt = f.read_text(encoding='utf-8')
        if f.name == 'sound_manager.gd':
            txt = txt.replace('res://assets/audio/%s.wav', 'res://assets/audio/%s.tres')
        write_text(dst / 'scripts' / f.name, txt)

    # 5. scenes/main.tscn (remove external .ttf font dependency for text-only PlatformStore compatibility)
    main_tscn = (src / 'scenes' / 'main.tscn').read_text(encoding='utf-8')
    main_tscn = main_tscn.replace('load_steps=3', 'load_steps=2')
    main_tscn = re.sub(r'\[ext_resource type="FontFile".*?\n', '', main_tscn)
    main_tscn = re.sub(r'theme_override_fonts/font = ExtResource\("2"\)\n', '', main_tscn)
    write_text(dst / 'scenes' / 'main.tscn', main_tscn)

    # 6. project.godot
    write_text(dst / 'project.godot', (src / 'project.godot').read_text(encoding='utf-8'))

    asset_paths = collect_asset_paths(dst)
    meta = {
        'id': 'unity-2d-roguelike',
        'name': 'Unity 2D Roguelike (Scavengers)',
        'description': 'Official Unity 2D Roguelike (Scavengers) auto-ported to Godot 4.7.2: 8x8 procedural dungeon, turn-based combat, destructible walls, and 12 converted SFX/BGM.',
        'dimension': '2d',
        'assetPaths': asset_paths,
        'guideOrder': [
            'scripts/unity_compat.gd',
            'scripts/sound_manager.gd',
            'scripts/wall.gd',
            'scripts/moving_object.gd',
            'scripts/player.gd',
            'scripts/enemy.gd',
            'scripts/board_manager.gd',
            'scripts/game_manager.gd',
            'scripts/main.gd',
            'scenes/main.tscn',
            'project.godot',
        ],
        'guide': 'README.md',
    }
    write_text(dst / 'metadata.json', json.dumps(meta, indent=2, ensure_ascii=False))
    write_text(dst / 'README.md', '# Unity 2D Roguelike (Scavengers) — Godot 4.7.2 Template\n\nUnity 공식 2D Roguelike 샘플을 Godot 4.7.2로 자동 포팅한 턴제 로그라이크 템플릿입니다.\n\n- 조작: `WASD` 또는 방향키로 1칸씩 이동 / 벽 파괴(4타) / Food·Soda 수집 / 우상단 EXIT 도달\n- 게임 오버 시 `R` 또는 `Enter`로 재시작\n')
    return validate_template_budget(dst)


def build_template_roll_a_ball():
    src = PORTED_ROOT / 'godot-roll-a-ball'
    dst = TEMPLATES_ROOT / 'unity-roll-a-ball'
    if dst.exists():
        shutil.rmtree(dst)
    dst.mkdir(parents=True)

    # Extract reusable material assets so guided mode has bundled assets (assetPaths > 0)
    write_text(dst / 'assets' / 'materials' / 'ground.tres', '[gd_resource type="StandardMaterial3D" format=3]\n\n[resource]\nalbedo_color = Color(0.22, 0.34, 0.52, 1)\nroughness = 0.8\n')
    write_text(dst / 'assets' / 'materials' / 'ball.tres', '[gd_resource type="StandardMaterial3D" format=3]\n\n[resource]\nalbedo_color = Color(0.96, 0.97, 0.99, 1)\nmetallic = 0.15\nroughness = 0.25\n')
    write_text(dst / 'assets' / 'materials' / 'wall.tres', '[gd_resource type="StandardMaterial3D" format=3]\n\n[resource]\nalbedo_color = Color(0.55, 0.62, 0.72, 1)\nroughness = 0.65\n')
    write_text(dst / 'assets' / 'materials' / 'pickup.tres', '[gd_resource type="StandardMaterial3D" format=3]\n\n[resource]\nalbedo_color = Color(1, 0.82, 0.12, 1)\nmetallic = 0.25\nroughness = 0.3\nemission_enabled = true\nemission = Color(0.35, 0.25, 0, 1)\n')

    for f in sorted((src / 'scripts').glob('*.gd')):
        write_text(dst / 'scripts' / f.name, f.read_text(encoding='utf-8'))

    # Main scene normalized to scenes/main.tscn
    write_text(dst / 'scenes' / 'main.tscn', (src / 'scenes' / 'mini_game.tscn').read_text(encoding='utf-8'))
    pg = (src / 'project.godot').read_text(encoding='utf-8').replace('res://scenes/mini_game.tscn', 'res://scenes/main.tscn')
    write_text(dst / 'project.godot', pg)

    asset_paths = collect_asset_paths(dst)
    meta = {
        'id': 'unity-roll-a-ball',
        'name': 'Unity Roll-a-Ball 3D',
        'description': 'Official Unity Roll-a-Ball 3D physics tutorial ported to Godot 4.7.2 with YAML-parsed 12 rotating PickUps, LH-to-RH coordinates, and offset Camera3D.',
        'dimension': '3d',
        'assetPaths': asset_paths,
        'guideOrder': [
            'scripts/rotator.gd',
            'scripts/camera_controller.gd',
            'scripts/player_controller.gd',
            'scripts/mini_game.gd',
            'scenes/main.tscn',
            'project.godot',
        ],
        'guide': 'README.md',
    }
    write_text(dst / 'metadata.json', json.dumps(meta, indent=2, ensure_ascii=False))
    write_text(dst / 'README.md', '# Unity Roll-a-Ball 3D — Godot 4.7.2 Template\n\nUnity 공식 3D 물리 튜토리얼 Roll-a-Ball을 Godot 4.7.2로 자동 포팅한 템플릿입니다.\n\n- 조작: 방향키로 구슬을 굴려 회전하는 황금 큐브 12개를 모두 수집하세요.\n')
    return validate_template_budget(dst)


def build_template_flappy_bird():
    src = PORTED_ROOT / 'godot-flappy-bird'
    dst = TEMPLATES_ROOT / 'unity-flappy-bird'
    if dst.exists():
        shutil.rmtree(dst)
    dst.mkdir(parents=True)

    # 9 PNG sprites -> format=4 ImageTexture .tres
    for pf in sorted((src / 'assets' / 'sprites').glob('*.png')):
        png_to_imagetexture_tres(pf, dst / 'assets' / 'sprites' / f'{pf.stem}.tres')

    shutil.copy2(src / 'shaders' / 'parallax_scroll.gdshader', (dst / 'shaders').mkdir(parents=True, exist_ok=True) or (dst / 'shaders' / 'parallax_scroll.gdshader'))

    for f in sorted((src / 'scripts').glob('*.gd')):
        txt = f.read_text(encoding='utf-8').replace('.png', '.tres')
        write_text(dst / 'scripts' / f.name, txt)

    # Normalize scenes/flappy_bird.tscn -> scenes/main.tscn & replace .png -> .tres, drop .ttf font ext_resource
    main_tscn = (src / 'scenes' / 'flappy_bird.tscn').read_text(encoding='utf-8')
    main_tscn = main_tscn.replace('.png', '.tres').replace('load_steps=16', 'load_steps=15')
    main_tscn = re.sub(r'\[ext_resource type="FontFile".*?\n', '', main_tscn)
    main_tscn = re.sub(r'theme_override_fonts/font = ExtResource\("12"\)\n', '', main_tscn)
    write_text(dst / 'scenes' / 'main.tscn', main_tscn)

    pg = (src / 'project.godot').read_text(encoding='utf-8').replace('res://scenes/flappy_bird.tscn', 'res://scenes/main.tscn')
    write_text(dst / 'project.godot', pg)

    asset_paths = collect_asset_paths(dst)
    meta = {
        'id': 'unity-flappy-bird',
        'name': 'Unity Flappy Bird 2D',
        'description': 'Unity 2D Flappy Bird tutorial ported to Godot 4.7.2 with GLSL UV parallax scrolling, sprite animation, pipe spawner, and Ready/GameOver HUD.',
        'dimension': '2d',
        'assetPaths': asset_paths,
        'guideOrder': [
            'shaders/parallax_scroll.gdshader',
            'scripts/parallax.gd',
            'scripts/pipes.gd',
            'scripts/spawner.gd',
            'scripts/player.gd',
            'scripts/game_manager.gd',
            'scenes/main.tscn',
            'project.godot',
        ],
        'guide': 'README.md',
    }
    write_text(dst / 'metadata.json', json.dumps(meta, indent=2, ensure_ascii=False))
    write_text(dst / 'README.md', '# Unity Flappy Bird 2D — Godot 4.7.2 Template\n\nUnity 2D Flappy Bird 튜토리얼을 Godot 4.7.2로 자동 포팅한 템플릿입니다.\n\n- 조작: `Space` 또는 마우스 클릭으로 점프해 파이프 사이를 통과하세요.\n')
    return validate_template_budget(dst)


def build_template_space_shooter():
    src = PORTED_ROOT / 'godot-space-shooter'
    dst = TEMPLATES_ROOT / 'unity-space-shooter'
    if dst.exists():
        shutil.rmtree(dst)
    dst.mkdir(parents=True)

    # 1. Export 6 FBX models -> Godot ArrayMesh .tres
    export_fbx_models(src, dst / 'assets' / 'models')

    # 2. Convert used textures to compact format=4 ImageTexture .tres (<= 256px)
    used_textures = [
        ('tile_nebula_green_dff.png', 256, True),
        ('vehicle_playerShip_orange_dff.png', 256, True),
        ('vehicle_playerShip_orange_nrm.png', 192, True),
        ('prop_asteroid_01_dff.png', 192, True),
        ('prop_asteroid_01_nrm.png', 128, True),
        ('prop_asteroid_02_dff.png', 192, True),
        ('prop_asteroid_02_nrm.png', 128, True),
        ('prop_asteroid_03_dff.png', 192, True),
        ('prop_asteroid_03_nrm.png', 128, True),
        ('fx_lazer_orange_dff.png', 128, False),
        ('part_flash_dff.png', 128, False),
        ('part_shockwave_dff.png', 128, False),
        ('part_jet_flare_dff.png', 128, False),
    ]
    for fname, mdim, rgb in used_textures:
        p = src / 'assets' / 'textures' / fname
        if p.exists():
            png_to_imagetexture_tres(p, dst / 'assets' / 'textures' / f'{p.stem}.tres', max_dim=mdim, use_rgb=rgb)

    # 3. Convert 6 WAV -> compact AudioStreamWAV .tres
    for wf in sorted((src / 'assets' / 'audio').glob('*.wav')):
        is_music = 'music' in wf.stem.lower()
        wav_to_audiostream_tres(
            wf,
            dst / 'assets' / 'audio' / f'{wf.stem}.tres',
            target_rate=16000 if is_music else 22050,
            max_seconds=10.0 if is_music else 2.5,
            loop=is_music,
        )

    # 4. Adapt scripts to load ArrayMesh .tres + Texture .tres + Audio .tres
    for f in sorted((src / 'scripts').glob('*.gd')):
        txt = f.read_text(encoding='utf-8')
        txt = txt.replace('.png', '.tres').replace('.wav', '.tres')
        if f.name == 'player_controller.gd':
            txt = txt.replace(
                'if ResourceLoader.exists("res://assets/models/vehicle_playerShip.FBX"):\n'
                '\t\tvar fbx_scene: PackedScene = load("res://assets/models/vehicle_playerShip.FBX")\n'
                '\t\tship_visual = fbx_scene.instantiate()\n'
                '\t\t# Unity LH +Z forward -> rotate 180 deg Y in Godot RH so nose points to -Z (up)\n'
                '\t\tship_visual.rotation_degrees = Vector3(0, 180, 0)\n'
                '\t\t_apply_ship_material(ship_visual)\n'
                '\t\tadd_child(ship_visual)',
                'if ResourceLoader.exists("res://assets/models/vehicle_playerShip.tres"):\n'
                '\t\tvar mi := MeshInstance3D.new()\n'
                '\t\tmi.mesh = load("res://assets/models/vehicle_playerShip.tres")\n'
                '\t\tmi.rotation_degrees = Vector3(0, 180, 0)\n'
                '\t\tship_visual = mi\n'
                '\t\t_apply_ship_material(ship_visual)\n'
                '\t\tadd_child(ship_visual)'
            )
        elif f.name == 'game_controller.gd':
            txt = txt.replace('var asteroid_scenes: Array[PackedScene] = []', 'var asteroid_meshes: Array[Mesh] = []')
            txt = txt.replace('prop_asteroid_0%d.FBX', 'prop_asteroid_0%d.tres')
            txt = txt.replace('asteroid_scenes.append(load(fbx_p))', 'asteroid_meshes.append(load(fbx_p))')
            txt = txt.replace('asteroid_scenes.size()', 'asteroid_meshes.size()')
            txt = txt.replace(
                'var model := asteroid_scenes[idx].instantiate()\n'
                '\t\tmodel.scale = Vector3(1.15, 1.15, 1.15)\n'
                '\t\t_override_meshes(model, asteroid_mats[idx])\n'
                '\t\tast.add_child(model)',
                'var model := MeshInstance3D.new()\n'
                '\t\tmodel.mesh = asteroid_meshes[idx]\n'
                '\t\tmodel.scale = Vector3(1.15, 1.15, 1.15)\n'
                '\t\tmodel.material_override = asteroid_mats[idx]\n'
                '\t\tast.add_child(model)'
            )
        write_text(dst / 'scripts' / f.name, txt)

    # 5. scenes/main.tscn & project.godot
    write_text(dst / 'scenes' / 'main.tscn', (src / 'scenes' / 'space_shooter.tscn').read_text(encoding='utf-8'))
    pg = (src / 'project.godot').read_text(encoding='utf-8').replace('res://scenes/space_shooter.tscn', 'res://scenes/main.tscn')
    write_text(dst / 'project.godot', pg)

    asset_paths = collect_asset_paths(dst)
    meta = {
        'id': 'unity-space-shooter',
        'name': 'Unity Space Shooter 3D',
        'description': 'Official Unity 3D Space Shooter tutorial ported to Godot 4.7.2: 3D spaceship & asteroid meshes, nebula backdrop, laser combat, explosion VFX, and waves.',
        'dimension': '3d',
        'assetPaths': asset_paths,
        'guideOrder': [
            'scripts/mover.gd',
            'scripts/explosion_vfx.gd',
            'scripts/player_controller.gd',
            'scripts/game_controller.gd',
            'scenes/main.tscn',
            'project.godot',
        ],
        'guide': 'README.md',
    }
    write_text(dst / 'metadata.json', json.dumps(meta, indent=2, ensure_ascii=False))
    write_text(dst / 'README.md', '# Unity Space Shooter 3D — Godot 4.7.2 Template\n\nUnity 공식 3D Space Shooter 튜토리얼을 Godot 4.7.2로 자동 포팅한 템플릿입니다.\n\n- 조작: 방향키 이동, `Space` 또는 마우스 클릭으로 레이저 발사, 게임 오버 후 `R`로 재시작\n')
    return validate_template_budget(dst)


def build_template_tanks_3d():
    src = PORTED_ROOT / 'godot-tanks-3d'
    dst = TEMPLATES_ROOT / 'unity-tanks-3d'
    if dst.exists():
        shutil.rmtree(dst)
    dst.mkdir(parents=True)

    # 1. Export all 26 FBX models -> Godot ArrayMesh .tres (multi-part Tank.fbx baked into 1 ArrayMesh!)
    export_fbx_models(src, dst / 'assets' / 'models')

    # 2. Copy binary-extracted level manifest (103 meshes + 41 colliders + 21 material colors)
    shutil.copy2(src / 'assets' / 'level_art.json', dst / 'assets' / 'level_art.json')

    # 3. Convert Aim Arrow & Smoke sprites -> format=4 ImageTexture .tres
    for fname, mdim in [('Aim Arrow.png', 128), ('Smoke.png', 128)]:
        p = src / 'assets' / 'sprites' / fname
        if p.exists():
            safe_stem = p.stem.replace(' ', '_')
            png_to_imagetexture_tres(p, dst / 'assets' / 'sprites' / f'{safe_stem}.tres', max_dim=mdim, use_rgb=False)

    # 4. Convert 7 WAV -> compact AudioStreamWAV .tres
    for wf in sorted((src / 'assets' / 'audio').glob('*.wav')):
        is_music = 'music' in wf.stem.lower()
        is_loop = is_music or 'engine' in wf.stem.lower()
        wav_to_audiostream_tres(
            wf,
            dst / 'assets' / 'audio' / f'{wf.stem}.tres',
            target_rate=16000 if is_music else 22050,
            max_seconds=10.0 if is_music else 2.5,
            loop=is_loop,
        )

    # 5. Adapt scripts to load ArrayMesh .tres, Texture .tres, Audio .tres
    for f in sorted((src / 'scripts').glob('*.gd')):
        txt = f.read_text(encoding='utf-8')
        txt = txt.replace('.wav', '.tres').replace('Aim Arrow.png', 'Aim_Arrow.tres').replace('Smoke.png', 'Smoke.tres')
        if f.name == 'level_loader.gd':
            txt = txt.replace(
                'var model_file: String = entry.model\n'
                '\t\tvar res_path := "res://assets/models/%s" % model_file\n'
                '\t\tif not model_cache.has(res_path):\n'
                '\t\t\tif ResourceLoader.exists(res_path):\n'
                '\t\t\t\tmodel_cache[res_path] = load(res_path)\n'
                '\t\t\telse:\n'
                '\t\t\t\tmodel_cache[res_path] = null\n'
                '\t\tvar packed: PackedScene = model_cache[res_path]\n'
                '\t\tif packed == null:\n'
                '\t\t\tcontinue\n'
                '\n'
                '\t\tvar inst := packed.instantiate() as Node3D',
                'var model_stem: String = String(entry.model).get_basename()\n'
                '\t\tvar res_path := "res://assets/models/%s.tres" % model_stem\n'
                '\t\tif not model_cache.has(res_path):\n'
                '\t\t\tif ResourceLoader.exists(res_path):\n'
                '\t\t\t\tmodel_cache[res_path] = load(res_path)\n'
                '\t\t\telse:\n'
                '\t\t\t\tmodel_cache[res_path] = null\n'
                '\t\tvar mesh_res: Mesh = model_cache[res_path]\n'
                '\t\tif mesh_res == null:\n'
                '\t\t\tcontinue\n'
                '\n'
                '\t\tvar inst := MeshInstance3D.new()\n'
                '\t\tinst.mesh = mesh_res'
            )
        elif f.name == 'tank_controller.gd':
            txt = txt.replace(
                'if ResourceLoader.exists("res://assets/models/Tank.fbx"):\n'
                '\t\tvar model := (load("res://assets/models/Tank.fbx") as PackedScene).instantiate() as Node3D',
                'if ResourceLoader.exists("res://assets/models/Tank.tres"):\n'
                '\t\tvar model := MeshInstance3D.new()\n'
                '\t\tmodel.mesh = load("res://assets/models/Tank.tres")'
            )
        elif f.name == 'shell_explosion.gd':
            txt = txt.replace(
                'if ResourceLoader.exists("res://assets/models/Shell.fbx"):\n'
                '\t\tvar s_vis := (load("res://assets/models/Shell.fbx") as PackedScene).instantiate() as Node3D',
                'if ResourceLoader.exists("res://assets/models/Shell.tres"):\n'
                '\t\tvar s_vis := MeshInstance3D.new()\n'
                '\t\ts_vis.mesh = load("res://assets/models/Shell.tres")'
            )
        write_text(dst / 'scripts' / f.name, txt)

    # 6. scenes/main.tscn & project.godot
    write_text(dst / 'scenes' / 'main.tscn', (src / 'scenes' / 'tanks_arena.tscn').read_text(encoding='utf-8'))
    pg = (src / 'project.godot').read_text(encoding='utf-8').replace('res://scenes/tanks_arena.tscn', 'res://scenes/main.tscn')
    write_text(dst / 'project.godot', pg)

    asset_paths = collect_asset_paths(dst)
    meta = {
        'id': 'unity-tanks-3d',
        'name': 'Unity Tanks! 3D',
        'description': 'Official Unity 3D Tanks! tutorial auto-ported to Godot 4.7.2: 26 converted 3D meshes, 103 desert arena objects from binary LevelArt.prefab, 2P local battle, ballistic shells, and dynamic ortho camera.',
        'dimension': '3d',
        'assetPaths': asset_paths,
        'guideOrder': [
            'scripts/level_loader.gd',
            'scripts/shell_explosion.gd',
            'scripts/tank_controller.gd',
            'scripts/camera_control.gd',
            'scripts/game_manager.gd',
            'scenes/main.tscn',
            'project.godot',
        ],
        'guide': 'README.md',
    }
    write_text(dst / 'metadata.json', json.dumps(meta, indent=2, ensure_ascii=False))
    write_text(dst / 'README.md', '# Unity Tanks! 3D — Godot 4.7.2 Template\n\nUnity 공식 대규모 3D 튜토리얼 Tanks!를 Godot 4.7.2로 자동 포팅한 2인 로컬 대전 템플릿입니다.\n\n- Player 1 (Blue): `WASD` 이동/회전 + `Space` 차지 발사\n- Player 2 (Red): 방향키 이동/회전 + `Enter` 차지 발사\n')
    return validate_template_budget(dst)


def build_template_boss_room():
    src = PORTED_ROOT / 'godot-boss-room'
    dst = TEMPLATES_ROOT / 'unity-boss-room'
    if dst.exists():
        shutil.rmtree(dst)
    dst.mkdir(parents=True)

    # 1. Bake 6 role meshes + 13 dungeon prop meshes into compact text-only ArrayMesh .tres
    models_out = dst / 'assets' / 'models'
    models_out.mkdir(parents=True, exist_ok=True)
    baker_gd = CONVERTER_ROOT / 'src' / 'export_boss_room_template_meshes.gd'
    res = subprocess.run(
        [str(GODOT_EXE), '--headless', '--path', str(src), '--script', str(baker_gd), '--', f'--out={models_out}'],
        capture_output=True,
        text=True,
    )
    if res.returncode != 0:
        raise RuntimeError(f'Boss Room mesh bake failed:\n{res.stdout}\n{res.stderr}')

    # 2. Convert key PBR & character PNG textures -> compact format=4 ImageTexture .tres
    tex_src = src / 'assets' / 'textures'
    tex_dst = dst / 'assets' / 'textures'
    tex_dst.mkdir(parents=True, exist_ok=True)
    for pf in sorted(tex_src.glob('*.png')):
        stem = pf.stem
        # Skip raw unused packed MSE originals & heavy normal maps to keep template crisp & < 8 MB
        if stem.endswith('MetalSmoothEmissive') or stem.endswith('_metallic') or stem.endswith('_roughness') or stem.endswith('_Normal'):
            continue
        is_alpha = 'Eyes' in stem or 'Mouths' in stem
        max_dim = 256 if 'env_deco' in stem else (128 if not is_alpha else 128)
        png_to_imagetexture_tres(pf, tex_dst / f'{stem}.tres', max_dim=max_dim, use_rgb=not is_alpha)

    # 3. Convert 5 WAV SFX -> compact AudioStreamWAV .tres
    for wf in sorted((src / 'assets' / 'audio').glob('*.wav')):
        wav_to_audiostream_tres(
            wf,
            dst / 'assets' / 'audio' / f'{wf.stem}.tres',
            target_rate=16000,
            max_seconds=2.5,
            loop=False,
        )

    # 4. Copy scripts adapted for text-only .tres meshes, textures, and audio
    for f in sorted((src / 'scripts').glob('*.gd')):
        txt = f.read_text(encoding='utf-8')
        txt = txt.replace('.wav', '.tres').replace('.png', '.tres')
        if f.name == 'character_visual.gd':
            txt = '''extends Node3D
class_name CharacterVisual
## Text-only PlayForge Template CharacterVisual loading baked per-role ArrayMesh .tres & ImageTexture .tres.

const MODEL_DIR := "res://assets/models/"
const TEX_DIR := "res://assets/textures/"

static var _tex_cache: Dictionary = {}

var role_id: String = "tank"
var model_pivot: Node3D = null
var active_meshes: Array[MeshInstance3D] = []
var original_mats: Array[StandardMaterial3D] = []
var hit_flash_timer: float = 0.0
var attack_anim_timer: float = 0.0
var walk_phase: float = 0.0
var shield_raised: bool = false
var is_stunned: bool = false
var is_downed: bool = false
var base_scale: float = 1.0


static func _get_tex(file_name: String) -> Texture2D:
\tif _tex_cache.has(file_name):
\t\treturn _tex_cache[file_name] as Texture2D
\tvar full := TEX_DIR + file_name
\tif not ResourceLoader.exists(full):
\t\treturn null
\tvar tex: Texture2D = load(full) as Texture2D
\t_tex_cache[file_name] = tex
\treturn tex


func setup(p_role: String, p_scale: float = 1.0) -> void:
\trole_id = p_role.to_lower()
\tbase_scale = p_scale

\tmodel_pivot = Node3D.new()
\tmodel_pivot.name = "ModelPivot"
\tmodel_pivot.scale = Vector3.ONE * base_scale
\tadd_child(model_pivot)

\tvar mesh_path := MODEL_DIR + "char_" + role_id + ".tres"
\tvar mesh_res: ArrayMesh = load(mesh_path) as ArrayMesh
\tif mesh_res == null:
\t\treturn
\tvar mi := MeshInstance3D.new()
\tmi.mesh = mesh_res
\tmi.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_ON
\tfor s in mesh_res.get_surface_count():
\t\tvar sname: String = mesh_res.surface_get_name(s)
\t\tvar mat: StandardMaterial3D = _build_material_for_mesh(sname)
\t\tmi.set_surface_override_material(s, mat)
\t\toriginal_mats.append(mat)
\tmodel_pivot.add_child(mi)
\tactive_meshes.append(mi)


func _build_material_for_mesh(mesh_name: String) -> StandardMaterial3D:
\tvar mat := StandardMaterial3D.new()
\tmat.roughness = 0.62
\tmat.metallic = 0.08
\tvar low := mesh_name.to_lower()
\tvar tex_file := ""

\tif low.contains("eyes"):
\t\tvar is_enemy := role_id == "boss" or role_id == "imp"
\t\ttex_file = "Enemy_Eyes.tres" if is_enemy else "Hero_Eyes.tres"
\t\tmat.albedo_texture = _get_tex(tex_file)
\t\tmat.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
\t\tmat.cull_mode = BaseMaterial3D.CULL_DISABLED
\t\tmat.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
\t\tif role_id == "boss":
\t\t\tmat.albedo_color = Color(1.0, 0.85, 0.25)
\t\t\tmat.emission_enabled = true
\t\t\tmat.emission = Color(1.0, 0.28, 0.05)
\t\t\tmat.emission_energy_multiplier = 3.0
\t\treturn mat
\tif low.contains("mouth"):
\t\tvar is_enemy := role_id == "boss" or role_id == "imp"
\t\ttex_file = "Enemy_Mouths.tres" if is_enemy else "Hero_Mouths.tres"
\t\tmat.albedo_texture = _get_tex(tex_file)
\t\tmat.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
\t\tmat.cull_mode = BaseMaterial3D.CULL_DISABLED
\t\tmat.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
\t\treturn mat

\tmatch role_id:
\t\t"tank":
\t\t\ttex_file = "Tank_Hair_Boy_CLR.tres" if low.contains("hair") else ("Tank_Head_Boy_CLR.tres" if (low.contains("head") or low.contains("ears")) else ("Tank_Weapon_CLR.tres" if (low.contains("weapon") or low.contains("shield")) else "Tank_Torso_CLR.tres"))
\t\t"archer":
\t\t\ttex_file = "Archer_Hair_Boy_CLR.tres" if low.contains("hair") else ("Archer_Head_Boy_CLR.tres" if (low.contains("head") or low.contains("ears")) else ("Archer_Weapons_CLR.tres" if (low.contains("weapon") or low.contains("quiver")) else "Archer_Torso_CLR.tres"))
\t\t"mage":
\t\t\ttex_file = "Mage_Hair_Girl_CLR.tres" if low.contains("hair") else ("Mage_Head_Girl_CLR.tres" if (low.contains("head") or low.contains("ears")) else ("Mage_Weapons_CLR.tres" if low.contains("weapon") else "Mage_Torso_CLR_Girl.tres"))
\t\t"rogue":
\t\t\ttex_file = "Rogue_Hair_Boy_CLR.tres" if low.contains("hair") else ("Rogue_Head_Boy_CLR.tres" if (low.contains("head") or low.contains("ears")) else ("Rogue_Weapon_CLR.tres" if low.contains("weapon") else "Rogue_Torso_CLR.tres"))
\t\t"imp":
\t\t\ttex_file = "Imp_Head_CLR.tres" if (low.contains("head") or low.contains("ears")) else ("Imp_Weapons_CLR.tres" if low.contains("weapon") else "Imp_Torso_CLR.tres")
\t\t"boss":
\t\t\ttex_file = "Imp_Helmet_CLR.tres" if low.contains("helmet") else ("Boss_Head_CLR.tres" if (low.contains("head") or low.contains("ears")) else ("Imp_Weapons_CLR.tres" if low.contains("weapon") else "Boss_Torso_CLR.tres"))
\tif tex_file != "":
\t\tmat.albedo_texture = _get_tex(tex_file)
\treturn mat


func trigger_attack(duration: float = 0.32) -> void:
\tattack_anim_timer = duration


func trigger_hit_flash(duration: float = 0.09) -> void:
\thit_flash_timer = duration


func animate(delta: float, move_speed: float, charging: bool = false) -> void:
\tif model_pivot == null:
\t\treturn
\twalk_phase += delta * (9.5 if move_speed > 0.15 else 2.4)
\tvar bob_y: float = absf(sin(walk_phase)) * (0.14 if move_speed > 0.15 else 0.03)
\tvar pitch_x: float = 0.28 if charging else (-0.12 if shield_raised else (-1.35 if is_downed else 0.0))
\tvar roll_z: float = sin(walk_phase * 4.5) * 0.22 if is_stunned else sin(walk_phase) * (0.07 if move_speed > 0.15 else 0.012)
\tif attack_anim_timer > 0.0:
\t\tattack_anim_timer = maxf(0.0, attack_anim_timer - delta)
\t\tpitch_x += sin((attack_anim_timer / 0.32) * PI) * 0.36
\tmodel_pivot.position.y = lerpf(model_pivot.position.y, -0.35 if is_downed else bob_y, minf(1.0, delta * 14.0))
\tmodel_pivot.rotation = Vector3(lerpf(model_pivot.rotation.x, pitch_x, minf(1.0, delta * 16.0)), 0.0, lerpf(model_pivot.rotation.z, roll_z, minf(1.0, delta * 16.0)))
\tif hit_flash_timer > 0.0:
\t\thit_flash_timer = maxf(0.0, hit_flash_timer - delta)
\t\tvar on := hit_flash_timer > 0.0
\t\tfor mat in original_mats:
\t\t\tif mat.shading_mode != BaseMaterial3D.SHADING_MODE_UNSHADED:
\t\t\t\tmat.emission_enabled = on
\t\t\t\tmat.emission = Color(0.9, 0.2, 0.12)
\t\t\t\tmat.emission_energy_multiplier = 0.42
'''
        elif f.name == 'dungeon_builder.gd':
            txt = txt.replace(
                'var pieces_scene: PackedScene = load(DUNGEON_PIECES_PATH) as PackedScene\n\tvar pieces_inst: Node = pieces_scene.instantiate()\n\tvar mesh_map: Dictionary = {}\n\t_extract_meshes(pieces_inst, mesh_map)',
                'var mesh_map: Dictionary = {}\n\tfor k in ["boss_floor", "boss_floor_2", "wall1_base_straight_1", "wall1_top_straight_1", "Pillar_LOD0", "banner_LOD0", "torch2", "pot2_LOD0", "door_crystral_base", "fx_arrrow"]:\n\t\tvar mp := "res://assets/models/prop_" + str(k) + ".tres"\n\t\tif ResourceLoader.exists(mp):\n\t\t\tmesh_map[k] = load(mp)',
            )
            txt = txt.replace('\tpieces_inst.free()\n', '')
            txt = txt.replace(
                '\tboss_arena_mat.normal_enabled = true\n\tboss_arena_mat.normal_texture = load(TEX_DIR + "env_deco_boss_arena_Normal.tres") as Texture2D\n\tboss_arena_mat.normal_scale = 1.15\n\tboss_arena_mat.roughness_texture = load(TEX_DIR + "env_deco_boss_arena_MetalSmoothEmissive_roughness.tres") as Texture2D',
                '\tboss_arena_mat.roughness = 0.88',
            )
            txt = txt.replace(
                '\tenv_deco_mat.normal_enabled = true\n\tenv_deco_mat.normal_texture = load(TEX_DIR + "env_deco_Normal.tres") as Texture2D\n\tenv_deco_mat.normal_scale = 1.1\n\tenv_deco_mat.metallic_texture = load(TEX_DIR + "env_deco_MetalSmoothEmissive_metallic.tres") as Texture2D\n\tenv_deco_mat.metallic = 0.25\n\tenv_deco_mat.roughness_texture = load(TEX_DIR + "env_deco_MetalSmoothEmissive_roughness.tres") as Texture2D',
                '\tenv_deco_mat.metallic = 0.25',
            )
            txt = txt.replace(
                'var ps: PackedScene = load(DOOR_BOSS_PATH) as PackedScene\n\tdoor_node = Node3D.new()\n\tdoor_node.name = "BossDoor"\n\tdoor_node.position = Vector3(0.0, 0.0, 17.4)\n\tdoor_node.scale = Vector3(0.85, 0.85, 0.85)\n\tadd_child(door_node)\n\n\tvar inst: Node = ps.instantiate()\n\tdoor_node.add_child(inst)\n\t_apply_mat_recursive(inst, env_deco_mat)\n\tdoor_anim = _find_anim_player(inst)\n\tif door_anim != null:\n\t\tdoor_anim.stop()',
                'door_node = Node3D.new()\n\tdoor_node.name = "BossDoor"\n\tdoor_node.position = Vector3(0.0, 0.0, 17.4)\n\tdoor_node.scale = Vector3(0.85, 0.85, 0.85)\n\tadd_child(door_node)\n\tvar d_mi := MeshInstance3D.new()\n\td_mi.mesh = load("res://assets/models/prop_door_boss.tres") as Mesh\n\td_mi.material_override = env_deco_mat\n\tdoor_node.add_child(d_mi)',
            )
            txt = txt.replace(
                'var ps: PackedScene = load(FLOOR_SWITCH_PATH) as PackedScene\n\tswitch_node = Node3D.new()\n\tswitch_node.name = "FloorSwitch"\n\tswitch_node.position = Vector3(0.0, 0.08, 25.0)\n\tadd_child(switch_node)\n\n\tvar inst: Node = ps.instantiate()\n\tswitch_node.add_child(inst)\n\t_apply_mat_recursive(inst, env_deco_mat)\n\tswitch_anim = _find_anim_player(inst)\n\tif switch_anim != null:\n\t\tswitch_anim.stop()',
                'switch_node = Node3D.new()\n\tswitch_node.name = "FloorSwitch"\n\tswitch_node.position = Vector3(0.0, 0.08, 25.0)\n\tadd_child(switch_node)\n\tvar sw_mi := MeshInstance3D.new()\n\tsw_mi.mesh = load("res://assets/models/prop_floor_switch.tres") as Mesh\n\tsw_mi.material_override = env_deco_mat\n\tswitch_node.add_child(sw_mi)',
            )
            txt = txt.replace(
                'var ps: PackedScene = load(CHEST_PATH) as PackedScene\n\tchest_node = Node3D.new()\n\tchest_node.name = "TreasureChest"\n\tchest_node.position = Vector3(0.0, 0.0, -13.2)\n\tchest_node.scale = Vector3(0.95, 0.95, 0.95)\n\tadd_child(chest_node)\n\n\tvar inst: Node = ps.instantiate()\n\tchest_node.add_child(inst)\n\t_apply_mat_recursive(inst, env_deco_mat)\n\tchest_anim = _find_anim_player(inst)\n\tif chest_anim != null:\n\t\tchest_anim.stop()',
                'chest_node = Node3D.new()\n\tchest_node.name = "TreasureChest"\n\tchest_node.position = Vector3(0.0, 0.0, -13.2)\n\tchest_node.scale = Vector3(0.95, 0.95, 0.95)\n\tadd_child(chest_node)\n\tvar ch_mi := MeshInstance3D.new()\n\tch_mi.mesh = load("res://assets/models/prop_treasure_chest.tres") as Mesh\n\tch_mi.material_override = env_deco_mat\n\tchest_node.add_child(ch_mi)',
            )
        elif f.name == 'hero_unit.gd':
            txt = txt.replace(
                'class_name HeroUnit\n',
                'const CharacterVisual = preload("res://scripts/character_visual.gd")\n',
            ).replace('hero: HeroUnit', 'hero').replace('HeroUnit.CLASS_STATS', 'CLASS_STATS')
        elif f.name == 'enemy_unit.gd':
            txt = txt.replace(
                'class_name EnemyUnit\n',
                'const CharacterVisual = preload("res://scripts/character_visual.gd")\nconst HeroUnit = preload("res://scripts/hero_unit.gd")\n',
            ).replace('enemy: EnemyUnit', 'enemy').replace('boss: EnemyUnit', 'boss')
        elif f.name == 'boss_room_game.gd':
            txt = txt.replace(
                'class_name BossRoomGame\n',
                'const DungeonBuilder = preload("res://scripts/dungeon_builder.gd")\nconst HeroUnit = preload("res://scripts/hero_unit.gd")\nconst EnemyUnit = preload("res://scripts/enemy_unit.gd")\n',
            )
        write_text(dst / 'scripts' / f.name, txt)

    # 5. Copy compiled deterministic shaders if present
    sh_src = src / 'assets' / 'shaders'
    if sh_src.exists():
        for sf in sorted(sh_src.glob('*.gdshader')):
            write_text(dst / 'assets' / 'shaders' / sf.name, sf.read_text(encoding='utf-8'))

    # 6. scenes/main.tscn & project.godot
    write_text(dst / 'scenes' / 'main.tscn', (src / 'scenes' / 'boss_room.tscn').read_text(encoding='utf-8'))
    pg = (src / 'project.godot').read_text(encoding='utf-8').replace('res://scenes/boss_room.tscn', 'res://scenes/main.tscn')
    write_text(dst / 'project.godot', pg)

    asset_paths = collect_asset_paths(dst)
    meta = {
        'id': 'unity-boss-room',
        'name': 'Unity Boss Room 3D Co-op',
        'description': 'Official Unity Boss Room co-op 3D RPG auto-ported to Godot 4.7.2: 4 hero classes (Tank/Archer/Mage/Rogue) with party AI, @rpc ActionBus, crimson rune Boss Arena, Trample vs ChargedShield stun counter, and Victory Treasure Chest.',
        'dimension': '3d',
        'assetPaths': asset_paths,
        'guideOrder': [
            'scripts/network_action_bus.gd',
            'scripts/character_visual.gd',
            'scripts/dungeon_builder.gd',
            'scripts/hero_unit.gd',
            'scripts/enemy_unit.gd',
            'scripts/boss_room_game.gd',
            'scenes/main.tscn',
            'project.godot',
        ],
        'guide': 'README.md',
    }
    write_text(dst / 'metadata.json', json.dumps(meta, indent=2, ensure_ascii=False))
    write_text(
        dst / 'README.md',
        '# Unity Boss Room 3D Co-op — Godot 4.7.2 Template\n\nUnity 공식 멀티플레이어 3D 코옵 RPG 샘플(Boss Room)을 Godot 4.7.2로 결정론적 자동 포팅한 템플릿입니다.\n\n- 클래스 전환: `1` Tank / `2` Archer / `3` Mage / `4` Rogue (나머지 3명은 협동 AI)\n- 조작: `WASD` 이동, `Space` 기본 공격, `Q` 주력 스킬(Tank 방패 막기 → 보스 돌진 스턴 / Mage 광역 힐 / Archer 파워샷 / Rogue 대시), `E` 특수 스킬, `R` 아군 부활\n',
    )
    return validate_template_budget(dst)


if __name__ == '__main__':
    builders = [
        ('unity-2d-roguelike', build_template_2d_roguelike),
        ('unity-roll-a-ball', build_template_roll_a_ball),
        ('unity-flappy-bird', build_template_flappy_bird),
        ('unity-space-shooter', build_template_space_shooter),
        ('unity-tanks-3d', build_template_tanks_3d),
        ('unity-boss-room', build_template_boss_room),
    ]
    for name, fn in builders:
        cnt, total = fn()
        print(f'[OK] forge/Templates/{name}: {cnt} files, {total/1048576:.2f} MB (within 8MB & 1MB/file limits)')
