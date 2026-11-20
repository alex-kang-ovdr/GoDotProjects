extends SceneTree
## Native control/input regression. Run with --headless --script res://tests/ui_regression.gd -- --qa.
## It instantiates the actual main scene and sends mouse events to the root Viewport.

var checks: Array = []
var game
var hud
var clicked: Array = []

func _initialize() -> void:
	if not "--qa" in OS.get_cmdline_user_args():
		push_error("UI regression requires -- --qa to isolate user saves.")
		quit(2)
		return
	call_deferred("run")

func check(name: String, condition: bool, detail: String = "") -> void:
	checks.append({"name":name, "passed":condition, "detail":detail})
	if not condition:
		print("FAIL ", name, " ", detail)

func frames(count: int = 3) -> void:
	for i in range(count):
		await process_frame

func button(name: String) -> BaseButton:
	return hud.root.find_child(name, true, false) as BaseButton

func reveal(control: Control) -> void:
	var parent = control.get_parent()
	while parent != null:
		if parent is ScrollContainer:
			parent.ensure_control_visible(control)
		parent = parent.get_parent()
	await frames(2)

func click(name: String) -> bool:
	var b = button(name)
	if b == null:
		check("button exists: " + name, false)
		return false
	await reveal(b)
	var at = b.get_global_rect().get_center()
	var motion = InputEventMouseMotion.new()
	motion.position = at
	motion.global_position = at
	root.push_input(motion, true)
	var down = InputEventMouseButton.new()
	down.button_index = MOUSE_BUTTON_LEFT
	down.pressed = true
	down.position = at
	down.global_position = at
	root.push_input(down, true)
	var up = down.duplicate()
	up.pressed = false
	root.push_input(up, true)
	clicked.append(name)
	await frames(2)
	game._refresh()
	await frames(2)
	return true

func fits(control: Control) -> bool:
	if control == null or not control.is_visible_in_tree():
		return false
	var rect = control.get_global_rect()
	var bounds = Rect2(Vector2.ZERO, root.get_visible_rect().size)
	return bounds.grow(2.0).encloses(rect)

