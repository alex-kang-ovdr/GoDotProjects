class_name FgNetSchema
extends RefCounted
## Iris 방식 상태 복제 스키마·양자화·프로토콜 해시·안전 바이너리 코덱 (로드맵 26 §3·§5·§8).
## - 공용 코어는 게임 데이터를 하드코딩하지 않으며, 프로젝트별 스키마를 등록해 사용한다.
## - 절대 좌표를 임의로 자르지 않고 cell-relative(i32 cell + u16 local offset) 양자화를 사용한다.
## - 수신 바이트는 길이·범위·NaN/Inf·컬렉션 상한을 먼저 검증하며, 유효하지 않으면 부분 적용하지 않는다.

const SERIALIZER_VERSION := 1
const MAX_DATAGRAM_PAYLOAD := 1000
const CELL_SIZE := 64.0
const MAX_STRING_BYTES := 256
const MAX_COLLECTION_ITEMS := 128

const FIELD_VEC2_CELL := "vec2_cell_relative"
const FIELD_ANGLE_U16 := "angle_u16"
const FIELD_U16 := "u16"
const FIELD_I32 := "i32"
const FIELD_BOOL := "bool"
const FIELD_STRING := "string"
const FIELD_KEYED_COLLECTION := "keyed_collection"

const SCOPE_RELEVANT := "relevant"
const SCOPE_OWNER := "owner"

var schema_id: String = ""
var version: int = 1
var fields_by_id: Dictionary = {}   # int -> Dictionary
var fields_by_name: Dictionary = {} # String -> Dictionary
var field_ids_sorted: Array[int] = []
var atomic_groups: Array = []
var max_collection_items: int = MAX_COLLECTION_ITEMS
var _protocol_hash: String = ""


func _init(p_schema_id: String, p_version: int = 1, p_max_collection_items: int = MAX_COLLECTION_ITEMS) -> void:
	schema_id = p_schema_id
	version = p_version
	max_collection_items = clampi(p_max_collection_items, 1, 512)


func add_field(id: int, field_name: String, field_type: String, scope: String = SCOPE_RELEVANT, opts: Dictionary = {}) -> Dictionary:
	if id < 1 or id > 30:
		return {"ok": false, "reason": "field_id_out_of_range"}
	if fields_by_id.has(id) or fields_by_name.has(field_name):
		return {"ok": false, "reason": "duplicate_field"}
	if scope != SCOPE_RELEVANT and scope != SCOPE_OWNER:
		return {"ok": false, "reason": "invalid_scope"}
	var def := {
		"id": id,
		"bit": 1 << (id - 1),
		"name": field_name,
		"type": field_type,
		"scope": scope,
		"cell_size": float(opts.get("cell_size", CELL_SIZE)),
		"max_bytes": int(opts.get("max_bytes", MAX_STRING_BYTES)),
		"max_items": int(opts.get("max_items", max_collection_items)),
	}
	fields_by_id[id] = def
	fields_by_name[field_name] = def
	field_ids_sorted.append(id)
	field_ids_sorted.sort()
	_protocol_hash = ""
	return {"ok": true, "field": def}


func add_atomic_group(ids: Array) -> Dictionary:
	var scopes := {}
	var group: Array[int] = []
	for raw_id in ids:
		var fid := int(raw_id)
		if not fields_by_id.has(fid):
			return {"ok": false, "reason": "unknown_field_in_atomic_group"}
		scopes[String(fields_by_id[fid].scope)] = true
		group.append(fid)
	# owner 전용 필드가 공개 atomic group에 섞이는 것을 스키마 단계에서 차단한다(plans/26 §7).
	if scopes.size() > 1:
		return {"ok": false, "reason": "mixed_scope_in_atomic_group"}
	group.sort()
	atomic_groups.append(group)
	_protocol_hash = ""
	return {"ok": true}


func field_mask_for_scope(include_owner: bool) -> int:
	var mask := 0
	for fid in field_ids_sorted:
		var def: Dictionary = fields_by_id[fid]
		if def.scope == SCOPE_RELEVANT or (include_owner and def.scope == SCOPE_OWNER):
			mask |= int(def.bit)
	return mask


