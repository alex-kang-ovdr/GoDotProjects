class_name CosmoteerWeaponData
extends RefCounted

## 코스모티어 원본 추출 데이터(catalog.json, extracted_rules.json, dll_mechanics.json) 기반
## 18종 무기 일람표 SSOT 및 Scrap to Starship 실전투 연동(weapon_overrides) 관리자.

const CATALOG_PATH := "res://assets/cosmoteer/data/catalog.json"
const EXTRACTED_RULES_PATH := "res://assets/cosmoteer/data/extracted_rules.json"
const DLL_MECHANICS_PATH := "res://assets/cosmoteer/data/dll_mechanics.json"
const OVERRIDE_SAVE_PATH := "user://cosmoteer_weapon_overrides.json"

const CATEGORIES := [
	{"id": "all", "label": "전체 (18)"},
	{"id": "energy", "label": "전력 · 빔"},
	{"id": "ballistic", "label": "탄도"},
	{"id": "missile", "label": "미사일 · 특수"},
	{"id": "utility", "label": "방어 · 유틸"},
]

const EXTRA_STATS := {
	"cosmoteer.laser_blaster_large": {"damage": 1400.0, "fire_interval": 1.35, "projectile_speed": 440.0, "range": 320.0, "firing_arc_deg": 160.0},
	"cosmoteer.cannon_med": {"shot_id": "bullet_med", "damage": 1100.0, "fire_interval": 1.15, "projectile_speed": 290.0, "range": 230.0, "firing_arc_deg": 130.0},
	"cosmoteer.cannon_large": {"shot_id": "bullet_large", "damage": 2600.0, "fire_interval": 1.65, "projectile_speed": 220.0, "range": 240.0, "ignite_intensity": 0.35, "firing_arc_deg": 110.0},
	"cosmoteer.cannon_deck": {"shot_id": "bullet_deck", "damage": 4200.0, "fire_interval": 2.2, "projectile_speed": 150.0, "range": 190.0, "aoe_radius": 3.2, "ignite_intensity": 0.55, "firing_arc_deg": 270.0},
	"cosmoteer.missile_launcher": {"damage": 1800.0, "fire_interval": 2.4, "projectile_speed": 185.0, "range": 380.0, "aoe_radius": 4.2, "ignite_intensity": 0.55, "firing_arc_deg": 360.0},
	"cosmoteer.disruptor": {"damage": 450.0, "fire_interval": 0.95, "projectile_speed": 360.0, "range": 270.0, "shield_damage_mult": 3.0, "firing_arc_deg": 180.0},
	"cosmoteer.ion_beam_emitter": {"beam_dps": 2400.0, "fire_interval": 1.0, "projectile_speed": 1200.0, "range": 310.0, "ignite_intensity": 0.45, "firing_arc_deg": 45.0},
	"cosmoteer.resonance_beam_turret": {"beam_dps": 3200.0, "fire_interval": 1.0, "projectile_speed": 1200.0, "range": 240.0, "ignite_intensity": 0.90, "firing_arc_deg": 220.0},
	"cosmoteer.flak_cannon_large": {"damage": 1250.0, "fire_interval": 0.95, "projectile_speed": 310.0, "range": 225.0, "firing_arc_deg": 100.0},
	"cosmoteer.chaingun": {"damage": 320.0, "fire_interval": 0.34, "projectile_speed": 430.0, "range": 250.0, "firing_arc_deg": 110.0},
	"cosmoteer.railgun_launcher": {"damage": 2400.0, "fire_interval": 2.8, "projectile_speed": 720.0, "range": 420.0, "ignite_intensity": 0.65, "firing_arc_deg": 32.0},
	"cosmoteer.point_defense": {"pd_damage": 140.0, "pd_fire_interval": 0.18, "pd_range": 150.0, "projectile_speed": 480.0, "firing_arc_deg": 220.0},
	"cosmoteer.tractor_beam_emitter": {"tractor_range": 300.0, "damage": 450.0, "fire_interval": 1.0, "projectile_speed": 900.0, "firing_arc_deg": 180.0},
	"cosmoteer.mining_laser_small": {"beam_dps": 1400.0, "fire_interval": 1.0, "projectile_speed": 960.0, "range": 180.0, "ignite_intensity": 0.30, "firing_arc_deg": 120.0},
}

