extends RefCounted

## Combat expansion definitions & simulation helpers for PlayForge Cosmoteer:
## Heavy Laser, Medium Cannon, Homing Missile Launcher, Disruptor, Ion Beam Emitter,
## Modular Railgun (Launcher + Accelerator + Loader), Small & Large Shield Generators,
## Point Defense Turret, Medium & Large Reactors, Medium Crew Quarters, 2x1 Armor,
## and Fire / Extinguisher simulation.

const Flight := preload("res://sim/flight_dynamics.gd")

const LASER_SMALL := "cosmoteer.laser_blaster_small"
const LASER_LARGE := "cosmoteer.laser_blaster_large"
const CANNON_MED := "cosmoteer.cannon_med"
const MISSILE_LAUNCHER := "cosmoteer.missile_launcher"
const DISRUPTOR := "cosmoteer.disruptor"
const ION_BEAM := "cosmoteer.ion_beam_emitter"
const ION_PRISM := "cosmoteer.ion_beam_prism"
const FLAK_CANNON := "cosmoteer.flak_cannon_large"
const CHAINGUN := "cosmoteer.chaingun"
const CHAINGUN_MAG := "cosmoteer.chaingun_magazine"
const RAILGUN_LAUNCHER := "cosmoteer.railgun_launcher"
const RAILGUN_ACCEL := "cosmoteer.railgun_accelerator"
const RAILGUN_LOADER := "cosmoteer.railgun_loader"
const SHIELD_SMALL := "cosmoteer.shield_gen_small"
const SHIELD_LARGE := "cosmoteer.shield_gen_large"
const POINT_DEFENSE := "cosmoteer.point_defense"
const REACTOR_SMALL := "cosmoteer.reactor_small"
const REACTOR_MED := "cosmoteer.reactor_med"
const REACTOR_LARGE := "cosmoteer.reactor_large"
const BUNK_SMALL := "cosmoteer.crew_quarters_small"
const BUNK_MED := "cosmoteer.crew_quarters_med"
const ARMOR_2X1 := "cosmoteer.armor_2x1"
const FIRE_EXTINGUISHER := "cosmoteer.fire_extinguisher"

const WEAPON_IDS := [LASER_SMALL, LASER_LARGE, CANNON_MED, MISSILE_LAUNCHER, DISRUPTOR, ION_BEAM, RAILGUN_LAUNCHER, FLAK_CANNON, CHAINGUN]
const PROJECTILE_WEAPON_IDS := [LASER_SMALL, LASER_LARGE, CANNON_MED, MISSILE_LAUNCHER, DISRUPTOR, RAILGUN_LAUNCHER, FLAK_CANNON, CHAINGUN]
const SHIELD_IDS := [SHIELD_SMALL, SHIELD_LARGE]
const REACTOR_IDS := [REACTOR_SMALL, REACTOR_MED, REACTOR_LARGE]
const BUNK_IDS := [BUNK_SMALL, BUNK_MED]
const RAILGUN_PART_IDS := [RAILGUN_LAUNCHER, RAILGUN_ACCEL, RAILGUN_LOADER]

