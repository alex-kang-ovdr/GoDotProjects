# factory · part

[전체 목차](README.md)

각 필드는 값·단위·근거 상태·출처를 함께 읽는다. 영문 명칭은 식별용이며 한국어 명칭은 이 자료의 번역이다.

## 포탄 공장 (Cannon Ammo Factory)

- ID: `cannon_ammo_factory`
- 모드: `normal`
- 버전 범위: Cosmoteer Modern / Steam; 공개 위키 관측 스냅샷이며 정확한 게임 빌드는 미확정

| 필드 | 값 | 단위 | 상태 | 출처 |
| --- | --- | --- | --- | --- |
| `value_credits` | 4000 | credits | wiki_snapshot | [ECON-F-CANNON-AMMO-FACTORY](https://cosmoteer.wiki.gg/wiki/Ammo_Factory) |
| `blueprint_cost_credits` | 2000 | credits | wiki_snapshot | [ECON-F-CANNON-AMMO-FACTORY](https://cosmoteer.wiki.gg/wiki/Ammo_Factory) |
| `width_m` | 2 | m | wiki_snapshot | [ECON-F-CANNON-AMMO-FACTORY](https://cosmoteer.wiki.gg/wiki/Ammo_Factory) |
| `height_m` | 2 | m | wiki_snapshot | [ECON-F-CANNON-AMMO-FACTORY](https://cosmoteer.wiki.gg/wiki/Ammo_Factory) |
| `mass_t` | 4 | tonne | wiki_snapshot | [ECON-F-CANNON-AMMO-FACTORY](https://cosmoteer.wiki.gg/wiki/Ammo_Factory) |
| `hp` | 4000 | HP | wiki_snapshot | [ECON-F-CANNON-AMMO-FACTORY](https://cosmoteer.wiki.gg/wiki/Ammo_Factory) |
| `crew_speed_multiplier` | 0.5 | ratio | wiki_snapshot | [ECON-F-CANNON-AMMO-FACTORY](https://cosmoteer.wiki.gg/wiki/Ammo_Factory) |
| `command_points_used` | 1 | command_points | wiki_snapshot | [ECON-F-CANNON-AMMO-FACTORY](https://cosmoteer.wiki.gg/wiki/Ammo_Factory) |
| `power_capacity` | 2 | game_power | wiki_snapshot | [ECON-F-CANNON-AMMO-FACTORY](https://cosmoteer.wiki.gg/wiki/Ammo_Factory) |
| `construction_resources` | [{"resource_id":"steel","quantity":32},{"resource_id":"coils","quantity":24},{"resource_id":"tri_steel","quantity":4}] | item[] | wiki_snapshot | [ECON-F-CANNON-AMMO-FACTORY](https://cosmoteer.wiki.gg/wiki/Ammo_Factory) |
| `resource_capacity` | [{"resource_id":"sulfur","quantity":5},{"resource_id":"ammo","quantity":20}] | item[] | wiki_snapshot | [ECON-F-CANNON-AMMO-FACTORY](https://cosmoteer.wiki.gg/wiki/Ammo_Factory) |
| `required_blueprints` | ["standard_cannon"] | record_id[] | wiki_snapshot | [ECON-F-CANNON-AMMO-FACTORY](https://cosmoteer.wiki.gg/wiki/Ammo_Factory) |
| `operating_crew_required` | 미확정 | crew | unverified | 미확보 |

### 적용 메모

- Crew Speed는 통과 이동 계수이며 필수 조작 인원 수가 아님. 별도 필수 인원은 미확인.
- 공장 내부 재고는 표에 명시된 용량만 보존. 일반 창고 타일량으로 다시 계산하지 않음.

## 코일 공장 (Coil Factory)

- ID: `coil_factory`
- 모드: `normal`
- 버전 범위: Cosmoteer Modern / Steam; 공개 위키 관측 스냅샷이며 정확한 게임 빌드는 미확정

| 필드 | 값 | 단위 | 상태 | 출처 |
| --- | --- | --- | --- | --- |
| `value_credits` | 30000 | credits | wiki_snapshot | [ECON-F-COIL-FACTORY](https://cosmoteer.wiki.gg/wiki/Coil_Factory) |
| `blueprint_cost_credits` | 15000 | credits | wiki_snapshot | [ECON-F-COIL-FACTORY](https://cosmoteer.wiki.gg/wiki/Coil_Factory) |
| `width_m` | 3 | m | wiki_snapshot | [ECON-F-COIL-FACTORY](https://cosmoteer.wiki.gg/wiki/Coil_Factory) |
| `height_m` | 3 | m | wiki_snapshot | [ECON-F-COIL-FACTORY](https://cosmoteer.wiki.gg/wiki/Coil_Factory) |
| `mass_t` | 9 | tonne | wiki_snapshot | [ECON-F-COIL-FACTORY](https://cosmoteer.wiki.gg/wiki/Coil_Factory) |
| `hp` | 9000 | HP | wiki_snapshot | [ECON-F-COIL-FACTORY](https://cosmoteer.wiki.gg/wiki/Coil_Factory) |
| `crew_speed_multiplier` | 0.5 | ratio | wiki_snapshot | [ECON-F-COIL-FACTORY](https://cosmoteer.wiki.gg/wiki/Coil_Factory) |
| `command_points_used` | 1 | command_points | wiki_snapshot | [ECON-F-COIL-FACTORY](https://cosmoteer.wiki.gg/wiki/Coil_Factory) |
| `power_capacity` | 4 | game_power | wiki_snapshot | [ECON-F-COIL-FACTORY](https://cosmoteer.wiki.gg/wiki/Coil_Factory) |
| `construction_resources` | [{"resource_id":"steel","quantity":80},{"resource_id":"coils","quantity":80},{"resource_id":"processor","quantity":8}] | item[] | wiki_snapshot | [ECON-F-COIL-FACTORY](https://cosmoteer.wiki.gg/wiki/Coil_Factory) |
| `resource_capacity` | [{"resource_id":"copper","quantity":10},{"resource_id":"coils","quantity":40}] | item[] | wiki_snapshot | [ECON-F-COIL-FACTORY](https://cosmoteer.wiki.gg/wiki/Coil_Factory) |
| `required_blueprints` | ["steel_smelter"] | record_id[] | wiki_snapshot | [ECON-F-COIL-FACTORY](https://cosmoteer.wiki.gg/wiki/Coil_Factory) |
| `operating_crew_required` | 미확정 | crew | unverified | 미확보 |
| `doors_allowed_beside_all_storage_tiles` | true | boolean | patch_confirmed | [V2-SUP-0290](https://store.steampowered.com/news/posts/?appids=799600&enddate=1753322128&feed=steam_community_announcements) |

### 적용 메모

- Crew Speed는 통과 이동 계수이며 필수 조작 인원 수가 아님. 별도 필수 인원은 미확인.
- 공장 내부 재고는 표에 명시된 용량만 보존. 일반 창고 타일량으로 다시 계산하지 않음.

## 다이아몬드 제련소 (Diamond Smelter)

- ID: `diamond_smelter`
- 모드: `normal`
- 버전 범위: Cosmoteer Modern / Steam; 공개 위키 관측 스냅샷이며 정확한 게임 빌드는 미확정

| 필드 | 값 | 단위 | 상태 | 출처 |
| --- | --- | --- | --- | --- |
| `value_credits` | 50000 | credits | wiki_snapshot | [ECON-F-DIAMOND-SMELTER](https://cosmoteer.wiki.gg/wiki/Diamond_Smelter) |
| `blueprint_cost_credits` | 25000 | credits | wiki_snapshot | [ECON-F-DIAMOND-SMELTER](https://cosmoteer.wiki.gg/wiki/Diamond_Smelter) |
| `width_m` | 2 | m | wiki_snapshot | [ECON-F-DIAMOND-SMELTER](https://cosmoteer.wiki.gg/wiki/Diamond_Smelter) |
| `height_m` | 3 | m | wiki_snapshot | [ECON-F-DIAMOND-SMELTER](https://cosmoteer.wiki.gg/wiki/Diamond_Smelter) |
| `mass_t` | 6 | tonne | wiki_snapshot | [ECON-F-DIAMOND-SMELTER](https://cosmoteer.wiki.gg/wiki/Diamond_Smelter) |
| `hp` | 6000 | HP | wiki_snapshot | [ECON-F-DIAMOND-SMELTER](https://cosmoteer.wiki.gg/wiki/Diamond_Smelter) |
| `crew_speed_multiplier` | 0.5 | ratio | wiki_snapshot | [ECON-F-DIAMOND-SMELTER](https://cosmoteer.wiki.gg/wiki/Diamond_Smelter) |
| `command_points_used` | 1 | command_points | wiki_snapshot | [ECON-F-DIAMOND-SMELTER](https://cosmoteer.wiki.gg/wiki/Diamond_Smelter) |
| `power_capacity` | 2 | game_power | wiki_snapshot | [ECON-F-DIAMOND-SMELTER](https://cosmoteer.wiki.gg/wiki/Diamond_Smelter) |
| `construction_resources` | [{"resource_id":"steel","quantity":48},{"resource_id":"hyper_coils","quantity":118},{"resource_id":"tri_steel","quantity":67}] | item[] | wiki_snapshot | [ECON-F-DIAMOND-SMELTER](https://cosmoteer.wiki.gg/wiki/Diamond_Smelter) |
| `resource_capacity` | [{"resource_id":"carbon","quantity":20},{"resource_id":"diamonds","quantity":10}] | item[] | wiki_snapshot | [ECON-F-DIAMOND-SMELTER](https://cosmoteer.wiki.gg/wiki/Diamond_Smelter) |
| `required_blueprints` | ["tri_steel_smelter"] | record_id[] | wiki_snapshot | [ECON-F-DIAMOND-SMELTER](https://cosmoteer.wiki.gg/wiki/Diamond_Smelter) |
| `operating_crew_required` | 미확정 | crew | unverified | 미확보 |

### 적용 메모

- Crew Speed는 통과 이동 계수이며 필수 조작 인원 수가 아님. 별도 필수 인원은 미확인.
- 공장 내부 재고는 표에 명시된 용량만 보존. 일반 창고 타일량으로 다시 계산하지 않음.

## EMP 미사일 공장 (E.M.P. Missile Factory)

- ID: `emp_missile_factory`
- 모드: `normal`
- 버전 범위: Cosmoteer Modern / Steam; 공개 위키 관측 스냅샷이며 정확한 게임 빌드는 미확정

| 필드 | 값 | 단위 | 상태 | 출처 |
| --- | --- | --- | --- | --- |
| `value_credits` | 미확정 | credits | conflict | [ECON-F-EMP-MISSILE-FACTORY](https://cosmoteer.wiki.gg/wiki/E.M.P._Missile_Factory), [ECON-CREDITS](https://cosmoteer.wiki.gg/wiki/Credits), [ECON-R-STEEL](https://cosmoteer.wiki.gg/wiki/Steel), [ECON-R-HYPER-COILS](https://cosmoteer.wiki.gg/wiki/Hyper-Coils), [ECON-R-DIAMONDS](https://cosmoteer.wiki.gg/wiki/Diamonds) |
| `blueprint_cost_credits` | 10000 | credits | wiki_snapshot | [ECON-F-EMP-MISSILE-FACTORY](https://cosmoteer.wiki.gg/wiki/E.M.P._Missile_Factory) |
| `width_m` | 3 | m | wiki_snapshot | [ECON-F-EMP-MISSILE-FACTORY](https://cosmoteer.wiki.gg/wiki/E.M.P._Missile_Factory) |
| `height_m` | 4 | m | wiki_snapshot | [ECON-F-EMP-MISSILE-FACTORY](https://cosmoteer.wiki.gg/wiki/E.M.P._Missile_Factory) |
| `mass_t` | 12 | tonne | wiki_snapshot | [ECON-F-EMP-MISSILE-FACTORY](https://cosmoteer.wiki.gg/wiki/E.M.P._Missile_Factory) |
| `hp` | 12000 | HP | wiki_snapshot | [ECON-F-EMP-MISSILE-FACTORY](https://cosmoteer.wiki.gg/wiki/E.M.P._Missile_Factory) |
| `crew_speed_multiplier` | 0.5 | ratio | wiki_snapshot | [ECON-F-EMP-MISSILE-FACTORY](https://cosmoteer.wiki.gg/wiki/E.M.P._Missile_Factory) |
| `command_points_used` | 1 | command_points | wiki_snapshot | [ECON-F-EMP-MISSILE-FACTORY](https://cosmoteer.wiki.gg/wiki/E.M.P._Missile_Factory) |
| `power_capacity` | 4 | game_power | wiki_snapshot | [ECON-F-EMP-MISSILE-FACTORY](https://cosmoteer.wiki.gg/wiki/E.M.P._Missile_Factory) |
| `construction_resources` | 미확정 | item[] | conflict | [ECON-F-EMP-MISSILE-FACTORY](https://cosmoteer.wiki.gg/wiki/E.M.P._Missile_Factory) |
| `resource_capacity` | [{"resource_id":"iron","quantity":5},{"resource_id":"copper","quantity":5},{"resource_id":"emp_missile_parts","quantity":30}] | item[] | wiki_snapshot | [ECON-F-EMP-MISSILE-FACTORY](https://cosmoteer.wiki.gg/wiki/E.M.P._Missile_Factory) |
| `required_blueprints` | 미확정 | record_id[] | conflict | [ECON-F-EMP-MISSILE-FACTORY](https://cosmoteer.wiki.gg/wiki/E.M.P._Missile_Factory), [ECON-BP](https://cosmoteer.wiki.gg/wiki/Blueprints) |
| `operating_crew_required` | 미확정 | crew | unverified | 미확보 |

### 적용 메모

- Crew Speed는 통과 이동 계수이며 필수 조작 인원 수가 아님. 별도 필수 인원은 미확인.
- 공장 내부 재고는 표에 명시된 용량만 보존. 일반 창고 타일량으로 다시 계산하지 않음.
- 개별 공장의 선행 청사진과 전체 해금표가 다름. record_id는 이 자료의 연결 후보이며 게임 내부 ID가 아님.
- 원문에 게시된 부품 가격과 원문 건조 재료×자원 단가 총액이 불일치. 전사 오류가 아니며 합성 금액을 게임값으로 채택하지 않음. 관측된 원재료 표는 observations에만 보존하고 현행 건조비 재현에 쓰지 말 것.
- 가격과 재료표 중 어느 쪽이 구형 또는 오기인지 판정하지 못함. 가격만 비워 둔 채 재료표로 자동 건조비를 복구하는 오류를 막기 위해 양쪽 확정값을 null로 보류.

### 대조 관측값

```json
[
  {
    "field": "required_blueprints",
    "value": [
      "he_missile_factory"
    ],
    "source_id": "ECON-F-EMP-MISSILE-FACTORY"
  },
  {
    "field": "required_blueprints",
    "value": [
      "emp_missile"
    ],
    "source_id": "ECON-BP"
  },
  {
    "field": "value_credits",
    "value": 20000,
    "source_id": "ECON-F-EMP-MISSILE-FACTORY",
    "location": "infobox Value"
  },
  {
    "field": "value_credits",
    "value": 17600,
    "source_id": [
      "ECON-F-EMP-MISSILE-FACTORY",
      "ECON-CREDITS",
      "ECON-R-STEEL",
      "ECON-R-HYPER-COILS",
      "ECON-R-DIAMONDS"
    ],
    "location": "derived sum of published construction resources times base unit prices; not a second quoted game value"
  },
  {
    "field": "construction_resources",
    "value": [
      {
        "resource_id": "steel",
        "quantity": 96
      },
      {
        "resource_id": "hyper_coils",
        "quantity": 24
      },
      {
        "resource_id": "diamonds",
        "quantity": 2
      }
    ],
    "source_id": "ECON-F-EMP-MISSILE-FACTORY",
    "location": "published material list; conflicts with the same part value and resource price sum"
  }
]
```

## 고폭 미사일 공장 (High-Explosive Missile Factory)

- ID: `he_missile_factory`
- 모드: `normal`
- 버전 범위: Cosmoteer Modern / Steam; 공개 위키 관측 스냅샷이며 정확한 게임 빌드는 미확정

| 필드 | 값 | 단위 | 상태 | 출처 |
| --- | --- | --- | --- | --- |
| `value_credits` | 15000 | credits | wiki_snapshot | [ECON-F-HE-MISSILE-FACTORY](https://cosmoteer.wiki.gg/wiki/High-Explosive_Missile_Factory) |
| `blueprint_cost_credits` | 7500 | credits | wiki_snapshot | [ECON-F-HE-MISSILE-FACTORY](https://cosmoteer.wiki.gg/wiki/High-Explosive_Missile_Factory) |
| `width_m` | 3 | m | wiki_snapshot | [ECON-F-HE-MISSILE-FACTORY](https://cosmoteer.wiki.gg/wiki/High-Explosive_Missile_Factory) |
| `height_m` | 3 | m | wiki_snapshot | [ECON-F-HE-MISSILE-FACTORY](https://cosmoteer.wiki.gg/wiki/High-Explosive_Missile_Factory) |
| `mass_t` | 9 | tonne | wiki_snapshot | [ECON-F-HE-MISSILE-FACTORY](https://cosmoteer.wiki.gg/wiki/High-Explosive_Missile_Factory) |
| `hp` | 9000 | HP | wiki_snapshot | [ECON-F-HE-MISSILE-FACTORY](https://cosmoteer.wiki.gg/wiki/High-Explosive_Missile_Factory) |
| `crew_speed_multiplier` | 0.5 | ratio | wiki_snapshot | [ECON-F-HE-MISSILE-FACTORY](https://cosmoteer.wiki.gg/wiki/High-Explosive_Missile_Factory) |
| `command_points_used` | 1 | command_points | wiki_snapshot | [ECON-F-HE-MISSILE-FACTORY](https://cosmoteer.wiki.gg/wiki/High-Explosive_Missile_Factory) |
| `power_capacity` | 4 | game_power | wiki_snapshot | [ECON-F-HE-MISSILE-FACTORY](https://cosmoteer.wiki.gg/wiki/High-Explosive_Missile_Factory) |
| `construction_resources` | [{"resource_id":"steel","quantity":76},{"resource_id":"hyper_coils","quantity":27},{"resource_id":"processor","quantity":2}] | item[] | wiki_snapshot | [ECON-F-HE-MISSILE-FACTORY](https://cosmoteer.wiki.gg/wiki/High-Explosive_Missile_Factory) |
| `resource_capacity` | [{"resource_id":"iron","quantity":5},{"resource_id":"sulfur","quantity":5},{"resource_id":"he_missile_parts","quantity":30}] | item[] | wiki_snapshot | [ECON-F-HE-MISSILE-FACTORY](https://cosmoteer.wiki.gg/wiki/High-Explosive_Missile_Factory) |
| `required_blueprints` | 미확정 | record_id[] | conflict | [ECON-F-HE-MISSILE-FACTORY](https://cosmoteer.wiki.gg/wiki/High-Explosive_Missile_Factory), [ECON-BP](https://cosmoteer.wiki.gg/wiki/Blueprints) |
| `operating_crew_required` | 미확정 | crew | unverified | 미확보 |

### 적용 메모

- Crew Speed는 통과 이동 계수이며 필수 조작 인원 수가 아님. 별도 필수 인원은 미확인.
- 공장 내부 재고는 표에 명시된 용량만 보존. 일반 창고 타일량으로 다시 계산하지 않음.
- 개별 공장의 선행 청사진과 전체 해금표가 다름. record_id는 이 자료의 연결 후보이며 게임 내부 ID가 아님.

### 대조 관측값

```json
[
  {
    "field": "required_blueprints",
    "value": [
      "missile_mine_launcher"
    ],
    "source_id": "ECON-F-HE-MISSILE-FACTORY"
  },
  {
    "field": "required_blueprints",
    "value": [
      "he_missiles"
    ],
    "source_id": "ECON-BP"
  }
]
```

## 하이퍼 코일 공장 (Hyper-Coil Factory)

- ID: `hyper_coil_factory`
- 모드: `normal`
- 버전 범위: Cosmoteer Modern / Steam; 공개 위키 관측 스냅샷이며 정확한 게임 빌드는 미확정

| 필드 | 값 | 단위 | 상태 | 출처 |
| --- | --- | --- | --- | --- |
| `value_credits` | 50000 | credits | wiki_snapshot | [ECON-F-HYPER-COIL-FACTORY](https://cosmoteer.wiki.gg/wiki/Hyper-Coil_Factory) |
| `blueprint_cost_credits` | 25000 | credits | wiki_snapshot | [ECON-F-HYPER-COIL-FACTORY](https://cosmoteer.wiki.gg/wiki/Hyper-Coil_Factory) |
| `width_m` | 4 | m | wiki_snapshot | [ECON-F-HYPER-COIL-FACTORY](https://cosmoteer.wiki.gg/wiki/Hyper-Coil_Factory) |
| `height_m` | 3 | m | wiki_snapshot | [ECON-F-HYPER-COIL-FACTORY](https://cosmoteer.wiki.gg/wiki/Hyper-Coil_Factory) |
| `mass_t` | 12 | tonne | wiki_snapshot | [ECON-F-HYPER-COIL-FACTORY](https://cosmoteer.wiki.gg/wiki/Hyper-Coil_Factory) |
| `hp` | 12000 | HP | wiki_snapshot | [ECON-F-HYPER-COIL-FACTORY](https://cosmoteer.wiki.gg/wiki/Hyper-Coil_Factory) |
| `crew_speed_multiplier` | 0.5 | ratio | wiki_snapshot | [ECON-F-HYPER-COIL-FACTORY](https://cosmoteer.wiki.gg/wiki/Hyper-Coil_Factory) |
| `command_points_used` | 1 | command_points | wiki_snapshot | [ECON-F-HYPER-COIL-FACTORY](https://cosmoteer.wiki.gg/wiki/Hyper-Coil_Factory) |
| `power_capacity` | 4 | game_power | wiki_snapshot | [ECON-F-HYPER-COIL-FACTORY](https://cosmoteer.wiki.gg/wiki/Hyper-Coil_Factory) |
| `construction_resources` | [{"resource_id":"steel","quantity":104},{"resource_id":"hyper_coils","quantity":58},{"resource_id":"processor","quantity":12}] | item[] | wiki_snapshot | [ECON-F-HYPER-COIL-FACTORY](https://cosmoteer.wiki.gg/wiki/Hyper-Coil_Factory) |
| `resource_capacity` | [{"resource_id":"coils","quantity":40},{"resource_id":"copper","quantity":10},{"resource_id":"hyper_coils","quantity":40}] | item[] | wiki_snapshot | [ECON-F-HYPER-COIL-FACTORY](https://cosmoteer.wiki.gg/wiki/Hyper-Coil_Factory) |
| `required_blueprints` | ["coil_factory"] | record_id[] | wiki_snapshot | [ECON-F-HYPER-COIL-FACTORY](https://cosmoteer.wiki.gg/wiki/Hyper-Coil_Factory) |
| `operating_crew_required` | 미확정 | crew | unverified | 미확보 |
| `doors_allowed_beside_all_storage_tiles` | true | boolean | patch_confirmed | [V2-SUP-0290](https://store.steampowered.com/news/posts/?appids=799600&enddate=1753322128&feed=steam_community_announcements) |

### 적용 메모

- Crew Speed는 통과 이동 계수이며 필수 조작 인원 수가 아님. 별도 필수 인원은 미확인.
- 공장 내부 재고는 표에 명시된 용량만 보존. 일반 창고 타일량으로 다시 계산하지 않음.

## 기뢰 공장 (Mine Factory)

- ID: `mine_factory`
- 모드: `normal`
- 버전 범위: Cosmoteer Modern / Steam; 공개 위키 관측 스냅샷이며 정확한 게임 빌드는 미확정

| 필드 | 값 | 단위 | 상태 | 출처 |
| --- | --- | --- | --- | --- |
| `value_credits` | 20000 | credits | wiki_snapshot | [ECON-F-MINE-FACTORY](https://cosmoteer.wiki.gg/wiki/Mine_Factory) |
| `blueprint_cost_credits` | 10000 | credits | wiki_snapshot | [ECON-F-MINE-FACTORY](https://cosmoteer.wiki.gg/wiki/Mine_Factory) |
| `width_m` | 4 | m | wiki_snapshot | [ECON-F-MINE-FACTORY](https://cosmoteer.wiki.gg/wiki/Mine_Factory) |
| `height_m` | 3 | m | wiki_snapshot | [ECON-F-MINE-FACTORY](https://cosmoteer.wiki.gg/wiki/Mine_Factory) |
| `mass_t` | 12 | tonne | wiki_snapshot | [ECON-F-MINE-FACTORY](https://cosmoteer.wiki.gg/wiki/Mine_Factory) |
| `hp` | 12000 | HP | wiki_snapshot | [ECON-F-MINE-FACTORY](https://cosmoteer.wiki.gg/wiki/Mine_Factory) |
| `crew_speed_multiplier` | 0.5 | ratio | wiki_snapshot | [ECON-F-MINE-FACTORY](https://cosmoteer.wiki.gg/wiki/Mine_Factory) |
| `command_points_used` | 1 | command_points | wiki_snapshot | [ECON-F-MINE-FACTORY](https://cosmoteer.wiki.gg/wiki/Mine_Factory) |
| `power_capacity` | 4 | game_power | wiki_snapshot | [ECON-F-MINE-FACTORY](https://cosmoteer.wiki.gg/wiki/Mine_Factory) |
| `construction_resources` | [{"resource_id":"steel","quantity":96},{"resource_id":"hyper_coils","quantity":50},{"resource_id":"tri_steel","quantity":13}] | item[] | wiki_snapshot | [ECON-F-MINE-FACTORY](https://cosmoteer.wiki.gg/wiki/Mine_Factory) |
| `resource_capacity` | [{"resource_id":"iron","quantity":5},{"resource_id":"ammo","quantity":20},{"resource_id":"mine_parts","quantity":32}] | item[] | wiki_snapshot | [ECON-F-MINE-FACTORY](https://cosmoteer.wiki.gg/wiki/Mine_Factory) |
| `required_blueprints` | 미확정 | record_id[] | conflict | [ECON-F-MINE-FACTORY](https://cosmoteer.wiki.gg/wiki/Mine_Factory), [ECON-BP](https://cosmoteer.wiki.gg/wiki/Blueprints) |
| `operating_crew_required` | 미확정 | crew | unverified | 미확보 |

### 적용 메모

- Crew Speed는 통과 이동 계수이며 필수 조작 인원 수가 아님. 별도 필수 인원은 미확인.
- 공장 내부 재고는 표에 명시된 용량만 보존. 일반 창고 타일량으로 다시 계산하지 않음.
- 개별 공장의 선행 청사진과 전체 해금표가 다름. record_id는 이 자료의 연결 후보이며 게임 내부 ID가 아님.

### 대조 관측값

```json
[
  {
    "field": "required_blueprints",
    "value": [
      "cannon_ammo_factory",
      "he_missile_factory"
    ],
    "source_id": "ECON-F-MINE-FACTORY"
  },
  {
    "field": "required_blueprints",
    "value": [
      "cannon_ammo_factory",
      "proximity_mines"
    ],
    "source_id": "ECON-BP"
  }
]
```

## 핵미사일 공장 (Nuclear Missile Factory)

- ID: `nuclear_missile_factory`
- 모드: `normal`
- 버전 범위: Cosmoteer Modern / Steam; 공개 위키 관측 스냅샷이며 정확한 게임 빌드는 미확정

| 필드 | 값 | 단위 | 상태 | 출처 |
| --- | --- | --- | --- | --- |
| `value_credits` | 25000 | credits | patch_confirmed | [V2-ECO-01](https://store.steampowered.com/news/posts/?enddate=1719859099&feed=steam_community_announcements) |
| `blueprint_cost_credits` | 15000 | credits | wiki_snapshot | [ECON-F-NUCLEAR-MISSILE-FACTORY](https://cosmoteer.wiki.gg/wiki/Nuclear_Missile_Factory) |
| `width_m` | 4 | m | wiki_snapshot | [ECON-F-NUCLEAR-MISSILE-FACTORY](https://cosmoteer.wiki.gg/wiki/Nuclear_Missile_Factory) |
| `height_m` | 4 | m | wiki_snapshot | [ECON-F-NUCLEAR-MISSILE-FACTORY](https://cosmoteer.wiki.gg/wiki/Nuclear_Missile_Factory) |
| `mass_t` | 16 | tonne | wiki_snapshot | [ECON-F-NUCLEAR-MISSILE-FACTORY](https://cosmoteer.wiki.gg/wiki/Nuclear_Missile_Factory) |
| `hp` | 16000 | HP | wiki_snapshot | [ECON-F-NUCLEAR-MISSILE-FACTORY](https://cosmoteer.wiki.gg/wiki/Nuclear_Missile_Factory) |
| `crew_speed_multiplier` | 0.5 | ratio | wiki_snapshot | [ECON-F-NUCLEAR-MISSILE-FACTORY](https://cosmoteer.wiki.gg/wiki/Nuclear_Missile_Factory) |
| `command_points_used` | 1 | command_points | wiki_snapshot | [ECON-F-NUCLEAR-MISSILE-FACTORY](https://cosmoteer.wiki.gg/wiki/Nuclear_Missile_Factory) |
| `power_capacity` | 6 | game_power | wiki_snapshot | [ECON-F-NUCLEAR-MISSILE-FACTORY](https://cosmoteer.wiki.gg/wiki/Nuclear_Missile_Factory) |
| `construction_resources` | 미확정 | item[] | conflict | [ECON-F-NUCLEAR-MISSILE-FACTORY](https://cosmoteer.wiki.gg/wiki/Nuclear_Missile_Factory) |
| `resource_capacity` | [{"resource_id":"iron","quantity":5},{"resource_id":"uranium","quantity":5},{"resource_id":"nuclear_missile_parts","quantity":40}] | item[] | wiki_snapshot | [ECON-F-NUCLEAR-MISSILE-FACTORY](https://cosmoteer.wiki.gg/wiki/Nuclear_Missile_Factory) |
| `required_blueprints` | 미확정 | record_id[] | conflict | [ECON-F-NUCLEAR-MISSILE-FACTORY](https://cosmoteer.wiki.gg/wiki/Nuclear_Missile_Factory), [ECON-BP](https://cosmoteer.wiki.gg/wiki/Blueprints) |
| `operating_crew_required` | 미확정 | crew | unverified | 미확보 |

### 적용 메모

- Crew Speed는 통과 이동 계수이며 필수 조작 인원 수가 아님. 별도 필수 인원은 미확인.
- 공장 내부 재고는 표에 명시된 용량만 보존. 일반 창고 타일량으로 다시 계산하지 않음.
- 개별 공장의 선행 청사진과 전체 해금표가 다름. record_id는 이 자료의 연결 후보이며 게임 내부 ID가 아님.
- 원문에 게시된 부품 가격과 원문 건조 재료×자원 단가 총액이 불일치. 전사 오류가 아니며 합성 금액을 게임값으로 채택하지 않음. 관측된 원재료 표는 observations에만 보존하고 현행 건조비 재현에 쓰지 말 것.
- 동일 페이지 역사에 0.26.2 가격30,000→25,000 변경이 있어 재료 표의 갱신 누락 가능성이 있음. 수정 재료 수량을 역산하지 않음.
- v2: 정식 0.26.2 패치의 가격 변경을 직접 대조하여 value_credits=25,000을 채택했다. construction_resources는 위키 재료 총합 불일치로 계속 null/conflict이며, 가격에서 재료 수량을 역산하지 않았다. 이전 양쪽 null 판정은 note_history와 revision_v2.json에 보존한다.

### 대조 관측값

```json
[
  {
    "field": "required_blueprints",
    "value": [
      "he_missile_factory",
      "uranium_enricher"
    ],
    "source_id": "ECON-F-NUCLEAR-MISSILE-FACTORY"
  },
  {
    "field": "required_blueprints",
    "value": [
      "tactical_nuclear_missile",
      "uranium_enricher"
    ],
    "source_id": "ECON-BP"
  },
  {
    "field": "value_credits",
    "value": 25000,
    "source_id": "ECON-F-NUCLEAR-MISSILE-FACTORY",
    "location": "infobox Value"
  },
  {
    "field": "value_credits",
    "value": 30000,
    "source_id": [
      "ECON-F-NUCLEAR-MISSILE-FACTORY",
      "ECON-CREDITS",
      "ECON-R-STEEL",
      "ECON-R-HYPER-COILS",
      "ECON-R-ENRICHED-URANIUM"
    ],
    "location": "derived sum of published construction resources times base unit prices; not a second quoted game value"
  },
  {
    "field": "construction_resources",
    "value": [
      {
        "resource_id": "steel",
        "quantity": 136
      },
      {
        "resource_id": "hyper_coils",
        "quantity": 62
      },
      {
        "resource_id": "enriched_uranium",
        "quantity": 4
      }
    ],
    "source_id": "ECON-F-NUCLEAR-MISSILE-FACTORY",
    "location": "published material list; conflicts with the same part value and resource price sum"
  }
]
```

## 프로세서 제조기 (Processor Fabricator)

- ID: `processor_fabricator`
- 모드: `normal`
- 버전 범위: Cosmoteer Modern / Steam; 공개 위키 관측 스냅샷이며 정확한 게임 빌드는 미확정

| 필드 | 값 | 단위 | 상태 | 출처 |
| --- | --- | --- | --- | --- |
| `value_credits` | 미확정 | credits | conflict | [ECON-F-PROCESSOR-FABRICATOR](https://cosmoteer.wiki.gg/wiki/Processor_Fabricator), [ECON-CREDITS](https://cosmoteer.wiki.gg/wiki/Credits), [ECON-R-STEEL](https://cosmoteer.wiki.gg/wiki/Steel), [ECON-R-HYPER-COILS](https://cosmoteer.wiki.gg/wiki/Hyper-Coils), [ECON-R-DIAMONDS](https://cosmoteer.wiki.gg/wiki/Diamonds) |
| `blueprint_cost_credits` | 40000 | credits | wiki_snapshot | [ECON-F-PROCESSOR-FABRICATOR](https://cosmoteer.wiki.gg/wiki/Processor_Fabricator) |
| `width_m` | 3 | m | wiki_snapshot | [ECON-F-PROCESSOR-FABRICATOR](https://cosmoteer.wiki.gg/wiki/Processor_Fabricator) |
| `height_m` | 3 | m | wiki_snapshot | [ECON-F-PROCESSOR-FABRICATOR](https://cosmoteer.wiki.gg/wiki/Processor_Fabricator) |
| `mass_t` | 9 | tonne | wiki_snapshot | [ECON-F-PROCESSOR-FABRICATOR](https://cosmoteer.wiki.gg/wiki/Processor_Fabricator) |
| `hp` | 9000 | HP | wiki_snapshot | [ECON-F-PROCESSOR-FABRICATOR](https://cosmoteer.wiki.gg/wiki/Processor_Fabricator) |
| `crew_speed_multiplier` | 0.5 | ratio | wiki_snapshot | [ECON-F-PROCESSOR-FABRICATOR](https://cosmoteer.wiki.gg/wiki/Processor_Fabricator) |
| `command_points_used` | 1 | command_points | wiki_snapshot | [ECON-F-PROCESSOR-FABRICATOR](https://cosmoteer.wiki.gg/wiki/Processor_Fabricator) |
| `power_capacity` | 4 | game_power | wiki_snapshot | [ECON-F-PROCESSOR-FABRICATOR](https://cosmoteer.wiki.gg/wiki/Processor_Fabricator) |
| `construction_resources` | 미확정 | item[] | conflict | [ECON-F-PROCESSOR-FABRICATOR](https://cosmoteer.wiki.gg/wiki/Processor_Fabricator) |
| `resource_capacity` | [{"resource_id":"coils","quantity":40},{"resource_id":"gold","quantity":10},{"resource_id":"processor","quantity":5}] | item[] | wiki_snapshot | [ECON-F-PROCESSOR-FABRICATOR](https://cosmoteer.wiki.gg/wiki/Processor_Fabricator) |
| `required_blueprints` | ["hyper_coil_factory"] | record_id[] | wiki_snapshot | [ECON-F-PROCESSOR-FABRICATOR](https://cosmoteer.wiki.gg/wiki/Processor_Fabricator) |
| `operating_crew_required` | 미확정 | crew | unverified | 미확보 |
| `doors_allowed_beside_all_storage_tiles` | true | boolean | patch_confirmed | [V2-SUP-0290](https://store.steampowered.com/news/posts/?appids=799600&enddate=1753322128&feed=steam_community_announcements) |

### 적용 메모

- Crew Speed는 통과 이동 계수이며 필수 조작 인원 수가 아님. 별도 필수 인원은 미확인.
- 공장 내부 재고는 표에 명시된 용량만 보존. 일반 창고 타일량으로 다시 계산하지 않음.
- 원문에 게시된 부품 가격과 원문 건조 재료×자원 단가 총액이 불일치. 전사 오류가 아니며 합성 금액을 게임값으로 채택하지 않음. 관측된 원재료 표는 observations에만 보존하고 현행 건조비 재현에 쓰지 말 것.
- 가격과 재료표 중 어느 쪽이 구형 또는 오기인지 판정하지 못함. 가격만 비워 둔 채 재료표로 자동 건조비를 복구하는 오류를 막기 위해 양쪽 확정값을 null로 보류.

### 대조 관측값

```json
[
  {
    "field": "value_credits",
    "value": 60000,
    "source_id": "ECON-F-PROCESSOR-FABRICATOR",
    "location": "infobox Value"
  },
  {
    "field": "value_credits",
    "value": 80000,
    "source_id": [
      "ECON-F-PROCESSOR-FABRICATOR",
      "ECON-CREDITS",
      "ECON-R-STEEL",
      "ECON-R-HYPER-COILS",
      "ECON-R-DIAMONDS"
    ],
    "location": "derived sum of published construction resources times base unit prices; not a second quoted game value"
  },
  {
    "field": "construction_resources",
    "value": [
      {
        "resource_id": "steel",
        "quantity": 80
      },
      {
        "resource_id": "hyper_coils",
        "quantity": 100
      },
      {
        "resource_id": "diamonds",
        "quantity": 12
      }
    ],
    "source_id": "ECON-F-PROCESSOR-FABRICATOR",
    "location": "published material list; conflicts with the same part value and resource price sum"
  }
]
```

## 강철 제련소 (Steel Smelter)

- ID: `steel_smelter`
- 모드: `normal`
- 버전 범위: Cosmoteer Modern / Steam; 공개 위키 관측 스냅샷이며 정확한 게임 빌드는 미확정

| 필드 | 값 | 단위 | 상태 | 출처 |
| --- | --- | --- | --- | --- |
| `value_credits` | 30000 | credits | wiki_snapshot | [ECON-F-STEEL-SMELTER](https://cosmoteer.wiki.gg/wiki/Steel_Smelter) |
| `blueprint_cost_credits` | 15000 | credits | wiki_snapshot | [ECON-F-STEEL-SMELTER](https://cosmoteer.wiki.gg/wiki/Steel_Smelter) |
| `width_m` | 4 | m | wiki_snapshot | [ECON-F-STEEL-SMELTER](https://cosmoteer.wiki.gg/wiki/Steel_Smelter) |
| `height_m` | 4 | m | wiki_snapshot | [ECON-F-STEEL-SMELTER](https://cosmoteer.wiki.gg/wiki/Steel_Smelter) |
| `mass_t` | 16 | tonne | wiki_snapshot | [ECON-F-STEEL-SMELTER](https://cosmoteer.wiki.gg/wiki/Steel_Smelter) |
| `hp` | 16000 | HP | wiki_snapshot | [ECON-F-STEEL-SMELTER](https://cosmoteer.wiki.gg/wiki/Steel_Smelter) |
| `crew_speed_multiplier` | 0.5 | ratio | wiki_snapshot | [ECON-F-STEEL-SMELTER](https://cosmoteer.wiki.gg/wiki/Steel_Smelter) |
| `command_points_used` | 1 | command_points | wiki_snapshot | [ECON-F-STEEL-SMELTER](https://cosmoteer.wiki.gg/wiki/Steel_Smelter) |
| `power_capacity` | 4 | game_power | wiki_snapshot | [ECON-F-STEEL-SMELTER](https://cosmoteer.wiki.gg/wiki/Steel_Smelter) |
| `construction_resources` | [{"resource_id":"steel","quantity":120},{"resource_id":"coils","quantity":90},{"resource_id":"hyper_coils","quantity":60}] | item[] | wiki_snapshot | [ECON-F-STEEL-SMELTER](https://cosmoteer.wiki.gg/wiki/Steel_Smelter) |
| `resource_capacity` | [{"resource_id":"iron","quantity":20},{"resource_id":"steel","quantity":80}] | item[] | wiki_snapshot | [ECON-F-STEEL-SMELTER](https://cosmoteer.wiki.gg/wiki/Steel_Smelter) |
| `required_blueprints` | 미확정 | record_id[] | unverified | 미확보 |
| `operating_crew_required` | 미확정 | crew | unverified | 미확보 |

### 적용 메모

- Crew Speed는 통과 이동 계수이며 필수 조작 인원 수가 아님. 별도 필수 인원은 미확인.
- 공장 내부 재고는 표에 명시된 용량만 보존. 일반 창고 타일량으로 다시 계산하지 않음.

## 열 캐니스터 미사일 공장 (Thermal Canister Missile Factory)

- ID: `thermal_canister_missile_factory`
- 모드: `normal`
- 버전 범위: Cosmoteer Modern / Steam; 공개 위키 관측 스냅샷이며 정확한 게임 빌드는 미확정

| 필드 | 값 | 단위 | 상태 | 출처 |
| --- | --- | --- | --- | --- |
| `value_credits` | 18000 | credits | wiki_snapshot | [ECON-F-THERMAL-CANISTER-MISSILE-FACTORY](https://cosmoteer.wiki.gg/wiki/Thermal_Canister_Missile_Factory) |
| `blueprint_cost_credits` | 미확정 | credits | unverified | 미확보 |
| `width_m` | 3 | m | wiki_snapshot | [ECON-F-THERMAL-CANISTER-MISSILE-FACTORY](https://cosmoteer.wiki.gg/wiki/Thermal_Canister_Missile_Factory) |
| `height_m` | 3 | m | wiki_snapshot | [ECON-F-THERMAL-CANISTER-MISSILE-FACTORY](https://cosmoteer.wiki.gg/wiki/Thermal_Canister_Missile_Factory) |
| `mass_t` | 9 | tonne | wiki_snapshot | [ECON-F-THERMAL-CANISTER-MISSILE-FACTORY](https://cosmoteer.wiki.gg/wiki/Thermal_Canister_Missile_Factory) |
| `hp` | 9000 | HP | wiki_snapshot | [ECON-F-THERMAL-CANISTER-MISSILE-FACTORY](https://cosmoteer.wiki.gg/wiki/Thermal_Canister_Missile_Factory) |
| `crew_speed_multiplier` | 0.5 | ratio | wiki_snapshot | [ECON-F-THERMAL-CANISTER-MISSILE-FACTORY](https://cosmoteer.wiki.gg/wiki/Thermal_Canister_Missile_Factory) |
| `command_points_used` | 1 | command_points | wiki_snapshot | [ECON-F-THERMAL-CANISTER-MISSILE-FACTORY](https://cosmoteer.wiki.gg/wiki/Thermal_Canister_Missile_Factory) |
| `power_capacity` | 4 | game_power | wiki_snapshot | [ECON-F-THERMAL-CANISTER-MISSILE-FACTORY](https://cosmoteer.wiki.gg/wiki/Thermal_Canister_Missile_Factory) |
| `construction_resources` | [{"resource_id":"steel","quantity":80},{"resource_id":"hyper_coils","quantity":46},{"resource_id":"tri_steel","quantity":11}] | item[] | wiki_snapshot | [ECON-F-THERMAL-CANISTER-MISSILE-FACTORY](https://cosmoteer.wiki.gg/wiki/Thermal_Canister_Missile_Factory) |
| `resource_capacity` | [{"resource_id":"sulfur","quantity":5},{"resource_id":"copper","quantity":5},{"resource_id":"thermal_canister_missile_parts","quantity":30}] | item[] | wiki_snapshot | [ECON-F-THERMAL-CANISTER-MISSILE-FACTORY](https://cosmoteer.wiki.gg/wiki/Thermal_Canister_Missile_Factory) |
| `required_blueprints` | 미확정 | record_id[] | unverified | 미확보 |
| `operating_crew_required` | 미확정 | crew | unverified | 미확보 |

### 적용 메모

- Crew Speed는 통과 이동 계수이며 필수 조작 인원 수가 아님. 별도 필수 인원은 미확인.
- 공장 내부 재고는 표에 명시된 용량만 보존. 일반 창고 타일량으로 다시 계산하지 않음.

## 트리 스틸 제련소 (Tri-Steel Smelter)

- ID: `tri_steel_smelter`
- 모드: `normal`
- 버전 범위: Cosmoteer Modern / Steam; 공개 위키 관측 스냅샷이며 정확한 게임 빌드는 미확정

| 필드 | 값 | 단위 | 상태 | 출처 |
| --- | --- | --- | --- | --- |
| `value_credits` | 65000 | credits | wiki_snapshot | [ECON-F-TRI-STEEL-SMELTER](https://cosmoteer.wiki.gg/wiki/Tri-Steel_Smelter) |
| `blueprint_cost_credits` | 35000 | credits | wiki_snapshot | [ECON-F-TRI-STEEL-SMELTER](https://cosmoteer.wiki.gg/wiki/Tri-Steel_Smelter) |
| `width_m` | 4 | m | wiki_snapshot | [ECON-F-TRI-STEEL-SMELTER](https://cosmoteer.wiki.gg/wiki/Tri-Steel_Smelter) |
| `height_m` | 4 | m | wiki_snapshot | [ECON-F-TRI-STEEL-SMELTER](https://cosmoteer.wiki.gg/wiki/Tri-Steel_Smelter) |
| `mass_t` | 16 | tonne | wiki_snapshot | [ECON-F-TRI-STEEL-SMELTER](https://cosmoteer.wiki.gg/wiki/Tri-Steel_Smelter) |
| `hp` | 16000 | HP | wiki_snapshot | [ECON-F-TRI-STEEL-SMELTER](https://cosmoteer.wiki.gg/wiki/Tri-Steel_Smelter) |
| `crew_speed_multiplier` | 0.5 | ratio | wiki_snapshot | [ECON-F-TRI-STEEL-SMELTER](https://cosmoteer.wiki.gg/wiki/Tri-Steel_Smelter) |
| `command_points_used` | 1 | command_points | wiki_snapshot | [ECON-F-TRI-STEEL-SMELTER](https://cosmoteer.wiki.gg/wiki/Tri-Steel_Smelter) |
| `power_capacity` | 4 | game_power | wiki_snapshot | [ECON-F-TRI-STEEL-SMELTER](https://cosmoteer.wiki.gg/wiki/Tri-Steel_Smelter) |
| `construction_resources` | [{"resource_id":"steel","quantity":120},{"resource_id":"hyper_coils","quantity":100},{"resource_id":"diamonds","quantity":8}] | item[] | wiki_snapshot | [ECON-F-TRI-STEEL-SMELTER](https://cosmoteer.wiki.gg/wiki/Tri-Steel_Smelter) |
| `resource_capacity` | [{"resource_id":"tritanium","quantity":20}] | item[] | wiki_snapshot | [ECON-F-TRI-STEEL-SMELTER](https://cosmoteer.wiki.gg/wiki/Tri-Steel_Smelter) |
| `required_blueprints` | ["hyper_coil_factory"] | record_id[] | wiki_snapshot | [ECON-F-TRI-STEEL-SMELTER](https://cosmoteer.wiki.gg/wiki/Tri-Steel_Smelter) |
| `operating_crew_required` | 미확정 | crew | unverified | 미확보 |

### 적용 메모

- Crew Speed는 통과 이동 계수이며 필수 조작 인원 수가 아님. 별도 필수 인원은 미확인.
- 공장 내부 재고는 표에 명시된 용량만 보존. 일반 창고 타일량으로 다시 계산하지 않음.

## 우라늄 농축기 (Uranium Enricher)

- ID: `uranium_enricher`
- 모드: `normal`
- 버전 범위: Cosmoteer Modern / Steam; 공개 위키 관측 스냅샷이며 정확한 게임 빌드는 미확정

| 필드 | 값 | 단위 | 상태 | 출처 |
| --- | --- | --- | --- | --- |
| `value_credits` | 90000 | credits | wiki_snapshot | [ECON-F-URANIUM-ENRICHER](https://cosmoteer.wiki.gg/wiki/Uranium_Enricher) |
| `blueprint_cost_credits` | 미확정 | credits | conflict | [ECON-F-URANIUM-ENRICHER](https://cosmoteer.wiki.gg/wiki/Uranium_Enricher), [ECON-BP](https://cosmoteer.wiki.gg/wiki/Blueprints) |
| `width_m` | 3 | m | wiki_snapshot | [ECON-F-URANIUM-ENRICHER](https://cosmoteer.wiki.gg/wiki/Uranium_Enricher) |
| `height_m` | 4 | m | wiki_snapshot | [ECON-F-URANIUM-ENRICHER](https://cosmoteer.wiki.gg/wiki/Uranium_Enricher) |
| `mass_t` | 12 | tonne | wiki_snapshot | [ECON-F-URANIUM-ENRICHER](https://cosmoteer.wiki.gg/wiki/Uranium_Enricher) |
| `hp` | 12000 | HP | wiki_snapshot | [ECON-F-URANIUM-ENRICHER](https://cosmoteer.wiki.gg/wiki/Uranium_Enricher) |
| `crew_speed_multiplier` | 0.5 | ratio | wiki_snapshot | [ECON-F-URANIUM-ENRICHER](https://cosmoteer.wiki.gg/wiki/Uranium_Enricher) |
| `command_points_used` | 1 | command_points | wiki_snapshot | [ECON-F-URANIUM-ENRICHER](https://cosmoteer.wiki.gg/wiki/Uranium_Enricher) |
| `power_capacity` | 4 | game_power | wiki_snapshot | [ECON-F-URANIUM-ENRICHER](https://cosmoteer.wiki.gg/wiki/Uranium_Enricher) |
| `construction_resources` | [{"resource_id":"steel","quantity":80},{"resource_id":"hyper_coils","quantity":80},{"resource_id":"enriched_uranium","quantity":32}] | item[] | wiki_snapshot | [ECON-F-URANIUM-ENRICHER](https://cosmoteer.wiki.gg/wiki/Uranium_Enricher) |
| `resource_capacity` | [{"resource_id":"uranium","quantity":20},{"resource_id":"enriched_uranium","quantity":20}] | item[] | wiki_snapshot | [ECON-F-URANIUM-ENRICHER](https://cosmoteer.wiki.gg/wiki/Uranium_Enricher) |
| `required_blueprints` | ["hyper_coil_factory"] | record_id[] | wiki_snapshot | [ECON-F-URANIUM-ENRICHER](https://cosmoteer.wiki.gg/wiki/Uranium_Enricher) |
| `operating_crew_required` | 미확정 | crew | unverified | 미확보 |

### 적용 메모

- Crew Speed는 통과 이동 계수이며 필수 조작 인원 수가 아님. 별도 필수 인원은 미확인.
- 공장 내부 재고는 표에 명시된 용량만 보존. 일반 창고 타일량으로 다시 계산하지 않음.
- 우라늄 농축기 해금비가 개별 페이지와 전체 청사진표에서 상이함.

### 대조 관측값

```json
[
  {
    "field": "blueprint_cost_credits",
    "value": 40500,
    "source_id": "ECON-F-URANIUM-ENRICHER"
  },
  {
    "field": "blueprint_cost_credits",
    "value": 45000,
    "source_id": "ECON-BP"
  }
]
```

