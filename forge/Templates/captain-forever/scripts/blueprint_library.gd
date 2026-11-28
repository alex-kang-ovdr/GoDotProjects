class_name BlueprintLibrary
extends RefCounted

const PartDataScript = preload("res://scripts/part_data.gd")
const LIBRARY_PATH := "user://player_blueprints_library.json"
const SLOT_COUNT := 6

static var _slots: Dictionary = {}
static var _loaded := false
static var _capital_presets_cache: Array[Dictionary] = []

static func get_presets() -> Array[Dictionary]:
	var base_presets: Array[Dictionary] = [
		{
			"id": "starter",
			"name": "초기 호위함 (STARTER)",
			"desc": "기본 균형형 15파트 함선",
			"diagonal_45": false,
			"parts": [
				{"kind": "core", "x": 0, "y": 0, "turn": 0},
				{"kind": "armor", "x": 1, "y": 0, "turn": 0},
				{"kind": "laser", "x": 0, "y": -1, "turn": 0},
				{"kind": "laser", "x": 0, "y": 1, "turn": 0},
				{"kind": "thruster", "x": -1, "y": -1, "turn": 0},
				{"kind": "thruster", "x": -1, "y": 1, "turn": 0},
				{"kind": "battery", "x": -1, "y": 0, "turn": 0},
				{"kind": "mini_missile_launcher", "x": 1, "y": -1, "turn": 0},
				{"kind": "mini_missile_launcher", "x": 1, "y": 1, "turn": 0},
				{"kind": "rcs_thruster", "x": 0, "y": -2, "turn": 0},
				{"kind": "rcs_thruster", "x": 0, "y": 2, "turn": 0},
				{"kind": "shield_generator", "x": 2, "y": 0, "turn": 0},
				{"kind": "reverse_thruster", "x": 2, "y": -1, "turn": 0},
				{"kind": "reverse_thruster", "x": 2, "y": 1, "turn": 0},
				{"kind": "ammo_bay", "x": 3, "y": 0, "turn": 0},
			],
		},
		{
			"id": "laser_destroyer",
			"name": "레이저 구축함 (COSMO LASER)",
			"desc": "대형 레이저 x2 · 디스럽터 x2 · 소형 방어막",
			"diagonal_45": false,
			"parts": [
				{"kind": "core", "x": 0, "y": 0, "turn": 0},
				{"kind": "cosmo_armor", "x": 1, "y": 0, "turn": 0},
				{"kind": "cosmo_shield_small", "x": 2, "y": 0, "turn": 0},
				{"kind": "cosmo_armor_wedge", "x": 4, "y": 0, "turn": 0},
				{"kind": "cosmo_heavy_laser", "x": 1, "y": -1, "turn": 0},
				{"kind": "cosmo_heavy_laser", "x": 1, "y": 1, "turn": 0},
				{"kind": "cosmo_disruptor", "x": 3, "y": -1, "turn": 0},
				{"kind": "cosmo_disruptor", "x": 3, "y": 1, "turn": 0},
				{"kind": "cosmo_armor", "x": 0, "y": -1, "turn": 0},
				{"kind": "cosmo_armor", "x": 0, "y": 1, "turn": 0},
				{"kind": "cosmo_pd", "x": 0, "y": -2, "turn": 0},
				{"kind": "cosmo_pd", "x": 0, "y": 2, "turn": 0},
				{"kind": "cosmo_power_storage", "x": -2, "y": 0, "turn": 0},
				{"kind": "cosmo_thruster_med", "x": -2, "y": -1, "turn": 0},
				{"kind": "cosmo_thruster_med", "x": -2, "y": 1, "turn": 0},
				{"kind": "cosmo_thruster_2way", "x": -1, "y": -2, "turn": 0},
				{"kind": "cosmo_thruster_2way", "x": -1, "y": 2, "turn": 0},
				{"kind": "reverse_thruster", "x": 2, "y": -2, "turn": 0},
				{"kind": "reverse_thruster", "x": 2, "y": 2, "turn": 0},
			],
		},
		{
			"id": "deck_cruiser",
			"name": "갑판포 순양함 (DECK CRUISER)",
			"desc": "갑판포 270° · 플랙 대공포 x2 · 원자로 · 부스트 추진",
			"diagonal_45": false,
			"parts": [
				{"kind": "core", "x": 0, "y": 0, "turn": 0},
				{"kind": "cosmo_armor", "x": 0, "y": -1, "turn": 0},
				{"kind": "cosmo_armor", "x": 0, "y": 1, "turn": 0},
				{"kind": "cosmo_armor", "x": 0, "y": -2, "turn": 0},
				{"kind": "cosmo_armor", "x": 0, "y": 2, "turn": 0},
				{"kind": "cosmo_cannon_deck", "x": 1, "y": -1, "turn": 0},
				{"kind": "cosmo_armor_2x1", "x": 1, "y": 1, "turn": 0},
				{"kind": "cosmo_armor_2x1", "x": 1, "y": -2, "turn": 0},
				{"kind": "cosmo_shield_small", "x": 3, "y": 0, "turn": 0},
				{"kind": "cosmo_flak", "x": 3, "y": -1, "turn": 0},
				{"kind": "cosmo_flak", "x": 3, "y": 1, "turn": 0},
				{"kind": "cosmo_pd", "x": 2, "y": -3, "turn": 0},
				{"kind": "cosmo_pd", "x": 2, "y": 2, "turn": 0},
				{"kind": "cosmo_reactor_small", "x": -2, "y": -1, "turn": 0},
				{"kind": "cosmo_thruster_boost", "x": -2, "y": 1, "turn": 0},
				{"kind": "cosmo_thruster_boost", "x": -2, "y": -2, "turn": 0},
				{"kind": "cosmo_thruster_small", "x": -3, "y": 0, "turn": 0},
				{"kind": "cosmo_thruster_2way", "x": -1, "y": -3, "turn": 0},
				{"kind": "cosmo_thruster_2way", "x": -1, "y": 2, "turn": 0},
			],
		},
		{
			"id": "diamond_45",
			"name": "45° 다이아몬드 강습함 (45°)",
			"desc": "코스모티어 45° 대각선 대칭 · 이온빔 x2 · 중형 캐논 x2",
			"diagonal_45": true,
			"parts": [
				{"kind": "core", "x": 0, "y": 0, "turn": 0},
				{"kind": "cosmo_armor", "x": 1, "y": -1, "turn": 0},
				{"kind": "shield_generator", "x": 2, "y": -2, "turn": 0},
				{"kind": "battery", "x": -1, "y": 1, "turn": 0},
				{"kind": "cosmo_armor", "x": 1, "y": 0, "turn": 0},
				{"kind": "cosmo_armor", "x": 0, "y": -1, "turn": 0},
				{"kind": "cosmo_ion_beam", "x": 2, "y": -1, "turn": 0},
				{"kind": "cosmo_ion_beam", "x": 1, "y": -2, "turn": 3},
				{"kind": "cosmo_cannon_med", "x": 2, "y": 0, "turn": 0},
				{"kind": "cosmo_cannon_med", "x": 0, "y": -2, "turn": 3},
				{"kind": "cosmo_pd", "x": 1, "y": 1, "turn": 0},
				{"kind": "cosmo_pd", "x": -1, "y": -1, "turn": 3},
				{"kind": "cosmo_thruster_small", "x": -1, "y": 0, "turn": 0},
				{"kind": "cosmo_thruster_small", "x": 0, "y": 1, "turn": 3},
				{"kind": "cosmo_thruster_small", "x": -2, "y": 1, "turn": 0},
				{"kind": "cosmo_thruster_small", "x": -1, "y": 2, "turn": 3},
				{"kind": "cosmo_thruster_2way", "x": 1, "y": 2, "turn": 0},
				{"kind": "cosmo_thruster_2way", "x": -2, "y": -1, "turn": 3},
			],
		},
		{
			"id": "rail_sniper",
			"name": "레일건 저격함 (RAIL SNIPER)",
			"desc": "레일건 x4 · 체인건 x2 · 점방어 x2",
			"diagonal_45": false,
			"parts": [
				{"kind": "core", "x": 0, "y": 0, "turn": 0},
				{"kind": "cosmo_armor", "x": 1, "y": 0, "turn": 0},
				{"kind": "cosmo_armor", "x": 2, "y": 0, "turn": 0},
				{"kind": "cosmo_armor_wedge", "x": 3, "y": 0, "turn": 0},
				{"kind": "railgun", "x": 1, "y": -1, "turn": 0},
				{"kind": "railgun", "x": 1, "y": 1, "turn": 0},
				{"kind": "railgun", "x": 2, "y": -1, "turn": 0},
				{"kind": "railgun", "x": 2, "y": 1, "turn": 0},
				{"kind": "cosmo_chaingun", "x": 0, "y": -2, "turn": 0},
				{"kind": "cosmo_chaingun", "x": 0, "y": 2, "turn": 0},
				{"kind": "bullet_bay", "x": -1, "y": 0, "turn": 0},
				{"kind": "cosmo_thruster_med", "x": -2, "y": -1, "turn": 0},
				{"kind": "cosmo_thruster_med", "x": -2, "y": 1, "turn": 0},
				{"kind": "cosmo_thruster_2way", "x": -1, "y": -2, "turn": 0},
				{"kind": "cosmo_thruster_2way", "x": -1, "y": 2, "turn": 0},
				{"kind": "cosmo_pd", "x": 3, "y": -1, "turn": 0},
				{"kind": "cosmo_pd", "x": 3, "y": 1, "turn": 0},
			],
		},
		{
			"id": "oni_ftl_flagship",
			"name": "통합 관제 기함 (ONI·FTL·복도형)",
			"desc": "코스모티어 복도·컨베이어 망 + ONI 원자로·축전기 + FTL 승조원 의무실",
			"diagonal_45": false,
			"parts": [
				{"kind": "core", "x": 0, "y": 0, "turn": 0},
				{"kind": "cosmo_corridor", "x": 1, "y": 0, "turn": 0},
				{"kind": "cosmo_corridor", "x": 2, "y": 0, "turn": 0},
				{"kind": "cosmo_corridor", "x": 0, "y": -1, "turn": 0},
				{"kind": "cosmo_corridor", "x": 0, "y": 1, "turn": 0},
				{"kind": "cosmo_conveyor", "x": -1, "y": 0, "turn": 1},
				{"kind": "cosmo_reactor_small", "x": -3, "y": -1, "turn": 0},
				{"kind": "cosmo_power_storage", "x": -1, "y": -2, "turn": 0},
				{"kind": "cosmo_crew_quarters", "x": -1, "y": 2, "turn": 0},
				{"kind": "cosmo_heavy_laser", "x": 1, "y": -1, "turn": 0},
				{"kind": "cosmo_heavy_laser", "x": 1, "y": 1, "turn": 0},
				{"kind": "cosmo_shield_small", "x": 3, "y": 0, "turn": 0},
				{"kind": "cosmo_extinguisher", "x": -1, "y": -1, "turn": 0},
				{"kind": "cosmo_corridor", "x": -1, "y": 1, "turn": 0},
				{"kind": "cosmo_corridor", "x": -2, "y": 1, "turn": 0},
				{"kind": "cosmo_corridor", "x": -3, "y": 1, "turn": 0},
				{"kind": "ammo_bay", "x": -2, "y": 2, "turn": 0},
				{"kind": "missile_launcher", "x": -3, "y": 2, "turn": 0},
				{"kind": "cosmo_radiator", "x": -5, "y": 1, "turn": 0},
				{"kind": "cosmo_thruster_small", "x": -4, "y": -1, "turn": 0},
				{"kind": "cosmo_thruster_small", "x": -4, "y": 0, "turn": 0},
				{"kind": "cosmo_thruster_2way", "x": 1, "y": -2, "turn": 0},
				{"kind": "cosmo_thruster_2way", "x": 1, "y": 2, "turn": 0},
			],
			"cooling_pipes": [
				{"x": -4, "y": 1, "tier": 2}, {"x": -3, "y": 1, "tier": 2}, {"x": -3, "y": 0, "tier": 2},
				{"x": -3, "y": -1, "tier": 2}, {"x": -2, "y": -1, "tier": 2}, {"x": -2, "y": 0, "tier": 2},
				{"x": -1, "y": 0, "tier": 1}, {"x": 0, "y": 0, "tier": 1}, {"x": 1, "y": 0, "tier": 1},
				{"x": 1, "y": -1, "tier": 2}, {"x": 1, "y": 1, "tier": 2}, {"x": 0, "y": 1, "tier": 1},
				{"x": -1, "y": 1, "tier": 1}, {"x": -2, "y": 1, "tier": 1},
			],
			"bulkheads": [
				{"ax": 0, "ay": 0, "bx": 1, "by": 0, "kind": "door", "open": false, "locked": false},
				{"ax": 2, "ay": 0, "bx": 3, "by": 0, "kind": "door", "open": false, "locked": false},
				{"ax": -2, "ay": -1, "bx": -1, "by": -1, "kind": "firewall", "open": false, "locked": true},
				{"ax": -2, "ay": 0, "bx": -2, "by": 1, "kind": "firewall", "open": false, "locked": true},
			],
		},
		{
			"id": "colossal_dreadnought",
			"name": "초대형 드레드노트 (ONI·4회로·효율배선)",
			"desc": "59파트 초대형 기함 · 20kW 주포 간선 + 2kW 양현 중무장 + 1kW 함미 승조원실 (재료비·설치시간 ~70% 절감)",
			"diagonal_45": false,
			"parts": [
				# 1. 중앙 코어 & 함수 고압 주포/대형 방어막 (회로 1: 20kW)
				{"kind": "core", "x": 0, "y": 0, "turn": 0},
				{"kind": "cosmo_conveyor", "x": 1, "y": 0, "turn": 1},
				{"kind": "cosmo_corridor", "x": 2, "y": 0, "turn": 0},
				{"kind": "cosmo_conveyor", "x": 3, "y": 0, "turn": 1},
				{"kind": "cosmo_corridor", "x": 4, "y": 0, "turn": 0},
				{"kind": "cosmo_corridor", "x": 5, "y": 0, "turn": 0},
				{"kind": "cosmo_armor_wedge", "x": 6, "y": 0, "turn": 0},
				{"kind": "cosmo_reactor_large", "x": -3, "y": -1, "turn": 0},
				{"kind": "cosmo_power_storage", "x": -2, "y": -2, "turn": 0},
				{"kind": "battery", "x": 1, "y": -1, "turn": 0},
				{"kind": "battery", "x": 1, "y": 1, "turn": 0},
				{"kind": "oni_cooler", "x": 1, "y": -2, "turn": 0},
				{"kind": "bullet_bay", "x": 1, "y": 2, "turn": 0},
				{"kind": "cosmo_radiator", "x": -2, "y": 2, "turn": 0},
				{"kind": "cosmo_corridor", "x": 2, "y": -1, "turn": 0},
				{"kind": "cosmo_corridor", "x": 2, "y": 1, "turn": 0},
				{"kind": "machine_gun", "x": 3, "y": -1, "turn": 0},
				{"kind": "missile_launcher", "x": 3, "y": 1, "turn": 0},
				{"kind": "cosmo_ion_beam", "x": 2, "y": -2, "turn": 0},
				{"kind": "cosmo_ion_beam", "x": 2, "y": 2, "turn": 0},
				{"kind": "cosmo_shield_large", "x": 4, "y": -2, "turn": 0},
				{"kind": "cosmo_shield_large", "x": 4, "y": 1, "turn": 0},
				{"kind": "cosmo_armor", "x": 6, "y": -1, "turn": 0},
				{"kind": "cosmo_armor", "x": 6, "y": 1, "turn": 0},
				# 2. 좌현 중무장 독립 구역 (회로 2: 2kW 전도성 전선)
				{"kind": "cosmo_corridor", "x": 0, "y": -1, "turn": 0},
				{"kind": "cosmo_corridor", "x": 0, "y": -2, "turn": 0},
				{"kind": "cosmo_corridor", "x": 0, "y": -3, "turn": 0},
				{"kind": "cosmo_corridor", "x": 1, "y": -3, "turn": 0},
				{"kind": "cosmo_corridor", "x": 2, "y": -3, "turn": 0},
				{"kind": "cosmo_reactor_med", "x": -3, "y": -4, "turn": 0},
				{"kind": "cosmo_corridor", "x": -1, "y": -4, "turn": 0},
				{"kind": "cosmo_extinguisher", "x": 0, "y": -4, "turn": 0},
				{"kind": "cosmo_heavy_laser", "x": 1, "y": -4, "turn": 0},
				{"kind": "cosmo_heavy_laser", "x": 3, "y": -4, "turn": 0},
				{"kind": "cosmo_disruptor", "x": 3, "y": -3, "turn": 0},
				{"kind": "cosmo_armor_wedge", "x": 4, "y": -3, "turn": 0},
				{"kind": "cosmo_thruster_small", "x": -4, "y": -3, "turn": 0},
				{"kind": "cosmo_thruster_small", "x": -4, "y": -4, "turn": 0},
				{"kind": "cosmo_armor_2x1", "x": 1, "y": -5, "turn": 0},
				{"kind": "cosmo_armor_2x1", "x": 3, "y": -5, "turn": 0},
				# 3. 우현 중무장 독립 구역 (회로 3: 2kW 전도성 전선)
				{"kind": "cosmo_corridor", "x": 0, "y": 1, "turn": 0},
				{"kind": "cosmo_corridor", "x": 0, "y": 2, "turn": 0},
				{"kind": "cosmo_corridor", "x": 0, "y": 3, "turn": 0},
				{"kind": "cosmo_corridor", "x": 1, "y": 3, "turn": 0},
				{"kind": "cosmo_corridor", "x": 2, "y": 3, "turn": 0},
				{"kind": "cosmo_reactor_med", "x": -3, "y": 3, "turn": 0},
				{"kind": "cosmo_corridor", "x": -1, "y": 4, "turn": 0},
				{"kind": "cosmo_extinguisher", "x": 0, "y": 4, "turn": 0},
				{"kind": "cosmo_heavy_laser", "x": 1, "y": 4, "turn": 0},
				{"kind": "cosmo_heavy_laser", "x": 3, "y": 4, "turn": 0},
				{"kind": "cosmo_disruptor", "x": 3, "y": 3, "turn": 0},
				{"kind": "cosmo_armor_wedge", "x": 4, "y": 3, "turn": 0},
				{"kind": "cosmo_thruster_small", "x": -4, "y": 3, "turn": 0},
				{"kind": "cosmo_thruster_small", "x": -4, "y": 4, "turn": 0},
				{"kind": "cosmo_armor_2x1", "x": 1, "y": 5, "turn": 0},
				{"kind": "cosmo_armor_2x1", "x": 3, "y": 5, "turn": 0},
				# 4. 함미 복도 루프 & 승조원 의무실/보조 추진 (회로 4: 1kW 일반 전선)
				{"kind": "cosmo_corridor", "x": -1, "y": 1, "turn": 0},
				{"kind": "cosmo_corridor", "x": -2, "y": 1, "turn": 0},
				{"kind": "cosmo_corridor", "x": -3, "y": 1, "turn": 0},
				{"kind": "cosmo_corridor", "x": -4, "y": 1, "turn": 0},
				{"kind": "cosmo_corridor", "x": -4, "y": 0, "turn": 0},
				{"kind": "cosmo_corridor", "x": -4, "y": -1, "turn": 0},
				{"kind": "cosmo_corridor", "x": -4, "y": -2, "turn": 0},
				{"kind": "ammo_bay", "x": -4, "y": 2, "turn": 0},
				{"kind": "cosmo_reactor_small", "x": -6, "y": -1, "turn": 0},
				{"kind": "cosmo_crew_quarters", "x": -6, "y": -2, "turn": 0},
				{"kind": "cosmo_crew_quarters", "x": -6, "y": 1, "turn": 0},
				{"kind": "cosmo_pd", "x": -6, "y": 2, "turn": 0},
				{"kind": "cosmo_thruster_small", "x": -7, "y": -1, "turn": 0},
				{"kind": "cosmo_thruster_small", "x": -7, "y": 0, "turn": 0},
				{"kind": "cosmo_armor", "x": -5, "y": 2, "turn": 0},
				{"kind": "cosmo_armor_wedge", "x": -7, "y": -2, "turn": 0},
				{"kind": "cosmo_armor_wedge", "x": -7, "y": 1, "turn": 0},
			],
			"wires": [
				# 회로 1 (20kW 고압 간선 · 3560W 주포/대형 방어막 구간만 최소 포설)
				{"x": -1, "y": -2, "tier": 3}, {"x": -1, "y": -1, "tier": 3}, {"x": -1, "y": 0, "tier": 3},
				{"x": 0, "y": 0, "tier": 3}, {"x": 1, "y": 0, "tier": 3}, {"x": 1, "y": -1, "tier": 3}, {"x": 1, "y": -2, "tier": 3}, {"x": 1, "y": 1, "tier": 3},
				{"x": 2, "y": 0, "tier": 3}, {"x": 2, "y": -1, "tier": 3}, {"x": 2, "y": -2, "tier": 3},
				{"x": 2, "y": 1, "tier": 3}, {"x": 2, "y": 2, "tier": 3},
				{"x": 3, "y": 0, "tier": 3}, {"x": 4, "y": 0, "tier": 3}, {"x": 4, "y": -1, "tier": 3}, {"x": 4, "y": 1, "tier": 3},
				# 회로 2 (2kW 전도성 전선 · 좌현 1600W 독립 회로)
				{"x": -4, "y": -4, "tier": 2}, {"x": -4, "y": -3, "tier": 2}, {"x": -3, "y": -4, "tier": 2},
				{"x": -2, "y": -4, "tier": 2}, {"x": -1, "y": -4, "tier": 2}, {"x": 0, "y": -4, "tier": 2},
				{"x": 1, "y": -4, "tier": 2}, {"x": 2, "y": -4, "tier": 2}, {"x": 3, "y": -4, "tier": 2}, {"x": 3, "y": -3, "tier": 2},
				# 회로 3 (2kW 전도성 전선 · 우현 1600W 독립 회로)
				{"x": -4, "y": 4, "tier": 2}, {"x": -4, "y": 3, "tier": 2}, {"x": -3, "y": 4, "tier": 2},
				{"x": -2, "y": 4, "tier": 2}, {"x": -1, "y": 4, "tier": 2}, {"x": 0, "y": 4, "tier": 2},
				{"x": 1, "y": 4, "tier": 2}, {"x": 2, "y": 4, "tier": 2}, {"x": 3, "y": 4, "tier": 2}, {"x": 3, "y": 3, "tier": 2},
				# 회로 4 (1kW 일반 전선 · 함미 780W 승조원/의무실/보조추진 초저비용 회로)
				{"x": -7, "y": -1, "tier": 1}, {"x": -6, "y": -1, "tier": 1}, {"x": -6, "y": -2, "tier": 1},
				{"x": -6, "y": 0, "tier": 1}, {"x": -7, "y": 0, "tier": 1}, {"x": -6, "y": 1, "tier": 1}, {"x": -6, "y": 2, "tier": 1},
			],
			"cooling_pipes": [
				# ONI 폐회로 액체 냉각 루프: 액체 냉각기(1,-2) -> 양현 이온빔 -> 방열 라디에이터(-2,2) -> 대형 원자로(-2,0..-1,-1) -> 코어 -> 순환!
				{"x": 1, "y": -2, "tier": 2}, {"x": 2, "y": -2, "tier": 2}, {"x": 2, "y": -1, "tier": 1},
				{"x": 2, "y": 0, "tier": 1}, {"x": 2, "y": 1, "tier": 1}, {"x": 2, "y": 2, "tier": 2},
				{"x": 1, "y": 2, "tier": 1}, {"x": 0, "y": 2, "tier": 1}, {"x": -1, "y": 2, "tier": 2},
				{"x": -2, "y": 2, "tier": 2}, {"x": -2, "y": 1, "tier": 1}, {"x": -2, "y": 0, "tier": 2},
				{"x": -2, "y": -1, "tier": 2}, {"x": -1, "y": -1, "tier": 2}, {"x": -1, "y": 0, "tier": 2},
				{"x": 0, "y": 0, "tier": 2}, {"x": 0, "y": -1, "tier": 1}, {"x": 0, "y": -2, "tier": 1},
			],
			"bulkheads": [
				# 대형 원자로 외벽 방화·폭발 보강벽 (Firewall)
				{"ax": -2, "ay": -1, "bx": -2, "by": -2, "kind": "firewall", "open": false, "locked": true},
				{"ax": -1, "ay": -1, "bx": -1, "by": -2, "kind": "firewall", "open": false, "locked": true},
				{"ax": -3, "ay": 0, "bx": -3, "by": 1, "kind": "firewall", "open": false, "locked": true},
				{"ax": -2, "ay": 0, "bx": -2, "by": 1, "kind": "firewall", "open": false, "locked": true},
				{"ax": -1, "ay": 0, "bx": -1, "by": 1, "kind": "firewall", "open": false, "locked": true},
				# 좌·우현 날개 구획 기밀·방화 격벽 라인 (복도 해치만 통과 허용, 생화학 기체·화염 완전 차단!)
				{"ax": -2, "ay": -2, "bx": -2, "by": -3, "kind": "firewall", "open": false, "locked": true},
				{"ax": 1, "ay": -2, "bx": 1, "by": -3, "kind": "firewall", "open": false, "locked": true},
				{"ax": 2, "ay": -2, "bx": 2, "by": -3, "kind": "firewall", "open": false, "locked": true},
				{"ax": 3, "ay": -2, "bx": 3, "by": -3, "kind": "firewall", "open": false, "locked": true},
				{"ax": 4, "ay": -2, "bx": 4, "by": -3, "kind": "firewall", "open": false, "locked": true},
				{"ax": -2, "ay": 2, "bx": -2, "by": 3, "kind": "firewall", "open": false, "locked": true},
				{"ax": -1, "ay": 2, "bx": -1, "by": 3, "kind": "firewall", "open": false, "locked": true},
				{"ax": 1, "ay": 2, "bx": 1, "by": 3, "kind": "firewall", "open": false, "locked": true},
				{"ax": 2, "ay": 2, "bx": 2, "by": 3, "kind": "firewall", "open": false, "locked": true},
				{"ax": 3, "ay": 2, "bx": 3, "by": 3, "kind": "firewall", "open": false, "locked": true},
				{"ax": 4, "ay": 2, "bx": 4, "by": 3, "kind": "firewall", "open": false, "locked": true},
				# 핵심 복도 기체·침투 통제 격벽 해치 (Blast Doors)
				{"ax": 0, "ay": 0, "bx": 1, "by": 0, "kind": "door", "open": false, "locked": false},
				{"ax": 0, "ay": -1, "bx": 0, "by": -2, "kind": "door", "open": false, "locked": false},
				{"ax": 0, "ay": -2, "bx": 0, "by": -3, "kind": "door", "open": false, "locked": false},
				{"ax": 0, "ay": 1, "bx": 0, "by": 2, "kind": "door", "open": false, "locked": false},
				{"ax": 0, "ay": 2, "bx": 0, "by": 3, "kind": "door", "open": false, "locked": false},
				{"ax": -3, "ay": 1, "bx": -4, "by": 1, "kind": "door", "open": false, "locked": false},
			],
		},
	]
	base_presets.append_array(_get_extra_capital_presets())
	return base_presets

