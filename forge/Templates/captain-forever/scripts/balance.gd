## 전 플랫폼 공통 밸런스 SSOT. 게임 규칙 수치는 이 파일에서만 조정한다.
class_name Balance
extends RefCounted

const CELL := 42.0
const DURABILITY_MULTIPLIER := 2.0
## 시나리오 M1 데이터 검증용 초기값. 체류 시간/30분 완주는 아직 미검증이다.
const SCENARIO := {"escape_charge_seconds": 5.0, "protect_duration_seconds": 120.0, "required_item_count": 1}
const PLAYER := {"core_hp": 400.0, "module_limit": 18, "salvage_range": 420.0, "pickup_click_radius": 72.0}
const NAVIGATION := {"arrival_radius": 54.0, "slow_radius": 250.0, "turn_gain": 2.0, "cruise_throttle": 1.0, "approach_throttle": 0.42}
const SHIELD := {"max_layers": 5, "base_recharge": 6.0, "min_recharge": 1.8, "generator_coverage_mass": 20.0}
const WEAPONS := {
	"laser": {"cooldown": 0.28, "damage": 7.0, "speed": 720.0, "life": 2.25, "heat": 11.0, "color": "ff92e8", "cosmo_id": "cosmoteer.laser_blaster_small", "firing_arc_deg": 200.0, "shot_sprite": "shot_laser_small"},
	"machine_gun": {"damage": 4.0, "speed": 760.0, "life": 1.725, "ammo_cost": 1, "color": "b9d8ff", "shot_sprite": "shot_chaingun"},
	"railgun": {"damage": 24.0, "speed": 1040.0, "life": 2.475, "ammo_cost": 4, "color": "d6b3ff", "cosmo_id": "cosmoteer.railgun_launcher", "firing_arc_deg": 32.0, "shot_sprite": "shot_railgun", "penetration": 15.0},
	"missile": {"cooldown": 0.72, "damage": 30.0, "speed": 460.0, "range": 1470.0, "life": 3.2, "ammo_cost": 2, "color": "ffbd78", "cosmo_id": "cosmoteer.missile_launcher", "firing_arc_deg": 360.0, "shot_sprite": "shot_missile_he"},
	"mini_missile": {"cooldown": 3.0, "damage": 12.0, "speed": 250.0, "lock_seconds": 2.0, "boost": 720.0, "max_speed": 860.0, "range":2175.0, "ammo_cost": 1, "color": "d7ed8e", "shot_sprite": "shot_mine"},
	# Cosmoteer 이식 무기 데이터 (catalog.json + combat_systems.gd 기반)
	"cosmo_heavy_laser": {"cooldown": 0.62, "damage": 22.0, "speed": 860.0, "life": 2.5, "heat": 16.0, "color": "ff5e9e", "cosmo_id": "cosmoteer.laser_blaster_large", "firing_arc_deg": 160.0, "shot_sprite": "shot_laser_large"},
	"cosmo_disruptor": {"cooldown": 0.48, "damage": 10.0, "speed": 760.0, "life": 2.2, "heat": 10.0, "shield_mult": 3.0, "color": "6ef2ff", "cosmo_id": "cosmoteer.disruptor", "firing_arc_deg": 180.0, "shot_sprite": "shot_disruptor"},
	"cosmo_ion_beam": {"cooldown": 0.55, "damage": 30.0, "speed": 1220.0, "life": 1.8, "heat": 18.0, "color": "5aff9d", "cosmo_id": "cosmoteer.ion_beam_emitter", "firing_arc_deg": 45.0, "shot_sprite": "shot_laser_large"},
	"cosmo_cannon_med": {"cooldown": 0.55, "damage": 18.0, "speed": 640.0, "life": 2.2, "heat": 12.0, "color": "ffd074", "cosmo_id": "cosmoteer.cannon_med", "firing_arc_deg": 130.0, "shot_sprite": "shot_bullet_large", "penetration": 5.0},
	"cosmo_cannon_large": {"cooldown": 0.85, "damage": 36.0, "speed": 560.0, "life": 2.4, "heat": 16.0, "color": "ff9b52", "cosmo_id": "cosmoteer.cannon_large", "firing_arc_deg": 110.0, "shot_sprite": "shot_bullet_large", "penetration": 7.0},
	"cosmo_cannon_deck": {"cooldown": 1.15, "damage": 56.0, "speed": 500.0, "life": 2.5, "heat": 22.0, "color": "ff7242", "cosmo_id": "cosmoteer.cannon_deck", "firing_arc_deg": 270.0, "shot_sprite": "shot_bullet_large", "penetration": 9.0},
	"cosmo_chaingun": {"cooldown": 0.16, "damage": 6.0, "speed": 840.0, "life": 1.9, "heat": 5.0, "color": "ffe885", "cosmo_id": "cosmoteer.chaingun", "firing_arc_deg": 110.0, "shot_sprite": "shot_chaingun"},
	"cosmo_flak": {"cooldown": 0.52, "damage": 16.0, "speed": 680.0, "life": 1.8, "heat": 11.0, "color": "ffa86e", "cosmo_id": "cosmoteer.flak_cannon_large", "firing_arc_deg": 100.0, "shot_sprite": "shot_bullet_large"},
	"cosmo_pd": {"cooldown": 0.22, "damage": 5.0, "speed": 920.0, "life": 1.4, "heat": 4.0, "color": "9ef8ff", "cosmo_id": "cosmoteer.point_defense", "firing_arc_deg": 220.0, "shot_sprite": "shot_laser_small"},
	"cosmo_mining_laser": {"cooldown": 0.34, "damage": 11.0, "speed": 960.0, "life": 1.4, "heat": 8.0, "color": "ffe066", "cosmo_id": "cosmoteer.mining_laser_small", "firing_arc_deg": 90.0, "shot_sprite": "shot_laser_small"},
	"cosmo_resonance_turret": {"cooldown": 0.78, "damage": 38.0, "speed": 1080.0, "life": 2.3, "heat": 19.0, "color": "b78cff", "cosmo_id": "cosmoteer.resonance_beam_turret", "firing_arc_deg": 260.0, "shot_sprite": "shot_laser_large"},
	"cosmo_tractor_beam": {"cooldown": 0.45, "damage": 9.0, "speed": 900.0, "life": 1.8, "heat": 9.0, "color": "6edcff", "cosmo_id": "cosmoteer.tractor_beam_emitter", "firing_arc_deg": 180.0, "shot_sprite": "shot_disruptor"},
}
const NPC_AI := {
	"state_tick_seconds": 0.066,
	"thrust_multiplier": 0.5,
	"weapon_range": 620.0,
	"contact_range": 560.0,
	"roam_radius": 460.0,
	"roam_arrival_radius": 70.0,
	"exclusion_grace_seconds": 5.0,
	"spawn_weights": {"roamer": 70, "aggressive": 20, "contact": 10},
	"archetypes": {
		"roamer": {"radar_range": 0.0, "contact": ""},
		"aggressive": {"radar_range": 760.0, "contact": ""},
		"contact_quest": {"radar_range": 0.0, "contact": "quest"},
		"contact_warning": {"radar_range": 0.0, "contact": "warning"},
		"boss": {"radar_range": 1200.0, "contact": ""}
	}
}
const GRAPPLE := {
	"max_range": 980.0,
	"hook_speed": 1600.0,
	"link_length": 36.0,
	"max_links": 30,
	"link_mass": 0.16,
	"link_damp": 6.0,
	"tension_slack": 3.0,
	"tension_stiffness": 1800.0,
	"tension_damping": 240.0,
	"max_tension_force": 126000.0,
	"break_slack": 1260.0,
	"hp": 288.0,
	"hit_radius": 12.0,
	"tow_min_mass_ratio": 0.55,
	"tow_dominant_mass_ratio": 1.15,
	"tow_dominant_thrust_ratio": 1.15,
	"oscillation_flip_stress": 0.11,
	"oscillation_tension_rate": 0.48,
	"oscillation_decay_rate": 1.2,
	"oscillation_tension_threshold": 900.0,
	"position_correction_max": 42.0,
	"tension_damp_rate": 5.0,
	"max_stretch_ratio": 1.2,
	"max_stretch_hp_drain_per_sec": 36.0,
	"elastic_pull_stiffness": 10.0,
	"reel_force": 12000.0,
	"reel_speed": 220.0
}
const SONAR := {
	"max_range": 2600.0,
	"wave_speed": 1150.0,
	"reveal_duration": 6.5,
	"cooldown": 3.0,
	"band_width": 180.0,
	"mutual_detect_range": 2600.0
}
const WORLD := {
	"width": 24000.0, "height": 16000.0,
	"stations": [
		{"id":"kepler", "name":"KEPLER REPAIR DOCK", "position":Vector2(2100, -680), "upgrade":"HULL +30 · FULL REPAIR"},
		{"id":"lyra", "name":"LYRA CONTROL TOWER", "position":Vector2(5200, 1250), "upgrade":"DAMAGE +3 · MISSILE LINK"},
		{"id":"perseus", "name":"PERSEUS REACTOR BAY", "position":Vector2(8400, -950), "upgrade":"COOLING +15 · SHIELD +1"},
	],
	"bosses": [
		{"id":"rift", "name":"RIFT BREAKER", "position":Vector2(3650, 340), "tier":4},
		{"id":"crown", "name":"CROWN EATER", "position":Vector2(6850, -180), "tier":7},
		{"id":"warden", "name":"VOID WARDEN", "position":Vector2(10200, 260), "tier":10},
	],
}
const MODULES := {
	"scrap": {"label":"SCRAP", "hp":1.0, "mass":0.45, "fill":"303844", "stroke":"8795a4"},
	"core": {"label":"CORE", "hp":100.0, "mass":2.0, "fill":"17365e", "stroke":"70ddff"},
	"armor": {"label":"PLATE", "hp":18.0, "mass":1.8, "fill":"334661", "stroke":"a9bed9"},
	"thruster": {"label":"MAIN DRIVE", "hp":14.0, "mass":1.1, "force":4750.0, "fill":"174a5a", "stroke":"62e7ff", "actuator":"forward"},
	"reverse_thruster": {"label":"REV DRIVE", "hp":9.0, "mass":0.65, "force":4750.0, "fill":"4d3c55", "stroke":"e3a8ff", "actuator":"reverse"},
	"rcs_thruster": {"label":"RCS", "hp":8.0, "mass":0.5, "force":5400.0, "fill":"3a5a50", "stroke":"8cf0cd", "actuator":"turn"},
	"battery": {"label":"BATTERY", "hp":10.0, "mass":1.0, "fill":"3f4d5f", "stroke":"b9d8ff"},
	"laser": {"label":"LZR", "hp":12.0, "mass":1.2, "fill":"533052", "stroke":"ff92e8"},
	"missile_launcher": {"label":"MISSILE", "hp":16.0, "mass":1.65, "fill":"58402e", "stroke":"ffbd78"},
	"mini_missile_launcher": {"label":"TORPEDO", "hp":11.0, "mass":0.9, "fill":"4b4e35", "stroke":"d7ed8e"},
	"machine_gun": {"label":"MACHINE GUN", "hp":13.0, "mass":1.05, "fill":"3c4d63", "stroke":"9ebbe4"},
	"railgun": {"label":"RAILGUN", "hp":19.0, "mass":1.9, "fill":"4d3e62", "stroke":"d6b3ff"},
	"ammo_bay": {"label":"MISSILE BAY", "hp":24.0, "mass":2.2, "ammo":6, "capacity":6, "ammo_type":"missile", "fill":"5d5534", "stroke":"ffe18c"},
	"bullet_bay": {"label":"BULLET BAY", "hp":20.0, "mass":1.75, "ammo":36, "capacity":36, "ammo_type":"bullet", "fill":"3f554e", "stroke":"a8e7c5"},
	"shield_generator": {"label":"SHIELD GEN", "hp":22.0, "mass":1.8, "coverage_mass":20.0, "fill":"31576a", "stroke":"8eeaff"},
	"block": {"label":"BLOCK", "hp":20.0, "mass":1.9, "fill":"475968", "stroke":"b4d0df"},
	"beam2": {"label":"BEAM-2", "hp":34.0, "mass":3.35, "fill":"4b5d78", "stroke":"afc7ee", "footprint":[Vector2i(0,0), Vector2i(1,0)]},
	"beam3": {"label":"BEAM-3", "hp":48.0, "mass":4.8, "fill":"516275", "stroke":"b4d5dc", "footprint":[Vector2i(0,0), Vector2i(1,0), Vector2i(2,0)]},
	"beam4": {"label":"BEAM-4", "hp":62.0, "mass":6.2, "fill":"564c68", "stroke":"d2b8ee", "footprint":[Vector2i(0,0), Vector2i(1,0), Vector2i(2,0), Vector2i(3,0)]},
	"plate4": {"label":"PLATE-4", "hp":74.0, "mass":7.1, "fill":"455966", "stroke":"b9d5dc", "footprint":[Vector2i(0,0), Vector2i(1,0), Vector2i(0,1), Vector2i(1,1)]},
	"wedge": {"label":"WEDGE", "hp":15.0, "mass":1.25, "fill":"42615c", "stroke":"97e6d3", "shape":"triangle"},
	"wedge_long": {"label":"LONG WEDGE", "hp":26.0, "mass":2.35, "fill":"604b3e", "stroke":"f1bf94", "shape":"triangle-long", "footprint":[Vector2i(0,0), Vector2i(1,0)]},
	# Cosmoteer 이식 무기 모듈 (외형 스프라이트 + 실측 스펙)
	"cosmo_heavy_laser": {"label":"HEAVY LASER", "hp":28.0, "mass":2.4, "fill":"5c2548", "stroke":"ff6fb5", "cosmo_id":"cosmoteer.laser_blaster_large", "footprint":[Vector2i(0,0), Vector2i(1,0)]},
	"cosmo_disruptor": {"label":"DISRUPTOR", "hp":16.0, "mass":1.4, "fill":"1f4d61", "stroke":"6ef2ff", "cosmo_id":"cosmoteer.disruptor"},
	"cosmo_ion_beam": {"label":"ION BEAM", "hp":24.0, "mass":2.2, "fill":"1e523a", "stroke":"62ffa4", "cosmo_id":"cosmoteer.ion_beam_emitter", "footprint":[Vector2i(0,0), Vector2i(1,0)]},
	"cosmo_cannon_med": {"label":"MED CANNON", "hp":26.0, "mass":2.3, "fill":"594227", "stroke":"ffd074", "cosmo_id":"cosmoteer.cannon_med", "footprint":[Vector2i(0,0), Vector2i(1,0)]},
	"cosmo_cannon_large": {"label":"LRG CANNON", "hp":44.0, "mass":3.8, "fill":"5c3924", "stroke":"ff9b52", "cosmo_id":"cosmoteer.cannon_large", "footprint":[Vector2i(0,0), Vector2i(1,0), Vector2i(0,1), Vector2i(1,1)]},
	"cosmo_cannon_deck": {"label":"DECK CANNON", "hp":48.0, "mass":4.4, "fill":"632f24", "stroke":"ff7242", "cosmo_id":"cosmoteer.cannon_deck", "footprint":[Vector2i(0,0), Vector2i(1,0), Vector2i(0,1), Vector2i(1,1)]},
	"cosmo_chaingun": {"label":"CHAINGUN", "hp":32.0, "mass":2.8, "fill":"544d2a", "stroke":"ffe885", "cosmo_id":"cosmoteer.chaingun", "footprint":[Vector2i(0,0), Vector2i(1,0)]},
	"cosmo_flak": {"label":"FLAK CANNON", "hp":34.0, "mass":3.0, "fill":"573c2e", "stroke":"ffa86e", "cosmo_id":"cosmoteer.flak_cannon_large", "footprint":[Vector2i(0,0), Vector2i(1,0)]},
	"cosmo_pd": {"label":"POINT DEF", "hp":12.0, "mass":0.95, "fill":"274a59", "stroke":"9ef8ff", "cosmo_id":"cosmoteer.point_defense"},
	"cosmo_mining_laser": {"label":"MINING LZR", "hp":18.0, "mass":1.6, "fill":"544924", "stroke":"ffe066", "cosmo_id":"cosmoteer.mining_laser_small", "footprint":[Vector2i(0,0), Vector2i(1,0)]},
	"cosmo_resonance_turret": {"label":"RESONANCE", "hp":42.0, "mass":3.8, "fill":"402d5c", "stroke":"c49bff", "cosmo_id":"cosmoteer.resonance_beam_turret", "footprint":[Vector2i(0,0), Vector2i(1,0), Vector2i(0,1), Vector2i(1,1)]},
	"cosmo_tractor_beam": {"label":"TRACTOR BM", "hp":36.0, "mass":3.2, "fill":"1f455e", "stroke":"6edcff", "cosmo_id":"cosmoteer.tractor_beam_emitter", "footprint":[Vector2i(0,0), Vector2i(1,0), Vector2i(0,1), Vector2i(1,1)]},
	# Cosmoteer 장갑·구조·방어
	"cosmo_armor": {"label":"C-ARMOR", "hp":26.0, "mass":2.2, "fill":"3d4b5c", "stroke":"b8cce0", "cosmo_id":"cosmoteer.armor"},
	"cosmo_armor_2x1": {"label":"C-ARMOR 2x1", "hp":52.0, "mass":4.2, "fill":"3d4b5c", "stroke":"c4d8ec", "cosmo_id":"cosmoteer.armor_2x1", "footprint":[Vector2i(0,0), Vector2i(1,0)]},
	"cosmo_armor_wedge": {"label":"C-WEDGE", "hp":18.0, "mass":1.35, "fill":"3f5361", "stroke":"a8d4e6", "shape":"triangle", "cosmo_id":"cosmoteer.armor_wedge"},
	"cosmo_structure": {"label":"STRUCTURE", "hp":10.0, "mass":0.6, "fill":"2c3645", "stroke":"7f95ab", "cosmo_id":"cosmoteer.structure"},
	"cosmo_shield_small": {"label":"SHIELD S", "hp":26.0, "mass":2.0, "shield":1, "coverage_mass":26.0, "power":-2.0, "fill":"244f66", "stroke":"7ff0ff", "cosmo_id":"cosmoteer.shield_gen_small", "footprint":[Vector2i(0,0), Vector2i(1,0)]},
	"cosmo_shield_large": {"label":"SHIELD L", "hp":48.0, "mass":4.0, "shield":2, "coverage_mass":52.0, "power":-4.0, "fill":"21476b", "stroke":"94f4ff", "cosmo_id":"cosmoteer.shield_gen_large", "footprint":[Vector2i(0,0), Vector2i(1,0), Vector2i(0,1), Vector2i(1,1)]},
	# Cosmoteer 추진
	"cosmo_thruster_small": {"label":"THRUST S", "hp":12.0, "mass":0.95, "force":4400.0, "fill":"1b495c", "stroke":"6ae8ff", "actuator":"forward", "cosmo_id":"cosmoteer.thruster_small"},
	"cosmo_thruster_med": {"label":"THRUST M", "hp":22.0, "mass":1.8, "force":7400.0, "fill":"1a5068", "stroke":"7cf0ff", "actuator":"forward", "cosmo_id":"cosmoteer.thruster_med", "footprint":[Vector2i(0,0), Vector2i(1,0)]},
	"cosmo_thruster_large": {"label":"THRUST L", "hp":36.0, "mass":3.2, "force":12400.0, "fill":"185270", "stroke":"96f4ff", "actuator":"forward", "cosmo_id":"cosmoteer.thruster_large", "footprint":[Vector2i(0,0), Vector2i(1,0), Vector2i(0,1), Vector2i(1,1)]},
	"cosmo_thruster_boost": {"label":"BOOST THR", "hp":28.0, "mass":2.3, "force":10200.0, "fill":"59371e", "stroke":"ffae5c", "actuator":"forward", "cosmo_id":"cosmoteer.thruster_boost", "footprint":[Vector2i(0,0), Vector2i(1,0)]},
	"cosmo_thruster_2way": {"label":"2-WAY RCS", "hp":12.0, "mass":0.85, "force":6400.0, "fill":"27594d", "stroke":"8ef5d4", "actuator":"turn", "cosmo_id":"cosmoteer.thruster_small_2way"},
	"cosmo_engine_room": {"label":"ENGINE RM", "hp":38.0, "mass":3.4, "force":8800.0, "power":4.0, "fill":"384d5e", "stroke":"9ad8ff", "actuator":"forward", "cosmo_id":"cosmoteer.engine_room", "footprint":[Vector2i(0,0), Vector2i(1,0), Vector2i(0,1), Vector2i(1,1)]},
	# Cosmoteer 전력·열
	"cosmo_reactor_small": {"label":"REACTOR S", "hp":26.0, "mass":2.6, "power":12.0, "fill":"224f59", "stroke":"7cf7e4", "cosmo_id":"cosmoteer.reactor_small", "footprint":[Vector2i(0,0), Vector2i(1,0), Vector2i(0,1), Vector2i(1,1)]},
	"cosmo_reactor_med": {"label":"REACTOR M", "hp":36.0, "mass":3.8, "power":20.0, "fill":"245963", "stroke":"8effec", "cosmo_id":"cosmoteer.reactor_med", "footprint":[Vector2i(0,0), Vector2i(1,0), Vector2i(0,1), Vector2i(1,1)]},
	"cosmo_reactor_large": {"label":"REACTOR L", "hp":52.0, "mass":5.6, "power":32.0, "fill":"26616e", "stroke":"a8fff2", "cosmo_id":"cosmoteer.reactor_large", "footprint":[Vector2i(0,0), Vector2i(1,0), Vector2i(2,0), Vector2i(0,1), Vector2i(1,1), Vector2i(2,1)]},
	"cosmo_power_storage": {"label":"CAPACITOR", "hp":18.0, "mass":1.5, "power":6.0, "fill":"2d485c", "stroke":"90d8ff", "cosmo_id":"cosmoteer.power_storage", "footprint":[Vector2i(0,0), Vector2i(1,0)]},
	"cosmo_radiator": {"label":"RADIATOR", "hp":16.0, "mass":1.3, "power":4.0, "fill":"543428", "stroke":"ff9b6e", "cosmo_id":"cosmoteer.radiator", "footprint":[Vector2i(0,0), Vector2i(1,0)]},
	"oni_cooler": {"label":"AQUA COOLER", "hp":24.0, "mass":1.5, "power":-3.0, "fill":"144a66", "stroke":"42f5ff"},
	# Cosmoteer 지원·제어·복도 통로
	"cosmo_corridor": {"label":"CORRIDOR", "hp":14.0, "mass":0.55, "fill":"243442", "stroke":"82c4dc", "cosmo_id":"cosmoteer.corridor"},
	"cosmo_conveyor": {"label":"CONVEYOR", "hp":15.0, "mass":0.65, "power":-0.5, "fill":"26403c", "stroke":"74f2ce", "cosmo_id":"cosmoteer.conveyor"},
	"cosmo_airlock": {"label":"AIRLOCK", "hp":18.0, "mass":0.85, "fill":"2d3c4a", "stroke":"9cd8f0", "cosmo_id":"cosmoteer.airlock"},
	"cosmo_extinguisher": {"label":"EXTINGUISH", "hp":16.0, "mass":0.90, "fill":"4f2828", "stroke":"ff8c7a", "cosmo_id":"cosmoteer.fire_extinguisher"},
	"cosmo_control_small": {"label":"COCKPIT", "hp":28.0, "mass":2.2, "power":2.0, "fill":"204061", "stroke":"84d8ff", "cosmo_id":"cosmoteer.control_room_small", "footprint":[Vector2i(0,0), Vector2i(1,0), Vector2i(0,1), Vector2i(1,1)]},
	"cosmo_sensor_array": {"label":"SENSORS", "hp":24.0, "mass":2.0, "power":-1.0, "fill":"2a445e", "stroke":"8ceeff", "cosmo_id":"cosmoteer.sensor_array", "footprint":[Vector2i(0,0), Vector2i(1,0), Vector2i(0,1), Vector2i(1,1)]},
	"cosmo_crew_quarters": {"label":"CREW BUNK", "hp":18.0, "mass":1.4, "fill":"3c4857", "stroke":"b4c8dc", "cosmo_id":"cosmoteer.crew_quarters_small", "footprint":[Vector2i(0,0), Vector2i(1,0)]},
	"cosmo_storage": {"label":"CARGO 2x2", "hp":32.0, "mass":2.8, "ammo":10, "capacity":10, "ammo_type":"missile", "fill":"4f4833", "stroke":"ebd38f", "cosmo_id":"cosmoteer.storage_2x2", "footprint":[Vector2i(0,0), Vector2i(1,0), Vector2i(0,1), Vector2i(1,1)]},
	"cosmo_hyperdrive": {"label":"HYPERDRIVE", "hp":30.0, "mass":3.0, "power":-2.0, "fill":"352f5e", "stroke":"b8a4ff", "cosmo_id":"cosmoteer.hyperdrive_small", "footprint":[Vector2i(0,0), Vector2i(1,0), Vector2i(0,1), Vector2i(1,1)]},
}

