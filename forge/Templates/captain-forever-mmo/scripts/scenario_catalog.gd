class_name ScenarioCatalog
extends RefCounted

const BalanceData = preload("res://scripts/balance.gd")

## M1 검증용 수제 항로. 아직 Main의 자유 항로를 교체하지 않는다.
## 임무 시간/수량은 Balance, 표기/연결은 이 콘텐츠 카탈로그가 소유한다.
static func default_definition() -> Dictionary:
	return {
		"schema_version": 1, "id": "salvage_route_v1", "seed": 230926,
		"start_id": "kepler", "goal_id": "void_gate",
		"systems": [
			_system("kepler", "케플러 출항 정거장", 0, "escape", ["debris", "raiders"], true),
			_system("debris", "유실된 항해 기록", 1, "acquire", ["rift"]),
			_system("raiders", "약탈자 전초 기지", 1, "eliminate", ["rift"]),
			_system("rift", "리프트 브레이커", 2, "boss", ["lyra"], false, "mid"),
			_system("lyra", "리라 정비 정거장", 3, "escape", ["convoy", "blockade"], true),
			_system("convoy", "피난선 호위", 4, "protect", ["sentinel"]),
			_system("blockade", "봉쇄 돌파", 4, "escape", ["sentinel"]),
			_system("sentinel", "센티널 관문", 5, "boss", ["perseus"], false, "mid"),
			_system("perseus", "페르세우스 보급 정거장", 6, "escape", ["siege", "archive"], true),
			_system("siege", "최후의 방어선", 7, "eliminate", ["void_gate"]),
			_system("archive", "심연의 기록고", 7, "acquire", ["void_gate"]),
			_system("void_gate", "보이드 워든", 8, "boss", [], false, "final"),
		],
		"missions": [
			{"id":"eliminate", "type":"eliminate", "waves":[["guard_1", "guard_2"], ["reinforcement_1"]]},
			{"id":"boss", "type":"eliminate", "waves":[["boss_core"]]},
			{"id":"escape", "type":"escape", "zone_id":"exit", "charge_seconds":BalanceData.SCENARIO.escape_charge_seconds},
			{"id":"protect", "type":"protect", "target_id":"civilian", "duration_seconds":BalanceData.SCENARIO.protect_duration_seconds},
			{"id":"acquire", "type":"acquire", "item_id":"navigation_record", "amount":BalanceData.SCENARIO.required_item_count},
		]
	}

static func _system(id: String, display_name: String, depth: int, mission_id: String, next: Array, station: bool = false, boss: String = "") -> Dictionary:
	return {"id":id, "display_name":display_name, "depth":depth, "mission_id":mission_id, "next":next, "station":station, "boss":boss}
