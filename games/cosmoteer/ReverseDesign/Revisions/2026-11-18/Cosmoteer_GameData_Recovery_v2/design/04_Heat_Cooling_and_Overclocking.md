# 선체 열·열 배관·냉각·오버클럭 개선

[개선 기획 목차](README.md) · [개정 범위](00_Scope_and_Decisions.md)

작성일: 2026-11-18 · 대상: Cosmoteer Modern Steam 공개 문헌 및 STARFORGE v4

검토 기준은 복구 데이터 v1의 196개 레코드와 STARFORGE 커밋 `6ca48f00f86857f821422619827b617f0de549a3`이다. 이 문서는 게임 코드를 변경하지 않는다. 동반 파일 [combat_proposals.json](../authoring/combat_proposals.json)에는 기존 필드 변경 30건과 새 규칙 레코드 6개를 제시한다. `[확인]`은 공식 위키 또는 개발자 공지의 관측, `[분석]`은 그 자료와 현 구현의 차이, `[제안]`은 구현할 수 있도록 선택한 프로토타입 계약, `[미확인]`은 공개 자료로 확정하지 못한 항목이다. 정식 0.30.4와 0.30.5 공지를 구분했으며, 설치된 0.30.5a 바이너리를 조사했다는 의미는 아니다.


## 4. 열망과 선체 열의 분리

[확인] 열 파이프는 지정된 연결 위치를 통해 열을 공유한다. 그 위치가 항상 문 위치와 같지는 않다. 교차 파이프는 수동 회전이 필요하고 승무원 통행에는 문이 필요하다. 열교환기는 범위 안의 선체 타일에서 열을 가져오므로 다칸 부품 일부만 덮으면 열 위험이 남는다. 방열판은 열을 통과시키지만 전방 차폐가 있으면 성능이 낮아진다. [V2-CMB-PATCH-0300][V2-CMB-HEAT-CROSSING][V2-CMB-EXCHANGER][V2-CMB-RADIATOR]

[제안] `thermalPorts[]`는 부품 로컬 위치, 방향, 채널을 보관한다. 회전과 반사 후 포트가 서로 마주 보고 호환될 때 간선을 만든다. 선체 인접, 문 연결, 열 포트 연결을 서로 다른 그래프로 유지한다. 구조가 바뀔 때만 열 연결 성분을 재계산하고, 매 틱 모든 부품의 조합을 검사하지 않는다. 교차 파이프의 시각적 교차가 열적 합류를 뜻하는지는 정의에 명시하며, 모양만 보고 연결하지 않는다.

`ThermalNode`는 `storedEnergyMJ`, `capacityMJ`, 생성·소비·방출 요청을 보관한다. `HullTile`은 별도의 `heatStatus`, `fireStrength`, `foamUntilTick`, `scorched`를 보관한다. 선체 열의 원작 정규화 단위는 아직 미확인이므로 MJ 값을 그대로 복사하지 않는다. 열교환기는 두 장부 사이의 명시적 변환기이며, 변환 효율과 추가 폐열 계수는 현재 확인한 값과 자체 조정값을 구분한다. 열량이 없는데 냉각량부터 차감해 음수를 만드는 처리는 금지한다.

[제안] 한 틱에서 발생한 열 요청을 먼저 모으고 연결망별로 합산한 뒤 분배·저장·방열한다. 원래 저장 위치별 열량을 보존해야 파이프 파괴 후 분리된 망에 같은 열을 복제하지 않는다. 재분배는 사용 가능한 용량 비율과 안정 ID의 나머지 배분으로 결정할 수 있다. 파괴된 저장 노드의 열량은 삭제 손실, 선체 전달, 폭발 중 선택한 정책으로 원장에 기록한다. 전체 에너지를 성분 개수로 나누거나 새 배관 설치 시 저장소를 초기화하지 않는다.

선체 확산은 매 틱 시작값을 읽는 두 버퍼 방식으로 계산한다. 한 쌍의 연결 타일을 한 번만 처리하고 반대 방향 흐름은 같은 크기로 상쇄한다. 여러 이웃으로 나가는 총량이 현재 타일의 열을 넘지 않게 한꺼번에 제한한다. 화재 발생과 소화, foam 보호 판정은 그 다음 단계에서 한다. 네트워크 포트가 끊겼다는 사실과 선체 열의 확산 경로가 끊겼다는 사실을 같은 조건으로 처리하지 않는다. 이동 중 두 선체가 가까워진 것만으로 열 확산 간선을 새로 만들지도 않는다.

오버클럭은 `ship.overclock` 하나보다 `part.modeId`와 정의별 수정값으로 옮긴다. 생산 중, 발사 순간, 피격 흡수, 발전 중에 각각 다른 열 이벤트를 낼 수 있어야 한다. 모드를 바꿀 때 용량이 작아지는 자원은 넘친 양을 명시적으로 처리하고, 저장 후 재개했을 때 재고가 늘어나는 전이를 막는다. 모드에 확인되지 않은 필드는 일반 모드에서 자동 상속하지 않는다. 적용 프로필이 상속을 선택했다면 그 선택 자체를 테스트와 화면 설명에 남긴다.


## 6. 데이터와 저장 계약

[제안] 정적 정의는 출처 데이터와 실행 프로필로 나눈다. `OriginalRuleRef`는 원본 레코드·필드·상태·출처를 가리키고, `RuntimeProfile`은 적용된 환산과 자체 값을 보관한다. 저장 파일에는 실제 선택한 프로필 ID와 버전, 부품별 모드, 실드 전지·생명주기, 노드별 열량, 타일 상태, 미처리 폭발 이벤트, 소비한 재고 이벤트 ID를 저장한다. 연결 성분과 화면용 호는 다시 만들 수 있지만 복원 후 결과가 같아야 한다.

