class_name PartCatalog
extends RefCounted

const BalanceData = preload("res://scripts/balance.gd")
const SAVE_PATH := "user://build_part_catalog_enabled.json"

const CATEGORIES := [
	{"id": "all", "label": "전체"},
	{"id": "weapon", "label": "무기"},
	{"id": "defense", "label": "장갑·방어"},
	{"id": "flight", "label": "추진"},
	{"id": "power", "label": "전력·열"},
	{"id": "utility", "label": "지원·제어"},
]

const ENTRIES := [
	# 무기 (Cosmoteer + 기본)
	{"kind": "cosmo_heavy_laser", "label": "대형 레이저 (COSMO)", "category": "weapon", "source": "Cosmoteer", "default_enabled": true},
	{"kind": "cosmo_disruptor", "label": "디스럽터 EMP", "category": "weapon", "source": "Cosmoteer", "default_enabled": true},
	{"kind": "cosmo_ion_beam", "label": "이온 빔 방사기", "category": "weapon", "source": "Cosmoteer", "default_enabled": true},
	{"kind": "cosmo_cannon_med", "label": "중형 캐논 (2x1)", "category": "weapon", "source": "Cosmoteer", "default_enabled": true},
	{"kind": "cosmo_cannon_large", "label": "대형 캐논 (2x2)", "category": "weapon", "source": "Cosmoteer", "default_enabled": true},
	{"kind": "cosmo_cannon_deck", "label": "갑판포 270°", "category": "weapon", "source": "Cosmoteer", "default_enabled": true},
	{"kind": "cosmo_chaingun", "label": "체인건 (연사)", "category": "weapon", "source": "Cosmoteer", "default_enabled": true},
	{"kind": "cosmo_flak", "label": "플랙 대공포", "category": "weapon", "source": "Cosmoteer", "default_enabled": true},
	{"kind": "cosmo_pd", "label": "점방어 포탑 (PD)", "category": "weapon", "source": "Cosmoteer", "default_enabled": true},
	{"kind": "cosmo_mining_laser", "label": "채굴 레이저", "category": "weapon", "source": "Cosmoteer", "default_enabled": true},
	{"kind": "cosmo_resonance_turret", "label": "공명 빔 포탑", "category": "weapon", "source": "Cosmoteer", "default_enabled": true},
	{"kind": "cosmo_tractor_beam", "label": "트랙터 빔 (2x2)", "category": "weapon", "source": "Cosmoteer", "default_enabled": true},
	{"kind": "laser", "label": "소형 레이저 (LZR)", "category": "weapon", "source": "Cosmoteer", "default_enabled": true},
	{"kind": "railgun", "label": "레일건 (RAIL)", "category": "weapon", "source": "Cosmoteer", "default_enabled": true},
	{"kind": "missile_launcher", "label": "미사일 발사대", "category": "weapon", "source": "Cosmoteer", "default_enabled": true},
	{"kind": "machine_gun", "label": "기관포 (MG)", "category": "weapon", "source": "기본", "default_enabled": true},
	{"kind": "mini_missile_launcher", "label": "소형 어뢰관", "category": "weapon", "source": "기본", "default_enabled": true},
	# 장갑·구조·방어
	{"kind": "cosmo_armor", "label": "코스모 장갑 (1x1)", "category": "defense", "source": "Cosmoteer", "default_enabled": true},
	{"kind": "cosmo_armor_2x1", "label": "코스모 장갑 (2x1)", "category": "defense", "source": "Cosmoteer", "default_enabled": true},
	{"kind": "cosmo_armor_wedge", "label": "코스모 쐐기 장갑", "category": "defense", "source": "Cosmoteer", "default_enabled": true},
	{"kind": "cosmo_structure", "label": "경량 구조체", "category": "defense", "source": "Cosmoteer", "default_enabled": true},
	{"kind": "cosmo_shield_small", "label": "소형 방어막 (COSMO)", "category": "defense", "source": "Cosmoteer", "default_enabled": true},
	{"kind": "cosmo_shield_large", "label": "대형 방어막 (COSMO)", "category": "defense", "source": "Cosmoteer", "default_enabled": true},
	{"kind": "armor", "label": "장갑판 (PLATE)", "category": "defense", "source": "기본", "default_enabled": true},
	{"kind": "block", "label": "선체 블록 (BLOCK)", "category": "defense", "source": "기본", "default_enabled": true},
	{"kind": "wedge", "label": "쐐기 장갑 (WEDGE)", "category": "defense", "source": "기본", "default_enabled": true},
	{"kind": "beam2", "label": "2칸 빔 (BEAM-2)", "category": "defense", "source": "기본", "default_enabled": true},
	{"kind": "beam3", "label": "3칸 빔 (BEAM-3)", "category": "defense", "source": "기본", "default_enabled": false},
	{"kind": "plate4", "label": "2x2 장갑 (PLATE-4)", "category": "defense", "source": "기본", "default_enabled": false},
	{"kind": "shield_generator", "label": "기본 방어막 생성기", "category": "defense", "source": "기본", "default_enabled": true},
	# 추진
	{"kind": "cosmo_thruster_small", "label": "소형 추진기 (COSMO)", "category": "flight", "source": "Cosmoteer", "default_enabled": true},
	{"kind": "cosmo_thruster_med", "label": "중형 추진기 (COSMO)", "category": "flight", "source": "Cosmoteer", "default_enabled": true},
	{"kind": "cosmo_thruster_large", "label": "대형 추진기 (COSMO)", "category": "flight", "source": "Cosmoteer", "default_enabled": true},
	{"kind": "cosmo_thruster_boost", "label": "부스트 추진기", "category": "flight", "source": "Cosmoteer", "default_enabled": true},
	{"kind": "cosmo_thruster_2way", "label": "2방향 자세제어", "category": "flight", "source": "Cosmoteer", "default_enabled": true},
	{"kind": "cosmo_engine_room", "label": "엔진룸 (2x2)", "category": "flight", "source": "Cosmoteer", "default_enabled": false},
	{"kind": "thruster", "label": "주 추진기 (DRIVE)", "category": "flight", "source": "기본", "default_enabled": true},
	{"kind": "reverse_thruster", "label": "역추진기 (REV)", "category": "flight", "source": "기본", "default_enabled": true},
	{"kind": "rcs_thruster", "label": "자세제어 (RCS)", "category": "flight", "source": "기본", "default_enabled": true},
	# 전력·열
	{"kind": "cosmo_reactor_small", "label": "소형 원자로", "category": "power", "source": "Cosmoteer", "default_enabled": true},
	{"kind": "cosmo_reactor_med", "label": "중형 원자로", "category": "power", "source": "Cosmoteer", "default_enabled": true},
	{"kind": "cosmo_reactor_large", "label": "대형 원자로 (3x2)", "category": "power", "source": "Cosmoteer", "default_enabled": true},
	{"kind": "cosmo_power_storage", "label": "전력 축전기", "category": "power", "source": "Cosmoteer", "default_enabled": true},
	{"kind": "oni_cooler", "label": "액체 냉각기 (ONI)", "category": "power", "source": "ONI", "default_enabled": true},
	{"kind": "cosmo_radiator", "label": "방열 라디에이터", "category": "power", "source": "Cosmoteer", "default_enabled": true},
	{"kind": "battery", "label": "배터리 (BATTERY)", "category": "power", "source": "기본", "default_enabled": true},
	# 지원·제어·통로
	{"kind": "cosmo_corridor", "label": "통로 복도 (1x1)", "category": "utility", "source": "Cosmoteer", "default_enabled": true},
	{"kind": "cosmo_conveyor", "label": "가속 컨베이어 (2배속)", "category": "utility", "source": "Cosmoteer", "default_enabled": true},
	{"kind": "cosmo_airlock", "label": "에어록 통로", "category": "utility", "source": "Cosmoteer", "default_enabled": true},
	{"kind": "cosmo_extinguisher", "label": "자동 소화 설비", "category": "utility", "source": "Cosmoteer", "default_enabled": true},
	{"kind": "cosmo_sensor_array", "label": "센서 어레이", "category": "utility", "source": "Cosmoteer", "default_enabled": true},
	{"kind": "cosmo_control_small", "label": "조종실 (2x2)", "category": "utility", "source": "Cosmoteer", "default_enabled": true},
	{"kind": "cosmo_crew_quarters", "label": "승무원 숙소·의무실", "category": "utility", "source": "Cosmoteer", "default_enabled": true},
	{"kind": "cosmo_storage", "label": "화물·탄약고 (2x2)", "category": "utility", "source": "Cosmoteer", "default_enabled": false},
	{"kind": "cosmo_hyperdrive", "label": "하이퍼드라이브", "category": "utility", "source": "Cosmoteer", "default_enabled": false},
	{"kind": "ammo_bay", "label": "미사일 탄약고", "category": "utility", "source": "기본", "default_enabled": true},
	{"kind": "bullet_bay", "label": "실탄 탄약고", "category": "utility", "source": "기본", "default_enabled": true},
]

