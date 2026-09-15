class_name WanderingMonster
extends CharacterBody3D

signal wander_target_requested(monster: WanderingMonster)

const GRAVITY := 18.0
const WALK_SPEED := 1.8
# 7.0 m/s gives the 1-block clearance needed for the 1.45 m capsule to climb
# voxel steps. The previous 5.1 m/s apex was only about 0.72 m.
const JUMP_VELOCITY := 7.0
const DECISION_INTERVAL := 0.1
const TARGET_REACHED_DISTANCE := 0.85
const MOTION_THRESHOLD := 0.08

var world: VoxelWorld
var variant_id := ""
var target_position := Vector3.ZERO
var decision_elapsed := 0.0
var stuck_elapsed := 0.0
var jump_cooldown := 1.0
var jump_events := 0
var motion_animation := "idle"
var _last_position := Vector3.ZERO
var _animation_players: Array[AnimationPlayer] = []
var _motion_state := ""


func setup(target_world: VoxelWorld, next_variant_id: String, model_scene: PackedScene, start_position: Vector3, initial_target: Vector3, stagger: float) -> void:
	world = target_world
	variant_id = next_variant_id
	global_position = start_position
	target_position = initial_target
	jump_cooldown = 1.0 + stagger * 3.0
	_last_position = global_position
	_build_collision()
	_attach_model(model_scene)


func _physics_process(delta: float) -> void:
	if world == null or world.gameplay_locked(): return
	if global_position.y < -32.0:
		wander_target_requested.emit(self)
		global_position = target_position + Vector3.UP * 1.2
		velocity = Vector3.ZERO
		return
	decision_elapsed += delta
	if decision_elapsed >= DECISION_INTERVAL:
		decision_elapsed = 0.0
		_update_wander_state()
	if not is_on_floor():
		velocity.y -= GRAVITY * delta
	else:
		jump_cooldown -= delta
		if jump_cooldown <= 0.0 or stuck_elapsed >= 0.65:
			velocity.y = JUMP_VELOCITY
			jump_events += 1
			jump_cooldown = 2.2 + float((jump_events * 17 + variant_id.length() * 13) % 31) * 0.1
			stuck_elapsed = 0.0
	move_and_slide()
	_update_motion_animation()


func _update_wander_state() -> void:
	var horizontal := target_position - global_position
	horizontal.y = 0.0
	if horizontal.length() <= TARGET_REACHED_DISTANCE:
		wander_target_requested.emit(self)
		return
	var direction := horizontal.normalized()
	velocity.x = move_toward(velocity.x, direction.x * WALK_SPEED, WALK_SPEED * 0.7)
	velocity.z = move_toward(velocity.z, direction.z * WALK_SPEED, WALK_SPEED * 0.7)
	look_at(global_position + direction, Vector3.UP, true)
	var moved := Vector2(global_position.x - _last_position.x, global_position.z - _last_position.z).length()
	stuck_elapsed = stuck_elapsed + DECISION_INTERVAL if moved < 0.025 else 0.0
	_last_position = global_position


func _build_collision() -> void:
	if get_node_or_null("Collision") != null: return
	collision_layer = 4
	collision_mask = 1
	var collision := CollisionShape3D.new()
	collision.name = "Collision"
	var shape := CapsuleShape3D.new()
	shape.radius = 0.30
	shape.height = 1.45
	collision.shape = shape
	collision.position.y = 0.725
	add_child(collision)


func _attach_model(model_scene: PackedScene) -> void:
	if model_scene == null: return
	var visual := model_scene.instantiate()
	visual.name = "AuthoredCuboidVisual"
	visual.scale = Vector3.ONE * 0.62
	add_child(visual)
	_animation_players = _find_animation_players(visual)
	for animation_player: AnimationPlayer in _animation_players:
		animation_player.speed_scale = 0.75
	_update_motion_animation(true)


func _update_motion_animation(force := false) -> void:
	var horizontal_speed := Vector2(velocity.x, velocity.z).length()
	var next_state := "jump" if not is_on_floor() else ("walk" if horizontal_speed > MOTION_THRESHOLD else "idle")
	if not force and next_state == _motion_state: return
	_motion_state = next_state
	motion_animation = next_state
	var candidates: Array[String] = ["Idle", "idle"]
	if next_state == "walk": candidates = ["Walk", "walk", "Run", "run"]
	elif next_state == "jump": candidates = ["Jump", "jump"]
	for animation_player: AnimationPlayer in _animation_players:
		var animation_name := _first_available_animation(animation_player, candidates)
		if animation_name.is_empty(): continue
		if animation_player.current_animation != animation_name:
			animation_player.play(animation_name)


func _first_available_animation(animation_player: AnimationPlayer, candidates: Array[String]) -> String:
	for candidate: String in candidates:
		if animation_player.has_animation(candidate): return candidate
	return ""


func _find_animation_players(node: Node) -> Array[AnimationPlayer]:
	var players: Array[AnimationPlayer] = []
	if node is AnimationPlayer: players.append(node)
	for child in node.get_children():
		players.append_array(_find_animation_players(child))
	return players
