extends Node
# Auto-ported by PlayForge RobloxConverter PoC Pipeline from: ServerScriptService/Checkpoints
# Strategy: runtime_adapter | Grades: D=0 A=2 R=8 X=1 V=0

var _rbx_script_parent: Node = null
var DataStoreService
var DataStore
var Workspace
var Players
var checkpointsFolder
var lobbySpawn

func findSpawnLocation(checkpointObject):
	if RobloxCompat.is_a(checkpointObject, "SpawnLocation"):
		return checkpointObject
	elif RobloxCompat.is_a(checkpointObject, "Model"):
		return RobloxCompat.find_first_child_of_class(checkpointObject, "SpawnLocation", true)
	return null

func setupCheckpointTouch(part, checkpointObject):
	if RobloxCompat.is_a(part, "BasePart"):
		RobloxCompat.connect_touched(part, func(otherPart):
			var character = RobloxCompat.find_first_ancestor_of_class(otherPart, "Model")
			if not character: return
			var player = RobloxCompat.get_player_from_character(character)
			if not player: return
			var spawnLoc = findSpawnLocation(checkpointObject)
			if spawnLoc:
				player.respawn_location = spawnLoc
			var stage = RobloxCompat.find_first_child(player, "Stage")
			if stage and stage.value != RobloxCompat.get_roblox_name(checkpointObject):
				stage.value = RobloxCompat.get_roblox_name(checkpointObject)
				var key = str("Player_") + str(player.user_id)
				DataStore.set_async(key, RobloxCompat.get_roblox_name(checkpointObject))
		)

func setupCheckpoint(checkpointObject):
	if RobloxCompat.is_a(checkpointObject, "BasePart"):
		setupCheckpointTouch(checkpointObject, checkpointObject)
	elif RobloxCompat.is_a(checkpointObject, "Model"):
		for part in RobloxCompat.get_descendants(checkpointObject):
			setupCheckpointTouch(part, checkpointObject)

func run_script(script_parent: Node) -> void:
	_rbx_script_parent = script_parent
	DataStoreService = RobloxCompat.get_service("DataStoreService")
	DataStore = RobloxCompat.get_datastore_stub("ProgressPoints")
	Workspace = RobloxCompat.get_service("Workspace")
	Players = RobloxCompat.get_service("Players")
	checkpointsFolder = RobloxCompat.wait_for_child(Workspace, "Checkpoints")
	lobbySpawn = RobloxCompat.wait_for_child(RobloxCompat.wait_for_child(Workspace, "Spawnpoints"), "LobbySpawn")
	RobloxCompat.players_on_added(func(player):
		if RobloxCompat.is_a(lobbySpawn, "SpawnLocation"):
			player.respawn_location = lobbySpawn
		var stageValue = RobloxCompat.instance_new("StringValue")
		stageValue.set_meta("roblox_name", "Stage")
		RobloxCompat.set_parent(stageValue, player)
		var key = str("Player_") + str(player.user_id)
		var success := true
		var savedStageName = DataStore.get_async(key)
		if success and savedStageName:
			stageValue.value = savedStageName
		else:
			stageValue.value = "Red 0"
	)
	for child in RobloxCompat.get_rbx_children(checkpointsFolder):
		setupCheckpoint(child)
	RobloxCompat.connect_child_added(checkpointsFolder, setupCheckpoint)
