# 몬스터·던전·루팅·경제

## 몬스터 등급별 HP

| 개체 | 구분 | Common | Elite | Nightmare | 기준 | 출처 |
| --- | --- | --- | --- | --- | --- | --- |
| Skeleton Footman | monster | 167 | 250 | 320 | HF132 | [Skeleton Footman](https://darkanddarker.wiki.spellsandguns.com/Skeleton_Footman) |
| Skeleton Archer | monster | 100 | 150 | 220 | HF132 | [Skeleton Archer](https://darkanddarker.wiki.spellsandguns.com/Skeleton_Archer) |
| Skeleton Guardsman | monster | 152 | 230 | 300 | HF132 | [Skeleton Guardsman](https://darkanddarker.wiki.spellsandguns.com/Skeleton_Guardman) |
| Skeleton Mage | monster | 150 | 250 | 350 | HF132 | [Skeleton Mage](https://darkanddarker.wiki.spellsandguns.com/Skeleton_Mage) |
| Zombie | monster | 240 | 350 | 450 | HF132 | [Zombie](https://darkanddarker.wiki.spellsandguns.com/Zombie) |
| Mummy | monster | 220 | 280 | 340 | HF132 | [Mummy](https://darkanddarker.wiki.spellsandguns.com/Mummy) |
| Spider Mummy | monster | 25 | 70 | 120 | HF132 | [Spider Mummy](https://darkanddarker.wiki.spellsandguns.com/Spider_Mummy) |
| Death Skull | monster | 26 | 45 | 80 | HF128 | [Death Skull](https://darkanddarker.wiki.spellsandguns.com/Death_Skull) |
| Goblin Warrior | monster | 144 | 214 | 284 | HF130 | [Goblin Warrior](https://darkanddarker.wiki.spellsandguns.com/Goblin_Warrior) |
| Goblin Archer | monster | 144 | 214 | 284 | HF130 | [Goblin Archer](https://darkanddarker.wiki.spellsandguns.com/Goblin_Archer) |
| Skeleton Champion | subboss | 750 | 1050 | 1300 | HF130 | [Skeleton Champion](https://darkanddarker.wiki.spellsandguns.com/Skeleton_Champion) |
| Wraith | subboss | 700 | 1000 | 1000 | HF129 | [Wraith](https://darkanddarker.wiki.spellsandguns.com/Wraith) |
| Cave Troll | boss | 2975 | 3965 | 4500 | HF132 | [Cave Troll](https://darkanddarker.wiki.spellsandguns.com/Cave_Troll) |
| Cyclops | boss | 4236 | 6293 | 미확인 | HF132 | [Cyclops](https://darkanddarker.wiki.spellsandguns.com/Cyclops) |

위 수치는 커뮤니티 스냅샷이다. Cyclops는 WIP 경고를 유지한다. Nightmare 빈 칸은 0HP도, 존재하지 않는다는 확정도 아니다. 개체별 순위와 패턴은 공통 HP×2/속도×1.2로 생성하지 않는다.

## 공격 피해와 AI는 다른 데이터

공격 66행은 원본 표의 패턴/등급별 피해와 impact를 정규화한 것이다. 모든 공격을 망라하지 않는다. 각 행의 windup/active/recovery/selection_weight는 미복원이며 null이다. 공격명을 확보했다고 그 공격의 궤적·추적·타깃 전환이 완성된 것은 아니다.

공식 HF130은 보스의 타깃 전환을 줄이고 예고 동작을 더 명확하게 개선했다고 설명하지만 정확한 위협도 식이나 회전속도를 공개하지 않는다. 따라서 원작 AI가 A*·가중치 위협도·특정 상태머신을 사용한다고 단정하지 않는다. [Hotfix #130](https://darkanddarker.com/news/228).

## 던전 구조

Season11의 Ruins 5×5는 모듈 배치다. v13의 31×31 바닥 타일과 같은 단위가 아니다. 맵·층·모드·모듈·고정 오브젝트·스폰 그룹을 독립 엔티티로 제안한다. 전체 모듈 도감·연결 소켓·드롭 배치·탈출 좌표는 이번 범위에서 복원하지 못했다. [Early Access Season #11](https://darkanddarker.com/news/223).

광원은 렌더링과 게임플레이 판정이 다르다. 원작 근거에는 연료, 벽 차폐, Illuminated, Swarm 보호 및 최종 단계 소등이 있다. 반경·연료량·단계별 정확한 시각은 미확인이다. 따라서 v13 횃불이 밝게 보인다는 이유로 Swarm 보호까지 구현됐다고 표시하면 안 된다. [Early Access Season #11](https://darkanddarker.com/news/223).

## 드롭·아이템 옵션

무기 개별 페이지는 전리품 개편 후 기존 드롭 정보가 부정확해 비활성화되었다고 명시한다. 이번 `loot_probabilities=null`은 0%가 아니고 **원작 확률 미확인**이다. 이전 기획서의 55/30/12/3% 및 v13 균등 랜덤은 원작 근거 표에서 제외한다. [Longsword](https://darkanddarker.wiki.spellsandguns.com/Longsword).

무기 84행은 source-tab별 기본 피해 범위다. 아이템 전체 DB, 옵션의 추출 가중치, 모든 방어구, 제작법, 상인 가격, 퀘스트 대사까지 복구한 것은 아니다. 탭과 희귀도, 전체 옵션풀의 매핑이 확인되기 전에는 원작 랜덤 아이템 생성기를 자동 구성하지 않는다.

## 경제 및 상태 전이 제안

`DungeonItem → ExtractedItem → StashItem → Sell/Equip/QuestSubmit`를 구분한다. 탈출은 소유권/위치 변경, 판매는 아이템 소비와 골드 생성이다. v13의 일괄 골드 환산을 두 트랜잭션으로 분해해야 한다. 이 처리 계층은 독립 구현 제안이다.

Looted/Handled/Supplied와 Expedition Only는 목적이 다른 제약이다. 퀘스트는 전역 Looted-only가 아니라 `accepted_states`를 가져야 한다. HF132에서 Lava Mushrooms의 Handled 제출이 허용된 예외를 테스트에 포함한다. [Hotfix #132](https://darkanddarker.com/news/230), [Looted Handled Supplied](https://darkanddarker.wiki.spellsandguns.com/Looted_Handled_Supplied).

Season11 Custom Expedition의 아이템은 해당 모드용이며 일반 콘텐츠에 반입되지 않는다. Skirmish는 보유 장비 실험과 던전 발견 아이템 반출 불가를 구분한다. 하나의 공용 탈출 보상 함수를 모든 모드에 적용하지 않는다. [Early Access Season #11](https://darkanddarker.com/news/223).
