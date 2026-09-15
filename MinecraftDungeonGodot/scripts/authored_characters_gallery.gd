extends Node3D

## Optional smoke scene for the copied 13-character Authored Cuboids bundle.
## Run with: Godot --path . --editor --quit-after 1 (import), then open this scene.
const CHARACTER_NAMES := [
	"mario", "luigi", "wario", "yoshi", "kirby", "creeper", "steve",
	"luffy", "pig", "volt_mouse", "eevee", "roblox_r6", "roblox_r15"
]
const COLUMNS := 7
const SPACING := 2.8

func _ready() -> void:
	_build_lighting()
	_build_floor()
	for index in CHARACTER_NAMES.size():
		var actor := CharacterAssetCatalog.instantiate(CHARACTER_NAMES[index])
		if actor == null:
			continue
		actor.name = CHARACTER_NAMES[index]
		var row := index / COLUMNS
		var column := index % COLUMNS
		actor.position = Vector3((column - 3) * SPACING, 0.0, row * -SPACING)
		add_child(actor)
		var label := Label3D.new()
		label.text = CHARACTER_NAMES[index].replace("_", " ").capitalize()
		label.position = Vector3(0, 2.65, 0)
		label.font_size = 32
		label.pixel_size = 0.004
		actor.add_child(label)
		var animation_player := actor.find_child("AnimationPlayer", true, false) as AnimationPlayer
		if animation_player and animation_player.has_animation("Walk"):
			animation_player.play("Walk")
	_build_camera()

func _build_lighting() -> void:
	var world_environment := WorldEnvironment.new()
	var environment := Environment.new()
	environment.background_mode = Environment.BG_COLOR
	environment.background_color = Color("#101b2b")
	environment.ambient_light_source = Environment.AMBIENT_SOURCE_COLOR
	environment.ambient_light_color = Color("#9bb9d4")
	environment.ambient_light_energy = 0.7
	world_environment.environment = environment
	add_child(world_environment)
	var key := DirectionalLight3D.new()
	key.rotation_degrees = Vector3(-48, -28, 0)
	key.light_energy = 1.2
	add_child(key)
	var fill := DirectionalLight3D.new()
	fill.rotation_degrees = Vector3(-25, 145, 0)
	fill.light_energy = 0.45
	add_child(fill)

func _build_floor() -> void:
	var floor := MeshInstance3D.new()
	var plane := PlaneMesh.new()
	plane.size = Vector2(24, 12)
	floor.mesh = plane
	var material := StandardMaterial3D.new()
	material.albedo_color = Color("#263c55")
	material.roughness = 1.0
	floor.material_override = material
	floor.position = Vector3(0, -0.05, -2.5)
	add_child(floor)

func _build_camera() -> void:
	var camera := Camera3D.new()
	camera.position = Vector3(0, 6.2, 15.5)
	camera.current = true
	add_child(camera)
	camera.look_at(Vector3(0, 1.2, -2.5))
