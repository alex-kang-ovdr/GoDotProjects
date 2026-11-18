# 출처·재현 범위

## XXVII에서 확인한 공식 자료

- Blizzard, Rune Word Rules: https://classic.battle.net/diablo2exp/items/runewords.shtml
- Blizzard, Original Rune Words: https://classic.battle.net/diablo2exp/items/runewords-original.shtml
- Blizzard, Basic Skill Information: https://classic.battle.net/diablo2exp/skills/basics.shtml

룬 순서/소켓 수/비마법 품질/타입 조건, 총옵션에 룬 옵션이 포함되는 점, 직접 투자와 장비 보너스/선행 조건, 악의 소굴 초기화 등을 확인했다. 원문 페이지 전체를 패키지에 재배포하지 않는다.

## 이전 데이터 출처

`data/sources_v27.json`의 `inherited_registry`에 R1에서 기록한 공식 자료 주소와 당시 확인 범위를 보존했다. 모든 링크를 이번 작업에서 다시 다운로드/해시 검증한 것은 아니다. XXVI 인라인 데이터를 손실 없이 분리한 뒤 이번 코드 변경에 필요한 선택 규칙을 재검토했다.

## 정확성 등급

- `official_published`: 공개 가이드에 기재된 사실·표시값. 반드시 특정 바이너리 버전의 내부값이라는 뜻은 아니다.
- `web_adapter` / `authored_web_balance...`: 웹 게임에서 동작시키기 위한 독립 처리 또는 자체 수치.
- `null`, `not_recovered`, `reference`: 확보하지 않은 내부 ID/계수/동작은 추측으로 채우지 않는다.

원본 배포 파일을 보유한 사용자가 적법한 로컬 파일로 대조할 수 있는 확장 지점은 있으나 이 패키지는 전체 MPQ/CASC 추출이나 원본 복구를 수행하지 않았다. 최신 D2R 패치와의1:1검증도 하지 않았다.

## XXVIII에서 확인한 공식 자료

- 특수 명중 효과: https://classic.battle.net/diablo2exp/items/magic.shtml
- 스마이트 예외: https://classic.battle.net/diablo2exp/skills/paladin-combat.shtml
- 멀티샷 무기 피해/동일 대상 제한: https://classic.battle.net/diablo2exp/skills/amazon-bow.shtml
- 자원 회복: https://classic.battle.net/diablo2exp/basics/characters.shtml

확인 범위와 남은 불확실성은 `data/sources_v28.json`에 보존했다. 신규 보스 속성/저항 수치의 근거는 이 게임의 자체 설계이며 원본 자료로 포장하지 않는다.
