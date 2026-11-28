class_name ShipModel
extends RefCounted

const PartDataScript = preload("res://scripts/part_data.gd")
const BalanceData = preload("res://scripts/balance.gd")
const BLUEPRINT_SAVE_PATH := "user://player_ship_blueprint.json"
const CARDINAL_AXES := [Vector2i.LEFT, Vector2i.RIGHT, Vector2i.UP, Vector2i.DOWN]

static var saved_player_blueprint: Array[Dictionary] = []
static var saved_player_wires: Dictionary = {}
static var saved_player_cooling_pipes: Dictionary = {}
static var saved_player_bulkheads: Dictionary = {}
static var saved_diagonal_45 := false
static var _blueprint_disk_checked := false

var parts: Array[PartData] = []
var wires: Dictionary = {}         # Vector2i -> int (1=1kW, 2=2kW, 3=20kW)
var cooling_pipes: Dictionary = {} # Vector2i -> int (1=일반 냉각관, 2=복사 냉각관)
var bulkheads: Dictionary = {}     # String edge_key -> {a:Vector2i, b:Vector2i, kind:String, open:bool, locked:bool, hp:float, max_hp:float}
var next_uid := 1
var diagonal_45 := false

# O(1) 공간·구조 인덱스 캐시 (초대형 265+ 파트 함선 성능 최적화)
var revision: int = 1
var _index_dirty := true
var _indexed_count := -1
var _indexed_first_uid := -1
var _indexed_last_uid := -1
var _occupied_uid: Dictionary = {}          # Vector2i -> int(uid)
var _cell_to_part: Dictionary = {}          # Vector2i -> PartData
var _uid_to_part: Dictionary = {}           # int(uid) -> PartData
var _core_part_ref: PartData = null
var _exposed_perimeter: Array[Vector2i] = [] # 선체 외곽 빈 격자 목록
var _exhaust_keepout_cells: Dictionary = {}  # Vector2i -> true (타 파트 배치 시 기존 추진기 배기를 막는 셀)
var _rcs_parts: Array[PartData] = []
var _cached_total_mass := 0.1
var _cached_com := Vector2.ZERO
var _cached_bound_radius := 24.0
var _cached_collision_rect := Rect2()
var _cached_cell_bounds := Rect2(-5, -3, 10, 6)
var _cached_power_supply := 4.0
var _cached_power_demand := 0.0
var _cached_power_balance := 0.0
var _cached_shield_cap := 0

func mark_dirty() -> void:
	_index_dirty = true
	revision += 1

