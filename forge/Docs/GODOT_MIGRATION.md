# Godot 코어 런타임 이관

조사·갱신일: 2026-11-17. 브랜치 `PlayForge-GoDot`.

## 이어받은 원본

- 원본 경로: `D:\Github\UnrealSamples-worktrees\GamePlayForge\GamePlayForge`.
- 원본 상위 저장소 HEAD: `aa73830e79ca328478ad9892320a60b2e2960df5`, 브랜치 `GamePlayForge`.
  프로젝트 폴더 자체는 당시 **untracked**였으므로 이 HEAD는 프로젝트 내용의 버전을 증명하지 않습니다.
- Godot 저장소 시작점: `13b665c`, 전용 워크트리 `D:\Github\GoDotProjects-worktrees\PlayForge-GoDot`.
- 원본 폴더는 읽기만 했습니다. node_modules, Saved, 빌드 결과, 다른 프로젝트는 이관에서 제외했습니다.
- `Docs/imports.json`의 기존 원본 279개 중 12개만 실제 파일로 존재했습니다. WebProjects 267개는 원본에서 이미 누락되어 있었습니다.
  실행 불가능한 Nexus Front·삼국지 11 카드와 테스트는 사용 가능 상태로 표시하지 않습니다.
- 기존 설계 문서와 References의 라이선스·출처 기록은 보존합니다. 이관 자체는 외부 자산에 새 사용 권한을 부여하지 않습니다.

## 변경한 실행 경로

```text
Studio GDScript editor ── Yjs / settings revisions ── Node local service
                                                          │
                                     loopback TCP + per-session random token
                                                          │
                                     one Godot process per play session
                                                          │
                      runtime_host.gd → Game.gd → snapshot → native Sprite2D view
```

GDScript는 `extends RefCounted`와 `reset(settings)`, `input(action)`, `update(dt)`, `snapshot()`을 구현합니다.
load는 전달된 source를 새 GDScript 인스턴스로 컴파일하고 reset합니다. Studio 수정은 다음 load에 반영합니다.
기본 프로젝트는 manifest의 runtime.entry에서 선택되며 Studio 작업 데이터와 저장소 파일은 분리되어 있습니다.
기존 Yjs 문서의 내부 키 `lua`와 UI DOM 식별자는 저장·협업 호환성을 위해 남았고, 언어와 표시는 GDScript입니다.

상호작용 모드는 Godot `_physics_process` 60Hz로 진행합니다. Studio는 snapshot만 조회하므로 중복 update가 없습니다.
테스트 모드는 동일 host의 manual clock으로 정확한 dt를 입력합니다. realtime 모드에서 외부 step을 거부합니다.
키보드·마우스는 Godot의 실제 입력 이벤트를 통과합니다. Canvas는 관찰·입력 미러이며 네이티브 창이 실제 렌더러입니다.
Godot 창을 닫거나 bridge가 끊기면 세션이 종료됩니다. 시작 제한 15초, 명령 제한 3초, 대기 명령 최대 10개입니다.

## 실행 계약과 한계

JSON 요청은 load/input/step/settings/snapshot/stop을 지원하며 응답에 Godot 버전·renderer·clock·step·node 수를 포함합니다.
source는 256KB, bridge 메시지는 512KB로 제한합니다. snapshot은 JSON 값으로만 구성된 Dictionary이며 깊이 64,
100,000개 항목 한계와 순환 참조 검사를 적용합니다. 기존 게임의 설정·난수·충돌·점수는 원본 JS와 비교합니다.

**신뢰 경계 변경:** GDScript는 격리 실행기가 아닙니다. OS 파일·네트워크 등 엔진 API에 접근할 수 있습니다.
프로세스별 timeout과 종료는 복구 수단이며 보안 격리가 아닙니다. 공개 UGC 실행 서비스로 노출하는 것은 범위 밖입니다.
Godot GDScript 자체 runtime 오류는 예외 포착 API가 없으므로 프로세스 로그와 계약 검증을 함께 확인해야 합니다.
사용자 스크립트가 임의의 Godot API나 추가 thread를 쓰는 경우까지 안전성을 보증하지 않습니다.

## 재현 가능한 검증

- `Tools/build-engine.ps1`: Godot import와 독립 GDScript smoke. C++ 컴파일은 하지 않습니다.
- `npm test`: 실제 Godot 프로세스에서 원본 JS 동등성, 입력·설정·오류·종료·독립 세션·realtime 등 검사.
- `Tools/test-godot-visible.cjs`: 네이티브 Space/P/R/마우스 이벤트, pause freeze, 300회 dt=0.04,
  seed=698, speed=40, gap=350, interval=4, pipeWidth=25, 16회마다 flap. 최소 1점 획득.
