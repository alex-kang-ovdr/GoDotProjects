class_name BlockInventory
extends RefCounted

signal changed

const SLOT_COUNT := 36
# Item IDs retain block/drop meanings independently of slot positions.
var counts := PackedInt32Array()
var items := PackedInt32Array()
var cursor := PackedInt32Array([-1, 0])
var durability := PackedInt32Array()
var equipment: Array = []
const EQUIPMENT_COUNT := 4


func _init(initial_count: int = 8) -> void:
	reset(initial_count, false)


func reset(initial_count: int = 8, notify: bool = true) -> void:
	counts.resize(SLOT_COUNT)
	items.resize(SLOT_COUNT)
	counts.fill(0)
	items.fill(-1)
	durability.resize(SLOT_COUNT)
	durability.fill(0)
	equipment = [[-1, 0], [-1, 0], [-1, 0], [-1, 0]]
	cursor = PackedInt32Array([-1, 0])
	for slot in BlockRegistry.HOTBAR_SLOT_COUNT:
		if initial_count > 0:
			items[slot] = slot
			counts[slot] = mini(initial_count, 64)
	if notify: changed.emit()


func count(slot: int) -> int:
	return counts[slot] if slot >= 0 and slot < counts.size() else 0


func item_at(slot: int) -> int:
	return items[slot] if slot >= 0 and slot < SLOT_COUNT and counts[slot] > 0 else -1


func max_for_slot(slot: int) -> int:
	return (64 if item_at(slot) == -1 else ItemRegistry.maximum(item_at(slot))) if slot >= 0 and slot < SLOT_COUNT else 0


func stack_at(slot: int) -> Array:
	var item := item_at(slot)
	return [item, count(slot), durability[slot]] if ItemRegistry.is_tool_item(item) else [item, count(slot)]


func total(item: int) -> int:
	var result := 0
	for slot in SLOT_COUNT:
		if item_at(slot) == item: result += counts[slot]
	return result


func can_add(item: int, amount: int = 1) -> bool:
	if item < 0 or item >= ItemRegistry.COUNT or amount < 0: return false
	var capacity := 0
	for slot in SLOT_COUNT:
		if item_at(slot) == item or count(slot) == 0: capacity += ItemRegistry.maximum(item) - count(slot)
	return capacity >= amount


# Atomic whole-item pickup. Merge matching stacks before occupying empty slots.
func add(item: int, amount: int = 1) -> bool:
	if not can_add(item, amount): return false
	if amount == 0: return true
	var remaining := amount
	for empty_pass in [false, true]:
		for slot in SLOT_COUNT:
			if (count(slot) == 0) != empty_pass: continue
			if not empty_pass and item_at(slot) != item: continue
			var moved := mini(remaining, ItemRegistry.maximum(item) - count(slot))
			if moved == 0: continue
			items[slot] = item
			if ItemRegistry.is_tool_item(item): durability[slot] = int(ItemRegistry.definition(item).durability)
			counts[slot] += moved
			remaining -= moved
			if remaining == 0:
				changed.emit()
				return true
	return false


func consume(slot: int, amount: int = 1, emit_change: bool = true) -> bool:
	if amount < 0 or slot < 0 or slot >= counts.size() or counts[slot] < amount:
		return false
	if amount == 0: return true
	counts[slot] -= amount
	if counts[slot] == 0:
		items[slot] = -1
		durability[slot] = 0
	if emit_change: changed.emit()
	return true


# Explicit fixture/development assignment, not an acquisition/challenge action.
func set_stack(slot: int, item: int, amount: int, notify: bool = true) -> bool:
	var stack := ItemRegistry.stack(item, amount)
	if slot < 0 or slot >= SLOT_COUNT or not valid_stack(stack): return false
	if items[slot] == item and counts[slot] == amount: return true
	items[slot] = item
	counts[slot] = amount
	durability[slot] = int(stack[2]) if stack.size() == 3 else 0
	if notify: changed.emit()
	return true


# Left: whole pickup/merge/swap. Right: ceil-half pickup or place one.
# Cursor remains owned on panel close and is part of the checkpoint.
func click(slot: int, half: bool = false) -> bool:
	if slot < 0 or slot >= SLOT_COUNT: return false
	var item := item_at(slot)
	if cursor[1] == 0:
		if count(slot) == 0: return false
		var moved := ceili(count(slot) / 2.0) if half else count(slot)
		cursor = PackedInt32Array(stack_at(slot))
		cursor[1] = moved
		consume(slot, moved, false)
	elif item == -1 or (item == cursor[0] and not ItemRegistry.is_tool_item(item)):
		var moved := mini(1 if half else cursor[1], ItemRegistry.maximum(cursor[0]) - count(slot))
		if moved == 0: return false
		items[slot] = cursor[0]
		durability[slot] = cursor[2] if cursor.size() == 3 else 0
		counts[slot] += moved
		cursor[1] -= moved
		if cursor[1] == 0: cursor = PackedInt32Array([-1, 0])
	elif not half:
		var previous := PackedInt32Array(stack_at(slot))
		items[slot] = cursor[0]
		counts[slot] = cursor[1]
		durability[slot] = cursor[2] if cursor.size() == 3 else 0
		cursor = previous
	else:
		return false
	changed.emit()
	return true


