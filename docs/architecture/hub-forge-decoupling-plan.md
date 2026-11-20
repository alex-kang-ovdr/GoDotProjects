# Hub–Forge 분리 리팩토링 계획안

- 상태: 초안 (2026-11-20). 결합 ①(P1)만 구현·커밋됨(`646aae1`), ②③④(P2~P5)는 계획 단계
- 범위: `hub/`, `forge/`, 배포 구성
- 관련 문서: [hub-forge-integration.md](hub-forge-integration.md) (현행 단일 도메인·프로세스 분리 결정), [site-operations-plan.md](site-operations-plan.md), [reference-cases-research.md](reference-cases-research.md) (사례 근거와 출처)

## 1. 목표와 비목표

**목표**: Hub와 Forge를 같은 머신·같은 디스크·같은 도메인에 두지 않고도 운영할 수 있게 한다. 코드·배포·스케일링이 독립되어야 하고, Hub 로그아웃 즉시 Forge 차단이라는 현재 보장은 유지한다.

**비목표**: 지금 당장 두 사이트로 나누는 것이 아니다. 단일 서버 배포는 계속 기본값이며, 분리는 설정으로 켜는 옵션이다. 별도 IdP나 OIDC 도입도 하지 않는다(현행 결정 유지).

## 2. 외부 사례 요약 (Roblox 중심)

| 관찰 | 근거 수준 | 우리에게 주는 시사점 |
|---|---|---|
| 인증 쿠키(`.ROBLOSECURITY`)가 기본 도메인 `roblox.com`에 걸리고 `auth.`·`accountsettings.` 등 서브도메인이 공유한다. | 커뮤니티 문서 기반. 공식 문서에 도메인 범위 전체가 명시되어 있지 않음 | 상위 도메인 쿠키 + 서브도메인 구성이 현실적인 선택지다. |
| 외부 연동용 `apis.roblox.com`(Open Cloud)은 쿠키가 아니라 API 키·OAuth 토큰을 쓴다. OAuth 액세스 토큰 수명은 15분이다. | Roblox 공식 문서 | 브라우저 세션과 서버 간 호출의 자격 증명을 분리한다. |
| 쿠키 형식을 바꾸고 무효 세션에는 401과 교체용 `Set-Cookie`를 내려 준다. | Roblox 개발자 포럼 공지 | 세션 포맷을 바꿀 수 있도록 검증을 한 곳(Hub)에 둔다. 현재 구조와 일치한다. |
| 백엔드 전체가 단일 Consul 클러스터에 의존해 2021년 10월 3일 장애가 났고, 이후 셀 구조·독립 텔레메트리·이중 데이터센터로 보완했다. | Roblox 사후 보고서와 보도 | 공유 의존성 하나가 전체 장애로 번진다. Hub와 Forge가 같은 디스크·같은 프로세스를 공유하는 지금 구조가 같은 종류의 위험이다. |
| 사용자 콘텐츠는 별도 도메인에서 서빙하는 것이 업계 일반 패턴이다. | Google web.dev·보안 블로그. Roblox의 콘텐츠 도메인은 이번에 검증하지 못함 | 사용자 게임은 세션 쿠키가 닿지 않는 origin에서 서빙한다(④). |

추가 사례(상세와 출처는 [reference-cases-research.md](reference-cases-research.md)):

| 사례 | 관찰 | 반영 |
|---|---|---|
| StackBlitz | COOP/COEP 에디터는 모든 조상 프레임이 격리되어야 하고, COOP는 OAuth 팝업 같은 창 간 흐름을 깰 수 있다. `credentialless` COEP는 당시 Chromium만 지원했다. | P4: 에디터는 최상위 문서 유지, 팝업 흐름 사전 점검, 임베드 시 양쪽 헤더 일치 |
| 쿠키 없는 콘텐츠 origin 패턴, Google | 콘텐츠 origin은 쿠키를 설정·수신하지 않고, sandbox에서 `allow-same-origin`을 빼며, 60초 서명 토큰으로 접근을 준다. 콘텐츠별 서브도메인으로 사용자 간 격리를 얻는다. | P5 설계 확정 |
| Canva | 서명된 세션과 폐기 목록(S3 불변 객체) 배포로 수억 세션에서도 즉시 폐기를 유지했다(2차 보도 기준). | P1 후속 선택지 |

