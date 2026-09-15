class_name PartData
extends RefCounted

const BalanceData = preload("res://scripts/balance.gd")

var uid: int
var kind: String
var cell: Vector2i
var quarter_turn: int = 0
var hp: float
var max_hp: float
var ammo: int = 0
var capacity: int = 0

func _init(next_uid: int, type: String, at: Vector2i, turns: int = 0) -> void:
	uid = next_uid
	kind = type
	cell = at
	quarter_turn = posmod(turns, 4)
	var module_data := BalanceData.module_spec(kind)
	hp = float(module_data.hp)
	max_hp = hp
	ammo = int(module_data.get("ammo", 0))
	capacity = int(module_data.get("capacity", 0))

func spec() -> Dictionary:
	return BalanceData.module_spec(kind)

func cells() -> Array[Vector2i]:
	var result: Array[Vector2i] = []
	var footprint: Array = spec().get("footprint", [Vector2i.ZERO])
	for source: Vector2i in footprint:
		var p := source
		for ignored in quarter_turn:
			p = Vector2i(-p.y, p.x)
		result.append(cell + p)
	return result

func duplicate_part() -> PartData:
	var copy := PartData.new(uid, kind, cell, quarter_turn)
	copy.hp = hp
	copy.max_hp = max_hp
	copy.ammo = ammo
	copy.capacity = capacity
	return copy
