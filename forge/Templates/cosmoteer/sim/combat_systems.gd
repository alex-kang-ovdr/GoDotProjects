extends RefCounted

## Combat expansion definitions & simulation helpers for PlayForge Cosmoteer:
## Heavy Laser, Medium Cannon, Homing Missile Launcher, Small Shield Generator,
## Point Defense Turret, Medium Reactor, Medium Crew Quarters, and 2x1 Armor.

const LASER_SMALL := "cosmoteer.laser_blaster_small"
const LASER_LARGE := "cosmoteer.laser_blaster_large"
const CANNON_MED := "cosmoteer.cannon_med"
const MISSILE_LAUNCHER := "cosmoteer.missile_launcher"
const SHIELD_SMALL := "cosmoteer.shield_gen_small"
const POINT_DEFENSE := "cosmoteer.point_defense"
const REACTOR_SMALL := "cosmoteer.reactor_small"
const REACTOR_MED := "cosmoteer.reactor_med"
const BUNK_SMALL := "cosmoteer.crew_quarters_small"
const BUNK_MED := "cosmoteer.crew_quarters_med"
const ARMOR_2X1 := "cosmoteer.armor_2x1"

const WEAPON_IDS := [LASER_SMALL, LASER_LARGE, CANNON_MED, MISSILE_LAUNCHER]
const REACTOR_IDS := [REACTOR_SMALL, REACTOR_MED]
const BUNK_IDS := [BUNK_SMALL, BUNK_MED]

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
	BUNK_MED: {
		"crew_capacity": 6,
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


static func is_reactor(id: String) -> bool:
	return id in REACTOR_IDS


static func is_bunk(id: String) -> bool:
	return id in BUNK_IDS


static func is_walkable_expansion(id: String) -> bool:
	return id in [LASER_LARGE, CANNON_MED, MISSILE_LAUNCHER, SHIELD_SMALL, POINT_DEFENSE, REACTOR_MED, BUNK_MED]


static func prepare_part(part: Dictionary) -> void:
	if part.id == SHIELD_SMALL:
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


static func activate_initial_shields(ship: Dictionary) -> void:
	for uid in ship.ids.get(SHIELD_SMALL, []):
		var part: Dictionary = ship.parts[uid]
		if part.hp > 0 and part.energy > 0:
			var max_hp: float = part.shield_max_hp
			var energy_ratio := clampf(float(part.energy) / maxf(1.0, float(part.capacity)), 0.0, 1.0)
			part.shield_hp = max_hp * maxf(0.5, energy_ratio)
			part.shield_active = part.shield_hp > 0.0
			part.shield_reboot = 0.0


static func tick_shields(ship: Dictionary, dt: float) -> void:
	for uid in ship.ids.get(SHIELD_SMALL, []):
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
		# Idle upkeep drain
		part.clock += 1
		var drain_ticks := maxi(1, roundi(float(part.stats.get("drain_interval", 1.0)) * 60.0))
		if part.clock >= drain_ticks:
			part.clock = 0
			var drain_qty := int(part.stats.get("drain_quantity", 120))
			part.energy = maxi(0, part.energy - drain_qty)
		# Recharge shield HP from internal battery
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


## Check if projectile segment [a, b] crosses an active shield arc on victim.
## Returns {} or {"uid": shield_uid, "pos": world_hit_pos}.
static func intercept_shield(victim: Dictionary, a: Vector2, b: Vector2) -> Dictionary:
	var best := {}
	var best_t := INF
	var seg := b - a
	var seg_len_sq := seg.length_squared()
	for uid in victim.ids.get(SHIELD_SMALL, []):
		var part: Dictionary = victim.parts[uid]
		if part.hp <= 0.0 or not part.get("shield_active", false) or part.get("shield_hp", 0.0) <= 0.0:
			continue
		var center := shield_world_center(victim, part)
		var r: float = part.shield_radius
		var half_arc: float = part.shield_arc_rad * 0.5
		var facing := shield_world_facing(victim, part)
		var f := a - center
		# Solve |f + t*seg|^2 = r^2
		if seg_len_sq <= 1e-9:
			continue
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


static func apply_shield_damage(part: Dictionary, dmg: float) -> bool:
	part.shield_hp = maxf(0.0, float(part.shield_hp) - dmg)
	part.shield_flash = 1.0
	if part.shield_hp <= 0.0:
		part.shield_active = false
		part.shield_reboot = float(part.stats.get("reboot_delay", 2.5))
		return true
	return false


## Tick Point Defense turrets on `ship`, shooting down enemy homing missiles.
## Returns array of {"from": Vector2, "to": Vector2, "side": String, "destroyed_index": int, "pd_uid": int}.
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
	for uid in ship.ids.get(SHIELD_SMALL, []):
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
	return {
		"shield_count": total,
		"shield_active": active,
		"shield_hp": hp,
		"shield_max_hp": max_hp,
		"pd_count": pd_total,
		"pd_intercepts": pd_intercepts,
	}
