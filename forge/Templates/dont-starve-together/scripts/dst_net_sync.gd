class_name DSTNetSync
extends RefCounted

## Don't Starve Together M3 멀티플레이어 협동 동기화 프로토타입 (09_multiplayer_netcode_shards.md).
## 원작 3채널 아키텍처(ismastersim 권위 시뮬 + 19필드 경량 Replica + 소유자 전용 Classified) 및
## 2~6인 협동 룸(동시 채집·보스 공동 타격·유령화·고백 심장 동료 부활·전원 유령 120s 리셋)을 구현한다.

const REPLICA_FIELD_COUNT: int = 19

var sim: DSTWorldSim
var tick_seq: int = 0
var peers: Dictionary = {} # peer_id(int) -> Dictionary
var all_ghost_reset_timer: float = -1.0
var transport_mode: String = "local" # local | enet | websocket
var active_peer: MultiplayerPeer = null


func create_enet_host(port: int = 10999, max_clients: int = 6) -> Dictionary:
	var enet: ENetMultiplayerPeer = ENetMultiplayerPeer.new()
	var err: Error = enet.create_server(port, max_clients)
	if err == OK:
		active_peer = enet
		transport_mode = "enet"
	return {"ok": err == OK, "mode": "enet", "port": port, "error": err}


func create_websocket_host(port: int = 10998) -> Dictionary:
	var ws: WebSocketMultiplayerPeer = WebSocketMultiplayerPeer.new()
	var err: Error = ws.create_server(port)
	if err == OK:
		active_peer = ws
		transport_mode = "websocket"
	return {"ok": err == OK, "mode": "websocket", "port": port, "error": err}


func close_transport() -> void:
	if active_peer != null:
		active_peer.close()
		active_peer = null
	transport_mode = "local"


func init_coop_room(world_sim: DSTWorldSim, host_char: String = "wilson") -> void:
	sim = world_sim
	tick_seq = 0
	peers.clear()
	all_ghost_reset_timer = -1.0
	join_peer(1, host_char, Vector2.ZERO)


func join_peer(peer_id: int, char_id: String = "wilson", spawn_pos: Vector2 = Vector2.ZERO) -> Dictionary:
	var cdef: Dictionary = sim.db.data["characters"].get(char_id, sim.db.data["characters"]["wilson"])
	var p: Dictionary = {
		"peer_id": peer_id,
		"char_id": char_id,
		"pos": spawn_pos,
		"facing": Vector2(1.0, 0.0),
		"shard": sim.shard,
		"max_health": float(cdef["health"]),
		"health": float(cdef["health"]),
		"health_penalty": 0.0,
		"hunger": float(cdef["hunger"]),
		"sanity": float(cdef["sanity"]),
		"is_ghost": false,
		"on_boat": false,
		"equip_hands": "",
		"equip_head": "",
		"equip_body": "",
		"inventory": {"log": 2, "cutgrass": 4, "telltale_heart": 1},
		"insight_points": 3,
	}
	peers[peer_id] = p
	return p


func step_coop(dt: float, peer_inputs: Dictionary = {}) -> Dictionary:
	tick_seq += 1
	for pid_v in peers.keys():
		var pid: int = int(pid_v)
		var p: Dictionary = peers[pid]
		var mv: Vector2 = peer_inputs.get(pid, Vector2.ZERO)
		if mv.length_squared() > 0.001:
			var dir: Vector2 = mv.normalized()
			p["facing"] = dir
			var spd: float = 7.5 if bool(p["is_ghost"]) else 6.0
			var next_p: Vector2 = p["pos"] + dir * spd * dt
			if next_p.length() <= 53.0:
				p["pos"] = next_p

	# 전원 유령화 120초 세계 리셋 카운트다운 (gamemodes.lua:208)
	var all_ghost: bool = peers.size() > 0
	for p in peers.values():
		if not bool(p["is_ghost"]):
			all_ghost = false
			break
	if all_ghost:
		if all_ghost_reset_timer < 0.0:
			all_ghost_reset_timer = float(sim.db.data["survival"]["world_reset_time"])
		else:
			all_ghost_reset_timer = max(0.0, all_ghost_reset_timer - dt)
	else:
		all_ghost_reset_timer = -1.0

	return encode_replica_snapshot()


