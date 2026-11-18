# 로컬 게임 목록

`tools/Run_Local_Games.bat` 실행 후 http://127.0.0.1:22999/ 접속. Node 내장 모듈만 사용. 기존 Run_Hub 및 Hub 소스/설정/DB는 변경하지 않는다.

- 전체 catalog + 미등록 게임 폴더 + 미확보 산출물 목록. enabled:false도 표시한다. 공개 설정을 바꾸지 않는다.
- 원본 Web만 서빙. Hub 인증/CSP를 우회하는 프록시나 온라인 제출 기능이 아니다.
- 게임별 SHA-256 ID 기반 고정 포트(24000~53999). 충돌·포트 점유는 실패 명시, 다른 포트로 우회하지 않는다. 포트 알고리즘 변경은 저장소 이전이므로 함부로 바꾸지 않는다.
- 게임마다 별도 origin. iframe sandbox는 스크립트·해당 origin 저장소만 허용하며 부모와 origin이 다르다. 원본의 같은 localStorage 키가 다른 게임에 노출되지 않는다. 기존 Hub/파일 실행 저장은 자동 이전하지 않는다.
- Native SDK 게임은 호스트 브리지 미검증으로 차단하고 목록에 이유를 남긴다. 손상된 저장을 자동 삭제하지 않는다.
- localhost 고정 바인딩, Host 확인, GET/HEAD, Web 하위 허용 확장자만 제공. Source/Archive/비밀 경로·dotfile·traversal·symlink 차단. game CSP는 self 정적 데이터만 허용하여 외부 API/다른 포트 접근을 제한한다.
- 안전성/전체 플레이 인증이 아니다. 실제 모바일·전체 게임 진행·저장손상 복구는 미검증. 브라우저 저장 거부 시 일부 원본 초기화가 실패할 수 있다.
- 서버·별도 게임 프로세스 종료는 Ctrl+C. 이 런처를 터널/역방향 프록시로 공개하지 않는다.

## 검증 및 보안 경계

`node --test tools/local-games/test.cjs` 실행. 브라우저 검증은 기존 forge/node_modules/@playwright/test와 Chrome을 사용하며 신규 설치는 하지 않는다. 게임 원본 코드의 inline/eval 실행을 위해 이 독립 오프라인 런타임에만 unsafe-inline/unsafe-eval CSP를 사용한다. 기존 Hub 인증·CSP 설정은 변경하지 않는다. Web 외 경로, Windows ADS/colon, 제어문자, 이중 인코딩 및 링크 경로를 차단한다.

2026-11-18 검증: 전체39카드(게임36+미확보 실행2+문서1), 실행 버튼28, SDK 호스트 미제공 차단8, 미확보 실행2, 문서 안내1. Hades 실제 시작·이동 및 Kingdom Rush 전투 시작, 동일 localStorage 키의 게임별 분리와 reload 유지, HTTP Host/POST/traversal/ADS/이중인코딩/symlink 및 포트점유 차단 통과. 임시 smoke 서버는 테스트 종료 후 닫는다. 전체 게임·실제 모바일·브라우저 데이터 삭제 후 복구는 검증하지 않았다.
