# 07. 계정 성장·재화·게임 모드·라이브 운영

## 1. 범위와 복원 원칙

**조회일 2026-11-17 / 공개 패치 검토 기준 26.22 / Data Dragon 16.22.1.** 경기 안에서 얻는 골드·경험치, 계정 성장, 챔피언 숙련도, 패스 진행, 랭크는 수명과 목적이 다르다. 원작 분석을 고도화하려면 이를 하나의 점수나 저장 파일 안의 level 필드로 합치지 않아야 한다.

이 문서는 공식 지원·개발자·패치 자료에서 확인한 외부 동작을 정리하고, 이를 구현 가능한 계약으로 바꾸는 **복원 설계**를 제시한다. 실제 결제 서버, 보상 원장, 확률 추첨 코드, 실시간 운영 관리자 도구를 복원한 결과가 아니다.

각 사실의 최신성은 출처 단위로 관리한다. 예를 들어 과거 숙련도 설명의 BXP 미션 보상과 현재 이벤트 미션 표는 다른 시점·범위의 규칙이다. 계정 성장 설명에 등장하는 예시 XP를 공식 계산식으로 변환하지 않는다.

## 2. 경기 성장과 계정 성장의 경계

| 도메인 | 수명·식별 범위 | 쓰임 | 다른 도메인과의 관계 |
|---|---|---|---|
| 경기 골드 | matchId + participantId | 경기 아이템 구매 | 계정 RP·BE로 자동 환전하지 않음 |
| 경기 경험치 | matchId + participantId | 챔피언 레벨·스킬 성장 | 계정 레벨 XP와 독립 |
| 역할 퀘스트 | matchId + participantId + role | 경기 중 역할 보상 | 경기 시작 시 재초기화 |
| 계정 XP·레벨 | accountId | 계정 성장·모드 자격 | 보상 정책에 따른 경기 정산 결과 |
| 챔피언 숙련도 MP·레벨 | accountId + championId | 챔피언별 장기 성장 | 매치 성과와 모드 자격을 사용 |
| 시즌 숙련도 마일스톤 | accountId + championId + seasonId | 기간별 숙련도 과제 | 영구 숙련도 레벨과 리셋 범위 다름 |
| BXP·패스 레벨 | accountId + eventId | 특정 패스 진행 | 계정 XP와 다른 수치·기간 |
| 랭크·LP | accountId + queueId + rankedPeriodId | 경쟁 성장 | 경기 골드·숙련도와 직접 합산하지 않음 |
| RP·BE 등 재화 | accountId + currencyId | 콘텐츠 구매·제작 등 | 타입이 다른 별도 잔액 |
| 모드별 명성·과제 | accountId + modeProfileId + eventId | 모드 전용 진행 | 같은 표시 이름이어도 장부를 분리 |

이는 복원용 도메인 경계다. 실제 데이터베이스 테이블과 필드 이름을 확인했다는 뜻이 아니다.

플레이어가 보는 성장 흐름은 “한 경기 수행 → 경기 종료 → 유효한 결과 검증 → 도메인별 진행 계산 → 계정에 반영 → 화면에 영수증 표시”로 정리할 수 있다. 여러 진행 시스템이 동시에 보상을 주더라도 하나의 레벨이 다른 레벨로 변환되는 것은 아니다.

## 3. 계정 XP·모드 해금·콘텐츠 권한

### 3.1 공식 자료에서 확인한 범위

보상 안내는 계정 XP, 파랑 정수(BE), RP를 서로 다른 획득·소비 체계로 설명하며 계정 레벨 상한을 두지 않는다고 안내한다. 커스텀 경기는 계정 XP를 주지 않으며 XP에는 경기 길이 등 자격 조건이 있다.[VM14]

같은 문서의 “30분 승리 약 204 XP, 패배 약 167 XP”는 **예시**다. 이를 모든 경기 시간에 선형 적용하는 XP 공식으로 사용하지 않는다. 실제 정산에 필요한 모드 배율, 부스트, 비정상 경기, 이벤트 예외와 반올림 규칙은 별도 검증 항목이다.

