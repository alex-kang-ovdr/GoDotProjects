# PlayForge 커스텀 Godot 엔진 SSOT 및 6대 타깃 릴리스 파이프라인 설계

- **정본 저장소:** `git@github.com:alex-kang-ovdr/godot-engine.git` (서브모듈 경로: `godot-engine`)
- **기반 버전:** 공식 Godot `4.7.2-stable` (`ed1daf0bf001b61586d9930840f2f1394092c079`)
- **현재 포크 핀:** `e7a83dd7399f1c359e62502b23c93b54ced8a860` (2026-11-25 갱신, 코어 패치 7건 목록은 `docs/forge-refactoring/SSOT.md` §3) (`tools/engine/engine-ssot.json` 단일 정본)
- **필수 커스텀 심볼:** `PlayForgePlatform`, `playforge-core-pack` (`modules/playforge_core`)
- **전 플랫폼 공통 SCons 불변식:**
  - `module_playforge_core_enabled = "yes"` (아바타 C++ VFS 봉인 · `PlayForgeCoreHUD` · 3D 초상 UI)
  - `openxr = "no"`, `module_openxr_enabled = "no"`, `module_webxr_enabled = "no"`, `module_mobile_vr_enabled = "no"`, `module_camera_enabled = "no"`

---

## 1. 6대 타깃 현재 전환 현황 (`npm run check:engine-ssot`)

| 타깃 | 현재 상태 | 프로파일 / 락파일 | 전환 완료 조건 |
|---|---|---|---|
| `web-editor` | ✅ `migrated` (`ae7c5e7b`) | `tools/forge/web_editor_release_slim.py` | 포크 태그 릴리스 배포 후 구 `install-web-editor.ps1`/`upstream.json` 제거 |
| `web-template` | ⏳ `pending_fork_rebuild` | `tools/forge/web_editor_release_slim.py` (`target=template_release`) | 포크 웹 익스포트 템플릿 빌드 후 `games/forge-*/Web/index.wasm` 18종 재익스포트 |
| `desktop-windows` | ⏳ `pending_fork_rebuild` | `tools/desktop/custom.py` | Windows `editor` + `template_release` 포크 빌드 릴리스 및 `prepare-player.ps1`·`package-windows-server.ps1` 전환 |
| `cloudrun-worker` | ⏳ `pending_fork_rebuild` | `deploy/cloudrun/build-worker/Dockerfile` | Linux headless + 웹 템플릿 포크 릴리스 URL + SHA-256 핀닝 전환 |
| `android-aar` | ⏳ `pending_fork_rebuild` | `tools/aos/godot-aar.lock.json` | Android `template_release` AAR 포크 빌드 → `forkCommit`을 `e7a83dd7...`로 갱신 |
| `ios-xcframework` | ⏳ `pending_fork_rebuild` | `tools/ios/godot-xcframework.lock.json` | macOS에서 iOS `template_release` XCFramework 포크 빌드 → `forkCommit`을 `e7a83dd7...`로 갱신 |

---

## 2. 단일 릴리스 아티팩트 네이밍 규약 (포크 태그 `playforge-4.7.2-<shortsha>`)

`alex-kang-ovdr/godot-engine`에서 태그 푸시 시 GitHub Actions 릴리스 매트릭스로 6대 산출물과 `SHA256SUMS.txt`를 일괄 발행합니다:

1. `playforge-godot-4.7.2-<sha>-web-editor-slim.zip` (`platform=web target=editor`, `web_editor_release_slim.py`)
2. `playforge-godot-4.7.2-<sha>-web-template-release.zip` (`platform=web target=template_release`)
3. `playforge-godot-4.7.2-<sha>-linux-headless.tar.xz` (`platform=linuxbsd target=editor` + `tools/desktop/custom.py`)
4. `playforge-godot-4.7.2-<sha>-windows-x86_64.zip` (`platform=windows target=editor` + `template_release`, `tools/desktop/custom.py`)
5. `playforge-godot-4.7.2-<sha>-android-aar.zip` (`platform=android target=template_release arch=arm64` + XR/camera 비활성)
6. `playforge-godot-4.7.2-<sha>-ios-xcframework.zip` (`platform=ios target=template_release` arm64 + simulator + XR/camera 비활성)
7. `playforge-godot-4.7.2-<sha>-SHA256SUMS.txt`

---

## 3. 자동 차단 게이트 및 전환 절차

- **공통 리졸버 (`tools/engine/resolve-godot.{cjs,mjs}`):**
  - 우선순위: `GODOT_BIN` 명시 → 포크 빌드(`godot-engine/bin/`, `artifacts/local-runtime/godot-fork/`, `Forge-GodotEngine/bin/`) → 레거시 순정 폴백 (`requireFork: true` 시 순정 즉시 거부).
  - `forge/Tools/native-runtime.cjs`와 `tools/Gamer/GamerQA/suites/runtime-godot/index.mjs`가 이 리졸버를 공유합니다.
- **Tier 1 Fast Gate 자동 검증 (`tools/qa/contract.engine-ssot.test.mjs`):**
  - `godot-engine` 서브모듈 커밋과 `tools/engine/engine-ssot.json`의 `pinnedForkCommit` 일치 강제.
  - `knownStockFallbackPending`에 등재된 3개 파일 외 **신규 공식 Godot URL(`godotengine/godot-builds`, `downloads.godotengine.org`) 유입 즉시 FAIL**.
  - 모든 SCons 프로파일의 `module_playforge_core_enabled="yes"` 및 XR/카메라 비활성 불변식 강제.
- **타깃별 전환 마감 절차:**
  1. 포크 태그 릴리스에서 해당 타깃 아티팩트 빌드·업로드.
  2. Dockerfile/락파일/스크립트를 포크 릴리스 URL + SHA-256으로 교체.
  3. `tools/engine/engine-ssot.json`에서 해당 타깃을 `status: "migrated"`, `expectedForkCommit: "<pinnedForkCommit>"`로 변경하고, `knownStockFallbackPending`에서 제거.
  4. 6개 타깃 모두 전환 완료 시 `node tools/engine/check-engine-ssot.mjs --strict`를 `npm run gate` 기본 모드로 승격.
