class_name DSTDatabase
extends RefCounted

## Don't Starve Together 데이터 로더 및 원작 검증 핵심 수식 엔진.
## 출처: scripts/tuning.lua, combat.lua, inventory.lua, planarentity.lua,
##       cooking.lua, farmplantstress.lua, boatphysics.lua

var data: Dictionary = {}
var foods_by_id: Dictionary = {}
var recipes_by_id: Dictionary = {}


func load_from_path(path: String = "res://data/dst_tuning.json") -> bool:
	if not FileAccess.file_exists(path):
		push_error("DSTDatabase: missing tuning file " + path)
		return false
	var raw: String = FileAccess.get_file_as_string(path)
	var parsed: Variant = JSON.parse_string(raw)
	if typeof(parsed) != TYPE_DICTIONARY:
		push_error("DSTDatabase: failed to parse JSON " + path)
		return false
	data = parsed
	foods_by_id.clear()
	for f in data.get("foods", []):
		if typeof(f) == TYPE_DICTIONARY and f.has("id"):
			foods_by_id[str(f["id"])] = f
	recipes_by_id.clear()
	for r in data.get("recipes", []):
		if typeof(r) == TYPE_DICTIONARY and r.has("id"):
			recipes_by_id[str(r["id"])] = r
	return true


## planarentity.lua:902 — 평면 개체의 일반 물리 피해 비선형 감쇄 공식
## damage = (math.sqrt(damage * 4 + 64) - 8) * 4
static func planar_entity_absorb(damage: float) -> float:
	if damage <= 0.0:
		return 0.0
	return (sqrt(damage * 4.0 + 64.0) - 8.0) * 4.0


## inventory.lua:408-460 — DST 다중 방어구 및 평면 방어 공식
## armors: Array of Dictionary { "id", "absorption", "durability", "planar_defense" }
## 반환: { "hp_damage", "planar_damage", "armor_wear": Dictionary, "absorbed_percent" }
static func apply_armor_and_planar(
	raw_damage: float,
	raw_planar: float,
	armors: Array,
	damage_type_resist: float = 1.0
) -> Dictionary:
	var dmg: float = max(0.0, raw_damage) * damage_type_resist
	var absorbed_pct: float = 0.0
	var total_absorption: float = 0.0
	var active_armors: Array = []

	for a in armors:
		if typeof(a) != TYPE_DICTIONARY:
			continue
		if float(a.get("durability", 0.0)) <= 0.0:
			continue
		var abs_val: float = float(a.get("absorption", 0.0))
		if abs_val > 0.0:
			active_armors.append(a)
			absorbed_pct = max(absorbed_pct, abs_val)
			total_absorption += abs_val

	var absorbed_dmg: float = dmg * absorbed_pct
	var leftover_dmg: float = dmg - absorbed_dmg
	var wear: Dictionary = {}
	if total_absorption > 0.0:
		for a in active_armors:
			var aid: String = str(a.get("id", "armor"))
			var amt: float = float(a.get("absorption", 0.0))
			var share: float = absorbed_dmg * amt / total_absorption
			wear[aid] = float(wear.get(aid, 0.0)) + share

	# 평면 피해 처리: 일반 흡수율 무시, 장착 장비 PlanarDefense로 균등 분할 차감
	var planar_left: float = max(0.0, raw_planar) * damage_type_resist
	if planar_left > 0.0:
		var sp_defenders: Dictionary = {}
		for a in armors:
			if typeof(a) != TYPE_DICTIONARY:
				continue
			if float(a.get("durability", 0.0)) <= 0.0:
				continue
			var pdef: float = float(a.get("planar_defense", 0.0))
			if pdef > 0.0:
				sp_defenders[str(a.get("id", "armor"))] = pdef

		while planar_left > 0.0001 and sp_defenders.size() > 0:
			var split: float = planar_left / float(sp_defenders.size())
			var keys: Array = sp_defenders.keys()
			for k in keys:
				var def_left: float = float(sp_defenders[k])
				if def_left > split:
					planar_left -= split
					sp_defenders[k] = def_left - split
					wear[k] = float(wear.get(k, 0.0)) + split
				else:
					planar_left -= def_left
					sp_defenders.erase(k)
					wear[k] = float(wear.get(k, 0.0)) + def_left

	return {
		"hp_damage": max(0.0, leftover_dmg),
		"planar_damage": max(0.0, planar_left),
		"total_damage": max(0.0, leftover_dmg) + max(0.0, planar_left),
		"absorbed_percent": absorbed_pct,
		"armor_wear": wear,
	}