불러오기는 임시 세계에서 검증한다. 음수 열량, 존재하지 않는 노드, 용량 초과 전지, 이미 소비한 자원을 다시 쓰는 폭발, 잘못된 모드 참조를 검사한 뒤 한 번에 교체한다. 검증 실패 시 기존 세계는 그대로 남는다. 이전 v4 저장은 기존 공용 실드와 공용 냉각 프로필을 유지하는 호환 경로가 안전하다. 근거 없이 잔여 실드를 여러 생성기에 복제하거나 원작 값에 맞춰 저장고를 보충하지 않는다. 새 프로필로 바꾸는 시점은 도크의 명시적 설계 변경으로 제한하는 것을 권한다.


## 수용 사례

열량 80·20인 두 노드를 분리했을 때 합계가100으로 보존되어야 한다. 교차 파이프 회전과 문 제거는 열 연결과 승무원 경로에 각각 독립적으로 영향을 주어야 한다. 열교환기가 일부 타일만 덮으면 범위 밖 타일은 자동 냉각하지 않는다. 동일한 열 요청의 배열 순서를 바꾸어도 결과는 같아야 한다. 모두 향후 구현 목표다.

## 8. 성능 목표와 구현 순서

[제안] 첫 검증 장면은 두 함선, 합계 600 타일, 실드 16개, 활성 탄체 300개다. 이 규모에서 목표 시뮬레이션 주기는 60Hz, 코어 한 틱의 p95 목표는 데스크톱 4ms, 모바일 기준 장치 8ms로 둔다. 이는 측정된 현 성능이 아니라 예산이다. 장치·브라우저·빌드·장면 시드를 함께 기록하고 목표를 넘으면 원인별 시간을 분리한다. 렌더링을 제외한 충돌 탐색, 열망 갱신, 폭발 처리 시간을 각각 측정한다.

공간 인덱스로 충돌 후보를 줄이고 열 그래프는 위상 변경 때만 갱신한다. 연쇄 폭발은 큐에 보존하되 실행 예산을 넘었다고 사건을 버리면 안 된다. 필요하면 고정된 사건 수 상한으로 다음 틱에 이어 처리하고, 중간 상태가 저장 가능해야 한다. 실제 계산 시간이 오래 걸렸다는 이유로 사건을 다음 틱으로 보내면 기기마다 결과가 달라지므로 금지한다. 통계적 발화는 사건 ID 기반의 명시적 난수 스트림을 사용해 UI 호출 횟수와 분리한다. 저장·불러오기와 1배·2배 진행은 동일한 고정 틱 결과를 만들어야 한다.

착수 순서는 데이터 승인 도구, 실드 상태 분리, 열 포트와 노드 원장, 관통 이벤트, 저장 자원 폭발이다. 각 단계는 자체 프로필로 먼저 검증하고, 원작 필드가 추가 확인될 때 어댑터만 교체한다. 완료 조건은 값의 개수가 늘어나는 것이 아니라, 플레이어에게 보이는 차폐·보급·과열·폭발 원인이 데이터와 전투 결과로 설명되는 것이다.


## 출처와 검증 한계

정확한 서지·관측일·검색 참조 ID는 `combat_proposals.json`의 sources에 있다. 위키는 공식 커뮤니티 위키의 검색 색인을 확인했으며 직접 페이지 열기는 403이었다. 원문·이미지를 복제하지 않고 필요한 사실만 요약했다. 모딩 문서는 구현 의미를 설명하는 보조 자료이며 현재 실행 파일의 추출 결과가 아니다.

- [V2-CMB-SHIELD · Shields](https://cosmoteer.wiki.gg/wiki/Shield)
- [V2-CMB-BATTERIES · Batteries](https://cosmoteer.wiki.gg/wiki/Batteries)
- [V2-CMB-SMALL-SHIELD · Small Shield Generator](https://cosmoteer.wiki.gg/wiki/Small_Shield_Generator)
- [V2-CMB-LARGE-SHIELD · Large Shield Generator](https://cosmoteer.wiki.gg/wiki/Large_Shield_Generator)
- [V2-CMB-HEAT · Heat mechanics](https://cosmoteer.wiki.gg/wiki/Heat_mechanics)
- [V2-CMB-HEAT-PIPE · Heat Pipe](https://cosmoteer.wiki.gg/wiki/Heat_Pipe)
- [V2-CMB-HEAT-CROSSING · Heat Pipe Crossing](https://cosmoteer.wiki.gg/wiki/Heat_Pipe_Crossing)
- [V2-CMB-EXCHANGER · Heat Exchanger](https://cosmoteer.wiki.gg/wiki/Heat_Exchanger)
- [V2-CMB-RADIATOR · Radiator](https://cosmoteer.wiki.gg/wiki/Radiator)
- [V2-CMB-ARMOR · Armor](https://cosmoteer.wiki.gg/wiki/Armor)
- [V2-CMB-PENETRATION · Penetration](https://cosmoteer.wiki.gg/wiki/Penetration)
- [V2-CMB-EXPLOSIVE-RULES · ExplosiveDamageEffectRules](https://cosmoteer.wiki.gg/wiki/Modding/ExplosiveDamageEffectRules)
- [V2-CMB-PATCH-0304 · 0.30.4 정식 공지 본문](https://store.steampowered.com/news/posts/?enddate=1776464388&feed=steam_community_announcements)
- [V2-CMB-PATCH-0305 · 0.30.5 정식 공지 본문](https://steamcommunity.com/app/799600/allnews/?l=english)
- [V2-CMB-PATCH-0300 · Meltdown 정식 공지 본문](https://store.steampowered.com/news/posts/?appids=799600&enddate=1756769273&feed=steam_community_announcements)