static func _try_place_part(parts_out: Array[Dictionary], occ: Dictionary, kind: String, cell: Vector2i, turn: int = 0) -> bool:
	var probe := PartDataScript.new(0, kind, cell, turn)
	var pcells := probe.cells()
	for c in pcells:
		if occ.has(c):
			return false
	if not occ.is_empty():
		var touches := false
		for c in pcells:
			for d in [Vector2i.RIGHT, Vector2i.LEFT, Vector2i.DOWN, Vector2i.UP]:
				if occ.has(c + d):
					touches = true
					break
			if touches:
				break
		if not touches:
			return false
	parts_out.append({"kind": kind, "x": cell.x, "y": cell.y, "turn": posmod(turn, 4)})
	for c in pcells:
		occ[c] = kind
	return true

static func _generate_capital_preset(cfg: Dictionary) -> Dictionary:
	var parts_out: Array[Dictionary] = []
	var occ: Dictionary = {}
	var bow_len := int(cfg.get("bow_len", 7))
	var stern_len := int(cfg.get("stern_len", 7))
	var wing_span := int(cfg.get("wing_span", 5))
	var is_super := bool(cfg.get("super_15x", false))
	var main_wp := str(cfg.get("main_wp", "cosmo_heavy_laser"))
	var sec_wp := str(cfg.get("sec_wp", "missile_launcher"))
	var aux_wp := str(cfg.get("aux_wp", "cosmo_pd"))
	var depot_kind := str(cfg.get("depot", "ammo_bay"))
	var thruster_kind := str(cfg.get("thruster", "cosmo_thruster_small"))

	# 1. Core + Central Conveyor/Corridor Spine
	_try_place_part(parts_out, occ, "core", Vector2i.ZERO, 0)
	for x in range(1, bow_len + 1):
		var k := "cosmo_conveyor" if (x % 2 == 1 and x < bow_len) else "cosmo_corridor"
		_try_place_part(parts_out, occ, k, Vector2i(x, 0), 1 if k == "cosmo_conveyor" else 0)
	_try_place_part(parts_out, occ, "cosmo_armor_wedge", Vector2i(bow_len + 1, 0), 0)

	for x in range(-1, -stern_len - 1, -1):
		var k := "cosmo_conveyor" if (abs(x) % 2 == 1 and x > -stern_len) else "cosmo_corridor"
		_try_place_part(parts_out, occ, k, Vector2i(x, 0), 3 if k == "cosmo_conveyor" else 0)

	# 2. Cross-Corridor Ribs (x = 0, x = 3, x = -3, and extra ribs for 1.5x Leviathan/Behemoth!)
	var rib_xs: Array[int] = [0, 3, -3]
	if is_super:
		rib_xs = [0, 3, 6, -3, -7]
	for rx in rib_xs:
		for y in range(1, wing_span + 1):
			_try_place_part(parts_out, occ, "cosmo_corridor", Vector2i(rx, -y), 0)
			_try_place_part(parts_out, occ, "cosmo_corridor", Vector2i(rx, y), 0)

	# Wing longitudinal corridors along y = ±3 and (for 1.5x) y = ±6
	var wing_ys: Array[int] = [3]
	if is_super:
		wing_ys = [3, 6]
	for wy in wing_ys:
		for x in range(-stern_len + 2, bow_len - 1):
			_try_place_part(parts_out, occ, "cosmo_corridor", Vector2i(x, -wy), 0)
			_try_place_part(parts_out, occ, "cosmo_corridor", Vector2i(x, wy), 0)

	# 3. Heavy Reactors, Capacitors & ONI Liquid Coolers
	_try_place_part(parts_out, occ, "cosmo_reactor_large", Vector2i(-2, -2), 0)
	_try_place_part(parts_out, occ, "cosmo_reactor_med", Vector2i(-2, 1), 0)
	if is_super:
		_try_place_part(parts_out, occ, "cosmo_reactor_large", Vector2i(-6, -2), 0)
		_try_place_part(parts_out, occ, "cosmo_reactor_large", Vector2i(-6, 1), 0)
		_try_place_part(parts_out, occ, "cosmo_reactor_med", Vector2i(1, -5), 0)
		_try_place_part(parts_out, occ, "cosmo_reactor_med", Vector2i(1, 4), 0)
	else:
		_try_place_part(parts_out, occ, "cosmo_reactor_small", Vector2i(-5, -2), 0)
		_try_place_part(parts_out, occ, "cosmo_reactor_small", Vector2i(-5, 1), 0)

	for cx in [1, 4, -4, -8]:
		if abs(cx) <= bow_len:
			_try_place_part(parts_out, occ, "oni_cooler", Vector2i(cx, -1), 0)
			_try_place_part(parts_out, occ, "battery", Vector2i(cx, 1), 0)
			_try_place_part(parts_out, occ, depot_kind, Vector2i(cx, -2), 0)
			_try_place_part(parts_out, occ, depot_kind, Vector2i(cx, 2), 0)

	# 4. Forward & Wing Shields
	var shield_xs: Array[int] = [bow_len - 2, 1]
	if is_super:
		shield_xs = [bow_len - 2, bow_len - 5, 1]
	for sx in shield_xs:
		_try_place_part(parts_out, occ, "cosmo_shield_large", Vector2i(sx, -2), 0)
		_try_place_part(parts_out, occ, "cosmo_shield_large", Vector2i(sx, 1), 0)

	# 5. Primary & Secondary Weapon Batteries along Wing Decks
	for wy in wing_ys:
		var outer_y := wy + 1
		for wx in range(-stern_len + 3, bow_len - 1, 2):
			_try_place_part(parts_out, occ, main_wp, Vector2i(wx, -outer_y - 1), 0)
			_try_place_part(parts_out, occ, main_wp, Vector2i(wx, outer_y), 0)
		for sx in range(-stern_len + 2, bow_len, 1):
			_try_place_part(parts_out, occ, sec_wp, Vector2i(sx, -outer_y), 0)
			_try_place_part(parts_out, occ, sec_wp, Vector2i(sx, outer_y), 0)
			_try_place_part(parts_out, occ, aux_wp, Vector2i(sx, -wy + 1), 0)
			_try_place_part(parts_out, occ, aux_wp, Vector2i(sx, wy - 1), 0)

	# 6. Crew Quarters, Radiators, Extinguishers & Outer Wedge Armor
	for qx in range(-stern_len + 1, -1, 2):
		_try_place_part(parts_out, occ, "cosmo_crew_quarters", Vector2i(qx, -2), 0)
		_try_place_part(parts_out, occ, "cosmo_crew_quarters", Vector2i(qx, 2), 0)
		_try_place_part(parts_out, occ, "cosmo_radiator", Vector2i(qx, -4), 0)
		_try_place_part(parts_out, occ, "cosmo_radiator", Vector2i(qx, 4), 0)
		_try_place_part(parts_out, occ, "cosmo_extinguisher", Vector2i(qx, -1), 0)
		_try_place_part(parts_out, occ, "cosmo_extinguisher", Vector2i(qx, 1), 0)

	for wy in range(1, wing_span + 2):
		_try_place_part(parts_out, occ, "cosmo_armor_wedge", Vector2i(bow_len - (wy / 2), -wy), 0)
		_try_place_part(parts_out, occ, "cosmo_armor_wedge", Vector2i(bow_len - (wy / 2), wy), 0)

	# 7. Stern Propulsion Wall
	for ty in range(-wing_span, wing_span + 1):
		for tx in range(-stern_len, -stern_len - 3, -1):
			if _try_place_part(parts_out, occ, thruster_kind, Vector2i(tx, ty), 0):
				break

	# 8. Multi-Gauge ONI Wires (20kW center spine, 2kW mid wings, 1kW outer/stern) + Cooling Pipe Loop + Bulkheads
	var wires_out: Array[Dictionary] = []
	var pipes_out: Array[Dictionary] = []
	var bh_out: Array[Dictionary] = []
	for cell_k in occ.keys():
		var c: Vector2i = cell_k
		var pk := str(occ[c])
		if "armor" in pk or "wedge" in pk:
			continue
		var tier := 3 if abs(c.y) <= 2 else (2 if abs(c.y) <= 5 else 1)
		wires_out.append({"x": c.x, "y": c.y, "tier": tier})
		if abs(c.y) <= 2 and c.x >= -stern_len + 2 and c.x <= bow_len - 2 and (abs(c.y) == 1 or c.x % 3 == 0):
			pipes_out.append({"x": c.x, "y": c.y, "tier": 2 if "reactor" in pk or "cooler" in pk else 1})

	for rx in rib_xs:
		for by in [2, 5]:
			if occ.has(Vector2i(rx, -by)) and occ.has(Vector2i(rx, -by - 1)):
				bh_out.append({"ax": rx, "ay": -by, "bx": rx, "by": -by - 1, "kind": "door", "open": false, "locked": false})
			if occ.has(Vector2i(rx, by)) and occ.has(Vector2i(rx, by + 1)):
				bh_out.append({"ax": rx, "ay": by, "bx": rx, "by": by + 1, "kind": "door", "open": false, "locked": false})
	for fx in range(-6, 1):
		if occ.has(Vector2i(fx, 0)) and occ.has(Vector2i(fx, -1)) and "reactor" in str(occ[Vector2i(fx, -1)]):
			bh_out.append({"ax": fx, "ay": 0, "bx": fx, "by": -1, "kind": "firewall", "open": false, "locked": true})

	return {
		"id": str(cfg.id),
		"name": str(cfg.name),
		"desc": str(cfg.desc),
		"diagonal_45": false,
		"parts": parts_out,
		"wires": wires_out,
		"cooling_pipes": pipes_out,
		"bulkheads": bh_out,
	}

