class_name PipeSpawner
extends Node2D

## Port of Assets/Scripts/Spawner.cs

@export var spawn_rate: float = 1.15
@export var min_y: float = 210.0
@export var max_y: float = 450.0
@export var vertical_gap: float = 148.0

var active: bool = false
var timer: float = 0.0
var rng := RandomNumberGenerator.new()

func start_spawning(seed_val: int = -1) -> void:
	active = true
	timer = 0.0
	if seed_val >= 0:
		rng.seed = seed_val
	else:
		rng.randomize()

func stop_spawning() -> void:
	active = false

func clear_pipes() -> void:
	for c in get_children():
		c.queue_free()

func spawn_one(y_override: float = -1.0, x_override: float = 480.0) -> PipePair:
	var pair := PipePair.new()
	var cy := y_override if y_override >= 0.0 else rng.randf_range(min_y, max_y)
	add_child(pair)
	pair.setup(x_override, cy, vertical_gap)
	return pair

func _process(delta: float) -> void:
	if not active:
		return
	timer += delta
	if timer >= spawn_rate:
		timer -= spawn_rate
		spawn_one()
