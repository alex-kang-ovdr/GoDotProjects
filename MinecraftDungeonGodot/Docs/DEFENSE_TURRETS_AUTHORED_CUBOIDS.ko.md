# Authored Cuboids 디펜스 터렛 10종

`assets/minecraft_character_generator/turrets/`에 Arrow Sentry, Cannon Bastion, Prism Laser, Frost Spire, Flame Thrower, Tesla Coil, Mortar Nest, Gatling Array, Crystal Nova, Railgun Foundry를 넣었습니다.

각 GLB는 `TurretRoot → YawJoint → PitchJoint → RecoilJoint` 계층과 독립 cube 메시만 사용합니다. Skeleton3D, vertex group, skin modifier가 없으며 다음 클립을 부위별 관절 변환으로 제공합니다.

좌표는 authored Y-up 기준으로 설계하고 Blender Z-up으로 변환한 뒤 GLB로 내보냅니다. 따라서 Godot에서 받침대의 최저점이 Y=0에 놓이고 포신은 -Z 방향을 향합니다.

- `Install`: 지면에서 올라와 설치
- `Aim`: yaw/pitch 조준
- `Fire`: recoil joint 반동
- `Destroy`: root 전복과 부품 산개

`RunDefenseTurrets.bat`을 실행하면 10종 갤러리가 열립니다. 키보드 `1`~`4`로 애니메이션을 전환합니다.

원본 생성 스크립트는 MinecraftCharacterGenerator의 `Scripts/turrets.py`와 `Scripts/build_turrets.py`에 있습니다. Godot 임포트용 메타데이터는 `assets/minecraft_character_generator/turrets/manifest.json`입니다.
