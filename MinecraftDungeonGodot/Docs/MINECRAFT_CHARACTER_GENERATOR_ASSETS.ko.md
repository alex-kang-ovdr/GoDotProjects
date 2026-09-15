# Minecraft Character Generator · Authored Cuboids 13

`assets/minecraft_character_generator/authored13/`에 13개의 Godot용 GLB를 복사했습니다. 각 GLB는 원본 Blender authored cuboid 메시와 Rigify rigid 스키닝, `Idle`, `Walk`, `Run`, `Jump`, `Attack` 애니메이션을 포함합니다.

## 캐릭터

마리오, 루이지, 와리오, 요시, 커비, 크리퍼, 스티브, 루피, 돼지, 볼트 마우스, 이브이, Roblox R6(R5 요청 대응), Roblox R15입니다. 정확한 원본 경로와 SHA-256은 `assets/minecraft_character_generator/manifest-authored13.json`에 기록되어 있습니다.

## 런타임 사용

프로젝트 스크립트 `scripts/character_asset_catalog.gd`를 사용하면 씬에서 바로 로드할 수 있습니다.

```gdscript
var actor := CharacterAssetCatalog.instantiate("mario")
if actor:
    add_child(actor)
    actor.position = Vector3(0, 1, 0)
```

직접 씬으로 로드하려면 `res://assets/minecraft_character_generator/authored13/mario.glb`와 같이 참조합니다. Godot가 최초 실행 시 `.glb.import`를 생성하므로 복사 직후 한 번 프로젝트를 열어 임포트를 완료하십시오.

복사한 13종을 한 화면에서 확인하려면 `RunCharacterGallery.bat`을 실행하거나 `scenes/authored_characters_gallery.tscn`을 엽니다. 명령행에서는 다음처럼 실행할 수 있습니다.

```bat
Godot_v4.7.2-stable_win64.exe --path D:\Github\GoDotProjects\MinecraftDungeonGodot --editor scenes/authored_characters_gallery.tscn
```

갤러리 씬은 공통 조명·바닥·카메라를 만들고 각 캐릭터의 `Walk` 클립을 자동 재생합니다. 기존 `scenes/main.tscn`은 변경하지 않았습니다.

이 자산 묶음은 MinecraftDungeonGodot의 기존 월드/플레이어 코드를 변경하지 않습니다. 캐릭터 전시나 NPC 씬에 인스턴스하고, `AnimationPlayer`에서 다섯 클립을 선택해 재생할 수 있습니다.
