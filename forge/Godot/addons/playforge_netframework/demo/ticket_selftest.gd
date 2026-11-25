extends SceneTree
## JoinTicket 검증기 단위 자가 시험 (Godot 헤드리스).
## godot --headless --path <proj> --script res://addons/playforge_netframework/demo/ticket_selftest.gd
## 성공 시 TICKET_SELFTEST_OK 출력 후 종료 코드 0.

const NetJoinTicketScript := preload("res://addons/playforge_netframework/runtime/join_ticket.gd")
const NetIdsScript := preload("res://addons/playforge_netframework/runtime/net_ids.gd")

var _failures: Array[String] = []


func _initialize() -> void:
	var now := 1_800_000_000.0
	var auth := NetJoinTicketScript.new("sess-1", "inst-1", 7, 60)
	var t_a := auth.issue("user-a", 0, now)
	var t_b := auth.issue("user-b", 1, now)

	var r := auth.verify_and_consume(t_a, now + 1.0)
	_check(r.ok and int(r.claims.slot) == 0 and String(r.claims.userId) == "user-a", "valid ticket accepted")
	_check(String(r.claims.get("expiresAt", "")).ends_with("Z"), "expiresAt is ISO-8601 UTC")
	_expect_reason(auth.verify_and_consume(t_a, now + 2.0), "ticket_reused")
	_expect_reason(auth.verify_and_consume(NetJoinTicketScript.debug_tamper_slot(t_b, 0), now + 2.0), "hmac_invalid")
	_expect_reason(auth.verify_and_consume(t_b, now + 61.0), "expired")
	_expect_reason(auth.verify_and_consume("not-a-ticket", now), "malformed")
	_expect_reason(auth.verify_and_consume(t_b + "x", now), "hmac_invalid")

	var other_session := NetJoinTicketScript.new("sess-2", "inst-1", 7, 60)
	_expect_reason(other_session.verify_and_consume(other_session.issue("user-a", 0, now), now + 100.0), "expired")
	# 다른 서버 비밀로 서명된 티켓은 서명 불일치로 거부된다.
	_expect_reason(auth.verify_and_consume(other_session.issue("user-c", 2, now), now), "hmac_invalid")
	# 실패한 시도는 nonce를 소비하지 않는다.
	_check(auth.verify_and_consume(t_b, now + 3.0).ok, "unconsumed ticket still valid after failed attempts")
	_check(auth.accepted_count == 2, "accepted_count == 2")

	var alloc := NetIdsScript.ObjectIdAllocator.new()
	var id0 := alloc.allocate()
	alloc.release(id0)
	var id0b := alloc.allocate()
	_check(int(id0b.index) == int(id0.index) and int(id0b.generation) == int(id0.generation) + 1, "NetObjectId generation bump on reuse")
	_check(not alloc.is_alive(id0) and alloc.is_alive(id0b), "stale NetObjectId rejected")

	if _failures.is_empty():
		print("TICKET_SELFTEST_OK")
		quit(0)
	else:
		for f in _failures:
			printerr("TICKET_SELFTEST_FAIL: " + f)
		quit(1)


func _expect_reason(r: Dictionary, reason: String) -> void:
	_check(not r.ok and String(r.reason) == reason, "expected %s, got %s" % [reason, r.reason])


func _check(cond: bool, label: String) -> void:
	if not cond:
		_failures.append(label)
