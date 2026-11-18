# propulsion · part

[전체 목차](README.md)

각 필드는 값·단위·근거 상태·출처를 함께 읽는다. 영문 명칭은 식별용이며 한국어 명칭은 이 자료의 번역이다.

## 부스트 추진기 (Boost Thruster)

- ID: `boost_thruster`
- 모드: `normal`
- 버전 범위: Cosmoteer Modern / Steam; 위키 관측 스냅샷, 정확한 빌드는 미확정

| 필드 | 값 | 단위 | 상태 | 출처 |
| --- | --- | --- | --- | --- |
| `value_credits` | 6000 | credits | wiki_snapshot | [SUP-THRUSTERS](https://cosmoteer.wiki.gg/wiki/Thrusters) |
| `width_m` | 2 | m | wiki_snapshot | [SUP-THRUSTERS](https://cosmoteer.wiki.gg/wiki/Thrusters) |
| `height_m` | 5 | m | wiki_snapshot | [SUP-THRUSTERS](https://cosmoteer.wiki.gg/wiki/Thrusters) |
| `mass_t` | 8.88 | tonne | wiki_snapshot | [SUP-THRUSTERS](https://cosmoteer.wiki.gg/wiki/Thrusters) |
| `hp` | 6000 | HP | wiki_snapshot | [SUP-THRUSTERS](https://cosmoteer.wiki.gg/wiki/Thrusters) |
| `crew_speed_multiplier` | 0.5 | ratio | wiki_snapshot | [SUP-THRUSTERS](https://cosmoteer.wiki.gg/wiki/Thrusters) |
| `command_points` | -6 | command_point | wiki_snapshot | [SUP-THRUSTERS](https://cosmoteer.wiki.gg/wiki/Thrusters) |
| `power_capacity` | 6 | game_power | wiki_snapshot | [SUP-THRUSTERS](https://cosmoteer.wiki.gg/wiki/Thrusters) |
| `power_use_per_s` | 0.2 | game_power/s | wiki_snapshot | [SUP-THRUSTERS](https://cosmoteer.wiki.gg/wiki/Thrusters) |
| `thrust_kn` | 3200 | kN | wiki_snapshot | [SUP-THRUSTERS](https://cosmoteer.wiki.gg/wiki/Thrusters) |
| `ramp_up_s` | 2 | s | wiki_snapshot | [SUP-THRUSTERS](https://cosmoteer.wiki.gg/wiki/Thrusters) |
| `construction_resources` | [{"resource_id":"steel","quantity":56},{"resource_id":"hyper_coils","quantity":10},{"resource_id":"tri_steel","quantity":8}] | item[] | wiki_snapshot | [SUP-THRUSTERS](https://cosmoteer.wiki.gg/wiki/Thrusters) |
| `boost_thrust_kn` | 9600 | kN | wiki_snapshot | [SUP-THRUSTERS](https://cosmoteer.wiki.gg/wiki/Thrusters) |
| `boost_power_use_per_s` | 0.45 | game_power/s | wiki_snapshot | [SUP-THRUSTERS](https://cosmoteer.wiki.gg/wiki/Thrusters) |
| `boost_passive_drain_per_s` | 0.1 | game_power/s | wiki_snapshot | [SUP-THRUSTERS](https://cosmoteer.wiki.gg/wiki/Thrusters) |
| `boost_ramp_up_s` | 0 | s | wiki_snapshot | [SUP-THRUSTERS](https://cosmoteer.wiki.gg/wiki/Thrusters) |

### 적용 메모

- normal은 비오버클럭. boost_*는 같은 부품의 일시적 부스트 상태이며 overclock과 구별.

## 기관실 (Engine Room)

- ID: `engine_room`
- 모드: `normal`
- 버전 범위: Cosmoteer Modern / Steam; 위키 관측 스냅샷, 정확한 빌드는 미확정

| 필드 | 값 | 단위 | 상태 | 출처 |
| --- | --- | --- | --- | --- |
| `value_credits` | 12000 | credits | wiki_snapshot | [SUP-ENGINE](https://cosmoteer.wiki.gg/wiki/Engine_Room) |
| `width_m` | 3 | m | wiki_snapshot | [SUP-ENGINE](https://cosmoteer.wiki.gg/wiki/Engine_Room) |
| `height_m` | 3 | m | wiki_snapshot | [SUP-ENGINE](https://cosmoteer.wiki.gg/wiki/Engine_Room) |
| `mass_t` | 9 | tonne | wiki_snapshot | [SUP-ENGINE](https://cosmoteer.wiki.gg/wiki/Engine_Room) |
| `hp` | 9000 | HP | wiki_snapshot | [SUP-ENGINE](https://cosmoteer.wiki.gg/wiki/Engine_Room) |
| `crew_speed_multiplier` | 0.5 | ratio | wiki_snapshot | [SUP-ENGINE](https://cosmoteer.wiki.gg/wiki/Engine_Room) |
| `crew_required` | 2 | crew | wiki_snapshot | [SUP-ENGINE](https://cosmoteer.wiki.gg/wiki/Engine_Room) |
| `command_points` | -6 | command_point | wiki_snapshot | [SUP-ENGINE](https://cosmoteer.wiki.gg/wiki/Engine_Room) |
| `power_capacity` | 4 | game_power | wiki_snapshot | [SUP-ENGINE](https://cosmoteer.wiki.gg/wiki/Engine_Room) |
| `power_use_per_s` | 0.1 | game_power/s | wiki_snapshot | [SUP-ENGINE](https://cosmoteer.wiki.gg/wiki/Engine_Room) |
| `adjacent_thrust_multiplier` | 1.5 | ratio | wiki_snapshot | [SUP-ENGINE](https://cosmoteer.wiki.gg/wiki/Engine_Room) |
| `adjacent_power_use_multiplier` | 1.5 | ratio | wiki_snapshot | [SUP-ENGINE](https://cosmoteer.wiki.gg/wiki/Engine_Room) |
| `blueprint_cost_credits` | 6000 | credits | wiki_snapshot | [SUP-ENGINE](https://cosmoteer.wiki.gg/wiki/Engine_Room) |
| `blueprint_requires` | ["large_thruster"] | record_id[] | wiki_snapshot | [SUP-ENGINE](https://cosmoteer.wiki.gg/wiki/Engine_Room) |
| `construction_resources` | [{"resource_id":"steel","quantity":96},{"resource_id":"hyper_coils","quantity":32}] | item[] | wiki_snapshot | [SUP-ENGINE](https://cosmoteer.wiki.gg/wiki/Engine_Room) |

## 초대형 추진기 (Huge Thruster)

- ID: `huge_thruster`
- 모드: `normal`
- 버전 범위: Cosmoteer Modern / Steam; 위키 관측 스냅샷, 정확한 빌드는 미확정

| 필드 | 값 | 단위 | 상태 | 출처 |
| --- | --- | --- | --- | --- |
| `value_credits` | 10000 | credits | wiki_snapshot | [SUP-THRUSTERS](https://cosmoteer.wiki.gg/wiki/Thrusters) |
| `width_m` | 3 | m | wiki_snapshot | [SUP-THRUSTERS](https://cosmoteer.wiki.gg/wiki/Thrusters) |
| `height_m` | 4 | m | wiki_snapshot | [SUP-THRUSTERS](https://cosmoteer.wiki.gg/wiki/Thrusters) |
| `mass_t` | 11 | tonne | wiki_snapshot | [SUP-THRUSTERS](https://cosmoteer.wiki.gg/wiki/Thrusters) |
| `hp` | 9000 | HP | wiki_snapshot | [SUP-THRUSTERS](https://cosmoteer.wiki.gg/wiki/Thrusters) |
| `crew_speed_multiplier` | 0.5 | ratio | wiki_snapshot | [SUP-THRUSTERS](https://cosmoteer.wiki.gg/wiki/Thrusters) |
| `command_points` | -8 | command_point | wiki_snapshot | [SUP-THRUSTERS](https://cosmoteer.wiki.gg/wiki/Thrusters) |
| `power_capacity` | 8 | game_power | wiki_snapshot | [SUP-THRUSTERS](https://cosmoteer.wiki.gg/wiki/Thrusters) |
| `power_use_per_s` | 0.4 | game_power/s | wiki_snapshot | [SUP-THRUSTERS](https://cosmoteer.wiki.gg/wiki/Thrusters) |
| `thrust_kn` | 8000 | kN | wiki_snapshot | [SUP-THRUSTERS](https://cosmoteer.wiki.gg/wiki/Thrusters) |
| `ramp_up_s` | 4 | s | wiki_snapshot | [SUP-THRUSTERS](https://cosmoteer.wiki.gg/wiki/Thrusters) |
| `construction_resources` | [{"resource_id":"steel","quantity":124},{"resource_id":"hyper_coils","quantity":23}] | item[] | wiki_snapshot | [SUP-THRUSTERS](https://cosmoteer.wiki.gg/wiki/Thrusters) |
| `ramp_down_s` | 0 | s | wiki_history_resolved | [SUP-THRUSTERS](https://cosmoteer.wiki.gg/wiki/Thrusters) |

### 적용 메모

- 인포박스의 두 번째 Ramp-Up Time=0은 표제 중복. 0.28.2 이력의 ramp-down 제거로 구분.

## 대형 추진기 (Large Thruster)

- ID: `large_thruster`
- 모드: `normal`
- 버전 범위: Cosmoteer Modern / Steam; 위키 관측 스냅샷, 정확한 빌드는 미확정

| 필드 | 값 | 단위 | 상태 | 출처 |
| --- | --- | --- | --- | --- |
| `value_credits` | 4000 | credits | wiki_snapshot | [SUP-THRUSTERS](https://cosmoteer.wiki.gg/wiki/Thrusters) |
| `width_m` | 2 | m | wiki_snapshot | [SUP-THRUSTERS](https://cosmoteer.wiki.gg/wiki/Thrusters) |
| `height_m` | 3 | m | wiki_snapshot | [SUP-THRUSTERS](https://cosmoteer.wiki.gg/wiki/Thrusters) |
| `mass_t` | 4.99 | tonne | wiki_snapshot | [SUP-THRUSTERS](https://cosmoteer.wiki.gg/wiki/Thrusters) |
| `hp` | 4000 | HP | wiki_snapshot | [SUP-THRUSTERS](https://cosmoteer.wiki.gg/wiki/Thrusters) |
| `crew_speed_multiplier` | 0.5 | ratio | wiki_snapshot | [SUP-THRUSTERS](https://cosmoteer.wiki.gg/wiki/Thrusters) |
| `command_points` | -4 | command_point | wiki_snapshot | [SUP-THRUSTERS](https://cosmoteer.wiki.gg/wiki/Thrusters) |
| `power_capacity` | 4 | game_power | wiki_snapshot | [SUP-THRUSTERS](https://cosmoteer.wiki.gg/wiki/Thrusters) |
| `power_use_per_s` | 0.2 | game_power/s | wiki_snapshot | [SUP-THRUSTERS](https://cosmoteer.wiki.gg/wiki/Thrusters) |
| `thrust_kn` | 3200 | kN | wiki_snapshot | [SUP-THRUSTERS](https://cosmoteer.wiki.gg/wiki/Thrusters) |
| `ramp_up_s` | 2 | s | wiki_snapshot | [SUP-THRUSTERS](https://cosmoteer.wiki.gg/wiki/Thrusters) |
| `construction_resources` | [{"resource_id":"steel","quantity":40},{"resource_id":"coils","quantity":30}] | item[] | wiki_snapshot | [SUP-THRUSTERS](https://cosmoteer.wiki.gg/wiki/Thrusters) |

## 모듈식 로켓 확장 모듈 (M.R.T. Extender Module)

- ID: `mrt_extender`
- 모드: `normal`
- 버전 범위: Cosmoteer Modern / Steam; 위키 관측 스냅샷, 정확한 빌드는 미확정

| 필드 | 값 | 단위 | 상태 | 출처 |
| --- | --- | --- | --- | --- |
| `value_credits` | 6000 | credits | wiki_snapshot | [SUP-MRT-E](https://cosmoteer.wiki.gg/wiki/M.R.T._Extender_Module) |
| `width_m` | 3 | m | wiki_snapshot | [SUP-MRT-E](https://cosmoteer.wiki.gg/wiki/M.R.T._Extender_Module) |
| `height_m` | 2 | m | wiki_snapshot | [SUP-MRT-E](https://cosmoteer.wiki.gg/wiki/M.R.T._Extender_Module) |
| `mass_t` | 6 | tonne | wiki_snapshot | [SUP-MRT-E](https://cosmoteer.wiki.gg/wiki/M.R.T._Extender_Module) |
| `hp` | 6000 | HP | wiki_snapshot | [SUP-MRT-E](https://cosmoteer.wiki.gg/wiki/M.R.T._Extender_Module) |
| `crew_speed_multiplier` | 0.5 | ratio | wiki_snapshot | [SUP-MRT-E](https://cosmoteer.wiki.gg/wiki/M.R.T._Extender_Module) |
| `power_capacity` | 2 | game_power | wiki_snapshot | [SUP-MRT-E](https://cosmoteer.wiki.gg/wiki/M.R.T._Extender_Module) |
| `max_fuel_pods_per_segment` | 2 | count | wiki_snapshot | [SUP-MRT-E](https://cosmoteer.wiki.gg/wiki/M.R.T._Extender_Module) |
| `blueprint_cost_credits` | 10000 | credits | wiki_snapshot | [SUP-MRT-E](https://cosmoteer.wiki.gg/wiki/M.R.T._Extender_Module) |
| `blueprint_requires` | ["huge_thruster"] | record_id[] | wiki_snapshot | [SUP-MRT-E](https://cosmoteer.wiki.gg/wiki/M.R.T._Extender_Module) |
| `construction_resources` | [{"resource_id":"steel","quantity":60},{"resource_id":"hyper_coils","quantity":15}] | item[] | wiki_snapshot | [SUP-MRT-E](https://cosmoteer.wiki.gg/wiki/M.R.T._Extender_Module) |

## 모듈식 로켓 연료 포드 (M.R.T. Fuel Pod)

- ID: `mrt_fuel_pod`
- 모드: `normal`
- 버전 범위: Cosmoteer Modern / Steam; 위키 관측 스냅샷, 정확한 빌드는 미확정

| 필드 | 값 | 단위 | 상태 | 출처 |
| --- | --- | --- | --- | --- |
| `value_credits` | 1500 | credits | wiki_snapshot | [SUP-MRT-F](https://cosmoteer.wiki.gg/wiki/M.R.T._Fuel_Pod) |
| `width_m` | 1 | m | wiki_snapshot | [SUP-MRT-F](https://cosmoteer.wiki.gg/wiki/M.R.T._Fuel_Pod) |
| `height_m` | 2 | m | wiki_snapshot | [SUP-MRT-F](https://cosmoteer.wiki.gg/wiki/M.R.T._Fuel_Pod) |
| `mass_t` | 2 | tonne | wiki_snapshot | [SUP-MRT-F](https://cosmoteer.wiki.gg/wiki/M.R.T._Fuel_Pod) |
| `hp` | 2000 | HP | wiki_snapshot | [SUP-MRT-F](https://cosmoteer.wiki.gg/wiki/M.R.T._Fuel_Pod) |
| `crew_speed_multiplier` | 0.5 | ratio | wiki_snapshot | [SUP-MRT-F](https://cosmoteer.wiki.gg/wiki/M.R.T._Fuel_Pod) |
| `power_capacity` | 4 | game_power | wiki_snapshot | [SUP-MRT-F](https://cosmoteer.wiki.gg/wiki/M.R.T._Fuel_Pod) |
| `blueprint_cost_credits` | 10000 | credits | wiki_snapshot | [SUP-MRT-F](https://cosmoteer.wiki.gg/wiki/M.R.T._Fuel_Pod) |
| `blueprint_requires` | ["huge_thruster"] | record_id[] | wiki_snapshot | [SUP-MRT-F](https://cosmoteer.wiki.gg/wiki/M.R.T._Fuel_Pod) |
| `construction_resources` | [{"resource_id":"steel","quantity":20},{"resource_id":"coils","quantity":10}] | item[] | wiki_snapshot | [SUP-MRT-F](https://cosmoteer.wiki.gg/wiki/M.R.T._Fuel_Pod) |

## 모듈식 로켓 노즐 (M.R.T. Nozzle Module)

- ID: `mrt_nozzle`
- 모드: `normal`
- 버전 범위: Cosmoteer Modern / Steam; 위키 관측 스냅샷, 정확한 빌드는 미확정

| 필드 | 값 | 단위 | 상태 | 출처 |
| --- | --- | --- | --- | --- |
| `value_credits` | 15000 | credits | wiki_snapshot | [SUP-MRT-N](https://cosmoteer.wiki.gg/wiki/M.R.T._Nozzle_Module) |
| `width_m` | 3 | m | wiki_snapshot | [SUP-MRT-N](https://cosmoteer.wiki.gg/wiki/M.R.T._Nozzle_Module) |
| `height_m` | 5 | m | wiki_snapshot | [SUP-MRT-N](https://cosmoteer.wiki.gg/wiki/M.R.T._Nozzle_Module) |
| `mass_t` | 14.4 | tonne | wiki_snapshot | [SUP-MRT-N](https://cosmoteer.wiki.gg/wiki/M.R.T._Nozzle_Module) |
| `hp` | 12000 | HP | wiki_snapshot | [SUP-MRT-N](https://cosmoteer.wiki.gg/wiki/M.R.T._Nozzle_Module) |
| `crew_speed_multiplier` | 0.5 | ratio | wiki_snapshot | [SUP-MRT-N](https://cosmoteer.wiki.gg/wiki/M.R.T._Nozzle_Module) |
| `crew_required` | 2 | crew | wiki_snapshot | [SUP-MRT-N](https://cosmoteer.wiki.gg/wiki/M.R.T._Nozzle_Module) |
| `command_points` | -16 | command_point | wiki_snapshot | [SUP-MRT-N](https://cosmoteer.wiki.gg/wiki/M.R.T._Nozzle_Module) |
| `power_capacity` | 2 | game_power | wiki_snapshot | [SUP-MRT-N](https://cosmoteer.wiki.gg/wiki/M.R.T._Nozzle_Module) |
| `power_use_per_s` | 0.3 | game_power/s | wiki_snapshot | [SUP-MRT-N](https://cosmoteer.wiki.gg/wiki/M.R.T._Nozzle_Module) |
| `thrust_kn` | 10000 | kN | wiki_snapshot | [SUP-MRT-N](https://cosmoteer.wiki.gg/wiki/M.R.T._Nozzle_Module) |
| `ramp_up_s` | 4 | s | wiki_snapshot | [SUP-MRT-N](https://cosmoteer.wiki.gg/wiki/M.R.T._Nozzle_Module) |
| `ramp_down_s` | 2 | s | wiki_history_resolved | [SUP-MRT-N](https://cosmoteer.wiki.gg/wiki/M.R.T._Nozzle_Module) |
| `max_fuel_pods_per_segment` | 2 | count | wiki_snapshot | [SUP-MRT-N](https://cosmoteer.wiki.gg/wiki/M.R.T._Nozzle_Module) |
| `blueprint_cost_credits` | 10000 | credits | wiki_snapshot | [SUP-MRT-N](https://cosmoteer.wiki.gg/wiki/M.R.T._Nozzle_Module) |
| `blueprint_requires` | ["huge_thruster"] | record_id[] | wiki_snapshot | [SUP-MRT-N](https://cosmoteer.wiki.gg/wiki/M.R.T._Nozzle_Module) |
| `construction_resources` | [{"resource_id":"steel","quantity":120},{"resource_id":"hyper_coils","quantity":30},{"resource_id":"tri_steel","quantity":15}] | item[] | wiki_snapshot | [SUP-MRT-N](https://cosmoteer.wiki.gg/wiki/M.R.T._Nozzle_Module) |

### 적용 메모

- 확장 모듈 0개 기준. 두 번째 Ramp-Up=2초는 0.28.0 이력의 ramp-down 2초로 해석. 확장별 추력 증가 수식은 미복구.

## 소형 추진기 (Small Thruster)

- ID: `small_thruster`
- 모드: `normal`
- 버전 범위: Cosmoteer Modern / Steam; 위키 관측 스냅샷, 정확한 빌드는 미확정

| 필드 | 값 | 단위 | 상태 | 출처 |
| --- | --- | --- | --- | --- |
| `value_credits` | 500 | credits | wiki_snapshot | [SUP-THRUSTERS](https://cosmoteer.wiki.gg/wiki/Thrusters) |
| `width_m` | 1 | m | wiki_snapshot | [SUP-THRUSTERS](https://cosmoteer.wiki.gg/wiki/Thrusters) |
| `height_m` | 2 | m | wiki_snapshot | [SUP-THRUSTERS](https://cosmoteer.wiki.gg/wiki/Thrusters) |
| `mass_t` | 1.3 | tonne | wiki_snapshot | [SUP-THRUSTERS](https://cosmoteer.wiki.gg/wiki/Thrusters) |
| `hp` | 1000 | HP | wiki_snapshot | [SUP-THRUSTERS](https://cosmoteer.wiki.gg/wiki/Thrusters) |
| `crew_speed_multiplier` | 0.5 | ratio | wiki_snapshot | [SUP-THRUSTERS](https://cosmoteer.wiki.gg/wiki/Thrusters) |
| `command_points` | -1 | command_point | wiki_snapshot | [SUP-THRUSTERS](https://cosmoteer.wiki.gg/wiki/Thrusters) |
| `power_capacity` | 1 | game_power | wiki_snapshot | [SUP-THRUSTERS](https://cosmoteer.wiki.gg/wiki/Thrusters) |
| `power_use_per_s` | 0.03 | game_power/s | wiki_snapshot | [SUP-THRUSTERS](https://cosmoteer.wiki.gg/wiki/Thrusters) |
| `thrust_kn` | 400 | kN | wiki_snapshot | [SUP-THRUSTERS](https://cosmoteer.wiki.gg/wiki/Thrusters) |
| `ramp_up_s` | 0 | s | wiki_snapshot | [SUP-THRUSTERS](https://cosmoteer.wiki.gg/wiki/Thrusters) |
| `construction_resources` | [{"resource_id":"steel","quantity":8},{"resource_id":"coils","quantity":3}] | item[] | wiki_snapshot | [SUP-THRUSTERS](https://cosmoteer.wiki.gg/wiki/Thrusters) |
| `power_generation_per_s` | 0.005 | game_power/s | wiki_snapshot | [SUP-THRUSTERS](https://cosmoteer.wiki.gg/wiki/Thrusters) |

## 2방향 소형 추진기 (2-Way Small Thruster)

- ID: `small_thruster_2way`
- 모드: `normal`
- 버전 범위: Cosmoteer Modern / Steam; 위키 관측 스냅샷, 정확한 빌드는 미확정

| 필드 | 값 | 단위 | 상태 | 출처 |
| --- | --- | --- | --- | --- |
| `value_credits` | 1000 | credits | wiki_snapshot | [SUP-THRUSTERS](https://cosmoteer.wiki.gg/wiki/Thrusters) |
| `width_m` | 2 | m | wiki_snapshot | [SUP-THRUSTERS](https://cosmoteer.wiki.gg/wiki/Thrusters) |
| `height_m` | 2 | m | wiki_snapshot | [SUP-THRUSTERS](https://cosmoteer.wiki.gg/wiki/Thrusters) |
| `mass_t` | 1.61 | tonne | wiki_snapshot | [SUP-THRUSTERS](https://cosmoteer.wiki.gg/wiki/Thrusters) |
| `hp` | 1000 | HP | wiki_snapshot | [SUP-THRUSTERS](https://cosmoteer.wiki.gg/wiki/Thrusters) |
| `crew_speed_multiplier` | 0.5 | ratio | wiki_snapshot | [SUP-THRUSTERS](https://cosmoteer.wiki.gg/wiki/Thrusters) |
| `command_points` | -2 | command_point | wiki_snapshot | [SUP-THRUSTERS](https://cosmoteer.wiki.gg/wiki/Thrusters) |
| `power_capacity` | 1 | game_power | wiki_snapshot | [SUP-THRUSTERS](https://cosmoteer.wiki.gg/wiki/Thrusters) |
| `power_use_per_s` | 0.03 | game_power/s | wiki_snapshot | [SUP-THRUSTERS](https://cosmoteer.wiki.gg/wiki/Thrusters) |
| `thrust_kn` | 400 | kN | wiki_snapshot | [SUP-THRUSTERS](https://cosmoteer.wiki.gg/wiki/Thrusters) |
| `ramp_up_s` | 0 | s | wiki_snapshot | [SUP-THRUSTERS](https://cosmoteer.wiki.gg/wiki/Thrusters) |
| `construction_resources` | [{"resource_id":"steel","quantity":12},{"resource_id":"coils","quantity":7}] | item[] | wiki_snapshot | [SUP-THRUSTERS](https://cosmoteer.wiki.gg/wiki/Thrusters) |
| `power_generation_per_s` | 0.005 | game_power/s | wiki_snapshot | [SUP-THRUSTERS](https://cosmoteer.wiki.gg/wiki/Thrusters) |

## 3방향 소형 추진기 (3-Way Small Thruster)

- ID: `small_thruster_3way`
- 모드: `normal`
- 버전 범위: Cosmoteer Modern / Steam; 위키 관측 스냅샷, 정확한 빌드는 미확정

| 필드 | 값 | 단위 | 상태 | 출처 |
| --- | --- | --- | --- | --- |
| `value_credits` | 1500 | credits | wiki_snapshot | [SUP-THRUSTERS](https://cosmoteer.wiki.gg/wiki/Thrusters) |
| `width_m` | 3 | m | wiki_snapshot | [SUP-THRUSTERS](https://cosmoteer.wiki.gg/wiki/Thrusters) |
| `height_m` | 2 | m | wiki_snapshot | [SUP-THRUSTERS](https://cosmoteer.wiki.gg/wiki/Thrusters) |
| `mass_t` | 1.91 | tonne | wiki_snapshot | [SUP-THRUSTERS](https://cosmoteer.wiki.gg/wiki/Thrusters) |
| `hp` | 1000 | HP | wiki_snapshot | [SUP-THRUSTERS](https://cosmoteer.wiki.gg/wiki/Thrusters) |
| `crew_speed_multiplier` | 0.5 | ratio | wiki_snapshot | [SUP-THRUSTERS](https://cosmoteer.wiki.gg/wiki/Thrusters) |
| `command_points` | -3 | command_point | wiki_snapshot | [SUP-THRUSTERS](https://cosmoteer.wiki.gg/wiki/Thrusters) |
| `power_capacity` | 1 | game_power | wiki_snapshot | [SUP-THRUSTERS](https://cosmoteer.wiki.gg/wiki/Thrusters) |
| `power_use_per_s` | 0.03 | game_power/s | wiki_snapshot | [SUP-THRUSTERS](https://cosmoteer.wiki.gg/wiki/Thrusters) |
| `thrust_kn` | 400 | kN | wiki_snapshot | [SUP-THRUSTERS](https://cosmoteer.wiki.gg/wiki/Thrusters) |
| `ramp_up_s` | 0 | s | wiki_snapshot | [SUP-THRUSTERS](https://cosmoteer.wiki.gg/wiki/Thrusters) |
| `construction_resources` | [{"resource_id":"steel","quantity":16},{"resource_id":"coils","quantity":11}] | item[] | wiki_snapshot | [SUP-THRUSTERS](https://cosmoteer.wiki.gg/wiki/Thrusters) |
| `power_generation_per_s` | 0.005 | game_power/s | wiki_snapshot | [SUP-THRUSTERS](https://cosmoteer.wiki.gg/wiki/Thrusters) |

## 표준 추진기 (Standard Thruster)

- ID: `standard_thruster`
- 모드: `normal`
- 버전 범위: Cosmoteer Modern / Steam; 위키 관측 스냅샷, 정확한 빌드는 미확정

| 필드 | 값 | 단위 | 상태 | 출처 |
| --- | --- | --- | --- | --- |
| `value_credits` | 1500 | credits | wiki_snapshot | [SUP-THRUSTERS](https://cosmoteer.wiki.gg/wiki/Thrusters) |
| `width_m` | 1 | m | wiki_snapshot | [SUP-THRUSTERS](https://cosmoteer.wiki.gg/wiki/Thrusters) |
| `height_m` | 3 | m | wiki_snapshot | [SUP-THRUSTERS](https://cosmoteer.wiki.gg/wiki/Thrusters) |
| `mass_t` | 2.45 | tonne | wiki_snapshot | [SUP-THRUSTERS](https://cosmoteer.wiki.gg/wiki/Thrusters) |
| `hp` | 2000 | HP | wiki_snapshot | [SUP-THRUSTERS](https://cosmoteer.wiki.gg/wiki/Thrusters) |
| `crew_speed_multiplier` | 0.5 | ratio | wiki_snapshot | [SUP-THRUSTERS](https://cosmoteer.wiki.gg/wiki/Thrusters) |
| `command_points` | -2 | command_point | wiki_snapshot | [SUP-THRUSTERS](https://cosmoteer.wiki.gg/wiki/Thrusters) |
| `power_capacity` | 2 | game_power | wiki_snapshot | [SUP-THRUSTERS](https://cosmoteer.wiki.gg/wiki/Thrusters) |
| `power_use_per_s` | 0.1 | game_power/s | wiki_snapshot | [SUP-THRUSTERS](https://cosmoteer.wiki.gg/wiki/Thrusters) |
| `thrust_kn` | 1200 | kN | wiki_snapshot | [SUP-THRUSTERS](https://cosmoteer.wiki.gg/wiki/Thrusters) |
| `ramp_up_s` | 1 | s | wiki_snapshot | [SUP-THRUSTERS](https://cosmoteer.wiki.gg/wiki/Thrusters) |
| `construction_resources` | [{"resource_id":"steel","quantity":24},{"resource_id":"coils","quantity":9}] | item[] | wiki_snapshot | [SUP-THRUSTERS](https://cosmoteer.wiki.gg/wiki/Thrusters) |

