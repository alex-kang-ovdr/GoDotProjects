# PlayHub / PlayForge 6대 타깃 빌드 버전·네이밍 정책 및 호환성 게이트 (SSOT)

이 문서는 PlayHub / PlayForge 플랫폼의 6개 배포 타깃(`aos`, `ios`, `forge-desktop`, `forge-web`, `hub`, `godot-server`)에 대한 **통합 빌드 버전 네이밍**, **스토어/컨테이너 메타데이터 매핑**, **3자 버전 불일치 호환성 게이트(`COMPAT_*`)**, **배포 시 강업(`force`) / 선업(`optional`) 선택 정책**의 단일 기준(SSOT)이다.

- 구현 모듈: `tools/build-version/` (`resolve-build-info.mjs`, `release-policy.mjs`, `compatibility-gate.mjs`)
- Hub 런타임 연동: `hub/server/version-compat.mjs`, `hub/server/app.mjs`
- CI / 배포 연동: `.github/workflows/cloudrun-pipeline.yml`, `deploy/cloudrun/hub/Dockerfile`, `deploy/cloudrun/forge/Dockerfile`, `hub/tools/package-distribution.ps1`, `forge/Tools/package-windows-server.ps1`

> **기존 UGC 계약 경계**: 창작자 UGC 웹 빌드 식별자(`forge/Tools/owned-build-packages.cjs`의 16-hex `buildId`, `store/schemas/package-contract.schema.json`의 `rel-*`)는 본 정책으로 대체하지 않고 독립 계약을 유지한다.

---

## 1. 6대 배포 타깃

| 타깃 (`target`) | 설명 | 주요 산출물 |
|---|---|---|
| `aos` | Android 클라이언트 / 플레이어 | `.aab`, `.apk` |
| `ios` | iOS 클라이언트 / 플레이어 | `.ipa` |
| `forge-desktop` | 설치형 PlayForge (Windows/macOS/Linux 에디터·런처·로컬 서버 번들) | `.zip`, `.exe`, `.dmg` |
| `forge-web` | 웹 PlayForge (Cloud Run + Godot 4.7.2 WebGL2/WASM + `OfficialGodot/`) | OCI 이미지, Cloud Run 리비전 |
| `hub` | PlayHub (`public`/`admin`/`store` Cloud Run + `PlayHub-Portable`) | OCI 이미지, Cloud Run 리비전, Portable `.zip` |
| `godot-server` | Godot 4.7.2 Dedicated Server / 템플릿 멀티플레이어 서버 | OCI 이미지, Windows/Linux 서버 `.zip` |

---

## 2. 단일 표준 빌드 ID (`buildId`) 및 필드 규칙

### 2.1 표준 형식

```text
<target>-v<semver>-<YYYYMMDD>-<HHmm>-<branch>-g<sha7>-b<buildNum>[-dirty]
```

예시:

```text
hub-v0.3.0-20261121-0132-playhub-platform-g13c70ba-b42
forge-web-v0.1.0-20261121-0132-playhub-platform-g13c70ba-b42
aos-v0.3.0-20261121-0132-playhub-platform-g13c70ba-b42
ios-v0.3.0-20261121-0132-playhub-platform-g13c70ba-b42
forge-desktop-v0.1.0-20261121-0132-playhub-platform-g13c70ba-b42
godot-server-v0.1.0-20261121-0132-playhub-platform-g13c70ba-b42
```

### 2.2 필드 규약

| 필드 | 규칙 | 비고 |
|---|---|---|
| `target` | `aos \| ios \| forge-desktop \| forge-web \| hub \| godot-server` | 고정 열거형 |
| `semver` | `MAJOR.MINOR.PATCH` (예: `0.3.0`) | 사람이 읽는 기능 릴리스 버전 |
| `YYYYMMDD` / `HHmm` | **KST (`Asia/Seoul`, `+09:00`)** 기준 | 파일명·ID 가독성 기준. `BUILD_INFO.json`에는 `builtAtUtc`(UTC ISO-8601)와 `builtAtKst`(KST ISO-8601) 동시 기록 |
| `branch` | 소문자 슬러그 (`[^a-z0-9-]` → `-`, 연속 `-` 축약, 최대 20자) | detached HEAD 시 `detached` |
| `sha7` | Git HEAD 7자리 소문자 hex (`[0-9a-f]{7}`) | 커밋 추적 키 |
| `buildNum` | CI 단조 증가 번호 (`GITHUB_RUN_NUMBER`, 로컬은 `0`) | 동일 분(minute) 내 중복 방지 |
| `-dirty` | 워킹트리 미커밋 변경 존재 시 자동 부착 | **`qa` / `rc` / `live` 채널에서는 생성·배포 즉시 차단** (`local`/`dev`만 허용) |

