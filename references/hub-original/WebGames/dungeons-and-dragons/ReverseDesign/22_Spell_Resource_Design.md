# 주문·슬롯·마법 처리 상세 설계

## 주문 사용자
클레릭, 엘프, 매직유저는 아이템 링 외 주문 페이지를 가진다. 마법 종류와 사용 횟수는 클래스와 대체 캐릭터에 따라 달라질 수 있다. [확인]

## 원작 기반 동작
- 주문 메뉴는 선택 링과 페이지 전환으로 운용한다. [확인]
- 동일 주문 레벨에서 사용 횟수를 공유하는 구조가 공략에 기술되어 있다. 주문마다 별도 MP 바를 가정하지 않는다. [확인: 공략]
- 특정 주문 발동 중 파티 전체 무적 처리, 적 주문·브레스와의 동시 시전 제한 등이 공략에 기술되어 있다. 버전별 실측 필요. [추정]

## 상태 머신 [제안]
`Idle -> OpenWheel -> SelectPage -> SelectSpell -> Validate -> CastStartup -> Resolve -> Recover`

## 주문 실행 파이프라인 [제안]
1. 클래스·현재 페이지·슬롯 유효성 확인
2. 현재 남은 레벨별 사용 횟수 확인
3. 시전 금지 플래그 및 전투 상태 확인
4. 비용 차감 시점 확정(시전 시작 또는 성공 시점은 실측)
5. 이펙트 이벤트 생성 / 타격 대상 선택 / 버프·디버프 적용
6. 시전 종료 및 링 UI 동기화

```json
{"spellId":"lightning_bolt","classAccess":["magic_user"],"spellLevel":null,"sharedSlotPool":true,"charges":null,"targeting":"line","castTicks":null,"damage":null,"verification":"pending"}
```

## 예외 테스트
- 남은 횟수 0에서 발동 / 메뉴에서 선택 취소 / 시전 중 피격 / 보스 브레스 중 시전 / 다인 협동 중 주문 연속 발동 / 레벨업 후 사용 횟수 회복.

## 근거 및 신뢰도
- [Capcom 공식 소개](https://news.capcomusa.com/lets/browse/dungeons-and-dragons-combat-for-combat-connoisseurs)
- [Steam 상세 플레이 가이드](https://steamcommunity.com/sharedfiles/filedetails/?id=154984901)
- [GameFAQs Kaze_Yagami 공략](https://gamefaqs.gamespot.com/arcade/563201-dungeons-and-dragons-shadow-over-mystara/faqs/11489)
- [한국어 게임 조작 정리](https://theroomofspiritandtime.tistory.com/1020)

**표기:** `[확인]`은 문헌에 명시된 동작, `[추정]`은 공략에 기초한 해석, `[제안]`은 구현을 위한 임의 설정이다. 입력 프레임·대미지·무적 프레임은 실측하지 않았으므로 확정하지 않는다.
