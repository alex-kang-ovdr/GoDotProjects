# 91. 용어집과 문서 표기 규칙

[문서 목록](00_README.md) · [출처·버전](90_sources_version_ledger.md)

## 1. 읽는 방법

아래는 문서에서 쓰는 용어를 이해하기 위한 요약이다. 특정 항목의 정확한 수치·예외·현행 기능은 연결된 시스템 문서를 기준으로 읽는다. 커뮤니티 용어는 공식 번역과 다를 수 있다.

## 2. 경기와 역할

| 용어 | 영문·약어 | 이 문서에서의 의미 | 관련 문서 |
| --- | --- | --- | --- |
| 소환사의 협곡 | Summoner's Rift, SR | 기본 분석 대상으로 삼은 5대5 맵 | [01](01_core_match_loop.md) |
| 넥서스 | Nexus | 일반 협곡의 최종 파괴 목표 | [01](01_core_match_loop.md) |
| 포지션 | Position | 탑·정글·미드·봇·서포터 등의 배치·책임 | [02](02_champions_draft_roles.md) |
| 역할·클래스 | Role, Class | 탱커·암살자·마법사 등 전투 기능 분류 | [02](02_champions_draft_roles.md) |
| 드래프트 | Draft | 규칙에 따른 챔피언 선택·금지 과정 | [02](02_champions_draft_roles.md) |
| 밴·픽 | Ban, Pick | 선택 금지와 실제 선택 | [02](02_champions_draft_roles.md) |
| 조합 | Composition, Comp | 팀 챔피언들의 강점·약점 결합 | [12](12_team_macro_strategy.md) |
| 승리 조건 | Win Condition | 해당 조합·상황에서 승리로 연결할 경로 | [12](12_team_macro_strategy.md) |
| 포지션 퀘스트 | Role Quest | 포지션에 연결되는 진행·보상 규칙 | [02](02_champions_draft_roles.md) |
| 파워 스파이크 | Power Spike | 레벨·아이템 등으로 영향력이 크게 달라지는 시점 | [05](05_economy_experience.md) |

포지션과 전투 클래스는 일대일 대응하지 않는다. 예를 들어 특정 포지션에 탱커만 존재한다고 가정하면 조합과 시스템 범위를 잘못 제한하게 된다.

## 3. 전투와 능력치

| 용어 | 영문·약어 | 의미 | 관련 문서 |
| --- | --- | --- | --- |
| 기본 공격 | Basic Attack, AA | 챔피언의 반복 가능한 기본 공격 행위 | [03](03_combat_stats_damage.md) |
| 공격력 | Attack Damage, AD | 기본 공격과 일부 스킬 계산에 쓰는 능력치 | [03](03_combat_stats_damage.md) |
| 주문력 | Ability Power, AP | 일부 스킬·효과의 계수에 쓰는 능력치 | [03](03_combat_stats_damage.md) |
| 물리 피해 | Physical Damage | 방어력과 관련되는 피해 분류 | [03](03_combat_stats_damage.md) |
| 마법 피해 | Magic Damage | 마법 저항력과 관련되는 피해 분류 | [03](03_combat_stats_damage.md) |
| 고정 피해 | True Damage | 일반 저항 경감과 구별되는 피해 분류 | [03](03_combat_stats_damage.md) |
| 방어력 | Armor | 물리 피해에 대한 방어 능력치 | [03](03_combat_stats_damage.md) |
| 마법 저항력 | Magic Resistance, MR | 마법 피해에 대한 방어 능력치 | [03](03_combat_stats_damage.md) |
| 관통 | Penetration | 피해 계산에서 대상 저항의 영향을 줄이는 계열 | [03](03_combat_stats_damage.md) |
| 치명타 | Critical Strike | 조건과 확률에 따라 공격 피해가 변하는 규칙 | [03](03_combat_stats_damage.md) |
| 스킬 가속 | Ability Haste, AH | 스킬 사용 빈도와 관련되는 능력치 | [04](04_abilities_status_effects.md) |
| 재사용 대기시간 | Cooldown, CD | 사용 후 다시 사용하기까지의 제한 | [04](04_abilities_status_effects.md) |
| 군중 제어 | Crowd Control, CC | 이동·공격·시전 등의 행동을 제한하는 효과 | [04](04_abilities_status_effects.md) |
| 기본 지속 효과 | Passive | 지속 또는 조건 반응으로 작동하는 기능 | [04](04_abilities_status_effects.md) |
| 궁극기 | Ultimate | 챔피언의 중요한 기술 슬롯·기능 | [04](04_abilities_status_effects.md) |
| 재시전 | Recast | 기존 사용 이후 후속 단계 입력 | [04](04_abilities_status_effects.md) |
| 채널링 | Channeling | 일정 조건을 유지하며 수행하는 행동 | [04](04_abilities_status_effects.md) |
| 스킬샷 | Skillshot | 위치·방향·범위 등을 조준하는 공격 방식 | [04](04_abilities_status_effects.md) |
| 적중 시 효과 | On-hit | 정해진 적중 사건에 연결되는 추가 효과 | [03](03_combat_stats_damage.md) |
| 보호막 | Shield | 특정 피해를 먼저 받아내는 방어 효과 | [03](03_combat_stats_damage.md) |

