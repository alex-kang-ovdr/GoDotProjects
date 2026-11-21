extends Node
# Auto-ported by PlayForge RobloxConverter PoC Pipeline from: Workspace/Disappearing/Disapearing
# Strategy: runtime_adapter | Grades: D=0 A=2 R=5 X=0 V=0

var _rbx_script_parent: Node = null
var folder

func setupPlatform(platform):
	if not RobloxCompat.is_a(platform, "BasePart"): return
	RobloxCompat.set_anchored(platform, true)
	var isTouched := [false]
	var fade := func(hit):
		var character = hit.get_parent()
		var humanoid = RobloxCompat.find_first_child(character, "Humanoid")
		if humanoid and not isTouched[0]:
			isTouched[0] = true
			for count in range(1, (10) + 1, 1):
				RobloxCompat.set_transparency(platform, count / 10)
				await RobloxCompat.task_wait(0.05)
			RobloxCompat.set_can_collide(platform, false)
			RobloxCompat.set_transparency(platform, 1)
			await RobloxCompat.task_wait(3)
			RobloxCompat.set_can_collide(platform, true)
			RobloxCompat.set_transparency(platform, 0)
			isTouched[0] = false
	RobloxCompat.connect_touched(platform, fade)

func run_script(script_parent: Node) -> void:
	_rbx_script_parent = script_parent
	folder = _rbx_script_parent
	for child in RobloxCompat.get_rbx_children(folder):
		RobloxCompat.task_spawn(func():
			setupPlatform(child)
		)
	RobloxCompat.connect_child_added(folder, func(child):
		RobloxCompat.task_spawn(func():
			await RobloxCompat.task_wait(0.1)
			setupPlatform(child)
		)
	)
