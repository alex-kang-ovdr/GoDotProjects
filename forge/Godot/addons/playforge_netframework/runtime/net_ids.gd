class_name NetIds
extends RefCounted
## 로드맵 §7 계약 식별자 헬퍼.
## - WorldKey: tenant_id, project_id, build_id, session_id, world_epoch
## - NetObjectId: index, generation (WorldKey 범위 안에서만 유효)
## NetObjectId는 RID·Resource UID·편집 Node ID·user_id와 별개다.


static func make_world_key(tenant_id: String, project_id: String, build_id: String, session_id: String, world_epoch: int) -> Dictionary:
	return {
		"tenantId": tenant_id,
		"projectId": project_id,
		"buildId": build_id,
		"sessionId": session_id,
		"worldEpoch": world_epoch,
	}


static func world_key_string(key: Dictionary) -> String:
	return "%s/%s/%s/%s#%d" % [key.get("tenantId", ""), key.get("projectId", ""), key.get("buildId", ""), key.get("sessionId", ""), int(key.get("worldEpoch", 0))]


static func random_id(bytes: int = 12) -> String:
	var crypto := Crypto.new()
	return crypto.generate_random_bytes(bytes).hex_encode()


## index 재사용 시 generation을 올려 오래된 참조(stale id)를 구별한다.
class ObjectIdAllocator:
	extends RefCounted
	var _generations: PackedInt32Array = PackedInt32Array()
	var _alive: PackedByteArray = PackedByteArray()
	var _free: Array[int] = []

	func allocate() -> Dictionary:
		var index: int
		if _free.is_empty():
			index = _generations.size()
			_generations.append(1)
			_alive.append(1)
		else:
			index = _free.pop_back()
			_generations[index] += 1
			_alive[index] = 1
		return {"index": index, "generation": _generations[index]}

	func release(id: Dictionary) -> bool:
		if not is_alive(id):
			return false
		var index := int(id.get("index", -1))
		_alive[index] = 0
		_free.append(index)
		return true

	func is_alive(id: Dictionary) -> bool:
		var index := int(id.get("index", -1))
		if index < 0 or index >= _generations.size():
			return false
		return _alive[index] == 1 and _generations[index] == int(id.get("generation", -1))
