class_name StationState
extends RefCounted

const MAX_STATIONS := 128
const COOK_TICKS := 200
const FUEL_TICKS := 1600


static func create(kind: int) -> Dictionary:
	var slots := []
	for unused in (27 if kind == ItemRegistry.CHEST else 3): slots.append([-1, 0])
	return {"kind": kind, "slots": slots, "burn": 0, "cook": 0}


static func material(kind: int) -> int:
	return BlockRegistry.PLANK if kind == ItemRegistry.CHEST else BlockRegistry.BRICK


static func empty(state: Dictionary) -> bool:
	for stack: Array in state.slots:
		if int(stack[1]) > 0: return false
	return true


static func validate(state: Variant) -> String:
	if not state is Dictionary or not SavedPlayerState.integer_in_range(state.get("kind"), ItemRegistry.CHEST, ItemRegistry.FURNACE): return "invalid station kind"
	var furnace := int(state.kind) == ItemRegistry.FURNACE
	if not state.get("slots") is Array or state.slots.size() != (3 if furnace else 27): return "invalid station slot count"
	for index in state.slots.size():
		var stack: Variant = state.slots[index]
		if not BlockInventory.valid_stack(stack): return "invalid station stack"
		if furnace and int(stack[0]) not in [-1, [ItemRegistry.RAW_IRON, ItemRegistry.COAL, ItemRegistry.IRON_INGOT][index]]: return "invalid furnace item"
	if not SavedPlayerState.integer_in_range(state.get("burn"), 0, FUEL_TICKS) or not SavedPlayerState.integer_in_range(state.get("cook"), 0, COOK_TICKS - 1): return "invalid furnace timer"
	if not furnace and (int(state.burn) != 0 or int(state.cook) != 0): return "chest cannot have furnace timers"
	if furnace and int(state.cook) > 0 and not can_cook(state): return "cooking without valid input/output"
	return ""


static func can_cook(state: Dictionary) -> bool:
	return int(state.slots[0][0]) == ItemRegistry.RAW_IRON and int(state.slots[0][1]) > 0 and int(state.slots[2][1]) < 64


# One deterministic 1/20 second step. Burning continues while the output is full.
static func tick(state: Dictionary) -> bool:
	if int(state.kind) != ItemRegistry.FURNACE: return false
	var before_burn := int(state.burn)
	var before_cook := int(state.cook)
	var cooking := can_cook(state)
	if int(state.burn) == 0 and cooking and int(state.slots[1][1]) > 0:
		state.slots[1][1] = int(state.slots[1][1]) - 1
		if int(state.slots[1][1]) == 0: state.slots[1] = [-1, 0]
		state.burn = FUEL_TICKS
	if int(state.burn) > 0:
		state.burn = int(state.burn) - 1
		if cooking:
			state.cook = int(state.cook) + 1
			if int(state.cook) == COOK_TICKS:
				state.slots[0][1] = int(state.slots[0][1]) - 1
				if int(state.slots[0][1]) == 0: state.slots[0] = [-1, 0]
				state.slots[2] = [ItemRegistry.IRON_INGOT, int(state.slots[2][1]) + 1]
				state.cook = 0
	else: state.cook = 0
	if not can_cook(state): state.cook = 0
	return before_burn != int(state.burn) or before_cook != int(state.cook)


# Reuse the exact inventory transfer semantics on a private candidate. No live
# signal is emitted until both station and cursor ownership have changed.
static func click(state: Dictionary, inventory: BlockInventory, slot: int, half: bool = false) -> bool:
	if slot < 0 or slot >= state.slots.size(): return false
	var furnace := int(state.kind) == ItemRegistry.FURNACE
	if furnace and slot == 2 and inventory.cursor[0] == ItemRegistry.IRON_INGOT:
		var moved := mini(1 if half else int(state.slots[2][1]), 64 - inventory.cursor[1])
		if moved <= 0: return false
		inventory.cursor[1] += moved
		state.slots[2][1] = int(state.slots[2][1]) - moved
		if int(state.slots[2][1]) == 0: state.slots[2] = [-1, 0]
		inventory.changed.emit()
		return true
	if furnace and inventory.cursor[0] != -1:
		if slot == 2 or inventory.cursor[0] != [ItemRegistry.RAW_IRON, ItemRegistry.COAL][slot]: return false
	var candidate := BlockInventory.new(0)
	var snapshot := candidate.capture()
	for index in state.slots.size(): snapshot.slots[index] = state.slots[index].duplicate()
	snapshot.cursor = Array(inventory.cursor)
	if not candidate.restore(snapshot, false) or not candidate.click(slot, half): return false
	state.slots[slot] = candidate.stack_at(slot)
	inventory.cursor = candidate.cursor.duplicate()
	if furnace and not can_cook(state): state.cook = 0
	inventory.changed.emit()
	return true
