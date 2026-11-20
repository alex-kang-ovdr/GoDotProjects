# Hub–Forge 내부 API 경계 설계 (결합 ②)

- 상태: 설계 진행 중 (2026-11-20). S0·S1 완료, 처리 주체 일원화 확정
- 상위 문서: [hub-forge-decoupling-plan.md](hub-forge-decoupling-plan.md) P2·P3
- 목표: Hub가 `forge/` 코드를 `require()`하거나 Forge의 디스크를 읽지 않고, Forge 내부 HTTP API만 호출하게 한다. 같은 머신이 아니어도 동작해야 한다.

## 1. 현재 결합 목록 (코드 근거)

| # | 위치 | 결합 내용 | 성격 |
|---|---|---|---|
| A | `hub/server/forge-account.mjs:21-27,38-39` | `forge/Tools`의 모듈 9개를 `require()`: `account-platform-api`, `owned-build-packages`, `platform-store`, `drive-snapshot-store`, `submission-drive-archive`, `project-drive-sync`, `operator-oauth-token`, `deployment-zip-archive`, `drive-zip-store`. `/api/platform/*`를 Hub 프로세스 안에서 직접 처리한다. | 코드 + 디스크 |
| B | `hub/server/creator-review.mjs:120,133-134` | `accountKey()`와 `PlatformStore.read()`로 릴리스를 직접 읽어 제출 시점의 revision을 고정(pin)한다. | 코드 + 디스크 |
| C | `hub/server/admin-console.mjs:123-,151-,654` | `<forge.directory>/accounts/*/projects/*.json`, `builds/*/result.json`, Drive manifest를 직접 스캔해 운영 지표를 만든다. | 디스크 |
| D | `hub/tests/*` 6개 파일 | 테스트가 `PlatformStore`·`accountKey`·`OwnedBuildPackages`를 직접 import한다. | 테스트 |
| E | `hub/server/app.mjs:104-106` | `createHubForge`, `createCreatorReview`에 `root: platformRoot`와 `config.forge`를 넘긴다. | 구성 |

관찰 두 가지:

1. **같은 `/api/platform/*`를 두 곳이 구현한다.** Hub는 `createHubForge`로 프로세스 안에서, Forge는 `hubAuth` 모드의 `getPlatformFor(accountKey).api`로 처리한다. 둘 다 같은 `accounts/<accountKey>` 디렉터리를 쓴다. 차이는 S0에서 대조했다(§9).
2. `accountKey()`는 순수 함수이고 Hub에 이미 같은 계산(`forgeAccountKey`, `forge-account.mjs:15`)이 있다. B의 `require`는 불필요한 결합이다.

## 2. 목표 구조

```
브라우저 ─▶ Hub ─(세션·CSRF 검증, accountKey 계산)─▶ ForgeGateway ─┬─ local : 기존 모듈을 같은 프로세스에서 호출
                                                                  └─ remote: Forge /internal/v1/* HTTP 호출
Forge  ◀─ 서비스 인증(공유 시크릿) + accountKey 헤더 ─ Hub
```

- Hub는 `ForgeGateway` 인터페이스 하나로만 Forge와 이야기한다. `hub/` 안의 `forge/` 경로 참조는 `local` 구현 파일 한 개로 모은다. 최종 단계에서 `local` 구현은 제거할 수 있다.
- 인증은 Hub가 소유한다. Hub가 세션과 CSRF를 검증하고 `accountKey`를 결정한다. Forge 내부 API는 사용자 쿠키를 받지 않는다.
- 데이터 소유는 Forge다. 프로젝트·릴리스·빌드·Drive 동기화 상태는 Forge만 읽고 쓴다. Hub는 제출(`creator_submissions`)과 감사 로그 같은 Hub 데이터만 가진다.

## 3. ForgeGateway 인터페이스