func _ensure_index() -> void:
	var n := parts.size()
	var f_uid := parts[0].uid if n > 0 else -1
	var l_uid := parts[n - 1].uid if n > 0 else -1
	if not _index_dirty and _indexed_count == n and _indexed_first_uid == f_uid and _indexed_last_uid == l_uid:
		return
	_index_dirty = false
	_indexed_count = n
	_indexed_first_uid = f_uid
	_indexed_last_uid = l_uid
	revision += 1

	_occupied_uid.clear()
	_cell_to_part.clear()
	_uid_to_part.clear()
	_core_part_ref = null
	_exposed_perimeter.clear()
	_exhaust_keepout_cells.clear()
	_rcs_parts.clear()

	var mass_sum := 0.0
	var com_weighted := Vector2.ZERO
	var cell_corner_radius := BalanceData.CELL * 0.5 * sqrt(2.0)
	var radius := cell_corner_radius
	var min_cx := 999999
	var max_cx := -999999
	var min_cy := 999999
	var max_cy := -999999
	var p_supply := 0.0
	var p_demand := 0.0
	var p_balance := 0.0
	var cover_mass := 0.0
	var shield_gens := 0

	for part in parts:
		_uid_to_part[part.uid] = part
		if part.kind == "core" and _core_part_ref == null:
			_core_part_ref = part
		var sp := part.spec()
		var pmass := float(sp.get("mass", 1.0))
		mass_sum += pmass
		com_weighted += part.local_center_px() * pmass
		var pwr := float(sp.get("power", 0.0))
		p_balance += pwr
		if pwr > 0.0:
			p_supply += pwr
		elif pwr < 0.0:
			p_demand += -pwr
		cover_mass += float(sp.get("coverage_mass", 0.0))
		shield_gens += int(sp.get("shield", 0))
		var act := str(sp.get("actuator", ""))
		if act == "turn":
			_rcs_parts.append(part)
		for c in part.cells():
			_occupied_uid[c] = part.uid
			_cell_to_part[c] = part
			radius = maxf(radius, Vector2(c).length() * BalanceData.CELL + cell_corner_radius)
			min_cx = mini(min_cx, c.x)
			max_cx = maxi(max_cx, c.x)
			min_cy = mini(min_cy, c.y)
			max_cy = maxi(max_cy, c.y)

	_cached_total_mass = maxf(mass_sum, 0.1)
	_cached_com = com_weighted / _cached_total_mass
	_cached_bound_radius = radius
	_cached_power_supply = maxf(p_supply, 4.0)
	_cached_power_demand = p_demand
	_cached_power_balance = p_balance
	var mass_limited := int(floor(cover_mass / _cached_total_mass))
	_cached_shield_cap = clampi(mini(shield_gens, mass_limited), 0, int(BalanceData.SHIELD.max_layers))

	if n == 0 or min_cx > max_cx:
		_cached_collision_rect = Rect2(-Vector2.ONE * BalanceData.CELL * 0.5, Vector2.ONE * BalanceData.CELL)
		_cached_cell_bounds = Rect2(-5, -3, 10, 6)
	else:
		var half := BalanceData.CELL * 0.5
		var min_pt := Vector2(float(min_cx) * BalanceData.CELL - half, float(min_cy) * BalanceData.CELL - half)
		var max_pt := Vector2(float(max_cx) * BalanceData.CELL + half, float(max_cy) * BalanceData.CELL + half)
		_cached_collision_rect = Rect2(min_pt, max_pt - min_pt)
		_cached_cell_bounds = Rect2(float(min_cx) - 0.5, float(min_cy) - 0.5, float(max_cx - min_cx + 1), float(max_cy - min_cy + 1))

	var exp_seen: Dictionary = {}
	for c_var in _occupied_uid.keys():
		var hc: Vector2i = c_var
		for axis in CARDINAL_AXES:
			var edge: Vector2i = hc + axis
			if not _occupied_uid.has(edge) and not exp_seen.has(edge):
				exp_seen[edge] = true
				_exposed_perimeter.append(edge)

	for part in parts:
		var act := str(part.spec().get("actuator", ""))
		if act == "forward" or act == "reverse":
			for ex_c in exhaust_cells_for(part):
				if int(_occupied_uid.get(ex_c, -1)) != part.uid:
					_exhaust_keepout_cells[ex_c] = true

static func mirror_cell(cell: Vector2i, is_diagonal: bool) -> Vector2i:
	if is_diagonal:
		return Vector2i(-cell.y, -cell.x)
	return Vector2i(cell.x, -cell.y)

static func mirror_turn(turn: int, is_diagonal: bool) -> int:
	var t := posmod(turn, 4)
	if is_diagonal:
		return posmod(3 - t, 4)
	return posmod(4 - t, 4)

static func mirrored_placement(part: PartData, anchor: Vector2i, is_diagonal: bool) -> Dictionary:
	var m_turn := mirror_turn(part.quarter_turn, is_diagonal)
	var src := part.duplicate_part()
	src.cell = anchor
	var target_cells: Dictionary = {}
	var reflected_list: Array[Vector2i] = []
	for c in src.cells():
		var mc := mirror_cell(c, is_diagonal)
		target_cells[mc] = true
		reflected_list.append(mc)
	var probe := PartDataScript.new(0, part.kind, Vector2i.ZERO, m_turn)
	for cand_anchor in reflected_list:
		probe.cell = cand_anchor
		var matches := true
		var pcells := probe.cells()
		if pcells.size() != target_cells.size():
			matches = false
		else:
			for pc in pcells:
				if not target_cells.has(pc):
					matches = false
					break
		if matches:
			return {"cell": cand_anchor, "turn": m_turn}
	return {"cell": mirror_cell(anchor, is_diagonal), "turn": m_turn}

