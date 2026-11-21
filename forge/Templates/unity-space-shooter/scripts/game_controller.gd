class_name SpaceGameController
extends Node3D

## Port of Assets/Scripts/GameController.cs, DestroyByContact.cs, RandomRotator.cs

@export var hazard_count: int = 8
@export var spawn_wait: float = 0.55
@export var start_wait: float = 0.6
@export var wave_wait: float = 2.0

@onready var world_root: Node3D = $WorldRoot
@onready var bg_quad: MeshInstance3D = $Background
@onready var score_label: Label = $HUD/ScoreText
@onready var game_over_label: Label = $HUD/GameOverText
@onready var restart_label: Label = $HUD/RestartText
@onready var music_player: AudioStreamPlayer = $MusicPlayer

var player: SpacePlayer
var score: int = 0
var is_game_over: bool = false
var can_restart: bool = false
var auto_waves: bool = true
var rng := RandomNumberGenerator.new()

var asteroid_meshes: Array[Mesh] = []
var asteroid_mats: Array[StandardMaterial3D] = []
var bolt_mat: StandardMaterial3D
var bg_mat: StandardMaterial3D
var bg_scroll: float = 0.0

var bolts_spawned: int = 0
var asteroids_destroyed: int = 0

func _ready() -> void:
	rng.randomize()
	_load_assets()
	_setup_background()
	_setup_player()
	_update_score()
	game_over_label.text = ""
	restart_label.text = ""
	if ResourceLoader.exists("res://assets/audio/music_background.tres"):
		music_player.stream = load("res://assets/audio/music_background.tres")
		music_player.volume_db = -12.0
		music_player.play()
	_spawn_waves_loop()

func _load_assets() -> void:
	for i in [1, 2, 3]:
		var fbx_p := "res://assets/models/prop_asteroid_0%d.tres" % i
		if ResourceLoader.exists(fbx_p):
			asteroid_meshes.append(load(fbx_p))
		var mat := StandardMaterial3D.new()
		var dff := "res://assets/textures/prop_asteroid_0%d_dff.tres" % i
		var nrm := "res://assets/textures/prop_asteroid_0%d_nrm.tres" % i
		if ResourceLoader.exists(dff):
			mat.albedo_texture = load(dff)
		if ResourceLoader.exists(nrm):
			mat.normal_enabled = true
			mat.normal_texture = load(nrm)
		mat.roughness = 0.85
		asteroid_mats.append(mat)

	bolt_mat = StandardMaterial3D.new()
	bolt_mat.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	bolt_mat.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	bolt_mat.blend_mode = BaseMaterial3D.BLEND_MODE_ADD
	if ResourceLoader.exists("res://assets/textures/fx_lazer_orange_dff.tres"):
		bolt_mat.albedo_texture = load("res://assets/textures/fx_lazer_orange_dff.tres")

func _setup_background() -> void:
	bg_mat = StandardMaterial3D.new()
	bg_mat.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	if ResourceLoader.exists("res://assets/textures/tile_nebula_green_dff.tres"):
		bg_mat.albedo_texture = load("res://assets/textures/tile_nebula_green_dff.tres")
	bg_mat.uv1_scale = Vector3(1.0, 1.5, 1.0)
	bg_quad.material_override = bg_mat

func _setup_player() -> void:
	player = SpacePlayer.new()
	player.name = "Player"
	player.position = Vector3(0.0, 0.0, 4.5)
	world_root.add_child(player)
	player.setup(self)

func _override_meshes(node: Node, mat: Material) -> void:
	if node is MeshInstance3D:
		(node as MeshInstance3D).material_override = mat
	for c in node.get_children():
		_override_meshes(c, mat)

func spawn_player_bolt(pos: Vector3) -> SpaceMover:
	var bolt := SpaceMover.new()
	bolt.name = "Bolt_%d" % bolts_spawned
	bolts_spawned += 1
	bolt.position = pos
	bolt.speed = -20.0
	bolt.set_meta("unity_tag", "Bolt")

	var mi := MeshInstance3D.new()
	var qm := QuadMesh.new()
	qm.size = Vector2(0.85, 2.2)
	mi.mesh = qm
	mi.material_override = bolt_mat
	mi.rotation_degrees = Vector3(-90, 0, 0)
	bolt.add_child(mi)

	var col := CollisionShape3D.new()
	var cap := BoxShape3D.new()
	cap.size = Vector3(0.55, 1.0, 1.6)
	col.shape = cap
	bolt.add_child(col)

	world_root.add_child(bolt)
	return bolt

func spawn_asteroid(pos: Vector3, variant_idx: int = -1, speed_override: float = 5.0) -> SpaceMover:
	var idx := variant_idx if variant_idx >= 0 else rng.randi_range(0, max(asteroid_meshes.size() - 1, 0))
	var ast := SpaceMover.new()
	ast.name = "Asteroid_%d" % idx
	ast.position = pos
	ast.speed = speed_override
	ast.tumble = Vector3(rng.randf_range(-2.5, 2.5), rng.randf_range(-2.5, 2.5), rng.randf_range(-2.5, 2.5))
	ast.set_meta("unity_tag", "Hazard")
	ast.set_meta("score_value", 10)

	if idx < asteroid_meshes.size():
		var model := MeshInstance3D.new()
		model.mesh = asteroid_meshes[idx]
		model.scale = Vector3(1.15, 1.15, 1.15)
		model.material_override = asteroid_mats[idx]
		ast.add_child(model)

	var col := CollisionShape3D.new()
	var sph := SphereShape3D.new()
	sph.radius = 0.85
	col.shape = sph
	ast.add_child(col)

	ast.area_entered.connect(func(other: Area3D):
		_on_hazard_contact(ast, other)
	)
	world_root.add_child(ast)
	return ast

func _on_hazard_contact(hazard: SpaceMover, other: Area3D) -> void:
	if not is_instance_valid(hazard) or hazard.is_queued_for_deletion():
		return
	var tag: String = other.get_meta("unity_tag", "")
	if tag != "Bolt" and tag != "Player":
		return

	var vfx := SpaceExplosionVfx.new()
	world_root.add_child(vfx)
	if tag == "Player":
		vfx.setup(hazard.position, 1.5, "res://assets/audio/explosion_player.tres")
		player.alive = false
		player.visible = false
		trigger_game_over()
	else:
		vfx.setup(hazard.position, 1.0, "res://assets/audio/explosion_asteroid.tres")
		asteroids_destroyed += 1
		add_score(int(hazard.get_meta("score_value", 10)))
		other.queue_free()

	hazard.queue_free()

func _spawn_waves_loop() -> void:
	await get_tree().create_timer(start_wait).timeout
	while not is_game_over and auto_waves:
		for _i in range(hazard_count):
			if is_game_over or not auto_waves:
				break
			var pos := Vector3(rng.randf_range(-5.2, 5.2), 0.0, -10.5)
			spawn_asteroid(pos)
			await get_tree().create_timer(spawn_wait).timeout
		await get_tree().create_timer(wave_wait).timeout

func add_score(delta_score: int) -> void:
	score += delta_score
	_update_score()

func _update_score() -> void:
	score_label.text = "Score: %d" % score

func trigger_game_over() -> void:
	is_game_over = true
	can_restart = true
	game_over_label.text = "Game Over"
	restart_label.text = "Press 'R' for restart"

func _process(delta: float) -> void:
	bg_scroll = fmod(bg_scroll + 0.04 * delta, 1.0)
	if bg_mat:
		bg_mat.uv1_offset.y = -bg_scroll
	if can_restart and Input.is_key_pressed(KEY_R):
		get_tree().reload_current_scene()