static var _enabled_map: Dictionary = {}
static var _loaded := false

static func ensure_loaded() -> void:
	if _loaded:
		return
	_loaded = true
	_enabled_map.clear()
	for entry in ENTRIES:
		_enabled_map[str(entry.kind)] = bool(entry.default_enabled)
	if FileAccess.file_exists(SAVE_PATH):
		var parsed: Variant = JSON.parse_string(FileAccess.get_file_as_string(SAVE_PATH))
		if parsed is Dictionary:
			for k in (parsed as Dictionary).keys():
				var ks := str(k)
				if _enabled_map.has(ks):
					_enabled_map[ks] = bool((parsed as Dictionary)[k])

static func save_to_disk() -> void:
	ensure_loaded()
	var f := FileAccess.open(SAVE_PATH, FileAccess.WRITE)
	if f != null:
		f.store_string(JSON.stringify(_enabled_map))

static func is_enabled(kind: String) -> bool:
	ensure_loaded()
	return bool(_enabled_map.get(kind, true))

static func set_enabled(kind: String, enabled: bool) -> void:
	ensure_loaded()
	if not _enabled_map.has(kind):
		return
	_enabled_map[kind] = enabled
	save_to_disk()

static func toggle_enabled(kind: String) -> bool:
	var next_val := not is_enabled(kind)
	set_enabled(kind, next_val)
	return next_val

