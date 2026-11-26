extends SceneTree
## Iris 방식 상태 복제(로드맵 26) 단위·회귀·Fuzz·N0/N1 벤치마크 자가 시험.
## godot --headless --path forge/Godot --script res://addons/playforge_netframework/demo/iris_replication_selftest.gd

const FgNetSchemaScript := preload("res://addons/playforge_netframework/replication/fg_net_schema.gd")
const FgStateStoreScript := preload("res://addons/playforge_netframework/replication/fg_state_store.gd")
const FgInterestFilterScript := preload("res://addons/playforge_netframework/replication/fg_interest_filter.gd")
const FgReplicationServerScript := preload("res://addons/playforge_netframework/replication/fg_replication_server.gd")
const FgReplicationClientScript := preload("res://addons/playforge_netframework/replication/fg_replication_client.gd")

var _failures: Array[String] = []
var _metrics: Dictionary = {}


func _initialize() -> void:
	_test_schema_and_quantization()
	_test_owner_privacy_and_delta_ack()
	_test_out_of_order_baseline_miss_and_late_join()
	_test_tombstone_and_100k_lifecycle()
	_test_spatial_aoi_and_dormancy()
	_test_malformed_fuzz()
	_bench_n0_n1()

	var result := {
		"ok": _failures.is_empty(),
		"failures": _failures,
		"metrics": _metrics,
	}
	print("IRIS_SELFTEST_JSON " + JSON.stringify(result))
	if _failures.is_empty():
		print("IRIS_SELFTEST_OK")
		quit(0)
	else:
		for f in _failures:
			printerr("IRIS_SELFTEST_FAIL: " + f)
		quit(1)


func _check(cond: bool, label: String) -> void:
	if not cond:
		_failures.append(label)


func _test_schema_and_quantization() -> void:
	var s: FgNetSchemaScript = FgNetSchemaScript.create_default_character_schema()
	var bad_group := s.add_atomic_group([1, 4]) # relevant + owner 혼합 금지
	_check(not bad_group.ok and String(bad_group.reason) == "mixed_scope_in_atomic_group", "mixed scope atomic group blocked")

	var h1 := s.compute_protocol_hash()
	var s2: FgNetSchemaScript = FgNetSchemaScript.create_default_character_schema()
	_check(h1.length() == 64 and h1 == s2.compute_protocol_hash(), "protocol hash deterministic")

	var s_diff := FgNetSchemaScript.new("character", 2)
	s_diff.add_field(1, "position", FgNetSchemaScript.FIELD_VEC2_CELL, FgNetSchemaScript.SCOPE_RELEVANT)
	_check(h1 != s_diff.compute_protocol_hash(), "different schema yields different protocol hash")

	# 로컬 및 대형 월드 좌표 cell-relative 양자화 정밀도 검증(오차 <= 0.001)
	var pos_def: Dictionary = s.fields_by_name["position"]
	for sample_pos in [Vector2(276.42, 320.17), Vector2(-123456.78, 987654.32), Vector2(0.0, 0.0)]:
		var q := s.quantize_value(pos_def, sample_pos)
		_check(q.ok, "quantize vec2 ok")
		var dq: Vector2 = FgNetSchemaScript.dequantize_value(pos_def, q.value)
		_check(sample_pos.distance_to(dq) <= 0.002, "cell-relative quantization accuracy <= 0.002: %s vs %s" % [sample_pos, dq])

	var rot_def: Dictionary = s.fields_by_name["rotation"]
	for angle in [0.0, 1.2345, PI, 5.99]:
		var qr := s.quantize_value(rot_def, angle)
		var dqr := float(FgNetSchemaScript.dequantize_value(rot_def, qr.value))
		var deg_err := rad_to_deg(absf(angle_difference(angle, dqr)))
		_check(deg_err <= 0.01, "angle quantization error <= 0.01 deg (got %.4f)" % deg_err)


