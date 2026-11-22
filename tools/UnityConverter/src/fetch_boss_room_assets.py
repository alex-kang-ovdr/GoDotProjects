import os
import json
import urllib.request
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor, as_completed

REPO = 'Unity-Technologies/com.unity.multiplayer.samples.coop'
BRANCH = 'main'
HDR = {'User-Agent': 'agy'}

REPO_ROOT = Path(__file__).resolve().parents[3]
SAMPLE_DIR = REPO_ROOT / 'tools' / 'UnityConverter' / 'samples' / 'unity-boss-room'

# Selectively fetch core 3D models, character & dungeon textures, core audio, scenes, and representative C# scripts
SELECTED_FILES = [
    # 7 Core 3D Models (LFS ~9.87 MB)
    'Assets/Models/CharacterSet.fbx',
    'Assets/Models/DungeonPieces.FBX',
    'Assets/Models/DungeonBorder.obj',
    'Assets/Models/Animated/door_boss_ani.FBX',
    'Assets/Models/Animated/door_gears_ani.FBX',
    'Assets/Models/Animated/floor_switch_ani.FBX',
    'Assets/Models/Animated/chest_ani.FBX',

    # Environment Textures (LFS)
    'Assets/Textures/Environment/env_deco_BaseColor.tga',
    'Assets/Textures/Environment/env_deco_MetalSmoothEmissive.tga',
    'Assets/Textures/Environment/env_deco_Normal.tga',
    'Assets/Textures/Environment/env_deco_boss_arena_BaseColor.tga',
    'Assets/Textures/Environment/env_deco_boss_arena_MetalSmoothEmissive.tga',
    'Assets/Textures/Environment/env_deco_boss_arena_Normal.tga',

    # Character Textures (Tank, Archer, Mage, Rogue, Imp, Boss)
    'Assets/Textures/Characters/Boss_Head_CLR.tga',
    'Assets/Textures/Characters/Boss_Torso_CLR.tga',
    'Assets/Textures/Characters/Imp_Head_CLR.tga',
    'Assets/Textures/Characters/Imp_Helmet_CLR.tga',
    'Assets/Textures/Characters/Imp_Torso_CLR.tga',
    'Assets/Textures/Characters/Imp_Weapons_CLR.tga',
    'Assets/Textures/Characters/Tank_Head_Boy_CLR.tga',
    'Assets/Textures/Characters/Tank_Hair_Boy_CLR.tga',
    'Assets/Textures/Characters/Tank_Torso_CLR.tga',
    'Assets/Textures/Characters/Tank_Weapon_CLR.tga',
    'Assets/Textures/Characters/Archer_Head_Boy_CLR.tga',
    'Assets/Textures/Characters/Archer_Hair_Boy_CLR.tga',
    'Assets/Textures/Characters/Archer_Torso_CLR.tga',
    'Assets/Textures/Characters/Archer_Weapons_CLR.tga',
    'Assets/Textures/Characters/Mage_Head_Girl_CLR.tga',
    'Assets/Textures/Characters/Mage_Hair_Girl_CLR.tga',
    'Assets/Textures/Characters/Mage_Torso_CLR_Girl.tga',
    'Assets/Textures/Characters/Mage_Weapons_CLR.tga',
    'Assets/Textures/Characters/Rogue_Head_Boy_CLR.tga',
    'Assets/Textures/Characters/Rogue_Hair_Boy_CLR.tga',
    'Assets/Textures/Characters/Rogue_Torso_CLR.tga',
    'Assets/Textures/Characters/Rogue_Weapon_CLR.tga',
    'Assets/Textures/Characters/Hero_Eyes.png',
    'Assets/Textures/Characters/Hero_Mouths.png',
    'Assets/Textures/Characters/Enemy_Eyes.png',
    'Assets/Textures/Characters/Enemy_Mouths.png',

    # Core Audio Clips (Representative SFX for each class, boss, and environment)
    'Assets/Sounds/Character/Archer/archer_attk_a.wav',
    'Assets/Sounds/Character/Archer/archer_powershot.wav',
    'Assets/Sounds/Character/Boss/charge_attack_start.wav',
    'Assets/Sounds/Character/Boss/charge_attack_end.wav',
    'Assets/Sounds/Character/Boss/defeat_a.wav',

    # Official Documentation Screenshots & Scene YAML
    'Documentation/Images/Banner.png',
    'Documentation/Images/Boss.png',
    'Assets/Scenes/BossRoom/DungeonBossRoom.unity',

    # Representative C# Architecture Scripts (Action System, Netcode, Boss AI)
    'Assets/Scripts/Gameplay/Action/Action.cs',
    'Assets/Scripts/Gameplay/Action/ActionPlayers/ServerActionPlayer.cs',
    'Assets/Scripts/Gameplay/Action/ActionPlayers/ClientActionPlayer.cs',
    'Assets/Scripts/Gameplay/Action/ConcreteActions/MeleeAction.cs',
    'Assets/Scripts/Gameplay/Action/ConcreteActions/AOEAction.cs',
    'Assets/Scripts/Gameplay/Action/ConcreteActions/ChargedShieldAction.cs',
    'Assets/Scripts/Gameplay/Action/ConcreteActions/TrampleAction.cs',
    'Assets/Scripts/Gameplay/Action/ConcreteActions/DashAttackAction.cs',
    'Assets/Scripts/Gameplay/Action/ConcreteActions/ReviveAction.cs',
]


def download_one(rel_path: str):
    dst = SAMPLE_DIR / rel_path
    if dst.exists() and dst.stat().st_size > 256:
        return rel_path, dst.stat().st_size, 'cached'
    dst.parent.mkdir(parents=True, exist_ok=True)
    # Use media.githubusercontent.com for LFS-backed files, raw for pure text .cs
    base = 'raw.githubusercontent.com' if rel_path.endswith('.cs') else 'media.githubusercontent.com/media'
    url = f'https://{base}/{REPO}/{BRANCH}/{rel_path}'
    req = urllib.request.Request(url, headers=HDR)
    with urllib.request.urlopen(req, timeout=45) as r:
        data = r.read()
    dst.write_bytes(data)
    return rel_path, len(data), 'downloaded'


def main():
    SAMPLE_DIR.mkdir(parents=True, exist_ok=True)
    total = 0
    ok = 0
    errors = []
    with ThreadPoolExecutor(max_workers=6) as ex:
        futs = {ex.submit(download_one, p): p for p in SELECTED_FILES}
        for fut in as_completed(futs):
            p = futs[fut]
            try:
                rel, sz, st = fut.result()
                total += sz
                ok += 1
            except Exception as e:
                errors.append((p, str(e)))
    print(f'Fetched {ok}/{len(SELECTED_FILES)} files ({total/1048576:.2f} MB) -> {SAMPLE_DIR}')
    if errors:
        print('Errors:', errors)


if __name__ == '__main__':
    main()
