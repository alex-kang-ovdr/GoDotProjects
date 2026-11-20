extends SceneTree
## G2 persistence migration, real input routing, settings and read-only card math.
const Main = preload("res://scripts/main.gd")
const Store = preload("res://scripts/save_store.gd")
const Sim = preload("res://scripts/arena_sim.gd")
var checks: Array = []
var failures: Array = []

func _initialize() -> void:
	if not "--qa" in OS.get_cmdline_user_args():
		quit(2)
		return
	call_deferred("run")

func check(name: String, passed: bool, detail: Variant = "") -> void:
	checks.append({"name":name,"passed":passed,"detail":detail})
	if not passed:
		failures.append(name)
		push_error(name+" "+str(detail))

func frames(count: int = 3) -> void:
	for i in count:
		await process_frame

func key(code: Key) -> void:
	var event = InputEventKey.new()
	event.physical_keycode = code
	event.keycode = code
	event.pressed = true
	Input.parse_input_event(event)
	event = event.duplicate()
	event.pressed = false
	Input.parse_input_event(event)
	Input.flush_buffered_events()

func touch(at: Vector2, pressed: bool, index: int = 0) -> void:
	var event = InputEventScreenTouch.new()
	event.position = at
	event.index = index
	event.pressed = pressed
	root.push_input(event,true)

func cleanup(folder: String) -> void:
	for file in DirAccess.get_files_at(folder):
		DirAccess.remove_absolute(ProjectSettings.globalize_path(folder+file))
	DirAccess.remove_absolute(ProjectSettings.globalize_path(folder))