모드 해금 지원 문서는 Swiftplay·ARAM 레벨 3, 연습 도구 레벨 9, 일반 드래프트 레벨 10을 안내한다. 랭크는 계정 레벨 외에도 챔피언 보유와 사전 플레이 조건이 있다.[VM10] 상세 랭크 조건은 [챔피언 선택·매칭](06_draft_roles_matchmaking.md)을 참조한다.

### 3.2 소유권·사용권·선택 가능성 — 복원 구현안

**영구 소유**, **임시 사용 권한**, **현재 모드에서의 선택 가능성**을 별개로 둔다. 무료 체험·대여·이벤트·모드 전용 해금이 존재하는 경우 챔피언 소유 개수와 같은 것으로 취급하지 않는다. 무료 사용권이 랭크의 보유 개수 요건에 포함되는지는 해당 공식 자격 정책을 확인한 뒤 명시해야 한다.

~~~ts
interface Entitlement {
  accountId: string;
  contentId: string;
  contentNamespace: string;
  kind: "permanent" | "temporary" | "modeGrant" | "trial";
  startsAt: string;
  expiresAt: string | null;
  sourceTransactionId: string;
}

interface EligibilityDecision {
  accountId: string;
  queueProfileId: string;
  eligible: boolean;
  reasonCodes: string[];
  accountRevision: number;
  entitlementRevision: number;
  policyVersion: string;
  evaluatedAt: string;
}
~~~

콘텐츠 ID만으로 모드 호환을 판단하지 않는다. 현대 소환사의 협곡 챔피언, Classic의 옛 버전 챔피언, 외관 콘텐츠는 서로 다른 네임스페이스·규칙 집합을 가질 수 있다. 화면상 이름이 같아도 전투 능력 데이터까지 공유한다고 추론하지 않는다.

## 4. 챔피언 숙련도와 성과 평가

**공식 확인:** 숙련도 레벨은 시즌·연도를 넘어 유지되지만 시즌 마일스톤은 초기화된다. 숙련도 점수와 마크는 별도 진행 요건이며, 아직 보유하지 않은 챔피언도 숙련도 진행이 가능하다고 안내한다.[VM15]

성적 등급은 챔피언·포지션·지역에서의 상대적 성과를 고려하는 방식으로 설명된다.[VM15] 따라서 KDA 하나로 S등급을 주는 표를 만들어 원작 공식이라고 제시할 수 없다. 공개 문서가 특정 수치의 가중치, 백분위 경계, 이상치 처리, 모드별 보정을 제공하지 않으면 unknown으로 남긴다.

### 4.1 영구 진행과 기간 진행

~~~ts
interface ChampionMastery {
  accountId: string;
  championId: string;
  level: number;
  masteryPoints: number;
  masteryMarks: number;
  revision: number;
}

interface MasterySeasonProgress {
  accountId: string;
  championId: string;
  masterySeasonId: string;
  milestoneIndex: number;
  qualifyingGradeEvents: string[];
  rewardedMilestoneIds: string[];
  rulesManifestId: string;
}
~~~

새 시즌 시작 시 기간 진행만 리셋한다. 영구 레벨·점수는 유지 정책에 따라 보존한다. 이벤트 목표가 “마일스톤 달성”을 요구한다면 숙련도 서비스가 발행한 고유 사건을 소비하고, 경기 결과를 다시 계산하여 같은 마일스톤을 두 번 세지 않는다.

### 4.2 숙련도와 패스의 결합

숙련도 안내의 일반 미션 표와 Worlds 2026 이벤트의 미션 표는 서로 다른 보상 값을 담고 있다.[VM15][VM16] 현재 이벤트에서는 해당 eventId와 적용 기간을 가진 목표 정의를 사용해야 한다. 공식 페이지 두 곳의 숫자가 다르다고 무조건 하나를 삭제하거나 두 보상을 모두 주면 안 된다.

미션 정의는 조건과 보상을 분리한다. “숙련도 마일스톤 IV 달성” 조건이 재사용되더라도, 기간당 한 번인지, 어떤 패스에 반영하는지, 지급 BXP가 얼마인지가 다를 수 있다.

## 5. 재화·상점·보상 원장 — 복원 구현안

