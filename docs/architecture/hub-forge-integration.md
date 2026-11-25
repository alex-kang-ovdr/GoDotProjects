# Hub–Forge 통합 결정: 단일 도메인, 프로세스 분리

- 상태: 구현 및 로컬 검증 완료 (2026-11-19; 공개 배포 및 실 OAuth 환경은 별도)
- 범위: `hub/`, `forge/`, `tools/` 런처, 향후 공개 배포 구성

## 결정

PlayHub는 **하나의 도메인과 하나의 로그인(Hub Google 로그인)** 으로 제공한다. Forge는 Hub에 코드로 합치지 않고 **별도 프로세스**로 실행하며, Hub 앞단의 리버스 프록시가 경로로 분기한다. 별도 IdP나 OIDC 수준의 SSO 프로토콜은 만들지 않는다.

```
playhub.<domain>
 ├─ /            → Hub 정적 사이트 (Node 24 / 리버스 프록시): 사용자 UI, /games/* (COOP/COEP 없음)
 ├─ /api/*       → Hub 공개 API (Node 24): Google 로그인, 카탈로그, 저장, /api/platform/*
 └─ /forge/*     → Forge (Node 22, 내부 포트 4177): 웹 에디터, Godot 런타임 (COOP/COEP/CORP)
                   └─ 루프백 검증: POST http://127.0.0.1:<adminPort>/internal/session/verify
```

## 검토한 대안

| 대안 | 기각/채택 사유 |
|---|---|
| A. Hub 단일 프로세스에 Forge 완전 내장 | Forge 에디터의 `COOP: same-origin`/`COEP: require-corp`가 Hub 전체로 번지면 외부 리소스·OAuth 흐름이 깨질 위험. Godot 런타임(세션 최대 16개) 장애가 Hub와 함께 전파. Hub Node 24 / Forge Node 22 런타임 통일 필요. **기각** |
| B. 사이트 2개 + SSO | IdP, 토큰 교환, 로그아웃 전파, 사이트별 CSRF를 새로 구현해야 함. Forge를 PlayHub 외부 제품으로 쓸 계획이 없으므로 비용 대비 이점이 적음. **기각** |
| C. 단일 도메인, 프로세스 분리 | Hub 세션 쿠키를 그대로 사용, 헤더와 장애는 경로·프로세스로 격리. **채택** |

## 구현 구조

- **쿠키 스코프 분리 ([hub/server/security.mjs](../../hub/server/security.mjs), [hub/server/app.mjs](../../hub/server/app.mjs))**
  - `poc_public_session`: 기존 계약 그대로 `Path=/api; HttpOnly; SameSite=Lax` 유지(`/games/*`에 전송되지 않음).
  - `poc_forge_session`: Google 등록 계정으로 로그인할 때만 동일 세션 토큰을 `Path=/forge; HttpOnly; SameSite=Lax`로 추가 발급. 게스트·익명·QA·관리자 세션에는 발급하지 않으며, `/api/auth/logout` 시 두 쿠키를 모두 `Max-Age=0`으로 삭제하고 SQLite `sessions` 행을 즉시 제거한다.
- **Hub 내부 세션 검증 ([hub/server/app.mjs](../../hub/server/app.mjs))**
  - `adminServer`(루프백 전용)의 `POST /internal/session/verify`로만 노출(`publicServer`에서는 404).
  - 루프백 원격 주소 확인, 브라우저 `Origin` 헤더 거부, 설정된 `X-PlayHub-Internal-Secret` 상수시간 비교, `poc_forge_session`/`poc_public_session`만 허용(`poc_admin_session` 거부), 등록된 Google 계정 확인 및 쓰기 요청 `X-CSRF-Token` 검증을 수행한다.
- **Hub 동일 출처 프록시 ([hub/tools/forge-proxy.mjs](../../hub/tools/forge-proxy.mjs), [hub/tools/dev.mjs](../../hub/tools/dev.mjs))**
  - Hub 사용자 서버의 `/forge/*` HTTP 요청·SSE·WebSocket 업그레이드를 내부 Forge 포트(`PLAYHUB_FORGE_UPSTREAM`)로 전달하며 `/forge` 접두사를 제거한다.
  - 외부에서 들어온 `X-PlayHub-*`, `X-Forwarded-*`, `Forwarded`, `X-Real-IP` 헤더를 모두 제거한다.
  - Forge 내부 리다이렉트(`Location: /OfficialGodot/` 등)에는 `/forge` 접두사를 유지하고, Hub 계정 화면 리다이렉트(`/?view=account`)는 그대로 둔다.
  - COOP/COEP/CORP 헤더는 `/forge/*` 응답에만 존재하며 Hub 페이지(`/`, `/games/*`)에는 붙지 않는다.