한계: Roblox 내부 인증 구현과 대형 게임 플랫폼(Steam·Epic·Unity)의 인증 구조는 공개 자료로 확인하지 못했다. 위 표는 공개 문서, 사후 보고서, 2차 보도 수준이다.

## 3. 현재 결합 지점과 단계

| 결합 | 코드 근거 | 단계 | 상태 |
|---|---|---|---|
| ① 루프백 전용 세션 검증 | `forge/Tools/hub-session-auth.cjs`, `hub/server/app.mjs` | P1 | **구현 완료** (HTTPS + 32자 이상 공유 시크릿, `PLAYHUB_FORGE_REMOTE_VERIFY=1` 옵트인) |
| ② 로컬 디스크·모듈 직접 공유 | `hub/server/forge-account.mjs`가 `forge/Tools/*.cjs` 10여 개를 `require()`하고 `<forge.directory>/accounts`를 동시 접근. `creator-review.mjs`도 해당 | P2~P3 | 미착수 |
| ③ 단일 도메인 경로 라우팅 | `/forge/*` 프록시와 경로 단위 COOP/COEP, `forgeBase`·`forgePath()` | P4 | 미착수 |
| ④ 사용자 콘텐츠 origin 격리 | 사용자 게임(`/games/*`, `/play/*`)이 세션 쿠키와 같은 origin | P5 | 미착수 (신규 항목) |

## 4. 단계별 계획

### P1. 세션 검증 원격화 (완료)

- 결과: 비루프백 검증은 HTTPS와 32자 이상 시크릿이 없으면 기동 단계에서 실패한다. Hub는 옵트인일 때만 공개 리스너에 verify를 열고 접속 주소별 분당 1200회로 제한한다.
- 남은 일: 원격 모드를 켠 Hub에 실제 요청을 보내는 통합 테스트(시크릿 누락·오류, 쿠키 없음, CSRF 불일치, 만료 세션). 프록시 뒤에서 `remoteAddress`가 프록시 주소가 되는 점을 고려한 제한 키 설계.
- 결정 유지: 매 요청 검증이라 로그아웃 즉시 차단이 유지된다. 단수명 서명 토큰은 만료 시간만큼 차단이 늦어지므로 채택하지 않는다. 지연 시간이 문제가 되면 Hub 쪽에 공유 세션 저장소(Redis 등)를 두는 방향을 먼저 검토한다.
- 후속 선택지(Canva 사례): 요청 수가 늘어 매 요청 검증이 병목이 되면 "서명된 세션 + 폐기 목록 배포"로 전환할 수 있다. 폐기 목록을 불변 객체로 두고 Forge가 메모리 인덱스로 받는 방식이며, 즉시 차단 보장을 유지한 채 요청마다 Hub를 호출하지 않는다. 전환 기준은 Forge 검증 지연과 Hub 부하의 실측값이고, 그 전에는 도입하지 않는다.

### P2. 모듈 경계 확정 (②의 1단계)

- `forge-account.mjs`가 쓰는 Forge 모듈을 목록화하고 용도별로 나눈다: 프로젝트 저장(`PlatformStore`), 빌드 패키지(`OwnedBuildPackages`), Drive 동기화·제출 아카이브, 배포 ZIP.
- Forge에 **내부 HTTP API**(`/internal/*`, 서비스 간 인증)를 정의한다: 프로젝트 조회·릴리스 읽기·빌드 등록과 상태·제출 아카이브. Hub는 이 API만 호출한다.
- 이 단계에서는 Hub가 같은 프로세스 안에서 API 클라이언트를 통해 호출하는 어댑터를 두어 동작을 바꾸지 않는다. `require('../../forge/...')`는 어댑터 한 곳으로 모은다.
- 완료 기준: `hub/` 안에서 `forge/` 경로를 직접 참조하는 코드가 어댑터 한 파일뿐이다. 기존 hub 테스트와 `hub-forge-integration` 통과.

