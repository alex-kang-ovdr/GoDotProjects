class_name DSTLogicEngine
extends RefCounted

## Don't Starve Together 원본 Lua 역공학 로직 실행 엔진 (Godot 4.7.2).
## data/dst_logic_extracted.json (tools/extract_dst_logic.py 산출물)을 로드해
## 1) 79종 전체 요리 냄비 Lua test() AST 평가기 (137종 재료 태그 + aliases + priority/weight)
## 2) 14종 작물 3영양분(N/P/K) · 7스트레스 체크포인트 평가기 (farm_plant_defs.lua + farmplantstress.lua)
## 3) 9종 개체 30Hz StateGraph 공격 선딜(windup)/히트프레임/후딜 타임라인 (SG*.lua)
## 4) 하운드 웨이브 에스컬레이션 규칙 (components/hounded.lua)
## 을 원작과 동일하게 실행한다.

var loaded: bool = false
var raw: Dictionary = {}
var recipes_79: Array = []
var recipes_by_id: Dictionary = {}
var ingredients: Dictionary = {}
var aliases: Dictionary = {}
var farm_crops: Dictionary = {}
var stategraphs: Dictionary = {}
var brains: Dictionary = {}
var hounded: Dictionary = {}
var characters_19: Dictionary = {}
var wx78_modules: Dictionary = {}
var wx78_by_id: Dictionary = {}
var physics: Dictionary = {}
var recipes2_by_id: Dictionary = {}
var skilltrees: Dictionary = {}
var loot_tables: Dictionary = {}
var worldgen_rooms: Dictionary = {}
var worldgen_tasks: Dictionary = {}
var worldgen_tasksets: Dictionary = {}
var ocean_fish: Dictionary = {}
var fertilizers: Dictionary = {}
var krampus: Dictionary = {}
var battlesongs: Dictionary = {}
var books: Dictionary = {}
var slingshot_ammos: Dictionary = {}
var trinkets_gold: Dictionary = {}
var bird_spawner: Dictionary = {}
var ghostly_elixirs: Dictionary = {}
var tool_uses: Dictionary = {}


func load_from_path(path: String = "res://data/dst_logic_extracted.json") -> bool:
	if not FileAccess.file_exists(path):
		return false
	var parsed: Variant = JSON.parse_string(FileAccess.get_file_as_string(path))
	if typeof(parsed) != TYPE_DICTIONARY:
		return false
	raw = parsed
	recipes_79 = raw.get("prepared_foods", [])
	recipes_by_id.clear()
	for r in recipes_79:
		if r is Dictionary and r.has("id"):
			recipes_by_id[str(r["id"])] = r
	ingredients = raw.get("cooking_ingredients", {})
	aliases = raw.get("cooking_aliases", {})
	farm_crops = raw.get("farm_crops", {})
	fertilizers = raw.get("fertilizers", {})
	krampus = raw.get("krampus", {})
	battlesongs = raw.get("battlesongs", {})
	books = raw.get("books", {})
	slingshot_ammos = raw.get("slingshot_ammos", {})
	trinkets_gold = raw.get("trinkets_gold", {})
	bird_spawner = raw.get("bird_spawner", {})
	ghostly_elixirs = raw.get("ghostly_elixirs", {})
	tool_uses = raw.get("tool_uses", {})
	stategraphs = raw.get("stategraphs", {})
	brains = raw.get("brains", {})
	hounded = raw.get("hounded", {})
	characters_19 = raw.get("characters_19", {})
	wx78_modules = raw.get("wx78_modules", {})
	wx78_by_id.clear()
	for m in wx78_modules.get("modules", []):
		if m is Dictionary and m.has("id"):
			wx78_by_id[str(m["id"])] = m
	physics = raw.get("physics", {})
	load_ext_from_path("res://data/dst_recipes_skilltrees_extracted.json")
	load_world_loot_from_path("res://data/dst_worldgen_loot_extracted.json")
	loaded = true
	return true


func load_world_loot_from_path(path: String = "res://data/dst_worldgen_loot_extracted.json") -> bool:
	if not FileAccess.file_exists(path):
		return false
	var parsed: Variant = JSON.parse_string(FileAccess.get_file_as_string(path))
	if typeof(parsed) != TYPE_DICTIONARY:
		return false
	loot_tables = parsed.get("loot_tables", {})
	worldgen_rooms = parsed.get("worldgen_rooms", {})
	worldgen_tasks = parsed.get("worldgen_tasks", {})
	worldgen_tasksets = parsed.get("worldgen_tasksets", {})
	ocean_fish = parsed.get("ocean_fish", {})
	return true


func load_ext_from_path(path: String = "res://data/dst_recipes_skilltrees_extracted.json") -> bool:
	if not FileAccess.file_exists(path):
		return false
	var parsed: Variant = JSON.parse_string(FileAccess.get_file_as_string(path))
	if typeof(parsed) != TYPE_DICTIONARY:
		return false
	recipes2_by_id.clear()
	for r in parsed.get("recipes2", {}).get("recipes", []):
		if r is Dictionary and r.has("id"):
			recipes2_by_id[str(r["id"])] = r
	skilltrees = parsed.get("skilltrees", {}).get("trees", {})
	return true


## Lua truthiness helper (false / null -> false; numbers/strings/true -> true)
static func _is_truthy(v: Variant) -> bool:
	if v == null:
		return false
	if typeof(v) == TYPE_BOOL:
		return bool(v)
	return true


static func _as_num(v: Variant) -> float:
	if typeof(v) == TYPE_FLOAT or typeof(v) == TYPE_INT:
		return float(v)
	return 0.0


## 역공학 컴파일된 Lua test(cooker, names, tags) JSON AST 실행기
static func eval_lua_ast(node: Variant, names: Dictionary, tags: Dictionary) -> Variant:
	if not (node is Array) or node.is_empty():
		return false
	var op: String = str(node[0])
	match op:
		"bool":
			return bool(node[1])
		"num":
			return float(node[1])
		"str":
			return str(node[1])
		"tag":
			var tk: String = str(node[1])
			var tv: float = float(tags.get(tk, 0.0))
			return tv if tv > 0.0 else false
		"name":
			var nk: String = str(node[1])
			var nv: float = float(names.get(nk, 0))
			return nv if nv > 0.0 else false
		"not":
			return not _is_truthy(eval_lua_ast(node[1], names, tags))
		"and":
			var lv: Variant = eval_lua_ast(node[1], names, tags)
			return eval_lua_ast(node[2], names, tags) if _is_truthy(lv) else false
		"or":
			var lv: Variant = eval_lua_ast(node[1], names, tags)
			return lv if _is_truthy(lv) else eval_lua_ast(node[2], names, tags)
		"arith":
			var aop: String = str(node[1])
			var a: float = _as_num(eval_lua_ast(node[2], names, tags))
			var b: float = _as_num(eval_lua_ast(node[3], names, tags))
			match aop:
				"+": return a + b
				"-": return a - b
				"*": return a * b
				"/": return a / b if abs(b) > 0.00001 else 0.0
			return 0.0
		"cmp":
			var cop: String = str(node[1])
			var ca: float = _as_num(eval_lua_ast(node[2], names, tags))
			var cb: float = _as_num(eval_lua_ast(node[3], names, tags))
			match cop:
				">": return ca > cb
				">=": return ca >= cb
				"<": return ca < cb
				"<=": return ca <= cb
				"==": return abs(ca - cb) <= 0.0001
				"~=": return abs(ca - cb) > 0.0001
			return false
	return false


## cooking.lua:217-288 — 137종 재료 태그 집계 + 79종 전체 요리 AST 판정 + priority/weight 추첨
func aggregate_ingredients(item_list: Array) -> Dictionary:
	var names: Dictionary = {}
	var tags: Dictionary = {}
	for raw_it in item_list:
		var sid: String = str(raw_it)
		var nm: String = str(aliases.get(sid, sid))
		names[nm] = int(names.get(nm, 0)) + 1
		var itags: Dictionary = ingredients.get(nm, {})
		for tk in itags.keys():
			tags[str(tk)] = float(tags.get(str(tk), 0.0)) + float(itags[tk])
	return {"names": names, "tags": tags}


