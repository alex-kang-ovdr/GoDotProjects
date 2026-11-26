class_name NetWorld
extends Node2D
## 서버·클라이언트 공통 복제 트리.
##   World
##     GameState (NetGameState + Sync)
##     Players            ← PlayerSpawner.spawn_path
##       Player_<idx>_g<gen>
##         PlayerState (NetPlayerState)
##         Controller  (NetPlayerController)
##         Pawn        (NetPawn)
##         Sync        (MultiplayerSynchronizer, 서버 권한)
##     PlayerSpawner (MultiplayerSpawner, spawn_function)
## GameMode는 이 트리 밖(서버 전용)에 둔다.

const NetGameStateScript := preload("net_game_state.gd")
const NetPlayerStateScript := preload("net_player_state.gd")
const NetPlayerControllerScript := preload("net_player_controller.gd")
const NetPawnScript := preload("net_pawn.gd")
const NetProfilerScript := preload("net_profiler.gd")

signal player_spawned(root: Node)

var game_state: NetGameStateScript
var players: Node
var spawner: MultiplayerSpawner
var net_profiler: NetProfilerScript
## Local process mode for game rules; deliberately excluded from network replication.
var _net_mode: String = ""

const PLAYER_COLORS := [Color("#65c8ff"), Color("#ff8c68"), Color("#b1e879"), Color("#d69cff")]


func _process(_dt: float) -> void:
	if DisplayServer.get_name() != "headless":
		queue_redraw()


func _draw() -> void:
	if DisplayServer.get_name() == "headless":
		return
	var arena := Rect2(Vector2.ZERO, Vector2(800, 800))
	draw_rect(arena, Color("#17212d"), true)
	draw_rect(arena, Color("#65788b"), false, 3.0)
	draw_rect(Rect2(300, 0, 120, 800), Color(0.9, 0.22, 0.2, 0.18), true)
	draw_line(Vector2(300, 0), Vector2(300, 800), Color("#ff716c"), 2.0)
	draw_line(Vector2(420, 0), Vector2(420, 800), Color("#ff716c"), 2.0)
	for player in players.get_children():
		var ps: NetPlayerStateScript = player.get_node_or_null("PlayerState")
		var pawn: NetPawnScript = player.get_node_or_null("Pawn")
		if ps == null or pawn == null:
			continue
		var color: Color = PLAYER_COLORS[posmod(ps.slot, PLAYER_COLORS.size())]
		draw_circle(pawn.position, 16.0, color)
		draw_arc(pawn.position, 19.0, 0.0, TAU, 32, Color.WHITE, 2.0)
		draw_string(ThemeDB.fallback_font, pawn.position + Vector2(-22, -25), "P%d  HP %d" % [ps.slot + 1, pawn.health], HORIZONTAL_ALIGNMENT_LEFT, -1, 14, Color.WHITE)
	draw_string(ThemeDB.fallback_font, Vector2(18, 28), "%s  tick %d  players %d" % [game_state.phase, game_state.server_tick, players.get_child_count()], HORIZONTAL_ALIGNMENT_LEFT, -1, 16, Color.WHITE)


func _ready() -> void:
	game_state = NetGameStateScript.new()
	game_state.name = "GameState"
	add_child(game_state)
	players = Node.new()
	players.name = "Players"
	add_child(players)
	spawner = MultiplayerSpawner.new()
	spawner.name = "PlayerSpawner"
	spawner.spawn_path = NodePath("../Players")
	spawner.spawn_function = _build_player
	spawner.spawned.connect(func(node: Node) -> void: player_spawned.emit(node))
	add_child(spawner)


func configure_net_mode(mode: String) -> void:
	_net_mode = mode


func configure_profiler(profiler: NetProfilerScript) -> void:
	net_profiler = profiler


func get_net_mode() -> String:
	return _net_mode


