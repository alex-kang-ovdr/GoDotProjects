extends Node3D
## Composition root. Simulation never accesses UI, OS input or save files.
const Sim = preload("res://scripts/arena_sim.gd")
const World = preload("res://scripts/arena_world.gd")
const HUD = preload("res://scripts/arena_hud.gd")
const Store = preload("res://scripts/save_store.gd")
const Audio = preload("res://scripts/arena_audio.gd")
const Stick = preload("res://scripts/touch_stick.gd")

var sim = Sim.new()
var world: Node3D
var hud: CanvasLayer
var sound: Node
var stick: Control
var store
var profile: Dictionary = {}
var build_open: bool = false
var autosave_clock: float = 0.0
var hud_clock: float = 0.0
var previous_state: String = ""
var previous_kills: int = 0
var previous_hp: float = 160.0
var previous_xp: float = 0.0
var previous_evos: int = 0
var previous_bosses: int = 0
var previous_shot_id: int = 0
var last_options: Dictionary = {}
var qa_mode: bool = false
var profile_dirty: bool = false
var settings_save_clock: float = 0.0
var profile_error_reported: bool = false
var preview_chapter: int = 0
var preview_weapon: String = "kunai"

func _ready() -> void:
	qa_mode = "--qa" in OS.get_cmdline_user_args()
	store = Store.new("user://qa_session/" if qa_mode else "user://")
	profile = store.default_profile() if qa_mode else store.load_profile()
	last_options = profile.get("last_options", {}).duplicate(true)
	preview_chapter = int(last_options.get("chapter",0))
	preview_weapon = str(last_options.get("weapon","kunai"))
	get_window().size_changed.connect(_resize_viewport)
	_resize_viewport()
	_install_input()
	world = World.new()
	world.name = "ArenaWorld"
	add_child(world)
	world.setup()
	_preview()
	hud = HUD.new()
	hud.name = "ArenaHUD"
	add_child(hud)
	hud.setup(sim.catalog)
	hud.start_requested.connect(_start)
	hud.continue_requested.connect(_continue)
	hud.choice_selected.connect(_choose)
	hud.reroll_requested.connect(_reroll)
	hud.pause_requested.connect(_pause)
	hud.resume_requested.connect(_resume)
	hud.save_quit_requested.connect(_save_quit)
	hud.lobby_requested.connect(_lobby)
	hud.restart_requested.connect(_restart)
	hud.build_requested.connect(_toggle_build)
	hud.settings_changed.connect(_settings)
	var touch_layer = CanvasLayer.new()
	touch_layer.layer = 20
	add_child(touch_layer)
	stick = Stick.new()
	touch_layer.add_child(stick)
	sound = Audio.new()
	add_child(sound)
	_apply_settings()
	get_tree().auto_accept_quit = false
	_refresh()
	if "--capture" in OS.get_cmdline_user_args():
		call_deferred("_capture_qa")

func _resize_viewport() -> void:
	var dimensions: Vector2i = get_window().size
	if dimensions.x <= 0 or dimensions.y <= 0:
		return
	var aspect: float = float(dimensions.x) / dimensions.y
	var target: Vector2i = Vector2i(1280,800)
	if aspect < 0.85:
		var width: int = clampi(dimensions.x,390,600)
		target = Vector2i(width,roundi(width / aspect))
	if get_window().content_scale_size != target:
		get_window().content_scale_size = target

func _install_input() -> void:
	var bindings: Dictionary = {"move_left":[KEY_A,KEY_LEFT], "move_right":[KEY_D,KEY_RIGHT], "move_up":[KEY_W,KEY_UP], "move_down":[KEY_S,KEY_DOWN]}
	for action in bindings:
		if not InputMap.has_action(action):
			InputMap.add_action(action,0.08)
		for key in bindings[action]:
			var event = InputEventKey.new()
			event.physical_keycode = key
			InputMap.action_add_event(action,event)

func _physics_process(delta: float) -> void:
	if not is_instance_valid(hud):
		return
	if profile_dirty:
		settings_save_clock += delta
		if settings_save_clock >= 0.35:
			_flush_profile()
	stick.enabled = sim.state == "playing"
	var movement: Vector2 = Input.get_vector("move_left","move_right","move_up","move_down")
	if stick.vector.length_squared() > movement.length_squared():
		movement = stick.vector
	sim.step(delta, movement.limit_length(1.0))
	if sim.state != previous_state:
		_on_state_changed()
	if sim.state == "playing":
		autosave_clock += delta
		if autosave_clock >= 15.0:
			autosave_clock = 0.0
			_checkpoint()
		_check_audio()
	hud_clock += delta
	if hud_clock >= 0.08:
		hud_clock = 0.0
		_refresh()

func _process(delta: float) -> void:
	if is_instance_valid(world):
		world.sync(sim, delta)

func _on_state_changed() -> void:
	previous_state = sim.state
	_clear_input()
	match sim.state:
		"choice", "chest":
			sound.play("level")
			_checkpoint()
		"won", "lost":
			sound.play("win" if sim.state == "won" else "loss")
			_settle()
		"paused":
			_checkpoint()
	_refresh()

