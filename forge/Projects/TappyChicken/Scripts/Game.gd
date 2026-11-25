extends RefCounted

# Tappy Chicken rules. Rendering, input devices, audio, and persistence belong to the host.
const WORLD := {"width": 480, "height": 640, "ground": 570}
const DEFAULTS := {
	"gravity": 1050.0,
	"flap": 345.0,
	"speed": 170.0,
	"gap": 174.0,
	"interval": 1.55,
	"pipeWidth": 78.0,
	"seed": 12345,
	"difficulty": "normal",
	"best": 0,
}
const PROFILES := {
	"easy": {"speed": 125.0, "gap": 212.0, "interval": 1.9},
	"normal": {"speed": 170.0, "gap": 174.0, "interval": 1.55},
	"hard": {"speed": 225.0, "gap": 145.0, "interval": 1.32},
}

var _settings: Dictionary = {}
var _state := "ready"
var _score := 0
var _elapsed := 0.0
var _seed := 12345
var _spawn_timer := 0.9
var _bird: Dictionary = {}
var _pipes: Array[Dictionary] = []


func reset(settings: Dictionary) -> Dictionary:
	_settings = _copy_settings(settings)
	_state = "ready"
	_score = 0
	_elapsed = 0.0
	_seed = int(_settings.seed)
	_spawn_timer = 0.9
	_bird = {"x": 135.0, "y": 290.0, "vy": 0.0, "r": 17.0, "angle": 0.0}
	_pipes.clear()
	return snapshot()


func input(action: String) -> Dictionary:
	if action == "restart":
		return reset(_settings)

	if action == "togglePause":
		if _state == "playing":
			_state = "paused"
		elif _state == "paused":
			_state = "playing"
		return snapshot()
	if action == "pause":
		if _state == "playing":
			_state = "paused"
		return snapshot()
	if action == "resume":
		if _state == "paused":
			_state = "playing"
		return snapshot()
	if action != "flap":
		return snapshot()

	if _state == "paused":
		return snapshot()
	if _state == "over":
		reset(_settings)
	if _state == "ready":
		_state = "playing"
	_bird.vy = -float(_settings.flap)
	return snapshot()


func update(dt: float) -> Dictionary:
	var step := clampf(dt, 0.0, 0.04)
	_elapsed += step
	if _state != "playing":
		return snapshot()

	_bird.vy = float(_bird.vy) + float(_settings.gravity) * step
	_bird.y = float(_bird.y) + float(_bird.vy) * step
	_bird.angle = clampf(float(_bird.vy) / 450.0, -0.55, 1.1)

	_spawn_timer -= step
	if _spawn_timer <= 0.0:
		_spawn_pipe()
		_spawn_timer = float(_settings.interval)

	if float(_bird.y) - float(_bird.r) < 0.0 or float(_bird.y) + float(_bird.r) >= float(WORLD.ground):
		_game_over()

	for index in range(_pipes.size() - 1, -1, -1):
		var pipe: Dictionary = _pipes[index]
		pipe.x = float(pipe.x) - float(_settings.speed) * step
		if not bool(pipe.passed) and float(pipe.x) + float(_settings.pipeWidth) < float(_bird.x):
			pipe.passed = true
			_score += 1
		if float(_bird.x) + float(_bird.r) - 4.0 > float(pipe.x) \
		and float(_bird.x) - float(_bird.r) + 4.0 < float(pipe.x) + float(_settings.pipeWidth) \
		and (float(_bird.y) - float(_bird.r) + 4.0 < float(pipe.top) \
		or float(_bird.y) + float(_bird.r) - 4.0 > float(pipe.bottom)):
			_game_over()
		if float(pipe.x) + float(_settings.pipeWidth) <= -10.0:
			_pipes.remove_at(index)

	return snapshot()


func snapshot() -> Dictionary:
	var pipes_copy: Array[Dictionary] = []
	for pipe in _pipes:
		pipes_copy.append({
			"x": pipe.x,
			"top": pipe.top,
			"bottom": pipe.bottom,
			"passed": pipe.passed,
		})
	var bird_copy := {
		"x": _bird.get("x", 135.0),
		"y": _bird.get("y", 290.0),
		"vy": _bird.get("vy", 0.0),
		"r": _bird.get("r", 17.0),
		"angle": _bird.get("angle", 0.0),
	}
	return {
		"state": _state,
		"score": _score,
		"best": _settings.get("best", 0),
		"elapsed": _elapsed,
		"seed": _seed,
		"difficulty": _settings.get("difficulty", "normal"),
		"bird": bird_copy,
		"pipes": pipes_copy,
		"settings": _settings.duplicate(true),
		"world": WORLD.duplicate(true),
	}


func _copy_settings(input: Dictionary) -> Dictionary:
	var settings: Dictionary = DEFAULTS.duplicate(true)
	for key in DEFAULTS:
		if input.has(key):
			settings[key] = input[key]

	var difficulty: Variant = settings.difficulty
	if not (difficulty is String and PROFILES.has(difficulty)):
		difficulty = "normal"
	settings.difficulty = difficulty
	var profile: Dictionary = PROFILES[difficulty]
	for key in profile:
		if _as_number(input.get(key, null)) == null:
			settings[key] = profile[key]

	settings.gravity = _bounded_number(settings.gravity, 0.0, 3000.0, float(DEFAULTS.gravity))
	settings.flap = _bounded_number(settings.flap, 50.0, 1000.0, float(DEFAULTS.flap))
	settings.speed = _bounded_number(settings.speed, 40.0, 450.0, float(profile.speed))
	settings.gap = _bounded_number(settings.gap, 95.0, 350.0, float(profile.gap))
	settings.interval = _bounded_number(settings.interval, 0.5, 4.0, float(profile.interval))
	settings.pipeWidth = _bounded_number(settings.pipeWidth, 25.0, 160.0, float(DEFAULTS.pipeWidth))
	settings.seed = int(floor(_bounded_number(settings.seed, 1.0, 999999.0, float(DEFAULTS.seed))))
	var best_value: Variant = _as_number(settings.best)
	settings.best = maxi(0, int(floor(float(best_value) if best_value != null else 0.0)))
	return settings


func _bounded_number(value: Variant, minimum: float, maximum: float, fallback: float) -> float:
	var number: Variant = _as_number(value)
	if number == null:
		return fallback
	return clampf(float(number), minimum, maximum)


func _as_number(value: Variant) -> Variant:
	if value is int or value is float:
		return float(value)
	if value is String:
		var text := (value as String).strip_edges()
		if text.is_valid_float():
			return text.to_float()
	return null


func _random01() -> float:
	# Match JavaScript uint32 arithmetic so the seeded sequence stays deterministic.
	_seed = (_seed * 1664525 + 1013904223) & 0xffffffff
	return float(_seed) / 4294967296.0


func _spawn_pipe() -> void:
	var center := 175.0 + _random01() * 220.0
	var half_gap := float(_settings.gap) / 2.0
	_pipes.append({
		"x": float(WORLD.width) + 30.0,
		"top": center - half_gap,
		"bottom": center + half_gap,
		"passed": false,
	})


func _game_over() -> void:
	if _state != "playing":
		return
	_state = "over"
	if _score > int(_settings.best):
		_settings.best = _score