func evaluate_crockpot_79(item_list: Array, allow_warly: bool = false, rng_roll: float = 0.0) -> Dictionary:
	var agg: Dictionary = aggregate_ingredients(item_list)
	var names: Dictionary = agg["names"]
	var tags: Dictionary = agg["tags"]

	var candidates: Array = []
	for r in recipes_79:
		if bool(r.get("warly_only", false)) and not allow_warly:
			continue
		if _is_truthy(eval_lua_ast(r.get("test_ast", []), names, tags)):
			candidates.append(r)

	if candidates.is_empty():
		return recipes_by_id.get("wetgoop", {"id": "wetgoop", "priority": -10.0, "weight": 1.0, "health": 0.0, "hunger": 0.0, "sanity": 0.0, "cooktime": 0.25, "perish_days": 6.0})

	candidates.sort_custom(func(a: Dictionary, b: Dictionary) -> bool:
		return float(a.get("priority", 0.0)) > float(b.get("priority", 0.0))
	)
	var top_prio: float = float(candidates[0].get("priority", 0.0))
	var top: Array = []
	var total_w: float = 0.0
	for c in candidates:
		if float(c.get("priority", 0.0)) < top_prio:
			break
		top.append(c)
		total_w += max(0.01, float(c.get("weight", 1.0)))

	var pick: float = clamp(rng_roll, 0.0, 0.9999) * total_w
	for c in top:
		pick -= max(0.01, float(c.get("weight", 1.0)))
		if pick <= 0.0:
			return c
	return top[0]


## farm_plant_defs.lua + farmplantstress.lua — 14종 작물 3영양분(N/P/K) & 7스트레스 체크포인트 평가
func evaluate_farm_checkpoint(
	crop_id: String,
	season: String,
	soil_nutrients: Array,
	hydrated: bool,
	tended: bool,
	family_count: int = 4,
	killjoys: int = 0,
	crowded: bool = false
) -> Dictionary:
	var cdef: Dictionary = farm_crops.get(crop_id, farm_crops.get("carrot", {}))
	var cons: Array = cdef.get("nutrients_consume", [4, 0, 0])
	var rest: Array = cdef.get("nutrients_restore", [0, 2, 2])
	var good_s: Array = cdef.get("good_seasons", ["autumn", "spring"])

	var soil_next: Array = [
		float(soil_nutrients[0]) if soil_nutrients.size() > 0 else 50.0,
		float(soil_nutrients[1]) if soil_nutrients.size() > 1 else 50.0,
		float(soil_nutrients[2]) if soil_nutrients.size() > 2 else 50.0,
	]
	var reasons: Array = []
	var nut_ok: bool = true
	for i in range(3):
		var need: float = float(cons[i])
		if need > 0.0 and soil_next[i] < need:
			nut_ok = false
		soil_next[i] = clamp(soil_next[i] - need + float(rest[i]), 0.0, 100.0)
	if not nut_ok:
		reasons.append("nutrients")
	if not hydrated:
		reasons.append("moisture")
	if killjoys > 0:
		reasons.append("killjoys")
	if not good_s.has(season):
		reasons.append("season")
	if crowded:
		reasons.append("crowded")
	if family_count < 4:
		reasons.append("family")
	if not tended:
		reasons.append("happiness")

	return {
		"crop_id": crop_id,
		"stress_added": reasons.size(),
		"reasons": reasons,
		"soil_after": soil_next,
	}


## stategraphs/SG*.lua — 30Hz(FRAMES) 추출 공격 선딜/히트프레임/후딜 조회
func get_stategraph_timing(kind: String) -> Dictionary:
	var lookup: String = "deerclops" if kind == "mutated_deerclops" else kind
	var sg: Dictionary = stategraphs.get(lookup, {})
	if sg.is_empty():
		return {"attack_hit_frame": 12.0, "attack_windup_sec": 0.4, "attack_recovery_sec": 0.4}
	return sg


## components/hounded.lua — 일수/계절 기반 하운드 웨이브 에스컬레이션 계산
func calc_hound_wave(day_num: int, season: String, rng: RandomNumberGenerator = null) -> Dictionary:
	var levels: Array = hounded.get("levels", [])
	var chosen: Dictionary = {"tier": "intro", "warn_sec": 120, "min_spawns": 1, "max_spawns": 1, "delay_days_min": 5, "delay_days_rand": 3}
	for lv in levels:
		if day_num < int(lv.get("max_day", 99999)):
			chosen = lv
			break
	var lo: int = int(chosen.get("min_spawns", 1))
	var hi: int = int(chosen.get("max_spawns", lo))
	var cnt: int = rng.randi_range(lo, hi) if rng != null else lo
	var variant: String = "hound"
	if season == "winter":
		variant = str(hounded.get("winter_variant", "icehound"))
	elif season == "summer":
		variant = str(hounded.get("summer_variant", "firehound"))
	var up_prob: float = 0.70 if cnt >= 8 else (0.30 if cnt == 7 else (0.15 if cnt == 6 else (0.05 if cnt == 5 else 0.0)))
	return {
		"tier": str(chosen.get("tier", "intro")),
		"warn_sec": float(chosen.get("warn_sec", 60.0)),
		"spawn_count": cnt,
		"variant": variant,
		"warglet_upgrade_chance": up_prob,
		"next_delay_days": float(chosen.get("delay_days_min", 5)) + (rng.randf() * float(chosen.get("delay_days_rand", 3)) if rng != null else 0.0),
	}


## recipes.lua (950+ Recipe2) — 원작 TechTree · builder_tag · builder_skill · 재료 검증기
func get_recipe2_tech_level(tech_name: String) -> int:
	if tech_name == "NONE" or tech_name == "":
		return 0
	if tech_name.begins_with("SCIENCE_ONE") or tech_name.begins_with("SEAFARING_ONE") or tech_name.begins_with("FISHING_ONE"):
		return 1
	if tech_name.begins_with("SCIENCE_TWO") or tech_name.begins_with("MAGIC_") or tech_name.begins_with("CELESTIAL_") or tech_name.begins_with("LUNARFORGING_"):
		return 2
	if tech_name.begins_with("ANCIENT_") or tech_name.begins_with("SHADOWFORGING_"):
		return 3
	return 1


func can_craft_recipe2(
	recipe_id: String,
	inv: Dictionary,
	nearby_tech: int = 0,
	builder_tags: Array = [],
	unlocked_skills: Dictionary = {}
) -> Dictionary:
	if not recipes2_by_id.has(recipe_id):
		return {"ok": false, "reason": "unknown_recipe"}
	var r: Dictionary = recipes2_by_id[recipe_id]
	var req_tag: String = str(r.get("builder_tag", ""))
	if req_tag != "" and not builder_tags.has(req_tag):
		return {"ok": false, "reason": "missing_builder_tag:" + req_tag}
	var req_skill: String = str(r.get("builder_skill", ""))
	if req_skill != "" and not unlocked_skills.has(req_skill):
		return {"ok": false, "reason": "missing_builder_skill:" + req_skill}
	var req_tech: int = get_recipe2_tech_level(str(r.get("tech", "NONE")))
	if nearby_tech < req_tech:
		return {"ok": false, "reason": "tech_too_low:%d<%d" % [nearby_tech, req_tech]}
	var ings: Dictionary = r.get("ingredients", {})
	for k in ings.keys():
		if int(inv.get(str(k), 0)) < int(ings[k]):
			return {"ok": false, "reason": "missing_ingredient:" + str(k)}
	return {"ok": true, "recipe": r}