### 2.3 모바일 스토어 숫자 빌드 코드 (`buildCode` = `YYYYMMDDNN`)

- **형식**: `YYYYMMDDNN` (KST 날짜 8자리 + 일일 순번 `NN = 01..99`, 로컬은 `00`). 예: `2026112101`.
- **Google Play `versionCode` Int32 상한 준수**: 최대값 `2,099,123,199`로 Google Play 허용 상한(`2,100,000,000`) 미만을 2099년 말까지 보장한다.
- **`YYMMDDHHmm` 금지 근거**: 예컨대 `2611210132` (`2,611,210,132`)는 `2,100,000,000`을 초과해 Google Play 업로드 시 즉시 거부된다.
- **iOS `CFBundleVersion` 정합성**: 10자리 정수로 App Store Connect 18자리 제한을 여유 있게 충족하며 AOS/iOS 간 동일 `buildCode` 비교가 가능하다.

### 2.4 Cloud Run 리비전 및 Docker 태그

- **Docker 불변 태그(주 태그)**: `v<semver>-<YYYYMMDD>-<HHmm>-<branch>-g<sha7>-b<buildNum>`
- **Docker 호환 별칭(보조 태그)**: `sha-<sha7>` (기존 `promote-qa` / `promote-live` 입력 호환)
- **Cloud Run 리비전 접미사 (63자 제한 준수)**:
  - Hub: `ph-pub-<YYYYMMDD>-<HHmm>-b<buildNum>-<sha7>` (예: `ph-pub-20261121-0132-b42-13c70ba`, 32자)
  - Forge Web: `pf-web-<YYYYMMDD>-<HHmm>-b<buildNum>-<sha7>` (32자)

---

## 3. 타깃별 산출물 네이밍 매핑

| 타깃 | 산출물 / 태그 형식 |
|---|---|
| `aos` | `playhub-aos-v<semver>-<YYYYMMDD>-<HHmm>-<branch>-g<sha7>-b<buildNum>.aab` (`versionName=<semver>`, `versionCode=<YYYYMMDDNN>`) |
| `ios` | `playhub-ios-v<semver>-<YYYYMMDD>-<HHmm>-<branch>-g<sha7>-b<buildNum>.ipa` (`CFBundleShortVersionString=<semver>`, `CFBundleVersion=<YYYYMMDDNN>`) |
| `forge-desktop` | `PlayForge-Desktop-v<semver>-<YYYYMMDD>-<HHmm>-<branch>-g<sha7>-b<buildNum>-<arch>.zip` |
| `forge-web` | `<repo>/forge:v<semver>-<YYYYMMDD>-<HHmm>-<branch>-g<sha7>-b<buildNum>` (+ `:sha-<sha7>`) |
| `hub` (Cloud Run) | `<repo>/hub:v<semver>-<YYYYMMDD>-<HHmm>-<branch>-g<sha7>-b<buildNum>` (+ `:sha-<sha7>`) |
| `hub` (Portable) | `PlayHub_Portable_v<semver>_<YYYYMMDD>_<HHmm>_<branch>_g<sha7>_b<buildNum>_win-x64.zip` |
| `godot-server` | `PlayForge-GodotServer-v<semver>-<YYYYMMDD>-<HHmm>-<branch>-g<sha7>-b<buildNum>-<arch>.zip` |

---

## 4. `BUILD_INFO.json` 표준 스키마

모든 빌드·패키징·컨테이너 산출물 루트에 `BUILD_INFO.json`을 동봉한다.

