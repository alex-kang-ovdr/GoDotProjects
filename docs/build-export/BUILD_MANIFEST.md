# BuildManifest v1 · EngineLock 파생 규칙 (로드맵 16 R0 spike)

- 브랜치: `Forge-BuildExport` (트렁크 `PlayHub-Platform` `668e4b9d` 기준)
- 구현: [forge/Tools/build-export/build-manifest.cjs](../../forge/Tools/build-export/build-manifest.cjs), [repro-export.cjs](../../forge/Tools/build-export/repro-export.cjs), [repro-lint.cjs](../../forge/Tools/build-export/repro-lint.cjs), [pck-reader.cjs](../../forge/Tools/build-export/pck-reader.cjs)
- 시험: [forge/Tests/build-export/](../../forge/Tests/build-export/) (`contract.build-manifest.test.cjs`, `contract.content-hash.test.cjs`, Tier 1 fast)
- 상태: **spike** — 스키마는 v1 초안. 다른 브랜치 소유 파일(build-queue, release-manifest, build-version, engine-ssot)은 수정하지 않았고 연동은 §6 제안으로만 남긴다.

## 1. 원칙

1. **EngineLock은 새 파일이 아니다.** 정본은 [tools/engine/engine-ssot.json](../../tools/engine/engine-ssot.json)이고, BuildManifest의 `engine` 블록은 실행 시 `tools/engine/resolve-godot.cjs`의 `loadEngineSsot()`로 읽어 채운다. 포크 커밋·태그 값을 코드에 적지 않는다(시험이 하드코딩 여부를 검사한다).
2. **build_id 형식을 새로 만들지 않는다.** 플랫폼 빌드는 [build-version 정책](../architecture/build-version-naming-policy.md) §2.1의 `buildId`, UGC 빌드는 기존 `build-queue.cjs` 잡 ID(16-hex)를 그대로 쓴다.
3. BuildManifest는 기존 식별·릴리스 문서들의 **상위 묶음(superset/link)** 이다. 이미 있는 필드는 복사하지 않고 같은 값을 같은 이름으로 연결한다(§4 대조표).
4. "엔진이 lock과 일치하는가"는 선언이 아니라 **실제로 쓴 바이너리**로 판정한다(`binary_path_kind`, `binary_sha256`, `matches_lock`).

## 2. EngineLock → engine-ssot.json 매핑

로드맵 §7 EngineLock 최소 필드: `tag, commit, template_hash, toolchain, bindings, patch_set`.

| EngineLock 필드 | engine-ssot.json 출처 | BuildManifest 위치 | 상태 |
| --- | --- | --- | --- |
| tag | `releaseTag` | `engine.release_tag` | 있음 |
| commit | `pinnedForkCommit` (+ 타깃별 `targets.<t>.expectedForkCommit`) | `engine.fork_commit`, `engine.ssot_target.expected_fork_commit` | 있음. 타깃별 값이 pin과 다를 수 있어 둘 다 기록 |
| (repo) | `forkRepo` | `engine.fork_repo` | 있음 |
| (base) | `upstreamBaseVersion`, `upstreamBaseCommit` | `engine.upstream_base`, `engine.upstream_base_commit` | 있음 |
| template_hash | 없음 | `export.template_sha256` (빌드 시 실제 템플릿 파일 해시) | **SSOT에 없음** — 빌드마다 측정 |
| (binary hash) | 없음 | `engine.binary_sha256` | **SSOT에 없음** — 빌드마다 측정 |
| toolchain | `targets.<t>.profilePath`/`buildScript`(간접) | 미기록 | **gap**: 컴파일러·SDK 버전 필드 없음 |
| bindings | 없음 | 미기록 | **gap**: GDExtension binding 버전 필드 없음 |
| patch_set | 포크 커밋이 사실상 patch set | `engine.fork_commit` | 부분. 패치 목록 자체는 포크 저장소 이력 |
| 타깃 상태 | `targets.<t>.status` | `engine.ssot_target.status` | 있음 (`web-template`은 현재 `pending_fork_rebuild`) |

`binary_path_kind`는 `inspectGodotBinary()`의 `requiredForkSymbols` 검사 결과다: `fork`(PlayForge 포크) / `stock`(순정) / `null`(바이너리 미지정). stock이면 `fork_commit`·`release_tag`는 "써야 했던 lock"을 뜻하고 `matches_lock=false`가 된다. 이번 spike의 실제 익스포트는 **stock 4.7.2** (`4.7.2.stable.official.ed1daf0bf`)였고 매니페스트에 그대로 `matches_lock:false`로 남았다.

## 3. BuildManifest v1 필드