const ROSTER_ITEMS := [
	{"id": "cosmoteer.laser_blaster_small", "cf_kind": "laser", "name": "소형 레이저", "cat": "energy", "demo_kind": "laser", "role": "전력 · 표준"},
	{"id": "cosmoteer.laser_blaster_large", "cf_kind": "cosmo_heavy_laser", "name": "대형 레이저", "cat": "energy", "demo_kind": "heavy_laser", "role": "전력 · 중화기"},
	{"id": "cosmoteer.disruptor", "cf_kind": "cosmo_disruptor", "name": "교란기 (EMP)", "cat": "energy", "demo_kind": "disruptor", "role": "방어막 3배 · 방전"},
	{"id": "cosmoteer.ion_beam_emitter", "cf_kind": "cosmo_ion_beam", "name": "이온 빔 방출기", "cat": "energy", "demo_kind": "ion", "role": "연속 빔 · 화재"},
	{"id": "cosmoteer.resonance_beam_turret", "cf_kind": "cosmo_resonance_turret", "name": "열공명 랜스", "cat": "energy", "demo_kind": "resonance", "role": "고열 연속 빔"},
	{"id": "cosmoteer.cannon_med", "cf_kind": "cosmo_cannon_med", "name": "중형 캐논", "cat": "ballistic", "demo_kind": "cannon", "role": "탄도 · 돌파 5"},
	{"id": "cosmoteer.cannon_large", "cf_kind": "cosmo_cannon_large", "name": "대형 캐논", "cat": "ballistic", "demo_kind": "cannon_large", "role": "탄도 · 돌파 7"},
	{"id": "cosmoteer.cannon_deck", "cf_kind": "cosmo_cannon_deck", "name": "갑판포 270°", "cat": "ballistic", "demo_kind": "cannon_deck", "role": "270° · 광역 · 돌파 9"},
	{"id": "cosmoteer.chaingun", "cf_kind": "cosmo_chaingun", "name": "체인건", "cat": "ballistic", "demo_kind": "chaingun", "role": "고속 연사 가속"},
	{"id": "cosmoteer.railgun_launcher", "cf_kind": "railgun", "name": "모듈식 레일건", "cat": "ballistic", "demo_kind": "railgun", "role": "초고속 · 돌파 15"},
	{"id": "cosmoteer.flak_cannon_large", "cf_kind": "cosmo_flak", "name": "플랙 대공포", "cat": "ballistic", "demo_kind": "flak", "role": "탄도 · 대공 요격"},
	{"id": "cosmoteer.missile_launcher", "cf_kind": "missile", "name": "고폭 미사일 (HE)", "cat": "missile", "demo_kind": "missile", "role": "유도 · 가속 · 광역"},
	{"id": "cosmoteer.missile_launcher", "cf_kind": "missile", "name": "EMP 미사일", "cat": "missile", "demo_kind": "missile_emp", "role": "유도 · 방어막 5배"},
	{"id": "cosmoteer.missile_launcher", "cf_kind": "missile", "name": "핵 미사일", "cat": "missile", "demo_kind": "missile_nuke", "role": "유도 · 초광역 폭발"},
	{"id": "cosmoteer.missile_launcher", "cf_kind": "mini_missile", "name": "기뢰 발사기", "cat": "missile", "demo_kind": "mine", "role": "근접 기폭 · 광역"},
	{"id": "cosmoteer.point_defense", "cf_kind": "cosmo_pd", "name": "대공 포탑 (PD)", "cat": "utility", "demo_kind": "pd", "role": "자동 미사일 요격"},
	{"id": "cosmoteer.tractor_beam_emitter", "cf_kind": "cosmo_tractor_beam", "name": "트랙터 빔", "cat": "utility", "demo_kind": "tractor", "role": "적함 제어 · 인력 빔"},
	{"id": "cosmoteer.mining_laser_small", "cf_kind": "cosmo_mining_laser", "name": "채굴 레이저", "cat": "utility", "demo_kind": "mining", "role": "소행성 채굴 빔"},
]

