class_name FgReplicationClient
extends RefCounted
## Iris 방식 클라이언트 복제 수신기 (로드맵 26 §4·§6).
## - 길이·magic·world_epoch·protocol_hash·필드 범위를 전부 검증한 뒤에만 적용한다(부분 적용 금지).
## - 수신 baseline 보관과 gameplay 적용 revision을 분리 관리한다.
## - last_applied_revision보다 오래된 패킷은 재적용하지 않고, tombstone된 세대 객체는 되살리지 않는다.
## - baseline 누락 delta 수신 시 full refresh를 요청하며 상태를 오염시키지 않는다.

const FgNetSchemaScript := preload("fg_net_schema.gd")
const FgStateStoreScript := preload("fg_state_store.gd")
const FgReplicationServerScript := preload("fg_replication_server.gd")

var schema: FgNetSchemaScript
var world_epoch: int = 1
var local_peer_id: int = 0

## obj_key -> {net_id, owner_peer_id, last_applied_revision, quantized: Dictionary, state: Dictionary, baselines: Dictionary, baseline_order: Array}
var objects: Dictionary = {}
## 영구 tombstone 기록: obj_key -> tombstone_revision (지연 패킷 재활성화 차단)
var tombstoned: Dictionary = {}
## 원자 상태 적용 알림 콜백(RepNotify 대응): func(key: String, changed_mask: int, revision: int, state: Dictionary)
var on_state_applied: Callable = Callable()

var stats: Dictionary = {
	"packets_received": 0,
	"full_applied": 0,
	"delta_applied": 0,
	"tombstones_applied": 0,
	"despawns_applied": 0,
	"stale_revision_dropped": 0,
	"tombstone_resurrection_blocked": 0,
	"baseline_misses": 0,
	"malformed_rejected": 0,
	"protocol_mismatch_rejected": 0,
	"epoch_mismatch_rejected": 0,
	"repnotify_calls": 0,
}

var _hash_prefix: PackedByteArray
var _outbound: Array = []


func _init(p_schema: FgNetSchemaScript, p_world_epoch: int = 1, p_local_peer_id: int = 0) -> void:
	schema = p_schema
	world_epoch = p_world_epoch
	local_peer_id = p_local_peer_id
	_hash_prefix = schema.protocol_hash_prefix_bytes()


func drain_outbound_packets() -> Array:
	var copy := _outbound.duplicate()
	_outbound.clear()
	return copy


func set_world_epoch(new_epoch: int) -> void:
	if new_epoch == world_epoch:
		return
	world_epoch = new_epoch
	objects.clear()
	tombstoned.clear()
	_outbound.clear()


func handle_server_packet(raw: PackedByteArray) -> Dictionary:
	stats.packets_received = int(stats.packets_received) + 1
	var hdr := FgReplicationServerScript.parse_header(raw)
	if not hdr.ok:
		stats.malformed_rejected = int(stats.malformed_rejected) + 1
		return hdr
	if int(hdr.world_epoch) != world_epoch:
		stats.epoch_mismatch_rejected = int(stats.epoch_mismatch_rejected) + 1
		return {"ok": false, "reason": "world_epoch_mismatch"}
	if hdr.hash_prefix != _hash_prefix:
		stats.protocol_mismatch_rejected = int(stats.protocol_mismatch_rejected) + 1
		return {"ok": false, "reason": "protocol_hash_mismatch"}

	var buf: StreamPeerBuffer = hdr.buf
	match int(hdr.msg_type):
		FgReplicationServerScript.MSG_SPAWN_OR_FULL:
			return _handle_spawn_or_full(buf)
		FgReplicationServerScript.MSG_DELTA:
			return _handle_delta(buf)
		FgReplicationServerScript.MSG_TOMBSTONE:
			return _handle_tombstone(buf)
		FgReplicationServerScript.MSG_DESPAWN_INTEREST:
			return _handle_despawn_interest(buf)

	stats.malformed_rejected = int(stats.malformed_rejected) + 1
	return {"ok": false, "reason": "unknown_server_msg_type"}