| 필드 | 의미 | 생성 규칙 |
| --- | --- | --- |
| `schemaVersion` | `1` | 고정 |
| `project_id` | 프로젝트 식별자 | 호출자가 주거나(`--project-id`, build-queue의 `projectId`), 없으면 `project.godot` `config/name` 슬러그 |
| `revision` | 프로젝트 소스의 git 커밋(40-hex) | `git -C <project> rev-parse HEAD`, git 밖이면 `null` |
| `revision_dirty` (확장) | 해당 경로 미커밋 변경 여부 | `git status --porcelain -- .` |
| `source_hash` (확장) | 입력 소스 트리 해시 | `.godot/`·`.git/` 제외, content_hash와 같은 규칙 |
| `build_id` | 빌드 식별자 (TraceSample이 참조) | §3.1 |
| `build_id_kind` (확장) | `policy` \| `ugc` | build_id 형식에서 판정 |
| `input_hash` (확장) | 빌드 입력 해시 | sha256(JSON{project_id, revision, source_hash, engine lock, binary_sha256, preset, platform, mode, template_sha256}). 시간·출력 미포함 |
| `engine.{fork_repo, fork_commit, release_tag, upstream_base}` | EngineLock 파생 | §2 |
| `engine.{binary_path_kind, binary_sha256}` | 실제 사용한 바이너리 | 측정 |
| `engine.{upstream_base_commit, binary_version, matches_lock, ssot_target}` (확장) | 보조 정보 | `--version` 출력 등 |
| `export.{preset, platform, mode, template_sha256}` | 익스포트 설정 | `mode`: `release`(`--export-release`) \| `pack`(`--export-pack`, 템플릿 불필요 → `null`) |
| `content_hash` | 출력물 전체 해시 | §3.2 |
| `artifacts[]` | `{path, bytes, sha256}` | 경로 바이트 순 정렬, `build-manifest.json` 자신 제외 |
| `protocol_hash` | 네트워크 프로토콜 해시 | 현재 `null` (25/28 계열 소관, build-version `compat.netProtocol`과 연결 예정) |
| `created_at` | 생성 시각 ISO-8601 UTC | 해시 계산에 쓰지 않음 |
| `signatures` | 서명 목록 | 현재 `[]` (23 소관, desktop release-manifest의 TUF와 연결 예정) |

"(확장)" 필드는 v1 계약 필드에 더해 spike가 추가한 선택 필드다. 소비자는 모르는 필드를 무시해야 한다.

### 3.1 build_id 규칙 (Forge-Profiling TraceSample 소비자용)

| 경우 | build_id | 예 |
| --- | --- | --- |
| 6대 플랫폼 타깃 빌드 | `tools/build-version` `resolveBuildInfo().buildId` 그대로 | `forge-web-v0.1.0-20261121-0132-playhub-platform-g13c70ba-b42` |
| UGC·프로젝트 웹 빌드 | `build-queue.cjs` 잡 ID(16-hex) 그대로 (= `owned-build-packages` / `release-manifest` `artifacts.clientWeb.buildId`) | `5c508e727cca4df1` |
| 호출자가 아무것도 안 준 단독 CLI | build-queue와 같은 방식(`randomBytes(8)`)으로 한 번 발급 | — |

- build_id는 **한 번 발급되면 다시 계산하지 않는다.** TraceSample은 build_id로 매니페스트를 찾고, 같은 입력의 여러 빌드를 묶을 때는 `input_hash`, 같은 바이트인지 볼 때는 `content_hash`를 쓴다.
- 검증 정규식은 `build-manifest.cjs`의 `POLICY_BUILD_ID_RE`, `UGC_BUILD_ID_RE`.

### 3.2 content_hash 정의

```
content_hash = sha256( concat over artifacts sorted by UTF-8 byte order of "<sha256>  <path>\n" )
```

`sha256sum` 출력 형식과 같아서 coreutils로 재계산할 수 있다(`LC_ALL=C sort`). readdir 순서·파일 생성 순서·플랫폼과 무관함을 `contract.content-hash.test.cjs`가 검증한다.

## 4. 기존 식별·릴리스 스키마와의 대조 (gap 표)