static func save_player_blueprint(source_model: ShipModel) -> void:
	if source_model == null:
		return
	saved_player_blueprint = source_model.export_blueprint()
	saved_player_wires = source_model.wires.duplicate(true)
	saved_player_cooling_pipes = source_model.cooling_pipes.duplicate(true)
	saved_player_bulkheads = source_model.bulkheads.duplicate(true)
	saved_diagonal_45 = source_model.diagonal_45
	var wire_arr: Array[Dictionary] = []
	for wc in saved_player_wires.keys():
		if wc is Vector2i:
			wire_arr.append({"x": (wc as Vector2i).x, "y": (wc as Vector2i).y, "tier": int(saved_player_wires[wc])})
	var pipe_arr: Array[Dictionary] = []
	for pc in saved_player_cooling_pipes.keys():
		if pc is Vector2i:
			pipe_arr.append({"x": (pc as Vector2i).x, "y": (pc as Vector2i).y, "tier": int(saved_player_cooling_pipes[pc])})
	var bh_arr: Array[Dictionary] = []
	for bk in saved_player_bulkheads.keys():
		var bd: Dictionary = saved_player_bulkheads[bk]
		var ca: Vector2i = bd.get("a", Vector2i.ZERO)
		var cb: Vector2i = bd.get("b", Vector2i.RIGHT)
		bh_arr.append({
			"ax": ca.x, "ay": ca.y, "bx": cb.x, "by": cb.y,
			"kind": str(bd.get("kind", "door")),
			"open": bool(bd.get("open", false)),
			"locked": bool(bd.get("locked", false)),
		})
	var f := FileAccess.open(BLUEPRINT_SAVE_PATH, FileAccess.WRITE)
	if f != null:
		f.store_string(JSON.stringify({
			"diagonal_45": saved_diagonal_45,
			"parts": saved_player_blueprint,
			"wires": wire_arr,
			"cooling_pipes": pipe_arr,
			"bulkheads": bh_arr,
		}))

static func clear_saved_blueprint() -> void:
	saved_player_blueprint.clear()
	saved_player_wires.clear()
	saved_player_cooling_pipes.clear()
	saved_player_bulkheads.clear()
	saved_diagonal_45 = false
	_blueprint_disk_checked = true
	if FileAccess.file_exists(BLUEPRINT_SAVE_PATH):
		DirAccess.remove_absolute(BLUEPRINT_SAVE_PATH)

static func _ensure_blueprint_loaded() -> void:
	if _blueprint_disk_checked:
		return
	_blueprint_disk_checked = true
	if not saved_player_blueprint.is_empty():
		return
	if not FileAccess.file_exists(BLUEPRINT_SAVE_PATH):
		return
	var raw := FileAccess.get_file_as_string(BLUEPRINT_SAVE_PATH)
	var parsed: Variant = JSON.parse_string(raw)
	var arr: Array = []
	if parsed is Dictionary:
		saved_diagonal_45 = bool((parsed as Dictionary).get("diagonal_45", false))
		var p_arr: Variant = (parsed as Dictionary).get("parts", [])
		if p_arr is Array:
			arr = p_arr
		var w_arr: Variant = (parsed as Dictionary).get("wires", [])
		if w_arr is Array:
			saved_player_wires.clear()
			for wi in w_arr:
				if wi is Dictionary and wi.has("x") and wi.has("y"):
					saved_player_wires[Vector2i(int(wi.x), int(wi.y))] = clampi(int(wi.get("tier", 2)), 1, 3)
		var p_pipes: Variant = (parsed as Dictionary).get("cooling_pipes", [])
		if p_pipes is Array:
			saved_player_cooling_pipes.clear()
			for pi in p_pipes:
				if pi is Dictionary and pi.has("x") and pi.has("y"):
					saved_player_cooling_pipes[Vector2i(int(pi.x), int(pi.y))] = clampi(int(pi.get("tier", 2)), 1, 2)
	elif parsed is Array:
		arr = parsed
	if not arr.is_empty():
		var loaded: Array[Dictionary] = []
		for item in arr:
			if item is Dictionary and item.has("kind") and item.has("x") and item.has("y"):
				loaded.append(item)
		if not loaded.is_empty():
			saved_player_blueprint = loaded

