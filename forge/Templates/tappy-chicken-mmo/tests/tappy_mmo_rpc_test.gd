extends SceneTree
## Headless Godot 4.7 multi-peer integration test for Tappy Chicken MMO.
## Verifies real SceneMultiplayer + ENetMultiplayerPeer @rpc routing:
##   Client -> Server RPC -> Spatial AOI Filter -> Targeted Multicast to Nearby Clients ONLY,
##   seamless drop-in (난입), 50% ghost opacity, and unchanged local gameplay.

const MainScene := preload("res://scenes/main.tscn")
const MmoScript := preload("res://Scripts/MmoNetwork.gd")

var _port := 17891
var _server_mp: SceneMultiplayer
var _client_mps: Array[SceneMultiplayer] = []


func _initialize() -> void:
	call_deferred("_run_test")


func _pump(steps: int = 30, delay_ms: int = 10) -> void:
	for _i in steps:
		if _server_mp != null:
			_server_mp.poll()
		for mp in _client_mps:
			if mp != null:
				mp.poll()
		if delay_ms > 0:
			OS.delay_msec(delay_ms)
		await process_frame


func _wait_until(predicate: Callable, max_steps: int = 120) -> bool:
	for _i in max_steps:
		if predicate.call():
			return true
		await _pump(1, 15)
	return predicate.call()


func _fail(reason: String) -> void:
	printerr("ASSERTION FAILED: " + reason)
	quit(1)


func _check(cond: bool, reason: String) -> void:
	if not cond:
		_fail(reason)


func _make_client_instance(root_name: String) -> Dictionary:
	var holder := Node.new()
	holder.name = root_name
	root.add_child(holder)

	var mp := SceneMultiplayer.new()
	mp.root_path = holder.get_path()
	set_multiplayer(mp, holder.get_path())
	_client_mps.append(mp)

	var scene := MainScene.instantiate()
	var mmo := scene.get_node("MmoNetwork")
	mmo.auto_start = false
	mmo.proximity_radius = 520.0
	holder.add_child(scene)
	scene.set_physics_process(false)
	return {"holder": holder, "mp": mp, "scene": scene, "mmo": mmo}


