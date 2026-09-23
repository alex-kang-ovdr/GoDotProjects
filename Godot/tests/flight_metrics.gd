extends SceneTree

const MainScript = preload("res://scripts/main.gd")
var failures := 0

func _init() -> void:
	call_deferred("measure")

func check(value: bool, label: String) -> void:
	print("[PASS] " if value else "[FAIL] ", label)
	if not value: failures += 1

func measure() -> void:
	var game = MainScript.new()
	root.add_child(game)
	game.set_physics_process(false)
	game.dialogue.current.clear()
	game.dialogue.dialogue_queue.clear()
	game.sync_pause_state()
	game.player.position = Vector2(-5000, -5000)
	game.player.rotation = 0.0
	game.player.model.add("armor", Vector2i(0, 3))
	game.player.refresh_mass()
	await physics_frame
	for frame in 120:
		game.player.apply_player_thrusters(1.0, 0.0, 0.0)
		await physics_frame
	var cruise_speed: float = game.player.linear_velocity.length()
	var yaw: float = game.player.rotation
	print("[METRIC] 2s thrust: speed_px_s=", cruise_speed, " yaw_rad=", yaw)
	check(cruise_speed > 50.0 and absf(yaw) < 0.05, "비대칭 질량 2초 직진 추력 회전 편차 0.05rad 미만")
	for frame in 120:
		game.player.apply_player_thrusters(0.0, 0.0, 0.0)
		await physics_frame
	print("[METRIC] 2s brake: speed_px_s=", game.player.linear_velocity.length())
	check(game.player.linear_velocity.length() < 5.0, "입력 해제 2초 후 속력 5px/s 미만")
	game.set_navigation_destination(game.player.global_position + Vector2(0, 500))
	for frame in 480:
		game.apply_auto_navigation() if game.navigation_active else game.player.apply_player_thrusters(0.0, 0.0, 0.0)
		await physics_frame
	var distance: float = game.player.global_position.distance_to(game.navigation_target)
	print("[METRIC] 8s auto navigation: remaining_px=", distance, " speed_px_s=", game.player.linear_velocity.length())
	check(not game.navigation_active and distance < 70.0, "90도 자동 항법 500px 목적지 도착 및 제동")
	game.queue_free()
	await process_frame
	print("[PASS] flight-metrics" if failures == 0 else "[FAIL] flight-metrics")
	quit(0 if failures == 0 else 1)