| 개념 | build-version `BUILD_INFO.json` (`tools/build-version/resolve-build-info.mjs`) | `forge/Tools/release-manifest.cjs` (`buildReleaseManifest`) | `contracts/desktop/release-manifest.v1` / `content-manifest.v1` | `engine-ssot.json` | BuildManifest v1 |
| --- | --- | --- | --- | --- | --- |
| 빌드 ID | `buildId` (정책 형식) | `artifacts.clientWeb.buildId` (16-hex) | `bootstrapper.buildId`, `runtimes[].buildId` | — | `build_id` (둘 중 하나 재사용) |
| 소스 커밋 | `git.commit`, `git.sha7`, `git.dirty` | — | — | — | `revision`, `revision_dirty` |
| 프로젝트 | — (플랫폼 타깃 단위) | `gameId` 등 메타데이터 | `gameId`, `version` | — | `project_id` |
| 엔진 버전 | `compat.engineAbi`(`godot-4.7`), `engineApiRev` | `engine.version` = 상수 `4.7.2-stable` | `runtimes[].engineVersion`, `engineVersion` | `upstreamBaseVersion` | `engine.upstream_base` |
| 엔진 포크 커밋·태그 | **없음** | **없음** | **없음** | `pinnedForkCommit`, `releaseTag` | `engine.fork_commit`, `engine.release_tag` |
| 엔진 바이너리 해시 | 없음 | 없음 | `runtimes[].platforms` (배포 URL/sha256) | 없음 | `engine.binary_sha256` |
| 익스포트 프리셋 | 없음 | `engine.exportPreset` = `web-nothreads-v1` | 없음 | 타깃 profilePath | `export.preset`, `export.platform`, `export.mode` |
| 템플릿 해시 | 없음 | 없음 | 없음 | 없음 | `export.template_sha256` |
| 출력 해시 | 없음 | `artifacts.clientWeb.sha256`(ZIP 1개), `bytes`, `expandedBytes` | `packages[].fileSha256` + chunk 해시 | — | `artifacts[]` 파일별 + `content_hash` |
| 입력 해시 | 없음 | 없음(build-queue `sourceHash`는 잡 JSON에만) | 없음 | — | `source_hash`, `input_hash` |
| 프로토콜 | `compat.netProtocol`, `gameplayHash` | `deployProfile.serverRuntime` | `compatibility` | — | `protocol_hash` (null, 연결 예정) |
| 서명 | 없음 | 없음 | TUF (`tufVersion`, `expiresAt`) | — | `signatures` (빈 배열) |
| 생성 시각 | `builtAtUtc`, `builtAtKst` | `createdAt` 계열 | `expiresAt` | — | `created_at` |

결론:

- **엔진 포크 커밋·태그·바이너리/템플릿 해시는 어느 기존 빌드 산출 문서에도 없다.** 이것이 BuildManifest가 메우는 핵심 gap이다.
- release-manifest의 `ENGINE_VERSION = '4.7.2-stable'` 상수는 engine-ssot와 별개 사본이다(§6 제안 2).
- 출력 해시는 release-manifest가 ZIP 1개 단위, BuildManifest는 파일 단위다. ZIP 해시는 `artifacts[]` 중 ZIP 항목의 sha256과 같아야 한다(연동 시 검사 대상).
- naming policy는 UGC buildId를 독립 계약으로 남긴다고 명시하므로 BuildManifest도 두 형식을 그대로 받는다.

## 5. 재현성 spike 결과 (실측, 2026-11-25, Windows 11)

명령: `node forge/Tools/build-export/repro-export.cjs [--project <dir>]`
방식: 같은 프로젝트를 매번 새 디렉터리로 복사(`.godot/` 제외) → `--headless --editor --import --quit` → 익스포트. A·B는 서로 다른 절대 경로, C는 A 경로를 지우고 다시 실행. 모드 2종: `release`(`--export-release Web`, `web_nothreads_release.zip` 템플릿 설치 확인됨) / `pack`(`--export-pack Web` → `.pck`).

- 엔진: stock `Godot_v4.7.2-stable_win64_console.exe` (`4.7.2.stable.official.ed1daf0bf`, binary sha256 `ab1824f8…b22424`). 포크 바이너리는 `Forge-GodotEngine/bin`에 `template_debug`만 있어 에디터 기능(import/export)을 쓸 수 없었다 → resolve-godot 결과를 거부하고 stock으로 폴백(§6 제안 1).
- 템플릿: `web_nothreads_release.zip` sha256 `d3ee2f08…4032a0`.
- 출력: release 9파일(`index.wasm` 39,514,754 B, `index.pck` 3,316 B 등), pack 1파일(`game.pck` 3,316 B). 1회 import ≈ 3.2-3.4 s, export ≈ 3.2-3.9 s.

| 픽스처 | 모드 | A vs B (다른 경로) | A vs C (같은 경로 재실행) | 다른 파일 |
| --- | --- | --- | --- | --- |
| `fixtures/minimal` (`.tscn` 노드에 `unique_id` 없음) | release | **불일치** `dcb30332…` vs `b41aa744…` | 불일치 | `index.pck` 1개 (나머지 8개 동일) |
| 〃 | pack | **불일치** `b879bb9f…` vs `9af5bd08…` | 불일치 | `game.pck` |
| `fixtures/minimal-stable-ids` (노드에 `unique_id` 고정) | release | **일치** `5b301eb7…` | 일치 | 없음 |
| 〃 | pack | **일치** `8ea64f42…` | 일치 | 없음 |

원인 (PCK 디렉터리 비교 + 바이트 비교 + 엔진 소스 확인):