const EXTRA_STATS := {
	LASER_LARGE: {
		"weapon_kind": "heavy_laser",
		"battery_capacity": 6000,
		"crew_required": 2,
		"resupply_threshold": 600,
		"fire_interval": 1.35,
		"fire_delay": 0.45,
		"battery_per_shot": 600,
		"min_resources_used": 200,
		"projectile_speed": 440.0,
		"range": 320.0,
		"damage": 1400.0,
		"structural_damage": 700.0,
		"turret_location": [1.0, 0.8],
		"turret_rotation_deg": -90.0,
		"firing_arc_deg": 160.0,
		"rotate_speed_deg": 75.0,
		"fire_threshold_deg": 2.0,
	},
	CANNON_MED: {
		"weapon_kind": "cannon",
		"battery_capacity": 4000,
		"crew_required": 1,
		"resupply_threshold": 400,
		"fire_interval": 1.15,
		"fire_delay": 0.25,
		"battery_per_shot": 350,
		"min_resources_used": 100,
		"projectile_speed": 290.0,
		"range": 230.0,
		"damage": 1100.0,
		"structural_damage": 900.0,
		"turret_location": [1.0, 0.45],
		"turret_rotation_deg": -90.0,
		"firing_arc_deg": 130.0,
		"rotate_speed_deg": 65.0,
		"fire_threshold_deg": 2.5,
	},
	MISSILE_LAUNCHER: {
		"weapon_kind": "missile",
		"homing": true,
		"turn_rate_deg": 120.0,
		"missile_hp": 240.0,
		"ignite_intensity": 0.55,
		"battery_capacity": 6000,
		"crew_required": 2,
		"resupply_threshold": 700,
		"fire_interval": 2.4,
		"fire_delay": 0.35,
		"battery_per_shot": 700,
		"min_resources_used": 350,
		"projectile_speed": 185.0,
		"range": 380.0,
		"damage": 1800.0,
		"structural_damage": 1400.0,
		"turret_location": [1.0, 0.6],
		"turret_rotation_deg": -90.0,
		"firing_arc_deg": 360.0,
		"rotate_speed_deg": 180.0,
		"fire_threshold_deg": 180.0,
	},
	DISRUPTOR: {
		"weapon_kind": "disruptor",
		"shield_damage_mult": 3.0,
		"shield_energy_drain": 450,
		"battery_capacity": 4000,
		"crew_required": 1,
		"resupply_threshold": 400,
		"fire_interval": 0.95,
		"fire_delay": 0.30,
		"battery_per_shot": 300,
		"min_resources_used": 150,
		"projectile_speed": 360.0,
		"range": 270.0,
		"damage": 450.0,
		"structural_damage": 200.0,
		"turret_location": [0.5, 0.6],
		"turret_rotation_deg": -90.0,
		"firing_arc_deg": 180.0,
		"rotate_speed_deg": 95.0,
		"fire_threshold_deg": 2.0,
	},
	ION_BEAM: {
		"weapon_kind": "ion",
		"beam_weapon": true,
		"beam_dps": 2400.0,
		"beam_structural_dps": 1400.0,
		"beam_power_per_sec": 750.0,
		"ignite_intensity": 0.45,
		"battery_capacity": 8000,
		"crew_required": 2,
		"resupply_threshold": 1000,
		"min_resources_used": 100,
		"projectile_speed": 100000.0,
		"range": 310.0,
		"turret_location": [1.0, 0.5],
		"turret_rotation_deg": -90.0,
		"firing_arc_deg": 45.0,
		"rotate_speed_deg": 60.0,
		"fire_threshold_deg": 12.0,
	},
	ION_PRISM: {
		"range": 340.0,
		"turret_location": [1.0, 1.0],
		"turret_rotation_deg": -90.0,
		"firing_arc_deg": 360.0,
		"rotate_speed_deg": 180.0,
		"fire_threshold_deg": 10.0,
	},
	FLAK_CANNON: {
		"weapon_kind": "flak",
		"flak_defense_range": 86.0,
		"flak_defense_arc_deg": 100.0,
		"flak_defense_interval": 0.45,
		"flak_defense_damage": 300.0,
		"battery_capacity": 6000,
		"crew_required": 2,
		"resupply_threshold": 700,
		"fire_interval": 0.95,
		"fire_delay": 0.20,
		"battery_per_shot": 320,
		"min_resources_used": 120,
		"projectile_speed": 310.0,
		"range": 225.0,
		"damage": 1250.0,
		"structural_damage": 1050.0,
		"turret_location": [1.5, 0.9],
		"turret_rotation_deg": -90.0,
		"firing_arc_deg": 100.0,
		"rotate_speed_deg": 60.0,
		"fire_threshold_deg": 3.5,
	},
	CHAINGUN: {
		"weapon_kind": "chaingun",
		"spin_up_rate": 0.45,
		"spin_down_rate": 0.30,
		"fire_interval_min": 0.09,
		"battery_capacity": 6000,
		"crew_required": 2,
		"resupply_threshold": 600,
		"fire_interval": 0.34,
		"fire_delay": 0.06,
		"battery_per_shot": 65,
		"min_resources_used": 40,
		"projectile_speed": 430.0,
		"range": 250.0,
		"damage": 320.0,
		"structural_damage": 240.0,
		"turret_location": [1.5, 0.8],
		"turret_rotation_deg": -90.0,
		"firing_arc_deg": 110.0,
		"rotate_speed_deg": 80.0,
		"fire_threshold_deg": 3.0,
	},
	CHAINGUN_MAG: {
		"battery_capacity": 4000,
		"resupply_threshold": 500,
	},
	RAILGUN_LAUNCHER: {
		"weapon_kind": "railgun",
		"pierce": 1,
		"ignite_intensity": 0.65,
		"battery_capacity": 6000,
		"crew_required": 2,
		"resupply_threshold": 800,
		"fire_interval": 2.8,
		"fire_delay": 0.45,
		"battery_per_shot": 900,
		"min_resources_used": 450,
		"projectile_speed": 720.0,
		"range": 420.0,
		"damage": 2400.0,
		"structural_damage": 2000.0,
		"turret_location": [1.0, 0.5],
		"turret_rotation_deg": -90.0,
		"firing_arc_deg": 32.0,
		"rotate_speed_deg": 40.0,
		"fire_threshold_deg": 8.0,
	},
	RAILGUN_ACCEL: {
		"battery_capacity": 4000,
		"resupply_threshold": 500,
	},
	RAILGUN_LOADER: {
		"battery_capacity": 4000,
		"resupply_threshold": 500,
	},
	SHIELD_SMALL: {
		"battery_capacity": 6000,
		"resupply_threshold": 1000,
		"shield_max_hp": 6000.0,
		"shield_radius": 7.5,
		"shield_arc_deg": 110.0,
		"power_per_hp": 0.5,
		"recharge_rate": 900.0,
		"drain_interval": 1.0,
		"drain_quantity": 120,
		"reboot_delay": 2.5,
		"turret_location": [1.0, 0.5],
		"turret_rotation_deg": -90.0,
	},
	SHIELD_LARGE: {
		"battery_capacity": 12000,
		"resupply_threshold": 1500,
		"shield_max_hp": 18000.0,
		"shield_radius": 13.5,
		"shield_arc_deg": 160.0,
		"power_per_hp": 0.5,
		"recharge_rate": 1600.0,
		"drain_interval": 1.0,
		"drain_quantity": 240,
		"reboot_delay": 3.5,
		"turret_location": [1.5, 0.8],
		"turret_rotation_deg": -90.0,
	},
	POINT_DEFENSE: {
		"battery_capacity": 2000,
		"resupply_threshold": 400,
		"pd_range": 68.0,
		"pd_fire_interval": 0.18,
		"pd_damage": 140.0,
		"pd_energy_per_shot": 40,
		"turret_location": [0.5, 0.5],
		"turret_rotation_deg": -90.0,
		"firing_arc_deg": 220.0,
		"rotate_speed_deg": 360.0,
	},
	REACTOR_MED: {
		"battery_capacity": 16000,
		"pickup_quantity": 1000,
		"production_quantity": 2000,
		"production_interval": 0.6666666666666666,
	},
	REACTOR_LARGE: {
		"battery_capacity": 24000,
		"pickup_quantity": 1000,
		"production_quantity": 3000,
		"production_interval": 0.6666666666666666,
	},
	BUNK_MED: {
		"crew_capacity": 6,
	},
	FIRE_EXTINGUISHER: {
		"extinguish_rate": 0.42,
	},
}


