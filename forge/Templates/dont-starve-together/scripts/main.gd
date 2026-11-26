extends Node3D

## Don't Starve Together (Godot 4.7.2 Restoration) 메인 컨트롤러.
## 고정 30Hz 시뮬레이션 스텝 + FollowCamera + 2.5D 빌보드 렌더러 + 원작 HUD/미니맵/스킬트리 연결.

var db: DSTDatabase
var sim: DSTWorldSim
var cam: DSTCamera
var renderer: DSTRenderer
var hud: DSTHud
var sfx_player: AudioStreamPlayer

var _sim_accum: float = 0.0
var _hud_accum: float = 0.0
var _char_keys: Array = ["wilson", "willow", "wolfgang", "wendy", "wathgrithr", "wx78"]
var _boss_keys: Array = ["deerclops", "bearger", "moose", "dragonfly"]
var _boss_idx: int = 0


func _ready() -> void:
	DSTMedia.ensure_loaded()
	db = DSTDatabase.new()
	db.load_from_path("res://data/dst_tuning.json")

	sim = DSTWorldSim.new()
	sim.init_world(db, 20261126, "wilson")

	sfx_player = AudioStreamPlayer.new()
	add_child(sfx_player)

	cam = DSTCamera.new()
	cam.configure_from_db(db.data["camera"])
	add_child(cam)
	cam.current = true

	renderer = DSTRenderer.new()
	add_child(renderer)
	renderer.setup(sim)

	hud = DSTHud.new()
	add_child(hud)
	hud.setup(sim, Callable(self, "_on_hud_action"))
	cam.update_camera(1.0, sim.player_pos)


func _play_sfx(key: String) -> void:
	if sfx_player == null:
		return
	var stream: AudioStreamWAV = DSTMedia.get_sfx(key)
	if stream != null:
		sfx_player.stream = stream
		sfx_player.play()


func _process(dt: float) -> void:
	var move_vec: Vector2 = _read_camera_relative_move()
	_sim_accum += min(dt, 0.1)
	var fixed_step: float = 1.0 / 30.0 # 원작 30 FPS 시뮬레이션 틱
	while _sim_accum >= fixed_step:
		_sim_accum -= fixed_step
		sim.step(fixed_step, move_vec)

	cam.update_camera(dt, sim.player_pos)
	renderer.sync_visuals(dt)

	_hud_accum += dt
	if _hud_accum >= 0.1:
		_hud_accum = 0.0
		hud.refresh()


func _read_camera_relative_move() -> Vector2:
	var raw: Vector2 = Vector2.ZERO
	if Input.is_key_pressed(KEY_W) or Input.is_key_pressed(KEY_UP):
		raw.y += 1.0
	if Input.is_key_pressed(KEY_S) or Input.is_key_pressed(KEY_DOWN):
		raw.y -= 1.0
	if Input.is_key_pressed(KEY_D) or Input.is_key_pressed(KEY_RIGHT):
		raw.x += 1.0
	if Input.is_key_pressed(KEY_A) or Input.is_key_pressed(KEY_LEFT):
		raw.x -= 1.0
	if raw.length_squared() < 0.001:
		return Vector2.ZERO
	var basis: Dictionary = cam.get_planar_basis()
	return (basis["forward"] * raw.y + basis["right"] * raw.x).normalized()


func _unhandled_input(event: InputEvent) -> void:
	if event is InputEventKey and event.pressed and not event.echo:
		var k: Key = event.keycode
		if k == KEY_Q:
			cam.rotate_step(-45.0)
		elif k == KEY_E:
			cam.rotate_step(45.0)
		elif k == KEY_SPACE:
			if sim.interact_nearest():
				_play_sfx("gather")
			hud.refresh()
		elif k == KEY_F:
			sim.player_attack_nearest()
			_play_sfx("attack")
			hud.refresh()
		elif k == KEY_B:
			_on_hud_action("toggle_boat", "")
		elif k == KEY_K:
			_on_hud_action("toggle_skills", "")
		elif k == KEY_V:
			_on_hud_action("toggle_cook", "")
		elif k == KEY_C:
			_on_hud_action("toggle_shard", "")
		elif k == KEY_M:
			_on_hud_action("toggle_minimap", "")
		elif k == KEY_G:
			_on_hud_action("transmute", "")
		elif k == KEY_1:
			if sim.eat_food("berries"): _play_sfx("eat")
			hud.refresh()
		elif k == KEY_2:
			if sim.eat_food("carrot"): _play_sfx("eat")
			hud.refresh()
		elif k == KEY_3:
			if sim.eat_food("meatballs"): _play_sfx("eat")
			hud.refresh()
		elif k == KEY_4:
			if sim.eat_food("perogies"): _play_sfx("eat")
			hud.refresh()
		elif k == KEY_T:
			_on_hud_action("toggle_speed", "")
	elif event is InputEventMouseButton and event.pressed:
		if event.button_index == MOUSE_BUTTON_WHEEL_UP:
			cam.zoom_in()
		elif event.button_index == MOUSE_BUTTON_WHEEL_DOWN:
			cam.zoom_out()