func export_blueprint() -> Array[Dictionary]:
	var result: Array[Dictionary] = []
	for p in parts:
		result.append({
			"kind": p.kind,
			"x": p.cell.x,
			"y": p.cell.y,
			"turn": p.quarter_turn,
		})
	return result

func restore_from_blueprint(blueprint: Array[Dictionary], preserve_core_max_hp: float = -1.0) -> bool:
	if blueprint.is_empty():
		return false
	var target_core_max := maxf(float(BalanceData.PLAYER.core_hp), preserve_core_max_hp)
	parts.clear()
	next_uid = 1
	var has_core := false
	for entry in blueprint:
		var kind := str(entry.get("kind", "block"))
		var cell := Vector2i(int(entry.get("x", 0)), int(entry.get("y", 0)))
		var turn := posmod(int(entry.get("turn", 0)), 4)
		var part := make_part(kind, cell, turn)
		parts.append(part)
		if kind == "core":
			has_core = true
			part.max_hp = target_core_max
			part.hp = target_core_max
		else:
			part.hp = part.max_hp
		part.ammo = part.capacity
	if not has_core:
		var core := make_part("core", Vector2i.ZERO, 0)
		parts.append(core)
		core.max_hp = target_core_max
		core.hp = target_core_max
	mark_dirty()
	return true

func make_part(kind: String, cell: Vector2i, turns: int = 0) -> PartData:
	var part := PartDataScript.new(next_uid, kind, cell, turns)
	next_uid += 1
	return part

func add(kind: String, cell: Vector2i, turns: int = 0) -> PartData:
	var part := make_part(kind, cell, turns)
	parts.append(part)
	mark_dirty()
	return part

func initialize_default_player() -> void:
	parts.clear()
	next_uid = 1
	var core := add("core", Vector2i.ZERO)
	core.hp = float(BalanceData.PLAYER.core_hp)
	core.max_hp = core.hp
	add("armor", Vector2i(1, 0))
	add("laser", Vector2i(0, -1))
	add("laser", Vector2i(0, 1))
	add("thruster", Vector2i(-1, -1))
	add("thruster", Vector2i(-1, 1))
	add("battery", Vector2i(-1, 0))
	add("mini_missile_launcher", Vector2i(1, -1))
	add("mini_missile_launcher", Vector2i(1, 1))
	add("rcs_thruster", Vector2i(0, -2))
	add("rcs_thruster", Vector2i(0, 2))
	add("shield_generator", Vector2i(2, 0))
	add("reverse_thruster", Vector2i(2, -1))
	add("reverse_thruster", Vector2i(2, 1))
	add("ammo_bay", Vector2i(3, 0))
	mark_dirty()

func initialize_player() -> void:
	_ensure_blueprint_loaded()
	diagonal_45 = saved_diagonal_45
	if not saved_player_blueprint.is_empty():
		restore_from_blueprint(saved_player_blueprint)
		wires = saved_player_wires.duplicate(true)
		return
	initialize_default_player()

func occupied(except_uid: int = -1) -> Dictionary:
	_ensure_index()
	if except_uid == -1:
		return _occupied_uid
	var result := {}
	for part in parts:
		if part.uid == except_uid:
			continue
		for p in part.cells():
			result[p] = part.uid
	return result

func cell_to_part_map() -> Dictionary:
	_ensure_index()
	return _cell_to_part

func exposed_perimeter_cells() -> Array[Vector2i]:
	_ensure_index()
	return _exposed_perimeter

func cell_bounds_rect() -> Rect2:
	_ensure_index()
	return _cached_cell_bounds