static var _part_tuning_cache: Dictionary = {}
static var _part_tuning_rows: Dictionary = {}
static var _part_tuning_overrides: Dictionary = {}
static var _part_tuning_loaded := false
const PART_TUNING_OVERRIDE_PATH := "user://part_tuning_overrides.csv"
## 외형 분류도 CSV에서 관리한다. 등급/테마는 게임 수치가 아니라 표시·검색·아트 선택용 메타데이터다.
static var part_tuning_headers := PackedStringArray(["id", "display_name", "description", "hull", "shield", "power", "weapon_type", "thrust", "reverse_thrust", "rcs_thrust", "ammo_type", "ammo", "capacity", "coverage_mass", "weapon_display_name", "weapon_display_desc", "mass", "material", "grade", "grade_color", "design_theme", "theme_code", "themed_name"])

static func module_spec(kind: String) -> Dictionary:
	var result: Dictionary = MODULES.get(kind, MODULES["block"]).duplicate(true)
	var tuning := part_tuning(kind)
	if tuning.is_empty():
		var base_hp := float(result.get("hp", 20.0)) * DURABILITY_MULTIPLIER
		result["hp"] = base_hp
		result["hull"] = base_hp
		return result
	result["display_name"] = tuning.display_name
	result["description"] = tuning.description
	result["hull"] = float(tuning.hull) * DURABILITY_MULTIPLIER
	result["mass"] = tuning.mass
	result["material"] = tuning.material
	result["shield"] = tuning.shield
	result["power"] = tuning.power
	result["weapon_type"] = tuning.weapon_type
	result["weapon_display_name"] = tuning.weapon_display_name
	result["weapon_display_desc"] = tuning.weapon_display_desc
	result["grade"] = tuning.grade
	result["grade_color"] = tuning.grade_color
	result["design_theme"] = tuning.design_theme
	result["theme_code"] = tuning.theme_code
	result["themed_name"] = tuning.themed_name
	result["hp"] = float(tuning.hull) * DURABILITY_MULTIPLIER
	if not str(tuning.ammo_type).is_empty():
		result["ammo_type"] = tuning.ammo_type
		result["ammo"] = tuning.ammo
		result["capacity"] = tuning.capacity
	if tuning.coverage_mass > 0.0:
		result["coverage_mass"] = tuning.coverage_mass
	match str(result.get("actuator", "")):
		"forward": result["force"] = tuning.thrust
		"reverse": result["force"] = tuning.reverse_thrust
		"turn": result["force"] = tuning.rcs_thrust
	return result