static func _get_extra_capital_presets() -> Array[Dictionary]:
	if not _capital_presets_cache.is_empty():
		return _capital_presets_cache
	_capital_presets_cache = [
		_generate_capital_preset({
			"id": "colossal_carrier_bastion",
			"name": "초대형 미사일 모함 (BASTION)",
			"desc": "다연장 미사일 발사대 · 미사일 탄약고 복도 수송망 · 점방어 요격망 · 대형 방어막",
			"bow_len": 7, "stern_len": 6, "wing_span": 4, "super_15x": false,
			"main_wp": "cosmo_flak", "sec_wp": "missile_launcher", "aux_wp": "cosmo_pd",
			"depot": "ammo_bay", "thruster": "cosmo_thruster_small",
		}),
		_generate_capital_preset({
			"id": "colossal_ion_cathedral",
			"name": "초대형 이온 프리즘함 (PRISM)",
			"desc": "이온 빔 집중 포열 · 공명 포탑 · ONI 다중 액체 냉각 루프 · 고압 전력 간선",
			"bow_len": 7, "stern_len": 6, "wing_span": 4, "super_15x": false,
			"main_wp": "cosmo_ion_beam", "sec_wp": "cosmo_disruptor", "aux_wp": "laser",
			"depot": "battery", "thruster": "cosmo_thruster_small",
		}),
		_generate_capital_preset({
			"id": "colossal_broadside_titan",
			"name": "초대형 갑판포 전열함 (TITAN)",
			"desc": "갑판포·중형캐논 포열 · 실탄 탄약고 승조원 보급망 · 중장갑 방화벽 격리",
			"bow_len": 7, "stern_len": 6, "wing_span": 4, "super_15x": false,
			"main_wp": "cosmo_cannon_med", "sec_wp": "machine_gun", "aux_wp": "cosmo_pd",
			"depot": "bullet_bay", "thruster": "cosmo_thruster_small",
		}),
		_generate_capital_preset({
			"id": "colossal_siege_ram",
			"name": "초대형 충각 강습모함 (JUGGERNAUT)",
			"desc": "다중 쐐기 충각 선수 · 레일건 저격진 · 부스트 강습 추진단 · 격벽 보강 선체",
			"bow_len": 8, "stern_len": 6, "wing_span": 4, "super_15x": false,
			"main_wp": "cosmo_heavy_laser", "sec_wp": "railgun", "aux_wp": "mini_missile_launcher",
			"depot": "bullet_bay", "thruster": "cosmo_thruster_small",
		}),
		_generate_capital_preset({
			"id": "super_leviathan_15x",
			"name": "1.5배 초거대 레비아탄 기함 (LEVIATHAN · 1.5x)",
			"desc": "1.5배 확장 초거대 주력함 · 대형원자로 다중회로 · 전함체 컨베이어망 · 이온·미사일 통합화력",
			"bow_len": 11, "stern_len": 10, "wing_span": 7, "super_15x": true,
			"main_wp": "cosmo_ion_beam", "sec_wp": "missile_launcher", "aux_wp": "cosmo_pd",
			"depot": "ammo_bay", "thruster": "cosmo_thruster_small",
		}),
		_generate_capital_preset({
			"id": "super_behemoth_15x",
			"name": "1.5배 초거대 베헤모스 요새함 (BEHEMOTH · 1.5x)",
			"desc": "1.5배 확장 초거대 이동요새 · 대형방어막 6기 · 레일건·중형캐논 포열 · 복수 ONI 냉각루프",
			"bow_len": 11, "stern_len": 10, "wing_span": 7, "super_15x": true,
			"main_wp": "cosmo_cannon_med", "sec_wp": "railgun", "aux_wp": "machine_gun",
			"depot": "bullet_bay", "thruster": "cosmo_thruster_small",
		}),
	]
	return _capital_presets_cache

