extends Node3D

const MANIFEST := "res://assets/minecraft_character_generator/turrets/manifest.json"
const COLUMNS := 5
const SPACING := 3.2
var players: Array[AnimationPlayer] = []
var active_clip := "Install"
var status: Label

func _ready() -> void:
	_build_environment()
	_build_floor()
	var file := FileAccess.open(MANIFEST, FileAccess.READ)
	if file == null:
		push_error("Turret manifest missing")
		return
	var manifest = JSON.parse_string(file.get_as_text())
	for index in manifest.get("assets", []).size():
		var asset: Dictionary = manifest.assets[index]
		var doc := GLTFDocument.new()
		var state := GLTFState.new()
		if doc.append_from_file("res://assets/" + asset.file, state) != OK:
			push_error("Turret GLB import failed: %s" % asset.name)
			continue
		var scene := doc.generate_scene(state)
		if scene == null:
			continue
		var row: int = int(index) / COLUMNS
		var column: int = int(index) % COLUMNS
		scene.position = Vector3((column - 2) * SPACING, 0, row * -SPACING)
		add_child(scene)
		var found := _descendants(scene, "AnimationPlayer")
		if not found.is_empty():
			var player: AnimationPlayer = found[0]
			players.append(player)
			if player.has_animation(active_clip):
				player.play(active_clip)
		var label := Label3D.new()
		label.text = str(asset.label)
		label.position = Vector3(0, 2.8, 0)
		label.font_size = 30
		label.pixel_size = .004
		scene.add_child(label)
	_build_camera()
	_build_hud(manifest.get("count", 10))

func _unhandled_input(event: InputEvent) -> void:
	if event is InputEventKey and event.pressed and not event.echo:
		var clips := ["Install", "Aim", "Fire", "Destroy"]
		if event.keycode >= KEY_1 and event.keycode <= KEY_4:
			play_clip(clips[event.keycode - KEY_1])

func play_clip(clip: String) -> void:
	active_clip = clip
	for player in players:
		if player.has_animation(clip):
			player.play(clip)
	if status:
		status.text = "Defense Turrets 10종 | %s | 1 Install · 2 Aim · 3 Fire · 4 Destroy" % clip

func _descendants(node: Node, type_name: String) -> Array:
	var found: Array = []
	if node.is_class(type_name):
		found.append(node)
	for child in node.get_children():
		found.append_array(_descendants(child, type_name))
	return found

func _build_environment() -> void:
	var world := WorldEnvironment.new()
	var env := Environment.new()
	env.background_mode = Environment.BG_COLOR
	env.background_color = Color("#101b2b")
	env.ambient_light_source = Environment.AMBIENT_SOURCE_COLOR
	env.ambient_light_color = Color("#abc4d8")
	env.ambient_light_energy = .7
	world.environment = env
	add_child(world)
	var key := DirectionalLight3D.new()
	key.rotation_degrees = Vector3(-48, -28, 0)
	key.light_energy = 1.2
	add_child(key)
	var fill := DirectionalLight3D.new()
	fill.rotation_degrees = Vector3(-25, 145, 0)
	fill.light_energy = .45
	add_child(fill)

func _build_floor() -> void:
	var floor := MeshInstance3D.new()
	var plane := PlaneMesh.new()
	plane.size = Vector2(18, 11)
	floor.mesh = plane
	var material := StandardMaterial3D.new()
	material.albedo_color = Color("#263c55")
	material.roughness = 1.0
	floor.material_override = material
	floor.position = Vector3(0, -.05, -1.6)
	add_child(floor)

func _build_camera() -> void:
	var camera := Camera3D.new()
	camera.position = Vector3(0, 6.2, 15.5)
	add_child(camera)
	camera.look_at(Vector3(0, 1.1, -1.6))
	camera.current = true

func _build_hud(count: int) -> void:
	var layer := CanvasLayer.new()
	add_child(layer)
	status = Label.new()
	status.position = Vector2(24, 20)
	status.add_theme_font_size_override("font_size", 20)
	layer.add_child(status)
	status.text = "Defense Turrets %d종 | %s | 1 Install · 2 Aim · 3 Fire · 4 Destroy" % [count, active_clip]
