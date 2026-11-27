class_name FTLShip
extends RefCounted

## Full FTL: Faster Than Light ship simulation (shared by Player, Enemy, and Rebel Flagship).
## Implements 35x35px room grid, door O2 equalization & airlock venting, fires, breaches,
## reactor/system power routing, ion lock, shields, evasion, weapons, drones, cloaking,
## teleporter, crew BFS pathfinding, manning bonuses, skill XP, repair, and boarding combat.

const CELL_SIZE := 35.0
const SUBSYSTEMS := ["pilot", "sensors", "doors", "battery"]
const SYSTEM_ORDER := [
	"shields", "engines", "oxygen", "weapons", "drones",
	"medbay", "clonebay", "teleporter", "cloaking", "artillery",
	"hacking", "mind", "pilot", "sensors", "doors", "battery"
]
# Binary reverse-engineered FTL 1.6 lookup tables (verified from FTLGame_orig.exe -> data/ftl_logic_spec.json)
const ENGINE_EVASION := [5, 10, 15, 20, 25, 28, 31, 35]         # 0x885ee0 (Lv1..Lv8)
const PILOT_ENG_MANNING := [5, 7, 10]                           # 0x8847fc (0★/1★/2★)
const WEAPON_MANNING_CD_MULT := [0.90, 0.85, 0.80]              # 0x603b6c (0★/1★/2★ cooldown mult)
const SHIELD_MANNING_MULT := [1.10, 1.20, 1.30]                 # 0x884814 (0★/1★/2★ recharge mult)
const REPAIR_MASTERY_MULT := [1.00, 1.10, 1.20]                 # 0x603ba0 (0★/1★/2★ repair mult)
const COMBAT_MASTERY_MULT := [1.00, 1.10, 1.20]                 # 0x603be0 (0★/1★/2★ combat mult)
const CLONE_JUMP_HEAL := [8, 16, 25]                            # 0x8861ec (Lv1..Lv3)
const CLONE_TIME_SEC := [12.0, 9.0, 7.0]                        # 0x8861fc (Lv1..Lv3)
const HACKING_DURATION_SEC := [4.0, 7.0, 10.0]                  # 0x88518c (Lv1..Lv3)
const MIND_DURATION_SEC := [14.0, 20.0, 28.0]                   # 0x885260 (Lv1..Lv3)
const MIND_BONUS_HP := [0.0, 15.0, 30.0]                        # 0x885230 (Lv1..Lv3)
const MIND_COMBAT_MULT := [1.0, 1.25, 2.0]                      # 0x885220 (Lv1..Lv3)
const MEDBAY_HEAL_PER_SEC := [6.4, 9.6, 19.2]                   # Lv1=1x, Lv2=1.5x, Lv3=3x
const SKILL_XP_THRESHOLDS := {
	"pilot": [15, 30],
	"engines": [15, 30],
	"shields": [55, 110],
	"weapons": [65, 130],
	"repair": [18, 36],
	"combat": [8, 16],
}
const ION_SEC_PER_DMG := 5.0
const ION_MAX_LOCK_SEC := 25.0
const ZOLTAN_DEATH_BLAST_DMG := 15.0
const DOOR_HP_BY_LEVEL := [30.0, 60.0, 120.0, 240.0]            # 4Door (0x90c61c): Lv1..Lv4
const BOSS_PHASE_HULL := [20, 22, 20]                           # 8BossShip (0x90cef4): Phase 1/2/3
const BOSS_SURGE_MIN_SEC := 20.0                                # 0x4062a0 (20000 ms)
const BOSS_SURGE_MAX_SEC := 30.0                                # 0x406296 (30000 ms)
const FTL_BASE_RATE := 1.25                                     # 0x885fc0 (Lv1 unmanned = 50/1.25 = 40.0s)
const FTL_PER_ENGINE_RATE := 0.35                               # 0x885fbc (+0.35 per engine level above 1)
const FTL_CHARGE_TARGET := 50.0                                 # 0x63f5a9..0x63f738 charge scale
const FTL_ENG_MANNING_MULT := [1.10, 1.17, 1.25]                # 0x885fc8 / 0x885fcc / 0x885fc0 (0★/1★/2★)
const SUFFOCATION_O2_THRESHOLD := 5.0                           # 0x8791a0
const SUFFOCATION_DPS := 6.4                                    # 0x8791b0 (-0.4/tick * 16Hz)
const SCORE_DIFF_MULT := [1.0, 1.25, 1.50]                      # ScoreKeeper (0x44ccb5): Easy/Normal/Hard


static func compute_final_score(p_scrap: int, p_beacons: int, p_ships: int, p_diff: int) -> int:
	# Authentic FTL 1.6 final score formula: (scrap + beacons*10 + ships*20) * [1.0, 1.25, 1.50]
	var mult := float(SCORE_DIFF_MULT[clampi(p_diff, 0, 2)])
	return int(round((float(p_scrap) + float(p_beacons) * 10.0 + float(p_ships) * 20.0) * mult))
const CREW_NAMES := [
	"Charlie", "Kestrel", "Vance", "Sora", "Kael", "Nora", "Marek", "Talia",
	"Dax", "Elena", "Orin", "Lyra", "Bram", "Zara", "Juno", "Cyrus"
]

var db: FTLDatabase
var is_player: bool = true
var blueprint_id: String = ""
var ship_name: String = "The Kestrel"
var class_name_str: String = "Kestrel Cruiser"
var layout_name: String = "kestral"
var img_name: String = "kestral"
var layout: Dictionary = {}

# Hull & resources
var hull: int = 30
var max_hull: int = 30
var scrap: int = 30
var fuel: int = 16
var missiles: int = 8
var drone_parts: int = 2
var reactor_max: int = 8

# Shields & Cloak & FTL & AE Special Systems
var shield_layers: int = 0
var shield_max_layers: int = 0
var shield_charge: float = 0.0
var zoltan_shield: int = 0
var zoltan_shield_max: int = 0
var cloak_timer: float = 0.0
var cloak_max_duration: float = 5.0
var cloak_cooldown: float = 0.0
var teleporter_cooldown: float = 0.0
var hacking_target_room: int = -1
var hacking_active_timer: float = 0.0
var hacking_cooldown: float = 0.0
var hacked_room: int = -1
var hacked_active: bool = false
var mind_active_timer: float = 0.0
var mind_cooldown: float = 0.0
var battery_timer: float = 0.0
var battery_cooldown: float = 0.0
var battery_bonus: int = 0
var artillery_charge: float = 0.0
var artillery_cooldown: float = 50.0
var ion_storm_active: bool = false
var ftl_charge: float = 1.0 # 0..1

# Clonebay queue: Array[Dictionary] -> {crew: Dictionary, timer: float, max_time: float}
var clone_queue: Array = []

# Rooms: Array[Dictionary] -> {id, x, y, w, h, system, oxygen, fires, breach, repair_progress, breach_progress}
var rooms: Array = []
var room_by_id: Dictionary = {}
# Doors: Array[Dictionary] -> {id, x, y, room_a, room_b, vertical, open, airlock, hp}
var doors: Array = []
# Systems: sys_name -> {id, room, level, max_level, power, damage, ion_level, ion_timer, img, slot_dir, slot_num, manned_by}
var systems: Dictionary = {}
# Weapons: Array[Dictionary] -> {id, bp, powered, charge, cooldown, target_room, autofire, fire_anim, mount_idx}
var weapons: Array = []
var weapon_slots: int = 4
var cargo_weapons: Array[String] = []
# Drones: Array[Dictionary] -> {id, bp, powered, active, angle, cooldown, hp}
var drones: Array = []
var drone_slots: int = 2
var cargo_drones: Array[String] = []
# Augments
var augments: Array[String] = []
# Crew: Array[Dictionary] -> {id, name, species, is_player, room_id, target_room, path, pos, tile_idx, hp, max_hp, ...}
var crew: Array = []
var _next_crew_id: int = 1

# Enemy/boss state
var is_boss: bool = false
var is_unmanned: bool = false
var boss_ai_active: bool = false
var boss_phase: int = 1
var boss_surge_timer: float = 20.0
var boss_surge_count: int = 0
var ai_decision_timer: float = 0.6
var surrender_offered: bool = false
var surrender_declined: bool = false
var fleeing: bool = false
var flee_ftl_charge: float = 0.0
var pending_surrender_offer: Dictionary = {}

# Combat feedback events emitted to view/main
var pending_shots: Array = []    # {from_ship, weapon, weapon_idx, target_room, beam_start, beam_end, beam_rooms}
var pending_popups: Array = []   # {ship, pos_local, text, color}
var pending_sfx: Array[String] = []
var pending_explosions: Array = [] # {ship, pos_local, big}
var pending_teleports: Array = []  # {ship, pos_local, incoming}


func init_from_blueprint(p_db: FTLDatabase, bp_id: String, p_is_player: bool, sector_scale: int = 0) -> void:
	db = p_db
	is_player = p_is_player
	blueprint_id = bp_id
	var bp: Dictionary = db.ships.get(bp_id, db.ships.get("PLAYER_SHIP_HARD", {}))
	ship_name = str(bp.get("name", bp_id))
	class_name_str = str(bp.get("class_name", bp_id))
	layout_name = str(bp.get("layout", "kestral"))
	img_name = str(bp.get("img", layout_name))
	layout = db.get_ship_layout(layout_name)

	max_hull = int(bp.get("health", 30))
	if not is_player and not bp_id.begins_with("BOSS_"):
		max_hull = maxi(6, mini(24, max_hull + sector_scale * 2))
	hull = max_hull
	missiles = int(bp.get("missiles", 8))
	drone_parts = int(bp.get("droneParts", 2))
	reactor_max = int(bp.get("maxPower", 8))
	if not is_player and not bp_id.begins_with("BOSS_"):
		reactor_max = maxi(reactor_max, 6 + sector_scale * 2)
	weapon_slots = clampi(int(bp.get("weaponSlots", 4)), 1, 4)
	drone_slots = clampi(int(bp.get("droneSlots", 2)), 0, 3)
	is_boss = bp_id.begins_with("BOSS_")
	boss_ai_active = false
	boss_surge_count = 0
	if bp_id == "BOSS_1":
		boss_phase = 1
	elif bp_id == "BOSS_2":
		boss_phase = 2
	elif bp_id == "BOSS_3":
		boss_phase = 3
	if is_boss:
		max_hull = int(BOSS_PHASE_HULL[clampi(boss_phase - 1, 0, 2)])
		hull = max_hull
		boss_surge_timer = BOSS_SURGE_MIN_SEC

	# Rooms
	rooms.clear()
	room_by_id.clear()
	for r in layout.get("rooms", []):
		rooms.append({
			"id": int(r.id),
			"x": int(r.x),
			"y": int(r.y),
			"w": int(r.w),
			"h": int(r.h),
			"system": "",
			"oxygen": 100.0,
			"fires": 0,       # 0..(w*h)
			"fire_hp": 0.0,   # remaining fire strength
			"breach": 0,      # 0..1
			"breach_hp": 0.0,
			"repair_progress": 0.0,
			"sabotage_progress": 0.0,
			"lockdown_timer": 0.0,
		})
		room_by_id[rooms[-1].id] = rooms[-1]

	# Doors
	doors.clear()
	var did := 0
	for d in layout.get("doors", []):
		var ra := int(d.room_a)
		var rb := int(d.room_b)
		doors.append({
			"id": did,
			"x": int(d.x),
			"y": int(d.y),
			"room_a": ra,
			"room_b": rb,
			"vertical": bool(d.vertical),
			"open": false,
			"airlock": (ra == -1 or rb == -1),
			"hp": 100.0,
		})
		did += 1

	# Systems
	systems.clear()
	var bp_systems: Dictionary = bp.get("systems", {})
	for sname in bp_systems.keys():
		var sd: Dictionary = bp_systems[sname]
		if not bool(sd.get("start", true)):
			continue
		var rid := int(sd.get("room", 0))
		if not room_by_id.has(rid) and not rooms.is_empty():
			rid = rooms[0].id
		var sbp: Dictionary = db.systems.get(sname, {})
		var base_lvl := maxi(1, int(sd.get("power", 1)))
		var max_lvl := int(sbp.get("maxPower", sd.get("max", 8)))
		if not is_player and not is_boss:
			if sname == "shields":
				base_lvl = clampi(2 + int(sector_scale / 2) * 2, 2, 8)
			elif sname == "weapons":
				base_lvl = clampi(base_lvl + int(sector_scale / 2), 2, 8)
			elif sname == "engines":
				base_lvl = clampi(base_lvl + int(sector_scale / 3), 1, 5)
		systems[sname] = {
			"id": sname,
			"room": rid,
			"level": mini(base_lvl, max_lvl),
			"max_level": max_lvl,
			"power": 0,
			"damage": 0,
			"ion_level": 0,
			"ion_timer": 0.0,
			"img": str(sd.get("img", "")),
			"slot_dir": str(sd.get("slot_dir", "up")),
			"slot_num": int(sd.get("slot_num", 0)),
			"manned_by": -1,
		}
		if room_by_id.has(rid):
			room_by_id[rid].system = sname

	# Augments
	augments.clear()
	for a in bp.get("augments", []):
		augments.append(str(a))
	if has_augment("ENERGY_SHIELD") or bp_id == "BOSS_3":
		zoltan_shield_max = 12 if bp_id == "BOSS_3" else 5
		zoltan_shield = zoltan_shield_max

	# Weapons
	weapons.clear()
	var bp_wpns: Array = bp.get("weapons", [])
	var chosen_wpns: Array[String] = []
	for w in bp_wpns:
		chosen_wpns.append(str(w))
	if chosen_wpns.is_empty():
		var list_name := str(bp.get("weaponListLoad", ""))
		var want_cnt := maxi(1, mini(weapon_slots, int(bp.get("weaponListCount", 2))))
		var list_pool: Array = db.blueprint_lists.get(list_name, ["LASER_BURST_1", "LASER_BURST_2", "MISSILES_1", "BEAM_1"])
		if list_pool.is_empty():
			list_pool = ["LASER_BURST_2"]
		for _i in range(want_cnt):
			var pick := str(list_pool[randi() % list_pool.size()])
			if not db.weapons.has(pick):
				pick = "LASER_BURST_2"
			chosen_wpns.append(pick)
	for i in range(mini(weapon_slots, chosen_wpns.size())):
		add_weapon(chosen_wpns[i])

	# Drones
	drones.clear()
	for d in bp.get("drones", []):
		if drones.size() < drone_slots:
			add_drone(str(d))

	# Auto-allocate initial reactor power
	_allocate_initial_power()

	# Crew
	crew.clear()
	var crew_list: Array = bp.get("crew", [])
	if crew_list.is_empty():
		crew_list = ["human", "human", "human"] if is_player else ["human", "human"]
	var priority_sys := ["pilot", "weapons", "engines", "shields", "medbay", "oxygen"]
	for i in range(crew_list.size()):
		var species := str(crew_list[i])
		var start_room: int = int(rooms[0].id) if not rooms.is_empty() else 0
		if i < priority_sys.size() and systems.has(priority_sys[i]):
			start_room = int(systems[priority_sys[i]].room)
		elif not rooms.is_empty():
			start_room = int(rooms[i % rooms.size()].id)
		add_crew(species, start_room, is_player)

	# Initial shields full
	is_unmanned = bp_id.begins_with("AUTO_") or (not is_player and not is_boss and crew.is_empty())
	shield_max_layers = get_effective_system_power("shields") / 2
	shield_layers = shield_max_layers
	shield_charge = 0.0
	if has_augment("WEAPON_PREIGNITE"):
		for w in weapons:
			if w.powered:
				w.charge = w.cooldown


func _allocate_initial_power() -> void:
	var priority := ["shields", "weapons", "artillery", "engines", "oxygen", "medbay", "clonebay", "drones"]
	for sname in priority:
		if not systems.has(sname):
			continue
		var want := int(systems[sname].level)
		if sname == "medbay" or sname == "clonebay":
			want = mini(want, 1)
		for _p in range(want):
			if not add_system_power(sname):
				break
	# Power weapons up to weapon system power
	var wp_avail := get_effective_system_power("weapons")
	var used := 0
	for w in weapons:
		var cost := int(w.bp.get("power", 1))
		if used + cost <= wp_avail:
			w.powered = true
			used += cost
		else:
			w.powered = false