static func _ensure_loaded() -> void:
	if _loaded:
		return
	_loaded = true
	_slots.clear()
	if not FileAccess.file_exists(LIBRARY_PATH):
		return
	var parsed: Variant = JSON.parse_string(FileAccess.get_file_as_string(LIBRARY_PATH))
	if parsed is Dictionary:
		_slots = (parsed as Dictionary).duplicate(true)

static func _save_disk() -> void:
	var f := FileAccess.open(LIBRARY_PATH, FileAccess.WRITE)
	if f != null:
		f.store_string(JSON.stringify(_slots))

static func slot_key(index: int) -> String:
	return "slot_%d" % clampi(index, 1, SLOT_COUNT)

static func list_slots() -> Array[Dictionary]:
	_ensure_loaded()
	var out: Array[Dictionary] = []
	for i in range(1, SLOT_COUNT + 1):
		var key := slot_key(i)
		var entry: Variant = _slots.get(key, null)
		if entry is Dictionary and (entry as Dictionary).has("parts"):
			var d: Dictionary = entry
			var parts_arr: Array = d.get("parts", [])
			out.append({
				"index": i,
				"key": key,
				"filled": true,
				"name": str(d.get("name", "도안 슬롯 %d" % i)),
				"diagonal_45": bool(d.get("diagonal_45", false)),
				"part_count": parts_arr.size(),
			})
		else:
			out.append({
				"index": i,
				"key": key,
				"filled": false,
				"name": "빈 슬롯 %d" % i,
				"diagonal_45": false,
				"part_count": 0,
			})
	return out

