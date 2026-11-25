class_name NetProfiler
extends Node
## ENet 통계의 유일한 pop_statistic 소비자. 누적값과 측정 구간 rates를 프로세스별로 제공한다.

const NetEventLogScript := preload("net_event_log.gd")
const SCHEMA := "playforge.netprofile.v1"

const ENET_METRICS := {
	"sentBytes": ENetConnection.HOST_TOTAL_SENT_DATA,
	"receivedBytes": ENetConnection.HOST_TOTAL_RECEIVED_DATA,
	"sentPackets": ENetConnection.HOST_TOTAL_SENT_PACKETS,
	"receivedPackets": ENetConnection.HOST_TOTAL_RECEIVED_PACKETS,
}

var event_log: NetEventLogScript
var role: String = ""
var net_mode: String = ""
var interval_sec: float = 1.0
var enabled: bool = false

var _peer: ENetMultiplayerPeer
var _multiplayer_api: MultiplayerAPI
var _engine_rpc_profile_enabled: bool = false
var _totals: Dictionary = {"sentBytes": 0, "receivedBytes": 0, "sentPackets": 0, "receivedPackets": 0}
var _rpc_totals: Dictionary = {}
var _last_rpc_totals: Dictionary = {}
var _last_engine_rpc_profile: Dictionary = {}
var _last_sample_us: int = 0
var _sample_seq: int = 0
var _next_sample_us: int = 0
var _output: FileAccess
var _latest: Dictionary = {}


func configure(p_log: NetEventLogScript, p_role: String, sample_interval_sec: float = 1.0, output_path: String = "", p_net_mode: String = "") -> void:
	event_log = p_log
	role = p_role
	net_mode = p_net_mode if not p_net_mode.is_empty() else p_role
	interval_sec = maxf(0.1, sample_interval_sec)
	if not output_path.is_empty():
		var parent := output_path.get_base_dir()
		if parent != ".":
			DirAccess.make_dir_recursive_absolute(ProjectSettings.globalize_path(parent))
		_output = FileAccess.open(output_path, FileAccess.WRITE)
		if _output == null:
			push_warning("Cannot write net profile output: %s" % output_path)


func attach_peer(peer: MultiplayerPeer) -> void:
	_peer = peer as ENetMultiplayerPeer
	_last_sample_us = Time.get_ticks_usec()
	_next_sample_us = _last_sample_us + int(interval_sec * 1000000.0)


func attach_multiplayer_api(api: MultiplayerAPI, profile_enabled: bool = false) -> void:
	_multiplayer_api = api
	if profile_enabled:
		_enable_engine_rpc_profile()


func start_periodic() -> void:
	enabled = true
	_enable_engine_rpc_profile()
	if _last_sample_us == 0:
		_last_sample_us = Time.get_ticks_usec()
	_next_sample_us = _last_sample_us + int(interval_sec * 1000000.0)


func stop_periodic() -> void:
	enabled = false


func _process(_delta: float) -> void:
	if not enabled:
		return
	var now := Time.get_ticks_usec()
	if now >= _next_sample_us:
		capture_snapshot("periodic")


func record_rpc_sent(method_name: StringName) -> void:
	_record_rpc(method_name, "sent")


func record_rpc_received(method_name: StringName) -> void:
	_record_rpc(method_name, "received")


func _record_rpc(method_name: StringName, direction: String) -> void:
	if _engine_rpc_profile_enabled:
		return
	var key := String(method_name)
	if not _rpc_totals.has(key):
		_rpc_totals[key] = {"sent": 0, "received": 0}
	_rpc_totals[key][direction] = int(_rpc_totals[key][direction]) + 1


## 샘플링/pop은 이 함수 한 곳에서만 수행한다. 명령창의 netprofile/stat net도 이 API를 호출한다.
func capture_snapshot(reason: String = "manual") -> Dictionary:
	var now := Time.get_ticks_usec()
	var elapsed_us := maxi(1, now - _last_sample_us) if _last_sample_us > 0 else 1
	var enet: Dictionary = {}
	var host: ENetConnection = _peer.host if _peer != null else null
	for metric_name in ENET_METRICS:
		var delta := int(host.pop_statistic(int(ENET_METRICS[metric_name]))) if host != null else 0
		_totals[metric_name] = int(_totals[metric_name]) + delta
		var unit := "bytes" if metric_name.ends_with("Bytes") else "packets"
		enet[metric_name] = _rate_entry(delta, int(_totals[metric_name]), elapsed_us, unit)

	var rpc := _rpc_snapshot(elapsed_us)

	_sample_seq += 1
	var sample := {
		"schema": SCHEMA,
		"sampleSeq": _sample_seq,
		"reason": reason,
		"role": role,
		"netMode": net_mode,
		"sampledAtMs": Time.get_ticks_msec(),
		"windowMs": float(elapsed_us) / 1000.0,
		"enet": enet,
		"rpc": rpc,
		"rpcSource": "engine" if _engine_rpc_profile_enabled else "wrapper_fallback",
	}
	_latest = sample
	_last_sample_us = now
	_next_sample_us = now + int(interval_sec * 1000000.0)
	if event_log != null:
		event_log.emit("net_profile_sample", sample)
	if _output != null:
		_output.store_line(JSON.stringify(sample))
		_output.flush()
	return sample


func latest_snapshot() -> Dictionary:
	return _latest.duplicate(true)


