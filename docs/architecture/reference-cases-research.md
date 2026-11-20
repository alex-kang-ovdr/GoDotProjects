# 분리 구조 참고 사례 리서치

- 작성: 2026-11-20. 웹 검색과 원문 4건 열람 결과이며, 각 항목에 근거 수준을 적었다.
- 연결 문서: [hub-forge-decoupling-plan.md](hub-forge-decoupling-plan.md), [site-operations-plan.md](site-operations-plan.md)
- 한계: Steam·Epic·Unity·Atlassian·Shopify·Discord·Spotify의 인증 구조와 GDC 발표는 검색에서 찾지 못했다. Roblox의 인증 내부 구현과 GitHub·Replit·CodeSandbox의 콘텐츠 도메인 구성도 1차 자료로 확인하지 못했다. 아래는 확인된 사례만 다룬다.

## 1. 사례별 정리

### 1.1 StackBlitz — 교차 출처 격리(COOP/COEP)를 쓰는 에디터 (가장 직접적인 선례)

우리와 같은 제약(SharedArrayBuffer → COOP `same-origin` + COEP `require-corp`)을 가진 웹 IDE다. 근거: [StackBlitz 공식 블로그](https://blog.stackblitz.com/posts/cross-browser-with-coop-coep/), [WebContainers 헤더 가이드](https://webcontainers.io/guides/configuring-headers) (원문 열람).

- 페이지가 iframe 안에 있으면 **모든 조상 프레임이 격리되어야** 격리가 성립한다. 격리를 전체에 강제하면 임베드하는 사이트가 깨지므로, 임베드에는 양쪽이 같은 헤더와 `allow="cross-origin-isolated"`를 가져야 한다.
- `COEP: credentialless`는 CORS 없는 교차 출처 요청에서 자격 증명을 빼는 방식이라 사용자 콘텐츠가 많은 사이트에 맞지만, 블로그 작성 당시 Chromium만 지원했다(Firefox·Safari 상태는 현재 문서로 재확인 필요). StackBlitz는 지원되는 브라우저에는 `credentialless`, 나머지에는 `require-corp`로 대체하는 혼합 방식을 계획했다.
- **COOP는 OAuth 팝업과 결제 같은 창 간 흐름을 깬다.** StackBlitz는 GitHub 로그인에서 이 문제를 겪었다. 개발자 이슈에서도 헤더를 모두 빼야 OAuth 팝업이 동작했다는 보고가 있다(커뮤니티 이슈, 2차 근거).
- `require-corp`는 CORS·CORP 헤더를 주지 않는 서드파티 자원을 막는다.

**우리에 대한 시사점**
- 현재 설계(에디터를 최상위 문서로 열고 Hub와 같은 origin의 iframe에 넣지 않는다)는 위 문제를 피하는 방식이라 유지한다.
- 에디터 안의 ChatGPT 로그인 팝업(`chatgpt-login.html`, `window.open`)은 COOP `same-origin`에서 같은 문제가 생길 수 있다. 현재 어떻게 동작하는지는 확인하지 못했으므로 P4 전에 점검 항목으로 둔다.
- 에디터 wasm을 CDN으로 옮길 때는 CDN 응답에 CORP/CORS 헤더가 필요하다.

### 1.2 Google — 사용자 콘텐츠를 별도 origin에서 서빙

근거: [web.dev: Securely hosting user data](https://web.dev/articles/securely-hosting-user-data), [Google Security Blog](https://security.googleblog.com/2023/04/securely-hosting-user-data-in-modern.html) (검색 결과 요약; 원문 본문은 직접 열람하지 못했다). [SafeContentFrame 글](https://bughunters.google.com/blog/beyond-sandbox-domains-rendering-untrusted-web-content-with-safecontentframe)은 본문을 가져오지 못해 제목 수준만 확인했다.

- 사용자 콘텐츠는 `googleusercontent.com` 같은 별도 도메인에서 서빙한다.
- 샌드박스 도메인 하나는 메인 사이트와는 격리하지만, **사용자 콘텐츠끼리는 격리하지 못한다.** 콘텐츠별로 서브도메인을 주는 방식이 이를 해결한다.
- Public Suffix List에 등록된 도메인을 쓰면 각 서브도메인이 서로 다른 사이트로 취급된다(검색 요약 기준).

### 1.3 쿠키 없는 콘텐츠 origin 패턴

근거: [DEV Community 글](https://dev.to/henning_witzel/safely-hosting-arbitrary-user-html-the-cookieless-origin-sandbox-pattern-j7p) (원문 열람, 개인 블로그 수준의 2차 자료).

- 콘텐츠 origin은 인증 미들웨어 밖에 두어 **세션 쿠키를 설정하지도 받지도 않게** 한다.
- iframe은 `sandbox="allow-scripts"`만 주고 `allow-same-origin`은 빼 불투명 origin으로 만든다. 둘을 함께 주면 격리가 무효가 된다.
- 앱 origin이 세션과 권한을 확인한 뒤 **수명 60초의 서명 JWT**를 iframe `src`로 발급한다. 콘텐츠 라우트는 서명과 대상(audience)만 검증하고 직접 세션을 확인하지 않는다.
- 접근 제어(서명된 권한 토큰)와 격리(origin 분리)를 별도 메커니즘으로 둔다.
- 실패 사례: 2019년 Repl.it XSS는 iframe에 `allow-same-origin`이 있어 사용자 코드가 같은 origin의 부모 페이지에 접근한 경우였다([개인 블로그 공개글](https://kmh.zone/blog/2019/06/26/replit-xss/), 현재 Replit과는 다를 수 있음).

**우리에 대한 시사점**: 분리 계획 P5의 설계가 그대로 이 패턴이다. 사용자 게임에는 60초 서명 토큰과 `allow-same-origin` 없는 sandbox를 쓴다.

### 1.4 Canva — 서명된 세션과 대규모 즉시 폐기

근거: [InfoQ 보도](https://www.infoq.com/news/2026/08/canva-session-revocation-scale/) (원문 열람, 2차 보도).

- 세션은 암호화된 쿠키라 게이트웨이가 저장소 조회 없이 인증한다. 폐기(revocation)와 권한 변경은 거의 실시간으로 전파해야 한다.
- 폐기 목록을 **S3의 불변 객체**(30분 단위 조각, 항목당 16바이트)로 두고 게이트웨이가 메모리 인덱스로 받는다. 12시간 창만 유지한다. Redis를 추가로 운영하지 않으려는 선택이었다.
- 결과: 수억 개 세션 규모, 폐기 캐시 메모리 87.5% 감소, 세션 폐기용 DB가 읽기 복제본 2대로 줄었다. 배포 때 게이트웨이 수백 대가 DB를 동시에 조회하던 문제가 사라졌다.
- 기사에는 폐기부터 게이트웨이 반영까지의 전파 지연이 명시되어 있지 않다.

**우리에 대한 시사점**
- 현재 방식(Forge가 매 요청 Hub에 검증)은 단순하고 즉시 차단이 되지만, 요청 수가 늘면 Hub 호출이 병목이 된다. 그때의 대안이 **"서명된 단수명 세션 + 폐기 목록 배포"** 이다. 로그아웃 즉시 차단 보장을 유지하면서 요청마다 Hub를 호출하지 않을 수 있다.
- 지금 규모에서는 과설계다. 분리 계획 P1의 후속 선택지로만 기록한다. 전환 기준은 Forge 검증 지연과 Hub 부하의 실측값이다.

### 1.5 Roblox — 운영과 장애 교훈

근거: [Roblox 사후 보고서](https://about.roblox.com/newsroom/2022/01/roblox-return-to-service-10-28-10-31-2021), [InfoWorld 분석](https://www.infoworld.com/article/3648414/robloxs-cloud-native-catastrophe-a-post-mortem.html), [HashiCorp 사례](https://www.hashicorp.com/case-studies/roblox) (검색 결과 요약).

- 백엔드가 단일 Consul 클러스터에 의존해, 2021년 10월 장애가 길어졌다. 모니터링도 같은 의존성 위에 있어 원인 파악이 늦어졌다. 이후 클러스터 분리, 독립 텔레메트리, 이중 데이터센터, 셀 구조를 추진했다.
- Nomad·Consul·Vault로 대규모 서버를 운영한다.
- 외부 API(Open Cloud)는 쿠키가 아닌 API 키·OAuth(액세스 토큰 15분)를 쓴다([OAuth 문서](https://create.roblox.com/docs/cloud/auth/oauth2-reference)).

### 1.6 로그아웃은 SSO의 약한 고리

근거: [Microsoft Entra 문서](https://learn.microsoft.com/en-us/entra/identity-platform/v2-protocols-oidc), [로그아웃·토큰 폐기 가이드](https://nhimg.org/global-token-revocation-and-universal-logout-guide) (검색 결과 요약).

- SSO는 로그인을 중앙화하지만 로그아웃은 앱마다 따로 세션 쿠키를 갖기 때문에 전파되지 않는다. 대응으로 identity 플랫폼이 로그아웃 시 각 앱의 front-channel 로그아웃 URL을 호출한다.
- 액세스 토큰은 리소스 쪽이 폐기를 확인(introspection이나 deny list)해야 막을 수 있다.

**우리에 대한 시사점**: 매 요청 검증과 세션 레코드 하나를 공유하는 현재 구조가 이 약점을 이미 피한다. 서명 토큰으로 바꾸면 폐기 확인 경로를 반드시 함께 넣어야 한다.

## 2. 사례에서 얻은 결론 (우리 계획 반영안)

| # | 결론 | 근거 | 반영 위치 |
|---|---|---|---|
| 1 | 에디터는 최상위 문서로 열고, 임베드가 필요하면 양쪽 헤더를 맞춘다. | StackBlitz | P4 |
| 2 | COOP 때문에 OAuth·로그인 팝업 계열 흐름이 깨질 수 있다. `chatgpt-login.html` 점검이 필요하다. | StackBlitz | P4 사전 점검(신규) |
| 3 | 사용자 콘텐츠는 별도 origin, 쿠키 없음, `allow-same-origin` 금지, 60초 서명 토큰. | Google, 쿠키 없는 origin 패턴, Repl.it XSS | P5 설계 확정 |
| 4 | 가능하면 콘텐츠마다 별도 서브도메인(게임별). 사용자끼리의 격리를 위해서다. | Google | P5 선택지 |
| 5 | 규모가 커지면 "서명 세션 + 폐기 목록 배포"로 전환할 수 있다. 지금은 매 요청 검증 유지. | Canva | P1 후속 선택지 |
| 6 | 모니터링은 서비스와 독립된 경로에 둔다. 공유 의존성이 전체 장애로 번지지 않게 한다. | Roblox | 운영 계획 §6 |

## 3. 아직 모르는 것

- Hub·Forge처럼 "서로 다른 제품이 하나의 로그인을 공유하는" 게임 플랫폼의 공개 아키텍처 발표는 찾지 못했다. 다음 단계로 GDC Vault와 각 플랫폼 개발자 문서(Steamworks session ticket, Epic Online Services Connect 등)를 직접 확인하는 것이 필요하다.
- COEP `credentialless`의 현재 브라우저 지원 현황은 StackBlitz 글 작성 시점 이후 바뀌었을 수 있다. P4 구현 전에 재확인한다.
- Canva 사례는 보도 기사 기준이다. 전파 지연 같은 핵심 수치는 원문 확인이 필요하다.