## prefabs/skilltree_*.lua (12인 359노드) — 방향성 스킬 그래프 선행 조건 검증기
func can_unlock_tree_node(char_id: String, node_id: String, unlocked_nodes: Dictionary, insight_pts: int) -> Dictionary:
	if not skilltrees.has(char_id):
		return {"ok": false, "reason": "no_skilltree"}
	var nodes: Dictionary = skilltrees[char_id].get("nodes", {})
	if not nodes.has(node_id):
		return {"ok": false, "reason": "unknown_node"}
	if unlocked_nodes.has(node_id):
		return {"ok": false, "reason": "already_unlocked"}
	if insight_pts < 1:
		return {"ok": false, "reason": "no_insight"}
	var nd: Dictionary = nodes[node_id]
	if bool(nd.get("root", false)):
		return {"ok": true, "node": nd}
	var parents: Array = nd.get("parents", [])
	if parents.is_empty():
		return {"ok": true, "node": nd}
	for p in parents:
		if unlocked_nodes.has(str(p)):
			return {"ok": true, "node": nd}
	return {"ok": false, "reason": "parent_required:" + ",".join(parents)}


## wx78_moduledefs.lua (23종 모듈 · 6슬롯 전력 예산 엔진)
func wx78_slots_used(plugged_ids: Array) -> int:
	var used: int = 0
	for mid in plugged_ids:
		var m: Dictionary = wx78_by_id.get(str(mid), {})
		used += int(m.get("slots", 0))
	return used


func wx78_can_plug_module(mod_id: String, plugged_ids: Array) -> bool:
	if not wx78_by_id.has(mod_id):
		return false
	var max_s: int = int(wx78_modules.get("max_slots", 6))
	return wx78_slots_used(plugged_ids) + int(wx78_by_id[mod_id]["slots"]) <= max_s


func wx78_calc_circuit_bonuses(plugged_ids: Array) -> Dictionary:
	var hp_bonus: float = 0.0
	var speed_mult: float = 1.0
	var winter_insul: float = 0.0
	var summer_insul: float = 0.0
	var has_nightvision: bool = false
	for mid_v in plugged_ids:
		var mid: String = str(mid_v)
		match mid:
			"maxhealth": hp_bonus += 50.0
			"maxhealth2": hp_bonus += 150.0
			"movespeed": speed_mult += 0.15
			"movespeed2": speed_mult += 0.25
			"nightvision": has_nightvision = true
			"heat": winter_insul += 120.0
			"cold": summer_insul += 120.0
	return {
		"slots_used": wx78_slots_used(plugged_ids),
		"max_slots": int(wx78_modules.get("max_slots", 6)),
		"hp_bonus": hp_bonus,
		"speed_mult": speed_mult,
		"winter_insulation": winter_insul,
		"summer_insulation": summer_insul,
		"nightvision": has_nightvision,
	}


## components/temperature.lua:71-80 — 원작 단열 열관성 공식
## delta = delta * (SEG_TIME / (SEG_TIME + insulation))
static func calc_insulated_temp_delta(raw_delta: float, winter_insulation: float, summer_insulation: float, seg_time: float = 30.0) -> float:
	if raw_delta > 0.0:
		return raw_delta * (seg_time / (seg_time + max(0.0, summer_insulation)))
	return raw_delta * (seg_time / (seg_time + max(0.0, winter_insulation)))


## components/propagator.lua:184-203 — 원작 화재 열 전파 및 발화점(flashpoint=100) 시뮬레이터
## entities: Array of { id, pos: Vector2, heat: float, flashpoint: float, burning: bool, heat_output: float, prop_range: float, fireimmune: bool }
static func step_fire_propagators(entities: Array, dt: float, is_spring: bool = false) -> Array:
	var newly_ignited: Array = []
	var spring_mod: float = 0.67 if is_spring else 1.0
	# 1. 연소 중인 개체가 주변 개체에 열 전파
	for src in entities:
		if not bool(src.get("burning", false)):
			continue
		var prange: float = float(src.get("prop_range", 3.0)) * spring_mod
		var prange_sq: float = prange * prange
		var h_out: float = float(src.get("heat_output", 5.0))
		var spos: Vector2 = src["pos"]
		for dst in entities:
			if int(dst["id"]) == int(src["id"]) or bool(dst.get("burning", false)) or bool(dst.get("fireimmune", false)):
				continue
			var dsq: float = spos.distance_squared_to(dst["pos"])
			if dsq <= prange_sq and prange_sq > 0.0:
				var pct: float = max(0.1, 1.0 - dsq / prange_sq)
				dst["heat"] = float(dst.get("heat", 0.0)) + h_out * pct * dt
	# 2. 발화점 초과 판정 및 냉각 감쇠
	for ent in entities:
		if bool(ent.get("burning", false)):
			continue
		var h: float = float(ent.get("heat", 0.0))
		var fp: float = float(ent.get("flashpoint", 100.0))
		if h > fp:
			ent["burning"] = true
			newly_ignited.append(int(ent["id"]))
		elif h > 0.0:
			ent["heat"] = max(0.0, h - dt * 1.0)
	return newly_ignited


## prefabs/*.lua SetSharedLootTable — 원작 확률 드랍 테이블 롤러
func roll_shared_loot(table_id: String, rng: RandomNumberGenerator = null) -> Dictionary:
	var out: Dictionary = {}
	if not loot_tables.has(table_id):
		return out
	var entries: Array = loot_tables[table_id]
	for e in entries:
		if not (e is Array) or e.size() < 2:
			continue
		var item_id: String = str(e[0])
		var chance: float = float(e[1])
		if chance >= 1.0 or (rng != null and rng.randf() <= chance):
			out[item_id] = int(out.get(item_id, 0)) + 1
	return out


## components/seasons.lua:140-159 — 계절 진행도 기반 16세그 사인 보간 공식
static func calc_interpolated_season_segs(
	season_idx: int,
	day_in_season: int,
	season_order: Array,
	lengths: Dictionary,
	default_segs: Dictionary
) -> Dictionary:
	var n: int = season_order.size()
	if n == 0:
		return {"day": 8, "dusk": 6, "night": 2}
	var cur_idx: int = season_idx % n
	var cur_name: String = str(season_order[cur_idx])
	var total_days: float = max(1.0, float(lengths.get(cur_name, 20)))
	var p: float = clamp(float(day_in_season - 1) / total_days, 0.0, 1.0)
	var target_idx: int = (cur_idx - 1 + n) % n if p < 0.5 else (cur_idx + 1) % n
	var from_s: Dictionary = default_segs.get(cur_name, {"day": 8, "dusk": 6, "night": 2})
	var to_s: Dictionary = default_segs.get(str(season_order[target_idx]), from_s)
	var p_smooth: float = 0.5 - sin(PI * p) * 0.5
	var d_segs: int = int(floor(lerp(float(from_s["day"]), float(to_s["day"]), p_smooth) + 0.5))
	var n_segs: int = int(floor(lerp(float(from_s["night"]), float(to_s["night"]), p_smooth) + 0.5))
	var u_segs: int = max(0, 16 - d_segs - n_segs)
	return {"day": d_segs, "dusk": u_segs, "night": n_segs}


## spicedfoods.lua — 왈리 4종 양념(고추/마늘/꿀/소금) 버프 및 치유 증폭 적용
func apply_spice_to_food(food: Dictionary, spice_id: String) -> Dictionary:
	var out: Dictionary = food.duplicate(true)
	var sp_defs: Dictionary = physics.get("spices", {}).get("defs", {})
	if not sp_defs.has(spice_id):
		return out
	var sd: Dictionary = sp_defs[spice_id]
	out["spice"] = spice_id
	out["id"] = str(food.get("id", "food")) + "_" + spice_id
	if spice_id == "spice_salt" and float(out.get("health", 0.0)) > 0.0:
		out["health"] = float(out["health"]) * float(sd.get("health_bonus_mult", 1.25))
	elif spice_id == "spice_chili":
		out["buff"] = "buff_attack"
		out["attack_mult"] = float(sd.get("attack_mult", 1.2))
		out["buff_duration"] = float(sd.get("duration", 240.0))
		out["temperature"] = float(sd.get("temp_bonus", 40.0))
	elif spice_id == "spice_garlic":
		out["buff"] = "buff_playerabsorption"
		out["damage_taken_mult"] = float(sd.get("damage_taken_mult", 0.67))
		out["buff_duration"] = float(sd.get("duration", 240.0))
	elif spice_id == "spice_sugar":
		out["buff"] = "buff_workeffectiveness"
		out["work_mult"] = float(sd.get("work_mult", 2.0))
		out["buff_duration"] = float(sd.get("duration", 240.0))
	return out


