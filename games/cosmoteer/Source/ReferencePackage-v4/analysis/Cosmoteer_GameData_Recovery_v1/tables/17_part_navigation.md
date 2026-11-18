# navigation · part

[전체 목차](README.md)

각 필드는 값·단위·근거 상태·출처를 함께 읽는다. 영문 명칭은 식별용이며 한국어 명칭은 이 자료의 번역이다.

## 초공간 비콘 (Hyperdrive Beacon)

- ID: `hyperdrive_beacon`
- 모드: `normal`
- 버전 범위: Cosmoteer Modern / Steam; 위키 관측 스냅샷, 정확한 빌드는 미확정

| 필드 | 값 | 단위 | 상태 | 출처 |
| --- | --- | --- | --- | --- |
| `value_credits` | 40000 | credits | wiki_snapshot | [SUP-BEACON](https://cosmoteer.wiki.gg/wiki/Hyperdrive_Beacon) |
| `width_m` | 4 | m | wiki_snapshot | [SUP-BEACON](https://cosmoteer.wiki.gg/wiki/Hyperdrive_Beacon) |
| `height_m` | 4 | m | wiki_snapshot | [SUP-BEACON](https://cosmoteer.wiki.gg/wiki/Hyperdrive_Beacon) |
| `mass_t` | 17.13 | tonne | wiki_snapshot | [SUP-BEACON](https://cosmoteer.wiki.gg/wiki/Hyperdrive_Beacon) |
| `hp` | 16000 | HP | wiki_snapshot | [SUP-BEACON](https://cosmoteer.wiki.gg/wiki/Hyperdrive_Beacon) |
| `crew_speed_multiplier` | 0.5 | ratio | wiki_snapshot | [SUP-BEACON](https://cosmoteer.wiki.gg/wiki/Hyperdrive_Beacon) |
| `crew_required` | 6 | crew | wiki_snapshot | [SUP-BEACON](https://cosmoteer.wiki.gg/wiki/Hyperdrive_Beacon) |
| `command_points` | -12 | command_point | wiki_snapshot | [SUP-BEACON](https://cosmoteer.wiki.gg/wiki/Hyperdrive_Beacon) |
| `power_capacity` | 12 | game_power | wiki_snapshot | [SUP-BEACON](https://cosmoteer.wiki.gg/wiki/Hyperdrive_Beacon) |
| `power_use_per_s` | 0.2 | game_power/s | wiki_snapshot | [SUP-BEACON](https://cosmoteer.wiki.gg/wiki/Hyperdrive_Beacon) |
| `construction_resources` | [{"resource_id":"steel","quantity":160},{"resource_id":"hyper_coils","quantity":40},{"resource_id":"diamonds","quantity":6}] | item[] | wiki_snapshot | [SUP-BEACON](https://cosmoteer.wiki.gg/wiki/Hyperdrive_Beacon) |

## 대형 초공간 장치 (Large Hyperdrive)

- ID: `large_hyperdrive`
- 모드: `normal`
- 버전 범위: Cosmoteer Modern / Steam; 위키 관측 스냅샷, 정확한 빌드는 미확정

| 필드 | 값 | 단위 | 상태 | 출처 |
| --- | --- | --- | --- | --- |
| `value_credits` | 34000 | credits | wiki_snapshot | [SUP-HYPERDRIVES](https://cosmoteer.wiki.gg/wiki/Hyperdrives) |
| `width_m` | 4 | m | wiki_snapshot | [SUP-HYPERDRIVES](https://cosmoteer.wiki.gg/wiki/Hyperdrives) |
| `height_m` | 4 | m | wiki_snapshot | [SUP-HYPERDRIVES](https://cosmoteer.wiki.gg/wiki/Hyperdrives) |
| `mass_t` | 16 | tonne | wiki_snapshot | [SUP-HYPERDRIVES](https://cosmoteer.wiki.gg/wiki/Hyperdrives) |
| `hp` | 16000 | HP | wiki_snapshot | [SUP-HYPERDRIVES](https://cosmoteer.wiki.gg/wiki/Hyperdrives) |
| `crew_speed_multiplier` | 0.5 | ratio | wiki_snapshot | [SUP-HYPERDRIVES](https://cosmoteer.wiki.gg/wiki/Hyperdrives) |
| `power_capacity` | 32 | game_power | wiki_snapshot | [SUP-HYPERDRIVES](https://cosmoteer.wiki.gg/wiki/Hyperdrives) |
| `hyperium_capacity` | 80 | item | wiki_snapshot | [SUP-HYPERDRIVES](https://cosmoteer.wiki.gg/wiki/Hyperdrives) |
| `optimal_efficiency_radius_m` | 20 | m | wiki_snapshot | [SUP-HYPERDRIVES](https://cosmoteer.wiki.gg/wiki/Hyperdrives) |
| `minimum_efficiency_radius_m` | 120 | m | wiki_snapshot | [SUP-HYPERDRIVES](https://cosmoteer.wiki.gg/wiki/Hyperdrives) |
| `construction_resources` | [{"resource_id":"steel","quantity":156},{"resource_id":"hyper_coils","quantity":67},{"resource_id":"processor","quantity":4}] | item[] | wiki_snapshot | [SUP-HYPERDRIVES](https://cosmoteer.wiki.gg/wiki/Hyperdrives) |
| `blueprint_cost_credits` | 미확정 | credits | conflict | [SUP-HYPERDRIVES](https://cosmoteer.wiki.gg/wiki/Hyperdrives), [SUP-BLUEPRINTS](https://cosmoteer.wiki.gg/wiki/Blueprints) |

### 적용 메모

- 개별 부품 표와 Blueprints 총표의 해금 비용이 다름. 동일 버전임을 확인할 수 없어 null.

### 대조 관측값

```json
[
  {
    "field": "blueprint_cost_credits",
    "value": 16000,
    "source_id": "SUP-HYPERDRIVES"
  },
  {
    "field": "blueprint_cost_credits",
    "value": 20000,
    "source_id": "SUP-BLUEPRINTS"
  }
]
```

## 중형 초공간 장치 (Medium Hyperdrive)

- ID: `medium_hyperdrive`
- 모드: `normal`
- 버전 범위: Cosmoteer Modern / Steam; 위키 관측 스냅샷, 정확한 빌드는 미확정

| 필드 | 값 | 단위 | 상태 | 출처 |
| --- | --- | --- | --- | --- |
| `value_credits` | 20000 | credits | wiki_snapshot | [SUP-HYPERDRIVES](https://cosmoteer.wiki.gg/wiki/Hyperdrives) |
| `width_m` | 3 | m | wiki_snapshot | [SUP-HYPERDRIVES](https://cosmoteer.wiki.gg/wiki/Hyperdrives) |
| `height_m` | 3 | m | wiki_snapshot | [SUP-HYPERDRIVES](https://cosmoteer.wiki.gg/wiki/Hyperdrives) |
| `mass_t` | 9 | tonne | wiki_snapshot | [SUP-HYPERDRIVES](https://cosmoteer.wiki.gg/wiki/Hyperdrives) |
| `hp` | 9000 | HP | wiki_snapshot | [SUP-HYPERDRIVES](https://cosmoteer.wiki.gg/wiki/Hyperdrives) |
| `crew_speed_multiplier` | 0.5 | ratio | wiki_snapshot | [SUP-HYPERDRIVES](https://cosmoteer.wiki.gg/wiki/Hyperdrives) |
| `power_capacity` | 24 | game_power | wiki_snapshot | [SUP-HYPERDRIVES](https://cosmoteer.wiki.gg/wiki/Hyperdrives) |
| `hyperium_capacity` | 40 | item | wiki_snapshot | [SUP-HYPERDRIVES](https://cosmoteer.wiki.gg/wiki/Hyperdrives) |
| `optimal_efficiency_radius_m` | 10 | m | wiki_snapshot | [SUP-HYPERDRIVES](https://cosmoteer.wiki.gg/wiki/Hyperdrives) |
| `minimum_efficiency_radius_m` | 60 | m | wiki_snapshot | [SUP-HYPERDRIVES](https://cosmoteer.wiki.gg/wiki/Hyperdrives) |
| `construction_resources` | [{"resource_id":"steel","quantity":76},{"resource_id":"hyper_coils","quantity":52},{"resource_id":"processor","quantity":1}] | item[] | wiki_snapshot | [SUP-HYPERDRIVES](https://cosmoteer.wiki.gg/wiki/Hyperdrives) |
| `blueprint_cost_credits` | 미확정 | credits | conflict | [SUP-HYPERDRIVES](https://cosmoteer.wiki.gg/wiki/Hyperdrives), [SUP-BLUEPRINTS](https://cosmoteer.wiki.gg/wiki/Blueprints) |

### 적용 메모

- 개별 부품 표와 Blueprints 총표의 해금 비용이 다름. 동일 버전임을 확인할 수 없어 null.

### 대조 관측값

```json
[
  {
    "field": "blueprint_cost_credits",
    "value": 8000,
    "source_id": "SUP-HYPERDRIVES"
  },
  {
    "field": "blueprint_cost_credits",
    "value": 10000,
    "source_id": "SUP-BLUEPRINTS"
  }
]
```

## 소형 초공간 장치 (Small Hyperdrive)

- ID: `small_hyperdrive`
- 모드: `normal`
- 버전 범위: Cosmoteer Modern / Steam; 위키 관측 스냅샷, 정확한 빌드는 미확정

| 필드 | 값 | 단위 | 상태 | 출처 |
| --- | --- | --- | --- | --- |
| `value_credits` | 10000 | credits | wiki_snapshot | [SUP-HYPERDRIVES](https://cosmoteer.wiki.gg/wiki/Hyperdrives) |
| `width_m` | 2 | m | wiki_snapshot | [SUP-HYPERDRIVES](https://cosmoteer.wiki.gg/wiki/Hyperdrives) |
| `height_m` | 2 | m | wiki_snapshot | [SUP-HYPERDRIVES](https://cosmoteer.wiki.gg/wiki/Hyperdrives) |
| `mass_t` | 4 | tonne | wiki_snapshot | [SUP-HYPERDRIVES](https://cosmoteer.wiki.gg/wiki/Hyperdrives) |
| `hp` | 4000 | HP | wiki_snapshot | [SUP-HYPERDRIVES](https://cosmoteer.wiki.gg/wiki/Hyperdrives) |
| `crew_speed_multiplier` | 0.5 | ratio | wiki_snapshot | [SUP-HYPERDRIVES](https://cosmoteer.wiki.gg/wiki/Hyperdrives) |
| `power_capacity` | 16 | game_power | wiki_snapshot | [SUP-HYPERDRIVES](https://cosmoteer.wiki.gg/wiki/Hyperdrives) |
| `hyperium_capacity` | 20 | item | wiki_snapshot | [SUP-HYPERDRIVES](https://cosmoteer.wiki.gg/wiki/Hyperdrives) |
| `optimal_efficiency_radius_m` | 5 | m | wiki_snapshot | [SUP-HYPERDRIVES](https://cosmoteer.wiki.gg/wiki/Hyperdrives) |
| `minimum_efficiency_radius_m` | 30 | m | wiki_snapshot | [SUP-HYPERDRIVES](https://cosmoteer.wiki.gg/wiki/Hyperdrives) |
| `construction_resources` | [{"resource_id":"steel","quantity":40},{"resource_id":"coils","quantity":90}] | item[] | wiki_snapshot | [SUP-HYPERDRIVES](https://cosmoteer.wiki.gg/wiki/Hyperdrives) |

