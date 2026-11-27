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