func capture() -> Dictionary:
	var slots := []
	for slot in SLOT_COUNT: slots.append(stack_at(slot))
	return {"slots": slots, "cursor": Array(cursor), "equipment": equipment.duplicate(true)}


func restore(value: Variant, notify: bool = true) -> bool:
	if not validate(value).is_empty(): return false
	for slot in SLOT_COUNT:
		items[slot] = int(value.slots[slot][0])
		counts[slot] = int(value.slots[slot][1])
		durability[slot] = int(value.slots[slot][2]) if value.slots[slot].size() == 3 else 0
	cursor = PackedInt32Array(value.cursor)
	equipment = value.equipment.duplicate(true)
	for stack: Array in equipment:
		for index in stack.size(): stack[index] = int(stack[index])
	if notify: changed.emit()
	return true


static func valid_stack(value: Variant) -> bool:
	if not value is Array or value.size() not in [2, 3]: return false
	if not SavedPlayerState.integer_in_range(value[0], -1, ItemRegistry.COUNT - 1): return false
	var item := int(value[0])
	if not SavedPlayerState.integer_in_range(value[1], 0, ItemRegistry.maximum(item)): return false
	if (item == -1) != (int(value[1]) == 0): return false
	if ItemRegistry.is_tool_item(item):
		return value.size() == 3 and SavedPlayerState.integer_in_range(value[2], 0, int(ItemRegistry.definition(item).durability))
	return value.size() == 2


static func validate(value: Variant) -> String:
	if not value is Dictionary or not value.get("slots") is Array or value.slots.size() != SLOT_COUNT: return "inventory must have 36 item stacks"
	for stack: Variant in value.slots:
		if not valid_stack(stack): return "inventory stack is invalid"
	if not valid_stack(value.get("cursor")): return "inventory cursor is invalid"
	if not value.get("equipment") is Array or value.equipment.size() != EQUIPMENT_COUNT: return "equipment must have four slots"
	for stack: Variant in value.equipment:
		if not valid_stack(stack) or (int(stack[0]) != -1 and not ItemRegistry.is_tool_item(int(stack[0]))): return "equipment stack is invalid"
	return ""


func equip_from_slot(slot: int, gear: int) -> bool:
	if slot < 0 or slot >= SLOT_COUNT or gear < 0 or gear >= EQUIPMENT_COUNT or not ItemRegistry.is_tool_item(item_at(slot)): return false
	var incoming := stack_at(slot)
	var previous: Array = equipment[gear]
	items[slot] = int(previous[0])
	counts[slot] = int(previous[1])
	durability[slot] = int(previous[2]) if previous.size() == 3 else 0
	equipment[gear] = incoming
	changed.emit()
	return true


func click_equipment(gear: int) -> bool:
	if gear < 0 or gear >= EQUIPMENT_COUNT: return false
	if cursor[0] != -1 and not ItemRegistry.is_tool_item(cursor[0]): return false
	if cursor[0] == -1 and int(equipment[gear][0]) == -1: return false
	var previous := PackedInt32Array(equipment[gear])
	equipment[gear] = Array(cursor)
	cursor = previous
	changed.emit()
	return true


static func migrate_v5(value: Variant) -> Dictionary:
	if not value is Dictionary or not value.get("slots") is Array or value.slots.size() != SLOT_COUNT: return {}
	var all: Array = value.slots + [value.get("cursor")]
	for stack: Variant in all:
		if not stack is Array or stack.size() != 2 or not SavedPlayerState.integer_in_range(stack[0], -1, 8) or not valid_stack(stack): return {}
	var result: Dictionary = value.duplicate(true)
	result.equipment = [[-1, 0], [-1, 0], [-1, 0], [-1, 0]]
	return result


static func migrate_legacy(value: Variant) -> Dictionary:
	if not value is Array or value.size() != 9: return {}
	var inventory := BlockInventory.new(0)
	for slot in 9:
		if not SavedPlayerState.integer_in_range(value[slot], 0, 64): return {}
		inventory.set_stack(slot, slot if int(value[slot]) > 0 else -1, int(value[slot]), false)
	return inventory.capture()