## components/freezable.lua:10-34 — 3상태 빙결(NORMAL->FROZEN->THAWING) 및 피격 파쇄 공식
static func step_freezable(st: Dictionary, cold_delta: float, dmg_taken: float, dt: float) -> Dictionary:
	var state: String = str(st.get("state", "NORMAL"))
	var coldness: float = float(st.get("coldness", 0.0))
	var resist: float = max(0.5, float(st.get("resistance", 1.0)))
	var wear: float = float(st.get("wear_timer", 0.0))
	var dmg_total: float = float(st.get("damage_total", 0.0))
	var dmg_break: float = float(st.get("damage_to_break", 10.0))

	if cold_delta > 0.0:
		coldness += cold_delta
		if coldness >= resist and state == "NORMAL":
			state = "FROZEN"
			wear = float(st.get("wearofftime", 10.0))
			dmg_total = 0.0
	if (state == "FROZEN" or state == "THAWING") and dmg_taken > 0.0:
		dmg_total += abs(dmg_taken)
		if dmg_total >= dmg_break:
			state = "NORMAL"
			coldness = 0.0
			wear = 0.0
			dmg_total = 0.0
	elif state != "NORMAL" and dt > 0.0:
		wear -= dt
		if wear <= 0.0:
			if state == "FROZEN":
				state = "THAWING"
				wear = float(st.get("wearofftime", 10.0)) * 0.5
			else:
				state = "NORMAL"
				coldness = 0.0
				wear = 0.0
	elif coldness > 0.0 and dt > 0.0:
		coldness = max(0.0, coldness - dt * 0.25)

	return {
		"state": state, "coldness": coldness, "resistance": resist,
		"wear_timer": wear, "wearofftime": float(st.get("wearofftime", 10.0)),
		"damage_total": dmg_total, "damage_to_break": dmg_break,
	}


## map/rooms/**/*.lua — 추출된 월드젠 룸 가중치 테이블 기반 프리팹 샘플러
func sample_worldgen_room_prefabs(room_name: String, count: int, rng: RandomNumberGenerator) -> Array:
	var out: Array = []
	if not worldgen_rooms.has(room_name):
		return out
	var prefabs: Dictionary = worldgen_rooms[room_name].get("prefabs", {})
	var total_w: float = 0.0
	for w in prefabs.values():
		total_w += float(w)
	if total_w <= 0.0:
		return out
	for _i in range(count):
		var pick: float = rng.randf() * total_w
		for k in prefabs.keys():
			pick -= float(prefabs[k])
			if pick <= 0.0:
				out.append(str(k))
				break
	return out


## easing.lua — Robert Penner 원작 inSine / inExpo 이징 함수
static func ease_in_sine(t: float, b: float, c: float, d: float) -> float:
	if d <= 0.0:
		return b + c
	return -c * cos((t / d) * (PI * 0.5)) + c + b


static func ease_in_expo(t: float, b: float, c: float, d: float) -> float:
	if t <= 0.0 or d <= 0.0:
		return b
	return c * pow(2.0, 10.0 * (t / d - 1.0)) + b - c * 0.001


## components/inventory.lua:ApplyDamage + components/planarentity.lua:AbsorbDamage
## 원작 다중 방어구 최대흡수 + 비례 내구도 분산 + 평면 개체 물리피해 압축 + 평면방어 균등 차감
static func resolve_combat_hit(
	raw_phys: float,
	raw_planar: float,
	armors: Array,
	align_resist: float = 1.0,
	target_is_planar: bool = false
) -> Dictionary:
	var phys: float = max(0.0, raw_phys) * align_resist
	var absorbed_pct: float = 0.0
	var total_abs: float = 0.0
	for a in armors:
		var amt: float = clamp(float(a.get("absorption", 0.0)), 0.0, 1.0)
		absorbed_pct = max(absorbed_pct, amt)
		total_abs += amt

	var absorbed_dmg: float = phys * absorbed_pct
	var leftover_phys: float = phys - absorbed_dmg
	var wear: Dictionary = {}
	if total_abs > 0.0:
		for a in armors:
			var aid: String = str(a.get("id", "armor"))
			var amt: float = clamp(float(a.get("absorption", 0.0)), 0.0, 1.0)
			wear[aid] = float(wear.get(aid, 0.0)) + absorbed_dmg * (amt / total_abs)

	# PlanarEntity:AbsorbDamage — (sqrt(damage * 4 + 64) - 8) * 4
	if target_is_planar and leftover_phys > 0.0:
		leftover_phys = (sqrt(leftover_phys * 4.0 + 64.0) - 8.0) * 4.0

	# Inventory:ApplyDamage — 평면 방어구 균등 분할 차감 루프
	var sp_rem: float = max(0.0, raw_planar) * align_resist
	var sp_defs: Dictionary = {}
	for a in armors:
		var pd: float = float(a.get("planar_defense", 0.0))
		if pd > 0.0:
			sp_defs[str(a.get("id", "armor"))] = pd
	while sp_rem > 0.0001 and not sp_defs.is_empty():
		var split_dmg: float = sp_rem / float(sp_defs.size())
		var to_erase: Array = []
		for aid in sp_defs.keys():
			var def_v: float = float(sp_defs[aid])
			var defended: float = split_dmg if def_v > split_dmg else def_v
			if def_v > split_dmg:
				sp_defs[aid] = def_v - split_dmg
			else:
				to_erase.append(aid)
			sp_rem = max(0.0, sp_rem - defended)
			wear[aid] = float(wear.get(aid, 0.0)) + defended
		for k in to_erase:
			sp_defs.erase(k)

	return {
		"phys_damage": leftover_phys,
		"planar_damage": sp_rem,
		"total_damage": leftover_phys + sp_rem,
		"absorbed_percent": absorbed_pct,
		"absorbed_damage": absorbed_dmg,
		"armor_wear": wear,
	}


## components/perishable.lua:60-178 — 다중 부패 배수 & 스택 신선도 희석 공식
static func calc_perish_rate_mult(
	container_type: String = "inventory",
	is_wet: bool = false,
	ambient_temp: float = 20.0,
	is_frozen: bool = false,
	frozen_fire_mult: bool = false
) -> float:
	var modifier: float = 1.0
	match container_type:
		"fridge":
			modifier = 0.0 if is_frozen else 0.5
		"saltbox", "foodpreserver":
			modifier = 0.25 if container_type == "saltbox" else 0.75
		"ground":
			modifier = 1.5
		"spoiler":
			modifier = 1.5
	if is_wet:
		modifier *= 1.3
	if ambient_temp < 0.0:
		if is_frozen and not frozen_fire_mult:
			modifier = 0.0
		else:
			modifier *= 0.75
	if frozen_fire_mult:
		modifier *= 30.0
	if ambient_temp > 70.0:
		modifier *= 1.25
	return modifier


static func dilute_perish_stack(stack_n: int, cur_timeleft: float, add_n: int, add_timeleft: float) -> float:
	var denom: float = float(max(1, stack_n + add_n))
	return (float(stack_n) * cur_timeleft + float(add_n) * add_timeleft) / denom


