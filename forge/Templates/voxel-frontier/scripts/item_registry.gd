class_name ItemRegistry
extends RefCounted

const STICK := 9
const COAL := 10
const RAW_IRON := 11
const IRON_INGOT := 12
const WORKBENCH := 13
const CHEST := 14
const FURNACE := 15
const TOOL_BASE := 16
const COUNT := 25


static func definition(item: int) -> Dictionary:
	if item < 0 or item >= COUNT: return {}
	if item < 9:
		var result := BlockRegistry.by_slot(item).duplicate()
		result.equipment = false
		return result
	if item < TOOL_BASE:
		return {"name": ["Stick", "Coal", "Raw iron", "Iron ingot", "Workbench", "Chest", "Furnace"][item - 9], "max_stack": 64, "material": -1, "equipment": false}
	var tool := MiningTools.definition(item - TOOL_BASE + 1)
	return {"name": tool.name, "max_stack": 1, "material": -1, "equipment": true, "durability": MiningTools.DURABILITY[item - TOOL_BASE + 1], "tool": tool}


static func is_tool_item(item: int) -> bool:
	return item >= TOOL_BASE and item < COUNT


static func maximum(item: int) -> int:
	return 1 if is_tool_item(item) else (64 if item >= 0 and item < COUNT else 0)


static func stack(item: int, amount: int = 1) -> Array:
	if is_tool_item(item): return [item, amount, int(definition(item).durability)]
	return [item, amount]


static func display_color(item: int) -> Color:
	if item >= 0 and item < 9: return BlockRegistry.by_slot(item).color
	return [Color("#a88449"), Color("#292d35"), Color("#b68166"), Color("#ced6dd"), Color("#ad783c"), Color("#dab85f"), Color("#777c84")][item - 9] if item >= 9 and item <= 15 else Color("#ced6dd")