func can_place(part: PartData, at: Vector2i, ignored_uid: int = -1) -> bool:
	_ensure_index()
	var map := _occupied_uid if ignored_uid == -1 else occupied(ignored_uid)
	var delta := at - part.cell
	var has_adj := false
	for base_c in part.cells():
		var p: Vector2i = base_c + delta
		if map.has(p):
			return false
		if not has_adj:
			for axis in CARDINAL_AXES:
				if map.has(p + axis):
					has_adj = true
					break
	if not has_adj:
		return false
	if would_block_exhaust(part, at, ignored_uid):
		return false
	return true

func attachment_candidates(part: PartData, ignored_uid: int = -1) -> Array[Vector2i]:
	_ensure_index()
	var offsets: Array[Vector2i] = []
	for cell in part.cells():
		offsets.append(cell - part.cell)
	var result: Array[Vector2i] = []
	var seen := {}
	if ignored_uid == -1:
		for edge in _exposed_perimeter:
			for offset in offsets:
				var anchor: Vector2i = edge - offset
				if not seen.has(anchor):
					seen[anchor] = true
					if can_place(part, anchor, -1):
						result.append(anchor)
		return result
	var occupied_cells := occupied(ignored_uid)
	for hull_cell in occupied_cells:
		for axis in CARDINAL_AXES:
			var edge: Vector2i = hull_cell + axis
			if not occupied_cells.has(edge):
				for offset in offsets:
					var anchor: Vector2i = edge - offset
					if not seen.has(anchor):
						seen[anchor] = true
						if can_place(part, anchor, ignored_uid):
							result.append(anchor)
	return result

func is_adjacent_to_hull(part: PartData, ignored_uid: int = -1) -> bool:
	var map := occupied(ignored_uid)
	for cell in part.cells():
		for axis in CARDINAL_AXES:
			if map.has(cell + axis):
				return true
	return false

func attach(part: PartData, at: Vector2i) -> bool:
	if part.kind == "scrap":
		return false
	if not can_place(part, at):
		return false
	part.cell = at
	if part_by_uid(part.uid) != null:
		part.uid = next_uid
	next_uid = maxi(next_uid, part.uid + 1)
	parts.append(part)
	mark_dirty()
	return true

func remove(uid: int) -> PartData:
	for index in parts.size():
		if parts[index].uid == uid:
			var removed: PartData = parts.pop_at(index)
			mark_dirty()
			return removed
	return null

func part_by_uid(uid: int) -> PartData:
	_ensure_index()
	return _uid_to_part.get(uid, null)

func part_at(cell: Vector2i) -> PartData:
	_ensure_index()
	return _cell_to_part.get(cell, null)

func core_part() -> PartData:
	_ensure_index()
	return _core_part_ref

func connected_uids() -> Dictionary:
	_ensure_index()
	if _core_part_ref == null:
		return {}
	var visited := {_core_part_ref.uid: true}
	var queue: Array[int] = [_core_part_ref.uid]
	var head := 0
	while head < queue.size():
		var uid: int = queue[head]
		head += 1
		var part: PartData = _uid_to_part.get(uid, null)
		if part == null:
			continue
		for cell in part.cells():
			for axis in CARDINAL_AXES:
				var other_uid: int = int(_occupied_uid.get(cell + axis, -1))
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
	if not detached.is_empty():
		mark_dirty()
	return detached

func total_mass() -> float:
	_ensure_index()
	return _cached_total_mass

func center_of_mass() -> Vector2:
	_ensure_index()
	return _cached_com

func bound_radius() -> float:
	_ensure_index()
	return _cached_bound_radius

func collision_box_rect() -> Rect2:
	_ensure_index()
	return _cached_collision_rect

func shield_capacity() -> int:
	_ensure_index()
	return _cached_shield_cap

func power_balance() -> float:
	_ensure_index()
	return _cached_power_balance

func power_supply() -> float:
	_ensure_index()
	return _cached_power_supply

func power_demand() -> float:
	_ensure_index()
	return _cached_power_demand