RP, BE, 주황 정수, 신화 정수 등은 서로 다른 재화 식별자를 갖는다. 각 재화의 모든 현재 획득처·가격·환불 가능성·지역별 결제 정책을 이번 정적 데이터에서 완전히 복구한 것은 아니다. 명칭을 목록에 넣는 것과 실시간 경제를 복원하는 것은 다르다.

### 5.1 원장과 지급 영수증

~~~ts
interface LedgerEntry {
  transactionId: string;
  accountId: string;
  assetType: "currency" | "content" | "progress";
  assetId: string;
  delta: number;
  sourceType: "match" | "mission" | "purchase" | "grant" | "compensation";
  sourceId: string;
  policyVersion: string;
  createdAt: string;
  reversesTransactionId: string | null;
}

interface RewardReceipt {
  rewardTransactionId: string;
  accountId: string;
  sourceEventId: string;
  rewardDefinitionId: string;
  entries: LedgerEntry[];
  status: "pending" | "committed" | "failed" | "reversed";
}
~~~

보상은 잔액을 직접 덮어쓰는 작업보다 사건·원장·영수증으로 관리하는 것이 복구와 검증에 유리하다. 같은 경기 결과를 재전송해도 동일 sourceEventId로 중복 지급을 막는다. 취소·환불·운영 보상은 원본 이력을 지우지 않고 별도 역분개 또는 보정 거래로 연결한다.

미확인 수치에는 0을 넣지 않는다. 무료라는 뜻의 0과 아직 가격을 모른다는 뜻의 null을 분리한다. 상품 가격, 지급 수량, 지급 확률, 재구매 제한, 기간 종료 시 처리는 각각 다른 필드다.

### 5.2 결제·콘텐츠 적용의 상태 전이

| 상태 | 핵심 데이터 | 다음 상태 조건 |
|---|---|---|
| 제안 확인 | 상품·지역·재화·가격·유효기간 버전 | 사용자가 해당 제안을 선택 |
| 구매 검증 | 잔액·보유권·중복 제한·요청 ID | 구매 정책 충족 |
| 원장 확정 | 차감·지급의 원자적 거래 | 거래 성공 |
| 콘텐츠 반영 | 소유권 또는 진행 상태 갱신 | 동일 거래 ID로 한 번만 적용 |
| 영수증 제공 | 결과·갱신된 계정 버전 | 클라이언트 재요청에도 동일 결과 |
| 오류·보정 | 실패 단계·원본 거래 참조 | 재시도 또는 보정 거래 |

이 상태 전이는 자체 서비스 구현안이다. 실제 유료 결제나 외부 계정 변경은 수행하지 않았다.

## 6. 현재 이벤트를 하나의 버전 데이터로 보관하는 예

**Worlds 2026, Season 3 Act II** 공식 안내의 일부를 예시로 사용한다. 패스에는 무료·유료 보상이 구분되며, 48개 기본 마일스톤과 추가 반복 구간, 마일스톤당 500 BXP가 안내되어 있다. 기본 패스·번들·상위 번들의 표시 가격은 각각 1,650·2,650·3,650 RP다.[VM16]

이 숫자는 해당 이벤트의 조회 시점 자료이며 모든 패스의 영구 공통값이 아니다. 상세 보상 전체 목록은 원문에서 확인하도록 하고, 본 문서는 시스템 계약을 중심으로 분석한다.

| 시점 | 공식 원문 시간 | KST 변환 |
|---|---|---|
| 시작 | 2026-10-07 11:00 PT | 2026-10-08 03:00 KST |
| 진행 종료 | 2027-01-05 23:59 PT | 2027-01-06 16:59 KST |
| 패스 비활성화 | 2027-01-06 23:59 PT | 2027-01-07 16:59 KST |

시간 원문은 [VM16], KST는 America/Los_Angeles의 해당 날짜 일광절약시간을 반영한 계산값이다. 시작·진행 종료·구매/수령 가능 기간을 한 날짜로 합치면 경계에서 오류가 난다. 미래 종료 시점은 발표된 일정이며 실제 운영 종료가 이미 관측됐다는 뜻이 아니다.