func damage_peer(peer_id: int, amount: float) -> bool:
	if not peers.has(peer_id):
		return false
	var p: Dictionary = peers[peer_id]
	if bool(p["is_ghost"]):
		return false
	p["health"] = max(0.0, float(p["health"]) - amount)
	if float(p["health"]) <= 0.0:
		p["is_ghost"] = true
	return true


func revive_peer_with_heart(healer_id: int, target_id: int) -> bool:
	if not peers.has(healer_id) or not peers.has(target_id):
		return false
	var healer: Dictionary = peers[healer_id]
	var target: Dictionary = peers[target_id]
	if bool(healer["is_ghost"]) or not bool(target["is_ghost"]):
		return false
	var inv: Dictionary = healer["inventory"]
	if int(inv.get("telltale_heart", 0)) <= 0:
		return false
	inv["telltale_heart"] = int(inv["telltale_heart"]) - 1
	target["is_ghost"] = false
	var max_pen: float = float(sim.db.data["survival"]["max_health_penalty"])
	var rev_pen: float = float(sim.db.data["survival"]["revive_health_penalty"])
	target["health_penalty"] = clamp(float(target["health_penalty"]) + rev_pen, 0.0, max_pen)
	target["health"] = float(target["max_health"]) * (1.0 - float(target["health_penalty"]))
	all_ghost_reset_timer = -1.0
	return true


func peer_attack_boss(peer_id: int, damage: float) -> bool:
	if not peers.has(peer_id) or bool(peers[peer_id]["is_ghost"]):
		return false
	var boss: Dictionary = sim.get_active_boss()
	if boss.is_empty():
		return false
	boss["hp"] = max(0.0, float(boss["hp"]) - damage)
	return true


## 19필드 경량 공개 Replica 스냅샷 (클라이언트 전체 브로드캐스트용)
func encode_replica_snapshot() -> Dictionary:
	var peer_reps: Array = []
	for p in peers.values():
		peer_reps.append({
			"id": int(p["peer_id"]),
			"char": str(p["char_id"]),
			"x": snapped(float(p["pos"].x), 0.01),
			"z": snapped(float(p["pos"].y), 0.01),
			"fx": snapped(float(p["facing"].x), 0.01),
			"fz": snapped(float(p["facing"].y), 0.01),
			"shard": str(p["shard"]),
			"ghost": bool(p["is_ghost"]),
			"boat": bool(p["on_boat"]),
			"hands": str(p["equip_hands"]),
			"head": str(p["equip_head"]),
			"body": str(p["equip_body"]),
		})
	var boss: Dictionary = sim.get_active_boss()
	return {
		"tick": tick_seq,
		"day": sim.day,
		"season": sim.get_season_name(),
		"phase": sim.phase,
		"moon": sim.moon_phase,
		"nightmare": sim.nightmare_phase,
		"reset_cd": all_ghost_reset_timer,
		"boss_id": str(boss.get("kind", "")),
		"boss_hp": float(boss.get("hp", 0.0)),
		"peers": peer_reps,
	}


## 소유자 전용 Classified 채널 (타 플레이어에게 비공개되는 개인 인벤토리/생존 수치)
func encode_classified_snapshot(peer_id: int) -> Dictionary:
	if not peers.has(peer_id):
		return {}
	var p: Dictionary = peers[peer_id]
	return {
		"owner_peer_id": peer_id,
		"health": float(p["health"]),
		"max_health": float(p["max_health"]),
		"health_penalty": float(p["health_penalty"]),
		"hunger": float(p["hunger"]),
		"sanity": float(p["sanity"]),
		"inventory": p["inventory"].duplicate(true),
		"insight_points": int(p["insight_points"]),
	}
