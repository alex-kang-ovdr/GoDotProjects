class_name ForestSurvival
extends Node3D

signal status_changed(day: int, phase: String, fuel: float, rescued: int, total: int)

const DAY_SECONDS := 105.0
const NIGHT_SECONDS := 55.0
const LOG_ITEM := BlockRegistry.LOG
const CAMPFIRE_FUEL_PER_LOG := 42.0
const FIRELIGHT_RADIUS := 13.0
const INTERACT_DISTANCE := 4.0
const RESCUE_COUNT := 4

var player: Variant
var world: Variant
var environment: WorldEnvironment
var sun: DirectionalLight3D
var day := 1
var phase_elapsed := 0.0
var fuel_seconds := 76.0
var rescued := 0
var hunter_active := false
var hunter_cooldown := 0.0
var _last_phase := "DAY"
var _status_elapsed := 0.0
var _camp_position := Vector3.ZERO
var _fire_light: OmniLight3D
var _fire_flame: MeshInstance3D
var _hunter: Node3D
var _rescue_markers: Array[Node3D] = []
var _rescue_done: Array[bool] = [false, false, false, false]


func setup(target_player: Variant, target_world: Variant, target_environment: WorldEnvironment, target_sun: DirectionalLight3D) -> void:
	player = target_player
	world = target_world
	environment = target_environment
	sun = target_sun
	player.survival = self
	world.generation_completed.connect(_on_world_regenerated)
	_build_campfire()
	_build_rescue_markers()
	_build_hunter()
	_emit_status()


func _process(delta: float) -> void:
	if player == null or world == null or world.gameplay_locked(): return
	phase_elapsed += delta
	_status_elapsed += delta
	if phase_elapsed >= DAY_SECONDS + NIGHT_SECONDS:
		phase_elapsed = fposmod(phase_elapsed, DAY_SECONDS + NIGHT_SECONDS)
		day += 1
	var phase := _phase()
	if phase == "NIGHT":
		fuel_seconds = maxf(0.0, fuel_seconds - delta)
	if phase != _last_phase:
		if phase == "DAY":
			hunter_active = false
			hunter_cooldown = 0.0
			_hunter.visible = false
			player.action_feedback.emit("Dawn %d — the forest is quiet for now" % day)
		else:
			player.action_feedback.emit("Nightfall — stay in the firelight")
		_last_phase = phase
		_emit_status()
	_update_lighting()
	_update_fire_visuals()
	_update_hunter(delta, phase)
	if _status_elapsed >= 1.0:
		_status_elapsed = fposmod(_status_elapsed, 1.0)
		_emit_status()


func interact() -> bool:
	if player == null or world.gameplay_locked(): return false
	var nearest_index := -1
	var nearest_distance := INTERACT_DISTANCE + 0.01
	for index in _rescue_markers.size():
		if _rescue_done[index] or not is_instance_valid(_rescue_markers[index]): continue
		var distance: float = player.global_position.distance_to(_rescue_markers[index].global_position)
		if distance < nearest_distance:
			nearest_index = index
			nearest_distance = distance
	if nearest_index >= 0:
		_rescue(nearest_index)
		return true
	if player.global_position.distance_to(_camp_position) <= INTERACT_DISTANCE:
		_refuel()
		return true
	return false


func _phase() -> String:
	return "DAY" if phase_elapsed < DAY_SECONDS else "NIGHT"


func _update_lighting() -> void:
	if not is_instance_valid(sun) or not is_instance_valid(environment): return
	var night_progress := 0.0
	if phase_elapsed >= DAY_SECONDS:
		night_progress = clampf((phase_elapsed - DAY_SECONDS) / NIGHT_SECONDS, 0.0, 1.0)
	var night_weight := smoothstep(0.0, 1.0, night_progress)
	var daylight := Color("#c9d8e2")
	var moonlight := Color("#36516f")
	environment.environment.ambient_light_color = daylight.lerp(moonlight, night_weight)
	environment.environment.ambient_light_energy = lerpf(0.48, 0.12, night_weight)
	environment.environment.background_color = Color("#75a9d6").lerp(Color("#07101e"), night_weight)
	sun.light_energy = lerpf(WorldLighting.SUN_ENERGY, 0.025, night_weight)
	sun.rotation_degrees.x = lerpf(-52.0, 8.0, night_weight)


