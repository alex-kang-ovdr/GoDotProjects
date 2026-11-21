class_name BoardManager
extends Node2D

## Port of Assets/Scripts/BoardManager.cs
## Sprite indices are auto-extracted from Unity binary prefabs & Scavengers_SpriteSheet.png.meta.

const COLUMNS: int = 8
const ROWS: int = 8
const WALL_MIN: int = 5
const WALL_MAX: int = 9
const FOOD_MIN: int = 1
const FOOD_MAX: int = 5

const FLOOR_SPRITES: Array[int] = [32,33,34,35,36,37,38,39]
const OUTER_WALL_SPRITES: Array[int] = [25,26,28]
const WALL_SPECS: Array[Dictionary] = [
	{ "base": 21, "dmg": 48, "hp": 4 },
	{ "base": 22, "dmg": 49, "hp": 4 },
	{ "base": 23, "dmg": 50, "hp": 4 },
	{ "base": 24, "dmg": 51, "hp": 4 },
	{ "base": 27, "dmg": 52, "hp": 4 },
	{ "base": 29, "dmg": 52, "hp": 4 },
	{ "base": 30, "dmg": 53, "hp": 4 },
	{ "base": 31, "dmg": 54, "hp": 4 }
]
const FOOD_SPRITE: int = 19
const SODA_SPRITE: int = 18
const EXIT_SPRITE: int = 20

var grid_positions: Array[Vector2i] = []
var blocking_cells: Dictionary = {}
var trigger_cells: Dictionary = {}
var rng := RandomNumberGenerator.new()

var walls_spawned: Array[WallTile] = []
var enemies_spawned: Array[EnemyUnit] = []
var pickups_spawned: Array[Node2D] = []

func _initialise_list() -> void:
	grid_positions.clear()
	for x in range(1, COLUMNS - 1):
		for y in range(1, ROWS - 1):
			grid_positions.append(Vector2i(x, y))

func _board_setup(board_root: Node2D) -> void:
	var holder := Node2D.new()
	holder.name = "Board"
	board_root.add_child(holder)

	for x in range(-1, COLUMNS + 1):
		for y in range(-1, ROWS + 1):
			var is_outer := (x == -1 or x == COLUMNS or y == -1 or y == ROWS)
			var sprite_idx: int
			if is_outer:
				sprite_idx = OUTER_WALL_SPRITES[rng.randi_range(0, OUTER_WALL_SPRITES.size() - 1)]
			else:
				sprite_idx = FLOOR_SPRITES[rng.randi_range(0, FLOOR_SPRITES.size() - 1)]

			var tile := Sprite2D.new()
			tile.texture = UnityCompat.load_atlas(sprite_idx)
			tile.position = UnityCompat.unity_grid_to_godot_pos(Vector2i(x, y))
			tile.z_index = UnityCompat.SORT_FLOOR
			holder.add_child(tile)

			if is_outer:
				blocking_cells[Vector2i(x, y)] = tile

func _random_position() -> Vector2i:
	var idx := rng.randi_range(0, grid_positions.size() - 1)
	var pos := grid_positions[idx]
	grid_positions.remove_at(idx)
	return pos

func _spawn_walls(board_root: Node2D) -> void:
	var count := rng.randi_range(WALL_MIN, WALL_MAX)
	for _i in range(count):
		var pos := _random_position()
		var spec: Dictionary = WALL_SPECS[rng.randi_range(0, WALL_SPECS.size() - 1)]
		var wall := WallTile.new()
		wall.name = "Wall_%d_%d" % [pos.x, pos.y]
		board_root.add_child(wall)
		wall.setup(pos, UnityCompat.load_atlas(spec.base), UnityCompat.load_atlas(spec.dmg), spec.hp, self)
		register_blocking(pos, wall)
		walls_spawned.append(wall)

func _spawn_pickups(board_root: Node2D) -> void:
	var count := rng.randi_range(FOOD_MIN, FOOD_MAX)
	for _i in range(count):
		var pos := _random_position()
		var is_soda := rng.randi_range(0, 1) == 1
		var item := Sprite2D.new()
		item.name = ("Soda_%d_%d" if is_soda else "Food_%d_%d") % [pos.x, pos.y]
		item.texture = UnityCompat.load_atlas(SODA_SPRITE if is_soda else FOOD_SPRITE)
		item.position = UnityCompat.unity_grid_to_godot_pos(pos)
		item.z_index = UnityCompat.SORT_ITEMS
		item.set_meta("unity_tag", "Soda" if is_soda else "Food")
		item.set_meta("grid_pos", pos)
		board_root.add_child(item)
		trigger_cells[pos] = item
		pickups_spawned.append(item)

func _spawn_enemies(board_root: Node2D, level: int, player_ref: PlayerUnit) -> void:
	# Original BoardManager.cs: int enemyCount = (int)Math.Log(level, 2f);
	var enemy_count := int(floor(log(float(max(level, 1))) / log(2.0)))
	for i in range(enemy_count):
		var pos := _random_position()
		var variant := 1 if rng.randi_range(0, 1) == 0 else 2
		var damage := 10 if variant == 1 else 20
		var enemy := EnemyUnit.new()
		enemy.name = "Enemy%d_%d" % [variant, i]
		board_root.add_child(enemy)
		enemy.setup(pos, variant, damage, self, player_ref)
		enemies_spawned.append(enemy)

func _spawn_exit(board_root: Node2D) -> void:
	var pos := Vector2i(COLUMNS - 1, ROWS - 1)
	var exit_node := Sprite2D.new()
	exit_node.name = "Exit"
	exit_node.texture = UnityCompat.load_atlas(EXIT_SPRITE)
	exit_node.position = UnityCompat.unity_grid_to_godot_pos(pos)
	exit_node.z_index = UnityCompat.SORT_ITEMS
	exit_node.set_meta("unity_tag", "Exit")
	exit_node.set_meta("grid_pos", pos)
	board_root.add_child(exit_node)
	trigger_cells[pos] = exit_node

func setup_scene(level: int, board_root: Node2D, player_ref: PlayerUnit, seed_override: int = -1) -> void:
	blocking_cells.clear()
	trigger_cells.clear()
	walls_spawned.clear()
	enemies_spawned.clear()
	pickups_spawned.clear()

	if seed_override >= 0:
		rng.seed = seed_override
	else:
		rng.randomize()

	_board_setup(board_root)
	_initialise_list()
	_spawn_walls(board_root)
	_spawn_pickups(board_root)
	_spawn_enemies(board_root, level, player_ref)
	_spawn_exit(board_root)

func register_blocking(pos: Vector2i, obj: Object) -> void:
	blocking_cells[pos] = obj

func clear_blocking(pos: Vector2i, obj: Object) -> void:
	if blocking_cells.get(pos) == obj:
		blocking_cells.erase(pos)

func move_blocking_unit(obj: Object, from_pos: Vector2i, to_pos: Vector2i) -> void:
	if blocking_cells.get(from_pos) == obj:
		blocking_cells.erase(from_pos)
	blocking_cells[to_pos] = obj

func get_blocking_at(pos: Vector2i) -> Object:
	return blocking_cells.get(pos, null)

func get_trigger_at(pos: Vector2i) -> Node2D:
	return trigger_cells.get(pos, null)

func consume_trigger(pos: Vector2i) -> void:
	var node: Node2D = trigger_cells.get(pos, null)
	if node:
		trigger_cells.erase(pos)
		node.visible = false
		node.queue_free()
