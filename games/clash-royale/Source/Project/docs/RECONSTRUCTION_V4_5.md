# Crownfall v4.5 — 복원 근거의 실제 전투 반영

> 공개 자료 연구 패키지 v4.0.0, 조사 기준일 2026-11-17의 일부 근거를 게임 실행 설정과 새 카드 행동에 연결한다. 실제 원작 클라이언트 검증이나 전체 카드 프로필 복원을 주장하지 않는다.

## 1. 적용 범위

이번 연결은 데이터를 읽기만 하는 사전 기능에 그치지 않는다. 선택한 프로필의 공격 피해·주문 타워 피해·공격 간격을 전투 엔진에서 사용하고, Minion Giant와 Vines의 공개 행동을 게임 규칙으로 구현한다. 확인되지 않은 HP·반경·속도·제어 지속 시간 등은 자체 설계값으로 표시한다.

| 구분 | 내용 |
|---|---|
| 수치 연결 | 기존 6개 카드의 6개 필드 + Minion Giant의 3개 필드 |
| 행동 연결 | Minion Giant의 비행·건물 대상·원거리·넉백 면역, Vines의 최대 3대상 선택·중심 거리 동률·기절·접지 |
| 근거 입력 | 공식 패치 부분 필드 25행, 카드 행동 9행, 출처 9개 |
| 자동 적용 보류 | 선택한 패치 25행 중 17행 |
| 자체 카드 | 밀집보병·강철 검사에는 원작 카드 ID를 부여하지 않음 |
| 미연결 자료 | 경제·계정 성장·시즌·Merge Tactics 표 전체를 이 전투 엔진에 가져오지 않음 |

재구축 모듈은 요청 시 카드의 근거를 설명하는 순수 함수만 제공한다. 전투나 저장소를 직접 변경하지 않는다. 실제 수치 적용은 엔진의 카드 조회 경로에서, 실시간 수동 적용은 기존 개발자 밸런스 API에서 수행한다.

## 2. 두 데이터 프로필

| ID | 표시명 | 수치 계약 |
|---|---|---|
| `prototype-v4` | 자체 밸런스 | 기존 자체 수치를 사용. 공개 패치 덮어쓰기 없음 |
| `reconstructed-v4-lv11` | 공개 근거 반영 · Lv.11 | 허용된 부분 필드를 적용하고 나머지 값은 자체 설계로 유지 |

복원 프로필이 새 전투의 기본 선택이다. 여기서 Lv.11은 적용한 원작 수치의 근거 레벨을 뜻한다. 모든 카드의 모든 수치가 원작 11레벨이라는 뜻은 아니다. 시간처럼 레벨에 의존하지 않는 필드는 `not_applicable` 근거로 함께 사용한다.

전투의 프로필은 설정·스냅샷·리플레이와 함께 보존한다. 이전 규칙의 기록은 이전 자체 수치로 재생해야 한다. 전역 카드 원본을 수정해 과거 리플레이 결과를 바꾸지 않는다. 새 규칙 및 프로필을 알고 있는 엔진 경로만 새 동작을 사용한다.

### 수치 적용 우선순위

1. 버전별 기본 카드 정의를 선택한다.
2. 복원 프로필이면 해당 카드의 허용된 부분 필드를 겹쳐 적용한다.
3. 개발자 테스트에서 진영별 수동 조절값이 있으면 그 값을 적용한다.
4. 현재 값과 근거값의 일치 여부를 별도로 표시한다.

사용자가 자체 프로필에서 개발자 버튼으로 근거값을 수동 적용해도 프로필 ID 자체는 바뀌지 않는다. UI는 이 경우를 `근거값 일치 · 수동 설정`으로 표시할 수 있다. 숫자가 우연히 같다는 이유로 원작 프로필 전체가 적용되었다고 표시하지 않는다.

## 3. 필드별 적용표

