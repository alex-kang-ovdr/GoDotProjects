extends Node2D

const GameRules := preload("res://Scripts/Game.gd")
const DIGITS := preload("res://Assets/digits.svg")
const SAVE_PATH := "user://tappy_chicken_scores.cfg"
# Ground, fence, plants, near/far hills, near/far clouds in BP_MainGame.
const PAN_RATES := [1.0, 0.8, 0.7, 0.5, 0.3, 0.3, 0.2]
const FLAPS := [
	preload("res://Assets/Audio/SFX_FlapWing_01.tres"), preload("res://Assets/Audio/SFX_FlapWing_02.tres"),
	preload("res://Assets/Audio/SFX_FlapWing_03.tres"), preload("res://Assets/Audio/SFX_FlapWing_04.tres"),
]
const CLICK := preload("res://Assets/Audio/SFX_Click_01.tres")
const SCORE_SOUND := preload("res://Assets/Audio/SFX_Score_01.tres")
const WOOD_HIT := preload("res://Assets/Audio/SFX_HitObstacle_01.tres")
const GROUND_HIT := preload("res://Assets/Audio/SFX_HitGround_01.tres")

@onready var bird: Sprite2D = $Bird
@onready var strips: Array[Sprite2D] = [$Ground, $Fence, $Plants, $NearHills, $FarHills, $NearClouds, $Clouds]
@onready var pipes: Node2D = $Pipes
@onready var score: Label = $Hud/Score

var game := GameRules.new()
var _frames: Array[Texture2D] = []
var _obstacles: Array[Sprite2D] = []
var _saved_best := 0
var _last_phase := ""
var _flash_left := 0.0
var _last_score := 0
var _wing_audio: AudioStreamPlayer
var _result_audio: AudioStreamPlayer


func _ready() -> void:
	if get_tree().root != null:
		get_tree().root.set_meta("playhub_native_touch_controls", true)
	_frames.append(bird.texture)
	for filename in ["chicken-wing-up", "chicken-wing-down", "chicken-hit"]:
		var path := "res://Assets/%s.svg" % filename
		var frame := load(path) as Texture2D if ResourceLoader.exists(path) else bird.texture
		_frames.append(frame)
	_install_score_font()
	_wing_audio = AudioStreamPlayer.new()
	_result_audio = AudioStreamPlayer.new()
	add_child(_wing_audio)
	add_child(_result_audio)
	var save := ConfigFile.new()
	if FileAccess.file_exists(SAVE_PATH) and save.load(SAVE_PATH) == OK:
		_saved_best = maxi(0, int(save.get_value("scores", "best", 0)))
	_render_state(game.reset({"best": _saved_best, "seed": randi()}), 0.0)


func _physics_process(delta: float) -> void:
	_render_state(game.update(delta), delta)


func _unhandled_input(event: InputEvent) -> void:
	var action := ""
	if event is InputEventKey and event.pressed and not event.echo:
		match event.keycode:
			KEY_SPACE, KEY_ENTER, KEY_UP, KEY_W:
				action = "flap"
			KEY_P, KEY_ESCAPE:
				action = "togglePause"
			KEY_R:
				action = "restart"
	elif event is InputEventMouseButton and event.pressed and event.button_index == MOUSE_BUTTON_LEFT and event.device != InputEvent.DEVICE_ID_EMULATION:
		if _accept_tap(event.position):
			action = "flap"
	elif event is InputEventScreenTouch and event.pressed:
		if _accept_tap(event.position):
			action = "flap"
	if not action.is_empty():
		var state := game.input(action)
		if action == "flap" and state.state == "ready":
			_play(_wing_audio, CLICK)
		elif action == "flap" and state.state == "playing":
			_play(_wing_audio, FLAPS.pick_random())
		_render_state(state, 0.0)
		get_viewport().set_input_as_handled()


func _accept_tap(point: Vector2) -> bool:
	if _last_phase not in ["menu", "over"]:
		return true
	var play: Sprite2D = $Hud/Play
	return play.get_rect().has_point(play.get_global_transform_with_canvas().affine_inverse() * point)


