# 통합 게임 실행

`tools/Run_Games.bat` 실행 후 <http://127.0.0.1:22999/>에서 **로컬 / 배포**를 선택합니다. 검색어는 모드를 바꿔도 유지됩니다. `Run_Local_Games.bat`와 `Run_Game.bat`는 이 진입점으로 통합했습니다.

## 저장소를 기준으로 선택

- 로컬과 배포 모두 [같은 등록부](registry.cjs)에서 현재 체크아웃의 `games/catalog.json`, 각 게임의 `game.manifest.json`과 실행 파일을 요청할 때마다 확인합니다.
- **로컬**은 `games/<id>/Web`을 게임별 고정 포트에서 실행합니다. 기본 화면에 원본 브라우저 저장 게임과 SDK 게임 전체를 표시합니다. 비공개 게임도 실행 요건을 만족하면 로컬에서 실행할 수 있습니다.
- 실행본이 없는 자료는 별도 펼침 항목에 표시합니다. 게임 카드 수에는 포함하지 않습니다.
- 게임 manifest의 최초 공개일을 기준으로 한국 시간 14일 동안 `New`를 표시합니다. `New` 기간이 지난 뒤에는 최근 14일 이내의 별도 업데이트를 `Updated`로 표시합니다.
- **배포**는 저장소에 공개된 등록 게임을 표시하고, 실행 버튼으로 설정된 Hub의 `/play/<id>/`로 이동합니다. 실제 공개 상태와 로그인·저장은 접속한 Hub에서 처리합니다.
- 배포 주소는 `PLAYHUB_DEPLOY_CONFIG` → `PLAYHUB_CONFIG` → `hub/config/local.json` 순으로 선택한 설정 파일의 `userBaseUrl`을 읽습니다. 별도 배포 프로필에는 `userBaseUrl`만 있어도 됩니다. HTTP(S) 주소만 허용하며 사용자 정보·쿼리·프래그먼트가 포함된 주소는 거부합니다.
- 현재 체크아웃의 기본 설정은 `http://127.0.0.1:18130/`입니다. 이는 설정된 실행 대상이며 외부 운영 사이트가 게시됐다는 증거는 아닙니다. 주소를 하드코딩하지 않으므로 설정 변경은 다음 요청에 반영됩니다.
- 서버는 이미 실행 중인 것으로 취급합니다. 런처가 Hub를 기동하거나 배포·업로드·프록시 요청을 수행하지 않습니다. 설정 오류와 비공개 게임은 실행 불가로 표시하며 로컬로 자동 대체하지 않습니다.

## 실행과 저장

로컬 게임 화면의 `언어 / Language`에서 지원 언어를 선택할 수 있습니다. 게임을 새로고침하지 않고 적용하며 진행과 저장을 유지합니다. 선택은 이 브라우저에 기억됩니다.

`Run_Games.bat --check`는 파일·카탈로그와 설정된 대상을 확인하고 종료합니다. 서버 도달 여부는 검사하지 않습니다. 로컬 사용이 가능한 경우 배포 설정 미완비는 안내만 합니다. `PLAYHUB_NO_BROWSER=1`은 자동 브라우저 열기를 생략합니다. Node 22 이상이 필요하며 `PLAYHUB_NODE_BIN`, `artifacts/local-runtime/node24/node.exe`, PATH 순으로 선택합니다.

로컬 게임은 게임 ID의 SHA-256으로 정한 기존 고정 포트(24000~53999)를 사용합니다. 포트가 충돌하면 실행 오류를 표시합니다.

- 원본 브라우저 저장 게임은 기존 포트와 게임 자체의 저장 키를 사용하므로 같은 브라우저 프로필에서 기존 기록을 이어갈 수 있습니다.
- SDK 게임은 런처 페이지의 브라우저 저장소에 게임별 `playhub-local-sdk-v1:<게임 ID>` 키를 사용합니다. 로컬 저장과 Hub 계정 저장의 이전·병합 기능은 제공하지 않습니다.
- 브라우저의 사이트 데이터를 삭제하면 해당 사이트에 저장된 로컬 진행도 삭제됩니다.

런처·로컬 게임 서버는 loopback 바인딩, Host 검사, GET/HEAD 제한, Web 하위 허용 확장자, 경로·symlink 차단과 sandbox/CSP를 유지합니다. 배포 게임은 iframe 프록시 대신 서버의 원래 페이지로 이동하므로 서버 인증·CSP를 우회하지 않습니다. 종료는 실행 창에서 `Ctrl+C`입니다.

## 검증

```text
node --test tools/local-games/modes.test.cjs
node --test tools/local-games/test.cjs
node --test tools/local-games/sdk-host.test.cjs
node --test tools/local-games/player-locale.test.cjs
node tools/local-games/catalog-smoke.cjs
node --test tests/deployment/preflight.test.cjs
```

모드 테스트는 임시 설정·카탈로그로 설정 우선순위, 변경 반영, 리다이렉트, 비공개 게임 표시를 확인합니다. 브라우저 테스트는 Chrome과 기존 `forge/node_modules/@playwright/test`를 사용합니다. Hades 시작·이동, Kingdom Rush 시작, 검색어 유지와 테스트 배포 서버 이동을 확인하며, SDK 전용 테스트는 연결과 로컬 저장을 확인합니다.

2026-11-18에 36개 게임의 초기 화면과 게임별 지정 조작을 Chrome에서 확인했습니다. SDK 게임 8개는 로컬 호스트 연결도 확인했습니다. 검사 범위는 초기 실행과 지정 입력이며, 전체 플레이·엔딩과 실제 운영 서버는 별도 검증 대상입니다. 게임별 입력·오류·스크린샷은 `hub/reports/local-runtime-*/`에 있습니다.
