extends SceneTree

const AssetLoader := preload("res://sim/asset_loader.gd")
const SfxBank := preload("res://sim/sfx.gd")

var checks := 0
var failed := 0


func _initialize() -> void:
	test.call_deferred()


func _check(ok: bool, label: String) -> void:
	checks += 1
	if not ok:
		failed += 1
		printerr("FAIL ", label)


func test() -> void:
	var loader := AssetLoader.new()
	root.add_child(loader)
	await process_frame
	_check(not loader.index.is_empty(), "data/asset_index.json loads cleanly")
	var summary: Dictionary = loader.index.get("summary", {})
	_check(int(summary.get("missing_files", 1)) == 0 and int(summary.get("mismatched_files", 1)) == 0, "asset index records zero omissions and zero mismatches")
	_check(int(summary.get("extracted_files", 0)) >= 12080, "asset index records >= 12,080 extracted files")
	_check(loader.index.get("part_sprites", {}).size() == 96, "asset index maps all 96 Terran parts")
	_check(loader.index.get("audio_sfx", {}).size() >= 16, "asset index maps all 16 combat SFX kinds")
	_check(int(loader.index.get("web_sfx", {}).get("count", 0)) >= 14, "compact Web SFX WAV pack exported for Web Godot audio streaming")

	# If local extracted_assets/ or C:/Temp/Cosmoteer/Data is present, verify real PNG & WAV loading
	if not loader.data_root.is_empty():
		_check(loader.loaded_count == 96, "local web_atlas loads all 96 Terran parts: %d" % loader.loaded_count)
		for pid in [
			"cosmoteer.reactor_small", "cosmoteer.laser_blaster_small", "cosmoteer.shield_gen_small",
			"cosmoteer.missile_launcher", "cosmoteer.ion_beam_emitter", "cosmoteer.ion_beam_prism",
			"cosmoteer.railgun_launcher", "cosmoteer.flak_cannon_large", "cosmoteer.chaingun",
		]:
			var cut := AssetLoader.get_part_texture(pid, "cutaway")
			var roof := AssetLoader.get_part_texture(pid, "roof")
			_check(cut != null and cut.get_width() > 0 and roof != null and roof.get_width() > 0, "original sprite loads for " + pid)
		for tid in ["cosmoteer.cannon_deck", "cosmoteer.cannon_med", "cosmoteer.flak_cannon_large"]:
			var tur := AssetLoader.get_part_texture(tid, "turret")
			_check(tur != null and tur.get_width() > 0, "separate rotating turret sprite loads for " + tid)
		for skey in ["cloud_1", "star", "ast_iron", "ast_gold", "crew_carry", "battery", "shot_laser_small", "shot_laser_small_1", "shot_chaingun", "shot_missile_he", "shot_mine", "shot_railgun", "exp_big", "exp_big_0", "exp_big_3", "exp_med_0", "shockwave", "reactor_shockwave", "spark", "smoke", "thruster_plume", "fire_0", "fire_3", "debris", "debris_3", "flame", "damage_cracks", "shield_energy"]:
			var st := AssetLoader.get_sprite(skey)
			_check(st != null and st.get_width() > 0, "extra visual sprite loads from v4 atlas: " + skey)
		var bank := SfxBank.new()
		root.add_child(bank)
		await process_frame
		_check(bank.streams.size() == SfxBank.KINDS.size(), "SfxBank loads all 14 streams with real WAV overrides")
		var real_laser := loader.load_sfx_wav("shot_laser")
		_check(real_laser != null and real_laser.data.size() > 1000, "real Cosmoteer WAV parses into AudioStreamWAV")

	print("AssetLoader checks: %d; failures: %d" % [checks, failed])
	quit(1 if failed else 0)