~~~ts
interface EventManifest {
  eventId: string;
  manifestVersion: string;
  sourceUrl: string;
  observedAt: string;
  startsAtUtc: string;
  progressEndsAtUtc: string;
  deactivatesAtUtc: string;
  sourceTimezone: string;
  eligibleQueueProfiles: string[];
  freeTrackId: string;
  paidTrackId: string | null;
  objectiveSetId: string;
  lateResultPolicyId: string | null;
}
~~~

**복원 구현안:** 경기 시작 전후 어느 시각을 이벤트 자격 기준으로 사용할지 명시한다. 종료 직전 시작해 종료 후 끝난 경기, 정산 지연, 임무 변경 중 재접속, 마지막 날 패스 구매와 보상 수령 경쟁을 처리할 별도 정책이 필요하다. 공식 안내가 이를 모두 제공하지 않으면 추론 정책으로 남긴다.

## 7. 게임 모드 카탈로그는 고정 목록이 아니다

모드의 존재, Data Dragon에 데이터가 있음, 특정 지역에서 현재 큐가 열림, 계정이 이용 가능함은 네 가지 다른 상태다. 모드를 단순한 mapId 하나로 분기하면 드래프트·룬·보상·이벤트의 차이를 관리하기 어렵다.

| 모드 계열 | 확인된 특징 또는 범위 | 복원 데이터에 분리할 것 |
|---|---|---|
| 현대 소환사의 협곡 | 일반·랭크·커스텀의 서로 다른 진입 정책 | 큐·드래프트·역할 퀘스트·보상 프로필 |
| Swiftplay | 독립 해금·플레이 자격이 안내됨 [VM10] | 경제·종료·선택 규칙을 SR 기본값에서 분리 |
| ARAM | 별도 큐·모드로 관리 [VM10][VM15] | 챔피언 제공 방식·맵·모드 보정·보상 |
| ARAM: Mayhem | ARAM 기반 증강 변형이며 기본 ARAM을 대체하지 않는다고 안내 [VM22] | 증강 풀·선택 시점·미션·룬·주문 제약 |
| Arena | 공식 안내의 기본형은 16인·8개 2인 팀, 라운드 기반 생존 경쟁 [VM17] | 팀 크기·라운드·증강·형식별 프로필 |
| League Classic | 현대 게임과 다른 콘텐츠·룰을 사용하는 별도 운영 모드 [VM18] | 고전 챔피언·룬·아이템·진행·상점 |
| Ranked 5s | 기간제 5인 사전 구성 랭크 실험 [VM19][VM21] | 별도 랭크 기간·드래프트·시간 창·보상 |
| 연습 도구·커스텀 | 실험·학습 목적과 별도 보상 자격 [VM10][VM14] | 치트·봇·일시정지·XP 지급 여부 |

Arena의 기본형을 모든 변형에 고정된 인원수라고 해석하지 않는다. 변형·시즌·이벤트 규칙이 있는 경우 별도 modeProfileId를 발급한다. 이번 문서는 현재 모드의 모든 형식을 전수 검증한 카탈로그가 아니다.

### 7.1 Mayhem의 규칙 분리와 문서 충돌

현재 지원 안내는 Mayhem에서 룬을 사용하지 않으며 증강 선택을 추가한다고 설명한다.[VM22] 기본 ARAM 챔피언 데이터에 아이템 몇 개만 붙이는 방식으로 완성할 수 있는 변형이 아니다. 증강·능력·아이템 상호작용과 모드 전용 성장 사건을 별도로 검증해야 한다.

같은 안내에는 “네 번의 증강 선택”이라는 설명과 “시작 시 + 레벨 3·7·11·15”라는 목록이 함께 있다.[VM22] 이를 자동으로 4개 또는 5개의 최종 슬롯으로 확정하지 않는다. 원문 충돌을 기록하고 현재 패치·게임 관측으로 해소할 항목으로 둔다. 화면 글 한 문장을 그대로 배열 길이로 만드는 데이터 파이프라인을 피해야 한다.

### 7.2 League Classic의 운영 상태

2026-10-14 개발 글은 Classic의 현 운영을 시즌 3 종료까지 이어간 뒤 2027년 1월에 마무리할 계획, 일부 지역 시간제 큐, JP·MENA의 26.21부터 커스텀 전환, Act II의 무료 단일 패스 구성을 설명한다.[VM18] 다시 돌아오는 방향은 목표로 언급됐으므로 확정된 미래 출시일로 만들지 않는다.