- **Forge 세션 인증 및 계정 격리 ([forge/Tools/hub-session-auth.cjs](../../forge/Tools/hub-session-auth.cjs), [forge/server.cjs](../../forge/server.cjs))**
  - `hubAuth` 활성화(`PLAYHUB_FORGE_AUTH_MODE=hub` 또는 `PLAYHUB_SESSION_VERIFY_URL`) 시 fail-closed로 동작한다.
  - `GET /api/health`와 `GET /api/session`을 제외한 모든 정적 에디터 경로, `/api/*`, `/play/*`, WebSocket(`/brawllabs`, `/fortress-war`)이 Hub 세션 검증을 거친다. 세션 결과를 캐시하지 않으므로 Hub 로그아웃이 즉시 반영된다.
  - 프로젝트(`PlatformStore`), Godot 편집기 플러그인 소스 문서(`/api/editor/source`), 빌드(`BuildQueue` `ownerKey`), PIE 런타임 세션(`runtimes` `${accountKey}:${sessionId}`, 계정당 최대 4개·전체 16개)을 모두 `accountKey`별로 격리한다.
  - `PLAYHUB_FORGE_ACCOUNTS_DIR`을 Hub의 `<forge.directory>/accounts`로 맞추면 Hub `/?view=create`와 Forge `/forge/OfficialGodot/`가 같은 계정별 프로젝트 디렉터리를 공유한다.
  - `/PrivateAccount*` 및 `/account*` 요청은 Hub 계정 화면(`/?view=account`)으로 302 리다이렉트하며 `PrivateAccount` 정적 파일을 제공하지 않는다.
- **Forge 프론트엔드 및 에디터 base path**
  - `forge/OfficialGodot/`, `forge/Frontends/`, `forge/Godot/addons/playforge_platform/plugin.gd`가 `/forge` 접두사 아래와 독립 루트(`/`) 양쪽에서 동작하도록 상대 자산 경로와 `forgeBase` 자동 감지, `/api/session` CSRF 토큰 전달을 적용했다.
  - Hub의 [hub/web/user/PlayForge/redirect.js](../../hub/web/user/PlayForge/redirect.js)는 기본으로 동일 출처 `/forge/OfficialGodot/`로 이동하며, `/?view=create`에서 새 탭(`target="_blank" rel="noopener"`)으로 연다.
- **로컬 통합 런처 ([tools/start-platform.ps1](../../tools/start-platform.ps1), [tools/launch.cjs](../../tools/launch.cjs))**
  - 기존의 4173→4177 포트 리다이렉트(`tools/forge-redirect.cjs`)를 제거했다.
  - Forge를 내부 포트 `4177`로 실행하고 Hub 사용자 서버에 `/forge/*` 프록시를 연결한다. Google OAuth 또는 `forge.enabled`가 구성된 경우 공유 내부 시크릿과 `PLAYHUB_FORGE_AUTH_MODE=hub`를 자동으로 활성화한다.

## 구현 원칙

1. **인증 소유자는 Hub 하나다.** Forge는 사용자를 직접 로그인시키지 않는다.
2. **Forge 요청 검증.** `/forge/*`의 문서·API·WebSocket 요청은 Forge가 루프백 전용 `POST /internal/session/verify`로 Hub 세션을 직접 검증한다. 프록시는 외부에서 유입된 `X-PlayHub-*`/`X-Forwarded-*` 헤더를 제거한다.
3. **격리 헤더는 경로 단위.** COOP/COEP/CORP는 `/forge/*` 응답에만 적용한다. Hub 페이지에는 적용하지 않는다.
4. **에디터는 최상위 문서로 연다.** cross-origin isolated 문서를 Hub 페이지의 iframe에 넣으면 부모에도 COEP가 필요하므로, Hub에서 에디터로는 새 탭 이동으로 진입한다.
5. **CSRF.** Forge의 쓰기 API도 Hub와 같은 CSRF 토큰(`X-CSRF-Token`)과 `Origin` 검사 규칙을 따른다.
6. **로그아웃.** 같은 세션 레코드를 참조하므로 Hub 로그아웃이 곧 Forge 로그아웃이다. Forge는 세션 결과를 캐시하지 않는다.
7. **서브도메인 전환 여지.** 추후 `forge.<domain>`으로 분리하더라도 상위 도메인 쿠키 또는 짧은 수명의 서명 토큰으로 충분하며 IdP를 도입하지 않는다.

## 공개 배포용 리버스 프록시 설정 예시

> [!IMPORTANT]
> - Hub `adminServer`(`127.0.0.1:8091`)와 `/internal/session/verify`, 그리고 Forge 프로세스(`127.0.0.1:4177`)는 **반드시 루프백/사설망에만 바인딩**하고 공용 인터넷에 직접 노출하지 않는다.
> - 외부에서 들어오는 `X-PlayHub-*`, `X-Forwarded-User`, `X-Forwarded-Email`, `Forwarded` 헤더는 프록시에서 반드시 제거한다.
> - Hub 설정은 `secureCookies: true`, `userOrigins: ["https://playhub.example.com"]`, `userBaseUrl: "https://playhub.example.com"`, `publicBaseUrl: "https://playhub.example.com"`으로 맞추고, Forge 프로세스에는 `PUBLIC_ORIGIN=https://playhub.example.com`, `PLAYFORGE_BASE_PATH=/forge`, `PLAYHUB_FORGE_AUTH_MODE=hub`, `PLAYHUB_SESSION_VERIFY_URL=http://127.0.0.1:8091/internal/session/verify`, `PLAYHUB_FORGE_INTERNAL_SECRET=<공유-비밀값>`을 지정한다.

