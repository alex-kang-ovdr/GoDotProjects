# 2026-11-17 WebProjects 통합

수집 목록 5개의 실행 진입점과 `Source/Project/`의 직전 원본을 비교했습니다. 통합판은 `Web/index.html`을 사용하며 PlayHub 언어 스크립트와 게임 ID, 저장 어댑터, 기존 공개 상태를 유지합니다. 갱신한 게임의 원본 버전과 SHA-256은 각 게임 README에서 확인할 수 있습니다.

## 공개 게임

- [League of Legends / Nexus Front](league-of-legends/README.md) `6.1.0`. 원본 7의 여정, 설정, 체크포인트와 지도 변경을 반영했습니다.
- [삼국지 11](samgukji-11/README.md) `1.1.0`. 2D·3D 전환, 시점 제어와 저장 마이그레이션을 반영했습니다.
- [FTL / STARWARD](ftl/README.md) `5.1.0`. Expedition 07의 승무원 전투, 구성 슬롯과 렌더링 모드를 반영했습니다.
- [Clash Royale / Crownfall](clash-royale/README.md) `4.1.0`. 원본 4.4의 레이아웃, 3D 뷰, 대형과 연습 도구를 반영했습니다.
- [탕탕특공대](survivor-io/README.md) `7.1.0`. 원본 13의 특성 선택, 정예 변형과 진행 저장을 반영했습니다.

## 로컬 전용 게임

- [Diablo II / Dark Descent XXIV](diablo-2/README.md) `8.1.0`. XXIV는 별도 네이티브 저장 슬롯을 사용합니다. `Archive/Playable/8.0.0/`에 이전 실행판을 보관했습니다.
- [Dark and Darker / Crypt of the Fallen](dark-and-darker/README.md) `13.1.0`. 신규 등록입니다.
- [First Queen IV / Field Command](first-queen-iv/README.md) `14.1.0`. 신규 등록입니다.

나머지 15종은 기존 실행 내용과 같거나 동일한 게임을 다시 포장한 수집본입니다. RimWorld 수집본은 ES 모듈 진입점으로 바뀌어 파일 실행과 PlayHub 샌드박스에서 작동하는 기존 클래식 번들을 사용했습니다. Besiege, Cosmoteer, RimWorld는 폴더 대소문자를 카탈로그와 맞췄습니다.

## 검증

- 8개 수집 원본의 SHA-256과 실행 진입점을 확인했습니다. 통합 ZIP 8개는 압축 검사를 통과했고 포함 파일이 통합본과 일치했습니다.
- Node 24.22.1에서 Nexus Front 230개, 삼국지 11 92개, STARWARD 225개, Crownfall 190개 테스트를 통과했습니다.
- PlayHub의 카탈로그·업데이트 날짜·저장 연동 집중 테스트 85개가 통과했습니다. Chrome에서 공개 게임 21종의 실행과 영어→힌디어 전환 중 실행 상태 유지, 사용자·관리자 화면의 8개 언어를 확인했습니다.
- 실제 카탈로그를 불러온 Chrome에서 공개 업데이트 5종에 `2026-11-17`이 표시됐습니다. 기존 포터블 실행 경로의 `PlayHub.exe`를 다시 빌드하고, 패키지 검사와 내장 카탈로그의 날짜를 확인했습니다.
- 로컬 전용 게임은 Dark and Darker 55개, First Queen IV 34개, Dark Descent 30개 회귀 검사를 통과했고 Chrome에서 영어→일본어 전환을 확인했습니다.

## 2026-11-18 임시 수동 반영

- 공개 카탈로그 유지: Nexus Front 원본v9 → 통합6.2.0, Crownfall 원본4.5 → 통합4.2.0.
- 기존 비공개 유지: Dark and Darker 원본15 → 통합13.2.0, Dark Descent 원본28.1 → 통합8.2.0.
- 문서만 갱신: ONI 기획r1, Besiege R2, Cosmoteer 데이터복구v2. 기존문서 보존 후 날짜별Revisions에 연결. 게임버전 변화 없음.
- Survivor14는 허브 내 이전13모드의 SDK/저장 공존 검토 때문에 적용 보류. 통합7.1 실행본 유지. 미추적Source/Pending-v14*는 이번 준비 자료이며 실행에 포함하지 않음.
- 공식 sync:webgames 실행으로21개 활성/10개 제외 유지. 보호한 사용자 수정22개 해시 불변. Hub 가져오기/포털/저장/규칙46개 테스트 통과.
- 새 릴리스ZIP4개는 최종 공통 언어사전 생성 후 다시 검증. 생성 전 ZIP도 Archive/BuildSteps에 보존.
- 플랫폼 배포 파이프라인을 사용하거나 외부 서버에 배포한 것이 아님. 실제 브라우저 QA는 별도 기록을 따른다.
- Diablo 기존v24 저장은 새v28로 직접 이관 불가. 이전실행본·슬롯을 유지하며 문서에 명시.