한국 역시 해당 글의 시간제 큐 목록에 포함된다. 실제 선택 화면은 지역과 시간 창을 평가해야 하며, 데이터 파일에 Classic 챔피언이 있다는 이유만으로 상시 입장 버튼을 활성화하지 않는다.

## 8. 모드 데이터 계약 — 복원 구현안

~~~ts
interface ModeProfile {
  modeProfileId: string;
  contentNamespace: string;
  mapDefinitionId: string;
  rulesManifestId: string;
  teamCount: number | null;
  playersPerTeam: number | null;
  draftProfileId: string;
  enabledSystems: {
    runes: boolean | null;
    roleQuests: boolean | null;
    augments: boolean | null;
  };
  accountRewardPolicyId: string;
  masteryRewardPolicyId: string;
  rankedPolicyId: string | null;
  availabilityPolicyId: string;
  verification: "official" | "inferred" | "custom" | "unknown";
}

interface AvailabilityPolicy {
  id: string;
  regions: string[];
  startsAtUtc: string | null;
  endsAtUtc: string | null;
  recurrenceTimezone: string | null;
  weeklyWindows: { startDay: number; startMinute: number; durationMinutes: number }[];
  customOnlyRegions: string[];
  emergencyDisabled: boolean;
  observedAt: string;
}
~~~

서머타임이 있는 지역은 고정 UTC 오프셋만 저장하지 않는다. 원문이 서버 시간이라고 하면 그 뜻을 보존하고 적절한 시간대 식별자로 평가한다. 종료 날짜와 주간 창의 우선순위, 휴일 운영, 긴급 중단은 별도 정책이다.

허용되지 않는 시스템에 데이터를 넣은 경우 조용히 무시하지 말고 빌드 검증에서 잡는다. 예를 들어 룬이 비활성화된 프로필이 현대 SR의 룬 효과를 기본 로드하는 상황, 별도 Classic 데이터가 현대 챔피언 목록에 합쳐지는 상황을 검사한다.

## 9. 라이브 운영과 데이터 재구축

### 9.1 세 개의 버전을 분리

| 버전 | 담는 내용 | 동일시하면 생기는 오류 |
|---|---|---|
| 공개 패치 | 이용자에게 발표한 게임 변경 묶음 | 26.22라는 이름만으로 정적 파일 버전을 추정 |
| 정적 데이터 배포 | 챔피언·아이템·문구·리소스 파일 | 정적 파일이 매칭·패스·모든 실시간 설정을 포함한다고 착각 |
| 운영 매니페스트 | 큐·지역·기간·이벤트·보상·긴급 비활성화 | 같은 패치에서 서로 다른 지역·시간 정책을 표현하지 못함 |

이번 패키지의 26.22와 Data Dragon 16.22.1은 서로 다른 버전 체계다. 수집한 파일이 같아도 후속 운영 공지나 서버 측 설정은 별도로 바뀔 수 있다. 다운로드한 정적 파일이 곧 완전한 원작 서버 데이터라는 표현을 사용하지 않는다.

### 9.2 권장 배포 흐름 — 복원 구현안

1. 원문·정적 파일을 버전 및 조회 시점과 함께 보존한다.
2. 정규화 단계에서 ID·자료형·모드·언어·단위를 정리한다.
3. 이전 버전과 비교하여 추가·수정·삭제·충돌을 나눈다.
4. 콘텐츠가 참조하는 주문·아이템·상태·모드 ID의 유효성을 검사한다.
5. 규칙 매니페스트를 작성하고 경기 시작 시 해당 버전을 봉인한다.
6. 새 경기부터 정책을 적용한다. 진행 중 경기 변경이 필요하면 별도 마이그레이션 정책을 명시한다.
7. 결과·보상·리플레이에 적용한 버전 ID를 남긴다.
8. 롤백은 파일만 되돌리는 것이 아니라 진행 데이터·보상 거래의 호환성까지 검토한다.

