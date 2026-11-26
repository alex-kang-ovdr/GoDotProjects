extends Node3D

## Don't Starve Together (Godot 4.7.2 Restoration) 메인 컨트롤러.
## 고정 30Hz 시뮬레이션 스텝 + FollowCamera + 2.5D 빌보드 렌더러 + HUD 연결.

var db: DSTDatabase
var sim: DSTWorldSim
var cam: DSTCamera
var renderer: DSTRenderer
var hud: DSTHud

var _sim_accum: float = 0.0
var _hud_accum: float = 0.0
var _char_keys: Array = ["wilson", "willow", "wolfgang", "wendy", "wathgrithr", "wx78"]


func _ready() -> void:
	db = DSTDatabase.new()
	db.load_from_path("res://data/dst_tuning.json")

	sim = DSTWorldSim.new()
	sim.init_world(db, 20261126, "wilson")

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
			sim.interact_nearest()
			hud.refresh()
		elif k == KEY_F:
			sim.player_attack_nearest()
			hud.refresh()
		elif k == KEY_1:
			sim.eat_food("berries")
			hud.refresh()
		elif k == KEY_2:
			sim.eat_food("carrot")
			hud.refresh()
		elif k == KEY_3:
			sim.eat_food("meatballs")
			hud.refresh()
		elif k == KEY_4:
			sim.eat_food("perogies")
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
			sim.craft_recipe(arg)
		"cook_meatballs":
			if int(sim.inventory.get("egg", 0)) > 0 and int(sim.inventory.get("meat", 0)) > 0 and int(sim.inventory.get("carrot", 0)) > 0 and int(sim.inventory.get("berries", 0)) > 0:
				sim.cook_in_pot(["egg", "meat", "carrot", "berries"])
			elif int(sim.inventory.get("meat", 0)) > 0 and int(sim.inventory.get("berries", 0)) >= 3:
				sim.cook_in_pot(["meat", "berries", "berries", "berries"])
			else:
				sim.push_log("요리 재료 부족 (고기+베리3 또는 알+고기+당근+베리 필요)")
		"cycle_char":
			var idx: int = (_char_keys.find(sim.character_id) + 1) % _char_keys.size()
			sim.select_character(str(_char_keys[idx]))
		"toggle_speed":
			sim.time_scale = 8.0 if sim.time_scale < 2.0 else 1.0
			sim.push_log("시간 배속: %.0f×" % sim.time_scale)
		"spawn_deerclops":
			sim.spawn_creature("deerclops", sim.player_pos + Vector2(10.0, 0.0))
		"spawn_mutated":
			sim.spawn_creature("mutated_deerclops", sim.player_pos + Vector2(10.0, 0.0))
		"teleport_moon":
			sim.player_pos = Vector2(34.0, -26.0)
			sim.push_log("달섬으로 이동했습니다 (달 계몽 모드 활성).")
		"teleport_home":
			sim.player_pos = Vector2.ZERO
			sim.push_log("본토 거점으로 복귀했습니다.")
	hud.refresh()
