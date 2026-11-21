class_name PlayerUnit
extends MovingObject

## Port of Assets/Scripts/Player.cs

var restart_level_delay: float = 1.0
var points_per_food: int = 10
var points_per_soda: int = 20
var wall_damage: int = 1
var food: int = 100
var input_enabled: bool = true

var anim_sprite: AnimatedSprite2D
var food_label: Label

func setup(board_ref: BoardManager, label_ref: Label) -> void:
	board = board_ref
	food_label = label_ref
	z_index = UnityCompat.SORT_UNITS
	food = GameManager.player_food_points
	_update_food_text("Food %d" % food)

	anim_sprite = AnimatedSprite2D.new()
	anim_sprite.sprite_frames = load("res://resources/animations/player_frames.tres")
	anim_sprite.play("idle")
	anim_sprite.animation_finished.connect(_on_animation_finished)
	add_child(anim_sprite)

	set_grid_position_immediate(Vector2i(0, 0))
	board.register_blocking(grid_pos, self)

func _on_animation_finished() -> void:
	if anim_sprite and anim_sprite.animation != "idle":
		anim_sprite.play("idle")

func _update_food_text(text: String) -> void:
	if food_label:
		food_label.text = text

func _process(_delta: float) -> void:
	if not input_enabled or GameManager.is_game_over or GameManager.doing_setup:
		return
	if not GameManager.players_turn or is_moving:
		return

	var horizontal := 0
	var vertical := 0
	if Input.is_action_just_pressed("move_right"):
		horizontal = 1
	elif Input.is_action_just_pressed("move_left"):
		horizontal = -1
	elif Input.is_action_just_pressed("move_up"):
		vertical = 1
	elif Input.is_action_just_pressed("move_down"):
		vertical = -1

	if horizontal != 0:
		vertical = 0

	if horizontal != 0 or vertical != 0:
		execute_player_turn(horizontal, vertical)

func execute_player_turn(x_dir: int, y_dir: int) -> Dictionary:
	food -= 1
	GameManager.player_food_points = food
	_update_food_text("Food %d" % food)

	var res := attempt_move(x_dir, y_dir)
	if res.moved:
		SoundManager.randomize_sfx(["scavengers_footstep1", "scavengers_footstep2"])
		_check_trigger_cell()

	check_if_game_over()
	GameManager.players_turn = false
	return res

func on_cant_move(hit_target: Object) -> void:
	if hit_target is WallTile:
		(hit_target as WallTile).damage_wall(wall_damage)
		if anim_sprite:
			anim_sprite.play("chop")

func _check_trigger_cell() -> void:
	var item = board.get_trigger_at(grid_pos)
	if item == null:
		return
	var kind: String = item.get_meta("unity_tag", "")
	if kind == "Exit":
		input_enabled = false
		GameManager.player_food_points = food
		GameManager.schedule_next_level(restart_level_delay)
	elif kind == "Food":
		food += points_per_food
		GameManager.player_food_points = food
		_update_food_text("+%d Food %d" % [points_per_food, food])
		SoundManager.randomize_sfx(["scavengers_fruit1", "scavengers_fruit2"])
		board.consume_trigger(grid_pos)
	elif kind == "Soda":
		food += points_per_soda
		GameManager.player_food_points = food
		_update_food_text("+%d Food %d" % [points_per_soda, food])
		SoundManager.randomize_sfx(["scavengers_soda1", "scavengers_soda2"])
		board.consume_trigger(grid_pos)

func lose_food(loss: int) -> void:
	if anim_sprite:
		anim_sprite.play("hit")
	food -= loss
	GameManager.player_food_points = food
	_update_food_text("-%d Food %d" % [loss, food])
	check_if_game_over()

func check_if_game_over() -> void:
	if food <= 0:
		SoundManager.randomize_sfx(["scavengers_die"])
		SoundManager.stop_music()
		input_enabled = false
		GameManager.game_over()