AD가 높은 스킬도 마법 피해를 줄 수 있고, AP 계수가 있어도 피해 종류는 별도로 정의될 수 있다. 능력치 계수와 피해 분류를 같은 개념으로 사용하지 않는다.

## 4. 경제·라인·목표

| 용어 | 영문·약어 | 의미 | 관련 문서 |
| --- | --- | --- | --- |
| 막타 | Last Hit | 처치 직전의 결정적인 타격과 연결된 자원 확보 | [05](05_economy_experience.md) |
| CS | Creep Score | 미니언·몬스터 처치 진행을 나타내는 지표 | [05](05_economy_experience.md) |
| 경험치 | Experience, XP | 매치 내 레벨 또는 계정 성장에 쓰이며 둘은 별도 | [05](05_economy_experience.md) |
| 현상금 | Bounty | 조건에 따라 추가 보상을 제공하는 체계 | [05](05_economy_experience.md) |
| 웨이브 | Wave | 함께 이동하며 라인을 압박하는 미니언 묶음 | [10](10_lanes_minions_structures.md) |
| 푸시 | Push | 라인 압력을 상대 방향으로 보내는 행동 | [10](10_lanes_minions_structures.md) |
| 프리징 | Freeze | 웨이브를 유리한 위치에 오래 유지하는 관리 | [10](10_lanes_minions_structures.md) |
| 슬로 푸시 | Slow Push | 미니언을 누적해 큰 압력을 만드는 관리 | [10](10_lanes_minions_structures.md) |
| 포탑 | Turret | 통로와 공간을 방어하는 구조물 | [10](10_lanes_minions_structures.md) |
| 억제기 | Inhibitor | 라인 압박 규칙과 연결된 기지 구조물 | [10](10_lanes_minions_structures.md) |
| 정글 캠프 | Jungle Camp | 정글 중립 몬스터의 자원 단위 | [11](11_jungle_epic_objectives.md) |
| 갱킹 | Gank | 다른 지역에서 합류해 상대를 공격하는 행동 | [12](12_team_macro_strategy.md) |
| 카운터 정글 | Counter-jungling | 상대 정글 자원을 공격·차단하는 행동 | [11](11_jungle_epic_objectives.md) |
| 에픽 목표 | Epic Objective | 팀 단위 전략적 보상을 주는 주요 중립 목표 | [11](11_jungle_epic_objectives.md) |
| 스틸 | Steal | 상대가 진행하던 목표의 처치를 가져오는 행동 | [11](11_jungle_epic_objectives.md) |
| 리시·초기화 | Leash, Reset | 몬스터의 추적·전투 이탈 및 회복 관련 동작 | [11](11_jungle_epic_objectives.md) |

국내 커뮤니티의 “리시”는 아군이 정글 초반 사냥을 도와주는 뜻으로도 쓰인다. 본문에서 몬스터 AI의 leash 범위를 말하는지, 아군의 사냥 지원을 말하는지 문맥으로 구분한다.

## 5. 정보와 전략

| 용어 | 영문·약어 | 의미 | 관련 문서 |
| --- | --- | --- | --- |
| 전장의 안개 | Fog of War | 팀이 관측할 수 없는 월드 정보의 제한 | [09](09_vision_fog_information.md) |
| 와드 | Ward | 위치에 설치하는 시야 관련 수단 | [09](09_vision_fog_information.md) |
| 탐지 | Detection | 숨겨진 정보·개체를 드러내는 규칙의 집합 | [09](09_vision_fog_information.md) |
| 위장·투명 | Camouflage, Invisibility | 서로 구별해야 하는 은신 관련 상태 | [09](09_vision_fog_information.md) |
| 부쉬 | Brush | 시야와 진입 판단에 영향을 주는 수풀 지형 | [08](08_map_terrain_navigation.md) |
| 선이동 | Priority, First Move | 먼저 이동할 수 있는 상대적 여유 | [12](12_team_macro_strategy.md) |
| 로밍 | Roam | 주 담당 지역을 떠나 다른 지역에 영향 | [12](12_team_macro_strategy.md) |
| 템포 | Tempo | 행동을 실행하고 다음 행동으로 옮길 시간 우위 | [12](12_team_macro_strategy.md) |
| 이니시에이팅 | Engage | 팀 교전을 시작하는 행동 | [12](12_team_macro_strategy.md) |
| 디스인게이지 | Disengage | 상대 교전을 끊거나 거리를 만드는 행동 | [12](12_team_macro_strategy.md) |
| 필링 | Peel | 위협으로부터 아군 핵심 대상을 보호하는 행동 | [12](12_team_macro_strategy.md) |
| 분할 압박 | Split Push | 여러 지역의 압력을 함께 이용하는 전략 | [12](12_team_macro_strategy.md) |
| 교환 | Trade | 피해·자원·시간·목표를 맞바꾸는 선택 | [22](22_system_dependency_scenarios.md) |