static func save_slot(index: int, display_name: String, model: ShipModel) -> Dictionary:
	_ensure_loaded()
	var key := slot_key(index)
	var clean_name := display_name.strip_edges()
	if clean_name.is_empty():
		clean_name = "내 함선 %d" % index
	var exported := model.export_blueprint()
	var payload := {
		"name": clean_name,
		"diagonal_45": model.diagonal_45,
		"parts": exported,
	}
	_slots[key] = payload
	_save_disk()
	return payload

static func load_slot(index: int) -> Dictionary:
	_ensure_loaded()
	var entry: Variant = _slots.get(slot_key(index), null)
	if entry is Dictionary:
		return (entry as Dictionary).duplicate(true)
	return {}

static func delete_slot(index: int) -> void:
	_ensure_loaded()
	_slots.erase(slot_key(index))
	_save_disk()

static func get_preset_by_id(preset_id: String) -> Dictionary:
	for p in get_presets():
		if str(p.get("id", "")) == preset_id:
			return p.duplicate(true)
	return {}

static func to_typed_blueprint(raw_parts: Array) -> Array[Dictionary]:
	var typed: Array[Dictionary] = []
	for item in raw_parts:
		if item is Dictionary and (item as Dictionary).has("kind"):
			typed.append((item as Dictionary).duplicate(true))
	return typed

