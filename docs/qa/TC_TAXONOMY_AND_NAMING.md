# PlayHub-Platform QA 테스트 분류 체계 및 네이밍 규약 (SSOT)

이 문서는 저장소 내 모든 자동화 테스트(`*.test.{mjs,cjs,js}`)의 단일 정본 카탈로그([tools/qa/test-catalog.json](../../tools/qa/test-catalog.json)), 표준 네이밍 규약, 선택적 스위트 실행기([tools/qa/run-suite.mjs](../../tools/qa/run-suite.mjs)), 그리고 QA 게이트 위생 규칙([tools/qa/contract.gate-hygiene.test.mjs](../../tools/qa/contract.gate-hygiene.test.mjs))을 정의한다.

---

## 1. 단일 정본 카탈로그 (`tools/qa/test-catalog.json`)

저장소 내 모든 테스트 파일(`node_modules/`, `fixtures/`, `ported/`, `references/`, `Saved/`, `dist/`, `.git/`, `artifacts/` 제외)은 **예외 없이 100%** `tools/qa/test-catalog.json`에 등록되어야 한다.

- **사각지대 0 · 유령 항목 0**: `tools/qa/contract.gate-hygiene.test.mjs`가 디스크와 카탈로그를 1:1 대조하여 미등록 테스트나 삭제된 유령 항목을 CI Tier 1에서 즉시 차단한다.
- **`fast-gate.mjs` 통합**: `npm run test:fast` (`tools/qa/fast-gate.mjs`)는 `tools/qa/test-catalog.json`의 `tier === "fast"` 항목을 우선 실행한다. `tools/qa/fast-gate.json`은 레거시 도구 호환용 미러로 유지한다.
- **Quarantine 정책**: 실패 중인 테스트를 임의로 삭제하거나 영구 방치하지 않는다. 일시 격리가 불가피하면 `quarantine` 객체에 반드시 `{ "reason": "...", "owner": "<브랜치/담당>", "expiresAt": "<ISO-8601>" }` 형식으로 등록하며, **최대 유효 기간은 7일**이다. 7일 초과 또는 만료된 항목은 게이트 위생 테스트가 자동 실패 처리한다.

---

## 2. 표준 분류 3축 (`tier` · `suites` · `envs`)

### 2.1 실행 계층 (`tier` — 단일 선택)

| `tier` | 실행 환경 요구사항 | 실행 시점 |
|---|---|---|
| `fast` | **순수 Node.js 24+ 전용** (Chrome CDP·Playwright·Godot 바이너리·Blender·Windows 전용 기능 금지, CI `ubuntu-latest`에서 빠르게 통과) | 모든 커밋/PR (`npm run gate`, `pr-fast-gate.yml`) |
| `integration` | Chrome CDP / Playwright 브라우저, Godot 4.7.2 헤드리스/WASM 벤더, Windows Portable, Headless Blender, 개별 게임 내부 엔진 시뮬레이션(`games/**`) | 해당 영역 변경 시, 릴리스 후보(RC) 검증 |
| `nightly` | GamerQA AI 플레이 플래너, 데일리 성능 프로파일러, 라이브 멀티플레이 서버, 게임 과거 아카이브 버전(`Archive/`, `ReverseDesign/`) | 야간 스케줄, Live 승격 전 |

### 2.2 기능/영역 스위트 (`suites` — 1개 이상 다중 태그)

