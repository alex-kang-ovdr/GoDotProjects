extends SceneTree
## G2 native settings, records, readable upgrade cards, radar and overlay routing.
## Fixture state is deliberately seeded for UI inspection; this is not a balance run.

var checks: Array = []
var game
var hud
var clicked: Array[String] = []

func _initialize() -> void:
	if not "--qa" in OS.get_cmdline_user_args():
		push_error("G2 UI regression requires -- --qa to isolate user saves.")
		quit(2)
		return
	call_deferred("run")

func check(name: String, condition: bool, detail: String = "") -> void:
	checks.append({"name":name,"passed":condition,"detail":detail})
	if not condition:
		print("FAIL ",name," ",detail)

func frames(count: int = 4) -> void:
	for i in range(count):
		await process_frame

func control(name: String) -> Control:
	return hud.root.find_child(name,true,false) as Control

func reveal(node: Control) -> void:
	var parent = node.get_parent()
	while parent != null:
		if parent is ScrollContainer:
			parent.ensure_control_visible(node)
		parent = parent.get_parent()
	await frames(2)

func click(name: String, ratio: float = 0.5) -> void:
	var node = control(name)
	if node == null:
		check("control exists "+name,false)
		return
	await reveal(node)
	var rect = node.get_global_rect()
	var at = rect.position+Vector2(rect.size.x*ratio,rect.size.y*0.5)
	var motion = InputEventMouseMotion.new()
	motion.position = at
	motion.global_position = at
	root.push_input(motion,true)
	var down = InputEventMouseButton.new()
	down.position = at
	down.global_position = at
	down.button_index = MOUSE_BUTTON_LEFT
	down.pressed = true
	root.push_input(down,true)
	var up = down.duplicate()
	up.pressed = false
	root.push_input(up,true)
	clicked.append(name)
	await frames(3)
	game._refresh()
	await frames(3)

func key(code: Key) -> void:
	var down = InputEventKey.new()
	down.keycode = code
	down.physical_keycode = code
	down.pressed = true
	root.push_input(down,true)
	var up = down.duplicate()
	up.pressed = false
	root.push_input(up,true)
	await frames(3)
	game._refresh()
	await frames(3)

func fits(node: Control) -> bool:
	return node != null and node.is_visible_in_tree() and root.get_visible_rect().grow(2).encloses(node.get_global_rect())

func card_content_fits(name: String) -> bool:
	var card = control(name)
	if card == null:
		return false
	var children = card.find_children("*","Label",true,false)
	for label in children:
		if not card.get_global_rect().grow(2).encloses(label.get_global_rect()):
			return false
	return true

