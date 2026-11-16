# 보스별 패턴·AI 카탈로그

## 주요 보스 목록
| 보스 | 구간 | 관찰할 핵심 메커니즘 | 검증 |
|---|---|---|---|
| War Machine | 트린트란 | 공성 병기·화면 공간 제어 | 패턴 실측 필요 |
| Dark Warrior 1 | 저거노트 루트 | 근접 대형 공격·접근 | 실측 필요 |
| Man Scorpion | 베수비아 루트 | 근접 공격·거리 유지 | 실측 필요 |
| Harpy | 중반 분기 | 공중 체공·급강하 | 실측 필요 |
| Tel'Arin | 중후반/부유성 | 인간형 콤보·방어·재등장 조건 | 공략 확인 |
| Beholder | 중반 분기 | 전방 시선/특수 공격 대응 | 실측 필요 |
| Red Dragon | 선택 루트 | 브레스 범위·안전지대 | 공략 확인 |
| Ezerhorden | 투기장 | 마법형 보스 공격 | 공략 확인 |
| Dark Warrior 2 | 재방문 투기장 | 대형 근접 공격·특수 피해 | 공략 확인 |
| Nagpa | 내면의 심장 | 순간이동 및 소환 몬스터와의 합동전 | 공략 확인 |
| Synn | 최종전 | 형태 전환·브레스·최종 연출 | 공략 확인 |

## Nagpa 전투 구성
- 나그파 + 블랙 드래곤 + 만티코어가 같은 전투 공간에 등장한다. [확인]
- AI 구현: 나그파는 순간이동·주문 지원, 소환체는 압박 역할을 분리. [제안]
- 승리 조건은 나그파 처치만으로 종료하는지, 소환체 잔존 상태가 어떻게 되는지 영상으로 확인. [검증 필요]

## Synn 패턴 명세 템플릿
| 상태 | 진입 조건 | 예고 | 공격 | 종료 |
|---|---|---|---|---|
| GroundIdle | 전투 시작 | 자세 전환 | 선택 공격 | 공격 선택 |
| BreathWindup | 브레스 선택 | 머리·몸통 모션 | 광역 브레스 | Recovery |
| Airborne | 공중 이동 조건 | 이륙 | 공중 공격 | 착륙 |
| Defeated | HP 0 | 사망 연출 | 없음 | 종료 |

위 상태명은 구현 제안이며 원작 내부 AI 구조를 의미하지 않는다. 공격별 거리·쿨다운·HP 임계값은 아직 미측정.

## 보스 AI 우선순위 [제안]
`ForcedAnimation > HitReaction > ScriptedPhase > SpecialCooldown > AttackOpportunity > Reposition`

## 검증 계획
보스당 최소 3개 캐릭터, 근거리/원거리, 1인/4인 조건에서 공격 순서·텔레그래프·추적 방식·히트박스를 기록한다.

## 근거 및 신뢰도
- [Capcom 공식 소개](https://news.capcomusa.com/lets/browse/dungeons-and-dragons-combat-for-combat-connoisseurs)
- [Steam 상세 플레이 가이드](https://steamcommunity.com/sharedfiles/filedetails/?id=154984901)
- [GameFAQs Kaze_Yagami 공략](https://gamefaqs.gamespot.com/arcade/563201-dungeons-and-dragons-shadow-over-mystara/faqs/11489)
- [한국어 게임 조작 정리](https://theroomofspiritandtime.tistory.com/1020)

**표기:** `[확인]`은 문헌에 명시된 동작, `[추정]`은 공략에 기초한 해석, `[제안]`은 구현을 위한 임의 설정이다. 입력 프레임·대미지·무적 프레임은 실측하지 않았으므로 확정하지 않는다.