| 메서드 | 쓰는 곳 | 설명 |
|---|---|---|
| `handlePlatform(req, res, url, ctx)` | A | `/api/platform/*`를 해당 계정 컨텍스트로 처리. remote에서는 요청을 스트림으로 전달(프록시) |
| `getRelease(accountKey, projectId, releaseId)` | B | 릴리스 메타(`id`, `revision`, `files` 해시 또는 목록) 반환. 없으면 `RELEASE_NOT_FOUND` |
| `enqueueBuild` / `getBuild` | A | 빌드 등록·상태 |
| `archiveDeployment` / `deploymentStatus` | A | 배포 ZIP 아카이브 |
| `archiveSubmission` / `submissionStatus` | A | 제출 아카이브 |
| `cloudHistory` / `cloudSync` / `cloudRetry` | A | Drive 동기화 |
| `adminSnapshot()` | C | 프로젝트 수, 빌드 상태 요약, Drive manifest 상태. 계정 키는 앞 12자 접두사만 노출 |
| `close()` | A | 자원 정리 |

규칙: 오류는 Gateway에서 `{status, code}`로 정규화한다. Forge 오류 본문은 그대로 사용자에게 보내지 않고, 현재처럼 `ACCESS_DENIED`/`SERVICE_UNAVAILABLE`로 축약한다(`forge-account.mjs:93`).

## 4. Forge 내부 API 계약 (`/internal/v1/*`)

| 메서드·경로 | 용도 |
|---|---|
| `ANY /internal/v1/accounts/{accountKey}/platform/*` | 계정별 Platform API(기존 `/api/platform/*`와 동일 의미). 프록시 대상 |
| `GET .../accounts/{key}/projects/{pid}/releases/{rid}` | 릴리스 읽기(B) |
| `POST .../accounts/{key}/projects/{pid}/builds`, `GET .../builds/{bid}` | 빌드 |
| `POST/GET .../projects/{pid}/deployments/{rid}` | 배포 아카이브 |
| `POST/GET .../projects/{pid}/submissions/{rid}` | 제출 아카이브 |
| `GET/POST .../projects/{pid}/cloud[/history\|/retry/{n}]` | Drive 동기화 |
| `GET /internal/v1/admin/snapshot` | 운영 지표(C) |

인증과 안전 규칙:

- `X-PlayHub-Internal-Secret`(32자 이상, P1과 같은 시크릿 정책)을 상수 시간으로 비교한다. 시크릿이 없거나 짧으면 Forge는 내부 API를 마운트하지 않는다(fail-closed).
- `accountKey`는 정규식 `^[a-f0-9]{64}$`만 허용하고 경로 구성 전에 검증한다. 사용자 입력에서 오지 않으며 Hub가 세션에서 계산한 값만 쓴다.
- 내부 API는 브라우저 `Origin`이 있는 요청을 거부하고, 공개 경로(`/forge/*`)로는 노출하지 않는다. 별도 리스너 또는 경로 접두사 차단으로 분리한다.
- 요청·응답 크기 제한을 둔다. 프로젝트 파일 업로드 한도는 현재 Platform API의 한도를 그대로 따른다(확인 필요).
- 버전 접두사 `v1`을 고정하고, 호환되지 않는 변경은 `v2`를 새로 만든다.
- 쓰기 요청(POST)은 idempotency key를 받는다. key는 호출 주체·작업·요청 본문 해시와 결합하고, 같은 key에 다른 본문이 오면 409로 거부한다. 비동기 작업(빌드, 아카이브)은 202와 operation id를 돌려주고 상태를 따로 조회한다(외부 컨설팅 계획안 §14 공통 규칙, [multiplayer-plan-review.md](multiplayer-plan-review.md) U4).
- 경로를 정할 때 컨설팅 계획안의 snapshot·build-job 개념(`build-snapshots`, `build-jobs`)을 나중에 수용할 수 있게 한다.

## 5. 단계

