class_name EnemyShip
extends ShipBody

signal npc_dialogue_requested(npc_id: int, contact_type: String)

const STATE_ROAMING := "roaming"
const STATE_ATTACK := "attack"
const STATE_DIALOGUE_REQUEST := "dialogue_request"
const STATE_QUEST := "quest"
const STATE_EXCLUSION := "exclusion"

var enemy_name := "RAIDER MK-1"
var level := 1
var boss := false
var target_ship: ShipBody
var ai_fire_timer := 0.0
var archetype := "roamer"
var ai_state := STATE_ROAMING
var contact_type := ""
var radar_range := 0.0
var weapon_range := 620.0
var contact_range := 560.0
var roam_anchor := Vector2.ZERO
var roam_target := Vector2.ZERO
var dialogue_request_sent := false
var exclusion_elapsed := 0.0

func setup(next_level: int, boss_name: String = "", next_archetype: String = "roamer") -> void:
	level = next_level
	boss = not boss_name.is_empty()
	enemy_name = boss_name if boss else "RAIDER MK-%d" % level
	archetype = "boss" if boss else next_archetype
	var profile: Dictionary = BalanceData.NPC_AI.archetypes.get(archetype, BalanceData.NPC_AI.archetypes.roamer)
	contact_type = str(profile.get("contact", ""))
	radar_range = float(profile.get("radar_range", 0.0))
	weapon_range = float(BalanceData.NPC_AI.weapon_range)
	contact_range = float(BalanceData.NPC_AI.contact_range)
	ai_state = STATE_ROAMING
	roam_anchor = global_position
	pick_roam_target()
	model.parts.clear()
	var core := model.add("core", Vector2i.ZERO)
	core.hp = 75.0 + level * 25.0
	core.max_hp = core.hp
	model.add("armor", Vector2i(1, 0))
	model.add("laser", Vector2i(0, -1))
	model.add("laser", Vector2i(0, 1))
	model.add("thruster", Vector2i(-1, -1))
	model.add("thruster", Vector2i(-1, 1))
	model.add("rcs_thruster", Vector2i(0, -2))
	model.add("rcs_thruster", Vector2i(0, 2))
	if level >= 4:
		model.add("shield_generator", Vector2i(2, 0))
	if level >= 6:
		model.add("machine_gun", Vector2i(1, -1))
		model.add("bullet_bay", Vector2i(1, 1))
	shield_layers = model.shield_capacity()
	refresh_mass()
	queue_redraw()

func _physics_process(delta: float) -> void:
	super._physics_process(delta)
	if target_ship == null or not is_instance_valid(target_ship) or not alive():
		return
	var to_target := target_ship.global_position - global_position
	ai_fire_timer -= delta
	match ai_state:
		STATE_ROAMING:
			if radar_range > 0.0 and to_target.length() <= radar_range:
				begin_attack()
			elif not contact_type.is_empty() and not dialogue_request_sent and to_target.length() <= contact_range:
				dialogue_request_sent = true
				ai_state = STATE_DIALOGUE_REQUEST
				npc_dialogue_requested.emit(get_instance_id(), contact_type)
			else:
				roam(delta)
		STATE_ATTACK:
			combat_steer(to_target)
		STATE_DIALOGUE_REQUEST:
			apply_player_thrusters(0.0, 0.25 if linear_velocity.length() > 15.0 else 0.0, 0.0)
		STATE_QUEST:
			roam(delta)
		STATE_EXCLUSION:
			if to_target.length() > weapon_range:
				ai_state = STATE_ROAMING
				exclusion_elapsed = 0.0
			else:
				exclusion_elapsed += delta
				if exclusion_elapsed >= float(BalanceData.NPC_AI.exclusion_grace_seconds):
					begin_attack()

func pick_roam_target() -> void:
	var radius := float(BalanceData.NPC_AI.roam_radius)
	roam_target = roam_anchor + Vector2(randf_range(-radius, radius), randf_range(-radius, radius))

func roam(_delta: float) -> void:
	if global_position.distance_to(roam_target) <= float(BalanceData.NPC_AI.roam_arrival_radius):
		pick_roam_target()
	steer_to(roam_target, 0.0, float(BalanceData.NPC_AI.roam_arrival_radius), 0.65)

func combat_steer(to_target: Vector2) -> void:
	steer_to(target_ship.global_position, 230.0, 430.0 if boss else 390.0, 1.0)

func steer_to(destination: Vector2, min_distance: float, max_distance: float, forward_limit: float) -> void:
	var offset := destination - global_position
	if offset.length() <= 0.01:
		return
	var facing := Vector2.RIGHT.rotated(rotation)
	var signed_turn := facing.angle_to(offset.normalized())
	var forward := forward_limit if offset.length() > max_distance else 0.0
	var reverse := 0.35 if offset.length() < min_distance else 0.0
	# RCS 양수 토크가 화면 기준 좌회전이므로 목표 각도의 부호를 반전한다.
	apply_player_thrusters(forward, reverse, clampf(-signed_turn * 2.0, -1.0, 1.0))

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
	return is_attacking_player() and target_ship != null and is_instance_valid(target_ship) and global_position.distance_to(target_ship.global_position) <= weapon_range

func alive() -> bool:
	var core := model.core_part()
	return core != null and core.hp > 0.0

func ready_to_fire() -> bool:
	if ai_fire_timer > 0.0:
		return false
	ai_fire_timer = 0.48 if boss else 0.72
	return true
