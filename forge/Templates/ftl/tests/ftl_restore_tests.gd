extends SceneTree

## Automated verification suite for FTL: Faster Than Light Godot 4.7.2 Restoration.
## Verifies C:\Temp\FTL\ftl.dat.vanilla PKG parsing, XML blueprints, ship layouts,
## PNG/OGG asset loading, combat/atmosphere/crew simulation, sector map, and main.tscn boot.

var checks: Array = []
var failed: int = 0

func _init() -> void:
	call_deferred("_run")


func _check(cond: bool, label: String, detail: String = "") -> void:
	checks.append({"label": label, "passed": cond, "detail": detail})
	if not cond:
		failed += 1
	print(("%s %s%s" % ["PASS" if cond else "FAIL", label, (" — " + detail) if not detail.is_empty() else ""]))


func _run() -> void:
	var started := Time.get_ticks_msec()

	# 1. FTLPkg + FTLDatabase load (tests real C:\Temp\FTL\ftl.dat.vanilla when present)
	var pkg := FTLPkg.new()
	var opened := pkg.auto_open()
	var expect_real := FileAccess.file_exists("C:/Temp/FTL/ftl.dat.vanilla")
	if expect_real:
		_check(opened and pkg.entry_count >= 3000, "PKG opens C:/Temp/FTL/ftl.dat.vanilla", "entries=%d" % pkg.entry_count)
		var kestrel_tex := pkg.load_texture("ship/kestral_base.png")
		_check(kestrel_tex != null and kestrel_tex.get_width() > 300, "Real PNG texture decoded from PKG", "%dx%d" % [kestrel_tex.get_width() if kestrel_tex else 0, kestrel_tex.get_height() if kestrel_tex else 0])
		var music_ogg := pkg.load_audio("audio/music/bp_MUS_CivilEXPLORE.ogg")
		_check(music_ogg != null, "Real OGG music decoded from PKG")
		var ui_wav := pkg.load_audio("audio/waves/ui/select_up1.wav")
		_check(ui_wav != null, "Real WAV SFX decoded from PKG")
	else:
		_check(true, "Fallback mode active (no C:/Temp/FTL/ftl.dat.vanilla)")

	var db := FTLDatabase.new()
	db.load_all(pkg)
	_check(db.ships.has("PLAYER_SHIP_HARD"), "Kestrel A blueprint parsed")
	_check(db.weapons.has("LASER_BURST_2") and db.weapons.has("MISSILES_2_PLAYER"), "Core weapons parsed", "total=%d" % db.weapons.size())
	_check(db.crew_species.size() >= 8, "All crew species parsed", "count=%d" % db.crew_species.size())
	_check(db.systems.size() >= 12, "Ship systems parsed", "count=%d" % db.systems.size())
	if expect_real:
		_check(db.player_ship_ids.size() >= 18, "Full player ship hangar parsed from XML", "count=%d" % db.player_ship_ids.size())
		_check(db.events.size() >= 100, "Real FTL XML events parsed", "events=%d" % db.events.size())
		_check(db.music_tracks.has("civilian") and db.sound_effects.has("powerUpSystem"), "sounds.xml music & SFX parsed")
		_check(db.weapon_anims.size() >= 20 and db.anim_sheets.size() >= 40, "animations.xml sheets & weaponAnims parsed")

	# 2. Ship layout + simulation checks
	var kestrel_layout := db.get_ship_layout("kestral")
	_check(kestrel_layout.rooms.size() == 17, "Kestrel layout has exact 17 rooms", "rooms=%d" % kestrel_layout.rooms.size())
	_check(kestrel_layout.doors.size() >= 20, "Kestrel layout has doors & airlocks", "doors=%d" % kestrel_layout.doors.size())
	_check(kestrel_layout.weapon_mounts.size() >= 4, "Kestrel layout has 4+ weapon mounts", "mounts=%d" % kestrel_layout.weapon_mounts.size())

	var player := FTLShip.new()
	player.init_from_blueprint(db, "PLAYER_SHIP_HARD", true, 0)
	var enemy := FTLShip.new()
	enemy.init_from_blueprint(db, "REBEL_SKINNY", false, 0)
	_check(player.hull == 30 and player.rooms.size() == 17 and player.crew.size() == 3, "Kestrel initializes hull/rooms/crew")
	_check(player.shield_layers >= 1, "Initial shield layer active", "layers=%d" % player.shield_layers)

	# 3. Airlock vacuum venting extinguishes fires
	var airlock_room := -1
	for d in player.doors:
		if bool(d.airlock):
			airlock_room = int(d.room_a) if int(d.room_a) >= 0 else int(d.room_b)
			d.open = true
			break
	_check(airlock_room >= 0, "Airlock door found on Kestrel")
	if airlock_room >= 0:
		player.room_by_id[airlock_room].fires = 1
		player.room_by_id[airlock_room].fire_hp = 80.0
		for _t in range(120):
			player.step(0.08, enemy, false)
		_check(float(player.room_by_id[airlock_room].oxygen) < 15.0 and int(player.room_by_id[airlock_room].fires) == 0,
			"Airlock venting drops O2 and extinguishes fire",
			"o2=%.1f fires=%d" % [float(player.room_by_id[airlock_room].oxygen), int(player.room_by_id[airlock_room].fires)])
		player.set_all_doors_open(false, true)

	# 4. Crew BFS pathfinding & repair
	var mover: Dictionary = player.crew[0]
	var orig_room := int(mover.room_id)
	var dest_room := 10 if orig_room != 10 else 0
	player.command_crew_to_room(mover, dest_room)
	_check(not mover.path.is_empty(), "Crew BFS finds multi-room path", "hops=%d" % mover.path.size())
	for _s in range(240):
		player.step(0.05, enemy, false)
	_check(int(mover.room_id) == dest_room, "Crew walks along path to destination room", "room=%d" % int(mover.room_id))

	# 5. Combat damage resolution (shield absorb + missile pierce + ion)
	enemy.shield_layers = 1
	enemy.systems.engines.power = 0 # deterministic 0% evade
	var laser_bp: Dictionary = db.weapons["LASER_BURST_2"]
	var res_shield := enemy.apply_projectile_impact(laser_bp, enemy.rooms[0].id)
	_check(res_shield == "shield" and enemy.shield_layers == 0, "Laser pops 1 shield bubble", "res=%s" % res_shield)
	var hull_before := enemy.hull
	var msl_bp: Dictionary = db.weapons["MISSILES_2_PLAYER"]
	enemy.shield_layers = 2
	var res_msl := enemy.apply_projectile_impact(msl_bp, enemy.rooms[0].id)
	_check(res_msl == "hit" and enemy.hull == hull_before - int(msl_bp.damage), "Missile pierces shields and damages hull", "res=%s hull=%d->%d" % [res_msl, hull_before, enemy.hull])

	# 6. Sector Map & Rebel Fleet pursuit
	var smap := FTLSectorMap.new()
	smap.init_campaign(db)
	_check(smap.sector_tree.size() == 8 and smap.beacons.size() == 20, "8-sector tree & 20-beacon sector generated")
	var start_links: Array = smap.beacons[0].links
	_check(not start_links.is_empty(), "Start beacon has valid jump links", "links=%d" % start_links.size())
	var prev_rebel_x := smap.rebel_fleet_x
	var jumped := smap.jump_to(int(start_links[0]))
	_check(not jumped.is_empty() and smap.rebel_fleet_x > prev_rebel_x, "FTL jump updates beacon & advances Rebel Fleet")

	# 7. Native scenes/main.tscn boot + Start Run smoke
	var packed := load("res://scenes/main.tscn") as PackedScene
	_check(packed != null, "scenes/main.tscn loads as PackedScene")
	var inst := packed.instantiate()
	root.add_child(inst)
	await process_frame
	await process_frame
	_check(inst.mode == "hangar" and inst.hangar_panel.visible, "Main scene boots cleanly into Hangar")
	inst._start_new_run()
	await process_frame
	_check(inst.mode == "play" and inst.player_ship != null and inst.hud_root.visible, "Start Run initializes ship & Combat HUD")
	inst.queue_free()
	await process_frame
	pkg.close()

	var elapsed := Time.get_ticks_msec() - started
	print("FTL_TEST_RESULT " + JSON.stringify({"checks": checks.size(), "passed": checks.size() - failed, "failed": failed, "elapsed_ms": elapsed}))
	quit(0 if failed == 0 else 1)
