# 필드 사전

단위는 원문의 게임 단위를 보존한다. `game_power`는 W가 아니며, 질량 tonne·거리 m를 STARFORGE의 임의 단위로 자동 치환하지 않는다.

| 키 | 단위 | 원문 표제 | 사용 수 |
| --- | --- | --- | ---: |
| `abandon_ship_cancels_in_progress_trades` | ["boolean"] | ["abandoning ... in-progress resource trades"] | 1 |
| `absorption_radius` | ["m"] | ["absorption radius"] | 1 |
| `absorption_target` | ["enum"] | ["takes heat from tiles"] | 1 |
| `accept_via_trade_station_hail` | ["boolean"] | ["hail a trade station"] | 1 |
| `across_speed_multiplier` | ["ratio"] | ["Crew Speed (Across)"] | 1 |
| `actual_batch_size` | ["output_items/cycle"] | ["Actual batch size","one part at a time"] | 13 |
| `added_lance_heat_per_second` | ["MJ/sec (added to Lance)"] | ["Heat Generation"] | 2 |
| `adjacent_factory_speed_bonus` | ["ratio/adjacent_factory"] | ["Adjacent Factory Bonus"] | 13 |
| `adjacent_power_use_multiplier` | ["ratio"] | ["Power-use Buff"] | 1 |
| `adjacent_thrust_multiplier` | ["ratio"] | ["Thruster Buff"] | 1 |
| `allows_crew_passage` | ["boolean"] | ["crew passage between rooms"] | 1 |
| `allows_fire_spread` | ["boolean"] | ["fire passes through doors"] | 1 |
| `ammo_capacity` | ["ammo","assembled munitions"] | ["Ammo Capacity"] | 8 |
| `ammo_per_second` | ["ammo/sec"] | ["Ammo Use"] | 2 |
| `ammo_per_shot` | ["ammo/shot"] | ["Ammo Use"] | 25 |
| `amplification_by_active_lances` | ["% bonus"] | ["Thermal Amplification by Active Lances"] | 1 |
| `angular_material_depth_formula` | ["formula"] | ["angular traversal and material depth"] | 1 |
| `arc_origin_anchor` | ["local_coordinate"] | ["generator-relative arc origin"] | 1 |
| `area_damage_resistance` | ["%"] | ["Area Damage Resist"] | 6 |
| `area_radius` | ["meters radius"] | ["Damage Area"] | 4 |
| `armor_can_reduce_explosive_damage` | ["boolean"] | ["Explosive damage reduced and absorbed by armor"] | 1 |
| `assembly_parts` | ["EMP Missile Parts/missile","HE Missile Parts/missile","Nuclear Missile Parts/missile","Thermal Canister Missile Parts/missile"] | ["Assembled From"] | 4 |
| `asteroid_damage_per_s` | ["HP/s"] | ["Damage vs Asteroids"] | 1 |
| `auto_fill_from_lower_priority_roles_available` | ["boolean"] | ["Auto-Fill From Lower Priority Roles"] | 1 |
| `automatic_door_addition_is_configurable` | ["boolean"] | ["Automatically Add Doors"] | 1 |
| `automatic_door_repair_is_configurable` | ["boolean"] | ["Automatically Repair Doors"] | 1 |
| `automatic_factory_to_storage_when_designated_space_or_below_limit` | ["boolean"] | ["factory output delivery"] | 1 |
| `automatically_connects_nearby_pipes` | ["boolean"] | ["does not automatically connect"] | 1 |
| `barrier_shape` | ["enum"] | ["arc-shaped energy barriers"] | 1 |
| `base_hire_cost_credits` | ["credits/crew"] | ["Base hire price"] | 1 |
| `base_price_credits` | ["credits/item"] | ["Base Buy Price"] | 22 |
| `base_seconds` | ["s"] | ["base ramp-up"] | 1 |
| `base_walk_speed` | ["tiles/s"] | ["base_walk_speed"] | 1 |
| `battery_charge_s` | ["s"] | ["Battery Charge Time"] | 3 |
| `battery_size` | ["game_power/battery"] | ["Battery Size"] | 4 |
| `beam_count_max` | ["count"] | ["Maximum beams"] | 1 |
| `beam_structure_penetration_global_prohibition` | ["boolean"] | ["beams"] | 1 |
| `beams_per_crew` | ["count/crew"] | ["Beams per crew"] | 1 |
| `bespoke_explosion_removed_part_ids` | ["record_id[]"] | ["bespoke explosions"] | 1 |
| `blueprint_cost_credits` | ["credits"] | ["Blueprint Cost"] | 66 |
| `blueprint_mode_requires_only_final_result_legal` | ["boolean"] | ["Blueprint build mode"] | 1 |
| `blueprint_requires` | ["record_id[]"] | ["Required Blueprint"] | 4 |
| `boost_passive_drain_per_s` | ["game_power/s"] | ["Power Use (Boost ON, passive)"] | 1 |
| `boost_power_use_per_s` | ["game_power/s"] | ["Power Use (Boost ON, 100% thrust)"] | 1 |
| `boost_ramp_up_s` | ["s"] | ["Ramp-Up Time (Boost ON)"] | 1 |
| `boost_thrust_kn` | ["kN"] | ["Thrust (Boost ON)"] | 2 |
| `breaking_surrender_truce_can_reduce_fame` | ["boolean"] | ["lose fame"] | 1 |
| `buff_formula` | ["% bonus; X = accelerator count","formula"] | ["Railgun Buff","length"] | 2 |
| `buy_limited_by_station_stock` | ["boolean"] | ["stock limits"] | 1 |
| `canceled_prepurchase_releases_availability` | ["boolean"] | ["pre-purchase canceled due to flying away"] | 1 |
| `carrier_destroyed_triggers_detonation` | ["boolean"] | ["destroyed"] | 1 |
| `carrier_scorched_triggers_detonation` | ["boolean"] | ["scorched"] | 1 |
| `carrying_speed_multiplier` | ["ratio"] | ["carrying_speed_multiplier"] | 1 |
| `charge_up_base` | ["s"] | ["charge-up base"] | 1 |
| `charge_up_per_accelerator` | ["seconds/accelerator"] | ["charge-up per accelerator"] | 1 |
| `choices` | ["setting[]"] | ["Crew/Fame Ratio"] | 1 |
| `claim_location` | ["claim_location"] | ["claim at newly explored station"] | 1 |
| `closed_shell_damage_resistance` | ["%"] | ["Shell Damage Resist"] | 1 |
| `closed_shell_thermal_resistance` | ["%"] | ["thermal damage resistance when closed"] | 1 |
| `cloud_duration` | ["s"] | ["lifetime"] | 1 |
| `cloud_hp` | ["HP"] | ["health"] | 1 |
| `collapsed_reactivation_requires_full_reserve` | ["boolean"] | ["cannot turn back on until reserve is full"] | 1 |
| `combine_falloff` | ["%/beam"] | ["Combine Falloff"] | 1 |
| `command_points` | ["command_point"] | ["Command Points","Command Points (signed)"] | 38 |
| `command_points_used` | ["command_points"] | ["Command Points"] | 13 |
| `completion_action` | ["objective"] | ["Contact station","Rescue station"] | 2 |
| `congestion_floor` | ["ratio"] | ["congestion_floor"] | 1 |
| `congestion_multiplier` | ["ratio"] | ["congestion_multiplier"] | 1 |
| `connected_parts_share_network_heat` | ["boolean"] | ["same heat pipe system"] | 1 |
| `connections_use_explicit_part_ports` | ["boolean"] | ["specific connection locations"] | 1 |
| `construction_resources` | ["item","item[]"] | ["Resources"] | 100 |
| `continuing_resistance_on_unwalled_transition` | ["boolean"] | ["ContinuingPenetrationResistance"] | 1 |
| `converts_larger_input_packets_to_single_capacity` | ["boolean"] | ["larger batteries converted to single batteries"] | 1 |
| `corridor_multiplier` | ["ratio"] | ["corridor_multiplier"] | 1 |
| `crew_beds` | ["crew"] | ["Crew Beds"] | 3 |
| `crew_cap_increases_by_level` | ["boolean"] | ["crew limit in batches"] | 1 |
| `crew_consolidate_undesignated_stacks` | ["boolean"] | ["consolidate resource stacks"] | 1 |
| `crew_construction_builds_piece_by_piece` | ["boolean"] | ["Crew construction"] | 1 |
| `crew_crossing_requires_doors` | ["boolean"] | ["Doors must be built"] | 1 |
| `crew_fame_setting` | ["setting"] | ["Crew/Fame Ratio"] | 19 |
| `crew_limit` | ["crew"] | ["Maximum Crew"] | 19 |
| `crew_required` | ["crew"] | ["Crew Required","automated; no operating crew"] | 24 |
| `crew_required_max` | ["crew"] | ["Crew Required maximum"] | 1 |
| `crew_required_min` | ["crew"] | ["Crew Required minimum"] | 1 |
| `crew_speed` | ["%"] | ["Crew Speed"] | 1 |
| `crew_speed_multiplier` | ["ratio"] | ["Crew Speed"] | 43 |
| `crew_stun_radius` | ["m"] | ["Crew Stun Radius"] | 2 |
| `crew_stun_time` | ["s"] | ["Crew Stun Time"] | 2 |
| `damage_overflow_after_collapse` | ["enum"] | ["same-hit shield overflow policy"] | 1 |
| `damage_per_s` | ["HP/s"] | ["Damage"] | 1 |
| `damage_per_second` | ["damage/sec"] | ["Damage"] | 2 |
| `damage_per_second_far` | ["damage/sec"] | ["Damage (Far)"] | 1 |
| `damage_per_second_near` | ["damage/sec"] | ["Damage (Near)"] | 1 |
| `damage_per_shot` | ["damage/shot"] | ["Damage"] | 30 |
| `damage_retained_at_max_range` | ["%"] | ["damage at max range"] | 1 |
| `damage_retained_per_structure_tile` | ["%"] | ["damage retained per structure tile"] | 1 |
| `damage_type_parameter_exists` | ["boolean"] | ["DamageType"] | 1 |
| `damage_vs_shields_per_shot` | ["damage/shot"] | ["Damage vs Shields"] | 2 |
| `damage_vs_shots_per_shot` | ["damage/shot"] | ["Damage vs Shots"] | 2 |
| `damage_vs_structure` | ["damage (event unit unspecified)"] | ["damage vs structure"] | 1 |
| `damaged_network_split_energy_assignment` | ["algorithm"] | ["network split energy attribution"] | 1 |
| `default_operate_priority` | ["priority"] | ["default operate priority"] | 1 |
| `default_supply_battery_priority` | ["priority"] | ["default supply battery priority"] | 1 |
| `desired_used_for_trade_and_transfer` | ["boolean"] | ["excess or needed resources"] | 1 |
| `destroyed_station_cannot_retain_resource_claim` | ["boolean"] | ["retain a claim to nearby resources"] | 1 |
| `detonation_range` | ["m"] | ["Detonation Range"] | 1 |
| `dilation_by_active_lances` | ["% bonus"] | ["Lance Dilation by Active Lances"] | 1 |
| `dissipation_obstruction_formula` | ["formula"] | ["dissipation versus obstruction"] | 1 |
| `distance_tie_break` | ["enum"] | ["equal-distance ordering"] | 1 |
| `documented_damage_allocation_order` | ["enum"] | ["nearest epicenter first"] | 1 |
| `documented_exclusion_fields` | ["field_name[]"] | ["documented_exclusion_fields"] | 1 |
| `documented_exclusion_layers` | ["enum[]"] | ["documented_exclusion_layers"] | 1 |
| `documented_task_families` | ["enum[]"] | ["crew activities"] | 1 |
| `door_coordinate_origin` | ["enum"] | ["door_coordinate_origin"] | 1 |
| `door_location_field` | ["field_name"] | ["door_location_field"] | 1 |
| `door_locations_can_address_adjacent_outside_cells` | ["boolean"] | ["door_locations_can_address_adjacent_outside_cells"] | 1 |
| `door_permission_is_separate_from_physical_adjacency` | ["boolean"] | ["AllowedDoorLocations / door access"] | 1 |
| `door_placement_constraint` | ["placement_rule"] | ["A single door may be added at each end."] | 1 |
| `doors_allowed_beside_all_storage_tiles` | ["boolean"] | ["doors next to all storage tiles"] | 3 |
| `dropped_stack_size` | ["items/world_pile"] | ["Dropped Stack Size"] | 22 |
| `dynamo_enabled` | ["boolean"] | ["dynamo"] | 1 |
| `emp_resist_scope` | ["enum"] | ["EMP resist over whole piece"] | 1 |
| `emp_resistance` | ["power drain"] | ["E.M.P. Resist"] | 6 |
| `enclosed_room_boundary_requires_legal_door` | ["boolean"] | ["door access between rooms"] | 1 |
| `enemy_damage_multiplier` | ["ratio"] | ["Enemy damage"] | 5 |
| `equal_input_first_five_weights` | ["%"] | ["1st–5th Beam"] | 1 |
| `equal_task_capability` | ["boolean"] | ["equal_task_capability"] | 1 |
| `eva_oxygen_duration_s` | ["s"] | ["EVA oxygen duration"] | 1 |
| `eva_speed_m_per_s` | ["m/s"] | ["EVA flight speed"] | 1 |
| `exact_budget_distribution_formula` | ["formula"] | ["per-proxy allocation"] | 1 |
| `exact_trade_rounding` | ["formula"] | ["Trade price rounding"] | 1 |
| `exchanger_adds_waste_during_transfer` | ["boolean"] | ["additional waste heat"] | 1 |
| `exhaust_heats_friendly_ships` | ["boolean"] | ["friendly ships"] | 1 |
| `exhaust_heats_other_ship_shields` | ["boolean"] | ["shields"] | 1 |
| `explicit_supply_chain_excludes_unlinked_destinations` | ["boolean"] | ["linked parts do not send to unlinked parts"] | 1 |
| `explodes_on_destruction` | ["boolean"] | ["does not explode upon destruction"] | 1 |
| `explosion_started_fire_strength` | ["%"] | ["random initial fire strength"] | 1 |
| `extenders_2_to_7_seconds_each` | ["s/module"] | ["2nd to 7th extender"] | 1 |
| `extenders_8_plus_seconds_each` | ["s/module"] | ["8th and later extender"] | 1 |
| `extinguish_capacity` | ["not_specified"] | ["extinguisher capacity"] | 1 |
| `faction_count_covered_by_patch` | ["factions"] | ["all four factions"] | 1 |
| `factory_id` | ["record_id"] | ["Factory"] | 13 |
| `factory_output_can_use_undesignated_storage` | ["boolean"] | ["empty factories into non-designated resource storage tiles"] | 1 |
| `fame_reward_multiplier` | ["ratio"] | ["Fame Rewards"] | 4 |
| `fame_threshold` | ["fame"] | ["Fame"] | 19 |
| `fire_chance_per_tile` | ["% chance/tile"] | ["Starts Fires"] | 4 |
| `fire_damage_per_second` | ["damage/sec"] | ["fire_damage_per_second"] | 1 |
| `fire_damage_random_detonation` | ["boolean"] | ["random chance"] | 1 |
| `fire_floor` | ["ratio"] | ["fire_floor"] | 1 |
| `fire_multiplier` | ["ratio"] | ["fire_multiplier"] | 1 |
| `fire_overrides_congestion` | ["boolean"] | ["fire_overrides_congestion"] | 1 |
| `fire_probability_can_scale_with_damage` | ["boolean"] | ["FireChancePerNDamage"] | 1 |
| `fire_spread_probability` | ["probability"] | ["fire_spread_probability"] | 1 |
| `firing_arc_deg` | ["degree"] | ["Firing Arc"] | 31 |
| `firing_interval_s` | ["s"] | ["launch cooldown","launch cooldown / firing interval"] | 29 |
| `first_extender_seconds` | ["s"] | ["1st extender"] | 1 |
| `first_hit_retention_composition` | ["formula"] | ["50%"] | 1 |
| `first_structure_tile_damage_reduction` | ["%"] | ["damage reduction at first structure tile"] | 1 |
| `foam_duration` | ["s"] | ["anti-fire foam duration","foam_duration"] | 2 |
| `forward_speed_multiplier` | ["ratio"] | ["Crew Speed (Forward)"] | 1 |
| `front_obstruction_reduces_dissipation` | ["boolean"] | ["less effective if objects in front"] | 1 |
| `hate_salvaging_mission_credit_multiplier` | ["ratio"] | ["I Hate Salvaging"] | 1 |
| `heat_application_requires_contiguous_path` | ["boolean"] | ["contiguous path between parts"] | 1 |
| `heat_applied_per_missile` | ["MJ/missile"] | ["applied heat per missile"] | 1 |
| `heat_applied_per_second` | ["MJ/s"] | ["applied heat"] | 1 |
| `heat_capacity` | ["MJ"] | ["Heat Capacity"] | 8 |
| `heat_damage_amplification_formula` | ["formula"] | ["heat_damage_amplification_formula"] | 1 |
| `heat_damage_resistance_debuff_base_pct` | ["%"] | ["debuff"] | 1 |
| `heat_damage_resistance_debuff_exponent` | ["dimensionless"] | ["exponent"] | 1 |
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
| `hidden_when_station_cannot_store_requested_goods` | ["boolean"] | ["Delivery missions ... not enough space"] | 1 |
| `higher_hiring_priority_filled_first` | ["boolean"] | ["higher Hiring Priorities first"] | 1 |
| `hire_cost_decreases_with_fame` | ["boolean"] | ["hire_cost_decreases_with_fame"] | 1 |
| `hire_cost_formula` | ["formula"] | ["Hire cost formula"] | 1 |
| `hire_cost_increases_with_crew` | ["boolean"] | ["hire_cost_increases_with_crew"] | 1 |
| `hiring_is_fame_limited` | ["boolean"] | ["hiring_is_fame_limited"] | 1 |
| `hiring_priority_range` | ["priority[]"] | ["Hiring Priority range"] | 1 |
| `hiring_requires_free_beds` | ["boolean"] | ["hiring_requires_free_beds"] | 1 |
| `historical_display_name` | ["display_name"] | ["Delivery"] | 1 |
| `hit_depletes_generator_power` | ["boolean"] | ["protective arc hit depletes power"] | 1 |
| `hit_filter_parameter_exists` | ["boolean"] | ["Filter"] | 1 |
| `hit_penetrating_finished_are_distinct_events` | ["boolean"] | ["Hit / Penetrating / FinishedPenetrating"] | 1 |
| `hitbox_classes` | ["enum[]"] | ["hitbox types"] | 1 |
| `hp` | ["HP"] | ["Hit Points"] | 99 |
| `hp_per_tile` | ["HP/tile"] | ["Hit Points per tile"] | 5 |
| `hull_heat_decay_per_second` | ["unverified native heat unit/sec"] | ["hull_heat_decay_per_second"] | 1 |
| `hull_heat_ignition_threshold` | ["unverified native heat unit"] | ["hull_heat_ignition_threshold"] | 1 |
| `hyperium_capacity` | ["item"] | ["Hyperium Capacity"] | 3 |
| `hyperjump_fully_drains_reserve` | ["boolean"] | ["Fully depleted on Hyperdrive Jump"] | 1 |
| `independent_shield_hp_regeneration` | ["boolean"] | ["independent shield HP regeneration"] | 1 |
| `initial_resistance_on_walled_entry` | ["boolean"] | ["InitialPenetrationResistance"] | 1 |
| `input_rates_per_s` | ["item[]/s"] | ["Resource Use per second"] | 13 |
| `inputs` | ["item[]/ratio"] | ["Inputs"] | 13 |
| `instant_processing` | ["boolean"] | ["instant craft"] | 1 |
| `interceptable` | ["boolean"] | ["shrapnel can be targeted and shot down"] | 1 |
| `is_walled` | ["boolean"] | ["IsWalled"] | 2 |
| `junk_armor_damage_per_s` | ["HP/s"] | ["Damage vs Junk (Armor)"] | 1 |
| `junk_damage_per_s` | ["HP/s"] | ["Damage vs Junk"] | 1 |
| `launcher_partial_missile_counts` | ["boolean"] | ["partially constructed"] | 1 |
| `launcher_scaling_counts_completed_missiles_only` | ["boolean"] | ["fully-constructed missiles"] | 1 |
| `length_buff_exponent` | ["dimensionless"] | ["exponent"] | 1 |
| `life_span` | ["minutes"] | ["Life Span"] | 1 |
| `lightning_damage_vs_parts_parameter` | ["damage (event unit unspecified)"] | ["damage vs parts"] | 1 |
| `lightning_damage_vs_shields_parameter` | ["damage (event unit unspecified)"] | ["damage vs shields"] | 1 |
| `limit_scope` | ["operation[]"] | ["resource limit applies to"] | 1 |
| `lingering_shrapnel_cloud` | ["boolean"] | ["lingering shrapnel"] | 1 |
| `magazines_for_maximum_rate` | ["magazines"] | ["minimum magazines for 30 shots/sec"] | 1 |
| `mass_t` | ["tonne"] | ["Mass"] | 83 |
| `mass_t_per_item` | ["tonne/item"] | ["resource unit mass"] | 22 |
| `mass_t_per_tile` | ["tonne/tile"] | ["Mass per tile"] | 5 |
| `max_damage_per_shot` | ["damage/shot"] | ["Max Damage"] | 2 |
| `max_fuel_pods_per_segment` | ["count"] | ["Fuel pods per Nozzle or Extender"] | 2 |
| `max_range` | ["m"] | ["Range (Max)"] | 2 |
| `maximum_doors` | ["door","doors"] | ["Both can be used simultaneously","Only 1 door is permitted"] | 2 |
| `maximum_fame` | ["fame"] | ["LEGENDARY"] | 1 |
| `maximum_fame_allows_unlimited_hiring` | ["boolean"] | ["maximum fame (10000) ... hire unlimited crew"] | 1 |
| `maximum_firing_arc` | ["degree"] | ["maximum firing arc"] | 1 |
| `maximum_hull_heat_absorption` | ["MJ/s"] | ["maximum heat absorbed"] | 1 |
| `maximum_level` | ["mission_level"] | ["mission level range"] | 1 |
| `maximum_roles_per_ship` | ["crew_roles/ship"] | ["maximum number of crew roles"] | 1 |
| `minimum_damage_retained` | ["%"] | ["minimum damage retained"] | 1 |
| `minimum_efficiency_radius_m` | ["m"] | ["Efficiency: Minimum"] | 3 |
| `minimum_level` | ["mission_level"] | ["mission level range"] | 1 |
| `mission_reward_modifier` | ["ratio"] | ["Mission Credit Rewards"] | 9 |
| `mode_available` | ["boolean"] | ["overclock mode"] | 3 |
| `money_reward_multiplier` | ["ratio"] | ["Money Rewards"] | 4 |
| `network_and_hull_heat_are_distinct` | ["boolean"] | ["stored thermal energy and hull tile heat"] | 1 |
| `network_heat_passes_through` | ["boolean"] | ["Heat passes through radiators"] | 1 |
| `network_overflow_to_hull_formula` | ["formula"] | ["network excess to hull heat"] | 1 |
| `network_storage_distribution_formula` | ["formula"] | ["distribution over connected storage"] | 1 |
| `numeric_multipliers` | ["ratio[]"] | ["Crew/Fame multipliers"] | 1 |
| `objective` | ["objective"] | ["Uncover the ? scattered across the system"] | 1 |
| `occlusion_reduces_effective_arc` | ["boolean"] | ["decrease the shield arc size"] | 1 |
| `omitted_door_locations_default` | ["enum"] | ["omitted_door_locations_default"] | 1 |
| `one_resource_type_per_storage_tile` | ["boolean"] | ["one resource type per tile"] | 1 |
| `operating_crew_required` | ["crew"] | ["Crew Required"] | 26 |
| `operation_and_supply_priorities_are_separate` | ["boolean"] | ["operate / supply battery"] | 1 |
| `optimal_efficiency_radius_m` | ["m"] | ["Efficiency: Optimal"] | 3 |
| `orthogonal_only` | ["boolean"] | ["orthogonal_only"] | 1 |
| `other_room_multiplier` | ["ratio"] | ["other_room_multiplier"] | 1 |
| `outbound_power_requires_crew_delivery` | ["boolean"] | ["crew delivery to nearby parts"] | 1 |
| `outgoing_transfer_prefers_lower_hiring_priority` | ["boolean"] | ["lowest Hiring Priority transferred first"] | 1 |
| `outputs` | ["item[]/ratio"] | ["Result"] | 13 |
| `overlapping_arc_hit_order` | ["enum"] | ["overlap tie-break policy"] | 1 |
| `packet_sizes` | ["game_power/battery"] | ["Battery Size"] | 1 |
| `part_exists` | ["boolean"] | ["Exterior (structure) Pipes"] | 1 |
| `part_value_equals_construction_resource_value` | ["boolean"] | ["Part credit value"] | 1 |
| `partial_damage_reduces_penetration_resistance` | ["boolean"] | ["full resistance until destroyed"] | 1 |
| `partial_part_coverage_leaves_fire_risk` | ["boolean"] | ["encompass the entire part"] | 1 |
| `partial_stack_rounding` | ["enum"] | ["full stacks"] | 1 |
| `patch_display_name_as_written` | ["display_name"] | ["Procument"] | 1 |
| `pathfinding_can_prefer_return_route_over_reverse` | ["boolean"] | ["return route preference"] | 1 |
| `penetration` | ["m"] | ["Penetration","Penetration: ∞ meters (max 10,200 damage)","Penetration: ∞ meters (max 20,000 damage)"] | 9 |
| `penetration_resist` | ["m"] | ["Penetration Resist"] | 7 |
| `penetration_resist_scope` | ["enum"] | ["penetration resistance per tile"] | 1 |
| `penetration_resistance_excludes_tile_depth` | ["boolean"] | ["resistance does not include tile size"] | 1 |
| `per_stack_damage_and_radius` | ["map"] | ["explosive resource payload"] | 1 |
| `player_built_destroyed_drop_ignores_difficulty` | ["boolean"] | ["unaffected by economic difficulty"] | 1 |
| `player_built_destroyed_resource_drop_ratio` | ["ratio"] | ["destroyed player-constructed parts"] | 1 |
| `player_damage_multiplier` | ["ratio"] | ["Damage dealt to enemies"] | 5 |
| `player_sources_requested_resources` | ["boolean"] | ["gather desired resources from wherever"] | 1 |
| `ports_always_equal_door_locations` | ["boolean"] | ["most but not all door locations"] | 1 |
| `positive_coordinate_axes` | ["enum[]"] | ["positive_coordinate_axes"] | 1 |
| `power_capacity` | ["game_power"] | ["Power Capacity","capacity"] | 52 |
| `power_depleted_station_operator_may_fetch_battery` | ["boolean"] | ["operator may leave depleted station to fetch power"] | 1 |
| `power_drain_per_hit` | ["game_power/shot"] | ["Power Drain On Hit"] | 2 |
| `power_drain_radius` | ["meters radius"] | ["Power Drain Area"] | 1 |
| `power_drain_total` | ["power total"] | ["Power Drain On Hit (total)"] | 1 |
| `power_generation_per_s` | ["game_power/s"] | ["Power Generation"] | 7 |
| `power_generation_while_thrusting_per_s` | ["game_power/s"] | ["Power generation while actively thrusting"] | 3 |
| `power_per_1000_damage` | ["game_power/1000_damage"] | ["Per 1000 Damage Taken"] | 2 |
| `power_per_active_lance_per_second` | ["power/Lance/sec"] | ["Power Use"] | 1 |
| `power_per_full_missile` | ["game_power/assembled_missile"] | ["power usage per full missile"] | 1 |
| `power_per_output` | ["game_power/item"] | ["Power Use","Power per crafted item"] | 2 |
| `power_per_second_by_active_lances` | ["game_power/s"] | ["Power Use by Active Lances"] | 1 |
| `power_per_shot` | ["game_power/shot"] | ["Power Use"] | 26 |
| `power_to_strength_formula` | ["formula"] | ["power reserve to displayed shield strength"] | 1 |
| `power_use_per_min` | ["game_power/min"] | ["Power Use"] | 3 |
| `power_use_per_s` | ["game_power/s"] | ["Power Use","Power Use per second"] | 62 |
| `prefer_storage_before_factory` | ["boolean"] | ["prefer to fill storages before filling factories"] | 1 |
| `processing_time_s` | ["s/output_cycle"] | ["Processing Time","instant craft"] | 13 |
| `production_rate_per_s` | ["output_items/s"] | ["Production Rate"] | 13 |
| `production_target_rule` | ["rule"] | ["factories permission to produce up to"] | 1 |
| `projectile_and_eva_hits_depend_on_shot_definition` | ["boolean"] | ["specified in shot definition"] | 1 |
| `projectile_durability` | ["durability"] | ["Durability"] | 12 |
| `projectile_speed_m_per_s` | ["m/s"] | ["Speed","Speed: ∞"] | 19 |
| `projectile_speed_matches_normal` | ["boolean"] | ["no projectile speed advantage compared to non-overclocked"] | 1 |
| `projection_through_nonstructure_hull` | ["boolean"] | ["cannot be projected through non-structure ship mass"] | 1 |
| `projection_through_own_hull` | ["boolean"] | ["shield can be projected through the ship itself"] | 1 |
| `purchase_price_modifier` | ["ratio"] | ["Purchase Prices"] | 9 |
| `pursuit_ships` | ["ships"] | ["Wanted Pursuit Ships"] | 9 |
| `ramp_down_s` | ["s"] | ["Ramp-Down Time","Ramp-down (history 0.28.2)"] | 2 |
| `ramp_up_s` | ["s"] | ["Ramp-Up Time"] | 8 |
| `ramp_up_time` | ["s"] | ["Ramp-Up Time"] | 1 |
| `range_m` | ["m"] | ["Range"] | 33 |
| `reentering_system_must_not_restore_salvaged_wreckage` | ["boolean"] | ["wreckage magically repaired after salvaging"] | 1 |
| `refill_cooldown` | ["s"] | ["Ability Cooldown"] | 1 |
| `repair_all_allows_partial_resources` | ["boolean"] | ["repair as much as possible"] | 1 |
| `repair_cost_base_ratio_steel_coils` | ["ratio"] | ["repair cost (steel/coils only)"] | 1 |
| `repair_cost_hp_scaling_formula` | ["formula"] | ["Repair cost vs damage"] | 1 |
| `repair_resource_rounding` | ["rounding_rule"] | ["resources needed to repair a damaged part now rounds up"] | 1 |
| `reputation_threshold` | ["reputation"] | ["Reputation"] | 9 |
| `required_blueprints` | ["record_id[]"] | ["Required Blueprint"] | 13 |
| `required_percentage_increases_after_completion` | ["boolean"] | ["percentage increases every completion"] | 1 |
| `resource_capacity` | ["item[]"] | ["Resource Capacity"] | 13 |
| `resource_designation_supported` | ["boolean"] | ["designate a resource"] | 1 |
| `resource_drop_multiplier` | ["ratio"] | ["Resource Drop Rates"] | 4 |
| `resource_sell_buy_ratio` | ["ratio"] | ["Resource Sell Price"] | 4 |
| `restart_delay_s` | ["s"] | ["restart delay beyond reserve requirement"] | 1 |
| `resupply_fetches_whole_battery_packet` | ["boolean"] | ["whole battery request"] | 1 |
| `reverse_speed_multiplier` | ["ratio"] | ["Crew Speed (Reverse)"] | 1 |
| `reward_dimensions` | ["reward_dimension[]"] | ["Rewards"] | 5 |
| `salvo_size` | ["mines/salvo","shots/salvo"] | ["Salvo","four-shot burst"] | 2 |
| `same_part_destroyed_after_scorched_repeat_policy` | ["enum"] | ["repeat explosion after scorching"] | 1 |
| `scorched_damage_threshold` | ["unverified native unit"] | ["scorched_damage_threshold"] | 1 |
| `scorched_disables_part` | ["boolean"] | ["scorched"] | 1 |
| `scorched_multiplier` | ["ratio"] | ["scorched_multiplier"] | 1 |
| `sell_limited_by_station_storage` | ["boolean"] | ["can store"] | 1 |
| `sensor_radar_m` | ["m"] | ["Sensor Range (Radar)"] | 4 |
| `sensor_visual_m` | ["m"] | ["Sensor Range (Visual)"] | 4 |
| `separate_mission_board_per_station` | ["boolean"] | ["own mission board"] | 1 |
| `shield_arc` | ["degree"] | ["Shield Arc"] | 5 |
| `shield_damage_total` | ["damage total"] | ["Damage vs Shields (total)"] | 1 |
| `shield_distance` | ["m"] | ["Shield Distance"] | 5 |
| `shield_exhaust_collision_uses_arc` | ["boolean"] | ["full circles"] | 1 |
| `shield_penetration` | ["meters equivalent"] | ["Shield Penetration"] | 1 |
| `shield_penetration_resist` | ["m"] | ["Shield Penetration Resist"] | 5 |
| `shield_strength` | ["shield strength"] | ["Shield Strength","health"] | 5 |
| `shots_per_second` | ["shots/s"] | ["Rate of Fire"] | 29 |
| `shrapnel_count` | ["shrapnel/mine","shrapnel/shot"] | ["Shrapnel","Shrapnel count"] | 2 |
| `shrapnel_damage` | ["damage/shrapnel"] | ["Damage: Shrapnel"] | 1 |
| `shrapnel_fire_chance` | ["% chance/tile"] | ["Starts Fires: Shrapnel"] | 1 |
| `shrapnel_interceptable` | ["boolean"] | ["shrapnel can be targeted and shot down"] | 1 |
| `shrapnel_penetration` | ["m"] | ["Penetration: Shrapnel"] | 1 |
| `shrapnel_range` | ["m"] | ["Range: Shrapnel"] | 1 |
| `size` | ["m"] | ["Size"] | 49 |
| `some_rewards_require_issuing_station` | ["boolean"] | ["collected at the station that issued"] | 1 |
| `source_selection_tendency` | ["enum"] | ["usually closest source"] | 1 |
| `starting_budget_credits` | ["credits"] | ["Starting Budget"] | 4 |
| `station_crew_refill_faster_than_trade_ships` | ["boolean"] | ["refill station crews faster"] | 1 |
| `steel_per_tile` | ["items/tile"] | ["Resources per tile"] | 5 |
| `storable_in_storage_bay` | ["boolean"] | ["Storage Bay acceptance"] | 22 |
| `storage_stack_size` | ["items/storage_tile"] | ["Storage Stack Size"] | 22 |
| `stored_munition_explosion_requires_scorched` | ["boolean"] | ["scorched"] | 1 |
| `stored_resource_scaling_basis` | ["enum"] | ["full stacks"] | 1 |
| `stranded_crew_count_towards_fame_cap` | ["boolean"] | ["stranded ... count against the fame crew limit"] | 1 |
| `stretch_range_m` | ["m"] | ["Stretch Range"] | 1 |
| `structure_blocks_projection` | ["boolean"] | ["excluding structure blocks"] | 1 |
| `taking_over_wreck_must_not_increase_salvage_yield` | ["boolean"] | ["take it over then deconstruct exploit fixed"] | 1 |
| `target_station_destroyed_fails_mission` | ["boolean"] | ["If station dies, mission failed"] | 1 |
| `thermal_port_coordinates_by_part` | ["map"] | ["part-specific connection coordinates"] | 1 |
| `thrust_kn` | ["kN"] | ["Thrust"] | 8 |
| `time_limit_uses_game_speed` | ["boolean"] | ["time influenced by game speed"] | 1 |
| `total_damage_is_shared_budget` | ["boolean"] | ["TotalDamage spread around"] | 1 |
| `tractor_force_kn` | ["kN"] | ["Tractor Force"] | 1 |
| `trade_and_hiring_supported` | ["boolean"] | ["trade and hire crew"] | 1 |
| `transfer_model` | ["enum"] | ["Instantaneously transfers thermal energy"] | 1 |
| `turret_speed_deg_per_s` | ["degree/s"] | ["Turret Speed","turret speed"] | 6 |
| `unlimited_build_budget` | ["boolean"] | ["unlimited"] | 4 |
| `unseen_cloud_resources_not_construction_available` | ["boolean"] | ["resources hidden in gas clouds"] | 1 |
| `unwalled_nonexternal_neighbors_allow_direct_access` | ["boolean"] | ["IsWalled=false neighbors"] | 1 |
| `value_credits` | ["credits"] | ["Value","cost"] | 100 |
| `value_credits_per_tile` | ["credits/tile"] | ["Value per tile"] | 5 |
| `walkway_forward_multiplier` | ["ratio"] | ["walkway_forward_multiplier"] | 1 |
| `walkway_reverse_multiplier` | ["ratio"] | ["walkway_reverse_multiplier"] | 1 |
| `walkway_side_multiplier` | ["ratio"] | ["walkway_side_multiplier"] | 1 |
| `wanted_duration_modifier` | ["ratio"] | ["Wanted Duration"] | 9 |
| `waste_heat_multiplier` | ["ratio"] | ["additional waste heat"] | 1 |
| `weapon_exception_list` | ["record_id[]"] | ["most"] | 1 |
| `width_m` | ["m"] | ["Size","Size width"] | 97 |
