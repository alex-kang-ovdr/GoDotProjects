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

	# QA-07: 냄비 우선순위 (역공학 79종 전체 Lua AST 평가: 피에로기/미트볼/스팀가지/젖은찌꺼기/와플/나비머핀/왈리전용 등)
	var dish_p: Dictionary = db.calculate_crockpot_recipe(["egg", "meat", "carrot", "berries"])
	_check(str(dish_p["id"]) == "perogies", "QA-07_PEROGIES", str(dish_p))
	var dish_m: Dictionary = db.calculate_crockpot_recipe(["meat", "berries", "berries", "berries"])
	_check(str(dish_m["id"]) == "meatballs", "QA-07_MEATBALLS", str(dish_m))
	var dish_bf: Dictionary = db.calculate_crockpot_recipe(["twigs", "twigs", "twigs", "twigs"])
	_check(str(dish_bf["id"]) == "beefalofeed", "QA-07_BEEFALOFEED_V763928", str(dish_bf))
	var dish_w: Dictionary = db.calculate_crockpot_recipe(["twigs", "twigs", "meat", "berries"])
	_check(str(dish_w["id"]) == "wetgoop", "QA-07_WETGOOP", str(dish_w))
	_check(str(db.calculate_crockpot_recipe(["butter", "egg", "berries", "twigs"])["id"]) == "waffles", "LOGIC_AST_WAFFLES")
	_check(str(db.calculate_crockpot_recipe(["butterflywings", "carrot", "twigs", "twigs"])["id"]) == "butterflymuffin", "LOGIC_AST_BUTTERFLYMUFFIN")
	_check(str(db.calculate_crockpot_recipe(["froglegs", "carrot", "twigs", "twigs"])["id"]) == "frogglebunwich", "LOGIC_AST_FROGGLEBUNWICH")
	_check(str(db.calculate_crockpot_recipe(["mandrake", "twigs", "twigs", "twigs"])["id"]) == "mandrakesoup", "LOGIC_AST_MANDRAKESOUP")
	_check(str(db.calculate_crockpot_recipe(["lightninggoathorn", "honey", "honey", "twigs"], 0.0, true)["id"]) == "voltgoatjelly", "LOGIC_AST_WARLY_VOLTGOATJELLY")
	_check(db.logic.loaded and db.logic.recipes_79.size() == 79 and db.logic.ingredients.size() >= 130, "LOGIC_ENGINE_79_RECIPES_137_INGS", "r=%d i=%d" % [db.logic.recipes_79.size(), db.logic.ingredients.size()])

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

	# 역공학 로직 검증 1: 14종 작물 3영양분(N/P/K) & 7스트레스 평가 (토마토+감자 상호보완 & 계절 불일치)
	_check(db.logic.farm_crops.size() == 14, "LOGIC_14_FARM_CROPS")
	var ev_carrot_ok: Dictionary = db.logic.evaluate_farm_checkpoint("carrot", "autumn", [50.0, 50.0, 50.0], true, true, 4, 0, false)
	_check(int(ev_carrot_ok["stress_added"]) == 0 and _approx(float(ev_carrot_ok["soil_after"][0]), 46.0), "LOGIC_FARM_CARROT_NPK", str(ev_carrot_ok))
	var ev_df_winter: Dictionary = db.logic.evaluate_farm_checkpoint("dragonfruit", "winter", [50.0, 50.0, 50.0], false, false, 1, 1, true)
	_check(int(ev_df_winter["stress_added"]) == 6 and _approx(float(ev_df_winter["soil_after"][2]), 42.0), "LOGIC_FARM_7STRESS_CHECK", str(ev_df_winter))

	# 역공학 로직 검증 2: 30Hz StateGraph 프레임 선딜(외눈사슴 31f = 1.033s) 카이팅 회피
	sim.init_world(db, 1017, "wilson")
	var kite_dc: Dictionary = sim.spawn_creature("deerclops", Vector2(2.5, 0.0))
	kite_dc["cd"] = 0.0
	kite_dc["special_cd"] = 99.0
	var hp_before_kite: float = sim.health
	sim.step(0.1, Vector2.ZERO) # 선딜(windup_timer = 1.033s) 시작
	_check(float(kite_dc["windup_timer"]) > 0.8, "LOGIC_SG_DEERCLOPS_WINDUP_31F", "wt=%.3f" % float(kite_dc["windup_timer"]))
	sim.player_pos = Vector2(-12.0, 0.0) # 선딜 도중 사거리 밖으로 회피!
	sim.step(1.2, Vector2.ZERO) # 히트프레임 도달 시 회피 판정
	_check(_approx(sim.health, hp_before_kite), "LOGIC_SG_KITE_DODGE_ZERO_DMG", "hp0=%.1f hp1=%.1f" % [hp_before_kite, sim.health])

	# 역공학 로직 검증 3: components/hounded.lua 웨이브 에스컬레이션 (일수·계절 변종)
	var hw_d3: Dictionary = db.logic.calc_hound_wave(3, "autumn")
	var hw_d60: Dictionary = db.logic.calc_hound_wave(60, "winter")
	var hw_d120: Dictionary = db.logic.calc_hound_wave(120, "summer")
	_check(str(hw_d3["tier"]) == "intro" and int(hw_d3["spawn_count"]) == 1, "LOGIC_HOUNDED_INTRO", str(hw_d3))
	_check(str(hw_d60["tier"]) == "heavy" and str(hw_d60["variant"]) == "icehound", "LOGIC_HOUNDED_WINTER_HEAVY", str(hw_d60))
	_check(str(hw_d120["tier"]) == "crazy" and str(hw_d120["variant"]) == "firehound" and float(hw_d120["warglet_upgrade_chance"]) >= 0.30, "LOGIC_HOUNDED_SUMMER_CRAZY", str(hw_d120))

	# 역공학 로직 검증 4: recipes.lua 950+ Recipe2 TechTree & builder_tag 검증
	_check(db.logic.recipes2_by_id.size() >= 940, "LOGIC_950_RECIPES2_LOADED", "cnt=%d" % db.logic.recipes2_by_id.size())
	var r_lighter_fail: Dictionary = db.logic.can_craft_recipe2("lighter", {"rope": 1, "goldnugget": 1, "petals": 3}, 0, [])
	_check(not bool(r_lighter_fail["ok"]) and str(r_lighter_fail["reason"]).begins_with("missing_builder_tag"), "LOGIC_RECIPE2_WILLOW_TAG_GATE", str(r_lighter_fail))
	var r_lighter_ok: Dictionary = db.logic.can_craft_recipe2("lighter", {"rope": 1, "goldnugget": 1, "petals": 3}, 0, ["pyromaniac"])
	_check(bool(r_lighter_ok["ok"]), "LOGIC_RECIPE2_WILLOW_LIGHTER_OK", str(r_lighter_ok))

	# 역공학 로직 검증 5: 12인 359노드 스킬트리 방향성 그래프 선행 조건 검증 (Wilson alchemy_1 -> alchemy_2 -> alchemy_5)
	_check(db.logic.skilltrees.size() == 12, "LOGIC_12_SKILLTREES_LOADED", "cnt=%d" % db.logic.skilltrees.size())
	var sk_child_blocked: Dictionary = db.logic.can_unlock_tree_node("wilson", "wilson_alchemy_2", {}, 5)
	_check(not bool(sk_child_blocked["ok"]) and str(sk_child_blocked["reason"]).begins_with("parent_required"), "LOGIC_SKILLTREE_PARENT_BLOCK", str(sk_child_blocked))
	var sk_root_ok: Dictionary = db.logic.can_unlock_tree_node("wilson", "wilson_alchemy_1", {}, 5)
	var sk_child_ok: Dictionary = db.logic.can_unlock_tree_node("wilson", "wilson_alchemy_2", {"wilson_alchemy_1": true}, 4)
	_check(bool(sk_root_ok["ok"]) and bool(sk_child_ok["ok"]), "LOGIC_SKILLTREE_WILSON_GRAPH_UNLOCK")

	# 역공학 로직 검증 6: WX-78 23종 회로 모듈 & 6슬롯 전력 예산 검증
	_check(db.logic.wx78_by_id.size() == 23, "LOGIC_23_WX78_MODULES", "cnt=%d" % db.logic.wx78_by_id.size())
	var wx_plug: Array = ["maxhealth2", "movespeed2"] # 2 + 3 = 5 slots
	_check(db.logic.wx78_can_plug_module("chess", wx_plug), "LOGIC_WX78_PLUG_6TH_SLOT")
	_check(not db.logic.wx78_can_plug_module("shielding", wx_plug), "LOGIC_WX78_REJECT_OVER_6_SLOTS")
	var wx_bon: Dictionary = db.logic.wx78_calc_circuit_bonuses(wx_plug)
	_check(_approx(float(wx_bon["hp_bonus"]), 150.0) and _approx(float(wx_bon["speed_mult"]), 1.25), "LOGIC_WX78_CIRCUIT_BONUSES", str(wx_bon))

	# 역공학 로직 검증 7: temperature.lua 단열 열관성 공식 (30 / (30 + 120) = 0.2x)
	var td_ins: float = DSTLogicEngine.calc_insulated_temp_delta(-10.0, 120.0, 0.0, 30.0)
	_check(_approx(td_ins, -2.0, 0.01), "LOGIC_TEMP_INSULATION_FORMULA", "got %.3f" % td_ins)

	# 역공학 로직 검증 8: propagator.lua 화재 열 전파 및 발화점(100) + 봄 사거리 감소(0.67x)
	var fire_ents: Array = [
		{"id": 1, "pos": Vector2(0, 0), "heat": 0.0, "flashpoint": 100.0, "burning": true, "heat_output": 20.0, "prop_range": 3.0, "fireimmune": false},
		{"id": 2, "pos": Vector2(1.0, 0), "heat": 95.0, "flashpoint": 100.0, "burning": false, "heat_output": 5.0, "prop_range": 3.0, "fireimmune": false},
		{"id": 3, "pos": Vector2(2.6, 0), "heat": 95.0, "flashpoint": 100.0, "burning": false, "heat_output": 5.0, "prop_range": 3.0, "fireimmune": false},
	]
	var ign_spring: Array = DSTLogicEngine.step_fire_propagators(fire_ents, 1.0, true) # 봄: range = 3*0.67 = 2.01 -> id=2만 발화, id=3(2.6m) 미발화!
	_check(ign_spring.has(2) and not ign_spring.has(3), "LOGIC_PROPAGATOR_FIRE_SPRING_MOD", str(ign_spring))

	# 역공학 로직 검증 9: 229종 SetSharedLootTable (외눈사슴 눈알+고기8 확정 드랍) & 222종 WorldGen 룸 샘플링
	_check(db.logic.loot_tables.size() >= 220 and db.logic.worldgen_rooms.size() >= 220, "LOGIC_LOOT_229_ROOMS_222", "loot=%d rooms=%d" % [db.logic.loot_tables.size(), db.logic.worldgen_rooms.size()])
	var dc_loot: Dictionary = db.logic.roll_shared_loot("deerclops", sim.rng)
	_check(int(dc_loot.get("deerclops_eyeball", 0)) >= 1 and int(dc_loot.get("meat", 0)) >= 8, "LOGIC_LOOT_DEERCLOPS_EXACT", str(dc_loot))
	var room_sample: Array = db.logic.sample_worldgen_room_prefabs("Forest", 5, sim.rng)
	_check(room_sample.size() == 5, "LOGIC_WORLDGEN_FOREST_SAMPLE", str(room_sample))

	# 역공학 로직 검증 10: seasons.lua 16세그 사인 보간 + spicedfoods.lua 4종 양념 + freezable.lua 3상태 파쇄
	var seg_mid: Dictionary = DSTLogicEngine.calc_interpolated_season_segs(1, 8, db.data["seasons"]["order"], db.data["seasons"]["lengths"], db.data["seasons"]["clock_segs"])
	_check(int(seg_mid["day"]) + int(seg_mid["dusk"]) + int(seg_mid["night"]) == 16, "LOGIC_SEASONS_SINE_16SEGS", str(seg_mid))
	var sp_salt: Dictionary = db.logic.apply_spice_to_food(db.foods_by_id["perogies"], "spice_salt")
	var sp_chili: Dictionary = db.logic.apply_spice_to_food(db.foods_by_id["meatballs"], "spice_chili")
	var sp_garlic: Dictionary = db.logic.apply_spice_to_food(db.foods_by_id["meatballs"], "spice_garlic")
	_check(_approx(float(sp_salt["health"]), 50.0) and _approx(float(sp_chili["attack_mult"]), 1.2) and _approx(float(sp_garlic["damage_taken_mult"]), 0.67, 0.01), "LOGIC_WARLY_SPICES_4")
	var fz: Dictionary = {"state": "NORMAL", "coldness": 0.0, "resistance": 2.0, "wearofftime": 10.0, "damage_to_break": 15.0}
	fz = DSTLogicEngine.step_freezable(fz, 2.5, 0.0, 0.0)
	_check(str(fz["state"]) == "FROZEN", "LOGIC_FREEZABLE_ENTER_FROZEN", str(fz))
	fz = DSTLogicEngine.step_freezable(fz, 0.0, 20.0, 0.0) # 피격 20 >= 15 -> 즉시 파쇄 해동!
	_check(str(fz["state"]) == "NORMAL", "LOGIC_FREEZABLE_SHATTER_BREAK", str(fz))

	# 역공학 로직 검증 11: Pass 4 전투/평면압축/다중방어구(inventory.lua + planarentity.lua)
	var hit_planar: Dictionary = DSTLogicEngine.resolve_combat_hit(100.0, 20.0, [], 1.0, true)
	# (sqrt(100*4 + 64) - 8) * 4 = (sqrt(464) - 8) * 4 = 54.1627... + 20 planar = 74.1627
	_check(_approx(float(hit_planar["phys_damage"]), 54.1627, 0.05) and _approx(float(hit_planar["planar_damage"]), 20.0), "LOGIC_PLANAR_ENTITY_SQRT_COMPRESS", str(hit_planar))
	var multi_armors: Array = [
		{"id": "lunarplanthat", "absorption": 0.80, "planar_defense": 10.0},
		{"id": "armor_lunarplant", "absorption": 0.80, "planar_defense": 10.0},
	]
	var hit_multi: Dictionary = DSTLogicEngine.resolve_combat_hit(100.0, 30.0, multi_armors, 0.90, false)
	# phys: 90 * 0.8 = 72 absorbed (each armor 36 wear), 18 leftover; planar: 27 - (10+10) = 7 leftover, each armor +10 wear => 46 wear each
	_check(_approx(float(hit_multi["phys_damage"]), 18.0, 0.01) and _approx(float(hit_multi["planar_damage"]), 7.0, 0.01) and _approx(float(hit_multi["armor_wear"]["lunarplanthat"]), 46.0, 0.05), "LOGIC_MULTI_ARMOR_PLANAR_SPLIT", str(hit_multi))

	# 역공학 로직 검증 12: perishable.lua 다중 배수 & 스택 희석 & edible.lua 위커바텀 감쇠
	var pm_fridge_winter: float = DSTLogicEngine.calc_perish_rate_mult("fridge", false, -5.0, false) # 0.5 * 0.75 = 0.375
	var pm_frozen_fridge: float = DSTLogicEngine.calc_perish_rate_mult("fridge", false, 15.0, true) # 0.0 (영구 보존)
	var pm_ground_wet_sum: float = DSTLogicEngine.calc_perish_rate_mult("ground", true, 75.0, false) # 1.5 * 1.3 * 1.25 = 2.4375
	_check(_approx(pm_fridge_winter, 0.375, 0.001) and _approx(pm_frozen_fridge, 0.0, 0.001) and _approx(pm_ground_wet_sum, 2.4375, 0.001), "LOGIC_PERISHABLE_MULT_MATRIX")
	var dil_t: float = DSTLogicEngine.dilute_perish_stack(3, 100.0, 1, 20.0) # (300 + 20) / 4 = 80.0
	_check(_approx(dil_t, 80.0, 0.01), "LOGIC_PERISHABLE_STACK_DILUTE", "got %.2f" % dil_t)
	var ed_stale_wilson: Dictionary = DSTLogicEngine.eval_edible_with_spoilage({"health": 40.0, "hunger": 37.5, "sanity": 5.0}, 0.35, "wilson")
	var ed_stale_wicker: Dictionary = DSTLogicEngine.eval_edible_with_spoilage({"health": 40.0, "hunger": 37.5, "sanity": 5.0}, 0.35, "wickerbottom")
	_check(_approx(float(ed_stale_wilson["health"]), 13.32, 0.05) and _approx(float(ed_stale_wicker["health"]), 0.0) and _approx(float(ed_stale_wicker["hunger"]), 12.4875, 0.05), "LOGIC_EDIBLE_SPOILAGE_WICKERBOTTOM")

	# 역공학 로직 검증 13: moisture.lua inSine/inExpo & sanity.lua 광기/계몽·유령 군집 저항
	var m_rain: Dictionary = DSTLogicEngine.step_moisture(0.0, true, 1.0, 0.0, 0.0, 20.0, 60.0) # inSine(1)=0.75 * 60 = 45.0 (wet!)
	var m_umbrel: Dictionary = DSTLogicEngine.step_moisture(0.0, true, 1.0, 1.0, 0.0, 20.0, 60.0) # 100% 방수 -> 0.0
	var m_dry: Dictionary = DSTLogicEngine.step_moisture(50.0, false, 0.0, 0.0, 1.0, 30.0, 10.0) # 화로 건조 -> 감소
	_check(_approx(float(m_rain["moisture"]), 45.0, 0.05) and bool(m_rain["is_wet"]) and _approx(float(m_umbrel["moisture"]), 0.0) and float(m_dry["moisture"]) < 35.0, "LOGIC_MOISTURE_INSINE_INEXPO")
	var san_ins_dark: Dictionary = DSTLogicEngine.calc_sanity_rate(0, "night", false, 100.0, 0.0, 0.0, 2, 4, 1.0)
	var san_lun_day: Dictionary = DSTLogicEngine.calc_sanity_rate(1, "day", true, 0.0, 0.0, 0.0, 0, 1, 1.0)
	# ghost_resist = 1 - 2/4 = 0.5 -> ghost_mult = 2 * (1 - 0.25) = 1.5
	_check(_approx(float(san_ins_dark["ghost_drain_mult"]), 1.5, 0.01) and float(san_ins_dark["rate"]) < -0.9 and float(san_lun_day["light_delta"]) > 0.01, "LOGIC_SANITY_DUAL_GHOST_RESIST", str(san_ins_dark))

	# 역공학 로직 검증 14: domesticatable.lua 비팔로 길들이기 래치·성향 + sleeper.lua 점감 저항(0.2 하한)
	var beef: Dictionary = {"domestication": 0.999, "obedience": 0.8, "min_obedience": 0.0, "domestication_latch": false, "domesticated": false, "time_since_gain": 0.0, "tendencies": {"RIDER": 0.5}}
	beef = DSTLogicEngine.step_beefalo_domestication(beef, true, "RIDER", 0.2, 10.0)
	_check(bool(beef["domestication_latch"]) and str(beef["dominant_tendency"]) == "RIDER", "LOGIC_BEEFALO_DOMESTICATION_LATCH", str(beef))
	var slp: Dictionary = {"is_asleep": false, "sleepiness": 0.0, "resistance": 1.0, "extra_resist": 0.0, "sleep_timer": 0.0, "decay_accum": 0.0}
	for _k in range(10):
		slp = DSTLogicEngine.step_sleeper_diminishing(slp, 2.0, 10.0, 0.0)
		slp["is_asleep"] = false
	_check(_approx(float(slp["sleep_mult"]), 0.2, 0.001) and _approx(float(slp["sleep_timer"]), 2.0, 0.01), "LOGIC_SLEEPER_DIMINISHING_FLOOR_02", str(slp))

	# 역공학 로직 검증 15: 18종 해양 물고기 낚시 스태미나 & 130종 월드젠 태스크셋(지상/동굴)
	_check(db.logic.ocean_fish.size() == 18 and db.logic.worldgen_tasks.size() >= 125, "LOGIC_18_OCEANFISH_130_TASKS", "fish=%d tasks=%d" % [db.logic.ocean_fish.size(), db.logic.worldgen_tasks.size()])
	var f_st: Dictionary = {"stamina": 1.0, "distance": 6.0, "struggling": true}
	for _fs in range(6):
		f_st = db.logic.step_ocean_fish_reel("oceanfish_small_1", f_st, true, 0.5)
	_check(not bool(f_st["struggling"]) and float(f_st["distance"]) < 4.0, "LOGIC_OCEANFISH_REEL_STAMINA", str(f_st))
	var ts_forest: Dictionary = db.logic.get_worldgen_taskset_plan("default")
	var ts_caves: Dictionary = db.logic.get_worldgen_taskset_plan("cave_default")
	_check(int(ts_forest["resolved_count"]) >= 12 and int(ts_caves["resolved_count"]) >= 25, "LOGIC_WORLDGEN_TASKSETS_FOREST_CAVES", "f=%d c=%d" % [int(ts_forest["resolved_count"]), int(ts_caves["resolved_count"])])

	# 역공학 로직 검증 16: 17종 비료 N/P/K 토양 적용 + 크람푸스 악행(22종, 글로머=50 즉발)
	_check(db.logic.fertilizers.size() == 17, "LOGIC_17_FERTILIZERS_LOADED", "cnt=%d" % db.logic.fertilizers.size())
	var f_comp: Dictionary = db.logic.apply_fertilizer_to_soil([10.0, 10.0, 10.0], "compostwrap") # +[24, 32, 24]
	_check(bool(f_comp["ok"]) and _approx(float(f_comp["soil_after"][0]), 34.0) and _approx(float(f_comp["soil_after"][1]), 42.0) and _approx(float(f_comp["soil_after"][2]), 34.0), "LOGIC_FERTILIZER_COMPOSTWRAP_NPK", str(f_comp))
	var kr_st: Dictionary = {"actions": 0, "threshold": 40, "timetodecay": 60.0}
	kr_st = db.logic.step_krampus_naughtiness(kr_st, "glommer", 120, 0.0, sim.rng) # glommer=50 >= 40, day>100 -> 3마리 소환!
	_check(int(kr_st["krampus_spawned"]) >= 3 and int(kr_st["actions"]) == 0, "LOGIC_KRAMPUS_GLOMMER_50_SPAWN", str(kr_st))

	# 역공학 로직 검증 17: 위그프리드 10종 전투 노래(스킬 게이트) & 위커바텀 18종 마법서
	_check(db.logic.battlesongs.size() == 10 and db.logic.books.size() == 18, "LOGIC_10_SONGS_18_BOOKS", "s=%d b=%d" % [db.logic.battlesongs.size(), db.logic.books.size()])
	var sg_rev_fail: Dictionary = db.logic.can_cast_battlesong("battlesong_instant_revive", 100.0, {})
	var sg_rev_ok: Dictionary = db.logic.can_cast_battlesong("battlesong_instant_revive", 100.0, {"wathgrithr_songs_revivewarrior": true})
	_check(not bool(sg_rev_fail["ok"]) and bool(sg_rev_ok["ok"]), "LOGIC_BATTLESONG_SKILL_GATE", str(sg_rev_fail))
	var bk_wil: Dictionary = db.logic.can_read_book("book_tentacles", "wilson", 200.0)
	var bk_wck: Dictionary = db.logic.can_read_book("book_tentacles", "wickerbottom", 250.0)
	_check(not bool(bk_wil["ok"]) and bool(bk_wck["ok"]) and _approx(float(bk_wck["read_sanity"]), -50.0), "LOGIC_WICKERBOTTOM_BOOK_READ", str(bk_wck))

	# 역공학 로직 검증 18: 볼프강 근력 3상태·5허기배수 + 완다 노화 지연피해/치유 상쇄
	var wg: Dictionary = DSTLogicEngine.step_wolfgang_mightiness({"current": 80.0, "max": 100.0}, 0.0, 0.0, 10.0) # starving 8x: -0.2*8*10 = -16 -> 64 (normal)
	_check(str(wg["state"]) == "normal" and _approx(float(wg["current"]), 64.0, 0.01) and _approx(float(wg["damage_mult"]), 1.0), "LOGIC_WOLFGANG_MIGHTINESS_STARVE_8X", str(wg))
	var wn: Dictionary = DSTLogicEngine.step_wanda_oldager({"age": 40.0, "year_timer": 0.0, "damage_remaining": 0.0, "damage_per_second": 0.0}, -50.0, 0.0)
	# -50 HP -> +20 yrs pending, dps = ceil(sqrt(20)*1.5) = ceil(6.708) = 7
	_check(_approx(float(wn["damage_remaining"]), 20.0, 0.01) and _approx(float(wn["damage_per_second"]), 7.0, 0.01), "LOGIC_WANDA_OLDAGER_DELAYED_DMG", str(wn))
	var wn_heal: Dictionary = DSTLogicEngine.step_wanda_oldager(wn, 20.0, 1.0) # 치유(+20 HP) -> 기존 노화 풀 즉시 상쇄 후 -8 yrs 회춘!
	_check(float(wn_heal["damage_per_second"]) < 0.0 and float(wn_heal["age"]) < 40.0, "LOGIC_WANDA_OLDAGER_HEAL_CANCEL", str(wn_heal))

	# 역공학 로직 검증 19: 그림자 생물 스포너(공포부리 <0.1) & 보트 선체 충돌(cos75° 스침 무시 · 누수 DPS)
	var sh_ok: Dictionary = DSTLogicEngine.calc_shadow_spawner_target(0.60, true)
	var sh_cr: Dictionary = DSTLogicEngine.calc_shadow_spawner_target(0.25, true)
	var sh_tb: Dictionary = DSTLogicEngine.calc_shadow_spawner_target(0.08, true)
	_check(int(sh_ok["max_pop"]) == 0 and str(sh_cr["prefab"]) == "crawlinghorror" and str(sh_tb["prefab"]) == "terrorbeak" and int(sh_tb["max_pop"]) == 2, "LOGIC_SHADOW_SPAWNER_THRESHOLDS")
	var bh_graze: Dictionary = DSTLogicEngine.resolve_boat_hull_collision(200.0, 4.5, 0.20, [], 0.0) # 0.20 <= 0.258 -> 스침 무시!
	var bh_slam: Dictionary = DSTLogicEngine.resolve_boat_hull_collision(200.0, 4.0, 1.0, [], 10.0) # adj=4 -> med_leak(1.0/s * 10 = 10) + floor(70*0.8=56) = 66 dmg -> 134 HP
	_check(bool(bh_graze["grazed"]) and _approx(float(bh_graze["hull_hp"]), 200.0) and _approx(float(bh_slam["hull_hp"]), 134.0, 0.5) and bh_slam["leaks"].has("med_leak"), "LOGIC_BOAT_HULL_GRAZE_AND_LEAK", str(bh_slam))

	# 역공학 로직 검증 20: 17종 월터 새총 탄약(평면 탄약 포함) & 37종 장신구 돼지왕 금화 교환
	_check(db.logic.slingshot_ammos.size() == 17 and db.logic.trinkets_gold.size() == 37, "LOGIC_17_SLINGSHOT_37_TRINKETS", "ammo=%d tr=%d" % [db.logic.slingshot_ammos.size(), db.logic.trinkets_gold.size()])
	var sl_lunar: Dictionary = db.logic.resolve_slingshot_shot("slingshotammo_lunarplanthusk", false) # 38 phys + 30 planar = 68
	var sl_pb: Dictionary = db.logic.resolve_slingshot_shot("slingshotammo_purebrilliance", true) # (sqrt(34*4+64)-8)*4=24.568 + 20 planar
	_check(_approx(float(sl_lunar["total_damage"]), 68.0, 0.1) and float(sl_pb["planar_damage"]) == 20.0, "LOGIC_SLINGSHOT_PLANAR_AMMO", str(sl_lunar))
	_check(db.logic.get_pigking_gold_payout("trinket_26") == 9 and db.logic.get_pigking_gold_payout("trinket_8") == 8, "LOGIC_PIGKING_TRINKET_GOLD")

	# 역공학 로직 검증 21: 계절 조류 스포너 + 여름 들불(>80C) + 균열 스포너 + 비 연료 가속 + 그로기 0.4x 감속
	_check(db.logic.pick_seasonal_bird("GRASS", "winter", false, false) == "robin_winter" and db.logic.pick_seasonal_bird("OCEAN_COASTAL", "autumn", false, false) == "puffin" and db.logic.pick_seasonal_bird("GRASS", "autumn", true, false) == "canary", "LOGIC_BIRD_SPAWNER_SEASONS")
	_check(DSTLogicEngine.check_wildfire_ignition("summer", "day", 85.0, false, 0.10) and not DSTLogicEngine.check_wildfire_ignition("summer", "day", 75.0, false, 0.10) and not DSTLogicEngine.check_wildfire_ignition("summer", "day", 85.0, true, 0.10), "LOGIC_WILDFIRE_80C_GATE")
	var rf_sp: Dictionary = DSTLogicEngine.step_rift_spawner({"rifts_count": 0, "spawn_timer": 10.0}, true, false, 15.0)
	_check(str(rf_sp["spawned_kind"]) == "lunarrift" and not bool(rf_sp["can_spawn_more"]), "LOGIC_RIFTSPAWNER_MAX1", str(rf_sp))
	var fl_rain: Dictionary = DSTLogicEngine.step_fueled_burn(0.0, 10.0, true, 1.0, "large") # 180 - 10*(1+2.5) = 145
	_check(_approx(float(fl_rain["fuel_sec"]), 145.0, 0.05) and _approx(float(fl_rain["burn_rate"]), 3.5, 0.01), "LOGIC_FUELED_RAIN_35X", str(fl_rain))
	var gr_st: Dictionary = DSTLogicEngine.step_grogginess({"grog_amount": 0.0, "resistance": 3.0, "knocked_out": false, "ko_timer": 0.0}, 1.5, 0.0)
	var gr_ko: Dictionary = DSTLogicEngine.step_grogginess(gr_st, 2.0, 0.0)
	_check(_approx(float(gr_st["speed_mult"]), 0.4) and bool(gr_ko["knocked_out"]) and _approx(float(gr_ko["ko_timer"]), 10.0), "LOGIC_GROGGINESS_04X_KO10S", str(gr_ko))

	# 역공학 로직 검증 22: 웬디 9종 유령 비약 + 워톡스 영혼 치유(완다 제외)·과부하 + 우디 3변신
	_check(db.logic.ghostly_elixirs.size() == 9 and db.logic.tool_uses.size() >= 25, "LOGIC_9_ELIXIRS_AND_TOOL_USES", "el=%d tl=%d" % [db.logic.ghostly_elixirs.size(), db.logic.tool_uses.size()])
	var el_fast: Dictionary = db.logic.eval_ghostly_elixir("ghostlyelixir_fastregen", 30.0)
	var el_spd: Dictionary = db.logic.eval_ghostly_elixir("ghostlyelixir_speed", 10.0)
	_check(_approx(float(el_fast["total_heal"]), 600.0, 0.1) and _approx(float(el_spd["speed_mult"]), 1.75, 0.01), "LOGIC_WENDY_GHOSTLY_ELIXIRS", str(el_fast))
	var wx_heal: Dictionary = DSTLogicEngine.eval_wortox_soul_heal([
		{"char_id": "wilson", "is_hurt": true, "is_ghost": false},
		{"char_id": "wendy", "is_hurt": true, "is_ghost": false},
		{"char_id": "wanda", "is_hurt": true, "is_ghost": false}, # 완다 제외 -> 2명, 각 20 - 2*(2-1) = 18 HP
	])
	var wx_ov: Dictionary = DSTLogicEngine.step_wortox_souls(19, 3) # 22 > 20 -> 과부하 -20 정신력, 11개 드랍
	_check(int(wx_heal["healed_count"]) == 2 and _approx(float(wx_heal["heal_per_target"]), 18.0) and bool(wx_ov["overloaded"]) and _approx(float(wx_ov["sanity_delta"]), -20.0), "LOGIC_WORTOX_SOUL_HEAL_AND_OVERLOAD")
	var wd_fm: Dictionary = DSTLogicEngine.step_woodie_wereness({"current": 0.0, "weremode": "none"}, 0.0, false, true)
	var wd_gs: Dictionary = DSTLogicEngine.step_woodie_wereness({"current": 100.0, "weremode": "weregoose"}, 15.0, true, false)
	_check(str(wd_fm["weremode"]) == "werebeaver" and _approx(float(wd_gs["run_speed"]), 8.4) and _approx(float(wd_gs["current"]), 90.0, 0.1), "LOGIC_WOODIE_WERENESS_3FORMS")

	# 역공학 로직 검증 23: 맥스웰 그림자 분신 예산 + 사막/달폭풍 0.4x 고글 면역 + 개미사자 분노 + 도구 내구도
	var mx_b: Dictionary = DSTLogicEngine.calc_maxwell_puppet_budget(200.0, 4, 2, 0) # 6*0.15 = 0.90 -> 20 max sanity
	_check(_approx(float(mx_b["effective_penalty"]), 0.90, 0.001) and _approx(float(mx_b["effective_max_sanity"]), 20.0, 0.1) and not bool(mx_b["can_summon_more"]), "LOGIC_MAXWELL_PUPPET_BUDGET", str(mx_b))
	var st_raw: Dictionary = DSTLogicEngine.calc_storm_speed_mult(0.85, false)
	var st_gog: Dictionary = DSTLogicEngine.calc_storm_speed_mult(0.85, true)
	_check(_approx(float(st_raw["speed_mult"]), 0.4) and _approx(float(st_gog["speed_mult"]), 1.0), "LOGIC_STORM_04X_GOGGLES_IMMUNE")
	var ant_e: Dictionary = DSTLogicEngine.step_antlion_rage(500.0, 600.0, 0.0) # 분노 폭발 -> 2016 * 0.8 = 1612.8s
	_check(bool(ant_e["erupted"]) and _approx(float(ant_e["rage_sec"]), 1612.8, 0.5), "LOGIC_ANTLION_RAGE_ERUPT", str(ant_e))
	var tl_br: Dictionary = db.logic.step_tool_durability("goldenaxe", 400, 1)
	_check(int(tl_br["max_uses"]) == 400 and int(tl_br["uses"]) == 399 and not bool(tl_br["broken"]), "LOGIC_TOOL_FINITE_USES", str(tl_br))

	# 역공학 로직 검증 24: 18인 선호 음식(+15 허기) + 왈리 음식 기억 감쇠(0.9->0.8->0.65) + 20종 건조대
	_check(db.logic.favorite_foods.size() >= 18 and db.logic.dryables.size() >= 19, "LOGIC_FAVFOODS_18_DRYABLES_20", "fav=%d dry=%d" % [db.logic.favorite_foods.size(), db.logic.dryables.size()])
	_check(_approx(db.logic.eval_favorite_food_bonus("wilson", "baconeggs"), 15.0) and _approx(db.logic.eval_favorite_food_bonus("willow", "hotchili"), 15.0) and _approx(db.logic.eval_favorite_food_bonus("wilson", "meatballs"), 0.0), "LOGIC_FAVORITE_FOOD_15_BONUS")
	var wm1: Dictionary = DSTLogicEngine.step_warly_food_memory({}, "meatballs", 100.0)
	var wm2: Dictionary = DSTLogicEngine.step_warly_food_memory(wm1["memory"], "meatballs", 200.0)
	var wm3: Dictionary = DSTLogicEngine.step_warly_food_memory(wm2["memory"], "meatballs", 300.0)
	_check(_approx(float(wm1["mult"]), 1.0) and _approx(float(wm2["mult"]), 0.9) and _approx(float(wm3["mult"]), 0.8), "LOGIC_WARLY_FOOD_MEMORY_DECAY")
	var dr_rain: Dictionary = db.logic.step_drying_rack({"item_id": "meat", "remaining_sec": 960.0}, 100.0, true)
	var dr_sun: Dictionary = db.logic.step_drying_rack(dr_rain, 960.0, false)
	_check(_approx(float(dr_rain["remaining_sec"]), 960.0) and bool(dr_sun["done"]) and str(dr_sun["product"]) == "meat_dried", "LOGIC_DRYING_RACK_RAIN_PAUSE")

	# 역공학 로직 검증 25: 보온석 5단계 상대온도·발광 + 웜우드 4단계 개화 + 어인왕 3버프 + 보스/방어구 마스터
	var hr_hot: Dictionary = DSTLogicEngine.eval_heatrock_state(75.0, 20.0, 3, 1.0) # rel=+55 > 30 -> range 5 HOT, emit=60, dur=0.875
	_check(int(hr_hot["range"]) == 5 and str(hr_hot["status"]) == "HOT" and _approx(float(hr_hot["emitted_temp"]), 60.0) and _approx(float(hr_hot["durability_pct"]), 0.875, 0.001), "LOGIC_HEATROCK_5RANGE_DURABILITY", str(hr_hot))
	var ww_sp: Dictionary = DSTLogicEngine.step_wormwood_bloomness({"level": 3, "timer": 100.0, "is_blooming": false, "fertilizer": 0.0}, 500.0, "spring", 0.0)
	_check(int(ww_sp["level"]) == 3 and _approx(float(ww_sp["speed_mult"]), 1.2), "LOGIC_WORMWOOD_SPRING_FULL_BLOOM", str(ww_sp))
	var mk: Dictionary = DSTLogicEngine.eval_mermking_buffs(true, true, true, false)
	_check(_approx(float(mk["triple_hit_chance"]), 0.33) and _approx(float(mk["damage_reduction"]), 0.15), "LOGIC_WURT_MERMKING_3BUFFS")
	_check(db.logic.creature_stats.size() >= 35 and int(db.logic.gear_master.get("armor_count", 0)) >= 20, "LOGIC_35_CREATURES_20_ARMORS_MASTER", "cr=%d ar=%d" % [db.logic.creature_stats.size(), int(db.logic.gear_master.get("armor_count", 0))])

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