func add_weapon(weapon_id: String) -> bool:
	var bp: Dictionary = db.weapons.get(weapon_id, {})
	if bp.is_empty():
		return false
	if weapons.size() < weapon_slots:
		weapons.append({
			"id": weapon_id,
			"bp": bp,
			"powered": false,
			"charge": 0.0,
			"cooldown": float(bp.get("cooldown", 10.0)),
			"target_room": -1,
			"beam_start": Vector2.ZERO,
			"beam_end": Vector2.ZERO,
			"beam_rooms": [],
			"autofire": false,
			"fire_anim": 0.0,
			"mount_idx": weapons.size(),
			"chain_count": 0,
			"charge_level": 0,
		})
		return true
	if cargo_weapons.size() < 4:
		cargo_weapons.append(weapon_id)
		return true
	return false


func add_drone(drone_id: String) -> bool:
	var bp: Dictionary = db.drones.get(drone_id, {})
	if bp.is_empty():
		return false
	if drones.size() < drone_slots:
		drones.append({
			"id": drone_id,
			"bp": bp,
			"powered": false,
			"active": false,
			"angle": randf() * TAU,
			"cooldown": 2.5,
			"hp": 1,
		})
		return true
	if cargo_drones.size() < 4:
		cargo_drones.append(drone_id)
		return true
	return false


func add_crew(species: String, room_id: int, p_is_player: bool, custom_name: String = "") -> Dictionary:
	var sp: Dictionary = db.crew_species.get(species, db.crew_species.get("human", {}))
	var cid := _next_crew_id
	_next_crew_id += 1
	var cname: String = custom_name if not custom_name.is_empty() else str(CREW_NAMES[(cid - 1) % CREW_NAMES.size()])
	var pos := get_room_tile_local(room_id, 0)
	var member := {
		"id": cid,
		"name": cname,
		"species": species,
		"is_player": p_is_player,
		"room_id": room_id,
		"home_room": room_id,
		"target_room": room_id,
		"path": [],
		"pos": pos,
		"tile_idx": 0,
		"hp": float(sp.get("max_hp", 100)),
		"max_hp": float(sp.get("max_hp", 100)),
		"move_speed": float(sp.get("move", 1.0)) * 74.0,
		"repair_rate": float(sp.get("repair", 1.0)),
		"combat_mult": float(sp.get("combat", 1.0)),
		"fire_immune": bool(sp.get("fire_immune", false)),
		"no_o2": bool(sp.get("no_o2", false)),
		"bonus_power": int(sp.get("bonus_power", 0)),
		"color": sp.get("color", Color("7bb2ff")),
		"skills": {"pilot": 0, "engines": 0, "shields": 0, "weapons": 0, "repair": 0, "combat": 0},
		"anim_t": randf() * 4.0,
		"facing": Vector2.DOWN,
		"state": "idle", # idle, walk, man, repair, fire, fight, sabotage
		"selected": false,
		"stun_timer": 0.0,
		"mind_timer": 0.0,
		"mind_combat_mult": 1.0,
		"lockdown_cooldown": 0.0,
	}
	crew.append(member)
	_assign_room_tiles(room_id)
	return member


func has_augment(aug_id: String) -> bool:
	return augments.has(aug_id)


func count_augment(aug_id: String) -> int:
	var n := 0
	for a in augments:
		if a == aug_id:
			n += 1
	return n


func has_slug_crew() -> bool:
	for c in crew:
		if bool(c.is_player) == is_player and float(c.hp) > 0.0 and str(c.species) == "slug":
			return true
	return false


func get_crew_skill_tier(c: Dictionary, skill_name: String) -> int:
	if c.is_empty():
		return 0
	var sk: Dictionary = c.get("skills", {})
	var xp := int(sk.get(skill_name, 0))
	var thresh: Array = SKILL_XP_THRESHOLDS.get(skill_name, [15, 30])
	var learn_mult := 0.90 if str(c.get("species", "")) == "human" else 1.0
	var t1 := int(ceil(float(thresh[0]) * learn_mult))
	var t2 := int(ceil(float(thresh[1]) * learn_mult))
	if xp >= t2:
		return 2
	if xp >= t1:
		return 1
	return 0


func get_crew_mastery_stars(c: Dictionary) -> int:
	var stars := 0
	var sk: Dictionary = c.get("skills", {})
	for k in sk.keys():
		stars += get_crew_skill_tier(c, str(k))
	return stars


func activate_crystal_lockdown(crew_id: int) -> bool:
	var c := _get_crew_by_id(crew_id)
	if c.is_empty() or float(c.hp) <= 0.0 or str(c.species) != "crystal":
		return false
	if float(c.get("lockdown_cooldown", 0.0)) > 0.0:
		pending_sfx.append("powerUpFail")
		return false
	var rid := int(c.room_id)
	if not room_by_id.has(rid):
		return false
	room_by_id[rid].lockdown_timer = 12.0
	c.lockdown_cooldown = 35.0
	pending_popups.append({"ship": self, "pos_local": get_room_center_local(rid), "text": "CRYSTAL LOCKDOWN!", "color": Color("7ee8ff")})
	pending_sfx.append("ionHit1")
	return true


# ==================== POWER & SYSTEMS ====================
func get_used_reactor_power() -> int:
	var total := 0
	for sname in systems.keys():
		if sname in SUBSYSTEMS:
			continue
		total += int(systems[sname].power)
	return total


func get_total_reactor_max() -> int:
	var base := maxi(1, int(reactor_max / 2)) if ion_storm_active else reactor_max
	return base + battery_bonus


func get_available_reactor_power() -> int:
	return maxi(0, get_total_reactor_max() - get_used_reactor_power())


func _clamp_reactor_power() -> void:
	var limit := get_total_reactor_max()
	var used := get_used_reactor_power()
	if used <= limit:
		return
	var drain_order := ["artillery", "drones", "medbay", "clonebay", "hacking", "mind", "teleporter", "cloaking", "engines", "oxygen", "weapons", "shields"]
	for sname in drain_order:
		if used <= limit:
			break
		if not systems.has(sname) or sname in SUBSYSTEMS:
			continue
		var s: Dictionary = systems[sname]
		while int(s.power) > 0 and used > limit:
			s.power -= 1
			used -= 1
	_enforce_weapon_drone_power()


func activate_battery() -> bool:
	if not systems.has("battery"):
		return false
	var lvl := get_effective_system_power("battery")
	if lvl <= 0 or battery_timer > 0.0 or battery_cooldown > 0.0:
		pending_sfx.append("powerUpFail")
		return false
	battery_bonus = 4 if lvl >= 2 else 2
	battery_timer = 30.0
	battery_cooldown = 10.0 if has_augment("BATTERY_BOOSTER") else 20.0
	pending_popups.append({"ship": self, "pos_local": get_room_center_local(int(systems.battery.room)), "text": "+%d BATTERY!" % battery_bonus, "color": Color("ffd54f")})
	pending_sfx.append("powerUpSystem")
	return true


func get_effective_sensor_level(in_nebula: bool = false) -> int:
	if in_nebula:
		return 0
	var slvl := get_effective_system_power("sensors")
	if slvl <= 0:
		return 0
	var manned := systems.has("sensors") and int(systems.sensors.manned_by) != -1
	return clampi(slvl + (1 if manned else 0), 0, 4)


func get_ftl_charge_rate(enemy_has_jammer: bool = false) -> float:
	# Authentic FTL 1.6 FTL Drive Charge (0x63f5a9..0x63f738):
	# rate = (1.25 + 0.35 * (eng - 1)) * eng_manning[1.10/1.17/1.25] * (1 + 0.25 * FTL_BOOSTER) / 50.0
	var pilot_ok := get_effective_system_power("pilot") > 0 and (int(systems.pilot.manned_by) != -1 or get_effective_system_power("pilot") >= 2)
	var eng := get_effective_system_power("engines")
	if not pilot_ok or eng <= 0:
		return 0.0
	var raw_rate := FTL_BASE_RATE + FTL_PER_ENGINE_RATE * float(maxi(0, eng - 1))
	if systems.has("engines") and int(systems.engines.manned_by) != -1:
		var ec := _get_crew_by_id(int(systems.engines.manned_by))
		var etier := get_crew_skill_tier(ec, "engines")
		raw_rate *= float(FTL_ENG_MANNING_MULT[etier])
	var boost_cnt := count_augment("FTL_BOOSTER")
	if boost_cnt > 0:
		raw_rate *= (1.0 + 0.25 * float(boost_cnt))
	if enemy_has_jammer:
		raw_rate *= 0.50
	return raw_rate / FTL_CHARGE_TARGET


func get_weapon_effective_cooldown(w: Dictionary) -> float:
	var base_cd := maxf(1.0, float(w.get("cooldown", 10.0)))
	var btype := str(w.bp.get("boostType", ""))
	if btype == "cooldown":
		var bamt := float(w.bp.get("boostAmount", 0.0))
		var bmax := int(w.bp.get("boostCount", 0))
		var cnt := mini(bmax, int(w.get("chain_count", 0)))
		return maxf(1.0, base_cd - float(cnt) * bamt)
	return base_cd


func on_ftl_jump() -> void:
	# Authentic FTL 1.6 Clonebay jump-healing (+8 / +16 / +25 HP per jump, 0x8861ec)
	if systems.has("clonebay") and int(systems.clonebay.damage) < int(systems.clonebay.level):
		var c_idx := clampi(int(systems.clonebay.level) - 1, 0, CLONE_JUMP_HEAL.size() - 1)
		var heal := int(CLONE_JUMP_HEAL[c_idx])
		for c in crew:
			if c.is_player == is_player and c.hp > 0.0:
				c.hp = minf(float(c.max_hp), float(c.hp) + float(heal))
	# Reset weapon chain/charge stacks on jump
	for w in weapons:
		w.chain_count = 0
		w.charge_level = 0
		w.charge = 0.0
	artillery_charge = 0.0


func get_zoltan_bonus_in_room(room_id: int) -> int:
	var bonus := 0
	for c in crew:
		if c.is_player == is_player and c.room_id == room_id and c.hp > 0 and int(c.bonus_power) > 0:
			bonus += int(c.bonus_power)
	return bonus


func get_system_usable_max(sname: String) -> int:
	if not systems.has(sname):
		return 0
	var s: Dictionary = systems[sname]
	return maxi(0, int(s.level) - int(s.damage) - int(s.ion_level))


func get_effective_system_power(sname: String) -> int:
	if not systems.has(sname):
		return 0
	var s: Dictionary = systems[sname]
	var undamaged := maxi(0, int(s.level) - int(s.damage))
	var usable := maxi(0, undamaged - int(s.ion_level))
	if sname in SUBSYSTEMS:
		return usable
	# Authentic FTL 1.6 (0x63b773): Zoltan bonus power is IMMUNE to Ion Lock (clamped only by undamaged level)!
	var zoltan := get_zoltan_bonus_in_room(int(s.room))
	var reactor_part := mini(usable, int(s.power))
	return mini(undamaged, reactor_part + zoltan)


func add_system_power(sname: String) -> bool:
	if not systems.has(sname) or sname in SUBSYSTEMS:
		return false
	var s: Dictionary = systems[sname]
	if s.ion_level > 0:
		pending_sfx.append("powerUpFail")
		return false
	var usable := get_system_usable_max(sname)
	var step := 2 if sname == "shields" else 1
	if int(s.power) >= usable:
		pending_sfx.append("powerUpFail")
		return false
	if sname == "shields":
		var need := mini(step, usable - int(s.power))
		if get_available_reactor_power() < need:
			pending_sfx.append("powerUpFail")
			return false
		s.power += need
	else:
		if get_available_reactor_power() < 1:
			pending_sfx.append("powerUpFail")
			return false
		s.power += 1
	pending_sfx.append("powerUpSystem")
	return true


func remove_system_power(sname: String) -> bool:
	if not systems.has(sname) or sname in SUBSYSTEMS:
		return false
	var s: Dictionary = systems[sname]
	if s.ion_level > 0 or int(s.power) <= 0:
		pending_sfx.append("powerUpFail")
		return false
	var step := 2 if (sname == "shields" and int(s.power) >= 2) else 1
	s.power = maxi(0, int(s.power) - step)
	_enforce_weapon_drone_power()
	pending_sfx.append("powerDownSystem")
	return true


func toggle_weapon_power(idx: int) -> bool:
	if idx < 0 or idx >= weapons.size():
		return false
	var w: Dictionary = weapons[idx]
	var cost := int(w.bp.get("power", 1))
	if w.powered:
		w.powered = false
		w.charge = 0.0
		w.target_room = -1
		pending_sfx.append("powerDownSystem")
		return true
	var used := get_powered_weapon_cost()
	var wp_cap := get_effective_system_power("weapons")
	# Try auto-adding reactor power to weapons if player has spare reactor & weapon capacity
	while used + cost > wp_cap and systems.has("weapons") and int(systems.weapons.power) < get_system_usable_max("weapons") and get_available_reactor_power() > 0:
		systems.weapons.power += 1
		wp_cap = get_effective_system_power("weapons")
	if used + cost <= wp_cap:
		w.powered = true
		pending_sfx.append("powerUpSystem")
		return true
	pending_sfx.append("powerUpFail")
	return false


func get_powered_weapon_cost() -> int:
	var used := 0
	for w in weapons:
		if w.powered:
			used += int(w.bp.get("power", 1))
	return used


func toggle_drone_power(idx: int) -> bool:
	if idx < 0 or idx >= drones.size():
		return false
	var d: Dictionary = drones[idx]
	var cost := int(d.bp.get("power", 2))
	if d.powered:
		d.powered = false
		pending_sfx.append("powerDownSystem")
		return true
	if not d.active:
		if drone_parts <= 0:
			pending_sfx.append("powerUpFail")
			return false
	var used := 0
	for other in drones:
		if other.powered:
			used += int(other.bp.get("power", 2))
	var cap := get_effective_system_power("drones")
	while used + cost > cap and systems.has("drones") and int(systems.drones.power) < get_system_usable_max("drones") and get_available_reactor_power() > 0:
		systems.drones.power += 1
		cap = get_effective_system_power("drones")
	if used + cost <= cap:
		if not d.active:
			drone_parts = maxi(0, drone_parts - 1)
			d.active = true
			var dtype_act := str(d.bp.get("type", "COMBAT"))
			if dtype_act == "SHIP_REPAIR" or str(d.id).to_upper().contains("HULL"):
				d["repair_charges"] = randi_range(3, 5) # 15ShipRepairDrone (0x428b80): 3..5 hull repairs per drone part
		d.powered = true
		pending_sfx.append("powerUpSystem")
		return true
	pending_sfx.append("powerUpFail")
	return false


func _enforce_weapon_drone_power() -> void:
	var wp_cap := get_effective_system_power("weapons")
	var used := get_powered_weapon_cost()
	for i in range(weapons.size() - 1, -1, -1):
		if used <= wp_cap:
			break
		if weapons[i].powered:
			used -= int(weapons[i].bp.get("power", 1))
			weapons[i].powered = false
			weapons[i].charge = 0.0
			weapons[i].target_room = -1
	var dr_cap := get_effective_system_power("drones")
	var dused := 0
	for d in drones:
		if d.powered:
			dused += int(d.bp.get("power", 2))
	for i in range(drones.size() - 1, -1, -1):
		if dused <= dr_cap:
			break
		if drones[i].powered:
			dused -= int(drones[i].bp.get("power", 2))
			drones[i].powered = false


func activate_cloaking() -> bool:
	if not systems.has("cloaking"):
		return false
	if hacked_active and hacked_room == int(systems.cloaking.room):
		pending_sfx.append("powerUpFail")
		return false
	var p := get_effective_system_power("cloaking")
	if p <= 0 or cloak_timer > 0.0 or cloak_cooldown > 0.0:
		pending_sfx.append("powerUpFail")
		return false
	cloak_max_duration = 5.0 * float(p)
	cloak_timer = cloak_max_duration
	cloak_cooldown = 20.0
	pending_sfx.append("cloak")
	return true


