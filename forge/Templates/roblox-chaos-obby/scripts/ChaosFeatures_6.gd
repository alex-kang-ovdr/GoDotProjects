extends Node
# Auto-ported by PlayForge RobloxConverter PoC Pipeline from: ServerScriptService/ChaosFeatures
# Strategy: runtime_adapter | Grades: D=1 A=4 R=5 X=0 V=1

var _rbx_script_parent: Node = null
var ReplicatedStorage
var chaosNames: Dictionary = {}
var currentChaos

func normal(character):
	var humanoid = RobloxCompat.find_first_child_of_class(character, "Humanoid")
	if humanoid:
		humanoid.set_walk_speed(16)
	RobloxCompat.set_lighting_fog(100, -1.0, null)
	RobloxCompat.set_lighting_fog(-1.0, 500, null)
	RobloxCompat.set_lighting_fog(-1.0, -1.0, Color8(200, 200, 200))
	print("normal")

func low_speed(character):
	var humanoid = RobloxCompat.find_first_child_of_class(character, "Humanoid")
	if humanoid:
		humanoid.set_walk_speed(8)
		print("low_speed")

func high_speed(character):
	var humanoid = RobloxCompat.find_first_child_of_class(character, "Humanoid")
	if humanoid:
		humanoid.set_walk_speed(64)
		print("high_speed")

func darkness(character):
	RobloxCompat.set_lighting_fog(0, -1.0, null)
	RobloxCompat.set_lighting_fog(-1.0, 20, null)
	RobloxCompat.set_lighting_fog(-1.0, -1.0, Color8(50, 50, 50))
	print("darkness")

func applyChaos(player, character):
	if not character: return
	if RobloxCompat.get_attribute(player, "LevelRed") == true:
		currentChaos.call(character)
	else:
		normal(character)

func newPlayer(player):
	player.character_added.connect(func(character):
		await RobloxCompat.task_wait(0.1)
		applyChaos(player, character)
	)
	RobloxCompat.connect_attribute_changed(player, "LevelRed", func():
		if player.character:
			applyChaos(player, player.character)
	)
	if player.character:
		applyChaos(player, player.character)

func timer(seconds, status):
	RobloxCompat.set_attribute(ReplicatedStorage, "ChaosText", status)
	for i in range(seconds, (1) - 1, -1):
		RobloxCompat.set_attribute(ReplicatedStorage, "TimeLeft", i)
		await RobloxCompat.task_wait(1)

func run_script(script_parent: Node) -> void:
	_rbx_script_parent = script_parent
	ReplicatedStorage = RobloxCompat.get_service("ReplicatedStorage")
	chaosNames = { low_speed: "Low Speed", high_speed: "High Speed", darkness: "Darkness" }
	currentChaos = normal
	RobloxCompat.players_on_added(newPlayer)
	for player in RobloxCompat.get_players():
		newPlayer(player)
	RobloxCompat.task_spawn(func():
		while true:
			var functionList = [low_speed, high_speed, darkness]
			var randomGenerator = RobloxCompat.random_new()
			var ChaosFunction = functionList[int(randomGenerator.next_integer(1, functionList.size())) - 1]
			await timer(240, "Next Chaos Event In:")
			currentChaos = ChaosFunction
			for player in RobloxCompat.get_players():
				var character = player.character
				if character:
					applyChaos(player, character)
			var eventName = (chaosNames.get(ChaosFunction, null) if chaosNames.get(ChaosFunction, null) != null else "Chaos Event")
			await timer(60, str(eventName) + str(" Event Ends In:"))
			currentChaos = normal
			for player in RobloxCompat.get_players():
				var character = player.character
				if character:
					applyChaos(player, character)
	)
