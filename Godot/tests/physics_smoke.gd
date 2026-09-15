extends SceneTree

const ShipBodyScript = preload("res://scripts/ship_body.gd")

var failures: Array[String] = []

func expect(condition: bool, label: String) -> void:
	if condition:
		print("[PASS] ", label)
	else:
		failures.append(label)
		push_error("[FAIL] " + label)

func _init() -> void:
	call_deferred("run_smoke")

func run_smoke() -> void:
	var ship := ShipBodyScript.new()
	get_root().add_child(ship)
	ship.initialize_player()
	await physics_frame
	ship.apply_player_thrusters(1.0, 0.0, 0.0)
	await physics_frame
	var speed_after_thrust := ship.linear_velocity.length()
	expect(speed_after_thrust > 0.01, "실제 추력으로 선형 속도 생성")
	await physics_frame
	var speed_after_damping := ship.linear_velocity.length()
	expect(speed_after_damping < speed_after_thrust, "웹 기준 지수 감쇠가 물리 스텝에 적용")
	ship.queue_free()
	if failures.is_empty():
		print("[PASS] physics-smoke")
		quit(0)
	else:
		print("[FAIL] physics-smoke: ", ", ".join(failures))
		quit(1)
