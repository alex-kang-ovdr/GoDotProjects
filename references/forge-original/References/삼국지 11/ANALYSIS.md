# 삼국지 11 / 비공식 RTK11 재구성 프로토타입

- **검토일:** 2026-11-17
- **가져온 경로:** `WebProjects/삼국지 11/`
- **버전·플랫폼:** `Playable/Current`는 메타데이터 기준 3.0.0, 한국어 단독 플레이 브라우저 프로토타입입니다. 86×70 헥스 지도, 42개 도시가 정의되어 있습니다. 참고 원작 자료는 PC PK 및 PS2 PK 등이 섞여 있고 서로 차이가 있을 수 있다고 출처 문서가 밝힙니다.
- **통합 상태:** `WebProjects/삼국지 11/Playable/Current/`의 JavaScript 게임은 원본 reference PoC로 유지됩니다. GamePlayForge native runtime에서 실행하거나 Studio 프로젝트로 Lua 이식하지 않았습니다. 향후 standalone C++20/Lua 엔진용 PoC-to-Lua 포팅 후보이며, Unreal Engine 대상이 아닙니다.

## 코드 확인: 구조와 조작

[`Playable/Current/PLAY.html`](../../WebProjects/삼국지%2011/Playable/Current/PLAY.html) 또는 `index.html`에서 실행합니다. 엔진이 상태·명령을 소유하고 `ViewManager`가 Canvas 2D 헥스 지도와 WebGL2 전장을 전환합니다. 두 표현은 같은 엔진 상태를 읽으며 전환 시 턴/상태를 초기화하지 않도록 분리되어 있습니다. 저장은 localStorage와 JSON 입출력을 사용합니다. 선택형 Node 서버는 루프백 주소에 바인딩되는 로컬 정적 서버입니다.

문서상 조작: 화면 버튼 또는 B로 2D/3D 전환, 좌 드래그로 지도 이동, 휠 확대, 3D에서 우/Shift 드래그 및 Q/E 회전, V로 패널 접기, 전역 지도 버튼으로 개요 보기. 부대 공격 버튼을 누른 뒤 적을 선택해 전투를 확인할 수 있습니다. WebGL 실패 시 2D로 계속하는 대체 경로도 기재되어 있습니다.

## 강점과 한계

**분석 — 강점:** 턴제 명령/상태를 렌더러와 분리해 2D·3D 간 이동, 세이브 상태 보존, GPU 실패 시 2D 지속을 지원하는 구조가 돋보입니다. 선택 부대·전술·연출을 뷰 변경 때 보존하는 설계는 지도/전술 게임에 참고할 수 있습니다.

**첨부 문서 기록 — 한계:** 42개 도시명과 일부 공개 출처 표본은 포함되지만 지도 좌표·고도·도로·지형, 훈련 배치, 전투 공식, AI 대부분은 원작 추출물이 아니라 재구성입니다. 현행 플레이어블은 무장 카탈로그 99개, 캠페인 레코드 100개(산적 두목 포함)라고 기록하며 공개 수치 표본은 12명뿐입니다. 수군/관문/항구, 일기토·설전, 전체 역사 이벤트와 특기 조합, 포로/혈연, 군단 위임, 온라인 및 PK 전체 데이터 복원은 빠져 있습니다. 원작 완전 복원본이나 검증된 게임 데이터로 취급할 수 없습니다.

GamePlayForge 적용은 기존 JS를 직접 연결하는 방식이 아니라 Lua 게임 규칙을 별도로 구현하고 native runtime에서 검증하는 계획입니다. 현재는 JS 원본 PoC와 설계 자료를 로컬에 보존한 상태이며 Lua 포팅은 미착수입니다.

## 출처와 권리

다음은 **첨부 문서에 기록된 URL, 이번 작업에서 웹 재확인하지 않음**입니다. 근거와 불확실 항목은 [출처 등록부](../../WebProjects/삼국지%2011/ReverseDesign/SOURCE_REGISTER.md), [데이터 공백](../../WebProjects/삼국지%2011/ReverseDesign/DATA_GAPS.md), [현재판 안내](../../WebProjects/삼국지%2011/Playable/Current/NOTICE.md)를 확인하십시오.

- 42개 도시/특성 안내(2006년 작성으로 등록): https://playgame.wiki/san11pk/gonglue/3761f84322
- 도시 내구/개발지/수입(PS2 with PK 기준으로 등록): https://sangokushi11.shiyo.info/toshi.html
- 무장 능력/특기/적성 팬 위키: https://w.atwiki.jp/sangokushi11/pages/148.html
- 시나리오별 등장 목록(완전하지 않다고 명시): https://kongming.net/11/appearances/
- 내정 시설/효과: https://sangokushi11.shiyo.info/naisei.html

NOTICE는 비공식 프로토타입이며 원작 모델·텍스처·음악·영상·대사·실행 코드·상용 게임 파일을 포함하지 않는다고 밝힙니다. 3D 자산은 프로토타입용 절차 생성이라고 문서화되어 있습니다. 모든 코드/데이터/자산의 재배포 권리를 별도 확인한 것은 아니므로 재사용 전 라이선스·출처를 확인하십시오.

## 기존 검증 기록

`npm test`: **92 통과, 0 실패**. 로그: `Saved/Tests/source-review/rtk11-tests.log`. 엔진·확장·서버·뷰 수학 Node 테스트입니다. 별도의 브라우저 테스트는 이번 실행에 포함하지 않았습니다.
