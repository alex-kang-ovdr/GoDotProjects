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

# 외곽 노출 셀에서 역산한 실제 배치 앵커만 반환한다.
# 다칸/회전 파트도 모든 점유 셀의 겹침과 인접 연결을 함께 통과해야 한다.
func attachment_candidates(part: PartData, ignored_uid: int = -1) -> Array[Vector2i]:
	var occupied_cells := occupied(ignored_uid)
	var exposed := {}
	for hull_cell in occupied_cells:
		for axis in [Vector2i.LEFT, Vector2i.RIGHT, Vector2i.UP, Vector2i.DOWN]:
			var edge: Vector2i = hull_cell + axis
			if not occupied_cells.has(edge):
				exposed[edge] = true
	var offsets: Array[Vector2i] = []
	for cell in part.cells():
		offsets.append(cell - part.cell)
	var result: Array[Vector2i] = []
	var seen := {}
	for edge in exposed:
		for offset in offsets:
			var anchor: Vector2i = edge - offset
			if not seen.has(anchor) and can_place(part, anchor, ignored_uid):
				seen[anchor] = true
				result.append(anchor)
	return result

func is_adjacent_to_hull(part: PartData, ignored_uid: int = -1) -> bool:
	var map := occupied(ignored_uid)
	for cell in part.cells():
		for axis in [Vector2i.LEFT, Vector2i.RIGHT, Vector2i.UP, Vector2i.DOWN]:
			if map.has(cell + axis):
				return true
	return false

func attach(part: PartData, at: Vector2i) -> bool:
	# 격침 잔해는 회수 대상일 뿐 선체에 다시 장착할 수 없다.
	if part.kind == "scrap":
		return false
	if not can_place(part, at):
		return false
	part.cell = at
	# 중립/적 함선의 로컬 UID와 플레이어 UID가 충돌하지 않게 재발급한다.
	if part_by_uid(part.uid) != null:
		part.uid = next_uid
	next_uid = maxi(next_uid, part.uid + 1)
	parts.append(part)
	return true

func remove(uid: int) -> PartData:
	for index in parts.size():
		if parts[index].uid == uid:
			return parts.pop_at(index)
	return null

func part_by_uid(uid: int) -> PartData:
	for part in parts:
		if part.uid == uid:
			return part
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
		var centroid := Vector2.ZERO
		for cell in part.cells():
			centroid += Vector2(cell)
		centroid /= float(part.cells().size())
		sum += centroid * BalanceData.CELL * m
		mass += m
	return sum / maxf(mass, 0.1)

# 모델 변형 시에만 호출되는 조립체 외곽 바운드 스피어 반지름이다.
# 각 점유 격자의 모서리까지 포함해 다칸·회전 파트도 보수적으로 감싼다.
func bound_radius() -> float:
	var radius := BalanceData.CELL * 0.5 * sqrt(2.0)
	var cell_corner_radius := BalanceData.CELL * 0.5 * sqrt(2.0)
	for part in parts:
		for occupied_cell in part.cells():
			radius = maxf(radius, Vector2(occupied_cell).length() * BalanceData.CELL + cell_corner_radius)
	return radius

# 실제 충돌과 피격 판정에 쓰는 조립체 로컬 AABB다. 탐지·AI 거리 최적화에는
# bound_radius()를 계속 쓸 수 있지만, 물리 충돌을 구체로 근사하지 않는다.
func collision_box_rect() -> Rect2:
	if parts.is_empty():
		return Rect2(-Vector2.ONE * BalanceData.CELL * 0.5, Vector2.ONE * BalanceData.CELL)
	var min_point := Vector2(INF, INF)
	var max_point := Vector2(-INF, -INF)
	var half_cell := Vector2.ONE * BalanceData.CELL * 0.5
	for part in parts:
		for occupied_cell in part.cells():
			var center := Vector2(occupied_cell) * BalanceData.CELL
			min_point = min_point.min(center - half_cell)
			max_point = max_point.max(center + half_cell)
	return Rect2(min_point, max_point - min_point)

func shield_capacity() -> int:
	var cover := 0.0
	for part in parts:
		cover += float(part.spec().get("coverage_mass", 0.0))
	var generators := 0
	for part in parts:
		generators += int(part.spec().get("shield", 0))
	var mass_limited := int(floor(cover / maxf(total_mass(), 0.1)))
	return clampi(mini(generators, mass_limited), 0, int(BalanceData.SHIELD.max_layers))

func power_balance() -> float:
	var total := 0.0
	for part in parts:
		total += float(part.spec().get("power", 0.0))
	return total

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