func _handle_spawn_or_full(buf: StreamPeerBuffer) -> Dictionary:
	if (buf.get_size() - buf.get_position()) < 20:
		stats.malformed_rejected = int(stats.malformed_rejected) + 1
		return {"ok": false, "reason": "truncated_full_header"}
	var idx := buf.get_u32()
	var gen := buf.get_u32()
	var owner_id := buf.get_u32()
	var rev := buf.get_u32()
	var field_mask := buf.get_u32()
	if rev == 0:
		stats.malformed_rejected = int(stats.malformed_rejected) + 1
		return {"ok": false, "reason": "zero_revision"}

	# 전체 필드를 임시 버퍼에 먼저 디코딩·검증한다(부분 적용 금지).
	var decoded_q := {}
	var known_mask := schema.field_mask_for_scope(true)
	if (field_mask & (~known_mask)) != 0:
		stats.malformed_rejected = int(stats.malformed_rejected) + 1
		return {"ok": false, "reason": "unknown_field_bits"}
	for fid in schema.field_ids_sorted:
		var def: Dictionary = schema.fields_by_id[fid]
		if (field_mask & int(def.bit)) == 0:
			continue
		var d := FgNetSchemaScript.decode_quantized_field(buf, def)
		if not d.ok:
			stats.malformed_rejected = int(stats.malformed_rejected) + 1
			return d
		decoded_q[fid] = d.value
	if buf.get_position() != buf.get_size():
		stats.malformed_rejected = int(stats.malformed_rejected) + 1
		return {"ok": false, "reason": "trailing_garbage"}

	var key := FgStateStoreScript.make_key(idx, gen)
	if tombstoned.has(key):
		stats.tombstone_resurrection_blocked = int(stats.tombstone_resurrection_blocked) + 1
		return {"ok": false, "reason": "tombstoned_object"}

	var obj: Dictionary
	if objects.has(key):
		obj = objects[key]
	else:
		obj = {
			"key": key,
			"net_id": {"index": idx, "generation": gen},
			"owner_peer_id": owner_id,
			"last_applied_revision": 0,
			"quantized": {},
			"state": {},
			"baselines": {},
			"baseline_order": [],
		}
		objects[key] = obj

	# 역순/지연 패킷: decoding baseline으로는 보관할 수 있으나 gameplay 적용은 되돌리지 않는다.
	_store_baseline(obj, rev, decoded_q)
	if rev <= int(obj.last_applied_revision):
		stats.stale_revision_dropped = int(stats.stale_revision_dropped) + 1
		_queue_storage_ack(idx, gen, rev, FgReplicationServerScript.ACK_FLAG_LIFECYCLE)
		return {"ok": true, "applied": false, "reason": "stale_revision"}

	obj.owner_peer_id = owner_id
	obj.quantized = decoded_q.duplicate(true)
	obj.last_applied_revision = rev
	_materialize_state(obj)
	stats.full_applied = int(stats.full_applied) + 1
	_emit_repnotify(key, field_mask, rev, obj.state)
	# 전체 검증·역직렬화·보관·적용 완료 후 ACK 송신
	_queue_storage_ack(idx, gen, rev, FgReplicationServerScript.ACK_FLAG_LIFECYCLE)
	return {"ok": true, "applied": true, "kind": "full", "key": key, "revision": rev}


func _handle_delta(buf: StreamPeerBuffer) -> Dictionary:
	if (buf.get_size() - buf.get_position()) < 20:
		stats.malformed_rejected = int(stats.malformed_rejected) + 1
		return {"ok": false, "reason": "truncated_delta_header"}
	var idx := buf.get_u32()
	var gen := buf.get_u32()
	var base_rev := buf.get_u32()
	var target_rev := buf.get_u32()
	var dirty_mask := buf.get_u32()
	if target_rev <= base_rev or base_rev == 0:
		stats.malformed_rejected = int(stats.malformed_rejected) + 1
		return {"ok": false, "reason": "invalid_delta_revisions"}

	var known_mask := schema.field_mask_for_scope(true)
	if (dirty_mask & (~known_mask)) != 0:
		stats.malformed_rejected = int(stats.malformed_rejected) + 1
		return {"ok": false, "reason": "unknown_delta_field_bits"}

	var patch_q := {}
	for fid in schema.field_ids_sorted:
		var def: Dictionary = schema.fields_by_id[fid]
		if (dirty_mask & int(def.bit)) == 0:
			continue
		var d := FgNetSchemaScript.decode_quantized_field(buf, def)
		if not d.ok:
			stats.malformed_rejected = int(stats.malformed_rejected) + 1
			return d
		patch_q[fid] = d.value
	if buf.get_position() != buf.get_size():
		stats.malformed_rejected = int(stats.malformed_rejected) + 1
		return {"ok": false, "reason": "trailing_garbage"}

	var key := FgStateStoreScript.make_key(idx, gen)
	if tombstoned.has(key):
		stats.tombstone_resurrection_blocked = int(stats.tombstone_resurrection_blocked) + 1
		return {"ok": false, "reason": "tombstoned_object"}

	if not objects.has(key):
		stats.baseline_misses = int(stats.baseline_misses) + 1
		_queue_full_refresh_req(idx, gen, base_rev)
		return {"ok": false, "reason": "missing_object_baseline"}

	var obj: Dictionary = objects[key]
	var baselines: Dictionary = obj.baselines
	if not baselines.has(base_rev):
		stats.baseline_misses = int(stats.baseline_misses) + 1
		_queue_full_refresh_req(idx, gen, base_rev)
		return {"ok": false, "reason": "missing_baseline_revision"}

	var reconstructed: Dictionary = (baselines[base_rev] as Dictionary).duplicate(true)
	for fid in patch_q:
		reconstructed[fid] = patch_q[fid]

	_store_baseline(obj, target_rev, reconstructed)
	if target_rev <= int(obj.last_applied_revision):
		stats.stale_revision_dropped = int(stats.stale_revision_dropped) + 1
		_queue_storage_ack(idx, gen, target_rev, FgReplicationServerScript.ACK_FLAG_LIFECYCLE)
		return {"ok": true, "applied": false, "reason": "stale_revision"}

	obj.quantized = reconstructed.duplicate(true)
	obj.last_applied_revision = target_rev
	_materialize_state(obj)
	stats.delta_applied = int(stats.delta_applied) + 1
	_emit_repnotify(key, dirty_mask, target_rev, obj.state)
	_queue_storage_ack(idx, gen, target_rev, FgReplicationServerScript.ACK_FLAG_LIFECYCLE)
	return {"ok": true, "applied": true, "kind": "delta", "key": key, "revision": target_rev}


