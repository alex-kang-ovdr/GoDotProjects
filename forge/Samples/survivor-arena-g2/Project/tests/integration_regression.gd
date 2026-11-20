extends SceneTree
## Checks native input, disk saves, corruption recovery and exactly-once settlement.
const Main = preload("res://scripts/main.gd")
const Store = preload("res://scripts/save_store.gd")
const Sim = preload("res://scripts/arena_sim.gd")
var checks: Array = []
var failures: Array = []

func _initialize() -> void:
	call_deferred("run")

func check(name: String, value: bool, detail: Variant = "") -> void:
	checks.append({"name":name,"passed":value,"detail":detail})
	if not value:
		failures.append(name)
		push_error("CHECK FAILED: " + name + " " + str(detail))

func key(code: Key, pressed: bool) -> void:
	var event = InputEventKey.new()
	event.physical_keycode = code
	event.keycode = code
	event.pressed = pressed
	Input.parse_input_event(event)
	Input.flush_buffered_events()

func run() -> void:
	var main = Main.new()
	root.add_child(main)
	await process_frame
	main.set_physics_process(false)
	main.set_process(false)
	main.qa_mode = true
	main.sound.enabled = false
	check("main_native_modules_ready", is_instance_valid(main.world) and is_instance_valid(main.hud) and is_instance_valid(main.sound))
	for pair in [[KEY_W,Vector2.UP],[KEY_S,Vector2.DOWN],[KEY_A,Vector2.LEFT],[KEY_D,Vector2.RIGHT],[KEY_UP,Vector2.UP],[KEY_DOWN,Vector2.DOWN]]:
		main._start({"weapon":"kunai"})
		main.sim.director_enabled = false
		main._on_state_changed()
		key(pair[0],true)
		for i in 60:
			main._physics_process(1.0/60.0)
		key(pair[0],false)
		var position: Vector2 = main.sim.player.pos
		check("input_" + OS.get_keycode_string(pair[0]),position.distance_to(pair[1]*190.0)<0.1,str(position))
	main._start({})
	main.sim.director_enabled = false
	main._on_state_changed()
	key(KEY_W,true)
	key(KEY_D,true)
	for i in 60:
		main._physics_process(1.0/60.0)
	key(KEY_W,false)
	key(KEY_D,false)
	check("diagonal_speed_normalized",absf(main.sim.player.pos.length()-190.0)<0.1,main.sim.player.pos.length())
	var at: float = main.sim.elapsed
	key(KEY_P,true)
	key(KEY_P,false)
	check("P_key_pauses",main.sim.state=="paused",main.sim.state)
	for i in 60: main._physics_process(1.0/60.0)
	check("pause_freezes_simulation",is_equal_approx(at,main.sim.elapsed))
	key(KEY_ESCAPE,true)
	key(KEY_ESCAPE,false)
	check("escape_resumes",main.sim.state=="playing")
	main._on_state_changed()
	key(KEY_B,true)
	key(KEY_B,false)
	check("build_overlay_pauses",main.build_open and main.sim.state=="paused")
	key(KEY_B,true)
	key(KEY_B,false)
	check("build_overlay_resumes",not main.build_open and main.sim.state=="playing")
	main.sim.gain_xp(12)
	main._on_state_changed()
	check("levelup_opens_cards",main.sim.state=="choice" and not main.sim.draft.is_empty())
	var rerolls: int = main.sim.rerolls
	key(KEY_R,true)
	key(KEY_R,false)
	check("R_key_consumes_one_reroll",main.sim.rerolls==rerolls-1)
	var selected: String = main.sim.draft[0]
	key(KEY_1,true)
	key(KEY_1,false)
	check("number_key_applies_card",main.sim.player.levels.has(selected) and main.sim.state=="playing",selected)
	main._on_state_changed()
	main._notification(Node.NOTIFICATION_APPLICATION_FOCUS_OUT)
	check("focus_loss_pauses",main.sim.state=="paused")
	check("focus_loss_clears_movement",Input.get_vector("move_left","move_right","move_up","move_down")==Vector2.ZERO)

	var directory: String = "user://integration_tests_%d/" % Time.get_ticks_usec()
	var store = Store.new(directory)
	var sim = Sim.new()
	sim.start({"weapon":"revolver","chapter":2},714)
	sim.director_enabled = false
	sim.spawn_enemy("tank",Vector2(120,0))
	for i in 30: sim.step(1.0/60.0,Vector2.UP)
	check("disk_checkpoint_written",store.save_run(sim.snapshot()),store.last_error)
	var copy = Sim.new()
	check("disk_checkpoint_restores",copy.restore(store.load_run()),copy.last_restore_error)
	check("disk_position_preserved",copy.player.pos.distance_to(sim.player.pos)<0.001)
	check("disk_ammo_and_reload_preserved",copy.player.ammo==sim.player.ammo and is_equal_approx(copy.player.reload,sim.player.reload))
	sim.gain_xp(12)
	check("choice_checkpoint_written",store.save_run(sim.snapshot()))
	var choice = Sim.new()
	check("choice_checkpoint_restores",choice.restore(store.load_run()))
	check("choice_and_candidates_unchanged",choice.state=="choice" and choice.draft==sim.draft)
	var bad = FileAccess.open(directory+"run.json",FileAccess.WRITE)
	bad.store_string("{truncated");bad.close()
	var recovered = Sim.new()
	check("corrupt_primary_recovers_backup",recovered.restore(store.load_run()))
	check("backup_is_previous_checkpoint",recovered.state=="playing")
	store.clear_run()
	check("clear_removes_primary_backup_temp",not store.has_run())
	var profile: Dictionary = store.default_profile()
	profile.runs=3
	check("profile_persists",store.save_profile(profile) and store.load_profile().runs==3)
	var result = {"won":true,"kills":237,"credits":345}
	check("result_first_settlement",store.settle(profile,"test-run-001",result))
	check("settled_result_values",profile.wins==1 and profile.credits==345 and profile.best_kills==237)
	check("duplicate_settlement_is_idempotent",store.settle(profile,"test-run-001",result) and profile.wins==1 and profile.credits==345)
	var reloaded: Dictionary = store.load_profile()
	check("settlement_ledger_survives_reload",reloaded.settled.has("test-run-001"))
	check("duplicate_after_reload_is_idempotent",store.settle(reloaded,"test-run-001",result) and reloaded.wins==1 and reloaded.credits==345)
	var invalid: Dictionary = sim.snapshot()
	invalid.player.pos={"__vec2":["bad"]}
	var original_position: Vector2 = copy.player.pos
	check("malformed_vector_rejected",not copy.restore(invalid))
	check("invalid_restore_is_atomic",copy.player.pos==original_position)
	invalid=sim.snapshot()
	invalid.config.weapon="not_a_weapon"
	check("unknown_equipped_weapon_rejected",not copy.restore(invalid))
	invalid=sim.snapshot()
	invalid.player.hp=99999999
	check("invalid_hp_rejected",not copy.restore(invalid))
	var output={"suite":"Godot native integration","engine":Engine.get_version_info().string,"passed":checks.size()-failures.size(),"failed":failures.size(),"checks":checks}
	var file=FileAccess.open("res://tests/integration_report.json",FileAccess.WRITE)
	file.store_string(JSON.stringify(output,"  "));file.close()
	print("INTEGRATION_RESULT ",checks.size()-failures.size(),"/",checks.size()," failed=",failures.size())
	for suffix in ["profile.json","profile.json.bak","profile.json.tmp"]:
		DirAccess.remove_absolute(ProjectSettings.globalize_path(directory+suffix))
	DirAccess.remove_absolute(ProjectSettings.globalize_path(directory))
	main.queue_free()
	await process_frame
	quit(0 if failures.is_empty() else 1)