# ==================== TELEPORTER BOARDING ====================
func get_crew_in_teleporter() -> Array:
	var out: Array = []
	if not systems.has("teleporter"):
		return out
	var tp_room := int(systems.teleporter.room)
	for c in crew:
		if bool(c.is_player) == is_player and c.hp > 0.0 and int(c.room_id) == tp_room:
			out.append(c)
	return out


func can_teleport_send() -> bool:
	if not systems.has("teleporter"):
		return false
	var p := get_effective_system_power("teleporter")
	if p <= 0 or teleporter_cooldown > 0.0:
		return false
	return not get_crew_in_teleporter().is_empty()


func teleport_send(target_ship: FTLShip, target_room_id: int) -> int:
	if target_ship == null or not can_teleport_send() or not target_ship.room_by_id.has(target_room_id):
		pending_sfx.append("powerUpFail")
		return 0
	if target_ship.zoltan_shield > 0 and not has_augment("ZOLTAN_BYPASS"):
		pending_popups.append({"ship": target_ship, "pos_local": target_ship.get_room_center_local(target_room_id), "text": "ZOLTAN BLOCKS TP!", "color": Color("7eff8b")})
		pending_sfx.append("powerUpFail")
		return 0
	var boarders := get_crew_in_teleporter()
	if boarders.is_empty():
		return 0
	var tp_room := int(systems.teleporter.room)
	var p := get_effective_system_power("teleporter")
	teleporter_cooldown = maxf(10.0, 25.0 - float(p) * 5.0) # Lv1=20s, Lv2=15s, Lv3=10s
	pending_teleports.append({"ship": self, "pos_local": get_room_center_local(tp_room), "incoming": false})
	pending_teleports.append({"ship": target_ship, "pos_local": target_ship.get_room_center_local(target_room_id), "incoming": true})
	var moved := 0
	for c in boarders:
		if has_augment("RECON_TELEPORTER"):
			c.hp = float(c.max_hp)
		crew.erase(c)
		c.room_id = target_room_id
		c.target_room = target_room_id
		c.path = []
		c.pos = target_ship.get_room_tile_local(target_room_id, moved)
		c.selected = false
		target_ship.crew.append(c)
		moved += 1
	target_ship._assign_room_tiles(target_room_id)
	pending_sfx.append("teleport")
	pending_popups.append({"ship": target_ship, "pos_local": target_ship.get_room_center_local(target_room_id), "text": "BOARDERS (%d)!" % moved, "color": Color("5ce1ff")})
	return moved


func teleport_retrieve(target_ship: FTLShip, target_room_id: int = -1) -> int:
	if target_ship == null or not systems.has("teleporter"):
		return 0
	var p := get_effective_system_power("teleporter")
	if p <= 0 or teleporter_cooldown > 0.0:
		pending_sfx.append("powerUpFail")
		return 0
	var tp_room := int(systems.teleporter.room)
	var returning: Array = []
	for c in target_ship.crew:
		if bool(c.is_player) == is_player and c.hp > 0.0:
			if target_room_id < 0 or int(c.room_id) == target_room_id:
				returning.append(c)
	if returning.is_empty():
		pending_sfx.append("powerUpFail")
		return 0
	teleporter_cooldown = maxf(10.0, 25.0 - float(p) * 5.0)
	var src_room := int(returning[0].room_id)
	pending_teleports.append({"ship": target_ship, "pos_local": target_ship.get_room_center_local(src_room), "incoming": false})
	pending_teleports.append({"ship": self, "pos_local": get_room_center_local(tp_room), "incoming": true})
	var moved := 0
	for c in returning:
		if has_augment("RECON_TELEPORTER"):
			c.hp = float(c.max_hp)
		target_ship.crew.erase(c)
		c.room_id = tp_room
		c.target_room = tp_room
		c.path = []
		c.pos = get_room_tile_local(tp_room, moved)
		crew.append(c)
		moved += 1
	_assign_room_tiles(tp_room)
	pending_sfx.append("teleport")
	pending_popups.append({"ship": self, "pos_local": get_room_center_local(tp_room), "text": "RECALLED (%d)" % moved, "color": Color("7eff8b")})
	return moved


func retrieve_all_boarders(target_ship: FTLShip) -> int:
	if target_ship == null:
		return 0
	var tp_room := int(systems.teleporter.room) if systems.has("teleporter") else (int(rooms[0].id) if not rooms.is_empty() else 0)
	var returning: Array = []
	for c in target_ship.crew:
		if bool(c.is_player) == is_player and c.hp > 0.0:
			returning.append(c)
	for i in range(returning.size()):
		var c: Dictionary = returning[i]
		target_ship.crew.erase(c)
		c.room_id = tp_room
		c.target_room = tp_room
		c.path = []
		c.pos = get_room_tile_local(tp_room, i)
		crew.append(c)
	if not returning.is_empty():
		_assign_room_tiles(tp_room)
	return returning.size()


# ==================== HACKING SYSTEM ====================
func launch_hacking(target_ship: FTLShip, target_room_id: int) -> bool:
	if target_ship == null or not systems.has("hacking") or not target_ship.room_by_id.has(target_room_id):
		return false
	var p := get_effective_system_power("hacking")
	if p <= 0 or drone_parts <= 0:
		pending_sfx.append("powerUpFail")
		return false
	if target_ship.zoltan_shield > 0:
		pending_popups.append({"ship": target_ship, "pos_local": target_ship.get_room_center_local(target_room_id), "text": "ZOLTAN BLOCKS HACK!", "color": Color("7eff8b")})
		pending_sfx.append("powerUpFail")
		return false
	drone_parts -= 1
	# Authentic FTL 1.6: Powered Defense Drone on target ship intercepts incoming Hacking Drone pod (unless DEFENSE_SCRAMBLER @ 0x4a2c69!)
	if not has_augment("DEFENSE_SCRAMBLER"):
		for d in target_ship.drones:
			if bool(d.powered) and str(d.bp.get("type", "")) == "DEFENSE" and float(d.cooldown) <= 0.0:
				d.cooldown = 1.15
				pending_popups.append({"ship": target_ship, "pos_local": target_ship.get_room_center_local(target_room_id), "text": "HACK POD INTERCEPTED!", "color": Color("65e8ff")})
				pending_sfx.append("hitShield1")
				return false
	hacking_target_room = target_room_id
	target_ship.hacked_room = target_room_id
	target_ship.hacked_active = false
	hacking_active_timer = 0.0
	hacking_cooldown = 0.0
	pending_popups.append({"ship": target_ship, "pos_local": target_ship.get_room_center_local(target_room_id), "text": "HACK POD ATTACHED", "color": Color("d580ff")})
	pending_sfx.append("upgradeSystem")
	return true


func activate_hacking(target_ship: FTLShip) -> bool:
	if target_ship == null or not systems.has("hacking") or hacking_target_room < 0:
		return false
	var p := get_effective_system_power("hacking")
	if p <= 0 or hacking_active_timer > 0.0 or hacking_cooldown > 0.0:
		pending_sfx.append("powerUpFail")
		return false
	# Authentic FTL 1.6 Hacking pulse durations: Lv1=4s, Lv2=7s, Lv3=10s (0x88518c)
	hacking_active_timer = float(HACKING_DURATION_SEC[clampi(p - 1, 0, HACKING_DURATION_SEC.size() - 1)])
	hacking_cooldown = 20.0
	target_ship.hacked_room = hacking_target_room
	target_ship.hacked_active = true
	# Close & lock doors connected to hacked room
	for d in target_ship.doors:
		if int(d.room_a) == hacking_target_room or int(d.room_b) == hacking_target_room:
			d.open = false
	# Immediate pulse effects for Cloaking, Teleporter, Mind Control, Hacking
	if target_ship.room_by_id.has(hacking_target_room):
		var hsys := str(target_ship.room_by_id[hacking_target_room].system)
		if hsys == "cloaking" and target_ship.cloak_timer > 0.0:
			target_ship.cloak_timer = 0.0
			pending_popups.append({"ship": target_ship, "pos_local": target_ship.get_room_center_local(hacking_target_room), "text": "CLOAK BROKEN!", "color": Color("e070ff")})
		elif hsys == "teleporter":
			var recalled := target_ship.retrieve_all_boarders(self)
			if recalled > 0:
				pending_popups.append({"ship": self, "pos_local": get_ship_bounds_local().get_center(), "text": "BOARDERS RECALLED (%d)!" % recalled, "color": Color("e070ff")})
		elif hsys == "mind":
			for c in crew:
				if float(c.get("mind_timer", 0.0)) > 0.0:
					c.mind_timer = 0.0
					c.mind_combat_mult = 1.0
					c.hp = minf(float(c.max_hp), float(c.hp))
			for tc in target_ship.crew:
				if bool(tc.is_player) == target_ship.is_player and float(tc.hp) > 0.0 and str(tc.species) != "slug" and float(tc.get("mind_timer", 0.0)) <= 0.0:
					tc.mind_timer = hacking_active_timer
					tc.mind_combat_mult = 1.0
					break
		elif hsys == "hacking":
			target_ship.hacking_active_timer = 0.0
			hacked_active = false
	pending_popups.append({"ship": target_ship, "pos_local": target_ship.get_room_center_local(hacking_target_room), "text": "HACKING PULSE!", "color": Color("e070ff")})
	pending_sfx.append("ionHit1")
	return true


func clear_hacking(target_ship: FTLShip = null) -> void:
	hacking_target_room = -1
	hacking_active_timer = 0.0
	hacking_cooldown = 0.0
	if target_ship != null:
		target_ship.hacked_room = -1
		target_ship.hacked_active = false


# ==================== MIND CONTROL SYSTEM ====================
func activate_mind_control(target_ship: FTLShip, target_room_id: int) -> bool:
	if target_ship == null or not systems.has("mind"):
		return false
	var p := get_effective_system_power("mind")
	if p <= 0 or mind_cooldown > 0.0:
		pending_sfx.append("powerUpFail")
		return false
	if target_ship != self and target_ship.zoltan_shield > 0 and not has_augment("ZOLTAN_BYPASS"):
		pending_popups.append({"ship": target_ship, "pos_local": target_ship.get_room_center_local(target_room_id), "text": "ZOLTAN BLOCKS MC!", "color": Color("7eff8b")})
		pending_sfx.append("powerUpFail")
		return false

	# Counter mind-control on own ship (Lv1 counters any enemy Mind Control level)
	if target_ship == self:
		for c in crew:
			if int(c.room_id) == target_room_id and float(c.mind_timer) > 0.0:
				c.mind_timer = 0.0
				c.mind_combat_mult = 1.0
				c.hp = minf(float(c.max_hp), float(c.hp))
				mind_cooldown = 20.0
				pending_popups.append({"ship": self, "pos_local": c.pos, "text": "MC CLEARED!", "color": Color("7eff8b")})
				pending_sfx.append("upgradeSystem")
				return true
		pending_sfx.append("powerUpFail")
		return false

	# Mind-control an enemy crew member on target_ship (Authentic FTL 1.6: Slugs are immune; tables 0x885220..0x88526c)
	var saw_slug := false
	for c in target_ship.crew:
		if int(c.room_id) == target_room_id and c.hp > 0.0 and bool(c.is_player) != is_player and float(c.mind_timer) <= 0.0:
			if str(c.species) == "slug":
				saw_slug = true
				continue
			var idx := clampi(p - 1, 0, 2)
			var dur := float(MIND_DURATION_SEC[idx])
			var bonus_hp := float(MIND_BONUS_HP[idx])
			var c_mult := float(MIND_COMBAT_MULT[idx])
			c.mind_timer = dur
			c.mind_combat_mult = c_mult
			if bonus_hp > 0.0:
				c.hp = minf(float(c.max_hp) + bonus_hp, float(c.hp) + bonus_hp)
			mind_active_timer = dur
			mind_cooldown = 20.0
			pending_popups.append({"ship": target_ship, "pos_local": c.pos, "text": "MIND CONTROL!", "color": Color("d580ff")})
			pending_sfx.append("ionHit1")
			return true
	if saw_slug:
		pending_popups.append({"ship": target_ship, "pos_local": target_ship.get_room_center_local(target_room_id), "text": "SLUG IMMUNE!", "color": Color("ffd54f")})
	pending_sfx.append("powerUpFail")
	return false


func install_system(sname: String) -> bool:
	if systems.has(sname):
		return false
	var target_room := -1
	var inherited_power := 0
	if sname == "clonebay" and systems.has("medbay"):
		# Replace medbay with clonebay in the same room (authentic FTL!)
		target_room = int(systems.medbay.room)
		inherited_power = mini(1, int(systems.medbay.power))
		systems.erase("medbay")
		room_by_id[target_room].system = ""
	else:
		for r in rooms:
			if str(r.system).is_empty():
				target_room = int(r.id)
				break
	if target_room < 0:
		return false
	var sbp: Dictionary = db.systems.get(sname, {})
	var default_max := 2 if sname == "battery" else 3
	var max_lvl := int(sbp.get("maxPower", default_max))
	systems[sname] = {
		"id": sname,
		"room": target_room,
		"level": 1,
		"max_level": max_lvl,
		"power": inherited_power,
		"damage": 0,
		"ion_level": 0,
		"ion_timer": 0.0,
		"img": "room_%s" % sname,
		"slot_dir": "up",
		"slot_num": 0,
		"manned_by": -1,
	}
	room_by_id[target_room].system = sname
	if sname == "drones":
		drone_slots = maxi(2, drone_slots)
	pending_sfx.append("upgradeSystem")
	return true


# ==================== BEAM LINE-BOX INTERSECTION ====================
func compute_beam_rooms(p0: Vector2, p1: Vector2) -> Array[int]:
	var hits: Array = [] # [{id, t}]
	var d: Vector2 = p1 - p0
	for r in rooms:
		var rect := get_room_rect_local(r)
		var t_enter := _segment_rect_enter_t(p0, d, rect)
		if t_enter >= 0.0:
			hits.append({"id": int(r.id), "t": t_enter})
	hits.sort_custom(func(a, b): return float(a.t) < float(b.t))
	var out: Array[int] = []
	for h in hits:
		out.append(int(h.id))
	return out


static func _segment_rect_enter_t(p0: Vector2, d: Vector2, rect: Rect2) -> float:
	var tmin := 0.0
	var tmax := 1.0
	# X slab
	if absf(d.x) < 1e-6:
		if p0.x < rect.position.x or p0.x > rect.end.x:
			return -1.0
	else:
		var tx1 := (rect.position.x - p0.x) / d.x
		var tx2 := (rect.end.x - p0.x) / d.x
		tmin = maxf(tmin, minf(tx1, tx2))
		tmax = minf(tmax, maxf(tx1, tx2))
	# Y slab
	if absf(d.y) < 1e-6:
		if p0.y < rect.position.y or p0.y > rect.end.y:
			return -1.0
	else:
		var ty1 := (rect.position.y - p0.y) / d.y
		var ty2 := (rect.end.y - p0.y) / d.y
		tmin = maxf(tmin, minf(ty1, ty2))
		tmax = minf(tmax, maxf(ty1, ty2))
	if tmax >= tmin and tmax >= 0.0 and tmin <= 1.0:
		return tmin
	return -1.0


func get_evasion() -> int:
	# Authentic FTL 1.6 Evasion (0x885ee0 engine table + 0x8847fc manning + independent Cloak +60%)
	var cloak_bonus := 60 if cloak_timer > 0.0 else 0
	# Active hacking on engines or piloting drops base evasion to 0% (Cloaking bonus remains independent)
	if hacked_active and hacked_room >= 0 and room_by_id.has(hacked_room):
		var hsys := str(room_by_id[hacked_room].system)
		if hsys == "engines" or hsys == "pilot":
			return clampi(cloak_bonus, 0, 100)
	if not systems.has("pilot") or not systems.has("engines"):
		return clampi(cloak_bonus, 0, 100)
	var pilot_lvl := get_effective_system_power("pilot")
	var eng_pwr := get_effective_system_power("engines")
	if pilot_lvl <= 0 or eng_pwr <= 0:
		return clampi(cloak_bonus, 0, 100)
	var pilot_manned := int(systems.pilot.manned_by) != -1
	var eng_manned := int(systems.engines.manned_by) != -1
	var base := int(ENGINE_EVASION[clampi(eng_pwr - 1, 0, ENGINE_EVASION.size() - 1)])
	if eng_manned:
		var eng_crew := _get_crew_by_id(int(systems.engines.manned_by))
		var e_tier := get_crew_skill_tier(eng_crew, "engines")
		base += int(PILOT_ENG_MANNING[e_tier])
	if pilot_manned:
		var pilot_crew := _get_crew_by_id(int(systems.pilot.manned_by))
		var p_tier := get_crew_skill_tier(pilot_crew, "pilot")
		base += int(PILOT_ENG_MANNING[p_tier])
	else:
		# Autopilot reduction: Lv1 -> 0%, Lv2 -> 50%, Lv3 -> 80%
		if pilot_lvl == 1:
			base = 0
		elif pilot_lvl == 2:
			base = int(floor(float(base) * 0.5))
		else:
			base = int(floor(float(base) * 0.8))
	return clampi(base + cloak_bonus, 0, 100)