func _build_campfire() -> void:
	_camp_position = world.to_global(world.spawn_position())
	var camp := Node3D.new()
	camp.name = "Campfire"
	camp.position = _camp_position + Vector3(0.0, 0.05, 0.0)
	add_child(camp)
	for angle in range(4):
		var log_mesh := MeshInstance3D.new()
		var log_shape := CylinderMesh.new()
		log_shape.top_radius = 0.13
		log_shape.bottom_radius = 0.13
		log_shape.height = 1.35
		log_mesh.mesh = log_shape
		log_mesh.position = Vector3(0.0, 0.12 + float(angle % 2) * 0.16, 0.0)
		log_mesh.rotation.z = PI / 2.0
		log_mesh.rotation.y = float(angle) * PI / 2.0
		log_mesh.material_override = _material(Color("#65432e"), 0.0)
		camp.add_child(log_mesh)
	_fire_flame = MeshInstance3D.new()
	var flame_mesh := SphereMesh.new()
	flame_mesh.radius = 0.22
	flame_mesh.height = 0.68
	_fire_flame.mesh = flame_mesh
	_fire_flame.position.y = 0.56
	_fire_flame.material_override = _material(Color("#ff762b"), 1.4)
	camp.add_child(_fire_flame)
	_fire_light = OmniLight3D.new()
	_fire_light.position.y = 0.75
	_fire_light.light_color = Color("#ff9a43")
	_fire_light.light_energy = 2.6
	_fire_light.omni_range = FIRELIGHT_RADIUS
	camp.add_child(_fire_light)
	var marker := Label3D.new()
	marker.text = "CAMPFIRE  ·  F TO ADD 1 LOG"
	marker.position.y = 2.0
	marker.font_size = 32
	marker.pixel_size = 0.004
	marker.billboard = BaseMaterial3D.BILLBOARD_ENABLED
	camp.add_child(marker)


func _build_rescue_markers() -> void:
	_rescue_markers.clear()
	var half := int(world.world_size / 2)
	var offsets := [Vector2i(17, 7), Vector2i(-20, 13), Vector2i(8, -24), Vector2i(-11, -29)]
	for index in RESCUE_COUNT:
		var offset: Vector2i = offsets[index]
		var x := clampi(offset.x, -half + 3, half - 3)
		var z := clampi(offset.y, -half + 3, half - 3)
		var y := _surface_y(x, z)
		var marker := _make_rescue_marker(index)
		marker.position = world.to_global(Vector3(x + 0.5, y + 1.1, z + 0.5))
		add_child(marker)
		_rescue_markers.append(marker)


func _make_rescue_marker(index: int) -> Node3D:
	var marker := Node3D.new()
	marker.name = "LostCamper%d" % (index + 1)
	var body := MeshInstance3D.new()
	var capsule := CapsuleMesh.new()
	capsule.radius = 0.32
	capsule.height = 1.05
	body.mesh = capsule
	body.material_override = _material([Color("#93bac4"), Color("#d4aa67"), Color("#aa94c7"), Color("#87b484")][index], 0.0)
	marker.add_child(body)
	var halo := MeshInstance3D.new()
	var ring := TorusMesh.new()
	ring.inner_radius = 0.42
	ring.outer_radius = 0.52
	halo.mesh = ring
	halo.position.y = -0.42
	halo.material_override = _material(Color("#9be8e0"), 0.8)
	marker.add_child(halo)
	var label := Label3D.new()
	label.text = "LOST CAMPER %d\nF TO RESCUE" % (index + 1)
	label.position.y = 1.1
	label.font_size = 30
	label.pixel_size = 0.004
	label.billboard = BaseMaterial3D.BILLBOARD_ENABLED
	marker.add_child(label)
	return marker


func _build_hunter() -> void:
	_hunter = Node3D.new()
	_hunter.name = "The Stag"
	_hunter.visible = false
	var body := MeshInstance3D.new()
	var shape := CapsuleMesh.new()
	shape.radius = 0.58
	shape.height = 1.85
	body.mesh = shape
	body.position.y = 1.0
	body.material_override = _material(Color("#20211f"), 0.05)
	_hunter.add_child(body)
	for side in [-1.0, 1.0]:
		var horn := MeshInstance3D.new()
		var horn_shape := CylinderMesh.new()
		horn_shape.top_radius = 0.035
		horn_shape.bottom_radius = 0.09
		horn_shape.height = 0.9
		horn.mesh = horn_shape
		horn.position = Vector3(side * 0.4, 2.0, 0.0)
		horn.rotation.z = side * -0.38
		horn.material_override = _material(Color("#cbbd91"), 0.0)
		_hunter.add_child(horn)
	add_child(_hunter)


