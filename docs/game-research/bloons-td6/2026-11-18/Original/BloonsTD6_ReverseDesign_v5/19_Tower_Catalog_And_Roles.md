# 타워 카탈로그 및 역할별 분석

## 범위와 검증
원작 기본 타워 23종을 중심으로 한 카탈로그. 신규 업데이트 타워 및 패치별 변동은 별도 확인이 필요하다. 아래 역할은 구현용 분석 분류이며 원작 내부 enum이 아니다.

|군|타워|핵심 역할|주요 구현 이슈|
|---|---|---|---|
|Primary|Dart Monkey|저가 범용|직선 투사체, 관통|
|Primary|Boomerang Monkey|경로 다중 타격|왕복 곡선, 타격 이력|
|Primary|Bomb Shooter|폭발 광역|폭발 반경, Black 면역|
|Primary|Tack Shooter|방사형 다발|발사각, 다중 투사체|
|Primary|Ice Monkey|빙결 제어|빙결 면역, 범위 오라|
|Primary|Glue Gunner|지속 둔화|상태 중복·우선순위|
|Military|Sniper Monkey|전역 단일 대상|시야 무관 타게팅, 특수 탄|
|Military|Monkey Sub|수상 지원|수면 배치, 탐지 공유|
|Military|Monkey Buccaneer|수상 다목적|함포, 항공기, 경제|
|Military|Monkey Ace|비행 경로|비행 궤적, 폭탄 낙하|
|Military|Heli Pilot|추적 비행|이동 타게팅, 수송|
|Military|Mortar Monkey|지정 지역 포격|낙하 지연, 명중 반경|
|Military|Dartling Gunner|조준 연속 화력|커서 조준, 빔 충돌|
|Magic|Wizard Monkey|마법 범위|소환, DoT, 탐지|
|Magic|Super Monkey|고속 화력|높은 투사체 처리량|
|Magic|Ninja Monkey|은신 대응|추적, 감속, 폭탄|
|Magic|Alchemist|강화 지원|버프 지속·횟수|
|Magic|Druid|자연 마법|연쇄·지역 효과|
|Support|Banana Farm|현금 생산|라운드 수익, 수확 UX|
|Support|Spike Factory|경로 설치|잔존 스파이크 수명|
|Support|Monkey Village|버프·할인|오라, 중첩 정책|
|Support|Engineer Monkey|설치·지원|센트리 수명, 함정|
|Support|Beast Handler|동물 합성|연결·합성 단계|

## 공통 데이터 계약
TowerDefinition = {id,category,placementTags,footprint,costByDifficulty,range,targetingModes,attackIds,upgradePaths,abilityIds,buffIds}; TowerInstance = {id,definitionId,position,rotation,upgradeTiers:[a,b,c],targetingMode,cooldowns,activeBuffs,statsSnapshot}.

## 구매/배치 판정
1. UI 선택 2. 좌표를 월드로 변환 3. 지형 태그 검사 4. 충돌 footprint 검사 5. 현금 확인 6. 비용 원자적 차감 7. 인스턴스 생성. 배치 미리보기에서 범위와 충돌 실패 사유 표시.

## 수용 기준
지상/수상 배치, 다중 타워 범위 겹침, 판매 후 공간 회수, 타워별 고유 타게팅, 능력 쿨다운 UI, 업그레이드 이후 공격 구성 교체.
