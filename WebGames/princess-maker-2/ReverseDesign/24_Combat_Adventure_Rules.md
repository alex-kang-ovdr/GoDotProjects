# 무사수행·전투 상세 실행 규칙

> 수치 공식은 **웹 재구현을 위한 제안**이며 원작의 내부 전투 공식이 아니다.

## 탐험 상태 머신
`TOWN → REGION_SELECT → EXPLORING → ENCOUNTER → {BATTLE, DIALOGUE, LOOT} → EXPLORING → RETURN → TOWN`

- 맵은 타일/노드 그래프이며 각 노드는 `terrain`, `encounterWeight`, `resource`, `blocked` 속성을 갖는다.
- 이동 1회당 탐험 시간 1, 피로 +1, 식량 -1(제안). 식량 0에서 체력 -2.
- 탐험 도중 체력 0이면 강제 귀환, 보상 일부 손실; 세부 손실률은 설정 데이터.

## 전투 순서
1. 선공: `speed + rng(0,9)` 비교
2. 명령 선택: 공격/마법/방어/아이템/도주
3. 명중: `clamp(0.1,0.95,0.75+(attackerSkill-defenderEvasion)*0.002)`
4. 물리 피해: `max(1, floor((attack+strength*0.25)*random(0.9,1.1)-defense*0.5))`
5. 방어 상태 피해 50% 감소, 한 턴 뒤 해제
6. 마법은 MP를 소모하고 마법공격·마법방어를 사용
7. HP 0 이하 시 전투 종료, 경험·보상·부상 처리

## 전투 결과 JSON
```json
{"battleId":"B0001","winner":"player","turns":4,"hpDelta":-12,"mpDelta":-5,"loot":[{"id":"herb","qty":1}],"xp":8}
```

## 검증
- 0 HP에서 행동 불가, 음수 피해 불가, MP 부족 시 마법 불가
- 도주 실패 시 적 턴 실행, 전투 도중 저장/로드 시 난수 재현
- 전투 결과는 모험 인벤토리와 귀환 시 정산 원장에 한 번만 반영