| 게임 카드 ID | 엔진 필드 | 적용값 | 근거 조건 | 해석 |
|---|---|---:|---|---|
| `bomber` | `damage` | 212 | base / unit / Lv.11 | 병력 공격 피해 |
| `fireball` | `crownDamage` | 159 | base / spell / Lv.11 | 타워 적중 피해 |
| `arrows` | `crownDamage` | 75 | base / spell / Lv.11 | 이 프로토타입 주문의 타워 적중 피해 |
| `zap` | `crownDamage` | 48 | base / spell / Lv.11 | 타워 적중 피해 |
| `spear_goblins` | `attackInterval` | 1.6초 | base / unit / 레벨 비적용 | 공격 간격 |
| `poison` | `crownDamage` | 21/틱 | 전체 타워 피해 168, Lv.11 | 자체 8틱 계약으로 나눈 파생값 |
| `minion_giant` | `cost` | 4 | 공식 지원 메타데이터 | 소환 비용 |
| `minion_giant` | `damage` | 153 | base / unit / Lv.11 | 병력 공격 피해 |
| `minion_giant` | `attackInterval` | 1.7초 | base / unit / 레벨 비적용 | 공격 간격 |

특정 필드가 공식 근거를 갖더라도 같은 카드의 HP·속도·충돌 반경·투사체 비행 시간까지 확인된 것은 아니다. 이 게임의 타워 체력과 전장 좌표도 자체 규칙이다. 부분 수치 반영은 원작과 모든 교환 결과가 같다는 보증이 아니다.

### Poison: 합계와 틱당 값을 구분

공식 원장 값 168은 이 연결에서 전체 주문 타워 피해로 다룬다. 엔진의 `crownDamage`는 지속 주문에서는 틱당 값이다. 따라서 기존 8초·1초 간격·8틱 계약을 유지해 다음과 같이 변환한다.

```text
틱당 타워 피해 = 공식 전체 피해 168 / 자체 틱 수 8 = 21
전체 적용 피해 = 21 × 8 = 168
```

168을 틱당 값에 직접 넣지 않는다. 개발자 모드에서 지속 시간이나 피해 간격을 바꾸면 현재 전체 피해가 원장 168과 더 이상 일치하지 않을 수 있다. 근거 모듈은 `crownDamage=21`, `duration=8`, `tickInterval=1`이 모두 맞을 때만 `matchesEvidence:true`를 반환한다. 원작의 첫 피해 시점이나 틱 스케줄을 복원했다는 의미는 아니다.

## 4. 신규 카드 행동 계약

### Minion Giant

공식 문서에서 확인한 축은 비행, 건물 대상 원거리 공격, 넉백 면역이다. 넉백 면역을 모든 제어 효과 면역으로 확대하지 않는다. 기절·동결·감속·접지는 각 상태 규칙에 따라 별도로 처리한다.

게임 실행을 위해 보완하는 자체 값은 다음과 같다.

| 필드 | 자체 설계값 |
|---|---:|
| 체력 | 1,250 |
| 사거리 | 118px |
| 이동 속도 | 30px/초 |
| 충돌 반경 | 17px |
| 투사체 속도 | 240px/초 |
| 첫 타격 지연 | 0.35초 |

사거리 118px를 원작 타일 사거리로 해석하지 않는다. 공개 데이터의 미확인값을 정확한 원작 수치인 것처럼 채우지 않고, 카드 상세의 자체 보완 필드에 표시한다.

### Vines

공개 규칙은 높은 HP 대상 최대 3개, HP 동률일 때 주문 중심과 가까운 대상, 기절·피해·공중 대상 접지다. 구현을 결정하기 위해 다음 자체 정책을 사용한다.

| 결정 | 자체 재현 정책 |
|---|---|
| HP 비교 기준 | 현재 HP 내림차순 |
| 1차 동률 | 주문 중심과의 거리 오름차순 |
| 최종 동률 | 안정적인 개체 ID 순서 |
| 방패 HP | 원작 방패 계산은 미구현. 밀집보병의 피해 감소를 방패 HP로 더하지 않음 |
| 접지 피격 | 접지 중 지상 공격의 대상이 될 수 있는 자체 정책 |
| 접지 종료 | 영구 비행 속성을 보존하고 종료 시 원래 비행 상태로 복귀 |

주문 비용 4, 병력 피해 90, 반경 80px, 기절·접지 2초, 발동 지연 0.35초는 자체 설계값이다. 공식 원장에는 타워 피해 70이 있지만 원작 피해 틱 구조와 이번 단발 제어 주문의 대응이 확인되지 않아 자동 적용 대상에서 제외했다.

