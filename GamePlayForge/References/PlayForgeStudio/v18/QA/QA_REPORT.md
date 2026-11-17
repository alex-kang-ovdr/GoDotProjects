# PlayForge v18 독립 QA

## 완료된 검사
- Node VM 상태/정적 회귀 12개 통과: mutation Undo/Redo, 프로젝트 전환 Undo/Redo, Scene drag 기록 및 Undo 활성화, pointercancel 원복, 무변경 drag, 정상 속성 경로, 위험 경로 3종 차단, Play/Stop 상태 전환, iframe 재생 조건 및 sandbox.
- 에디터·샘플 인라인 스크립트 2개 및 외부 studio-v18.js 문법 검사 통과.
- 직접 참조하는 외부 스크립트와 샘플 미리보기 파일 존재 확인.

## 검사 중 발견 및 수정 확인
1. 첫 Scene drag 이후 Undo 버튼 disabled가 남는 문제: 구현 담당이 버튼 상태 갱신 추가. 최종 회귀에서 확인.
2. 모달 버튼 포커스에서 기존 W/E/R/Ctrl+D가 배경을 조작하는 문제: dialog[open] 가드 추가 확인. modifier 상태에서 W/E/R도 무시하도록 수정.

## 남은 범위/제약
- Chromium 시작이 socket() Operation not permitted로 차단되어 실제 브라우저 화면, 모바일 레이아웃, dialog focus, 실제 pointer interaction 및 게임 플레이 E2E는 검증하지 못함.
- VM의 DOM/render/save는 stub이다. 테스트 통과는 실제 브라우저 E2E 통과를 뜻하지 않음.
- 미리보기의 Project Data/Lua 실행 연동은 구현되지 않았으며 UI에서 이 제한을 명시한다.
- 전체 render()가 iframe을 다시 만들므로 실행 중 다른 UI 조작(로그/actor 선택 등)에 따른 런타임 재시작 가능성은 남아 있다. 런타임 생명주기 분리는 차기 개선 권장.
- localStorage 기반 로컬 저장이며 협업/서버 권한/AI 모델 호출은 구현 범위가 아님.

검사 재실행: node regression.js /path/to/index.html
