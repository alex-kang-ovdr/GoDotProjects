# 10. 계정 성장·트로피 진척도·랭크

> 조사 기준: 2026-11-13. 장기 성장과 경쟁 진척도를 분리해 분석한다. **[확인]**은 공식 규칙, **[분석]**은 설계 해석, **[재현 설계]**는 구현 제안, **[검증 필요]**는 공개 자료의 충돌 또는 미공개 조건이다. 11월 신규 Crown Series의 상세는 [11 매칭·모드 문서](11_matchmaking_and_game_modes.md)를 참조한다.

## 1. 하나의 레벨로 합치면 안 되는 성장 축

| 축 | 의미 | 증가 원인 | 전투와의 관계 |
| --- | --- | --- | --- |
| 카드 레벨 | 개별 카드의 영구 성장 | 카드·골드 소비 | 해당 카드의 능력치 |
| Collection Level | 컬렉션 전체 성장의 합 | 카드 해금·강화·형태 해금 | 직접 능력치보다 계정 보상 진척 |
| King Tower Level | 타워 성장 상태 | 일정 수준 카드 수 충족 | 타워 성능·타워 유닛 상한 |
| Trophy Road | 영구 구간을 올라가는 경쟁 진척 | 1대1 승패 | 아레나·콘텐츠 접근·보상 |
| Seasonal Trophy Road | 상위 플레이어의 시즌 과제 | 시즌 내 승패 | 새로운 덱 사용 및 시즌 보상 |
| Ranked | 시즌별 경쟁 성취 | 리그 단계·최상위 순위 | 경쟁 목표와 반복 보상 |

**[분석]** 덱 레벨이 높다고 반드시 랭크가 높은 것은 아니며, 랭크가 높다고 모든 카드가 잘 성장한 것도 아니다. 각 축을 독립적으로 저장해야 콘텐츠 접근, 상대 검색, 보상과 프로필을 일관되게 처리할 수 있다.

## 2. XP에서 Collection Level로 전환

**[확인]** 2026-05-13 공식 공지는 05-26 업데이트에서 King's Journey와 XP를 없애고 Collection Level을 도입한다고 설명했다. 이후 지원 문서도 이 체계를 안내한다. 과거의 “카드 강화·기부로 XP를 쌓아 킹 레벨을 올린다”는 모델을 현행 계정 성장으로 쓰지 않는다. [E13](https://supercell.com/en/games/clashroyale/blog/news/new-collection-levels-and-mastery-changes/), [E11](https://support.clashroyale.com/hc/en-us/articles/50815299122459-Collection-Level)

