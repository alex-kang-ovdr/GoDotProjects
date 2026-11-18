# production · recipe

[전체 목차](README.md)

각 필드는 값·단위·근거 상태·출처를 함께 읽는다. 영문 명칭은 식별용이며 한국어 명칭은 이 자료의 번역이다.

## 포탄 공장 생산식 (Cannon Ammo Factory recipe)

- ID: `recipe_ammo`
- 모드: `not_applicable`
- 버전 범위: Cosmoteer Modern / Steam; 공개 위키 관측 스냅샷이며 정확한 게임 빌드는 미확정

| 필드 | 값 | 단위 | 상태 | 출처 |
| --- | --- | --- | --- | --- |
| `factory_id` | cannon_ammo_factory | record_id | wiki_snapshot | [ECON-F-CANNON-AMMO-FACTORY](https://cosmoteer.wiki.gg/wiki/Ammo_Factory) |
| `inputs` | [{"resource_id":"sulfur","quantity":0.05}] | item[]/ratio | wiki_snapshot | [ECON-F-CANNON-AMMO-FACTORY](https://cosmoteer.wiki.gg/wiki/Ammo_Factory) |
| `outputs` | [{"resource_id":"ammo","quantity":1}] | item[]/ratio | wiki_snapshot | [ECON-F-CANNON-AMMO-FACTORY](https://cosmoteer.wiki.gg/wiki/Ammo_Factory) |
| `production_rate_per_s` | 2 | output_items/s | wiki_snapshot | [ECON-F-CANNON-AMMO-FACTORY](https://cosmoteer.wiki.gg/wiki/Ammo_Factory) |
| `input_rates_per_s` | [{"resource_id":"sulfur","quantity":0.1}] | item[]/s | wiki_snapshot | [ECON-F-CANNON-AMMO-FACTORY](https://cosmoteer.wiki.gg/wiki/Ammo_Factory) |
| `power_use_per_s` | 0.08 | game_power/s | wiki_snapshot | [ECON-F-CANNON-AMMO-FACTORY](https://cosmoteer.wiki.gg/wiki/Ammo_Factory) |
| `adjacent_factory_speed_bonus` | 0.25 | ratio/adjacent_factory | wiki_snapshot | [ECON-F-CANNON-AMMO-FACTORY](https://cosmoteer.wiki.gg/wiki/Ammo_Factory) |
| `processing_time_s` | 미확정 | s/output_cycle | unverified | 미확보 |
| `actual_batch_size` | 미확정 | output_items/cycle | unverified | 미확보 |
| `operating_crew_required` | 미확정 | crew | unverified | 미확보 |
| `power_per_output` | 0.04 | game_power/item | wiki_snapshot | [ECON-F-CANNON-AMMO-FACTORY](https://cosmoteer.wiki.gg/wiki/Ammo_Factory) |

### 적용 메모

- inputs/outputs는 자료에 적힌 물질 비율. 실제 묶음 생산 단위와 반올림 전 주기는 별도 확인 필요.

## 코일 공장 생산식 (Coil Factory recipe)

- ID: `recipe_coils`
- 모드: `not_applicable`
- 버전 범위: Cosmoteer Modern / Steam; 공개 위키 관측 스냅샷이며 정확한 게임 빌드는 미확정

| 필드 | 값 | 단위 | 상태 | 출처 |
| --- | --- | --- | --- | --- |
| `factory_id` | coil_factory | record_id | wiki_snapshot | [ECON-F-COIL-FACTORY](https://cosmoteer.wiki.gg/wiki/Coil_Factory) |
| `inputs` | [{"resource_id":"copper","quantity":1}] | item[]/ratio | wiki_snapshot | [ECON-F-COIL-FACTORY](https://cosmoteer.wiki.gg/wiki/Coil_Factory) |
| `outputs` | [{"resource_id":"coils","quantity":1}] | item[]/ratio | wiki_snapshot | [ECON-F-COIL-FACTORY](https://cosmoteer.wiki.gg/wiki/Coil_Factory) |
| `production_rate_per_s` | 미확정 | output_items/s | unverified | 미확보 |
| `input_rates_per_s` | [{"resource_id":"copper","quantity":0.67}] | item[]/s | wiki_snapshot | [ECON-F-COIL-FACTORY](https://cosmoteer.wiki.gg/wiki/Coil_Factory) |
| `power_use_per_s` | 0.05 | game_power/s | wiki_snapshot | [ECON-F-COIL-FACTORY](https://cosmoteer.wiki.gg/wiki/Coil_Factory) |
| `adjacent_factory_speed_bonus` | 0.25 | ratio/adjacent_factory | wiki_snapshot | [ECON-F-COIL-FACTORY](https://cosmoteer.wiki.gg/wiki/Coil_Factory) |
| `processing_time_s` | 미확정 | s/output_cycle | unverified | 미확보 |
| `actual_batch_size` | 미확정 | output_items/cycle | unverified | 미확보 |
| `operating_crew_required` | 미확정 | crew | unverified | 미확보 |

### 적용 메모

- inputs/outputs는 자료에 적힌 물질 비율. 실제 묶음 생산 단위와 반올림 전 주기는 별도 확인 필요.

## 다이아몬드 제련소 생산식 (Diamond Smelter recipe)

- ID: `recipe_diamonds`
- 모드: `not_applicable`
- 버전 범위: Cosmoteer Modern / Steam; 공개 위키 관측 스냅샷이며 정확한 게임 빌드는 미확정

| 필드 | 값 | 단위 | 상태 | 출처 |
| --- | --- | --- | --- | --- |
| `factory_id` | diamond_smelter | record_id | wiki_snapshot | [ECON-F-DIAMOND-SMELTER](https://cosmoteer.wiki.gg/wiki/Diamond_Smelter) |
| `inputs` | [{"resource_id":"carbon","quantity":20}] | item[]/ratio | wiki_snapshot | [ECON-F-DIAMOND-SMELTER](https://cosmoteer.wiki.gg/wiki/Diamond_Smelter) |
| `outputs` | [{"resource_id":"diamonds","quantity":1}] | item[]/ratio | wiki_snapshot | [ECON-F-DIAMOND-SMELTER](https://cosmoteer.wiki.gg/wiki/Diamond_Smelter) |
| `production_rate_per_s` | 미확정 | output_items/s | unverified | 미확보 |
| `input_rates_per_s` | 미확정 | item[]/s | unverified | 미확보 |
| `power_use_per_s` | 미확정 | game_power/s | unverified | 미확보 |
| `adjacent_factory_speed_bonus` | 0.25 | ratio/adjacent_factory | wiki_snapshot | [ECON-F-DIAMOND-SMELTER](https://cosmoteer.wiki.gg/wiki/Diamond_Smelter) |
| `processing_time_s` | 0 | s/output_cycle | wiki_snapshot | [ECON-F-DIAMOND-SMELTER](https://cosmoteer.wiki.gg/wiki/Diamond_Smelter) |
| `actual_batch_size` | 미확정 | output_items/cycle | unverified | 미확보 |
| `operating_crew_required` | 미확정 | crew | unverified | 미확보 |
| `instant_processing` | true | boolean | wiki_snapshot | [ECON-F-DIAMOND-SMELTER](https://cosmoteer.wiki.gg/wiki/Diamond_Smelter) |
| `power_per_output` | 1 | game_power/item | wiki_snapshot | [ECON-F-DIAMOND-SMELTER](https://cosmoteer.wiki.gg/wiki/Diamond_Smelter) |

### 적용 메모

- inputs/outputs는 자료에 적힌 물질 비율. 실제 묶음 생산 단위와 반올림 전 주기는 별도 확인 필요.
- 표시 ∞ 생산률은 JSON 숫자로 만들지 않고 null로 유지. 운반·전력 충전까지 무한 처리량이라는 뜻은 아님.

## EMP 미사일 공장 생산식 (E.M.P. Missile Factory recipe)

- ID: `recipe_emp_missile_parts`
- 모드: `not_applicable`
- 버전 범위: Cosmoteer Modern / Steam; 공개 위키 관측 스냅샷이며 정확한 게임 빌드는 미확정

| 필드 | 값 | 단위 | 상태 | 출처 |
| --- | --- | --- | --- | --- |
| `factory_id` | emp_missile_factory | record_id | wiki_snapshot | [ECON-F-EMP-MISSILE-FACTORY](https://cosmoteer.wiki.gg/wiki/E.M.P._Missile_Factory) |
| `inputs` | 미확정 | item[]/ratio | conflict | [ECON-F-EMP-MISSILE-FACTORY](https://cosmoteer.wiki.gg/wiki/E.M.P._Missile_Factory) |
| `outputs` | [{"resource_id":"emp_missile_parts","quantity":1}] | item[]/ratio | wiki_snapshot | [ECON-F-EMP-MISSILE-FACTORY](https://cosmoteer.wiki.gg/wiki/E.M.P._Missile_Factory) |
| `production_rate_per_s` | 2 | output_items/s | wiki_snapshot | [ECON-F-EMP-MISSILE-FACTORY](https://cosmoteer.wiki.gg/wiki/E.M.P._Missile_Factory) |
| `input_rates_per_s` | [{"resource_id":"iron","quantity":0.1},{"resource_id":"copper","quantity":0.1}] | item[]/s | wiki_snapshot | [ECON-F-EMP-MISSILE-FACTORY](https://cosmoteer.wiki.gg/wiki/E.M.P._Missile_Factory) |
| `power_use_per_s` | 0.5 | game_power/s | wiki_snapshot | [ECON-F-EMP-MISSILE-FACTORY](https://cosmoteer.wiki.gg/wiki/E.M.P._Missile_Factory) |
| `adjacent_factory_speed_bonus` | 0.25 | ratio/adjacent_factory | wiki_snapshot | [ECON-F-EMP-MISSILE-FACTORY](https://cosmoteer.wiki.gg/wiki/E.M.P._Missile_Factory) |
| `processing_time_s` | 미확정 | s/output_cycle | unverified | 미확보 |
| `actual_batch_size` | 미확정 | output_items/cycle | unverified | 미확보 |
| `operating_crew_required` | 미확정 | crew | unverified | 미확보 |

### 적용 메모

- inputs/outputs는 자료에 적힌 물질 비율. 실제 묶음 생산 단위와 반올림 전 주기는 별도 확인 필요.
- 제작표는 부품1개당 각0.45, 본문 비율은 각0.05. 완성 미사일 기준 혼재 가능성이 있으나 입력을 확정하지 않음.

### 대조 관측값

```json
[
  {
    "field": "inputs",
    "value": [
      {
        "resource_id": "iron",
        "quantity": 0.45
      },
      {
        "resource_id": "copper",
        "quantity": 0.45
      }
    ],
    "source_id": "ECON-F-EMP-MISSILE-FACTORY",
    "location": "crafting table per part"
  },
  {
    "field": "inputs",
    "value": [
      {
        "resource_id": "iron",
        "quantity": 0.05
      },
      {
        "resource_id": "copper",
        "quantity": 0.05
      }
    ],
    "source_id": "ECON-F-EMP-MISSILE-FACTORY",
    "location": "normalized from body ratio 1:1:20"
  }
]
```

## 우라늄 농축기 생산식 (Uranium Enricher recipe)

- ID: `recipe_enriched_uranium`
- 모드: `not_applicable`
- 버전 범위: Cosmoteer Modern / Steam; 공개 위키 관측 스냅샷이며 정확한 게임 빌드는 미확정

| 필드 | 값 | 단위 | 상태 | 출처 |
| --- | --- | --- | --- | --- |
| `factory_id` | uranium_enricher | record_id | wiki_snapshot | [ECON-F-URANIUM-ENRICHER](https://cosmoteer.wiki.gg/wiki/Uranium_Enricher) |
| `inputs` | [{"resource_id":"uranium","quantity":4}] | item[]/ratio | wiki_snapshot | [ECON-F-URANIUM-ENRICHER](https://cosmoteer.wiki.gg/wiki/Uranium_Enricher) |
| `outputs` | [{"resource_id":"enriched_uranium","quantity":1}] | item[]/ratio | wiki_snapshot | [ECON-F-URANIUM-ENRICHER](https://cosmoteer.wiki.gg/wiki/Uranium_Enricher) |
| `production_rate_per_s` | 0.17 | output_items/s | wiki_snapshot | [ECON-F-URANIUM-ENRICHER](https://cosmoteer.wiki.gg/wiki/Uranium_Enricher) |
| `input_rates_per_s` | [{"resource_id":"uranium","quantity":0.67}] | item[]/s | wiki_snapshot | [ECON-F-URANIUM-ENRICHER](https://cosmoteer.wiki.gg/wiki/Uranium_Enricher) |
| `power_use_per_s` | 0.17 | game_power/s | wiki_snapshot | [ECON-F-URANIUM-ENRICHER](https://cosmoteer.wiki.gg/wiki/Uranium_Enricher) |
| `adjacent_factory_speed_bonus` | 0.25 | ratio/adjacent_factory | wiki_snapshot | [ECON-F-URANIUM-ENRICHER](https://cosmoteer.wiki.gg/wiki/Uranium_Enricher) |
| `processing_time_s` | 미확정 | s/output_cycle | unverified | 미확보 |
| `actual_batch_size` | 미확정 | output_items/cycle | unverified | 미확보 |
| `operating_crew_required` | 미확정 | crew | unverified | 미확보 |

### 적용 메모

- inputs/outputs는 자료에 적힌 물질 비율. 실제 묶음 생산 단위와 반올림 전 주기는 별도 확인 필요.

## 고폭 미사일 공장 생산식 (High-Explosive Missile Factory recipe)

- ID: `recipe_he_missile_parts`
- 모드: `not_applicable`
- 버전 범위: Cosmoteer Modern / Steam; 공개 위키 관측 스냅샷이며 정확한 게임 빌드는 미확정

| 필드 | 값 | 단위 | 상태 | 출처 |
| --- | --- | --- | --- | --- |
| `factory_id` | he_missile_factory | record_id | wiki_snapshot | [ECON-F-HE-MISSILE-FACTORY](https://cosmoteer.wiki.gg/wiki/High-Explosive_Missile_Factory) |
| `inputs` | [{"resource_id":"iron","quantity":0.05},{"resource_id":"sulfur","quantity":0.05}] | item[]/ratio | wiki_snapshot | [ECON-F-HE-MISSILE-FACTORY](https://cosmoteer.wiki.gg/wiki/High-Explosive_Missile_Factory) |
| `outputs` | [{"resource_id":"he_missile_parts","quantity":1}] | item[]/ratio | wiki_snapshot | [ECON-F-HE-MISSILE-FACTORY](https://cosmoteer.wiki.gg/wiki/High-Explosive_Missile_Factory) |
| `production_rate_per_s` | 3.33 | output_items/s | wiki_snapshot | [ECON-F-HE-MISSILE-FACTORY](https://cosmoteer.wiki.gg/wiki/High-Explosive_Missile_Factory) |
| `input_rates_per_s` | 미확정 | item[]/s | unverified | [ECON-F-HE-MISSILE-FACTORY](https://cosmoteer.wiki.gg/wiki/High-Explosive_Missile_Factory) |
| `power_use_per_s` | 0.42 | game_power/s | wiki_snapshot | [ECON-F-HE-MISSILE-FACTORY](https://cosmoteer.wiki.gg/wiki/High-Explosive_Missile_Factory) |
| `adjacent_factory_speed_bonus` | 0.25 | ratio/adjacent_factory | wiki_snapshot | [ECON-F-HE-MISSILE-FACTORY](https://cosmoteer.wiki.gg/wiki/High-Explosive_Missile_Factory) |
| `processing_time_s` | 미확정 | s/output_cycle | unverified | 미확보 |
| `actual_batch_size` | 1 | output_items/cycle | wiki_snapshot | [ECON-F-HE-MISSILE-FACTORY](https://cosmoteer.wiki.gg/wiki/High-Explosive_Missile_Factory) |
| `operating_crew_required` | 미확정 | crew | unverified | 미확보 |

### 적용 메모

- inputs/outputs는 자료에 적힌 물질 비율. 실제 묶음 생산 단위와 반올림 전 주기는 별도 확인 필요.
- 원문 소비율 표에는 철0.17/초만 있고 황 소비율은 빠져 있어 부분표다. 완결된 소비율 배열로 사용하면 황이 무료로 처리되므로 전체 input_rates_per_s는 null. 철 관측값만 observations에 보존하며 황 소비율은 추정하지 않음.
- 본문 1철+1황→20부품 비율과 제작표가 일치. 인포박스 철 0.2 표기는 완성 미사일/부품 기준이 불명확하여 비율로 재사용하지 않음.

### 대조 관측값

```json
[
  {
    "field": "input_rates_per_s",
    "value": [
      {
        "resource_id": "iron",
        "quantity": 0.17
      }
    ],
    "unit": "item[]/s",
    "source_id": "ECON-F-HE-MISSILE-FACTORY",
    "status": "partial_table",
    "location": "infobox Resource Use shows iron 0.17/sec only; sulfur rate is absent"
  }
]
```

## 하이퍼 코일 공장 생산식 (Hyper-Coil Factory recipe)

- ID: `recipe_hyper_coils`
- 모드: `not_applicable`
- 버전 범위: Cosmoteer Modern / Steam; 공개 위키 관측 스냅샷이며 정확한 게임 빌드는 미확정

| 필드 | 값 | 단위 | 상태 | 출처 |
| --- | --- | --- | --- | --- |
| `factory_id` | hyper_coil_factory | record_id | wiki_snapshot | [ECON-F-HYPER-COIL-FACTORY](https://cosmoteer.wiki.gg/wiki/Hyper-Coil_Factory) |
| `inputs` | [{"resource_id":"coils","quantity":2},{"resource_id":"copper","quantity":0.5}] | item[]/ratio | wiki_snapshot | [ECON-F-HYPER-COIL-FACTORY](https://cosmoteer.wiki.gg/wiki/Hyper-Coil_Factory) |
| `outputs` | [{"resource_id":"hyper_coils","quantity":1}] | item[]/ratio | wiki_snapshot | [ECON-F-HYPER-COIL-FACTORY](https://cosmoteer.wiki.gg/wiki/Hyper-Coil_Factory) |
| `production_rate_per_s` | 0.5 | output_items/s | wiki_snapshot | [ECON-F-HYPER-COIL-FACTORY](https://cosmoteer.wiki.gg/wiki/Hyper-Coil_Factory) |
| `input_rates_per_s` | [{"resource_id":"coils","quantity":1},{"resource_id":"copper","quantity":0.25}] | item[]/s | wiki_snapshot | [ECON-F-HYPER-COIL-FACTORY](https://cosmoteer.wiki.gg/wiki/Hyper-Coil_Factory) |
| `power_use_per_s` | 0.06 | game_power/s | wiki_snapshot | [ECON-F-HYPER-COIL-FACTORY](https://cosmoteer.wiki.gg/wiki/Hyper-Coil_Factory) |
| `adjacent_factory_speed_bonus` | 0.25 | ratio/adjacent_factory | wiki_snapshot | [ECON-F-HYPER-COIL-FACTORY](https://cosmoteer.wiki.gg/wiki/Hyper-Coil_Factory) |
| `processing_time_s` | 미확정 | s/output_cycle | unverified | 미확보 |
| `actual_batch_size` | 미확정 | output_items/cycle | unverified | 미확보 |
| `operating_crew_required` | 미확정 | crew | unverified | 미확보 |

### 적용 메모

- inputs/outputs는 자료에 적힌 물질 비율. 실제 묶음 생산 단위와 반올림 전 주기는 별도 확인 필요.

## 기뢰 공장 생산식 (Mine Factory recipe)

- ID: `recipe_mine_parts`
- 모드: `not_applicable`
- 버전 범위: Cosmoteer Modern / Steam; 공개 위키 관측 스냅샷이며 정확한 게임 빌드는 미확정

| 필드 | 값 | 단위 | 상태 | 출처 |
| --- | --- | --- | --- | --- |
| `factory_id` | mine_factory | record_id | wiki_snapshot | [ECON-F-MINE-FACTORY](https://cosmoteer.wiki.gg/wiki/Mine_Factory) |
| `inputs` | 미확정 | item[]/ratio | conflict | [ECON-F-MINE-FACTORY](https://cosmoteer.wiki.gg/wiki/Mine_Factory) |
| `outputs` | [{"resource_id":"mine_parts","quantity":1}] | item[]/ratio | wiki_snapshot | [ECON-F-MINE-FACTORY](https://cosmoteer.wiki.gg/wiki/Mine_Factory) |
| `production_rate_per_s` | 0.5 | output_items/s | wiki_snapshot | [ECON-F-MINE-FACTORY](https://cosmoteer.wiki.gg/wiki/Mine_Factory) |
| `input_rates_per_s` | [{"resource_id":"iron","quantity":0.1},{"resource_id":"ammo","quantity":4}] | item[]/s | wiki_snapshot | [ECON-F-MINE-FACTORY](https://cosmoteer.wiki.gg/wiki/Mine_Factory) |
| `power_use_per_s` | 0.5 | game_power/s | wiki_snapshot | [ECON-F-MINE-FACTORY](https://cosmoteer.wiki.gg/wiki/Mine_Factory) |
| `adjacent_factory_speed_bonus` | 0.25 | ratio/adjacent_factory | wiki_snapshot | [ECON-F-MINE-FACTORY](https://cosmoteer.wiki.gg/wiki/Mine_Factory) |
| `processing_time_s` | 미확정 | s/output_cycle | unverified | 미확보 |
| `actual_batch_size` | 미확정 | output_items/cycle | unverified | 미확보 |
| `operating_crew_required` | 미확정 | crew | unverified | 미확보 |

### 적용 메모

- inputs/outputs는 자료에 적힌 물질 비율. 실제 묶음 생산 단위와 반올림 전 주기는 별도 확인 필요.
- 기뢰 공장 제작표와 인포박스 입력량이 두 배 차이. 완성 기뢰/부품 단위를 단정하지 않음.

### 대조 관측값

```json
[
  {
    "field": "inputs",
    "value": [
      {
        "resource_id": "iron",
        "quantity": 0.1
      },
      {
        "resource_id": "ammo",
        "quantity": 4
      }
    ],
    "source_id": "ECON-F-MINE-FACTORY",
    "location": "crafting table"
  },
  {
    "field": "inputs",
    "value": [
      {
        "resource_id": "iron",
        "quantity": 0.2
      },
      {
        "resource_id": "ammo",
        "quantity": 8
      }
    ],
    "source_id": "ECON-F-MINE-FACTORY",
    "location": "infobox Resource Use"
  }
]
```

## 핵미사일 공장 생산식 (Nuclear Missile Factory recipe)

- ID: `recipe_nuclear_missile_parts`
- 모드: `not_applicable`
- 버전 범위: Cosmoteer Modern / Steam; 공개 위키 관측 스냅샷이며 정확한 게임 빌드는 미확정

| 필드 | 값 | 단위 | 상태 | 출처 |
| --- | --- | --- | --- | --- |
| `factory_id` | nuclear_missile_factory | record_id | wiki_snapshot | [ECON-F-NUCLEAR-MISSILE-FACTORY](https://cosmoteer.wiki.gg/wiki/Nuclear_Missile_Factory) |
| `inputs` | [{"resource_id":"iron","quantity":0.05},{"resource_id":"uranium","quantity":0.02}] | item[]/ratio | wiki_snapshot | [ECON-F-NUCLEAR-MISSILE-FACTORY](https://cosmoteer.wiki.gg/wiki/Nuclear_Missile_Factory) |
| `outputs` | [{"resource_id":"nuclear_missile_parts","quantity":1}] | item[]/ratio | wiki_snapshot | [ECON-F-NUCLEAR-MISSILE-FACTORY](https://cosmoteer.wiki.gg/wiki/Nuclear_Missile_Factory) |
| `production_rate_per_s` | 미확정 | output_items/s | unverified | 미확보 |
| `input_rates_per_s` | [{"resource_id":"iron","quantity":0.1},{"resource_id":"uranium","quantity":0.04}] | item[]/s | wiki_snapshot | [ECON-F-NUCLEAR-MISSILE-FACTORY](https://cosmoteer.wiki.gg/wiki/Nuclear_Missile_Factory) |
| `power_use_per_s` | 0.67 | game_power/s | wiki_snapshot | [ECON-F-NUCLEAR-MISSILE-FACTORY](https://cosmoteer.wiki.gg/wiki/Nuclear_Missile_Factory) |
| `adjacent_factory_speed_bonus` | 0.25 | ratio/adjacent_factory | wiki_snapshot | [ECON-F-NUCLEAR-MISSILE-FACTORY](https://cosmoteer.wiki.gg/wiki/Nuclear_Missile_Factory) |
| `processing_time_s` | 미확정 | s/output_cycle | unverified | 미확보 |
| `actual_batch_size` | 미확정 | output_items/cycle | unverified | 미확보 |
| `operating_crew_required` | 미확정 | crew | unverified | 미확보 |

### 적용 메모

- inputs/outputs는 자료에 적힌 물질 비율. 실제 묶음 생산 단위와 반올림 전 주기는 별도 확인 필요.

## 프로세서 제조기 생산식 (Processor Fabricator recipe)

- ID: `recipe_processor`
- 모드: `not_applicable`
- 버전 범위: Cosmoteer Modern / Steam; 공개 위키 관측 스냅샷이며 정확한 게임 빌드는 미확정

| 필드 | 값 | 단위 | 상태 | 출처 |
| --- | --- | --- | --- | --- |
| `factory_id` | processor_fabricator | record_id | wiki_snapshot | [ECON-F-PROCESSOR-FABRICATOR](https://cosmoteer.wiki.gg/wiki/Processor_Fabricator) |
| `inputs` | [{"resource_id":"coils","quantity":5},{"resource_id":"gold","quantity":3}] | item[]/ratio | wiki_snapshot | [ECON-F-PROCESSOR-FABRICATOR](https://cosmoteer.wiki.gg/wiki/Processor_Fabricator) |
| `outputs` | [{"resource_id":"processor","quantity":1}] | item[]/ratio | wiki_snapshot | [ECON-F-PROCESSOR-FABRICATOR](https://cosmoteer.wiki.gg/wiki/Processor_Fabricator) |
| `production_rate_per_s` | 0.2 | output_items/s | wiki_snapshot | [ECON-F-PROCESSOR-FABRICATOR](https://cosmoteer.wiki.gg/wiki/Processor_Fabricator) |
| `input_rates_per_s` | [{"resource_id":"coils","quantity":1},{"resource_id":"gold","quantity":0.6}] | item[]/s | wiki_snapshot | [ECON-F-PROCESSOR-FABRICATOR](https://cosmoteer.wiki.gg/wiki/Processor_Fabricator) |
| `power_use_per_s` | 0.1 | game_power/s | wiki_snapshot | [ECON-F-PROCESSOR-FABRICATOR](https://cosmoteer.wiki.gg/wiki/Processor_Fabricator) |
| `adjacent_factory_speed_bonus` | 0.25 | ratio/adjacent_factory | wiki_snapshot | [ECON-F-PROCESSOR-FABRICATOR](https://cosmoteer.wiki.gg/wiki/Processor_Fabricator) |
| `processing_time_s` | 미확정 | s/output_cycle | unverified | 미확보 |
| `actual_batch_size` | 미확정 | output_items/cycle | unverified | 미확보 |
| `operating_crew_required` | 미확정 | crew | unverified | 미확보 |

### 적용 메모

- inputs/outputs는 자료에 적힌 물질 비율. 실제 묶음 생산 단위와 반올림 전 주기는 별도 확인 필요.

## 강철 제련소 생산식 (Steel Smelter recipe)

- ID: `recipe_steel`
- 모드: `not_applicable`
- 버전 범위: Cosmoteer Modern / Steam; 공개 위키 관측 스냅샷이며 정확한 게임 빌드는 미확정

| 필드 | 값 | 단위 | 상태 | 출처 |
| --- | --- | --- | --- | --- |
| `factory_id` | steel_smelter | record_id | wiki_snapshot | [ECON-F-STEEL-SMELTER](https://cosmoteer.wiki.gg/wiki/Steel_Smelter) |
| `inputs` | 미확정 | item[]/ratio | conflict | [ECON-F-STEEL-SMELTER](https://cosmoteer.wiki.gg/wiki/Steel_Smelter), [ECON-R-STEEL](https://cosmoteer.wiki.gg/wiki/Steel) |
| `outputs` | [{"resource_id":"steel","quantity":1}] | item[]/ratio | wiki_snapshot | [ECON-F-STEEL-SMELTER](https://cosmoteer.wiki.gg/wiki/Steel_Smelter) |
| `production_rate_per_s` | 1 | output_items/s | wiki_snapshot | [ECON-F-STEEL-SMELTER](https://cosmoteer.wiki.gg/wiki/Steel_Smelter) |
| `input_rates_per_s` | [{"resource_id":"iron","quantity":1}] | item[]/s | wiki_snapshot | [ECON-F-STEEL-SMELTER](https://cosmoteer.wiki.gg/wiki/Steel_Smelter) |
| `power_use_per_s` | 0.04 | game_power/s | wiki_snapshot | [ECON-F-STEEL-SMELTER](https://cosmoteer.wiki.gg/wiki/Steel_Smelter) |
| `adjacent_factory_speed_bonus` | 0.25 | ratio/adjacent_factory | wiki_snapshot | [ECON-F-STEEL-SMELTER](https://cosmoteer.wiki.gg/wiki/Steel_Smelter) |
| `processing_time_s` | 미확정 | s/output_cycle | unverified | 미확보 |
| `actual_batch_size` | 미확정 | output_items/cycle | unverified | 미확보 |
| `operating_crew_required` | 미확정 | crew | unverified | 미확보 |

### 적용 메모

- inputs/outputs는 자료에 적힌 물질 비율. 실제 묶음 생산 단위와 반올림 전 주기는 별도 확인 필요.
- 강철 자원 인포박스는 철2, 공장과 제작표는 철1. 현행 원본을 대조하지 못해 확정 입력량을 null로 보류.

### 대조 관측값

```json
[
  {
    "field": "inputs",
    "value": [
      {
        "resource_id": "iron",
        "quantity": 1
      }
    ],
    "source_id": "ECON-F-STEEL-SMELTER",
    "location": "crafting table / Resource Use"
  },
  {
    "field": "inputs",
    "value": [
      {
        "resource_id": "iron",
        "quantity": 2
      }
    ],
    "source_id": "ECON-R-STEEL",
    "location": "resource infobox"
  }
]
```

## 열 캐니스터 미사일 공장 생산식 (Thermal Canister Missile Factory recipe)

- ID: `recipe_thermal_canister_missile_parts`
- 모드: `not_applicable`
- 버전 범위: Cosmoteer Modern / Steam; 공개 위키 관측 스냅샷이며 정확한 게임 빌드는 미확정

| 필드 | 값 | 단위 | 상태 | 출처 |
| --- | --- | --- | --- | --- |
| `factory_id` | thermal_canister_missile_factory | record_id | wiki_snapshot | [ECON-F-THERMAL-CANISTER-MISSILE-FACTORY](https://cosmoteer.wiki.gg/wiki/Thermal_Canister_Missile_Factory) |
| `inputs` | [{"resource_id":"sulfur","quantity":1},{"resource_id":"copper","quantity":1}] | item[]/ratio | wiki_snapshot | [ECON-F-THERMAL-CANISTER-MISSILE-FACTORY](https://cosmoteer.wiki.gg/wiki/Thermal_Canister_Missile_Factory) |
| `outputs` | [{"resource_id":"thermal_canister_missile_parts","quantity":20}] | item[]/ratio | wiki_snapshot | [ECON-F-THERMAL-CANISTER-MISSILE-FACTORY](https://cosmoteer.wiki.gg/wiki/Thermal_Canister_Missile_Factory) |
| `production_rate_per_s` | 미확정 | output_items/s | unverified | 미확보 |
| `input_rates_per_s` | 미확정 | item[]/s | unverified | 미확보 |
| `power_use_per_s` | 0.42 | game_power/s | wiki_snapshot | [ECON-F-THERMAL-CANISTER-MISSILE-FACTORY](https://cosmoteer.wiki.gg/wiki/Thermal_Canister_Missile_Factory) |
| `adjacent_factory_speed_bonus` | 0.25 | ratio/adjacent_factory | wiki_snapshot | [ECON-F-THERMAL-CANISTER-MISSILE-FACTORY](https://cosmoteer.wiki.gg/wiki/Thermal_Canister_Missile_Factory) |
| `processing_time_s` | 미확정 | s/output_cycle | unverified | 미확보 |
| `actual_batch_size` | 미확정 | output_items/cycle | unverified | 미확보 |
| `operating_crew_required` | 미확정 | crew | unverified | 미확보 |

### 적용 메모

- inputs/outputs는 자료에 적힌 물질 비율. 실제 묶음 생산 단위와 반올림 전 주기는 별도 확인 필요.
- 본문의 1황+1구리→20부품 비율만 확인. 20개 일괄 생산이라는 의미로 해석하지 않음.

## 트리 스틸 제련소 생산식 (Tri-Steel Smelter recipe)

- ID: `recipe_tri_steel`
- 모드: `not_applicable`
- 버전 범위: Cosmoteer Modern / Steam; 공개 위키 관측 스냅샷이며 정확한 게임 빌드는 미확정

| 필드 | 값 | 단위 | 상태 | 출처 |
| --- | --- | --- | --- | --- |
| `factory_id` | tri_steel_smelter | record_id | wiki_snapshot | [ECON-F-TRI-STEEL-SMELTER](https://cosmoteer.wiki.gg/wiki/Tri-Steel_Smelter) |
| `inputs` | 미확정 | item[]/ratio | conflict | [ECON-F-TRI-STEEL-SMELTER](https://cosmoteer.wiki.gg/wiki/Tri-Steel_Smelter), [ECON-R-TRI-STEEL](https://cosmoteer.wiki.gg/wiki/Tri-Steel) |
| `outputs` | [{"resource_id":"tri_steel","quantity":1}] | item[]/ratio | wiki_snapshot | [ECON-F-TRI-STEEL-SMELTER](https://cosmoteer.wiki.gg/wiki/Tri-Steel_Smelter) |
| `production_rate_per_s` | 0.33 | output_items/s | wiki_snapshot | [ECON-F-TRI-STEEL-SMELTER](https://cosmoteer.wiki.gg/wiki/Tri-Steel_Smelter) |
| `input_rates_per_s` | [{"resource_id":"tritanium","quantity":0.33}] | item[]/s | wiki_snapshot | [ECON-F-TRI-STEEL-SMELTER](https://cosmoteer.wiki.gg/wiki/Tri-Steel_Smelter) |
| `power_use_per_s` | 0.08 | game_power/s | wiki_snapshot | [ECON-F-TRI-STEEL-SMELTER](https://cosmoteer.wiki.gg/wiki/Tri-Steel_Smelter) |
| `adjacent_factory_speed_bonus` | 0.25 | ratio/adjacent_factory | wiki_snapshot | [ECON-F-TRI-STEEL-SMELTER](https://cosmoteer.wiki.gg/wiki/Tri-Steel_Smelter) |
| `processing_time_s` | 미확정 | s/output_cycle | unverified | 미확보 |
| `actual_batch_size` | 미확정 | output_items/cycle | unverified | 미확보 |
| `operating_crew_required` | 미확정 | crew | unverified | 미확보 |

### 적용 메모

- inputs/outputs는 자료에 적힌 물질 비율. 실제 묶음 생산 단위와 반올림 전 주기는 별도 확인 필요.
- 트리 스틸 자원 인포박스는 자기 자신을 입력으로, 공장·본문은 트리타늄을 입력으로 표시. 오기 가능성이 있으나 확정하지 않음.

### 대조 관측값

```json
[
  {
    "field": "inputs",
    "value": [
      {
        "resource_id": "tritanium",
        "quantity": 1
      }
    ],
    "source_id": "ECON-F-TRI-STEEL-SMELTER",
    "location": "crafting table"
  },
  {
    "field": "inputs",
    "value": [
      {
        "resource_id": "tri_steel",
        "quantity": 1
      }
    ],
    "source_id": "ECON-R-TRI-STEEL",
    "location": "resource infobox"
  }
]
```

