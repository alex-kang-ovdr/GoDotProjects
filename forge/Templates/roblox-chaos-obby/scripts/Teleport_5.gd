extends Node
# Auto-ported by PlayForge RobloxConverter PoC Pipeline from: ServerScriptService/Teleport
# Strategy: runtime_adapter | Grades: D=1 A=7 R=9 X=1 V=0

var _rbx_script_parent: Node = null
var DataStoreService
var DataStore
var Workspace
var Players
var teleportsFolder
var lobbyFolder
var checkpointsFolder
var debounce

func teleportPlayerToSavedCheckpoint(player):
	var character = player.character
	if not character: return
	var rootPart = (RobloxCompat.find_first_child(character, "HumanoidRootPart") if RobloxCompat.find_first_child(character, "HumanoidRootPart") != null else RobloxCompat.find_first_child(character, "HumanoidRootPart"))
	var humanoid = RobloxCompat.find_first_child_of_class(character, "Humanoid")
	if not rootPart or not humanoid: return
	var key = str("Player_") + str(player.user_id)
	var success := true
	var savedSpawnName = DataStore.get_async(key)
	var targetCheckpointName = "Red 0"
	if success and savedSpawnName:
		targetCheckpointName = savedSpawnName
	var targetPart = RobloxCompat.find_first_child(checkpointsFolder, targetCheckpointName)
	if not targetPart:
		targetPart = RobloxCompat.find_first_child(checkpointsFolder, "Red 0")
	if targetPart:
		var targetCFrame = (RobloxCompat.get_pivot(targetPart) if RobloxCompat.is_a(targetPart, "Model") else RobloxCompat.get_cframe(targetPart))
		RobloxCompat.set_anchored(rootPart, true)
		RobloxCompat.pivot_to(character, RobloxCompat.cframe_add_vec3(targetCFrame, RobloxCompat.vec3(0, 4, 0)))
		RobloxCompat.set_linear_velocity(rootPart, Vector3.ZERO)
		RobloxCompat.set_angular_velocity(rootPart, Vector3.ZERO)
		humanoid.change_state("GettingUp")
		await RobloxCompat.task_wait(0.1)
		RobloxCompat.set_anchored(rootPart, false)
		RobloxCompat.set_attribute(player, "LevelRed", true)
	else:
		push_warning(str("Could not find checkpoint target part: ") + str(str(targetCheckpointName)))

func setupTeleportPart(part):
	if RobloxCompat.is_a(part, "BasePart"):
		RobloxCompat.connect_touched(part, func(otherPart):
			var character = RobloxCompat.find_first_ancestor_of_class(otherPart, "Model")
			if not character: return
			var player = RobloxCompat.get_player_from_character(character)
			if player and not debounce.get(player, null):
				debounce[player] = true
				teleportPlayerToSavedCheckpoint(player)
				await RobloxCompat.task_wait(1)
				debounce.erase(player)
		)

func run_script(script_parent: Node) -> void:
	_rbx_script_parent = script_parent
	DataStoreService = RobloxCompat.get_service("DataStoreService")
	DataStore = RobloxCompat.get_datastore_stub("ProgressPoints")
	Workspace = RobloxCompat.get_service("Workspace")
	Players = RobloxCompat.get_service("Players")
	teleportsFolder = RobloxCompat.wait_for_child(Workspace, "Teleports")
	lobbyFolder = RobloxCompat.wait_for_child(teleportsFolder, "Lobby")
	checkpointsFolder = RobloxCompat.wait_for_child(Workspace, "Checkpoints")
	debounce = {}
	for part in RobloxCompat.get_descendants(lobbyFolder):
		setupTeleportPart(part)
	RobloxCompat.connect_descendant_added(lobbyFolder, setupTeleportPart)
