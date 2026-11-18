# 전투·피해·방어 재구축

## 원작에서 확보한 부분 / 아직 필요한 부분

무기별 양손 여부·사용 직업·기본 피해 범위·타격 타입·연계 배율·시간 분기·이동 보정을 수록했다. 원본 애니메이션, 실제 스윕 볼륨, 공격 중 카메라 회전 제약, 부위별 정확한 충돌체는 확보하지 못했다. 복원 데이터와 구현 알고리즘은 별개다.

## 무기 정의

| ID | 이름 | 손 수 | 사용 직업 | 이동 rating | 기준 |
| --- | --- | --- | --- | --- | --- |
| dad.weapon.rondel_dagger | Rondel Dagger | 1 | wizard, rogue, bard, druid | -10 | HF130 |
| dad.weapon.arming_sword | Arming Sword | 1 | fighter, ranger, bard | -20 | HF130 |
| dad.weapon.falchion | Falchion | 1 | fighter, bard, warlock, sorcerer | -25 | HF130 |
| dad.weapon.longsword | Longsword | 2 | fighter, warlock, sorcerer | -40 | HF132 |
| dad.weapon.rapier | Rapier | 1 | ranger, rogue, bard | -17 | HF130 |
| dad.weapon.flanged_mace | Flanged Mace | 1 | fighter, cleric, druid | -25 | HF130 |
| dad.weapon.battle_axe | Battle Axe | 2 | fighter, barbarian | -45 | HF132 |
| dad.weapon.double_axe | Double Axe | 2 | barbarian | -45 | HF130 |
| dad.weapon.spear | Spear | 2 | fighter, druid | -40 | HF132 |
| dad.weapon.halberd | Halberd | 2 | fighter, warlock | -50 | HF130 |
| dad.weapon.longbow | Longbow | 2 | ranger | -50 | HF132 |
| dad.weapon.crossbow | Crossbow | 2 | fighter, ranger, wizard, bard | -50 | HF132 |

피해 84행과 시간 50행은 CSV/Excel을 사용한다. 예를 들어 `dad.attack.longsword.primary.1`의 분석값은 단발 종료 2.166초, 연계 분기 1.444초다. 다음 공격의 Windup은 이어지는 별도 레코드다. [Longsword](https://darkanddarker.wiki.spellsandguns.com/Longsword), [Attack Times](https://darkanddarker.wiki.spellsandguns.com/Attack_Times).

## 피해 파이프라인의 승인 조건

독립 구현에서는 WeaponBase / BuffBase / AddedDamage / TrueDamage / PowerBonus / Location / ArmorPenetration / Resistance / DamageType을 구분하도록 권장한다. 이 목록의 구체적 곱셈 순서는 이번에 확정하지 않았다. HF132의 50% 보너스 비율은 그중 명시된 옵션에 대한 패치 제약이다. [Hotfix #132](https://darkanddarker.com/news/230).

시험 행렬은 기본 무기만, 피해보너스 한 종류만, 신체 부위만, 방어만, 관통만 각각 바꿔서 구성한다. 무기 피해 분포가 있으면 롤 값과 서버 결과를 분리한다. 여러 요소를 동시에 바꿔 얻은 결과를 한 계수로 추정하지 않는다.

## 방어를 세 가지로 분리

- 일반 Block: 실제 접촉과 impact resistance에 따른 경직. stamina 자동 소모를 원작 사실로 가져오지 않는다.
- Riposte: 지원 무기의 방어 후 전용 연계. 단순 방패 perfect guard와 같지 않다.
- Impact Guard: Season11에서 일부 양손 무기에 추가된 타이밍 저항 강화. 공통 0.23초라는 근거 없음.

관련 자료: [Impact Power](https://darkanddarker.wiki.spellsandguns.com/Impact_Power), [Early Access Season #11](https://darkanddarker.com/news/223). 방패 참고값 4행은 버전 미확인으로 적용 차단 상태다.

## Fireball의 중복 판정

위저드 페이지의 Fireball은 직격 20, 범위 10, 연소 3/3초를 별도 성분으로 표시한다. v13의 고정44 단일 피해와 다르다. [Wizard](https://darkanddarker.wiki.spellsandguns.com/Wizard).

권장 중복키는 `(cast_id, effect_component_id, target_id, tick_index)`다. 직격과 폭발은 서로 다른 component이므로 같은 대상에 각각 들어갈 수 있다. 동일 폭발 성분이 여러 충돌콜백 때문에 반복 적용되는 것은 차단한다. 벽 뒤 대상에 폭발/연쇄가 통과하지 않도록 HF132의 수정사항을 회귀 테스트로 삼는다. 키 설계는 독립 구현 제안이다. [Hotfix #132](https://darkanddarker.com/news/230).

## 애니메이션 재구축 입력 계약

`AttackCurve`에는 손잡이·중간·끝점의 시간별 좌표, 측정 fps, 타이밍 표 버전, 좌표계, 캐릭터 기준높이, 캡처 카메라 정보를 기록한다. 원본 리소스가 없으면 실측에 의한 근사곡선임을 명시한다. 시간값만으로 새롭게 만든 모션은 원작 모션 복원으로 라벨링하지 않는다.