static func part_tuning(kind: String) -> Dictionary:
	if not _part_tuning_loaded:
		load_part_tuning()
	return _part_tuning_cache.get(kind, {})

static func load_part_tuning() -> void:
	_part_tuning_loaded = true
	_part_tuning_cache.clear()
	_part_tuning_rows.clear()
	_part_tuning_overrides.clear()
	var source_path := "res://data/part_tuning_runtime.txt"
	if not FileAccess.file_exists(source_path):
		push_error("PART TUNING 런타임 데이터를 열 수 없습니다.")
		return
	load_part_tuning_file(source_path, false)
	if FileAccess.file_exists(PART_TUNING_OVERRIDE_PATH):
		load_part_tuning_file(PART_TUNING_OVERRIDE_PATH, true)

static func load_part_tuning_file(path: String, is_override: bool) -> void:
	var file := FileAccess.open(path, FileAccess.READ)
	if file == null:
		return
	var headers := file.get_csv_line()
	while not file.eof_reached():
		var values := file.get_csv_line()
		if values.is_empty() or values[0].strip_edges().is_empty():
			continue
		var row := {}
		for index in mini(headers.size(), values.size()):
			row[headers[index]] = values[index].strip_edges()
		var id := str(row.get("id", ""))
		if id.is_empty():
			continue
		_part_tuning_rows[id] = row.duplicate(true)
		if is_override:
			_part_tuning_overrides[id] = row.duplicate(true)
		_part_tuning_cache[id] = parse_part_tuning_row(row)
	file.close()