static func augment_definitions(definitions: Dictionary) -> void:
	for id in EXTRA_STATS:
		if not definitions.has(id):
			continue
		var row: Dictionary = definitions[id].duplicate(true)
		var stats: Dictionary = row.get("stats", {}).duplicate(true)
		for key in EXTRA_STATS[id]:
			if not stats.has(key):
				stats[key] = EXTRA_STATS[id][key]
		row["stats"] = stats
		if row.get("crew_speed_factor") == null:
			row["crew_speed_factor"] = 0.5
		definitions[id] = row


static func is_weapon(id: String) -> bool:
	return id in WEAPON_IDS


static func is_shield(id: String) -> bool:
	return id in SHIELD_IDS


static func is_reactor(id: String) -> bool:
	return id in REACTOR_IDS


static func is_bunk(id: String) -> bool:
	return id in BUNK_IDS


static func is_walkable_expansion(id: String) -> bool:
	return id in [
		LASER_LARGE, CANNON_MED, MISSILE_LAUNCHER, DISRUPTOR, ION_BEAM, ION_PRISM,
		FLAK_CANNON, CHAINGUN, CHAINGUN_MAG,
		RAILGUN_LAUNCHER, RAILGUN_ACCEL, RAILGUN_LOADER,
		SHIELD_SMALL, SHIELD_LARGE, POINT_DEFENSE,
		REACTOR_MED, REACTOR_LARGE, BUNK_MED, FIRE_EXTINGUISHER,
	]


static func prepare_part(part: Dictionary) -> void:
	part["fire"] = 0.0
	if is_shield(part.id):
		part["shield_max_hp"] = float(part.stats.get("shield_max_hp", 6000.0))
		part["shield_hp"] = 0.0
		part["shield_active"] = false
		part["shield_reboot"] = 0.0
		part["shield_flash"] = 0.0
		part["shield_radius"] = float(part.stats.get("shield_radius", 7.5))
		part["shield_arc_rad"] = deg_to_rad(float(part.stats.get("shield_arc_deg", 110.0)))
	elif part.id == POINT_DEFENSE:
		part["pd_cooldown"] = 0.0
		part["pd_intercepts"] = 0
	elif part.id == FLAK_CANNON:
		part["flak_cooldown"] = 0.0
		part["flak_intercepts"] = 0
	elif part.id == CHAINGUN:
		part["chaingun_spin"] = 0.0
		part["chaingun_mag_count"] = 0
	elif part.id == RAILGUN_LAUNCHER:
		part["rail_accel_count"] = 0
		part["rail_has_loader"] = false
		part["rail_damage_mult"] = 1.0
		part["rail_range_mult"] = 1.0
		part["rail_speed_mult"] = 1.0
		part["rail_reload_mult"] = 1.0
	elif part.id == ION_BEAM:
		part["ion_active"] = false
		part["ion_power_accum"] = 0.0


