extends Node2D

const GameRules := preload("res://Scripts/Game.gd")
const DIGITS := preload("res://Assets/digits.svg")
const SAVE_PATH := "user://tappy_chicken_mmo_scores.cfg"
const GHOST_ALPHA := 0.5
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
@onready var ghosts_root: Node2D = $Ghosts
@onready var mmo: Node = $MmoNetwork
@onready var strips: Array[Sprite2D] = [$Ground, $Fence, $Plants, $NearHills, $FarHills, $NearClouds, $Clouds]
@onready var pipes: Node2D = $Pipes
@onready var score: Label = $Hud/Score
@onready var mmo_status: Label = $Hud/MmoStatus

var game := GameRules.new()
var _frames: Array[Texture2D] = []
var _obstacles: Array[Sprite2D] = []
var _ghosts: Dictionary = {}
var _saved_best := 0
var _last_phase := ""
var _flash_left := 0.0
var _last_score := 0
var _last_state: Dictionary = {}
var _wing_audio: AudioStreamPlayer
var _result_audio: AudioStreamPlayer
var _observer_snapshot: Dictionary = {}
var _observer_clock := 0.0


func _ready() -> void:
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

	if mmo != null:
		mmo.welcome_received.connect(_on_mmo_welcome)
		mmo.peer_event_received.connect(_on_mmo_peer_event)
		mmo.peer_removed.connect(_on_mmo_peer_removed)
		mmo.status_changed.connect(_on_mmo_status_changed)
		mmo.observer_state_received.connect(_on_mmo_observer_state)

	var initial := game.reset({"best": _saved_best, "seed": randi()})
	_last_state = initial
	_render_state(initial, 0.0)
	_update_mmo_badge(mmo.get_stats() if mmo != null else {})


func _physics_process(delta: float) -> void:
	if mmo != null and mmo.observer_only:
		_render_observer(delta)
		return
	var state := game.update(delta)
	_last_state = state
	_render_state(state, delta)
	_update_ghosts(delta, state)
	if mmo != null:
		mmo.tick_sync(delta, state)


func _unhandled_input(event: InputEvent) -> void:
	if mmo != null and mmo.observer_only:
		return
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
		var prev_phase := _last_phase
		var state := game.input(action)
		_last_state = state
		if action == "flap" and state.state == "ready":
			_play(_wing_audio, CLICK)
		elif action == "flap" and state.state == "playing":
			_play(_wing_audio, FLAPS.pick_random())
		_render_state(state, 0.0)
		_update_ghosts(0.0, state)
		if mmo != null:
			if action == "flap" and state.state == "playing":
				mmo.publish_local_event("flap", state)
			elif action in ["restart", "togglePause"] or state.state != prev_phase:
				mmo.publish_local_event("phase", state)
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
		var previous := _last_phase
		_last_phase = phase
		if mmo != null and not previous.is_empty() and phase in ["crashing", "over", "ready", "menu", "paused"]:
			mmo.publish_local_event("phase", state)
	_flash_left = maxf(0, _flash_left - delta)
	$Hud/Flash.visible = _flash_left > 0
	$Hud/Flash.modulate.a = _flash_left / 0.12

	bird.visible = true
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
				push_warning("Could not save the Tappy Chicken MMO high score.")
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
	$Hud/Status.text = "PAUSED" if phase == "paused" else "TAPPY CHICKEN MMO"
	$Hud/Hint.visible = menu or over or phase == "paused"
	if phase == "paused":
		$Hud/Hint.text = "P / ESC TO RESUME"
	else:
		$Hud/Hint.text = "TAP TO PLAY" if DisplayServer.is_touchscreen_available() else "SPACE OR CLICK TO PLAY"


# --- MMO Remote Ghosts (50% Opacity) ---

func get_ghost_count() -> int:
	return _ghosts.size()