func _check_audio() -> void:
	if not sim.shots.is_empty():
		var newest_id: int = int(sim.shots.back().get("id",0))
		if newest_id > previous_shot_id:
			sound.play("shot")
			previous_shot_id = newest_id
	var kills: int = int(sim.stats.get("kills",0))
	if kills > previous_kills:
		sound.play("kill")
	if sim.player.hp < previous_hp:
		sound.play("hit")
	if sim.player.xp > previous_xp:
		sound.play("pickup")
	if int(sim.stats.get("evolutions",0)) > previous_evos:
		sound.play("evolve")
	var bosses: int = 0
	for enemy in sim.enemies:
		if enemy.type == "boss" and enemy.hp > 0:
			bosses += 1
	if bosses > previous_bosses:
		sound.play("boss")
	previous_kills = kills
	previous_hp = sim.player.hp
	previous_xp = sim.player.xp
	previous_evos = int(sim.stats.get("evolutions",0))
	previous_bosses = bosses

func _start(options: Dictionary) -> void:
	last_options = options.duplicate(true)
	build_open = false
	hud.hide_build()
	sim.start(last_options)
	world.set_chapter(int(sim.config.get("chapter",0)))
	profile.runs += 1
	profile.last_options = last_options
	preview_chapter = int(sim.config.chapter)
	preview_weapon = str(sim.config.weapon)
	profile_dirty = true
	_flush_profile()
	autosave_clock = 0.0
	previous_kills = 0
	previous_hp = sim.player.hp
	previous_xp = 0.0
	previous_evos = 0
	previous_bosses = 0
	previous_shot_id = 0
	_checkpoint()
	sound.play("click")
	_refresh()

func _continue() -> void:
	var snapshot: Dictionary = store.load_run()
	if snapshot.is_empty() or not sim.restore(snapshot):
		hud.show_error("저장된 전투를 읽을 수 없습니다. 새 전투는 시작할 수 있습니다.")
		return
	if profile.settled.has(sim.run_id):
		store.clear_run()
		sim.state = "menu"
		hud.show_error("이미 정산된 전투입니다.")
		_refresh()
		return
	last_options = sim.config.duplicate(true)
	world.set_chapter(int(sim.config.chapter))
	if sim.state == "paused":
		sim.resume()
	previous_hp = sim.player.hp
	previous_kills = int(sim.stats.get("kills",0))
	previous_xp = sim.player.xp
	previous_evos = int(sim.stats.get("evolutions",0))
	previous_shot_id = 0
	for shot in sim.shots:
		previous_shot_id = maxi(previous_shot_id,int(shot.get("id",0)))
	previous_bosses = 0
	for enemy in sim.enemies:
		if enemy.type == "boss" and float(enemy.hp) > 0.0:
			previous_bosses += 1
	_clear_input()
	_refresh()

func _choose(token: String) -> void:
	if sim.choose(token):
		sound.play("evolve" if token.begins_with("E:") else "click")
		_checkpoint()
		_refresh()

func _reroll() -> void:
	if sim.reroll():
		sound.play("click")
		_checkpoint()
		_refresh()

func _pause() -> void:
	if sim.state == "playing":
		sim.pause()
		_clear_input()
		_checkpoint()
		_refresh()

func _resume() -> void:
	if build_open:
		build_open = false
		hud.hide_build()
	sim.resume()
	_clear_input()
	_refresh()

func _save_quit() -> void:
	if not _checkpoint():
		return
	build_open = false
	hud.hide_build()
	sim.state = "menu"
	_preview()
	_clear_input()
	_refresh()

func _lobby() -> void:
	if sim.state in ["won","lost"]:
		if not _settle():
			return
	elif sim.state != "menu" and not _checkpoint():
		return
	build_open = false
	hud.hide_build()
	sim.state = "menu"
	_preview()
	_clear_input()
	_refresh()

func _restart() -> void:
	if sim.state in ["won","lost"] and not _settle():
		return
	_start(last_options)

func _toggle_build() -> void:
	if hud.has_method("close_overlay") and hud.close_overlay():
		_refresh()
		return
	if build_open:
		_resume()
	elif sim.state in ["playing","paused"]:
		sim.pause()
		build_open = true
		hud.show_build(sim)
		_checkpoint()
		_clear_input()

func _settings(options: Dictionary) -> void:
	if sim.state == "menu":
		if options.has("preview_chapter"):
			preview_chapter = clampi(int(options.preview_chapter),0,2)
		if options.has("preview_weapon") and options.preview_weapon in sim.catalog.balance.mainWeapons:
			preview_weapon = str(options.preview_weapon)
		_preview()
	var changed: bool = false
	for key in ["quality", "sound", "screen_shake", "damage_numbers", "radar"]:
		if options.get(key) is bool:
			if profile.settings[key] != options[key]:
				profile.settings[key] = options[key]
				changed = true
	if options.get("volume") is float or options.get("volume") is int:
		var volume: float = float(options.volume)
		if is_finite(volume) and not is_equal_approx(float(profile.settings.volume),clampf(volume,0.0,1.0)):
			profile.settings.volume = clampf(volume,0.0,1.0)
			changed = true
	if changed:
		profile_dirty = true
		settings_save_clock = 0.0
		_apply_settings()
	_refresh()