func _run_test() -> void:
	# 1. Start Dedicated MMO Server on an available loopback port.
	var server_holder := Node.new()
	server_holder.name = "ServerRoot"
	root.add_child(server_holder)

	_server_mp = SceneMultiplayer.new()
	_server_mp.root_path = server_holder.get_path()
	set_multiplayer(_server_mp, server_holder.get_path())

	var server_scene := Node2D.new()
	server_scene.name = "TappyChickenMMO"
	var server_mmo := Node.new()
	server_mmo.name = "MmoNetwork"
	server_mmo.set_script(MmoScript)
	server_mmo.auto_start = false
	server_mmo.proximity_radius = 520.0
	server_scene.add_child(server_mmo)
	server_holder.add_child(server_scene)

	var bound := false
	for attempt in 20:
		var candidate := 17890 + attempt
		if server_mmo.start_enet_server(candidate, 77777, false) == OK:
			_port = candidate
			bound = true
			break
	_check(bound, "Could not bind ENet test server port")

	# 2. Client A connects first and starts flying (local gameplay).
	var a := _make_client_instance("ClientARoot")
	_check(a.mmo.start_enet_client("127.0.0.1", _port, "Alpha") == OK, "Client A failed to start")
	await _wait_until(func(): return a.mmo.connected and a.mmo.course_seed == 77777)
	_check(a.mmo.connected, "Client A did not connect to server")
	_check(a.mmo.course_seed == 77777, "Client A did not receive shared course_seed")

	# Advance Client A locally: menu -> ready -> playing + flap.
	var snap_a: Dictionary = a.scene.game.input("flap")
	_check(snap_a.state == "ready", "Client A should enter ready on first flap")
	snap_a = a.scene.game.input("flap")
	_check(snap_a.state == "playing", "Client A should enter playing on second flap")
	for _i in 30:
		snap_a = a.scene.game.update(1.0 / 60.0)
	var dist_a_before := float(snap_a.run_distance)
	_check(dist_a_before > 70.0 and dist_a_before < 110.0, "Client A run_distance unexpected: %f" % dist_a_before)
	_check(is_equal_approx(a.scene.bird.modulate.a, 1.0), "Local bird must stay 100% opaque")

	# Publish Client A's position via RPC.
	a.mmo.publish_local_event("flap", snap_a)
	await _pump(20)

	# 3. Drop-in (난입!): Client B joins mid-flight nearby (distance ~120) and Client C joins far away (distance ~2000).
	var b := _make_client_instance("ClientBRoot")
	var c := _make_client_instance("ClientCRoot")
	_check(b.mmo.start_enet_client("127.0.0.1", _port, "Bravo") == OK, "Client B failed to start")
	_check(c.mmo.start_enet_client("127.0.0.1", _port, "Charlie") == OK, "Client C failed to start")
	await _wait_until(func(): return b.mmo.connected and c.mmo.connected and b.mmo.course_seed == 77777 and c.mmo.course_seed == 77777)
	_check(b.mmo.connected and c.mmo.connected, "Drop-in clients B and C must connect")
	_check(b.mmo.course_seed == 77777 and c.mmo.course_seed == 77777, "Drop-in clients must receive shared course_seed")

	# Move Client C far away (2000px > proximity_radius 520px + hysteresis 60px).
	var snap_c := {
		"state": "playing", "run_distance": 2000.0, "flap_time": 0.1, "score": 7,
		"bird": {"x": 135.0, "y": 240.0, "vy": -120.0, "angle": -0.3},
	}
	c.mmo.publish_local_event("sync", snap_c)
	await _pump(30)

	# Move Client B near Client A (120px).
	var snap_b := {
		"state": "playing", "run_distance": 120.0, "flap_time": 0.0, "score": 1,
		"bird": {"x": 135.0, "y": 260.0, "vy": -345.0, "angle": -0.6},
	}
	b.mmo.publish_local_event("flap", snap_b)
	await _pump(30)

	# Verify: A and B see each other at 50% opacity; C is filtered out!
	var a_id: String = a.mmo.local_peer_id
	var b_id: String = b.mmo.local_peer_id
	var c_id: String = c.mmo.local_peer_id
	_check(a.scene.get_ghost_sprite(b_id) != null, "Client A should render nearby Client B ghost")
	_check(b.scene.get_ghost_sprite(a_id) != null, "Client B should render nearby Client A ghost")
	_check(a.scene.get_ghost_sprite(c_id) == null, "Client A must NOT render far Client C")
	_check(c.scene.get_ghost_sprite(a_id) == null, "Far Client C must NOT render Client A")
	_check(c.scene.get_ghost_sprite(b_id) == null, "Far Client C must NOT render Client B")

	var ghost_on_a: Sprite2D = a.scene.get_ghost_sprite(b_id)
	var ghost_on_b: Sprite2D = b.scene.get_ghost_sprite(a_id)
	_check(is_equal_approx(ghost_on_a.modulate.a, 0.5), "Remote ghost alpha on A must be 0.5, got %f" % ghost_on_a.modulate.a)
	_check(is_equal_approx(ghost_on_b.modulate.a, 0.5), "Remote ghost alpha on B must be 0.5, got %f" % ghost_on_b.modulate.a)

	# 4. Now Client A flaps again -> B MUST receive multicast RPC, C MUST receive ZERO events!
	var b_recv_before: int = b.mmo.events_received_client
	var c_recv_before: int = c.mmo.events_received_client
	var filtered_before: int = server_mmo.server_filtered_out
	snap_a = a.scene.game.input("flap")
	a.mmo.publish_local_event("flap", snap_a)
	await _pump(30)
	_check(b.mmo.events_received_client == b_recv_before + 1, "Nearby Client B should receive A's flap multicast")
	_check(c.mmo.events_received_client == c_recv_before, "Far Client C must receive ZERO packets for A's flap")
	_check(server_mmo.server_filtered_out > filtered_before, "Server must record filtered-out far peer")

	# Verify local gameplay of Client A was completely untouched by B/C.
	_check(a.scene.game.snapshot().state == "playing", "Client A local game state should remain playing")
	_check(is_equal_approx(a.scene.bird.modulate.a, 1.0), "Client A local bird opacity remains 1.0")

	# 5. Spatial AOI Enter: Client C moves into proximity (280px).
	snap_c["run_distance"] = 280.0
	c.mmo.publish_local_event("flap", snap_c)
	await _pump(30)
	_check(a.scene.get_ghost_sprite(c_id) != null, "Client A should render Client C once C enters proximity")
	_check(c.scene.get_ghost_sprite(a_id) != null, "Client C should receive Client A sync on AOI entry")
	_check(is_equal_approx(a.scene.get_ghost_sprite(c_id).modulate.a, 0.5), "Client C ghost alpha must be 0.5")

	# 6. Spatial AOI Leave: Client C moves back out (> 520 + 60 = 580 away).
	snap_c["run_distance"] = 2600.0
	c.mmo.publish_local_event("sync", snap_c)
	await _pump(30)
	_check(a.scene.get_ghost_sprite(c_id) == null, "Client C ghost must be removed from A when leaving proximity")
	_check(c.scene.get_ghost_sprite(a_id) == null, "Client A ghost must be removed from C when leaving proximity")

	# 7. Disconnect cleanup: Client B leaves -> removed from A cleanly.
	b.mmo.shutdown()
	await _pump(40)
	_check(a.scene.get_ghost_sprite(b_id) == null, "Disconnected Client B ghost must be cleaned up on A")
	_check(a.scene.game.snapshot().state == "playing", "Client A local gameplay must continue uninterrupted after B disconnects")

	# Shutdown cleanly and release custom SceneMultiplayer instances before exit.
	a.mmo.shutdown()
	b.mmo.shutdown()
	c.mmo.shutdown()
	server_mmo.shutdown()
	await _pump(5, 5)
	for entry in [a, b, c]:
		set_multiplayer(null, entry.holder.get_path())
		entry.holder.free()
	set_multiplayer(null, server_holder.get_path())
	server_holder.free()
	_client_mps.clear()
	_server_mp = null
	print("TAPPY_MMO_RPC_OK")
	quit(0)
