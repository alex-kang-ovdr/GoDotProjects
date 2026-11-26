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

	# 7. ae_prof.sav Binary Profile Parsing & Unlock/Victory Badges
	var prof := FTLProfile.new()
	var expect_prof := FileAccess.file_exists("C:/Temp/FTL/FTL_Sav/ae_prof.sav")
	if expect_prof:
		var prof_ok := prof.load_from_sav_file("C:/Temp/FTL/FTL_Sav/ae_prof.sav")
		_check(prof_ok and prof.version == 9, "ae_prof.sav v9 parsed natively", "v=%d ach=%d" % [prof.version, prof.achievements.size()])
		_check(int(prof.stats.total_games) >= 300 and int(prof.stats.total_victories) >= 50,
			"ae_prof.sav lifetime stats extracted",
			"games=%d wins=%d scrap=%d" % [int(prof.stats.total_games), int(prof.stats.total_victories), int(prof.stats.total_scrap)])
		_check(prof.top_scores.size() == 5 and prof.crew_records.size() == 5,
			"ae_prof.sav Top 5 scores & 5 Crew Legends parsed",
			"top=%d crew=%d" % [prof.top_scores.size(), prof.crew_records.size()])
		_check(prof.is_ship_unlocked("PLAYER_SHIP_HARD") and not prof.get_ship_victory_badge("PLAYER_SHIP_HARD").is_empty(),
			"ae_prof.sav unlocks & victory badge resolved for Kestrel",
			"badge=%s" % prof.get_ship_victory_badge("PLAYER_SHIP_HARD"))
	else:
		_check(true, "Fallback profile check (no C:/Temp/FTL/FTL_Sav/ae_prof.sav)")

	# 8. Deep Feature Tests: Teleporter Boarding, Hacking, Mind Control, Beam Drag-Line
	var adv_player := FTLShip.new()
	adv_player.init_from_blueprint(db, "PLAYER_SHIP_HARD", true, 0)
	adv_player.reactor_max = 16
	adv_player.drone_parts = 4
	var adv_enemy := FTLShip.new()
	adv_enemy.init_from_blueprint(db, "REBEL_SKINNY", false, 0)
	adv_enemy.shield_layers = 2
	adv_enemy.systems.engines.power = 2

	# 8a. System installation & Teleporter Boarding
	var inst_tp := adv_player.install_system("teleporter")
	var inst_hk := adv_player.install_system("hacking")
	var inst_mc := adv_player.install_system("mind")
	_check(inst_tp and inst_hk and inst_mc, "Store install_system installs Teleporter, Hacking, Mind Control")
	adv_player.add_system_power("teleporter")
	var tp_rid := int(adv_player.systems.teleporter.room)
	var boarder: Dictionary = adv_player.crew[0]
	boarder.room_id = tp_rid
	boarder.pos = adv_player.get_room_center_local(tp_rid)
	var enemy_target_rid := int(adv_enemy.rooms[0].id)
	var sent := adv_player.teleport_send(adv_enemy, enemy_target_rid)
	_check(sent >= 1 and adv_enemy.crew.has(boarder) and not adv_player.crew.has(boarder),
		"Teleporter sends friendly boarder to enemy room", "sent=%d" % sent)
	adv_player.teleporter_cooldown = 0.0
	var returned := adv_player.teleport_retrieve(adv_enemy, enemy_target_rid)
	_check(returned >= 1 and adv_player.crew.has(boarder) and not adv_enemy.crew.has(boarder),
		"Teleporter retrieves boarder back to player ship", "returned=%d" % returned)

	# 8b. Hacking pod launch + active pulse drains shields / zeroes evasion
	adv_player.add_system_power("hacking")
	var enemy_sh_room := int(adv_enemy.systems.shields.room) if adv_enemy.systems.has("shields") else int(adv_enemy.rooms[0].id)
	var hk_launched := adv_player.launch_hacking(adv_enemy, enemy_sh_room)
	var hk_pulsed := adv_player.activate_hacking(adv_enemy)
	for _h in range(40):
		adv_player.step(0.1, adv_enemy, true)
	_check(hk_launched and hk_pulsed and adv_enemy.shield_layers < 2,
		"Hacking pod & pulse drains enemy shields", "shields=%d" % adv_enemy.shield_layers)
	adv_player.clear_hacking(adv_enemy)

	# 8c. Mind Control flips enemy crew allegiance
	adv_player.add_system_power("mind")
	var enemy_crew_rid := int(adv_enemy.crew[0].room_id) if not adv_enemy.crew.is_empty() else 0
	var mc_ok := adv_player.activate_mind_control(adv_enemy, enemy_crew_rid)
	var mc_flipped := false
	for c in adv_enemy.crew:
		if float(c.get("mind_timer", 0.0)) > 0.0 and adv_enemy._crew_effective_player(c):
			mc_flipped = true
			break
	_check(mc_ok and mc_flipped, "Mind Control flips enemy crew allegiance temporarily")

	# 8d. Beam Drag-Line exact room intersection
	var b0 := adv_enemy.get_room_center_local(int(adv_enemy.rooms[0].id))
	var b1 := adv_enemy.get_room_center_local(int(adv_enemy.rooms[-1].id))
	var beam_hits := adv_enemy.compute_beam_rooms(b0, b1)
	_check(beam_hits.size() >= 2 and beam_hits.has(int(adv_enemy.rooms[0].id)) and beam_hits.has(int(adv_enemy.rooms[-1].id)),
		"Beam drag-line segment intersects multiple exact rooms", "rooms=%s" % str(beam_hits))

	# 8e. Backup Battery (+2 reactor power, 30s active, auto-reclaim on expiry)
	var inst_bat := adv_player.install_system("battery")
	var base_react := adv_player.get_total_reactor_max()
	var bat_ok := adv_player.activate_battery()
	var boosted_react := adv_player.get_total_reactor_max()
	adv_player.step(30.5, adv_enemy, false)
	_check(inst_bat and bat_ok and boosted_react == base_react + 2 and adv_player.battery_bonus == 0 and adv_player.battery_cooldown > 0.0,
		"Backup Battery boosts reactor +2 and expires into cooldown", "base=%d boosted=%d" % [base_react, boosted_react])

	# 8f. Federation Cruiser A Artillery Beam auto-charge & shield-piercing fire
	var fed := FTLShip.new()
	fed.init_from_blueprint(db, "PLAYER_SHIP_FED", true, 0)
	if fed.systems.has("artillery") and fed.get_effective_system_power("artillery") <= 0:
		fed.reactor_max += 1
		fed.add_system_power("artillery")
	fed.artillery_charge = 49.5
	fed.pending_shots.clear()
	fed.step(1.0, adv_enemy, true)
	var art_fired := false
	for sh_ev in fed.pending_shots:
		if str(sh_ev.weapon.get("id", "")) == "ARTILLERY_FED" and int(sh_ev.weapon.bp.get("sp", 0)) >= 5:
			art_fired = true
	_check(fed.systems.has("artillery") and art_fired, "Federation A Artillery Beam charges and fires shield-piercing beam")

	# 8g. AE Weapon Mechanics: Flak multi-projectile XML + Chain Vulcan cooldown reduction
	var flak_bp: Dictionary = db.weapons.get("SHOTGUN", {})
	_check(int(flak_bp.get("shots", 0)) >= 3 and float(flak_bp.get("radius", 0.0)) > 0.0,
		"Flak I (SHOTGUN) parses real multi-projectile count & scatter radius", "shots=%d rad=%.0f" % [int(flak_bp.get("shots", 0)), float(flak_bp.get("radius", 0.0))])
	var vulcan_ship := FTLShip.new()
	vulcan_ship.init_from_blueprint(db, "PLAYER_SHIP_HARD", true, 0)
	vulcan_ship.weapons.clear()
	vulcan_ship.add_weapon("LASER_CHAINGUN_2")
	var vw: Dictionary = vulcan_ship.weapons[0]
	var cd0 := vulcan_ship.get_weapon_effective_cooldown(vw)
	vw.chain_count = 5
	var cd5 := vulcan_ship.get_weapon_effective_cooldown(vw)
	_check(cd5 < cd0 and cd5 <= 2.0, "Chain Vulcan reduces effective cooldown across chain stacks", "cd0=%.1f cd5=%.1f" % [cd0, cd5])

	# 8h. Clonebay replaces Medbay, queues dead crew revival, and heals on FTL jump
	var cb_ship := FTLShip.new()
	cb_ship.init_from_blueprint(db, "PLAYER_SHIP_HARD", true, 0)
	var cb_inst := cb_ship.install_system("clonebay")
	if cb_ship.get_effective_system_power("clonebay") <= 0:
		cb_ship.reactor_max += 1
		cb_ship.add_system_power("clonebay")
	var dying_crew: Dictionary = cb_ship.crew[0]
	var dying_name := str(dying_crew.name)
	dying_crew.hp = 0.0
	cb_ship.step(0.1, null, false)
	var queued_ok := cb_ship.clone_queue.size() == 1 and cb_ship.has_living_crew()
	for _ct in range(130):
		cb_ship.step(0.1, null, false)
	var revived := false
	for c in cb_ship.crew:
		if str(c.name) == dying_name and float(c.hp) >= float(c.max_hp):
			revived = true
	cb_ship.crew[0].hp = 50.0
	cb_ship.on_ftl_jump()
	_check(cb_inst and not cb_ship.systems.has("medbay") and queued_ok and revived and float(cb_ship.crew[0].hp) > 50.0,
		"Clonebay replaces Medbay, revives via queue, and heals on FTL jump")

	# 8i. Enemy FTL Escape charging & full Ship Save/Load round-trip
	var flee_enemy := FTLShip.new()
	flee_enemy.init_from_blueprint(db, adv_enemy.blueprint_id, false, 1)
	flee_enemy.systems.pilot.level = 2
	flee_enemy.systems.engines.power = 2
	flee_enemy.fleeing = true
	flee_enemy.flee_ftl_charge = 0.0
	flee_enemy.step(2.0, adv_player, true)
	_check(flee_enemy.flee_ftl_charge > 0.0, "Fleeing enemy charges FTL escape drive", "ftl=%.2f" % flee_enemy.flee_ftl_charge)

	adv_player.scrap = 321
	adv_player.upgrade_system("shields")
	var expected_scrap := adv_player.scrap
	adv_player.augments.append("SCRAP_COLLECTOR")
	var saved_state := adv_player.serialize_state()
	var restored := FTLShip.new()
	restored.init_from_blueprint(db, adv_player.blueprint_id, true, 0)
	restored.deserialize_state(saved_state)
	_check(restored.scrap == expected_scrap and restored.systems.has("teleporter") and restored.systems.has("battery") and restored.has_augment("SCRAP_COLLECTOR") and int(restored.systems.shields.level) == int(adv_player.systems.shields.level),
		"Ship serialize_state/deserialize_state preserves systems, upgrades & augments")

	# 8j. Ion Storm halves base reactor power, Crystal Lockdown blocks movement, Slug telepathy & Flagship Phase 2 Drone Surge
	var storm_base := restored.get_total_reactor_max()
	restored.ion_storm_active = true
	var storm_halved := restored.get_total_reactor_max()
	restored.ion_storm_active = false
	_check(storm_halved == int(storm_base / 2), "Ion Storm halves base reactor power", "base=%d storm=%d" % [storm_base, storm_halved])

	var cr_member := restored.add_crew("crystal", int(restored.rooms[0].id), true, "Ruwen")
	var sl_member := restored.add_crew("slug", int(restored.rooms[0].id), true, "Slocknog")
	var lock_ok := restored.activate_crystal_lockdown(int(cr_member.id))
	var start_pos: Vector2 = sl_member.pos
	restored.command_crew_to_room(sl_member, int(restored.rooms[-1].id))
	restored.step(0.5, null, false)
	_check(lock_ok and float(restored.room_by_id[int(restored.rooms[0].id)].lockdown_timer) > 0.0 and sl_member.room_id == int(restored.rooms[0].id) and restored.has_slug_crew(),
		"Crystal Lockdown blocks room exit & Slug telepathy detected")

	var boss2 := FTLShip.new()
	boss2.init_from_blueprint(db, "BOSS_2", false, 7)
	boss2.is_boss = true
	boss2.boss_phase = 2
	boss2.boss_surge_timer = 0.1
	boss2.ai_decision_timer = 0.0
	boss2.pending_shots.clear()
	boss2.step(0.5, restored, true)
	var drone_surge_shots := 0
	for sh_ev in boss2.pending_shots:
		if str(sh_ev.weapon.get("id", "")) == "BOSS_DRONE_SURGE":
			drone_surge_shots += 1
	_check(drone_surge_shots >= 5, "Rebel Flagship Phase 2 fires 5-shot Drone Power Surge", "shots=%d" % drone_surge_shots)

	# 8k. Blast Doors block intruders & break down, Shield Overcharger Drone, Augments (NANO_MEDBAY/SLUG_GEL/DRONE_RECOVERY) & Unmanned Auto-Scout
	var door_ship := FTLShip.new()
	door_ship.init_from_blueprint(db, "PLAYER_SHIP_HARD", true, 0)
	door_ship.set_all_doors_open(false, true)
	var d_start := int(door_ship.rooms[0].id)
	var d_next := -1
	for dd in door_ship.doors:
		if not bool(dd.airlock) and (int(dd.room_a) == d_start or int(dd.room_b) == d_start):
			d_next = int(dd.room_b) if int(dd.room_a) == d_start else int(dd.room_a)
			dd.hp = 20.0
			break
	var intruder := door_ship.add_crew("mantis", d_start, false, "Raider")
	door_ship.command_crew_to_room(intruder, d_next)
	door_ship.step(0.4, null, false)
	var blocked_initially := int(intruder.room_id) == d_start
	for _bk in range(20):
		door_ship.step(0.2, null, false)
	var broke_through := int(intruder.room_id) == d_next
	_check(blocked_initially and broke_through, "Closed Blast Doors block intruder until broken down")

	door_ship.reactor_max += 4
	door_ship.install_system("drones")
	door_ship.systems.drones.level = 2
	door_ship.add_system_power("drones")
	door_ship.add_system_power("drones")
	if door_ship.get_effective_system_power("medbay") <= 0:
		door_ship.add_system_power("medbay")
	door_ship.augments.append("SLUG_GEL")
	door_ship.augments.append("NANO_MEDBAY")
	door_ship.augments.append("DRONE_RECOVERY")
	door_ship.rooms[0].breach = 1
	door_ship.rooms[0].breach_hp = 5.0
	door_ship.crew[0].hp = 50.0
	door_ship.step(1.0, null, false)
	var gel_ok := int(door_ship.rooms[0].breach) == 0
	var nano_ok := float(door_ship.crew[0].hp) > 50.0
	door_ship.drones.append({"id": "DRONE_SHIELD", "bp": {"type": "SHIELD", "power": 2}, "powered": true, "active": true, "angle": 0.0, "cooldown": 0.0, "hp": 1})
	door_ship.step(0.2, boss2, true)
	var ov_shield_ok := door_ship.zoltan_shield >= 1
	var rec_parts := door_ship.recover_active_drones()
	_check(gel_ok and nano_ok and ov_shield_ok and rec_parts >= 1,
		"Augments (Slug Gel, Nano Medbay, Drone Recovery) & Shield Overcharger Drone work")

	var auto_ship := FTLShip.new()
	auto_ship.init_from_blueprint(db, "AUTO_BASIC", false, 1)
	auto_ship.crew.clear()
	auto_ship.is_unmanned = true
	_check(auto_ship.has_living_crew(), "Unmanned Auto-Scout stays active with 0 crew")

	# 8l. Save/Return Crew Stations (S/R), Crew Dismiss, & Quest Beacon placement
	var st_ship := FTLShip.new()
	st_ship.init_from_blueprint(db, "PLAYER_SHIP_HARD", true, 0)
	var st_orig_room := int(st_ship.crew[0].room_id)
	var saved_cnt := st_ship.save_crew_stations()
	st_ship.crew[0].room_id = int(st_ship.rooms[-1].id)
	var ret_cnt := st_ship.return_crew_to_stations()
	var dismiss_ok := st_ship.dismiss_crew(int(st_ship.crew[-1].id))
	var q_bid := smap.add_quest_beacon("QUEST_TEST_EVENT")
	_check(saved_cnt >= 3 and ret_cnt >= 1 and int(st_ship.crew[0].target_room) == st_orig_room and dismiss_ok and q_bid >= 0 and bool(smap.beacons[q_bid].get("quest", false)),
		"Crew Save/Return Stations (S/R), Crew Dismiss & Quest Beacon work")

	# 8m. Zero-missing Sprite & Icon Asset integrity check against ftl.dat.vanilla
	var missing_assets: Array[String] = []
	for sname in FTLShip.SYSTEM_ORDER:
		for suf in ["green1", "orange1", "red1", "blue1", "grey1", "overlay"]:
			var p := "icons/s_%s_%s.png" % [sname, suf]
			if pkg.load_texture(p) == null:
				missing_assets.append(p)
	for ui_ic in ["ui_icons/icon_fuel.png", "ui_icons/icon_missiles.png", "ui_icons/icon_drones.png", "ui_icons/icon_scrap.png"]:
		if pkg.load_texture(ui_ic) == null:
			missing_assets.append(ui_ic)
	for sp in ["human", "engi", "mantis", "rock", "energy", "slug", "crystal", "anaerobic", "battle", "repair"]:
		var cp := "people/%s_base.png" % sp
		if pkg.load_texture(cp) == null:
			missing_assets.append(cp)
	for fx_p in ["ship/drones/drone_combat_base.png", "ship/drones/drone_defense_base.png", "ship/drones/drone_hack_base.png", "effects/explosion_big1_strip10.png", "effects/explosion_small1_strip9.png", "people/mindcontrol_strip8.png", "asteroids/asteroid0.png"]:
		if pkg.load_texture(fx_p) == null:
			missing_assets.append(fx_p)
	_check(missing_assets.is_empty(), "Zero-missing core FTL sprite & icon assets decoded from PKG (117/117)", "missing=%s" % str(missing_assets))

	# 9. Native scenes/main.tscn boot + Start Run + Profile Modal smoke + Font base64 integrity
	var font_raw := Marshalls.base64_to_raw(FileAccess.get_file_as_string("res://assets/fonts/ftl-ui.txt").strip_edges())
	_check(font_raw.size() > 10000 and font_raw[0] == 0 and font_raw[1] == 1, "Bundled ftl-ui.txt base64 decodes to valid TTF", "bytes=%d" % font_raw.size())
	var packed := load("res://scenes/main.tscn") as PackedScene
	_check(packed != null, "scenes/main.tscn loads as PackedScene")
	var inst := packed.instantiate()
	root.add_child(inst)
	await process_frame
	await process_frame
	_check(inst.mode == "hangar" and inst.hangar_panel.visible, "Main scene boots cleanly into Hangar")
	inst._open_profile_modal()
	await process_frame
	_check(inst.modal_kind == "profile" and inst.modal_overlay.visible, "Profile & Hall of Fame modal opens cleanly")
	inst._close_modal()
	inst._start_new_run()
	await process_frame
	_check(inst.mode == "play" and inst.player_ship != null and inst.hud_root.visible, "Start Run initializes ship & Combat HUD")
	inst.queue_free()
	await process_frame
	pkg.close()

	var elapsed := Time.get_ticks_msec() - started
	print("FTL_TEST_RESULT " + JSON.stringify({"checks": checks.size(), "passed": checks.size() - failed, "failed": failed, "elapsed_ms": elapsed}))
	quit(0 if failed == 0 else 1)