## components/edible.lua:72-143 — 신선/눅눅/상함(>=0.5 / >0.2 / <=0.2) + 위커바텀 엄격 감쇠
static func eval_edible_with_spoilage(food: Dictionary, fresh_pct: float, eater_char_id: String = "wilson") -> Dictionary:
	var hp: float = float(food.get("health", 0.0))
	var hu: float = float(food.get("hunger", 0.0))
	var sa: float = float(food.get("sanity", 0.0))
	var tier: String = "fresh" if fresh_pct >= 0.5 else ("stale" if fresh_pct > 0.2 else "spoiled")

	var is_wicker: bool = (eater_char_id == "wickerbottom")
	var ignores_spoil: bool = (eater_char_id == "wx78")
	var eff_hp: float = hp
	var eff_hu: float = hu
	var eff_sa: float = sa

	if not ignores_spoil:
		if tier == "stale":
			if hp > 0.0:
				eff_hp = hp * (0.0 if is_wicker else 0.333)
			if hu > 0.0:
				eff_hu = hu * (0.333 if is_wicker else 0.667)
			if sa > 0.0:
				eff_sa = 0.0
		elif tier == "spoiled":
			if hp > 0.0:
				eff_hp = 0.0
			if hu > 0.0:
				eff_hu = hu * (0.167 if is_wicker else 0.5)
			eff_sa = -10.0

	return {"tier": tier, "health": eff_hp, "hunger": eff_hu, "sanity": eff_sa}


## components/moisture.lua:212-372 — 원작 inSine 강수 습기 & inExpo 건조 공식
static func step_moisture(
	moisture: float,
	is_raining: bool,
	precip_rate: float,
	waterproofness: float,
	heater_power: float,
	local_temp: float,
	dt: float
) -> Dictionary:
	var max_m: float = 100.0
	var wp: float = clamp(waterproofness, 0.0, 1.0)
	var m_rate: float = 0.0
	if is_raining and wp < 1.0:
		m_rate = ease_in_sine(clamp(precip_rate, 0.0, 1.0), 0.0, 0.75, 1.0) * (1.0 - wp)
	var d_rate: float = 0.0
	if m_rate <= 0.0:
		var segs: int = max(0, int(ceil((moisture / max_m) * 5.0 - 1.0)))
		var p_temp_dry: float = 2.0 if segs < 3 else 5.0
		d_rate = clamp(
			clamp(heater_power, 0.0, 1.0) * p_temp_dry
			+ (local_temp / 50.0) * 0.1
			+ ease_in_expo(clamp(moisture, 0.0, max_m), 0.0, 1.0, max_m),
			0.0,
			5.1
		)
	var net_rate: float = m_rate - d_rate
	var next_m: float = clamp(moisture + net_rate * dt, 0.0, max_m)
	var next_segs: int = max(0, int(ceil((next_m / max_m) * 5.0 - 1.0)))
	return {
		"moisture": next_m,
		"rate": net_rate,
		"segs": next_segs,
		"is_wet": next_segs >= 2,
	}


## components/sanity.lua:456-610 — 광기/계몽 이중 정신력 · inSine 습기 · 유령 군집 저항 공식
static func calc_sanity_rate(
	sanity_mode: int,
	phase: String,
	has_light: bool,
	moisture: float,
	dapperness: float = 0.0,
	aura_delta: float = 0.0,
	num_ghosts: int = 0,
	num_alive: int = 1,
	night_drain_mult: float = 1.0
) -> Dictionary:
	var moist_delta: float = ease_in_sine(clamp(moisture, 0.0, 100.0), 0.0, -100.0 / 1800.0, 100.0)
	var light_delta: float = 0.0
	if sanity_mode == 0:
		if phase == "day":
			light_delta = 0.0
		elif has_light:
			light_delta = (-100.0 / 1200.0) * night_drain_mult
		else:
			light_delta = (-100.0 / 120.0) * night_drain_mult
	else:
		if phase == "day":
			light_delta = 100.0 / 9600.0
		elif has_light:
			light_delta = 0.0
		else:
			light_delta = (-100.0 / 600.0) * night_drain_mult

	var ghost_mult: float = 0.0
	if num_ghosts > 0:
		var group_resist: float = (1.0 - float(num_ghosts) / float(num_alive)) if num_alive > num_ghosts else 0.0
		ghost_mult = min(float(num_ghosts), 3.0) * (1.0 - group_resist * group_resist)
	var ghost_delta: float = (-100.0 / 1800.0) * ghost_mult

	var total_rate: float = dapperness + moist_delta + light_delta + aura_delta + ghost_delta
	return {
		"rate": total_rate,
		"dapper_delta": dapperness,
		"moisture_delta": moist_delta,
		"light_delta": light_delta,
		"aura_delta": aura_delta,
		"ghost_delta": ghost_delta,
		"ghost_drain_mult": ghost_mult,
	}


## components/domesticatable.lua:94-157 — 비팔로 길들이기(domestication_latch) · 순종도 · 3성향 감쇠
static func step_beefalo_domestication(
	st: Dictionary,
	is_gaining: bool,
	tendency_key: String = "",
	tendency_delta: float = 0.0,
	dt: float = 10.0
) -> Dictionary:
	var dom: float = float(st.get("domestication", 0.0))
	var obed: float = float(st.get("obedience", 0.0))
	var min_obed: float = float(st.get("min_obedience", 0.0))
	var latch: bool = bool(st.get("domestication_latch", false))
	var domesticated: bool = bool(st.get("domesticated", false))
	var time_since_gain: float = float(st.get("time_since_gain", 0.0))
	var tends: Dictionary = st.get("tendencies", {}).duplicate(true)

	# 순종도 및 성향 자연 감쇠
	obed = clamp(obed + (-1.0 / 960.0) * dt, min_obed, 1.0)
	for tk in tends.keys():
		tends[tk] = max(0.0, float(tends[tk]) + (-1.0 / 21600.0) * dt)
	if tendency_key != "" and tendency_delta != 0.0:
		tends[tendency_key] = max(0.0, float(tends.get(tendency_key, 0.0)) + tendency_delta)

	if is_gaining:
		time_since_gain = 0.0
		dom = clamp(dom + (1.0 / 9600.0) * dt, 0.0, 1.0)
	else:
		time_since_gain += dt
		var loss_ratio: float = min(time_since_gain / (10.0 * 480.0), 1.0)
		dom = clamp(dom + (-1.0 / 1920.0) * loss_ratio * dt, 0.0, 1.0)

	if not domesticated and dom >= 1.0:
		latch = true
		dom = 1.0
	elif dom < 0.95:
		latch = false

	var best_tend: String = "DEFAULT"
	var best_val: float = 0.1
	for tk in tends.keys():
		if float(tends[tk]) > best_val:
			best_val = float(tends[tk])
			best_tend = str(tk)

	return {
		"domestication": dom,
		"obedience": obed,
		"min_obedience": min_obed,
		"domestication_latch": latch,
		"domesticated": domesticated,
		"time_since_gain": time_since_gain,
		"tendencies": tends,
		"dominant_tendency": best_tend,
	}


## components/sleeper.lua:248-308 — 수면 점감 저항(diminishingreturns, 하한 0.2x) 머신
static func step_sleeper_diminishing(st: Dictionary, add_sleepiness: float, base_sleep_sec: float, dt: float) -> Dictionary:
	var asleep: bool = bool(st.get("is_asleep", false))
	var sleepiness: float = float(st.get("sleepiness", 0.0))
	var resist: float = max(1.0, float(st.get("resistance", 1.0)))
	var extra_resist: float = float(st.get("extra_resist", 0.0))
	var timer: float = float(st.get("sleep_timer", 0.0))
	var decay_accum: float = float(st.get("decay_accum", 0.0))

	if add_sleepiness > 0.0:
		sleepiness += add_sleepiness
		if sleepiness >= resist:
			if not asleep:
				extra_resist = clamp(extra_resist + 1.0, 0.0, 10.0)
			asleep = true
			var mult: float = max(0.2, 1.0 - extra_resist * 0.1)
			timer = base_sleep_sec * mult
			sleepiness = 0.0

	if asleep and dt > 0.0:
		timer -= dt
		if timer <= 0.0:
			asleep = false
			timer = 0.0

	if extra_resist > 0.0 and dt > 0.0:
		decay_accum += dt
		while decay_accum >= 30.0 and extra_resist > 0.0:
			decay_accum -= 30.0
			extra_resist = max(0.0, extra_resist - 0.1)

	return {
		"is_asleep": asleep,
		"sleepiness": sleepiness,
		"resistance": resist,
		"extra_resist": extra_resist,
		"sleep_mult": max(0.2, 1.0 - extra_resist * 0.1),
		"sleep_timer": timer,
		"decay_accum": decay_accum,
	}