## spawn data: {slot, user, peer, x, y, net_index, net_gen, health}
func _build_player(data: Variant) -> Node:
	var d: Dictionary = data
	var root := Node.new()
	root.name = "Player_%d_g%d" % [int(d.net_index), int(d.net_gen)]
	var ps := NetPlayerStateScript.new()
	ps.name = "PlayerState"
	ps.slot = int(d.slot)
	ps.user_id = String(d.user)
	ps.peer_id = int(d.peer)
	ps.owner_epoch = int(d.get("owner_epoch", 1))
	root.add_child(ps)
	var ctrl := NetPlayerControllerScript.new()
	ctrl.name = "Controller"
	ctrl.owner_peer_id = int(d.peer)
	ctrl.owner_epoch = ps.owner_epoch
	ctrl.set_net_profiler(net_profiler)
	root.add_child(ctrl)
	var pawn := NetPawnScript.new()
	pawn.name = "Pawn"
	pawn.position = Vector2(float(d.x), float(d.y))
	pawn.health = int(d.health)
	pawn.net_index = int(d.net_index)
	pawn.net_generation = int(d.net_gen)
	root.add_child(pawn)
	var sync := MultiplayerSynchronizer.new()
	sync.name = "Sync"
	sync.root_path = NodePath("..")
	sync.replication_interval = 1.0 / 30.0
	var cfg := SceneReplicationConfig.new()
	_add(cfg, "Pawn:position", SceneReplicationConfig.REPLICATION_MODE_ALWAYS)
	_add(cfg, "Pawn:health", SceneReplicationConfig.REPLICATION_MODE_ON_CHANGE)
	_add(cfg, "PlayerState:peer_id", SceneReplicationConfig.REPLICATION_MODE_ON_CHANGE)
	_add(cfg, "PlayerState:owner_epoch", SceneReplicationConfig.REPLICATION_MODE_ON_CHANGE)
	_add(cfg, "PlayerState:score", SceneReplicationConfig.REPLICATION_MODE_ON_CHANGE)
	_add(cfg, "PlayerState:acked_input_seq", SceneReplicationConfig.REPLICATION_MODE_ON_CHANGE)
	sync.replication_config = cfg
	root.add_child(sync)
	return root


func find_player_by_peer(peer_id: int) -> Node:
	for child in players.get_children():
		var ps: NetPlayerStateScript = child.get_node_or_null("PlayerState")
		if ps != null and ps.peer_id == peer_id:
			return child
	return null


func find_player_by_slot(slot: int) -> Node:
	for child in players.get_children():
		var ps: NetPlayerStateScript = child.get_node_or_null("PlayerState")
		if ps != null and ps.slot == slot:
			return child
	return null


## 현재 이 peer가 보고 있는 상태(서버면 권위 상태). 수렴 비교용.
func snapshot() -> Dictionary:
	var list: Array = []
	for child in players.get_children():
		if child.is_queued_for_deletion():
			continue
		var ps: NetPlayerStateScript = child.get_node_or_null("PlayerState")
		var pawn: NetPawnScript = child.get_node_or_null("Pawn")
		if ps == null or pawn == null:
			continue
		list.append({
			"slot": ps.slot,
			"user": ps.user_id,
			"peer": ps.peer_id,
			"ownerEpoch": ps.owner_epoch,
			"netId": [pawn.net_index, pawn.net_generation],
			"pos": [snappedf(pawn.position.x, 0.001), snappedf(pawn.position.y, 0.001)],
			"health": pawn.health,
			"ackedSeq": ps.acked_input_seq,
		})
	list.sort_custom(func(a: Dictionary, b: Dictionary) -> bool: return int(a.slot) < int(b.slot))
	return {
		"phase": game_state.phase,
		"serverTick": game_state.server_tick,
		"playTick": game_state.play_tick,
		"worldKey": game_state.world_key,
		"playerPeers": Array(game_state.player_peers),
		"players": list,
	}


static func _add(cfg: SceneReplicationConfig, path: String, mode: int) -> void:
	var np := NodePath(path)
	cfg.add_property(np)
	cfg.property_set_spawn(np, true)
	cfg.property_set_replication_mode(np, mode)