- `.pck` 안 10개 항목 중 **`.godot/exported/…/export-…-main.scn` 1개만** 다르고 크기(829 B)·배치·순서는 같다. 차이는 바이너리 씬의 `node_ids` 배열 8바이트(노드 2개 × int32)다.
- Godot 4.6+ `SceneState`는 노드마다 `unique_id`를 저장한다. 텍스트 `.tscn` 노드 헤더에 `unique_id=`가 없으면 패킹 시 `ResourceUID::create_id()`(난수)로 채운다(`scene/resources/packed_scene.cpp` `_parse_node`). 익스포트가 `.tscn`→`.scn` 변환을 하면서 매번 새 난수를 쓴다.
- 경로 의존성은 없었다: 리소스 UID(`icon.svg.import`의 `uid://…`)·`uid_cache.bin`·`main.gd.uid`는 다른 경로에서도 동일했다. 같은 경로 재실행(C)도 똑같이 달라서 원인은 경로가 아니라 난수다.
- 노드에 `unique_id`를 고정하면 **Web release 9개 파일 전체와 .pck가 바이트 단위로 재현**된다(이 픽스처·이 바이너리·이 템플릿 조합에서만 확인).

영향:

- 저장소에 추적되는 `.tscn` 43개 중 `unique_id=`가 있는 파일은 **0개**다(2026-11-25 `git ls-files` 기준). build-queue는 스냅샷 텍스트를 그대로 쓰므로 현재 Forge 웹 빌드는 같은 리비전이라도 매번 `index.pck`·ZIP 해시가 달라진다고 추정한다(실제 build-queue 경로로는 미검증).
- 대응 후보: (a) 빌드 전 `repro-lint.cjs`로 경고, (b) 빌드 워커가 임시 복사본에 결정적 `unique_id`(예: 씬 경로+노드 경로 해시)를 주입, (c) 에디터 저장으로 정규화. (b)는 원본을 바꾸지 않아 R1 후보로 적합하다(추정 0.5-1 PW, 본 문서의 추정치).

미검증:

- 포크 에디터 바이너리, Linux 워커(Cloud Run), 다른 머신 간 재현, 큰 프로젝트(셰이더 캐시·텍스처 압축·GDScript 바이너리 토큰화·`.translation`·임포트 플러그인), threads/dlink 템플릿, 서명·암호화 PCK.
- build-queue의 셸 주입·ZIP 단계: `export-godot-project.cjs` `zipFiles()`는 타임스탬프 필드를 0으로 쓰고 이름순 정렬된 입력을 받으므로 결정적일 것으로 보이나 이번에 실측하지 않았다.

## 6. 다른 브랜치 소유 파일에 대한 제안 (수정하지 않음)

1. **`tools/engine/resolve-godot.cjs`** (PlayHub-Platform): `Forge-GodotEngine/bin`에 `template_debug`만 있으면 그것을 `fork-discovered`로 반환한다. 에디터가 필요한 호출(import/export, native-runtime `findGodot`)에는 쓸 수 없다. `requireEditor` 옵션(템플릿 패턴 제외)을 제안한다. `forge/Tools/build-queue.cjs`의 `findGodot` → resolver 경로도 같은 영향을 받는지 확인 필요.
2. **`forge/Tools/release-manifest.cjs`** (시험 `forge/Tests/release-manifest.test.cjs`는 Forge-Publish 소유): `ENGINE_VERSION` 상수 대신 `loadEngineSsot()`에서 `upstreamBaseVersion`을 읽고, `engine`에 `forkCommit`·`releaseTag`·`buildManifestContentHash`를 추가하거나 BuildManifest를 링크.
3. **`tools/build-version/resolve-build-info.mjs`** (PlayHub-Platform): `BUILD_INFO.json`에 `engine: { forkCommit, releaseTag }`를 engine-ssot에서 파생해 추가.
4. **`forge/Tools/build-queue.cjs`** / **`deploy/cloudrun/build-worker/worker.mjs`**: 성공 시 출력 폴더에 `build-manifest.json`을 생성(`buildManifest({ buildId: job.id, ... })`)하고 `result.json`에 `contentHash`·`inputHash`를 추가. 빌드 전 `repro-lint` 경고.
5. **`docs/architecture/GODOT_ENGINE_SSOT_PIPELINE.md`**: "현재 포크 핀 `fe0b4fe…`"는 낡은 값이다. 실제 `pinnedForkCommit`은 `e7a83dd7…`(engine-ssot.json). 문서가 값을 복사하지 말고 engine-ssot.json을 가리키도록 수정 제안.
6. **`tools/engine/engine-ssot.json`**: 타깃별 `templateSha256`·`toolchain`(컴파일러/SDK)·`bindings` 필드 추가 제안(로드맵 §7 EngineLock 잔여 필드).
