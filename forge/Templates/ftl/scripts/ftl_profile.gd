class_name FTLProfile
extends RefCounted

## Native binary parser for FTL Advanced Edition v9 profile (`C:\Temp\FTL\FTL_Sav\ae_prof.sav`)
## + JSON loader for Godot Web (`/ftl-pkg/profile.json`) + local Godot run overlay (`user://ftl_profile_overlay.json`).

const OVERLAY_PATH := "user://ftl_profile_overlay.json"
const DEFAULT_SAV_PATHS := [
	"C:/Temp/FTL/FTL_Sav/ae_prof.sav",
	"res://ae_prof.sav",
]

# FTL v9 12-class unlock slot order -> base ship blueprint ID
const UNLOCK_CLASS_ORDER := [
	"PLAYER_SHIP_HARD",      # 0: Kestrel
	"PLAYER_SHIP_CIRCLE",    # 1: Engi
	"PLAYER_SHIP_FED",       # 2: Federation
	"PLAYER_SHIP_ENERGY",    # 3: Zoltan
	"PLAYER_SHIP_MANTIS",    # 4: Mantis
	"PLAYER_SHIP_JELLY",     # 5: Slug
	"PLAYER_SHIP_ROCK",      # 6: Rock
	"PLAYER_SHIP_STEALTH",   # 7: Stealth
	"PLAYER_SHIP_ANAEROBIC", # 8: Lanius
	"PLAYER_SHIP_CRYSTAL",   # 9: Crystal
]

const CLASS_ACH_PREFIX := {
	"PLAYER_SHIP_HARD": "ACH_SHIP_KESTRAL",
	"PLAYER_SHIP_CIRCLE": "ACH_SHIP_ENGI",
	"PLAYER_SHIP_FED": "ACH_SHIP_FED",
	"PLAYER_SHIP_ENERGY": "ACH_SHIP_ENERGY",
	"PLAYER_SHIP_MANTIS": "ACH_SHIP_MANTIS",
	"PLAYER_SHIP_JELLY": "ACH_SHIP_JELLY",
	"PLAYER_SHIP_ROCK": "ACH_SHIP_ROCK",
	"PLAYER_SHIP_STEALTH": "ACH_SHIP_STEALTH",
	"PLAYER_SHIP_ANAEROBIC": "ACH_SHIP_ANAEROBIC",
	"PLAYER_SHIP_CRYSTAL": "ACH_SHIP_CRYSTAL",
}

var loaded: bool = false
var source_label: String = ""
var version: int = 0
var unlock_all_sandbox: bool = false

var achievements: Dictionary = {}  # ach_id -> diff (0=Easy, 1=Normal, 2=Hard)
var victories: Dictionary = {}     # base_ship_id -> {best_diff, A, B, C}
var class_unlocks: Dictionary = {} # base_ship_id -> {A: bool, B: bool, C: bool}
var top_scores: Array = []         # [{ship_name, ship_id, score, sector, victory, diff, ae}]
var ship_bests: Dictionary = {}    # ship_id -> best score entry
var stats: Dictionary = {
	"most_ships_defeated": 0, "total_ships_defeated": 0,
	"most_beacons": 0, "total_beacons": 0,
	"most_scrap": 0, "total_scrap": 0,
	"most_crew_hired": 0, "total_crew_hired": 0,
	"total_games": 0, "total_victories": 0,
}
var crew_records: Array = []       # [{label, value, name, species}]


func auto_load() -> bool:
	if OS.has_feature("web"):
		_apply_local_overlay()
		return false
	var candidates: Array[String] = []
	var env_sav := OS.get_environment("FTL_PROFILE_PATH").strip_edges()
	if not env_sav.is_empty():
		candidates.append(env_sav.replace("\\", "/"))
	for p in DEFAULT_SAV_PATHS:
		candidates.append(p)
	for path in candidates:
		if FileAccess.file_exists(path):
			if load_from_sav_file(path):
				_apply_local_overlay()
				return true
	_apply_local_overlay()
	return false


func load_from_sav_file(path: String) -> bool:
	var f := FileAccess.open(path, FileAccess.READ)
	if f == null:
		return false
	var buf := f.get_buffer(f.get_length())
	f.close()
	return load_from_sav_buffer(buf, path.get_file())


