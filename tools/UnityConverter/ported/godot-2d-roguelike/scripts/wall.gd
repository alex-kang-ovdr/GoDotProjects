class_name WallTile
extends StaticBody2D

## Port of Assets/Scripts/Wall.cs

var hp: int = 4
var grid_pos: Vector2i = Vector2i.ZERO
var dmg_sprite: Texture2D
var sprite: Sprite2D
var board: BoardManager

func setup(pos: Vector2i, base_tex: Texture2D, damaged_tex: Texture2D, initial_hp: int, board_ref: BoardManager) -> void:
	grid_pos = pos
	dmg_sprite = damaged_tex
	hp = initial_hp
	board = board_ref
	position = UnityCompat.unity_grid_to_godot_pos(pos)
	z_index = UnityCompat.SORT_ITEMS

	sprite = Sprite2D.new()
	sprite.texture = base_tex
	add_child(sprite)

	var shape := CollisionShape2D.new()
	var rect := RectangleShape2D.new()
	rect.size = Vector2(UnityCompat.TILE_SIZE, UnityCompat.TILE_SIZE)
	shape.shape = rect
	add_child(shape)

func damage_wall(loss: int) -> void:
	SoundManager.randomize_sfx(["scavengers_chop1", "scavengers_chop2"])
	if sprite and dmg_sprite:
		sprite.texture = dmg_sprite
	hp -= loss
	if hp <= 0:
		if board:
			board.clear_blocking(grid_pos, self)
		visible = false
		queue_free()