static func refresh_chainguns(ship: Dictionary) -> void:
	for uid in ship.ids.get(CHAINGUN, []):
		var gun: Dictionary = ship.parts[uid]
		var mags := 0
		if gun.hp > 0.0:
			var seen := {}
			for x in range(gun.cell.x - 1, gun.cell.x + gun.size.x + 1):
				for y in range(gun.cell.y - 1, gun.cell.y + gun.size.y + 1):
					var inside_x: bool = x >= int(gun.cell.x) and x < int(gun.cell.x) + int(gun.size.x)
					var inside_y: bool = y >= int(gun.cell.y) and y < int(gun.cell.y) + int(gun.size.y)
					if inside_x and inside_y:
						continue
					if (not inside_x) and (not inside_y):
						continue
					var nuid: int = int(ship.cells.get(Vector2i(x, y), -1))
					if nuid >= 0 and not seen.has(nuid) and ship.parts.has(nuid):
						var np: Dictionary = ship.parts[nuid]
						if np.id == CHAINGUN_MAG and np.hp > 0.0:
							seen[nuid] = true
							mags += 1
		gun["chaingun_mag_count"] = mags
		var base_cap := int(gun.stats.get("battery_capacity", 6000))
		gun["capacity"] = base_cap + mags * 4000


## Scan modular railgun chains: flush accelerators & loader directly behind each railgun_launcher.
static func refresh_railguns(ship: Dictionary) -> void:
	for uid in ship.ids.get(RAILGUN_LAUNCHER, []):
		var launcher: Dictionary = ship.parts[uid]
		var accel := 0
		var has_loader := false
		if launcher.hp > 0.0:
			var rot: int = int(launcher.rotation)
			var back_dir := Vector2i.DOWN
			match rot:
				0: back_dir = Vector2i.DOWN
				1: back_dir = Vector2i.LEFT
				2: back_dir = Vector2i.UP
				3: back_dir = Vector2i.RIGHT
			var cur: Dictionary = launcher
			var visited := {uid: true}
			for _depth in 8:
				var probe_cell: Vector2i = cur.cell
				if back_dir == Vector2i.DOWN:
					probe_cell = Vector2i(cur.cell.x, cur.cell.y + cur.size.y)
				elif back_dir == Vector2i.UP:
					probe_cell = Vector2i(cur.cell.x, cur.cell.y - 1)
				elif back_dir == Vector2i.LEFT:
					probe_cell = Vector2i(cur.cell.x - 1, cur.cell.y)
				elif back_dir == Vector2i.RIGHT:
					probe_cell = Vector2i(cur.cell.x + cur.size.x, cur.cell.y)
				var next_uid: int = int(ship.cells.get(probe_cell, -1))
				if next_uid < 0 or visited.has(next_uid) or not ship.parts.has(next_uid):
					break
				var next_part: Dictionary = ship.parts[next_uid]
				if next_part.hp <= 0.0 or int(next_part.rotation) != rot:
					break
				# Must be flush-aligned along perpendicular axis
				var aligned: bool = (next_part.cell.x == cur.cell.x) if (rot % 2 == 0) else (next_part.cell.y == cur.cell.y)
				if not aligned:
					break
				visited[next_uid] = true
				if next_part.id == RAILGUN_ACCEL:
					accel += 1
					cur = next_part
				elif next_part.id == RAILGUN_LOADER:
					has_loader = true
					break
				else:
					break
		launcher.rail_accel_count = accel
		launcher.rail_has_loader = has_loader
		launcher.rail_damage_mult = 1.0 + 0.25 * float(accel)
		launcher.rail_range_mult = 1.0 + 0.20 * float(accel)
		launcher.rail_speed_mult = 1.0 + 0.20 * float(accel)
		launcher.rail_reload_mult = 0.72 if has_loader else 1.0


static func activate_initial_shields(ship: Dictionary) -> void:
	for sid in SHIELD_IDS:
		for uid in ship.ids.get(sid, []):
			var part: Dictionary = ship.parts[uid]
			if part.hp > 0 and part.energy > 0:
				var max_hp: float = part.shield_max_hp
				var energy_ratio := clampf(float(part.energy) / maxf(1.0, float(part.capacity)), 0.0, 1.0)
				part.shield_hp = max_hp * maxf(0.5, energy_ratio)
				part.shield_active = part.shield_hp > 0.0
				part.shield_reboot = 0.0


