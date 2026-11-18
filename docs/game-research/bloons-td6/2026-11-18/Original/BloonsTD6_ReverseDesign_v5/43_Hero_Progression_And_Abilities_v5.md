# 43. 영웅 성장과 능력 실행 상세

## 모델
영웅은 일반 타워와 달리 경험치를 통해 레벨이 자동 상승하며, 레벨에 따라 패시브·공격·액티브 능력이 달라진다. 각 영웅의 실제 레벨별 효과는 별도 테이블로 둔다.

## 데이터 구조
- `HeroDefinition`: id, placementCost, attackIds, xpCurveId, levelEffects, abilityIds
- `HeroRuntime`: xp, level, cooldowns, activeEffects, position, targetMode
- `AbilityDefinition`: activationMode, cooldownTicks, durationTicks, targetRule, effects, interruptPolicy

## 성장 처리
라운드 종료/시간 경과 등의 XP 지급 원천을 이벤트로 명시하고, XP 획득 배율 및 맵/모드 영향을 별도 modifier로 처리한다. 레벨이 여러 단계 한 번에 오르면 순차적으로 효과를 적용한다.

## 능력 처리
1. 버튼/자동 발동 입력 수신
2. 현재 레벨과 해금 여부 검사
3. 쿨다운·타겟 유효성·상태 제한 검사
4. 효과 발행 및 쿨다운 시작
5. 버프 종료·재사용 가능 이벤트 발행

## 테스트
스킬 쿨다운 도중 영웅 판매, 버프 대상 타워 판매, 게임 일시정지, 배속 변경, 레벨업 도중 스킬 발동, 저장 후 복구.

## 원작 정확도
영웅별 20레벨 수치, 해금 레벨, 경험치 배율은 버전별 확인 필요. 임의의 수치를 확정값으로 기재하지 않는다.