| 단계 | 내용 | 완료 기준 | 위험 |
|---|---|---|---|
| S0 | 특성화 테스트: Hub와 Forge의 `/api/platform/*` 응답 대조, `accountKey` 동치 테스트 | 두 구현의 차이 목록이 문서화됨 | **완료** (§9) |
| S1 | `creator-review.mjs`의 `accountKey` require를 `forgeAccountKey`로 교체 | 해당 require 제거, 기존 테스트 통과 | **완료** (`391db6e`) |
| S1.5 | 빌드 검증 일원화: Forge Hub 인증 모드가 Hub와 같은 `OwnedBuildPackages` 검증(정렬된 스냅샷의 sourceHash, 패키지 artifactSha256)을 Forge 큐 위에서 쓴다(§9 차이 3, §10) | Forge 릴리스 검증이 Hub와 같은 알고리즘을 쓴다 | **완료** (1단계) |
| S2 | `ForgeGateway` 도입, `local` 구현이 현재 동작을 그대로 감싼다. B·C·A가 Gateway만 쓰게 변경 | `hub/server`에서 `forge/` 직접 참조가 `local` 구현 한 파일뿐 | **완료** (§11) |
| S3 | Forge에 내부 API 서버 구현(위 계약), 계약 테스트 | 내부 API 단위·통합 테스트 통과 | 중간 |
| S4 | `remote` Gateway 구현과 설정(`forge.mode`, `forge.baseUrl`) | Hub와 Forge가 다른 프로세스·다른 디렉터리에서 통합 테스트 통과 | 중간~높음 |
| S5 | 관리자 지표를 `adminSnapshot()`으로 전환, 디스크 스캔 제거 | `admin-console.mjs`가 `forge.directory`를 읽지 않음 | 낮음 |
| S6 | `local` 구현과 Hub의 Drive 관련 코드 제거, `hub/`에서 `forge/` 참조 금지 검사 추가 | 검사 테스트 통과 | 낮음 |

각 단계는 독립 커밋이며 기본 설정(`mode: local`)에서 동작이 바뀌지 않아야 한다. S4부터 `remote`를 선택해야 새 경로가 쓰인다.

## 6. 테스트 계획

- 계약 테스트: 같은 시나리오를 `local`과 `remote` Gateway에 모두 실행한다(프로젝트 생성 → 릴리스 → 빌드 → 제출 고정 → 아카이브).
- 보안 테스트: 시크릿 누락·오류, 잘못된 `accountKey`, 다른 계정 키로 접근, `Origin` 헤더, 과대 본문.
- 장애 테스트: Forge 다운 시 Hub는 닫힌 상태로 실패하고(`SERVICE_UNAVAILABLE`) Hub 자체 기능(카탈로그·커뮤니티)은 영향이 없어야 한다.
- 회귀: `hub/tests` 전체와 `tests/deployment/hub-forge-integration.test.mjs`(Node 24).
- 현재 테스트가 직접 import하는 6개 파일(D)은 S2 이후 Gateway 또는 테스트 픽스처 헬퍼를 쓰도록 바꾼다.

## 7. 작업 소유와 충돌

- `hub/server/*`는 PlayHub-Admin·Platform, `forge/Tools/*`와 `forge/server.cjs`는 Forge 계열이 소유한다(`tools/worktree-ownership/owners.json`). S3는 Forge 쪽, S2·S4·S5는 Hub 쪽 변경이라 소유자가 갈린다. 계약(§3·§4)을 먼저 합의한 뒤 양쪽이 병행할 수 있다.
- `hub/server/app.mjs`는 다른 작업의 미커밋 변경이 있어, 변경 시 해당 hunk만 선택해 커밋한다.

## 8. 열린 결정

1. ~~`/api/platform/*` 처리 주체~~ → **확정 (2026-11-20): 전부 Forge로 일원화한다.** Hub는 세션·CSRF 검증과 `accountKey` 결정만 하고 요청을 Forge로 넘긴다. Hub 전용 라우트(builds·deployments·submissions·cloud)도 Forge 내부 API로 옮긴다. 근거는 §9 차이 3~6이다.
2. 내부 API를 Forge 공개 리스너의 별도 경로로 둘지, 별도 포트 리스너로 둘지. 권장은 별도 리스너(공개 경로와 섞이지 않음).
3. 서비스 간 인증을 공유 시크릿으로 시작할지, mTLS나 서명 토큰으로 갈지. 권장은 시크릿으로 시작하고 교체 전환 기간을 구현하는 것.
4. Drive 연동 코드(OAuth 토큰, Drive 스토어)가 Hub와 Forge 중 어디에 속할지. 현재는 Hub가 호출하지만 데이터는 Forge 디스크에 있다. 권장은 Forge로 이전.
5. 저장소를 객체 스토리지로 옮기는 P3와의 순서. 권장은 이 계약을 먼저 만들고, 저장소 교체는 Forge 내부 구현으로 숨긴다.