func load_from_sav_buffer(buf: PackedByteArray, label: String = "ae_prof.sav") -> bool:
	if buf.size() < 64:
		return false
	var pos := [0]
	var ver := _ri32(buf, pos)
	if ver != 9 and ver != 4:
		return false
	version = ver
	if ver == 9:
		_ri32(buf, pos) # AE header flag (2)

	achievements.clear()
	victories.clear()
	var ach_cnt := _ri32(buf, pos)
	if ach_cnt < 0 or ach_cnt > 500:
		return false
	for _i in range(ach_cnt):
		var aid := _rstr(buf, pos)
		var diff := _ri32(buf, pos)
		achievements[aid] = diff
		if ver == 9 and aid.ends_with("_VICTORY"):
			var va := _ri32(buf, pos)
			var vb := _ri32(buf, pos)
			var vc := _ri32(buf, pos)
			var base_id := aid.substr(0, aid.length() - 8)
			victories[base_id] = {"best_diff": diff, "A": va, "B": vb, "C": vc}

	# 12 ship unlock classes x (2 ints in v9: Layout A & Layout C; 1 int in v4)
	class_unlocks.clear()
	var per_class := 2 if ver == 9 else 1
	for c_i in range(12):
		var a_val := _ri32(buf, pos)
		var c_val := _ri32(buf, pos) if per_class == 2 else 0
		if c_i < UNLOCK_CLASS_ORDER.size():
			var base_id: String = str(UNLOCK_CLASS_ORDER[c_i])
			var a_ok: bool = (a_val != 0) or (base_id == "PLAYER_SHIP_HARD")
			var c_ok: bool = (c_val != 0)
			var b_ok: bool = _compute_b_unlocked(base_id)
			class_unlocks[base_id] = {"A": a_ok, "B": b_ok, "C": c_ok}

	# Top scores
	top_scores.clear()
	var top_cnt := _ri32(buf, pos)
	for _i in range(clampi(top_cnt, 0, 50)):
		top_scores.append(_rscore(buf, pos, ver))

	# Per-ship best scores
	ship_bests.clear()
	var best_cnt := _ri32(buf, pos)
	for _i in range(clampi(best_cnt, 0, 500)):
		var sc := _rscore(buf, pos, ver)
		var sid := str(sc.ship_id)
		if not ship_bests.has(sid) or int(sc.score) > int(ship_bests[sid].score):
			ship_bests[sid] = sc

	# Lifetime & session stats (10 int32s)
	if pos[0] + 40 <= buf.size():
		stats = {
			"most_ships_defeated": _ri32(buf, pos),
			"total_ships_defeated": _ri32(buf, pos),
			"most_beacons": _ri32(buf, pos),
			"total_beacons": _ri32(buf, pos),
			"most_scrap": _ri32(buf, pos),
			"total_scrap": _ri32(buf, pos),
			"most_crew_hired": _ri32(buf, pos),
			"total_crew_hired": _ri32(buf, pos),
			"total_games": _ri32(buf, pos),
			"total_victories": _ri32(buf, pos),
		}

	# 5 Crew Hall-of-Fame records
	crew_records.clear()
	var rec_labels := ["최다 수리 (Repairs)", "최다 처치 (Combat Kills)", "최다 회피 (Piloted Evasions)", "최다 점프 (Jumps Survived)", "최다 숙련 (Skill Masteries)"]
	for lbl in rec_labels:
		if pos[0] + 12 > buf.size():
			break
		var val := _ri32(buf, pos)
		var cname := _rstr(buf, pos)
		var species := _rstr(buf, pos)
		_ri32(buf, pos) # male flag
		if not cname.is_empty():
			crew_records.append({"label": lbl, "value": val, "name": cname, "species": species})

	source_label = label
	loaded = true
	return true


func load_from_dict(d: Dictionary) -> void:
	if d.is_empty():
		return
	version = int(d.get("version", 9))
	source_label = str(d.get("source", "web:ae_prof.sav"))
	achievements = d.get("achievements", {}).duplicate(true)
	victories = d.get("victories", {}).duplicate(true)
	class_unlocks = d.get("class_unlocks", {}).duplicate(true)
	top_scores = d.get("top_scores", []).duplicate(true)
	ship_bests = d.get("ship_bests", {}).duplicate(true)
	if d.get("stats") is Dictionary:
		stats.merge(d.stats, true)
	crew_records = d.get("crew_records", []).duplicate(true)
	loaded = true
	_apply_local_overlay()


func _compute_b_unlocked(base_id: String) -> bool:
	var v: Dictionary = victories.get(base_id, {})
	if int(v.get("B", -1)) >= 0 or int(v.get("C", -1)) >= 0:
		return true
	var pref := str(CLASS_ACH_PREFIX.get(base_id, ""))
	if pref.is_empty():
		return false
	var count := 0
	for k in achievements.keys():
		if str(k).begins_with(pref):
			count += 1
	return count >= 2


static func split_ship_layout(ship_id: String) -> Dictionary:
	if ship_id.ends_with("_3"):
		return {"base": ship_id.substr(0, ship_id.length() - 2), "layout": "C"}
	if ship_id.ends_with("_2"):
		return {"base": ship_id.substr(0, ship_id.length() - 2), "layout": "B"}
	return {"base": ship_id, "layout": "A"}


func is_ship_unlocked(ship_id: String) -> bool:
	if unlock_all_sandbox or not loaded:
		return true
	var sp := split_ship_layout(ship_id)
	var base: String = sp.base
	var lay: String = sp.layout
	if base == "PLAYER_SHIP_HARD" and lay == "A":
		return true
	var cu: Dictionary = class_unlocks.get(base, {})
	if cu.has(lay):
		return bool(cu[lay])
	return false


