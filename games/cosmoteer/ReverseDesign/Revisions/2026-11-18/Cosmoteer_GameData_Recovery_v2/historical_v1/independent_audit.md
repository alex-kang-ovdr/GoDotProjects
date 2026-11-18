> 최종 반영: 이 감사에서 지적한 HE 미사일 초당 입력 배열은 null/unverified로 보류하고 철0.17/초만 부분 관측값으로 보존했다. 아래 내용은 감사 당시 입력의 기록이다.

# 원작 공개 데이터 독립 감사

- 작성일: 2026-11-17
- 감사 대상: `support.json`, `economy.json` 읽기 전용 검사
- 목적: 전사·참조·단위·충돌 처리의 구체 위험 확인. 설치된 원작 게임이나 `.rules`를 검사한 결과가 아니다.
- 입력 파일은 수정하지 않았다. 통합 작업 중인 자료이므로 아래 결과는 기록한 해시의 스냅샷에 한정한다.

## 1. 범위와 검사 결과

정규화된 139개 레코드, 출처 76개, 자원 22종, 생산식 13개, 충돌 21개를 검사했다. 건조 재료 수량과 공개 자원 가격이 모두 있는 47개 레코드는 `Σ(quantity × base_price_credits)`가 채택된 `value_credits`와 일치했다. 가격 충돌 때문에 값이 null인 레코드는 합계 일치 판정에서 제외했다. 합계 일치는 공개 표들 사이의 산술 일관성을 뜻하며 최신 게임 가격을 증명하지 않는다.

다음 항목의 오류는 발견하지 못했다.

- 레코드 ID·출처 ID 중복, 자원 FK 누락, 필드의 출처 ID 누락, 관측값·충돌 항목의 출처 ID 누락.
- 공장 `record_id` 참조, 충돌 대상 레코드/필드 참조, `adopted_value`와 실제 채택값의 불일치.
- 값이 null인데 확인된 수치로 표시된 사례. 청사진 관련 null 12개는 conflict 9개, unverified 3개로 구분되어 있다.
- 숫자가 남아 있는데 출처 근거가 없는 필드.

샘플 원문 재확인에는 공식 위키 검색 색인으로 노출된 Small/Medium/Large Reactor Core, Batteries, Power Capacitor, HE/EMP/Mine Factory를 사용했다. 전 페이지의 원문을 직접 열어 대조한 전수 감사는 아니며, 검색 색인의 시점과 현재 페이지는 다를 수 있다. 각 파일의 정확한 빌드 미확정 표기는 적절하다.

## 2. 구체 문제: HE 미사일 생산의 초당 입력 배열이 불완전함

**심각도: 중간. 실행 테이블로 사용하면 자원 보존 오류를 일으킨다.**

- 위치: `economy.json` → `recipe_he_missile_parts.fields.input_rates_per_s`
- 현재 값: `[{resource_id: "iron", quantity: 0.17}]`
- 현재 상태: `wiki_snapshot`, 완결 여부를 나타내는 속성 없음.
- 같은 레코드의 `inputs`에는 철과 황이 각각 0.05개씩 있다.

