extends RefCounted

const RocketNetwork := preload("res://sim/rocket_network.gd")
const BOOST := "cosmoteer.thruster_boost"
const ROCKET := "cosmoteer.thruster_rocket_nozzle"
const EXTENDER := "cosmoteer.thruster_rocket_extender"
const BATTERY := "cosmoteer.thruster_rocket_battery"


static func prepare(part: Dictionary) -> void:
	var source: Dictionary = part.stats.special_propulsion
	part.stats = part.stats.duplicate()
	part.stats.resupply_threshold = source.resupply_threshold
	part.capacity = int(source.get("local_battery_capacity", source.get("battery_capacity", 0)))
	if part.id == BOOST:
		part.raw_activation = 0.0
		part.raw_recovery = 0.0
		part.raw_maximum = 1.0
		part.boost_active = false
		part.boost_ready = false
		part.boost_timer = 0.0
		part.stats.battery_toggle_on = source.battery_toggle_on
		part.stats.battery_toggle_off = source.battery_toggle_off
		part.stats.nozzles = [source.normal_nozzle]
	elif part.id == ROCKET:
		part.rocket_energy = 0
		part.rocket_capacity = 0
		part.rocket_force = 0.0
		part.rocket_usable = 0
		part.rocket_usable_capacity = 0
		part.draw_cursor = 0
		part.raw_activation = 0.0
		part.raw_recovery = 0.0
		part.raw_maximum = 0.0
		part.stats.nozzles = [{
			"location":source.location, "rotation_deg":source.rotation_deg,
			"thrust_force":source.base_force, "max_activation":1.0,
			"ramp_up":source.ramp_up, "ramp_down":source.ramp_down,
			"recovery_time":source.recovery_time, "fuel_per_second":source.fuel_per_second
		}]


static func refresh_network(ship: Dictionary) -> void:
	var health := {}
	for p in ship.parts.values():
		if p.stats.has("special_propulsion"):
			health[p.uid] = p.hp
	ship.rocket_graph = RocketNetwork.analyze(ship.design, health)
	for uid in ship.ids.get(ROCKET, []):
		var p: Dictionary = ship.parts[uid]
		p.rocket_profile = ship.rocket_graph.nozzles.get(uid, {})
		update_rocket(ship, p)


static func update_boost_ready(ship: Dictionary, p: Dictionary) -> void:
	var source: Dictionary = p.stats.special_propulsion
	if p.energy <= source.battery_toggle_off:
		p.fuel_online = false
	elif p.energy >= source.battery_toggle_on:
		p.fuel_online = true
	p.boost_ready = p.hp > 0 and ship.command and p.fuel_online and not p.boost_active and not p.get("thermal_trip", false)


static func set_boost(ship: Dictionary, p: Dictionary, on: bool) -> bool:
	update_boost_ready(ship, p)
	if on == p.boost_active or (on and not p.boost_ready):
		return false
	var source: Dictionary = p.stats.special_propulsion
	if not on and p.energy < source.full_battery_gate:
		p.energy = maxi(0, p.energy + int(source.boost_stop_drain))
		p.fuel_fraction = 0.0
	p.boost_active = on
	p.boost_timer = 0.0
	p.raw_activation = 0.0
	p.raw_recovery = 0.0
	var nozzle: Dictionary = p.nozzles[0]
	nozzle.spec = source.boost_nozzle if on else source.normal_nozzle
	nozzle.activation = 0.0
	nozzle.recovery = 0.0
	update_boost_ready(ship, p)
	return true


static func tick_boost(ship: Dictionary, p: Dictionary, dt: float) -> void:
	update_boost_ready(ship, p)
	if not p.boost_active:
		return
	var source: Dictionary = p.stats.special_propulsion
	p.boost_timer += dt
	while p.boost_timer + 1e-9 >= source.boost_drain_interval:
		p.boost_timer = maxf(0, p.boost_timer - source.boost_drain_interval)
		p.energy = maxi(0, p.energy + int(source.boost_drain_quantity))
	if p.hp <= 0 or p.energy <= source.battery_toggle_off:
		set_boost(ship, p, false)


static func outlets(ship: Dictionary, uid: int) -> Array:
	if not ship.parts.has(uid):
		return []
	var p: Dictionary = ship.parts[uid]
	if p.hp <= 0 or p.get("boost_active", false):
		return []
	if p.id in [ROCKET, EXTENDER, BATTERY]:
		return ship.rocket_graph.consumers.get(uid, {}).get("storage_uids", [])
	return [uid]


static func total(ship: Dictionary, uids: Array, field: String) -> int:
	var amount := 0
	for uid in uids:
		if ship.parts[uid].hp > 0:
			amount += int(ship.parts[uid][field])
	return amount


static func deliver(ship: Dictionary, uids: Array, amount: int) -> int:
	var remaining := amount
	for uid in uids:
		var store: Dictionary = ship.parts[uid]
		var put := mini(remaining, store.capacity - store.energy) if store.hp > 0 else 0
		store.energy += put
		remaining -= put
		if remaining == 0:
			break
	return amount - remaining


static func overlaps(a: Array, b: Array) -> bool:
	for uid in a:
		if uid in b:
			return true
	return false


