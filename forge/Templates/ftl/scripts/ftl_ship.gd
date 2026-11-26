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
var boss_phase: int = 1
var boss_surge_timer: float = 18.0
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
	if bp_id == "BOSS_1":
		boss_phase = 1
	elif bp_id == "BOSS_2":
		boss_phase = 2
	elif bp_id == "BOSS_3":
		boss_phase = 3

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
	}
	crew.append(member)
	_assign_room_tiles(room_id)
	return member


func has_augment(aug_id: String) -> bool:
	return augments.has(aug_id)


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
	battery_cooldown = 20.0
	pending_popups.append({"ship": self, "pos_local": get_room_center_local(int(systems.battery.room)), "text": "+%d BATTERY!" % battery_bonus, "color": Color("ffd54f")})
	pending_sfx.append("powerUpSystem")
	return true


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
	# Authentic Clonebay jump-healing (+8 / +16 / +24 HP per jump)
	if systems.has("clonebay") and int(systems.clonebay.damage) < int(systems.clonebay.level):
		var heal := 8 * int(systems.clonebay.level)
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
	var usable := get_system_usable_max(sname)
	if sname in SUBSYSTEMS:
		return usable
	var zoltan := get_zoltan_bonus_in_room(int(s.room))
	return mini(usable, int(s.power) + zoltan)


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
	var p := get_effective_system_power("cloaking")
	if p <= 0 or cloak_timer > 0.0 or cloak_cooldown > 0.0:
		pending_sfx.append("powerUpFail")
		return false
	cloak_timer = 5.0 * float(p)
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
	hacking_active_timer = 1.0 + float(p) * 3.0 # Lv1=4s, Lv2=7s, Lv3=10s
	hacking_cooldown = 20.0
	target_ship.hacked_room = hacking_target_room
	target_ship.hacked_active = true
	# Close & lock doors connected to hacked room
	for d in target_ship.doors:
		if int(d.room_a) == hacking_target_room or int(d.room_b) == hacking_target_room:
			d.open = false
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

	# Counter mind-control on own ship
	if target_ship == self:
		for c in crew:
			if int(c.room_id) == target_room_id and float(c.mind_timer) > 0.0:
				c.mind_timer = 0.0
				c.mind_combat_mult = 1.0
				mind_cooldown = 20.0
				pending_popups.append({"ship": self, "pos_local": c.pos, "text": "MC CLEARED!", "color": Color("7eff8b")})
				pending_sfx.append("upgradeSystem")
				return true
		pending_sfx.append("powerUpFail")
		return false

	# Mind-control an enemy crew member on target_ship
	for c in target_ship.crew:
		if int(c.room_id) == target_room_id and c.hp > 0.0 and bool(c.is_player) != is_player and float(c.mind_timer) <= 0.0:
			var dur := 14.0 if p == 1 else (20.0 if p == 2 else 28.0)
			var bonus_hp := 15.0 if p == 1 else (25.0 if p == 2 else 35.0)
			var c_mult := 1.25 if p == 1 else (1.5 if p == 2 else 2.0)
			c.mind_timer = dur
			c.mind_combat_mult = c_mult
			c.hp = minf(float(c.max_hp) + bonus_hp, float(c.hp) + bonus_hp)
			mind_active_timer = dur
			mind_cooldown = 20.0
			pending_popups.append({"ship": target_ship, "pos_local": c.pos, "text": "MIND CONTROL!", "color": Color("d580ff")})
			pending_sfx.append("ionHit1")
			return true
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
	# Active hacking on engines or piloting drops evasion to 0%!
	if hacked_active and hacked_room >= 0 and room_by_id.has(hacked_room):
		var hsys := str(room_by_id[hacked_room].system)
		if hsys == "engines" or hsys == "pilot":
			return 0
	if not systems.has("pilot") or not systems.has("engines"):
		return 0
	var pilot_lvl := get_effective_system_power("pilot")
	var eng_pwr := get_effective_system_power("engines")
	if pilot_lvl <= 0 or eng_pwr <= 0:
		return 0
	var pilot_manned := int(systems.pilot.manned_by) != -1
	var eng_manned := int(systems.engines.manned_by) != -1
	var base := 0
	if eng_pwr <= 5:
		base = eng_pwr * 5
	else:
		base = 25 + (eng_pwr - 5) * 3
	if pilot_manned:
		var pilot_crew := _get_crew_by_id(int(systems.pilot.manned_by))
		var skill_bonus := 5 if pilot_crew.is_empty() else (5 + mini(2, int(pilot_crew.skills.pilot / 15)) * 2)
		base += skill_bonus
	else:
		# Autopilot reduction: lvl 1 -> 0%, lvl 2 -> 50%, lvl 3 -> 80%
		if pilot_lvl == 1:
			base = 0
		elif pilot_lvl == 2:
			base = int(round(base * 0.5))
		else:
			base = int(round(base * 0.8))
	if eng_manned and base > 0:
		var eng_crew := _get_crew_by_id(int(systems.engines.manned_by))
		var e_bonus := 5 if eng_crew.is_empty() else (5 + mini(2, int(eng_crew.skills.engines / 15)) * 2)
		base += e_bonus
	if cloak_timer > 0.0:
		base += 60
	return clampi(base, 0, 99)


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
	pending_sfx.append("doorOpen" if doors[door_idx].open else "doorClose")


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
	# 1. Ion timers & system damage clamping
	for sname in systems.keys():
		var s: Dictionary = systems[sname]
		if s.ion_timer > 0.0:
			s.ion_timer = maxf(0.0, float(s.ion_timer) - delta)
			if s.ion_timer <= 0.0:
				s.ion_level = 0
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

	# 3. FTL Drive charge (charges when pilot + engines operational)
	if ftl_charge < 1.0:
		var pilot_ok := get_effective_system_power("pilot") > 0 and (int(systems.pilot.manned_by) != -1 or get_effective_system_power("pilot") >= 2)
		var eng := get_effective_system_power("engines")
		if pilot_ok and eng > 0:
			var rate := (0.04 + float(eng) * 0.015) * (1.25 if has_augment("FTL_BOOSTER") else 1.0)
			ftl_charge = minf(1.0, ftl_charge + rate * delta)

	# 4. Shields recharge
	shield_max_layers = get_effective_system_power("shields") / 2
	if shield_layers > shield_max_layers:
		shield_layers = shield_max_layers
		shield_charge = 0.0
	elif shield_layers < shield_max_layers:
		var sh_manned := systems.has("shields") and int(systems.shields.manned_by) != -1
		var mult := 1.15 if sh_manned else 1.0
		if has_augment("SHIELD_RECHARGE"):
			mult *= 1.15
		var recharge_time := 2.0 if shield_layers < 2 else 1.72
		shield_charge += (delta * mult) / recharge_time
		if shield_charge >= 1.0:
			shield_charge = 0.0
			shield_layers += 1

	# 5. Atmosphere (Oxygen, Airlocks, Fires, Breaches)
	_step_atmosphere(delta)

	# 6. Crew (movement, manning, repair, firefighting, healing, combat) & Clonebay queue
	_step_crew(delta)
	_step_clone_queue(delta)

	# 7. Weapons, Artillery & Drones charging & firing
	var target_cloaked := (enemy_ship != null and enemy_ship.cloak_timer > 0.0)
	if in_combat and enemy_ship != null and enemy_ship.hull > 0:
		_step_weapons(delta, enemy_ship, target_cloaked)
		_step_artillery(delta, enemy_ship)
		_step_drones(delta, enemy_ship)
	else:
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
			r.sabotage_progress = float(r.get("sabotage_progress", 0.0)) + delta * 0.55
			if float(r.sabotage_progress) >= 1.0:
				r.sabotage_progress = 0.0
				target_ship.shield_layers = maxi(0, target_ship.shield_layers - 1)
				target_ship.shield_charge = 0.0
	elif hsys == "weapons":
		for w in target_ship.weapons:
			w.charge = maxf(0.0, float(w.charge) - delta * 1.65)
	elif hsys == "oxygen":
		r.oxygen = maxf(0.0, float(r.oxygen) - 18.0 * delta)
	elif hsys == "medbay":
		for c in target_ship.crew:
			if int(c.room_id) == hacking_target_room and c.hp > 0.0:
				c.hp -= 12.0 * delta


