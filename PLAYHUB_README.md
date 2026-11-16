# PlayHub 작업본 실행

이 작업본은 `GamePlayHub` 브랜치에서 관리합니다. 이전 `playhub-portable` 워크트리는 이관 당시 변경을 보존합니다.

## 직접 확인

1. [Run_PlayHub_Preview.cmd](Run_PlayHub_Preview.cmd)를 더블클릭합니다.
2. 콘솔의 `READY`를 기다린 뒤 [사용자 화면](http://localhost:18080/)을 엽니다. 첫 실행은 게임 동기화와 페이지 생성에 시간이 필요합니다.
3. [관리자 화면](http://127.0.0.1:18081/)은 기존 설치의 관리자 계정을 사용합니다.
4. 창을 유지하고, 종료할 때 `Ctrl+C`를 누릅니다. 수정분을 확인하려면 다시 실행한 뒤 브라우저를 새로고침합니다.

[Open_PlayHub.cmd](Open_PlayHub.cmd)는 감지된 IP·포트의 클릭 가능한 접속 목록을 엽니다. [Open_PlayHub_LAN.cmd](Open_PlayHub_LAN.cmd)와 [Open_PlayHub_Public.cmd](Open_PlayHub_Public.cmd)는 해당 주소를 바로 엽니다. 이 세 파일은 서버를 시작하지 않습니다. 실제 주소를 담은 HTML·URL 바로가기는 실행 때 `source/reports/local-*`에 생성되며 Git에 포함하지 않습니다.

기존 PlayHub와 같은 설정·계정·저장 데이터를 사용하므로 두 서버를 동시에 실행하지 않습니다. 포트 충돌은 포트·PID와 함께 오류를 표시합니다. 확인된 PlayHub 서버만 강제 종료 `Y/N`을 묻고, `N`이면 기존 서버를 유지한 채 실행을 중단합니다. `Y`일 때도 같은 포트를 다시 사용합니다. 다른 포트로 자동 변경하지 않으며, 소유자를 확인할 수 없는 프로세스는 자동 종료하지 않습니다. 강제 종료할 서버에서 진행 중인 플레이는 먼저 저장하는 것이 좋습니다.

현재 설정의 포트가 바뀌면 콘솔에 표시된 주소를 사용합니다. 공인 IP는 실행 때 조회해 표시하며, 조회 실패가 로컬 실행을 막지 않습니다. 공인 IP 표시는 인터넷 접속 성공을 뜻하지 않습니다. 외부 접속에는 사용자 웹/API 포트의 전달, 방화벽 및 허용 Origin 설정이 별도로 필요합니다. 관리자 웹/API는 루프백에서만 열립니다.

미리보기에는 Node.js 24 이상과 `source`의 `npm ci --ignore-scripts`가 필요합니다. 현재 검증된 Node 24 경로와 시스템 설치를 실행기가 순서대로 확인합니다. 최종 포터블 실행 파일은 Node를 포함합니다.

[Run_PlayHub_Portable.cmd](Run_PlayHub_Portable.cmd)는 이번 작업본에서 생성한 `source/.local-build/PlayHub.exe`를 실행합니다. 이 로컬 빌드 산출물은 Git에서 제외합니다. 저장소의 기존 `WebPlatform/PlayHub_Portable/PlayHub.exe`는 이전 배포 파일이므로 최신 수정 확인에는 위 실행기를 사용합니다. 새 체크아웃에는 로컬 EXE가 없으므로 미리보기 또는 소스의 `portable/build-sea.mjs`로 빌드해야 합니다.

서버 없이 게임만 열려면 [WebGames/index.html](WebGames/index.html)을 사용합니다. 단독 실행은 플랫폼 계정·찜·서버 저장과 별개입니다.

## 게임 구성

- 원본 기준: `WebGames/catalog.json`과 각 게임의 `game.manifest.json`.
- 공통 진입점: `WebGames/<영문-소문자-slug>/Web/index.html`.
- 원본 프로젝트: `Source/Project`, 이전 산출물: `Archive`. 게임별 기존 `References`·`ReverseDesign`도 보존합니다.
- 플랫폼에는 추가 게임 13개를 먼저, 기존 퍼즐 8개를 그다음에 노출합니다.
- IDOL, KSP, D&D, PM2, CoC, Diablo II, Don't Starve, Into the Breach는 플랫폼 카탈로그에서 제외하고 로컬 파일은 보존합니다.
- `source/games`와 `source/catalog/games.json`은 생성 결과입니다. 직접 고치지 말고 `WebGames`에서 수정합니다. 빌드·미리보기·포터블 패키징 전에 자동 동기화됩니다.

## 언어와 진행 상태

한국어, 영어, 일본어, 중국어 간체, 프랑스어, 스페인어, 브라질 포르투갈어, 힌디어를 사용합니다. 명시적인 URL `lang` → 서버의 사용자 설정 → 브라우저에 저장한 설정/브라우저 언어 순으로 적용합니다.

게임 실행 URL에 언어를 전달하고, 실행 중 변경은 해당 iframe의 nonce를 검증한 메시지로 적용합니다. 언어만 바꾸며 iframe·진행 상태·저장 슬롯을 다시 만들지 않습니다. 텍스트·접근성 라벨과 Canvas 글자에도 적용합니다. 변경되는 숫자는 번역 예시의 값으로 덮어쓰지 않습니다.

번역 사전은 `source/shared/locales/`에서 관리합니다. 게임 고유명사와 사전에 아직 등록되지 않은 문구는 원문을 유지합니다. 새 메뉴·상태·이벤트 문구를 추가할 때 모든 지원 언어와 동적 자리표시자를 함께 검증해야 합니다.

찜 목록과 언어 설정은 게스트/계정별로 서버에 저장합니다. 사용자가 게스트 기록 병합에 동의하면 찜을 합치고, 계정에 언어 설정이 없을 때만 게스트 설정을 가져옵니다. 기존 저장 데이터는 유지합니다.

## 검증

집중 테스트와 브라우저 실행 결과는 `WebPlatform/PlayHub_Portable/source/reports/`에서 확인합니다. `local-*` 파일에는 실행 환경별 기록·스크린샷이 있으므로 Git에서 제외합니다. 전체 기존 테스트 모음을 통과했다고 주장하지 않으며, 실행한 검증과 보류 항목은 최종 검증 기록에 구분합니다.
