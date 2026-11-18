# 6클래스 커맨드·전투 매트릭스

## 기본 입력 (아케이드 4버튼)
A 공격 / B 점프 / C 아이템·마법 사용 / D 선택. 방향은 캐릭터가 바라보는 방향 기준으로 표기한다.

| 커맨드 | 파이터 | 드워프 | 클레릭 | 엘프 | 시프 | 매직유저 | 근거 |
|---|---|---|---|---|---|---|---|
| →→ 대시 | O | O | O | O | O | O | 확인 |
| B,B 회피 | O | O | O | O | O | O | 확인 |
| ↓↘→+B 슬라이드 | O | O | O | O | O | O | 확인 |
| ↓+B 앉기 | O | O | O | O | O | O | 확인 |
| →+A 강공격 | O | O | O | O | O | O | 확인 |
| A 누른 채 ← 가드 | O | O | O | O | X | X | 확인 |
| ↓↘→+A 돌진 필살기 | O | O | O | O | O | X | 확인 |
| ↓↑+A 대공 필살기 | O | O | O | O | O | X | 확인 |
| A+B 위기회피 | O | O | 특수 | O | O | X | 확인 |
| 점프 중 ↓+A 내려찍기 | O | O | O | O | O | O | 확인 |

### 직업별 핵심 차이
- **파이터**: 검 연속 공격과 가드·돌진·대공의 균형. 초보자 기준 캐릭터. [확인]
- **드워프**: 근거리 타격 중심, 상자 파괴로 추가 보물을 획득하는 특성. [확인]
- **클레릭**: A+B가 일반 HP 소모형 위기회피 대신 Turn Undead로 작동하며 일반 언데드 제거에 특화. [확인]
- **엘프**: 근접 연속 공격과 주문 사용을 병행. [확인]
- **시프**: 가드 불가, 회피 중 무적 구간과 높은 기동성. [확인]
- **매직유저**: 기본 연속 콤보·일반 위기회피·돌진 및 대공 필살기 없음. 회피는 순간이동이며 주문이 주력. [확인]

## 입력 우선순위 제안
1. 피격·사망 등 강제 상태 2. 메뉴 선택·주문 발동 3. A+B 특수 4. 완성된 방향 커맨드 5. 가드 6. 기본 공격·점프 7. 이동. [제안]

## 데이터 계약
```json
{"class":"fighter","commands":[{"id":"charge","pattern":["DOWN","DOWN_FORWARD","FORWARD","ATTACK"],"requiresGround":true,"allowedStates":["idle","recovery_cancel"],"priority":60,"frameWindow":null,"evidence":"guide_confirmed"}]}
```
`frameWindow:null`은 측정되지 않은 값을 의미한다.

## 근거 및 신뢰도
- [Capcom 공식 소개](https://news.capcomusa.com/lets/browse/dungeons-and-dragons-combat-for-combat-connoisseurs)
- [Steam 상세 플레이 가이드](https://steamcommunity.com/sharedfiles/filedetails/?id=154984901)
- [GameFAQs Kaze_Yagami 공략](https://gamefaqs.gamespot.com/arcade/563201-dungeons-and-dragons-shadow-over-mystara/faqs/11489)
- [한국어 게임 조작 정리](https://theroomofspiritandtime.tistory.com/1020)

**표기:** `[확인]`은 문헌에 명시된 동작, `[추정]`은 공략에 기초한 해석, `[제안]`은 구현을 위한 임의 설정이다. 입력 프레임·대미지·무적 프레임은 실측하지 않았으므로 확정하지 않는다.