static func to_wires_dict(raw_wires: Variant) -> Dictionary:
	var out: Dictionary = {}
	if raw_wires is Array:
		for item in raw_wires:
			if item is Dictionary and (item as Dictionary).has("x") and (item as Dictionary).has("y"):
				var d: Dictionary = item
				out[Vector2i(int(d.x), int(d.y))] = clampi(int(d.get("tier", 2)), 1, 3)
	elif raw_wires is Dictionary:
		for k in (raw_wires as Dictionary).keys():
			if k is Vector2i:
				out[k] = clampi(int((raw_wires as Dictionary)[k]), 1, 3)
	return out

static func to_cooling_pipes_dict(raw_pipes: Variant) -> Dictionary:
	var out: Dictionary = {}
	if raw_pipes is Array:
		for item in raw_pipes:
			if item is Dictionary and (item as Dictionary).has("x") and (item as Dictionary).has("y"):
				var d: Dictionary = item
				out[Vector2i(int(d.x), int(d.y))] = clampi(int(d.get("tier", 1)), 1, 2)
	elif raw_pipes is Dictionary:
		for k in (raw_pipes as Dictionary).keys():
			if k is Vector2i:
				out[k] = clampi(int((raw_pipes as Dictionary)[k]), 1, 2)
	return out

static func canonical_edge_key(a: Vector2i, b: Vector2i) -> String:
	if a.x < b.x or (a.x == b.x and a.y <= b.y):
		return "%d,%d:%d,%d" % [a.x, a.y, b.x, b.y]
	return "%d,%d:%d,%d" % [b.x, b.y, a.x, a.y]

static func to_bulkheads_dict(raw_bh: Variant) -> Dictionary:
	var out: Dictionary = {}
	if raw_bh is Array:
		for item in raw_bh:
			if item is Dictionary:
				var d: Dictionary = item
				var ca := Vector2i(int(d.get("ax", 0)), int(d.get("ay", 0)))
				var cb := Vector2i(int(d.get("bx", 1)), int(d.get("by", 0)))
				if abs(ca.x - cb.x) + abs(ca.y - cb.y) != 1:
					continue
				var knd := str(d.get("kind", "door"))
				var mhp := 220.0 if knd == "firewall" else 90.0
				var key := canonical_edge_key(ca, cb)
				out[key] = {
					"a": ca,
					"b": cb,
					"kind": knd,
					"open": false if knd == "firewall" else bool(d.get("open", false)),
					"locked": true if knd == "firewall" else bool(d.get("locked", false)),
					"hp": mhp,
					"max_hp": mhp,
				}
	elif raw_bh is Dictionary:
		for k in (raw_bh as Dictionary).keys():
			var v: Variant = (raw_bh as Dictionary)[k]
			if v is Dictionary:
				out[str(k)] = (v as Dictionary).duplicate(true)
	return out
