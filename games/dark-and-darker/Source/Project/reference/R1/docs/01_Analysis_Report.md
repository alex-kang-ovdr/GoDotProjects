# 원작 분석·데이터 복원 및 재구축 보고서

## 1. 결론

기존 v13은 근접 충돌·AI·루팅·탈출이 연결된 독립 싱글플레이 프로토타입이다. 그러나 공용 스태미나·마나, 고정 100 HP, 자체 무기 시간, 자체 보스, 6×4 회전 가방, 탈출 자동 판매는 원작 데이터의 복원 결과가 아니다. 이번 작업은 **실행 구조의 완성도와 원작 일치도를 분리**하고 근거가 확보된 내용을 별도 데이터 계층으로 재구축했다.

복원 방식은 공식 패치 → 해당 패치의 명시적 변경 우선 → 개별 개체의 커뮤니티 스냅샷 → 미확인 필드 격리 순서다. 이전 기획의 예시 숫자는 근거 없이 승계하지 않는다.

## 2. 기준 버전과 주요 공식 규칙

목표는 **2026-11-17 조사 시점의 HF132**, 기반은 **2026-10-09 Season 11**이다. 공식 최신 목록 및 HF132 게시일을 확인했지만, 선택한 각 수치의 원천 자료는 서로 다른 패치를 표시한다. [공식 목록](https://darkanddarker.com/news/all), [Early Access Season #11](https://darkanddarker.com/news/223), [Hotfix #132](https://darkanddarker.com/news/230).

Season 11에는 1~3인 통합 매칭, Gear Score 브래킷 제거, Dark Swarm·광원의 상호작용, 아이템 개편, 모드별 반출 제약이 포함된다. 아이템 희귀도에서 자동 부여되던 기본 능력치가 삭제됐다는 설명을 **모든 희귀도별 무기 기본 피해 차이가 삭제됐다는 뜻으로 확대하면 안 된다.** `rules`와 `weapon_variants`를 분리한 이유다. [Early Access Season #11](https://darkanddarker.com/news/223).

HF132의 Attribute Bonus Ratio 50%는 피해 보너스 옵션의 적용 비율 변경이다. **기본 피해와 최종 피해 전체를 일괄 절반으로 만드는 값이 아니다.** 또한 Smite·Ignite·Blow of Corruption 등의 추가 근접 피해가 부위 배율의 영향을 받도록 변경되었다. 전체 피해 수식의 모든 연산 순서까지 이 한 문서가 확정해 주는 것은 아니므로 공식 전체 계산기는 보류한다. [Hotfix #132](https://darkanddarker.com/news/230).

입장·다음 층 진입 후 5초 보호는 이동·공격·스킬·상호작용으로 종료되며 Dark Swarm 같은 환경 피해를 막지 않는다. Fireball·Explosion·Chain Lightning의 벽·바닥·천장 차폐 문제도 HF132에서 수정되었다. 따라서 v13 통합 시 판정 종류와 피해 성분별 차폐를 별도로 검사해야 한다. [Hotfix #132](https://darkanddarker.com/news/230).

## 3. 이전 역기획에서 바로잡은 내용

| 이전 설명/프로토타입 | 이번 판정 | 근거 |
| --- | --- | --- |
| Arcane Shield를 개발용 이름으로 분류 | Wizard의 실제 스킬. 독립 창작 스킬 목록에서 제거 | [Wizard](https://darkanddarker.wiki.spellsandguns.com/Wizard) |
| 롱소드: 베기→역베기→찌르기 | 기본 공격 라벨 Pierce→Slash→Slash. 양손 무기 | [Longsword](https://darkanddarker.wiki.spellsandguns.com/Longsword) |
| 하나의 준비·활성·회복 시간으로 모든 연계 | Recover / Alternate Recover / Finish는 서로 다른 후속 분기 | [Attack Times](https://darkanddarker.wiki.spellsandguns.com/Attack_Times) |
| 상자별 55/30/12/3% 등 예시 확률 | 원작 확률이 아니므로 격리. 개편 후 드롭 표 비활성 경고 | [Longsword](https://darkanddarker.wiki.spellsandguns.com/Longsword) |
| 모든 직업이 HP100·마나100 | 10직업 기본 능력치 복원; 자원 모델은 직업별 분리 | [Wizard](https://darkanddarker.wiki.spellsandguns.com/Wizard) |
| 모든 물약이 즉시 +38HP | Healing Potion은 효과 지속시간; Bandage는 회복가능 체력 구분 | [Potion of Healing](https://darkanddarker.wiki.spellsandguns.com/Potion_of_Healing) |
| 모든 퀘스트가 Looted만 허용 | Lava Mushrooms의 Handled 허용 예외. 퀘스트별 acceptedStates 필요 | [Hotfix #132](https://darkanddarker.com/news/230) |
| 보스HP5000/6000·50%에서2페이즈 | 이전 수치는 가정. 트롤·사이클롭스 등급 수치는 별도 확보; 실제 단계 조건은 미복원 | [Cave Troll](https://darkanddarker.wiki.spellsandguns.com/Cave_Troll) |
| 탈출 시 장비가치 전부골드화 | 아이템 반출·보관·판매는 별도 시스템; 자동판매는 v13 편의규칙 | [Early Access Season #11](https://darkanddarker.com/news/223) |

## 4. 실제 데이터 범위

| 데이터 | 행 수 | 파일 |
| --- | --- | --- |
| 직업 기본 능력치 | 10 | data/classes.json / .csv |
| 무기 정의 | 12 | data/weapons.json / .csv |
| 무기 원시 탭 피해 범위 | 84 | data/weapon_variants.json / .csv |
| 공격 연계 시간 | 50 | data/attack_timings.json / .csv |
| 무기 행동 이동 보정 | 12 | data/weapon_movement.json / .csv |
| 선별 스킬·특성 | 36 | data/abilities.json / .csv |
| 위저드 주문 | 10 | data/spells.json / .csv |
| 몬스터·서브보스·보스 | 14 | data/monsters.json / .csv |
| 등급별 몬스터 수치 | 41 | data/monster_variants.json / .csv |
| 등급별 선별 공격 피해 | 66 | data/monster_attacks.json / .csv |
| 회복 아이템 탭 | 14 | data/consumables.json / .csv |
| 방패 저항·경직 참고 | 4 | data/shields.json / .csv |
| 원자적 게임 규칙 | 52 | data/rules.json / .csv |
| 출처 충돌 | 10 | data/conflicts.json / .csv |
| 미복원 영역 | 24 | data/unknowns.json / .csv |
| v13 전환 항목 | 22 | data/v13_gaps.json / .csv |
| 출처 목록 | 55 | data/sources.json / .csv |

직업 10종은 7개 기본 속성과 기본 HP를 수록했다. 무기 12종은 장착 제약·양손 여부·원시 충돌체 치수·피해 탭·행동 이동 보정을 가진다. 공격 시간은 유효 수치를 가져온 것만 채웠다. Longbow의 전체 당기기/발사 시간과 Crossbow의 미확인 구간을 추정하지 않았다.

몬스터 14종은 일반 적 10종, 서브보스 2종, 보스 2종이다. 개체별 등급 데이터는 별도 행이다. 예를 들어 Mummy Nightmare 행동속도 보너스 70%는 다른 몬스터의 일반적인 20%와 구분한다. Cyclops의 확인되지 않은 Nightmare 행은 생성하지 않았다. [Mummy](https://darkanddarker.wiki.spellsandguns.com/Mummy), [Cyclops](https://darkanddarker.wiki.spellsandguns.com/Cyclops).

회복 도구는 Healing Potion 및 Bandage의 원시 탭을 보존했다. 방패 4종 참고값은 버전이 확인되지 않아 `runtime_import=blocked_until_version_verified`로 표시했다. 자료가 있다는 이유만으로 현행 원작 모드에 적용하지 않는다.

## 5. 중요한 기술적 해석

### 5.1 수치는 모션을 대체하지 않는다

Longsword 1타는 Windup 0.932, Hit 0.229, Recover 0.283, Alternate Recover 0.522, Finish 1.005초다. 단발 종료 분기의 단순 합계는 `0.932 + 0.229 + 1.005 = 2.166초`, 다음 기본 연계로 넘어가는 분기는 `0.932 + 0.229 + 0.283 = 1.444초`다. 세 회복 항목을 모두 더하지 않는다. 이 값은 0% 행동속도 기준, hitstop 제외 분석이며 다음 공격의 준비 시간은 별도다. [Longsword](https://darkanddarker.wiki.spellsandguns.com/Longsword), [Attack Times](https://darkanddarker.wiki.spellsandguns.com/Attack_Times).

무기의 실제 사거리는 raw hitbox의 한 변을 m로 바꾸는 것만으로 얻을 수 없다. 소켓 위치, 손·몸통 자세, 공격 궤적, 이동, 월드 스케일이 필요하다. 따라서 `effective_reach_m`와 `motion_curve`는 미확인이다.

### 5.2 버전과 숫자의 의미를 함께 보존한다

무기 페이지의 I–VII를 임의로 Poor–Unique에 매핑하지 않았다. 페이지 원시 탭으로 식별하고 `rarity_id=null`로 보존한다. 마찬가지로 이동 rating을 v13의 m/s로 직접 대입하지 않는다. `Self -150` 같은 해석 불명 내부 필드도 런타임에서 사용하지 않는다.

재확인 과정에서 Longsword 페이지는 HF132 헤더와 동일한 공격 시간 표를 표시했다. 이 패키지의 Longsword는 최종 재확인 버전인 HF132를 기록한다. 다른 행은 각자 수집 시 표시한 버전을 유지한다. 한 페이지의 헤더 갱신으로 전체 데이터셋을 승격하지 않는다.

### 5.3 충돌·미복원 영역은 오류가 아니라 진행 상태다

`conflicts`에는 오래된 Smite 설명, 부위 배율 오기, Unique 옵션 설명과 개별 탭 차이, War Cry 예시 차이, 퀘스트 상태 예외 등이 들어 있다. 공식 패치로 해결된 항목과 여전히 실측이 필요한 항목을 나눴다. `unknowns`의 24개 영역에는 필요한 다음 증거와 차단 조건을 적었다.

## 6. v13에 적용할 구조

권장 계층은 `PrototypeRules`와 `OriginalEvidence`를 별도 네임스페이스로 유지하고, 검증을 마친 항목만 `OriginalRuntimeProfile`로 승격하는 방식이다. 이는 이번 문서의 구현 제안이며 원작 내부 아키텍처를 발견했다는 뜻이 아니다.

P0: 직업/장착 제약 → 주문 횟수·기억 → 공격 분기 → 피해 성분 → 회복가능 체력 → 아이템 인스턴스 반출·보관 순서로 전환한다. 드롭률·애니메이션·맵·보스 단계는 근거가 없는 동안 원작 완료 항목으로 표시하지 않는다. 상세 22개 항목은 `06_V13_Migration_Spec.md`에 있다.

## 7. 완료 범위와 검증 한계

이 자료는 **데이터 재구축 완료본 R1**이지 원작 전량 복구나 게임 패치 완료본이 아니다. 표의 식별자·참조·범위·누락·CSV/JSON 정합성을 검사했고 별도 단위 테스트를 수행했다. 원작 클라이언트와 1:1 대전 결과, 실제 애니메이션 프레임·소켓, 드롭률, AI 내부 알고리즘은 확인하지 않았다.

원본 바이너리/에셋/온라인 서버 구현은 포함하지 않는다. 사용자 제공 v13 원본은 그대로 두었으며, 이 패키지를 연다고 게임 규칙이 자동으로 바뀌지 않는다.