개발자 모드에서 제어 지속 시간을 바꿀 수 있더라도, 원작의 공식 지속 시간이 확인됐다는 뜻은 아니다. 대상 선택은 원문이 설명한 일부 축을 재현하고, 빠진 조건은 위와 같이 명시한 선택으로 완성한다.

## 5. 자동 적용 자격 검사

수치 적용에는 다음 조건이 모두 필요하다.

- `evidence_status`가 `official_confirmed`이다.
- `system`이 수록 공식 부분 필드 조회본이며 전체 현행 프로필이라고 주장하지 않는다.
- 후속 기준 레벨 미기재 변경이 없다.
- 기준 레벨이 11로 명시되었거나 `not_applicable`이다.
- `not_stated`를 레벨 비적용으로 취급하지 않는다.
- 카드 key, 형상, 구성요소, 필드, 단위가 명시한 연결과 일치한다.
- 값은 유한한 0 이상의 수치다.

필드 이름이 `hitpoints`로 같다는 이유만으로 Hero Knight의 보호막 512를 일반 Knight의 본체 HP에 적용하지 않는다. 2023 역사 수치는 이 모듈의 실행 프로필에 들어 있지 않다.

### 선택한 원장 중 자동 적용을 보류한 기록

| 원장 ID | 카드 / 형상 / 구성요소 | 값 | 보류 사유 |
|---|---|---|---|
| `PATCH_EXP_20260804_archers_evolution_power_shot_damage` | archers / evolution / power_shot | `damage` = 140 | 기준 레벨 미기재 |
| `PATCH_20260908_025` | bomber / evolution / bomb | `bounce_distance` = 3 | 기본형과 다른 형상 |
| `PATCH_20261006_042` | cannon / evolution / barrage | `damage` = 261 | 기본형과 다른 형상 |
| `PATCH_EXP_20260804_goblins_base_unit_damage` | goblins / base / unit | `damage` = 125 | 기준 레벨 미기재 |
| `PATCH_EXP_20260804_goblins_hero_banner_brigade_deploy_time` | goblins / hero / banner_brigade | `deploy_time` = 1 | 기본형과 다른 형상 |
| `PATCH_EXP_20260804_goblins_hero_banner_brigade_spawn_count` | goblins / hero / banner_brigade | `spawn_count` = 2 | 기본형과 다른 형상 |
| `PATCH_EXP_20260804_ice_spirit_base_unit_hitpoints` | ice-spirit / base / unit | `hitpoints` = 215 | 기준 레벨 미기재 |
| `PATCH_EXP_20260706_knight_hero_shield_hitpoints` | knight / hero / shield | `hitpoints` = 512 | 기본형과 다른 형상 |
| `PATCH_20261019_040` | skeletons / base / deployment | `spawn_spread` = 0.5 | 타일→px 변환 미정 |
| `PATCH_EXP_20260706_tombstone_hero_ability_cost` | tombstone / hero / ability | `cost` = 5 | 기본형과 다른 형상 |
| `PATCH_EXP_20260706_tombstone_hero_continuous_spawn_spawn_count` | tombstone / hero / continuous_spawn | `spawn_count` = 0 | 기본형과 다른 형상 |
| `PATCH_EXP_20260804_tombstone_hero_tomb_queen_damage` | tombstone / hero / tomb_queen | `damage` = 422 | 기준 레벨 미기재 |
| `PATCH_EXP_20260804_tombstone_hero_tomb_queen_hitpoints` | tombstone / hero / tomb_queen | `hitpoints` = 4224 | 기준 레벨 미기재 |
| `PATCH_EXP_20260706_tombstone_hero_tomb_queen_hitpoints` | tombstone / hero / tomb_queen | `hitpoints` = 4044 | 후속 변경의 레벨 미확정 |
| `PATCH_EXP_20260804_tombstone_hero_tomb_queen_sight_range` | tombstone / hero / tomb_queen | `sight_range` = 7 | 기본형과 다른 형상 |
| `PATCH_EXP_20260804_valkyrie_evolution_tornado_damage` | valkyrie / evolution / tornado | `damage` = 42 | 기준 레벨 미기재 |
| `PATCH_EXP_20260601_vines_base_spell_crown_tower_damage` | vines / base / spell | `crown_tower_damage` = 70 | 전체 주문 피해와 실행 틱 대응 미확인 |

