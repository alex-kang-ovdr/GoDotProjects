class_name FgStateStore
extends RefCounted
## Iris 방식 불변 양자화 상태 저장소 (로드맵 26 §3·§6·§7).
## - "상태 캡처 dirty"와 "연결별 전달 필요"를 분리한다.
## - 서버 주 스레드에서 tick당 한 번 캡처·양자화한 불변 버퍼를 모든 연결이 공유한다.
## - bounded baseline history, dormancy, tombstone/generation 격리를 관리한다.

const NetIdsScript := preload("../runtime/net_ids.gd")
const FgNetSchemaScript := preload("fg_net_schema.gd")

const MAX_BASELINE_HISTORY := 16

var world_epoch: int = 1
var schema: FgNetSchemaScript
var allocator := NetIdsScript.ObjectIdAllocator.new()

## obj_key ("<index>:<gen>") -> ObjectRecord Dictionary
var objects: Dictionary = {}
## 파괴 완료 tombstone 저장소 ("<index>:<gen>" -> {net_id, tombstone_revision, destroyed_tick, owner_peer_id})
var tombstones: Dictionary = {}
## 이번 tick에 캡처가 필요한 객체 키 집합
var _capture_dirty_keys: Dictionary = {}


func _init(p_schema: FgNetSchemaScript, p_world_epoch: int = 1) -> void:
	schema = p_schema
	world_epoch = p_world_epoch


static func make_key(index: int, generation: int) -> String:
	return "%d:%d" % [index, generation]


func register_object(initial_values: Dictionary, owner_peer_id: int = 0, priority: float = 1.0, visibility: String = "relevant", server_tick: int = 0) -> Dictionary:
	var net_id := allocator.allocate()
	var key := make_key(int(net_id.index), int(net_id.generation))
	var quantized := {}
	var full_mask := 0
	for fid in schema.field_ids_sorted:
		var def: Dictionary = schema.fields_by_id[fid]
		var fname := String(def.name)
		var raw_val: Variant = initial_values.get(fname, _default_for_type(String(def.type)))
		var q := schema.quantize_value(def, raw_val)
		if not q.ok:
			allocator.release(net_id)
			return {"ok": false, "reason": q.reason, "field": fname}
		quantized[fid] = q.value
		full_mask |= int(def.bit)

	var pos: Vector2 = initial_values.get("position", Vector2.ZERO) if initial_values.get("position", Vector2.ZERO) is Vector2 else Vector2.ZERO
	var snap := {
		"revision": 1,
		"tick": server_tick,
		"dirty_mask": full_mask,
		"values": quantized.duplicate(true),
	}
	var rec := {
		"key": key,
		"net_id": net_id,
		"owner_peer_id": owner_peer_id,
		"priority": priority,
		"visibility": visibility, # "relevant" | "owner_only"
		"position": pos,
		"alive": true,
		"dormant": false,
		"dormant_since_tick": -1,
		"current_revision": 1,
		"tombstone_revision": 0,
		"pending_values": quantized.duplicate(true),
		"pending_dirty_mask": 0,
		"history": {1: snap},
		"history_order": [1],
		"last_changed_tick": server_tick,
	}
	objects[key] = rec
	return {"ok": true, "net_id": net_id, "key": key, "revision": 1}


func set_field(net_id: Dictionary, field_name: String, raw_val: Variant) -> Dictionary:
	var key := make_key(int(net_id.get("index", -1)), int(net_id.get("generation", -1)))
	if not objects.has(key):
		return {"ok": false, "reason": "unknown_or_destroyed_object"}
	var rec: Dictionary = objects[key]
	if not bool(rec.alive):
		return {"ok": false, "reason": "object_tombstoned"}
	if not schema.fields_by_name.has(field_name):
		return {"ok": false, "reason": "unknown_field"}
	var def: Dictionary = schema.fields_by_name[field_name]
	var q := schema.quantize_value(def, raw_val)
	if not q.ok:
		return q
	var fid := int(def.id)
	var prev: Variant = rec.pending_values.get(fid, null)
	if FgNetSchemaScript.quantized_equal(prev, q.value):
		return {"ok": true, "changed": false}
	rec.pending_values[fid] = q.value
	rec.pending_dirty_mask = int(rec.pending_dirty_mask) | int(def.bit)
	if field_name == "position" and raw_val is Vector2:
		rec.position = raw_val
	# 상태 변경 시 수면 중인 객체를 즉시 각성시킨다(plans/26 §7).
	if bool(rec.dormant):
		rec.dormant = false
		rec.dormant_since_tick = -1
	_capture_dirty_keys[key] = true
	return {"ok": true, "changed": true}


func set_owner(net_id: Dictionary, new_owner_peer_id: int) -> bool:
	var key := make_key(int(net_id.get("index", -1)), int(net_id.get("generation", -1)))
	if not objects.has(key):
		return false
	var rec: Dictionary = objects[key]
	if int(rec.owner_peer_id) == new_owner_peer_id:
		return true
	rec.owner_peer_id = new_owner_peer_id
	# owner 변경은 wake 조건이며 owner 전용 필드 재동기화가 필요하다.
	rec.dormant = false
	rec.dormant_since_tick = -1
	var owner_mask := schema.field_mask_for_scope(true) & (~schema.field_mask_for_scope(false))
	rec.pending_dirty_mask = int(rec.pending_dirty_mask) | owner_mask
	_capture_dirty_keys[key] = true
	return true