## combat.lua:1200-1210 — 전기 공격 습기 증폭 공식
static func calc_electric_mult(base_mult: float, wet_mult: float, target_wet_ratio: float) -> float:
	return base_mult + wet_mult * clamp(target_wet_ratio, 0.0, 1.0)


## cooking.lua:238-288 — 냄비 4재료 우선순위 + 가중치 판정
func calculate_crockpot_recipe(ingredients: Array, rng_roll: float = 0.0) -> Dictionary:
	var tags: Dictionary = {
		"meat": 0.0, "veggie": 0.0, "fruit": 0.0,
		"egg": 0.0, "monster": 0.0, "frozen": 0.0, "inedible": 0.0,
	}
	for item_id in ingredients:
		var f: Dictionary = foods_by_id.get(str(item_id), {})
		var ftags: Dictionary = f.get("tags", {})
		for tk in ftags.keys():
			tags[tk] = float(tags.get(tk, 0.0)) + float(ftags[tk])
		if str(item_id) == "twigs":
			tags["inedible"] = float(tags["inedible"]) + 1.0

	var candidates: Array = []
	# monsterlasagna (priority 10): monster >= 2 and not inedible
	if float(tags["monster"]) >= 2.0 and float(tags["inedible"]) <= 0.0:
		candidates.append(foods_by_id.get("monsterlasagna", {"id": "monsterlasagna", "priority": 10, "weight": 1.0}))
	# baconeggs (priority 10): egg > 1 and meat > 1 and not veggie
	if float(tags["egg"]) > 1.0 and float(tags["meat"]) > 1.0 and float(tags["veggie"]) <= 0.0:
		candidates.append(foods_by_id.get("baconeggs", {"id": "baconeggs", "priority": 10, "weight": 1.0}))
	# perogies (priority 5): egg and meat and veggie and not inedible
	if float(tags["egg"]) > 0.0 and float(tags["meat"]) > 0.0 and float(tags["veggie"]) > 0.0 and float(tags["inedible"]) <= 0.0:
		candidates.append(foods_by_id.get("perogies", {"id": "perogies", "priority": 5, "weight": 1.0}))
	# bonestew (priority 0): meat >= 3 and not inedible
	if float(tags["meat"]) >= 3.0 and float(tags["inedible"]) <= 0.0:
		candidates.append(foods_by_id.get("bonestew", {"id": "bonestew", "priority": 0, "weight": 1.0}))
	# meatballs (priority -1): meat > 0 and not inedible
	if float(tags["meat"]) > 0.0 and float(tags["inedible"]) <= 0.0:
		candidates.append(foods_by_id.get("meatballs", {"id": "meatballs", "priority": -1, "weight": 1.0}))
	# wetgoop fallback (priority -10)
	candidates.append(foods_by_id.get("wetgoop", {"id": "wetgoop", "priority": -10, "weight": 1.0}))

	candidates.sort_custom(func(a: Dictionary, b: Dictionary) -> bool:
		return float(a.get("priority", 0)) > float(b.get("priority", 0))
	)
	var top_prio: float = float(candidates[0].get("priority", 0))
	var top: Array = []
	var total_weight: float = 0.0
	for c in candidates:
		if float(c.get("priority", 0)) < top_prio:
			break
		top.append(c)
		total_weight += float(c.get("weight", 1.0))

	var pick: float = clamp(rng_roll, 0.0, 0.9999) * total_weight
	for c in top:
		pick -= float(c.get("weight", 1.0))
		if pick <= 0.0:
			return c
	return top[0]


## farmplantstress.lua:72-78 — 작물 최종 스트레스 등급 판정
static func calc_farm_stress_state(stress_points: int) -> String:
	if stress_points <= 1:
		return "NONE" # Oversized (거대 작물!)
	elif stress_points <= 6:
		return "LOW"
	elif stress_points <= 11:
		return "MODERATE"
	return "HIGH"


## boatphysics.lua:344-384 — 다중 돛 속도 체감 공식 (오름차순 정렬 후 0.7^k)
static func calc_boat_max_velocity(
	mast_vels: Array,
	base_max_velocity: float = 1.2,
	max_allowed: float = 10.0,
	drag_mod: float = 1.0
) -> float:
	var sorted_vels: Array = mast_vels.duplicate()
	sorted_vels.sort()
	var sum_vel: float = 0.0
	var mult: float = 1.0
	for v in sorted_vels:
		var fv: float = float(v)
		if fv != 0.0:
			sum_vel += fv * mult
			mult *= 0.7
	return min(sum_vel * base_max_velocity * drag_mod, max_allowed)