func _test_owner_privacy_and_delta_ack() -> void:
	var s: FgNetSchemaScript = FgNetSchemaScript.create_default_character_schema()
	var store := FgStateStoreScript.new(s, 1)
	var srv := FgReplicationServerScript.new(store)
	srv.add_connection(2) # owner
	srv.add_connection(3) # non-owner

	var cli_owner := FgReplicationClientScript.new(s, 1, 2)
	var cli_other := FgReplicationClientScript.new(s, 1, 3)

	var secret_str := "TOP_SECRET_TOKEN_XYZ"
	var reg := store.register_object({
		"position": Vector2(120.5, 240.25),
		"rotation": 0.75,
		"health": 100,
		"owner_secret": secret_str,
	}, 2, 1.0, "relevant", 1)
	_check(reg.ok, "register object ok")
	var nid: Dictionary = reg.net_id
	var key := String(reg.key)
	store.apply_inventory_change(nid, "sword_epic", 3, false)

	var tick1 := srv.build_packets_for_tick(1)
	var owner_pkts: Array = tick1[2]
	var other_pkts: Array = tick1[3]
	_check(owner_pkts.size() == 1 and other_pkts.size() == 1, "both connections receive initial full snapshot")

	# 비권한 연결 wire 바이트에 owner 전용 문자열/인벤토리 키 0바이트 누출 검증
	var other_wire := (other_pkts[0] as PackedByteArray).get_string_from_ascii()
	_check(other_wire.find("TOP_SECRET") < 0 and other_wire.find("sword_epic") < 0, "owner fields absent from non-owner wire bytes")

	var full_size_owner := (owner_pkts[0] as PackedByteArray).size()
	cli_owner.handle_server_packet(owner_pkts[0])
	cli_other.handle_server_packet(other_pkts[0])
	_check(cli_owner.objects.has(key) and cli_other.objects.has(key), "both clients created object")
	_check(String(cli_owner.objects[key].state.get("owner_secret", "")) == secret_str, "owner received owner_secret")
	_check(int(cli_owner.objects[key].state.inventory.items["sword_epic"].qty) == 3, "owner received inventory item")
	_check(not cli_other.objects[key].state.has("owner_secret") and not cli_other.objects[key].state.has("inventory"), "non-owner state has no owner fields")

	# 위조 future revision ACK 거절 검증
	var forged := StreamPeerBuffer.new()
	forged.put_u8(FgReplicationServerScript.MAGIC_0)
	forged.put_u8(FgReplicationServerScript.MAGIC_1)
	forged.put_u8(FgReplicationServerScript.MSG_STORAGE_ACK)
	forged.put_u32(1)
	forged.put_data(s.protocol_hash_prefix_bytes())
	forged.put_u32(int(nid.index))
	forged.put_u32(int(nid.generation))
	forged.put_u32(9999)
	forged.put_u8(FgReplicationServerScript.ACK_FLAG_LIFECYCLE)
	var forged_res := srv.handle_client_packet(2, forged.data_array)
	_check(not forged_res.ok and String(forged_res.reason) == "forged_future_or_unsent_revision", "forged future ACK rejected")

	# 정상 ACK 전달 후 delta 송신 확인(크기 감소 + 비권한 연결은 owner 변경 시 0 패킷)
	for ack in cli_owner.drain_outbound_packets():
		_check(srv.handle_client_packet(2, ack).ok, "owner storage ACK accepted")
	for ack in cli_other.drain_outbound_packets():
		_check(srv.handle_client_packet(3, ack).ok, "other storage ACK accepted")

	# owner 전용 필드만 변경 → owner에게만 delta 전송, non-owner는 0 패킷
	store.apply_inventory_change(nid, "potion", 5, false)
	var tick2 := srv.build_packets_for_tick(2)
	_check((tick2[2] as Array).size() == 1 and (tick2[3] as Array).size() == 0, "owner-only change sends 0 packets to non-owner")
	cli_owner.handle_server_packet(tick2[2][0])
	for ack in cli_owner.drain_outbound_packets():
		srv.handle_client_packet(2, ack)

	# health만 변경 → 작은 delta 패킷 생성
	store.set_field(nid, "health", 82)
	var tick3 := srv.build_packets_for_tick(3)
	_check((tick3[2] as Array).size() == 1 and (tick3[3] as Array).size() == 1, "relevant delta sent to both")
	var delta_size_owner := (tick3[2][0] as PackedByteArray).size()
	_check(delta_size_owner < full_size_owner, "delta packet (%d B) smaller than full (%d B)" % [delta_size_owner, full_size_owner])
	cli_owner.handle_server_packet(tick3[2][0])
	cli_other.handle_server_packet(tick3[3][0])
	_check(int(cli_owner.objects[key].state.health) == 82 and int(cli_other.objects[key].state.health) == 82, "delta applied accurately")
	_metrics["ownerLeakBytes"] = 0
	_metrics["fullBytes"] = full_size_owner
	_metrics["deltaBytes"] = delta_size_owner