이 흐름은 Riot의 실제 배포 파이프라인을 설명하는 것이 아니다. 현재 재구축 프로젝트에서 데이터·문서·향후 게임 구현을 정합성 있게 연결하기 위한 제안이다.

### 9.3 출처 상태를 보존하는 매개변수

~~~ts
interface VerifiedParameter {
  ruleId: string;
  value: unknown;
  unit: string | null;
  evidencePatch: string | null;
  latestReviewedPatch: string | null;
  sourceId: string;
  verification: "official" | "historical" | "inferred" | "custom" | "unknown";
  conflictId: string | null;
}
~~~

숫자만 남기고 근거 상태를 버리면 공식 확인, 역사 자료, 자체 설계가 구별되지 않는다. 26.1 도입 수치를 현재값으로 계속 복사하는 오류, 현재 이벤트 보상을 일반 미션 보상에 덮어쓰는 오류가 같은 원인에서 생긴다.

## 10. 라이브 운영을 검증할 관측 지표 — 구현 제안

다음은 실제 원작 운영 수치가 아니라 복원 서비스에서 수집하면 유용한 지표다.

| 영역 | 측정값 | 활용 |
|---|---|---|
| 보상 정합성 | 정산 누락·중복·보정 거래 수 | 지급 신뢰성 확인 |
| 이벤트 경계 | 종료 전후 지연 결과의 처리 분포 | 시간 정책 검증 |
| 콘텐츠 자격 | 큐 입장·픽 선택 거절 사유 | 잘못된 해금·소유권 정책 탐지 |
| 모드 운영 | 지역별 대기 시간·입장 실패 | 시간 창과 가용성 검증 |
| 데이터 품질 | 미확인·충돌·끊긴 참조 수 | 복원 범위의 가시화 |
| 버전 호환 | 경기·정산·리플레이 버전 불일치 | 배포 및 롤백 위험 확인 |
| 성장 흐름 | 계정·숙련도·패스 진행 분포 | 콘텐츠 정책 조정의 관측 기반 |

사용자 행동을 설명하는 지표와 알고리즘 내부 상태를 구분한다. 공개 승률·게임 수만으로 Riot의 내부 평가 모델을 역산했다고 주장하지 않는다.

## 11. 현재 웹 게임과의 차이

현재 Nexus Front v7은 브라우저 안의 경기 상태, 체크포인트, 로컬 전적·설정을 다룬다. 자체 영웅·아이템과 경기 성장은 있지만 Riot 계정, 계정 레벨, 챔피언 수집, RP·BE 원장, 패스, 서버 랭크, 지역별 큐 운영은 구현되어 있지 않다.

사용자가 요청한 **게임 시작 전 1·1.5·2배 지도 선택과 자체 속도 선택**은 커스텀 게임 프로필이다. 이를 소환사의 협곡 공식 랭크의 맵 크기·속도 옵션으로 문서화하지 않는다. 세이브 파일에 설정을 넣는 것과 계정 서버의 콘텐츠 소유권을 저장하는 것도 다른 작업이다.

이번 산출물은 원작 분석·데이터 정리·복원 계획이다. 원작 라이브 서비스의 계정 서버를 구현하거나 현재 웹 게임의 배포 상태를 변경한 작업으로 표시하지 않는다.

## 12. 경계 QA

