extends SceneTree

const MainScript = preload("res://scripts/main.gd")

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
	var game = MainScript.new()
	get_root().add_child(game)
	await process_frame
	await physics_frame
	game.spawn_enemy(1)
	var enemy: EnemyShip = game.enemies.back()
	game.select_target(enemy)
	expect(game.selected_enemy() == enemy, "적 함선 클릭 표적 지정")
	expect(game.weapon_aim_point().is_equal_approx(enemy.global_position), "선택 표적 자동 조준 좌표")
	game.set_navigation_destination(game.player.global_position + Vector2(500.0, 0.0))
	game.apply_auto_navigation()
	await physics_frame
	expect(game.navigation_active, "빈 공간 지정 자동 항법 활성화")
	expect(game.player.linear_velocity.length_squared() > 0.0, "자동 항법이 실제 추력을 발생")
	game.queue_free()
	if failures.is_empty():
		print("[PASS] target-navigation-smoke")
		quit(0)
	else:
		print("[FAIL] target-navigation-smoke: ", ", ".join(failures))
		quit(1)
