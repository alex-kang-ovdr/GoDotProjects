# 06. 챔피언 선택·포지션·역할 퀘스트·매칭·경기 종료

## 1. 기준과 범위

**조사일 2026-11-17 / 공개 패치 검토 기준 26.22 / Data Dragon 16.22.1.** 이 문서는 매치 입장부터 챔피언 선택, 역할 고정, 경기 종료, 랭크 정산까지 연결한다. 기존 웹 게임의 영웅 선택 메뉴를 원작의 계정·큐·드래프트 전체와 동일하게 취급하지 않는다.

공식 자료에서 확인한 이용 규칙과, 이를 재현하기 위해 제안하는 자료 구조·상태 전이·원자적 처리 방식은 구분한다. **MMR 수식, 매치메이커 가중치, 스머프 판정 기준은 비공개**이며 임의의 Elo 상수로 채운 뒤 원작 복원이라고 부르지 않는다.

역할 퀘스트의 정확한 패치 수치와 변경 이력은 [경제·경험치·아이템](02_economy_experience_items.md)의 **역할 퀘스트 변경 이력** 및 [검증 파라미터 CSV](../rules_verified_parameters.csv)를 단일 기준으로 사용한다. 이 문서는 역할 배정과 퀘스트 생명주기에 집중한다.

## 2. 버전이 섞이기 쉬운 핵심 정정

| 항목 | 도입·이전 설명 | 후속 공식 근거 | 이번 복원 문서의 처리 |
|---|---|---|---|
| 역할 퀘스트 | 정글·서포터 성장만 고려한 옛 설계 | 26.1의 다섯 역할 퀘스트 [VM03] | 챔피언 선택 역할을 경기 규칙에 바인딩 |
| Aegis / 용맹의 방패 | 숙련도 등급 조건과 패배 LP 보호 | 26.15에서 승리 보너스 중심으로 변경 [VM09] | 승리 LP 2배, 패배 보호·최저 등급 조건 제거 |
| 리메이크 시간 | 예전 1:30~3:00 설명 | 26.1에서 0:55~2:25로 변경 [VM03] | 새 창을 사용하되 FAQ 잔여 문구 충돌 보존 |
| 리메이크 시작 | 이용자가 명령어로 시작 | 26.14에서 자격 충족 시 자동 투표 [VM12] | 자격 판정과 투표 시작을 분리 |
| 랭크 큐 목록 | 기본 지원 문서의 Solo/Flex 두 큐 | 2026 Ranked 5s 실험 큐 [VM19][VM21] | 독립 기간·인원·드래프트 프로필 추가 |
| 최상위 듀오 | 모든 지역에 하나의 규칙 적용 | 26.15 및 지원 문서의 KR 예외 [VM07][VM09] | 지역·티어·MMR 구간별 정책으로 관리 |

지원 페이지에 적힌 마지막 수정일이 본문 전체의 유효 시점을 보장하지 않을 수 있다. 예를 들어 Ranked 5s 페이지는 6월 날짜를 표시하면서 이후 2차 실험 내용을 함께 담고 있다. 따라서 **게시일, 조회일, 해당 규칙의 적용 패치**를 별도 기록한다.

## 3. 큐 자격과 파티 정책

**공식 확인:** 일반적인 Solo/Duo는 1~2인, Flex는 1·2·3·5인 파티를 대상으로 하며 서로 독립된 랭크를 가진다. KR에는 마스터 이상 듀오 제한이 별도로 설명되어 있다.[VM07] 전 지역에 같은 최상위 듀오 표를 적용해서는 안 된다.

랭크 입장에 관한 현재 지원 문서는 **계정 레벨 30, 챔피언 20개 보유, Swiftplay 또는 일반 드래프트 10경기 플레이**를 제시한다.[VM10] “10경기 승리”로 잘못 바꾸지 않는다. 이 조건은 계정 자격이며, 챔피언 선택 시 가능한 픽은 밴·소유·모드·일시 비활성화 등을 추가로 검사해야 한다.