func _update_hunter(delta: float, phase: String) -> void:
	var protected_by_fire: bool = fuel_seconds > 0.0 and player.global_position.distance_to(_camp_position) <= FIRELIGHT_RADIUS
	if phase != "NIGHT" or protected_by_fire:
		hunter_active = false
		_hunter.visible = false
		return
	if not hunter_active:
		hunter_cooldown += delta
		if hunter_cooldown < 8.0: return
		hunter_active = true
		_hunter.visible = true
		var away: Vector3 = (player.global_position - _camp_position).normalized()
		if away.length_squared() < 0.1: away = Vector3.FORWARD
		_hunter.global_position = player.global_position + away * 19.0 + Vector3.UP * 0.1
		player.action_feedback.emit("Something is moving in the dark!")
	if not hunter_active: return
	var target: Vector3 = player.global_position
	var flat_target := Vector3(target.x, _hunter.global_position.y, target.z)
	var speed := 2.2 + float(rescued) * 0.22
	_hunter.global_position = _hunter.global_position.move_toward(flat_target, speed * delta)
	if _hunter.global_position.distance_to(flat_target) < 1.25:
		_hunter.visible = false
		hunter_active = false
		hunter_cooldown = 0.0
		player.return_to_spawn()
		player.action_feedback.emit("The Stag caught your trail — you escaped, but lost a log")
		_drop_one_log()


func _refuel() -> void:
	for slot in BlockInventory.SLOT_COUNT:
		if player.inventory.item_at(slot) != LOG_ITEM: continue
		if player.inventory.consume(slot, 1):
			fuel_seconds = minf(150.0, fuel_seconds + CAMPFIRE_FUEL_PER_LOG)
			player.action_feedback.emit("Campfire fed · %d seconds of fuel" % roundi(fuel_seconds))
			_emit_status()
			return
	player.action_feedback.emit("Campfire needs Oak Logs — mine trees and bring one back")


func _rescue(index: int) -> void:
	_rescue_done[index] = true
	_rescue_markers[index].queue_free()
	rescued += 1
	if player.inventory.can_add(LOG_ITEM, 2): player.inventory.add(LOG_ITEM, 2)
	player.action_feedback.emit("Lost camper rescued (%d/%d) · +2 Oak Logs" % [rescued, RESCUE_COUNT])
	_emit_status()


func _drop_one_log() -> void:
	for slot in BlockInventory.SLOT_COUNT:
		if player.inventory.item_at(slot) == LOG_ITEM and player.inventory.consume(slot, 1): return


func _surface_y(x: int, z: int) -> int:
	var half := int(world.world_size / 2)
	var heights: PackedInt32Array = world.layout.get("surface_heights", PackedInt32Array())
	var index: int = (z + half) * world.world_size + x + half
	if index >= 0 and index < heights.size() and heights[index] >= 0:
		return heights[index]
	for y in range(40, -1, -1):
		var material: int = world.chunk_store.get_block(Vector3i(x, y, z))
		if material >= 0 and BlockRegistry.DEFINITIONS[material].solid: return y
	return 8


func _update_fire_visuals() -> void:
	if not is_instance_valid(_fire_light) or not is_instance_valid(_fire_flame): return
	_fire_light.visible = fuel_seconds > 0.0
	_fire_light.light_energy = 2.2 + 0.3 * sin(Time.get_ticks_msec() * 0.013) if fuel_seconds > 0.0 else 0.0
	_fire_flame.visible = fuel_seconds > 0.0
	_fire_flame.scale = Vector3.ONE * (0.86 + 0.12 * sin(Time.get_ticks_msec() * 0.009))


func _emit_status() -> void:
	status_changed.emit(day, _phase(), fuel_seconds, rescued, RESCUE_COUNT)


func _on_world_regenerated(_summary: Dictionary) -> void:
	phase_elapsed = 0.0
	_last_phase = "DAY"
	_status_elapsed = 0.0
	day = 1
	fuel_seconds = 76.0
	rescued = 0
	_rescue_done = [false, false, false, false]
	hunter_active = false
	hunter_cooldown = 0.0
	if is_instance_valid(_hunter): _hunter.visible = false
	for marker in _rescue_markers:
		if is_instance_valid(marker): marker.queue_free()
	_rescue_markers.clear()
	if is_instance_valid(_fire_light): _fire_light.get_parent().queue_free()
	_build_campfire()
	_build_rescue_markers()
	_emit_status()


func _material(color: Color, emission: float) -> StandardMaterial3D:
	var material := StandardMaterial3D.new()
	material.albedo_color = color
	material.roughness = 0.78
	if emission > 0.0:
		material.emission_enabled = true
		material.emission = color
		material.emission_energy_multiplier = emission
	return material
