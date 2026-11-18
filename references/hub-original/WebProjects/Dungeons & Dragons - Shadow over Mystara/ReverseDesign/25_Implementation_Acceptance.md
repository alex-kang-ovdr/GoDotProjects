# 코어 게임플레이 구현 인수 기준

## 마일스톤
| 단계 | 구현 범위 | 완료 기준 |
|---|---|---|
| M1 | 2.5D 이동·대시·회피 | 입력 재생으로 동일 궤적 |
| M2 | 기본 공격·피격·다운 | 공격당 1회 판정·히트스톱 검증 |
| M3 | 6개 클래스 커맨드 | 커맨드 매트릭스의 O/X 일치 |
| M4 | 링 UI·주문·아이템 | 슬롯 차감·선택·취소·사용 |
| M5 | 적 AI·보스 | 상태 머신 전이·안전지대 검증 |
| M6 | 스테이지 분기·협동 | 분기 플래그·4인 카메라·동시 전투 |

## 결정적 시뮬레이션 [제안]
- 고정 timestep을 사용하고 입력과 RNG seed를 기록한다.
- 시뮬레이션 이벤트는 `tick, entityId, eventType, payload`로 저장한다.
- 렌더 프레임과 게임플레이 프레임을 분리한다.
- 프레임별 상태 해시를 통해 리플레이 불일치를 검사한다.

## 최소 수용 테스트
- 6개 클래스 각각 대시·점프·회피·기본 공격을 재현.
- 가드 불가 클래스는 가드 상태로 진입하지 않음.
- 주문 횟수가 0일 때 자원이 음수가 되지 않음.
- 다운된 적에 대한 일반 공격·다운 공격 판정이 구분됨.
- 보스 페이즈 변경 시 중복 스폰·중복 사망 이벤트 없음.
- 분기 선택 후 재시작해도 경로 플래그가 일관됨.

## 미확정 리스크
원작 바이너리·프레임 데이터·완전한 스테이지 이벤트 덤프가 없는 상태이므로 이 문서만으로 1:1 재현을 보증하지 않는다.

## 근거 및 신뢰도
- [Capcom 공식 소개](https://news.capcomusa.com/lets/browse/dungeons-and-dragons-combat-for-combat-connoisseurs)
- [Steam 상세 플레이 가이드](https://steamcommunity.com/sharedfiles/filedetails/?id=154984901)
- [GameFAQs Kaze_Yagami 공략](https://gamefaqs.gamespot.com/arcade/563201-dungeons-and-dragons-shadow-over-mystara/faqs/11489)
- [한국어 게임 조작 정리](https://theroomofspiritandtime.tistory.com/1020)

**표기:** `[확인]`은 문헌에 명시된 동작, `[추정]`은 공략에 기초한 해석, `[제안]`은 구현을 위한 임의 설정이다. 입력 프레임·대미지·무적 프레임은 실측하지 않았으므로 확정하지 않는다.