func get_average_oxygen() -> float:
	if rooms.is_empty():
		return 100.0
	var sum := 0.0
	for r in rooms:
		sum += float(r.oxygen)
	return sum / float(rooms.size())


func get_system_upgrade_cost(sname: String) -> int:
	if not systems.has(sname):
		return 999
	var s: Dictionary = systems[sname]
	if int(s.level) >= int(s.max_level):
		return -1
	var sbp: Dictionary = db.systems.get(sname, {})
	var arr: Array = sbp.get("upgradeCost", [20, 30, 40, 60, 80, 100, 120])
	var idx := clampi(int(s.level) - 1, 0, arr.size() - 1)
	return int(arr[idx])


func upgrade_system(sname: String) -> bool:
	var cost := get_system_upgrade_cost(sname)
	if cost < 0 or scrap < cost:
		return false
	scrap -= cost
	systems[sname].level += 1
	pending_sfx.append("upgradeSystem")
	return true


func get_reactor_upgrade_cost() -> int:
	if reactor_max >= 25:
		return -1
	if reactor_max < 10:
		return 20
	if reactor_max < 15:
		return 25
	if reactor_max < 20:
		return 30
	return 35


func upgrade_reactor() -> bool:
	var cost := get_reactor_upgrade_cost()
	if cost < 0 or scrap < cost:
		return false
	scrap -= cost
	reactor_max += 1
	pending_sfx.append("upgradeSystem")
	return true


# ==================== ROOM GEOMETRY & PATHFINDING ====================
func get_room_rect_local(room: Dictionary) -> Rect2:
	return Rect2(float(room.x) * CELL_SIZE, float(room.y) * CELL_SIZE, float(room.w) * CELL_SIZE, float(room.h) * CELL_SIZE)


func get_room_center_local(room_id: int) -> Vector2:
	if not room_by_id.has(room_id):
		return Vector2.ZERO
	var r: Dictionary = room_by_id[room_id]
	return Vector2((float(r.x) + float(r.w) * 0.5) * CELL_SIZE, (float(r.y) + float(r.h) * 0.5) * CELL_SIZE)


func get_room_tile_local(room_id: int, tile_idx: int) -> Vector2:
	if not room_by_id.has(room_id):
		return Vector2.ZERO
	var r: Dictionary = room_by_id[room_id]
	var total := maxi(1, int(r.w) * int(r.h))
	var idx := tile_idx % total
	var tx := idx % int(r.w)
	var ty := idx / int(r.w)
	return Vector2((float(r.x) + float(tx) + 0.5) * CELL_SIZE, (float(r.y) + float(ty) + 0.5) * CELL_SIZE)


func get_ship_bounds_local() -> Rect2:
	if rooms.is_empty():
		return Rect2(0, 0, 420, 240)
	var rect := get_room_rect_local(rooms[0])
	for i in range(1, rooms.size()):
		rect = rect.merge(get_room_rect_local(rooms[i]))
	return rect


func find_room_at_local(pt: Vector2) -> int:
	for r in rooms:
		if get_room_rect_local(r).has_point(pt):
			return int(r.id)
	return -1


func find_door_at_local(pt: Vector2, radius: float = 11.0) -> int:
	for i in range(doors.size()):
		var d: Dictionary = doors[i]
		var dp := get_door_center_local(d)
		if dp.distance_to(pt) <= radius:
			return i
	return -1


func get_door_center_local(d: Dictionary) -> Vector2:
	if bool(d.vertical):
		return Vector2(float(d.x) * CELL_SIZE, (float(d.y) + 0.5) * CELL_SIZE)
	return Vector2((float(d.x) + 0.5) * CELL_SIZE, float(d.y) * CELL_SIZE)


func toggle_door(door_idx: int) -> void:
	if door_idx < 0 or door_idx >= doors.size():
		return
	doors[door_idx].open = not bool(doors[door_idx].open)
	if not bool(doors[door_idx].open):
		doors[door_idx].hp = get_door_max_hp()
	pending_sfx.append("doorOpen" if doors[door_idx].open else "doorClose")


func get_door_max_hp() -> float:
	# Authentic FTL 1.6 4Door HP levels (Lv1=30, Lv2=60, Lv3=120, Manned Lv3/Lv4=240)
	var dlvl := get_effective_system_power("doors")
	var manned := systems.has("doors") and int(systems.doors.manned_by) != -1
	var eff := clampi(dlvl + (1 if manned else 0), 1, DOOR_HP_BY_LEVEL.size())
	return float(DOOR_HP_BY_LEVEL[eff - 1])


func sell_weapon(idx: int, from_cargo: bool = false) -> int:
	if from_cargo:
		if idx < 0 or idx >= cargo_weapons.size():
			return 0
		var wid := cargo_weapons[idx]
		var val := maxi(1, int(floor(float(db.weapons.get(wid, {}).get("cost", 40)) * 0.5)))
		cargo_weapons.remove_at(idx)
		scrap += val
		pending_sfx.append("upgradeSystem")
		return val
	if idx < 0 or idx >= weapons.size():
		return 0
	var w: Dictionary = weapons[idx]
	var val := maxi(1, int(floor(float(w.bp.get("cost", 40)) * 0.5)))
	weapons.remove_at(idx)
	scrap += val
	pending_sfx.append("upgradeSystem")
	return val


func sell_drone(idx: int, from_cargo: bool = false) -> int:
	if from_cargo:
		if idx < 0 or idx >= cargo_drones.size():
			return 0
		var did := cargo_drones[idx]
		var val := maxi(1, int(floor(float(db.drones.get(did, {}).get("cost", 40)) * 0.5)))
		cargo_drones.remove_at(idx)
		scrap += val
		pending_sfx.append("upgradeSystem")
		return val
	if idx < 0 or idx >= drones.size():
		return 0
	var d: Dictionary = drones[idx]
	var val := maxi(1, int(floor(float(d.bp.get("cost", 40)) * 0.5)))
	drones.remove_at(idx)
	scrap += val
	pending_sfx.append("upgradeSystem")
	return val


func sell_augment(idx: int) -> int:
	if idx < 0 or idx >= augments.size():
		return 0
	var aid := augments[idx]
	var val := maxi(1, int(floor(float(db.augments.get(aid, {}).get("cost", 40)) * 0.5)))
	augments.remove_at(idx)
	scrap += val
	pending_sfx.append("upgradeSystem")
	return val


func get_door_between(room_a: int, room_b: int) -> int:
	for i in range(doors.size()):
		var d: Dictionary = doors[i]
		if (int(d.room_a) == room_a and int(d.room_b) == room_b) or (int(d.room_a) == room_b and int(d.room_b) == room_a):
			return i
	return -1


func recover_active_drones() -> int:
	if not has_augment("DRONE_RECOVERY"):
		return 0
	var recovered := 0
	for d in drones:
		if bool(d.powered):
			var dtype := str(d.bp.get("type", "COMBAT"))
			if dtype in ["COMBAT", "DEFENSE", "SHIELD"]:
				drone_parts += 1
				recovered += 1
	return recovered


func set_all_doors_open(open_state: bool, include_airlocks: bool = false) -> void:
	var changed := false
	for d in doors:
		if not include_airlocks and bool(d.airlock):
			continue
		if bool(d.open) != open_state:
			d.open = open_state
			changed = true
	if changed:
		pending_sfx.append("doorOpen" if open_state else "doorClose")


func open_all_doors_smart() -> void:
	# First press opens interior doors; if all interior doors already open, opens airlocks too (authentic FTL!)
	var any_interior_closed := false
	for d in doors:
		if not bool(d.airlock) and not bool(d.open):
			any_interior_closed = true
			break
	set_all_doors_open(true, not any_interior_closed)


func find_room_path(start_room: int, goal_room: int) -> Array[int]:
	if start_room == goal_room:
		return []
	var adj: Dictionary = {}
	for d in doors:
		var a := int(d.room_a)
		var b := int(d.room_b)
		if a < 0 or b < 0:
			continue
		if not adj.has(a): adj[a] = []
		if not adj.has(b): adj[b] = []
		adj[a].append(b)
		adj[b].append(a)
	var queue: Array[int] = [start_room]
	var prev: Dictionary = {start_room: -1}
	while not queue.is_empty():
		var cur: int = queue.pop_front()
		if cur == goal_room:
			break
		for nxt in adj.get(cur, []):
			if not prev.has(nxt):
				prev[nxt] = cur
				queue.append(nxt)
	if not prev.has(goal_room):
		return []
	var path: Array[int] = []
	var cur := goal_room
	while cur != start_room and cur != -1:
		path.push_front(cur)
		cur = int(prev[cur])
	return path


func command_crew_to_room(crew_member: Dictionary, dest_room: int) -> void:
	if not room_by_id.has(dest_room):
		return
	crew_member.target_room = dest_room
	crew_member.path = find_room_path(int(crew_member.room_id), dest_room)


func save_crew_stations() -> int:
	var saved := 0
	for c in crew:
		if bool(c.is_player) == is_player and float(c.hp) > 0.0:
			c["home_room"] = int(c.room_id)
			saved += 1
	return saved


func return_crew_to_stations() -> int:
	var moved := 0
	for c in crew:
		if bool(c.is_player) == is_player and float(c.hp) > 0.0:
			var hr := int(c.get("home_room", int(c.room_id)))
			if room_by_id.has(hr) and int(c.room_id) != hr:
				command_crew_to_room(c, hr)
				moved += 1
	return moved


func dismiss_crew(cid: int) -> bool:
	var living := 0
	for c in crew:
		if bool(c.is_player) == is_player and float(c.hp) > 0.0:
			living += 1
	if living <= 1:
		return false
	for i in range(crew.size()):
		if int(crew[i].id) == cid and bool(crew[i].is_player) == is_player:
			crew.remove_at(i)
			return true
	return false


func remove_random_crew(allow_clone: bool = true) -> String:
	# Authentic FTL 1.6 <removeCrew> (0x5e69d3): revives via Clonebay unless <clone>false</clone>!
	var friendly: Array = []
	for c in crew:
		if bool(c.is_player) == is_player and float(c.hp) > 0.0:
			friendly.append(c)
	if friendly.is_empty():
		return ""
	var victim: Dictionary = friendly[randi() % friendly.size()]
	var vname := str(victim.name)
	crew.erase(victim)
	var cb_lvl := get_effective_system_power("clonebay") if systems.has("clonebay") else 0
	if allow_clone and systems.has("clonebay") and (cb_lvl > 0 or has_augment("BACKUP_DNA")):
		var clone_dur := float(CLONE_TIME_SEC[clampi(maxi(1, cb_lvl) - 1, 0, CLONE_TIME_SEC.size() - 1)])
		victim.hp = 0.0
		victim.path = []
		clone_queue.append({"crew": victim, "timer": clone_dur, "max_time": clone_dur, "death_timer": 3.0})
		return "%s (Cloning)" % vname
	return vname


func apply_event_status(st_type: String, sys_name: String, amount: int) -> void:
	# Authentic FTL 1.6 <status type="limit|divide|loss|clear" system="..." amount="..."/> (0x5e745a)
	if not systems.has(sys_name):
		return
	var s: Dictionary = systems[sys_name]
	if st_type == "clear":
		s.ion_level = 0
		s.ion_timer = 0.0
		return
	var cur_usable := get_system_usable_max(sys_name)
	var lock_bars := 0
	if st_type == "limit":
		lock_bars = maxi(0, cur_usable - maxi(0, amount))
	elif st_type == "divide":
		var div := maxi(1, amount)
		lock_bars = maxi(0, cur_usable - int(cur_usable / div))
	elif st_type == "loss":
		lock_bars = maxi(0, amount)
	if lock_bars > 0:
		s.ion_timer = minf(ION_MAX_LOCK_SEC, maxf(float(s.ion_timer), float(lock_bars) * ION_SEC_PER_DMG))
		s.ion_level = mini(int(s.level), int(ceil(float(s.ion_timer) / ION_SEC_PER_DMG)))
		if int(s.power) > get_system_usable_max(sys_name):
			s.power = get_system_usable_max(sys_name)
		_enforce_weapon_drone_power()


func _assign_room_tiles(room_id: int) -> void:
	var friendly_idx := 0
	var enemy_idx := 0
	for c in crew:
		if int(c.room_id) == room_id and c.hp > 0:
			if c.is_player == is_player:
				c.tile_idx = friendly_idx
				friendly_idx += 1
			else:
				c.tile_idx = enemy_idx
				enemy_idx += 1


func _get_crew_by_id(cid: int) -> Dictionary:
	for c in crew:
		if int(c.id) == cid:
			return c
	return {}


# ==================== MAIN SIMULATION TICK ====================
func step(delta: float, enemy_ship: FTLShip, in_combat: bool) -> void:
	# 1. Ion timers & system damage clamping (Authentic FTL 1.6: 5s per ion stack, capped at 25s)
	for sname in systems.keys():
		var s: Dictionary = systems[sname]
		if float(s.ion_timer) > 0.0:
			s.ion_timer = maxf(0.0, float(s.ion_timer) - delta)
			if float(s.ion_timer) <= 0.0:
				s.ion_level = 0
			else:
				s.ion_level = mini(int(s.level), int(ceil(float(s.ion_timer) / ION_SEC_PER_DMG)))
		var usable := get_system_usable_max(sname)
		if int(s.power) > usable:
			s.power = usable
	_enforce_weapon_drone_power()

	# 2. Cloaking / Teleporter / Hacking / Mind Control timers
	if cloak_timer > 0.0:
		cloak_timer = maxf(0.0, cloak_timer - delta)
	elif cloak_cooldown > 0.0:
		cloak_cooldown = maxf(0.0, cloak_cooldown - delta)

	if teleporter_cooldown > 0.0:
		teleporter_cooldown = maxf(0.0, teleporter_cooldown - delta)

	if hacking_active_timer > 0.0:
		hacking_active_timer = maxf(0.0, hacking_active_timer - delta)
		if enemy_ship != null and in_combat:
			_apply_hacking_pulse(delta, enemy_ship)
		if hacking_active_timer <= 0.0 and enemy_ship != null:
			enemy_ship.hacked_active = false
	elif hacking_cooldown > 0.0:
		hacking_cooldown = maxf(0.0, hacking_cooldown - delta)

	if mind_active_timer > 0.0:
		mind_active_timer = maxf(0.0, mind_active_timer - delta)
	elif mind_cooldown > 0.0:
		mind_cooldown = maxf(0.0, mind_cooldown - delta)

	if battery_timer > 0.0:
		battery_timer = maxf(0.0, battery_timer - delta)
		if battery_timer <= 0.0:
			battery_bonus = 0
			_clamp_reactor_power()
	elif battery_cooldown > 0.0:
		battery_cooldown = maxf(0.0, battery_cooldown - delta)

	_clamp_reactor_power()

	# 3. FTL Drive charge (Authentic FTL 1.6 binary formula 0x63f5a9..0x63f738; halted when pilot/engines hacked)
	var ftl_hacked := hacked_active and hacked_room >= 0 and room_by_id.has(hacked_room) and str(room_by_id[hacked_room].system) in ["pilot", "engines"]
	if ftl_charge < 1.0 and not ftl_hacked:
		var enemy_jam := (enemy_ship != null and in_combat and enemy_ship.has_augment("FTL_JAMMER"))
		var rate := get_ftl_charge_rate(enemy_jam)
		if rate > 0.0:
			ftl_charge = minf(1.0, ftl_charge + rate * delta)

	# 4. Shields recharge (Authentic FTL 1.6: 0x6346e7 layer rate = 1 + max(0, layers-1)/6, 0x884814 manning 1.1/1.2/1.3)
	for r in rooms:
		if float(r.get("lockdown_timer", 0.0)) > 0.0:
			r.lockdown_timer = maxf(0.0, float(r.lockdown_timer) - delta)

	shield_max_layers = get_effective_system_power("shields") / 2
	var shields_hacked := hacked_active and systems.has("shields") and hacked_room == int(systems.shields.room)
	if shield_layers > shield_max_layers:
		shield_layers = shield_max_layers
		shield_charge = 0.0
	elif shield_layers < shield_max_layers and not shields_hacked:
		var sh_manned := systems.has("shields") and int(systems.shields.manned_by) != -1
		var mult := 1.0
		if sh_manned:
			var sc := _get_crew_by_id(int(systems.shields.manned_by))
			var stier := get_crew_skill_tier(sc, "shields")
			mult = float(SHIELD_MANNING_MULT[stier])
		var sh_aug := count_augment("SHIELD_RECHARGE")
		if sh_aug > 0:
			mult *= (1.0 + 0.15 * float(sh_aug))
		var layer_rate := 1.0 + float(maxi(0, shield_layers - 1)) / 6.0
		shield_charge += (delta * layer_rate * mult) / 2.0
		if shield_charge >= 1.0:
			shield_charge = 0.0
			shield_layers += 1
			if sh_manned:
				var sc2 := _get_crew_by_id(int(systems.shields.manned_by))
				if not sc2.is_empty():
					sc2.skills.shields = int(sc2.skills.shields) + 1

	# 5. Atmosphere (Oxygen, Airlocks, Fires, Breaches)
	_step_atmosphere(delta)

	# 6. Crew (movement, manning, repair, firefighting, healing, combat) & Clonebay queue
	_step_crew(delta)
	_step_clone_queue(delta)

	# 7. Weapons, Artillery & Drones charging & firing (utility Repair/ShipRepair/Battle drones also run out of combat!)
	var target_cloaked := (enemy_ship != null and enemy_ship.cloak_timer > 0.0)
	if in_combat and enemy_ship != null and enemy_ship.hull > 0:
		_step_weapons(delta, enemy_ship, target_cloaked)
		_step_artillery(delta, enemy_ship)
		_step_drones(delta, enemy_ship)
	else:
		_step_drones(delta, null)
		for w in weapons:
			w.charge = maxf(0.0, float(w.charge) - delta * 2.0)
			w.fire_anim = maxf(0.0, float(w.fire_anim) - delta * 2.0)
			w.chain_count = 0
			w.charge_level = 0
		artillery_charge = maxf(0.0, artillery_charge - delta * 2.0)

	# 8. Enemy AI
	if not is_player and in_combat and enemy_ship != null and hull > 0 and enemy_ship.hull > 0:
		_step_enemy_ai(delta, enemy_ship)


