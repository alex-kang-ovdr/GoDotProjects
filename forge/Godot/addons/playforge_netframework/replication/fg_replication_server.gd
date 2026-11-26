class_name FgReplicationServer
extends RefCounted
## Iris 방식 서버 복제 엔진 (로드맵 26 §3·§4·§6·§7·§8).
## - 상태 저장소(FgStateStore)의 불변 양자화 스냅샷을 연결별로 필터링·우선순위 정렬해 송신한다.
## - 연결별 baseline은 수신 측의 상태 보관 ACK(MSG_STORAGE_ACK)로만 전진한다.
## - 송신 기록에 없는 future revision ACK는 거절한다.
## - owner 전용 필드는 비권한 연결의 바이트 스트림에 절대 인코딩하지 않는다.

const FgNetSchemaScript := preload("fg_net_schema.gd")
const FgStateStoreScript := preload("fg_state_store.gd")
const FgInterestFilterScript := preload("fg_interest_filter.gd")

const MAGIC_0 := 0x50 # 'P'
const MAGIC_1 := 0x46 # 'F'
const HEADER_SIZE := 15

const MSG_SPAWN_OR_FULL := 1
const MSG_DELTA := 2
const MSG_TOMBSTONE := 3
const MSG_DESPAWN_INTEREST := 4
const MSG_STORAGE_ACK := 5
const MSG_FULL_REFRESH_REQ := 6

const ACK_FLAG_LIFECYCLE := 1
const ACK_FLAG_TOMBSTONE := 2

var store: FgStateStoreScript
var filter: FgInterestFilterScript
var schema: FgNetSchemaScript
var budget_bytes_per_tick: int = 6400
var max_datagram_bytes: int = FgNetSchemaScript.MAX_DATAGRAM_PAYLOAD

## conn_id -> {relevant: Dictionary(key -> ConnObjState), pending_tombstones: Dictionary(key -> TombEntry), bytes_sent, packets_sent}
var connections: Dictionary = {}
var stats: Dictionary = {
	"full_sent": 0,
	"delta_sent": 0,
	"tombstones_sent": 0,
	"despawns_sent": 0,
	"acks_accepted": 0,
	"forged_acks_rejected": 0,
	"refresh_requests": 0,
	"malformed_inbound": 0,
	"bytes_sent": 0,
	"budget_deferred": 0,
	"dormant_skipped": 0,
}

var _hash_prefix: PackedByteArray
var _mask_public: int = 0
var _mask_owner: int = 0


func _init(p_store: FgStateStoreScript, p_filter: FgInterestFilterScript = null) -> void:
	store = p_store
	schema = p_store.schema
	filter = p_filter if p_filter != null else FgInterestFilterScript.new()
	_hash_prefix = schema.protocol_hash_prefix_bytes()
	_mask_public = schema.field_mask_for_scope(false)
	_mask_owner = schema.field_mask_for_scope(true)


func add_connection(conn_id: int) -> void:
	if connections.has(conn_id):
		return
	connections[conn_id] = {
		"relevant": {},
		"pending_tombstones": {},
		"bytes_sent": 0,
		"packets_sent": 0,
	}


func remove_connection(conn_id: int) -> void:
	connections.erase(conn_id)
	filter.remove_connection(conn_id)


func notify_destroyed(key: String) -> void:
	if not store.tombstones.has(key):
		return
	var tomb: Dictionary = store.tombstones[key]
	for conn_id in connections:
		var cstate: Dictionary = connections[conn_id]
		if (cstate.relevant as Dictionary).has(key):
			(cstate.relevant as Dictionary).erase(key)
			cstate.pending_tombstones[key] = {
				"net_id": tomb.net_id.duplicate(),
				"tombstone_revision": int(tomb.tombstone_revision),
				"sent_count": 0,
			}


## 서버 1 tick의 복제 패킷을 생성한다. 반환: conn_id -> Array[PackedByteArray]
func build_packets_for_tick(server_tick: int) -> Dictionary:
	store.capture_tick(server_tick)
	# 새로 파괴된 객체가 관련 연결에 아직 pending_tombstones로 등록되지 않았으면 보강
	for tomb_key in store.tombstones:
		var tomb: Dictionary = store.tombstones[tomb_key]
		for conn_id in connections:
			var cstate: Dictionary = connections[conn_id]
			if (cstate.relevant as Dictionary).has(tomb_key):
				(cstate.relevant as Dictionary).erase(tomb_key)
				cstate.pending_tombstones[tomb_key] = {
					"net_id": tomb.net_id.duplicate(),
					"tombstone_revision": int(tomb.tombstone_revision),
					"sent_count": 0,
				}

	var out: Dictionary = {}
	for conn_id in connections:
		out[conn_id] = _build_for_connection(int(conn_id), server_tick)
	return out