### Nginx 예시

```nginx
map $http_upgrade $connection_upgrade {
    default upgrade;
    ''      close;
}

server {
    listen 443 ssl http2;
    server_name playhub.example.com;

    # TLS 인증서 설정 생략

    # 1. 내부 검증·관리자 경로는 공개 도메인에서 차단
    location ^~ /internal/ { return 404; }
    location ^~ /api/admin { return 404; }

    # 2. Hub 공개 API (Node 24, 127.0.0.1:8090)
    location ^~ /api/ {
        proxy_pass http://127.0.0.1:8090;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-PlayHub-Internal-Secret "";
        proxy_set_header X-PlayHub-User "";
        proxy_set_header X-PlayHub-Account-Key "";
        proxy_set_header X-Forwarded-User "";
        proxy_set_header X-Forwarded-Email "";
        proxy_set_header Forwarded "";
    }

    # 3. Forge 웹 에디터·API·SSE·WebSocket (Node 22, 127.0.0.1:4177)
    #    COOP/COEP/CORP 헤더는 Forge 응답에서만 내려오며 /forge/*에만 한정됨
    location = /forge {
        return 308 /forge/;
    }

    location ^~ /forge/ {
        proxy_pass http://127.0.0.1:4177/;
        proxy_http_version 1.1;
        proxy_set_header Host 127.0.0.1:4177;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection $connection_upgrade;

        # 스푸핑 가능한 신원·내부 헤더 제거
        proxy_set_header X-PlayHub-Internal-Secret "";
        proxy_set_header X-PlayHub-User "";
        proxy_set_header X-PlayHub-Account-Key "";
        proxy_set_header X-Forwarded-User "";
        proxy_set_header X-Forwarded-Email "";
        proxy_set_header X-Forwarded-Host "";
        proxy_set_header X-Forwarded-Proto "";
        proxy_set_header Forwarded "";

        # SSE(/forge/api/platform/projects/:id/events) 스트리밍 유지
        proxy_buffering off;
        proxy_read_timeout 3600s;
    }

    # 4. Hub 정적 사이트 및 /games/* (COOP/COEP 없음, 세션 쿠키 미전송)
    location / {
        root /srv/playhub/hub/dist/user;
        index index.html;
        add_header X-Content-Type-Options nosniff always;
        add_header Referrer-Policy strict-origin-when-cross-origin always;
        try_files $uri $uri/ =404;
    }
}
```

### Caddy 예시

```caddyfile
playhub.example.com {
    @blocked path /internal/* /api/admin*
    respond @blocked 404

    handle /api/* {
        reverse_proxy 127.0.0.1:8090 {
            header_up -X-PlayHub-*
            header_up -X-Forwarded-User
            header_up -X-Forwarded-Email
            header_up -Forwarded
        }
    }

    redir /forge /forge/ 308
    handle_path /forge/* {
        reverse_proxy 127.0.0.1:4177 {
            flush_interval -1
            header_up Host 127.0.0.1:4177
            header_up -X-PlayHub-*
            header_up -X-Forwarded-User
            header_up -X-Forwarded-Email
            header_up -X-Forwarded-Host
            header_up -X-Forwarded-Proto
            header_up -Forwarded
        }
    }

    handle {
        root * /srv/playhub/hub/dist/user
        header {
            X-Content-Type-Options nosniff
            Referrer-Policy strict-origin-when-cross-origin
        }
        file_server
    }
}
```

## 작업 항목

- [x] 로컬 런처: 4173 리다이렉트를 Hub 동일 출처 프록시(`/forge/*` → Forge 포트)로 교체
- [x] Forge 정적 경로를 `/forge/` 접두사 아래에서 동작하도록 base path 정리 (`/OfficialGodot/`, `/Studio/`, `/StudioGodot/`, `/Frontends/`) — 2026-11-25 HTML/JS Studio(`/Studio/`·`/StudioGodot/`)와 Yjs 협업 WebSocket(`/collaboration`) 폐기
- [x] Hub 내부 세션 검증 엔드포인트(`POST /internal/session/verify`, 루프백 전용) 구현
- [x] Forge 쓰기 API·런타임 세션 생성에 Hub 신원 검사 추가, 프로젝트·Studio·빌드·런타임 세션을 계정 키에 귀속
- [x] `forge/PrivateAccount` 및 `/account` 경로를 Hub 계정 화면(`/?view=account`)으로 리다이렉트(별도 게이트웨이는 비활성 레거시로 유지)
- [x] 테스트: 비로그인 차단, 타 계정 프로젝트·빌드·Studio·런타임 접근 차단, 로그아웃 후 Forge 접근 차단, `/forge/*`만 cross-origin isolated인지 확인 ([tests/deployment/hub-forge-integration.test.mjs](../../tests/deployment/hub-forge-integration.test.mjs))
- [x] 공개 배포용 리버스 프록시 설정 예시(경로 분기·헤더 제거) 문서화