func _apply_hacking_pulse(delta: float, target_ship: FTLShip) -> void:
	if target_ship == null or hacking_target_room < 0 or not target_ship.room_by_id.has(hacking_target_room):
		return
	target_ship.hacked_room = hacking_target_room
	target_ship.hacked_active = true
	var r: Dictionary = target_ship.room_by_id[hacking_target_room]
	var hsys := str(r.system)
	if hsys == "shields":
		target_ship.shield_charge = maxf(0.0, target_ship.shield_charge - delta * 1.4)
		if target_ship.shield_layers > 0:
			r.sabotage_progress = float(r.get("sabotage_progress", 0.0)) + delta * 0.50
			if float(r.sabotage_progress) >= 1.0:
				r.sabotage_progress = 0.0
				target_ship.shield_layers = maxi(0, target_ship.shield_layers - 1)
				target_ship.shield_charge = 0.0
	elif hsys == "weapons":
		for w in target_ship.weapons:
			w.charge = maxf(0.0, float(w.charge) - delta * 1.65)
	elif hsys == "artillery":
		target_ship.artillery_charge = maxf(0.0, target_ship.artillery_charge - delta * 1.5)
	elif hsys == "medbay":
		for c in target_ship.crew:
			if int(c.room_id) == hacking_target_room and c.hp > 0.0:
				c.hp -= 12.0 * delta
	elif hsys == "cloaking":
		target_ship.cloak_timer = 0.0
	elif hsys == "drones":
		for d in target_ship.drones:
			if bool(d.powered):
				d.cooldown = maxf(float(d.cooldown), 1.0)


func _step_atmosphere(delta: float) -> void:
	var o2_pwr := get_effective_system_power("oxygen")
	var o2_hacked := hacked_active and systems.has("oxygen") and hacked_room == int(systems.oxygen.room)
	# Authentic FTL 1.6 O2 rates (0x62cf00 / 0x88516c..0x885178): unpowered -1.2%/s, Lv1 +1.2%/s, Lv2 +4.8%/s, Lv3 +7.2%/s, hacked -6.0%/s ship-wide
	for r in rooms:
		var o2_delta := -1.2
		if o2_hacked:
			o2_delta = -6.0
		elif o2_pwr == 1:
			o2_delta = 1.2
		elif o2_pwr == 2:
			o2_delta = 4.8
		elif o2_pwr >= 3:
			o2_delta = 7.2
		if int(r.breach) > 0:
			o2_delta -= 14.0 * float(r.breach)
		if int(r.fires) > 0:
			o2_delta -= 3.5 * float(r.fires)
		# Lanius crew drain O2
		for c in crew:
			if int(c.room_id) == int(r.id) and c.hp > 0 and c.species == "anaerobic":
				o2_delta -= 6.0
		r.oxygen = clampf(float(r.oxygen) + o2_delta * delta, 0.0, 100.0)

	# Door equalization & airlock vacuum venting
	for d in doors:
		if not bool(d.open):
			continue
		if bool(d.airlock):
			var rid := int(d.room_a) if int(d.room_a) >= 0 else int(d.room_b)
			if room_by_id.has(rid):
				room_by_id[rid].oxygen = maxf(0.0, float(room_by_id[rid].oxygen) - 32.0 * delta)
		elif room_by_id.has(int(d.room_a)) and room_by_id.has(int(d.room_b)):
			var ra: Dictionary = room_by_id[int(d.room_a)]
			var rb: Dictionary = room_by_id[int(d.room_b)]
			var diff := (float(ra.oxygen) - float(rb.oxygen)) * minf(0.45, delta * 3.8)
			ra.oxygen = clampf(float(ra.oxygen) - diff, 0.0, 100.0)
			rb.oxygen = clampf(float(rb.oxygen) + diff, 0.0, 100.0)

	# Fires, Fire Suppression, Slug Repair Gel, Fire Spread & Unmanned Auto-Repair
	for r in rooms:
		if int(r.breach) > 0 and has_augment("SLUG_GEL"):
			r.breach_hp = maxf(0.0, float(r.breach_hp) - 12.0 * delta)
			if float(r.breach_hp) <= 0.0:
				r.breach = 0
		if is_unmanned and int(r.breach) == 0 and not str(r.system).is_empty() and systems.has(str(r.system)):
			var us: Dictionary = systems[str(r.system)]
			if int(us.damage) > 0:
				r.repair_progress = float(r.repair_progress) + 0.06 * delta
				if float(r.repair_progress) >= 1.0:
					r.repair_progress = 0.0
					us.damage = maxi(0, int(us.damage) - 1)
		if int(r.fires) <= 0:
			continue
		if has_augment("FIRE_EXTINGUISHERS"):
			r.fire_hp = maxf(0.0, float(r.fire_hp) - 18.0 * delta)
			if float(r.fire_hp) <= 0.0:
				r.fires = 0
				continue
		if float(r.oxygen) < 8.0 or int(r.breach) > 0:
			r.fire_hp = maxf(0.0, float(r.fire_hp) - 35.0 * delta)
			if float(r.fire_hp) <= 0.0:
				r.fires = 0
		else:
			# Fire damages system in room slowly (Authentic FTL: +1 hull damage when system reaches full destruction)
			var sname := str(r.system)
			if not sname.is_empty() and systems.has(sname) and int(systems[sname].damage) < int(systems[sname].level):
				r.repair_progress = float(r.repair_progress) - 0.08 * float(r.fires) * delta
				if float(r.repair_progress) <= -1.0:
					r.repair_progress = 0.0
					apply_system_damage(sname, 1)
					if int(systems[sname].damage) >= int(systems[sname].level):
						hull = maxi(0, hull - 1)
						pending_popups.append({"ship": self, "pos_local": get_room_center_local(int(r.id)), "text": "FIRE DESTROYED -1!", "color": Color("ff5c5c")})
			# Fire spread through open doors to adjacent oxygenated rooms
			r["fire_spread"] = float(r.get("fire_spread", 0.0)) + 0.07 * float(r.fires) * delta
			if float(r["fire_spread"]) >= 1.0:
				r["fire_spread"] = 0.0
				for d in doors:
					if not bool(d.open) or bool(d.airlock):
						continue
					var adj_id := int(d.room_b) if int(d.room_a) == int(r.id) else (int(d.room_a) if int(d.room_b) == int(r.id) else -1)
					if adj_id >= 0 and room_by_id.has(adj_id):
						var ar: Dictionary = room_by_id[adj_id]
						if int(ar.fires) == 0 and float(ar.oxygen) > 15.0 and int(ar.breach) == 0:
							ar.fires = 1
							ar.fire_hp = 100.0
							break


func _step_crew(delta: float) -> void:
	for sname in systems.keys():
		systems[sname].manned_by = -1

	var dead_ids: Array[int] = []
	for c in crew:
		if c.hp <= 0.0:
			dead_ids.append(int(c.id))
			continue
		c.anim_t = float(c.anim_t) + delta
		if float(c.get("lockdown_cooldown", 0.0)) > 0.0:
			c.lockdown_cooldown = maxf(0.0, float(c.lockdown_cooldown) - delta)
		if float(c.get("mind_timer", 0.0)) > 0.0:
			c.mind_timer = maxf(0.0, float(c.mind_timer) - delta)
			if float(c.mind_timer) <= 0.0:
				c.mind_combat_mult = 1.0
				c.hp = minf(float(c.max_hp), float(c.hp))
		if float(c.stun_timer) > 0.0:
			c.stun_timer = maxf(0.0, float(c.stun_timer) - delta)
			c.state = "idle"
			continue

		var eff_player := _crew_effective_player(c)
		var belongs_to_ship := (eff_player == is_player)
		var r: Dictionary = room_by_id.get(int(c.room_id), {})
		# Suffocation & fire damage (0x47c380..0x47c4b0: <5% O2 = 6.4 HP/s, Crystal/O2_MASKS 50%, Medbay 6.4/9.6/19.2 HP/s, NANO_MEDBAY 25% of Medbay rate)
		if not r.is_empty():
			if float(r.oxygen) < SUFFOCATION_O2_THRESHOLD and not bool(c.no_o2):
				var suff_dps := SUFFOCATION_DPS
				if str(c.species) == "crystal":
					suff_dps *= 0.5
				if belongs_to_ship and has_augment("O2_MASKS"):
					suff_dps *= 0.5
				c.hp -= suff_dps * delta
			if int(r.fires) > 0 and not bool(c.fire_immune):
				c.hp -= 4.5 * float(r.fires) * delta
			# Medbay healing (Lv1: 6.4, Lv2: 9.6, Lv3: 19.2 HP/s; NANO_MEDBAY heals 25% of active Medbay rate ship-wide!)
			var med_hacked := hacked_active and systems.has("medbay") and hacked_room == int(systems.medbay.room)
			var med_p := get_effective_system_power("medbay")
			if belongs_to_ship and med_p > 0 and not med_hacked:
				var med_rate := float(MEDBAY_HEAL_PER_SEC[clampi(med_p - 1, 0, MEDBAY_HEAL_PER_SEC.size() - 1)])
				if str(r.system) == "medbay":
					c.hp = minf(float(c.max_hp), float(c.hp) + med_rate * delta)
				elif has_augment("NANO_MEDBAY"):
					c.hp = minf(float(c.max_hp), float(c.hp) + med_rate * 0.25 * delta)

		# Movement along path (blocked by Crystal Lockdown OR closed Blast Doors; boosted +25%/stack by CREW_STIMS @ 0x47b47c)
		var eff_move_speed := float(c.move_speed) * (1.0 + 0.25 * float(count_augment("CREW_STIMS")) if belongs_to_ship else 1.0)
		if not c.path.is_empty():
			var next_rid := int(c.path[0])
			var cur_locked := float(r.get("lockdown_timer", 0.0)) > 0.0 if not r.is_empty() else false
			var nxt_locked := float(room_by_id.get(next_rid, {}).get("lockdown_timer", 0.0)) > 0.0
			var door_blocked := false
			if not belongs_to_ship and not cur_locked and not nxt_locked:
				var didx := get_door_between(int(c.room_id), next_rid)
				if didx >= 0 and not bool(doors[didx].open):
					door_blocked = true
					c.state = "fight"
					doors[didx].hp = maxf(0.0, float(doors[didx].hp) - 16.0 * float(c.combat_mult) * delta)
					if float(doors[didx].hp) <= 0.0:
						doors[didx].open = true
						doors[didx].hp = get_door_max_hp()
						pending_sfx.append("doorOpen")
			if not cur_locked and not nxt_locked and not door_blocked:
				var dest := get_room_center_local(next_rid)
				var delta_v: Vector2 = dest - c.pos
				if delta_v.length() <= eff_move_speed * delta + 2.0:
					c.pos = dest
					c.room_id = next_rid
					c.path.pop_front()
					_assign_room_tiles(next_rid)
				else:
					c.facing = delta_v.normalized()
					c.pos += c.facing * eff_move_speed * delta
				c.state = "walk"
				continue
		else:
			# Settle onto tile in current room
			var tile_pos := get_room_tile_local(int(c.room_id), int(c.tile_idx))
			var dv: Vector2 = tile_pos - c.pos
			if dv.length() > 2.5:
				c.facing = dv.normalized()
				c.pos += c.facing * minf(dv.length(), eff_move_speed * delta)
				c.state = "walk"
				continue

		# In-room actions (Combat -> Sabotage if boarder/MC -> Fire -> Breach -> Repair -> Manning)
		var hostile := _find_hostile_in_room(int(c.room_id), eff_player)
		if not hostile.is_empty():
			c.state = "fight"
			var c_tier := get_crew_skill_tier(c, "combat")
			var dps := 6.5 * float(c.combat_mult) * float(COMBAT_MASTERY_MULT[c_tier]) * float(c.get("mind_combat_mult", 1.0))
			var prev_hp := float(hostile.hp)
			hostile.hp -= dps * delta
			if prev_hp > 0.0 and float(hostile.hp) <= 0.0:
				c.skills.combat = int(c.skills.combat) + 1
			continue

		if not r.is_empty() and not belongs_to_ship:
			# Boarder or Mind-Controlled crew sabotages enemy system (Authentic FTL: +1 hull dmg ONLY when last bar destroyed!)
			var sname := str(r.system)
			if not sname.is_empty() and systems.has(sname) and int(systems[sname].damage) < int(systems[sname].level):
				c.state = "sabotage"
				var c_tier := get_crew_skill_tier(c, "combat")
				r.sabotage_progress = float(r.get("sabotage_progress", 0.0)) + 0.16 * float(c.combat_mult) * float(COMBAT_MASTERY_MULT[c_tier]) * float(c.get("mind_combat_mult", 1.0)) * delta
				if float(r.sabotage_progress) >= 1.0:
					r.sabotage_progress = 0.0
					apply_system_damage(sname, 1)
					if int(systems[sname].damage) >= int(systems[sname].level):
						hull = maxi(0, hull - 1)
						pending_popups.append({"ship": self, "pos_local": get_room_center_local(int(r.id)), "text": "SYS DESTROYED -1!", "color": Color("ff5c5c")})
					else:
						pending_popups.append({"ship": self, "pos_local": get_room_center_local(int(r.id)), "text": "SABOTAGE!", "color": Color("ff8c42")})
					pending_sfx.append("hitHull2")
				continue
			c.state = "idle"
			continue

		if not r.is_empty() and belongs_to_ship:
			var rep_mult := float(c.repair_rate) * float(REPAIR_MASTERY_MULT[get_crew_skill_tier(c, "repair")])
			if int(r.fires) > 0:
				c.state = "fire"
				r.fire_hp = maxf(0.0, float(r.fire_hp) - 18.0 * rep_mult * delta)
				if float(r.fire_hp) <= 0.0:
					r.fires = 0
				continue
			if int(r.breach) > 0:
				c.state = "repair"
				r.breach_hp = maxf(0.0, float(r.breach_hp) - 14.0 * rep_mult * delta)
				if float(r.breach_hp) <= 0.0:
					r.breach = 0
				continue
			var sname := str(r.system)
			if not sname.is_empty() and systems.has(sname) and int(systems[sname].damage) > 0:
				c.state = "repair"
				r.repair_progress = float(r.repair_progress) + 0.14 * rep_mult * delta
				if float(r.repair_progress) >= 1.0:
					r.repair_progress = 0.0
					systems[sname].damage = maxi(0, int(systems[sname].damage) - 1)
					c.skills.repair = int(c.skills.repair) + 1
					pending_sfx.append("upgradeSystem")
				continue
			if not sname.is_empty() and systems.has(sname) and int(systems[sname].manned_by) == -1:
				if sname in ["pilot", "engines", "shields", "weapons", "sensors", "doors"]:
					systems[sname].manned_by = int(c.id)
					c.state = "man"
					continue
		c.state = "idle"

	if not dead_ids.is_empty():
		var surviving: Array = []
		for c in crew:
			if int(c.id) in dead_ids:
				# Authentic FTL 1.6: Zoltan explodes on death dealing 15 dmg to all enemy crew in the room!
				if str(c.species) == "energy":
					var z_eff := _crew_effective_player(c)
					var z_rid := int(c.room_id)
					for other in crew:
						if int(other.id) != int(c.id) and int(other.room_id) == z_rid and float(other.hp) > 0.0 and _crew_effective_player(other) != z_eff:
							other.hp = maxf(0.0, float(other.hp) - ZOLTAN_DEATH_BLAST_DMG)
					pending_popups.append({"ship": self, "pos_local": c.pos, "text": "ZOLTAN BLAST -15!", "color": Color("7eff8b")})
					pending_explosions.append({"ship": self, "pos_local": c.pos, "big": false})
				# Authentic Clonebay revival queue (0x8861fc: Lv1=12s, Lv2=9s, Lv3=7s; Backup DNA Bank allows queueing even unpowered!)
				var cb_lvl := get_effective_system_power("clonebay") if systems.has("clonebay") else 0
				if c.is_player == is_player and systems.has("clonebay") and (cb_lvl > 0 or has_augment("BACKUP_DNA")):
					var clone_dur := float(CLONE_TIME_SEC[clampi(maxi(1, cb_lvl) - 1, 0, CLONE_TIME_SEC.size() - 1)])
					c.hp = 0.0
					c.path = []
					clone_queue.append({"crew": c, "timer": clone_dur, "max_time": clone_dur, "death_timer": 3.0})
					pending_popups.append({"ship": self, "pos_local": get_room_center_local(int(systems.clonebay.room)), "text": "CLONING %s..." % str(c.name), "color": Color("65e8ff")})
			else:
				surviving.append(c)
		crew = surviving
		# Authentic FTL 1.6 Rebel Flagship AI Takeover: when all Flagship crew die, AI takes over & auto-repairs!
		if is_boss and not boss_ai_active:
			var boss_alive := 0
			for bc in crew:
				if bool(bc.is_player) == is_player and float(bc.hp) > 0.0:
					boss_alive += 1
			if boss_alive == 0:
				boss_ai_active = true
				is_unmanned = true
				pending_popups.append({"ship": self, "pos_local": get_ship_bounds_local().get_center(), "text": "FLAGSHIP AI ACTIVATED!", "color": Color("ff5c5c")})
				pending_sfx.append("ionHit1")