| 스위트 ID | 한글 별칭 | 범위 |
|---|---|---|
| `smoke` | `스모크` | 핵심 기동·에셋·프록시·배포 패키징·preflight·게이트 위생 최우선 스모크 |
| `component` | `컴포넌트` | 단위 로직, 스키마 SSOT, API DTO 계약, 직렬화, 컨버터, 버전/빌드 유틸 |
| `regression` | `변경회귀` (`회귀`) | 보안 불변식, 결제/멀티플레이어 하드닝, 스냅샷/백업/스키마 등 재발 방지 회귀 TC |
| `hub` | `허브` | PlayHub 사용자·관리자 서버/API, DB, 빌링, CDN, SSO, SSOT, L10N, UGC, 에이전트, 쇼츠 |
| `forge` | `포지` | PlayForge 서버, 웹 에디터, 빌드 큐, 드라이브 동기화, Godot 애드온, Roblox/Unity 컨버터 |
| `system` | `시스템` | Cloud Run, 배포 아카이브, 백업/복원, 비식별화, Dev 프록시, DevOps, QA 게이트 인프라 |
| `multiplatform` | `멀티플랫폼` | iOS, Android(AOS), Desktop, 크로스플레이, 멀티플레이어 호환·릴레이, 모바일 API |
| `user` | `유저` | 인증/로그인/SSO, 프로필/아바타, 결제/상점, 소셜/친구/커뮤니티, 위시리스트, UX, L10N |
| `game` | `게임` | 웹게임 포털 계약·규칙·세이브, UGC 퍼블리시, 멀티플레이 룸, GamerQA, `games/**` 시뮬레이션 |
| `browser` | `브라우저` | Chrome CDP / Playwright 실제 브라우저 기동 UI·E2E 테스트 (자동 `--tier all`) |
| `godot` | `고도` | Godot 4.7.2 헤드리스·GDScript 런타임·에디터·WASM 릴리스 테스트 (자동 `--tier all`) |
| `portable` | `포터블` | Windows 전용 Portable 패키징·ACL·Rebex·런타임 테스트 (자동 `--tier all`) |

### 2.3 대상 환경 (`envs` — 1개 이상 다중 태그)

| 환경 ID | 별칭 | 의미 |
|---|---|---|
| `local` | `로컬` | 로컬 개발 PC / loopback 단독 실행 환경 |
| `dev` | `Dev`, `dev`, `개발` | Dev 팜·스테이징·CI 통합 환경 (Dev 오버레이, 프록시, QA 파이프라인 등) |
| `live` | `Live`, `live`, `라이브` | Live 프로덕션 계약·보안·비식별화·모바일 릴리스 게이트·스냅샷 가드 |

---

## 3. TC 파일 네이밍 규약

새 테스트 파일을 만들 때는 목적과 실행 요구사항이 파일명만으로도 즉시 드러나도록 아래 접두/접미 규칙을 따른다.

| 패턴 | 용도 | 기본 `tier` | 예시 |
|---|---|---|---|
| `smoke.<주제>.test.{mjs,cjs}` | 핵심 헬스·에셋·패키징 최우선 스모크 | `fast` | `hub/tests/smoke.assets.test.mjs` |
| `contract.<주제>.test.{mjs,cjs}` | 스키마 SSOT, API DTO, 배포 패키징, 게이트 위생 등 정적/구조 계약 | `fast` | `hub/tests/contract.schema-ssot.test.mjs`, `tools/qa/contract.gate-hygiene.test.mjs` |
| `regression.<주제>.test.{mjs,cjs}` | 보안 불변식, 멀티플레이어 하드닝 등 특정 결함·사고 재발 방지 회귀 | `fast` | `hub/tests/regression.security-invariants.test.mjs`, `forge/Tests/regression.multiplayer-hardening.test.cjs` |
| `<주제>.browser.test.{mjs,cjs}` | Chrome CDP / Playwright 브라우저 실제 기동 검증 | `integration` (`browser`) | `hub/tests/data-snapshot.browser.test.mjs`, `hub/tests/site.browser.test.mjs` |
| `<주제>.godot.test.{mjs,cjs}` | Godot 헤드리스 / 에디터 바이너리 필요 검증 | `integration` (`godot`) | `forge/Tests/playforge_avatar/<주제>.godot.test.cjs` |
| `<주제>.portable.test.{mjs,cjs}` (또는 `portable.<주제>.test.{mjs,cjs}`) | Windows Portable 패키징·ACL·Rebex 전용 검증 | `integration` (`portable`) | `hub/tests/portable.acl.windows.test.mjs` |

> **중요**: `tier: "fast"` 파일에는 `--remote-debugging-port`, `launchCdpBrowser`, `playwright` import/require, `chromium.launch()` 등 실제 브라우저 직접 기동 코드를 섞지 않는다. 브라우저 검증이 필요하면 반드시 `*.browser.test.*`로 분리하고 `tier: "integration"`, `suites: ["browser", ...]`로 등록한다.

---

## 4. 선택적 스위트 실행법 (`run-suite.mjs` & `npm run qa:*`)

