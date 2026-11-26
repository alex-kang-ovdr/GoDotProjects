extends SceneTree
## Iris C++ GDExtension(FgIrisNativeServer) 와이어 호환성 검증 및 N0/N1/N2/N3 벤치마크 (로드맵 26 §10).
## godot --headless --path forge/Godot --script res://addons/playforge_netframework/demo/iris_native_bench.gd

const FgNetSchemaScript := preload("res://addons/playforge_netframework/replication/fg_net_schema.gd")
const FgReplicationClientScript := preload("res://addons/playforge_netframework/replication/fg_replication_client.gd")
const FgReplicationServerScript := preload("res://addons/playforge_netframework/replication/fg_replication_server.gd")
const FgIrisNativeLoaderScript := preload("res://addons/playforge_netframework/replication/fg_iris_native_loader.gd")

var _failures: Array[String] = []
var _metrics: Dictionary = {}


func _initialize() -> void:
	var loaded := FgIrisNativeLoaderScript.ensure_loaded()
	_check(loaded, "FgIrisNativeServer GDExtension loaded")
	if not loaded:
		_finish()
		return

	_test_wire_parity_with_gdscript_client()
	_bench_profiles()
	_finish()


func _finish() -> void:
	var out := {
		"ok": _failures.is_empty(),
		"failures": _failures,
		"metrics": _metrics,
	}
	print("IRIS_NATIVE_BENCH_JSON " + JSON.stringify(out))
	if _failures.is_empty():
		print("IRIS_NATIVE_BENCH_OK")
		quit(0)
	else:
		for f in _failures:
			printerr("IRIS_NATIVE_BENCH_FAIL: " + f)
		quit(1)


func _check(cond: bool, label: String) -> void:
	if not cond:
		_failures.append(label)