func _step_atmosphere(delta: float) -> void:
	var o2_pwr := get_effective_system_power("oxygen")
	# Base O2 regen or decay
	for r in rooms:
		var o2_delta := -1.2
		if o2_pwr == 1:
			o2_delta = 1.2
		elif o2_pwr == 2:
			o2_delta = 3.8
		elif o2_pwr >= 3:
			o2_delta = 6.5
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

	# Fires
	for r in rooms:
		if int(r.fires) <= 0:
			continue
		if float(r.oxygen) < 8.0 or int(r.breach) > 0:
			r.fire_hp = maxf(0.0, float(r.fire_hp) - 35.0 * delta)
			if float(r.fire_hp) <= 0.0:
				r.fires = 0
		else:
			# Fire damages system in room slowly
			var sname := str(r.system)
			if not sname.is_empty() and systems.has(sname):
				r.repair_progress = float(r.repair_progress) - 0.08 * float(r.fires) * delta
				if float(r.repair_progress) <= -1.0:
					r.repair_progress = 0.0
					apply_system_damage(sname, 1)


func _step_crew(delta: float) -> void:
	for sname in systems.keys():
		systems[sname].manned_by = -1

	var dead_ids: Array[int] = []
	for c in crew:
		if c.hp <= 0.0:
			dead_ids.append(int(c.id))
			continue
		c.anim_t = float(c.anim_t) + delta
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
		# Suffocation & fire damage
		if not r.is_empty():
			if float(r.oxygen) < 5.0 and not bool(c.no_o2):
				c.hp -= 6.4 * delta
			if int(r.fires) > 0 and not bool(c.fire_immune):
				c.hp -= 4.5 * float(r.fires) * delta
			# Medbay healing (blocked if medbay is actively hacked!)
			if str(r.system) == "medbay" and belongs_to_ship:
				var med_hacked := hacked_active and hacked_room == int(r.id)
				var med_p := get_effective_system_power("medbay")
				if med_p > 0 and not med_hacked:
					c.hp = minf(float(c.max_hp), float(c.hp) + (6.4 * float(med_p)) * delta)

		# Movement along path
		if not c.path.is_empty():
			var next_rid := int(c.path[0])
			var dest := get_room_center_local(next_rid)
			var delta_v: Vector2 = dest - c.pos
			if delta_v.length() <= float(c.move_speed) * delta + 2.0:
				c.pos = dest
				c.room_id = next_rid
				c.path.pop_front()
				_assign_room_tiles(next_rid)
			else:
				c.facing = delta_v.normalized()
				c.pos += c.facing * float(c.move_speed) * delta
			c.state = "walk"
			continue
		else:
			# Settle onto tile in current room
			var tile_pos := get_room_tile_local(int(c.room_id), int(c.tile_idx))
			var dv: Vector2 = tile_pos - c.pos
			if dv.length() > 2.5:
				c.facing = dv.normalized()
				c.pos += c.facing * minf(dv.length(), float(c.move_speed) * delta)
				c.state = "walk"
				continue

		# In-room actions (Combat -> Sabotage if boarder/MC -> Fire -> Breach -> Repair -> Manning)
		var hostile := _find_hostile_in_room(int(c.room_id), eff_player)
		if not hostile.is_empty():
			c.state = "fight"
			var dps := 6.5 * float(c.combat_mult) * float(c.get("mind_combat_mult", 1.0))
			hostile.hp -= dps * delta
			continue

		if not r.is_empty() and not belongs_to_ship:
			# Boarder or Mind-Controlled crew sabotages enemy system!
			var sname := str(r.system)
			if not sname.is_empty() and systems.has(sname) and int(systems[sname].damage) < int(systems[sname].level):
				c.state = "sabotage"
				r.sabotage_progress = float(r.get("sabotage_progress", 0.0)) + 0.16 * float(c.combat_mult) * float(c.get("mind_combat_mult", 1.0)) * delta
				if float(r.sabotage_progress) >= 1.0:
					r.sabotage_progress = 0.0
					apply_system_damage(sname, 1)
					hull = maxi(0, hull - 1)
					pending_popups.append({"ship": self, "pos_local": get_room_center_local(int(r.id)), "text": "SABOTAGE!", "color": Color("ff8c42")})
					pending_sfx.append("hitHull2")
				continue
			c.state = "idle"
			continue

		if not r.is_empty() and belongs_to_ship:
			if int(r.fires) > 0:
				c.state = "fire"
				r.fire_hp = maxf(0.0, float(r.fire_hp) - 18.0 * float(c.repair_rate) * delta)
				if float(r.fire_hp) <= 0.0:
					r.fires = 0
				continue
			if int(r.breach) > 0:
				c.state = "repair"
				r.breach_hp = maxf(0.0, float(r.breach_hp) - 14.0 * float(c.repair_rate) * delta)
				if float(r.breach_hp) <= 0.0:
					r.breach = 0
				continue
			var sname := str(r.system)
			if not sname.is_empty() and systems.has(sname) and int(systems[sname].damage) > 0:
				c.state = "repair"
				r.repair_progress = float(r.repair_progress) + 0.14 * float(c.repair_rate) * delta
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
				# Authentic Clonebay revival queue (Lv1: 12s, Lv2: 9s, Lv3: 7s)
				if c.is_player == is_player and systems.has("clonebay") and get_effective_system_power("clonebay") > 0:
					var cb_lvl := get_effective_system_power("clonebay")
					var clone_dur := 12.0 if cb_lvl == 1 else (9.0 if cb_lvl == 2 else 7.0)
					c.hp = 0.0
					c.path = []
					clone_queue.append({"crew": c, "timer": clone_dur, "max_time": clone_dur, "death_timer": 3.0})
					pending_popups.append({"ship": self, "pos_local": get_room_center_local(int(systems.clonebay.room)), "text": "CLONING %s..." % str(c.name), "color": Color("65e8ff")})
			else:
				surviving.append(c)
		crew = surviving


