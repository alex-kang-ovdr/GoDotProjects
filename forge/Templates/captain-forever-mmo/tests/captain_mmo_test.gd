extends SceneTree

const MainScene = preload("res://scenes/main.tscn")
const MmoNetScript = preload("res://scripts/mmo_network.gd")
const RemoteShipScript = preload("res://scripts/remote_ship.gd")

func _initialize() -> void:
	call_deferred("_run")


func _run() -> void:
	# 1. Boot Main scene and verify Captain Salvage core + font + modular ship + MMO node
	var main := MainScene.instantiate() as Node2D
	root.add_child(main)
	for _i in 4:
		await process_frame

	var player: ShipBody = main.player
	assert(player != null, "PlayerShip missing")
	assert(player.model.parts.size() == 15, "Expected 15 starter ship parts, got %d" % player.model.parts.size())
	assert(main.mmo != null, "CaptainMmoNetwork missing")
	assert(ThemeDB.fallback_font != null, "Fallback Korean font missing")

	# Verify blueprint encode/decode + RemoteCaptainShip projectile_hit
	var bp := MmoNetScript.encode_blueprint(player.model)
	assert(bp.size() == 15, "Encoded blueprint should have 15 parts")
	var remote := RemoteShipScript.new()
	main.world_layer.add_child(remote)
	remote.setup("p-test", "AlphaCap")
	remote.apply_event({
		"name": "AlphaCap",
		"x": 500.0,
		"y": 0.0,
		"vx": 0.0,
		"vy": 0.0,
		"rot": 0.0,
		"blueprint": bp,
	})
	var hit := remote.projectile_hit(Vector2(300.0, 0.0), Vector2(700.0, 0.0))
	assert(not hit.is_empty(), "RemoteCaptainShip swept projectile_hit should register hit")
	remote.queue_free()
	main.queue_free()
	paused = false
	await process_frame

	# 2. Verify native Godot ENet @rpc 2D spatial AOI (Host + 2 Clients)
	var port := 17890 + int(Time.get_ticks_usec() % 500)
	var host_net := MmoNetScript.new()
	host_net.name = "CaptainMmoNetwork"
	host_net.auto_start = false
	host_net.proximity_radius = 1200.0
	host_net.leave_hysteresis = 100.0
	var host_mp := SceneMultiplayer.new()
	var host_root := Node.new()
	host_root.name = "HostRoot"
	root.add_child(host_root)
	host_mp.root_path = host_root.get_path()
	set_multiplayer(host_mp, host_root.get_path())
	host_root.add_child(host_net)
	assert(host_net.start_enet_server(port, 55123, false) == OK, "Failed to start ENet server")

	var client_a := MmoNetScript.new()
	client_a.name = "CaptainMmoNetwork"
	client_a.auto_start = false
	var mp_a := SceneMultiplayer.new()
	var root_a := Node.new()
	root_a.name = "ClientARoot"
	root.add_child(root_a)
	mp_a.root_path = root_a.get_path()
	set_multiplayer(mp_a, root_a.get_path())
	root_a.add_child(client_a)
	assert(client_a.start_enet_client("127.0.0.1", port, "CapA") == OK, "Client A failed")

	var client_b := MmoNetScript.new()
	client_b.name = "CaptainMmoNetwork"
	client_b.auto_start = false
	var mp_b := SceneMultiplayer.new()
	var root_b := Node.new()
	root_b.name = "ClientBRoot"
	root.add_child(root_b)
	mp_b.root_path = root_b.get_path()
	set_multiplayer(mp_b, root_b.get_path())
	root_b.add_child(client_b)
	assert(client_b.start_enet_client("127.0.0.1", port, "CapB") == OK, "Client B failed")

	var received_a: Array = []
	var hits_b: Array = []
	client_a.peer_event_received.connect(func(pid: String, ev: Dictionary) -> void: received_a.append({"pid": pid, "ev": ev}))
	client_b.incoming_hit_received.connect(func(from_id: String, p: Dictionary) -> void: hits_b.append({"from": from_id, "p": p}))

	for _i in 120:
		host_mp.poll()
		mp_a.poll()
		mp_b.poll()
		if client_a.connected and client_b.connected:
			break
		OS.delay_msec(15)
		await process_frame
	assert(client_a.connected and client_b.connected, "Both ENet clients should connect")

	# Place A and B near each other (within 1200px) and publish blueprint + hit
	client_a.publish_ship_blueprint(bp, {"x": 0.0, "y": 0.0, "vx": 10.0, "vy": 0.0, "rot": 0.0, "phase": "playing"})
	client_b.publish_ship_blueprint(bp, {"x": 400.0, "y": 100.0, "vx": -5.0, "vy": 0.0, "rot": PI, "phase": "playing"})
	for _i in 40:
		host_mp.poll()
		mp_a.poll()
		mp_b.poll()
		if received_a.size() >= 1 and client_a.get_nearby_peer_ids().has(client_b.local_peer_id):
			break
		OS.delay_msec(15)
		await process_frame
	assert(received_a.size() >= 1, "Client A should receive nearby Client B blueprint event")
	assert(client_a.get_nearby_peer_ids().has(client_b.local_peer_id), "Client B should be in Client A 2D AOI")

	# Direct hit RPC from A -> B
	client_a.publish_hit(client_b.local_peer_id, 14.0, Vector2(400.0, 100.0), "laser", {"x": 0.0, "y": 0.0})
	for _i in 40:
		host_mp.poll()
		mp_a.poll()
		mp_b.poll()
		if not hits_b.is_empty(): break
		OS.delay_msec(15)
		await process_frame
	assert(hits_b.size() >= 1, "Client B should receive incoming_hit RPC from Client A")

	# Move B outside 2D AOI (> 1300px) -> should be removed from A's nearby list
	client_b.publish_local_event("state", {"x": 5000.0, "y": 5000.0, "vx": 0.0, "vy": 0.0, "rot": 0.0, "phase": "playing"})
	for _i in 40:
		host_mp.poll()
		mp_a.poll()
		mp_b.poll()
		if client_a.get_nearby_peer_ids().is_empty(): break
		OS.delay_msec(15)
		await process_frame
	assert(client_a.get_nearby_peer_ids().is_empty(), "Client B outside 2D AOI should be evicted from Client A")
	assert(host_net.server_filtered_out >= 1, "Server should record AOI filtered-out events")

	client_a.shutdown()
	client_b.shutdown()
	host_net.shutdown()
	print("CAPTAIN_MMO_OK parts=%d bp=%d a_recv=%d b_hits=%d filtered=%d" % [
		15, bp.size(), received_a.size(), hits_b.size(), host_net.server_filtered_out
	])
	quit(0)
