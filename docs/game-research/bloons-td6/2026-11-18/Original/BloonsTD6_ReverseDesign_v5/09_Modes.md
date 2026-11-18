# 모드와 난이도 룰셋

> Bloons TD 6 역기획 v2.0 | 공개 동작 분석 + 구현용 모델. 수치 예시는 원작 확정 데이터가 아닙니다.

## 룰셋 중심 설계
ModeRuleSet {startingCash,startingLives,endRound,costMultiplier,spawnMultiplier,allowedTowers,allowedUpgrades,allowSelling,allowIncome,allowContinues,roundPreset}.

## 모드 예시
Easy/Medium/Hard는 시작 자원·비용·종료 라운드 등의 설정이 다르다. Deflation은 초기 자원과 이후 수입 제한. Apopalypse는 연속적인 스폰 압박. Reverse는 경로 반전. Double HP MOABs는 대형 풍선 내구 증가. Half Cash는 경제 압박. CHIMPS는 여러 제약의 조합.

## 우선순위
맵 규칙 → 난이도 기본값 → 모드 override → 챌린지 override. 충돌 시 마지막 override가 우선하며 UI에 최종 규칙을 표시한다.

## 검증
모드 전환 후 이전 상태가 누출되지 않음, 금지 기능 UI 비활성화, 승리 라운드 정확, 재시작 시 결정론.
