# PlayForge Godot

> 최신 주력 경로: 공식 Godot 기반 통합 Creator 서비스. 빈 맵·예제 선택, 제작 과정 시연(커서/타이핑/속도), 파일 협업, 버전·테스트·배포는 [서비스 현황](Docs/PLATFORM_SERVICE.md)을 기준으로 합니다. 아래 기존 PoC 기록은 비교용으로 보존합니다.

기존 GamePlayForge의 Studio·공동 편집·Tappy Chicken을 **Godot 4.7 + GDScript**로 이어받았습니다.
게임 규칙, 60Hz 게임 루프, 키보드·마우스 입력, SVG 자산 표시가 실제 Godot 프로세스에서 실행됩니다.
Studio의 Canvas는 같은 상태를 보여주는 미러입니다. C++ 빌드나 Lua 확장 설치는 필요하지 않습니다.

## Creator 서비스 시작

`Launch/PlayForge-Web-Official.exe`를 실행하거나 서버를 시작한 뒤 `/OfficialGodot/`를 엽니다. 첫 방문은 빈 3D 맵으로 시작합니다. **내 프로젝트 → 3D Playground**에서 완성본 열기와 제작 과정 보기 중 선택할 수 있습니다. 시연은 속도 조절·일시정지·커서·타이핑을 제공하며 실제 파일을 단계별로 저장합니다.

프로젝트별 협업 파일 동기화, 참여자/활동 표시, 테스트 빌드, 배포 링크, 버전 기록과 복원이 연결되어 있습니다. 공개 클라우드 인증 서비스나 같은 씬의 속성 단위 동시 병합은 후속 범위입니다. 자세한 실행·검증 경계는 [서비스 현황](Docs/PLATFORM_SERVICE.md)을 확인하세요.

## 실행

- **Creator 서비스:** `START_GAMEPLAYFORGE.cmd`를 실행해 공식 Godot 웹 에디터를 엽니다.
- **기존 Tappy Studio:** `npm start` 후 <http://127.0.0.1:4173/Studio/>에 접속합니다. Play를 누르면 Godot 창이 열립니다.
- **바로 플레이:** `npm run play`.
- **Godot 에디터:** `Godot/project.godot`을 열거나 `npm run editor`.
- **조작:** Space / 클릭으로 날기, P 일시정지·재개, R 재시작, Esc 창 닫기.

Godot 4.7 이상과 Node.js 22 이상을 사용합니다. 이 PC에서는 인접 `D:\Github\GoDotProjects`의 Godot 4.7.2를 자동 발견합니다.
다른 환경에서는 `GODOT_BIN`에 Godot 실행 파일의 절대 경로를 지정하거나 `godot`을 PATH에 넣으세요.
Studio 첫 실행은 런처가 `npm ci`를 수행합니다. 단독 Godot 플레이에는 npm 패키지가 필요 없습니다.

Studio의 GDScript 편집은 공동 문서에 저장되며 다음 Play에서 적용됩니다. 단독 실행은 저장소의
`Projects/TappyChicken/Scripts/Game.gd`를 읽습니다. 공동 편집 데이터는 `Saved/GodotWorkspace/`에 따로 저장됩니다.
Studio Stop·브라우저 연결 종료·Godot 창 닫기는 해당 실행 세션을 정리합니다.

## 웹 편집기 경로 선택

브라우저 선택 화면은 `Frontends/` (`http://127.0.0.1:4173/Frontends/`)입니다. 같은 서버에서 세 경로를 비교할 수 있고, 아래 launcher도 각각 별도로 실행할 수 있습니다.

| 경로 | launcher / route | 현재 범위 |
| --- | --- | --- |
| Classic Web | `Launch/PlayForge-Web-Classic.exe` → `/Studio/` | 기존 편집기, Godot-layout Web과 같은 Yjs live document |
| Godot-layout Web | `Launch/PlayForge-Web-Godot.exe` → `/StudioGodot/` | Godot 에디터 배치의 웹 UI, 같은 Yjs live document |
| Official Godot Web Editor + PlayForge plugin | `Launch/PlayForge-Web-Official.exe` → `/OfficialGodot/` | 공식 Web Editor ZIP import 및 service plugin PoC; ZIP import/ready 확인, strict smoke에는 upstream 오류 2건 |

설치·실행: Node.js 22 이상에서 `npm ci`를 실행합니다. Official 경로를 준비하려면 `npm run install:web-editor`를 실행합니다. Godot 4.7.2 경로를 자동 검색하지 못하는 환경은 `GODOT_BIN`으로 지정합니다. Launcher 서버 주소는 기본 localhost이며 필요 시 `PLAYFORGE_SERVER_URL`을 설정합니다.

검증 범위: `npm run test:web-runtime`은 실제 Godot WASM game runtime을 확인합니다. `npm run test:official-editor`는 Official Editor strict smoke이며 현재 thread/TCP 오류로 실패합니다. Native plugin HTTP GET/PUT/stale-409 검증은 브라우저 plugin API 왕복이나 실제 cloud hosting 검증을 뜻하지 않습니다. 세 경로는 PoC 비교를 위해 모두 유지합니다.
## 검증

| 명령 | 실제 검사 범위 |
| --- | --- |
| `npm run build:engine` | Godot 프로젝트 import, GDScript 로드, 설정·난수·pause·snapshot 검사 |
| `npm test` | Godot와 원본 JS 규칙 비교, 런타임 계약·수명, HTTP, 협업, 남아 있는 원본 무결성 |
| `npm run test:visible` | 보이는 OpenGL 창의 실제 입력, 300 step 점수 획득, PNG·CSV 저장 |
| `npm run test:browser` | 보이는 Chrome에서 8개 언어·에셋·GDScript 편집·Godot PIE·두 사용자 공동 편집 |

결과는 `Saved/Tests/` 아래에 저장됩니다. 브라우저 테스트는 4173 포트와 별도 테스트 작업공간을 사용합니다.
원본 폴더에 없던 WebProjects 267개 파일과 그 두 게임의 테스트는 **누락/미검증**으로 보고합니다.
누락된 자료를 테스트 통과로 집계하지 않습니다.

## 실행 범위

GDScript는 **신뢰하는 로컬 프로젝트 코드**이며 파일·네트워크 등 Godot API를 사용할 수 있습니다.
기존 Lua의 메모리·명령 수 제한이나 OS 격리가 적용되지 않습니다. 서버 기본 연결은 localhost입니다.
공유 서버의 GDScript 작성자는 서버 운영 계정 권한을 사용하는 신뢰된 참여자여야 합니다.

현재 코어는 Tappy Chicken 프로젝트 로드, GDScript 실행 계약, 고정 시간 재생, 네이티브 2D 화면, Studio 연동입니다.
Tappy의 독립 Web 빌드 ZIP을 생성합니다. 범용 3D 씬 편집, 게임 멀티플레이, 클라우드 게시·업데이트와 AI 제작 서비스는 후속 범위입니다.
네이티브 창의 음향·최고 점수 영속 저장도 후속 범위이며 Studio의 기존 음향·브라우저 최고 점수 처리는 유지됩니다.

- [Godot 이관·검증 기록](Docs/GODOT_MIGRATION.md)
- [10개 마일스톤 계획](Docs/MILESTONE_PLAN.md)
- [게임 레퍼런스](References/README.md)
- `Engine/`와 `Game.lua`: 이전 C++/Lua 구현 보존본. 현재 실행 경로에서는 사용하지 않습니다.

