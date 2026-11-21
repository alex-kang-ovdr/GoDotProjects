class_name ScenarioDefinition
extends RefCounted

## 플랫폼과 UI에 의존하지 않는 시나리오 데이터 경계. 외부 데이터도 예외 없이 거부한다.
static func validate(data: Variant) -> Array[String]:
	var errors: Array[String] = []
	if not data is Dictionary:
		return ["scenario: expected Dictionary"]
	if not _integer(data.get("schema_version"), 1) or data.schema_version != 1:
		errors.append("schema_version: supported version is 1")
	if not _text(data.get("id")): errors.append("id: required")
	if not _integer(data.get("seed"), 0): errors.append("seed: nonnegative integer required")
	if not data.get("systems") is Array or not data.get("missions") is Array:
		errors.append("systems and missions: arrays required")
		return errors
	var missions := _index(data.missions, "missions", errors)
	for mission in missions.values():
		_validate_mission(mission, errors)
	var systems := _index(data.systems, "systems", errors)
	if systems.is_empty(): errors.append("systems: must not be empty")
	for system in systems.values():
		var label := "system " + str(system.id)
		if not _text(system.get("display_name")): errors.append(label + ": display_name required")
		if not _integer(system.get("depth"), 0): errors.append(label + ": invalid depth")
		if not _text(system.get("mission_id")) or not missions.has(system.get("mission_id")):
			errors.append(label + ": unknown mission_id")
		if not system.get("station") is bool: errors.append(label + ": station must be bool")
		if not system.get("boss") is String or system.boss not in ["", "mid", "final"]:
			errors.append(label + ": invalid boss classification")
		if not system.get("next") is Array:
			errors.append(label + ": next must be an array")
			continue
		var seen := {}
		for destination in system.next:
			if not _text(destination):
				errors.append(label + ": invalid edge ID")
				continue
			if seen.has(destination): errors.append(label + ": duplicate edge " + destination)
			seen[destination] = true
			if destination == system.id: errors.append(label + ": self edge")
			if not systems.has(destination):
				errors.append(label + ": unknown destination " + destination)
			elif _integer(system.get("depth"), 0) and _integer(systems[destination].get("depth"), 0):
				if systems[destination].depth <= system.depth:
					errors.append(label + ": edges must increase depth")
	var start: Variant = data.get("start_id")
	var goal: Variant = data.get("goal_id")
	if not _text(start) or not systems.has(start): errors.append("start_id: unknown system")
	if not _text(goal) or not systems.has(goal): errors.append("goal_id: unknown system")
	if start == goal: errors.append("start_id and goal_id must differ")
	# 구조가 유효할 때만 그래프 탐색. 잘못된 타입이 탐색 중 런타임 예외를 만들지 않는다.
	if not errors.is_empty(): return errors
	if not systems[goal].next.is_empty(): errors.append("goal: outgoing edges forbidden")
	var forward := {}
	var reverse := {}
	for id in systems:
		forward[id] = systems[id].next
		reverse[id] = []
	for id in systems:
		for destination in forward[id]: reverse[destination].append(id)
	var reachable := _reachable(start, forward)
	var finishing := _reachable(goal, reverse)
	for id in systems:
		if not reachable.has(id): errors.append("unreachable from start: " + id)
		if not finishing.has(id): errors.append("cannot reach goal: " + id)
	return errors

static func _index(entries: Array, label: String, errors: Array[String]) -> Dictionary:
	var result := {}
	for entry in entries:
		if not entry is Dictionary or not _text(entry.get("id")):
			errors.append(label + ": entry needs a string id")
			continue
		if result.has(entry.id):
			errors.append(label + ": duplicate id " + entry.id)
			continue
		result[entry.id] = entry
	return result

static func _validate_mission(mission: Dictionary, errors: Array[String]) -> void:
	var label := "mission " + str(mission.id)
	match mission.get("type"):
		"eliminate":
			if not mission.get("waves") is Array or mission.waves.is_empty():
				errors.append(label + ": nonempty waves required")
				return
			var target_ids := {}
			for wave in mission.waves:
				if not wave is Array or wave.is_empty():
					errors.append(label + ": nonempty target array required")
					continue
				for target in wave:
					if not _text(target):
						errors.append(label + ": invalid target_id")
					elif target_ids.has(target):
						errors.append(label + ": duplicate target_id " + target)
					else: target_ids[target] = true
		"escape":
			if not _text(mission.get("zone_id")): errors.append(label + ": zone_id required")
			if not _positive(mission.get("charge_seconds")): errors.append(label + ": invalid charge_seconds")
		"protect":
			if not _text(mission.get("target_id")): errors.append(label + ": target_id required")
			if not _positive(mission.get("duration_seconds")): errors.append(label + ": invalid duration_seconds")
		"acquire":
			if not _text(mission.get("item_id")): errors.append(label + ": item_id required")
			if not _integer(mission.get("amount"), 1): errors.append(label + ": positive integer amount required")
		_: errors.append(label + ": unknown objective type")

static func _reachable(start: String, adjacency: Dictionary) -> Dictionary:
	var visited := {start: true}
	var pending: Array = [start]
	while not pending.is_empty():
		var current: String = pending.pop_back()
		for next_id in adjacency[current]:
			if not visited.has(next_id):
				visited[next_id] = true
				pending.append(next_id)
	return visited

static func _text(value: Variant) -> bool:
	return value is String and not value.strip_edges().is_empty() and value == value.strip_edges()

static func _integer(value: Variant, minimum: int) -> bool:
	return value is int and value >= minimum

static func _positive(value: Variant) -> bool:
	return (value is int or value is float) and is_finite(float(value)) and float(value) > 0.0