| 프로필 | 파티 크기 | 드래프트·진행 | 별도 정책 |
|---|---|---|---|
| Solo/Duo | 1, 2 | 일반 매치메이드 드래프트 | 지역별 듀오·티어·숨은 MMR 제한 |
| Flex | 1, 2, 3, 5 | 일반 매치메이드 드래프트 | 상위 티어 동행 제한, 독립 랭크 |
| Ranked 5s | 정확히 5 | Tournament Draft | 기간제 실험, 티어 제한 없이 구성, 독립 성장 |
| 연습·커스텀 | 모드별 정의 | 생성한 방의 설정 | 계정 보상·랭크 정산을 별도 제한 |
| Swiftplay·특수 모드 | 모드별 정의 | 별도 선택·배정 흐름 | 일반 드래프트 단계를 강제 적용하지 않음 |

위 표에서 마지막 두 행의 정확한 현재 인원·해금·선택 단계는 해당 모드 매니페스트로 채워야 한다. 열이 존재한다는 이유만으로 모든 모드에 기본값을 전파하지 않는다.

### 3.1 Ranked 5s의 최신 원작 범위

Ranked 5s는 고정 팀 등록 없이 5인 사전 구성으로 참여하고, **3밴→3픽→2밴→2픽**의 토너먼트 드래프트를 사용하는 실험 큐다.[VM19] 지원 문서는 2차 실험을 **2026-09-11~2027-01-07**, 금~일 서버 시간 **16:00~다음 날 04:00**으로 안내하며, 별도 MMR·LP와 상대 분석 정보를 설명한다.[VM21] 26.20은 이전 02시 종료가 04시로 늘어났음을 확인한다.[VM20]

이 자료가 존재해도 지금 이 순간 모든 서버의 큐가 열려 있다는 뜻은 아니다. 한국 서버는 KST 기준으로 주간 창을 평가한다. 날짜가 바뀌는 야간 세션은 시작 요일 기준 구간으로 보관해야 월요일 새벽 세션을 잘못 닫지 않는다. 공식 설명상의 “주말”을 토·일만으로 번역하면 금요일 세션을 누락한다.

## 4. 챔피언 선택은 여러 독립 계약의 조합이다

Riot의 공개 회고는 매치메이드 선택에 10개 동시 밴과 연속 선택의 병렬화가 도입되었다고 설명한다.[VM24] 이 자료는 기본 구조의 역사 근거이며, 현재 단계별 제한시간까지 확정하는 자료는 아니다.

**복원 구현안:** 아래 단계를 큐 프로필로 조합한다. 일반 드래프트, 토너먼트 드래프트, 무작위 선택, 사전 선택형 큐는 다른 단계 목록을 사용한다.

~~~mermaid
flowchart TD
    L["파티·자격 검증"] --> Q["매칭 대기"]
    Q --> R["준비 확인"]
    R --> D["모드별 드래프트"]
    R --> X["미수락·취소"]
    D --> S["역할·픽·설정 확정"]
    D --> X
    S --> G["경기 규칙 봉인"]
    G --> P["경기 시작"]
    X --> L
~~~

