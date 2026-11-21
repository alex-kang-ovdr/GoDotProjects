class_name CraftingRecipes
extends RefCounted


static func recipes() -> Array:
	var result := [
		{"id": "planks", "name": "Oak planks x4", "shapeless": [8], "size": 2, "output": [3, 4]},
		{"id": "sticks", "name": "Sticks x4", "pattern": [[3], [3]], "size": 2, "output": [ItemRegistry.STICK, 4]},
		{"id": "workbench", "name": "Workbench", "pattern": [[3, 3], [3, 3]], "size": 2, "output": [ItemRegistry.WORKBENCH, 1]},
		{"id": "chest", "name": "Chest", "pattern": [[3, 3, 3], [3, -1, 3], [3, 3, 3]], "size": 3, "output": [ItemRegistry.CHEST, 1]},
		{"id": "furnace", "name": "Furnace", "pattern": [[0, 0, 0], [0, -1, 0], [0, 0, 0]], "size": 3, "output": [ItemRegistry.FURNACE, 1]},
	]
	for tier in 3:
		var material: int = [3, 0, ItemRegistry.IRON_INGOT][tier]
		var stick := ItemRegistry.STICK
		var patterns := [[[material, material, material], [-1, stick, -1], [-1, stick, -1]], [[material, material], [material, stick], [-1, stick]], [[material], [stick], [stick]]]
		for kind in 3:
			var item := ItemRegistry.TOOL_BASE + tier * 3 + kind
			result.append({"id": "tool_%d" % item, "name": ItemRegistry.definition(item).name, "pattern": patterns[kind], "size": 3, "output": ItemRegistry.stack(item)})
	return result


static func canonical(recipe: Dictionary) -> Array:
	var size_value := int(recipe.size)
	var grid := []
	for unused in size_value * size_value: grid.append(-1)
	if recipe.has("shapeless"):
		for index in recipe.shapeless.size(): grid[index] = int(recipe.shapeless[index])
	else:
		for y in recipe.pattern.size():
			for x in recipe.pattern[y].size(): grid[y * size_value + x] = int(recipe.pattern[y][x])
	return grid


static func match_grid(grid: Variant, size_value: int) -> Dictionary:
	if size_value not in [2, 3] or not grid is Array or grid.size() != size_value * size_value: return {}
	for item: Variant in grid:
		if not SavedPlayerState.integer_in_range(item, -1, ItemRegistry.COUNT - 1): return {}
	var used := []
	var left := size_value
	var top := size_value
	var right := -1
	var bottom := -1
	for index in grid.size():
		if int(grid[index]) == -1: continue
		used.append(int(grid[index]))
		left = mini(left, index % size_value)
		right = maxi(right, index % size_value)
		top = mini(top, int(index / size_value))
		bottom = maxi(bottom, int(index / size_value))
	if used.is_empty(): return {}
	used.sort()
	for recipe: Dictionary in recipes():
		if int(recipe.size) > size_value: continue
		if recipe.has("shapeless"):
			var required: Array = recipe.shapeless.duplicate()
			required.sort()
			if used == required: return recipe
			continue
		var pattern: Array = recipe.pattern
		if bottom - top + 1 != pattern.size() or right - left + 1 != pattern[0].size(): continue
		for mirrored in [false, true]:
			var matches := true
			for y in pattern.size():
				for x in pattern[y].size():
					var px: int = pattern[y].size() - 1 - x if mirrored else x
					if int(grid[(top + y) * size_value + left + x]) != int(pattern[y][px]): matches = false
			if matches: return recipe
	return {}


static func ingredients(recipe: Dictionary) -> Dictionary:
	var result := {}
	for item: int in canonical(recipe):
		if item >= 0: result[item] = int(result.get(item, 0)) + 1
	return result


# Preflight on an isolated candidate, including output space after consumption.
# The live inventory changes once only after the actual grid matcher succeeds.
static func craft(inventory: BlockInventory, id: String, commit: bool = true) -> Dictionary:
	var recipe := {}
	for entry: Dictionary in recipes():
		if entry.id == id: recipe = entry; break
	if recipe.is_empty(): return {"ok": false, "error": "Unknown recipe"}
	if int(recipe.size) == 3 and inventory.total(ItemRegistry.WORKBENCH) == 0: return {"ok": false, "error": "Keep a workbench in your inventory for 3x3 recipes"}
	var matched := match_grid(canonical(recipe), int(recipe.size))
	if matched.get("id") != id: return {"ok": false, "error": "Recipe grid did not match"}
	var candidate := BlockInventory.new(0)
	if not candidate.restore(inventory.capture(), false): return {"ok": false, "error": "Inventory state is invalid"}
	var needs := ingredients(recipe)
	for item: int in needs:
		if candidate.total(item) < int(needs[item]): return {"ok": false, "error": "Missing " + str(ItemRegistry.definition(item).name)}
	for item: int in needs:
		var remaining := int(needs[item])
		for slot in BlockInventory.SLOT_COUNT:
			if candidate.item_at(slot) != item: continue
			var taken := mini(remaining, candidate.count(slot))
			candidate.consume(slot, taken, false)
			remaining -= taken
			if remaining == 0: break
	if not candidate.add(int(recipe.output[0]), int(recipe.output[1])): return {"ok": false, "error": "No space for the complete output"}
	if commit: inventory.restore(candidate.capture())
	return {"ok": true, "error": "", "output": recipe.output.duplicate()}
