class_name EnemyShip
extends ShipBody

signal npc_dialogue_requested(npc_id: int, contact_type: String)

const STATE_ROAMING := "roaming"
const STATE_ATTACK := "attack"
const STATE_DIALOGUE_REQUEST := "dialogue_request"
const STATE_QUEST := "quest"
const STATE_EXCLUSION := "exclusion"

var enemy_name := "RAIDER MK-1"
var ship_class_label := "INTERCEPTOR"
var level := 1
var boss := false
var target_ship: ShipBody
var ai_fire_timer := 0.0
var archetype := "roamer"
var ai_state := STATE_ROAMING
var contact_type := ""
var radar_range := 0.0
var weapon_range := 660.0
var contact_range := 560.0
var roam_anchor := Vector2.ZERO
var roam_target := Vector2.ZERO
var dialogue_request_sent := false
var exclusion_elapsed := 0.0
var ai_tick_elapsed := 0.0
var desired_forward := 0.0
var desired_reverse := 0.0
var desired_turn := 0.0

func setup(next_level: int, boss_name: String = "", next_archetype: String = "roamer") -> void:
	level = next_level
	boss = not boss_name.is_empty()
	archetype = "boss" if boss else next_archetype
	var profile: Dictionary = BalanceData.NPC_AI.archetypes.get(archetype, BalanceData.NPC_AI.archetypes.roamer)
	contact_type = str(profile.get("contact", ""))
	radar_range = float(profile.get("radar_range", 0.0))
	weapon_range = float(BalanceData.NPC_AI.weapon_range) + (140.0 if boss else 0.0)
	contact_range = float(BalanceData.NPC_AI.contact_range)
	ai_state = STATE_ROAMING
	roam_anchor = global_position
	pick_roam_target()
	model.parts.clear()
	var core := model.add("core", Vector2i.ZERO)
	core.hp = (160.0 + level * 38.0) if boss else (70.0 + level * 24.0)
	core.max_hp = core.hp

	if boss:
		ship_class_label = "DREADNOUGHT BOSS"
		enemy_name = boss_name
		model.add("plate4", Vector2i(1, 0))
		model.add("armor", Vector2i(0, -1))
		model.add("armor", Vector2i(0, 1))
		model.add("railgun", Vector2i(1, -1))
		model.add("railgun", Vector2i(1, 2))
		model.add("bullet_bay", Vector2i(-1, 0))
		model.add("laser", Vector2i(0, -2))
		model.add("laser", Vector2i(0, 2))
		model.add("shield_generator", Vector2i(2, -1))
		if level >= 7:
			model.add("shield_generator", Vector2i(2, 2))
		model.add("thruster", Vector2i(-1, -1))
		model.add("thruster", Vector2i(-1, 1))
		model.add("rcs_thruster", Vector2i(-1, -2))
		model.add("rcs_thruster", Vector2i(-1, 2))
	else:
		var variant := posmod(level + roundi(absf(global_position.x + global_position.y)), 3)
		if variant == 0:
			ship_class_label = "요격기"
			enemy_name = "VIPER MK-%d" % level
			model.add("wedge", Vector2i(1, 0))
			model.add("laser", Vector2i(0, -1))
			model.add("laser", Vector2i(0, 1))
			model.add("thruster", Vector2i(-1, -1))
			model.add("thruster", Vector2i(-1, 1))
			model.add("rcs_thruster", Vector2i(0, -2))
			model.add("rcs_thruster", Vector2i(0, 2))
		elif variant == 1:
			ship_class_label = "강습함"
			enemy_name = "BASTION MK-%d" % level
			model.add("armor", Vector2i(1, 0))
			model.add("armor", Vector2i(1, -1))
			model.add("armor", Vector2i(1, 1))
			model.add("machine_gun", Vector2i(2, -1))
			model.add("laser", Vector2i(2, 1))
			model.add("bullet_bay", Vector2i(0, -1))
			model.add("battery", Vector2i(0, 1))
			model.add("thruster", Vector2i(-1, -1))
			model.add("thruster", Vector2i(-1, 1))
			model.add("rcs_thruster", Vector2i(-1, 0))
			if level >= 3:
				model.add("shield_generator", Vector2i(2, 0))
		else:
			ship_class_label = "포격함"
			enemy_name = "LANCER MK-%d" % level
			model.add("armor", Vector2i(1, 0))
			if level >= 3:
				model.add("railgun", Vector2i(2, 0))
				model.add("bullet_bay", Vector2i(-1, 0))
			else:
				model.add("laser", Vector2i(2, 0))
			model.add("laser", Vector2i(0, -1))
			model.add("laser", Vector2i(0, 1))
			model.add("reverse_thruster", Vector2i(1, -1))
			model.add("reverse_thruster", Vector2i(1, 1))
			model.add("thruster", Vector2i(-1, -1))
			model.add("thruster", Vector2i(-1, 1))
			model.add("rcs_thruster", Vector2i(0, -2))
			model.add("rcs_thruster", Vector2i(0, 2))

	shield_layers = model.shield_capacity()
	refresh_mass()
	rebuild_exhaust_particles()
	rebuild_voxel_renderer()
	queue_redraw()