### P3. 저장소 분리 (②의 2단계)

- 계정별 프로젝트·릴리스·빌드 아티팩트를 파일 시스템에서 객체 스토리지(GCS 등)와 메타데이터 DB로 옮긴다. 디스크 경로 공유(`PLAYHUB_FORGE_ACCOUNTS_DIR`)를 제거한다.
- 단계: 저장소 인터페이스 도입 → 파일 구현을 인터페이스 뒤로 이동 → 객체 스토리지 구현 추가 → 기존 계정 데이터 이관 도구와 롤백 절차.
- 위험: 파일 I/O 전체를 건드리는 중규모 변경이다. 이관 중에는 읽기는 새 저장소, 쓰기는 양쪽 이중 기록하는 기간을 둔다.
- 완료 기준: Hub와 Forge가 서로 다른 머신에서 디스크 공유 없이 같은 계정 프로젝트를 다룬다.

### P4. 도메인 분리 (③)

- `forge.<도메인>` 서브도메인으로 분리한다. 우선안은 Hub 세션 쿠키를 상위 도메인에 걸지 않고, **Hub가 발급하는 단수명 일회용 코드를 Forge가 교환해 Forge 자체 first-party 세션을 만드는 방식**이다. 상위 도메인 쿠키는 구현이 쉽지만 한 서브도메인의 XSS가 Hub 세션 탈취로 이어진다.
- 로그아웃은 Forge 세션도 Hub 검증을 거치게 해(P1의 매 요청 검증 유지) 즉시 반영한다.
- COOP/COEP는 Forge origin 자체에서 보낸다. 96MB 에디터 wasm은 CDN에 올리되, COEP `require-corp` 환경이므로 CDN이 CORP/CORS 헤더를 보내야 한다. 이 부분은 실제 CDN으로 검증이 필요하다(아직 미검증).
- 쿠키·CORS·CSRF 영향 점검: `forgeBase`/`forgePath()` 접두사 처리를 경로 접두사 모드와 호스트 모드 양쪽에서 동작하게 한다. 현재 접두사 없는 절대 경로가 남은 파일(`agent.js`, `chatgpt-login.html`, `chat_web_dock.gd`, `showcase_repository.gd`)을 먼저 정리한다.
- 사전 점검(StackBlitz 사례): COOP `same-origin` 아래에서 `window.open` 팝업(`chatgpt-login.html`의 ChatGPT 로그인 등)이 현재 동작하는지 확인한다. 깨지면 팝업 대신 같은 탭 리다이렉트로 바꾸거나 COOP 정책을 조정한다.
- 에디터는 계속 최상위 문서로 연다. Hub 페이지에 iframe으로 넣는 설계는 모든 조상 프레임의 격리가 필요해 채택하지 않는다.
- COEP: 기본은 `require-corp`. `credentialless`는 브라우저별 지원이 갈리므로 구현 전에 현재 지원 현황을 재확인하고, 쓰더라도 미지원 브라우저용 `require-corp` 대체를 둔다.
- 완료 기준: 같은 코드가 `playhub.<도메인>/forge/` 모드와 `forge.<도메인>` 모드에서 모두 통과하고, 팝업 로그인 흐름이 두 모드에서 동작한다.

### P5. 사용자 콘텐츠 origin 격리 (④)