func _step_clone_queue(delta: float) -> void:
	if clone_queue.is_empty():
		return
	var cb_hacked := hacked_active and systems.has("clonebay") and hacked_room == int(systems.clonebay.room)
	var cb_pwr := 0 if cb_hacked else (get_effective_system_power("clonebay") if systems.has("clonebay") else 0)
	var item: Dictionary = clone_queue[0]
	if cb_pwr > 0:
		item.death_timer = 3.0
		item.timer = maxf(0.0, float(item.timer) - delta)
		if float(item.timer) <= 0.0:
			var c: Dictionary = item.crew
			c.hp = float(c.max_hp)
			c.room_id = int(systems.clonebay.room)
			c.pos = get_room_center_local(int(c.room_id))
			c.path = []
			c.mind_timer = 0.0
			c.stun_timer = 0.0
			# Slight skill decay on cloning (authentic FTL:AE)
			for sk in c.skills.keys():
				c.skills[sk] = maxi(0, int(c.skills[sk]) - 2)
			crew.append(c)
			_assign_room_tiles(int(c.room_id))
			clone_queue.pop_front()
			pending_popups.append({"ship": self, "pos_local": c.pos, "text": "CLONED!", "color": Color("7eff8b")})
			pending_sfx.append("upgradeSystem")
	elif not has_augment("BACKUP_DNA"):
		# Unpowered or hacked Clonebay loses DNA pattern after 3.0s (0x8861f8) unless BACKUP_DNA augment is installed!
		item.death_timer = float(item.get("death_timer", 3.0)) - delta
		if float(item.death_timer) <= 0.0:
			var lost_name := str(item.crew.get("name", "Crew"))
			clone_queue.pop_front()
			if systems.has("clonebay"):
				pending_popups.append({"ship": self, "pos_local": get_room_center_local(int(systems.clonebay.room)), "text": "%s LOST!" % lost_name, "color": Color("ff5c5c")})


func _crew_effective_player(c: Dictionary) -> bool:
	var base := bool(c.is_player)
	if float(c.get("mind_timer", 0.0)) > 0.0:
		return not base
	return base


func _find_hostile_in_room(room_id: int, my_eff_player: bool) -> Dictionary:
	for c in crew:
		if int(c.room_id) == room_id and c.hp > 0.0 and _crew_effective_player(c) != my_eff_player:
			return c
	return {}


func _step_weapons(delta: float, enemy_ship: FTLShip, target_cloaked: bool) -> void:
	# Authentic FTL 1.6 Weapons reload cooldown multiplier (0x603b6c: 0★=0.90, 1★=0.85, 2★=0.80; AUTO_COOLDOWN stacks -10%)
	var wp_manned := systems.has("weapons") and int(systems.weapons.manned_by) != -1
	var cd_mult := 1.0
	if wp_manned:
		var wc := _get_crew_by_id(int(systems.weapons.manned_by))
		var tier := get_crew_skill_tier(wc, "weapons")
		cd_mult = float(WEAPON_MANNING_CD_MULT[tier])
	var reloader_cnt := count_augment("AUTO_COOLDOWN")
	if reloader_cnt > 0:
		cd_mult = maxf(0.4, cd_mult - 0.10 * float(reloader_cnt))
	var mult := 1.0 / cd_mult

	for i in range(weapons.size()):
		var w: Dictionary = weapons[i]
		w.fire_anim = maxf(0.0, float(w.fire_anim) - delta * 2.5)
		if not bool(w.powered):
			w.charge = maxf(0.0, float(w.charge) - delta * 2.5)
			w.chain_count = 0
			w.charge_level = 0
			continue
		var eff_cd := get_weapon_effective_cooldown(w)
		var max_charges := maxi(1, int(w.bp.get("chargeLevels", 1)))
		if not target_cloaked:
			if max_charges > 1:
				if int(w.get("charge_level", 0)) < max_charges:
					w.charge = float(w.charge) + delta * mult
					if float(w.charge) >= eff_cd:
						w.charge = 0.0
						w.charge_level = mini(max_charges, int(w.get("charge_level", 0)) + 1)
			else:
				w.charge = minf(eff_cd, float(w.charge) + delta * mult)
		var ready_to_fire := (int(w.get("charge_level", 0)) >= 1) if max_charges > 1 else (float(w.charge) >= eff_cd)
		if ready_to_fire and int(w.target_room) >= 0 and not target_cloaked:
			var mcost := int(w.bp.get("missiles", 0))
			if mcost > 0 and missiles < mcost:
				continue
			if mcost > 0:
				if not (has_augment("EXPLOSIVE_REPLICATOR") and randf() < 0.5):
					missiles -= mcost
			var fired_charges := maxi(1, int(w.get("charge_level", 1))) if max_charges > 1 else 1
			w.charge = 0.0
			w.charge_level = 0
			w.fire_anim = 1.0
			# Build effective weapon payload (handles Chain damage & Charge multi-shot)
			var fire_w := w
			var btype := str(w.bp.get("boostType", ""))
			var bamt := float(w.bp.get("boostAmount", 0.0))
			var bmax := int(w.bp.get("boostCount", 0))
			var cur_chain := int(w.get("chain_count", 0))
			if fired_charges > 1 or (btype == "damage" and cur_chain > 0):
				var mod_bp: Dictionary = w.bp.duplicate()
				if fired_charges > 1:
					mod_bp.shots = maxi(1, int(mod_bp.get("shots", 1))) * fired_charges
				if btype == "damage" and cur_chain > 0:
					mod_bp.damage = int(mod_bp.get("damage", 1)) + int(round(float(cur_chain) * bamt))
				fire_w = w.duplicate()
				fire_w.bp = mod_bp
			if not btype.is_empty() and bmax > 0:
				w.chain_count = mini(bmax, cur_chain + 1)
			var target_rid := int(w.target_room)
			var b_start: Vector2 = w.get("beam_start", Vector2.ZERO)
			var b_end: Vector2 = w.get("beam_end", Vector2.ZERO)
			var b_rooms: Array = (w.get("beam_rooms", []) as Array).duplicate()
			if not bool(w.autofire):
				w.target_room = -1
				w.beam_rooms = []
			# Authentic FTL 1.6: Firing non-beam weapon reduces cloak by 20% of max duration (Beams & Stealth Weapons exempt!)
			var fire_type := str(fire_w.bp.get("type", "LASER"))
			if cloak_timer > 0.0 and fire_type != "BEAM" and not has_augment("CLOAK_FIRE"):
				cloak_timer = maxf(0.0, cloak_timer - maxf(1.0, cloak_max_duration * 0.20))
			if wp_manned:
				var wc := _get_crew_by_id(int(systems.weapons.manned_by))
				if not wc.is_empty():
					wc.skills.weapons = int(wc.skills.weapons) + 1
			pending_shots.append({
				"from_ship": self,
				"to_ship": enemy_ship,
				"weapon": fire_w,
				"weapon_idx": i,
				"target_room": target_rid,
				"beam_start": b_start,
				"beam_end": b_end,
				"beam_rooms": b_rooms,
			})
			var lsnds: Array = w.bp.get("launchSounds", [])
			if not lsnds.is_empty():
				pending_sfx.append(str(lsnds[randi() % lsnds.size()]))


func _step_artillery(delta: float, enemy_ship: FTLShip) -> void:
	if not systems.has("artillery"):
		return
	var apwr := get_effective_system_power("artillery")
	if apwr <= 0:
		artillery_charge = maxf(0.0, artillery_charge - delta * 2.0)
		return
	# Authentic FTL 1.6 Artillery formula (0x634f6e): 40s * max(0.25, 1.5 - 0.25 * power) -> Lv1 50s, Lv2 40s, Lv3 30s, Lv4 20s
	artillery_cooldown = 40.0 * maxf(0.25, 1.5 - 0.25 * float(apwr))
	if enemy_ship.cloak_timer <= 0.0:
		artillery_charge = minf(artillery_cooldown, artillery_charge + delta)
	if artillery_charge >= artillery_cooldown and not enemy_ship.rooms.is_empty():
		artillery_charge = 0.0
		var is_flak_art := (blueprint_id == "PLAYER_SHIP_FED_3")
		var tr := int(enemy_ship.rooms[randi() % enemy_ship.rooms.size()].id)
		if is_flak_art:
			var flak_bp := {
				"id": "ARTILLERY_FED_C", "type": "BURST", "damage": 1, "sysDamage": 0, "persDamage": 0,
				"ion": 0, "shots": 7, "sp": 0, "fireChance": 0, "breachChance": 0, "stunChance": 0,
				"radius": 55.0, "speed": 48.0, "color": Color("ff9e42"),
				"hitShieldSounds": ["hitShield1"], "hitShipSounds": ["hitHull2"], "missSounds": ["miss"],
			}
			pending_shots.append({
				"from_ship": self, "to_ship": enemy_ship,
				"weapon": {"id": "ARTILLERY_FED_C", "bp": flak_bp, "mount_idx": 0},
				"weapon_idx": -1, "target_room": tr,
			})
			pending_sfx.append("flak")
			pending_popups.append({"ship": self, "pos_local": get_room_center_local(int(systems.artillery.room)), "text": "FLAK ARTILLERY!", "color": Color("ff9e42")})
		else:
			var beam_bp := {
				"id": "ARTILLERY_FED", "type": "BEAM", "damage": 1, "sysDamage": 0, "persDamage": 0,
				"ion": 0, "shots": 1, "sp": 5, "fireChance": 1, "breachChance": 0, "stunChance": 0,
				"length": 140.0, "color": Color("ff4422"),
				"hitShieldSounds": ["hitShield1"], "hitShipSounds": ["hitHull2"], "missSounds": ["miss"],
			}
			var r_start := enemy_ship.get_room_center_local(tr)
			var r_end := r_start + Vector2(120.0, 45.0).rotated(randf() * TAU)
			var hit_rooms := enemy_ship.compute_beam_rooms(r_start, r_end)
			if hit_rooms.is_empty():
				hit_rooms = [tr]
			pending_shots.append({
				"from_ship": self, "to_ship": enemy_ship,
				"weapon": {"id": "ARTILLERY_FED", "bp": beam_bp, "mount_idx": 0},
				"weapon_idx": -1, "target_room": tr,
				"beam_start": r_start, "beam_end": r_end, "beam_rooms": hit_rooms,
			})
			pending_sfx.append("beam2")
			pending_popups.append({"ship": self, "pos_local": get_room_center_local(int(systems.artillery.room)), "text": "ARTILLERY BEAM!", "color": Color("ff5c5c")})


