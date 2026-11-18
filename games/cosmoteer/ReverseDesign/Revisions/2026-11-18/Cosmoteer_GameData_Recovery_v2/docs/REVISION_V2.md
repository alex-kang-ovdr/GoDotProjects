# v2 복구 변경 요약

기준일: 2026-11-18. 설치 파일 추출이 아닌 공개 문헌 복구와 기존 값의 재검토 결과다.

| 집계 | v1 | v2 | 변화 |
| --- | ---: | ---: | ---: |
| 레코드 | 196 | 219 | +23 |
| 전체 필드 | 1,950 | 2,107 | +157 |
| 비null 필드 | 1,517 | 1,655 | +138 |
| 미확정·상충 필드 | 433 | 452 | +19 |
| 출처 항목 | 110 | 153 | +43 |
| 서로 다른 출처 URL | 107 | 128 | +21 |

숫자뿐 아니라 불리언·문자열·배열도 필드 수에 포함한다. 신규 레코드 23개는 시스템 규칙이며 부품 종류가 23개 늘었다는 뜻이 아니다. 원작 부품 90개, 모드 관측 20개, 탄종 6개, 자원 22개, 생산식 13개는 유지한다. 규칙은 45개에서 68개로 늘었다.

## 실제 채택 변화

- 기존 null 복구: 4개.
- 기존 수치 교정: 2개.
- 범위가 과도하거나 구형인 기존 값 철회: 2개.
- 기존 레코드에 새 필드 추가: 43개.
- 새 규칙 23개에 포함된 필드: 114개.

새로 식별한 미확정 필드를 포함하므로 null 수는 433→452로 늘었다. 이를 복구 실패나 0 값으로 해석하지 않는다. 미확정 면적을 숨기지 않고 기록한 결과다.

## 기존 필드의 복구·교정·철회

| 레코드 · 필드 | 이전 | 채택 | 상태 | 근거 버전 |
| --- | --- | --- | --- | --- |
| `small_shield_generator_overclock_extended.shield_strength` | 미확정 | 12000 | patch_confirmed | 0.30.4 stable patch; carry-forward candidate to 0.30.5a, binary unverified |
| `small_shield_generator_overclock_reinforced.shield_strength` | 미확정 | 39000 | patch_confirmed | 0.30.4 stable patch; carry-forward candidate to 0.30.5a, binary unverified |
| `flak_array_overclock.cloud_duration` | 미확정 | 4 | patch_confirmed | 0.30.4 stable patch; binary unverified |
| `ion_beam_emitter.power_capacity` | 10 | 16 | patch_confirmed | 0.30.4 stable patch; binary unverified |
| `thermal_resonance_lance.turret_speed_deg_per_s` | 60 | 30 | patch_confirmed | 0.30.4 stable patch; binary unverified |
| `railgun_accelerator_overclock.buff_formula` | 20% * X | 미확정 | conflict | 0.30.4 stable patch versus unversioned wiki |
| `global_heat_fire.stored_munition_explosion_requires_scorched` | true | 미확정 | unverified | 0.30.5 stable patch |
| `nuclear_missile_factory.value_credits` | 미확정 | 25000 | patch_confirmed | 0.26.2 released patch; no claim that all other fields are from that build |

전값·단위·근거 상태·출처 ID·사유 전체는 [revision_v2.json](../data/revision_v2.json)에 있다. 핵공장 가격 25,000을 채택해도 재료표는 계속 null이다. 레일건의 지수 0.9가 확인되었다고 전체 함수를 합성하지 않는다.

## 새 규칙 레코드

| ID | 한국어 이름 | 필드 수 |
| --- | --- | ---: |
| `crew_role_hiring_rules` | 승무원 역할의 고용·이동 규칙 | 4 |
| `crew_work_and_delivery_rules` | 승무원의 조작 작업과 운송 작업 구분 | 3 |
| `crew_boundary_access_rules` | 부품 경계의 승무원 통행 규칙 | 3 |
| `modding_geometry_documentation` | 공개 모딩 문서의 기하·금지영역 필드 | 7 |
| `storage_supply_chain_rules` | 저장 타일 지정과 명시적 공급 연결 | 4 |
| `battery_dispatch_observations` | 전지 요청과 공급원 선택 관측 | 2 |
| `ship_editor_construction_rules` | 청사진 검증과 문 자동화 옵션 | 4 |
| `shield_runtime_rules` | 실드 호·전지 저장량 생명주기 | 10 |
| `thermal_network_rules` | 열망·선체 열 분리 규칙 | 9 |
| `armor_penetration_rules` | 장갑 저항 적용 범위 | 5 |
| `penetration_hitbox_rules` | 관통 충돌체·이벤트 규칙 | 6 |
| `stored_munition_explosion_rules` | 저장 탄약 폭발 조건 | 10 |
| `explosive_damage_algorithm_rules` | 폭발 피해 처리 문서 규칙 | 8 |
| `resource_target_and_limit_rules` | 자원 목표량·수량 제한 | 6 |
| `station_trade_capacity_rules` | 정거장 재고·거래 공간·임무 게시판 | 4 |
| `construction_resource_claim_rules` | 건조·수리 자원 예약의 경계 | 4 |
| `salvage_and_trade_ownership_rules` | 회수·거래의 소유권 변경 경계 | 3 |
| `career_mission_scope` | 경력 임무 단계와 보상 축 | 4 |
| `mission_contact_station` | 정거장 연락 임무 | 3 |
| `mission_rescue_station` | 정거장 구출 임무 | 3 |
| `mission_resource_procurement` | 자원 조달 임무 | 6 |
| `mission_explore_system` | 성계 탐사 임무 | 3 |
| `crew_transport_station_supply` | 세력 승무원 수송선 | 3 |

## 별도 관리 자료

- [개발 예정 관측](../data/roadmap_observations.json): Career 2.0/2.5 6건. 출시 규칙 수에 포함하지 않음.
- [v4 추출](../data/starforge_v4.json): 고정 커밋에서 선택한 29행·14종 부품. 전체 코드 데이터의 완전 추출을 뜻하지 않음.
- [경제 진단](../analysis/recipe_diagnostics.json): 원료비·단위 혼합·반올림에 대한 연구자 계산. 원작 채택 필드를 변경하지 않음.