## prefabs/oceanfishdef.lua — 18종 해양 물고기 낚시 스태미나(struggle <-> tired) 시뮬레이터
func step_ocean_fish_reel(fish_id: String, st: Dictionary, is_reeling: bool, dt: float) -> Dictionary:
	var fdef: Dictionary = ocean_fish.get(fish_id, ocean_fish.get("oceanfish_small_1", {}))
	var stamina: float = float(st.get("stamina", 1.0))
	var dist: float = float(st.get("distance", 12.0))
	var struggling: bool = bool(st.get("struggling", true))
	var drain: float = float(fdef.get("stamina_drain", 0.1))
	var recover: float = float(fdef.get("stamina_recover", 0.1))
	var runspeed: float = float(fdef.get("runspeed", 2.5))
	var walkspeed: float = float(fdef.get("walkspeed", 1.2))

	if struggling:
		stamina = max(0.0, stamina - drain * dt)
		dist += (runspeed - (2.8 if is_reeling else 0.0)) * dt
		if stamina <= 0.01:
			struggling = false
	else:
		stamina = min(1.0, stamina + recover * dt)
		dist = max(0.0, dist - ((4.5 if is_reeling else walkspeed * 0.5) * dt))
		if stamina >= 0.99:
			struggling = true

	return {
		"fish_id": fish_id,
		"stamina": stamina,
		"distance": max(0.0, dist),
		"struggling": struggling,
		"caught": dist <= 0.5,
	}


## map/tasksets/*.lua + map/tasks/*.lua — 지상/동굴 월드젠 태스크셋 청사진 조회
func get_worldgen_taskset_plan(taskset_id: String = "default") -> Dictionary:
	var ts: Dictionary = worldgen_tasksets.get(taskset_id, {})
	var req: Array = ts.get("required_tasks", [])
	var resolved: Array = []
	for tname in req:
		var td: Dictionary = worldgen_tasks.get(str(tname), {})
		if not td.is_empty():
			resolved.append({"task": str(tname), "tile": str(td.get("tile", "GRASS")), "rooms": td.get("rooms", [])})
	return {
		"taskset": taskset_id,
		"required_count": req.size(),
		"resolved_count": resolved.size(),
		"optional_count": int(ts.get("num_optional", 0)),
		"tasks": resolved,
	}


## prefabs/fertilizer_nutrient_defs.lua — 17종 비료 3영양분(N/P/K) 토양 적용기
func apply_fertilizer_to_soil(soil_nutrients: Array, fert_id: String) -> Dictionary:
	var fdef: Dictionary = fertilizers.get(fert_id, {})
	if fdef.is_empty():
		return {"ok": false, "soil_after": soil_nutrients.duplicate()}
	var add_npk: Array = fdef.get("nutrients", [0.0, 0.0, 0.0])
	var next_soil: Array = [
		clamp((float(soil_nutrients[0]) if soil_nutrients.size() > 0 else 0.0) + float(add_npk[0]), 0.0, 100.0),
		clamp((float(soil_nutrients[1]) if soil_nutrients.size() > 1 else 0.0) + float(add_npk[1]), 0.0, 100.0),
		clamp((float(soil_nutrients[2]) if soil_nutrients.size() > 2 else 0.0) + float(add_npk[2]), 0.0, 100.0),
	]
	return {"ok": true, "fertilizer": fert_id, "uses": int(fdef.get("uses", 1)), "added": add_npk, "soil_after": next_soil}


## constants.lua NAUGHTY_VALUE + components/kramped.lua — 크람푸스 악행 누적·감쇠·소환 머신
func step_krampus_naughtiness(
	st: Dictionary,
	victim_prefab: String,
	day_num: int,
	dt: float,
	rng: RandomNumberGenerator = null
) -> Dictionary:
	var actions: int = int(st.get("actions", 0))
	var base_t: int = int(krampus.get("threshold_base", 30))
	var var_t: int = int(krampus.get("threshold_variance", 20))
	var threshold: int = int(st.get("threshold", base_t + (rng.randi_range(1, var_t) if rng != null else 10)))
	var decay_period: float = float(krampus.get("decay_period_sec", 60.0))
	var decay_t: float = float(st.get("timetodecay", decay_period))
	var spawned: int = 0
	var warn_lvl: int = 0

	var nvals: Dictionary = krampus.get("naughty_values", {})
	if victim_prefab != "" and nvals.has(victim_prefab):
		actions += int(nvals[victim_prefab])
		decay_t = decay_period
		if actions >= threshold and threshold > 0:
			actions = 0
			threshold = base_t + (rng.randi_range(1, var_t) if rng != null else 10)
			var lvl1: int = int(krampus.get("increase_lvl1_day", 50))
			var lvl2: int = int(krampus.get("increase_lvl2_day", 100))
			var ramp: int = rng.randi_range(1, 1) if rng != null else 1
			spawned = (2 + ramp) if day_num > lvl2 else ((1 + ramp) if day_num > lvl1 else 1)
		else:
			var rem: int = threshold - actions
			if rem < 5:
				warn_lvl = 3
			elif rem < 15:
				warn_lvl = 2
			elif rem < 20:
				warn_lvl = 1

	if actions > 0 and dt > 0.0:
		decay_t -= dt
		while decay_t < 0.0 and actions > 0:
			decay_t += decay_period
			actions = max(0, actions - 1)

	return {
		"actions": actions,
		"threshold": threshold,
		"timetodecay": decay_t,
		"warning_level": warn_lvl,
		"krampus_spawned": spawned,
	}


## prefabs/battlesongdefs.lua — 위그프리드 10종 전투 노래 스킬·고양감 비용 검증기
func can_cast_battlesong(song_id: String, inspiration: float, unlocked_skills: Dictionary = {}) -> Dictionary:
	if not battlesongs.has(song_id):
		return {"ok": false, "reason": "unknown_song"}
	var s: Dictionary = battlesongs[song_id]
	var req_sk: String = str(s.get("require_skill", ""))
	if req_sk != "" and not unlocked_skills.has(req_sk):
		return {"ok": false, "reason": "missing_skill:" + req_sk}
	var cost: float = float(s.get("inspiration_cost", 0.0))
	if bool(s.get("instant", false)) and inspiration < cost:
		return {"ok": false, "reason": "low_inspiration"}
	return {
		"ok": true,
		"song_id": song_id,
		"instant": bool(s.get("instant", false)),
		"inspiration_after": max(0.0, inspiration - cost),
	}


## prefabs/books.lua — 위커바텀 18종 마법서 낭독 가능 여부 및 정신력 소모 계산
func can_read_book(book_id: String, reader_char: String, cur_sanity: float) -> Dictionary:
	if not books.has(book_id):
		return {"ok": false, "reason": "unknown_book"}
	if reader_char != "wickerbottom" and reader_char != "waxwell":
		return {"ok": false, "reason": "not_bookreader"}
	var b: Dictionary = books[book_id]
	var delta_san: float = float(b.get("read_sanity", -33.0))
	return {
		"ok": true,
		"book_id": book_id,
		"uses": int(b.get("uses", 3)),
		"read_sanity": delta_san,
		"sanity_after": max(0.0, cur_sanity + delta_san),
	}


## components/mightiness.lua — 볼프강 근력(0..100) 3상태 · 5단계 허기 감쇠 배수
static func step_wolfgang_mightiness(st: Dictionary, gain_delta: float, hunger_pct: float, dt: float) -> Dictionary:
	var cur: float = float(st.get("current", 50.0))
	var max_m: float = float(st.get("max", 100.0))
	if gain_delta > 0.0:
		cur = min(max_m, cur + gain_delta)
	elif gain_delta < 0.0:
		cur = max(0.0, cur + gain_delta)

	if dt > 0.0:
		var mult: float = 0.5
		if hunger_pct <= 0.001:
			mult = 8.0
		elif hunger_pct < 0.25:
			mult = 3.0
		elif hunger_pct < 0.50:
			mult = 2.0
		elif hunger_pct < 0.75:
			mult = 1.0
		cur = max(0.0, cur - 0.2 * mult * dt)

	var state: String = "mighty" if cur >= 75.0 else ("normal" if cur >= 25.0 else "wimpy")
	var dmg_mult: float = 2.0 if state == "mighty" else (1.0 if state == "normal" else 0.75)
	return {"current": cur, "max": max_m, "state": state, "damage_mult": dmg_mult}