| 단계 | 권위 데이터 | 전이 조건 | 실패·경계 처리 |
|---|---|---|---|
| 파티 검증 | 계정·지역·제재·소유·파티 인원 | 모든 구성원이 큐 정책 충족 | 한 명 변경 시 전체 재평가 |
| 매칭 | 큐 표본·선호 역할·파티 결합 | 유효한 양 팀 후보 완성 | 취소와 매치 확정 경쟁 제어 |
| 준비 확인 | 수락 상태·기한 | 요구 인원 수락 | 만료·중복 응답의 단일 결과 |
| 선호 챔피언 표시 | 팀에 허용된 의도 정보 | 해당 모드가 단계를 지원 | 선택 의도는 확정 픽이 아님 |
| 밴 | 밴 주체·대상·공개 범위 | 단계 규칙에 맞는 확정 | 양 팀 중복 밴·기한 초과 정책 명시 |
| 픽 | 선택 가능한 챔피언·순서 | 단계별 선택 완료 | 다른 사용자의 동시 확정과 충돌 |
| 교환·설정 | 챔피언·픽 순서·역할·룬·주문 | 마감 전 검증·상호 동의 | 교환 종류별 권한 차이 |
| 경기 봉인 | 최종 역할·챔피언·규칙 버전 | 모든 플레이어 설정 유효 | 재접속은 동일 봉인 데이터 사용 |

일반 드래프트의 정확한 현행 단계 시간, 밴 미입력 시 처리, 자동 룬 보정, 소유권 교환 예외는 추가 확인 대상이다. 단계 모양을 재현했다는 것과 모든 클라이언트 예외를 복원했다는 것을 구별한다.

### 4.1 역할 교환, 픽 순서 교환, 챔피언 교환을 분리

역할은 탑·정글·미드·바텀·서포터의 경기 역할이고, 챔피언 클래스는 전사·마법사·암살자 등 콘텐츠 분류다. 특정 챔피언을 선택했다고 서버의 배정 역할이 자동 변경되는 것은 아니다.

**복원 계약:** 세 가지 교환은 서로 다른 트랜잭션이다. 역할 교환은 퀘스트 바인딩과 자동 배정 혜택 검증에 영향을 줄 수 있고, 픽 순서 교환은 선택 차례를 바꾼다. 챔피언 교환은 최종 소유 챔피언을 바꾸며 역할을 자동으로 바꾸지 않도록 명시한다.

~~~ts
interface DraftSeat {
  participantId: string;
  teamId: number;
  pickSlot: number;
  assignedRole: "top" | "jungle" | "mid" | "bot" | "support";
  roleAssignmentReason: "primary" | "secondary" | "autofill" | "custom";
  championId: string | null;
  championLocked: boolean;
  loadoutRevision: number;
}

interface DraftExchange {
  exchangeId: string;
  kind: "role" | "pickOrder" | "champion";
  participantIds: [string, string];
  requestedAtRevision: number;
  acceptedBy: string[];
  expiresAt: string;
  state: "pending" | "committed" | "rejected" | "expired";
}
~~~

교환 직전 두 참가자의 상태 버전이 모두 맞을 때만 원자적으로 반영한다. 하나의 참가자가 두 교환을 동시에 승인해 역할이 중복되거나 사라지는 상황을 막는다. 마감 틱에 들어온 승인은 서버 시간과 명확한 우선순위로 판단한다. UI가 먼저 바뀌었다고 서버 역할이 확정된 것으로 처리하지 않는다.

## 5. 2026 역할 퀘스트의 생명주기

**공식 확인:** 26.1의 역할 퀘스트는 챔피언 선택에서 배정된 역할에 연결되며, 경기 전 역할 교환이 가능하고 커스텀 소환사의 협곡에서도 역할 선택을 요구한다. 다섯 역할의 퀘스트를 Swiftplay·모든 특수 모드에 그대로 적용하지 않는다.[VM03]