func _build_for_connection(conn_id: int, server_tick: int) -> Array:
	var cstate: Dictionary = connections[conn_id]
	var rel: Dictionary = cstate.relevant
	var packets: Array = []
	var used_bytes := 0

	# 1) Tombstone(수명 파괴)는 최우선으로 송신한다(plans/26 §8: destroy를 무조건 버리지 않음).
	for tkey in (cstate.pending_tombstones as Dictionary).keys():
		var tomb: Dictionary = cstate.pending_tombstones[tkey]
		var pkt := _encode_tombstone(tomb.net_id, int(tomb.tombstone_revision))
		if used_bytes + pkt.size() <= budget_bytes_per_tick or packets.is_empty():
			packets.append(pkt)
			used_bytes += pkt.size()
			tomb.sent_count = int(tomb.sent_count) + 1
			stats.tombstones_sent = int(stats.tombstones_sent) + 1
			stats.bytes_sent = int(stats.bytes_sent) + pkt.size()
			cstate.bytes_sent = int(cstate.bytes_sent) + pkt.size()
			cstate.packets_sent = int(cstate.packets_sent) + 1

	# 2) 관심 영역(AOI/Owner) 판정: 이탈 객체 despawn, 신규 진입 객체 등록
	for obj_key in rel.keys().duplicate():
		if not store.objects.has(obj_key):
			rel.erase(obj_key)
			continue
		var rec: Dictionary = store.objects[obj_key]
		if not filter.is_relevant(conn_id, rec, true):
			var dpkt := _encode_despawn_interest(rec.net_id, int(rec.current_revision))
			rel.erase(obj_key)
			packets.append(dpkt)
			used_bytes += dpkt.size()
			stats.despawns_sent = int(stats.despawns_sent) + 1
			stats.bytes_sent = int(stats.bytes_sent) + dpkt.size()
			cstate.bytes_sent = int(cstate.bytes_sent) + dpkt.size()
			cstate.packets_sent = int(cstate.packets_sent) + 1

	# 3) 전송 후보 수집 및 우선순위 정렬
	var candidates: Array = []
	for obj_key in store.objects:
		var rec: Dictionary = store.objects[obj_key]
		if not bool(rec.alive):
			continue
		var was_rel := rel.has(obj_key)
		if not filter.is_relevant(conn_id, rec, was_rel):
			continue
		if not was_rel:
			rel[obj_key] = {
				"acked_baseline_rev": 0,
				"synced_server_rev": 0,
				"last_sent_rev": 0,
				"last_sent_tick": -1,
				"lifecycle_acked": false,
				"force_full": true,
				"last_owner_scoped": int(rec.owner_peer_id) == conn_id,
				"sent_revisions": {},
			}
		var cobj: Dictionary = rel[obj_key]
		var is_owner := int(rec.owner_peer_id) == conn_id
		if bool(cobj.last_owner_scoped) != is_owner:
			cobj.last_owner_scoped = is_owner
			cobj.force_full = true
			cobj.acked_baseline_rev = 0
			cobj.synced_server_rev = 0

		var cur_rev := int(rec.current_revision)
		var synced_rev := int(cobj.synced_server_rev)

		# Dormancy: 고정 객체가 이미 동기화 완료된 연결에는 0바이트(단, late join/재진입은 synced_rev==0이므로 전송됨)
		if bool(rec.dormant) and synced_rev == cur_rev and bool(cobj.lifecycle_acked) and not bool(cobj.force_full):
			stats.dormant_skipped = int(stats.dormant_skipped) + 1
			continue

		if synced_rev == cur_rev and bool(cobj.lifecycle_acked) and not bool(cobj.force_full):
			continue

		var prio := filter.compute_priority(conn_id, rec, cobj, server_tick)
		candidates.append({"key": obj_key, "priority": prio})

	candidates.sort_custom(func(a: Dictionary, b: Dictionary) -> bool: return float(a.priority) > float(b.priority))

	# 4) 예산 안에서 Full 또는 Delta 인코딩
	for item in candidates:
		var obj_key := String(item.key)
		var rec: Dictionary = store.objects[obj_key]
		var cobj: Dictionary = rel[obj_key]
		var cur_rev := int(rec.current_revision)
		var acked_rev := int(cobj.acked_baseline_rev)
		var is_owner := int(rec.owner_peer_id) == conn_id
		var allowed_mask := _mask_owner if is_owner else _mask_public

		var pkt := PackedByteArray()
		var is_full := bool(cobj.force_full) or acked_rev <= 0 or not bool(cobj.lifecycle_acked)
		if not is_full:
			var diff := store.diff_mask_between(rec, acked_rev, cur_rev, allowed_mask)
			if not bool(diff.has_baseline):
				# bounded baseline history 초과: 오래된 기준 재사용 대신 full refresh
				is_full = true
			else:
				var dirty_mask := int(diff.dirty_mask)
				if dirty_mask == 0:
					# 이 연결의 권한 범위에서는 변경 없음(예: 비권한 연결에게 owner 필드만 바뀐 경우).
					# 클라이언트가 실제 보관한 acked_baseline_rev는 유지하고 synced_server_rev만 전진한다.
					cobj.synced_server_rev = cur_rev
					continue
				pkt = _encode_delta(rec, acked_rev, cur_rev, dirty_mask)

		if is_full:
			pkt = _encode_spawn_or_full(rec, cur_rev, allowed_mask)

		if pkt.is_empty():
			continue
		if pkt.size() > max_datagram_bytes:
			continue
		if used_bytes + pkt.size() > budget_bytes_per_tick and not packets.is_empty():
			stats.budget_deferred = int(stats.budget_deferred) + 1
			continue

		packets.append(pkt)
		used_bytes += pkt.size()
		cobj.last_sent_rev = cur_rev
		cobj.last_sent_tick = server_tick
		cobj.force_full = false
		(cobj.sent_revisions as Dictionary)[cur_rev] = true
		# sent_revisions 크기 상한 유지
		if (cobj.sent_revisions as Dictionary).size() > FgStateStoreScript.MAX_BASELINE_HISTORY * 2:
			var revs := (cobj.sent_revisions as Dictionary).keys()
			revs.sort()
			while revs.size() > FgStateStoreScript.MAX_BASELINE_HISTORY * 2:
				(cobj.sent_revisions as Dictionary).erase(revs.pop_front())
		if is_full:
			stats.full_sent = int(stats.full_sent) + 1
		else:
			stats.delta_sent = int(stats.delta_sent) + 1
		stats.bytes_sent = int(stats.bytes_sent) + pkt.size()
		cstate.bytes_sent = int(cstate.bytes_sent) + pkt.size()
		cstate.packets_sent = int(cstate.packets_sent) + 1

	return packets