static func set_all_enabled(enabled: bool) -> void:
	ensure_loaded()
	for entry in ENTRIES:
		_enabled_map[str(entry.kind)] = enabled
	if not enabled and not ENTRIES.is_empty():
		_enabled_map[str(ENTRIES[0].kind)] = true
	save_to_disk()

static func reset_defaults() -> void:
	_loaded = true
	_enabled_map.clear()
	for entry in ENTRIES:
		_enabled_map[str(entry.kind)] = bool(entry.default_enabled)
	save_to_disk()

static func enabled_entries() -> Array[Dictionary]:
	ensure_loaded()
	var out: Array[Dictionary] = []
	for entry in ENTRIES:
		if is_enabled(str(entry.kind)):
			out.append(entry)
	if out.is_empty() and not ENTRIES.is_empty():
		out.append(ENTRIES[0])
	return out

static func filtered_entries(category: String = "all") -> Array[Dictionary]:
	ensure_loaded()
	var out: Array[Dictionary] = []
	for entry in ENTRIES:
		if category == "all" or str(entry.category) == category:
			out.append(entry)
	return out

static func enabled_count() -> int:
	ensure_loaded()
	var c := 0
	for entry in ENTRIES:
		if is_enabled(str(entry.kind)):
			c += 1
	return c

static func category_label(cat_id: String) -> String:
	for c in CATEGORIES:
		if str(c.id) == cat_id:
			return str(c.label)
	return cat_id

static func footprint_label(kind: String) -> String:
	var spec := BalanceData.module_spec(kind)
	var fp: Variant = spec.get("footprint", null)
	if not (fp is Array) or (fp as Array).is_empty():
		return "1x1"
	var max_x := 0
	var max_y := 0
	for v in fp:
		if v is Vector2i:
			max_x = maxi(max_x, (v as Vector2i).x)
			max_y = maxi(max_y, (v as Vector2i).y)
	return "%dx%d" % [max_x + 1, max_y + 1]

static func stat_summary(kind: String) -> String:
	var spec := BalanceData.module_spec(kind)
	var w := BalanceData.weapon_spec(kind)
	if not w.is_empty():
		var mark := " ★" if bool(w.get("overridden", false)) else ""
		return "DMG %.0f · ARC %.0f° · HP %.0f%s" % [
			float(w.get("damage", 0.0)),
			float(w.get("firing_arc_deg", 120.0)),
			float(spec.get("hp", 20.0)),
			mark,
		]
	var act := str(spec.get("actuator", ""))
	if not act.is_empty():
		return "추력 %.0f · HP %.0f" % [float(spec.get("force", 0.0)), float(spec.get("hp", 20.0))]
	var sh := int(spec.get("shield", 0))
	if sh > 0:
		return "방어막 +%d층 · HP %.0f" % [sh, float(spec.get("hp", 20.0))]
	var pwr := float(spec.get("power", 0.0))
	if pwr > 0.0:
		return "전력 +%.0f · HP %.0f" % [pwr, float(spec.get("hp", 20.0))]
	return "HP %.0f · 질량 %.1f" % [float(spec.get("hp", 20.0)), float(spec.get("mass", 1.0))]
