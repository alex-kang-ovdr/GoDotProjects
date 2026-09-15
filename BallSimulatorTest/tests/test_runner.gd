extends SceneTree

const BallKinematicsClass := preload("res://scripts/ball_kinematics.gd")
const EPSILON := 0.000001

func _init() -> void:
	var suite_name := _suite_name(OS.get_cmdline_user_args())
	var passed := false
	var message := ""
	match suite_name:
		"smoke":
			passed = ProjectSettings.get_setting("application/config/name") == "Ball Simulator M1 Test"
			message = "project configuration"
		"ballistic":
			passed = _test_ballistic_contract()
			message = "fixed-step gravity contract"
		"isolation":
			passed = _test_no_collision_node_dependency()
			message = "test project keeps CollisionWorld observer-only"
		_:
			message = "unknown suite: %s" % suite_name
	print("BALL_SIM_TEST_RESULT %s suite=%s message=%s" % ["PASS" if passed else "FAIL", suite_name, message])
	quit(0 if passed else 1)

func _suite_name(arguments: PackedStringArray) -> String:
	var index := arguments.find("--suite")
	return arguments[index + 1] if index >= 0 and index + 1 < arguments.size() else "smoke"

func _test_ballistic_contract() -> bool:
	var snapshots := BallKinematicsClass.simulate(Vector3.ZERO, Vector3.ZERO, 1.0, 0.1)
	if snapshots.size() != 11:
		return false
	var final_snapshot: Dictionary = snapshots.back()
	var position: Vector3 = final_snapshot["position_m"]
	var velocity: Vector3 = final_snapshot["linear_velocity_mps"]
	return is_equal_approx(float(final_snapshot["time_s"]), 1.0) and absf(position.y + 4.905) < EPSILON and absf(velocity.y + 9.81) < EPSILON

func _test_no_collision_node_dependency() -> bool:
	var script := FileAccess.open("res://scripts/ball_simulator_test.gd", FileAccess.READ)
	if script == null:
		return false
	var source := script.get_as_text()
	for forbidden_name in ["RigidBody3D", "CharacterBody3D", "Area3D", "PhysicsServer3D", "StaticBody3D", "CollisionShape3D"]:
		if source.contains(forbidden_name):
			return false
	return true