func handle_command(command: String) -> String:
	var normalized := command.strip_edges().to_lower()
	if normalized == "netprofile" or normalized == "stat net":
		_enable_engine_rpc_profile()
		var sample := capture_snapshot("console")
		return format_snapshot(sample)
	if normalized.begins_with("netemulation."):
		return handle_net_emulation(command.strip_edges())
	return "Unknown network profile command: %s" % command


func format_snapshot(sample: Dictionary) -> String:
	var enet: Dictionary = sample.get("enet", {})
	var sent_bytes: Dictionary = enet.get("sentBytes", {})
	var received_bytes: Dictionary = enet.get("receivedBytes", {})
	var sent_packets: Dictionary = enet.get("sentPackets", {})
	var received_packets: Dictionary = enet.get("receivedPackets", {})
	var lines := [
		"NetProfile #%d · %s · %.0f ms" % [int(sample.get("sampleSeq", 0)), String(sample.get("netMode", "")), float(sample.get("windowMs", 0.0))],
		"ENet TX %.1f B/s · %.1f packets/s | RX %.1f B/s · %.1f packets/s" % [
			float(sent_bytes.get("perSec", 0.0)), float(sent_packets.get("perSec", 0.0)),
			float(received_bytes.get("perSec", 0.0)), float(received_packets.get("perSec", 0.0)),
		],
	]
	var rpc: Dictionary = sample.get("rpc", {})
	var methods: Array = rpc.keys()
	methods.sort()
	for method_name in methods:
		var method_stats: Dictionary = rpc[method_name]
		var sent: Dictionary = method_stats.get("sent", {})
		var received: Dictionary = method_stats.get("received", {})
		var method_sent_bytes: Dictionary = method_stats.get("sent_bytes", {})
		var method_received_bytes: Dictionary = method_stats.get("received_bytes", {})
		var byte_rate := ""
		if method_stats.has("sent_bytes"):
			byte_rate = " · %.1f B/s out / %.1f B/s in" % [float(method_sent_bytes.get("perSec", 0.0)), float(method_received_bytes.get("perSec", 0.0))]
		lines.append("RPC %s · sent %.1f/s (%d) · recv %.1f/s (%d)%s" % [
			String(method_name), float(sent.get("perSec", 0.0)), int(sent.get("total", 0)),
			float(received.get("perSec", 0.0)), int(received.get("total", 0)),
			byte_rate,
		])
	return "\n".join(lines)


func _enable_engine_rpc_profile() -> void:
	if _engine_rpc_profile_enabled or _multiplayer_api == null:
		return
	if not _multiplayer_api.has_method("set_rpc_profiling_enabled") or not _multiplayer_api.has_method("get_rpc_profile"):
		return
	_multiplayer_api.call("set_rpc_profiling_enabled", true)
	_engine_rpc_profile_enabled = true


func _rpc_snapshot(elapsed_us: int) -> Dictionary:
	if _engine_rpc_profile_enabled:
		return _engine_rpc_snapshot(elapsed_us)
	var fallback: Dictionary = {}
	for method_name in _rpc_totals:
		var current: Dictionary = _rpc_totals[method_name]
		var previous: Dictionary = _last_rpc_totals.get(method_name, {"sent": 0, "received": 0})
		var directions: Dictionary = {}
		for direction in ["sent", "received"]:
			var total := int(current[direction])
			var delta := total - int(previous[direction])
			directions[direction] = _rate_entry(delta, total, elapsed_us, "calls")
		fallback[method_name] = directions
		_last_rpc_totals[method_name] = current.duplicate()
	return fallback


func _engine_rpc_snapshot(elapsed_us: int) -> Dictionary:
	var raw: Variant = _multiplayer_api.call("get_rpc_profile")
	if not (raw is Dictionary):
		return {}
	var result: Dictionary = {}
	for method_name in raw:
		var current: Dictionary = raw[method_name]
		var previous: Dictionary = _last_engine_rpc_profile.get(method_name, {})
		var stats: Dictionary = {}
		for key in ["sent", "received", "sent_bytes", "received_bytes"]:
			var total := int(current.get(key, 0))
			var delta := total - int(previous.get(key, 0))
			stats[key] = _rate_entry(delta, total, elapsed_us, "bytes" if key.ends_with("_bytes") else "calls")
		result[String(method_name)] = stats
		_last_engine_rpc_profile[method_name] = current.duplicate()
	return result


func handle_net_emulation(command: String) -> String:
	if _peer == null or _peer.host == null:
		return "NetEmulation unavailable: ENet peer is not active"
	var host: Object = _peer.host
	if not host.has_method("get_debug_packet_simulation"):
		return "NetEmulation unsupported by this engine build"
	var simulation: Variant
	if command.to_lower() == "netemulation.status":
		simulation = host.call("get_debug_packet_simulation")
	else:
		if not host.has_method("apply_debug_packet_command"):
			return "NetEmulation commands unsupported by this engine build"
		var applied: Variant = host.call("apply_debug_packet_command", command)
		simulation = host.call("get_debug_packet_simulation")
		return JSON.stringify({"command": command, "applied": applied, "simulation": simulation})
	return JSON.stringify({"command": command, "simulation": simulation})


func _rate_entry(delta: int, total: int, elapsed_us: int, count_name: String = "") -> Dictionary:
	var per_sec := float(delta) * 1000000.0 / float(elapsed_us)
	if count_name.is_empty():
		return {"delta": delta, "total": total, "perSec": per_sec}
	return {"delta": delta, "total": total, "perSec": per_sec, "unit": count_name}