> **Node.js 24 이상 필수**: 시스템 `node`가 24 미만이면 `artifacts/local-runtime/node24/node.exe`를 사용한다.

### 4.1 `package.json` 단축 스크립트

| 명령 | 동작 |
|---|---|
| `npm run qa:summary` | 카탈로그 전체 계층·스위트·환경별 집계 출력 |
| `npm run qa:smoke` | `smoke` 스위트 (Tier 1 Fast) 실행 |
| `npm run qa:component` | `component` 스위트 (Tier 1 Fast) 실행 |
| `npm run qa:hub` | `hub` 스위트 (Tier 1 Fast) 실행 |
| `npm run qa:forge` | `forge` 스위트 (Tier 1 Fast) 실행 |
| `npm run qa:system` | `system` 스위트 (Tier 1 Fast) 실행 |
| `npm run qa:regression` | `regression` 스위트 (Tier 1 Fast) 실행 |
| `npm run qa:multiplatform` | `multiplatform` 스위트 (Tier 1 Fast) 실행 |
| `npm run qa:user` | `user` 스위트 (Tier 1 Fast) 실행 |
| `npm run qa:game` | `game` 스위트 (Tier 1 Fast) 실행 |
| `npm run qa:local` | `local` 환경 대상 (Tier 1 Fast) 실행 |
| `npm run qa:dev` | `dev` 환경 대상 (Tier 1 Fast) 실행 |
| `npm run qa:live` | `live` 환경 대상 (Tier 1 Fast) 실행 |
| `npm run qa:changed` | `git` 변경 파일 기반 영향 스위트 + `smoke` + `regression` 자동 실행 |
| `npm run test:fast` | 전체 Tier 1 Fast 게이트 실행 (`tools/qa/fast-gate.mjs`) |
| `npm run gate` | 소유권 + 스킬 동기화 + Tier 1 Fast 전체 게이트 |

### 4.2 고급 CLI 조합 예시 (`tools/qa/run-suite.mjs`)

```bash
# 카탈로그 요약 확인 (JSON 출력 가능)
node tools/qa/run-suite.mjs --summary
node tools/qa/run-suite.mjs --summary --json

# 콤마(,) = OR 합집합 (hub 또는 forge)
node tools/qa/run-suite.mjs --suite hub,forge --list

# 반복 --suite 또는 --and = AND 교집합 (허브이면서 유저, 그리고 live 환경)
node tools/qa/run-suite.mjs --suite 허브 --suite 유저 --env live
node tools/qa/run-suite.mjs --suite 허브,유저 --and --env Live --dry-run

# browser / godot / portable 스위트는 --tier 미지정 시 자동으로 all 계층 선택
node tools/qa/run-suite.mjs --suite 브라우저 --list
node tools/qa/run-suite.mjs --suite 고도 --env dev --list

# 전체 계층(Tier 1+2+3) 포함 실행
node tools/qa/run-suite.mjs --suite game --all-tiers --list

# git 변경분 기반 자동 스위트 선택 (특정 기준 커밋/브랜치 지정 가능)
node tools/qa/run-suite.mjs --changed
node tools/qa/run-suite.mjs --changed PlayHub-Platform --dry-run

# 리포터 지정 (dot | spec | tap) 및 격리 테스트 확인
node tools/qa/run-suite.mjs --suite smoke --reporter spec
node tools/qa/run-suite.mjs --only-quarantine --list
```

---

## 5. 신규 테스트 추가 체크리스트

1. 목적에 맞는 파일명 규칙(`smoke.*`, `contract.*`, `regression.*`, `*.browser.*`, `*.godot.*`, `*.portable.*`)으로 테스트 파일을 작성한다.
2. `tools/qa/test-catalog.json`의 `tests` 배열에 `path`, `tier`, `suites`, `envs`, `owner`를 알파벳순으로 추가한다.
   - `tier: "fast"`로 추가하는 경우 레거시 호환을 위해 `tools/qa/fast-gate.json` 포함 여부도 확인한다.
3. Node 24로 게이트 위생 테스트와 신규 테스트를 직접 실행해 통과를 확인한다:
   ```bash
   node --test tools/qa/contract.gate-hygiene.test.mjs
   node tools/qa/run-suite.mjs --changed --reporter spec
   ```