| ID | 사례 | 기대 결과 |
|---|---|---|
| P01 | 같은 경기 결과를 두 번 전달 | 계정 XP·MP·BXP·보상 중복 없음 |
| P02 | 커스텀 경기 완료 | 계정 XP 정책에 따라 지급되지 않음 |
| P03 | 계정 레벨과 경기 레벨이 다름 | 해금은 계정 상태, 스킬은 경기 상태를 참조 |
| P04 | 보유하지 않은 챔피언으로 허용 모드 플레이 | 사용권과 숙련도 진행을 각각 정책 검증 |
| P05 | 시즌 변경 | 영구 숙련도와 시즌 마일스톤의 리셋 범위 분리 |
| P06 | 오래된 일반 숙련도 미션과 새 이벤트 목표 중첩 | eventId·조건 버전으로 올바른 보상 선택 |
| P07 | 이벤트 종료 전 시작·종료 후 경기 완료 | 명시된 지연 결과 정책 적용 |
| P08 | 패스 진행 종료 후 비활성화 전 구매 | 해당 이벤트의 구매·수령 정책 구분 |
| P09 | 무료 트랙을 먼저 완료하고 유료 권한 획득 | 획득한 단계만 한 번 지급 |
| P10 | 결제 차감 성공 뒤 콘텐츠 적용 응답 유실 | 같은 거래 재조회·재처리로 중복 차감 방지 |
| P11 | 환불·운영 보정 | 원본 거래 이력과 역거래 연결 |
| P12 | RP 가격 null과 0 | 미확인과 무료를 구별 |
| P13 | Classic 챔피언과 현대 챔피언의 같은 이름 | 콘텐츠 네임스페이스로 잘못된 능력 연결 방지 |
| P14 | Mayhem에 기본 룬 자동 로드 | 모드 검증에서 차단 |
| P15 | Ranked 5s 종료 후 Solo 승리 임무 | 별도 보상 범위로 처리 |
| P16 | 시간제 큐가 자정을 지남 | 세션 시작 요일과 지속시간으로 평가 |
| P17 | 일광절약시간 전환 | 고정 UTC 오프셋 가정으로 한 시간 오차 발생 금지 |
| P18 | 같은 패치의 운영 긴급 비활성화 | 정적 파일 버전과 독립적으로 입장 제어 |
| P19 | 매니페스트 롤백 후 옛 경기 정산 | 경기에서 봉인한 정책과 보상 버전 보존 |
| P20 | 지원 페이지 숫자·목록이 충돌 | 미확인 상태와 원문 근거를 유지, 자동 확정 금지 |

## 13. 공개 자료로 복원할 수 없는 영역

정확한 계정 XP 계산식의 모든 보정·반올림, 숙련도 평가 함수·백분위 경계, 모든 현재 상점의 지역별 가격·소유권 조합 할인, 서버의 실제 보상 원장 구조, 미공개 아이템 드롭 알고리즘, 실시간 운영 실험군, 관리자 개입 절차는 이번 자료로 확정하지 않았다.

일부 상품의 확률이 공식 공개되어 있다는 사실과 전체 보상 시스템의 구현을 알고 있다는 것은 다르다. 상품별 공개 확률을 추가 수집할 때도 해당 상품·지역·이벤트 버전 범위만 확인값으로 등록해야 한다.

## 14. 공식 출처

모든 링크 조회일: **2026-11-17**.

- **[VM10]** [Unlocking Game Modes](https://support.riotgames.com/en-us/league-of-legends/gameplay/unlocking-game-modes), 표시일 2026-05-29.
- **[VM14]** [Reward (BE/XP) System Breakdown](https://support.riotgames.com/en-us/league-of-legends/rewards/reward-bexp-system-breakdown), 표시일 2026-02-21.
- **[VM15]** [Champion Mastery Guide](https://support.riotgames.com/en-us/league-of-legends/rewards/champion-mastery-guide), 표시일 2025-07-31.
- **[VM16]** [Season 3: Worlds 2026](https://support.riotgames.com/en-us/league-of-legends/events/league-of-legends-season-3-worlds-2026), 표시일 2026-09-09.
- **[VM17]** [Arena Game Mode](https://support.riotgames.com/en-us/league-of-legends/gameplay/league-of-legends-arena-game-mode), 표시일 2026-05-13. 기본형 설명의 범위를 지킬 것.
- **[VM18]** [/dev: League Classic](https://www.leagueoflegends.com/en-us/news/dev/dev-league-classic/), 2026-10-14.
- **[VM19]** [/dev: The Return of Ranked 5s](https://www.leagueoflegends.com/en-us/news/dev/dev-the-return-of-ranked-5s/), 2026-05-27.
- **[VM21]** [Ranked 5s Mode](https://support.riotgames.com/en-us/league-of-legends/events/ranked-5s), 표시일 2026-06-19, 본문에 후속 실험 규칙 포함.
- **[VM22]** [ARAM: Mayhem Game Mode](https://support.riotgames.com/en-us/league-of-legends/events/league-of-legends-aram-mayhem-game-mode), 표시일 2026-10-21. 증강 단계 수와 목록 충돌 보존.