func _test_out_of_order_baseline_miss_and_late_join() -> void:
	var s: FgNetSchemaScript = FgNetSchemaScript.create_default_character_schema()
	var store := FgStateStoreScript.new(s, 1)
	var srv := FgReplicationServerScript.new(store)
	srv.add_connection(10)
	var cli := FgReplicationClientScript.new(s, 1, 10)

	var reg := store.register_object({"position": Vector2(10, 10), "health": 100}, 10, 1.0, "relevant", 1)
	var nid: Dictionary = reg.net_id
	var key := String(reg.key)
	var p1: PackedByteArray = srv.build_packets_for_tick(1)[10][0]
	cli.handle_server_packet(p1)
	for ack in cli.drain_outbound_packets():
		srv.handle_client_packet(10, ack)

	# rev 2, rev 3 생성 후 rev 3를 먼저 전달하고 뒤늦게 rev 2를 전달(역순)
	store.set_field(nid, "health", 70)
	var p2: PackedByteArray = srv.build_packets_for_tick(2)[10][0]
	store.set_field(nid, "health", 40)
	var p3: PackedByteArray = srv.build_packets_for_tick(3)[10][0]

	cli.handle_server_packet(p3)
	_check(int(cli.objects[key].state.health) == 40, "newer rev 3 applied first")
	var stale_res := cli.handle_server_packet(p2)
	_check(stale_res.ok and not bool(stale_res.applied), "out-of-order older rev 2 not re-applied")
	_check(int(cli.objects[key].state.health) == 40, "gameplay health stays at rev 3 (40)")
	for ack in cli.drain_outbound_packets():
		srv.handle_client_packet(10, ack)

	# baseline miss 강제: 클라이언트가 아직 모르는 baseline을 참조하는 delta 주입 → full refresh 요청 → 수렴
	store.set_field(nid, "health", 25)
	var p4: PackedByteArray = srv.build_packets_for_tick(4)[10][0]
	# 클라이언트 baseline history를 강제 비워서 missing baseline 재현
	cli.objects[key].baselines.clear()
	cli.objects[key].baseline_order.clear()
	var miss_res := cli.handle_server_packet(p4)
	_check(not miss_res.ok and String(miss_res.reason) == "missing_baseline_revision", "missing baseline detected without corruption")
	var reqs := cli.drain_outbound_packets()
	_check(reqs.size() == 1, "client emitted full refresh request")
	for r in reqs:
		srv.handle_client_packet(10, r)
	var p_recover: PackedByteArray = srv.build_packets_for_tick(5)[10][0]
	cli.handle_server_packet(p_recover)
	_check(int(cli.objects[key].state.health) == 25, "full refresh recovered exact state")

	# history 초과(bounded baseline eviction) 시 자동 full refresh 수렴 검증
	for i in range(FgStateStoreScript.MAX_BASELINE_HISTORY + 5):
		store.set_field(nid, "health", 26 + i)
		srv.build_packets_for_tick(6 + i)
	var evicted_pkts: Array = srv.build_packets_for_tick(100)[10]
	cli.handle_server_packet(evicted_pkts[0])
	_check(int(cli.objects[key].state.health) == 26 + FgStateStoreScript.MAX_BASELINE_HISTORY + 4, "evicted baseline recovered via full snapshot")

	# Late joiner(peer 20)는 변경·삭제된 인벤토리 포함 최신 상태를 정확히 수렴
	store.apply_inventory_change(nid, "key_gold", 1, false)
	store.apply_inventory_change(nid, "key_old", 1, false)
	store.apply_inventory_change(nid, "key_old", 0, true) # tombstone
	store.set_owner(nid, 20)
	srv.add_connection(20)
	var late_cli := FgReplicationClientScript.new(s, 1, 20)
	var late_pkts: Array = srv.build_packets_for_tick(101)[20]
	_check(late_pkts.size() == 1, "late joiner gets full snapshot")
	late_cli.handle_server_packet(late_pkts[0])
	var late_inv: Dictionary = late_cli.objects[key].state.inventory.items
	_check(late_inv.has("key_gold") and not late_inv.has("key_old"), "late joiner sees live items and excludes tombstoned item")

	# 프로토콜 해시 불일치 및 world_epoch 불일치 패킷 거부
	var wrong_schema := FgNetSchemaScript.new("character", 99)
	wrong_schema.add_field(1, "position", FgNetSchemaScript.FIELD_VEC2_CELL, FgNetSchemaScript.SCOPE_RELEVANT)
	var cli_bad_proto := FgReplicationClientScript.new(wrong_schema, 1, 20)
	var bad_proto_res := cli_bad_proto.handle_server_packet(late_pkts[0])
	_check(not bad_proto_res.ok and String(bad_proto_res.reason) == "protocol_hash_mismatch", "protocol hash mismatch rejected")
	var cli_bad_epoch := FgReplicationClientScript.new(s, 2, 20)
	var bad_epoch_res := cli_bad_epoch.handle_server_packet(late_pkts[0])
	_check(not bad_epoch_res.ok and String(bad_epoch_res.reason) == "world_epoch_mismatch", "world epoch mismatch rejected")