func run() -> void:
	root.size = Vector2i(1280,800)
	game = load("res://scenes/main.tscn").instantiate()
	root.add_child(game)
	await frames(4)
	game.set_process(false)
	game.set_physics_process(false)
	hud = game.hud
	check("QA mode active", game.qa_mode)
	check("initial menu", game.sim.state == "menu" and hud.menu_root.visible)
	check("desktop main menu stays within viewport", fits(hud.menu_panel), str(hud.menu_panel.get_global_rect()))
	check("desktop primary action always visible", fits(button("StartButton")))
	await click("MapChoice1")
	check("map selection", int(hud.menu_options.chapter) == 1)
	await click("Weapon_shotgun")
	check("main weapon selection", str(hud.menu_options.weapon) == "shotgun")
	await click("Duration900")
	check("duration selection", int(hud.menu_options.duration) == 900)
	await click("Difficulty_hard")
	check("difficulty selection", str(hud.menu_options.difficulty) == "hard")
	await click("Tech_precision")
	check("tech checkbox selection", bool(hud.menu_options.precision))
	var sound_before = bool(game.profile.settings.sound)
	await click("SoundButton")
	check("sound command wired", bool(game.profile.settings.sound) != sound_before)
	await click("GuideButton")
	check("guide opens", hud.modal_root.visible and button("GuideCloseButton") != null)
	await click("GuideCloseButton")
	check("guide closes", not hud.modal_root.visible)
	await click("StartButton")
	check("start enters gameplay", game.sim.state == "playing")
	check("selected options reach simulation", game.sim.config.weapon == "shotgun" and int(game.sim.config.duration) == 900 and int(game.sim.config.chapter) == 1 and game.sim.config.difficulty == "hard" and game.sim.config.precision)
	check("HUD visible in combat", hud.hud_root.visible and not hud.menu_root.visible)
	check("desktop HUD controls in bounds", fits(button("PauseButton")) and fits(button("BuildButton")))
	await click("PauseButton")
	check("pause button", game.sim.state == "paused" and button("ResumeButton") != null)
	var before = game.sim.elapsed
	game.sim.step(1.0,Vector2.RIGHT)
	check("pause freezes simulation", game.sim.elapsed == before)
	await click("ResumeButton")
	check("resume button", game.sim.state == "playing")
	await click("BuildButton")
	game._refresh()
	await frames()
	check("build remains open after root refresh", game.build_open and game.sim.state == "paused" and button("BuildCloseButton") != null and hud._build_open)
	await click("BuildCloseButton")
	check("build closes and resumes", not game.build_open and game.sim.state == "playing" and not hud.modal_root.visible)
	game.sim.gain_xp(float(game.sim.player.need))
	game._refresh()
	await frames()
	check("level-up shows three cards", game.sim.state == "choice" and game.sim.draft.size() == 3 and button("Choice3") != null)
	var rolls = game.sim.rerolls
	await click("RerollButton")
	check("reroll command", game.sim.rerolls == rolls - 1 and game.sim.state == "choice")
	var chosen = str(game.sim.draft[0])
	var level_before = int(game.sim.player.levels.get(chosen,0))
	await click("Choice1")
	check("card click applies upgrade", int(game.sim.player.levels.get(chosen,0)) == level_before + 1)
	check("card selection resumes", game.sim.state == "playing")
	await click("PauseButton")
	await click("SaveQuitButton")
	check("save and lobby command route", game.sim.state == "menu" and hud.menu_root.visible)
	# Portrait uses the same main-scene resize handler as normal gameplay.
	root.size = Vector2i(390,844)
	game._resize_viewport()
	await frames(4)
	game._refresh()
	await frames(3)
	check("portrait layout selected", hud._small)
	check("portrait logical viewport", absf(root.get_visible_rect().size.x - 390.0) < 1)
	check("portrait menu stays within viewport", fits(hud.menu_panel), str(hud.menu_panel.get_global_rect()))
	check("portrait primary action always visible", fits(button("StartButton")))
	await click("StartButton")
	check("portrait start gameplay", game.sim.state == "playing")
	check("portrait HUD command controls in bounds", fits(button("PauseButton")) and fits(button("BuildButton")))
	check("portrait loadout stays in bounds", fits(hud.loadout_panel))
	await click("PauseButton")
	check("portrait pause dialog in bounds", fits(hud.modal_root.get_node("ModalShell")))
	await click("ResumeButton")
	game.sim.gain_xp(float(game.sim.player.need))
	game._refresh()
	await frames(3)
	check("portrait choice uses one column", button("Choice1").get_parent().columns == 1)
	check("portrait choice modal in bounds", fits(hud.modal_root.get_node("ModalShell")))
	await click("Choice3")
	check("portrait third choice works", game.sim.state == "playing")
	game.sim.state = "chest"
	game.sim.draft = ["GOLD"]
	game._refresh()
	await frames(3)
	check("chest reward card displayed", button("Choice1") != null and button("RerollButton") == null)
	await click("Choice1")
	check("chest card command", game.sim.state == "playing")
	game.sim.finish(true)
	game._refresh()
	await frames(3)
	check("victory results dialog", game.sim.state == "won" and button("RestartButton") != null)
	check("portrait results panel in bounds", fits(hud.modal_root.get_node("ModalShell")))
	await click("RestartButton")
	check("restart button", game.sim.state == "playing" and game.sim.elapsed == 0.0)
	game.sim.finish(false)
	game._refresh()
	await frames(3)
	check("defeat results dialog", game.sim.state == "lost" and button("ResultLobbyButton") != null)
	await click("ResultLobbyButton")
	check("results lobby button", game.sim.state == "menu" and hud.menu_root.visible)
	hud.show_error("테스트 메시지")
	check("error message visible", hud.error_root.visible and hud.error_label.text == "테스트 메시지")
	var failed = 0
	for c in checks:
		if not c.passed:
			failed += 1
	var report = {"engine":Engine.get_version_info().string,"runner":"Godot native main scene + Viewport mouse events, headless","qa_mode":true,"viewports":[[1280,800],[390,844]],"passed":checks.size()-failed,"failed":failed,"checks":checks,"clicked_controls":clicked,"limits":["Headless geometry and input verification; rendered visual QA is separate.","Save/continue disk correctness is covered by persistence tests, not this UI test.","Mobile portrait is simulated by window resizing, not a physical mobile device."]}
	var file = FileAccess.open("res://tests/ui_regression_report.json",FileAccess.WRITE)
	if file != null:
		file.store_string(JSON.stringify(report,"  "))
	print("UI_REGRESSION ",checks.size()-failed,"/",checks.size()," passed; failures=",failed)
	game.queue_free()
	await frames()
	quit(1 if failed else 0)
