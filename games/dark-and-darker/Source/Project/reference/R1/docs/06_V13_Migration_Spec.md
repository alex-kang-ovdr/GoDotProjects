# v13 → 원작 근거 모드 전환 명세

**상태: 설계 및 대응 데이터 제공. v13 코드 수정/재배포 없음.**

## 전환 원칙

기존 Playable 프로필은 보존한다. 새 `OriginalEvidence` 데이터가 `OriginalRuntimeProfile`로 승격되기 전에 미확인 필드·버전·아이템 동일성·단위 변환·출처 충돌을 검사한다. 새 모드의 전체 콘텐츠가 구현되었다고 선언하지 않는다.

원작 단일 플레이 경험을 위한 다운스케일 수치를 쓰려면 `rebalanced` 프로필로 분리하고 원본값·보정값·변경 이유를 모두 남긴다. HP를 낮춘 값을 원작값으로 덮어쓰지 않는다.

## 코드 위치별 22개 차이

| ID | 우선 | 현재 v13 | 필요한 원작 대응 | 코드 위치 | 수용 조건 | 근거 |
| --- | --- | --- | --- | --- | --- | --- |
| gap.class | P0 | 전 직업 공용 검·활·화염구 | 직업별 무기 허용·스킬·주문 구분 | src/game.js reset(), attack() | 파이터 기본 구성에서 주문 시전 불가; 특성 예외는 별도 | [Fighter](https://darkanddarker.wiki.spellsandguns.com/Fighter) |
| gap.mana | P0 | 마나100, 자동2.4/s, 화염구24비용 | Wizard 주문 횟수·기억; Warlock HP 비용 | src/game.js tick(), attack() | 공용 mana fallback 없음; 제한된 주문을 0회 이하 시전 금지 | [Spells](https://darkanddarker.wiki.spellsandguns.com/Spells) |
| gap.stamina | P1 | 공격·달리기·회피 공용 stamina | 원작 대응 미확인; 프로토타입 전용 유지 | src/game.js dodge(), tick(), attack() | 원작 프로필에 근거 없는 stamina 수치 포함 금지 | [Crypt of the Fallen v13 업로드 소스](local:DarkAndDarker_FPS_Web_v13.zip) |
| gap.weapon_identity | P0 | 낡은 장검 = 한손+방패 | Longsword는 양손; Arming Sword 후보 | src/core.js ITEMS; src/game.js shieldBox() | 자동 이름 치환 금지; 양손 장착 시 보조손 점유 검증 | [Longsword](https://darkanddarker.wiki.spellsandguns.com/Longsword) |
| gap.attack_timing | P0 | 검 .24/.28/.32초 단일 프로파일 | 무기·연계별 windup/hit/분기 recovery | src/core.js PROFILES | Finish/Recover/Alternate를 합산하지 않는 시간 테스트 | [Longsword](https://darkanddarker.wiki.spellsandguns.com/Longsword) |
| gap.collision | P1 | 절차 궤적·샘플 Sweep | 원본 애니메이션/충돌체 위치 미복원 | src/core.js bladePose(); game.js tickAttack() | 시간 표만 넣어 원작 궤적 재현이라 표시하지 않음 | [Attack Times](https://darkanddarker.wiki.spellsandguns.com/Attack_Times) |
| gap.parry | P0 | 범용 perfect guard와 반격 증폭 | 무기/방패 저항·Riposte·Impact Guard 분리 | src/game.js resolveShield() | 일반 방패에 임의 패링 창/강화 일괄 적용 금지 | [Early Access Season #11](https://darkanddarker.com/news/223) |
| gap.armor | P0 | 100/(100+armor*2) | 실제 Rating곡선/관통/부위/피해종류 분리 | src/game.js hit() | 미검증 전체 공식 승인 차단; 음수 DR 제거 금지 | [Damage](https://darkanddarker.wiki.spellsandguns.com/Damage) |
| gap.damage_bonus | P0 | 장비 bonus 직접 가산 | HF132 피해 보너스50% 비율 | src/game.js attack(), hit() | 기본 피해를 잘못 절반으로 만들지 않는 회귀검사 | [Hotfix #132](https://darkanddarker.com/news/230) |
| gap.fireball | P0 | 고정 피해44 투사체 | 직격20·폭발10·연소3 및 각각의 계수 | src/game.js attack(), tickProjectiles() | 같은 성분 중복0; 직격+폭발은 의도적 동시 허용; 벽 차폐 | [Wizard](https://darkanddarker.wiki.spellsandguns.com/Wizard) |
| gap.healing | P0 | 물약 고정38 회복 | 등급별 시간형 회복·붕대 회복가능 체력 | src/game.js tickAction() | 기본 회복량·효과지속·사용시간을 분리 | [Potion of Healing](https://darkanddarker.wiki.spellsandguns.com/Potion_of_Healing) |
| gap.monster_stats | P0 | 검사74·궁수57·수호자130HP | 개체·등급별 수치. 공통 등급 배율 아님 | src/game.js ENEMIES | Mummy Nightmare70%와 일반20% 행동속도 구분 | [Skeleton Footman](https://darkanddarker.wiki.spellsandguns.com/Skeleton_Footman) |
| gap.boss | P1 | Warden620HP·50%분기 | 트롤·사이클롭스 각각 별도 개체 | src/game.js ENEMIES.warden; tickEnemy() | Warden를 트롤로 이름만 변경하지 않음 | [Cave Troll](https://darkanddarker.wiki.spellsandguns.com/Cave_Troll) |
| gap.dungeon | P1 | 31x31 자체 타일 랜덤맵 | 시즌별 모듈 구조. Ruins5x5는 모듈 수 | src/core.js generateDungeon() | 연결성뿐 아니라 모듈·탈출·스폰 사실성 별도 검사 | [Early Access Season #11](https://darkanddarker.com/news/223) |
| gap.light | P1 | 횃불 렌더링 조명 | 연료·Illuminated·LOS·Swarm 보호 | src/renderer.js; src/scene.js | 보이는 조명과 판정 분리; 최종단계 휴대광원 소등 | [Early Access Season #11](https://darkanddarker.com/news/223) |
| gap.extraction | P0 | 장착+가방 가치 자동 골드화 | 아이템 인스턴스 반출·모드별 귀속 | src/game.js finish(); src/app.js save | 탈출로 장비 삭제 금지; 명시적 판매만 골드화 | [Early Access Season #11](https://darkanddarker.com/news/223) |
| gap.loot | P0 | 8종 균등랜덤 | 현행 드롭확률 미확인 | src/game.js loot() | 미확인 확률을 0 또는 균등분포로 원작값 생성 금지 | [Longsword](https://darkanddarker.wiki.spellsandguns.com/Longsword) |
| gap.inventory | P1 | 6x4·회전·간소 장비슬롯 | 원작 격자·슬롯 및 각 크기 실측 필요 | src/core.js Inventory; src/app.js | unknown footprint 원작모드 반입 차단 | [Early Access Season #11](https://darkanddarker.com/news/223) |
| gap.item_states | P0 | Looted/Handled/Supplied 없음 | 상태별 거래·퀘스트·모드 제한 | src/core.js ITEMS | Lava Mushrooms 예외 및 Supplied 거래 거부 | [Hotfix #132](https://darkanddarker.com/news/230) |
| gap.spawn | P1 | 진입 즉시 AI활동 | 5초 보호·행동 즉시 종료·환경제외 | src/game.js reset(), hit() | 행동 전 보호, 5초 종료, Swarm 피해 예외 테스트 | [Hotfix #132](https://darkanddarker.com/news/230) |
| gap.simulation_pause | P2 | F1 일시정지 | 싱글 편의기능; 온라인 원작 규칙과 격리 | src/game.js tick(); src/app.js | 오프라인 옵션으로 표시; 온라인 원작 구현으로 홍보 금지 | [Crypt of the Fallen v13 업로드 소스](local:DarkAndDarker_FPS_Web_v13.zip) |
| gap.economy | P1 | 정산 골드만 저장 | 보관함·상인·Ante·제작·거래 분리 | src/app.js persistence | 판매/보관/입장료 서로 다른 트랜잭션 | [Early Access Season #11](https://darkanddarker.com/news/223) |

## 구현 순서와 실패 처리

### P0-1: 출전 장비와 직업

ClassDefinition의 allowed weapons → 장착 검증 → 한손/양손 점유 → 스킬과 주문 슬롯을 먼저 연결한다. 기존 rustSword는 한손·방패용이므로 Longsword로 자동 매핑하지 않는다. Wizard는 캐스터 도구와 주문 기억/횟수가 필요하다. 객체명만 교체하는 마이그레이션은 실패로 처리한다.

### P0-2: 전투·회복

각 공격의 Windup/Hit/분기별 Recovery 및 능력의 독립 효과를 데이터 로드한다. 누락된 time나 motion_curve가 있으면 fidelity=unverified를 유지한다. 기존 피해 공식과 stamina의 편의규칙은 PrototypeRules에 남긴다. 회복가능 체력·시간형 물약을 먼저 구현하고 더 높은 체력 몬스터를 도입해 난이도 폭증을 피한다.

### P0-3: 소유권·탈출·보관

아이템 instance_id를 유지하며 match inventory에서 stash로 이동한다. 명시적 Sell 트랜잭션만 골드를 생성한다. 오류/재시도로 item이 복제되거나 삭제되지 않도록 결과 idempotency key를 가진다. 이것은 웹 프로토타입의 독립 아키텍처 제안이며 원작 서버 구현을 복원했다는 의미가 아니다.

### P1: 적·던전·광원

원작 몬스터 원형을 새 ID로 추가하고 v13 warden는 custom_only로 유지한다. 모듈 맵과 광원 보호는 수치·위치 실측 후 추가한다. 드롭·보스 HP50% 분기·AI 가중치를 가정으로 채운 버전은 fidelity=prototype로 표시한다.

## 승인 기록 예시

```json
{
  "target_patch": "HF132",
  "profile_kind": "original_evidence_candidate",
  "automatic_import": false,
  "item_identity_reviewed": false,
  "unknown_fields": ["motion_curve", "effective_reach_m"],
  "runtime_approved": false,
  "prototype_fallback_allowed": false
}
```

후속 구현자가 승인 플래그만 true로 바꾸어 해결하지 않도록, unknown_fields가 남으면 full-original 인증을 거부하는 검사를 유지한다. 계산기·로더·QA는 출처의 진실성을 대신하지 않는다.