- 사용자·크리에이터가 만든 게임은 세션 쿠키가 닿지 않는 별도 origin(`*.usercontent.<도메인>` 등)에서 서빙한다. 콘텐츠 origin은 인증 미들웨어 밖에 두어 쿠키를 설정하지도 받지도 않는다.
- iframe은 `sandbox="allow-scripts"`만 주고 `allow-same-origin`은 절대 함께 주지 않는다(함께 쓰면 격리가 무효이고, Repl.it XSS가 이 경우였다). `referrerPolicy=no-referrer`, 응답에 `nosniff`, `frame-ancestors`는 Hub origin으로 고정한다.
- Hub가 세션과 권한을 확인한 뒤 수명 60초의 서명 JWT를 iframe `src`로 발급한다. 콘텐츠 라우트는 서명과 대상(audience)만 검증하고 세션은 보지 않는다. 게임 하나에만 유효하다.
- 사용자 간 격리를 위해 게임별 서브도메인을 우선 검토한다. 단일 샌드박스 도메인은 메인 사이트와는 격리하지만 사용자 콘텐츠끼리는 격리하지 못한다. 도메인을 Public Suffix List에 등록하는 방안은 별도 검토 항목이다.
- 주의: 게임이 교차 출처 격리(SharedArrayBuffer)를 요구하면 콘텐츠 origin 응답에도 COOP/COEP가 필요하고, 부모 프레임 조건과 충돌할 수 있다. 게임 유형별로 확인한다(미검증).
- 완료 기준: 게임 코드가 Hub·Forge 쿠키와 스토리지에 접근할 수 없다는 브라우저 테스트, 만료된 토큰과 다른 게임용 토큰이 거부되는 테스트.

## 5. 위험과 대응

| 위험 | 대응 |
|---|---|
| 원격 verify 지연으로 Forge 응답이 느려진다 | 타임아웃(현재 3초)과 실패 시 닫힘 유지. 필요하면 Hub 측 공유 세션 저장소 검토 |
| 이관 중 데이터 불일치 | 이중 기록 기간, 이관 검증 도구, 롤백 스위치 |
| 서브도메인 분리 후 쿠키·CORS 회귀 | 경로 모드와 호스트 모드를 같은 테스트 세트로 병행 검증 |
| 작업이 여러 에이전트와 겹친다 | `tools/worktree-ownership/owners.json`의 소유권 규칙을 따르고, Hub·Forge 공유 파일은 한 브랜치에서만 수정 |
| 시크릿 유출 | 시크릿 최소 길이 강제(구현됨), 교체 절차는 운영 계획안 참조 |

## 6. 검증 계획

- 단위: `forge/Tests/hub-session-auth.test.cjs`(구현됨). 저장소 인터페이스·내부 API 계약 테스트 추가.
- 통합: `tests/deployment/hub-forge-integration.test.mjs`를 단일 서버 모드와 분리 모드 두 가지로 실행. Node 24 필요(`artifacts/local-runtime/node24/node.exe`).
- 브라우저: 분리 모드에서 로그인 → Forge 진입 → 로그아웃 → Forge 즉시 차단.
- 알려진 환경 문제: `cloud-origin` 3번과 `integration`·`godot-parity`가 현재 실패 중이다(이번 계획과 별개로 선행 정리 필요).

## 7. 열린 결정

1. P4의 세션 방식: 일회용 코드 교환(권장) 대 상위 도메인 쿠키.
2. 객체 스토리지 선택(GCS 등)과 메타데이터 DB.
3. 사용자 콘텐츠 도메인을 지금 확보할지.
4. 분리 시점: 사용자 수나 동시 에디터 세션 수의 기준값(운영 계획안과 연동).

## 8. 참고 자료

- [Roblox OAuth 2.0](https://create.roblox.com/docs/cloud/auth/oauth2-reference)
- [Roblox Return to Service 10/28–10/31 2021](https://about.roblox.com/newsroom/2022/01/roblox-return-to-service-10-28-10-31-2021)
- [Roblox 쿠키 형식 변경 공지](https://devforum.roblox.com/t/upcoming-roblosecurity-cookie-format-changes/4328913)
- [web.dev: Securely hosting user data](https://web.dev/articles/securely-hosting-user-data)
- [Google Privacy Sandbox: 로그인 흐름과 서드파티 쿠키](https://privacysandbox.google.com/cookies/guides/identity)