func expand_atomic_mask(dirty_mask: int) -> int:
	var expanded := dirty_mask
	for group in atomic_groups:
		var group_mask := 0
		for fid in group:
			group_mask |= int(fields_by_id[int(fid)].bit)
		if (expanded & group_mask) != 0:
			expanded |= group_mask
	return expanded


func compute_protocol_hash() -> String:
	if not _protocol_hash.is_empty():
		return _protocol_hash
	var canonical_fields: Array = []
	for fid in field_ids_sorted:
		var f: Dictionary = fields_by_id[fid]
		canonical_fields.append({
			"id": int(f.id),
			"name": String(f.name),
			"type": String(f.type),
			"scope": String(f.scope),
			"cell_size": snappedf(float(f.cell_size), 0.0001),
			"max_bytes": int(f.max_bytes),
			"max_items": int(f.max_items),
		})
	var payload := JSON.stringify({
		"serializer_version": SERIALIZER_VERSION,
		"schema_id": schema_id,
		"version": version,
		"fields": canonical_fields,
		"atomic_groups": atomic_groups,
	})
	var ctx := HashingContext.new()
	ctx.start(HashingContext.HASH_SHA256)
	ctx.update(payload.to_utf8_buffer())
	_protocol_hash = ctx.finish().hex_encode()
	return _protocol_hash


func protocol_hash_prefix_bytes() -> PackedByteArray:
	var h := compute_protocol_hash()
	var out := PackedByteArray()
	out.resize(8)
	for i in 8:
		out[i] = int(("0x" + h.substr(i * 2, 2)).hex_to_int())
	return out


## 값 양자화: 서버 캡처 시 한 번 수행해 연결 간 불변 상태를 공유한다.
func quantize_value(def: Dictionary, raw_val: Variant) -> Dictionary:
	var t := String(def.type)
	match t:
		FIELD_VEC2_CELL:
			if not (raw_val is Vector2):
				return {"ok": false, "reason": "expected_vec2"}
			var v: Vector2 = raw_val
			if not (is_finite(v.x) and is_finite(v.y)):
				return {"ok": false, "reason": "non_finite_vec2"}
			var cs := float(def.cell_size)
			var cx := int(floor(v.x / cs))
			var cy := int(floor(v.y / cs))
			var rx := clampi(int(round(((v.x - float(cx) * cs) / cs) * 65535.0)), 0, 65535)
			var ry := clampi(int(round(((v.y - float(cy) * cs) / cs) * 65535.0)), 0, 65535)
			return {"ok": true, "value": [cx, cy, rx, ry]}
		FIELD_ANGLE_U16:
			if typeof(raw_val) != TYPE_FLOAT and typeof(raw_val) != TYPE_INT:
				return {"ok": false, "reason": "expected_number"}
			var a := float(raw_val)
			if not is_finite(a):
				return {"ok": false, "reason": "non_finite_angle"}
			var norm := fposmod(a, TAU)
			var q := clampi(int(round((norm / TAU) * 65535.0)), 0, 65535)
			return {"ok": true, "value": q}
		FIELD_U16:
			if typeof(raw_val) != TYPE_INT and typeof(raw_val) != TYPE_FLOAT:
				return {"ok": false, "reason": "expected_u16"}
			var iv := int(raw_val)
			if iv < 0 or iv > 65535:
				return {"ok": false, "reason": "u16_out_of_range"}
			return {"ok": true, "value": iv}
		FIELD_I32:
			if typeof(raw_val) != TYPE_INT and typeof(raw_val) != TYPE_FLOAT:
				return {"ok": false, "reason": "expected_i32"}
			var iv32 := int(raw_val)
			if iv32 < -2147483648 or iv32 > 2147483647:
				return {"ok": false, "reason": "i32_out_of_range"}
			return {"ok": true, "value": iv32}
		FIELD_BOOL:
			return {"ok": true, "value": bool(raw_val)}
		FIELD_STRING:
			var s := String(raw_val)
			if s.to_utf8_buffer().size() > int(def.max_bytes):
				return {"ok": false, "reason": "string_too_long"}
			return {"ok": true, "value": s}
		FIELD_KEYED_COLLECTION:
			if not (raw_val is Dictionary):
				return {"ok": false, "reason": "expected_collection_dict"}
			var col: Dictionary = raw_val
			var items: Dictionary = col.get("items", {})
			if items.size() > int(def.max_items):
				return {"ok": false, "reason": "collection_too_large"}
			var clean_items := {}
			var keys := items.keys()
			keys.sort()
			for k in keys:
				var item_id := String(k)
				if item_id.is_empty() or item_id.to_utf8_buffer().size() > 64:
					return {"ok": false, "reason": "invalid_item_id"}
				var entry: Dictionary = items[k]
				var qty := int(entry.get("qty", 0))
				var rev := int(entry.get("entry_revision", 0))
				var tomb := bool(entry.get("tombstone", false))
				if qty < 0 or qty > 65535 or rev < 0:
					return {"ok": false, "reason": "invalid_item_entry"}
				clean_items[item_id] = {"qty": qty, "entry_revision": rev, "tombstone": tomb}
			return {
				"ok": true,
				"value": {
					"transaction_revision": int(col.get("transaction_revision", 0)),
					"items": clean_items,
				},
			}
	return {"ok": false, "reason": "unknown_field_type"}


