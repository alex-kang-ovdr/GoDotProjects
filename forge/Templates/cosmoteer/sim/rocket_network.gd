extends RefCounted
class_name RocketNetwork

## Pure geometric and rule-derived preview for the modular rocket thruster.
## Source: Cosmoteer Data/ships/terran/thruster_rocket_{nozzle,extender,battery}.
const NOZZLE := "cosmoteer.thruster_rocket_nozzle"
const EXTENDER := "cosmoteer.thruster_rocket_extender"
const BATTERY := "cosmoteer.thruster_rocket_battery"


## damage_by_uid stores current HP; missing entries mean full HP. energy_by_uid is
## optional live local storage content keyed by UID. Analysis never mutates design.
static func analyze(design: Variant, damage_by_uid: Dictionary = {}, energy_by_uid: Dictionary = {}) -> Dictionary:
	var result := {"nozzles": {}, "consumers": {}, "part_storage": {}, "connected_uids": [], "errors": []}
	if design == null:
		return result
	var part_list: Variant = design.get("parts")
	var catalog: Variant = design.get("by_id")
	if not part_list is Array or not catalog is Dictionary:
		return result
	var parts_by_uid: Dictionary = {}
	for part_variant in part_list:
		if not part_variant is Dictionary:
			continue
		var uid := int(part_variant.get("uid", -1))
		var id := str(part_variant.get("id", ""))
		if uid < 0 or not [NOZZLE, EXTENDER, BATTERY].has(id) or not catalog.has(id):
			continue
		var hp := float(damage_by_uid.get(uid, catalog[id].get("max_health", 0)))
		if hp <= 0.0:
			continue
		var stats: Dictionary = _stats(catalog, id)
		if not stats.has("local_battery_capacity") or not stats.has("resupply_threshold"):
			result.errors.append("Missing propulsion storage data for %s" % id)
			continue
		parts_by_uid[uid] = part_variant
		result.part_storage[uid] = {"capacity": float(stats.local_battery_capacity), "resupply_threshold": float(stats.resupply_threshold)}

	var stage_uids: Array[int] = []
	for uid in parts_by_uid:
		if parts_by_uid[uid].id == NOZZLE:
			stage_uids.append(int(uid))
	stage_uids.sort()
	var globally_connected: Dictionary = {}
	var consumer_pools: Dictionary = {}
	for nozzle_uid in stage_uids:
		var chain: Array[Dictionary] = [parts_by_uid[nozzle_uid]]
		var seen: Dictionary = {nozzle_uid: true}
		var cursor: Dictionary = parts_by_uid[nozzle_uid]
		while chain.size() <= parts_by_uid.size():
			var predecessor := _find_stage_predecessor(cursor, parts_by_uid, catalog)
			if predecessor.is_empty() or seen.has(int(predecessor.uid)):
				break
			seen[int(predecessor.uid)] = true
			chain.append(predecessor)
			cursor = predecessor
		var chain_uids: Array[int] = []
		var storage_uids: Array[int] = []
		var stages: Array[Dictionary] = []
		var network_uids: Dictionary = {}
		for stage in chain:
			var stage_uid := int(stage.uid)
			chain_uids.append(stage_uid)
			globally_connected[stage_uid] = true
			var stage_stores: Array[int] = [stage_uid]
			var stage_batteries := _attached_batteries(stage, parts_by_uid, catalog)
			for battery in stage_batteries:
				var battery_uid := int(battery.uid)
				if not stage_stores.has(battery_uid):
					stage_stores.append(battery_uid)
				globally_connected[battery_uid] = true
			for battery in stage_batteries:
				var battery_uid := int(battery.uid)
				if not consumer_pools.has(battery_uid):
					consumer_pools[battery_uid] = []
				for pool_uid in stage_stores:
					if not consumer_pools[battery_uid].has(pool_uid):
						consumer_pools[battery_uid].append(pool_uid)
			for store_uid in stage_stores:
				network_uids[store_uid] = true
			var stage_capacity := 0.0
			for store_uid in stage_stores:
				stage_capacity += float(result.part_storage[store_uid].capacity)
			var stage_rule := _stats(catalog, str(stage.id))
			if not stage_rule.has("stage_capacity_limit") or not stage_rule.has("stage_stack"):
				result.errors.append("Missing stack/capacity catalog data for %s" % str(stage.id))
				continue
			stage_capacity = minf(stage_capacity, float(stage_rule.stage_capacity_limit))
			stages.append({"uid": stage_uid, "storage_uids": stage_stores, "capacity": stage_capacity, "stack": float(stage_rule.stage_stack)})
			consumer_pools[stage_uid] = stage_stores.duplicate()
		for network_uid in network_uids:
			storage_uids.append(int(network_uid))
		storage_uids.sort()
		var physical_capacity := 0.0
		for store_uid in storage_uids:
			physical_capacity += float(result.part_storage[store_uid].capacity)
		var usable_capacity := 0.0
		for stage in stages:
			usable_capacity += float(stage.capacity)
		usable_capacity = minf(usable_capacity, physical_capacity)
		var nozzle_rule := _stats(catalog, NOZZLE)
		var nozzle_data_valid := true
		for required_key in ["base_force", "ramp_up", "ramp_down", "recovery_time", "fuel_per_second", "minimum_thrust_stack", "thrust_exponent", "ramp_exponent"]:
			if not nozzle_rule.has(required_key):
				result.errors.append("Missing nozzle propulsion value %s" % required_key)
				nozzle_data_valid = false
		if not nozzle_data_valid:
			continue
		var profile := {
			"uid": int(nozzle_uid), "connected": true, "chain_uids": chain_uids,
			"stages": stages, "storage_uids": storage_uids,
			"capacity": physical_capacity, "usable_capacity": usable_capacity,
			"rules": nozzle_rule,
		}
		var charge := _default_full_energy(profile, result.part_storage) if energy_by_uid.is_empty() else energy_by_uid
		profile.merge(powered_profile(profile, charge))
		result.nozzles[nozzle_uid] = profile

	var connected_uids: Array[int] = []
	for uid in globally_connected:
		connected_uids.append(int(uid))
	connected_uids.sort()
	result.connected_uids = connected_uids
	for consumer_uid in connected_uids:
		var pool_uids: Array = consumer_pools.get(consumer_uid, [consumer_uid])
		pool_uids.sort()
		var pool_capacity := 0.0
		for store_uid in pool_uids:
			pool_capacity += float(result.part_storage[int(store_uid)].capacity)
		result.consumers[consumer_uid] = {"storage_uids": pool_uids, "capacity": pool_capacity}
	return result