static func tick_shields(ship: Dictionary, dt: float) -> void:
	for sid in SHIELD_IDS:
		for uid in ship.ids.get(sid, []):
			var part: Dictionary = ship.parts[uid]
			if part.shield_flash > 0.0:
				part.shield_flash = maxf(0.0, part.shield_flash - dt * 3.5)
			if part.hp <= 0.0 or not ship.command:
				part.shield_active = false
				part.shield_hp = 0.0
				continue
			if part.shield_reboot > 0.0:
				part.shield_reboot = maxf(0.0, part.shield_reboot - dt)
				part.shield_active = false
				continue
			if part.energy <= 0:
				if part.shield_hp <= 0.0:
					part.shield_active = false
				continue
			part.clock += 1
			var drain_ticks := maxi(1, roundi(float(part.stats.get("drain_interval", 1.0)) * 60.0))
			if part.clock >= drain_ticks:
				part.clock = 0
				var drain_qty := int(part.stats.get("drain_quantity", 120))
				part.energy = maxi(0, part.energy - drain_qty)
			if part.shield_hp < part.shield_max_hp and part.energy > 0:
				var rate := float(part.stats.get("recharge_rate", 900.0))
				var power_per_hp := float(part.stats.get("power_per_hp", 0.5))
				var needed := minf(rate * dt, part.shield_max_hp - part.shield_hp)
				var affordable := float(part.energy) / maxf(0.01, power_per_hp)
				var restored := minf(needed, affordable)
				if restored > 0.0:
					part.shield_hp = minf(part.shield_max_hp, part.shield_hp + restored)
					part.energy = maxi(0, part.energy - roundi(restored * power_per_hp))
			part.shield_active = part.shield_hp > 0.0


static func shield_world_center(ship: Dictionary, part: Dictionary) -> Vector2:
	var local: Vector2 = part.get("mount_local", Vector2(part.cell) + Vector2(part.size) * 0.5)
	return Vector2(ship.position) + (local - Vector2(ship.center_of_mass)).rotated(ship.heading)


static func shield_world_facing(ship: Dictionary, part: Dictionary) -> float:
	return float(ship.heading) + float(part.get("rest_angle", 0.0))


static func intercept_shield(victim: Dictionary, a: Vector2, b: Vector2) -> Dictionary:
	var best := {}
	var best_t := INF
	var seg := b - a
	var seg_len_sq := seg.length_squared()
	if seg_len_sq <= 1e-9:
		return best
	for sid in SHIELD_IDS:
		for uid in victim.ids.get(sid, []):
			var part: Dictionary = victim.parts[uid]
			if part.hp <= 0.0 or not part.get("shield_active", false) or part.get("shield_hp", 0.0) <= 0.0:
				continue
			var center := shield_world_center(victim, part)
			var r: float = part.shield_radius
			var half_arc: float = part.shield_arc_rad * 0.5
			var facing := shield_world_facing(victim, part)
			var f := a - center
			var qa := seg_len_sq
			var qb := 2.0 * f.dot(seg)
			var qc := f.length_squared() - r * r
			var disc := qb * qb - 4.0 * qa * qc
			if disc < 0.0:
				continue
			var sqrt_d := sqrt(disc)
			for t_cand_raw in [(-qb - sqrt_d) / (2.0 * qa), (-qb + sqrt_d) / (2.0 * qa)]:
				var t_cand: float = float(t_cand_raw)
				if t_cand < 0.0 or t_cand > 1.0 or t_cand >= best_t:
					continue
				var hit_pos: Vector2 = a + seg * t_cand
				var angle_to_hit: float = (hit_pos - center).angle()
				if absf(wrapf(angle_to_hit - facing, -PI, PI)) <= half_arc:
					best_t = t_cand
					best = {"uid": uid, "pos": hit_pos}
	return best


static func apply_shield_damage(part: Dictionary, dmg: float, energy_drain: int = 0) -> bool:
	part.shield_hp = maxf(0.0, float(part.shield_hp) - dmg)
	if energy_drain > 0:
		part.energy = maxi(0, int(part.energy) - energy_drain)
	part.shield_flash = 1.0
	if part.shield_hp <= 0.0:
		part.shield_active = false
		part.shield_reboot = float(part.stats.get("reboot_delay", 2.5))
		return true
	return false