func _test_tombstone_and_100k_lifecycle() -> void:
	var s: FgNetSchemaScript = FgNetSchemaScript.create_default_character_schema()
	var store := FgStateStoreScript.new(s, 1)
	var srv := FgReplicationServerScript.new(store)
	srv.add_connection(2)
	var cli := FgReplicationClientScript.new(s, 1, 2)

	var reg := store.register_object({"position": Vector2(50, 50), "health": 100}, 2, 1.0, "relevant", 1)
	var nid: Dictionary = reg.net_id
	var key := String(reg.key)
	var delayed_full: PackedByteArray = srv.build_packets_for_tick(1)[2][0]
	cli.handle_server_packet(delayed_full)
	for ack in cli.drain_outbound_packets():
		srv.handle_client_packet(2, ack)
	store.set_field(nid, "health", 90)
	var delayed_delta: PackedByteArray = srv.build_packets_for_tick(2)[2][0]

	# 객체 파괴 → tombstone 전송 및 적용
	var dest := store.destroy_object(nid, 3)
	_check(dest.ok, "destroy object ok")
	var tomb_pkts: Array = srv.build_packets_for_tick(3)[2]
	_check(tomb_pkts.size() == 1, "tombstone sent")
	cli.handle_server_packet(tomb_pkts[0])
	_check(not cli.objects.has(key) and cli.tombstoned.has(key), "client removed object and recorded tombstone")
	for ack in cli.drain_outbound_packets():
		srv.handle_client_packet(2, ack)

	# tombstone 이후 지연 도착한 구 full/delta가 객체를 되살리지 않음
	var r_full := cli.handle_server_packet(delayed_full)
	var r_delta := cli.handle_server_packet(delayed_delta)
	_check(not r_full.ok and not r_delta.ok and not cli.objects.has(key), "tombstoned object never resurrected by delayed packets")
	_check(int(cli.stats.tombstone_resurrection_blocked) == 2, "both delayed resurrections blocked")

	# 동일 index 재할당 시 generation 증가 → 신규 세대는 정상 복제
	var reg2 := store.register_object({"position": Vector2(200, 200), "health": 55}, 2, 1.0, "relevant", 4)
	_check(int(reg2.net_id.index) == int(nid.index) and int(reg2.net_id.generation) == int(nid.generation) + 1, "index reused with bumped generation")
	var new_pkts: Array = srv.build_packets_for_tick(4)[2]
	cli.handle_server_packet(new_pkts[0])
	_check(cli.objects.has(String(reg2.key)) and int(cli.objects[String(reg2.key)].state.health) == 55, "new generation object isolated cleanly")

	# 100,000회 spawn/despawn 수명 스트레스 — ID/generation 오염 0건(plans/26 §10)
	var stress_store := FgStateStoreScript.new(s, 1)
	var seen_keys := {}
	var collisions := 0
	var t0 := Time.get_ticks_usec()
	for i in 100000:
		var r := stress_store.register_object({"position": Vector2(float(i % 500), 10.0), "health": 100}, 0, 1.0, "relevant", i)
		var k := String(r.key)
		if seen_keys.has(k):
			collisions += 1
		seen_keys[k] = true
		stress_store.destroy_object(r.net_id, i)
		# 메모리 비대화 방지: tombstone 테이블 정리(할당기 generation 자체는 유지)
		stress_store.tombstones.erase(k)
	var elapsed_ms := float(Time.get_ticks_usec() - t0) / 1000.0
	_check(collisions == 0 and stress_store.objects.is_empty(), "100,000 spawn/despawn zero ID/generation collisions")
	_metrics["lifecycle100kCollisions"] = collisions
	_metrics["lifecycle100kMs"] = snappedf(elapsed_ms, 0.1)