## 클라이언트 → 서버 ACK / Full Refresh 요청 처리
func handle_client_packet(conn_id: int, raw: PackedByteArray) -> Dictionary:
	if not connections.has(conn_id):
		return {"ok": false, "reason": "unknown_connection"}
	var hdr := parse_header(raw)
	if not hdr.ok:
		stats.malformed_inbound = int(stats.malformed_inbound) + 1
		return hdr
	if int(hdr.world_epoch) != store.world_epoch:
		stats.malformed_inbound = int(stats.malformed_inbound) + 1
		return {"ok": false, "reason": "world_epoch_mismatch"}
	if hdr.hash_prefix != _hash_prefix:
		stats.malformed_inbound = int(stats.malformed_inbound) + 1
		return {"ok": false, "reason": "protocol_hash_mismatch"}

	var buf: StreamPeerBuffer = hdr.buf
	var msg_type := int(hdr.msg_type)
	var cstate: Dictionary = connections[conn_id]

	if msg_type == MSG_STORAGE_ACK:
		if (buf.get_size() - buf.get_position()) < 13:
			stats.malformed_inbound = int(stats.malformed_inbound) + 1
			return {"ok": false, "reason": "truncated_ack"}
		var idx := buf.get_u32()
		var gen := buf.get_u32()
		var rev := buf.get_u32()
		var flags := buf.get_u8()
		var key := FgStateStoreScript.make_key(idx, gen)
		if (flags & ACK_FLAG_TOMBSTONE) != 0:
			if (cstate.pending_tombstones as Dictionary).has(key):
				var tomb: Dictionary = cstate.pending_tombstones[key]
				if rev == int(tomb.tombstone_revision):
					(cstate.pending_tombstones as Dictionary).erase(key)
					stats.acks_accepted = int(stats.acks_accepted) + 1
					return {"ok": true, "kind": "tombstone_ack", "key": key}
			stats.forged_acks_rejected = int(stats.forged_acks_rejected) + 1
			return {"ok": false, "reason": "invalid_tombstone_ack"}

		var rel: Dictionary = cstate.relevant
		if not rel.has(key):
			stats.forged_acks_rejected = int(stats.forged_acks_rejected) + 1
			return {"ok": false, "reason": "ack_for_untracked_object"}
		var cobj: Dictionary = rel[key]
		# 송신 기록에 없는 future/임의 revision ACK는 거절한다(plans/26 §6).
		if not (cobj.sent_revisions as Dictionary).has(rev):
			stats.forged_acks_rejected = int(stats.forged_acks_rejected) + 1
			return {"ok": false, "reason": "forged_future_or_unsent_revision"}
		if rev > int(cobj.acked_baseline_rev):
			cobj.acked_baseline_rev = rev
		if rev > int(cobj.synced_server_rev):
			cobj.synced_server_rev = rev
		if (flags & ACK_FLAG_LIFECYCLE) != 0:
			cobj.lifecycle_acked = true
		stats.acks_accepted = int(stats.acks_accepted) + 1
		return {"ok": true, "kind": "storage_ack", "key": key, "revision": rev}

	if msg_type == MSG_FULL_REFRESH_REQ:
		if (buf.get_size() - buf.get_position()) < 12:
			stats.malformed_inbound = int(stats.malformed_inbound) + 1
			return {"ok": false, "reason": "truncated_refresh_req"}
		var idx := buf.get_u32()
		var gen := buf.get_u32()
		var _missing_rev := buf.get_u32()
		var key := FgStateStoreScript.make_key(idx, gen)
		var rel: Dictionary = cstate.relevant
		if rel.has(key):
			rel[key].force_full = true
			rel[key].acked_baseline_rev = 0
			rel[key].synced_server_rev = 0
		stats.refresh_requests = int(stats.refresh_requests) + 1
		return {"ok": true, "kind": "full_refresh_req", "key": key}

	stats.malformed_inbound = int(stats.malformed_inbound) + 1
	return {"ok": false, "reason": "unexpected_client_msg_type"}


