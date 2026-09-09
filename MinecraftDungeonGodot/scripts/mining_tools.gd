class_name MiningTools
extends RefCounted

const COUNT := 10
const DURABILITY := [0, 59, 59, 59, 131, 131, 131, 250, 250, 250]
var selected := 1
var remaining: Array = DURABILITY.duplicate()
var inventory: BlockInventory


static func definition(id: int) -> Dictionary:
	if id <= 0 or id >= COUNT: return {"kind": "hand", "tier": 0, "speed": 1.0, "name": "Hand"}
	var tier := int((id - 1) / 3) + 1
	var kind: String = ["pickaxe", "axe", "shovel"][(id - 1) % 3]
	return {"kind": kind, "tier": tier, "speed": float(tier * 2), "name": ["Wood", "Stone", "Iron"][tier - 1] + " " + kind}


func effective() -> Dictionary:
	if inventory != null and int(inventory.equipment[0][0]) != -1:
		var stack: Array = inventory.equipment[0]
		return ItemRegistry.definition(int(stack[0])).tool if int(stack[2]) > 0 else definition(0)
	return definition(selected if remaining[selected] > 0 else 0)


func can_harvest(material_id: int) -> bool:
	var block := BlockRegistry.by_material(material_id)
	return not block.is_empty() and block.recoverable and (block.tool != "pickaxe" or effective().kind == "pickaxe")


func duration(material_id: int) -> float:
	var block := BlockRegistry.by_material(material_id)
	if block.is_empty() or not block.recoverable: return INF
	var tool := effective()
	var speed: float = tool.speed if tool.kind == block.tool else 1.0
	return maxf(0.05, float(block.hardness) * (1.5 if can_harvest(material_id) else 5.0) / speed)


func wear(notify: bool = true) -> void:
	if inventory != null and int(inventory.equipment[0][0]) != -1:
		inventory.equipment[0][2] = maxi(0, int(inventory.equipment[0][2]) - 1)
		if notify: inventory.changed.emit()
		return
	if selected > 0: remaining[selected] = maxi(0, int(remaining[selected]) - 1)


func capture() -> Dictionary:
	return {"selected": selected, "remaining": remaining.duplicate()}


func restore(state: Dictionary) -> void:
	selected = int(state.selected)
	remaining.clear()
	for value in state.remaining: remaining.append(int(value))


static func validate(state: Variant) -> String:
	if not state is Dictionary or not SavedPlayerState.integer_in_range(state.get("selected"), 0, COUNT - 1): return "tool selection is invalid"
	var values: Variant = state.get("remaining")
	if not values is Array or values.size() != COUNT: return "tool durability array is invalid"
	for id in COUNT:
		if not SavedPlayerState.integer_in_range(values[id], 0, DURABILITY[id]): return "tool durability is invalid"
	return ""
