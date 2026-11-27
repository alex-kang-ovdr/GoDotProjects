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
	loaded = true
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
