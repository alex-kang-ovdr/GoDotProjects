class_name FgReplicationBridge
extends Node
## SceneMultiplayer.send_bytes / peer_packet 위에 FgReplicationServer·FgReplicationClient를 연결하는 라이브 어댑터.
## - Godot 기본 MultiplayerSynchronizer와 동시에 같은 필드를 쓰지 않도록 별도 채널(REPLICATION_CHANNEL)과
##   독립 상태 저장소를 사용한다(plans/25 §4, plans/26 §3).

const FgNetSchemaScript := preload("fg_net_schema.gd")
const FgStateStoreScript := preload("fg_state_store.gd")
const FgInterestFilterScript := preload("fg_interest_filter.gd")
const FgReplicationServerScript := preload("fg_replication_server.gd")
const FgReplicationClientScript := preload("fg_replication_client.gd")

const REPLICATION_CHANNEL := 2

var smp: SceneMultiplayer
var is_server_mode: bool = false
var schema: FgNetSchemaScript
var store: FgStateStoreScript
var filter: FgInterestFilterScript
var server_engine: FgReplicationServerScript
var client_engine: FgReplicationClientScript


func setup_server(p_smp: SceneMultiplayer, p_schema: FgNetSchemaScript, p_world_epoch: int = 1, p_filter: FgInterestFilterScript = null) -> void:
	smp = p_smp
	is_server_mode = true
	schema = p_schema
	store = FgStateStoreScript.new(schema, p_world_epoch)
	filter = p_filter if p_filter != null else FgInterestFilterScript.new()
	server_engine = FgReplicationServerScript.new(store, filter)
	if not smp.peer_packet.is_connected(_on_peer_packet):
		smp.peer_packet.connect(_on_peer_packet)
	if not smp.peer_connected.is_connected(_on_peer_connected):
		smp.peer_connected.connect(_on_peer_connected)
	if not smp.peer_disconnected.is_connected(_on_peer_disconnected):
		smp.peer_disconnected.connect(_on_peer_disconnected)


func setup_client(p_smp: SceneMultiplayer, p_schema: FgNetSchemaScript, p_world_epoch: int = 1, p_local_peer_id: int = 0) -> void:
	smp = p_smp
	is_server_mode = false
	schema = p_schema
	client_engine = FgReplicationClientScript.new(schema, p_world_epoch, p_local_peer_id)
	if not smp.peer_packet.is_connected(_on_peer_packet):
		smp.peer_packet.connect(_on_peer_packet)


func flush_server_tick(server_tick: int) -> Dictionary:
	if not is_server_mode or server_engine == null or smp == null:
		return {}
	var per_conn := server_engine.build_packets_for_tick(server_tick)
	var sent_counts := {}
	for conn_id in per_conn:
		var pkts: Array = per_conn[conn_id]
		var n := 0
		for raw in pkts:
			var err := smp.send_bytes(raw as PackedByteArray, int(conn_id), MultiplayerPeer.TRANSFER_MODE_UNRELIABLE, REPLICATION_CHANNEL)
			if err == OK:
				n += 1
		sent_counts[conn_id] = n
	return sent_counts


func flush_client_outbound() -> int:
	if is_server_mode or client_engine == null or smp == null:
		return 0
	var pkts := client_engine.drain_outbound_packets()
	var n := 0
	for raw in pkts:
		var err := smp.send_bytes(raw as PackedByteArray, 1, MultiplayerPeer.TRANSFER_MODE_UNRELIABLE, REPLICATION_CHANNEL)
		if err == OK:
			n += 1
	return n


func _on_peer_connected(peer_id: int) -> void:
	if is_server_mode and server_engine != null:
		server_engine.add_connection(peer_id)


func _on_peer_disconnected(peer_id: int) -> void:
	if is_server_mode and server_engine != null:
		server_engine.remove_connection(peer_id)


func _on_peer_packet(peer_id: int, packet: PackedByteArray) -> void:
	if packet.size() < 2 or packet[0] != FgReplicationServerScript.MAGIC_0 or packet[1] != FgReplicationServerScript.MAGIC_1:
		return
	if is_server_mode:
		server_engine.handle_client_packet(peer_id, packet)
	else:
		if peer_id != 1:
			return
		client_engine.handle_server_packet(packet)
		flush_client_outbound()