static var _catalog_cache: Dictionary = {}
static var _rules_cache: Dictionary = {}
static var _dll_cache: Dictionary = {}
static var _roster_cache: Array[Dictionary] = []
static var _overrides_loaded := false
static var weapon_overrides: Dictionary = {} # key = demo_kind -> Dictionary
static var cf_kind_overrides: Dictionary = {} # key = cf_kind -> Dictionary (ratios + extra)

static func get_catalog() -> Dictionary:
	if _catalog_cache.is_empty() and FileAccess.file_exists(CATALOG_PATH):
		var parsed: Variant = JSON.parse_string(FileAccess.get_file_as_string(CATALOG_PATH))
		if parsed is Dictionary:
			_catalog_cache = parsed
	return _catalog_cache

static func get_extracted_rules() -> Dictionary:
	if _rules_cache.is_empty() and FileAccess.file_exists(EXTRACTED_RULES_PATH):
		var parsed: Variant = JSON.parse_string(FileAccess.get_file_as_string(EXTRACTED_RULES_PATH))
		if parsed is Dictionary:
			_rules_cache = parsed
	return _rules_cache

static func get_dll_mechanics() -> Dictionary:
	if _dll_cache.is_empty() and FileAccess.file_exists(DLL_MECHANICS_PATH):
		var parsed: Variant = JSON.parse_string(FileAccess.get_file_as_string(DLL_MECHANICS_PATH))
		if parsed is Dictionary:
			_dll_cache = parsed
	return _dll_cache

static func projectile_penetration(demo_kind: String) -> float:
	var projs: Dictionary = get_dll_mechanics().get("penetration", {}).get("projectiles", {})
	return float(projs.get(demo_kind, 0.0))

static func missile_acceleration(demo_kind: String) -> float:
	var cfg: Dictionary = get_dll_mechanics().get("bullet_acceleration", {})
	return float(cfg.get(demo_kind, 0.0))

static func missile_launch_speed_factor() -> float:
	var cfg: Dictionary = get_dll_mechanics().get("bullet_acceleration", {})
	return float(cfg.get("launch_speed_factor", 0.45))

static func missile_warhead_profile(mode: String) -> Dictionary:
	var shots: Dictionary = get_extracted_rules().get("shots", {})
	match mode:
		"emp":
			var emp: Dictionary = shots.get("missile_emp", {})
			return {"range": minf(480.0, float(emp.get("range", 420.0))), "speed": 195.0, "damage": 400.0, "shield_damage_mult": 5.0, "aoe_radius": minf(12.0, float(emp.get("aoe_radius", 18.0)) * 0.5), "ignite": 0.0}
		"nuke":
			var nk: Dictionary = shots.get("missile_nuke", {})
			return {"range": minf(480.0, float(nk.get("range", 250.0))), "speed": 150.0, "damage": 5200.0, "shield_damage_mult": 1.6, "aoe_radius": minf(10.5, float(nk.get("aoe_radius", 10.0)) * 0.8), "ignite": 0.95}
		"mine":
			var mn: Dictionary = shots.get("mine", {})
			return {"range": maxf(240.0, float(mn.get("range", 150.0)) * 1.6), "speed": 72.0, "damage": 3400.0, "shield_damage_mult": 1.25, "aoe_radius": 7.0, "ignite": 0.70}
		_:
			return {"range": 380.0, "speed": 185.0, "damage": 1800.0, "shield_damage_mult": 1.0, "aoe_radius": 4.2, "ignite": 0.55}

