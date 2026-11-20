# Hub–Forge 내부 API 경계 설계 (결합 ②)

- 상태: 설계 초안 (2026-11-20). 코드 변경 없음
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

1. **같은 `/api/platform/*`를 두 곳이 구현한다.** Hub는 `createHubForge`로 프로세스 안에서, Forge는 `hubAuth` 모드의 `getPlatformFor(accountKey).api`로 처리한다. 둘 다 같은 `accounts/<accountKey>` 디렉터리를 쓴다. 두 구현의 라우트 범위가 완전히 같은지는 확인하지 못했다(Hub 쪽에는 builds·deployments·submissions·cloud 라우트가 있고, Forge 쪽은 `BuildQueue`는 있으나 나머지 라우트 유무 미확인). → 단계 S0에서 대조한다.
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

## 5. 단계

| 단계 | 내용 | 완료 기준 | 위험 |
|---|---|---|---|
| S0 | 특성화 테스트: Hub와 Forge의 `/api/platform/*` 응답 대조, `accountKey` 동치 테스트 | 두 구현의 차이 목록이 문서화됨 | 낮음 |
| S1 | `creator-review.mjs`의 `accountKey` require를 `forgeAccountKey`로 교체 | 해당 require 제거, 기존 테스트 통과 | 낮음 |
| S2 | `ForgeGateway` 도입, `local` 구현이 현재 동작을 그대로 감싼다. B·C·A가 Gateway만 쓰게 변경 | `hub/server`에서 `forge/` 직접 참조가 `local` 구현 한 파일뿐 | 중간 |
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

1. `/api/platform/*`를 **프록시**(Hub는 인증만, 처리는 Forge)로 할지, Hub에 남길 라우트가 있는지. 권장은 전부 프록시이고 S0 대조 결과로 확정한다.
2. 내부 API를 Forge 공개 리스너의 별도 경로로 둘지, 별도 포트 리스너로 둘지. 권장은 별도 리스너(공개 경로와 섞이지 않음).
3. 서비스 간 인증을 공유 시크릿으로 시작할지, mTLS나 서명 토큰으로 갈지. 권장은 시크릿으로 시작하고 교체 전환 기간을 구현하는 것.
4. Drive 연동 코드(OAuth 토큰, Drive 스토어)가 Hub와 Forge 중 어디에 속할지. 현재는 Hub가 호출하지만 데이터는 Forge 디스크에 있다. 권장은 Forge로 이전.
5. 저장소를 객체 스토리지로 옮기는 P3와의 순서. 권장은 이 계약을 먼저 만들고, 저장소 교체는 Forge 내부 구현으로 숨긴다.
