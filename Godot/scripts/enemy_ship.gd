class_name EnemyShip
extends ShipBody

var enemy_name := "RAIDER MK-1"
var level := 1
var boss := false
var target_ship: ShipBody
var ai_fire_timer := 0.0

func setup(next_level: int, boss_name: String = "") -> void:
	level = next_level
	boss = not boss_name.is_empty()
	enemy_name = boss_name if boss else "RAIDER MK-%d" % level
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
	var facing := Vector2.RIGHT.rotated(rotation)
	var signed_turn := facing.angle_to(to_target.normalized())
	apply_player_thrusters(1.0 if to_target.length() > (450.0 if boss else 390.0) else 0.0, 0.35 if to_target.length() < 220.0 else 0.0, clampf(signed_turn * 2.0, -1.0, 1.0))
	ai_fire_timer -= delta

func alive() -> bool:
	var core := model.core_part()
	return core != null and core.hp > 0.0

func ready_to_fire() -> bool:
	if ai_fire_timer > 0.0:
		return false
	ai_fire_timer = 0.48 if boss else 0.72
	return true
