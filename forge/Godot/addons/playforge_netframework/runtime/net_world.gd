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

signal player_spawned(root: Node)

var game_state: NetGameStateScript
var players: Node
var spawner: MultiplayerSpawner


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
	root.add_child(ps)
	var ctrl := NetPlayerControllerScript.new()
	ctrl.name = "Controller"
	ctrl.owner_peer_id = int(d.peer)
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