도입값을 최신값으로 유지하면 안 된다. 퀘스트 보상·라인 범위·배회 시간·귀환 후 진행 중지 등 후속 변경은 [역할 퀘스트 변경 이력](02_economy_experience_items.md#역할-퀘스트-변경-이력)과 CSV의 다음 rule_id로 연결한다.

| 기능 | 매개변수 식별자 예 |
|---|---|
| 탑 경험치 | rq.top.xp_bonus, rq.top.takedown_xp |
| 탑 순간이동 | rq.top.teleport.free_cd_s, rq.top.teleport.upgraded_cd_s |
| 탑 보호막 | rq.top.teleport.shield_fraction, rq.top.teleport.shield_duration_s |
| 미드 보상 | rq.mid.bonus_ad_ap, rq.mid.empowered_recall |
| 바텀 처치 보상 | rq.bot.takedown_gold |
| 배회·귀환 | rq.roam.bank_cap_s, rq.recall.pause_s |
| 서포터 라인 밖 페널티 | rq.support.offlane_penalty, rq.support.offlane_until_level |

각 행의 evidence_patch와 latest_reviewed_patch를 함께 읽는다. “26.22까지 검토”는 각 규칙을 26.22 패치 노트가 다시 전문으로 증명했다는 의미가 아니다.

### 5.1 상태 계약 — 복원 구현안

~~~ts
interface RoleQuestState {
  participantId: string;
  boundRole: string;
  questDefinitionId: string;
  ruleVersion: string;
  status: "bound" | "active" | "completed" | "rewardApplied";
  progress: Record<string, number>;
  phaseId: string;
  progressGateReasons: string[];
  lastProcessedEventId: string | null;
  completedAtTick: number | null;
  rewardTransactionId: string | null;
}
~~~

게임 시작 시 최종 역할을 퀘스트 정의와 함께 봉인한다. 진행은 경기 사건, 위치·영역, 생존·귀환 상태, 시간 조건을 검사한 뒤 누적한다. 구체적인 점수·보상 값은 퀘스트 정의가 제공한다.

**진행 일시 중지**는 상태 머신을 완료 전으로 되돌리는 사건이 아니다. ACTIVE 상태에 귀환 직후·라인 밖 등 중지 이유 집합을 둔다. 중지 이유 하나가 해제되었다고 나머지 이유를 지우면 안 된다. 보상 적용은 완료 사건의 고유 ID를 사용해 한 번만 수행한다.

한 경기의 퀘스트 완료가 다음 경기·계정 성장으로 이어지는 것으로 설계하지 않는다. 계정 경험치·챔피언 숙련도와 경기 안의 역할 퀘스트는 서로 다른 수명과 정산 절차를 갖는다.

### 5.2 퀘스트 경계 상황

라인 경계에 서 있는 챔피언, 순간이동·귀환 후 이동, 같은 틱의 처치와 사망, 지속 피해에 의한 처치 관여, 소환수의 사건, 역할 퀘스트 완료와 아이템 슬롯 변화, 재접속 직후 UI 복원, 서버 중복 사건을 따로 검증한다. 공개 수치만 복사하면 이런 상태 충돌은 해결되지 않는다.

역할 퀘스트의 경제적 의도는 각 역할의 성장 경로를 명시하고 경기 내 역할 수행과 보상을 연결하는 것으로 분석할 수 있다. 이는 본 문서의 설계 해석이다. 특정 플레이를 강제하려는 내부 목표나 실제 유저 지표가 공개된 것으로 서술하지 않는다.

## 6. MMR, 공개 랭크, LP의 구분

공식 지원 문서는 MMR을 숨겨진 실력 평가로 설명하며, 공개 랭크와의 관계가 LP 변화에 영향을 준다고 안내한다. Normal, Solo/Duo, Flex의 MMR은 분리되고 최초 랭크 배치에는 일반 게임 정보가 고려될 수 있다.[VM06] 다른 큐 정보가 초기화 입력으로 쓰인다는 사실을 큐 간 점수가 계속 공유된다는 뜻으로 해석하지 않는다.

| 데이터 | 분석상 역할 | 공개 복원 가능성 |
|---|---|---|
| 공개 티어·디비전·LP | 플레이어가 보는 성장 상태 | 공식 제한·결과 관측으로 일부 확인 |
| 큐별 MMR | 매칭과 실력 평가의 내부 상태 | 정확한 현재 값·계수 미공개 |
| 배치 상태 | 초기 평가 과정 | 공개 지원 규칙 확인 가능 |
| 선호·배정 역할 | 큐 구성의 제약·품질 | 이용자 설정·공개 설계로 일부 확인 |
| 파티 결합 | 구성원 분리 금지 및 팀 구성 | 인원 정책 확인 가능 |
| 후보 확대 정책 | 대기 시간과 품질의 조정 | 실제 임계값·목적 함수 미공개 |
| 제재·자격 | 참여 제한 및 결과 조정 | 공개 원칙 일부, 탐지 모델 비공개 |
| Aegis 자격 | 특정 경기의 보상 수정자 | 적용 조건과 변경 이력 확인 가능 |

**원작 비공개 항목:** Elo의 K값 같은 업데이트 계수, 초기 평균·분산, 최근 경기 가중치, 역할별 잠재 실력 추정, 파티 보정식, 랭크와 MMR 차이를 LP로 바꾸는 함수, 자동 배정 비용, 서버별 후보 확대 간격, 스머프·부스팅 탐지 특징과 임계값.

이 값들이 없으면 “원작과 같은 매치메이커”는 복원할 수 없다. 별도 구현 시에는 자체 알고리즘임을 표시하고 목표를 **역할 충족률, 파티 대칭성, 대기 시간 분포, 팀 실력 추정 차이**처럼 검증 가능한 관측치로 정한다.

### 6.1 자동 배정의 공개 의도와 복원 설계

2026 개발 글은 자동 배정을 상대 팀의 같은 역할과 맞추고, 어려우면 자동 배정 인원을 맞추는 방향을 설명한다.[VM05] 이것은 모든 경기에서 반드시 같은 역할·같은 인원이 보장된다는 계약이 아니며, 공개한 내부 가중치 표도 아니다.

**복원 구현안:** 매칭 후보마다 인원·파티·역할 자격 같은 강제 제약과, 대기 시간·역할 만족·실력 차이 같은 비용 항목을 분리한다. 강제 제약을 대기 시간이 길다는 이유로 임의 해제하지 않는다. 실험용 가중치는 CUSTOM_MATCHMAKER 프로필에 저장한다.

~~~ts
interface MatchTicket {
  ticketId: string;
  region: string;
  queueProfileId: string;
  partyIds: string[];
  participants: {
    participantId: string;
    primaryRole: string;
    secondaryRole: string;
    autofillPolicyState: string;
    eligibilityVersion: string;
  }[];
  enqueuedAt: string;
  rulesManifestId: string;
}
~~~

## 7. Aegis / 용맹의 방패의 현재 계약

**26.15 공식 변경:** 패배 LP 감소 보호와 최소 숙련도 등급 조건을 없애고, 승리한 경기의 LP 2배 보상으로 바뀌었다.[VM09] 과거 C등급·B등급 조건은 변경 이력일 뿐 현재 조건에 합쳐 넣지 않는다.

현재 지원 문서는 자동 배정·우선 역할 보너스가 매번 보장되는 것은 아니며, 드래프트에서 역할을 바꾸거나 제재가 발생하면 자격에 영향이 있다고 안내한다.[VM08] 자격은 “현재 캐릭터가 서포터처럼 움직였다”는 추정값으로 정산하지 않고 해당 경기의 정책 결과를 사용해야 한다.

**복원 구현안:** 아래 네 상태를 분리한다.

| 단계 | 기록 |
|---|---|
| 제공 여부 | 큐 진입·매치 생성 시 제공된 혜택과 규칙 버전 |
| 유지 여부 | 역할 교환·제재·리메이크 등 관련 사건 |
| 경기 결과 | 승리·패배·리메이크·무효 종료 |
| 정산 결과 | 기본 LP, 보너스 적용 여부, 결과 영수증 |

LP가 배수라고 해서 MMR도 같은 배수로 올린다고 추론하지 않는다. Aegis가 적용된 LP 영수증과 MMR 업데이트는 별도 도메인이다.

## 8. 항복·리메이크·무효 종료를 구분

항복은 정상 경기의 승패를 확정하는 종료 경로다. 리메이크는 경기 성립과 불참 자격을 검사하는 별도 경로다. 운영상 경기 무효화가 필요하다면 또 다른 종료 사유를 사용해야 한다. 세 경로를 동일한 “조기 종료” boolean으로 처리하면 보상·승패·제재가 섞인다.

### 8.1 리메이크의 출처 충돌과 해결

| 자료 | 적힌 내용 | 판정 |
|---|---|---|
| 26.1 패치 | 리메이크 창을 1:30~3:00에서 0:55~2:25로 변경 | 시간 창의 최신 변경 근거 [VM03] |
| 리메이크 FAQ 상단 | 55초 비활성, 0:55~2:25 등의 현재 안내 | 위 패치와 시간 창 일치 [VM11] |
| 같은 FAQ 하단 | 90초 비활성·3분 관련 이전 문구 잔존 | 문서 내 충돌, 원문 삭제하지 않고 기록 |
| 26.14 패치 | 자격을 충족하면 리메이크 투표 자동 시작 | 수동 명령만 기다리는 구현 수정 [VM12] |

따라서 시간 창은 패치 변경으로 해소할 수 있다. 그러나 비활성 측정의 정확한 시작점·연속성·예외는 FAQ 상단 안내만으로 서버 코드 수준까지 확정할 수 없다. **0:55가 되면 모든 경기에서 리메이크가 뜬다**는 의미도 아니다.

리메이크 FAQ는 투표 인원, 첫 처치와 비활성 시점 관계, 불참자 및 일부 사전 구성 동료의 제재, 정상 참가자의 보상 미지급 등을 별도로 안내한다.[VM11] 일반 승패 정산에 그대로 통과시키지 않아야 한다.

### 8.2 항복 정책

13.7은 소환사의 협곡 일반·랭크에서 15분 이후 4명 동의 항복을 허용하는 변경을 설명한다.[VM13] 이는 **마지막 확인한 기본 정책의 역사 근거**이며 모든 2026 모드에 같은 타이머를 강제 적용하는 근거가 아니다. AFK 조기 항복, 인원 감소, Swiftplay, ARAM, 특수 모드는 각각 다른 정책 프로필을 가진다.

정확한 현행 재투표 간격·투표 지속시간·인원 감소 시 문턱은 이번 자료에서 일괄 확정하지 않았다. 구현할 때는 null을 남기거나 커스텀 값을 명시해야 한다.

### 8.3 종료와 정산 상태 계약 — 복원 구현안

~~~ts
interface TerminationVote {
  voteId: string;
  matchId: string;
  kind: "surrender" | "remake";
  eligibilityEvidenceId: string;
  eligibleVoterIds: string[];
  ballots: Record<string, "yes" | "no">;
  openedAtTick: number;
  closesAtTick: number;
  policyVersion: string;
  state: "open" | "passed" | "failed" | "expired" | "cancelled";
}

interface MatchOutcome {
  matchId: string;
  terminalRevision: number;
  reason: "nexus" | "surrender" | "remake" | "administrativeVoid";
  winnerTeam: number | null;
  rewardPolicyId: string;
  rankedSettlementPolicyId: string;
  participantPenaltyEvidenceIds: string[];
  sealedAt: string;
}
~~~

종료는 한 번만 봉인한다. 넥서스 파괴와 항복 가결이 같은 틱에 발생하면 명시한 우선순위로 하나의 결과를 만든다. 리메이크 투표 중 재접속·첫 처치·자격 변경을 어떻게 처리하는지는 종료 정책에 명시하고 테스트한다.

결과 저장 → 계정·랭크 정산 요청 → 정산 영수증 확인을 분리한다. 재전송된 경기 결과가 LP·XP·보상·제재를 두 번 반영하지 않도록 matchId, participantId, settlementPolicyVersion을 기준으로 멱등성을 보장한다. 클라이언트의 승리 화면이 정산 권위가 되면 안 된다.

## 9. 현재 웹 프로토타입의 차이

| 영역 | 현재 Nexus Front v7의 상태 | 원작 복원 필요 항목 |
|---|---|---|
| 캐릭터 선택 | 자체 영웅 선택 | 계정 소유·밴·픽·교환·로드아웃 |
| 팀 구성 | 로컬 AI 동료·상대 | 큐·파티·준비 확인·역할 배정 |
| 역할 | AI의 라인·행동 역할 | 2026 역할 퀘스트 및 최종 역할 바인딩 |
| 랭크 | 로컬 기록 | 서버 MMR·랭크·LP 정산은 별도 구현 |
| 종료 | 로컬 경기 종료·기록 | 모드별 항복·리메이크·제재·보상 정책 |
| 맵 크기·속도 | 시작 전 1·1.5·2배 맵, 자체 속도 설정 | **사용자 커스텀 설정**, 원작 랭크 옵션 아님 |

로컬 코드와 GAMEPLAY.md 확인 결과다. 이 조사·문서 작성은 기존 게임에 온라인 계정, 랭크, 원작 챔피언 선택을 추가하는 코드 변경을 포함하지 않는다.

## 10. 경계 QA

| ID | 사례 | 기대 결과 |
|---|---|---|
| D01 | 파티가 큐 등록 직후 인원을 변경 | 이전 티켓 취소 또는 새 자격으로 재발급 |
| D02 | Flex 4인 파티 | 잘못된 큐 등록 거부 |
| D03 | KR 마스터 듀오와 다른 지역 정책 비교 | 해당 지역의 정책 적용 |
| D04 | 동일 참가자가 역할 교환 두 건 동시 승인 | 원자적 한 건 처리, 역할 중복 없음 |
| D05 | 챔피언 교환 후 역할 퀘스트 확인 | 최종 역할 계약과 일치 |
| D06 | 픽 순서만 교환 | 역할과 소유 챔피언이 의도 없이 변경되지 않음 |
| D07 | 밴·픽 잠금과 마감 시간 동시 도착 | 서버 시각 기준 단일 결과 |
| D08 | 선택 중 콘텐츠가 비활성화됨 | 경기 봉인 정책에 따라 재검증·차단 |
| D09 | 퀘스트 완료 사건 재전송 | 보상 한 번만 적용 |
| D10 | 귀환 중지와 라인 밖 중지가 중첩 | 한 조건 해제로 모든 중지 해제 금지 |
| D11 | Aegis 승리·패배·낮은 숙련도 등급 | 26.15 정책 적용, 과거 등급 조건 재등장 금지 |
| D12 | Aegis 자격 중 역할 교환·리메이크 | 해당 정책 기록과 정산 일치 |
| D13 | 리메이크 자격 충족 | 자동 투표 생성, 중복 투표 금지 |
| D14 | FAQ의 예전 3분 규칙으로 가져온 저장 데이터 | 출처 버전 구별, 조용한 덮어쓰기 금지 |
| D15 | 리메이크·항복·넥서스 파괴 동시 처리 | 한 경기 결과만 봉인 |
| D16 | 정산 응답 유실 후 재시도 | LP·XP·제재 중복 없음 |
| D17 | Ranked 5s 금요일 16시·월요일 새벽 | 시작 요일과 자정 넘김을 정확히 평가 |
| D18 | Ranked 5s 결과를 Solo 보상에 입력 | 모드별 정산 정책으로 분리 |
| D19 | Solo·Flex 배치 입력 자료 공유 | 큐별 현재 MMR을 같은 값으로 덮어쓰지 않음 |
| D20 | 커스텀 매치메이커의 점수 계산 | 원작 내부 알고리즘으로 표시하지 않음 |

## 11. 복원 불가능·추가 관측 필요 항목

- Riot의 실시간 MMR, 매칭 목적 함수, 자동 배정 보정 계수와 후보 검색 간격.
- 챔피언 선택의 현재 모든 타임아웃·교환·비활성화 예외 및 서버 처리 순서.
- 리메이크 비활성 판정의 입력 이벤트·연속성·제재 판정 상세.
- 지역별 운영 예외의 실시간 변경, 비공개 실험 그룹, 현재 로그인 계정의 참여 가능 여부.
- 원작의 통계적 매칭 품질·공정성 지표. 공개 설명만으로 실제 결과 분포를 산출할 수 없음.

복원용 자체 값은 custom 또는 inferred로 저장한다. 값이 미확인인 경우 unknown을 유지하며, 문서 작성자가 정한 값과 공식 패치 값을 같은 상태로 합치지 않는다.

## 12. 공식 출처

모든 링크 조회일: **2026-11-17**. 세부 기록은 [vision_meta_sources.json](../vision_meta_sources.json)을 참조한다.

- **[VM03]** [Patch 26.1 Notes](https://www.leagueoflegends.com/en-us/news/game-updates/patch-26-1-notes/), 2026-01-07.
- **[VM05]** [/dev: Ranked 2026](https://www.leagueoflegends.com/en-us/news/dev/dev-ranked-2026/), 2025-12-01.
- **[VM06]** [MMR, Rank, and LP](https://support.riotgames.com/en-us/league-of-legends/gameplay/mmr-rank-and-lp), 페이지 표시일 2026-05-28.
- **[VM07]** [Ranked Tiers, Divisions, and Queues](https://support.riotgames.com/en-us/league-of-legends/gameplay/ranked-tiers-divisions-and-queues), 페이지 표시일 2026-05-07. KR 예외 포함.
- **[VM08]** [Matchmaking and Autofill](https://support.riotgames.com/en-us/league-of-legends/gameplay/matchmaking-and-autofill), 페이지 표시일 2026-05-22.
- **[VM09]** [Patch 26.15 Notes](https://www.leagueoflegends.com/en-us/news/game-updates/league-of-legends-patch-26-15-notes/), 2026-07-28.
- **[VM10]** [Unlocking Game Modes](https://support.riotgames.com/en-us/league-of-legends/gameplay/unlocking-game-modes), 페이지 표시일 2026-05-29.
- **[VM11]** [/Remake FAQ](https://support.riotgames.com/en-us/league-of-legends/gameplay/remake-faq), 페이지 표시일 2026-03-23. 내부 잔여 문구 충돌 기록.
- **[VM12]** [Patch 26.14 Notes](https://www.leagueoflegends.com/en-us/news/game-updates/league-of-legends-patch-26-14-notes/), 2026-07-14.
- **[VM13]** [Patch 13.7 Notes](https://www.leagueoflegends.com/en-us/news/game-updates/patch-13-7-notes/), 2023. 항복의 역사적 변경.
- **[VM19]** [/dev: The Return of Ranked 5s](https://www.leagueoflegends.com/en-us/news/dev/dev-the-return-of-ranked-5s/), 2026-05-27.
- **[VM20]** [Patch 26.20 Notes](https://www.leagueoflegends.com/en-gb/news/game-updates/league-of-legends-patch-26-20-notes/), 2026-10-06.
- **[VM21]** [League of Legends — Ranked 5s Mode](https://support.riotgames.com/en-us/league-of-legends/events/ranked-5s), 페이지 표시일 2026-06-19, 본문에 이후 실험 내용 포함.
- **[VM24]** [/dev: Making Matchmaking Better](https://www.leagueoflegends.com/en-us/news/dev/dev-making-matchmaking-better/), 2018. 동시 밴·선택 단계 변경에 관한 역사 자료.
