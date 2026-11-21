class_name PipePair
extends Node2D

## Port of Assets/Scripts/Pipes.cs
## Unity 1 unit = 48 px in 432x768 (3x of 144x256 original pixel canvas)

@export var speed: float = 160.0
@export var gap: float = 148.0
var left_edge: float = -80.0
var scored: bool = false

func setup(spawn_x: float, center_y: float, gap_px: float) -> void:
	position = Vector2(spawn_x, center_y)
	gap = gap_px

	var pipe_tex: Texture2D = load("res://assets/sprites/Pipe.tres")
	var half_h := 240.0 # 160px * 3x / 2

	# Top pipe (flipped vertically)
	var top_area := Area2D.new()
	top_area.name = "TopPipe"
	top_area.position = Vector2(0.0, -(gap * 0.5 + half_h))
	top_area.set_meta("unity_tag", "Obstacle")
	add_child(top_area)

	var top_sprite := Sprite2D.new()
	top_sprite.texture = pipe_tex
	top_sprite.scale = Vector2(3.0, -3.0)
	top_area.add_child(top_sprite)

	var top_col := CollisionShape2D.new()
	var top_rect := RectangleShape2D.new()
	top_rect.size = Vector2(72.0, 480.0)
	top_col.shape = top_rect
	top_area.add_child(top_col)

	# Bottom pipe
	var bot_area := Area2D.new()
	bot_area.name = "BottomPipe"
	bot_area.position = Vector2(0.0, gap * 0.5 + half_h)
	bot_area.set_meta("unity_tag", "Obstacle")
	add_child(bot_area)

	var bot_sprite := Sprite2D.new()
	bot_sprite.texture = pipe_tex
	bot_sprite.scale = Vector2(3.0, 3.0)
	bot_area.add_child(bot_sprite)

	var bot_col := CollisionShape2D.new()
	var bot_rect := RectangleShape2D.new()
	bot_rect.size = Vector2(72.0, 480.0)
	bot_col.shape = bot_rect
	bot_area.add_child(bot_col)

	# Scoring trigger zone between pipes
	var score_area := Area2D.new()
	score_area.name = "ScoringZone"
	score_area.set_meta("unity_tag", "Scoring")
	add_child(score_area)

	var sc_col := CollisionShape2D.new()
	var sc_rect := RectangleShape2D.new()
	sc_rect.size = Vector2(18.0, gap)
	sc_col.shape = sc_rect
	score_area.add_child(sc_col)

func _process(delta: float) -> void:
	position.x -= speed * delta
	if position.x < left_edge:
		queue_free()