## Re-evaluate only charge-dependent stage gates. Feed energy by physical storage UID.
static func powered_profile(profile: Dictionary, energy_by_uid: Dictionary) -> Dictionary:
	var rules: Dictionary = profile.rules
	var powered := 0
	var active_stack := 0.0
	for stage in profile.stages:
		for uid in stage.storage_uids:
			if energy_by_uid.get(uid, 0) > 0:
				powered += 1
				active_stack += float(stage.stack)
				break
	var force_scale := 0.0
	var ramp_scale := 0.0
	if powered > 0:
		active_stack = maxf(rules.minimum_thrust_stack, active_stack)
		force_scale = pow(active_stack, rules.thrust_exponent)
		ramp_scale = pow(active_stack, rules.ramp_exponent)
	return {
		"powered_stage_count": powered,
		"thrust_force": rules.base_force * force_scale,
		"fuel_per_second": rules.fuel_per_second * force_scale,
		"ramp_up": rules.ramp_up * ramp_scale,
		"ramp_down": rules.ramp_down if powered > 0 else 0.0,
		"recovery_time": rules.recovery_time * ramp_scale,
		"normalized_activation_max": force_scale,
	}


## Friendly alias for editor previews.
static func preview(design: Variant, damage_by_uid: Dictionary = {}) -> Dictionary:
	return analyze(design, damage_by_uid)