## components/oldager.lua — 완다 노화(20~80세) 지연 피해 풀 및 치유 상쇄 공식
static func step_wanda_oldager(st: Dictionary, hp_delta: float, dt: float) -> Dictionary:
	var age: float = float(st.get("age", 38.0))
	var year_timer: float = float(st.get("year_timer", 0.0))
	var dmg_rem: float = float(st.get("damage_remaining", 0.0))
	var dps: float = float(st.get("damage_per_second", 0.0))

	if abs(hp_delta) > 0.0001:
		var age_amount: float = -hp_delta # 피격(-HP) -> 양의 노화, 치유(+HP) -> 음의 회춘
		if (dmg_rem > 0.0 and age_amount < 0.0) or (dmg_rem < 0.0 and age_amount > 0.0):
			dmg_rem = 0.0
		dmg_rem += age_amount * 0.4 # OLDAGE_HEALTH_SCALE = 60/150
		dps = min(ceil(sqrt(abs(dmg_rem)) * 1.5), 30.0)
		if dmg_rem < 0.0:
			dps = -dps

	if dt > 0.0:
		var frame_age: float = (dt * 0.025) if (dmg_rem >= 0.0 and age < 80.0) else 0.0
		if abs(dmg_rem) > 0.0001:
			var f_dmg: float = dps * dt
			var prev_rem: float = dmg_rem
			dmg_rem -= f_dmg
			if (prev_rem > 0.0 and dmg_rem < 0.0) or (prev_rem < 0.0 and dmg_rem > 0.0):
				f_dmg = prev_rem
				dmg_rem = 0.0
				dps = 0.0
			frame_age += f_dmg
		var yt: float = year_timer + frame_age
		var whole_yrs: float = floor(yt)
		year_timer = yt - whole_yrs
		age = clamp(age + whole_yrs, 20.0, 80.0)

	var form: String = "old" if age >= 65.0 else ("normal" if age >= 35.0 else "young")
	return {
		"age": age,
		"year_timer": year_timer,
		"damage_remaining": dmg_rem,
		"damage_per_second": dps,
		"form": form,
		"dead": age >= 80.0,
	}


## components/shadowcreaturespawner.lua — 광기 그림자 생물 개체수 & 공포부리 분기
static func calc_shadow_spawner_target(sanity_pct: float, is_insanity_mode: bool = true, induced: bool = false) -> Dictionary:
	if not is_insanity_mode:
		return {"max_pop": 0, "prefab": "none"}
	if induced:
		return {"max_pop": 5, "prefab": "terrorbeak" if sanity_pct < 0.1 else "crawlinghorror"}
	if sanity_pct > 0.5:
		return {"max_pop": 0, "prefab": "none"}
	if sanity_pct > 0.1:
		return {"max_pop": 1, "prefab": "crawlinghorror"}
	return {"max_pop": 2, "prefab": "terrorbeak"}


## components/hullhealth.lua — 보트 선체 충돌(cos75° 스침 무시) · 누수(0.5/1.0 DPS) 물리
static func resolve_boat_hull_collision(
	hull_hp: float,
	boat_speed: float,
	hit_dot_velocity: float,
	leaks: Array,
	dt: float = 0.0
) -> Dictionary:
	var align: float = abs(hit_dot_velocity)
	var next_leaks: Array = leaks.duplicate()
	var collision_dmg: float = 0.0
	var grazed: bool = align <= 0.258 # THROAWAY_ALIGNMENT_VALUE = cos(75 deg)

	if not grazed:
		var adj_speed: float = boat_speed * align
		if adj_speed > 2.0:
			var sev: float = min(adj_speed - 2.0, 1.0)
			if sev >= 0.85:
				next_leaks.append("med_leak")
			elif sev >= 0.2:
				next_leaks.append("small_leak")
		if adj_speed > 0.65:
			var pct: float = min(adj_speed / 5.0, 1.0)
			collision_dmg = floor(70.0 * pct)

	var leak_dps: float = 0.0
	for lk in next_leaks:
		if str(lk) == "med_leak":
			leak_dps += 1.0
		elif str(lk) == "small_leak":
			leak_dps += 0.5
	var leak_dmg: float = leak_dps * max(0.0, dt)
	var next_hp: float = max(0.0, hull_hp - collision_dmg - leak_dmg)
	return {
		"hull_hp": next_hp,
		"grazed": grazed,
		"collision_damage": collision_dmg,
		"leak_dps": leak_dps,
		"leaks": next_leaks,
		"sunk": next_hp <= 0.0,
	}


## prefabs/slingshotammo.lua — 월터 17종 새총 탄약 물리/평면/특수효과 타격 계산
func resolve_slingshot_shot(ammo_id: String, target_is_planar: bool = false) -> Dictionary:
	if not slingshot_ammos.has(ammo_id):
		return {"ok": false}
	var a: Dictionary = slingshot_ammos[ammo_id]
	var phys: float = float(a.get("damage", 0.0))
	var planar: float = float(a.get("planar_damage", 0.0))
	if target_is_planar and phys > 0.0:
		phys = (sqrt(phys * 4.0 + 64.0) - 8.0) * 4.0
	return {
		"ok": true,
		"ammo_id": ammo_id,
		"phys_damage": phys,
		"planar_damage": planar,
		"total_damage": phys + planar,
		"effect": str(a.get("effect", "none")),
	}


## tuning.lua GOLD_VALUES.TRINKETS — 37종 장신구 돼지왕 금화 교환 계산
func get_pigking_gold_payout(item_id: String) -> int:
	if trinkets_gold.has(item_id):
		return int(trinkets_gold[item_id].get("gold", 0))
	if item_id == "meat" or item_id == "smallmeat":
		return 1
	return 0


## components/birdspawner.lua — 타일·계절·달섬·허수아비 기반 조류 선택기
func pick_seasonal_bird(tile_name: String, season: String, near_scarecrow: bool = false, is_moon_island: bool = false, rng: RandomNumberGenerator = null) -> String:
	if is_moon_island:
		return "bird_mutant"
	var list: Array = bird_spawner.get(tile_name, [])
	if list.is_empty():
		return ""
	var idx: int = rng.randi_range(0, list.size() - 1) if rng != null else 0
	var b: String = str(list[idx])
	if b == "robin" and season == "winter":
		b = "robin_winter"
	if near_scarecrow and (b == "crow" or b == "robin" or b == "robin_winter"):
		b = "canary"
	return b


## components/wildfires.lua — 여름 낮 >80°C 비젖음 자연발화 판정기
static func check_wildfire_ignition(season: String, phase: String, world_temp: float, is_wet: bool, rng_roll: float) -> bool:
	if season != "summer" or phase != "day" or is_wet or world_temp <= 80.0:
		return false
	return rng_roll <= 0.2


## components/riftspawner.lua — 달/그림자 균열 스폰 게이트 & 최대 균열 수(1) 판정
static func step_rift_spawner(st: Dictionary, lunar_unlocked: bool, shadow_unlocked: bool, dt: float) -> Dictionary:
	var active: int = int(st.get("rifts_count", 0))
	var timer: float = float(st.get("spawn_timer", 2400.0))
	var spawned_kind: String = ""
	if (lunar_unlocked or shadow_unlocked) and active < 1:
		timer -= dt
		if timer <= 0.0:
			active += 1
			spawned_kind = "lunarrift" if lunar_unlocked else "shadowrift"
			timer = 2400.0
	return {
		"rifts_count": active,
		"spawn_timer": timer,
		"spawned_kind": spawned_kind,
		"can_spawn_more": active < 1,
	}