func _step_clone_queue(delta: float) -> void:
	if clone_queue.is_empty():
		return
	var cb_pwr := get_effective_system_power("clonebay") if systems.has("clonebay") else 0
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
	else:
		# Unpowered Clonebay loses DNA pattern if not repowered in 3s!
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
	var wp_manned := systems.has("weapons") and int(systems.weapons.manned_by) != -1
	var mult := 1.0
	if wp_manned:
		var wc := _get_crew_by_id(int(systems.weapons.manned_by))
		var tier := 0 if wc.is_empty() else mini(2, int(wc.skills.weapons / 20))
		mult += 0.10 + float(tier) * 0.05
	if has_augment("AUTO_COOLDOWN"):
		mult *= 1.10

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
			# Firing weapon breaks cloak (except Stealth Weapons augment)
			if cloak_timer > 0.0 and not has_augment("CLOAK_FIRE"):
				cloak_timer = maxf(0.0, cloak_timer - 3.0)
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
	# Authentic FTL Artillery cooldown: Lv1 50s, Lv2 40s, Lv3 30s, Lv4 20s
	artillery_cooldown = maxf(15.0, 60.0 - float(apwr) * 10.0)
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
	for d in drones:
		if not bool(d.powered):
			continue
		d.angle = fmod(float(d.angle) + delta * 1.4, TAU)
		d.cooldown = float(d.cooldown) - delta
		var dtype := str(d.bp.get("type", "COMBAT"))
		if dtype == "COMBAT" and float(d.cooldown) <= 0.0 and enemy_ship.cloak_timer <= 0.0:
			d.cooldown = 3.6
			if not enemy_ship.rooms.is_empty():
				var tr := int(enemy_ship.rooms[randi() % enemy_ship.rooms.size()].id)
				var wbp: Dictionary = db.weapons.get("LASER_BURST_1", db.weapons.get("LASER_BURST_2", {})).duplicate()
				wbp.shots = 1
				wbp.damage = 1
				pending_shots.append({
					"from_ship": self,
					"to_ship": enemy_ship,
					"weapon": {"id": "DRONE_LASER", "bp": wbp, "mount_idx": 0},
					"weapon_idx": -1,
					"target_room": tr,
				})
				pending_sfx.append("lightLaser1")
		elif dtype == "REPAIR" and float(d.cooldown) <= 0.0:
			d.cooldown = 4.0
			for sname in systems.keys():
				if int(systems[sname].damage) > 0:
					systems[sname].damage -= 1
					break