```json
{
  "schemaVersion": 1,
  "target": "hub",
  "semver": "0.3.0",
  "channel": "live",
  "buildId": "hub-v0.3.0-20261121-0132-playhub-platform-g13c70ba-b42",
  "buildCode": 2026112101,
  "buildNum": 42,
  "dailySeq": 1,
  "builtAtUtc": "2026-11-20T16:32:00Z",
  "builtAtKst": "2026-11-21T01:32:00+09:00",
  "dateKst": "20261121",
  "timeKst": "0132",
  "git": {
    "branch": "PlayHub-Platform",
    "branchSlug": "playhub-platform",
    "commit": "13c70ba000000000000000000000000000000000",
    "sha7": "13c70ba",
    "dirty": false
  },
  "compat": {
    "engineAbi": "godot-4.7",
    "engineApiRev": 1,
    "minEngineApiRev": 1,
    "netProtocol": "1.0",
    "gameplayHash": "default"
  },
  "updatePolicy": "optional",
  "minClientBuildCode": 2026112101
}
```

---

## 5. 3자 버전 불일치 분석 및 4개 호환성 계약 키

`buildId` 문자열 일치 여부로 접속을 막으면 핫픽스·번역 패치마다 전체 클라이언트가 끊긴다. 대신 아래 **4개 호환성 계약 키**를 `buildId`와 분리해 판정한다.

1. **`engineAbi` + `engineApiRev`** (예: `godot-4.7`, `apiRev: 1`): Godot 엔진 메이저/마이너 ABI 및 런타임 API 리비전. 불일치 시 `.pck`/WASM/네이티브 크래시 위험 → **항상 강제 차단**.
2. **`netProtocol`** (`MAJOR.MINOR`, 예: `1.2`): Hub REST/WS 및 Godot 멀티플레이어 패킷 스키마. `MAJOR` 불일치 → **항상 강제 차단**, `MINOR` 하위 → **권장 업데이트 허용**.
3. **`gameplayHash`**: 게임 룰·맵·`@rpc` 시그니처 해시(순수 UI/L10N/사운드 패치는 제외). 불일치 시 진행 중인 매치 보호를 위해 **구버전 전용 드레인 풀(`activePools`) 라우팅**, 풀이 없으면 강제 업데이트.
4. **`minClientBuildCode`** (`YYYYMMDDNN`): 보안 취약점·치명적 버그 대응용 긴급 하한선(Kill-switch).

---

## 6. 4단계 표준 핸드셰이크 코드 (`COMPAT_*`)

모든 클라이언트는 부팅·로비 진입·WS 접속 전 `POST /api/compat/check` 핸드셰이크를 수행한다.

| 결정 코드 (`decision`) | HTTP | WS Close | `allowed` | 의미 및 클라이언트 동작 |
|---|---:|---:|---|---|
| `COMPAT_ALLOW` | `200` | `-` | `true` | 완전 호환. 즉시 진입 |
| `COMPAT_ALLOW_SOFT_UPDATE` | `200` | `-` | `true` | 선업(선택 업데이트). 접속 허용 + 배너/토스트로 업데이트 안내 (`updateRecommended: true`) |
| `COMPAT_ROUTE_LEGACY_POOL` | `200` | `-` | `true` | 게임 버전 불일치 시 구버전 드레인 풀(`targetPool.endpoint`)로 라우팅 |
| `COMPAT_BLOCK_FORCE_UPDATE` | `426` | `4009` | `false` | 강업(강제 업데이트) 또는 기술적 비호환. 진입 차단 + 스토어/재로딩/설치 안내 (`updateRequired: true`) |

### 세부 사유 코드 (`COMPAT_REASON_*`)

