extends Node3D

## Assembles the parsed Unity MiniGame.unity scene (LH -> RH coordinate transform).

const PICKUP_COORDS: Array[Vector3] = [
	Vector3(-5.36, 0.5, 3.01),
	Vector3(-6.02, 0.5, 0),
	Vector3(5.89, 0.5, 0),
	Vector3(5.49, 0.5, -2.28),
	Vector3(5.42, 0.5, 3.62),
	Vector3(3.41, 0.5, 5.55),
	Vector3(-2.41, 0.5, 6.16),
	Vector3(-4.75, 0.5, -4.15),
	Vector3(0, 0.5, 6.36),
	Vector3(0, 0.5, -6.49),
	Vector3(3.88, 0.5, -4.22),
	Vector3(2.48, 0.5, -5.22)
]

const WALL_SPECS: Array[Dictionary] = [
	{ "name": "South Wall", "pos": Vector3(0, 0.5, 10), "size": Vector3(20.5, 2, 0.5) },
	{ "name": "North Wall", "pos": Vector3(0, 0.5, -10), "size": Vector3(20.5, 2, 0.5) },
	{ "name": "East Wall", "pos": Vector3(10, 0.5, 0), "size": Vector3(0.5, 2, 20.5) },
	{ "name": "West Wall", "pos": Vector3(-10, 0.5, 0), "size": Vector3(0.5, 2, 20.5) }
]

@onready var player: RollPlayerController = $Player
@onready var pickups_root: Node3D = $PickUps
@onready var walls_root: Node3D = $Walls
@onready var count_label: Label = $HUD/CountText
@onready var win_label: Label = $HUD/WinText

var pickup_areas: Array[Area3D] = []

func _ready() -> void:
	_build_walls()
	_build_pickups()
	player.setup_ui(count_label, win_label, PICKUP_COORDS.size())

func _build_walls() -> void:
	var wall_mat := StandardMaterial3D.new()
	wall_mat.albedo_color = Color(0.55, 0.62, 0.72, 1.0)
	wall_mat.roughness = 0.65

	for spec in WALL_SPECS:
		var body := StaticBody3D.new()
		body.name = spec.name
		body.position = spec.pos
		walls_root.add_child(body)

		var mi := MeshInstance3D.new()
		var bm := BoxMesh.new()
		bm.size = spec.size
		mi.mesh = bm
		mi.material_override = wall_mat
		body.add_child(mi)

		var cs := CollisionShape3D.new()
		var bs := BoxShape3D.new()
		bs.size = spec.size
		cs.shape = bs
		body.add_child(cs)

func _build_pickups() -> void:
	var pickup_mat := StandardMaterial3D.new()
	pickup_mat.albedo_color = Color(1.0, 0.82, 0.12, 1.0)
	pickup_mat.metallic = 0.25
	pickup_mat.roughness = 0.3
	pickup_mat.emission_enabled = true
	pickup_mat.emission = Color(0.35, 0.25, 0.0, 1.0)

	for i in range(PICKUP_COORDS.size()):
		var area := Area3D.new()
		area.name = "PickUp_%02d" % i
		area.position = PICKUP_COORDS[i]
		area.set_script(load("res://scripts/rotator.gd"))
		pickups_root.add_child(area)

		var mi := MeshInstance3D.new()
		var bm := BoxMesh.new()
		bm.size = Vector3(0.55, 0.55, 0.55)
		mi.mesh = bm
		mi.material_override = pickup_mat
		area.add_child(mi)

		var cs := CollisionShape3D.new()
		var bs := BoxShape3D.new()
		bs.size = Vector3(0.65, 0.65, 0.65)
		cs.shape = bs
		area.add_child(cs)

		area.body_entered.connect(func(body: Node3D):
			if body is RollPlayerController:
				(body as RollPlayerController).collect_pickup(area)
		)
		pickup_areas.append(area)