func set_dormant(net_id: Dictionary, is_dormant: bool, server_tick: int = 0) -> bool:
	var key := make_key(int(net_id.get("index", -1)), int(net_id.get("generation", -1)))
	if not objects.has(key):
		return false
	var rec: Dictionary = objects[key]
	if not bool(rec.alive):
		return false
	rec.dormant = is_dormant
	rec.dormant_since_tick = server_tick if is_dormant else -1
	return true


## keyed_collection 인벤토리 항목 원자 갱신/제거(tombstone 포함).
func apply_inventory_change(net_id: Dictionary, item_id: String, qty: int, remove: bool = false) -> Dictionary:
	var key := make_key(int(net_id.get("index", -1)), int(net_id.get("generation", -1)))
	if not objects.has(key):
		return {"ok": false, "reason": "unknown_object"}
	if not schema.fields_by_name.has("inventory"):
		return {"ok": false, "reason": "no_inventory_field"}
	var rec: Dictionary = objects[key]
	var def: Dictionary = schema.fields_by_name["inventory"]
	var current: Dictionary = rec.pending_values.get(int(def.id), {"transaction_revision": 0, "items": {}}).duplicate(true)
	var items: Dictionary = current.get("items", {})
	var prev_entry: Dictionary = items.get(item_id, {"qty": 0, "entry_revision": 0, "tombstone": false})
	var next_entry_rev := int(prev_entry.get("entry_revision", 0)) + 1
	items[item_id] = {
		"qty": 0 if remove else qty,
		"entry_revision": next_entry_rev,
		"tombstone": remove,
	}
	current["transaction_revision"] = int(current.get("transaction_revision", 0)) + 1
	current["items"] = items
	return set_field(net_id, "inventory", current)


## tick당 한 번 불변 스냅샷으로 커밋한다. 캡처 dirty는 여기서 지워도 연결별 미전송 revision은 history에 보존된다.
func capture_tick(server_tick: int) -> int:
	var captured := 0
	var keys := _capture_dirty_keys.keys()
	_capture_dirty_keys.clear()
	for k in keys:
		if not objects.has(k):
			continue
		var rec: Dictionary = objects[k]
		if not bool(rec.alive):
			continue
		var dirty_mask := schema.expand_atomic_mask(int(rec.pending_dirty_mask))
		if dirty_mask == 0:
			continue
		var next_rev := int(rec.current_revision) + 1
		var snap := {
			"revision": next_rev,
			"tick": server_tick,
			"dirty_mask": dirty_mask,
			"values": (rec.pending_values as Dictionary).duplicate(true),
		}
		rec.current_revision = next_rev
		rec.last_changed_tick = server_tick
		rec.pending_dirty_mask = 0
		var hist: Dictionary = rec.history
		var order: Array = rec.history_order
		hist[next_rev] = snap
		order.append(next_rev)
		while order.size() > MAX_BASELINE_HISTORY:
			var evicted := int(order.pop_front())
			hist.erase(evicted)
		captured += 1
	return captured


func destroy_object(net_id: Dictionary, server_tick: int) -> Dictionary:
	var key := make_key(int(net_id.get("index", -1)), int(net_id.get("generation", -1)))
	if not objects.has(key):
		return {"ok": false, "reason": "unknown_object"}
	var rec: Dictionary = objects[key]
	if not bool(rec.alive):
		return {"ok": false, "reason": "already_destroyed"}
	var tomb_rev := int(rec.current_revision) + 1
	rec.alive = false
	rec.dormant = false # 수면 중 파괴도 즉시 통지 대상으로 깨운다.
	rec.current_revision = tomb_rev
	rec.tombstone_revision = tomb_rev
	_capture_dirty_keys.erase(key)
	tombstones[key] = {
		"key": key,
		"net_id": rec.net_id.duplicate(),
		"tombstone_revision": tomb_rev,
		"destroyed_tick": server_tick,
		"owner_peer_id": int(rec.owner_peer_id),
	}
	objects.erase(key)
	allocator.release(net_id)
	return {"ok": true, "tombstone_revision": tomb_rev, "key": key}


## baseline_rev → target_rev 사이에 변경된 필드 마스크를 불변 스냅샷 비교로 계산한다.
func diff_mask_between(rec: Dictionary, baseline_rev: int, target_rev: int, allowed_mask: int) -> Dictionary:
	var hist: Dictionary = rec.history
	if not hist.has(baseline_rev) or not hist.has(target_rev):
		return {"has_baseline": false, "dirty_mask": 0}
	var base_vals: Dictionary = hist[baseline_rev].values
	var tgt_vals: Dictionary = hist[target_rev].values
	var mask := 0
	for fid in schema.field_ids_sorted:
		var bit := int(schema.fields_by_id[fid].bit)
		if (allowed_mask & bit) == 0:
			continue
		if not FgNetSchemaScript.quantized_equal(base_vals.get(fid), tgt_vals.get(fid)):
			mask |= bit
	mask = schema.expand_atomic_mask(mask) & allowed_mask
	return {"has_baseline": true, "dirty_mask": mask}


static func _default_for_type(t: String) -> Variant:
	match t:
		FgNetSchemaScript.FIELD_VEC2_CELL:
			return Vector2.ZERO
		FgNetSchemaScript.FIELD_ANGLE_U16:
			return 0.0
		FgNetSchemaScript.FIELD_U16, FgNetSchemaScript.FIELD_I32:
			return 0
		FgNetSchemaScript.FIELD_BOOL:
			return false
		FgNetSchemaScript.FIELD_STRING:
			return ""
		FgNetSchemaScript.FIELD_KEYED_COLLECTION:
			return {"transaction_revision": 0, "items": {}}
	return null