func _test_wire_parity_with_gdscript_client() -> void:
	var s: FgNetSchemaScript = FgNetSchemaScript.create_default_character_schema()
	var srv := FgIrisNativeLoaderScript.create_server()
	srv.call("configure", 1, s.protocol_hash_prefix_bytes(), 64.0, 6400, 1000, 4)
	srv.call("set_spatial_filter", true, 300.0, 350.0, 60)
	srv.call("add_connection", 2) # owner
	srv.call("add_connection", 3) # non-owner
	srv.call("set_viewpoint", 2, Vector2(100, 100))
	srv.call("set_viewpoint", 3, Vector2(100, 100))

	var cli_owner := FgReplicationClientScript.new(s, 1, 2)
	var cli_other := FgReplicationClientScript.new(s, 1, 3)

	var secret := "NATIVE_OWNER_SECRET_77"
	var reg: Dictionary = srv.call("register_object", Vector2(123.45, 234.56), 1.25, 100, 2, 1.0, false, secret, 1)
	_check(bool(reg.ok), "native register_object ok")
	var idx := int(reg.index)
	var gen := int(reg.generation)
	var key := "%d:%d" % [idx, gen]

	# Tick 1: C++ 서버가 인코딩한 Full 패킷을 GDScript FgReplicationClient가 그대로 디코딩
	var pkts1: Dictionary = srv.call("build_packets_for_tick", 1)
	var owner_pkts: Array = pkts1[2]
	var other_pkts: Array = pkts1[3]
	_check(owner_pkts.size() == 1 and other_pkts.size() == 1, "native sent full to owner and other")
	var other_ascii := (other_pkts[0] as PackedByteArray).get_string_from_ascii()
	_check(other_ascii.find("NATIVE_OWNER_SECRET") < 0, "native non-owner wire bytes leak 0 secret bytes")

	var r_own := cli_owner.handle_server_packet(owner_pkts[0])
	var r_oth := cli_other.handle_server_packet(other_pkts[0])
	_check(r_own.ok and r_oth.ok, "GDScript client decoded native full packets cleanly")
	_check(String(cli_owner.objects[key].state.get("owner_secret", "")) == secret, "owner decoded native owner_secret")
	_check(not cli_other.objects[key].state.has("owner_secret"), "non-owner has no owner_secret")
	_check((cli_owner.objects[key].state.position as Vector2).distance_to(Vector2(123.45, 234.56)) <= 0.002, "native quantized pos matches GDScript")

	# 위조 future revision ACK 거절 검증
	var forged := StreamPeerBuffer.new()
	forged.put_u8(FgReplicationServerScript.MAGIC_0)
	forged.put_u8(FgReplicationServerScript.MAGIC_1)
	forged.put_u8(FgReplicationServerScript.MSG_STORAGE_ACK)
	forged.put_u32(1)
	forged.put_data(s.protocol_hash_prefix_bytes())
	forged.put_u32(idx)
	forged.put_u32(gen)
	forged.put_u32(9999)
	forged.put_u8(FgReplicationServerScript.ACK_FLAG_LIFECYCLE)
	var forged_res: Dictionary = srv.call("handle_client_packet", 2, forged.data_array)
	_check(not bool(forged_res.ok) and String(forged_res.reason) == "forged_future_or_unsent_revision", "native rejected forged future ACK")

	# 정상 ACK → C++ Delta 패킷 생성 → GDScript 클라 적용
	for ack in cli_owner.drain_outbound_packets():
		_check(bool(srv.call("handle_client_packet", 2, ack).ok), "native accepted owner ACK")
	for ack in cli_other.drain_outbound_packets():
		_check(bool(srv.call("handle_client_packet", 3, ack).ok), "native accepted other ACK")

	srv.call("set_object_transform_health", idx, gen, Vector2(123.45, 234.56), 1.25, 77)
	var pkts2: Dictionary = srv.call("build_packets_for_tick", 2)
	_check((pkts2[2] as Array).size() == 1 and (pkts2[3] as Array).size() == 1, "native emitted delta packets")
	var full_len := (owner_pkts[0] as PackedByteArray).size()
	var delta_len := (pkts2[2][0] as PackedByteArray).size()
	_check(delta_len < full_len, "native delta (%d B) < full (%d B)" % [delta_len, full_len])
	_check(cli_owner.handle_server_packet(pkts2[2][0]).ok, "GDScript client applied native delta (owner)")
	_check(cli_other.handle_server_packet(pkts2[3][0]).ok, "GDScript client applied native delta (other)")
	_check(int(cli_owner.objects[key].state.health) == 77 and int(cli_other.objects[key].state.health) == 77, "native delta updated health accurately")

	# AOI 이탈 → despawn_interest, 재진입 → full, 파괴 → tombstone
	srv.call("set_viewpoint", 3, Vector2(1200, 1200))
	var pkts3: Dictionary = srv.call("build_packets_for_tick", 3)
	for p in pkts3[3]:
		cli_other.handle_server_packet(p)
	_check(cli_other.objects.is_empty(), "native AOI exit despawned remote object")

	srv.call("destroy_object", idx, gen, 4)
	var pkts4: Dictionary = srv.call("build_packets_for_tick", 4)
	for p in pkts4[2]:
		cli_owner.handle_server_packet(p)
	_check(cli_owner.objects.is_empty() and cli_owner.tombstoned.has(key), "native tombstone applied cleanly")
	_metrics["parityOk"] = true
	_metrics["nativeFullBytes"] = full_len
	_metrics["nativeDeltaBytes"] = delta_len


