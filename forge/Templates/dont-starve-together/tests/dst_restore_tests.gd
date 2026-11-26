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

	# 원작 추출 에셋(KTEX 타일 8 + 초상화 6 + 아이콘 32 + KAnim 21 + FSB5 SFX 10 + 셰이더 70) 검증
	DSTMedia.ensure_loaded()
	_check(DSTMedia.terrain_tiles.size() >= 8, "MEDIA_TILES", "tiles=%d" % DSTMedia.terrain_tiles.size())
	_check(DSTMedia.portraits.size() >= 6, "MEDIA_PORTRAITS", "portraits=%d" % DSTMedia.portraits.size())
	_check(DSTMedia.icons.size() >= 32, "MEDIA_ICONS", "icons=%d" % DSTMedia.icons.size())
	_check(DSTMedia.kanim_sprites.size() >= 21, "MEDIA_KANIM", "kanim=%d" % DSTMedia.kanim_sprites.size())
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

	# 메인 씬 로드/인스턴스화 검증
	var packed: PackedScene = load("res://scenes/main.tscn")
	_check(packed != null, "MAIN_SCENE_LOAD")
	if packed != null:
		var inst: Node = packed.instantiate()
		root.add_child(inst)
		_check(inst.get("sim") != null and inst.get("cam") != null, "MAIN_SCENE_READY")
		inst.queue_free()

	var summary: Dictionary = {"passed": passed, "failed": failed, "errors": errors}
	print("DST_TEST_RESULT " + JSON.stringify(summary))
	quit(0 if failed == 0 else 1)