func get_ghost_sprite(peer_id: String) -> Sprite2D:
	if not _ghosts.has(peer_id):
		return null
	return _ghosts[peer_id]["sprite"] as Sprite2D


func _on_mmo_welcome(info: Dictionary) -> void:
	var seed_value := int(info.get("course_seed", 0))
	if seed_value > 0:
		game.set_course_seed(seed_value)
	if bool(info.get("observer_only", false)):
		_enter_observer_hud()
	elif mmo != null and not _last_state.is_empty():
		mmo.publish_local_event("join", _last_state)


func _on_mmo_peer_event(peer_id: String, event: Dictionary) -> void:
	var ghost: Dictionary
	if not _ghosts.has(peer_id):
		ghost = _create_ghost(peer_id, str(event.get("name", peer_id)))
		_ghosts[peer_id] = ghost
	else:
		ghost = _ghosts[peer_id]

	var event_type := str(event.get("event_type", event.get("eventType", "sync")))
	var incoming_name := str(event.get("name", ghost["name"]))
	if not incoming_name.is_empty():
		ghost["name"] = incoming_name

	var incoming_dist := float(event.get("run_distance", event.get("runDistance", ghost["run_distance"])))
	var incoming_y := float(event.get("y", ghost["y"]))
	var incoming_vy := float(event.get("vy", ghost["vy"]))
	var incoming_angle := float(event.get("angle", ghost["angle"]))
	var incoming_flap_time := float(event.get("flap_time", event.get("flapTime", ghost["flap_time"])))
	var incoming_phase := str(event.get("phase", ghost["phase"]))
	var incoming_score := int(event.get("score", ghost["score"]))

	var hard_snap := (
		not bool(ghost["initialized"])
		or event_type in ["join", "phase"]
		or incoming_phase != str(ghost["phase"])
		or absf(incoming_dist - float(ghost["run_distance"])) > 64.0
		or absf(incoming_y - float(ghost["y"])) > 64.0
	)
	if hard_snap:
		ghost["run_distance"] = incoming_dist
		ghost["y"] = incoming_y
	else:
		ghost["run_distance"] = lerpf(float(ghost["run_distance"]), incoming_dist, 0.65)
		ghost["y"] = lerpf(float(ghost["y"]), incoming_y, 0.65)

	ghost["vy"] = incoming_vy
	ghost["angle"] = incoming_angle
	ghost["flap_time"] = 0.0 if event_type == "flap" else incoming_flap_time
	ghost["phase"] = incoming_phase
	ghost["score"] = incoming_score
	ghost["initialized"] = true
	ghost["last_event"] = event_type
	_update_ghost_visual(ghost, _last_state)


func _on_mmo_peer_removed(peer_id: String) -> void:
	if not _ghosts.has(peer_id):
		return
	var ghost: Dictionary = _ghosts[peer_id]
	var container: Node2D = ghost["container"]
	if is_instance_valid(container):
		container.queue_free()
	_ghosts.erase(peer_id)


func _on_mmo_status_changed(status: Dictionary) -> void:
	_update_mmo_badge(status)


func _on_mmo_observer_state(snapshot: Dictionary) -> void:
	_observer_snapshot = snapshot
	_enter_observer_hud()


