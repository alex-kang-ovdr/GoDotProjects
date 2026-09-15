extends SceneTree

const ShipModelScript = preload("res://scripts/ship_model.gd")

var failures: Array[String] = []

func expect(condition: bool, label: String) -> void:
	if condition:
		print("[PASS] ", label)
	else:
		failures.append(label)
		push_error("[FAIL] " + label)

func _init() -> void:
	var ship = ShipModelScript.new()
	ship.initialize_player()
	expect(ship.total_mass() > 0.0, "기본 함선 질량")
	expect(ship.shield_capacity() == 1, "기본 방어막 1 레이어")
	expect(ship.ammo_total("missile") == 6, "미사일 탄약 분리")
	expect(ship.ammo_total("bullet") == 36, "총알 탄약 분리")
	expect(ship.consume_ammo("missile", 2), "미사일 탄약 소비")
	expect(ship.ammo_total("missile") == 4, "미사일 재고 갱신")
	var beam := ship.make_part("beam3", Vector2i(6, 0))
	expect(not ship.can_place(beam, Vector2i(6, 0)), "떨어진 파트 장착 거부")
	expect(ship.can_place(beam, Vector2i(2, 0)), "인접 다칸 파트 장착 허용")
	var bridge := ship.add("block", Vector2i(4, 0))
	var loose := ship.add("block", Vector2i(5, 0))
	var detached := ship.detach_disconnected()
	expect(detached.any(func(part): return part.uid == bridge.uid), "코어 비연결 파트 분리")
	expect(detached.any(func(part): return part.uid == loose.uid), "연쇄 비연결 파트 분리")
	var a := ship.make_part("ammo_bay", Vector2i.ZERO)
	var b := ship.make_part("ammo_bay", Vector2i.ZERO)
	var merged := ship.merge_bays(a, b)
	expect(merged != null and merged.ammo == 12 and merged.capacity == 12, "같은 탄약고 병합")
	expect(ship.merge_bays(a, ship.make_part("bullet_bay", Vector2i.ZERO)) == null, "다른 탄약고 병합 거부")
	if failures.is_empty():
		print("[PASS] godot-runtime")
		quit(0)
	else:
		print("[FAIL] godot-runtime: ", ", ".join(failures))
		quit(1)
