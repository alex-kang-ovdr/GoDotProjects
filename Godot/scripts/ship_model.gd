class_name ShipModel
extends RefCounted

const PartDataScript = preload("res://scripts/part_data.gd")
const BalanceData = preload("res://scripts/balance.gd")

var parts: Array[PartData] = []
var next_uid := 1

func make_part(kind: String, cell: Vector2i, turns: int = 0) -> PartData:
	var part := PartDataScript.new(next_uid, kind, cell, turns)
	next_uid += 1
	return part

func add(kind: String, cell: Vector2i, turns: int = 0) -> PartData:
	var part := make_part(kind, cell, turns)
	parts.append(part)
	return part

func initialize_player() -> void:
	var core := add("core", Vector2i.ZERO)
	core.hp = float(BalanceData.PLAYER.core_hp)
	core.max_hp = core.hp
	# 제거 전 웹 버전의 시작 함선과 동일한 15파트 구성이다.
	add("armor", Vector2i(1, 0))
	add("laser", Vector2i(0, -1))
	add("laser", Vector2i(0, 1))
	add("thruster", Vector2i(-1, -1))
	add("thruster", Vector2i(-1, 1))
	add("battery", Vector2i(-1, 0))
	add("reverse_thruster", Vector2i(1, -1))
	add("reverse_thruster", Vector2i(1, 1))
	add("rcs_thruster", Vector2i(0, -2))
	add("rcs_thruster", Vector2i(0, 2))
	add("shield_generator", Vector2i(2, 0))
	add("mini_missile_launcher", Vector2i(2, -1))
	add("mini_missile_launcher", Vector2i(2, 1))
	add("ammo_bay", Vector2i(3, 0))

func occupied(except_uid: int = -1) -> Dictionary:
	var result := {}
	for part in parts:
		if part.uid == except_uid:
			continue
		for p in part.cells():
			result[p] = part.uid
	return result

func can_place(part: PartData, at: Vector2i, ignored_uid: int = -1) -> bool:
	var clone := part.duplicate_part()
	clone.cell = at
	var map := occupied(ignored_uid)
	for p in clone.cells():
		if map.has(p):
			return false
	return is_adjacent_to_hull(clone, ignored_uid)

func is_adjacent_to_hull(part: PartData, ignored_uid: int = -1) -> bool:
	var map := occupied(ignored_uid)
	for cell in part.cells():
		for axis in [Vector2i.LEFT, Vector2i.RIGHT, Vector2i.UP, Vector2i.DOWN]:
			if map.has(cell + axis):
				return true
	return false

func attach(part: PartData, at: Vector2i) -> bool:
	if not can_place(part, at):
		return false
	part.cell = at
	parts.append(part)
	return true

func remove(uid: int) -> PartData:
	for index in parts.size():
		if parts[index].uid == uid:
			return parts.pop_at(index)
	return null

func part_at(cell: Vector2i) -> PartData:
	for part in parts:
		if cell in part.cells():
			return part
	return null

func core_part() -> PartData:
	for part in parts:
		if part.kind == "core":
			return part
	return null

func connected_uids() -> Dictionary:
	var core := core_part()
	if core == null:
		return {}
	var map := occupied()
	var by_uid := {}
	for part in parts:
		by_uid[part.uid] = part
	var visited := {core.uid: true}
	var queue: Array[int] = [core.uid]
	while not queue.is_empty():
		var uid: int = queue.pop_front()
		var part: PartData = by_uid[uid]
		for cell in part.cells():
			for axis in [Vector2i.LEFT, Vector2i.RIGHT, Vector2i.UP, Vector2i.DOWN]:
				var other_uid: Variant = map.get(cell + axis, -1)
				if other_uid != -1 and not visited.has(other_uid):
					visited[other_uid] = true
					queue.append(other_uid)
	return visited

func detach_disconnected() -> Array[PartData]:
	var connected := connected_uids()
	var detached: Array[PartData] = []
	for index in range(parts.size() - 1, -1, -1):
		if not connected.has(parts[index].uid):
			detached.append(parts.pop_at(index))
	return detached

func total_mass() -> float:
	var value := 0.0
	for part in parts:
		value += float(part.spec().mass)
	return maxf(value, 0.1)

func center_of_mass() -> Vector2:
	var sum := Vector2.ZERO
	var mass := 0.0
	for part in parts:
		var m := float(part.spec().mass)
		sum += Vector2(part.cell) * BalanceData.CELL * m
		mass += m
	return sum / maxf(mass, 0.1)

func shield_capacity() -> int:
	var cover := 0.0
	for part in parts:
		cover += float(part.spec().get("coverage_mass", 0.0))
	var generators := 0
	for part in parts:
		if part.kind == "shield_generator":
			generators += 1
	var mass_limited := int(floor(cover / maxf(total_mass(), 0.1)))
	return clampi(mini(generators, mass_limited), 0, int(BalanceData.SHIELD.max_layers))

func ammo_total(ammo_type: String) -> int:
	var total := 0
	for part in parts:
		if part.spec().get("ammo_type", "") == ammo_type:
			total += part.ammo
	return total

func consume_ammo(ammo_type: String, amount: int) -> bool:
	if ammo_total(ammo_type) < amount:
		return false
	var left := amount
	for part in parts:
		if part.spec().get("ammo_type", "") != ammo_type:
			continue
		var used := mini(left, part.ammo)
		part.ammo -= used
		left -= used
		if left == 0:
			return true
	return true

func merge_bays(first: PartData, second: PartData) -> PartData:
	if first.spec().get("ammo_type", "") == "" or first.spec().get("ammo_type", "") != second.spec().get("ammo_type", ""):
		return null
	var result := first.duplicate_part()
	result.max_hp = maxf(first.max_hp, second.max_hp) + minf(first.max_hp, second.max_hp) * 0.5
	result.hp = minf(result.max_hp, maxf(first.hp, second.hp) + minf(first.hp, second.hp) * 0.5)
	result.ammo = first.ammo + second.ammo
	result.capacity = first.capacity + second.capacity
	return result
