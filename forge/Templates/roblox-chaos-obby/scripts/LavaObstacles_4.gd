extends Node
# Auto-ported by PlayForge RobloxConverter PoC Pipeline from: ServerScriptService/LavaObstacles
# Strategy: runtime_adapter | Grades: D=0 A=1 R=4 X=0 V=0

var _rbx_script_parent: Node = null
var lavas

func run_script(script_parent: Node) -> void:
	_rbx_script_parent = script_parent
	lavas = RobloxCompat.get_rbx_children(RobloxCompat.wait_for_child(RobloxCompat.get_workspace(), 'Lava'))
	for lava in lavas:
		RobloxCompat.connect_touched(lava, func(object):
			var Obbyplayer = RobloxCompat.get_player_from_character(object.get_parent())
			if Obbyplayer:
				RobloxCompat.find_first_child_of_class(object.get_parent(), "Humanoid").set_health(0)
		)