static func dequantize_value(def: Dictionary, q_val: Variant) -> Variant:
	match String(def.type):
		FIELD_VEC2_CELL:
			var a: Array = q_val
			var cs := float(def.cell_size)
			return Vector2(
				float(int(a[0])) * cs + (float(int(a[2])) / 65535.0) * cs,
				float(int(a[1])) * cs + (float(int(a[3])) / 65535.0) * cs
			)
		FIELD_ANGLE_U16:
			return (float(int(q_val)) / 65535.0) * TAU
		FIELD_KEYED_COLLECTION:
			var col: Dictionary = q_val
			var live_items := {}
			var items: Dictionary = col.get("items", {})
			for item_id in items:
				var entry: Dictionary = items[item_id]
				if not bool(entry.get("tombstone", false)):
					live_items[item_id] = {"qty": int(entry.qty), "entry_revision": int(entry.entry_revision)}
			return {
				"transaction_revision": int(col.get("transaction_revision", 0)),
				"items": live_items,
				"raw_items": items.duplicate(true),
			}
	return q_val


static func quantized_equal(a: Variant, b: Variant) -> bool:
	return a == b


## 양자화된 필드를 StreamPeerBuffer에 바이너리 인코딩한다.
static func encode_quantized_field(buf: StreamPeerBuffer, def: Dictionary, q_val: Variant) -> bool:
	match String(def.type):
		FIELD_VEC2_CELL:
			var arr: Array = q_val
			buf.put_32(int(arr[0]))
			buf.put_32(int(arr[1]))
			buf.put_u16(int(arr[2]))
			buf.put_u16(int(arr[3]))
			return true
		FIELD_ANGLE_U16, FIELD_U16:
			buf.put_u16(int(q_val))
			return true
		FIELD_I32:
			buf.put_32(int(q_val))
			return true
		FIELD_BOOL:
			buf.put_u8(1 if bool(q_val) else 0)
			return true
		FIELD_STRING:
			var bytes := String(q_val).to_utf8_buffer()
			if bytes.size() > int(def.max_bytes):
				return false
			buf.put_u16(bytes.size())
			if bytes.size() > 0:
				buf.put_data(bytes)
			return true
		FIELD_KEYED_COLLECTION:
			var col: Dictionary = q_val
			var items: Dictionary = col.get("items", {})
			var keys := items.keys()
			keys.sort()
			if keys.size() > int(def.max_items):
				return false
			buf.put_u32(int(col.get("transaction_revision", 0)))
			buf.put_u16(keys.size())
			for k in keys:
				var kb := String(k).to_utf8_buffer()
				if kb.size() == 0 or kb.size() > 64:
					return false
				var entry: Dictionary = items[k]
				buf.put_u8(kb.size())
				buf.put_data(kb)
				buf.put_u16(int(entry.qty))
				buf.put_u32(int(entry.entry_revision))
				buf.put_u8(1 if bool(entry.tombstone) else 0)
			return true
	return false