## Continuous Ion Beam trace with optional friendly Ion Prism combining (0.75^i diminishing returns).
static func tick_ion_beams(ship: Dictionary, other: Dictionary, side: String, target: int, dt: float) -> Array[Dictionary]:
	var beams: Array[Dictionary] = []
	var prism_inputs: Dictionary = {}  # prism_uid -> Array of {"dps", "sdps", "ignite", "source_uid"}
	var prisms: Array = ship.ids.get(ION_PRISM, [])
	for uid in ship.ids.get(ION_BEAM, []):
		var emitter: Dictionary = ship.parts[uid]
		emitter.ion_active = false
		var need_crew := int(emitter.stats.get("crew_required", 2))
		if emitter.hp <= 0.0 or emitter.staffed < need_crew or not ship.command or emitter.energy < int(emitter.stats.get("min_resources_used", 100)) or target < 0 or not other.parts.has(target) or other.parts[target].hp <= 0.0:
			emitter.aim_status = "offline"
			continue
		var muzzle := shield_world_center(ship, emitter)
		var rest_world := shield_world_facing(ship, emitter)
		# Check if a friendly alive Ion Prism sits in front of this emitter (within 42 deg cone, <= 20m)
		var linked_prism := -1
		var best_pdist := 22.0
		for puid in prisms:
			var prism: Dictionary = ship.parts[puid]
			if prism.hp <= 0.0:
				continue
			var pcenter := shield_world_center(ship, prism)
			var delta := pcenter - muzzle
			var dist := delta.length()
			if dist < 0.5 or dist >= best_pdist:
				continue
			if absf(wrapf(delta.angle() - rest_world, -PI, PI)) <= deg_to_rad(42.0):
				best_pdist = dist
				linked_prism = int(puid)
		if linked_prism >= 0:
			var prism_part: Dictionary = ship.parts[linked_prism]
			var pcenter := shield_world_center(ship, prism_part)
			var target_pos := Vector2(other.position)
			if muzzle.distance_to(target_pos) > float(prism_part.stats.get("range", 340.0)) + 20.0:
				emitter.aim_status = "out_of_range"
				continue
			emitter.aim_status = "ready"
			emitter.ion_active = true
			emitter.turret_angle_local = wrapf((pcenter - muzzle).angle() - float(ship.heading), -PI, PI)
			var power_cost := float(emitter.stats.get("beam_power_per_sec", 750.0)) * dt + float(emitter.ion_power_accum)
			var spend := mini(int(emitter.energy), int(floor(power_cost)))
			emitter.ion_power_accum = power_cost - float(spend)
			emitter.energy -= spend
			if not prism_inputs.has(linked_prism):
				prism_inputs[linked_prism] = []
			prism_inputs[linked_prism].append({
				"dps": float(emitter.stats.get("beam_dps", 2400.0)),
				"sdps": float(emitter.stats.get("beam_structural_dps", 1400.0)),
				"ignite": float(emitter.stats.get("ignite_intensity", 0.45)),
				"source_uid": uid,
			})
			beams.append({
				"from": muzzle, "to": pcenter, "side": side, "source_uid": uid,
				"hit_kind": "prism", "hit_uid": linked_prism, "strength": 1.0,
				"collapsed": false, "destroyed": false, "ignited": false,
			})
			continue
		if not Flight.aim(ship, other, emitter, target, dt):
			continue
		emitter.ion_active = true
		var power_cost := float(emitter.stats.get("beam_power_per_sec", 750.0)) * dt + float(emitter.ion_power_accum)
		var spend := mini(int(emitter.energy), int(floor(power_cost)))
		emitter.ion_power_accum = power_cost - float(spend)
		emitter.energy -= spend
		var dir := Vector2.from_angle(float(ship.heading) + float(emitter.turret_angle_local))
		beams.append(_trace_ion_beam(muzzle, dir, float(emitter.stats.get("range", 310.0)), float(emitter.stats.get("beam_dps", 2400.0)), float(emitter.stats.get("beam_structural_dps", 1400.0)), float(emitter.stats.get("ignite_intensity", 0.45)), 1.0, other, side, uid, dt))
	# Fire combined beams from energized Ion Prisms toward target (360-degree prism aim)
	for puid in prism_inputs:
		var prism: Dictionary = ship.parts[puid]
		var feeds: Array = prism_inputs[puid]
		feeds.sort_custom(func(a, b): return float(a.dps) > float(b.dps))
		var total_dps := 0.0
		var total_sdps := 0.0
		var max_ignite := 0.0
		var factor := 1.0
		for feed in feeds:
			total_dps += float(feed.dps) * factor
			total_sdps += float(feed.sdps) * factor
			max_ignite = maxf(max_ignite, float(feed.ignite))
			factor *= 0.75
		var origin := shield_world_center(ship, prism)
		var target_pos := Vector2(other.position) + (Vector2(other.parts[target].cell) + Vector2(other.parts[target].size) * 0.5 - Vector2(other.center_of_mass)).rotated(other.heading)
		var dir := (target_pos - origin).normalized()
		prism.turret_angle_local = wrapf(dir.angle() - float(ship.heading), -PI, PI)
		var strength := total_dps / 2400.0
		beams.append(_trace_ion_beam(origin, dir, float(prism.stats.get("range", 340.0)), total_dps, total_sdps, max_ignite * minf(1.8, strength), strength, other, side, int(puid), dt))
	return beams


