extends Node2D

## Port of Assets/Scripts/Loader.cs + Assets/Scenes/Main.unity bootstrap

@onready var board_root: Node2D = $BoardRoot
@onready var food_label: Label = $HUD/FoodLabel
@onready var level_image: ColorRect = $HUD/LevelImage
@onready var level_text: Label = $HUD/LevelImage/LevelText

var board_manager: BoardManager
var player: PlayerUnit

func _ready() -> void:
	GameManager.bind_main_scene(self, level_image, level_text)

func rebuild_board_for_level(level: int, seed_override: int = -1) -> void:
	for child in board_root.get_children():
		board_root.remove_child(child)
		child.queue_free()

	board_manager = BoardManager.new()
	board_manager.name = "BoardManager"
	board_root.add_child(board_manager)

	player = PlayerUnit.new()
	player.name = "Player"
	board_root.add_child(player)
	player.setup(board_manager, food_label)

	var level_seed := -1 if seed_override < 0 else (seed_override + level * 101)
	board_manager.setup_scene(level, board_root, player, level_seed)

	GameManager.board_script = board_manager
	GameManager.player = player