func _create_ghost(peer_id: String, nickname: String) -> Dictionary:
	var container := Node2D.new()
	container.name = "Ghost_" + peer_id.replace("-", "_")

	var sprite := Sprite2D.new()
	sprite.texture = _frames[0] if not _frames.is_empty() else bird.texture
	sprite.scale = Vector2(2, 2)
	sprite.texture_filter = CanvasItem.TEXTURE_FILTER_NEAREST
	# Exactly 50% transparency for other players' chickens.
	sprite.modulate = Color(1.0, 1.0, 1.0, GHOST_ALPHA)
	container.add_child(sprite)

	var tag := Label.new()
	tag.position = Vector2(-48, -38)
	tag.size = Vector2(96, 18)
	tag.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	tag.mouse_filter = Control.MOUSE_FILTER_IGNORE
	tag.add_theme_font_size_override("font_size", 11)
	tag.add_theme_color_override("font_color", Color(1.0, 1.0, 1.0, 1.0))
	tag.add_theme_color_override("font_outline_color", Color(0.1, 0.08, 0.06, 1.0))
	tag.add_theme_constant_override("outline_size", 3)
	tag.modulate = Color(1.0, 1.0, 1.0, GHOST_ALPHA)
	tag.text = nickname
	container.add_child(tag)

	ghosts_root.add_child(container)
	return {
		"id": peer_id,
		"name": nickname,
		"container": container,
		"sprite": sprite,
		"tag": tag,
		"run_distance": 0.0,
		"y": 290.0,
		"vy": 0.0,
		"angle": 0.0,
		"flap_time": 0.0,
		"phase": "menu",
		"score": 0,
		"anim_clock": 0.0,
		"initialized": false,
		"last_event": "join",
	}


func _update_ghosts(delta: float, local_state: Dictionary) -> void:
	var step := clampf(delta, 0.0, 0.04)
	var settings: Dictionary = local_state.get("settings", GameRules.DEFAULTS)
	var speed := float(settings.get("speed", GameRules.DEFAULTS.speed))
	var gravity := float(settings.get("gravity", GameRules.DEFAULTS.gravity))
	var ground := float(GameRules.WORLD.ground)

	for peer_id in _ghosts.keys():
		var ghost: Dictionary = _ghosts[peer_id]
		var phase: String = str(ghost["phase"])
		if phase != "paused":
			ghost["anim_clock"] = float(ghost["anim_clock"]) + step
		if phase == "playing" and step > 0.0:
			ghost["run_distance"] = float(ghost["run_distance"]) + speed * step
			var next_flap_time := float(ghost["flap_time"]) + step * gravity / float(GameRules.DEFAULTS.gravity)
			ghost["flap_time"] = next_flap_time
			var curve := GameRules.sample_flight_curve(next_flap_time, settings)
			ghost["vy"] = float(curve["vy"])
			ghost["y"] = clampf(float(ghost["y"]) + float(ghost["vy"]) * step, 17.0, ground - 17.0)
			ghost["angle"] = float(curve["angle"])
		elif phase == "crashing" and step > 0.0:
			ghost["vy"] = float(ghost["vy"]) + gravity * step
			ghost["y"] = minf(ground - 17.0, float(ghost["y"]) + float(ghost["vy"]) * step)
			ghost["angle"] = move_toward(float(ghost["angle"]), PI / 2, 4.5 * step)
			if float(ghost["y"]) >= ground - 17.0:
				ghost["phase"] = "over"
		_update_ghost_visual(ghost, local_state)


func _update_ghost_visual(ghost: Dictionary, local_state: Dictionary) -> void:
	var container: Node2D = ghost["container"]
	var sprite: Sprite2D = ghost["sprite"]
	var tag: Label = ghost["tag"]
	if not is_instance_valid(container) or not is_instance_valid(sprite):
		return

	var local_dist := float(local_state.get("run_distance", 0.0))
	var phase := str(ghost["phase"])
	var anim_clock := float(ghost["anim_clock"])
	var ghost_x := 135.0 + (float(ghost["run_distance"]) - local_dist)
	var ghost_y := float(ghost["y"])
	if phase in ["menu", "ready"]:
		ghost_y += roundf(6.0 * sin(anim_clock * 3.5))

	container.position = Vector2(ghost_x, ghost_y)
	container.visible = ghost_x > -80.0 and ghost_x < float(GameRules.WORLD.width) + 80.0
	sprite.rotation = float(ghost["angle"])
	sprite.modulate = Color(1.0, 1.0, 1.0, GHOST_ALPHA)
	if not _frames.is_empty():
		sprite.texture = _frames[3] if phase in ["over", "crashing"] else _frames[int(anim_clock / 0.05) % 3]
	if is_instance_valid(tag):
		var score_val := int(ghost["score"])
		var safe_name := _ascii_ghost_name(str(ghost["name"]), str(ghost["id"]))
		tag.text = "%s (%d)" % [safe_name, score_val] if score_val > 0 else safe_name
		tag.modulate = Color(1.0, 1.0, 1.0, GHOST_ALPHA)