func _step_enemy_ai(delta: float, player_ship: FTLShip) -> void:
	# Enemy FTL escape charging (if fleeing and Pilot+Engines operational)
	if fleeing and not is_boss:
		var pilot_ok := get_effective_system_power("pilot") > 0 and (int(systems.pilot.manned_by) != -1 or get_effective_system_power("pilot") >= 2)
		var eng_ok := get_effective_system_power("engines") > 0
		if pilot_ok and eng_ok:
			flee_ftl_charge = minf(1.0, flee_ftl_charge + (0.032 + float(get_effective_system_power("engines")) * 0.008) * delta)

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

	# Rebel Flagship Phase 2/3 Power Surges
	if is_boss and boss_phase >= 2:
		boss_surge_timer -= 0.75
		if boss_surge_timer <= 0.0:
			boss_surge_timer = 22.0
			var surge_bp := {
				"id": "BOSS_SURGE", "type": "LASER", "damage": 1, "sysDamage": 0, "persDamage": 0,
				"ion": 0, "shots": 7, "sp": 0, "fireChance": 1, "breachChance": 0, "stunChance": 0,
				"speed": 58.0, "image": "laser_heavy1", "color": Color(1.0, 0.35, 0.15),
				"hitShieldSounds": ["hitShield1"], "hitShipSounds": ["hitHull2"], "missSounds": ["miss"],
			}
			var tr := target_rooms[randi() % target_rooms.size()] if not target_rooms.is_empty() else 0
			pending_shots.append({
				"from_ship": self,
				"to_ship": player_ship,
				"weapon": {"id": "BOSS_SURGE", "bp": surge_bp, "mount_idx": 0},
				"weapon_idx": 0,
				"target_room": tr,
			})
			pending_popups.append({"ship": self, "pos_local": get_ship_bounds_local().get_center(), "text": "POWER SURGE!", "color": Color("ff5c5c")})

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
func apply_projectile_impact(weapon_bp: Dictionary, target_room_id: int) -> String:
	var wtype := str(weapon_bp.get("type", "LASER"))
	var dmg := int(weapon_bp.get("damage", 1))
	var sys_dmg := int(weapon_bp.get("sysDamage", 0))
	var pers_dmg := int(weapon_bp.get("persDamage", 0))
	var ion_dmg := int(weapon_bp.get("ion", 0))
	var sp := int(weapon_bp.get("sp", 0))
	var room_center := get_room_center_local(target_room_id)

	# 1. Evasion check (Beams never miss!)
	if wtype != "BEAM":
		var evade := get_evasion()
		if randi() % 100 < evade:
			pending_popups.append({"ship": self, "pos_local": room_center, "text": "MISS", "color": Color("c8d8e8")})
			pending_sfx.append("miss")
			return "miss"

	# 2. Zoltan supershield check
	if zoltan_shield > 0 and wtype != "BOMB":
		var absorb := maxi(1, dmg + ion_dmg * 2)
		zoltan_shield = maxi(0, zoltan_shield - absorb)
		pending_popups.append({"ship": self, "pos_local": room_center, "text": "ZOLTAN SHIELD", "color": Color("7eff8b")})
		pending_sfx.append("hitShield1")
		return "zoltan_shield"

	# 3. Normal Shields check (Bombs bypass; Missiles have sp=5; Beams reduce dmg by shield_layers)
	if wtype == "BEAM":
		var eff_dmg := dmg - maxi(0, shield_layers - sp)
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
		hull = maxi(0, hull - dmg)
		pending_popups.append({"ship": self, "pos_local": room_center, "text": "-%d" % dmg, "color": Color("ff5c5c")})
		pending_explosions.append({"ship": self, "pos_local": room_center, "big": dmg >= 2})

	if room_by_id.has(target_room_id):
		var r: Dictionary = room_by_id[target_room_id]
		var sname := str(r.system)
		var total_sys := dmg + sys_dmg
		if not sname.is_empty() and total_sys > 0:
			apply_system_damage(sname, total_sys)
		if not sname.is_empty() and ion_dmg > 0:
			apply_ion_damage(sname, ion_dmg)
			pending_popups.append({"ship": self, "pos_local": room_center + Vector2(0, -14), "text": "ION %d" % ion_dmg, "color": Color("5ce1ff")})
		# Crew damage in room
		var crew_hit := float(dmg * 15 + pers_dmg * 15)
		if crew_hit > 0.0:
			for c in crew:
				if int(c.room_id) == target_room_id:
					c.hp -= crew_hit
					if int(weapon_bp.get("stunChance", 0)) * 10 > randi() % 100:
						c.stun_timer = maxf(float(c.stun_timer), 4.0)
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
	var s: Dictionary = systems[sname]
	s.damage = mini(int(s.level), int(s.damage) + amount)
	var usable := get_system_usable_max(sname)
	if int(s.power) > usable:
		s.power = usable
	_enforce_weapon_drone_power()


func apply_ion_damage(sname: String, amount: int) -> void:
	if not systems.has(sname) or amount <= 0:
		return
	var s: Dictionary = systems[sname]
	s.ion_level = mini(int(s.level), int(s.ion_level) + amount)
	s.ion_timer = float(s.ion_level) * 5.0
	var usable := get_system_usable_max(sname)
	if int(s.power) > usable:
		s.power = usable
	_enforce_weapon_drone_power()


func has_living_crew() -> bool:
	for c in crew:
		if c.is_player == is_player and c.hp > 0.0:
			return true
	if not clone_queue.is_empty() and systems.has("clonebay") and get_effective_system_power("clonebay") > 0:
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
