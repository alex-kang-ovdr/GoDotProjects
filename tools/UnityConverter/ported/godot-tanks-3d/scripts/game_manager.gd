class_name TanksGameManager
extends Node3D

## Port of Assets/_Completed-Assets/Scripts/Managers/GameManager.cs + TankManager.cs

@export var num_rounds_to_win: int = 5
@export var start_delay: float = 2.0
@export var end_delay: float = 2.5

@onready var level_loader: TanksLevelLoader = $LevelLoader
@onready var world_root: Node3D = $WorldRoot
@onready var camera_rig: TanksCameraRig = $CameraRig
@onready var message_label: RichTextLabel = $HUD/MessageText
@onready var music_player: AudioStreamPlayer = $MusicPlayer

var tanks: Array[TanksUnit] = []
var wins: Array[int] = [0, 0]
var round_number: int = 0
var phase: String = "init" # starting | playing | ending
var auto_loop: bool = true

const P1_COLOR := Color(0.16, 0.44, 0.96, 1.0)
const P2_COLOR := Color(0.86, 0.16, 0.14, 1.0)
const P1_HEX := "#2A70F5"
const P2_HEX := "#DC2924"

func _ready() -> void:
	level_loader.build_from_manifest("res://assets/level_art.json")
	_spawn_all_tanks()
	camera_rig.targets = tanks
	camera_rig.set_start_position_and_size()

	if ResourceLoader.exists("res://assets/audio/BackgroundMusic.wav"):
		music_player.stream = load("res://assets/audio/BackgroundMusic.wav")
		music_player.volume_db = -14.0
		music_player.play()

	if auto_loop:
		call_deferred("_run_game_loop")

func _spawn_all_tanks() -> void:
	# Clear open sand arena spawn positions (facing each other across central rock)
	var p1 := TanksUnit.new()
	p1.name = "Tank_P1"
	world_root.add_child(p1)
	var p2 := TanksUnit.new()
	p2.name = "Tank_P2"
	world_root.add_child(p2)
	tanks = [p1, p2]

	p1.setup(1, P1_COLOR, Vector3(14.0, 0.1, 4.0), 55.0, world_root, tanks)
	p2.setup(2, P2_COLOR, Vector3(-11.0, 0.1, -9.0), -125.0, world_root, tanks)

func start_round() -> void:
	phase = "starting"
	for t in tanks:
		t.reset_tank()
		t.control_enabled = false
	camera_rig.set_start_position_and_size()
	round_number += 1
	message_label.text = "[center]ROUND %d[/center]" % round_number

func begin_playing() -> void:
	phase = "playing"
	message_label.text = ""
	for t in tanks:
		t.control_enabled = true

func finish_round() -> String:
	phase = "ending"
	for t in tanks:
		t.control_enabled = false

	var winner_idx := -1
	for i in range(tanks.size()):
		if not tanks[i].is_dead:
			winner_idx = i
			break

	var msg := "[center]DRAW![/center]"
	if winner_idx >= 0:
		wins[winner_idx] += 1
		var hex := P1_HEX if winner_idx == 0 else P2_HEX
		var header := "[color=%s]PLAYER %d[/color] WINS THE ROUND!" % [hex, winner_idx + 1]
		if wins[winner_idx] >= num_rounds_to_win:
			header = "[color=%s]PLAYER %d[/color] WINS THE GAME!" % [hex, winner_idx + 1]
		msg = "[center]%s\n\n[color=%s]PLAYER 1[/color]: %d WINS\n[color=%s]PLAYER 2[/color]: %d WINS[/center]" % [
			header, P1_HEX, wins[0], P2_HEX, wins[1]
		]
	message_label.text = msg
	return msg

func one_tank_left() -> bool:
	var alive := 0
	for t in tanks:
		if not t.is_dead:
			alive += 1
	return alive <= 1

func _run_game_loop() -> void:
	while is_inside_tree():
		start_round()
		await get_tree().create_timer(start_delay).timeout
		begin_playing()
		while not one_tank_left():
			await get_tree().process_frame
		finish_round()
		await get_tree().create_timer(end_delay).timeout
		if wins[0] >= num_rounds_to_win or wins[1] >= num_rounds_to_win:
			wins = [0, 0]
			round_number = 0
