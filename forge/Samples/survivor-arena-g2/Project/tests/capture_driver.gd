extends Node
## Staged native-render screenshots for visual regression, never a balance benchmark.
var app
var output_path: String = "res://tests/captures/"
var results: Array = []

func frames(count: int = 5) -> void:
	for i in count:
		await get_tree().process_frame

func shot(name: String) -> void:
	await frames(4)
	await RenderingServer.frame_post_draw
	var image: Image = get_viewport().get_texture().get_image()
	var error: Error = image.save_png(output_path + name + ".png")
	results.append({"name":name,"saved":error==OK,"width":image.get_width(),"height":image.get_height()})
	print("CAPTURE ",name," ",image.get_width(),"x",image.get_height()," error=",error)

func run(main) -> void:
	app = main
	app.set_physics_process(false)
	app.qa_mode = true
	DirAccess.make_dir_recursive_absolute(ProjectSettings.globalize_path(output_path))
	await frames(8)
	await shot("lobby")
	app.hud._show_settings()
	await shot("settings")
	app.hud.close_overlay()
	for chapter in [1,2]:
		app.hud._set_option("chapter",chapter)
		app._refresh()
		await shot("lobby_"+str(chapter))
	app.hud._set_option("chapter",0)
	app._refresh()
	app._start({"weapon":"kunai","precision":true})
	var sim = app.sim
	sim.director_enabled = false
	for key in ["guardian","rocket","lightning","molotov","droneA","xp","duration","range","cooldown","atk","hp"]:
		sim.apply_upgrade(key)
	for i in 3:
		for key in ["kunai","guardian","rocket","lightning","molotov","droneA","atk"]:
			sim.apply_upgrade(key)
	sim.elapsed = 82.0
	sim.player.lv = 18
	sim.player.invuln = 0.0
	for i in 34:
		var angle: float = i * 2.399963
		var radius: float = 190.0 + float(i%5)*53
		sim.spawn_enemy(["grunt","runner","tank","ranged"][i%4],Vector2.from_angle(angle)*radius)
	for i in 90:
		if sim.state=="choice":
			sim.choose(str(sim.draft[0]))
		sim.step(1.0/60.0,Vector2.ZERO)
	sim.notice = ""
	app._refresh()
	await shot("combat_city")
	for chapter in [1,2]:
		app.world.set_chapter(chapter)
		sim.config.chapter=chapter
		await shot("combat_"+str(chapter))
	app.world.set_chapter(0)
	sim.config.chapter=0
	sim.state="playing"
	sim.apply_upgrade("kunai")
	sim.gain_xp(sim.player.need)
	sim.draft=["E:kunai","atk","hp"]
	app._refresh()
	await shot("upgrade")
	if sim.state=="choice":sim.choose(str(sim.draft[0]))
	app._toggle_build()
	app._refresh()
	await shot("build")
	app._resume()
	sim.enemies.clear()
	var boss = sim.spawn_boss(true)
	boss.pos=Vector2(170,-80)
	app._refresh()
	await shot("boss_intro")
	sim.encounter.intro_left=0.0
	boss.busy=0.0
	sim.boss_pattern(boss,"charge")
	sim.notice=""
	app._refresh()
	await shot("boss")
	app._pause()
	app.hud._show_settings()
	await shot("pause_settings")
	app.hud.close_overlay()
	sim.state="menu"
	app.get_window().size=Vector2i(390,844)
	app._resize_viewport()
	await frames(8)
	app._refresh()
	await shot("mobile_lobby")
	app.hud._show_settings()
	await shot("mobile_settings")
	app.hud.close_overlay()
	sim.state="playing"
	app._refresh()
	await shot("mobile_combat")
	sim.gain_xp(sim.player.need)
	app._refresh()
	await shot("mobile_upgrade")
	# Display real probe records when present; this is still a staged UI capture.
	var probe = JSON.parse_string(FileAccess.get_file_as_string("res://tests/balance_probe_report.json"))
	if probe is Dictionary and probe.get("release","")=="G2":
		app.profile.history=[]
		app.profile.records={}
		app.profile.runs=probe.runs.size()
		app.profile.wins=0
		app.profile.best_kills=0
		for record in probe.get("runs",[]):
			var entry={"run_id":"qa-probe-%s" % record.seed,"won":record.outcome=="won","chapter":record.chapter,"weapon":record.weapon,"duration":300,"elapsed":record.elapsed,"kills":record.kills,"level":record.level,"evolutions":record.evolutions,"damage":record.damage,"credits":0,"cause":""}
			app.profile.history.push_front(entry)
			app.profile.wins+=1 if entry.won else 0
			app.profile.best_kills=maxi(app.profile.best_kills,int(entry.kills))
			var chapter: String=str(int(record.chapter))
			var best: Dictionary=app.profile.records.get(chapter,{"clears":0,"best_kills":0,"best_level":0,"best_time":0.0})
			best.clears+=1 if entry.won else 0
			best.best_kills=maxi(best.best_kills,int(entry.kills))
			best.best_level=maxi(best.best_level,int(entry.level))
			if entry.won and (best.best_time==0 or entry.elapsed<best.best_time):best.best_time=entry.elapsed
			app.profile.records[chapter]=best
		app.hud._profile=app.profile
		app.hud._show_history()
		await shot("mobile_history")
		app.hud.close_overlay()
	app.get_window().size=Vector2i(1280,800)
	app._resize_viewport()
	await frames(8)
	sim.finish(true)
	app._refresh()
	await shot("result")
	sim.state="menu"
	app._refresh()
	app.hud._show_history()
	await shot("history")
	var file=FileAccess.open("res://tests/capture_report.json",FileAccess.WRITE)
	file.store_string(JSON.stringify({"release":"G2","kind":"native Godot staged visual regression","renderer":RenderingServer.get_video_adapter_name(),"captures":results},"  "));file.close()
	get_tree().quit()