static func get_roster() -> Array[Dictionary]:
	ensure_overrides_loaded()
	if not _roster_cache.is_empty():
		return _roster_cache
	var catalog_by_id := {}
	for p in get_catalog().get("parts", []):
		if p is Dictionary and p.has("id"):
			catalog_by_id[str(p.id)] = p
	var rules := get_extracted_rules()
	var part_specs: Dictionary = rules.get("part_specs", {})
	var shots: Dictionary = rules.get("shots", {})
	var recoil_cfg: Dictionary = get_dll_mechanics().get("weapon_recoil", {})

	for it in ROSTER_ITEMS:
		var pid := str(it.id)
		var dk := str(it.demo_kind)
		var st: Dictionary = {}
		if catalog_by_id.has(pid):
			var cstats: Variant = (catalog_by_id[pid] as Dictionary).get("stats", {})
			if cstats is Dictionary:
				st = (cstats as Dictionary).duplicate(true)
		if EXTRA_STATS.has(pid):
			for ek in EXTRA_STATS[pid]:
				if not st.has(ek):
					st[ek] = EXTRA_STATS[pid][ek]
		var pspec: Dictionary = part_specs.get(pid, {})
		if not pspec.is_empty():
			if pspec.has("firing_arc_deg") and pid in ["cosmoteer.cannon_deck", "cosmoteer.cannon_large"]:
				st["firing_arc_deg"] = float(pspec.firing_arc_deg)
			var shot_key := str(st.get("shot_id", pspec.get("shot_id", "")))
			if not shot_key.is_empty() and shots.has(shot_key):
				var sh: Dictionary = shots[shot_key]
				if float(sh.get("range", 0.0)) > 20.0 and pid in ["cosmoteer.cannon_deck", "cosmoteer.cannon_large", "cosmoteer.ion_beam_emitter"]:
					st["range"] = minf(480.0, float(sh.range))
				if float(sh.get("aoe_radius", 0.0)) > 0.0 and not st.has("aoe_radius"):
					st["aoe_radius"] = float(sh.aoe_radius)

		var base := {
			"damage": float(st.get("beam_dps", st.get("damage", st.get("pd_damage", 500.0)))),
			"fire_interval": float(st.get("fire_interval", st.get("pd_fire_interval", 0.9))),
			"projectile_speed": float(st.get("projectile_speed", 360.0)),
			"range": clampf(float(st.get("range", st.get("pd_range", st.get("tractor_range", 240.0)))), 60.0, 500.0),
			"aoe_radius": float(st.get("aoe_radius", 0.0)),
			"penetration": projectile_penetration(dk),
			"shield_damage_mult": float(st.get("shield_damage_mult", 1.0)),
			"ignite_intensity": float(st.get("ignite_intensity", 0.0)),
			"firing_arc_deg": float(st.get("firing_arc_deg", 120.0)),
			"recoil": float(recoil_cfg.get(dk, 8.0)),
			"target_distance": 150.0,
		}
		if dk in ["missile", "missile_emp", "missile_nuke", "mine"]:
			var mode := "he" if dk == "missile" else dk.trim_prefix("missile_")
			var wh := missile_warhead_profile(mode)
			base.damage = float(wh.damage)
			base.projectile_speed = float(wh.speed)
			base.range = clampf(float(wh.range), 60.0, 500.0)
			base.aoe_radius = float(wh.aoe_radius)
			base.shield_damage_mult = float(wh.shield_damage_mult)
			base.ignite_intensity = float(wh.ignite)
			base.target_distance = 175.0
		elif dk == "pd":
			base.damage = float(st.get("pd_damage", 140.0))
			base.fire_interval = float(st.get("pd_fire_interval", 0.18))
			base.range = 150.0
			base.target_distance = 135.0
		elif dk == "tractor":
			base.damage = 450.0
			base.range = float(st.get("tractor_range", 300.0))
			base.target_distance = 175.0
		elif dk == "mining":
			base.damage = float(st.get("beam_dps", 1400.0))
			base.range = float(st.get("range", 180.0))
			base.target_distance = 125.0

		var entry: Dictionary = it.duplicate(true)
		entry["defaults"] = base
		_roster_cache.append(entry)
	_rebuild_cf_overrides()
	return _roster_cache

static func ensure_overrides_loaded() -> void:
	if _overrides_loaded:
		return
	_overrides_loaded = true
	weapon_overrides.clear()
	if FileAccess.file_exists(OVERRIDE_SAVE_PATH):
		var parsed: Variant = JSON.parse_string(FileAccess.get_file_as_string(OVERRIDE_SAVE_PATH))
		if parsed is Dictionary:
			weapon_overrides = (parsed as Dictionary).duplicate(true)

static func save_overrides() -> void:
	ensure_overrides_loaded()
	var f := FileAccess.open(OVERRIDE_SAVE_PATH, FileAccess.WRITE)
	if f != null:
		f.store_string(JSON.stringify(weapon_overrides))