static func parse_part_tuning_row(row: Dictionary) -> Dictionary:
	return {
			"display_name": str(row.get("display_name", row.get("id", ""))),
			"description": str(row.get("description", "")),
			"hull": csv_number(row.get("hull", "0")),
			"mass": csv_number(row.get("mass", "0")),
			"material": str(row.get("material", "standard")),
			"shield": csv_number(row.get("shield", "0")),
			"power": csv_number(row.get("power", "0")),
			"weapon_type": str(row.get("weapon_type", "none")),
			"weapon_display_name": str(row.get("weapon_display_name", "")),
			"weapon_display_desc": str(row.get("weapon_display_desc", "")),
			"thrust": csv_number(row.get("thrust", "0")),
			"reverse_thrust": csv_number(row.get("reverse_thrust", "0")),
			"rcs_thrust": csv_number(row.get("rcs_thrust", "0")),
			"ammo_type": str(row.get("ammo_type", "")),
			"ammo": int(csv_number(row.get("ammo", "0"))),
			"capacity": int(csv_number(row.get("capacity", "0"))),
			"coverage_mass": csv_number(row.get("coverage_mass", "0")),
			"grade": str(row.get("grade", "common")),
			"grade_color": str(row.get("grade_color", "gray")),
			"design_theme": str(row.get("design_theme", "terran_human")),
			"theme_code": str(row.get("theme_code", "TH")),
			"themed_name": str(row.get("themed_name", row.get("display_name", row.get("id", "")))),
		}

