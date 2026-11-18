# 영웅 성장과 스킬

> Bloons TD 6 역기획 v2.0 | 공개 동작 분석 + 구현용 모델. 수치 예시는 원작 확정 데이터가 아닙니다.

## 개념
영웅은 매치 내 경험치를 축적하고 자동으로 레벨업하는 고유 타워다. 영웅별 공격, 버프, 액티브 스킬, 경험치 성장률이 다르다.

## 구조
HeroDefinition {id,baseStats,levelCurve,levelRewards,abilities,placementRules}; HeroInstance {level,xp,abilityCooldowns}.

## 레벨업
라운드/시간/모드 기반 경험치 지급 이벤트 → 레벨 요구치 비교 → 능력 해금/스탯 갱신 → UI 피드백. 한 이벤트로 여러 레벨 상승 가능.

## 테스트
배치 타이밍별 성장 차이, 레벨 보정, 스킬 쿨다운, 능력 중첩, 영웅 선택 제한, 영웅 제거/재배치 정책.