func _apply_settings() -> void:
	if is_instance_valid(world):
		if world.has_method("apply_settings"):
			world.apply_settings(profile.settings)
		else:
			world.set_quality(profile.settings.quality)
	if is_instance_valid(sound):
		sound.apply_settings(profile.settings)

func _preview() -> void:
	if not is_instance_valid(world):
		return
	if world.has_method("set_preview"):
		world.set_preview(preview_chapter,preview_weapon)
	else:
		world.set_chapter(preview_chapter)

func _flush_profile() -> bool:
	if qa_mode or not profile_dirty:
		profile_dirty = false
		return true
	settings_save_clock = -1.65
	if not store.save_profile(profile):
		if not profile_error_reported and is_instance_valid(hud):
			hud.show_error(store.last_error)
		profile_error_reported = true
		return false
	profile_dirty = false
	profile_error_reported = false
	return true

func _checkpoint() -> bool:
	if not _flush_profile():
		return false
	if qa_mode or sim.state not in ["playing","paused","choice","chest"]:
		return true
	if not store.save_run(sim.snapshot()):
		hud.show_error(store.last_error)
		return false
	return true

func _settle() -> bool:
	if qa_mode:
		return true
	# Even an already-settled run can have freshly changed settings awaiting the
	# debounce. The store's duplicate-result path intentionally does no writes.
	if not _flush_profile():
		return false
	var reward: int = int(sim.player.gold) + (100 * (int(sim.config.chapter)+1) if sim.state == "won" else 0)
	var result: Dictionary = {
		"kills":sim.stats.get("kills",0),"credits":reward,"won":sim.state=="won",
		"chapter":sim.config.chapter,"weapon":sim.config.weapon,"duration":sim.config.duration,
		"elapsed":sim.elapsed,"level":sim.player.lv,"evolutions":sim.stats.get("evolutions",0),
		"damage":sim.stats.get("damage",0.0),"cause":""}
	var last_damage = sim.get("last_damage")
	if sim.state == "lost" and last_damage is Dictionary:
		result.cause = last_damage.get("cause","")
	if not store.settle(profile, sim.run_id, result):
		hud.show_error("결과 저장 실패: " + store.last_error)
		return false
	profile_dirty = false
	return true

func _refresh() -> void:
	if is_instance_valid(hud):
		hud.sync(sim, profile, false if qa_mode else store.has_run())

func _clear_input() -> void:
	if is_instance_valid(stick):
		stick.clear()
	for action in ["move_left","move_right","move_up","move_down"]:
		Input.action_release(action)

func _unhandled_key_input(event: InputEvent) -> void:
	if not event is InputEventKey or not event.pressed or event.echo:
		return
	var key: Key = event.physical_keycode
	if key == KEY_NONE:
		key = event.keycode
	if key in [KEY_1,KEY_2,KEY_3] and sim.state in ["choice","chest"]:
		var index: int = key - KEY_1
		if index < sim.draft.size():
			_choose(str(sim.draft[index]))
	elif key == KEY_R and sim.state == "choice":
		_reroll()
	elif key in [KEY_ESCAPE,KEY_P]:
		if hud.has_method("close_overlay") and hud.close_overlay():
			_refresh()
		elif build_open or sim.state == "paused":
			_resume()
		elif sim.state == "playing":
			_pause()
	elif key == KEY_B:
		_toggle_build()
	elif key == KEY_M:
		_settings({"sound":not profile.settings.sound})
		sim.notice = "효과음 켜짐" if profile.settings.sound else "효과음 꺼짐"
		sim.notice_time = 2.0
	elif key == KEY_N:
		_settings({"radar":not profile.settings.radar})
		sim.notice = "미니맵 켜짐" if profile.settings.radar else "미니맵 꺼짐"
		sim.notice_time = 2.0
	elif key == KEY_F11:
		var full: bool = DisplayServer.window_get_mode() == DisplayServer.WINDOW_MODE_FULLSCREEN
		DisplayServer.window_set_mode(DisplayServer.WINDOW_MODE_WINDOWED if full else DisplayServer.WINDOW_MODE_FULLSCREEN)
	_refresh()

func _notification(what: int) -> void:
	if what == NOTIFICATION_APPLICATION_FOCUS_OUT and is_instance_valid(hud):
		_pause()
		_clear_input()
	elif what == NOTIFICATION_WM_CLOSE_REQUEST:
		if is_instance_valid(hud):
			if sim.state in ["won","lost"] and not _settle():
				return
			if not _checkpoint():
				return
		get_tree().quit()

func _capture_qa() -> void:
	## Optional reproducible capture runner, excluded from normal play.
	var driver = load("res://tests/capture_driver.gd")
	if driver:
		var instance = driver.new()
		add_child(instance)
		instance.run(self)