func run() -> void:
	var folder: String = "user://g2_integration_%d/" % Time.get_ticks_usec()
	var store = Store.new(folder)
	var legacy = {"schema":1,"runs":8,"wins":2,"credits":555,"best_kills":777,"settled":["old-run"],"settings":{"sound":false,"quality":false},"last_options":{"weapon":"revolver","chapter":2,"duration":900,"difficulty":"hard","precision":true}}
	check("G1 profile fixture written",store.write_envelope("profile.json",legacy))
	var profile: Dictionary = store.load_profile()
	check("G1 statistics and ledger survive migration",profile.runs==8 and profile.wins==2 and profile.credits==555 and profile.best_kills==777 and profile.settled==["old-run"])
	check("G1 settings preserved with G2 defaults",profile.schema==2 and not profile.settings.sound and not profile.settings.quality and profile.settings.radar and profile.settings.screen_shake and profile.settings.damage_numbers and is_equal_approx(profile.settings.volume,0.7))
	check("last selected game options preserved",profile.last_options.weapon=="revolver" and profile.last_options.chapter==2 and profile.last_options.duration==900 and profile.last_options.precision)
	check("migration does not invent previous run history",profile.history.is_empty() and profile.records.is_empty())
	var modified: Dictionary = profile.duplicate(true)
	modified.settings.volume = 2.5
	modified.settings.radar = "not-a-boolean"
	modified.last_options = {"weapon":"unknown","chapter":999,"duration":1,"difficulty":"unknown"}
	modified.history = [42,{"run_id":""},{"run_id":"ok","elapsed":-12,"level":999,"credits":-20},{"run_id":"ok","kills":9}]
	check("malformed optional profile fields written",store.save_profile(modified))
	var sanitized: Dictionary = store.load_profile()
	check("settings and launch options sanitized",sanitized.settings.volume==1.0 and sanitized.settings.radar and sanitized.last_options.weapon=="kunai" and sanitized.last_options.chapter==2 and sanitized.last_options.duration==300)
	check("invalid history rows and duplicates filtered",sanitized.history.size()==1 and sanitized.history[0].run_id=="ok" and sanitized.history[0].level==99 and sanitized.history[0].elapsed==0.0 and sanitized.history[0].credits==0)
	profile = store.default_profile()
	for i in range(1,15):
		var result = {"won":i%2==0,"chapter":i%3,"weapon":"kunai","duration":300,"elapsed":350-i,"kills":100+i,"level":10+i,"evolutions":i%4,"damage":1234.5+i,"credits":i,"cause":"접촉 피해"}
		check("run %d commits atomically" % i,store.settle(profile,"g2-run-%d" % i,result))
	check("newest first history is bounded to twelve",profile.history.size()==12 and profile.history[0].run_id=="g2-run-14" and profile.history[11].run_id=="g2-run-3")
	check("history contains actual battle breakdown",profile.history[0].level==24 and profile.history[0].evolutions==2 and profile.history[0].damage==1248.5 and profile.history[0].credits==14)
	check("chapter records distinguish wins from losses",profile.records["1"].clears==2 and profile.records["1"].best_kills==113 and profile.records["1"].best_level==23 and profile.records["1"].best_time==340)
	check("global rewards and wins accumulated once",profile.wins==7 and profile.credits==105)
	var reloaded: Dictionary = store.load_profile()
	var before: String = JSON.stringify(reloaded)
	check("duplicate result after reload stays idempotent",store.settle(reloaded,"g2-run-14",{"won":true,"kills":999999,"credits":999999}) and JSON.stringify(reloaded)==before)
	check("records and settings survive disk roundtrip",reloaded.records==profile.records and reloaded.history==profile.history and reloaded.settings==profile.settings)
	var failed_store = Store.new(folder)
	failed_store.directory = folder+"nonexistent/nested/"
	before = JSON.stringify(profile)
	check("failed settlement does not change profile or ledger",not failed_store.settle(profile,"not-committed",{"won":true,"credits":10}) and JSON.stringify(profile)==before and not profile.settled.has("not-committed"))

	# Card previews must match the actual upgrade at the same passive/tech build.
	var catalog_checks: int = 0
	var all_math: bool = true
	var all_read_only: bool = true
	for weapon in Sim.new().catalog.balance.weapons:
		for level in range(1,5):
			var sim = Sim.new()
			sim.start({"weapon":weapon if weapon in sim.catalog.balance.mainWeapons else "kunai","maintainer":true,"phase":true},123)
			sim.player.levels[weapon] = level
			sim.player.levels.atk = 3
			sim.player.levels.cooldown = 2
			var snapshot_before: String = JSON.stringify(sim.snapshot())
			var preview: Dictionary = sim.catalog.preview_upgrade(sim,weapon)
			all_read_only = all_read_only and snapshot_before == JSON.stringify(sim.snapshot())
			var after: float = sim.catalog._damage_at(sim,weapon,level+1,false)
			sim.player.levels[weapon] = level+1
			all_math = all_math and is_equal_approx(after,sim.weapon_damage(weapon)) and is_equal_approx(sim.catalog._interval_at(sim,weapon,false),sim.weapon_interval(weapon)) and preview.lines.size()<=4
			catalog_checks += 1
	check("68 weapon previews agree with runtime damage and interval",all_math,catalog_checks)
	check("weapon previews do not consume RNG or mutate the battle",all_read_only)
	var preview_sim = Sim.new()
	preview_sim.start({},8)
	preview_sim.player.levels.kunai = 4
	preview_sim.player.levels.xp = 1
	var preview: Dictionary = preview_sim.catalog.preview_upgrade(preview_sim,"kunai")
	check("level five card announces unlocked evolution",preview.ready and preview.next_level==5 and preview.synergy.contains("다음 진화 가능"))
	preview_sim.player.levels.erase("xp")
	preview = preview_sim.catalog.preview_upgrade(preview_sim,"kunai")
	check("missing passive prerequisite remains visible",not preview.ready and preview.synergy.contains("0/1"))
	preview_sim.player.levels.kunai = 5
	preview = preview_sim.catalog.preview_upgrade(preview_sim,"xp")
	check("passive card identifies owned max-level partner",preview.ready and preview.synergy.contains("5/5"))
	preview = preview_sim.catalog.preview_upgrade(preview_sim,"atk")
	check("passive synergy hides unavailable alternative main weapons",not preview.synergy.contains(preview_sim.catalog.label("shotgun")) and not preview.synergy.contains(preview_sim.catalog.label("revolver")))
	preview_sim.player.levels.droneA = 4
	preview_sim.player.levels.droneB = 5
	preview = preview_sim.catalog.preview_upgrade(preview_sim,"droneA")
	check("drone fusion card reports both five-level prerequisites",preview.ready and preview.synergy.contains("5/5"))
	preview_sim.open_chest()
	preview = preview_sim.catalog.preview_upgrade(preview_sim,"GOLD")
	check("fallback supply reward displays the real chest amount",preview.lines[0].contains(str(preview_sim.get("_chest_reward"))))
	var passive_complete: bool = true
	for passive in preview_sim.catalog.definitions:
		if preview_sim.catalog.definitions[passive].kind != "passive": continue
		var before_snapshot: String = JSON.stringify(preview_sim.snapshot())
		preview = preview_sim.catalog.preview_upgrade(preview_sim,passive)
		passive_complete = passive_complete and preview.lines.size()>=2 and preview.lines.size()<=4 and JSON.stringify(preview_sim.snapshot())==before_snapshot
	check("all twelve passive previews have read-only effect comparisons",passive_complete)

	root.size = Vector2i(1280,800)
	var main = Main.new()
	root.add_child(main)
	await frames()
	main.set_physics_process(false)
	main.set_process(false)
	check("G2 world exposes settings and preview contracts",main.world.has_method("apply_settings") and main.world.has_method("set_preview"))
	main._settings({"sound":true,"volume":0.25,"quality":false,"screen_shake":false,"damage_numbers":false,"radar":false})
	check("all player settings reach profile",main.profile.settings.volume==0.25 and not main.profile.settings.quality and not main.profile.settings.screen_shake and not main.profile.settings.damage_numbers and not main.profile.settings.radar)
	check("volume and quality apply immediately",main.sound.volume==0.25 and not main.world.sunlight.shadow_enabled)
	main.sound.play("boss")
	main._settings({"volume":0.0})
	var stopped: bool = true
	for voice in main.sound.voices: stopped = stopped and not voice.playing
	check("zero volume stops current sound voices",stopped and main.sound.volume==0.0)
	main._settings({"volume":0.5,"sound":false})
	check("mute preserves chosen volume",not main.sound.enabled and main.sound.volume==0.5)
	main._settings({"preview_chapter":2,"preview_weapon":"revolver"})
	main.world.sync(main.sim,0.1)
	main.world.sync(main.sim,0.1)
	check("lobby chapter and weapon stay selected across frames",main.world._chapter==2 and main.world._last_weapon=="revolver")
	key(KEY_N)
	check("N toggles radar without entering a menu",main.profile.settings.radar)
	main._start({"weapon":"kunai"})
	main.sim.director_enabled = false
	main._on_state_changed()
	main.stick.enabled = true
	await frames()
	touch(Vector2(160,400),true)
	check("touch on playfield captures virtual stick",main.stick.dragging and main.stick.touch_id==0)
	var drag = InputEventScreenDrag.new()
	drag.position = Vector2(160,338)
	drag.index = 0
	root.push_input(drag,true)
	check("upward touch means screen-up movement",main.stick.vector.distance_to(Vector2.UP)<0.01)
	touch(Vector2(160,338),false)
	check("touch release clears movement",not main.stick.dragging and main.stick.vector==Vector2.ZERO)
	# A GUI control in the joystick region must receive a touch without moving.
	var layer = CanvasLayer.new()
	layer.layer = 30
	main.add_child(layer)
	var blocker = Button.new()
	blocker.position = Vector2(100,300)
	blocker.size = Vector2(160,80)
	blocker.text = "Touch UI"
	layer.add_child(blocker)
	await frames()
	touch(Vector2(180,340),true)
	check("touch on native GUI cannot capture movement",not main.stick.dragging)
	touch(Vector2(180,340),false)
	layer.queue_free()
	await frames()
	main._pause()
	main._physics_process(1.0/60.0)
	touch(Vector2(160,400),true)
	check("paused touch cannot start movement",not main.stick.dragging)
	touch(Vector2(160,400),false)
	main.qa_mode = false
	main.store = store
	main.profile = store.default_profile()
	main.sim.finish(true)
	check("native result commits through composition root",main._settle() and main.profile.history.size()==1)
	main._settings({"radar":false})
	main._lobby()
	check("quick result-to-lobby transition flushes pending settings",not store.load_profile().settings.radar and not main.profile_dirty and main.profile.history.size()==1)
	main._start({"weapon":"kunai"})
	main.store = failed_store
	main.sim.finish(true)
	main._notification(Node.NOTIFICATION_WM_CLOSE_REQUEST)
	await frames()
	check("failed result settlement blocks native close request",is_instance_valid(main) and main.sim.state=="won" and not main.profile.settled.has(main.sim.run_id))
	main.qa_mode = true
	main.queue_free()
	await frames()
	cleanup(folder)
	var report = {"suite":"G2 native integration and migration","engine":Engine.get_version_info().string,"passed":checks.size()-failures.size(),"failed":failures.size(),"checks":checks}
	var file = FileAccess.open("res://tests/g2_integration_report.json",FileAccess.WRITE)
	file.store_string(JSON.stringify(report,"  "))
	file.close()
	print("G2_INTEGRATION ",report.passed,"/",checks.size()," failed=",report.failed)
	quit(0 if failures.is_empty() else 1)
