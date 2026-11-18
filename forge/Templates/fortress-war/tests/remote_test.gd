extends SceneTree

const EngineModel = preload("res://scripts/fort_engine.gd")
const Adapter = preload("res://scripts/fort_remote.gd")

var _failures: Array[String] = []


func _initialize() -> void:
	_owner_and_authority()
	_terrain_and_spectator()
	_snapshot_ordering()
	if _failures.is_empty():
		print("FORTRESS_WAR_REMOTE_OK")
		quit(0)
	else:
		for failure in _failures:
			printerr(failure)
		quit(1)


func _check(condition: bool, message: String) -> void:
	if not condition:
		_failures.append(message)


func _snapshot() -> Dictionary:
	var model = EngineModel.new({"control": "hotseat", "teamSize": 1, "opponentTank": "catapult"})
	model.state.tanks[0].tilt = 0
	model.state.tanks[0].x = 300
	model.state.tanks[0].y = 486
	var game = model.state.duplicate(true)
	for tank in game.tanks:
		tank.erase("def")
	return JSON.parse_string(JSON.stringify({"playerId": "blue", "state": {
		"id": "fortress-test", "phase": "playing", "game": game, "config": model.config,
		"players": [
			{"id": "blue", "team": 0, "spectator": false},
			{"id": "orange", "team": 1, "spectator": false},
			{"id": "watcher", "team": 0, "spectator": true},
		],
		"terrain": {"version": 1, "runs": [[900000, 1800], [901800, 1800]]},
		"logs": [{"seq": 1, "event": "explosion", "x": 420, "y": 500, "radius": 50}],
	}}))


func _owner_and_authority() -> void:
	var requests: Array = []
	var events: Array = []
	var remote = Adapter.new(func(request): requests.append(request), func(event): events.append(event))
	var payload = _snapshot()
	_check(remote.receive_snapshot(payload), "Initial room snapshot")
	_check(remote.connected and remote.is_human_turn() and remote.active().uid == "t0_0", "Connected team owns the active tank")
	_check(remote.active().def.weapons.size() == 2 and remote.config.teamSize == 1, "Catalog hydrates JSON tank and match settings")
	_check(events.size() == 1 and events[0].type == "explosion", "Authoritative visual event")
	var time = remote.state.timeLeft
	var x = remote.active().x
	for i in 18:
		remote.set_power(i)
		remote.tick(0.05)
	_check(requests.is_empty(), "Local charge sends no input spam")
	_check(remote.state.timeLeft == time and remote.active().x == x, "Tick leaves authoritative timer and position unchanged")
	for i in 9:
		remote.set_angle(36 + i)
		remote.move(1, 0.02)
		remote.tick(0.02)
	_check(requests.size() == 2, "Movement and aim throttle individual streams to 10 Hz")
	if requests.size() == 2:
		_check(requests[0].action == "move" and is_equal_approx(requests[0].dt, 0.1), "Movement sends elapsed bounded budget")
		_check(requests[1].action == "aim" and requests[1].seq == 2, "Aim packets use incrementing sequence")
	_check(remote.active().x == x and not remote.set_paused(true), "Movement and pause leave authority with room")
	_check(remote.receive_snapshot(payload) and remote.active().angle == 44 and remote.state.power == 17, "Same-turn snapshots retain local aim and charge")
	_check(events.size() == 1, "Snapshot replay does not repeat visual events")
	_check(remote.fire() and not remote.fire(), "Only one terminal action pending")
	if not requests.is_empty():
		var shot = requests.back()
		_check(shot.action == "fire" and shot.turnNumber == 1 and shot.angle == 44 and shot.power == 17
			and shot.face == 1 and shot.weaponIndex == 0, "Fire carries claimed turn and complete local aim")
	_check(remote.state.phase == "aim" and remote.state.projectiles.is_empty(), "Fire waits for server simulation")
	payload.state.game.turnNumber = 2
	payload.state.game.activeId = "t1_0"
	payload.state.game.simTime = 2.0
	payload.state.terrain = null
	_check(remote.receive_snapshot(payload) and not remote.is_human_turn() and not remote.skip(), "New remote turn discards local controls")
	remote.disconnect_from_room()
	_check(not remote.connected and not remote.fire(), "Disconnected client cannot send")


func _terrain_and_spectator() -> void:
	var requests: Array = []
	var remote = Adapter.new(func(request): requests.append(request))
	var payload = _snapshot()
	payload.playerId = "watcher"
	_check(remote.receive_snapshot(payload) and not remote.is_human_turn(), "Spectator receives a view without team ownership")
	_check(not remote.move(1, 0.1) and not remote.set_angle(45) and not remote.use_item("double") and requests.is_empty(), "Spectator cannot send actions")
	_check(remote.terrain.mask[900000] == 1 and remote.terrain.mask[899999] == 0
		and remote.terrain.solidCount == 3600, "Row-major terrain RLE")
	payload.state.terrain = {"version": 2, "runs": [[900001, 1]]}
	_check(remote.receive_snapshot(payload) and remote.terrain.version == 2 and remote.terrain.mask[900000] == 0
		and remote.terrain.mask[900001] == 1 and remote.terrain.solidCount == 1, "Terrain delta replaces mask by version")
	payload.state.terrain = {"version": 3, "runs": [[900001, 1500000]]}
	_check(not remote.receive_snapshot(payload) and remote.terrain.version == 2, "Malformed runs do not replace terrain")


func _snapshot_ordering() -> void:
	var remote = Adapter.new(func(_request): pass)
	var payload = _snapshot()
	payload.state.serverTime = 1000
	payload.state.game.simTime = 5
	_check(remote.receive_snapshot(payload), "Initial snapshot establishes room ordering")
	remote.set_angle(44)

	var stale = payload.duplicate(true)
	stale.state.serverTime = 999
	stale.state.game.simTime = 6
	stale.playerId = "watcher"
	_check(not remote.receive_snapshot(stale) and remote.is_human_turn(), "Older server timestamp preserves ownership")
	stale.state.serverTime = 1001
	stale.state.game.simTime = 4
	_check(not remote.receive_snapshot(stale) and remote.active().angle == 44, "Older simulation time preserves local aim")

	stale = payload.duplicate(true)
	stale.state.game = null
	stale.state.phase = "countdown"
	_check(not remote.receive_snapshot(stale) and remote.state.simTime == 5, "Delayed countdown cannot clear a live board")
	payload.state.game.simTime = 6
	_check(remote.receive_snapshot(payload) and remote.state.simTime == 6, "Equal server timestamps can advance state")

	payload.state.id = "second-room"
	payload.state.serverTime = 900
	payload.state.game.simTime = 0
	payload.state.terrain.runs = [[900001, 1]]
	_check(remote.receive_snapshot(payload) and remote.state.simTime == 0 and remote.terrain.solidCount == 1,
		"New room may use lower timestamps and the same terrain version")