## 9. S0 대조 결과 (2026-11-20)

근거: 특성화 테스트 [hub-forge-platform-parity.test.mjs](../../tests/deployment/hub-forge-platform-parity.test.mjs)(실제 Forge 서버를 Hub 인증 모드로 띄우고 Hub `createHubForge`와 같은 계정 디렉터리에서 비교, Node 22·24에서 5개 통과)와 코드 읽기. "테스트"로 표시한 항목만 테스트로 고정했고, 나머지는 코드 읽기 결과다.

| # | 차이 | 근거 | 영향 |
|---|---|---|---|
| 1 | 핵심 라우트(`templates`, `projects`, `history`, `releases`, `session` 등)는 두 곳 모두 같은 `createPlatformApi`를 쓴다. Hub에서 만든 프로젝트가 Forge에서 그대로 보이고, 없는 프로젝트의 404 응답도 같다. | 테스트 | 일원화해도 사용자 동작이 바뀌지 않는다. |
| 2 | Hub 전용 라우트: `projects/{id}/builds`, `deployments`, `submissions`, `cloud`. Forge에는 없다. Forge 전용 라우트: `/api/platform-builds/{id}`, `/api/builds/{bid}`, `/api/platform-addon/*`. | 테스트(builds·cloud), 코드 | 일원화 시 Hub 전용 라우트를 Forge 내부 API로 옮겨야 한다. |
| 3 | **빌드 시스템이 둘이다.** Hub는 `OwnedBuildPackages`(`<forge.directory>/builds/<key>`), Forge는 메모리의 `BuildQueue`(`buildDirectory`)를 쓴다. 릴리스 생성 시 `validateBuild`가 각자 자기 빌드 저장소만 본다. 따라서 Forge 에디터에서 만든 빌드는 Hub 경로의 릴리스 검증을 통과하지 못하고, 반대도 마찬가지다. | 코드 (`forge-account.mjs:30,53`, `forge/server.cjs:82,113-118`) | 사용자에게 보이는 불일치 가능성. S1.5로 일원화 |
| 4 | **Drive 동기화가 Hub 경로 편집에만 걸린다.** `ProjectDriveSync.attachStore`는 Hub 프로세스의 `PlatformStore.emit`을 감싼다. Forge 에디터에서 저장한 변경은 Drive 동기화를 트리거하지 않는다. | 코드 (`project-drive-sync.cjs:118-130`) | Drive를 켜면 백업 누락 가능성 |
| 5 | **변경 이벤트가 프로세스를 넘지 않는다.** `PlatformStore` 리스너는 프로세스 안 메모리다. Hub 경로로 저장한 변경은 Forge의 `/events` 구독자에게 전달되지 않는다. | 코드 (`platform-store.cjs:58,224`) | 실시간 반영 누락 |
| 6 | **프로세스 간 쓰기 잠금이 없다.** `PlatformStore.read`는 매번 디스크를 읽고 `persist`는 임시 파일 후 rename한다. revision 검사와 쓰기 사이에 다른 프로세스가 쓰면 한쪽 변경이 사라질 수 있다. | 코드 (`platform-store.cjs:227-242`) | 동시 편집 시 데이터 유실 가능성(빈도는 낮음, 재현 테스트 없음) |
| 7 | 인증 실패 응답이 다르다. Hub는 `{ error: 'ACCESS_DENIED' }`, Forge는 자체 로그인 안내 형식이다. CSRF 정책은 같다(쓰기 요청에 `X-CSRF-Token`, Hub 세션 기준). | 테스트, 코드 | 프록시 일원화 시 응답 형식을 하나로 정해야 한다. |

결론:

- 차이 3~6은 "같은 데이터를 두 프로세스가 각자 처리"해서 생긴다. 계약을 나누는 것보다 **처리 주체를 Forge 하나로 모으는 것**이 먼저다. 열린 결정 1의 권장안을 "전부 Forge로 일원화"로 갱신했다.
- 차이 4~6은 현재도 Hub와 Forge가 모두 켜진 구성(`forge.enabled`와 Forge `hubAuth`)에서 발생할 수 있다. 분리 작업과 별개로 운영 위험으로 기록한다.
- 차이 3을 다루는 S1.5를 단계에 추가했다.