static func update_rocket(ship: Dictionary, p: Dictionary) -> void:
	var profile: Dictionary = p.rocket_profile
	var stores: Array = profile.get("storage_uids", [])
	p.rocket_energy = total(ship, stores, "energy")
	p.rocket_capacity = total(ship, stores, "capacity")
	p.rocket_usable = 0
	p.rocket_usable_capacity = 0
	for stage in profile.get("stages", []):
		p.rocket_usable += mini(stage.capacity, total(ship, stage.storage_uids, "energy"))
		p.rocket_usable_capacity += int(stage.capacity)
	if profile.is_empty():
		p.rocket_force = 0.0
		p.raw_maximum = 0.0
		return
	var charges := {}
	for uid in stores:
		charges[uid] = ship.parts[uid].energy
	var active := RocketNetwork.powered_profile(profile, charges)
	var spec: Dictionary = p.nozzles[0].spec
	p.rocket_force = active.thrust_force
	p.raw_maximum = active.normalized_activation_max
	spec.thrust_force = active.thrust_force
	spec.fuel_per_second = active.fuel_per_second
	spec.ramp_up = active.ramp_up
	spec.ramp_down = active.ramp_down
	spec.recovery_time = active.recovery_time


static func actuate(p: Dictionary, nozzle: Dictionary, dt: float) -> float:
	var maximum: float = p.raw_maximum
	if maximum <= 0.0:
		p.raw_recovery = 0.0
		p.raw_activation = 0.0
		return 0.0
	var demand: float = nozzle.requested * maximum
	var spec: Dictionary = nozzle.spec
	var prior := clampf(p.raw_activation, 0.0, maximum)
	var recovered := clampf(p.raw_recovery, 0.0, maximum)
	if demand > prior:
		var advance := dt * maximum / maxf(1e-9, spec.ramp_up)
		p.raw_recovery = move_toward(recovered, demand, advance)
		p.raw_activation = minf(demand, p.raw_recovery)
	else:
		var fall := dt * maximum / maxf(1e-9, spec.ramp_down)
		p.raw_activation = move_toward(prior, demand, fall)
		var cooling := dt * maximum / maxf(1e-9, spec.recovery_time)
		p.raw_recovery = maxf(p.raw_activation, move_toward(recovered, demand, cooling))
	return float(p.raw_activation) / maximum


## CombinedBatteryStorage removes proportionally by active stage capacity.
## Keep only integer resource units in the component reservoirs. Remainders
## rotate between stages so small per-tick draws stay fair over repeated ticks.
static func draw_rocket(ship: Dictionary, p: Dictionary, amount: int) -> void:
	var stages: Array = p.rocket_profile.get("stages", [])
	var remaining := amount
	while remaining > 0 and not stages.is_empty():
		var weight := 0
		for stage in stages:
			if total(ship, stage.storage_uids, "energy") > 0:
				weight += int(stage.capacity)
		if weight <= 0:
			break
		var budget := remaining
		for i in stages.size():
			var stage: Dictionary = stages[(p.draw_cursor + i) % stages.size()]
			var allotment := mini(remaining, ceili(float(budget) * int(stage.capacity) / weight))
			for uid in stage.storage_uids:
				var store: Dictionary = ship.parts[uid]
				var debit := mini(store.energy, allotment) if store.hp > 0 else 0
				store.energy -= debit
				allotment -= debit
				remaining -= debit
				if allotment == 0:
					break
			if remaining == 0:
				break
		p.draw_cursor = (int(p.draw_cursor) + 1) % stages.size()
		if remaining == budget:
			break
	update_rocket(ship, p)


static func summary(ship: Dictionary) -> Dictionary:
	var state := {
		"boost_count":0, "boost_active":0, "boost_ready":0, "boost_energy":0, "boost_capacity":0,
		"rocket_count":0, "rocket_staffed":0, "rocket_required":0, "rocket_energy":0,
		"rocket_capacity":0, "rocket_force":0.0, "rocket_fuel_per_second":0.0,
		"rocket_usable":0, "rocket_usable_capacity":0, "rocket_current_force":0.0,
		"rocket_current_rate":0.0
	}
	if ship.is_empty():
		return state
	for uid in ship.ids.get(BOOST, []):
		var p: Dictionary = ship.parts[uid]
		if p.hp <= 0:
			continue
		state.boost_count += 1
		state.boost_active += int(p.boost_active)
		state.boost_ready += int(p.boost_ready)
		state.boost_energy += p.energy
		state.boost_capacity += p.capacity
	var stores := {}
	for uid in ship.ids.get(ROCKET, []):
		var p: Dictionary = ship.parts[uid]
		if p.hp <= 0:
			continue
		state.rocket_count += 1
		state.rocket_staffed += p.staffed
		state.rocket_required += int(p.stats.special_propulsion.crew_required)
		state.rocket_force += p.rocket_force
		state.rocket_fuel_per_second += p.nozzles[0].spec.fuel_per_second
		state.rocket_current_force += p.get("actual_force", 0.0)
		state.rocket_current_rate += p.get("actual_fuel_rate", 0.0)
		state.rocket_usable += p.rocket_usable
		state.rocket_usable_capacity += p.rocket_usable_capacity
		for store in p.rocket_profile.get("storage_uids", []):
			stores[store] = true
	state.rocket_energy = total(ship, stores.keys(), "energy")
	state.rocket_capacity = total(ship, stores.keys(), "capacity")
	state.rocket_usable = mini(state.rocket_usable, state.rocket_energy)
	state.rocket_usable_capacity = mini(state.rocket_usable_capacity, state.rocket_capacity)
	return state
