class_name FlappyPlayer
extends Area2D

## Port of Assets/Scripts/Player.cs
## Unity Y-up (strength=+5, gravity=-9.81) -> Godot Y-down (strength=-320, gravity=+920)

signal hit_obstacle
signal scored_point

@export var strength: float = 320.0
@export var fall_gravity: float = 920.0
@export var tilt_factor: float = 0.09

var velocity_y: float = 0.0
var active: bool = false
var start_pos: Vector2 = Vector2(126.0, 320.0)
var ground_y: float = 592.0

var sprite_frames: Array[Texture2D] = []
var sprite_index: int = 0
var anim_timer: float = 0.0
@onready var sprite: Sprite2D = $Sprite2D

func _ready() -> void:
	sprite_frames = [
		load("res://assets/sprites/Bird_01.tres"),
		load("res://assets/sprites/Bird_02.tres"),
		load("res://assets/sprites/Bird_03.tres"),
	]
	sprite.texture = sprite_frames[0]
	reset_bird()
	area_entered.connect(_on_area_entered)

func reset_bird() -> void:
	position = start_pos
	velocity_y = 0.0
	rotation_degrees = 0.0

func flap() -> void:
	velocity_y = -strength

func _process(delta: float) -> void:
	# AnimateSprite every 0.15s (InvokeRepeating equivalent)
	anim_timer += delta
	if anim_timer >= 0.15:
		anim_timer -= 0.15
		sprite_index = (sprite_index + 1) % sprite_frames.size()
		sprite.texture = sprite_frames[sprite_index]

	if not active:
		return

	if Input.is_action_just_pressed("ui_accept") or Input.is_mouse_button_pressed(MOUSE_BUTTON_LEFT):
		flap()

	velocity_y += fall_gravity * delta
	position.y += velocity_y * delta
	rotation_degrees = clamp(velocity_y * tilt_factor, -30.0, 75.0)

	if position.y >= ground_y:
		position.y = ground_y
		hit_obstacle.emit()
	elif position.y < 20.0:
		position.y = 20.0
		velocity_y = 0.0

func _on_area_entered(other: Area2D) -> void:
	if not active:
		return
	var tag: String = other.get_meta("unity_tag", "")
	if tag == "Obstacle":
		hit_obstacle.emit()
	elif tag == "Scoring":
		var parent_pipe := other.get_parent() as PipePair
		if parent_pipe and not parent_pipe.scored:
			parent_pipe.scored = true
			scored_point.emit()
