extends Node
# Auto-ported by PlayForge RobloxConverter PoC Pipeline from: ServerScriptService/Motion
# Strategy: runtime_adapter | Grades: D=1 A=6 R=4 X=0 V=0

var _rbx_script_parent: Node = null
var RunService
var Rotations
var Right
var Left
var CylRight
var CylLeft
var Right60
var Left60
var Right480
var Left480
var CylRight30
var CylLeft30
var RotationSpeed

func run_script(script_parent: Node) -> void:
	_rbx_script_parent = script_parent
	RunService = RobloxCompat.get_service("RunService")
	Rotations = RobloxCompat.wait_for_child(RobloxCompat.get_workspace(), 'Rotation')
	Right = RobloxCompat.wait_for_child(Rotations, 'Right')
	Left = RobloxCompat.wait_for_child(Rotations, 'Left')
	CylRight = RobloxCompat.wait_for_child(Rotations, 'CylRight')
	CylLeft = RobloxCompat.wait_for_child(Rotations, 'CylLeft')
	Right60 = RobloxCompat.wait_for_child(Right, 'Right60')
	Left60 = RobloxCompat.wait_for_child(Left, 'Left60')
	Right480 = RobloxCompat.wait_for_child(Right, 'Right480')
	Left480 = RobloxCompat.wait_for_child(Left, 'Left480')
	CylRight30 = RobloxCompat.wait_for_child(CylRight, 'CylRight30')
	CylLeft30 = RobloxCompat.wait_for_child(CylLeft, 'CylLeft30')
	RotationSpeed = deg_to_rad(60)
	RobloxCompat.connect_heartbeat(func(dt):
		var AngleChange = RotationSpeed * dt
		for part in RobloxCompat.get_rbx_children(Right60):
			if RobloxCompat.is_a(part, "BasePart"):
				RobloxCompat.set_angular_velocity(part, RobloxCompat.roblox_angular_vel_to_godot(0, RotationSpeed, 0))
				RobloxCompat.set_cframe(part, RobloxCompat.get_cframe(part) * RobloxCompat.cframe_angles(0, AngleChange, 0))
		for part in RobloxCompat.get_rbx_children(Left60):
			if RobloxCompat.is_a(part, "BasePart"):
				RobloxCompat.set_angular_velocity(part, RobloxCompat.roblox_angular_vel_to_godot(0, -RotationSpeed, 0))
				RobloxCompat.set_cframe(part, RobloxCompat.get_cframe(part) * RobloxCompat.cframe_angles(0, -AngleChange, 0))
		for part in RobloxCompat.get_rbx_children(Right480):
			if RobloxCompat.is_a(part, "BasePart"):
				RobloxCompat.set_angular_velocity(part, RobloxCompat.roblox_angular_vel_to_godot(0, RotationSpeed*8, 0))
				RobloxCompat.set_cframe(part, RobloxCompat.get_cframe(part) * RobloxCompat.cframe_angles(0, AngleChange*8, 0))
		for part in RobloxCompat.get_rbx_children(Left480):
			if RobloxCompat.is_a(part, "BasePart"):
				RobloxCompat.set_angular_velocity(part, RobloxCompat.roblox_angular_vel_to_godot(0, -RotationSpeed*8, 0))
				RobloxCompat.set_cframe(part, RobloxCompat.get_cframe(part) * RobloxCompat.cframe_angles(0, -AngleChange*8, 0))
		for part in RobloxCompat.get_rbx_children(CylRight30):
			if RobloxCompat.is_a(part, "BasePart"):
				RobloxCompat.set_angular_velocity(part, RobloxCompat.vector_to_world_space(RobloxCompat.get_cframe(part), RobloxCompat.roblox_angular_vel_to_godot(RotationSpeed/2, 0, 0)))
				RobloxCompat.set_cframe(part, RobloxCompat.get_cframe(part) * RobloxCompat.cframe_angles(AngleChange/2, 0, 0))
		for part in RobloxCompat.get_rbx_children(CylLeft30):
			if RobloxCompat.is_a(part, "BasePart"):
				RobloxCompat.set_angular_velocity(part, RobloxCompat.vector_to_world_space(RobloxCompat.get_cframe(part), RobloxCompat.roblox_angular_vel_to_godot(-RotationSpeed/2, 0, 0)))
				RobloxCompat.set_cframe(part, RobloxCompat.get_cframe(part) * RobloxCompat.cframe_angles(-AngleChange/2, 0, 0))
	)
