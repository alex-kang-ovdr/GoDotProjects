# 엔진 패치 기록: ForgeAvatar (아바타·CoreHUD 봉인)

- 관리 브랜치: godot-engine 포크 저장소(`D:/Github/godot-engine`)의 `Forge-Refactoring-ForgeAvatar` (로컬 생성, 기준 `ed003ce5` = 아바타 패치 3건의 끝). PlayHub 저장소에는 엔진 브랜치를 두지 않는다.
- 결정: 2026-11-25 사용자 결정 D2 — 엔진 패치로 유지 ([SSOT.md](../SSOT.md) §5)
- 양식: 로드맵 §13 (이유·대체 불가 API·회귀 fixture·upstream 상태·제거 조건)
- 엔진 밖 코드(`forge/Godot/addons/playforge_avatar/**`, Hub 상점·락커)는 계속 Forge-Avatar 소유다.

## 패치 목록 (upstream `4.7.2-stable` `ed1daf0` 기준)

| 커밋 | 날짜 | 변경 파일 | 내용 |
| --- | --- | --- | --- |
| `a18fb005` | 2026-11-21 | `core/object/object.*`, `scene/main/node.*`, `scene/main/scene_tree.*`, `scene/3d/node_3d.cpp`, `scene/main/canvas_item.cpp`, `scene/main/canvas_layer.cpp`, `core/io/file_access*.{h,cpp}`, `main/main.cpp`, `modules/playforge_core/**` | 봉인 오브젝트의 free·set_script·remove_child·reparent·숨김 차단, 사용자 CanvasLayer.layer ≤ 100 강제, `--playforge-core-pack`/`--playforge-ugc-pack` 마운트와 `addons/playforge_avatar/` VFS 봉인, PlayForgePlatform 싱글톤·좌상단 CoreHUD(layer 128)·빈 3D 씬 자동 아바타 |
| `fe0b4fe1` | 2026-11-21 | `scene/gui/control.*`, `scene/main/canvas_item.cpp`, `modules/playforge_core/playforge_platform.*` | 봉인 Control 최소 크기·축소 하한, 알파 0.85 미만 투명화 차단, 아바타 표현 모드 4종(3D 월드·상반신·전신·병행) |
| `ed003ce5` | 2026-11-22 | `modules/playforge_core/playforge_platform.*` | 아바타·CoreHUD 임시 숨김 예산(최대 30초, 초당 0.2초 충전, 실시간 기준), 템플릿별 스폰 위치·초상 좌표 프로젝트 설정 |
| `814b87c8` | 2026-11-25 | `scene/main/node.{h,cpp}`, `modules/playforge_core/playforge_platform.cpp` | 위 결함 수정: 봉인 노드 루트 보존(월드 위치 유지·정지)과 다음 씬 입양, 봉인 노드 자기 해제 허용 |

## 유지 이유와 대체 불가 API

| 요구 | 공개 API로 안 되는 이유 | 해당 패치 |
| --- | --- | --- |
| 사용자 GDScript·UGC 팩이 플랫폼 UI·아바타를 삭제·숨김·스크립트 교체하지 못하게 함 | Godot에는 노드 단위 쓰기 보호가 없다. 같은 프로세스의 사용자 스크립트는 모든 노드에 `queue_free`·`set_script`·`visible` 접근이 가능하다 | `a18fb005` |
| 플랫폼 팩 경로를 UGC 팩이 덮어쓰지 못하게 함 | `ProjectSettings.load_resource_pack(replace_files)`는 경로 단위 보호를 하지 않는다 | `a18fb005` |
| 크기 축소·투명화로 우회하는 숨김 차단 | Control·CanvasItem 속성은 사용자 코드에서 자유롭게 바뀐다 | `fe0b4fe1` |
| 숨김 허용량을 실시간 기준으로 제한 | `Engine.time_scale`·일시정지·씬 전환으로 GDScript 타이머를 우회할 수 있다 | `ed003ce5` |

`modules/playforge_core`의 싱글톤·HUD·표현 모드 부분은 모듈 코드라 코어 수정은 아니다. 코어 수정(E3)에 해당하는 것은 `core/`·`scene/`·`main/` 변경이다.

## 회귀 fixture (현재 상태와 할 일)

- 2026-11-25 포크 `playforge/tests/`(커밋 `bb65179d`)에 헤드리스 회귀 테스트를 추가했다. 실행: `python playforge/tests/run.py` (편집기 4.7.2 custom_build e7a83dd73).
- 통과: 부트스트랩(CoreHUD layer 128·봉인 아바타·spawn_position), 아바타 봉인(free·remove·reparent·set_script·숨김·축소·process_mode 차단), CoreHUD 봉인(layer 100 클램프 포함), 초상 최소 크기·투명도 하한, 숨김 예산(30초 상한·실시간 소모·0.2초/초 충전), VFS 봉인.
- **수정 완료(2026-11-25, 포크 `814b87c8`)**: 봉인된 자식을 가진 부모를 권한 범위 밖에서 해제하면 `NOTIFICATION_PREDELETE`의 `remove_child`가 봉인 검사에 막혀 자식이 이중 삭제되며 크래시(0xC0000374)했다. 순정 4.7.2에서는 같은 코드가 정상이라 upstream 수정 대상이 아니다. 수정: 권한 밖에서 서브트리를 떼어내거나 해제하면 안의 봉인 노드를 트리 루트로 옮겨 마지막 월드 위치를 유지하고 정지시키며(`Node::_playforge_preserve_sealed_descendants`), 다음 씬이 로드되면 새로 만들지 않고 입양한다(`ensure_scene_avatar`). 봉인 노드 자신의 해제는 부모에서 빠지는 동작을 허용한다. `sealed_parent_free` 16건, `portrait_mode_switch` 통과. `root.remove_child(current_scene)` 우회도 같은 보존으로 막혔다.
- 우회 관찰(판정 없음): `node_added`로 숨긴 HUD 참조 획득, `transform` 대입으로 아바타 축소, 위치 이동으로 화면 밖 숨김, `root.remove_child(current_scene)` 연쇄 제거, Windows에서 대소문자 다른 경로로 봉인 디렉터리 쓰기.
- 미검증: 코어 팩(.pck) 경로와 그 스크립트, CoreHUD 버튼.

## upstream 상태

- upstream에 제안하지 않는다. 플랫폼 전용 정책이라 upstream 채택 대상이 아니다.
- 패치는 포크 `Forge-Refactoring` 브랜치에 커밋으로 유지되므로 재적용하지 않는다. upstream Godot 버전을 올릴 때만 merge 충돌을 한 번 해결한다(2026-11-25 upstream master 시험 병합: 우리 패치 파일 중 충돌 8개, 이 중 아바타 쪽은 `main/main.cpp`, `scene/main/node.cpp`, `scene/main/scene_tree.cpp`).

## 제거 조건

- upstream이 노드·리소스 단위 접근 제어(샌드박스)를 제공하면 그 API로 옮기고 코어 수정을 제거한다.
- 또는 UGC 실행을 OS 수준으로 격리해 플랫폼 UI를 별도 프로세스·오버레이로 그리게 되면(로드맵 30, Hub-Desktop 오버레이) 제거를 검토한다.

## 반영 대상 산출물

`engine-ssot.json` 기준으로 포크 빌드가 끝난 타깃은 `web-editor`뿐이다. 나머지 5개 타깃(desktop-windows, web-template, cloudrun-worker, android-aar, ios-xcframework)은 포크 재빌드 전까지 이 패치가 들어가지 않으므로, 그 플랫폼에서는 봉인이 동작하지 않는다.