## StreamPeerBuffer에서 필드를 엄격 검증하며 디코딩한다.
static func decode_quantized_field(buf: StreamPeerBuffer, def: Dictionary) -> Dictionary:
	var rem := buf.get_size() - buf.get_position()
	match String(def.type):
		FIELD_VEC2_CELL:
			if rem < 12:
				return {"ok": false, "reason": "truncated_vec2"}
			var cx := buf.get_32()
			var cy := buf.get_32()
			var rx := buf.get_u16()
			var ry := buf.get_u16()
			return {"ok": true, "value": [cx, cy, rx, ry]}
		FIELD_ANGLE_U16, FIELD_U16:
			if rem < 2:
				return {"ok": false, "reason": "truncated_u16"}
			return {"ok": true, "value": buf.get_u16()}
		FIELD_I32:
			if rem < 4:
				return {"ok": false, "reason": "truncated_i32"}
			return {"ok": true, "value": buf.get_32()}
		FIELD_BOOL:
			if rem < 1:
				return {"ok": false, "reason": "truncated_bool"}
			var b := buf.get_u8()
			if b != 0 and b != 1:
				return {"ok": false, "reason": "invalid_bool"}
			return {"ok": true, "value": b == 1}
		FIELD_STRING:
			if rem < 2:
				return {"ok": false, "reason": "truncated_string_len"}
			var slen := buf.get_u16()
			if slen > int(def.max_bytes) or (buf.get_size() - buf.get_position()) < slen:
				return {"ok": false, "reason": "invalid_string_len"}
			var s := ""
			if slen > 0:
				var res := buf.get_data(slen)
				if int(res[0]) != OK:
					return {"ok": false, "reason": "string_read_error"}
				s = (res[1] as PackedByteArray).get_string_from_utf8()
			return {"ok": true, "value": s}
		FIELD_KEYED_COLLECTION:
			if rem < 6:
				return {"ok": false, "reason": "truncated_collection_header"}
			var tx_rev := buf.get_u32()
			var count := buf.get_u16()
			if count > int(def.max_items):
				return {"ok": false, "reason": "collection_count_exceeds_limit"}
			var items := {}
			for _i in count:
				if (buf.get_size() - buf.get_position()) < 1:
					return {"ok": false, "reason": "truncated_item_key_len"}
				var klen := buf.get_u8()
				if klen == 0 or klen > 64 or (buf.get_size() - buf.get_position()) < (klen + 7):
					return {"ok": false, "reason": "invalid_item_entry_bounds"}
				var kres := buf.get_data(klen)
				if int(kres[0]) != OK:
					return {"ok": false, "reason": "item_key_read_error"}
				var item_id := (kres[1] as PackedByteArray).get_string_from_utf8()
				var qty := buf.get_u16()
				var erev := buf.get_u32()
				var tomb_b := buf.get_u8()
				if tomb_b != 0 and tomb_b != 1:
					return {"ok": false, "reason": "invalid_tombstone_flag"}
				items[item_id] = {"qty": qty, "entry_revision": erev, "tombstone": tomb_b == 1}
			return {"ok": true, "value": {"transaction_revision": tx_rev, "items": items}}
	return {"ok": false, "reason": "unknown_field_type"}


## 기본 캐릭터 스키마 생성 헬퍼(26번 계획 §5 대응).
static func create_default_character_schema() -> RefCounted:
	var cls: GDScript = load("res://addons/playforge_netframework/replication/fg_net_schema.gd")
	var s = cls.new("character", 1, MAX_COLLECTION_ITEMS)
	s.add_field(1, "position", FIELD_VEC2_CELL, SCOPE_RELEVANT)
	s.add_field(2, "rotation", FIELD_ANGLE_U16, SCOPE_RELEVANT)
	s.add_field(3, "health", FIELD_U16, SCOPE_RELEVANT)
	s.add_field(4, "inventory", FIELD_KEYED_COLLECTION, SCOPE_OWNER, {"max_items": 128})
	s.add_field(5, "owner_secret", FIELD_STRING, SCOPE_OWNER, {"max_bytes": 64})
	s.add_atomic_group([1, 2])
	return s
