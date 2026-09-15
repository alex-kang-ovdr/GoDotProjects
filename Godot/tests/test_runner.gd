extends SceneTree

const ShipModelScript = preload("res://scripts/ship_model.gd")
const ShipBodyScript = preload("res://scripts/ship_body.gd")

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
	expect(ship.parts.size() == 15, "웹 초기 함선 15파트")
	expect(ship.core_part().hp == 200.0, "웹 초기 코어 200 HP")
	expect(ship.total_mass() > 0.0, "기본 함선 질량")
	expect(ship.shield_capacity() == 1, "기본 방어막 1 레이어")
	expect(ship.ammo_total("missile") == 6, "미사일 탄약 분리")
	expect(ship.ammo_total("bullet") == 0, "기본 함선은 총알 탄약고 미장착")
	expect(ship.consume_ammo("missile", 2), "미사일 탄약 소비")
	expect(ship.ammo_total("missile") == 4, "미사일 재고 갱신")
	var assembly = ShipModelScript.new()
	assembly.add("core", Vector2i.ZERO)
	assembly.add("armor", Vector2i(1, 0))
	var beam = assembly.make_part("beam3", Vector2i(5, 0))
	expect(not assembly.can_place(beam, Vector2i(5, 0)), "떨어진 파트 장착 거부")
	expect(assembly.can_place(beam, Vector2i(2, 0)), "인접 다칸 파트 장착 허용")
	var bridge = assembly.add("block", Vector2i(2, 0))
	var loose = assembly.add("block", Vector2i(3, 0))
	assembly.remove(bridge.uid)
	var detached := assembly.detach_disconnected()
	expect(detached.any(func(part): return part.uid == loose.uid), "코어 비연결 파트 분리")
	expect(detached.size() == 1, "연결부 제거 뒤 단절 덩어리만 분리")
	var a := ship.make_part("ammo_bay", Vector2i.ZERO)
	var b := ship.make_part("ammo_bay", Vector2i.ZERO)
	var merged := ship.merge_bays(a, b)
	expect(merged != null and merged.ammo == 12 and merged.capacity == 12, "같은 탄약고 병합")
	expect(ship.merge_bays(a, ship.make_part("bullet_bay", Vector2i.ZERO)) == null, "다른 탄약고 병합 거부")
	var armed_ship = ShipBodyScript.new()
	armed_ship.model.initialize_player()
	var laser_shots := armed_ship.fire_primary_weapons(Vector2(600, 0))
	expect(laser_shots.size() == 2, "웹 기본 2개 레이저 동시 발사")
	expect(is_equal_approx(armed_ship.heat, 17.0), "레이저 발열 11 + 레이저당 3")
	var missile_before: int = armed_ship.model.ammo_total("missile")
	var minis := armed_ship.fire_auto_mini_missiles(Vector2(600, 0))
	expect(minis.size() == 2 and armed_ship.model.ammo_total("missile") == missile_before - 2, "좌우 미니 미사일이 분리 탄약을 소비")
	var wedge := ship.make_part("wedge_long", Vector2i.ZERO, 1)
	expect(wedge.cells().has(Vector2i(0, 1)), "긴 웨지 회전 점유 격자")
	armed_ship.free()
	if failures.is_empty():
		print("[PASS] godot-runtime")
		quit(0)
	else:
		print("[FAIL] godot-runtime: ", ", ".join(failures))
		quit(1)
