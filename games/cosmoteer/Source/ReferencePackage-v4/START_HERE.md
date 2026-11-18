# STARFORGE v4 · 통합 산출물

작성일: 2026-11-18. 기존 Cosmoteer 역기획·데이터 복구 산출물에 실제 실행 가능한 웹 게임 v4를 함께 묶었습니다.

## 바로 실행

- 웹: https://starforge-drydock-887a.taru00.chatgpt.site/
- 오프라인: 압축을 모두 푼 뒤 **game/starforge_v4.html**을 브라우저로 엽니다.
- 개발 소스: **source/dist/index.html**을 엽니다. dist 안의 파일을 함께 유지하세요.

웹 접근 범위는 기존 소유자 비공개입니다. 해당 계정으로 로그인해 접속할 수 있습니다. 오프라인 HTML은 서버·패키지 설치·외부 계정 없이 실행됩니다. 브라우저가 로컬 자동 저장을 제한하면 메뉴의 JSON 내보내기를 사용하세요.

## v4 체험 순서

1. 청사진(B)에서 **FORGE / 생산형**을 적용합니다. 새 원정 자금 850 C에서 543 C에 바꿀 수 있습니다.
2. 생산·기술·정비 보급(U)에서 황 재고와 공장 상태를 확인합니다.
3. 승무원이 원료와 전지를 운반하면 공장이 황 1을 투입해 10초 작업 후 탄약 20을 만듭니다.
4. 물류 보기에서 전지·탄약·황 경로를 살펴보고, 공장을 선택하여 개별 정지·재개할 수 있습니다.
5. 작전에 출격하고 승리 후 황·크레딧을 회수해 원자로와 동선을 개선하세요.

기존 v1~v3 원정도 불러옵니다. 기존 자산은 유지하며 새 황을 자동 지급하지 않습니다. 생산 설비를 추가하고 황을 구매하면 새 시스템을 이용할 수 있습니다.

## 폴더 구성

| 경로 | 내용 |
| --- | --- |
| game/ | CSS·JS를 모두 포함한 오프라인 단일 HTML |
| source/ | 배포한 v4 실행 코드, 테스트, 데이터 어댑터, 시스템 문서 |
| source/docs/systems/ | 화재·기술·저장·데이터·생산·물류별 MD 6개 |
| source/docs/VERIFICATION.md | 자동 검사 80개, 자연 완주, 화면 검증 한계 |
| analysis/Cosmoteer_GameData_Recovery_v1/ | 복구 데이터 전체, JSON·CSV·SQLite·조회 HTML·근거 문서 |
| reverse_design/ | 기존 시스템별 역기획 MD 25개 |
| RELEASE.json | 실제 배포 커밋·배포 상태·검증·해시 |
| MANIFEST.sha256 | 포함 파일의 무결성 검사 목록 |

원작 자료는 공개 문서 기반 복구 스냅샷입니다. v4는 확인된 일부 관계를 게임에 반영했으며, 전체 원작 데이터를 그대로 사용하는 버전이 아닙니다. 모든 부품은 한 칸이며 실드는 전방위입니다. 원작 관측값과 자체 조정값은 source/data/analysis-snapshot.json 및 source/docs/systems/04_analysis_data_adapter.md에서 구분합니다.

## 검증 및 개발

Node.js에서 source 폴더를 작업 디렉터리로 설정한 뒤 다음 명령을 실행합니다.

- node --test tests/*.test.cjs
- node scripts/build-game-data.cjs --check
- node scripts/export-offline.cjs

현재 실행 코드는 명시된 커밋과 바이트 단위로 대조했습니다. 검증용 v4 Canvas 이미지를 포함합니다. 이전 버전의 브라우저 검수 이미지는 제외 목록에 기록했습니다.

미리보기 브라우저의 연결 거부로 신규 웹 UI의 실제 입력·터치·레이아웃 검증은 미완료입니다. 시뮬레이션, HTML 연결, 스크립트 문법, 실제 상태의 Canvas 렌더 출력은 검증했습니다. 배포 API는 성공을 반환했습니다.