func run() -> void:
	root.size = Vector2i(1280,800)
	game = load("res://scenes/main.tscn").instantiate()
	root.add_child(game)
	await frames(6)
	game.set_process(false)
	game.set_physics_process(false)
	hud = game.hud
	game.profile.last_options = {"weapon":"revolver","chapter":2,"duration":900,"difficulty":"hard","precision":true,"phase":false,"maintainer":true}
	hud._options_restored = false
	game._refresh()
	await frames(4)
	check("last loadout restored before start",hud.menu_options.weapon=="revolver" and int(hud.menu_options.chapter)==2 and int(hud.menu_options.duration)==900 and hud.menu_options.difficulty=="hard" and hud.menu_options.precision and hud.menu_options.maintainer)
	check("desktop footer actions remain visible",fits(control("StartButton")) and fits(control("SettingsButton")) and fits(control("HistoryButton")))
	await click("SettingsButton")
	check("settings overlay opens in lobby",hud._settings_open and game.sim.state=="menu" and control("SettingsCloseButton")!=null)
	check("settings modal within desktop",fits(control("ModalShell")))
	check("volume track has visible thickness",control("VolumeSlider").get_theme_stylebox("slider").get_minimum_size().y>=6 and control("VolumeSlider").get_theme_stylebox("grabber_area").get_minimum_size().y>=6)
	check("volume thumb has visible hit marker",control("VolumeSlider").get_theme_icon("grabber").get_width()>=20)
	for id in ["sound","quality","screen_shake","damage_numbers","radar"]:
		var before = bool(game.profile.settings.get(id,true))
		await click("Setting_"+id)
		check("setting command updates "+id,bool(game.profile.settings.get(id,true))!=before)
		check("setting label reflects "+id,control("Setting_"+id).text==("켬" if not before else "끔"))
	await click("VolumeSlider",0.32)
	check("volume pointer changes profile",float(game.profile.settings.volume)>0.2 and float(game.profile.settings.volume)<0.45,str(game.profile.settings.volume))
	check("volume label reflects profile",control("VolumeValue").text=="%d%%" % roundi(float(game.profile.settings.volume)*100))
	var slider = control("VolumeSlider")
	slider.grab_focus()
	for pair in [[KEY_M,"sound"],[KEY_N,"radar"]]:
		var id = str(pair[1])
		var before = bool(game.profile.settings[id])
		await key(pair[0])
		check("overlay hotkey updates "+id,bool(game.profile.settings[id])!=before and control("Setting_"+id).button_pressed==bool(game.profile.settings[id]) and control("Setting_"+id).text==("켬" if bool(game.profile.settings[id]) else "끔"))
		check("hotkey preserves settings slider "+id,control("VolumeSlider")==slider and slider.has_focus())
		var after_key = bool(game.profile.settings[id])
		await click("Setting_"+id)
		check("toggle remains effective after hotkey "+id,bool(game.profile.settings[id])!=after_key)
		slider.grab_focus()
	await key(KEY_ESCAPE)
	check("Escape closes lobby overlay",not hud._settings_open and not hud.modal_root.visible and game.sim.state=="menu")
	await click("HistoryButton")
	check("empty history has useful state",control("EmptyHistory")!=null)
	await key(KEY_ESCAPE)
	check("Escape closes history without start",game.sim.state=="menu" and not hud._history_open)
	game.profile.history = [
		{"run_id":"ui_latest","won":false,"chapter":2,"weapon":"revolver","duration":900,"elapsed":175.2,"kills":411,"level":12,"evolutions":1,"damage":32100,"credits":57,"cause":"얼음 탄막"},
		{"run_id":"ui_earlier","won":true,"chapter":0,"weapon":"kunai","duration":300,"elapsed":307.4,"kills":1632,"level":27,"evolutions":3,"damage":165000,"credits":210,"cause":""}
	]
	game.profile.records = {"0":{"clears":1,"best_kills":1632,"best_level":27,"best_time":307.4},"2":{"clears":0,"best_kills":411,"best_level":12,"best_time":0}}
	game._refresh()
	await frames()
	await click("HistoryButton")
	check("recent records rendered newest first",control("HistoryRecord0")!=null and control("HistoryRecord1")!=null and control("HistoryRecord0").find_children("*","Label",true,false)[1].text.contains("리볼버"))
	var cause_visible = false
	for label in control("HistoryRecord0").find_children("*","Label",true,false):
		cause_visible = cause_visible or label.text.contains("얼음 탄막")
	check("loss cause included in records",cause_visible)
	await click("HistoryCloseButton")
	await click("StartButton")
	check("restored options reach new game",game.sim.config.weapon=="revolver" and int(game.sim.config.chapter)==2 and int(game.sim.config.duration)==900)
	await click("PauseButton")
	await click("PauseSettingsButton")
	var elapsed = game.sim.elapsed
	game.sim.step(1.0,Vector2.RIGHT)
	check("settings keep combat frozen",game.sim.state=="paused" and game.sim.elapsed==elapsed)
	await key(KEY_ESCAPE)
	check("Escape returns to pause instead of resuming",game.sim.state=="paused" and not hud._settings_open and control("ResumeButton")!=null)
	await click("ResumeButton")
	game._settings({"radar":true})
	game.sim.director_enabled = false
	game.sim.elapsed = 42.0
	game.sim.enemies.clear()
	game.sim.spawn_enemy("grunt",Vector2(160,-100))
	var boss = game.sim.spawn_boss(false)
	boss.pos = Vector2(450,120)
	game._refresh()
	await frames()
	check("radar stays in desktop bounds",fits(hud.radar_panel))
	check("radar identifies boss",hud.radar.boss_count==1)
	var before_radar = JSON.stringify(game.sim.snapshot())
	hud.radar.sync(game.sim)
	check("radar does not alter simulation",before_radar==JSON.stringify(game.sim.snapshot()))
	check("boss introduction cue shown",hud.boss_pattern_label.text.contains("교전 준비"))
	game.sim.encounter.intro_left = 0.0
	game.sim.encounter.pattern = "얼음 탄막"
	game.sim.encounter.pattern_time = 2.0
	game._refresh()
	check("boss pattern dodge hint shown",hud.boss_pattern_label.text.contains("얼음 탄막") and hud.boss_pattern_label.text.contains("사이"))
	await key(KEY_N)
	check("radar hotkey hides panel",not hud.radar_panel.visible and not bool(game.profile.settings.radar))
	await key(KEY_N)
	check("radar hotkey restores panel",hud.radar_panel.visible and bool(game.profile.settings.radar))
	game.sim.player.levels = {"revolver":4,"atk":1,"droneA":5,"droneB":5}
	game.sim.state = "choice"
	game.sim.draft = ["revolver","atk","E:destroyer"]
	game._refresh()
	await frames(8)
	check("all upgrade cards show concrete values",control("Comparison1").text.contains("→") and control("Comparison2").text.contains("→") and control("Comparison3").text.contains("2칸 → 1칸"))
	check("evolution readiness is explicit",control("Synergy3").text.contains("조건 충족"))
	for i in range(1,4):
		check("desktop card text contained %d" % i,card_content_fits("Choice%d" % i))
	var rng_before = str(game.sim.rng.state)
	game._refresh()
	check("upgrade rendering does not consume RNG",str(game.sim.rng.state)==rng_before)
	root.size = Vector2i(390,844)
	game._resize_viewport()
	await frames(8)
	game._refresh()
	await frames(8)
	check("portrait choice single column",control("Choice1").get_parent().columns==1)
	check("portrait modal fits",fits(control("ModalShell")))
	for i in range(1,4):
		await reveal(control("Choice%d" % i))
		check("portrait card text contained %d" % i,card_content_fits("Choice%d" % i))
	await click("Choice3")
	check("portrait evolved card click works",game.sim.state=="playing" and bool(game.sim.player.evolved.get("destroyer",false)))
	check("portrait radar and loadout fit",fits(hud.radar_panel) and fits(hud.loadout_panel))
	check("XP count visible",hud.xp_label.text.begins_with("XP ") and fits(hud.xp_label))
	await click("PauseButton")
	await click("PauseSettingsButton")
	check("portrait settings shell fits",fits(control("ModalShell")))
	await click("Setting_quality")
	check("portrait settings control accepts click",control("Setting_quality").text==("켬" if bool(game.profile.settings.quality) else "끔"))
	await click("SettingsCloseButton")
	check("portrait settings close preserves pause",game.sim.state=="paused" and control("ResumeButton")!=null)
	await click("SaveQuitButton")
	check("portrait footer accessible",fits(control("StartButton")) and fits(control("SettingsButton")) and fits(control("HistoryButton")))
	await click("HistoryButton")
	check("portrait history shell fits",fits(control("ModalShell")))
	await click("HistoryCloseButton")
	check("portrait history closes to lobby",game.sim.state=="menu" and not hud.modal_root.visible)
	var failed = 0
	for item in checks:
		if not item.passed:
			failed += 1
	var report = {"engine":Engine.get_version_info().string,"version":"G2","runner":"Native main scene and Viewport mouse/keyboard input, headless","viewports":[[1280,800],[390,844]],"passed":checks.size()-failed,"failed":failed,"checks":checks,"clicked_controls":clicked,"limitations":["Records and upgrade cards use deterministic UI fixtures, not a natural playthrough.","Font appearance and icon draw output require separate native rendered capture review.","Portrait is a resized desktop viewport, not a physical mobile device."]}
	var file = FileAccess.open("res://tests/g2_ui_regression_report.json",FileAccess.WRITE)
	file.store_string(JSON.stringify(report,"  "))
	file.close()
	print("G2_UI_REGRESSION ",checks.size()-failed,"/",checks.size()," passed; failures=",failed)
	game.queue_free()
	await frames()
	quit(1 if failed else 0)