func _handle_tombstone(buf: StreamPeerBuffer) -> Dictionary:
	if (buf.get_size() - buf.get_position()) != 12:
		stats.malformed_rejected = int(stats.malformed_rejected) + 1
		return {"ok": false, "reason": "invalid_tombstone_len"}
	var idx := buf.get_u32()
	var gen := buf.get_u32()
	var tomb_rev := buf.get_u32()
	var key := FgStateStoreScript.make_key(idx, gen)
	tombstoned[key] = maxi(int(tombstoned.get(key, 0)), tomb_rev)
	objects.erase(key)
	stats.tombstones_applied = int(stats.tombstones_applied) + 1
	_queue_storage_ack(idx, gen, tomb_rev, FgReplicationServerScript.ACK_FLAG_TOMBSTONE)
	return {"ok": true, "kind": "tombstone", "key": key, "revision": tomb_rev}


func _handle_despawn_interest(buf: StreamPeerBuffer) -> Dictionary:
	if (buf.get_size() - buf.get_position()) != 12:
		stats.malformed_rejected = int(stats.malformed_rejected) + 1
		return {"ok": false, "reason": "invalid_despawn_len"}
	var idx := buf.get_u32()
	var gen := buf.get_u32()
	var _rev := buf.get_u32()
	var key := FgStateStoreScript.make_key(idx, gen)
	objects.erase(key)
	stats.despawns_applied = int(stats.despawns_applied) + 1
	return {"ok": true, "kind": "despawn_interest", "key": key}


func _store_baseline(obj: Dictionary, rev: int, quantized_vals: Dictionary) -> void:
	var baselines: Dictionary = obj.baselines
	var order: Array = obj.baseline_order
	if not baselines.has(rev):
		order.append(rev)
	baselines[rev] = quantized_vals.duplicate(true)
	while order.size() > FgStateStoreScript.MAX_BASELINE_HISTORY:
		var evict := int(order.pop_front())
		baselines.erase(evict)


func _materialize_state(obj: Dictionary) -> void:
	var state := {}
	var q: Dictionary = obj.quantized
	for fid in q:
		var def: Dictionary = schema.fields_by_id[int(fid)]
		state[String(def.name)] = FgNetSchemaScript.dequantize_value(def, q[fid])
	obj.state = state


func _emit_repnotify(key: String, changed_mask: int, rev: int, state: Dictionary) -> void:
	stats.repnotify_calls = int(stats.repnotify_calls) + 1
	if on_state_applied.is_valid():
		on_state_applied.call(key, changed_mask, rev, state)


func _write_header(msg_type: int) -> StreamPeerBuffer:
	var buf := StreamPeerBuffer.new()
	buf.put_u8(FgReplicationServerScript.MAGIC_0)
	buf.put_u8(FgReplicationServerScript.MAGIC_1)
	buf.put_u8(msg_type)
	buf.put_u32(world_epoch)
	buf.put_data(_hash_prefix)
	return buf


func _queue_storage_ack(idx: int, gen: int, rev: int, flags: int) -> void:
	var buf := _write_header(FgReplicationServerScript.MSG_STORAGE_ACK)
	buf.put_u32(idx)
	buf.put_u32(gen)
	buf.put_u32(rev)
	buf.put_u8(flags)
	_outbound.append(buf.data_array)


func _queue_full_refresh_req(idx: int, gen: int, missing_base_rev: int) -> void:
	var buf := _write_header(FgReplicationServerScript.MSG_FULL_REFRESH_REQ)
	buf.put_u32(idx)
	buf.put_u32(gen)
	buf.put_u32(missing_base_rev)
	_outbound.append(buf.data_array)
