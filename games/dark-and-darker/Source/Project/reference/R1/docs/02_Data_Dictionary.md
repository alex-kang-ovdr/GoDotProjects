# 데이터 사전 및 적용 계약

## 증거 모델

| 필드 | 의미 |
|---|---|
| id | 패키지 내 불변 식별자. 원작 내부 GUID라고 주장하지 않음 |
| source_id | sources.json의 출처 ID |
| source_url | 공개 자료 URL 또는 업로드 원본 local 식별자 |
| source_locator | 개별 표/절/스킬/공격명 |
| declared_patch | 그 자료가 표시한 스냅샷 버전. null이면 버전 미확인 |
| evidence_status | official_patch / community_snapshot / prototype 등 출처 유형 |
| observed_at | 이번 조사일. 원자료 작성일·패치 적용일과 다름 |
| notes | 해석 한계, 일부 예외, 구현 시 주의 |

`official_index`는 최신 공지 목록 탐색 근거일 뿐 개별 콘텐츠 수치의 근거가 아니다. 공식 페이지 일부는 직접 HTML 읽기가 되지 않아 검색 인덱스에 노출된 공식 본문을 사용했다. sources.retrieval에 이를 표기했다. 원문 전체의 영구 보존본을 제공하는 것은 아니다.

## null / 0 / 분기 부재

JSON null과 CSV·Excel 빈 셀은 미확인, 미표기 또는 해당 분기 없음이다. 의미는 각 필드와 문맥에 따라 아래와 같이 해석한다. null을 0으로 자동 변환하는 런타임 로더를 사용하면 안 된다.

| 필드 | 빈 값의 구체적 의미 |
|---|---|
| motion_curve, effective_reach_m, spawn_probability, selection_weight | 이번 조사에서 실제 값을 확보하지 못함 |
| recover_s, alternate_recover_s | 원본 표에 그 분기가 기재되지 않음. 0초 분기 생성 금지 |
| second_windup_s, second_hit_s | 단일 타격 모델에서는 해당 구간 없음; two_hits 모델에서는 둘 다 필요 |
| windup_s, hit_s | 공격 시간 일부 미추출. 총시간 계산을 거절해야 함 |
| cooldown_s | 쿨다운 미표기 또는 충전형. charges/설명과 함께 해석 |
| charges | 원본 사용 횟수 정보 미추출 또는 비충전형. 무한횟수로 간주 금지 |
| armor_penetration_fraction | 원본 탭에서 해당 수치를 확보하지 못함. 0%라고 단정 금지 |
| rarity_id | 원시 탭과 게임 희귀도 코드 crosswalk 미검증 |
| source_b | 충돌의 두 번째 설명이 같은 페이지 안에 있거나 별도 URL 없음 |

0은 출처에서 확인한 실제 수치다. 음수 방어 감소율은 취약성을 나타낼 수 있으므로 0으로 clamp하지 않는다.

## 단위

`*_s`는 초, `_fraction`/`_bonus`/`_multiplier`는 이름과 설명에 따라 소수 비율(0.1=10%)이다. `move_speed_add`와 `move_speed_rating`은 게임 rating 단위다. m/s가 아니다. `hitbox_raw`는 순서 Height/Width/Depth의 원시값이며 단위를 확정하지 않았다. `_m`는 해당 자료가 명시적으로 m를 사용한 필드에만 사용했다.

무기 damage_min/max는 각 원시 탭의 기본 무기 피해 범위다. 피해 계산 최종값이나 캐릭터 장비 최종 스탯이 아니다. 몬스터 base_damage도 자동 표에 표시된 패턴 피해값으로 저장하며 플레이어 방어·부위·모드가 반영된 실제 피격 HP 감소량으로 취급하지 않는다.

## 테이블 관계

classes ← abilities.class_id / spells.class_id / weapons.allowed_classes
weapons ← weapon_variants.weapon_id / attack_timings.weapon_id / weapon_movement.weapon_id
monsters ← monster_variants.monster_id ← monster_attacks.variant_id
sources ← 각 행의 source_id 및 conflicts.source_a/source_b

`prototype/v13_extracted.json`은 위 dad.* 테이블에 자동 JOIN하지 않는다. `integration/v13_mapping.json`의 후보 대응을 사람이 확인하고 승인해야 한다.

## 공격 시간

1. Windup → Hit는 순차.
2. 그 후 Recover, AlternateRecover, Finish 중 실제 전이 하나만 선택.
3. two_hits_then_branch이면 second_windup/second_hit를 먼저 추가.
4. 0% Action Speed 기준. 행동속도 수식과 hitstop은 미포함.
5. 타격 구간 길이가 짧다고 피해가 낮거나 공격 전체가 빠르다고 단정하지 않는다.
6. Longbow의 전체 시간은 미복원. Crossbow의 Finish 값만으로 공격 간격을 계산하지 않는다.

## 안전한 로드 계약

필수 필드 null → 실패. 요구 버전 불일치 → 실패. 충돌 unresolved 또는 구버전 경고 → 자동 적용 금지. prototype 값으로 fallback 금지. 모든 runtime export에는 target_patch, sources, unresolved_fields, 승인자를 기록한다. 이 패키지는 runtime export가 아니다.

`tools/query.py --patch`는 선언 버전 필터만 제공한다. 버전이 맞는다고 모든 공식·능력 동작·모션이 원작과 같다는 인증은 아니다. schemas는 현 R1 구조를 검증하기 위한 파일이며 새로운 필드를 추가하면 스키마도 수정해야 한다.