이 표의 보류는 데이터 삭제가 아니다. 근거 모듈의 `blocked` 목록과 동봉 스냅샷에 기록을 남겨 카드 상세와 후속 개발에서 확인할 수 있다. 범위 밖 카드나 후속 레벨 문제가 해소되면 새 입력을 검토하고 프로필 버전을 갱신해야 한다.

## 6. 근거 모듈 API

파일: [reconstruction.js](../dist/js/reconstruction.js)

```javascript
import {
  DATA_PROFILES,
  DEFAULT_DATA_PROFILE,
  RECONSTRUCTED_OVERRIDES,
  getCardEvidence,
} from './reconstruction.js';

const evidence = getCardEvidence(cardId, game.dataProfile, game.getCard(cardId, team));
```

| 반환 항목 | 의미 |
|---|---|
| `profile`, `profileName`, `referenceLevel` | 현재 선택한 프로필과 근거 레벨 |
| `partial`, `originalClientVerified` | 항상 부분 재구축이며 실제 원작 검증은 false |
| `fields` | 적용 가능한 근거 수치와 현재 값, 출처, 적용 여부 |
| `fields[].value` | 엔진에 대응시킨 근거 수치 |
| `fields[].sourceValue` | 원장에 기록된 원래 값; Poison은168 |
| `fields[].liveValue` | 해당 진영에서 현재 조회한 수치 |
| `fields[].matchesEvidence` | 수치와 변환 조건이 모두 일치하는가 |
| `fields[].applied` | 복원 프로필이 선택되었고 근거값도 일치하는가 |
| `behaviors` | 구현한 공개 행동 축과 자체 정책 설명 |
| `prototypeFields` | 자체 설정 또는 수동 조절로 다루는 나머지 필드 |
| `blocked` | 미기재 레벨·형상·단위 등으로 적용하지 않은 기록 |

`sourceIds`, `recordIds`, `sourceUrls`는 배열이다. `notes`는 사람이 읽는 문자열이다. 반환 자료는 설명을 위한 것이며 원본 카드나 개발자 설정을 바꾸지 않는다. 소스 등록과 적용 상수는 깊게 동결되어 있다.

## 7. 근거 파일과 재생성

- [research-v4-evidence.json](../data/reconstruction/research-v4-evidence.json): 필요한 패치·행동·출처의 작은 부분집합
- [manifest.json](../data/reconstruction/manifest.json): 부분집합 SHA-256, 원래 연구 입력의 SHA-256, 범위
- [build-reconstruction-data.py](../scripts/build-reconstruction-data.py): 네트워크 없는 결정적 생성기
- [reconstruction.test.mjs](../tests/reconstruction.test.mjs): 레벨·형상·단위·파생 계산·UI 근거 상태 회귀 검사

```bash
python scripts/build-reconstruction-data.py
python scripts/build-reconstruction-data.py --check
node --test tests/reconstruction.test.mjs
```

`--check`는 출력 파일을 수정하지 않고, 근거 스냅샷의 해시와 생성 모듈의 바이트가 맞는지 확인한다. 원본 연구 프로젝트가 같은 컴퓨터에 없어도 실행할 수 있다. 전체 7,668행을 게임에 복사하지 않는다.

오프라인 게임 번들은 이 모듈을 포함해야 한다. 다운로드용 소스 ZIP에는 `data/reconstruction`도 들어 있어야 한다. 근거 조회 시점과 수치 적용 프로필은 자체 게임 버전과 별도로 관리한다.

## 8. 검증 범위

근거 모듈의 15개 회귀 검사는 미기재 레벨 차단, 후속 미확정 레벨 변경, 형상·구성요소·단위 불일치, Hero 보호막 혼입 방지, Poison 전체값과 틱값 분리, 수동 수정 표시, 신규 카드의 공개/자체 필드 경계, 출처 링크, 오프라인 재생성을 검사한다.

이 검사는 실제 원작 게임 관측을 대신하지 않는다. 전투 엔진·저장·리플레이·개발자 UI 통합 검증은 해당 모듈의 별도 검사와 전체 빌드에서 수행한다. 원작 전체 DB, 계정별 설정, 실제 클라이언트 화면, 네트워크 및 숨은 전투 처리 순서를 복구했다고 표시하지 않는다.
