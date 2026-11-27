extends SceneTree

## Don't Starve Together Godot 4.7.2 헤드리스 자동화 회귀 테스트.
## 13_godot_rebuild_plan_qa.md의 QA-01 ~ QA-10 전 항목 + 3일 생존 + 메인 씬 인스턴스화 검증.

var passed: int = 0
var failed: int = 0
var errors: Array = []


func _check(cond: bool, name: String, detail: String = "") -> void:
	if cond:
		passed += 1
	else:
		failed += 1
		var msg: String = "FAIL [%s] %s" % [name, detail]
		errors.append(msg)
		printerr(msg)


func _approx(a: float, b: float, eps: float = 0.05) -> bool:
	return abs(a - b) <= eps


func _init() -> void:
	call_deferred("_run")


func _run() -> void:
	var db: DSTDatabase = DSTDatabase.new()
	_check(db.load_from_path("res://data/dst_tuning.json"), "DB_LOAD", "dst_tuning.json 로드")
	_check(db.foods_by_id.has("meatballs") and db.foods_by_id.has("perogies"), "DB_FOODS", "핵심 요리 존재")

	# 원작 추출 에셋(KTEX 타일 10 + 초상화 6 + 아이콘 50 + KAnim 32 + FSB5 SFX 10 + 셰이더 70) 검증
	DSTMedia.ensure_loaded()
	_check(DSTMedia.terrain_tiles.size() >= 10, "MEDIA_TILES", "tiles=%d" % DSTMedia.terrain_tiles.size())
	_check(DSTMedia.portraits.size() >= 6, "MEDIA_PORTRAITS", "portraits=%d" % DSTMedia.portraits.size())
	_check(DSTMedia.icons.size() >= 50, "MEDIA_ICONS", "icons=%d" % DSTMedia.icons.size())
	_check(DSTMedia.kanim_sprites.size() >= 32, "MEDIA_KANIM", "kanim=%d" % DSTMedia.kanim_sprites.size())
	_check(DSTMedia.sfx_streams.size() >= 10, "MEDIA_SFX", "sfx=%d" % DSTMedia.sfx_streams.size())
	_check(DSTMedia.shader_count == 70, "MEDIA_SHADERS", "shaders=%d" % DSTMedia.shader_count)

	# QA-01: DST 다중 방어구 공식 (투구 80% + 갑옷 80% 동시 착용, 물리 100 피격)
	var armors_qa01: Array = [
		{"id": "footballhat", "absorption": 0.80, "durability": 315.0, "planar_defense": 0.0},
		{"id": "armorwood", "absorption": 0.80, "durability": 315.0, "planar_defense": 0.0},
	]
	var r01: Dictionary = DSTDatabase.apply_armor_and_planar(100.0, 0.0, armors_qa01)
	_check(_approx(float(r01["hp_damage"]), 20.0), "QA-01_HP_DAMAGE", "got %.2f" % float(r01["hp_damage"]))
	_check(_approx(float(r01["armor_wear"]["footballhat"]), 40.0) and _approx(float(r01["armor_wear"]["armorwood"]), 40.0), "QA-01_DURABILITY_SPLIT", str(r01["armor_wear"]))

	# QA-02: PlanarEntity 비선형 감쇄 (물리 100 -> 54.16, + 평면 30 = 84.16)
	var eff_phys: float = DSTDatabase.planar_entity_absorb(100.0)
	_check(_approx(eff_phys, 54.162, 0.05), "QA-02_PLANAR_ABSORB_100", "got %.3f" % eff_phys)
	var eff_68: float = DSTDatabase.planar_entity_absorb(68.0)
	_check(_approx(eff_68, 41.321, 0.05), "QA-02_PLANAR_ABSORB_68", "got %.3f" % eff_68)

	# QA-03: 평면 피해는 일반 흡수율 무시, PlanarDefense로만 차감
	var r03_no_pdef: Dictionary = DSTDatabase.apply_armor_and_planar(0.0, 30.0, armors_qa01)
	_check(_approx(float(r03_no_pdef["total_damage"]), 30.0), "QA-03_PLANAR_BYPASS_NORMAL", "got %.2f" % float(r03_no_pdef["total_damage"]))
	var lunar_set: Array = [
		{"id": "lunarplanthat", "absorption": 0.80, "durability": 830.0, "planar_defense": 10.0},
		{"id": "armor_lunarplant", "absorption": 0.80, "durability": 830.0, "planar_defense": 10.0},
	]
	var r03_pdef: Dictionary = DSTDatabase.apply_armor_and_planar(0.0, 30.0, lunar_set)
	_check(_approx(float(r03_pdef["total_damage"]), 10.0), "QA-03_PLANAR_DEFENSE_SET", "got %.2f" % float(r03_pdef["total_damage"]))

	# QA-04: 정신력 광기(15%/17.5%) vs 달 계몽(85%/82.5%) 히스테리시스
	var sim: DSTWorldSim = DSTWorldSim.new()
	sim.init_world(db, 1001, "wilson")
	sim.sanity = 30.0 # 15%
	sim.delta_sanity(0.0)
	_check(sim.is_insane(), "QA-04_INSANE_ENTER_15PCT")
	sim.delta_sanity(2.0) # 32 / 200 = 16%
	_check(sim.is_insane(), "QA-04_INSANE_HYSTERESIS_16PCT")
	sim.delta_sanity(3.0) # 35 / 200 = 17.5%
	_check(not sim.is_insane(), "QA-04_SANE_EXIT_17_5PCT")

	sim.set_sanity_mode(1)
	sim.sanity = 170.0 # 85%
	sim.delta_sanity(0.0)
	_check(sim.is_enlightened(), "QA-04_LUNACY_ENTER_85PCT")
	sim.delta_sanity(-2.0) # 168 / 200 = 84%
	_check(sim.is_enlightened(), "QA-04_LUNACY_HYSTERESIS_84PCT")
	sim.delta_sanity(-3.0) # 165 / 200 = 82.5%
	_check(not sim.is_enlightened(), "QA-04_LUNACY_EXIT_82_5PCT")

	# QA-05: 습기 히스테리시스 (35 진입 / 15 해제) & 강우 중 건조 금지
	sim.moisture = 34.0
	sim.is_wet = false
	sim.update_moisture(1.0, 1.0, 1.0) # 비 오면 화력 있어도 증가
	_check(sim.moisture > 35.0 and sim.is_wet, "QA-05_WET_ENTER_35")
	sim.moisture = 20.0
	sim.update_moisture(0.1, 0.0, 0.0)
	_check(sim.is_wet, "QA-05_WET_HYSTERESIS_20")
	sim.moisture = 14.0
	sim.update_moisture(0.1, 0.0, 1.0)
	_check(not sim.is_wet, "QA-05_DRY_EXIT_15")

	# QA-06: 고백 심장 연속 부활 시 최대 체력 페널티 75% 상한 클램프
	sim.init_world(db, 1002, "wilson")
	for _i in range(4):
		sim.apply_health_delta(-999.0, "test")
		_check(sim.is_ghost and _approx(sim.world_reset_countdown, 120.0), "QA-10_GHOST_COUNTDOWN_120")
		sim.revive_player(true)
	_check(_approx(sim.health_penalty, 0.75) and _approx(sim.get_max_health_with_penalty(), 37.5), "QA-06_PENALTY_CLAMP_75", "pen=%.2f max=%.2f" % [sim.health_penalty, sim.get_max_health_with_penalty()])
	_check(not sim.is_ghost and sim.world_reset_countdown < 0.0, "QA-10_REVIVE_CANCELS_RESET")

	# QA-07: 냄비 우선순위 (피에로기 vs 미트볼 vs 젖은 찌꺼기)
	var dish_p: Dictionary = db.calculate_crockpot_recipe(["egg", "meat", "carrot", "berries"])
	_check(str(dish_p["id"]) == "perogies", "QA-07_PEROGIES", str(dish_p))
	var dish_m: Dictionary = db.calculate_crockpot_recipe(["meat", "berries", "berries", "berries"])
	_check(str(dish_m["id"]) == "meatballs", "QA-07_MEATBALLS", str(dish_m))
	var dish_w: Dictionary = db.calculate_crockpot_recipe(["twigs", "twigs", "twigs", "twigs"])
	_check(str(dish_w["id"]) == "wetgoop", "QA-07_WETGOOP", str(dish_w))

	# QA-08: 작물 스트레스 판정 (1점 NONE 거대작물 vs 2점 LOW)
	_check(DSTDatabase.calc_farm_stress_state(1) == "NONE", "QA-08_FARM_OVERSIZED_1")
	_check(DSTDatabase.calc_farm_stress_state(2) == "LOW", "QA-08_FARM_LOW_2")
	_check(DSTDatabase.calc_farm_stress_state(12) == "HIGH", "QA-08_FARM_HIGH_12")

	# QA-09: 보트 다중 돛 0.7^k 체감 공식
	var bvel: float = DSTDatabase.calc_boat_max_velocity([2.0, 2.0, 2.0], 1.2, 10.0)
	_check(_approx(bvel, (2.0 + 1.4 + 0.98) * 1.2, 0.02), "QA-09_BOAT_MAST_DIMINISH", "got %.3f" % bvel)

	# 3일 생존 + 모닥불/과학기계/창/나무갑옷 제작 + 하운드 습격 방어 통합 시뮬
	sim.init_world(db, 1003, "wilson")
	sim.add_item("log", 12)
	sim.add_item("cutgrass", 12)
	_check(sim.craft_recipe("campfire"), "SIM_CRAFT_CAMPFIRE")
	_check(sim.craft_recipe("researchlab"), "SIM_CRAFT_SCIENCE")
	_check(sim.craft_recipe("spear"), "SIM_CRAFT_SPEAR")
	_check(sim.craft_recipe("armorwood"), "SIM_CRAFT_ARMORWOOD")
	for _s in range(480 * 3): # 3일(1440초) 시뮬
		sim.step(1.0, Vector2.ZERO)
		sim.player_attack_nearest()
		if sim.hunger < 60.0:
			sim.add_item("meatballs", 1)
			sim.eat_food("meatballs")
		if sim.health < 90.0:
			sim.add_item("perogies", 1)
			sim.eat_food("perogies")
		for st in sim.structures:
			if str(st["kind"]) == "campfire":
				st["fuel"] = 180.0
	_check(sim.day >= 4 and not sim.is_ghost, "SIM_SURVIVE_3_DAYS", "day=%d ghost=%s" % [sim.day, str(sim.is_ghost)])

	# M4: 6인 캐릭터 고유 기믹 검증 (볼프강/위그프리드/윌로우/웬디/윌슨)
	sim.init_world(db, 1004, "wolfgang")
	_check(sim.get_wolfgang_form() == "MIGHTY" and _approx(sim.get_effective_damage_mult(), 2.0), "M4_WOLFGANG_MIGHTY", "form=%s mult=%.2f" % [sim.get_wolfgang_form(), sim.get_effective_damage_mult()])
	sim.hunger = 50.0
	_check(sim.get_wolfgang_form() == "WIMPY" and _approx(sim.get_effective_damage_mult(), 0.75), "M4_WOLFGANG_WIMPY", "form=%s mult=%.2f" % [sim.get_wolfgang_form(), sim.get_effective_damage_mult()])

	sim.init_world(db, 1005, "wathgrithr")
	_check(not sim.eat_food("berries"), "M4_WIGFRID_NO_VEGGIE")
	sim.add_item("meatballs", 1)
	_check(sim.eat_food("meatballs"), "M4_WIGFRID_EAT_MEAT")
	sim.health = 150.0
	sim.spawn_creature("spider", sim.player_pos + Vector2(1.5, 0.0))
	var hit_w: Dictionary = sim.player_attack_nearest()
	_check(bool(hit_w["hit"]) and sim.health > 150.0, "M4_WIGFRID_LIFESTEAL", "hp=%.1f" % sim.health)

	sim.init_world(db, 1006, "wendy")
	var ab_sp: Dictionary = sim.spawn_creature("spider", sim.player_pos + Vector2(2.0, 0.0))
	var sp_hp0: float = float(ab_sp["hp"])
	for _t in range(4):
		sim.step(0.5, Vector2.ZERO)
	_check(float(ab_sp["hp"]) < sp_hp0, "M4_WENDY_ABIGAIL_AOE", "hp0=%.1f hp1=%.1f" % [sp_hp0, float(ab_sp["hp"])])

	sim.init_world(db, 1007, "wilson")
	var g0: int = int(sim.inventory.get("goldnugget", 0))
	_check(sim.transmute_rocks_to_gold() and int(sim.inventory.get("goldnugget", 0)) == g0 + 1, "M4_WILSON_TRANSMUTE")

	# M4: 보트 진수·돛 3개 장착(0.7^k 속도 증가)·바다 항해 허용 검증
	sim.init_world(db, 1008, "wilson")
	sim.add_item("log", 20)
	sim.add_item("cutgrass", 20)
	sim.add_item("twigs", 20)
	sim.add_item("rocks", 10)
	sim.craft_recipe("researchlab")
	_check(sim.craft_recipe("boat_item") and sim.boat_active, "M4_BOAT_CRAFT")
	var v0: float = sim.get_boat_speed()
	_check(sim.craft_recipe("mast") and sim.craft_recipe("mast") and sim.craft_recipe("mast") and sim.boat_masts == 3, "M4_BOAT_3_MASTS")
	_check(sim.get_boat_speed() > v0 + 4.0, "M4_BOAT_SPEED_UP", "v0=%.2f v3=%.2f" % [v0, sim.get_boat_speed()])
	_check(sim.toggle_boat() and sim.on_boat, "M4_BOAT_BOARD")
	sim.player_pos = Vector2(52.5, 0.0)
	sim.boat_pos = sim.player_pos
	sim.step(1.0, Vector2(1.0, 0.0))
	_check(sim.player_pos.length() > 54.0 and sim.get_biome_at(sim.player_pos) == "ocean", "M4_BOAT_SAIL_OCEAN", "r=%.2f" % sim.player_pos.length())

	# M5: 인사이트 스킬트리 해금 & 전투/평면 피해 반영 검증
	sim.init_world(db, 1009, "wilson")
	_check(sim.unlock_skill("combat_mastery") and sim.unlock_skill("affinity_lunar"), "M5_SKILL_UNLOCK")
	_check(_approx(sim.get_effective_damage_mult(), 1.2), "M5_SKILL_COMBAT_MULT")
	sim.spawn_creature("spider", sim.player_pos + Vector2(1.5, 0.0))
	var sk_hit: Dictionary = sim.player_attack_nearest()
	_check(bool(sk_hit["hit"]) and _approx(float(sk_hit["planar"]), 12.0), "M5_SKILL_LUNAR_PLANAR", str(sk_hit))

	# M2: 70일 사계절 가속 시뮬레이션 게이트 (4계절 순환 + 거대 작물 + 겨울 외눈사슴)
	sim.init_world(db, 1010, "willow")
	sim.add_item("log", 20)
	sim.add_item("cutgrass", 20)
	sim.add_item("twigs", 20)
	sim.add_item("rocks", 10)
	sim.craft_recipe("campfire")
	sim.craft_recipe("researchlab")
	sim.craft_recipe("farm_plot")
	var seasons_seen: Dictionary = {sim.get_season_name(): true}
	var saw_deerclops: bool = false
	var saw_oversized: bool = false
	for _day_tick in range(70 * 16): # 70일 × 16세그(30초씩)
		sim.step(30.0, Vector2.ZERO)
		seasons_seen[sim.get_season_name()] = true
		if not sim.get_active_boss().is_empty():
			saw_deerclops = true
			sim.creatures.clear() # 보스 출현 확인 후 계속 생존 진행
		elif sim.creatures.size() > 4:
			sim.creatures.clear() # 가속 테스트 중 하운드 누적 방지
		for fp in sim.farm_plots:
			if bool(fp["harvestable"]) and bool(fp["oversized"]):
				saw_oversized = true
			else:
				fp["hydrated"] = true
				fp["fertilized"] = true
				fp["tended"] = true
		sim.health = sim.get_max_health_with_penalty()
		sim.hunger = sim.max_hunger
		sim.sanity = sim.max_sanity
		sim.temperature = 35.0
		for st in sim.structures:
			if str(st["kind"]) == "campfire":
				st["fuel"] = 180.0
	_check(seasons_seen.size() == 4, "M2_70DAY_4_SEASONS", str(seasons_seen.keys()))
	_check(saw_deerclops, "M2_WINTER_DEERCLOPS_SPAWN")
	_check(saw_oversized, "M2_FARM_OVERSIZED_HARVEST")

	# 확장 4슬롯 요리 냄비 (생선스틱/꿀햄/용과파이 우선순위 검증)
	_check(str(db.calculate_crockpot_recipe(["fish", "twigs", "berries", "berries"])["id"]) == "fishsticks", "COOK_FISHSTICKS")
	_check(str(db.calculate_crockpot_recipe(["meat", "meat", "honey", "berries"])["id"]) == "honeyham", "COOK_HONEYHAM")
	_check(str(db.calculate_crockpot_recipe(["dragonfruit", "twigs", "twigs", "twigs"])["id"]) == "dragonpie", "COOK_DRAGONPIE")

	# M4: 동굴/고대 유적 2-Shard 전환 + 고대 제단 Tech Lv 3 + 악몽 주기(calm->warn->wild 공포부리 출현)
	sim.init_world(db, 1011, "wilson")
	_check(sim.toggle_shard() == "caves" and sim.shard == "caves", "M4_CAVES_ENTER")
	sim.player_pos = Vector2(11.0, 0.0) # 고대 의사과학 기지 근처
	_check(sim.get_nearby_tech_level() == 3, "M4_RUINS_TECH_LV3", "lvl=%d" % sim.get_nearby_tech_level())
	sim.add_item("nightmarefuel", 6)
	sim.add_item("thulecite", 6)
	_check(sim.craft_recipe("nightsword") and sim.craft_recipe("armorruins"), "M4_RUINS_CRAFT_GEAR")
	sim.nightmare_timer = 1.0
	sim.step(2.0, Vector2.ZERO) # calm -> warn
	_check(sim.nightmare_phase == "warn", "M4_NIGHTMARE_WARN", sim.nightmare_phase)
	sim.nightmare_timer = 1.0
	sim.step(2.0, Vector2.ZERO) # warn -> wild + terrorbeak spawn
	var has_terrorbeak: bool = false
	for cr in sim.creatures:
		if str(cr["kind"]) == "terrorbeak":
			has_terrorbeak = true
	_check(sim.nightmare_phase == "wild" and has_terrorbeak, "M4_NIGHTMARE_WILD_TERRORBEAK", sim.nightmare_phase)
	_check(sim.toggle_shard() == "master" and sim.shard == "master", "M4_CAVES_RETURN_MASTER")

	# M2: 사계절 4대 보스 스탯 검증 (Bearger 6000 / Moose 6000 / Dragonfly 27500)
	var b_bear: Dictionary = sim.spawn_creature("bearger", Vector2(10, 0))
	var b_moose: Dictionary = sim.spawn_creature("moose", Vector2(12, 0))
	var b_dfly: Dictionary = sim.spawn_creature("dragonfly", Vector2(14, 0))
	_check(_approx(float(b_bear["max_hp"]), 6000.0) and _approx(float(b_moose["max_hp"]), 6000.0) and _approx(float(b_dfly["max_hp"]), 27500.0), "M2_4_SEASONAL_BOSSES")

	# M3: 2인 협동 서버 권위 동기화(Replica/Classified) + 전원 유령 120s 리셋 + 동료 고백 심장 부활
	sim.init_world(db, 1012, "wilson")
	sim.spawn_creature("bearger", Vector2(8, 0))
	var net: DSTNetSync = DSTNetSync.new()
	net.init_coop_room(sim, "wilson")
	net.join_peer(2, "wathgrithr", Vector2(2, 0))
	var rep1: Dictionary = net.step_coop(0.5, {1: Vector2(1, 0), 2: Vector2(-1, 0)})
	_check(rep1["peers"].size() == 2 and str(rep1["boss_id"]) == "bearger", "M3_COOP_REPLICA_SYNC")
	var cls2: Dictionary = net.encode_classified_snapshot(2)
	_check(int(cls2["owner_peer_id"]) == 2 and cls2.has("inventory") and not rep1["peers"][0].has("inventory"), "M3_COOP_CLASSIFIED_ISOLATION")
	_check(net.peer_attack_boss(1, 500.0) and net.peer_attack_boss(2, 500.0) and _approx(float(sim.get_active_boss()["hp"]), 5000.0), "M3_COOP_SHARED_BOSS_DMG")
	net.damage_peer(2, 999.0)
	net.step_coop(1.0)
	_check(net.all_ghost_reset_timer < 0.0, "M3_PARTIAL_GHOST_NO_RESET")
	net.damage_peer(1, 999.0)
	net.step_coop(1.0)
	_check(_approx(net.all_ghost_reset_timer, 120.0), "M3_ALL_GHOST_RESET_120")
	# 1번 생존 상태에서 2번 부활 시나리오 검증
	net.peers[1]["is_ghost"] = false
	net.peers[1]["health"] = 100.0
	_check(net.revive_peer_with_heart(1, 2) and not bool(net.peers[2]["is_ghost"]) and _approx(float(net.peers[2]["health_penalty"]), 0.25) and net.all_ghost_reset_timer < 0.0, "M3_COOP_HEART_REVIVE")

	# 보스 특수 패턴 텔레그래프 (외눈사슴 빙결 / 곰소리 충격파 벌목 / 용파리 윌로우 화염 면역) + 협동 동료 자동 부활
	sim.init_world(db, 1013, "wilson")
	var dc_boss: Dictionary = sim.spawn_creature("deerclops", Vector2(5.0, 0.0))
	dc_boss["special_cd"] = 0.05
	sim.step(0.2, Vector2.ZERO)
	_check(sim.boss_telegraphs.size() >= 1 and str(sim.boss_telegraphs[0]["kind"]) == "ice_slam", "BOSS_ICE_SLAM_TELEGRAPH")
	sim.step(1.3, Vector2.ZERO)
	_check(sim.freeze_timer > 0.0, "BOSS_ICE_SLAM_FREEZE", "freeze=%.2f" % sim.freeze_timer)

	sim.init_world(db, 1014, "willow")
	var df_boss: Dictionary = sim.spawn_creature("dragonfly", Vector2(3.0, 0.0))
	df_boss["cd"] = 5.0
	df_boss["special_cd"] = 0.05
	var willow_hp0: float = sim.health
	sim.step(0.2, Vector2.ZERO)
	sim.step(1.3, Vector2.ZERO)
	_check(_approx(sim.health, willow_hp0), "BOSS_DRAGONFLY_WILLOW_FIRE_IMMUNE", "hp0=%.1f hp1=%.1f" % [willow_hp0, sim.health])

	sim.init_world(db, 1015, "wilson")
	_check(sim.toggle_coop_ally() and sim.coop_ally_active, "COOP_ALLY_TOGGLE")
	sim.apply_health_delta(-999.0, "test_boss")
	_check(sim.is_ghost, "COOP_ALLY_PLAYER_GHOST")
	for _r in range(12):
		sim.step(0.5, Vector2.ZERO)
	_check(not sim.is_ghost, "COOP_ALLY_AUTO_REVIVE")

	# M5 최종 보스 (고대 연료직조기 그림자 방패 + 천체 대변자 + 진영 세트 보너스)
	sim.init_world(db, 1016, "wilson")
	sim.equip_armor("lunarplanthat")
	sim.equip_armor("armor_lunarplant")
	sim.equip_hands = "sword_lunarplant"
	var fw: Dictionary = sim.spawn_creature("fuelweaver", Vector2(2.0, 0.0))
	fw["cd"] = 5.0
	var h_norm: Dictionary = sim.player_attack_nearest()
	_check(bool(h_norm["hit"]) and float(h_norm["planar"]) > 30.0, "M5_LUNAR_VS_SHADOW_BONUS", str(h_norm))
	fw["shield_timer"] = 3.5
	sim.attack_cooldown = 0.0
	var h_blk: Dictionary = sim.player_attack_nearest()
	_check(not bool(h_blk["hit"]) and bool(h_blk.get("blocked", false)), "M5_FUELWEAVER_SHADOW_SHIELD", str(h_blk))

	var cc: Dictionary = sim.spawn_creature("celestial_champion", Vector2(4.0, 0.0))
	_check(_approx(float(cc["max_hp"]), 13000.0) and str(cc["alignment"]) == "lunar", "M5_CELESTIAL_CHAMPION_SPAWN")
	var r_align: Dictionary = sim.receive_attack(0.0, 35.0, "cc", "lunar")
	# 35 * 0.9(달 세트 저항) = 31.5 - (10+5 + 10 = 25 평면방어) = 6.5
	_check(float(r_align["total_damage"]) < 10.0, "M5_LUNAR_SET_RESIST_BONUS", "got %.2f" % float(r_align["total_damage"]))

	# 마우스/터치 클릭 이동·공격 타겟 해석 검증
	var ct_atk: Dictionary = sim.set_click_target(Vector2(2.0, 0.0))
	_check(str(ct_atk["mode"]) == "attack", "CLICK_TARGET_ATTACK", str(ct_atk))
	var ct_mv: Dictionary = sim.set_click_target(Vector2(-25.0, 25.0))
	_check(str(ct_mv["mode"]) == "move", "CLICK_TARGET_MOVE", str(ct_mv))

	# 세이브 / 로드 JSON 라운드트립 영속성 검증
	sim.day = 17
	sim.season_index = 1
	sim.boat_active = true
	sim.boat_masts = 2
	sim.unlock_skill("combat_mastery")
	var save_path: String = "user://dst_test_save.json"
	_check(sim.save_to_disk(save_path), "SAVE_WORLD_DISK")
	sim.init_world(db, 9999, "wx78")
	_check(sim.day == 1 and sim.character_id == "wx78", "SAVE_MUTATE_BEFORE_LOAD")
	_check(sim.load_from_disk(save_path), "LOAD_WORLD_DISK")
	_check(sim.day == 17 and sim.season_index == 1 and sim.character_id == "wilson" and sim.boat_masts == 2 and sim.unlocked_skills.has("combat_mastery"), "SAVE_LOAD_EXACT_RESTORE", "day=%d char=%s masts=%d" % [sim.day, sim.character_id, sim.boat_masts])

	# 메인 씬 로드/인스턴스화 검증
	var packed: PackedScene = load("res://scenes/main.tscn")
	_check(packed != null, "MAIN_SCENE_LOAD")
	if packed != null:
		var inst: Node = packed.instantiate()
		root.add_child(inst)
		_check(inst.get("sim") != null and inst.get("cam") != null and inst.get("hud") != null, "MAIN_SCENE_READY")
		inst.queue_free()

	var summary: Dictionary = {"passed": passed, "failed": failed, "errors": errors}
	print("DST_TEST_RESULT " + JSON.stringify(summary))
	quit(0 if failed == 0 else 1)