func _ascii_ghost_name(raw_name: String, peer_id: String) -> String:
	var normalized := raw_name.replace("클라이언트", "Client").replace("플레이어", "Player")
	var out := ""
	for i in normalized.length():
		var code := normalized.unicode_at(i)
		if code >= 32 and code <= 126:
			out += normalized.substr(i, 1)
	out = out.strip_edges().left(18)
	return out if not out.is_empty() else ("P-" + peer_id.right(4))


func _enter_observer_hud() -> void:
	bird.visible = false
	$Hud/Logo.visible = false
	$Hud/Play.visible = false
	$Hud/Ready.visible = false
	$Hud/Go.visible = false
	$Hud/GameOver.visible = false
	$Hud/Board.visible = false
	$Hud/Egg.visible = false
	$Hud/RoundScore.visible = false
	$Hud/Best.visible = false
	score.visible = false
	$Hud/Status.visible = true
	$Hud/Status.text = "MMO SERVER VIEW"
	$Hud/Hint.visible = true
	$Hud/Hint.text = "SPATIAL RPC MULTICAST OBSERVER"


func _render_observer(delta: float) -> void:
	_observer_clock += delta
	var players: Array = _observer_snapshot.get("players", [])
	var camera_dist := 0.0
	var active_ids := {}
	for entry in players:
		if not entry is Dictionary:
			continue
		var dist := float(entry.get("runDistance", 0.0))
		if dist > camera_dist:
			camera_dist = dist
	for i in strips.size():
		var strip := strips[i]
		var region := strip.region_rect
		region.position.x = floorf(fposmod(camera_dist * PAN_RATES[i] / strip.scale.x, strip.texture.get_width()))
		strip.region_rect = region
	_sync_obstacles([], float(GameRules.DEFAULTS.pipeWidth))

	var virtual_state := {"run_distance": camera_dist, "settings": GameRules.DEFAULTS}
	for entry in players:
		if not entry is Dictionary:
			continue
		var pid := str(entry.get("id", ""))
		if pid.is_empty():
			continue
		active_ids[pid] = true
		_on_mmo_peer_event(pid, {
			"event_type": "sync",
			"name": str(entry.get("name", pid)),
			"run_distance": float(entry.get("runDistance", 0.0)),
			"y": float(entry.get("y", 290.0)),
			"vy": float(entry.get("vy", 0.0)),
			"angle": float(entry.get("angle", 0.0)),
			"flap_time": float(entry.get("flapTime", 0.0)),
			"phase": str(entry.get("phase", "menu")),
			"score": int(entry.get("score", 0)),
		})
	for existing_id in _ghosts.keys():
		if not active_ids.has(existing_id):
			_on_mmo_peer_removed(existing_id)
	_update_ghosts(delta, virtual_state)


func _update_mmo_badge(status: Dictionary) -> void:
	if not is_instance_valid(mmo_status):
		return
	var mode := str(status.get("mode", "offline"))
	var is_connected := bool(status.get("connected", false))
	var online := int(status.get("online_count", 1))
	var nearby := int(status.get("nearby_count", _ghosts.size()))
	if mode == "offline":
		mmo_status.text = "SOLO · OFFLINE"
	elif bool(status.get("observer_only", false)):
		mmo_status.text = "MMO SERVER · ONLINE %d" % online
	elif is_connected:
		mmo_status.text = "MMO · NEARBY %d · ONLINE %d" % [nearby, online]
	else:
		mmo_status.text = "MMO · CONNECTING..."


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