static func _find_stage_predecessor(stage: Dictionary, parts_by_uid: Dictionary, catalog: Dictionary) -> Dictionary:
	var stage_stats := _stats(catalog, str(stage.id))
	var socket: Dictionary = stage_stats.get("sockets", {}).get("previous", {})
	for uid in parts_by_uid:
		var candidate: Dictionary = parts_by_uid[uid]
		if not socket.get("ids", []).has(candidate.id) or int(candidate.get("rotation", 0)) != posmod(int(stage.get("rotation", 0)) + int(socket.get("rotation", 0)), 4):
			continue
		if _socket_matches(stage, candidate, socket, catalog):
			return candidate
	return {}


static func _attached_batteries(stage: Dictionary, parts_by_uid: Dictionary, catalog: Dictionary) -> Array[Dictionary]:
	var found: Array[Dictionary] = []
	var q := int(stage.get("rotation", 0))
	var stage_stats := _stats(catalog, str(stage.id))
	for socket_name in ["left_battery", "right_battery"]:
		var socket: Dictionary = stage_stats.get("sockets", {}).get(socket_name, {})
		for uid in parts_by_uid:
			var candidate: Dictionary = parts_by_uid[uid]
			if not socket.get("ids", []).has(candidate.id) or int(candidate.get("rotation", 0)) != posmod(q + int(socket.get("rotation", 0)), 4):
				continue
			if _socket_matches(stage, candidate, socket, catalog):
				if not found.has(candidate):
					found.append(candidate)
	found.sort_custom(func(a: Dictionary, b: Dictionary) -> bool: return int(a.uid) < int(b.uid))
	return found


static func _socket_matches(host: Dictionary, neighbor: Dictionary, socket: Dictionary, catalog: Dictionary) -> bool:
	var q := posmod(int(host.get("rotation", 0)), 4)
	var oriented_rect := Rect2i(neighbor.cell - host.cell, neighbor.size)
	var host_dimensions: Array = catalog[str(host.id)].size
	var host_size := Vector2i(int(host_dimensions[0]), int(host_dimensions[1]))
	var corners := [oriented_rect.position, oriented_rect.position + Vector2i(oriented_rect.size.x, 0), oriented_rect.position + Vector2i(0, oriented_rect.size.y), oriented_rect.end]
	var min_x := INF
	var min_y := INF
	var max_x := -INF
	var max_y := -INF
	for corner in corners:
		var local := _inverse_rotate_point(Vector2(corner), q, host_size)
		min_x = minf(min_x, local.x)
		min_y = minf(min_y, local.y)
		max_x = maxf(max_x, local.x)
		max_y = maxf(max_y, local.y)
	var rect := Rect2(Vector2(min_x, min_y), Vector2(max_x - min_x, max_y - min_y))
	var offset := _pair_vec(socket.get("offset", []))
	var socket_point := Vector2(offset) + Vector2(0.5, 0.5)
	if not rect.has_point(socket_point):
		return false
	for edge in ["left", "right", "top", "bottom"]:
		if socket.has(edge):
			var actual := rect.position.x if edge == "left" else rect.end.x if edge == "right" else rect.position.y if edge == "top" else rect.end.y
			if not is_equal_approx(actual, float(socket[edge])):
				return false
	return true


static func _inverse_rotate_point(v: Vector2, q: int, host_size: Vector2i) -> Vector2:
	match posmod(q, 4):
		0: return v
		1: return Vector2(v.y, float(host_size.y) - v.x)
		2: return Vector2(float(host_size.x) - v.x, float(host_size.y) - v.y)
		_: return Vector2(float(host_size.x) - v.y, v.x)


static func _pair_vec(value: Variant) -> Vector2i:
	if value is Array and value.size() >= 2:
		return Vector2i(int(value[0]), int(value[1]))
	return Vector2i.ZERO


static func _stats(catalog: Dictionary, id: String) -> Dictionary:
	var part: Dictionary = catalog.get(id, {})
	var stats: Dictionary = part.get("stats", {})
	return stats.get("special_propulsion", {})


static func _default_full_energy(profile: Dictionary, storage: Dictionary) -> Dictionary:
	var result := {}
	for uid in profile.get("storage_uids", []):
		result[int(uid)] = float(storage[int(uid)].capacity)
	return result
