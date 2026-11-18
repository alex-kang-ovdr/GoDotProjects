# 12. 기존 분석 정정·공개 자료 충돌·미결 질문

> R2 조사 기준: 2026-11-18. 이 문서의 목적은 원작의 확정 사실, 현재 웹 게임의 실제 동작, 다음 구현의 선택을 서로 구분하는 것이다. 충돌을 해소하기 위해 원문에 없는 수치를 보간하지 않는다.

## 1. 이전 산출물에서 이어받는 것과 다시 판단하는 것

`baseline_2026-11-13/`의 22개 문서는 이전 역기획의 원본 보관본이다. 이번 문헌 대조 결과를 그 파일에 소급해서 덮어쓰지 않았다. 최신 판단은 본 패키지의 `docs/01`부터 `docs/12`, 각 데이터의 출처·버전 필드를 따른다. 역사 자료의 숫자나 단정적인 문구가 R2와 다를 때는 R2의 근거 등급과 미결 상태를 우선한다.

부품 이름과 제작 사례는 탐색용 단서로 재사용할 수 있다. 하지만 이전 문서에 등장했다는 사실만으로 원작의 내부 수치·전체 팔레트·저장 형식이 검증되는 것은 아니다. 조사 카탈로그의 8개 재검증 대기 항목은 이를 명시적으로 남긴 결과다. [카탈로그 판정](02_ORIGINAL_PARTS_AND_PARAMETERS.md), [근거 정책](01_EVIDENCE_AND_VERSION_POLICY.md)

## 2. 바로 정정해야 할 해석

| 종전 해석 또는 혼동 위험 | R2에서의 처리 | 개발에 미치는 영향 |
|---|---|---|
| Starting Block은 반드시 하나이고 이동·삭제할 수 없는 코어다 | V1.75는 여러 Starting Block 중 최소 하나가 남는 삭제와 부분 저장/추가 로드를 설명한다. 파괴 후 실패·분리 후 제어권은 추가 계측 대상 | IRONWOOD의 단일 코어 규칙은 제품 정책으로 남기고 원작 고유 규칙이라고 부르지 않는다 |
| Propeller라는 이름이면 W/S로 직접 추력을 만든다 | 현재 웹 구현에서만 확인된 통합 추진기다. 원작 Propeller의 수동 공력 해석은 대조 실험 전까지 가설 | 기존 `propeller`를 수동 블레이드로 치환하지 않는다. 새 타입과 호환 프로필을 분리한다 |
| `assist=false`면 기체에 직접 보조 토크가 없다 | V4 코드에는 이 상태에도 코어 목표 각속도·감쇠 토크 경로가 있다 | `legacy_assisted`, 실제 장치 명령을 조절하는 `assisted`, 직접 장치 입력인 `physical`을 별도 계약으로 둔다 |
| 물이 있는 임무이면 추진기는 물속 추진기로 처리해도 된다 | V4의 80/55 N 분기는 임무의 수면 존재를 본다. 실제 부품의 잠김 상태와 다르다 | 추진기 위치별 공기/물 분율, 국소 유속, 힘 작용점을 계산한다 |
| 보강 블록 하나가 원작 Brace의 끝점 연결 UX와 같다 | V4 `brace`는 격자에 놓는 강한 구조 블록이다 | 두 끝점 선택·취소·부착면 미리보기·가동부 우회 진단을 별도 구현한다 |
| 연결 하중 하나를 N으로 표시하면 된다 | V4의 파손 지표에는 선형·회전 방정식 값과 경험적 배율이 섞인다 | 힘 N, 토크 N·m, impulse N·s, 정규화 위험도를 구분한다 |
| 침수 실패는 내부 물 유입 모델이다 | V4는 코어 깊이와 시간에 따른 실패 규칙이다. 원작 공개 설명으로 밀폐 선체의 유입량 모델도 확인하지 못했다 | 객체 부력·방향 저항부터 구현하고 밀폐 효과는 독립 가설로 계측한다 |
| 최대 출력 3은 3 N 또는 탄속 3배다 | 공식 V1.77의 Cannon·Water Cannon 설정 상한은 UI 배율 기록이다 | 표시값과 실제 힘/탄속 변환 곡선을 따로 측정한다 |
| 외부 연구 JSON의 `18_1`은 원작 블록 ID다 | 연구 도구의 수축 피스톤 변형 키다 | 내부 ID, 연구용 키, 자체 카탈로그 ID를 분리한다 |
| V1.9는 V1.75보다 이전 버전이다 | Besiege 버전 문자열은 SemVer가 아니다. V1.9의 공식 발표는 V1.75 이후다 | 발표일·검증된 changeset 기반 `release_order`로 비교한다 |

