# 엔진 패치 기록: ForgeAvatar (아바타·CoreHUD 봉인)

- 관리 브랜치: godot-engine 포크 저장소(`D:/Github/godot-engine`)의 `Godot-Refactoring-ForgeAvatar` (로컬 생성, 기준 `ed003ce5` = 아바타 패치 3건의 끝). PlayHub 저장소에는 엔진 브랜치를 두지 않는다.
- 결정: 2026-11-25 사용자 결정 D2 — 엔진 패치로 유지 ([SSOT.md](../SSOT.md) §5)
- 양식: 로드맵 §13 (이유·대체 불가 API·회귀 fixture·upstream 상태·제거 조건)
- 엔진 밖 코드(`forge/Godot/addons/playforge_avatar/**`, Hub 상점·락커)는 계속 Forge-Avatar 소유다.

## 패치 목록 (upstream `4.7.2-stable` `ed1daf0` 기준)

| 커밋 | 날짜 | 변경 파일 | 내용 |
| --- | --- | --- | --- |
| `a18fb005` | 2026-11-21 | `core/object/object.*`, `scene/main/node.*`, `scene/main/scene_tree.*`, `scene/3d/node_3d.cpp`, `scene/main/canvas_item.cpp`, `scene/main/canvas_layer.cpp`, `core/io/file_access*.{h,cpp}`, `main/main.cpp`, `modules/playforge_core/**` | 봉인 오브젝트의 free·set_script·remove_child·reparent·숨김 차단, 사용자 CanvasLayer.layer ≤ 100 강제, `--playforge-core-pack`/`--playforge-ugc-pack` 마운트와 `addons/playforge_avatar/` VFS 봉인, PlayForgePlatform 싱글톤·좌상단 CoreHUD(layer 128)·빈 3D 씬 자동 아바타 |
| `fe0b4fe1` | 2026-11-21 | `scene/gui/control.*`, `scene/main/canvas_item.cpp`, `modules/playforge_core/playforge_platform.*` | 봉인 Control 최소 크기·축소 하한, 알파 0.85 미만 투명화 차단, 아바타 표현 모드 4종(3D 월드·상반신·전신·병행) |
| `ed003ce5` | 2026-11-22 | `modules/playforge_core/playforge_platform.*` | 아바타·CoreHUD 임시 숨김 예산(최대 30초, 초당 0.2초 충전, 실시간 기준), 템플릿별 스폰 위치·초상 좌표 프로젝트 설정 |

## 유지 이유와 대체 불가 API

| 요구 | 공개 API로 안 되는 이유 | 해당 패치 |
| --- | --- | --- |
| 사용자 GDScript·UGC 팩이 플랫폼 UI·아바타를 삭제·숨김·스크립트 교체하지 못하게 함 | Godot에는 노드 단위 쓰기 보호가 없다. 같은 프로세스의 사용자 스크립트는 모든 노드에 `queue_free`·`set_script`·`visible` 접근이 가능하다 | `a18fb005` |
| 플랫폼 팩 경로를 UGC 팩이 덮어쓰지 못하게 함 | `ProjectSettings.load_resource_pack(replace_files)`는 경로 단위 보호를 하지 않는다 | `a18fb005` |
| 크기 축소·투명화로 우회하는 숨김 차단 | Control·CanvasItem 속성은 사용자 코드에서 자유롭게 바뀐다 | `fe0b4fe1` |
| 숨김 허용량을 실시간 기준으로 제한 | `Engine.time_scale`·일시정지·씬 전환으로 GDScript 타이머를 우회할 수 있다 | `ed003ce5` |

`modules/playforge_core`의 싱글톤·HUD·표현 모드 부분은 모듈 코드라 코어 수정은 아니다. 코어 수정(E3)에 해당하는 것은 `core/`·`scene/`·`main/` 변경이다.

## 회귀 fixture (현재 상태와 할 일)

- 현재: 포크 커밋 메시지에 "스킨 10종 × 장착물 20종 멀티월드 접속 및 위변조 차단 검증"이 기록돼 있으나, 저장소에서 재실행 가능한 fixture 위치는 확인하지 못했다(미확인).
- 할 일: 봉인 위반 시도(삭제·스크립트 교체·reparent·축소·투명화·layer 초과·팩 덮어쓰기·숨김 예산 초과)를 각각 실행하는 헤드리스 시험을 만들고, 위반 카운터가 늘고 상태가 유지되는지 확인한다. 위치는 이 브랜치의 owns 경로로 정한다.

## upstream 상태

- upstream에 제안하지 않는다. 플랫폼 전용 정책이라 upstream 채택 대상이 아니다.
- 패치는 포크 `Godot-Refactoring` 브랜치에 커밋으로 유지되므로 재적용하지 않는다. upstream Godot 버전을 올릴 때만 merge 충돌을 한 번 해결한다(2026-11-25 upstream master 시험 병합: 우리 패치 파일 중 충돌 8개, 이 중 아바타 쪽은 `main/main.cpp`, `scene/main/node.cpp`, `scene/main/scene_tree.cpp`).

## 제거 조건

- upstream이 노드·리소스 단위 접근 제어(샌드박스)를 제공하면 그 API로 옮기고 코어 수정을 제거한다.
- 또는 UGC 실행을 OS 수준으로 격리해 플랫폼 UI를 별도 프로세스·오버레이로 그리게 되면(로드맵 30, Hub-Desktop 오버레이) 제거를 검토한다.

## 반영 대상 산출물

`engine-ssot.json` 기준으로 포크 빌드가 끝난 타깃은 `web-editor`뿐이다. 나머지 5개 타깃(desktop-windows, web-template, cloudrun-worker, android-aar, ios-xcframework)은 포크 재빌드 전까지 이 패치가 들어가지 않으므로, 그 플랫폼에서는 봉인이 동작하지 않는다.