- `npm run test:browser`: 보이는 Chrome와 Godot 창에서 Studio 기능 확인.
- 로그: `Saved/Tests/latest/summary.json`, `godot-game-validation.log`, `godot-native-input.log`,
  `godot-visible.json`, `godot-visible.csv`, `godot-native.png`, `browser/report.json`.

현재 PC: Windows / Godot 4.7.2 / NVIDIA GeForce RTX 4070 Laptop GPU / OpenGL Compatibility.
visible CSV는 명령 왕복 시간으로, GPU frame time이나 대량 객체 성능 벤치마크가 아닙니다.
10개 전체 마일스톤 완료를 주장하지 않습니다. 정식 완료 보고서는 각 게이트가 충족될 때 작성합니다.

## 구현 근거

- [Godot GDScript](https://docs.godotengine.org/en/stable/tutorials/scripting/gdscript/gdscript_basics.html)
- [Godot 고정 시간 처리](https://docs.godotengine.org/en/stable/tutorials/scripting/idle_and_physics_processing.html)
- [StreamPeerTCP](https://docs.godotengine.org/en/stable/classes/class_streampeertcp.html)
- [Image의 런타임 SVG 로드](https://docs.godotengine.org/en/stable/classes/class_image.html)

소스에서 확인한 이식 상태와 테스트 결과는 위 경로로 추적합니다. 플랫폼 export, 범용 scene/prefab,
네이티브 음향·최고 점수 저장, public UGC 격리, 실제 멀티플레이·AI·게시 기능은 추가 구현·검증 항목입니다.

## Web runtime·Official Editor PoC 갱신

갱신일: 2026-11-17. 아래는 기존 Windows native runtime 기록에 추가된 Web/Editor 검증 상태이며, 제품 전체 마이그레이션 완료 보고가 아닙니다.

- `npm run test:web-runtime` (`Tools/test-godot-web.cjs`)가 server에서 실제 Godot Web export를 만들고 Chrome의 Godot WASM에서 Tappy GDScript load, input, pause freeze, restart를 확인했습니다. 결과: `Saved/Tests/web-runtime/runtime.json`, `build.json`, `web-game.png`. Web artifact build 상세는 `Saved/Tests/web-build-result.json`에 있습니다.
- 이 검증은 Studio의 UI PIE와 분리됩니다. UI PIE Canvas는 여전히 native Godot process 실행의 state/visual mirror이며, Chrome smoke는 별도의 실제 WASM game runtime입니다.
- Official upstream Godot 4.7.2 Web Editor vendor 설치의 hash가 확인됐습니다. Browser에서 `crossOriginIsolated` 상태의 WASM startup, ZIP import 완료, `PLAYFORGE_EDITOR_READY`/`pluginReady:true`를 확인했습니다. `npm run test:official-editor` strict smoke는 아래 두 오류로 실패하므로 전체 성공으로 표시하지 않습니다.
- `Godot/addons/playforge_service/plugin.gd`는 project ZIP `Launch/PlayForge-Godot-Project.zip`에 포함되며 native headless import가 통과했습니다. `Tests/plugin-service.test.cjs`는 native Godot에서 HTTP `GET /api/project`, `PUT /api/editor/source`, stale revision `409`를 실제로 확인했습니다. Build polling은 fake fixture라 실제 build API 통합 증거가 아닙니다.
- Official browser editor의 ZIP project import와 plugin ready marker는 확인됐지만 browser에서 plugin HTTP API full round-trip은 검증되지 않았습니다. Strict smoke log `Saved/Tests/web-runtime/official-browser.log`에는 `Attempt of waiting to finish on a thread that was never started`와 TCP `ERR_CANT_CREATE` 두 오류가 있습니다. `Saved/Tests/web-runtime/official-result.json`은 `pluginReady:true`와 이 오류들을 함께 기록합니다.
- 현재 PlayForge engine core patch는 0입니다. Upstream official Web Editor를 vendor해 시험하는 것이 engine fork source를 수정/빌드 완료했다는 의미는 아닙니다.
- 세 launcher는 `--smoke-test` 실제 start/routes/stop을 통과했습니다. `npm test`는 31 checks pass, 두 과거 game suites skip. Browser automation은 각 browser에서 6 pass·2 skip(원본 game fixture 누락)입니다. `npm run test:web-runtime` actual Web WASM smoke는 pass. 이 결과 모두 review acceptance `T001–T064` not_run 상태를 바꾸지 않습니다.

진행·경로 비교 표는 [구현 계획](IMPLEMENTATION_PLAN.md), [마일스톤 인덱스](MILESTONE_PLAN.md), [Cloud/frontends](CLOUD_AND_FRONTENDS.md)를 참조합니다.