static func part_tuning_row(kind: String) -> Dictionary:
	if not _part_tuning_loaded:
		load_part_tuning()
	return _part_tuning_rows.get(kind, {}).duplicate(true)

static func save_part_tuning_override(kind: String, changes: Dictionary) -> bool:
	if not _part_tuning_loaded:
		load_part_tuning()
	var row: Dictionary = _part_tuning_rows.get(kind, {}).duplicate(true)
	if row.is_empty():
		return false
	for key in changes:
		row[str(key)] = str(changes[key])
	row["id"] = kind
	_part_tuning_rows[kind] = row
	_part_tuning_overrides[kind] = row.duplicate(true)
	_part_tuning_cache[kind] = parse_part_tuning_row(row)
	var file := FileAccess.open(PART_TUNING_OVERRIDE_PATH, FileAccess.WRITE)
	if file == null:
		return false
	file.store_csv_line(part_tuning_headers)
	var ids: Array = _part_tuning_overrides.keys()
	ids.sort()
	for id in ids:
		var override_row: Dictionary = _part_tuning_overrides[id]
		var values := PackedStringArray()
		for header in part_tuning_headers:
			values.append(str(override_row.get(header, "")))
		file.store_csv_line(values)
	file.close()
	return true

static func weapon_spec(kind: String) -> Dictionary:
	var key := "missile" if kind == "missile_launcher" else ("mini_missile" if kind == "mini_missile_launcher" else kind)
	var base: Variant = WEAPONS.get(key, null)
	if not (base is Dictionary):
		return {}
	return CosmoteerWeaponData.apply_cf_override(key, base as Dictionary)

static func csv_number(value: Variant) -> float:
	return str(value).to_float()