func _step_drones(delta: float, enemy_ship: FTLShip) -> void:
	# Authentic FTL 1.6 DRONE_SPEED (0x47b4cf): +25% drone orbit & fire rate per stack
	var d_spd_mult := 1.0 + 0.25 * float(count_augment("DRONE_SPEED"))
	for d in drones:
		if not bool(d.powered):
			continue
		d.angle = fmod(float(d.angle) + delta * 1.4 * d_spd_mult, TAU)
		d.cooldown = float(d.cooldown) - delta * d_spd_mult
		var dtype := str(d.bp.get("type", "COMBAT"))
		var did_str := str(d.id).to_upper()
		if dtype == "COMBAT" and enemy_ship != null and float(d.cooldown) <= 0.0 and enemy_ship.cloak_timer <= 0.0:
			d.cooldown = 3.6
			if not enemy_ship.rooms.is_empty():
				var tr := int(enemy_ship.rooms[randi() % enemy_ship.rooms.size()].id)
				if did_str.contains("BEAM"):
					var bbp := {"id": "DRONE_BEAM", "type": "BEAM", "damage": 1, "sysDamage": 0, "persDamage": 0, "ion": 0, "shots": 1, "sp": 0, "fireChance": 1, "breachChance": 0, "stunChance": 0, "length": 75.0, "color": Color("ffaa33")}
					var bs := enemy_ship.get_room_center_local(tr)
					var be := bs + Vector2(65.0, 20.0).rotated(randf() * TAU)
					var brs := enemy_ship.compute_beam_rooms(bs, be)
					if brs.is_empty(): brs = [tr]
					pending_shots.append({"from_ship": self, "to_ship": enemy_ship, "weapon": {"id": "DRONE_BEAM", "bp": bbp, "mount_idx": 0}, "weapon_idx": -1, "target_room": tr, "beam_start": bs, "beam_end": be, "beam_rooms": brs})
					pending_sfx.append("beam1")
				else:
					var wbp: Dictionary = db.weapons.get("LASER_BURST_1", db.weapons.get("LASER_BURST_2", {})).duplicate()
					wbp.shots = 1
					wbp.damage = 1
					pending_shots.append({
						"from_ship": self, "to_ship": enemy_ship,
						"weapon": {"id": "DRONE_LASER", "bp": wbp, "mount_idx": 0},
						"weapon_idx": -1, "target_room": tr,
					})
					pending_sfx.append("lightLaser1")
		elif dtype == "SHIELD" and enemy_ship != null and float(d.cooldown) <= 0.0:
			d.cooldown = 8.0
			var cap := maxi(5, zoltan_shield_max)
			if zoltan_shield < cap:
				zoltan_shield += 1
				pending_popups.append({"ship": self, "pos_local": get_ship_bounds_local().get_center(), "text": "+1 OVERCHARGE SHIELD", "color": Color("7eff8b")})
				pending_sfx.append("powerUpSystem")
		elif dtype == "BOARDER" and enemy_ship != null and not bool(d.get("deployed", false)) and enemy_ship.zoltan_shield <= 0 and not enemy_ship.rooms.is_empty():
			d["deployed"] = true
			var tr := int(enemy_ship.rooms[randi() % enemy_ship.rooms.size()].id)
			var is_ion_intruder := did_str.contains("ION")
			if not is_ion_intruder:
				enemy_ship.room_by_id[tr].breach = 1
				enemy_ship.room_by_id[tr].breach_hp = 100.0
			var bdrone := enemy_ship.add_crew("engi", tr, is_player, "Ion Intruder" if is_ion_intruder else "Boarding Drone")
			bdrone.max_hp = 125.0 if is_ion_intruder else 150.0
			bdrone.hp = bdrone.max_hp
			bdrone.no_o2 = true
			bdrone.fire_immune = true
			bdrone.combat_mult = 1.0 if is_ion_intruder else 1.25
			bdrone.color = Color("5ce1ff") if is_ion_intruder else Color("ff9f43")
			d["drone_crew_id"] = int(bdrone.id)
			pending_popups.append({"ship": enemy_ship, "pos_local": enemy_ship.get_room_center_local(tr), "text": "ION INTRUDER!" if is_ion_intruder else "BOARDING DRONE!", "color": bdrone.color})
			pending_sfx.append("ionHit1" if is_ion_intruder else "hitHull2")
		elif dtype == "BOARDER" and enemy_ship != null and bool(d.get("deployed", false)) and did_str.contains("ION") and float(d.cooldown) <= 0.0:
			d.cooldown = 9.0
			var dcid := int(d.get("drone_crew_id", -1))
			var ic := enemy_ship._get_crew_by_id(dcid)
			if not ic.is_empty() and float(ic.hp) > 0.0:
				var irid := int(ic.room_id)
				var isys := str(enemy_ship.room_by_id.get(irid, {}).get("system", ""))
				if not isys.is_empty():
					enemy_ship.apply_ion_damage(isys, 3)
				for ec in enemy_ship.crew:
					if int(ec.room_id) == irid and int(ec.id) != dcid and float(ec.hp) > 0.0:
						ec.stun_timer = maxf(float(ec.stun_timer), 4.0)
				pending_popups.append({"ship": enemy_ship, "pos_local": enemy_ship.get_room_center_local(irid), "text": "ION PULSE!", "color": Color("5ce1ff")})
				pending_sfx.append("ionHit1")
		elif (dtype == "ANTI_DRONE" or (dtype == "DEFENSE" and did_str.contains("ANTI"))) and enemy_ship != null and float(d.cooldown) <= 0.0:
			for ed in enemy_ship.drones:
				if bool(ed.powered) and str(ed.bp.get("type", "COMBAT")) in ["COMBAT", "DEFENSE", "SHIELD"]:
					d.cooldown = 7.0
					ed.cooldown = maxf(float(ed.cooldown), 12.0)
					if randf() < 0.25:
						ed.powered = false
						ed.active = false
						pending_popups.append({"ship": enemy_ship, "pos_local": enemy_ship.get_ship_bounds_local().get_center(), "text": "DRONE DESTROYED!", "color": Color("65e8ff")})
					else:
						pending_popups.append({"ship": enemy_ship, "pos_local": enemy_ship.get_ship_bounds_local().get_center(), "text": "DRONE STUNNED!", "color": Color("65e8ff")})
					pending_sfx.append("ionHit1")
					break
		elif dtype == "BATTLE" and float(d.cooldown) <= 0.0:
			d.cooldown = 2.0
			for c in crew:
				if _crew_effective_player(c) != is_player and float(c.hp) > 0.0:
					c.hp -= 18.0
					pending_popups.append({"ship": self, "pos_local": c.pos, "text": "AP DRONE -18", "color": Color("65e8ff")})
					break
		elif (dtype == "REPAIR" or dtype == "SHIP_REPAIR") and float(d.cooldown) <= 0.0:
			d.cooldown = 4.0
			if did_str.contains("HULL") or dtype == "SHIP_REPAIR":
				if not d.has("repair_charges"):
					d["repair_charges"] = randi_range(3, 5)
				if hull < max_hull and int(d.repair_charges) > 0:
					hull = mini(max_hull, hull + 1)
					d.repair_charges = int(d.repair_charges) - 1
					pending_popups.append({"ship": self, "pos_local": get_ship_bounds_local().get_center(), "text": "+1 HULL REPAIR", "color": Color("7eff8b")})
					pending_sfx.append("upgradeSystem")
					if int(d.repair_charges) <= 0:
						# Authentic FTL 1.6 15ShipRepairDrone (0x428b80): self-destructs after 3..5 hull repairs!
						d.powered = false
						d.active = false
						pending_popups.append({"ship": self, "pos_local": get_ship_bounds_local().get_center() + Vector2(0, -18), "text": "REPAIR DRONE SPENT", "color": Color("93b9d8")})
			else:
				for sname in systems.keys():
					if int(systems[sname].damage) > 0:
						systems[sname].damage -= 1
						break


func _step_enemy_ai(delta: float, player_ship: FTLShip) -> void:
	# Enemy FTL escape charging (Authentic FTL 1.6 binary rate + FTL_JAMMER halves charge rate!)
	if fleeing and not is_boss:
		var jammed := (player_ship != null and player_ship.has_augment("FTL_JAMMER"))
		var flee_rate := get_ftl_charge_rate(jammed)
		if flee_rate > 0.0:
			flee_ftl_charge = minf(1.0, flee_ftl_charge + flee_rate * delta)

	ai_decision_timer -= delta
	if ai_decision_timer > 0.0:
		return
	ai_decision_timer = 0.75

	# Non-boss low-hull Surrender Offer or FTL Escape decision
	if not is_boss and hull > 0 and float(hull) <= float(max_hull) * 0.30:
		if not surrender_offered and not surrender_declined and randf() < 0.35:
			surrender_offered = true
			pending_surrender_offer = {
				"scrap": maxi(12, int(max_hull * 1.4) + randi_range(4, 14)),
				"fuel": randi_range(2, 5),
				"missiles": randi_range(1, 4),
				"drone_parts": randi_range(0, 2),
				"weapon": (db.pick_store_weapons(1)[0] if randf() < 0.20 and not db.pick_store_weapons(1).is_empty() else ""),
			}
		elif not fleeing and surrender_declined and randf() < 0.30:
			fleeing = true
			pending_popups.append({"ship": self, "pos_local": get_ship_bounds_local().get_center(), "text": "CHARGING FTL!", "color": Color("ffd54f")})

	# Ensure weapons powered & targeted
	var target_rooms: Array[int] = []
	for sname in ["weapons", "shields", "pilot", "engines", "medbay"]:
		if player_ship.systems.has(sname):
			target_rooms.append(int(player_ship.systems[sname].room))
	if target_rooms.is_empty():
		for r in player_ship.rooms:
			target_rooms.append(int(r.id))
	for w in weapons:
		if bool(w.powered) and int(w.target_room) < 0 and not target_rooms.is_empty():
			w.target_room = target_rooms[randi() % target_rooms.size()]
			w.autofire = true

	# Activate cloaking occasionally on boss / cloaked enemies
	if systems.has("cloaking") and cloak_cooldown <= 0.0 and cloak_timer <= 0.0 and randf() < 0.25:
		activate_cloaking()

	# Authentic Enemy Teleporter Boarding AI (enemies with Teleporter or Flagship Phase 3!)
	if (systems.has("teleporter") or (is_boss and boss_phase == 3)) and teleporter_cooldown <= 0.0 and player_ship.zoltan_shield <= 0 and not player_ship.rooms.is_empty():
		var enemy_avail: Array = []
		for c in crew:
			if not bool(c.is_player) and float(c.hp) > 45.0:
				enemy_avail.append(c)
		if enemy_avail.size() >= 2 and randf() < 0.28:
			teleporter_cooldown = 22.0
			var dest_rid := int(player_ship.rooms[randi() % player_ship.rooms.size()].id)
			var send_n := mini(2, enemy_avail.size() - 1)
			for bi in range(send_n):
				var bc: Dictionary = enemy_avail[bi]
				crew.erase(bc)
				bc.room_id = dest_rid
				bc.target_room = dest_rid
				bc.path = []
				bc.pos = player_ship.get_room_center_local(dest_rid)
				player_ship.crew.append(bc)
			player_ship._assign_room_tiles(dest_rid)
			pending_teleports.append({"ship": player_ship, "pos_local": player_ship.get_room_center_local(dest_rid), "incoming": true})
			pending_popups.append({"ship": player_ship, "pos_local": player_ship.get_room_center_local(dest_rid), "text": "INTRUDERS!", "color": Color("ff5c5c")})
			pending_sfx.append("teleport")

	# Rebel Flagship Phase 1 / Phase 2 / Phase 3 Distinct Patterns (0x406296..0x4062b4: 20..30s surge cadence)
	if is_boss:
		boss_surge_timer -= 0.75
		if boss_surge_timer <= 0.0:
			boss_surge_count += 1
			boss_surge_timer = randf_range(BOSS_SURGE_MIN_SEC, BOSS_SURGE_MAX_SEC)
			if boss_phase == 1:
				# Phase 1: Hacking pulse on a random player system
				if not target_rooms.is_empty() and player_ship.zoltan_shield <= 0:
					var htr := target_rooms[randi() % target_rooms.size()]
					player_ship.hacked_room = htr
					player_ship.hacked_active = true
					player_ship.apply_ion_damage(str(player_ship.room_by_id[htr].system), 2)
					pending_popups.append({"ship": player_ship, "pos_local": player_ship.get_room_center_local(htr), "text": "FLAGSHIP HACK!", "color": Color("e070ff")})
					pending_sfx.append("ionHit1")
			elif boss_phase == 2:
				# Phase 2: Drone Surge (5-drone volley across multiple rooms) + occasional Boarding Drone
				var drone_bp := {
					"id": "BOSS_DRONE_SURGE", "type": "LASER", "damage": 1, "sysDamage": 0, "persDamage": 0,
					"ion": 0, "shots": 1, "sp": 0, "fireChance": 1, "breachChance": 0, "stunChance": 0,
					"speed": 62.0, "image": "laser_light1", "color": Color("65e8ff"),
					"hitShieldSounds": ["hitShield1"], "hitShipSounds": ["hitHull2"], "missSounds": ["miss"],
				}
				for _ds in range(5):
					var tr := target_rooms[randi() % target_rooms.size()] if not target_rooms.is_empty() else 0
					pending_shots.append({
						"from_ship": self, "to_ship": player_ship,
						"weapon": {"id": "BOSS_DRONE_SURGE", "bp": drone_bp, "mount_idx": 0},
						"weapon_idx": 0, "target_room": tr,
					})
				pending_popups.append({"ship": self, "pos_local": get_ship_bounds_local().get_center(), "text": "DRONE POWER SURGE!", "color": Color("65e8ff")})
				pending_sfx.append("lightLaser1")
			else:
				# Phase 3: Alternating 7-Shot Laser Surge & 12-HP SuperShield Recharge Surge (authentic FTL 1.6!)
				if (boss_surge_count % 2 == 0) and zoltan_shield <= 0:
					zoltan_shield_max = 12
					zoltan_shield = 12
					pending_popups.append({"ship": self, "pos_local": get_ship_bounds_local().get_center(), "text": "SUPER SHIELD SURGE (+12)!", "color": Color("7eff8b")})
					pending_sfx.append("powerUpSystem")
				else:
					var surge_bp := {
						"id": "BOSS_SURGE", "type": "LASER", "damage": 1, "sysDamage": 0, "persDamage": 0,
						"ion": 0, "shots": 7, "sp": 0, "fireChance": 1, "breachChance": 0, "stunChance": 0,
						"speed": 58.0, "image": "laser_heavy1", "color": Color(1.0, 0.35, 0.15),
						"hitShieldSounds": ["hitShield1"], "hitShipSounds": ["hitHull2"], "missSounds": ["miss"],
					}
					var tr := target_rooms[randi() % target_rooms.size()] if not target_rooms.is_empty() else 0
					pending_shots.append({
						"from_ship": self, "to_ship": player_ship,
						"weapon": {"id": "BOSS_SURGE", "bp": surge_bp, "mount_idx": 0},
						"weapon_idx": 0, "target_room": tr,
					})
					# Phase 3 Mind Control a random non-slug player crew if Zoltan shield is down
					if player_ship.zoltan_shield <= 0 and not player_ship.crew.is_empty():
						for pc in player_ship.crew:
							if bool(pc.is_player) and str(pc.species) != "slug" and float(pc.hp) > 0.0 and float(pc.get("mind_timer", 0.0)) <= 0.0:
								pc.mind_timer = 14.0
								pc.mind_combat_mult = 1.0
								pending_popups.append({"ship": player_ship, "pos_local": pc.pos, "text": "MIND CONTROLLED!", "color": Color("e070ff")})
								break
					pending_popups.append({"ship": self, "pos_local": get_ship_bounds_local().get_center(), "text": "LASER POWER SURGE!", "color": Color("ff5c5c")})

	# Enemy crew anti-boarder & repair AI
	var intruder_room := -1
	for c in crew:
		if _crew_effective_player(c) != is_player and c.hp > 0.0:
			intruder_room = int(c.room_id)
			break
	for c in crew:
		if _crew_effective_player(c) != is_player or not c.path.is_empty() or c.state in ["fight", "fire", "repair"]:
			continue
		if intruder_room >= 0 and int(c.room_id) != intruder_room:
			command_crew_to_room(c, intruder_room)
			continue
		for r in rooms:
			var sname := str(r.system)
			var needs_fix := int(r.fires) > 0 or int(r.breach) > 0 or (not sname.is_empty() and systems.has(sname) and int(systems[sname].damage) > 0)
			if needs_fix and int(c.room_id) != int(r.id):
				command_crew_to_room(c, int(r.id))
				break


