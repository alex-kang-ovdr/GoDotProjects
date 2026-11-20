class_name UnityCompat
extends RefCounted

## Unity 2D (32 PPU, Y-up, origin at bottom-left board cell 0,0)
## -> Godot 4.7.2 2D (pixels, Y-down) coordinate & sorting layer adapter.

const TILE_SIZE: int = 32
const COLUMNS: int = 8
const ROWS: int = 8

# Unity TagManager SortingLayers -> Godot CanvasItem.z_index
const SORT_FLOOR: int = 0
const SORT_ITEMS: int = 1
const SORT_UNITS: int = 2

static func unity_grid_to_godot_pos(grid_pos: Vector2i) -> Vector2:
	return Vector2(float(grid_pos.x * TILE_SIZE), float((ROWS - 1 - grid_pos.y) * TILE_SIZE))

static func godot_pos_to_unity_grid(world_pos: Vector2) -> Vector2i:
	return Vector2i(int(round(world_pos.x / float(TILE_SIZE))), ROWS - 1 - int(round(world_pos.y / float(TILE_SIZE))))

static func load_atlas(index: int) -> Texture2D:
	return load("res://resources/atlas/sprite_%02d.tres" % index) as Texture2D
