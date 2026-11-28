class_name PartData
extends RefCounted

const BalanceData = preload("res://scripts/balance.gd")

var uid: int
var kind: String:
	set(value):
		if kind != value:
			kind = value
			_spec_cached = false
			_geom_dirty = true
var cell: Vector2i:
	set(value):
		if cell != value:
			cell = value
			_geom_dirty = true
var quarter_turn: int = 0:
	set(value):
		var norm := posmod(value, 4)
		if quarter_turn != norm:
			quarter_turn = norm
			_geom_dirty = true
var hp: float
var max_hp: float
var ammo: int = 0
var capacity: int = 0

var _spec_cache: Dictionary = {}
var _spec_cached := false
var actuator_kind: String = ""
var nominal_force: float = 0.0
var _geom_dirty := true
var _cells_cache: Array[Vector2i] = []
var _local_center_px := Vector2.ZERO
var _cell_bounds_rect := Rect2()

func _init(next_uid: int, type: String, at: Vector2i, turns: int = 0) -> void:
	uid = next_uid
	kind = type
	cell = at
	quarter_turn = posmod(turns, 4)
	_geom_dirty = true
	var module_data := spec()
	hp = float(module_data.hp)
	max_hp = hp
	ammo = int(module_data.get("ammo", 0))
	capacity = int(module_data.get("capacity", 0))

func spec() -> Dictionary:
	if not _spec_cached:
		_spec_cache = BalanceData.module_spec(kind)
		actuator_kind = str(_spec_cache.get("actuator", ""))
		nominal_force = maxf(float(_spec_cache.get("force", 0.0)), 0.0)
		_spec_cached = true
	return _spec_cache

func _ensure_geom() -> void:
	if not _geom_dirty:
		return
	_geom_dirty = false
	_cells_cache.clear()
	var footprint: Array = spec().get("footprint", [Vector2i.ZERO])
	var sum_px := Vector2.ZERO
	var min_x := 999999
	var max_x := -999999
	var min_y := 999999
	var max_y := -999999
	for source: Vector2i in footprint:
		var p := source
		for _ignored in quarter_turn:
			p = Vector2i(-p.y, p.x)
		var world_c: Vector2i = cell + p
		_cells_cache.append(world_c)
		sum_px += Vector2(world_c) * BalanceData.CELL
		min_x = mini(min_x, world_c.x)
		max_x = maxi(max_x, world_c.x)
		min_y = mini(min_y, world_c.y)
		max_y = maxi(max_y, world_c.y)
	_local_center_px = sum_px / maxf(float(_cells_cache.size()), 1.0)
	if _cells_cache.is_empty():
		_cell_bounds_rect = Rect2(Vector2(float(cell.x) - 0.5, float(cell.y) - 0.5) * BalanceData.CELL, Vector2.ONE * BalanceData.CELL)
	else:
		_cell_bounds_rect = Rect2(
			Vector2(float(min_x) - 0.5, float(min_y) - 0.5) * BalanceData.CELL,
			Vector2(float(max_x - min_x + 1), float(max_y - min_y + 1)) * BalanceData.CELL
		)

func cells() -> Array[Vector2i]:
	_ensure_geom()
	return _cells_cache

func local_center_px() -> Vector2:
	_ensure_geom()
	return _local_center_px

func cell_bounds_rect() -> Rect2:
	_ensure_geom()
	return _cell_bounds_rect

func duplicate_part() -> PartData:
	var copy := PartData.new(uid, kind, cell, quarter_turn)
	copy.hp = hp
	copy.max_hp = max_hp
	copy.ammo = ammo
	copy.capacity = capacity
	return copy
