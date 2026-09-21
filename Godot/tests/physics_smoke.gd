extends SceneTree

const ShipBodyScript = preload("res://scripts/ship_body.gd")
const BalanceData = preload("res://scripts/balance.gd")
const PhysicsData = preload("res://scripts/physics_tuning.gd")

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
	expect(ship.exhaust_particles.size() == 6, "추진기별 불꽃·연기 파티클 생성")
	var first_exhaust: Dictionary = ship.exhaust_particles.values()[0]
	expect(first_exhaust.fire.emitting and first_exhaust.smoke.emitting, "추력 입력 시 불꽃·연기 방출")
	expect(first_exhaust.fire.z_index >= 0 and first_exhaust.smoke.z_index >= 0, "불꽃·연기 배경 위 렌더 순서")
	var forward_part: PartData = ship.parts_with_actuator("forward")[0]
	var forward_exhaust: Dictionary = ship.exhaust_particles[forward_part.uid]
	expect(forward_exhaust.fire.direction.is_equal_approx(Vector2.LEFT), "전진 힘의 역방향으로 주추진기 불꽃 배출")
	ship.apply_player_thrusters(0.0, 0.0, 1.0)
	var rcs_part: PartData = ship.parts_with_actuator("turn")[0]
	var rcs_center := ship.module_local_center(rcs_part)
	var rcs_force_direction := Vector2(-rcs_center.y, rcs_center.x).normalized()
	var rcs_exhaust: Dictionary = ship.exhaust_particles[rcs_part.uid]
	expect(rcs_exhaust.fire.direction.is_equal_approx(-rcs_force_direction), "웹 기준 RCS 회전 힘의 역방향으로 모듈별 불꽃 배출")
	ship.apply_player_thrusters(0.0, 0.0, 0.0)
	expect(not first_exhaust.fire.emitting and not first_exhaust.smoke.emitting, "추력 해제 시 파티클 방출 중지")
	await physics_frame
	var speed_after_damping := ship.linear_velocity.length()
	expect(speed_after_damping < speed_after_thrust, "웹 기준 지수 감쇠가 물리 스텝에 적용")
	ship.queue_free()
	var turn_ship := ShipBodyScript.new()
	get_root().add_child(turn_ship)
	turn_ship.initialize_player()
	await physics_frame
	# 웹 버전과 같이 D(우회전)의 내부 RCS 값은 +1이다.
	turn_ship.apply_player_thrusters(0.0, 0.0, 1.0)
	await physics_frame
	expect(turn_ship.angular_velocity > 0.0, "우회전 RCS가 화면 기준 시계 방향")
	turn_ship.angular_velocity = 0.5
	var angular_before_brake := turn_ship.angular_velocity
	turn_ship.apply_player_thrusters(1.0, 0.0, 0.0)
	await physics_frame
	expect(absf(turn_ship.angular_velocity) < absf(angular_before_brake), "회전 입력 해제 시 전진 중 RCS 역토크 제동")
	turn_ship.queue_free()
	var rotated_ship := ShipBodyScript.new()
	get_root().add_child(rotated_ship)
	rotated_ship.initialize_player()
	var rotated_drive := rotated_ship.model.add("thruster", Vector2i(-1, 3), 1)
	rotated_ship.rebuild_exhaust_particles()
	rotated_ship.apply_player_thrusters(1.0, 0.0, 0.0)
	var rotated_exhaust: Dictionary = rotated_ship.exhaust_particles[rotated_drive.uid]
	expect(rotated_ship.module_thrust_axis(rotated_drive).is_equal_approx(Vector2.DOWN), "웹 기준 회전 파트 추진축 적용")
	expect(rotated_exhaust.fire.direction.is_equal_approx(Vector2.UP), "회전 주추진기 힘의 역방향 배출")
	rotated_ship.queue_free()
	var com_ship := ShipBodyScript.new()
	get_root().add_child(com_ship)
	com_ship.initialize_player()
	com_ship.model.add("armor", Vector2i(0, 5))
	com_ship.refresh_mass()
	var com := com_ship.model.center_of_mass()
	var thrust_part: PartData = com_ship.parts_with_actuator("forward")[0]
	var expected_offset: Vector2 = Vector2(thrust_part.cell) * BalanceData.CELL - com
	expect(com_ship.center_of_mass.is_equal_approx(com), "결합 질량 기반 RigidBody CoM 갱신")
	expect(com_ship.module_force_offset(thrust_part).is_equal_approx(expected_offset), "추력 작용점이 파트 위치와 CoM 차이로 계산")
	com_ship.refresh_part_tuning()
	expect(is_equal_approx(com_ship.mass, com_ship.model.total_mass()), "튜닝 갱신 뒤 조립체 질량 재계산")
	com_ship.linear_velocity = Vector2(90.0, 0.0)
	com_ship.apply_player_thrusters(0.0, 0.0, 0.0)
	await physics_frame
	expect(com_ship.linear_velocity.x < 90.0, "중립 입력에서 역추진 자동 제동")
	com_ship.queue_free()
	var capped_ship := ShipBodyScript.new()
	get_root().add_child(capped_ship)
	capped_ship.initialize_player()
	for ignored in 180:
		capped_ship.apply_player_thrusters(1.0, 0.0, 0.0)
		await physics_frame
	expect(capped_ship.linear_velocity.length() <= capped_ship.max_linear_speed() + 0.1, "질량·총 추력 비례 선형 속도 상한")
	capped_ship.queue_free()
	if failures.is_empty():
		print("[PASS] physics-smoke")
		quit(0)
	else:
		print("[FAIL] physics-smoke: ", ", ".join(failures))
		quit(1)