func get_ship_victory_diff(ship_id: String) -> int:
	var sp := split_ship_layout(ship_id)
	var v: Dictionary = victories.get(sp.base, {})
	return int(v.get(sp.layout, -1))


func get_ship_victory_badge(ship_id: String) -> String:
	var d := get_ship_victory_diff(ship_id)
	if d == 2: return "★ HARD"
	if d == 1: return "★ NORMAL"
	if d == 0: return "★ EASY"
	return ""


func get_ship_best_score(ship_id: String) -> int:
	if ship_bests.has(ship_id):
		return int(ship_bests[ship_id].get("score", 0))
	return 0


func record_godot_run(ship_id: String, ship_name: String, score: int, sector_reached: int, won: bool, diff: int, ships_defeated: int, beacons_jumped: int, scrap_total: int) -> void:
	stats.total_games = int(stats.get("total_games", 0)) + 1
	stats.total_ships_defeated = int(stats.get("total_ships_defeated", 0)) + ships_defeated
	stats.total_beacons = int(stats.get("total_beacons", 0)) + beacons_jumped
	stats.total_scrap = int(stats.get("total_scrap", 0)) + scrap_total
	if ships_defeated > int(stats.get("most_ships_defeated", 0)):
		stats.most_ships_defeated = ships_defeated
	if beacons_jumped > int(stats.get("most_beacons", 0)):
		stats.most_beacons = beacons_jumped
	if scrap_total > int(stats.get("most_scrap", 0)):
		stats.most_scrap = scrap_total
	if won:
		stats.total_victories = int(stats.get("total_victories", 0)) + 1
		var sp := split_ship_layout(ship_id)
		if not victories.has(sp.base):
			victories[sp.base] = {"best_diff": diff, "A": -1, "B": -1, "C": -1}
		victories[sp.base][sp.layout] = maxi(int(victories[sp.base].get(sp.layout, -1)), diff)
		victories[sp.base].best_diff = maxi(int(victories[sp.base].get("best_diff", -1)), diff)
	var entry := {
		"ship_name": ship_name, "ship_id": ship_id, "score": score,
		"sector": sector_reached, "victory": won, "diff": diff, "ae": true,
	}
	if not ship_bests.has(ship_id) or score > int(ship_bests[ship_id].get("score", 0)):
		ship_bests[ship_id] = entry
	top_scores.append(entry)
	top_scores.sort_custom(func(a, b): return int(a.score) > int(b.score))
	if top_scores.size() > 5:
		top_scores.resize(5)
	_save_local_overlay(entry)


func _apply_local_overlay() -> void:
	if not FileAccess.file_exists(OVERLAY_PATH):
		return
	var parsed = JSON.parse_string(FileAccess.get_file_as_string(OVERLAY_PATH))
	if not (parsed is Dictionary):
		return
	for run in parsed.get("runs", []):
		if run is Dictionary:
			var sid := str(run.get("ship_id", ""))
			var sc := int(run.get("score", 0))
			if not ship_bests.has(sid) or sc > int(ship_bests[sid].get("score", 0)):
				ship_bests[sid] = run
			if bool(run.get("victory", false)):
				var sp := split_ship_layout(sid)
				if not victories.has(sp.base):
					victories[sp.base] = {"best_diff": int(run.get("diff", 0)), "A": -1, "B": -1, "C": -1}
				victories[sp.base][sp.layout] = maxi(int(victories[sp.base].get(sp.layout, -1)), int(run.get("diff", 0)))


func _save_local_overlay(entry: Dictionary) -> void:
	var data := {"runs": []}
	if FileAccess.file_exists(OVERLAY_PATH):
		var parsed = JSON.parse_string(FileAccess.get_file_as_string(OVERLAY_PATH))
		if parsed is Dictionary and parsed.get("runs") is Array:
			data = parsed
	data.runs.append(entry)
	var f := FileAccess.open(OVERLAY_PATH, FileAccess.WRITE)
	if f != null:
		f.store_string(JSON.stringify(data, "\t"))
		f.close()


static func _ri32(buf: PackedByteArray, pos: Array) -> int:
	if pos[0] + 4 > buf.size():
		return 0
	var v := buf.decode_s32(pos[0])
	pos[0] += 4
	return v


static func _rstr(buf: PackedByteArray, pos: Array) -> String:
	var n := _ri32(buf, pos)
	if n <= 0 or n > 1024 or pos[0] + n > buf.size():
		return ""
	var s := buf.slice(pos[0], pos[0] + n).get_string_from_utf8()
	pos[0] += n
	return s


static func _rscore(buf: PackedByteArray, pos: Array, ver: int) -> Dictionary:
	var ship_name := _rstr(buf, pos)
	var ship_id := _rstr(buf, pos)
	var score := _ri32(buf, pos)
	var sector := _ri32(buf, pos)
	var victory := _ri32(buf, pos) != 0
	var diff := _ri32(buf, pos)
	var ae := (_ri32(buf, pos) != 0) if ver == 9 else false
	return {
		"ship_name": ship_name, "ship_id": ship_id, "score": score,
		"sector": sector, "victory": victory, "diff": diff, "ae": ae,
	}
