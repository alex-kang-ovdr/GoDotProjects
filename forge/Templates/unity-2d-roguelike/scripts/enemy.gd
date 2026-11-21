class_name EnemyUnit
extends MovingObject

## Port of Assets/Scripts/Enemy.cs

var player_damage: int = 10
var enemy_variant: int = 1
var skip_move: bool = false
var target: PlayerUnit
var anim_sprite: AnimatedSprite2D

func setup(pos: Vector2i, variant: int, damage: int, board_ref: BoardManager, player_ref: PlayerUnit) -> void:
	enemy_variant = variant
	player_damage = damage
	board = board_ref
	target = player_ref
	z_index = UnityCompat.SORT_UNITS

	anim_sprite = AnimatedSprite2D.new()
	var frames_path := "res://resources/animations/enemy1_frames.tres" if variant == 1 else "res://resources/animations/enemy2_frames.tres"
	anim_sprite.sprite_frames = load(frames_path)
	anim_sprite.play("idle")
	anim_sprite.animation_finished.connect(_on_animation_finished)
	add_child(anim_sprite)

	set_grid_position_immediate(pos)
	board.register_blocking(grid_pos, self)
	GameManager.add_enemy_to_list(self)

func _on_animation_finished() -> void:
	if anim_sprite and anim_sprite.animation != "idle":
		anim_sprite.play("idle")

func move_enemy() -> Dictionary:
	if skip_move:
		skip_move = false
		return { "skipped": true, "moved": false, "hit": null }

	if target == null:
		return { "skipped": false, "moved": false, "hit": null }

	var x_dir := 0
	var y_dir := 0
	if target.grid_pos.x == grid_pos.x:
		y_dir = 1 if target.grid_pos.y > grid_pos.y else -1
	else:
		x_dir = 1 if target.grid_pos.x > grid_pos.x else -1

	var res := attempt_move(x_dir, y_dir)
	skip_move = true
	res["skipped"] = false
	return res

func on_cant_move(hit_target: Object) -> void:
	if hit_target is PlayerUnit:
		(hit_target as PlayerUnit).lose_food(player_damage)
		if anim_sprite:
			anim_sprite.play("attack")
		SoundManager.randomize_sfx(["scavengers_enemy1", "scavengers_enemy2"])
