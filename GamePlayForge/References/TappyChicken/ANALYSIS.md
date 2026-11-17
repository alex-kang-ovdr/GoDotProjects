# Tappy Chicken / PlayForge Studio

- **검토일:** 2026-11-17
- **가져온 원본:** [보존한 Studio v18 JS PoC](../../References/PlayForgeStudio/v18/TappyChicken/index.html)
- **실행 프로젝트:** [`Projects/TappyChicken/`](../../Projects/TappyChicken/project.json), project version 2, GamePlayForge C++20 runtime + Lua 5.4.
- **플랫폼:** 현재 네이티브 Lua 런타임은 Windows JSONL 실행 파일이며 Studio는 브라우저 Canvas로 native runtime snapshot을 표시합니다. Android/iOS 및 네이티브 RHI 창은 아직 미검증/미구현입니다.
- **통합 상태:** 실제 게임 규칙은 [`Scripts/Game.lua`](../../Projects/TappyChicken/Scripts/Game.lua)이며 `Engine/build/Release/GamePlayForgeRuntime.exe`가 Lua `Reset/Input/Update/Snapshot`을 실행합니다. Studio PIE가 네이티브 child process를 시작하고 Canvas presenter가 스냅샷을 그립니다. 이는 Unreal 구현이 아닙니다.

## 코드 확인: 구조와 조작

`Projects/TappyChicken/Scripts/Game.lua`가 권위 있는 게임 규칙이며 `Reset(settings)`, `Input(action)`, `Update(dt)`, `Snapshot()` API를 구현합니다. `Engine/src/main.cpp`의 Lua 5.4 host가 JSONL 명령으로 이를 실행하고 Studio가 최신 스냅샷을 presenter에 전달합니다. 가져온 JavaScript reference는 별도 파일 [`References/PlayForgeStudio/v18/TappyChicken/index.html`](../../References/PlayForgeStudio/v18/TappyChicken/index.html)에 보존했으며 게임 규칙 구현으로 실행하지 않습니다.

Studio PIE에서 Space/화면 클릭으로 날갯짓하고 P 또는 pause/resume 컨트롤로 실행을 멈추거나 재개합니다. 재시작과 중지는 native runtime lifecycle에 연결됩니다. 설정은 [`settings.schema.json`](../../Projects/TappyChicken/settings.schema.json)에 정의된 fields/presets를 통해 렌더링되고 저장된 Lua PIE 시작값에 적용됩니다. Tappy sprites는 [`Assets/`](../../Projects/TappyChicken/Assets/) 아래 프로젝트 SVG입니다. Studio scene view와 게임 Canvas는 브라우저 기반이며 native RHI 렌더러가 아닙니다.

## 강점과 한계

**분석 — 강점:** 작은 아케이드 예제가 실제 C++ host에서 Lua 규칙을 돌리고, 화면 표현과 게임 상태를 분리합니다. 결정적인 시드와 difficulty preset, snapshot contract 덕분에 참조 PoC와 동작 비교가 가능합니다. project metadata/settings schema와 asset presenter가 UI를 프로젝트 정의에 연결합니다.

**코드 확인 — 한계:** 현재 실행은 Tappy Chicken의 native Lua + browser Canvas 세로 기능입니다. 네이티브 RHI/Render Graph, 일반 Actor/Component/World API, Android/iOS build, online game replication은 없습니다. UGC sandbox에는 Lua library 제한과 memory/instruction/host timeout budget이 있으나 broader capability/authority API 검증은 미완입니다. 가져온 v18 README/QA는 이전 JS iframe 상태의 설명이므로 현재 런타임의 동작 증거로 재사용하지 않습니다.

현재 로컬 통합은 C++20/Lua 런타임과 Studio Canvas PIE입니다. 다음 엔진 범위는 visible native RHI 창 및 scene/runtime binding이며, Unreal Engine 포팅은 목표가 아닙니다.

## 출처와 권리

이번 검토에서 해당 샘플 코드·프로젝트 안내에 외부 게임 출처 URL은 발견하지 못했습니다. 가져온 파일은 [`References/PlayForgeStudio/v18/`](../../References/PlayForgeStudio/v18/)에 보존되어 있습니다. 현재 SVG는 프로젝트용 신규 도형 자산입니다. 원본 JS PoC의 모든 시각/음향 요소 권리를 전수 확인하지 않았으므로 reference 파일을 재배포하거나 재사용하기 전 출처와 사용 조건을 확인해야 합니다.

## 기존 검증 기록

`node --test Tests/lua-parity.test.cjs`: native Lua runtime과 보존한 JS PoC의 state snapshot parity **1개 suite 통과**(이전 실행 기록). 이 기록은 브라우저 E2E 실행을 뜻하지 않습니다. 현재 browser tests는 아직 검증 결과로 보고하지 않습니다.
