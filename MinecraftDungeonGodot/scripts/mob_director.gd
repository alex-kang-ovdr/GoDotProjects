class_name MobDirector
extends Node3D

const MAX_MONSTERS := 130
const PER_VARIANT := 10
const VARIANT_IDS := ["mario", "luigi", "wario", "yoshi", "kirby", "creeper", "steve", "luffy", "pig", "volt_mouse", "eevee", "roblox_r6", "roblox_r15"]

var world: VoxelWorld
var player: VoxelPlayer
var monsters: Array[WanderingMonster] = []
var variant_counts: Dictionary = {}
var population_complete := false
var total_jump_events := 0
var _random := RandomNumberGenerator.new()


func setup(target_world: VoxelWorld, target_player: VoxelPlayer) -> void:
	world = target_world
	player = target_player
	_random.seed = int(world.world_seed) ^ 0x4d4f4253
	world.generation_completed.connect(_on_generation_completed)
	call_deferred("populate")


func populate() -> void:
	if world == null or world.layout.is_empty(): return
	if world.layout.get("mode") == "streaming" and world.chunk_store.base_cells.is_empty():
		call_deferred("populate")
		return
	clear_population()
	var serial := 0
	for variant: String in VARIANT_IDS:
		var scene := CharacterAssetCatalog.scene_for(variant)
		if scene == null:
			push_error("Missing authored cuboid monster model: " + variant)
			continue
		for copy_index in PER_VARIANT:
			if monsters.size() >= MAX_MONSTERS: break
			var actor := WanderingMonster.new()
			actor.name = "Mob_%s_%02d" % [variant, copy_index + 1]
			add_child(actor)
			var spawn := _find_surface(_sample_xz(serial, true))
			var target := _find_surface(_sample_xz(serial + 130, false))
			actor.setup(world, variant, scene, spawn, target, float(serial % 10) / 10.0)
			actor.wander_target_requested.connect(_assign_wander_target)
			monsters.append(actor)
			variant_counts[variant] = int(variant_counts.get(variant, 0)) + 1
			serial += 1
	population_complete = monsters.size() == MAX_MONSTERS and variant_counts.size() == VARIANT_IDS.size()


func clear_population() -> void:
	for monster in monsters:
		if is_instance_valid(monster): monster.queue_free()
	monsters.clear()
	variant_counts.clear()
	population_complete = false
	total_jump_events = 0


func active_count() -> int:
	return monsters.size()


func _physics_process(_delta: float) -> void:
	total_jump_events = 0
	for monster in monsters:
		if is_instance_valid(monster): total_jump_events += monster.jump_events


func _on_generation_completed(_summary: Dictionary) -> void:
	call_deferred("populate")


func _assign_wander_target(monster: WanderingMonster) -> void:
	if not is_instance_valid(monster): return
	var serial := int(Time.get_ticks_msec() % 100000) + monsters.find(monster) * 37 + monster.jump_events * 71
	monster.target_position = _find_surface(_sample_xz(serial, false))


func _sample_xz(serial: int, spawn: bool) -> Vector2i:
	var center := Vector2(player.global_position.x, player.global_position.z) if world.layout.get("mode") == "streaming" and is_instance_valid(player) else Vector2.ZERO
	var radius_min := 4.0 if spawn else 7.0
	var radius_max := 17.0 if world.layout.get("mode") == "streaming" else maxf(8.0, float(world.world_size) * 0.42)
	var angle := float(posmod(serial * 137 + int(world.world_seed), 360)) * PI / 180.0
	var radius := radius_min + float(posmod(serial * 29 + 11, 100)) / 100.0 * (radius_max - radius_min)
	var point := center + Vector2(cos(angle), sin(angle)) * radius
	if world.layout.get("mode") != "streaming":
		var half := maxf(4.0, float(world.world_size) * 0.5 - 3.0)
		point.x = clampf(point.x, -half, half)
		point.y = clampf(point.y, -half, half)
	return Vector2i(roundi(point.x), roundi(point.y))


func _find_surface(xz: Vector2i) -> Vector3:
	for offset in 25:
		var probe := xz + Vector2i(posmod(offset * 7, 5) - 2, posmod(offset * 11, 5) - 2)
		for y in range(96, -33, -1):
			var floor := Vector3i(probe.x, y, probe.y)
			var definition := BlockRegistry.by_material(world.get_cell_item(floor))
			if definition.is_empty() or not definition.solid: continue
			if world.get_cell_item(floor + Vector3i.UP) == -1 and world.get_cell_item(floor + Vector3i.UP * 2) == -1:
				return world.to_global(Vector3(floor) + Vector3(0.5, 1.05, 0.5))
	return world.spawn_position() + Vector3.UP * 0.5
