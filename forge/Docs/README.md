> 현재 실행 구현: [Godot 코어 이관](GODOT_MIGRATION.md), [마일스톤](MILESTONE_PLAN.md). 아래는 원본 자료 수집 당시 기록입니다.

## 현재 Godot PoC 상태

편집 경로는 공식 Godot Web Editor 기반 PlayForge Creator(`/OfficialGodot/` + `/api/platform/*`) 하나입니다. 기존 HTML/JS Studio(Classic Web `/Studio/`, Godot-layout Web `/StudioGodot/`)와 그 Yjs 실시간 협업(`/collaboration` WebSocket, `PUT /api/project`, 설정 잠금)은 2026-11-25에 폐기했습니다.

| 실행 선택 | 실행 파일 / 브라우저 경로 | 현재 범위 |
|---|---|---|
| Official Godot Web Editor | `Launch/PlayForge-Web-Official.exe` → `/OfficialGodot/` | 프로젝트 라이브러리와 Godot 4.7.2 Web Editor, PlayForge service/platform plugin을 한 화면에서 제공 |

### 설치 및 실행

1. `GamePlayForge` 프로젝트 폴더에서 Node.js 22+ 및 Godot 4.7.2를 준비합니다.
2. 첫 실행에 dependencies 안내가 나오면 해당 폴더에서 `npm ci`를 실행합니다.
3. 공식 Web Editor 파일이 아직 없다면 `npm run install:web-editor`를 실행합니다.
4. 브라우저에서 `http://127.0.0.1:4173/OfficialGodot/`를 열거나 `Launch/PlayForge-Web-Official.exe`를 실행합니다. Remote server는 `PLAYFORGE_SERVER_URL`로 설정할 수 있습니다.

### 현재 기능과 경계

- 기존 Classic/Godot-layout 웹 프런트엔드와 Yjs 공유 문서는 2026-11-25에 폐기됐습니다. 이전 작업 공간 파일의 Yjs 필드는 불러올 때 무시하고 다음 저장에서 제거합니다.
- Official Web Editor에서 ZIP project import와 plugin ready marker가 확인됐습니다. Native Godot HTTP test는 plugin의 project GET/source PUT/stale revision 409를 통과했습니다. Browser에서 plugin API 전체 왕복은 아직 확인되지 않았고, full scene/settings/assets live sync는 제공하지 않습니다.
- Web build와 별도 Chrome Godot WASM Tappy smoke(load/input/pause/restart)는 통과했습니다.
- 실제 cloud hosting/SSO는 미검증입니다. Engine core patch는 현재 0이며 upstream Web Editor fork source build가 완료된 것은 아닙니다.

### 최근 검증 결과

아래 수치는 Studio 폐기(2026-11-25) 이전 기록입니다.

- `npm test`: 31 checks 통과. 원본에서 누락된 과거 게임 2개 suite는 실행하지 않고 skip.
- Browser automation: 각 browser 실행에서 6 pass, 2 skip. Skip 2개는 checkout에 없는 과거 게임 fixture입니다.
- `npm run test:web-runtime`: 실제 Godot WASM Web runtime smoke 통과. 결과는 `Saved/Tests/web-runtime/`.
- `npm run test:official-editor`: strict smoke는 실패 상태입니다. Project import/plugin ready는 확인했지만 upstream Web Editor 로그에 thread-never-started 및 TCP `ERR_CANT_CREATE` 두 오류가 있어 clean 성공으로 표시하지 않습니다. `Saved/Tests/web-runtime/official-result.json` 참조.
- Review acceptance `T001–T064`는 별개이며 계속 `not_run`입니다.

상세: [M01–M10 구현 계획](IMPLEMENTATION_PLAN.md), [마일스톤 인덱스](MILESTONE_PLAN.md), [프런트엔드/서비스 상태](CLOUD_AND_FRONTENDS.md), [결정·미검증 추적](REVIEW_DECISIONS.md), [runtime evidence](GODOT_MIGRATION.md).
# PlayForge 산출물 정리 및 리뷰

2026-11-17 수집. **설계 + 웹 편집기 프로토타입 + 정책 검증 샘플** 묶음이며, 상용 서비스 완성본은 아닙니다.

## 먼저 볼 파일
1. `Review/01_Product_Review.md`: 요구사항·정책·구현 상태 리뷰
2. `Review/02_Technical_Review.md`: 코드·테스트 검증과 한계
3. `COLLECTION_NOTES.md`: 수집 범위, 버전 관계, 원본 출처
4. `index.html`: 편집기/예제/자료 바로가기

## 최신 열람 경로
- 편집기: `Current/PlayForge_Cloud_Consolidated_v17/PlayForge_Cloud_Consolidated_v17/01_Editor/PlayForge_Editor_v16/index.html`
- AI 작업 기록·외부 AI·재귀 평가 설계와 정책 게이트 예제: `Current/PlayForge_AI_Workflow_vNext/PlayForge_AI_Workflow_vNext/README.md`
- UGC 영역별 설계: `Current/PlayForge_UGC_Design_v5_9/PlayForge_UGC_Design/INDEX.md`

압축을 모두 해제한 다음 `index.html`을 브라우저로 여세요. 편집기는 JavaScript/Canvas 프런트엔드 프로토타입이며 서버 배포·AI 계정 연결·게임 런타임을 설치하는 과정이 아닙니다.

원본 파일은 수정하지 않았습니다. `Original_Zips`에는 최초 확보한 19개 ZIP을 보관합니다. 제품의 모든 기능이 연동되었다는 뜻은 아니며, 상세 판단은 이번 리뷰를 기준으로 확인하세요.



