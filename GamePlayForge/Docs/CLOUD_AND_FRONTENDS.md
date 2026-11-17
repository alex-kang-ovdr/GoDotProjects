# 웹 프론트엔드 선택과 공유 서버

갱신일: 2026-11-17. 구현 상태와 local/browser evidence를 구분하며 실제 cloud deployment 완료 보고는 아닙니다.

| 실행 파일 | 웹 경로 | 편집·협업 방식 |
| --- | --- | --- |
| `Launch/PlayForge-Web-Classic.exe` | `/Studio/` | 기존 PlayForge UI, Godot-layout Web과 같은 Yjs live document |
| `Launch/PlayForge-Web-Godot.exe` | `/StudioGodot/` | Godot Editor layout 기반 웹 UI, 같은 controller/shared Yjs document |
| `Launch/PlayForge-Web-Official.exe` | `/OfficialGodot/` → external Godot Web Editor | project ZIP exchange와 PlayForge service EditorPlugin PoC |

세 경로는 모두 POC 비교 대상으로 유지합니다. Official Editor/plugin 경로가 우선 PoC입니다. Godot-layout Web은 native Godot Editor나 browser Godot Web Editor 자체가 아니며, Classic과 같은 live document를 사용합니다. Official Editor의 ZIP/plugin 경로는 별도 진입점입니다.

실행 파일은 local server가 없으면 Node server를 시작하고, 실행 창의 Open으로 브라우저를 엽니다.
직접 시작한 프로세스만 Stop/창 닫기에서 정리합니다. 같은 포트의 기존 Godot server는 재사용하며 종료하지 않습니다.
런처의 로컬 웹 UI PIE는 `PLAYFORGE_HEADLESS=1`로 native Godot process를 창 없이 실행하고 Canvas에 상태를 미러합니다. 이는 브라우저 WASM 실행과 다릅니다. 별도 actual Web runtime은 Godot WASM으로 브라우저에서 실행되며 focused smoke evidence가 있습니다. 별도 네이티브 창 플레이는 `START_PLAYFORGE_GODOT.cmd`입니다.
런처 재생성: `Tools/Launchers/build-launchers.ps1 -SelfTest`. `--smoke-test`는 실제 server start/routes/stop 확인으로 세 launcher에서 통과했습니다.

## 공유 서버 연결

원격 사용자는 `PLAYFORGE_SERVER_URL=https://studio.example.com`을 지정한 뒤 원하는 `.exe`를 실행할 수 있습니다.
이 경우 local Godot/Node server를 만들지 않고 선택한 server의 frontend 경로를 엽니다. 일반 browser URL 접속도 같습니다.

서버 운영 환경:

1. Node.js 22+, Godot 4.7+ 설치 후 `GODOT_BIN` 지정 및 `npm ci`.
2. `Tools/start-cloud-backend.ps1 -PublicOrigin https://실제도메인` 실행. backend는 `127.0.0.1:4173`에 바인딩합니다.
3. TLS·접근 인증을 담당하는 reverse proxy를 앞에 둡니다. `Deploy/Caddyfile.example`은 환경변수로 도메인·사용자·비밀번호 해시를 받습니다.
4. `Saved/GodotWorkspace`를 server의 영속 저장소로 보존하고 백업합니다. 현재 구조는 단일 서버·단일 공유 project입니다.

`PUBLIC_ORIGIN`은 browser가 보는 HTTPS origin과 정확히 일치해야 합니다. HTTP API와 WebSocket upgrade에 같은 검사를 적용합니다.
브라우저는 HTTPS에서 WSS를 선택합니다. 전달된 X-Forwarded-* 헤더로 origin 검사를 우회하지 않습니다.
실제 cloud hosting, SSO/auth identity 연동, Caddy/TLS deployment는 아직 검증되지 않았습니다. 로컬 HTTPS origin 모사 환경에서 HTTP·WS 경계만 확인했습니다.

GDScript 작성자는 server 운영 계정의 권한으로 코드를 실행할 수 있는 신뢰된 참여자여야 합니다.
현재 clientId는 인증된 사용자 역할 ACL에 매핑되지 않습니다. UGC sandbox, multi-tenant isolation, role ACL, distributed storage/replication은 미검증 후속 범위입니다.

## Official Godot Web Editor + PlayForge service plugin

Project archive는 실제 `Launch/PlayForge-Godot-Project.zip` 위치에 둡니다. `/api/export/godot-project.zip`은 다운로드 시점의 shared source/settings revision으로 ZIP을 생성하며 원본 PC의 절대 경로가 필요하지 않습니다. 엔진·node_modules·로그·workspace journal은 포함하지 않습니다. CLI 생성은 `npm run export:godot`입니다.

Official upstream Godot 4.7.2 Web Editor vendor 설치 파일은 hash 검증됐습니다. 프로젝트 ZIP에는 `Godot/addons/playforge_service/plugin.gd` EditorPlugin 코드가 포함되고, local Godot native headless editor import가 통과했습니다. 현재 PlayForge engine core patch는 0이며 upstream fork source build가 완료됐다는 뜻은 아닙니다.

Service API와 plugin 통합 증거 범위:

| Route | 기능 / 구현 상태 |
|---|---|
| `GET /api/project` | 현재 workspace project/source revision 조회 |
| `PUT /api/editor/source` | `baseRevision` 기반 source update; stale revision은 `409 revision_conflict` |
| `POST /api/builds` | 해당 revision의 web build queue 요청 |
| `GET /api/builds/{id}` | build status 조회 |

Official Web Editor browser에서 crossOriginIsolated 상태의 WASM 시작, ZIP Preload import 및 project import 완료, `PLAYFORGE_EDITOR_READY`/`pluginReady:true`를 확인했습니다(`Saved/Tests/web-runtime/official-result.json`, `official-project.png`). 단 `npm run test:official-editor` strict smoke는 upstream `Attempt of waiting to finish on a thread that was never started`와 TCP `ERR_CANT_CREATE` 2 errors로 실패했습니다(`official-browser.log`). 결과를 전체 성공으로 표시하지 않습니다.

## Actual Godot Web game runtime

Web export/build succeeded; result: `Saved/Tests/web-build-result.json`. `npm run test:web-runtime`은 실제 server Web build를 Chrome에서 실행해 Godot WASM load/input/pause freeze/restart를 통과했습니다. Evidence: `Saved/Tests/web-runtime/runtime.json`, `build.json`, `web-game.png`. Official-editor strict smoke는 별도이며 위의 두 errors로 실패 상태입니다.

이는 Tappy 2D focused runtime smoke입니다. full browser matrix, generic 3D project, Web/native visual parity, networked gameplay, 모든 review acceptance cases를 통과했다는 뜻이 아닙니다. Studio UI PIE는 별도로 native Godot execution state의 Canvas mirror를 보여줍니다.

참고: [Godot 공식 웹 에디터 안내](https://docs.godotengine.org/en/stable/tutorials/editor/using_the_web_editor.html), [Caddy WebSocket reverse proxy](https://caddyserver.com/docs/caddyfile/directives/reverse_proxy), [Caddy 인증 설정](https://caddyserver.com/docs/caddyfile/directives/basic_auth).


