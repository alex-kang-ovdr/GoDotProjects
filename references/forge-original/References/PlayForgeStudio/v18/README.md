# PlayForge Studio v18

기존 v17 통합본의 v16 HTML 편집기를 기반으로 한 프론트엔드 개선판입니다.

## 실행
- `index.html`을 브라우저로 열거나, 이 폴더에서 `python -m http.server 8080` 후 `http://localhost:8080`을 엽니다.
- 서버 없는 로컬 프로토타입입니다. 브라우저 localStorage에 저장되며 계정·클라우드·AI·실시간 협업은 연결되어 있지 않습니다.
- 다른 포트/호스트/브라우저에서는 저장 공간이 다릅니다. JSON Export로 백업하세요. JSON 재가져오기는 아직 지원하지 않습니다.

## 개선 사항
- 다크/라임 스튜디오 UI, 정보 계층·패널 간격·명암 및 상태 안내 개선
- 프로젝트 허브와 액터 수/스크립트 수 안내
- Ctrl/Cmd+K 명령 검색, Enter 실행, Escape 닫기
- 모바일/좁은 화면 계층·편집·속성·로그 탭
- Ctrl/Cmd+Z / Shift+Z Undo·Redo, Ctrl/Cmd+Enter Play·Stop, Ctrl/Cmd+S JSON 백업
- W/E/R 이동·회전·스케일; F 선택 액터 프레이밍; 1~6 주요 편집 탭
- 입력 필드와 모달 안에서 편집용 단축키 충돌 방지
- 프로젝트 전환 이후 Undo/Redo, Scene 드래그 Undo 기록 형식 수정
- 드래그 취소 시 원래 상태 복원
- Stop은 미리보기 iframe을 제거하고 Scene으로 돌아감
- 실행 iframe sandbox 적용; Tappy 데모 메시지는 부모 프레임만 수신
- setAt 특수 속성 경로 차단
- 삭제 확인과 Undo 복구; 프로젝트 내보내기 버전 18

## 범위 / 미구현
- Scene은 Canvas 기반 투영 뷰이며 실제 3D 엔진이 아닙니다.
- Lua는 소스 편집용입니다. 실행 미리보기는 별도 JS Tappy Chicken 데모이며 Scene/Project Data/Lua 편집이 게임에 자동 반영되지 않습니다.
- AI Changes와 Shared Library는 목업/예시입니다.
- 백엔드·인증·멀티유저 협업 및 Unity MCP 성능 비교는 이번 변경에 포함하지 않았습니다.
- 원본 ZIP 및 원본 파일은 수정하지 않았습니다.

## 검증
정적 JavaScript 문법 검사 및 독립 QA 결과는 QA 문서를 참고하세요. 클라우드 Chromium 실행 환경 제한으로 실제 브라우저 시각/E2E 검증을 완료하지 못했습니다.

### 알려진 잔여 제한
- Play 실행 중 로그 탭/Actor 선택 등 전체 UI를 다시 렌더링하는 조작은 iframe을 재생성해 게임을 재시작할 수 있습니다. 편집을 마친 후 Play하여 테스트하고, 장시간 실행 중에는 에디터 패널 조작을 피하세요.
- Node VM/정적 회귀 검사 12개가 통과했습니다. 상세 내용과 재현 스크립트는 `QA/`에 있습니다.