# ==================== DAMAGE RESOLUTION ====================
func apply_projectile_impact(weapon_bp: Dictionary, target_room_id: int, attacker_has_zoltan_bypass: bool = false, attacker_ship: FTLShip = null) -> String:
	var wtype := str(weapon_bp.get("type", "LASER"))
	var dmg := int(weapon_bp.get("damage", 1))
	var sys_dmg := int(weapon_bp.get("sysDamage", 0))
	var pers_dmg := int(weapon_bp.get("persDamage", 0))
	var ion_dmg := int(weapon_bp.get("ion", 0))
	var sp := int(weapon_bp.get("sp", 0))
	var room_center := get_room_center_local(target_room_id)

	# 1. Evasion check (Beams & helpful self-targeted bombs never miss!) + Pilot/Engines skill XP gain on evade
	var is_helpful_bomb := (wtype == "BOMB" and (pers_dmg < 0 or sys_dmg < 0))
	if wtype != "BEAM" and not is_helpful_bomb:
		var evade := get_evasion()
		if randi() % 100 < evade:
			if systems.has("pilot") and int(systems.pilot.manned_by) != -1:
				var pc := _get_crew_by_id(int(systems.pilot.manned_by))
				if not pc.is_empty():
					pc.skills.pilot = int(pc.skills.pilot) + 1
			if systems.has("engines") and int(systems.engines.manned_by) != -1:
				var ec := _get_crew_by_id(int(systems.engines.manned_by))
				if not ec.is_empty():
					ec.skills.engines = int(ec.skills.engines) + 1
			pending_popups.append({"ship": self, "pos_local": room_center, "text": "MISS", "color": Color("c8d8e8")})
			pending_sfx.append("miss")
			return "miss"

	# 2. Authentic FTL 1.6 Zoltan SuperShield check (blocks Bombs too unless ZOLTAN_BYPASS or self-target helpful bomb; Ion & Beams deal 2x!)
	if zoltan_shield > 0 and not is_helpful_bomb and not (wtype == "BOMB" and attacker_has_zoltan_bypass):
		var z_dmg := (dmg * 2 if wtype == "BEAM" else dmg) + ion_dmg * 2
		var absorb := maxi(1, z_dmg)
		zoltan_shield = maxi(0, zoltan_shield - absorb)
		pending_popups.append({"ship": self, "pos_local": room_center, "text": "ZOLTAN SHIELD", "color": Color("7eff8b")})
		pending_sfx.append("hitShield1")
		return "zoltan_shield"

	# 3. Normal Shields check (Bombs bypass; Missiles have sp=5; Beams reduce dmg by shield_layers; 0-dmg Bio/Fire Beams penetrate when shields <= sp!)
	if wtype == "BEAM":
		var net_shields := maxi(0, shield_layers - sp)
		if dmg <= 0:
			if net_shields > 0:
				pending_popups.append({"ship": self, "pos_local": room_center, "text": "BLOCKED", "color": Color("65c8ff")})
				return "shield"
		else:
			var eff_dmg := dmg - net_shields
			if eff_dmg <= 0:
				pending_popups.append({"ship": self, "pos_local": room_center, "text": "BLOCKED", "color": Color("65c8ff")})
				return "shield"
			dmg = eff_dmg
	elif wtype != "BOMB" and shield_layers > sp:
		if ion_dmg > 0:
			apply_ion_damage("shields", ion_dmg)
			pending_popups.append({"ship": self, "pos_local": room_center, "text": "ION %d" % ion_dmg, "color": Color("5ce1ff")})
			pending_sfx.append("ionHit1")
			return "shield_ion"
		shield_layers = maxi(0, shield_layers - 1)
		shield_charge = 0.0
		pending_popups.append({"ship": self, "pos_local": room_center, "text": "SHIELD", "color": Color("65c8ff")})
		pending_sfx.append("hitShield1")
		return "shield"

	# 4. Hull & System Impact!
	if has_augment("ROCK_ARMOR") and dmg > 0 and randf() < 0.15:
		pending_popups.append({"ship": self, "pos_local": room_center, "text": "RESIST", "color": Color("f0b464")})
		return "resist"

	if dmg > 0:
		# Authentic FTL 1.6 Hull Weapons (<hullBust>1</hullBust> @ 0x608596) deal 2x hull damage to empty (systemless) rooms!
		var is_hull_wpn := bool(weapon_bp.get("hullBust", false)) or bool(weapon_bp.get("hullBonus", false)) or str(weapon_bp.get("id", "")).contains("HULL")
		if is_hull_wpn and room_by_id.has(target_room_id) and str(room_by_id[target_room_id].system).is_empty():
			dmg *= 2
			pending_popups.append({"ship": self, "pos_local": room_center + Vector2(0, -16), "text": "2x HULL!", "color": Color("ffd54f")})
		hull = maxi(0, hull - dmg)
		pending_popups.append({"ship": self, "pos_local": room_center, "text": "-%d" % dmg, "color": Color("ff5c5c")})
		pending_explosions.append({"ship": self, "pos_local": room_center, "big": dmg >= 2})
		# Authentic FTL 1.6 Crystal Vengeance (CRYSTAL_SHARDS @ 0x4a5e10): 10% chance per stack on hull hit to fire 1-dmg shard (sp=1)
		var shard_cnt := count_augment("CRYSTAL_SHARDS")
		if shard_cnt > 0 and attacker_ship != null and attacker_ship.hull > 0 and not attacker_ship.rooms.is_empty():
			if randf() < minf(1.0, 0.10 * float(shard_cnt)):
				var shard_bp := {
					"id": "CRYSTAL_VENGEANCE_SHARD", "type": "LASER", "damage": 1, "sysDamage": 0, "persDamage": 0,
					"ion": 0, "shots": 1, "sp": 1, "fireChance": 0, "breachChance": 0, "stunChance": 0,
					"speed": 55.0, "image": "crystal_shot1", "color": Color("65e8ff"),
					"hitShieldSounds": ["hitShield1"], "hitShipSounds": ["hitHull2"], "missSounds": ["miss"],
				}
				var tr := int(attacker_ship.rooms[randi() % attacker_ship.rooms.size()].id)
				pending_shots.append({
					"from_ship": self, "to_ship": attacker_ship,
					"weapon": {"id": "CRYSTAL_VENGEANCE_SHARD", "bp": shard_bp, "mount_idx": 0},
					"weapon_idx": -1, "target_room": tr,
				})
				pending_popups.append({"ship": self, "pos_local": room_center + Vector2(0, -18), "text": "CRYSTAL VENGEANCE!", "color": Color("65e8ff")})

	if room_by_id.has(target_room_id):
		var r: Dictionary = room_by_id[target_room_id]
		var sname := str(r.system)
		# Authentic FTL 1.6 Negative sysDamage (BOMB_REPAIR @ 0x6084ca) repairs system damage & seals breach/fire!
		if sys_dmg < 0:
			if not sname.is_empty() and systems.has(sname) and int(systems[sname].damage) > 0:
				systems[sname].damage = maxi(0, int(systems[sname].damage) + sys_dmg)
			r.breach = 0
			r.breach_hp = 0.0
			r.fires = 0
			r.fire_hp = 0.0
			pending_popups.append({"ship": self, "pos_local": room_center, "text": "REPAIR BURST!", "color": Color("65e8ff")})
		else:
			var total_sys := dmg + sys_dmg
			if not sname.is_empty() and total_sys > 0:
				apply_system_damage(sname, total_sys)
		if not sname.is_empty() and ion_dmg > 0:
			apply_ion_damage(sname, ion_dmg)
			pending_popups.append({"ship": self, "pos_local": room_center + Vector2(0, -14), "text": "ION %d" % ion_dmg, "color": Color("5ce1ff")})
		# Authentic FTL 1.6 Negative persDamage (BOMB_HEAL @ 0x608529) heals friendly crew; positive deals 15 HP per point!
		if pers_dmg < 0:
			var heal_amt := float(-pers_dmg) * 15.0
			for c in crew:
				if int(c.room_id) == target_room_id and float(c.hp) > 0.0:
					c.hp = minf(float(c.max_hp), float(c.hp) + heal_amt)
			pending_popups.append({"ship": self, "pos_local": room_center, "text": "HEAL BURST!", "color": Color("7eff8b")})
		else:
			var crew_hit := float(dmg * 15 + pers_dmg * 15)
			if crew_hit > 0.0:
				for c in crew:
					if int(c.room_id) == target_room_id:
						c.hp -= crew_hit
		# Authentic FTL 1.6 Stun (<stun> @ 0x608019 & stunChance) applies even on 0-damage weapons (Stun Bomb / Ion Stunner)!
		var explicit_stun := float(weapon_bp.get("stun", 0.0))
		var stun_ch := int(weapon_bp.get("stunChance", 0))
		var stun_dur := explicit_stun if explicit_stun > 0.0 else 4.0
		if explicit_stun > 0.0 or stun_ch > 0:
			var roll_ok := (stun_ch <= 0 and explicit_stun > 0.0) or (stun_ch * 10 > randi() % 100)
			if roll_ok:
				for c in crew:
					if int(c.room_id) == target_room_id and float(c.hp) > 0.0:
						c.stun_timer = maxf(float(c.stun_timer), stun_dur)
				if explicit_stun > 0.0:
					pending_popups.append({"ship": self, "pos_local": room_center + Vector2(0, -14), "text": "STUN %.0fs!" % stun_dur, "color": Color("ffd54f")})
		# Authentic FTL 1.6 Lockdown Weapons (<lockdown>1</lockdown> @ 0x6085b0): Crystal weapons & Lockdown Bomb seal room for 12s!
		if bool(weapon_bp.get("lockdown", false)) or str(weapon_bp.get("id", "")).contains("LOCK"):
			r.lockdown_timer = maxf(float(r.get("lockdown_timer", 0.0)), 12.0)
			pending_popups.append({"ship": self, "pos_local": room_center + Vector2(0, -16), "text": "LOCKDOWN!", "color": Color("7ee8ff")})
		# Fire & Breach chances (FTL scale 0..10 = 0%..100%)
		var fchance := int(weapon_bp.get("fireChance", 0)) * 10
		if fchance > 0 and randi() % 100 < fchance and float(r.oxygen) > 10.0 and int(r.breach) == 0:
			r.fires = mini(int(r.w) * int(r.h), int(r.fires) + 1)
			r.fire_hp = 100.0
		var bchance := int(weapon_bp.get("breachChance", 0)) * 10
		if bchance > 0 and randi() % 100 < bchance:
			r.breach = 1
			r.breach_hp = 100.0

	var hsnds: Array = weapon_bp.get("hitShipSounds", [])
	if not hsnds.is_empty():
		pending_sfx.append(str(hsnds[randi() % hsnds.size()]))
	else:
		pending_sfx.append("hitHull2")
	return "hit"


func apply_system_damage(sname: String, amount: int) -> void:
	if not systems.has(sname) or amount <= 0:
		return
	# Authentic FTL 1.6 Titanium System Casing (SYSTEM_CASING @ 0x4a642f): 15% chance per stack to negate system damage!
	var casing_cnt := count_augment("SYSTEM_CASING")
	if casing_cnt > 0 and randf() < minf(1.0, 0.15 * float(casing_cnt)):
		var r_id := int(systems[sname].room)
		pending_popups.append({"ship": self, "pos_local": get_room_center_local(r_id), "text": "SYS RESIST", "color": Color("ffd54f")})
		return
	var s: Dictionary = systems[sname]
	s.damage = mini(int(s.level), int(s.damage) + amount)
	var usable := get_system_usable_max(sname)
	if int(s.power) > usable:
		s.power = usable
	_enforce_weapon_drone_power()


func apply_ion_damage(sname: String, amount: int) -> void:
	if not systems.has(sname) or amount <= 0:
		return
	# Authentic FTL 1.6 Reverse Ion Field (ION_ARMOR): 50% resist per stack!
	var resist_cnt := count_augment("ION_ARMOR")
	if resist_cnt > 0 and randf() < minf(1.0, 0.50 * float(resist_cnt)):
		var r_id := int(systems[sname].room)
		pending_popups.append({"ship": self, "pos_local": get_room_center_local(r_id), "text": "ION RESIST", "color": Color("5ce1ff")})
		return
	var s: Dictionary = systems[sname]
	# Authentic FTL 1.6 Ion Lock: +5.0s per ion damage, capped at 25.0s (5 stacks)
	s.ion_timer = minf(ION_MAX_LOCK_SEC, float(s.ion_timer) + float(amount) * ION_SEC_PER_DMG)
	s.ion_level = mini(int(s.level), int(ceil(float(s.ion_timer) / ION_SEC_PER_DMG)))
	var usable := get_system_usable_max(sname)
	if int(s.power) > usable:
		s.power = usable
	_enforce_weapon_drone_power()


func has_living_crew() -> bool:
	if is_unmanned:
		return true
	for c in crew:
		if c.is_player == is_player and c.hp > 0.0:
			return true
	if not clone_queue.is_empty() and systems.has("clonebay") and (get_effective_system_power("clonebay") > 0 or has_augment("BACKUP_DNA")):
		return true
	return false


func serialize_state() -> Dictionary:
	var sys_out: Dictionary = {}
	for sname in systems.keys():
		var s: Dictionary = systems[sname]
		sys_out[sname] = {
			"room": int(s.room),
			"level": int(s.level),
			"max_level": int(s.max_level),
			"power": int(s.power),
			"damage": int(s.damage),
		}
	var w_out: Array = []
	for w in weapons:
		w_out.append({"id": str(w.id), "powered": bool(w.powered)})
	var d_out: Array = []
	for d in drones:
		d_out.append({"id": str(d.id), "powered": bool(d.powered)})
	var c_out: Array = []
	for c in crew:
		if bool(c.is_player) == is_player and float(c.hp) > 0.0:
			c_out.append({
				"name": str(c.name),
				"species": str(c.species),
				"room_id": int(c.room_id),
				"hp": float(c.hp),
				"skills": (c.skills as Dictionary).duplicate(),
			})
	return {
		"blueprint_id": blueprint_id,
		"ship_name": ship_name,
		"hull": hull,
		"max_hull": max_hull,
		"scrap": scrap,
		"fuel": fuel,
		"missiles": missiles,
		"drone_parts": drone_parts,
		"reactor_max": reactor_max,
		"drone_slots": drone_slots,
		"systems": sys_out,
		"weapons": w_out,
		"cargo_weapons": cargo_weapons.duplicate(),
		"drones": d_out,
		"cargo_drones": cargo_drones.duplicate(),
		"augments": augments.duplicate(),
		"crew": c_out,
	}


func deserialize_state(data: Dictionary) -> void:
	ship_name = str(data.get("ship_name", ship_name))
	hull = clampi(int(data.get("hull", hull)), 1, max_hull)
	scrap = int(data.get("scrap", scrap))
	fuel = int(data.get("fuel", fuel))
	missiles = int(data.get("missiles", missiles))
	drone_parts = int(data.get("drone_parts", drone_parts))
	reactor_max = clampi(int(data.get("reactor_max", reactor_max)), 5, 25)
	drone_slots = maxi(drone_slots, int(data.get("drone_slots", drone_slots)))

	var sys_data: Dictionary = data.get("systems", {})
	if not sys_data.is_empty():
		# First install any extra systems that were purchased during the run
		for sname in sys_data.keys():
			if not systems.has(sname):
				install_system(str(sname))
		for sname in sys_data.keys():
			if systems.has(sname):
				var sd: Dictionary = sys_data[sname]
				systems[sname].level = clampi(int(sd.get("level", systems[sname].level)), 1, int(systems[sname].max_level))
				systems[sname].damage = clampi(int(sd.get("damage", 0)), 0, int(systems[sname].level))
				systems[sname].power = clampi(int(sd.get("power", systems[sname].power)), 0, get_system_usable_max(str(sname)))

	var w_data: Array = data.get("weapons", [])
	if not w_data.is_empty():
		weapons.clear()
		cargo_weapons.clear()
		for wd in w_data:
			var wid := str(wd.get("id", ""))
			if add_weapon(wid) and not weapons.is_empty():
				weapons[-1].powered = bool(wd.get("powered", false))
		for cwid in data.get("cargo_weapons", []):
			if cargo_weapons.size() < 4:
				cargo_weapons.append(str(cwid))

	var d_data: Array = data.get("drones", [])
	if data.has("drones"):
		drones.clear()
		cargo_drones.clear()
		for dd in d_data:
			var did := str(dd.get("id", ""))
			if add_drone(did) and not drones.is_empty():
				drones[-1].powered = bool(dd.get("powered", false))
		for cdid in data.get("cargo_drones", []):
			if cargo_drones.size() < 4:
				cargo_drones.append(str(cdid))

	if data.has("augments"):
		augments.clear()
		for aid in data.get("augments", []):
			augments.append(str(aid))
		if has_augment("ENERGY_SHIELD"):
			zoltan_shield_max = 5
			zoltan_shield = zoltan_shield_max

	var c_data: Array = data.get("crew", [])
	if not c_data.is_empty():
		crew.clear()
		_next_crew_id = 1
		for cd in c_data:
			var rid := int(cd.get("room_id", rooms[0].id if not rooms.is_empty() else 0))
			if not room_by_id.has(rid) and not rooms.is_empty():
				rid = int(rooms[0].id)
			var cm := add_crew(str(cd.get("species", "human")), rid, is_player, str(cd.get("name", "")))
			cm.hp = clampf(float(cd.get("hp", cm.max_hp)), 1.0, float(cm.max_hp))
			if cd.has("skills") and cd.skills is Dictionary:
				cm.skills = (cd.skills as Dictionary).duplicate()

	_clamp_reactor_power()
	shield_max_layers = get_effective_system_power("shields") / 2
	shield_layers = shield_max_layers
