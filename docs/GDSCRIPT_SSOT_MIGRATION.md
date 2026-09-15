# GDScript SSOT 이식 계획

## 결정

`Godot/`의 GDScript와 Godot 프로젝트 설정을 Captain Salvage의 유일한 실행 소스로 한다. PC, Android, Web은 같은 `project.godot`, 같은 씬, 같은 GDScript, 같은 밸런스·시각 데이터에서 내보낸다. 이전 HTML Canvas, Node 테스트, Capacitor, Electron 경로는 이 문서와 같은 변경에서 제거한다.

Godot의 Web 내보내기는 WebAssembly/WebGL 2를 사용하고 C# 프로젝트는 Web을 지원하지 않으므로, GDScript 선택은 세 타겟 공용화에 적합하다. 자세한 제약은 [Godot Web export](https://docs.godotengine.org/en/4.5/tutorials/export/exporting_for_web.html), [Android export](https://docs.godotengine.org/en/latest/tutorials/export/exporting_for_android.html), [export overview](https://docs.godotengine.org/en/stable/tutorials/export/)를 따른다.

## 단일 소스 경계

```text
Godot/scripts/balance.gd       게임 규칙·질량·탄약·무기 수치
Godot/scripts/visual_tuning.gd 색·투명도·흔들림·별 밀도
Godot/scripts/ship_model.gd    격자 점유·연결성·CoM·탄약고 병합
Godot/scripts/ship_body.gd     RigidBody2D 추력·방어막·함체 렌더
Godot/scripts/main.gd          입력·회수/장착·카메라·월드 조립
Godot/export_presets.cfg       PC / Android / Web 내보내기만의 차이
```

플랫폼별 조건부 게임 규칙은 금지한다. Android의 터치 UI나 Web의 브라우저 제약이 필요할 때에도 입력 어댑터만 분기하며 `ShipModel`과 `ShipBody`의 결과를 바꾸지 않는다.

## 마일스톤 이식 순서

| 마일스톤 | 범위 | 통과 조건 |
| --- | --- | --- |
| M20 (완료) | Godot 부트스트랩, GDScript SSOT, 헤드리스 테스트, 기본 조립/회수/추력/방어막 렌더 | Godot 헤드리스에서 질량, 방어막, 탄약 분리·소비, 다칸 장착, 연결 분리, 탄약고 병합 통과 |
| M21 | 모듈별 `CollisionShape2D`, 중립 파트 충돌, 작은/중간/큰 운석 충격 피해 | 2D 물리 충돌과 크기별 피해 규칙 자동·수동 검증 |
| M22 | 레이저·머신건·레일건·수동/미니 유도탄, 탄약고·표적 | 모든 무기·탄약 소모와 2초 미니 미사일 단계 검증 |
| M23 | 정거장 3개, RPG 대화, 업그레이드, 7구역·2중간 보스·최종 보스 | 30분 목표 항로와 게이트 회귀 테스트 |
| M24 | Android 터치/가로 UI, Web PWA 셸, 실제 기기 성능 프로파일 | PC·Android·Web의 동일 세이브/규칙 검증 |
| M25 | 내보내기 QA, Windows 서명 준비, Web HTTPS/Android 설치 검증 | 세 배포물의 수동 릴리스 후보 통과 |

M20은 이전 JavaScript 구현의 모든 기능을 “완료”로 재표기하지 않는다. M21–M25의 미이식 기능은 기존 [GDD](GDD.md)와 [월드 항로 설계](WORLD_ROUTE.md)를 수락 기준으로 유지한다.

## 레거시 제거 목록

- 삭제: `game.js`, `index.html`, `styles.css`, `sw.js`, `manifest.webmanifest`, `data/`, `assets/`, `Platforms/Android/`, Node 기반 빌드/테스트 스크립트.
- 대체: `Build-PC.bat`, `Build-Web.bat`, `Build-Android-Debug.bat`, `Run-PC-Build.bat`, `Run-CaptainSalvage-Tests.bat`, `Tools/Testing/ProjectTests.json`.
- 산출물: `Build/`와 `.godot/`은 재생성 파일로 Git에 넣지 않는다.
