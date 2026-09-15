## 전 플랫폼 공통 밸런스 SSOT. 게임 규칙 수치는 이 파일에서만 조정한다.
class_name Balance
extends RefCounted

const CELL := 42.0
const PHYSICS := {
	"linear_damp": 0.16,
	"angular_damp": 0.02,
	"forward_min": 0.35,
	"forward_max": 1.65,
}
const PLAYER := {"core_hp": 200.0, "module_limit": 18, "salvage_range": 420.0}
const SHIELD := {"max_layers": 5, "base_recharge": 6.0, "min_recharge": 1.8, "generator_coverage_mass": 20.0}
const WEAPONS := {
	"laser": {"cooldown": 0.28, "damage": 7.0, "speed": 720.0, "heat": 11.0},
	"machine_gun": {"damage": 4.0, "speed": 760.0, "life": 1.15, "ammo_cost": 1},
	"railgun": {"damage": 24.0, "speed": 1040.0, "life": 1.65, "ammo_cost": 4},
	"missile": {"cooldown": 0.72, "damage": 30.0, "speed": 460.0, "range": 980.0, "ammo_cost": 2},
	"mini_missile": {"cooldown": 3.0, "damage": 12.0, "speed": 250.0, "lock_seconds": 2.0, "boost": 720.0, "max_speed": 860.0, "range":1450.0, "ammo_cost": 1},
}
const WORLD := {
	"width": 190000.0, "height": 100000.0,
	"stations": [
		{"id":"kepler", "name":"KEPLER REPAIR DOCK", "position":Vector2(24000, 9000), "upgrade":"HULL +30"},
		{"id":"lyra", "name":"LYRA CONTROL TOWER", "position":Vector2(77000, 37000), "upgrade":"DAMAGE +2 · MISSILE LINK"},
		{"id":"perseus", "name":"PERSEUS REACTOR BAY", "position":Vector2(130000, 64000), "upgrade":"COOLING +12 · SHIELD"},
	],
	"bosses": [
		{"id":"rift", "name":"RIFT BREAKER", "position":Vector2(49000, 22000), "tier":4},
		{"id":"crown", "name":"CROWN EATER", "position":Vector2(104000, 49000), "tier":7},
		{"id":"warden", "name":"VOID WARDEN", "position":Vector2(157000, 73000), "tier":10},
	],
}
const MODULES := {
	"core": {"label":"CORE", "hp":100.0, "mass":2.0, "fill":"17365e", "stroke":"70ddff"},
	"armor": {"label":"PLATE", "hp":18.0, "mass":1.8, "fill":"334661", "stroke":"a9bed9"},
	"thruster": {"label":"MAIN DRIVE", "hp":14.0, "mass":1.1, "force":950.0, "fill":"174a5a", "stroke":"62e7ff", "actuator":"forward"},
	"reverse_thruster": {"label":"REV DRIVE", "hp":9.0, "mass":0.65, "force":220.0, "fill":"4d3c55", "stroke":"e3a8ff", "actuator":"reverse"},
	"rcs_thruster": {"label":"RCS", "hp":8.0, "mass":0.5, "force":360.0, "fill":"3a5a50", "stroke":"8cf0cd", "actuator":"turn"},
	"laser": {"label":"LZR", "hp":12.0, "mass":1.2, "fill":"533052", "stroke":"ff92e8"},
	"missile_launcher": {"label":"MISSILE", "hp":16.0, "mass":1.65, "fill":"58402e", "stroke":"ffbd78"},
	"mini_missile_launcher": {"label":"MINI MSL", "hp":11.0, "mass":0.9, "fill":"4b4e35", "stroke":"d7ed8e"},
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
}

static func module_spec(kind: String) -> Dictionary:
	return MODULES.get(kind, MODULES["block"]).duplicate(true)