func _write_header(msg_type: int) -> StreamPeerBuffer:
	var buf := StreamPeerBuffer.new()
	buf.put_u8(MAGIC_0)
	buf.put_u8(MAGIC_1)
	buf.put_u8(msg_type)
	buf.put_u32(store.world_epoch)
	buf.put_data(_hash_prefix)
	return buf


func _encode_spawn_or_full(rec: Dictionary, rev: int, allowed_mask: int) -> PackedByteArray:
	var snap: Dictionary = rec.history[rev]
	var vals: Dictionary = snap.values
	var buf := _write_header(MSG_SPAWN_OR_FULL)
	buf.put_u32(int(rec.net_id.index))
	buf.put_u32(int(rec.net_id.generation))
	buf.put_u32(int(rec.owner_peer_id))
	buf.put_u32(rev)
	buf.put_u32(allowed_mask)
	for fid in schema.field_ids_sorted:
		var def: Dictionary = schema.fields_by_id[fid]
		if (allowed_mask & int(def.bit)) == 0:
			continue
		if not FgNetSchemaScript.encode_quantized_field(buf, def, vals[fid]):
			return PackedByteArray()
	return buf.data_array


func _encode_delta(rec: Dictionary, baseline_rev: int, target_rev: int, dirty_mask: int) -> PackedByteArray:
	var snap: Dictionary = rec.history[target_rev]
	var vals: Dictionary = snap.values
	var buf := _write_header(MSG_DELTA)
	buf.put_u32(int(rec.net_id.index))
	buf.put_u32(int(rec.net_id.generation))
	buf.put_u32(baseline_rev)
	buf.put_u32(target_rev)
	buf.put_u32(dirty_mask)
	for fid in schema.field_ids_sorted:
		var def: Dictionary = schema.fields_by_id[fid]
		if (dirty_mask & int(def.bit)) == 0:
			continue
		if not FgNetSchemaScript.encode_quantized_field(buf, def, vals[fid]):
			return PackedByteArray()
	return buf.data_array


func _encode_tombstone(net_id: Dictionary, tomb_rev: int) -> PackedByteArray:
	var buf := _write_header(MSG_TOMBSTONE)
	buf.put_u32(int(net_id.index))
	buf.put_u32(int(net_id.generation))
	buf.put_u32(tomb_rev)
	return buf.data_array


func _encode_despawn_interest(net_id: Dictionary, rev: int) -> PackedByteArray:
	var buf := _write_header(MSG_DESPAWN_INTEREST)
	buf.put_u32(int(net_id.index))
	buf.put_u32(int(net_id.generation))
	buf.put_u32(rev)
	return buf.data_array


static func parse_header(raw: PackedByteArray) -> Dictionary:
	if raw.size() < HEADER_SIZE or raw.size() > FgNetSchemaScript.MAX_DATAGRAM_PAYLOAD:
		return {"ok": false, "reason": "invalid_packet_size"}
	if raw[0] != MAGIC_0 or raw[1] != MAGIC_1:
		return {"ok": false, "reason": "bad_magic"}
	var buf := StreamPeerBuffer.new()
	buf.data_array = raw
	buf.seek(2)
	var msg_type := buf.get_u8()
	var epoch := buf.get_u32()
	var hres := buf.get_data(8)
	if int(hres[0]) != OK:
		return {"ok": false, "reason": "header_hash_read_failed"}
	return {
		"ok": true,
		"msg_type": msg_type,
		"world_epoch": epoch,
		"hash_prefix": hres[1] as PackedByteArray,
		"buf": buf,
	}