func _test_spatial_aoi_and_dormancy() -> void:
	var s: FgNetSchemaScript = FgNetSchemaScript.create_default_character_schema()
	var store := FgStateStoreScript.new(s, 1)
	var filt := FgInterestFilterScript.new()
	filt.spatial_enabled = true
	filt.enter_radius = 200.0
	filt.exit_radius = 250.0
	var srv := FgReplicationServerScript.new(store, filt)
	srv.add_connection(3)
	var cli := FgReplicationClientScript.new(s, 1, 3)

	var reg := store.register_object({"position": Vector2(0, 0), "health": 100}, 0, 1.0, "relevant", 1)
	var nid: Dictionary = reg.net_id
	var key := String(reg.key)
	var priv := store.register_object({"position": Vector2(0, 0), "health": 99}, 2, 1.0, "owner_only", 1)
	var priv_key := String(priv.key)

	# 경계 왕복 20회: 진입→생성, 이탈→despawn, ghost/중복 0건 + owner_only 객체 절대 미수신
	var tick := 1
	for cycle in 20:
		filt.set_viewpoint(3, Vector2(50, 0))
		for pkt in srv.build_packets_for_tick(tick)[3]:
			cli.handle_server_packet(pkt)
		for ack in cli.drain_outbound_packets():
			srv.handle_client_packet(3, ack)
		_check(cli.objects.size() == 1 and cli.objects.has(key) and not cli.objects.has(priv_key), "AOI enter cycle %d clean" % cycle)
		tick += 1

		filt.set_viewpoint(3, Vector2(400, 0))
		for pkt in srv.build_packets_for_tick(tick)[3]:
			cli.handle_server_packet(pkt)
		_check(cli.objects.is_empty(), "AOI exit cycle %d zero ghosts" % cycle)
		tick += 1

	# Dormancy 검증: ACK 완료 후 수면 객체는 0 패킷, late join에는 전송, 수면 중 파괴 시 tombstone 전송
	filt.set_viewpoint(3, Vector2(0, 0))
	for pkt in srv.build_packets_for_tick(tick)[3]:
		cli.handle_server_packet(pkt)
	for ack in cli.drain_outbound_packets():
		srv.handle_client_packet(3, ack)
	store.set_dormant(nid, true, tick)
	var dormant_packets := 0
	for _i in 10:
		tick += 1
		dormant_packets += (srv.build_packets_for_tick(tick)[3] as Array).size()
	_check(dormant_packets == 0 and int(srv.stats.dormant_skipped) >= 10, "dormant object sends 0 packets to synced peers")

	# Late joiner는 수면 객체도 최초 상태를 받는다
	srv.add_connection(5)
	filt.set_viewpoint(5, Vector2(0, 0))
	var cli_late := FgReplicationClientScript.new(s, 1, 5)
	tick += 1
	var late_pkts: Array = srv.build_packets_for_tick(tick)[5]
	_check(late_pkts.size() == 1, "late joiner receives dormant object initial state")
	cli_late.handle_server_packet(late_pkts[0])
	_check(cli_late.objects.has(key), "late joiner materialized dormant object")

	# 수면 중 파괴 → tombstone 통지
	store.destroy_object(nid, tick + 1)
	var wake_pkts := srv.build_packets_for_tick(tick + 1)
	_check((wake_pkts[3] as Array).size() == 1 and (wake_pkts[5] as Array).size() == 1, "destroying dormant object wakes and sends tombstones")
	cli.handle_server_packet(wake_pkts[3][0])
	cli_late.handle_server_packet(wake_pkts[5][0])
	_check(cli.objects.is_empty() and cli_late.objects.is_empty(), "both peers cleaned up destroyed dormant object")