func _bench_profiles() -> void:
	var s: FgNetSchemaScript = FgNetSchemaScript.create_default_character_schema()
	var hash_prefix := s.protocol_hash_prefix_bytes()
	# 로드맵 26 §10 시험 프로파일: N0, N1, N2 (목표 p95 <= 4ms), N3 (연구 목표 p95 <= 8ms)
	# 공간 분포는 연결당 관련 객체 수(80/100/200/500)가 되도록 월드 크기와 enter_radius를 설정한다.
	var profiles := [
		{"name": "N0", "conns": 2, "objs": 100, "dirtyPct": 0.10, "worldSize": 600.0, "radius": 350.0, "budget": 12800},
		{"name": "N1", "conns": 8, "objs": 500, "dirtyPct": 0.05, "worldSize": 1000.0, "radius": 250.0, "budget": 12800},
		{"name": "N2", "conns": 32, "objs": 2000, "dirtyPct": 0.05, "worldSize": 2000.0, "radius": 350.0, "budget": 12800},
		{"name": "N3", "conns": 100, "objs": 10000, "dirtyPct": 0.05, "worldSize": 4500.0, "radius": 560.0, "budget": 12800},
	]
	for cfg in profiles:
		var srv := FgIrisNativeLoaderScript.create_server()
		var conns := int(cfg.conns)
		var objs := int(cfg.objs)
		var wsize := float(cfg.worldSize)
		var rad := float(cfg.radius)
		srv.call("configure", 1, hash_prefix, 64.0, int(cfg.budget), 1000, 8)
		srv.call("set_spatial_filter", true, rad, rad + 50.0, 60)

		var rng := RandomNumberGenerator.new()
		rng.seed = 2026 + objs
		for c in range(2, 2 + conns):
			srv.call("add_connection", c)
			srv.call("set_viewpoint", c, Vector2(rng.randf_range(0.0, wsize), rng.randf_range(0.0, wsize)))

		var indices := PackedInt32Array()
		var gens := PackedInt32Array()
		indices.resize(objs)
		gens.resize(objs)
		for i in objs:
			var r: Dictionary = srv.call(
				"register_object",
				Vector2(rng.randf_range(0.0, wsize), rng.randf_range(0.0, wsize)),
				rng.randf_range(0.0, TAU),
				100,
				2 + (i % conns),
				1.0,
				false,
				"",
				0
			)
			indices[i] = int(r.index)
			gens[i] = int(r.generation)

		# Warmup: 초기 스폰·ACK 정착(budget 분할 전송을 고려해 6틱 워밍업)
		for wt in range(1, 7):
			srv.call("build_packets_for_tick_flat", wt)
			srv.call("ack_all_sent_for_benchmark")

		var dirty_count := maxi(1, int(round(float(objs) * float(cfg.dirtyPct))))
		var sample_ticks := 30
		var native_us := PackedInt32Array()
		var total_us := PackedInt32Array()
		var stats_before: Dictionary = srv.call("get_stats")
		var bytes_before := int(stats_before.bytes_sent)

		for t in range(10, 10 + sample_ticks):
			for d in dirty_count:
				var slot_i := (t * dirty_count + d) % objs
				srv.call(
					"set_object_transform_health",
					indices[slot_i],
					gens[slot_i],
					Vector2(rng.randf_range(0.0, wsize), rng.randf_range(0.0, wsize)),
					rng.randf_range(0.0, TAU),
					50 + ((t + d) % 50)
				)
			var t0 := Time.get_ticks_usec()
			var _flat: PackedByteArray = srv.call("build_packets_for_tick_flat", t)
			var dt_total := Time.get_ticks_usec() - t0
			var st: Dictionary = srv.call("get_stats")
			native_us.append(int(st.last_capture_us) + int(st.last_build_us))
			total_us.append(dt_total)
			srv.call("ack_all_sent_for_benchmark")

		native_us.sort()
		total_us.sort()
		var stats_after: Dictionary = srv.call("get_stats")
		var bytes_delta := int(stats_after.bytes_sent) - bytes_before
		var avg_bytes_10hz := (float(bytes_delta) / float(conns * sample_ticks)) * 10.0

		var n_p50 := native_us[int(native_us.size() * 0.5)]
		var n_p95 := native_us[clampi(int(ceil(0.95 * native_us.size())) - 1, 0, native_us.size() - 1)]
		var t_p95 := total_us[clampi(int(ceil(0.95 * total_us.size())) - 1, 0, total_us.size() - 1)]

		_metrics[String(cfg.name)] = {
			"conns": conns,
			"objs": objs,
			"dirtyPerTick": dirty_count,
			"nativeP50Us": n_p50,
			"nativeP95Us": n_p95,
			"totalFlatP95Us": t_p95,
			"avgBytesPerConnAt10Hz": snappedf(avg_bytes_10hz, 0.1),
			"workerThreads": int(stats_after.worker_threads),
			"deltaSent": int(stats_after.delta_sent),
			"fullSent": int(stats_after.full_sent),
		}
		if String(cfg.name) == "N2":
			_check(t_p95 <= 4000, "N2 replication CPU p95 <= 4.0ms (got %.2f ms)" % (float(t_p95) / 1000.0))