static func _trace_ion_beam(muzzle: Vector2, dir: Vector2, beam_range: float, dps: float, sdps: float, ignite_val: float, strength: float, other: Dictionary, side: String, source_uid: int, dt: float) -> Dictionary:
	var far_end := muzzle + dir * beam_range
	var shield_hit := intercept_shield(other, muzzle, far_end)
	if not shield_hit.is_empty():
		var suid: int = int(shield_hit.uid)
		var collapsed := apply_shield_damage(other.parts[suid], dps * dt)
		return {
			"from": muzzle, "to": Vector2(shield_hit.pos), "side": side,
			"source_uid": source_uid, "hit_kind": "shield", "hit_uid": suid, "strength": strength,
			"collapsed": collapsed, "destroyed": false, "ignited": false,
		}
	var hull_hit := Flight.trace(other, muzzle, far_end)
	if not hull_hit.is_empty():
		var huid: int = int(hull_hit.uid)
		var part: Dictionary = other.parts[huid]
		var eff_dps := sdps if part.health_type == "Structural" else dps
		var was_alive: bool = part.hp > 0.0
		part.hp = maxf(0.0, float(part.hp) - eff_dps * dt)
		var ignited := ignite_part(part, ignite_val * dt * 2.2)
		return {
			"from": muzzle, "to": Vector2(hull_hit.pos), "side": side,
			"source_uid": source_uid, "hit_kind": "hull", "hit_uid": huid, "strength": strength,
			"collapsed": false, "destroyed": was_alive and part.hp <= 0.0, "ignited": ignited,
		}
	return {
		"from": muzzle, "to": far_end, "side": side,
		"source_uid": source_uid, "hit_kind": "miss", "hit_uid": -1, "strength": strength,
		"collapsed": false, "destroyed": false, "ignited": false,
	}


## Large Flak Cannon defensive flak burst: intercepts incoming enemy missiles & cannon shells.
static func tick_flak_defense(ship: Dictionary, side: String, projectiles: Array[Dictionary], dt: float) -> Array[Dictionary]:
	var shots: Array[Dictionary] = []
	for uid in ship.ids.get(FLAK_CANNON, []):
		var flak: Dictionary = ship.parts[uid]
		if flak.hp <= 0.0 or not ship.command or flak.staffed < int(flak.stats.get("crew_required", 2)):
			continue
		if flak.flak_cooldown > 0.0:
			flak.flak_cooldown = maxf(0.0, flak.flak_cooldown - dt)
		if flak.flak_cooldown > 0.0:
			continue
		var origin := shield_world_center(ship, flak)
		var f_range := float(flak.stats.get("flak_defense_range", 86.0))
		var facing := shield_world_facing(ship, flak)
		var half_arc := deg_to_rad(float(flak.stats.get("flak_defense_arc_deg", 100.0))) * 0.5
		var best_idx := -1
		var best_dist := f_range + 1.0
		for i in projectiles.size():
			var p: Dictionary = projectiles[i]
			if p.side == side:
				continue
			var pk := str(p.get("kind", ""))
			if pk != "missile" and pk != "cannon":
				continue
			var delta: Vector2 = Vector2(p.pos) - origin
			var dist := delta.length()
			if dist > f_range or dist >= best_dist:
				continue
			if absf(wrapf(delta.angle() - facing, -PI, PI)) > half_arc:
				continue
			best_dist = dist
			best_idx = i
		if best_idx >= 0 and flak.energy >= 80:
			var target_proj: Dictionary = projectiles[best_idx]
			flak.energy -= 80
			flak.flak_cooldown = float(flak.stats.get("flak_defense_interval", 0.45))
			flak.flak_intercepts += 1
			shots.append({
				"from": origin,
				"to": Vector2(target_proj.pos),
				"side": side,
				"pd_uid": uid,
				"killed": true,
				"proj_index": best_idx,
			})
	return shots


static func ignite_part(part: Dictionary, add_intensity: float) -> bool:
	if part.hp <= 0.0 or part.health_type == "Structural" or add_intensity <= 0.0:
		return false
	var was_burning: bool = float(part.get("fire", 0.0)) > 0.05
	part["fire"] = clampf(float(part.get("fire", 0.0)) + add_intensity, 0.0, 1.0)
	return (not was_burning) and float(part["fire"]) > 0.05


