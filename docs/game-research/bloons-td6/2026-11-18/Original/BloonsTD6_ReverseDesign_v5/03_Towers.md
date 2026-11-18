# 타워 카탈로그와 역할

> Bloons TD 6 역기획 v2.0 | 공개 동작 분석 + 구현용 모델. 수치 예시는 원작 확정 데이터가 아닙니다.

## 분류
Primary: Dart Monkey, Boomerang Monkey, Bomb Shooter, Tack Shooter, Ice Monkey, Glue Gunner.
Military: Sniper Monkey, Monkey Sub, Monkey Buccaneer, Monkey Ace, Heli Pilot, Mortar Monkey, Dartling Gunner.
Magic: Wizard Monkey, Super Monkey, Ninja Monkey, Alchemist, Druid.
Support: Banana Farm, Spike Factory, Monkey Village, Engineer Monkey, Beast Handler.

## 타워 역할 태그
singleTarget, areaDamage, crowdControl, camoDetection, leadBreaker, moabSpecialist, supportAura, income, mapDependent, globalRange.

## 공통 파라미터
TowerDefinition {id,category,cost,footprint,range,attackInterval,targetingModes,projectiles[],upgradePaths[],placementMask}.

## 배치 검증
지형 허용 유형, 물/육지, 배치 반경, 기존 타워와 겹침, UI 차단 영역, 특수 오브젝트, 시야/사거리의 차이를 분리. 배치 미리보기는 적합=초록, 불가=빨강.

## 행동
타워는 공격·지원·수익 생성 중 하나 이상을 수행할 수 있다. 공격 타워도 다중 무기/오라/능력을 동시에 가질 수 있도록 컴포넌트화한다.