## 6. 경쟁·계정·운영

| 용어 | 영문·약어 | 의미 | 관련 문서 |
| --- | --- | --- | --- |
| 매칭 평가 | MMR | 상대를 구성하는 내부 평가와 관련된 개념 | [15](15_matchmaking_ranked_social.md) |
| 리그 포인트 | LP | 표시 랭크 진행과 연결되는 포인트 | [15](15_matchmaking_ranked_social.md) |
| 티어·단계 | Tier, Division | 표시되는 경쟁 등급 구분 | [15](15_matchmaking_ranked_social.md) |
| 자동 배정 | Autofill | 매칭 필요에 따라 선호 외 포지션 배정 | [15](15_matchmaking_ranked_social.md) |
| 탈주·비활동 | Leave, AFK | 참가 상태와 행동 기여에 관한 분류 | [16](16_behavior_integrity_surrender.md) |
| 리메이크 | Remake | 조건을 만족한 불완전 경기의 특수 종료 | [16](16_behavior_integrity_surrender.md) |
| 명예 | Honor | 행동 평가·긍정적 기여와 연결된 진행 | [17](17_account_progression_collection.md) |
| 숙련도 | Mastery | 특정 챔피언의 플레이 축적 표현 | [17](17_account_progression_collection.md) |
| 파랑 정수 | Blue Essence, BE | 챔피언 등 계정 콘텐츠와 연결되는 재화 | [17](17_account_progression_collection.md) |
| RP | Riot Points | 유료 상점과 연결되는 재화 | [18](18_monetization_live_service.md) |
| 전리품 | Loot | 획득·변환·제작 등이 있는 보상 계열 | [18](18_monetization_live_service.md) |
| 배틀패스 | Battle Pass | 이벤트·시즌 진행과 보상 트랙 | [18](18_monetization_live_service.md) |
| PBE | Public Beta Environment | 개발·변경 사항을 시험하는 공개 테스트 환경 | [19](19_modes_practice_custom.md) |

MMR과 LP를 같은 숫자로 취급하지 않으며, 특정 등급의 현재 인구 비율·LP 경계·듀오 제한은 지역과 시즌에 따라 확인해야 한다.

## 7. 기술과 문서의 표기

| 표기 | 의미 |
| --- | --- |
| [공식] | 열람한 공식 공개 자료가 직접 뒷받침하는 사실 |
| [공식·당시] | 해당 공개 시점의 사실이며 현행 유지까지 보장하지 않음 |
| [보조 확인] | 별도 표시한 커뮤니티 자료의 확인 내용 |
| [분석] | 확인한 게임 구조에서 도출한 설계 해석 |
| [제안] | 재현을 위해 저자가 작성한 자료구조·절차·검증 규칙 |
| [예시]·가상 | 설명을 위한 입력·수치·플레이 상황 |
| [미확인]·패치 의존 | 추가 실측·현행 패치 확인이 필요한 내용 |
| `definition` | 패치·콘텐츠가 정의하는 규칙 데이터 |
| `state` | 이번 경기에서 변하는 실행 상태 |
| `command` | 플레이어·운영 측에서 요청한 의도 |
| `event` | 처리 후 확정됐거나 의미 있게 발생한 사건 |
| `snapshot` | 특정 시점의 상태 묶음 |
| 결정성 | 같은 통제 조건·입력에서 같은 핵심 결과를 얻는 성질 |
| 권한 | 어떤 주체가 상태를 결정하거나 정보를 받을 수 있는지 |

모든 코드 블록·YAML·자료구조는 별도 명시가 없는 한 [제안]이다. Riot의 실제 내부 클래스명·파일 포맷·패킷 필드를 인용한 것이 아니다.