func power_efficiency() -> float:
	_ensure_index()
	if _cached_power_demand <= 0.01:
		return 1.0
	return clampf(_cached_power_supply / _cached_power_demand, 0.40, 1.25)

func exhaust_cells_for(part: PartData) -> Array[Vector2i]:
	var result: Array[Vector2i] = []
	var actuator := str(part.spec().get("actuator", ""))
	if actuator != "forward" and actuator != "reverse":
		return result
	var thrust_dir := Vector2.RIGHT.rotated(float(part.quarter_turn) * PI * 0.5)
	if actuator == "reverse":
		thrust_dir = -thrust_dir
	var exhaust_step := Vector2i(roundi(-thrust_dir.x), roundi(-thrust_dir.y))
	if exhaust_step == Vector2i.ZERO:
		return result
	var own := part.cells()
	for cell in own:
		var check_cell: Vector2i = cell + exhaust_step
		if not (check_cell in own) and not (check_cell in result):
			result.append(check_cell)
	return result

func is_exhaust_blocked(part: PartData, map_override: Dictionary = {}) -> bool:
	var actuator := str(part.spec().get("actuator", ""))
	var occ := occupied() if map_override.is_empty() else map_override
	if actuator == "turn":
		for cell in part.cells():
			for axis in CARDINAL_AXES:
				var adj_uid: int = int(occ.get(cell + axis, -1))
				if adj_uid == -1 or adj_uid == part.uid:
					return false
		return true
	if actuator != "forward" and actuator != "reverse":
		return false
	for check_cell in exhaust_cells_for(part):
		var blocker_uid: int = int(occ.get(check_cell, -1))
		if blocker_uid != -1 and blocker_uid != part.uid:
			return true
	return false

func would_block_exhaust(part: PartData, at: Vector2i, ignored_uid: int = -1) -> bool:
	_ensure_index()
	if ignored_uid == -1:
		var delta := at - part.cell
		var placed_set: Dictionary = {}
		for base_c in part.cells():
			var pc: Vector2i = base_c + delta
			if _occupied_uid.has(pc):
				return false
			if _exhaust_keepout_cells.has(pc):
				return true
			placed_set[pc] = true
		var p_act := str(part.spec().get("actuator", ""))
		if p_act == "forward" or p_act == "reverse":
			var thrust_dir := Vector2.RIGHT.rotated(float(part.quarter_turn) * PI * 0.5)
			if p_act == "reverse":
				thrust_dir = -thrust_dir
			var ex_step := Vector2i(roundi(-thrust_dir.x), roundi(-thrust_dir.y))
			if ex_step != Vector2i.ZERO:
				for pc_var in placed_set.keys():
					var chk: Vector2i = (pc_var as Vector2i) + ex_step
					if not placed_set.has(chk) and _occupied_uid.has(chk):
						return true
		elif p_act == "turn":
			var has_open := false
			for pc_var in placed_set.keys():
				var pc2: Vector2i = pc_var
				for axis in CARDINAL_AXES:
					var adj: Vector2i = pc2 + axis
					if not placed_set.has(adj) and not _occupied_uid.has(adj):
						has_open = true
						break
				if has_open:
					break
			if not has_open:
				return true
		for rcs in _rcs_parts:
			var rcs_open := false
			for rc in rcs.cells():
				for axis in CARDINAL_AXES:
					var radj: Vector2i = rc + axis
					var adj_uid := int(_occupied_uid.get(radj, -1))
					if (adj_uid == -1 and not placed_set.has(radj)) or adj_uid == rcs.uid:
						rcs_open = true
						break
				if rcs_open:
					break
			if not rcs_open:
				return true
		return false

	var clone := part.duplicate_part()
	clone.uid = -999999
	clone.cell = at
	var occ := occupied(ignored_uid).duplicate()
	for p in clone.cells():
		if occ.has(p):
			return false
		occ[p] = clone.uid
	if is_exhaust_blocked(clone, occ):
		return true
	for existing in parts:
		if existing.uid == ignored_uid:
			continue
		if is_exhaust_blocked(existing, occ):
			return true
	return false

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