**[확인]** Collection Level은 보유한 카드 레벨의 합에 해금한 진화와 히어로 형태마다 5를 더한 값이다. 타워 유닛도 포함하고 Merge Tactics Rulers는 제외한다. 새 카드 해금은 그 카드의 시작 레벨만큼, 일반 업그레이드는 희귀도와 무관하게 1씩 증가시킨다. [E11](https://support.clashroyale.com/hc/en-us/articles/50815299122459-Collection-Level)

```text
CollectionLevel
  = Σ ownedCardLevel
  + 5 × unlockedEvolutionCount
  + 5 × unlockedHeroCount

포함: 영구 카드 레벨, 타워 유닛
제외: 미소유 카드, 임시 부스트 레벨, Merge Tactics Rulers
```

위 수식의 임시 부스트 제외는 영구 컬렉션 합산을 재현하기 위한 모델링 원칙이다. 공식 지원의 “보유 카드 레벨”을 영구 자산으로 해석한 것이며, 부스트 UI 수치를 재합산해서 계정 보상을 반복 생성해서는 안 된다.

**가상 계산 예시:** 일반 전투 카드 레벨 합이 178이고 타워 유닛 합이 22, 진화 3개와 히어로 2개를 보유했다면 `178 + 22 + 15 + 10 = 225`다. 임시 부스트로 카드의 전투 레벨이 3 높아져도 컬렉션 영구 자산은 달라지지 않는다.

**[확인·개편 기준]** 최초 Collection Level 보상은 20, 이후 기본 간격은 10이며 1,500에 도달한 이후에는 5단위 보상이 배치된다. 보상 종류별 전체 수량은 업데이트될 수 있어 공식 표로 연결하고 여기서는 구조만 사용한다. [E13](https://supercell.com/en/games/clashroyale/blog/news/new-collection-levels-and-mastery-changes/)

## 3. King Tower Level의 별도 조건

**[확인]** 킹 타워 레벨은 특정 레벨 이상의 카드 수를 만족하면 자동 상승한다. 현재 지원의 예를 들면 킹 타워 14는 레벨 13 이상 카드 12개, 킹 타워 16은 레벨 15 이상 카드 14개가 필요하다. 타워 유닛과 Merge Tactics Rulers는 이 카드 수 계산에 포함하지 않는다. 킹 타워 레벨은 타워 유닛의 성장 상한에도 관여한다. [E12](https://support.clashroyale.com/hc/en-us/articles/50815997602715-King-Tower-Level)

**[분석]** Collection Level은 넓은 컬렉션 전체의 합이고, 킹 타워 조건은 일정 수준 이상의 준비된 카드 수다. 낮은 레벨 카드를 많이 확보하는 것과 고레벨 카드들을 일정 수 갖추는 것을 다른 목표로 만든다. 이 구조는 주력 8장만 강화하는 전략과 다른 모드에 대응할 카드 폭을 확보하는 전략 사이에 선택을 만든다.

**[재현 설계]** 자동 상승 검사:

```text
for candidateKingLevel in ascending order:
  thresholdLevel, requiredCount = KingRequirement[candidateKingLevel]
  eligible = count(normalBattleCards where ownedLevel >= thresholdLevel)
  if eligible >= requiredCount:
    mark requirement fulfilled

최종 적용: 마이그레이션 보존 규칙까지 반영한 가장 높은 유효 단계
```

**[검증 필요]** 과거 계정의 킹 타워를 낮추지 않는 전환 보존 정책이 있으므로, 현재 카드 수만 역산해서 기존 플레이어의 킹 타워 레벨이 잘못됐다고 결론 내리면 안 된다. 신규 계정 조건과 기존 계정의 전환 이력을 구별해야 한다. [E13](https://supercell.com/en/games/clashroyale/blog/news/new-collection-levels-and-mastery-changes/)

## 4. Trophy Road의 핵심 규칙

**[확인]** 트로피 진척도는 1대1 전투 결과로 트로피를 얻고 잃는다. 변동량은 양측 트로피 차이에 영향을 받는다. 아레나에 도달하면 트로피 게이트가 생겨 패배해도 이전 아레나로 내려가지 않으며, 지원 문서는 일부 아레나 진입에 최소 킹 타워 조건도 설명한다. 현재 일반 진척도 끝과 Seasonal Trophy Road 진입 경계는 14,000이다. [E14](https://support.clashroyale.com/hc/en-us/articles/49484914645915-Trophy-Road)

**[분석]** 영구 게이트는 패배 위험을 완전히 없애지 않으면서 이미 달성한 큰 목표를 보존한다. 다음 아레나 직전에는 긴장이 높고, 도달 직후에는 새 덱을 시험할 여유가 생긴다. 다만 게이트 근처의 레벨 차이·승률 변화가 지나치면 전투 실력보다 성장 비용이 진척을 결정한다고 느끼기 쉽다.

**[재현 설계]** 트로피 변동은 다음 구조로 모델링하되 공식이 공개되지 않은 `F`를 임의의 Elo 수식으로 확정하지 않는다.

```text
rawDelta = F(playerTrophies, opponentTrophies, result, modeRules)
newTrophies = ApplyGateAndBounds(oldTrophies + rawDelta)
newArena = EvaluateArenaEntry(newTrophies, kingTowerLevel, ruleVersion)
```

게이트·승리량·패배량·랭크 접근은 별도 설정이다. 특정 스크린샷에서 `+30`이 보였다고 모든 모드·구간의 승리량을 30으로 고정해서는 안 된다.

## 5. Seasonal Trophy Road

**[확인]** 현재 지원 기준 두 단계 구조다. 첫 아레나는 시즌 트로피 0에서 500까지 진행하며, 두 번째에서는 첫 아레나에서 가장 많이 승리한 카드 8개가 금지된다. 두 번째 아레나에 진입하면 시즌 리셋 전에는 첫 아레나로 돌아가지 못하고, 레벨 15 미만 카드는 임시로 15까지 보정된다. 시즌 종료 때 시즌 트로피와 금지는 초기화되며 일반 Trophy Road 진척도는 유지된다. 해당 시즌의 미수령 보상은 자동 지급된다. [E15](https://support.clashroyale.com/hc/en-us/articles/49484906823195-Seasonal-Trophy-Road)

**[확인·출처 충돌]** 현재 지원 문서는 두 번째 아레나 500 이후 추가 보상 없이 계속 트로피를 얻고, 획득량이 30에서 6으로 줄어든다고 안내한다. 반면 2026-05-21의 June Update 공지는 끝단에서 트로피가 고정된다고 설명했다. 이 문서는 현재 지원의 설명을 우선한 **조회일 스냅샷**으로 사용하며, 변경일과 실제 계정 적용 상태는 확인하지 못했다. [E15](https://support.clashroyale.com/hc/en-us/articles/49484906823195-Seasonal-Trophy-Road), [E25](https://supercell.com/en/games/clashroyale/blog/release-notes/june-update-2026/)

**[분석]** 첫 단계에서 주력 덱의 숙련을 검증하고, 다음 단계에서 다른 카드 활용을 요구하는 구조다. 단순히 카드 수집을 늘리게 하는 데 그치지 않고, 이미 잘 쓰는 8장이 사라진 상황에서도 덱의 역할을 다시 구성할 수 있는지를 시험한다. 레벨 하한 보정은 새로운 덱 사용에 필요한 추가 성장 비용을 완화한다.

**[검증 필요]** 동률 카드의 밴 선정 순서, 타워 유닛의 밴 통계 포함 여부, 진화·히어로 형태별 승리 집계를 원본 카드로 합치는 방식은 일반 지원 설명만으로 확정할 수 없다. 재현 설계에서는 명시적인 tie-break 규칙을 두고 금지 확정 전 미리보기로 보여 주는 것이 적합하다.

## 6. Ranked의 단계와 리셋

**[확인]** 현재 지원 문서는 Ranked를 7개 리그로 설명한다. 승패에 따라 이동하는 돌 계단과 도달 후 그 아래로 내려가지 않는 황금 계단이 있고, 최상위 Ultimate Champion에서는 계단 대신 순위를 겨룬다. 시즌은 매월 첫 월요일 시작하며, 리셋 후 Master I에서 다시 진행한다. 직전 시즌 Grand Champion 이상 달성 시 복귀를 돕는 승리 배수가 적용되고 승리마다 감소한다. [E16](https://support.clashroyale.com/hc/en-us/articles/49484907381019-Ranked)

**[확인]** 2026년 9월 공식 변경에 따르면 Ultimate Champion 경기의 무승부에서는 양측 모두 일반 패배로 잃었을 트로피의 절반을 잃는다. 해당 리그의 정산 규칙이며 일반 Trophy Road 무승부에 확대 적용하지 않는다. [E29](https://supercell.com/en/games/clashroyale/blog/release-notes/new-season-minion-academy/)

### 6.1 2026년 11월 진입 트로피: 단일 값으로 확정하지 않음

| 공식 출처 | 설명 | 본 문서 처리 |
| --- | --- | --- |
| 2026-07-14 변경 공지 | 7~8월 13,000 → 9~10월 13,500 → 11월 14,000 | 날짜가 있는 변경 일정의 기준값 |
| 조회일 현재 Ranked 지원 문서 | 13,000 또는 전 시즌 Champion 리그 달성 | 상시 안내 페이지의 상충 값 |

**[검증 필요]** 따라서 2026-11-13의 신규 진입 요구량은 **공식 일정상 14,000**으로 해석되지만, 실제 클라이언트에서 확인한 현행 확정값으로 표시하지 않는다. 기존 자격 보존·직전 시즌 실적 경로와 신규 진입 경로도 분리해야 한다. [E17](https://supercell.com/en/games/clashroyale/blog/news/update-to-ranked-trophy-requirements/), [E16](https://support.clashroyale.com/hc/en-us/articles/49484907381019-Ranked)

### 6.2 레벨 상한과 신규 경쟁 모드

**[검증 필요]** 2025년 말 공지에 “2026년 5월까지 Ranked 레벨 15 제한”이 있었다는 사실만으로 11월 전체 리그의 상한을 추정하지 않는다. 실제 시즌·리그별 규칙을 읽어 적용해야 한다. Crown Series 역시 별도 경쟁 모드로 분석하며, 새로운 모드가 생겼다는 이유만으로 기존 Ranked가 삭제되었다고 가정하지 않는다. [E10](https://supercell.com/en/games/clashroyale/blog/release-notes/december-update-2025/)

## 7. 보상 분리와 시즌 처리

**[확인]** Ranked에는 처음 도달할 때 받는 일회성 보상과 시즌마다 다시 열리는 보상이 구분된다. [E16](https://support.clashroyale.com/hc/en-us/articles/49484907381019-Ranked)

**[재현 설계]** 같은 위치에 보이는 보상이라도 수령 키를 다음처럼 분리한다.

```text
영구 보상: playerId + roadId + milestoneId
시즌 보상: playerId + modeId + seasonId + milestoneId
전환 보상: playerId + migrationVersion + rewardId
```

시즌 종료 절차는 “전투 결과 확정 경계 → 이전 시즌 성적 보존 → 미수령 보상 처리 → 다음 시즌 상태 생성” 순서를 명시해야 한다. 월요일 00시와 같은 기기 현지 시각을 임의로 사용하지 않고 서버가 제공하는 시즌 종료 시각을 기준으로 한다.

**[재현 설계]** 종료 직전에 시작한 매치를 이전 시즌에 귀속할지, 결과 수신 시점의 시즌에 귀속할지는 제품 정책이다. 실제 Clash Royale 내부 정책은 공개 자료만으로 확정하지 않았으므로 양쪽 경우를 검증 대상으로 둔다.

## 8. UI와 데이터 설계

| 화면 정보 | 항상 같이 보여야 할 내용 | 이유 |
| --- | --- | --- |
| 계정 Collection Level | 다음 보상까지 부족량 | 전투 랭크와 혼동 방지 |
| King Tower Level | 필요한 카드 수준과 현재 충족 수 | 성장 방법을 설명 |
| Trophy Road | 현재 게이트·다음 아레나·보상 | 패배 시 손실 범위를 예측 |
| Seasonal Road | 시즌 잔여 시간·밴 카드·레벨 보정 | 일반 트로피와 구별 |
| Ranked | 리그·계단·보호 상태·리셋 조건 | 도전의 위험과 복귀 경로 설명 |

**[재현 설계]** 핵심 객체는 `CollectionProgress`, `KingTowerProgress`, `PermanentTrophyProgress`, `SeasonalRoadProgress`, `RankedSeasonProgress`, `MilestoneClaims`로 나눈다. 하나의 `playerLevel` 또는 `trophies` 필드에 모든 값을 저장하지 않는다.

## 9. QA와 성장 분석

| ID | 조건 | 검증 결과 |
| --- | --- | --- |
| AC-01 | 미보유 고희귀도 카드 최초 획득 | 시작 레벨만큼 Collection 증가 |
| AC-02 | 진화 중복 보상 수령 | 이미 소유한 형태에 +5 재부여 안 함 |
| AC-03 | 타워 카드 강화 | Collection에는 반영, 킹 타워 자격 카드 수에는 제외 |
| AC-04 | 부스트 적용·만료 | 영구 성장 보상 변화 없음 |
| AC-05 | 트로피 게이트 바로 위 패배 | 해당 모드 게이트 아래로 감소하지 않음 |
| AC-06 | 시즌 II 금지 카드가 저장 덱에 있음 | 매칭 전 명확한 수정 안내 |
| AC-07 | 시즌 종료 중 결과 지연 | 정해진 귀속 정책대로 한 시즌에만 적용 |
| AC-08 | 일회성 보상 구간 재도달 | 재지급하지 않음 |
| AC-09 | 시즌 보상 구간 다음 시즌 재도달 | 새 시즌 보상 정상 지급 |
| AC-10 | 신규 요구량 변경 시 기존 자격 사용자 | 별도 자격 보존 정책을 적용 |

**[분석]** 지표는 아레나 도달 시간, 게이트 직전 패배 연속 길이, 신규 덱 사용 비율, Collection 대비 주력 덱 준비도, 시즌 복귀 소요 경기 수로 나누는 것이 적합하다. 계정 성장과 실력 진척이 모두 멈춘 구간은 다른 시스템에서 작은 목표를 제공하는 식으로 완화할 수 있다. 실제 운영 KPI나 매칭 조정 방식이 공개됐다는 뜻은 아니다.

## 10. 출처

- **E10** [December Update 2025](https://supercell.com/en/games/clashroyale/blog/release-notes/december-update-2025/), 2025-11-21.
- **E11** [Collection Level](https://support.clashroyale.com/hc/en-us/articles/50815299122459-Collection-Level), 공식 지원, 2026-11-13 조회.
- **E12** [King Tower Level](https://support.clashroyale.com/hc/en-us/articles/50815997602715-King-Tower-Level), 공식 지원, 2026-11-13 조회.
- **E13** [New Collection Levels & Mastery Changes](https://supercell.com/en/games/clashroyale/blog/news/new-collection-levels-and-mastery-changes/), 2026-05-13, 적용 예고 05-26.
- **E14** [Trophy Road](https://support.clashroyale.com/hc/en-us/articles/49484914645915-Trophy-Road), 공식 지원, 2026-11-13 조회.
- **E15** [Seasonal Trophy Road](https://support.clashroyale.com/hc/en-us/articles/49484906823195-Seasonal-Trophy-Road), 공식 지원, 2026-11-13 조회.
- **E16** [Ranked](https://support.clashroyale.com/hc/en-us/articles/49484907381019-Ranked), 공식 지원, 2026-11-13 조회. 진입 트로피는 E17과 충돌.
- **E17** [Update to Ranked Trophy Requirements](https://supercell.com/en/games/clashroyale/blog/news/update-to-ranked-trophy-requirements/), 2026-07-14.
- **E25** [June Update 2026](https://supercell.com/en/games/clashroyale/blog/release-notes/june-update-2026/), 2026-05-21. Seasonal Road 끝단 규칙은 E15와 충돌.

- **E29** [New Season: Minion Academy!](https://supercell.com/en/games/clashroyale/blog/release-notes/new-season-minion-academy/), Supercell, 2026-09-07 게시, 본문 September 1 변경 절. Ultimate Champion 무승부 정산.