func _render_state(state: Dictionary, delta: float) -> void:
	var phase: String = state.state
	var clock: float = state.elapsed
	if phase != _last_phase:
		if _last_phase == "playing" and phase in ["crashing", "over"]:
			_flash_left = 0.12
			_wing_audio.stop()
			_play(_result_audio, WOOD_HIT if phase == "crashing" else GROUND_HIT)
		elif _last_phase == "crashing" and phase == "over":
			_play(_result_audio, GROUND_HIT)
		_show_hud(phase)
		_last_phase = phase
	_flash_left = maxf(0, _flash_left - delta)
	$Hud/Flash.visible = _flash_left > 0
	$Hud/Flash.modulate.a = _flash_left / 0.12

	var flying := phase in ["playing", "paused"]
	bird.position = Vector2(state.bird.x, state.bird.y)
	bird.rotation = state.bird.angle
	if phase in ["menu", "ready"]:
		if phase == "menu":
			bird.position.x = 240
		bird.position.y += roundf(6 * sin(clock * 3.5))
	bird.texture = _frames[3] if phase in ["over", "crashing"] else _frames[int(clock / 0.05) % 3]
	if flying:
		score.text = str(state.score)
	if state.score > _last_score:
		_play(_result_audio, SCORE_SOUND)
	_last_score = state.score
	if phase == "over":
		$Hud/RoundScore.text = str(state.score)
		$Hud/Best.text = str(state.best)
		if state.best > _saved_best:
			_saved_best = state.best
			var save := ConfigFile.new()
			save.set_value("scores", "best", _saved_best)
			if save.save(SAVE_PATH) != OK:
				push_warning("Could not save the Tappy Chicken high score.")
	for i in strips.size():
		var strip := strips[i]
		var region := strip.region_rect
		region.position.x = floorf(fposmod(float(state.scroll) * PAN_RATES[i] / strip.scale.x, strip.texture.get_width()))
		strip.region_rect = region
	_sync_obstacles(state.pipes, state.settings.pipeWidth)


func _show_hud(phase: String) -> void:
	var menu := phase == "menu"
	var ready := phase == "ready"
	var over := phase == "over"
	$Hud/Logo.visible = menu
	$Hud/Play.visible = menu or over
	$Hud/Ready.visible = ready
	$Hud/Go.visible = ready
	$Hud/GameOver.visible = over
	$Hud/Board.visible = over
	$Hud/Egg.visible = over
	$Hud/RoundScore.visible = over
	$Hud/Best.visible = over
	score.visible = phase in ["playing", "paused", "crashing"]
	$Hud/Status.visible = phase == "paused"
	$Hud/Status.text = "PAUSED" if phase == "paused" else "TAPPY CHICKEN"
	$Hud/Hint.visible = menu or over or phase == "paused"
	if phase == "paused":
		$Hud/Hint.text = "P / ESC TO RESUME"
	else:
		$Hud/Hint.text = "TAP TO PLAY" if DisplayServer.is_touchscreen_available() else "SPACE OR CLICK TO PLAY"


func _play(player: AudioStreamPlayer, stream: AudioStream) -> void:
	player.stream = stream
	player.play()


func _sync_obstacles(pairs: Array, width: float) -> void:
	while _obstacles.size() < pairs.size() * 2:
		var upper := Sprite2D.new()
		upper.texture = $UpperPipeTexture.texture
		pipes.add_child(upper)
		_obstacles.append(upper)
		var lower := Sprite2D.new()
		lower.texture = $PipeTextureReference.texture
		pipes.add_child(lower)
		_obstacles.append(lower)
	for i in _obstacles.size():
		_obstacles[i].visible = i < pairs.size() * 2
	for i in pairs.size():
		var pair: Dictionary = pairs[i]
		var x := float(pair.x) + width / 2
		var upper := _obstacles[i * 2]
		var lower := _obstacles[i * 2 + 1]
		var factor := width / upper.texture.get_width()
		upper.scale = Vector2.ONE * factor
		lower.scale = upper.scale
		upper.position = Vector2(x, float(pair.top) - upper.texture.get_height() * factor / 2)
		lower.position = Vector2(x, float(pair.bottom) + lower.texture.get_height() * factor / 2)


func _install_score_font() -> void:
	var font := FontFile.new()
	var cache := Vector2i(10, 0)
	font.fixed_size = 10
	font.fixed_size_scale_mode = TextServer.FIXED_SIZE_SCALE_ENABLED
	font.set_texture_image(0, cache, 0, DIGITS.get_image())
	font.set_cache_ascent(0, 10, 8)
	font.set_cache_descent(0, 10, 2)
	for digit in 10:
		var glyph := "0".unicode_at(0) + digit
		var width := 4 if digit == 1 else 7
		font.set_glyph_advance(0, 10, glyph, Vector2(width + 1, 0))
		font.set_glyph_offset(0, cache, glyph, Vector2(0, -8))
		font.set_glyph_size(0, cache, glyph, Vector2(width, 10))
		font.set_glyph_uv_rect(0, cache, glyph, Rect2(digit * 8, 0, width, 10))
		font.set_glyph_texture_idx(0, cache, glyph, 0)
	var style := score.label_settings.duplicate() as LabelSettings
	style.font = font
	style.outline_size = 0
	style.font_size = 30
	for field: Label in [score, $Hud/RoundScore, $Hud/Best]:
		field.label_settings = style
		field.texture_filter = CanvasItem.TEXTURE_FILTER_NEAREST