공식 발표·연구 자료: [V1.75](https://store.steampowered.com/news/posts/?appgroupname=Besiege&appids=346010&enddate=1772123201&feed=steam_community_announcements), [V1.77](https://store.steampowered.com/news/posts/?appgroupname=Besiege&appids=346010&enddate=1778853723&feed=steam_community_announcements), [The Broken Beyond 상점](https://store.steampowered.com/app/3639470/Besiege_The_Broken_Beyond/), [연구 도구의 기하 자료](https://huggingface.co/spaces/Godheritage/BesiegeField-MachineGenerator/blob/main/Besiege_blocks_markov.json).

현재 구현 판단의 근거는 [V4 코드 감사](06_IRONWOOD_GAP_ANALYSIS.md)와 [소스 해시가 포함된 스냅샷](../data/ironwood_v4_snapshot.json)이다. 80/55 N, 120 N, HP, 격자 크기 등 이 구현의 값은 Besiege에서 추출한 값이 아니다.

## 3. 미결 그룹 다섯 개

기계 판독 원장은 [conflicts.json](../data/conflicts.json)이다. 모두 `adopted_current_value: null`, `blocks_runtime_auto_import: true`이다. 여기서 ‘충돌’은 서로 모순되는 문장뿐 아니라 비교 대상·발표 시점·ID 범위가 다른 경우도 포함한다.

### 3.1 Rope 질량: 개별 부품과 결합체의 범위

V1.20 자료에는 신규 기체의 Rope 질량이 `1 → 0.4`로 바뀌었다는 기록과 이후 Rope+Winch 질량 `0.5` 기록이 있다. 숫자만 비교해 평균을 내거나 최신 숫자를 모든 Rope에 적용할 수 없다. 대상이 Rope 단독인지 결합체인지, 신규 저장인지 구형 저장인지 확인해야 한다. `game_mass_unit`을 kg으로 바꾸지 않는다. [PAR-037/038, CAT-002](../data/original_parameters.json), [공식 원문](https://store.steampowered.com/news/posts/?appids=346010&enddate=1705946583&feed=steam_community_announcements)

해결 절차는 같은 빌드에서 새 Rope, 구형 Rope, Winch 포함 결합체를 따로 만드는 것이다. 원본·설정 변경본·다시 저장한 파일과 질량 관측을 묶고, 동일 변수의 값임을 확인한 뒤에만 적용 프로필을 만든다.

### 3.2 연료통 질량: 출시 전 설명 사이의 불일치

2026-06-05 소개는 Large Fuel Barrel의 연료·질량이 Small의 10배라고 설명한다. 2026-06-12 소개는 같은 총 연료를 가진 Small 열 개보다 Large 하나가 가벼운 이점이 있다고 설명한다. 연료량 10/100이라는 소개 기록과 질량비 충돌은 별도로 보존한다. 출시 이후 건조 질량·충전 질량을 확인하지 않았으므로 어느 질량비도 현행값으로 선택하지 않는다. [PAR-048/049/050](../data/original_parameters.json), [두 개발 글을 포함한 공식 피드](https://store.steampowered.com/oldnews/?appgroupname=Besiege&appids=346010&enddate=1793516400&feed=steam_community_announcements&headlines=0)

필요한 실험은 빈 상태와 같은 연료량의 상태에서 각각 비교하는 것이다. `dry_mass`, `fuel_amount`, `fuel_unit_mass`를 구분해야 연료 소모에 따른 질량 변화도 설명할 수 있다. 공개 기록의 `fuel_game_unit`을 L로 재명명하지 않는다.

### 3.3 Multiverse 이전 크기: 같은 글의 상이한 표기

V1.91의 서술 본문은 이전 범위를 `2×2×2 km`로, 변경 목록은 `4×1.5×4 km`로 적는다. 새 범위 `16×8×16 km`와 이전 범위의 불일치를 분리한다. 어느 기준으로 얼마나 커졌는지 배율을 단정하지 않는다. [SRC-004 공식 V1.91](https://store.steampowered.com/oldnews/?appgroupname=Besiege&appids=346010&enddate=1793516400&feed=steam_community_announcements&headlines=0)

### 3.4 우주 콘텐츠 수: 상점 소개와 후속 추가의 시점 차이

상점은 11개 레벨·13개 새 블록으로 소개한다. 후속 V1.91은 Fuel Pump와 Shattered Citadel/Zone 79 추가를 공지한다. 이는 반드시 상호 모순은 아니며 기준 범위가 다를 수 있다. 현재 설치판의 이름별 목록을 대조하지 않고 `11+1`, `13+1`을 전수 결과로 발표하지 않는다. 연구 카탈로그의 우주 관련 14행도 전체 팔레트를 검증한 숫자는 아니다. [상점](https://store.steampowered.com/app/3639470/Besiege_The_Broken_Beyond/), [V1.91](https://store.steampowered.com/oldnews/?appgroupname=Besiege&appids=346010&enddate=1793516400&feed=steam_community_announcements&headlines=0)

### 3.5 외부 기하 키: 연구용 자료와 게임 파일의 구별

BesiegeField에 연결된 자료의 `bbox_size`는 생성·배치용 근사 상자다. 이것이 실제 collider, attachment port, 원작 기본 단위 또는 내부 ID를 보장하지 않는다. `source_type_key`를 보존하되 `original_block_id`는 `null`로 둔다. 측정 장치를 준비하는 후보로만 사용한다. [기하 후보](../data/public_geometry_candidates.json), [활용 범위](11_PUBLIC_DATA_AND_RECOVERY_WORKFLOW.md)

## 4. 저장 적용 범위의 보수적 정리

공식 공지가 어떤 기능을 소개했다고 해서 새 저장과 구형 저장에서 모두 동일하다고 검증된 것은 아니다. 이번 최종 대조에서는 PAR-014, PAR-030/031, PAR-061~066, PAR-070/071, PAR-076/079의 `save_scope`를 `unknown`으로 두었다. 기능의 문헌 근거는 유지하면서 저장 호환성에 대한 추정을 제거했다.

V1.26의 바퀴 충돌체 변경, 구형 바퀴 구성 보존, 가감속 변경은 각각의 공지 항목이다. 가감속까지 과거 동작으로 보존되는지는 별도 시험한다. V1.75 Surface 공력 기본값 역시 기존 명시 설정과 새로 배치한 부품의 기본값을 구분한다. [카탈로그의 버전 경계](02_ORIGINAL_PARTS_AND_PARAMETERS.md)

## 5. 미결 질문과 해소 순서

| 우선 질문 | 이유 | 연결 실험/문서 |
|---|---|---|
| 붙을 수 있는 위치·방향·부위는 어디인가 | 조립 UX와 물리 그래프의 공통 기반 | EXP-001~005, 문서03 |
| 떨어진 부품은 입력을 계속 받는가 | 구조 연결과 제어권을 분리하는 근거 | EXP-006, 문서03 |
| 모터·피스톤의 힘 제한과 중립 상태는 무엇인가 | 위치 강제 이동과 유한 구동력의 구분 | EXP-008~017, 문서03 |
| Propeller가 정지 상태에서 입력만으로 힘을 내는가 | 능동 추진기와 수동 공력면의 타입 분리 | EXP-020/021, 문서04 |
| 물의 영향은 어느 부품의 어느 위치에서 발생하는가 | 국소 잠김·부력중심·항력 복원 | EXP-023~028, 문서04 |
| 발사체·폭발·연료는 어떤 상태 전이를 가지는가 | 부품별 상태와 자원 그래프의 요구 | EXP-029~035, 문서05 |
| 시간배율·pause·재개 때 입력 edge는 언제 소비되는가 | 재현 가능한 자동화와 보고서 | 문서05/07/09 |

실험 번호의 질문·통제·측정량은 [experiments.json](../data/experiments.json)이 원본이다. 총 40개는 모두 `not_run`이며 결과는 `null`이다. 기획에 계측 절차가 존재한다는 것과 실제 검증 완료는 다른 상태다.

## 6. 채택 승인 규칙

원작 레코드의 현행값을 채우려면 설치판 식별, 대응 부품 식별, 신규/구형 저장 구분, 단위, 원본 기록, 반복 관측과 오차 범위를 함께 남긴다. 이후에도 문헌의 과거 값을 지우지 않는다. `observed_value`와 `runtime_tuning`은 별도 값이다.

기획 작업의 완료 조건은 근거 분리, 의존 관계, 데이터 계약, 수용 기준을 갖추는 것이다. 게임 구현의 완료 조건은 이 기획을 실제 코드에 반영하고 브라우저에서 제작·실행·실패·수정 루프를 확인하는 것이다. 이번 패키지는 전자를 완료하는 R2이며, 후자의 TASK 상태를 `planned`로 유지한다.
