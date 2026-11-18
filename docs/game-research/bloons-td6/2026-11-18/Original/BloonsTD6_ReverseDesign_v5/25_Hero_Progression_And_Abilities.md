# 영웅 레벨 및 능력

## 모델
HeroDefinition {id,placementCost,xpCurve,levelEffects,abilitySlots,targetingModes,uniqueMechanics}. HeroInstance {level,xp,abilityCooldowns,attackState,buffs}.

## XP
라운드 경과 기반 획득과 맵/모드 보정 분리. 다수 영웅 허용 여부는 모드 정책. 레벨업 시 공격 교체·능력 개방·범위 변경을 effect graph로 적용.

## 액티브 스킬
AbilityDefinition {id,cooldown,activationRules,targeting,duration,effects,uiIcon}. 수동 발동, 자동 발동 특수 규칙, 쿨다운 감소 버프를 지원.

## 테스트
레벨 경계에서 스킬 발동, 판매/재배치, 라운드 중 경험치, 영웅별 고유 공격과 Camo 대응, 능력 중첩.