func _on_hud_action(action: String, arg: String) -> void:
	match action:
		"craft":
			if sim.craft_recipe(arg):
				_play_sfx("fire" if arg == "campfire" or arg == "torch" else "craft")
		"use_item":
			if db.foods_by_id.has(arg):
				if sim.eat_food(arg):
					_play_sfx("eat")
			elif db.data["weapons"].has(arg) or arg == "torch":
				sim.equip_hands = arg
				sim.push_log("장착: %s" % arg)
				_play_sfx("ui_click")
		"cook_meatballs":
			if int(sim.inventory.get("egg", 0)) > 0 and int(sim.inventory.get("meat", 0)) > 0 and int(sim.inventory.get("carrot", 0)) > 0 and int(sim.inventory.get("berries", 0)) > 0:
				sim.cook_in_pot(["egg", "meat", "carrot", "berries"])
				_play_sfx("eat")
			elif int(sim.inventory.get("meat", 0)) > 0 and int(sim.inventory.get("berries", 0)) >= 3:
				sim.cook_in_pot(["meat", "berries", "berries", "berries"])
				_play_sfx("eat")
			else:
				sim.push_log("요리 재료 부족 (고기+베리3 또는 알+고기+당근+베리 필요)")
		"cycle_char":
			var idx: int = (_char_keys.find(sim.character_id) + 1) % _char_keys.size()
			sim.select_character(str(_char_keys[idx]))
			_play_sfx("ui_click")
		"toggle_boat":
			if sim.toggle_boat():
				_play_sfx("ui_click")
		"toggle_skills":
			hud.toggle_skill_panel()
			_play_sfx("ui_click")
		"toggle_cook":
			hud.toggle_cook_panel()
			_play_sfx("ui_click")
		"toggle_shard":
			sim.toggle_shard()
			_play_sfx("magic")
		"play_sfx":
			_play_sfx(arg)
		"toggle_minimap":
			hud.toggle_minimap()
			_play_sfx("ui_click")
		"unlock_skill":
			if sim.unlock_skill(arg):
				_play_sfx("magic")
		"transmute":
			if sim.transmute_rocks_to_gold():
				_play_sfx("magic")
		"toggle_speed":
			sim.time_scale = 8.0 if sim.time_scale < 2.0 else 1.0
			sim.push_log("시간 배속: %.0f×" % sim.time_scale)
			_play_sfx("ui_click")
		"spawn_seasonal_boss":
			var bkind: String = str(_boss_keys[_boss_idx % _boss_keys.size()])
			_boss_idx += 1
			sim.spawn_creature(bkind, sim.player_pos + Vector2(9.0, 0.0))
			_play_sfx("boss_roar")
		"spawn_deerclops":
			sim.spawn_creature("deerclops", sim.player_pos + Vector2(10.0, 0.0))
			_play_sfx("boss_roar")
		"spawn_mutated":
			sim.spawn_creature("mutated_deerclops", sim.player_pos + Vector2(10.0, 0.0))
			_play_sfx("boss_roar")
		"teleport_moon":
			sim.player_pos = Vector2(34.0, -26.0)
			sim.push_log("달섬으로 이동했습니다 (달 계몽 모드 활성).")
			_play_sfx("magic")
		"teleport_home":
			sim.player_pos = Vector2.ZERO
			sim.push_log("본토 거점으로 복귀했습니다.")
			_play_sfx("ui_click")
	hud.refresh()