## 10. S1.5 결과 (2026-11-20)

- 정한 방향: 빌드 저장소의 기준은 **Forge의 `BuildQueue`** 로 둔다. Forge의 미리보기 URL(`/api/builds/{id}`), 멀티플레이 로비, `/play/{id}`가 모두 이 큐의 작업 ID를 쓰므로, 계정별 디렉터리(`OwnedBuildPackages`의 기존 방식)로 옮기면 영향 범위가 너무 크다.
- `OwnedBuildPackages`에 **공유 큐 모드**를 추가했다. 큐를 주입받으면 계정 디렉터리 대신 작업의 `ownerKey`로 소유권을 확인하고, 패키지를 큐 디렉터리에서 읽는다. 기존 계정별 모드(Hub)는 그대로다.
- Forge Hub 인증 모드의 변경:
  - `/api/platform-builds/{id}`가 정렬된 정규 스냅샷으로 큐에 넣는다(이전에는 정렬하지 않은 파일 순서로 해시가 계산되어 Hub 검증과 맞지 않았다). 응답 형식(`build.id`, `previewUrl` 등)은 같다.
  - 릴리스 생성 시 `validateBuild`가 소유자·프로젝트·revision에 더해 **sourceHash와 패키지 artifactSha256까지 검사**한다. 이전보다 엄격하다.
- Hub 인증이 꺼진 단독 Forge 모드는 바뀌지 않았다.
- 남은 일: Hub 프로세스는 아직 자기 계정별 큐(`<forge.directory>/builds/<key>`)를 쓴다. 저장소가 실제로 하나가 되는 것은 Hub의 builds 라우트가 Forge 내부 API로 옮겨질 때(S3·S4)다. 그때 Forge의 공유 큐 모드를 그대로 쓴다.
- 검증: `owned-build-packages.test.cjs` 2개(공유 큐 모드 추가), `hub-forge-integration` 8개(위조된 sourceHash의 빌드로 릴리스가 409로 거부되는 검사 추가), `hub-forge-platform-parity` 5개가 Node 24에서 통과. Forge 테스트 중 Hub 인증 모드를 쓰는 것은 통합 테스트뿐이다.

## 11. S2 결과 (2026-11-20)

- `hub/server/forge-gateway.mjs`의 `createLocalForgeGateway`가 `handlePlatform`·`getRelease`·`adminSnapshot`·`close`를 제공한다. Forge 모듈 `require()`와 Forge 디스크 스캔은 모두 이 파일로 옮겼고, 동작은 바꾸지 않았다.
- `forge-account.mjs`(`createHubForge`)는 세션 검증과 `accountKey` 계산만 하고 처리는 Gateway에 넘긴다. `creator-review.mjs`는 `getRelease`, `admin-console.mjs`는 `adminSnapshot`을 쓴다. `app.mjs`는 Gateway 하나를 만들어 세 모듈에 주입한다(`dependencies.forgeGateway`로 교체 가능). 주입이 없을 때 각 모듈은 로컬 Gateway를 만든다(기존 테스트 호환).
- `hub/tests/forge-boundary.test.mjs`: `hub/server`에서 `forge-gateway.mjs` 외 파일이 Forge 소스 경로를 참조하면 실패한다.
- 검증(Node 24): Hub 관련 테스트 76개 중 75개와 `hub-forge-integration`·`hub-forge-platform-parity` 13개 통과. 실패 1개는 `creator-review` 테스트 픽스처의 Windows 파일 rename `EPERM`으로 간헐적이며 Gateway 코드 이전 단계에서 발생한다. 전체 `hub/tests`의 나머지 실패(portable·browser 계열)는 깨끗한 워크트리에서 HEAD와 S2 적용본의 실패 목록이 같음을 확인했다.
- 발견한 기존 버그(이번에 고치지 않음): 관리자 Forge 현황의 프로젝트 목록(`inspectForgeProjects`)은 `accounts/<key>/projects/*.json`을 읽지만 `PlatformStore`는 `projects/<id>/project.json`에 저장한다. 따라서 관리자 화면의 프로젝트 수는 항상 0이다. S5에서 `adminSnapshot`을 Forge 내부 API로 옮길 때 함께 고친다.