func _test_malformed_fuzz() -> void:
	var s: FgNetSchemaScript = FgNetSchemaScript.create_default_character_schema()
	var store := FgStateStoreScript.new(s, 1)
	var srv := FgReplicationServerScript.new(store)
	srv.add_connection(2)
	var cli := FgReplicationClientScript.new(s, 1, 2)
	var rng := RandomNumberGenerator.new()
	rng.seed = 20261126

	var rejected := 0
	var total_cases := 2000
	var hp := s.protocol_hash_prefix_bytes()
	for i in total_cases:
		var raw := PackedByteArray()
		var mode := i % 5
		if mode == 0:
			# 무작위 길이/바이트
			raw.resize(rng.randi_range(0, 1200))
			for j in raw.size():
				raw[j] = rng.randi_range(0, 255)
		elif mode == 1:
			# 유효 헤더 + 잘린/손상 본문
			var b := StreamPeerBuffer.new()
			b.put_u8(FgReplicationServerScript.MAGIC_0)
			b.put_u8(FgReplicationServerScript.MAGIC_1)
			b.put_u8(rng.randi_range(1, 7))
			b.put_u32(1)
			b.put_data(hp)
			for _k in rng.randi_range(0, 40):
				b.put_u8(rng.randi_range(0, 255))
			raw = b.data_array
		elif mode == 2:
			# 과도한 컬렉션 개수 공격(max_items 초과)
			var b := StreamPeerBuffer.new()
			b.put_u8(FgReplicationServerScript.MAGIC_0)
			b.put_u8(FgReplicationServerScript.MAGIC_1)
			b.put_u8(FgReplicationServerScript.MSG_SPAWN_OR_FULL)
			b.put_u32(1)
			b.put_data(hp)
			b.put_u32(0)
			b.put_u32(1)
			b.put_u32(2)
			b.put_u32(1)
			b.put_u32(1 << 3) # inventory bit
			b.put_u32(1)
			b.put_u16(9999) # > max_items(128)
			raw = b.data_array
		elif mode == 3:
			# 알 수 없는 field bit 공격
			var b := StreamPeerBuffer.new()
			b.put_u8(FgReplicationServerScript.MAGIC_0)
			b.put_u8(FgReplicationServerScript.MAGIC_1)
			b.put_u8(FgReplicationServerScript.MSG_SPAWN_OR_FULL)
			b.put_u32(1)
			b.put_data(hp)
			b.put_u32(0)
			b.put_u32(1)
			b.put_u32(2)
			b.put_u32(1)
			b.put_u32(1 << 29) # unknown bit
			raw = b.data_array
		else:
			# 1000B 초과 datagram
			raw.resize(1024)
			raw[0] = FgReplicationServerScript.MAGIC_0
			raw[1] = FgReplicationServerScript.MAGIC_1
		var rc := cli.handle_server_packet(raw)
		var rs := srv.handle_client_packet(2, raw)
		if not rc.ok:
			rejected += 1
		if not rs.ok:
			rejected += 1
	_check(cli.objects.is_empty(), "fuzz did not corrupt or create any client object")
	_check(rejected >= total_cases, "fuzz rejected malformed packets cleanly (%d)" % rejected)
	_metrics["fuzzCases"] = total_cases * 2
	_metrics["fuzzRejected"] = rejected


