extends SceneTree

const ShipBodyScript = preload("res://scripts/ship_body.gd")
const GrappleTetherScript = preload("res://scripts/grapple_tether.gd")
const BalanceData = preload("res://scripts/balance.gd")

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
	var owner := ShipBodyScript.new()
	var target := ShipBodyScript.new()
	owner.global_position = Vector2.ZERO
	target.global_position = Vector2(300.0, 0.0)
	get_root().add_child(owner)
	get_root().add_child(target)
	owner.initialize_player()
	target.initialize_player()
	var tether = GrappleTetherScript.new()
	get_root().add_child(tether)
	tether.launch(owner, target)
	for ignored in 18:
		await physics_frame
	expect(tether.connected and not tether.hook_flying, "갈고리 비행 뒤 물리 체인 연결")
	expect(tether.links.size() > 0, "거리 기반 체인 링크 생성")
	expect(tether.links.all(func(link): return link.collision_layer == 0 and link.collision_mask == 0), "체인 링크 충돌 비활성")
	expect(owner.collision_layer != 0 and owner.collision_mask != 0 and target.collision_layer != 0 and target.collision_mask != 0, "함선 간 충돌 레이어 유지")
	expect(owner.is_within_surface_range(target, float(BalanceData.GRAPPLE.max_range)), "바운드 스피어 기반 갈고리 사거리")
	var rest_length: float = tether.chain_rest_length
	var max_separation := rest_length
	for ignored in 60:
		# 플레이어의 2기 주 추진기(9,500N)를 넘는 견인 부하를 매 물리 틱 적용한다.
		owner.apply_central_force(Vector2(12000.0, 0.0))
		await physics_frame
		max_separation = maxf(max_separation, owner.global_position.distance_to(target.global_position))
	expect(tether.peak_tension > 0.0 and max_separation <= rest_length + 90.0, "고출력 견인 시 축방향 장력으로 단단한 연결 유지 (최대 이격 %.1f)" % max_separation)
	var hp_before: float = tether.hp
	tether.apply_damage(7.0)
	expect(is_equal_approx(tether.hp, hp_before - 7.0), "갈고리 투사체 피해 누적")
	tether.apply_damage(float(BalanceData.GRAPPLE.hp))
	expect(tether.is_queued_for_deletion(), "갈고리 HP 0에서 체인 해제")
	owner.queue_free()
	target.queue_free()
	if failures.is_empty():
		print("[PASS] grapple-smoke")
		quit(0)
	else:
		print("[FAIL] grapple-smoke: ", ", ".join(failures))
		quit(1)