static func get_weapon_override(demo_kind: String) -> Dictionary:
	ensure_overrides_loaded()
	var ov: Variant = weapon_overrides.get(demo_kind, {})
	return (ov as Dictionary).duplicate(true) if ov is Dictionary else {}

static func set_weapon_override(demo_kind: String, tuned_params: Dictionary) -> void:
	ensure_overrides_loaded()
	if demo_kind.is_empty():
		return
	if tuned_params.is_empty():
		weapon_overrides.erase(demo_kind)
	else:
		weapon_overrides[demo_kind] = tuned_params.duplicate(true)
	_rebuild_cf_overrides()
	save_overrides()

static func clear_weapon_override(demo_kind: String = "") -> void:
	ensure_overrides_loaded()
	if demo_kind.is_empty():
		weapon_overrides.clear()
	else:
		weapon_overrides.erase(demo_kind)
	_rebuild_cf_overrides()
	save_overrides()

static func _rebuild_cf_overrides() -> void:
	cf_kind_overrides.clear()
	if _roster_cache.is_empty():
		return
	for entry in _roster_cache:
		var dk := str(entry.demo_kind)
		if not weapon_overrides.has(dk):
			continue
		var ov: Dictionary = weapon_overrides[dk]
		var defs: Dictionary = entry.defaults
		var cf_kind := str(entry.get("cf_kind", ""))
		if cf_kind.is_empty():
			continue
		cf_kind_overrides[cf_kind] = {
			"damage_mult": clampf(float(ov.get("damage", defs.damage)) / maxf(1.0, float(defs.damage)), 0.15, 10.0),
			"interval_mult": clampf(float(ov.get("fire_interval", defs.fire_interval)) / maxf(0.04, float(defs.fire_interval)), 0.15, 6.0),
			"speed_mult": clampf(float(ov.get("projectile_speed", defs.projectile_speed)) / maxf(10.0, float(defs.projectile_speed)), 0.2, 5.0),
			"range_mult": clampf(float(ov.get("range", defs.range)) / maxf(10.0, float(defs.range)), 0.25, 4.0),
			"shield_mult": float(ov.get("shield_damage_mult", defs.shield_damage_mult)),
			"penetration": float(ov.get("penetration", defs.penetration)),
			"aoe_radius": float(ov.get("aoe_radius", defs.aoe_radius)),
			"demo_kind": dk,
		}

static func apply_cf_override(cf_kind: String, base_spec: Dictionary) -> Dictionary:
	ensure_overrides_loaded()
	if _roster_cache.is_empty() and not weapon_overrides.is_empty():
		get_roster()
	var out := base_spec.duplicate(true)
	if not cf_kind_overrides.has(cf_kind):
		return out
	var ratio: Dictionary = cf_kind_overrides[cf_kind]
	if out.has("damage"):
		out["damage"] = maxf(1.0, float(out["damage"]) * float(ratio.get("damage_mult", 1.0)))
	if out.has("cooldown"):
		out["cooldown"] = clampf(float(out["cooldown"]) * float(ratio.get("interval_mult", 1.0)), 0.05, 8.0)
	if out.has("speed"):
		out["speed"] = clampf(float(out["speed"]) * float(ratio.get("speed_mult", 1.0)), 120.0, 2600.0)
	if out.has("life"):
		var r_m := float(ratio.get("range_mult", 1.0))
		var s_m := maxf(0.2, float(ratio.get("speed_mult", 1.0)))
		out["life"] = clampf(float(out["life"]) * (r_m / s_m), 0.35, 8.0)
	if out.has("range"):
		out["range"] = clampf(float(out["range"]) * float(ratio.get("range_mult", 1.0)), 250.0, 4800.0)
	out["shield_mult"] = float(ratio.get("shield_mult", out.get("shield_mult", 1.0)))
	out["penetration"] = float(ratio.get("penetration", out.get("penetration", 0.0)))
	out["aoe_radius"] = float(ratio.get("aoe_radius", out.get("aoe_radius", 0.0)))
	out["overridden"] = true
	return out