func _bench_n0_n1() -> void:
	for cfg in [
		{"name": "N0", "conns": 2, "objs": 100, "dirtyPct": 0.10},
		{"name": "N1", "conns": 8, "objs": 500, "dirtyPct": 0.05},
	]:
		var s: FgNetSchemaScript = FgNetSchemaScript.create_default_character_schema()
		var store := FgStateStoreScript.new(s, 1)
		var filt := FgInterestFilterScript.new()
		filt.spatial_enabled = true
		filt.enter_radius = 450.0
		filt.exit_radius = 500.0
		var srv := FgReplicationServerScript.new(store, filt)
		srv.budget_bytes_per_tick = 12800
		var conns := int(cfg.conns)
		var objs := int(cfg.objs)
		var clients := {}
		for c in range(2, 2 + conns):
			srv.add_connection(c)
			filt.set_viewpoint(c, Vector2(250.0, 250.0))
			clients[c] = FgReplicationClientScript.new(s, 1, c)

		var nids: Array = []
		var rng := RandomNumberGenerator.new()
		rng.seed = 42 + objs
		for i in objs:
			var r := store.register_object({
				"position": Vector2(rng.randf_range(0, 600), rng.randf_range(0, 600)),
				"rotation": rng.randf_range(0, TAU),
				"health": 100,
			}, 2 + (i % conns), 1.0, "relevant", 0)
			nids.append(r.net_id)

		# Warmup 3 ticks to establish baselines & ACKs
		for wt in range(1, 4):
			var wpkts := srv.build_packets_for_tick(wt)
			for c in clients:
				for p in wpkts[c]:
					clients[c].handle_server_packet(p)
				for a in clients[c].drain_outbound_packets():
					srv.handle_client_packet(c, a)

		var dirty_count := maxi(1, int(round(float(objs) * float(cfg.dirtyPct))))
		var tick_us := PackedInt32Array()
		var bytes_before := int(srv.stats.bytes_sent)
		var sample_ticks := 20
		for t in range(4, 4 + sample_ticks):
			for d in dirty_count:
				var idx := (t * dirty_count + d) % objs
				store.set_field(nids[idx], "position", Vector2(rng.randf_range(100, 400), rng.randf_range(100, 400)))
				store.set_field(nids[idx], "health", 50 + (t + d) % 50)
			var t0 := Time.get_ticks_usec()
			var pkts := srv.build_packets_for_tick(t)
			tick_us.append(Time.get_ticks_usec() - t0)
			for c in clients:
				for p in pkts[c]:
					clients[c].handle_server_packet(p)
				for a in clients[c].drain_outbound_packets():
					srv.handle_client_packet(c, a)

		tick_us.sort()
		var p50 := tick_us[int(tick_us.size() * 0.5)]
		var p95 := tick_us[clampi(int(ceil(0.95 * tick_us.size())) - 1, 0, tick_us.size() - 1)]
		var bytes_delta := int(srv.stats.bytes_sent) - bytes_before
		var avg_bytes_per_conn_tick := float(bytes_delta) / float(conns * sample_ticks)
		_metrics[String(cfg.name)] = {
			"conns": conns,
			"objs": objs,
			"dirtyPerTick": dirty_count,
			"p50Us": p50,
			"p95Us": p95,
			"avgBytesPerConnAt10Hz": snappedf(avg_bytes_per_conn_tick * 10.0, 0.1),
			"deltaSent": int(srv.stats.delta_sent),
			"fullSent": int(srv.stats.full_sent),
		}
