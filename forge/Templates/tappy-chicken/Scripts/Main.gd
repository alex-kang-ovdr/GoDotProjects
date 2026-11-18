extends Node2D

const GameRules = preload("res://Scripts/Game.gd")
const PIPE_TEXTURE: Texture2D = preload("res://Assets/pipe.svg")
const PIPE_SOURCE_SIZE := Vector2(88.0, 600.0)

@onready var bird: Sprite2D = $Bird
@onready var pipes_root: Node2D = $Pipes
@onready var score_label: Label = $Hud/Score
@onready var status_label: Label = $Hud/Status
@onready var hint_label: Label = $Hud/Hint

var game: RefCounted = GameRules.new()
var _pipe_sprites: Array[Sprite2D] = []


func _ready() -> void:
	game.call("reset", {})
	_refresh()


func _process(delta: float) -> void:
	game.call("update", delta)
	_refresh()


func _unhandled_input(event: InputEvent) -> void:
	if event is InputEventKey and event.pressed and not event.echo:
		if event.keycode == KEY_ESCAPE or event.keycode == KEY_P:
			game.call("input", "togglePause")
			get_viewport().set_input_as_handled()
		elif event.keycode == KEY_R:
			game.call("input", "restart")
			get_viewport().set_input_as_handled()
		elif event.keycode == KEY_SPACE or event.keycode == KEY_UP or event.keycode == KEY_W:
			game.call("input", "flap")
			get_viewport().set_input_as_handled()
	elif event is InputEventMouseButton and event.pressed and event.button_index == MOUSE_BUTTON_LEFT:
		game.call("input", "flap")
		get_viewport().set_input_as_handled()
	elif event is InputEventScreenTouch and event.pressed:
		game.call("input", "flap")
		get_viewport().set_input_as_handled()


func _refresh() -> void:
	var state: Dictionary = game.call("snapshot")
	var bird_state: Dictionary = state.bird
	bird.position = Vector2(float(bird_state.x), float(bird_state.y))
	bird.rotation = float(bird_state.angle)
	score_label.text = str(state.score)
	match state.state:
		"ready":
			status_label.text = "TAPPY CHICKEN"
			hint_label.text = "SPACE / CLICK / TAP TO FLAP"
		"playing":
			status_label.text = ""
			hint_label.text = "P / ESC TO PAUSE"
		"paused":
			status_label.text = "PAUSED"
			hint_label.text = "P / ESC TO RESUME · R TO RESTART"
		"over":
			status_label.text = "GAME OVER · BEST %d" % int(state.best)
			hint_label.text = "SPACE / CLICK / TAP TO TRY AGAIN"
	_sync_pipes(state.pipes)


func _sync_pipes(pipe_states: Array) -> void:
	while _pipe_sprites.size() < pipe_states.size() * 2:
		var sprite := Sprite2D.new()
		sprite.texture = PIPE_TEXTURE
		pipes_root.add_child(sprite)
		_pipe_sprites.append(sprite)
	for index in range(_pipe_sprites.size()):
		_pipe_sprites[index].visible = index < pipe_states.size() * 2
	for index in range(pipe_states.size()):
		var pipe: Dictionary = pipe_states[index]
		var x := float(pipe.x)
		var top := float(pipe.top)
		var bottom := float(pipe.bottom)
		var top_sprite := _pipe_sprites[index * 2]
		top_sprite.position = Vector2(x + 39.0, top * 0.5)
		top_sprite.scale = Vector2(78.0 / PIPE_SOURCE_SIZE.x, top / PIPE_SOURCE_SIZE.y)
		top_sprite.flip_v = true
		var bottom_sprite := _pipe_sprites[index * 2 + 1]
		bottom_sprite.position = Vector2(x + 39.0, (bottom + 570.0) * 0.5)
		bottom_sprite.scale = Vector2(78.0 / PIPE_SOURCE_SIZE.x, (570.0 - bottom) / PIPE_SOURCE_SIZE.y)
		bottom_sprite.flip_v = false
