extends Node
# Auto-ported by PlayForge RobloxConverter PoC Pipeline from: StarterGui/ChaosHUD/TimerLabel/Timer
# Strategy: runtime_adapter | Grades: D=2 A=1 R=2 X=0 V=0

var _rbx_script_parent: Node = null
var ReplicatedStorage
var Players
var player
var textLabel

func updateDisplay():
	var isLevelRed = RobloxCompat.get_attribute(player, "LevelRed") == true
	textLabel.visible = isLevelRed
	if not isLevelRed: return
	var chaosText = (RobloxCompat.get_attribute(ReplicatedStorage, "ChaosText") if RobloxCompat.get_attribute(ReplicatedStorage, "ChaosText") != null else "Next Chaos In:")
	var timeLeft = (RobloxCompat.get_attribute(ReplicatedStorage, "TimeLeft") if RobloxCompat.get_attribute(ReplicatedStorage, "TimeLeft") != null else 0)
	var minutes = floori(timeLeft / 60)
	var seconds = int(timeLeft) % 60
	textLabel.text = RobloxCompat.string_format("%s %02d:%02d", [chaosText, minutes, seconds])

func run_script(script_parent: Node) -> void:
	_rbx_script_parent = script_parent
	ReplicatedStorage = RobloxCompat.get_service("ReplicatedStorage")
	Players = RobloxCompat.get_service("Players")
	player = RobloxCompat.get_local_player()
	textLabel = _rbx_script_parent
	RobloxCompat.connect_attribute_changed(ReplicatedStorage, "TimeLeft", updateDisplay)
	RobloxCompat.connect_attribute_changed(ReplicatedStorage, "ChaosText", updateDisplay)
	RobloxCompat.connect_attribute_changed(player, "LevelRed", updateDisplay)
	updateDisplay()