## Tick active ship fires and automatic fire-extinguisher suppression.
## Returns {"extinguished": Array[int], "destroyed": Array[int]}.
static func tick_fires(ship: Dictionary, dt: float) -> Dictionary:
	var extinguished: Array[int] = []
	var destroyed: Array[int] = []
	var suppress_rate := 0.06
	for uid in ship.ids.get(FIRE_EXTINGUISHER, []):
		var ext: Dictionary = ship.parts[uid]
		if ext.hp > 0.0:
			suppress_rate += float(ext.stats.get("extinguish_rate", 0.42))
	for uid in ship.parts:
		var part: Dictionary = ship.parts[uid]
		var f: float = float(part.get("fire", 0.0))
		if f <= 0.0:
			continue
		if part.hp <= 0.0:
			part.fire = 0.0
			continue
		part.hp = maxf(0.0, float(part.hp) - 160.0 * f * dt)
		if part.hp <= 0.0:
			part.fire = 0.0
			destroyed.append(int(uid))
			continue
		var next_f := maxf(0.0, f - suppress_rate * dt)
		part.fire = next_f
		if next_f <= 0.0:
			extinguished.append(int(uid))
	return {"extinguished": extinguished, "destroyed": destroyed}


static func tick_point_defense(ship: Dictionary, side: String, projectiles: Array[Dictionary], dt: float) -> Array[Dictionary]:
	var shots: Array[Dictionary] = []
	var pd_uids: Array = ship.ids.get(POINT_DEFENSE, [])
	if pd_uids.is_empty():
		return shots
	for uid in pd_uids:
		var pd: Dictionary = ship.parts[uid]
		if pd.hp <= 0.0 or not ship.command:
			continue
		if pd.pd_cooldown > 0.0:
			pd.pd_cooldown = maxf(0.0, pd.pd_cooldown - dt)
		if pd.pd_cooldown > 0.0:
			continue
		var cost := int(pd.stats.get("pd_energy_per_shot", 40))
		if pd.energy < cost:
			continue
		var origin := shield_world_center(ship, pd)
		var pd_range := float(pd.stats.get("pd_range", 68.0))
		var facing := shield_world_facing(ship, pd)
		var half_arc := deg_to_rad(float(pd.stats.get("firing_arc_deg", 220.0))) * 0.5
		var best_idx := -1
		var best_dist := pd_range + 1.0
		for i in projectiles.size():
			var p: Dictionary = projectiles[i]
			if p.side == side or not p.get("homing", false) or float(p.get("hp", 0.0)) <= 0.0:
				continue
			var delta: Vector2 = Vector2(p.pos) - origin
			var dist := delta.length()
			if dist > pd_range or dist >= best_dist:
				continue
			if absf(wrapf(delta.angle() - facing, -PI, PI)) > half_arc:
				continue
			best_dist = dist
			best_idx = i
		if best_idx >= 0:
			var target_proj: Dictionary = projectiles[best_idx]
			pd.energy -= cost
			pd.pd_cooldown = float(pd.stats.get("pd_fire_interval", 0.18))
			pd.turret_angle_local = wrapf((Vector2(target_proj.pos) - origin).angle() - float(ship.heading), -PI, PI)
			target_proj.hp = maxf(0.0, float(target_proj.hp) - float(pd.stats.get("pd_damage", 140.0)))
			var killed: bool = target_proj.hp <= 0.0
			if killed:
				pd.pd_intercepts += 1
			shots.append({
				"from": origin,
				"to": Vector2(target_proj.pos),
				"side": side,
				"pd_uid": uid,
				"killed": killed,
				"proj_index": best_idx,
			})
	return shots


static func shield_summary(ship: Dictionary) -> Dictionary:
	var total := 0
	var active := 0
	var hp := 0.0
	var max_hp := 0.0
	for sid in SHIELD_IDS:
		for uid in ship.ids.get(sid, []):
			var p: Dictionary = ship.parts[uid]
			if p.hp <= 0.0:
				continue
			total += 1
			max_hp += float(p.get("shield_max_hp", 0.0))
			if p.get("shield_active", false):
				active += 1
				hp += float(p.get("shield_hp", 0.0))
	var pd_total := 0
	var pd_intercepts := 0
	for uid in ship.ids.get(POINT_DEFENSE, []):
		var p: Dictionary = ship.parts[uid]
		if p.hp > 0.0:
			pd_total += 1
		pd_intercepts += int(p.get("pd_intercepts", 0))
	var fires := 0
	for p in ship.parts.values():
		if float(p.get("fire", 0.0)) > 0.05 and p.hp > 0.0:
			fires += 1
	return {
		"shield_count": total,
		"shield_active": active,
		"shield_hp": hp,
		"shield_max_hp": max_hp,
		"pd_count": pd_total,
		"pd_intercepts": pd_intercepts,
		"active_fires": fires,
	}
