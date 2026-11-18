# 필드 사전

단위는 원문의 게임 단위를 보존한다. `game_power`는 W가 아니며, 질량 tonne·거리 m를 STARFORGE의 임의 단위로 자동 치환하지 않는다.

| 키 | 단위 | 원문 표제 | 사용 수 |
| --- | --- | --- | ---: |
| `absorption_radius` | ["m"] | ["absorption radius"] | 1 |
| `across_speed_multiplier` | ["ratio"] | ["Crew Speed (Across)"] | 1 |
| `actual_batch_size` | ["output_items/cycle"] | ["Actual batch size","one part at a time"] | 13 |
| `added_lance_heat_per_second` | ["MJ/sec (added to Lance)"] | ["Heat Generation"] | 2 |
| `adjacent_factory_speed_bonus` | ["ratio/adjacent_factory"] | ["Adjacent Factory Bonus"] | 13 |
| `adjacent_power_use_multiplier` | ["ratio"] | ["Power-use Buff"] | 1 |
| `adjacent_thrust_multiplier` | ["ratio"] | ["Thruster Buff"] | 1 |
| `ammo_capacity` | ["ammo","assembled munitions"] | ["Ammo Capacity"] | 8 |
| `ammo_per_second` | ["ammo/sec"] | ["Ammo Use"] | 2 |
| `ammo_per_shot` | ["ammo/shot"] | ["Ammo Use"] | 25 |
| `amplification_by_active_lances` | ["% bonus"] | ["Thermal Amplification by Active Lances"] | 1 |
| `area_damage_resistance` | ["%"] | ["Area Damage Resist"] | 6 |
| `area_radius` | ["meters radius"] | ["Damage Area"] | 4 |
| `assembly_parts` | ["EMP Missile Parts/missile","HE Missile Parts/missile","Nuclear Missile Parts/missile","Thermal Canister Missile Parts/missile"] | ["Assembled From"] | 4 |
| `asteroid_damage_per_s` | ["HP/s"] | ["Damage vs Asteroids"] | 1 |
| `base_hire_cost_credits` | ["credits/crew"] | ["Base hire price"] | 1 |
| `base_price_credits` | ["credits/item"] | ["Base Buy Price"] | 22 |
| `base_seconds` | ["s"] | ["base ramp-up"] | 1 |
| `base_walk_speed` | ["tiles/s"] | ["base_walk_speed"] | 1 |
| `battery_charge_s` | ["s"] | ["Battery Charge Time"] | 3 |
| `battery_size` | ["game_power/battery"] | ["Battery Size"] | 4 |
| `beam_count_max` | ["count"] | ["Maximum beams"] | 1 |
| `beams_per_crew` | ["count/crew"] | ["Beams per crew"] | 1 |
| `blueprint_cost_credits` | ["credits"] | ["Blueprint Cost"] | 66 |
| `blueprint_requires` | ["record_id[]"] | ["Required Blueprint"] | 4 |
| `boost_passive_drain_per_s` | ["game_power/s"] | ["Power Use (Boost ON, passive)"] | 1 |
| `boost_power_use_per_s` | ["game_power/s"] | ["Power Use (Boost ON, 100% thrust)"] | 1 |
| `boost_ramp_up_s` | ["s"] | ["Ramp-Up Time (Boost ON)"] | 1 |
| `boost_thrust_kn` | ["kN"] | ["Thrust (Boost ON)"] | 2 |
| `breaking_surrender_truce_can_reduce_fame` | ["boolean"] | ["lose fame"] | 1 |
| `buff_formula` | ["% bonus; X = accelerator count"] | ["Railgun Buff"] | 2 |
| `carrying_speed_multiplier` | ["ratio"] | ["carrying_speed_multiplier"] | 1 |
| `charge_up_base` | ["s"] | ["charge-up base"] | 1 |
| `charge_up_per_accelerator` | ["seconds/accelerator"] | ["charge-up per accelerator"] | 1 |
| `choices` | ["setting[]"] | ["Crew/Fame Ratio"] | 1 |
| `closed_shell_damage_resistance` | ["%"] | ["Shell Damage Resist"] | 1 |
| `closed_shell_thermal_resistance` | ["%"] | ["thermal damage resistance when closed"] | 1 |
| `cloud_duration` | ["s"] | ["cloud lifetime"] | 1 |
| `combine_falloff` | ["%/beam"] | ["Combine Falloff"] | 1 |
| `command_points` | ["command_point"] | ["Command Points","Command Points (signed)"] | 38 |
| `command_points_used` | ["command_points"] | ["Command Points"] | 13 |
| `congestion_floor` | ["ratio"] | ["congestion_floor"] | 1 |
| `congestion_multiplier` | ["ratio"] | ["congestion_multiplier"] | 1 |
| `construction_resources` | ["item","item[]"] | ["Resources"] | 100 |
| `corridor_multiplier` | ["ratio"] | ["corridor_multiplier"] | 1 |
| `crew_beds` | ["crew"] | ["Crew Beds"] | 3 |
| `crew_cap_increases_by_level` | ["boolean"] | ["crew limit in batches"] | 1 |
| `crew_fame_setting` | ["setting"] | ["Crew/Fame Ratio"] | 19 |
| `crew_limit` | ["crew"] | ["Maximum Crew"] | 19 |
| `crew_required` | ["crew"] | ["Crew Required","automated; no operating crew"] | 24 |
| `crew_required_max` | ["crew"] | ["Crew Required maximum"] | 1 |
| `crew_required_min` | ["crew"] | ["Crew Required minimum"] | 1 |
| `crew_speed` | ["%"] | ["Crew Speed"] | 1 |
| `crew_speed_multiplier` | ["ratio"] | ["Crew Speed"] | 43 |
| `crew_stun_radius` | ["m"] | ["Crew Stun Radius"] | 2 |
| `crew_stun_time` | ["s"] | ["Crew Stun Time"] | 2 |
| `damage_per_s` | ["HP/s"] | ["Damage"] | 1 |
| `damage_per_second` | ["damage/sec"] | ["Damage"] | 2 |
| `damage_per_second_far` | ["damage/sec"] | ["Damage (Far)"] | 1 |
| `damage_per_second_near` | ["damage/sec"] | ["Damage (Near)"] | 1 |
| `damage_per_shot` | ["damage/shot"] | ["Damage"] | 30 |
| `damage_retained_at_max_range` | ["%"] | ["damage at max range"] | 1 |
| `damage_retained_per_structure_tile` | ["%"] | ["damage retained per structure tile"] | 1 |
| `damage_vs_shields_per_shot` | ["damage/shot"] | ["Damage vs Shields"] | 2 |
| `damage_vs_shots_per_shot` | ["damage/shot"] | ["Damage vs Shots"] | 2 |
| `damage_vs_structure` | ["damage (event unit unspecified)"] | ["damage vs structure"] | 1 |
| `detonation_range` | ["m"] | ["Detonation Range"] | 1 |
| `dilation_by_active_lances` | ["% bonus"] | ["Lance Dilation by Active Lances"] | 1 |
| `dropped_stack_size` | ["items/world_pile"] | ["Dropped Stack Size"] | 22 |
| `dynamo_enabled` | ["boolean"] | ["dynamo"] | 1 |
| `emp_resistance` | ["power drain"] | ["E.M.P. Resist"] | 6 |
| `enemy_damage_multiplier` | ["ratio"] | ["Enemy damage"] | 5 |
| `equal_input_first_five_weights` | ["%"] | ["1st–5th Beam"] | 1 |
| `equal_task_capability` | ["boolean"] | ["equal_task_capability"] | 1 |
| `eva_oxygen_duration_s` | ["s"] | ["EVA oxygen duration"] | 1 |
| `eva_speed_m_per_s` | ["m/s"] | ["EVA flight speed"] | 1 |
| `exact_trade_rounding` | ["formula"] | ["Trade price rounding"] | 1 |
| `explosion_started_fire_strength` | ["%"] | ["random initial fire strength"] | 1 |
| `extenders_2_to_7_seconds_each` | ["s/module"] | ["2nd to 7th extender"] | 1 |
| `extenders_8_plus_seconds_each` | ["s/module"] | ["8th and later extender"] | 1 |
| `extinguish_capacity` | ["not_specified"] | ["extinguisher capacity"] | 1 |
| `factory_id` | ["record_id"] | ["Factory"] | 13 |
| `fame_reward_multiplier` | ["ratio"] | ["Fame Rewards"] | 4 |
| `fame_threshold` | ["fame"] | ["Fame"] | 19 |
| `fire_chance_per_tile` | ["% chance/tile"] | ["Starts Fires"] | 4 |
| `fire_damage_per_second` | ["damage/sec"] | ["fire_damage_per_second"] | 1 |
| `fire_floor` | ["ratio"] | ["fire_floor"] | 1 |
| `fire_multiplier` | ["ratio"] | ["fire_multiplier"] | 1 |
| `fire_overrides_congestion` | ["boolean"] | ["fire_overrides_congestion"] | 1 |
| `fire_spread_probability` | ["probability"] | ["fire_spread_probability"] | 1 |
| `firing_arc_deg` | ["degree"] | ["Firing Arc"] | 31 |
| `firing_interval_s` | ["s"] | ["launch cooldown","launch cooldown / firing interval"] | 29 |
| `first_extender_seconds` | ["s"] | ["1st extender"] | 1 |
| `first_structure_tile_damage_reduction` | ["%"] | ["damage reduction at first structure tile"] | 1 |
| `foam_duration` | ["s"] | ["anti-fire foam duration","foam_duration"] | 2 |
| `forward_speed_multiplier` | ["ratio"] | ["Crew Speed (Forward)"] | 1 |
| `hate_salvaging_mission_credit_multiplier` | ["ratio"] | ["I Hate Salvaging"] | 1 |
| `heat_application_requires_contiguous_path` | ["boolean"] | ["contiguous path between parts"] | 1 |
| `heat_applied_per_missile` | ["MJ/missile"] | ["applied heat per missile"] | 1 |
| `heat_applied_per_second` | ["MJ/s"] | ["applied heat"] | 1 |
| `heat_capacity` | ["MJ"] | ["Heat Capacity"] | 8 |
| `heat_damage_amplification_formula` | ["formula"] | ["heat_damage_amplification_formula"] | 1 |
| `heat_diffusion_requires_contiguous_path` | ["boolean"] | ["contiguous path between parts"] | 1 |
| `heat_not_boosting_per_s` | ["game_heat/s"] | ["Heat while not boosting"] | 1 |
| `heat_per_damage_absorbed` | ["MJ/damage"] | ["heat per absorbed damage"] | 3 |
| `heat_per_module_per_shot` | ["MJ/part/shot"] | ["Heat Generation"] | 1 |
| `heat_per_s` | ["MJ/s"] | ["Heat Generation"] | 35 |
| `heat_per_shot` | ["MJ/shot"] | ["Heat Generation"] | 24 |
| `heat_pipe_crossing_multiplier` | ["ratio"] | ["heat_pipe_crossing_multiplier"] | 1 |
| `heat_spread_distance` | ["m"] | ["Heat Spread Distance"] | 1 |
| `heat_while_generating_per_s` | ["game_heat/s"] | ["Heat while generating power"] | 3 |
| `heat_while_thrusting_per_s` | ["game_heat/s"] | ["Heat at 100% thrust"] | 3 |
| `height_m` | ["m"] | ["Size","Size height"] | 97 |
| `hire_cost_decreases_with_fame` | ["boolean"] | ["hire_cost_decreases_with_fame"] | 1 |
| `hire_cost_formula` | ["formula"] | ["Hire cost formula"] | 1 |
| `hire_cost_increases_with_crew` | ["boolean"] | ["hire_cost_increases_with_crew"] | 1 |
| `hiring_is_fame_limited` | ["boolean"] | ["hiring_is_fame_limited"] | 1 |
| `hiring_requires_free_beds` | ["boolean"] | ["hiring_requires_free_beds"] | 1 |
| `hp` | ["HP"] | ["Hit Points"] | 99 |
| `hp_per_tile` | ["HP/tile"] | ["Hit Points per tile"] | 5 |
| `hull_heat_decay_per_second` | ["unverified native heat unit/sec"] | ["hull_heat_decay_per_second"] | 1 |
| `hull_heat_ignition_threshold` | ["unverified native heat unit"] | ["hull_heat_ignition_threshold"] | 1 |
| `hyperium_capacity` | ["item"] | ["Hyperium Capacity"] | 3 |
| `input_rates_per_s` | ["item[]/s"] | ["Resource Use per second"] | 13 |
| `inputs` | ["item[]/ratio"] | ["Inputs"] | 13 |
| `instant_processing` | ["boolean"] | ["instant craft"] | 1 |
| `interceptable` | ["boolean"] | ["shrapnel can be targeted and shot down"] | 1 |
| `junk_armor_damage_per_s` | ["HP/s"] | ["Damage vs Junk (Armor)"] | 1 |
| `junk_damage_per_s` | ["HP/s"] | ["Damage vs Junk"] | 1 |
| `life_span` | ["minutes"] | ["Life Span"] | 1 |
| `lightning_damage_vs_parts_parameter` | ["damage (event unit unspecified)"] | ["damage vs parts"] | 1 |
| `lightning_damage_vs_shields_parameter` | ["damage (event unit unspecified)"] | ["damage vs shields"] | 1 |
| `lingering_shrapnel_cloud` | ["boolean"] | ["lingering shrapnel"] | 1 |
| `magazines_for_maximum_rate` | ["magazines"] | ["minimum magazines for 30 shots/sec"] | 1 |
| `mass_t` | ["tonne"] | ["Mass"] | 83 |
| `mass_t_per_item` | ["tonne/item"] | ["resource unit mass"] | 22 |
| `mass_t_per_tile` | ["tonne/tile"] | ["Mass per tile"] | 5 |
| `max_damage_per_shot` | ["damage/shot"] | ["Max Damage"] | 2 |
| `max_fuel_pods_per_segment` | ["count"] | ["Fuel pods per Nozzle or Extender"] | 2 |
| `max_range` | ["m"] | ["Range (Max)"] | 2 |
| `maximum_doors` | ["doors"] | ["Only 1 door is permitted"] | 1 |
| `maximum_fame` | ["fame"] | ["LEGENDARY"] | 1 |
| `maximum_firing_arc` | ["degree"] | ["maximum firing arc"] | 1 |
| `maximum_hull_heat_absorption` | ["MJ/s"] | ["maximum heat absorbed"] | 1 |
| `minimum_damage_retained` | ["%"] | ["minimum damage retained"] | 1 |
| `minimum_efficiency_radius_m` | ["m"] | ["Efficiency: Minimum"] | 3 |
| `mission_reward_modifier` | ["ratio"] | ["Mission Credit Rewards"] | 9 |
| `mode_available` | ["boolean"] | ["overclock mode"] | 3 |
| `money_reward_multiplier` | ["ratio"] | ["Money Rewards"] | 4 |
| `numeric_multipliers` | ["ratio[]"] | ["Crew/Fame multipliers"] | 1 |
| `operating_crew_required` | ["crew"] | ["Crew Required"] | 26 |
| `optimal_efficiency_radius_m` | ["m"] | ["Efficiency: Optimal"] | 3 |
| `orthogonal_only` | ["boolean"] | ["orthogonal_only"] | 1 |
| `other_room_multiplier` | ["ratio"] | ["other_room_multiplier"] | 1 |
| `outputs` | ["item[]/ratio"] | ["Result"] | 13 |
| `packet_sizes` | ["game_power/battery"] | ["Battery Size"] | 1 |
| `part_exists` | ["boolean"] | ["Exterior (structure) Pipes"] | 1 |
| `part_value_equals_construction_resource_value` | ["boolean"] | ["Part credit value"] | 1 |
| `penetration` | ["m"] | ["Penetration","Penetration: ∞ meters (max 10,200 damage)","Penetration: ∞ meters (max 20,000 damage)"] | 9 |
| `penetration_resist` | ["m"] | ["Penetration Resist"] | 7 |
| `player_built_destroyed_drop_ignores_difficulty` | ["boolean"] | ["unaffected by economic difficulty"] | 1 |
| `player_built_destroyed_resource_drop_ratio` | ["ratio"] | ["destroyed player-constructed parts"] | 1 |
| `player_damage_multiplier` | ["ratio"] | ["Damage dealt to enemies"] | 5 |
| `power_capacity` | ["game_power"] | ["Power Capacity"] | 52 |
| `power_drain_per_hit` | ["game_power/shot"] | ["Power Drain On Hit"] | 2 |
| `power_drain_radius` | ["meters radius"] | ["Power Drain Area"] | 1 |
| `power_drain_total` | ["power total"] | ["Power Drain On Hit (total)"] | 1 |
| `power_generation_per_s` | ["game_power/s"] | ["Power Generation"] | 7 |
| `power_generation_while_thrusting_per_s` | ["game_power/s"] | ["Power generation while actively thrusting"] | 3 |
| `power_per_active_lance_per_second` | ["power/Lance/sec"] | ["Power Use"] | 1 |
| `power_per_output` | ["game_power/item"] | ["Power Use","Power per crafted item"] | 2 |
| `power_per_second_by_active_lances` | ["game_power/s"] | ["Power Use by Active Lances"] | 1 |
| `power_per_shot` | ["game_power/shot"] | ["Power Use"] | 26 |
| `power_use_per_min` | ["game_power/min"] | ["Power Use"] | 3 |
| `power_use_per_s` | ["game_power/s"] | ["Power Use","Power Use per second"] | 62 |
| `processing_time_s` | ["s/output_cycle"] | ["Processing Time","instant craft"] | 13 |
| `production_rate_per_s` | ["output_items/s"] | ["Production Rate"] | 13 |
| `projectile_durability` | ["durability"] | ["Durability"] | 12 |
| `projectile_speed_m_per_s` | ["m/s"] | ["Speed","Speed: ∞"] | 19 |
| `projectile_speed_matches_normal` | ["boolean"] | ["no projectile speed advantage compared to non-overclocked"] | 1 |
| `purchase_price_modifier` | ["ratio"] | ["Purchase Prices"] | 9 |
| `pursuit_ships` | ["ships"] | ["Wanted Pursuit Ships"] | 9 |
| `ramp_down_s` | ["s"] | ["Ramp-Down Time","Ramp-down (history 0.28.2)"] | 2 |
| `ramp_up_s` | ["s"] | ["Ramp-Up Time"] | 8 |
| `ramp_up_time` | ["s"] | ["Ramp-Up Time"] | 1 |
| `range_m` | ["m"] | ["Range"] | 33 |
| `refill_cooldown` | ["s"] | ["Ability Cooldown"] | 1 |
| `repair_cost_base_ratio_steel_coils` | ["ratio"] | ["repair cost (steel/coils only)"] | 1 |
| `repair_cost_hp_scaling_formula` | ["formula"] | ["Repair cost vs damage"] | 1 |
| `reputation_threshold` | ["reputation"] | ["Reputation"] | 9 |
| `required_blueprints` | ["record_id[]"] | ["Required Blueprint"] | 13 |
| `resource_capacity` | ["item[]"] | ["Resource Capacity"] | 13 |
| `resource_drop_multiplier` | ["ratio"] | ["Resource Drop Rates"] | 4 |
| `resource_sell_buy_ratio` | ["ratio"] | ["Resource Sell Price"] | 4 |
| `reverse_speed_multiplier` | ["ratio"] | ["Crew Speed (Reverse)"] | 1 |
| `salvo_size` | ["mines/salvo","shots/salvo"] | ["Salvo","four-shot burst"] | 2 |
| `scorched_damage_threshold` | ["unverified native unit"] | ["scorched_damage_threshold"] | 1 |
| `scorched_disables_part` | ["boolean"] | ["scorched"] | 1 |
| `scorched_multiplier` | ["ratio"] | ["scorched_multiplier"] | 1 |
| `sensor_radar_m` | ["m"] | ["Sensor Range (Radar)"] | 4 |
| `sensor_visual_m` | ["m"] | ["Sensor Range (Visual)"] | 4 |
| `shield_arc` | ["degree"] | ["Shield Arc"] | 5 |
| `shield_damage_total` | ["damage total"] | ["Damage vs Shields (total)"] | 1 |
| `shield_distance` | ["m"] | ["Shield Distance"] | 5 |
| `shield_penetration` | ["meters equivalent"] | ["Shield Penetration"] | 1 |
| `shield_penetration_resist` | ["m"] | ["Shield Penetration Resist"] | 5 |
| `shield_strength` | ["shield strength"] | ["Shield Strength"] | 5 |
| `shots_per_second` | ["shots/s"] | ["Rate of Fire"] | 29 |
| `shrapnel_count` | ["shrapnel/mine","shrapnel/shot"] | ["Shrapnel","Shrapnel count"] | 2 |
| `shrapnel_damage` | ["damage/shrapnel"] | ["Damage: Shrapnel"] | 1 |
| `shrapnel_fire_chance` | ["% chance/tile"] | ["Starts Fires: Shrapnel"] | 1 |
| `shrapnel_interceptable` | ["boolean"] | ["shrapnel can be targeted and shot down"] | 1 |
| `shrapnel_penetration` | ["m"] | ["Penetration: Shrapnel"] | 1 |
| `shrapnel_range` | ["m"] | ["Range: Shrapnel"] | 1 |
| `size` | ["m"] | ["Size"] | 49 |
| `starting_budget_credits` | ["credits"] | ["Starting Budget"] | 4 |
| `steel_per_tile` | ["items/tile"] | ["Resources per tile"] | 5 |
| `storable_in_storage_bay` | ["boolean"] | ["Storage Bay acceptance"] | 22 |
| `storage_stack_size` | ["items/storage_tile"] | ["Storage Stack Size"] | 22 |
| `stored_munition_explosion_requires_scorched` | ["boolean"] | ["explode when storage becomes scorched"] | 1 |
| `stretch_range_m` | ["m"] | ["Stretch Range"] | 1 |
| `thrust_kn` | ["kN"] | ["Thrust"] | 8 |
| `tractor_force_kn` | ["kN"] | ["Tractor Force"] | 1 |
| `turret_speed_deg_per_s` | ["degree/s"] | ["Turret Speed"] | 6 |
| `unlimited_build_budget` | ["boolean"] | ["unlimited"] | 4 |
| `value_credits` | ["credits"] | ["Value"] | 100 |
| `value_credits_per_tile` | ["credits/tile"] | ["Value per tile"] | 5 |
| `walkway_forward_multiplier` | ["ratio"] | ["walkway_forward_multiplier"] | 1 |
| `walkway_reverse_multiplier` | ["ratio"] | ["walkway_reverse_multiplier"] | 1 |
| `walkway_side_multiplier` | ["ratio"] | ["walkway_side_multiplier"] | 1 |
| `wanted_duration_modifier` | ["ratio"] | ["Wanted Duration"] | 9 |
| `waste_heat_multiplier` | ["ratio"] | ["additional waste heat"] | 1 |
| `width_m` | ["m"] | ["Size","Size width"] | 97 |