공식 [High-Explosive Missile Factory](https://cosmoteer.wiki.gg/wiki/High-Explosive_Missile_Factory) 인포박스의 초당 자원 사용 항목 자체에 철만 노출된다. 따라서 철 0.17의 전사는 맞지만, 배열을 전체 입력 목록으로 읽으면 황이 소비되지 않는다. 이것은 새로운 숫자를 추정해서 채울 문제가 아니라 **부분 관측을 완결 배열로 표현한 문제**다.

권장 수정은 다음 중 하나다.

1. 확정된 전체 입력률 배열을 null/unverified로 두고, 철 0.17을 별도 관측값으로 보존한다.
2. 필드/배열에 partial 상태와 미확인 자원 sulfur를 명시하고, 데이터 사전에 누락 항목은 소비량 0이 아니라 미확인이라는 계약을 둔다.

황의 초당 사용량을 비율과 반올림된 생산률로 계산한 뒤 원문 확인값처럼 삽입해서는 안 된다. 파생값을 제공한다면 별도 `derived` 필드와 식·반올림 제한이 필요하다.

## 3. 원자로 단위와 기존 충돌의 독립 판정

이 절은 추가 오류 목록이 아니라 요청받은 위험 항목에 대한 판정이다.

| 점검 항목 | 판정 | 사용 제한 |
|---|---|---|
| 원자로 발전량 1.5 / 4.5 / 13.5 | 각 부품 인포박스가 Power Generation으로 표시하는 값을 `game_power/s`로 보존한 것은 타당하다. | Batteries 표의 열 이름은 Battery production rate이므로 이를 그대로 물리적 배터리 팩 수/초로 혼용하면 중·대형에서 배율 오류가 난다. |
| 원자로 저장량 8 / 16 / 24 | 인포박스의 Power Capacity 원문 숫자를 보존한 현재 처리는 타당하다. | `game_power`는 공개 표시 단위라는 범위를 유지해야 하며 내부 엔진 원시 단위를 확인했다는 뜻으로 쓰면 안 된다. |
| 대형 원자로 capacity 24 | 수치 자체를 72로 수정할 근거가 없다. | 본문에는 24개 배터리와 각 3 power라는 서술이 있어 인포박스와 단위 해석이 모호하다. 원문 `.rules` 확인 전 팩 개수나 에너지 72로 변환하지 않는다. |
| 축전기 capacity 24 | 크기 1 배터리로 변환한다는 본문과 부합한다. | 원자로의 크기 2·3 팩과 동일한 개수 단위라고 일반화하지 않는다. |
| 소형 원자로 충전시간 | Small Reactor Core 인포박스 0.5초, Batteries 표 0초를 각각 재확인했다. | `SUP-CONFLICT-01`의 null/conflict 유지가 적절하다. 0초를 무료·즉시 충전 확정값으로 채택하면 안 된다. |
| 청사진 비용/선행 조건 null | 미확인/출처 충돌이며 0 또는 빈 배열을 뜻하지 않는다. | 소비자는 null을 무료 해금 또는 무선행 조건으로 변환하면 안 된다. |

근거 URL:

- [Small Reactor Core](https://cosmoteer.wiki.gg/wiki/Small_Reactor_Core)
- [Medium Reactor Core](https://cosmoteer.wiki.gg/wiki/Medium_Reactor_Core)
- [Large Reactor Core](https://cosmoteer.wiki.gg/wiki/Large_Reactor_Core)
- [Batteries](https://cosmoteer.wiki.gg/wiki/Batteries)
- [Power Capacitor](https://cosmoteer.wiki.gg/wiki/Power_Capacitor)

위키의 `power_storagw` 문자열을 오타 의심으로 보류하고 `power_capacitor.game_id=null`로 둔 처리도 적절하다. 추정해서 수정한 문자열을 실제 내부 ID로 승격하지 않았다.

## 4. 생산식의 충돌·반올림 사용 제한

EMP 및 기뢰 공장의 본문·제작표·인포박스 입력량 불일치는 원문에서도 확인된다. 기존 `ECON-CONFLICT-03`, `ECON-CONFLICT-04`는 타당하다. 보존된 `input_rates_per_s`와 생산률을 나누면 특정 입력비가 산출되더라도, 이를 근거로 null인 정식 `inputs`를 몰래 복원하면 충돌 보류를 우회하게 된다.

농축 우라늄의 4:1 비율과 표시 속도 0.67/0.17은 반올림 때문에 정확히 같지 않다. 기존 메모가 반올림 전 주기를 미확인으로 분리하므로 숫자 전사 오류로 판정하지 않았다. 표시 속도의 역수나 비율을 정밀한 게임 주기로 승격하지 않는 제한을 유지해야 한다.

참고: [E.M.P. Missile Factory](https://cosmoteer.wiki.gg/wiki/E.M.P._Missile_Factory), [Mine Factory](https://cosmoteer.wiki.gg/wiki/Mine_Factory).

## 5. 검사한 입력 식별자

| 파일 | SHA-256 | 바이트 |
|---|---|---:|
| support.json | `828099fdb8b1bdd7cb2da1311e1f8f4e38120c2965f97037cfa86aeb0aa7cdd2` | 135995 |
| economy.json | `cf350ac72291065ad72611769832b589010b18c6364cb8b90163dd2d46be038b` | 251607 |

보고 후 입력 파일이 수정되었다면 위 해시와 비교해야 한다. 이 감사는 원작 공개 관측 자료만 대상으로 했으며 STARFORGE 수치나 원작과의 이름 유사성 매핑을 원작 수치의 근거로 사용하지 않았다.

