class_name BlockRegistry
extends RefCounted

const MATERIAL_COUNT := 12
const HOTBAR_SLOT_COUNT := 9
const DEFAULT_MAX_STACK := 64

const COBBLESTONE := 0
const MOSS := 1
const BRICK := 2
const PLANK := 3
const GRASS := 4
const DIRT := 5
const SAND := 6
const SNOW := 7
const LOG := 8
const LEAVES := 9
const WATER := 10
const STONE := 11

const DEFINITIONS := [
	{"material": COBBLESTONE, "slot": 0, "drop_slot": 0, "name": "Cobblestone", "tool": "pickaxe", "hardness": 2.0, "max_stack": 64, "solid": true, "transparent": false, "replaceable": false, "recoverable": true, "color": Color("#777c84")},
	{"material": MOSS, "slot": 1, "drop_slot": 1, "name": "Mossy cobblestone", "tool": "pickaxe", "hardness": 2.0, "max_stack": 64, "solid": true, "transparent": false, "replaceable": false, "recoverable": true, "color": Color("#65745b")},
	{"material": BRICK, "slot": 2, "drop_slot": 2, "name": "Stone bricks", "tool": "pickaxe", "hardness": 1.5, "max_stack": 64, "solid": true, "transparent": false, "replaceable": false, "recoverable": true, "color": Color("#858589")},
	{"material": PLANK, "slot": 3, "drop_slot": 3, "name": "Oak planks", "tool": "axe", "hardness": 2.0, "max_stack": 64, "solid": true, "transparent": false, "replaceable": false, "recoverable": true, "color": Color("#b88a4c")},
	{"material": GRASS, "slot": 4, "drop_slot": 4, "name": "Grass block", "tool": "shovel", "hardness": 0.6, "max_stack": 64, "solid": true, "transparent": false, "replaceable": false, "recoverable": true, "color": Color("#629b3f")},
	{"material": DIRT, "slot": 5, "drop_slot": 5, "name": "Dirt", "tool": "shovel", "hardness": 0.5, "max_stack": 64, "solid": true, "transparent": false, "replaceable": false, "recoverable": true, "color": Color("#795438")},
	{"material": SAND, "slot": 6, "drop_slot": 6, "name": "Sand", "tool": "shovel", "hardness": 0.5, "max_stack": 64, "solid": true, "transparent": false, "replaceable": false, "recoverable": true, "color": Color("#d9c477")},
	{"material": SNOW, "slot": 7, "drop_slot": 7, "name": "Snow block", "tool": "shovel", "hardness": 0.2, "max_stack": 64, "solid": true, "transparent": false, "replaceable": false, "recoverable": true, "color": Color("#dfeaf0")},
	{"material": LOG, "slot": 8, "drop_slot": 8, "name": "Oak log", "tool": "axe", "hardness": 2.0, "max_stack": 64, "solid": true, "transparent": false, "replaceable": false, "recoverable": true, "color": Color("#765137")},
	{"material": LEAVES, "slot": -1, "drop_slot": -1, "name": "Oak leaves", "tool": "none", "hardness": 0.2, "max_stack": 64, "solid": true, "transparent": true, "replaceable": false, "recoverable": false, "color": Color("#3f793d")},
	{"material": WATER, "slot": -1, "drop_slot": -1, "name": "Water", "tool": "none", "hardness": 100.0, "max_stack": 1, "solid": false, "transparent": true, "replaceable": true, "recoverable": false, "color": Color("#3979bd")},
	{"material": STONE, "slot": -1, "drop_slot": 0, "name": "Stone", "tool": "pickaxe", "hardness": 1.5, "max_stack": 64, "solid": true, "transparent": false, "replaceable": false, "recoverable": true, "color": Color("#666a70")},
]

static func by_material(material_id: int) -> Dictionary:
	if material_id < 0 or material_id >= DEFINITIONS.size():
		return {}
	return DEFINITIONS[material_id]


static func by_slot(slot: int) -> Dictionary:
	if slot < 0 or slot >= HOTBAR_SLOT_COUNT:
		return {}
	for definition: Dictionary in DEFINITIONS:
		if definition.slot == slot:
			return definition
	return {}


static func validate() -> String:
	if DEFINITIONS.size() != MATERIAL_COUNT:
		return "registry material count mismatch"
	var materials := {}
	var slots := {}
	for index in DEFINITIONS.size():
		var definition: Dictionary = DEFINITIONS[index]
		if definition.material != index or materials.has(definition.material):
			return "invalid or duplicate material at index %d" % index
		materials[definition.material] = true
		if definition.slot != -1:
			if definition.slot < 0 or definition.slot >= HOTBAR_SLOT_COUNT or slots.has(definition.slot):
				return "invalid or duplicate slot at material %d" % index
			slots[definition.slot] = true
		if definition.max_stack <= 0 or definition.hardness < 0.0:
			return "invalid physical properties at material %d" % index
		if definition.recoverable and (definition.drop_slot < 0 or definition.drop_slot >= HOTBAR_SLOT_COUNT):
			return "recoverable material %d has no drop slot" % index
	if slots.size() != HOTBAR_SLOT_COUNT:
		return "every hotbar slot must have exactly one material"
	return ""