func _physics_process(delta: float) -> void:
	super._physics_process(delta)
	if is_destroying:
		desired_forward = 0.0
		desired_reverse = 0.0
		desired_turn = 0.0
		return
	if target_ship == null or not is_instance_valid(target_ship) or not alive():
		desired_forward = 0.0
		desired_reverse = 0.0
		desired_turn = 0.0
		return
	ai_fire_timer -= delta
	ai_tick_elapsed += delta
	if ai_tick_elapsed >= float(BalanceData.NPC_AI.state_tick_seconds):
		update_ai_state(ai_tick_elapsed)
		ai_tick_elapsed = 0.0
	var thrust_multiplier := float(BalanceData.NPC_AI.thrust_multiplier) * (1.15 if boss else 1.0)
	apply_player_thrusters(desired_forward * thrust_multiplier, desired_reverse * thrust_multiplier, desired_turn * thrust_multiplier)

func _draw() -> void:
	super._draw()
	if is_destroying or not alive():
		return
	var core := model.core_part()
	if core == null:
		return
	var ratio := clampf(core.hp / maxf(core.max_hp, 1.0), 0.0, 1.0)
	var offset_y := -(hull_bound_radius + 26.0)
	draw_set_transform(Vector2.ZERO, -global_rotation, Vector2.ONE)
	var bar_w := 96.0 if boss else 68.0
	var bar_rect := Rect2(Vector2(-bar_w * 0.5, offset_y + 6.0), Vector2(bar_w, 5.0 if boss else 4.0))
	draw_rect(bar_rect.grow(1.5), Color(0.03, 0.05, 0.10, 0.85), true)
	draw_rect(Rect2(bar_rect.position, Vector2(bar_w * ratio, bar_rect.size.y)), Color("ffd36e") if boss else (Color("ff6b7a") if is_attacking_player() else Color("7bc8ff")), true)
	if boss or is_attacking_player() or ratio < 0.99:
		var tag := "%s · %s" % [enemy_name, ship_class_label]
		draw_string(ThemeDB.fallback_font, Vector2(-100.0, offset_y + 1.0), tag, HORIZONTAL_ALIGNMENT_CENTER, 200.0, 12 if boss else 11, Color("ffe394") if boss else Color("ffb8c2"))
	draw_set_transform(Vector2.ZERO, 0.0, Vector2.ONE)

func update_ai_state(tick_delta: float) -> void:
	match ai_state:
		STATE_ROAMING:
			if radar_range > 0.0 and is_within_surface_range(target_ship, radar_range):
				begin_attack()
			elif not contact_type.is_empty() and not dialogue_request_sent and is_within_surface_range(target_ship, contact_range):
				dialogue_request_sent = true
				ai_state = STATE_DIALOGUE_REQUEST
				npc_dialogue_requested.emit(get_instance_id(), contact_type)
			else:
				roam(tick_delta)
		STATE_ATTACK:
			combat_steer()
		STATE_DIALOGUE_REQUEST:
			desired_forward = 0.0
			desired_reverse = 0.25 if linear_velocity.length_squared() > 225.0 else 0.0
			desired_turn = 0.0
		STATE_QUEST:
			roam(tick_delta)
		STATE_EXCLUSION:
			if not is_within_surface_range(target_ship, weapon_range):
				ai_state = STATE_ROAMING
				exclusion_elapsed = 0.0
			else:
				exclusion_elapsed += tick_delta
				if exclusion_elapsed >= float(BalanceData.NPC_AI.exclusion_grace_seconds):
					begin_attack()

func pick_roam_target() -> void:
	var radius := float(BalanceData.NPC_AI.roam_radius)
	roam_target = roam_anchor + Vector2(randf_range(-radius, radius), randf_range(-radius, radius))

func roam(_delta: float) -> void:
	var arrival_range := float(BalanceData.NPC_AI.roam_arrival_radius)
	if global_position.distance_squared_to(roam_target) <= arrival_range * arrival_range:
		pick_roam_target()
	steer_to(roam_target, 0.0, float(BalanceData.NPC_AI.roam_arrival_radius), 0.65)

func combat_steer() -> void:
	steer_to(target_ship.global_position, 230.0, 440.0 if boss else 380.0, 1.0)

func steer_to(destination: Vector2, min_distance: float, max_distance: float, forward_limit: float) -> void:
	var offset := destination - global_position
	var distance_squared := offset.length_squared()
	if distance_squared <= 0.0001:
		desired_forward = 0.0
		desired_reverse = 0.0
		desired_turn = 0.0
		return
	var facing := Vector2.RIGHT.rotated(rotation)
	var signed_turn := facing.angle_to(offset.normalized())
	desired_forward = forward_limit if distance_squared > max_distance * max_distance else 0.0
	desired_reverse = 0.35 if distance_squared < min_distance * min_distance else 0.0
	desired_turn = clampf(signed_turn * 2.0, -1.0, 1.0)

func begin_attack() -> void:
	ai_state = STATE_ATTACK
	contact_type = ""

func notify_attacked_by_player() -> void:
	if alive():
		begin_attack()

func accept_contact() -> void:
	if contact_type == "quest":
		ai_state = STATE_QUEST
	else:
		ai_state = STATE_EXCLUSION
		exclusion_elapsed = 0.0

func decline_quest() -> void:
	if ai_state == STATE_DIALOGUE_REQUEST:
		ai_state = STATE_ROAMING

func is_attacking_player() -> bool:
	return ai_state == STATE_ATTACK

func can_fire_at_player() -> bool:
	return is_attacking_player() and target_ship != null and is_instance_valid(target_ship) and is_within_surface_range(target_ship, weapon_range)

func alive() -> bool:
	var core := model.core_part()
	return core != null and core.hp > 0.0

func ready_to_fire() -> bool:
	if ai_fire_timer > 0.0:
		return false
	ai_fire_timer = 0.46 if boss else 0.72
	return true