## components/fueled.lua — 캠프파이어 연료 소모 및 비 가속(1 + 2.5 * precip_rate) 공식
static func step_fueled_burn(fuel_sec: float, dt: float, is_raining: bool = false, precip_rate: float = 0.0, add_fuel_tier: String = "") -> Dictionary:
	var add_map: Dictionary = {"tiny": 7.5, "small": 15.0, "med": 45.0, "med_large": 90.0, "large": 180.0, "huge": 270.0}
	var cur: float = fuel_sec + float(add_map.get(add_fuel_tier, 0.0))
	var rate: float = 1.0 + (2.5 * clamp(precip_rate, 0.0, 1.0) if is_raining else 0.0)
	var next_f: float = max(0.0, cur - dt * rate)
	return {"fuel_sec": next_f, "burn_rate": rate, "extinguished": next_f <= 0.0}


## components/grogginess.lua — 그로기 누적·기절(knockout)·이동속도 0.4x 감속 머신
static func step_grogginess(st: Dictionary, add_grog: float, dt: float) -> Dictionary:
	var grog: float = float(st.get("grog_amount", 0.0))
	var resist: float = max(1.0, float(st.get("resistance", 3.0)))
	var ko: bool = bool(st.get("knocked_out", false))
	var ko_t: float = float(st.get("ko_timer", 0.0))

	if add_grog > 0.0:
		grog += add_grog
		if grog >= resist and not ko:
			ko = true
			ko_t = 10.0 # TUNING.MIN_KNOCKOUT_TIME

	if ko and dt > 0.0:
		ko_t -= dt
		if ko_t <= 0.0:
			ko = false
			ko_t = 0.0
			grog = resist * 0.5
	elif grog > 0.0 and dt > 0.0:
		grog = max(0.0, grog - dt * 0.5)

	var speed_mult: float = 0.0 if ko else (0.4 if grog > 0.0 else 1.0)
	return {
		"grog_amount": grog,
		"resistance": resist,
		"knocked_out": ko,
		"ko_timer": ko_t,
		"speed_mult": speed_mult,
	}


## prefabs/ghostly_elixirs.lua — 웬디 9종 아비게일 유령 비약 버프 평가기
func eval_ghostly_elixir(elixir_id: String, elapsed_sec: float = 0.0) -> Dictionary:
	if not ghostly_elixirs.has(elixir_id):
		return {"ok": false}
	var e: Dictionary = ghostly_elixirs[elixir_id]
	var dur: float = float(e.get("duration_sec", 480.0))
	var hps: float = float(e.get("heal_per_sec", 0.0))
	var active_sec: float = min(max(0.0, elapsed_sec), dur)
	return {
		"ok": true,
		"elixir_id": elixir_id,
		"duration_sec": dur,
		"total_heal": hps * active_sec,
		"speed_mult": float(e.get("speed_mult", 1.0)),
		"retaliate_dmg": float(e.get("retaliate_dmg", 0.0)),
		"expired": elapsed_sec >= dur,
	}


## prefabs/wortox_soul_common.lua — 워톡스 영혼 치유(완다 제외·인원당 -2·최소 5) 및 20영혼 과부하
static func eval_wortox_soul_heal(targets: Array) -> Dictionary:
	var eligible: Array = []
	for t in targets:
		var cid: String = str(t.get("char_id", "wilson"))
		var hurt: bool = bool(t.get("is_hurt", true))
		var ghost: bool = bool(t.get("is_ghost", false))
		if hurt and not ghost and cid != "wanda": # health_as_oldage 태그 제외
			eligible.append(cid)
	var cnt: int = eligible.size()
	var heal_each: float = max(5.0, 20.0 - 2.0 * float(cnt - 1)) if cnt > 0 else 0.0
	return {"healed_count": cnt, "heal_per_target": heal_each, "targets": eligible}


static func step_wortox_souls(current_souls: int, add_souls: int) -> Dictionary:
	var next_s: int = max(0, current_souls + add_souls)
	var overloaded: bool = next_s > 20
	var sanity_penalty: float = 0.0
	var dropped: int = 0
	if overloaded:
		dropped = int(floor(float(next_s) * 0.5))
		next_s = next_s - dropped
		sanity_penalty = -20.0
	return {"souls": next_s, "overloaded": overloaded, "dropped": dropped, "sanity_delta": sanity_penalty}


## components/wereness.lua — 우디 3변신(werebeaver/weremoose/weregoose) 게이지 & 속도
static func step_woodie_wereness(st: Dictionary, dt: float, is_active_action: bool = false, is_full_moon: bool = false) -> Dictionary:
	var cur: float = float(st.get("current", 100.0))
	var mode: String = str(st.get("weremode", "none"))
	if is_full_moon and mode == "none":
		mode = "werebeaver"
		cur = 100.0
	if mode != "none" and dt > 0.0:
		# 기본 15초 완전 소모(100/15 = 6.667/s), 행동 중(전투/질주) 10x 지속 연장
		var eff_time: float = 15.0 * (10.0 if is_active_action else 1.0)
		cur = max(0.0, cur - (100.0 / eff_time) * dt)
		if cur <= 0.0:
			mode = "none"
	var speed: float = 6.0
	match mode:
		"werebeaver": speed = 6.6
		"weremoose": speed = 5.4
		"weregoose": speed = 8.4
	return {"current": cur, "weremode": mode, "run_speed": speed}


## tuning.lua SHADOWWAXWELL_SANITY_PENALTY + sanity.lua:208 — 맥스웰 그림자 분신 정신력 예산
static func calc_maxwell_puppet_budget(max_sanity: float, workers: int, protectors: int, duelists: int = 0) -> Dictionary:
	var raw_pen: float = float(workers) * 0.15 + float(protectors) * 0.15 + float(duelists) * 0.35
	var max_allowed_pen: float = max(0.0, 1.0 - (5.0 / max(10.0, max_sanity)))
	var clamped_pen: float = min(raw_pen, max_allowed_pen)
	return {
		"raw_penalty": raw_pen,
		"effective_penalty": clamped_pen,
		"effective_max_sanity": max_sanity * (1.0 - clamped_pen),
		"can_summon_more": (raw_pen + 0.15) <= max_allowed_pen,
	}


## components/stormwatcher.lua — 사막 모래폭풍/달폭풍 7단계 양자화 & 고글 면역 감속 공식
static func calc_storm_speed_mult(raw_level: float, has_goggles: bool = false) -> Dictionary:
	var q_lvl: float = floor(clamp(raw_level, 0.0, 1.0) * 7.0 + 0.5) / 7.0
	var slowed: bool = (q_lvl >= 0.7) and not has_goggles
	return {"quantized_level": q_lvl, "speed_mult": 0.4 if slowed else 1.0, "blinded": slowed}


## prefabs/antlion.lua — 여름 개미사자 분노 타이머(4.2일 초기, 1~6일 범위, 공물 연장)
static func step_antlion_rage(rage_sec: float, dt: float, tribute_bonus_sec: float = 0.0) -> Dictionary:
	var t: float = clamp(rage_sec + tribute_bonus_sec, 480.0, 2880.0)
	t -= max(0.0, dt)
	var erupted: bool = t <= 0.0
	if erupted:
		t = 2016.0 * 0.8 # ANTLION_RAGE_TIME_FAILURE_SCALE = 0.8
	var mood: String = "happy" if t >= 2880.0 * 0.95 else ("unhappy" if t < 2016.0 * 0.6 else "neutral")
	return {"rage_sec": t, "erupted": erupted, "mood": mood}


## components/finiteuses.lua + tuning.lua — 원작 도구·무기 내구도 차감기
func step_tool_durability(tool_id: String, cur_uses: int, consume: int = 1) -> Dictionary:
	var max_u: int = int(tool_uses.get(tool_id, 100))
	var rem: int = max(0, cur_uses - consume)
	return {"tool_id": tool_id, "uses": rem, "max_uses": max_u, "percent": float(rem) / float(max(1, max_u)), "broken": rem <= 0}
