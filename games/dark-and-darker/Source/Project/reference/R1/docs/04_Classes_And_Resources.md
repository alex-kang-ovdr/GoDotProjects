# 직업·능력·회복 자원

## 10개 직업 기본값

| 직업 | STR | VIG | AGI | DEX | WILL | KNOW | RES | HP | 근거 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Fighter | 15 | 15 | 15 | 15 | 15 | 15 | 15 | 100 | [Fighter](https://darkanddarker.wiki.spellsandguns.com/Fighter) |
| Barbarian | 20 | 25 | 13 | 12 | 18 | 5 | 12 | 117.5 | [Barbarian](https://darkanddarker.wiki.spellsandguns.com/Barbarian) |
| Ranger | 12 | 10 | 20 | 18 | 10 | 12 | 23 | 91 | [Ranger](https://darkanddarker.wiki.spellsandguns.com/Ranger) |
| Wizard | 6 | 7 | 15 | 17 | 20 | 25 | 15 | 83.5 | [Wizard](https://darkanddarker.wiki.spellsandguns.com/Wizard) |
| Rogue | 9 | 6 | 25 | 20 | 10 | 10 | 25 | 83.5 | [Rogue](https://darkanddarker.wiki.spellsandguns.com/Rogue) |
| Cleric | 11 | 13 | 12 | 14 | 23 | 20 | 12 | 95 | [Cleric](https://darkanddarker.wiki.spellsandguns.com/Cleric) |
| Bard | 13 | 13 | 13 | 20 | 11 | 20 | 15 | 96 | [Bard](https://darkanddarker.wiki.spellsandguns.com/Bard) |
| Warlock | 11 | 14 | 14 | 15 | 22 | 15 | 14 | 96.5 | [Warlock](https://darkanddarker.wiki.spellsandguns.com/Warlock) |
| Druid | 12 | 13 | 12 | 12 | 18 | 20 | 18 | 95.5 | [Druid](https://darkanddarker.wiki.spellsandguns.com/Druid) |
| Sorcerer | 10 | 10 | 10 | 18 | 25 | 20 | 12 | 90 | [Sorcerer](https://darkanddarker.wiki.spellsandguns.com/Sorcerer) |

표는 커뮤니티 HF132 표기 스냅샷의 기본값이다. 인게임 장비·버프·변신을 적용한 최종값이 아니다. 7속성 합이 동일하다고 모든 직업의 체력·이동·사용 장비가 같아지는 것도 아니다.

## 능력 분류

이번 `abilities`는 Fighter·Barbarian·Ranger·Wizard에서 24개 active skill과 12개 perk를 수록했다. `spells`는 Wizard 10개 주문을 별도 테이블로 둔다. 스킬 슬롯을 차지하는 Spell Memory와 기억에 장착되는 Fireball을 같은 종류로 셈하지 않는다.

| 직업 | 구분 | 이름 | 재사용(초) | 지속(초) | 횟수 | 출처 |
| --- | --- | --- | --- | --- | --- | --- |
| fighter | skill | Sprint | 28 | 6 | 미확인 | [Fighter](https://darkanddarker.wiki.spellsandguns.com/Fighter) |
| fighter | skill | Second Wind | 미확인 | 12 | 1 | [Fighter](https://darkanddarker.wiki.spellsandguns.com/Fighter) |
| fighter | skill | Adrenaline Rush | 28 | 8 | 미확인 | [Fighter](https://darkanddarker.wiki.spellsandguns.com/Fighter) |
| fighter | skill | Breakthrough | 24 | 12 | 미확인 | [Fighter](https://darkanddarker.wiki.spellsandguns.com/Fighter) |
| fighter | skill | Perfect Block | 8 | 12 | 미확인 | [Fighter](https://darkanddarker.wiki.spellsandguns.com/Fighter) |
| fighter | skill | Shield Slam | 6 | 3 | 미확인 | [Fighter](https://darkanddarker.wiki.spellsandguns.com/Fighter) |
| barbarian | skill | Rage | 28 | 6 | 미확인 | [Barbarian](https://darkanddarker.wiki.spellsandguns.com/Barbarian) |
| barbarian | skill | Achilles Strike | 24 | 8 | 미확인 | [Barbarian](https://darkanddarker.wiki.spellsandguns.com/Barbarian) |
| barbarian | skill | Blood Exchange | 28 | 10 | 미확인 | [Barbarian](https://darkanddarker.wiki.spellsandguns.com/Barbarian) |
| barbarian | skill | Reckless Attack | 24 | 8 | 미확인 | [Barbarian](https://darkanddarker.wiki.spellsandguns.com/Barbarian) |
| barbarian | skill | Savage Roar | 32 | 6 | 미확인 | [Barbarian](https://darkanddarker.wiki.spellsandguns.com/Barbarian) |
| barbarian | skill | War Cry | 28 | 8 | 미확인 | [Barbarian](https://darkanddarker.wiki.spellsandguns.com/Barbarian) |
| ranger | skill | Back Step | 12 | 0.2 | 미확인 | [Ranger](https://darkanddarker.wiki.spellsandguns.com/Ranger) |
| ranger | skill | Field Ration | 24 | 미확인 | 2 | [Ranger](https://darkanddarker.wiki.spellsandguns.com/Ranger) |
| ranger | skill | Multishot | 22 | 미확인 | 미확인 | [Ranger](https://darkanddarker.wiki.spellsandguns.com/Ranger) |
| ranger | skill | Quick Fire | 18 | 8 | 미확인 | [Ranger](https://darkanddarker.wiki.spellsandguns.com/Ranger) |
| ranger | skill | Quickshot | 22 | 미확인 | 미확인 | [Ranger](https://darkanddarker.wiki.spellsandguns.com/Ranger) |
| ranger | skill | True Shot | 18 | 8 | 미확인 | [Ranger](https://darkanddarker.wiki.spellsandguns.com/Ranger) |
| wizard | skill | Arcane Shield | 25 | 12 | 미확인 | [Wizard](https://darkanddarker.wiki.spellsandguns.com/Wizard) |
| wizard | skill | Arcane Surge | 18 | 12 | 미확인 | [Wizard](https://darkanddarker.wiki.spellsandguns.com/Wizard) |
| wizard | skill | Intense Focus | 18 | 미확인 | 미확인 | [Wizard](https://darkanddarker.wiki.spellsandguns.com/Wizard) |
| wizard | skill | Meditation | 45 | 24 | 미확인 | [Wizard](https://darkanddarker.wiki.spellsandguns.com/Wizard) |
| wizard | skill | Spell Memory | 미확인 | 미확인 | 미확인 | [Wizard](https://darkanddarker.wiki.spellsandguns.com/Wizard) |
| wizard | skill | Arcane Insight | 8 | 8 | 미확인 | [Wizard](https://darkanddarker.wiki.spellsandguns.com/Wizard) |
| fighter | perk | Barricade | 미확인 | 미확인 | 미확인 | [Fighter](https://darkanddarker.wiki.spellsandguns.com/Fighter) |
| fighter | perk | Counterattack | 미확인 | 미확인 | 미확인 | [Fighter](https://darkanddarker.wiki.spellsandguns.com/Fighter) |
| fighter | perk | Weapon Mastery | 미확인 | 미확인 | 미확인 | [Fighter](https://darkanddarker.wiki.spellsandguns.com/Fighter) |
| barbarian | perk | Robust | 미확인 | 미확인 | 미확인 | [Barbarian](https://darkanddarker.wiki.spellsandguns.com/Barbarian) |
| barbarian | perk | Axe Specialization | 미확인 | 미확인 | 미확인 | [Barbarian](https://darkanddarker.wiki.spellsandguns.com/Barbarian) |
| barbarian | perk | Crush | 미확인 | 미확인 | 미확인 | [Barbarian](https://darkanddarker.wiki.spellsandguns.com/Barbarian) |
| ranger | perk | Nimble Hands | 미확인 | 미확인 | 미확인 | [Ranger](https://darkanddarker.wiki.spellsandguns.com/Ranger) |
| ranger | perk | Quick Reload | 미확인 | 미확인 | 미확인 | [Ranger](https://darkanddarker.wiki.spellsandguns.com/Ranger) |
| ranger | perk | Sharpshooter | 미확인 | 미확인 | 미확인 | [Ranger](https://darkanddarker.wiki.spellsandguns.com/Ranger) |
| wizard | perk | Mana Surge | 미확인 | 미확인 | 미확인 | [Wizard](https://darkanddarker.wiki.spellsandguns.com/Wizard) |
| wizard | perk | Quick Chant | 미확인 | 미확인 | 미확인 | [Wizard](https://darkanddarker.wiki.spellsandguns.com/Wizard) |
| wizard | perk | Sage | 미확인 | 미확인 | 미확인 | [Wizard](https://darkanddarker.wiki.spellsandguns.com/Wizard) |

Arcane Shield는 개발자가 만든 가상의 명칭이 아니라 원작 Wizard 스킬이다. HP·보호막·주문횟수·장탄·쿨다운은 별도 자원이다. v13의 공용 마나100을 모든 직업에 적용하는 방식은 원작 복원 프로필에서 제외한다. [Wizard](https://darkanddarker.wiki.spellsandguns.com/Wizard), [Spells](https://darkanddarker.wiki.spellsandguns.com/Spells).

## 주문 및 회복

| 주문 | tier | 기본 시전(초) | 횟수 | 효과 데이터 |
| --- | --- | --- | --- | --- |
| Light Orb | 1 | 1 | 3 | {"duration_s": 40, "hidden_reveal_radius_m": 3, "light": true} |
| Zap | 1 | 1.25 | 5 | {"direct_base_damage": 20, "element": "light", "burn_base_damage": 1, "burn_s": 1} |
| Slow | 2 | 1.25 | 3 | {"move_speed_bonus": -0.4, "duration_s": 2} |
| Ignite | 2 | 0.75 | 10 | {"buff_s": 12, "hit_fire_base": 5, "hit_scaling": 0.5, "burn_base": 1, "burn_s": 1} |
| Ice Bolt | 2 | 1.25 | 5 | {"direct_base_damage": 30, "element": "ice", "scaling": 1, "impact_power": 4, "projectile_speed_mps": 14, "move_speed_bonus": -0.2, "action_speed_bonus": -0.2, "debuff_s": 1} |
| Haste | 3 | 0.75 | 4 | {"move_speed_bonus": 0.05, "action_speed_bonus": 0.1, "cast_speed_bonus": 0.1, "duration_s": 6} |
| Magic Missile | 3 | 1.25 | 10 | {"each_base_damage": 11, "element": "arcane", "scaling": 0.75, "impact_power": 2, "channel_s": 3, "interval_s": 0.3, "speed_mps": 7} |
| Invisibility | 4 | 0.75 | 4 | {"duration_s": 4, "move_speed_bonus": 0.05} |
| Fireball | 4 | 2 | 4 | {"direct_base_damage": 20, "splash_base_damage": 10, "element": "fire", "direct_scaling": 1, "splash_scaling": 1, "direct_impact": 6, "splash_impact": 4, "speed_mps": 12, "burn_base": 3, "burn_s": 3, "burn_scaling": 0.5, "direct_target_also_splash": true} |
| Explosion | 5 | 1.75 | 4 | {"base_damage": 28, "element": "fire", "scaling": 1, "mark_range_m": 8, "delay_s": 3, "radius_m": 1, "impact_power": 6, "burn_base": 3, "burn_s": 2, "cancel_on_caster_death_or_extraction": true} |

출처는 모두 [Wizard](https://darkanddarker.wiki.spellsandguns.com/Wizard)의 해당 주문 절이다. 표시된 시전시간은 기본 시간이며 캐릭터의 Spell Casting Speed 적용은 별도다.

물약은 기본회복량, 사용동작시간, 효과지속시간, 회복계수, 겹침 규칙을 분리해야 한다. 이번 표는 확인한 회복량·시간을 포함하며 같은 포션 효과의 중첩 정책 전체까지 복원했다고 주장하지 않는다. Bandage의 recoverable HP 제한은 일반 현재 HP 회복과 구분한다. [Potion of Healing](https://darkanddarker.wiki.spellsandguns.com/Potion_of_Healing), [Bandage](https://darkanddarker.wiki.spellsandguns.com/Bandage).

추천 `HealthState`는 current/max/recoverable을 명확히 정의하는 자체 설계다. 어떤 종류의 피해가 recoverable을 얼마나 남기는지는 해당 공식·실측이 확정되기 전까지 v13 가정값으로 채우지 않는다.
