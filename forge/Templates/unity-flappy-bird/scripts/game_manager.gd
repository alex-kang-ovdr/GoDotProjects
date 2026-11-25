class_name FlappyGameManager
extends Node2D

## Port of Assets/Scripts/GameManager.cs

@onready var player: FlappyPlayer = $Player
@onready var spawner: PipeSpawner = $Spawner
@onready var background: ParallaxScroll = $Background
@onready var ground: ParallaxScroll = $Ground
@onready var score_label: Label = $HUD/ScoreText
@onready var get_ready_tex: TextureRect = $HUD/GetReady
@onready var game_over_tex: TextureRect = $HUD/GameOver
@onready var play_button: TextureButton = $HUD/PlayButton

var score: int = 0
var state: String = "ready" # ready | playing | gameover

func _ready() -> void:
	player.hit_obstacle.connect(game_over)
	player.scored_point.connect(increase_score)
	play_button.pressed.connect(play)
	enter_ready_state()

func enter_ready_state() -> void:
	state = "ready"
	score = 0
	score_label.text = "0"
	get_ready_tex.visible = true
	game_over_tex.visible = false
	play_button.visible = true
	player.active = false
	player.reset_bird()
	spawner.stop_spawning()
	spawner.clear_pipes()
	background.active = true
	ground.active = true

func play(seed_val: int = -1) -> void:
	state = "playing"
	score = 0
	score_label.text = "0"
	get_ready_tex.visible = false
	game_over_tex.visible = false
	play_button.visible = false
	spawner.clear_pipes()
	spawner.start_spawning(seed_val)
	player.reset_bird()
	player.active = true
	background.active = true
	ground.active = true

func game_over() -> void:
	if state == "gameover":
		return
	state = "gameover"
	player.active = false
	spawner.stop_spawning()
	background.active = false
	ground.active = false
	get_ready_tex.visible = false
	game_over_tex.visible = true
	play_button.visible = true

func increase_score() -> void:
	score += 1
	score_label.text = str(score)

func _unhandled_input(event: InputEvent) -> void:
	if state == "playing":
		return
	var triggered := event.is_action_pressed("ui_accept")
	if event is InputEventScreenTouch and event.pressed:
		triggered = true
	elif event is InputEventMouseButton and event.pressed and event.button_index == MOUSE_BUTTON_LEFT and event.device != InputEvent.DEVICE_ID_EMULATION:
		triggered = true
	if triggered:
		play()
		get_viewport().set_input_as_handled()
