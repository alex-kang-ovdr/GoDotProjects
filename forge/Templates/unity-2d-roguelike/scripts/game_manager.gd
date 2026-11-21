extends Node

## Port of Assets/Scripts/GameManager.cs (DontDestroyOnLoad -> Autoload Singleton)

var level_start_delay: float = 2.0
var turn_delay: float = 0.1
var player_food_points: int = 100
var players_turn: bool = true

var level: int = 1
var level_generation: int = 0
var enemies: Array[EnemyUnit] = []
var enemies_moving: bool = false
var doing_setup: bool = false
var is_game_over: bool = false

var current_main: Node = null
var level_image: ColorRect = null
var level_text: Label = null
var board_script: BoardManager = null
var player: PlayerUnit = null
var deterministic_seed: int = -1

func bind_main_scene(main_node: Node, img: ColorRect, txt: Label) -> void:
	current_main = main_node
	level_image = img
	level_text = txt
	init_game()

func reset_full_run() -> void:
	level = 1
	player_food_points = 100
	is_game_over = false
	players_turn = true
	enemies_moving = false
	SoundManager.start_music()
	init_game()

func init_game() -> void:
	level_generation += 1
	var gen := level_generation
	doing_setup = true
	players_turn = true
	enemies_moving = false
	enemies.clear()

	if level_text:
		level_text.text = "Day %d" % level
	if level_image:
		level_image.visible = true

	if current_main and current_main.has_method("rebuild_board_for_level"):
		current_main.rebuild_board_for_level(level, deterministic_seed)

	SoundManager.start_music()
	if level_start_delay > 0.0:
		get_tree().create_timer(level_start_delay).timeout.connect(func():
			if gen == level_generation:
				_hide_level_image()
		)
	else:
		_hide_level_image()

func _hide_level_image() -> void:
	if is_game_over:
		return
	if level_image:
		level_image.visible = false
	doing_setup = false

func schedule_next_level(delay: float) -> void:
	var gen := level_generation
	doing_setup = true
	if delay > 0.0:
		get_tree().create_timer(delay).timeout.connect(func():
			if gen == level_generation:
				advance_to_next_level()
		)
	else:
		advance_to_next_level()

func advance_to_next_level() -> void:
	if is_game_over:
		return
	level += 1
	init_game()

func add_enemy_to_list(enemy: EnemyUnit) -> void:
	enemies.append(enemy)

func game_over() -> void:
	is_game_over = true
	if level_text:
		level_text.text = "After %d days, you starved." % level
	if level_image:
		level_image.visible = true

func _process(_delta: float) -> void:
	if is_game_over:
		if Input.is_key_pressed(KEY_R) or Input.is_key_pressed(KEY_ENTER):
			reset_full_run()
		return
	if players_turn or enemies_moving or doing_setup:
		return
	_move_enemies()

func _move_enemies() -> void:
	var gen := level_generation
	enemies_moving = true
	if turn_delay > 0.0:
		await get_tree().create_timer(turn_delay).timeout
	if gen != level_generation or is_game_over or doing_setup:
		enemies_moving = false
		return
	if enemies.is_empty():
		if turn_delay > 0.0:
			await get_tree().create_timer(turn_delay).timeout
	for enemy in enemies:
		if gen != level_generation or is_game_over or doing_setup:
			enemies_moving = false
			return
		if is_instance_valid(enemy):
			enemy.move_enemy()
			if enemy.move_time > 0.0:
				await get_tree().create_timer(enemy.move_time).timeout
	if gen == level_generation:
		players_turn = true
	enemies_moving = false