- `COMPAT_REASON_OK` — 정상 일치
- `COMPAT_REASON_POLICY_OPTIONAL_UPDATE` — 운영자가 선업(`optional`)으로 최신 빌드 배포
- `COMPAT_REASON_MINOR_BEHIND` — `netProtocol.minor` 하위 버전 (호환 가능)
- `COMPAT_REASON_GAME_RELEASE_DRAIN` — `gameplayHash` 불일치로 구버전 드레인 풀로 라우팅
- `COMPAT_REASON_ENGINE_ABI_MISMATCH` — `engineAbi` 불일치 (기술적 강제 차단)
- `COMPAT_REASON_ENGINE_API_REV_MISMATCH` — `engineApiRev` 하한 미달 또는 비호환 (기술적 강제 차단)
- `COMPAT_REASON_PROTOCOL_MAJOR_MISMATCH` — `netProtocol.major` 불일치 (기술적 강제 차단)
- `COMPAT_REASON_GAMEPLAY_HASH_MISMATCH` — `gameplayHash` 불일치 및 매칭 드레인 풀 없음
- `COMPAT_REASON_BELOW_MIN_CLIENT_BUILD` — `client.buildCode < minClientBuildCode`
- `COMPAT_REASON_POLICY_FORCE_UPDATE` — 운영자가 해당 타깃에 강업(`force`) 지정
- `COMPAT_REASON_DIRTY_BUILD_BLOCKED` — `qa`/`rc`/`live` 환경에 `-dirty` 클라이언트 접속 시도

---

## 7. 배포 시 강업(`force`) / 선업(`optional`) 선택 정책

### 7.1 판정 우선순위 (5단계)

1. **기술적 비호환 하드 가드레일** (`-dirty` on `qa/rc/live`, `engineAbi`, `engineApiRev`, `netProtocol.major`)
   - 운영자가 `optional`(선업)을 선택했더라도 **항상 `COMPAT_BLOCK_FORCE_UPDATE`**로 차단한다.
2. **하한선(`minClientBuildCode`) 및 타깃별 강업(`force`) 정책**
   - `client.buildCode < effectiveMinBuildCode` → 즉시 `COMPAT_BLOCK_FORCE_UPDATE` (`COMPAT_REASON_BELOW_MIN_CLIENT_BUILD`).
   - `targetPolicy.updatePolicy === 'force'`이고 구버전인 경우:
     - 진행 중 매치(`inMatch: true`)이면서 `graceMinutes` 유예 창 내부이면 `COMPAT_ALLOW_SOFT_UPDATE`(`updateRequiredAfterMatch: true`, `graceRemainingSec > 0`)로 현재 판 종료를 보호한다.
     - 신규 로비/부팅(`inMatch !== true`) 또는 유예 만료 시 즉시 `COMPAT_BLOCK_FORCE_UPDATE` (`COMPAT_REASON_POLICY_FORCE_UPDATE`).
3. **`gameplayHash` 불일치**
   - 만료되지 않은 매칭 드레인 풀(`activePools`)이 존재하면 `COMPAT_ROUTE_LEGACY_POOL`, 없으면 `COMPAT_BLOCK_FORCE_UPDATE` (`COMPAT_REASON_GAMEPLAY_HASH_MISMATCH`).
4. **선업(`optional`) 또는 `netProtocol.minor` 하위**
   - `COMPAT_ALLOW_SOFT_UPDATE` (`COMPAT_REASON_MINOR_BEHIND` 또는 `COMPAT_REASON_POLICY_OPTIONAL_UPDATE`).
5. **완전 일치**
   - `COMPAT_ALLOW` (`COMPAT_REASON_OK`).

### 7.2 운영 제어 경로

1. **배포 시 선택 (CI `workflow_dispatch`)**:
   - `update_policy`: `optional` (기본, 선업) | `force` (강업)
   - `force_targets`: 강업 적용 타깃 목록 (예: `all`, `hub,forge-web`, `aos,ios`). 비어 있고 `update_policy=force`이면 배포 대상 타깃에 자동 적용.
2. **무재빌드 실시간 전환 (Admin API)**:
   - `GET /api/admin/release-policy` — 현재 서버 `buildInfo` 및 6대 타깃별 정책 조회
   - `POST /api/admin/release-policy` — 타깃별 `updatePolicy` (`optional` ↔ `force`), `latestBuildCode`, `minBuildCode`, `graceMinutes`, `storeUrl`, `notice`, `activePools` 즉시 변경
   - 영속 저장 위치: `<dataDir>/release-policy.json` (`platform.sqlite` 스키마를 건드리지 않아 기존 백업/복구 화이트리스트와 100% 호환)
   - 모든 변경은 `audit` 테이블에 `system_release_policy_update` 이벤트로 기록된다.
