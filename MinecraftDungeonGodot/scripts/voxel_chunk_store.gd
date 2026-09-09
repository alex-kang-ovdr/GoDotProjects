class_name VoxelChunkStore
extends RefCounted

const FORMAT_VERSION := 7
const GENERATION_VERSION := DeterministicWorldGenerator.GENERATION_VERSION
const CHUNK_SIZE := 16
const MAX_SAVE_BYTES := 32 * 1024 * 1024

var seed_value := 0
var world_size := 0
var base_cells: Dictionary = {}
var edits: Dictionary = {}
var block_states: Dictionary = {}
var dirty_chunks: Dictionary = {}
var base_signature := 0
var generation_options: Dictionary = {"mode": "overworld"}
# Effective solid/non-air cells partitioned into 16-cube chunks for local meshing.
var chunks: Dictionary = {}
var mesh_dirty_cells: Dictionary = {}
# Runtime-only invalidation token; not part of deterministic generation or saves.
var change_serial := 0
var stations: Dictionary = {}
var depleted_ore: Dictionary = {}
var station_tick_remainder := 0.0


func initialize(seed_input: int, size_input: int, generated_cells: Dictionary, signature_input: int = -1) -> void:
	change_serial += 1
	seed_value = seed_input
	world_size = size_input
	generation_options = {"mode": "overworld"}
	base_cells = generated_cells
	base_signature = DeterministicWorldGenerator.signature(generated_cells) if signature_input == -1 else signature_input
	edits.clear()
	block_states.clear()
	stations.clear()
	depleted_ore.clear()
	station_tick_remainder = 0.0
	dirty_chunks.clear()
	chunks.clear()
	mesh_dirty_cells.clear()
	for cell: Vector3i in generated_cells:
		_index_cell(cell, int(generated_cells[cell]))


func get_block(cell: Vector3i) -> int:
	if edits.has(cell):
		return int(edits[cell])
	return int(base_cells.get(cell, -1))


func set_block(cell: Vector3i, material_id: int) -> void:
	if get_block(cell) == material_id:
		return
	if stations.has(cell):
		if not StationState.empty(stations[cell]): return
		stations.erase(cell)
	if int(base_cells.get(cell, -1)) in [BlockRegistry.COBBLESTONE, BlockRegistry.MOSS]: depleted_ore[cell] = true
	change_serial += 1
	block_states.erase(cell)
	if material_id == int(base_cells.get(cell, -1)):
		edits.erase(cell)
	else:
		edits[cell] = material_id
	_index_cell(cell, material_id)
	_mark_dirty(cell)


func get_state(cell: Vector3i) -> int:
	return int(block_states.get(cell, 0))


func set_state(cell: Vector3i, state: int) -> bool:
	var material := get_block(cell)
	if state < 0 or state >= BlockOrientation.COUNT or material < 0 or not BlockRegistry.DEFINITIONS[material].solid: return false
	if get_state(cell) == state: return true
	if state == 0: block_states.erase(cell)
	else: block_states[cell] = state
	change_serial += 1
	_mark_dirty(cell)
	return true


func consume_dirty_chunks() -> Array[Vector3i]:
	var result: Array[Vector3i] = []
	for chunk: Vector3i in dirty_chunks:
		result.append(chunk)
	result.sort_custom(_sort_cells)
	dirty_chunks.clear()
	return result


func encode(player_state: Dictionary = {}) -> String:
	var edit_rows := []
	var cells: Array = edits.keys()
	cells.sort_custom(_sort_cells)
	for cell: Vector3i in cells:
		edit_rows.append([cell.x, cell.y, cell.z, int(edits[cell])])
	var state_rows := []
	var state_cells: Array = block_states.keys()
	state_cells.sort_custom(_sort_cells)
	for cell: Vector3i in state_cells:
		state_rows.append([cell.x, cell.y, cell.z, int(block_states[cell])])
	var payload := {
		"format_version": FORMAT_VERSION,
		"generation_version": GENERATION_VERSION,
		"seed": seed_value,
		"world_size": world_size,
		"base_signature": base_signature,
		"generation_options": generation_options,
		"edits": edit_rows,
		"block_states": state_rows,
		"player": player_state,
		"stations": station_rows(),
		"depleted_ore": depleted_rows(),
		"station_tick_remainder": station_tick_remainder,
	}
	# Minimize numeric round-trip loss for camera angles, drop motion and timers.
	var payload_text := JSON.stringify(payload, "", true, true)
	return JSON.stringify({"payload": payload_text, "sha256": payload_text.sha256_text()})


func decode(encoded: String) -> Dictionary:
	var result := inspect_save(encoded)
	if result.ok:
		result.changed_cells = apply_edits(result.edits, result.block_states)
		apply_station_state(result)
	return result


# Parsing and validation never mutate the live journal or dirty queue.
func inspect_save(encoded: String) -> Dictionary:
	if encoded.length() > MAX_SAVE_BYTES:
		return {"ok": false, "error": "save exceeds size limit"}
	var envelope = JSON.parse_string(encoded)
	if not envelope is Dictionary or not envelope.has("payload") or not envelope.has("sha256"):
		return {"ok": false, "error": "save envelope is malformed"}
	var payload_text = envelope.payload
	if not payload_text is String:
		return {"ok": false, "error": "save payload is malformed"}
	if payload_text.sha256_text() != str(envelope.sha256):
		return {"ok": false, "error": "save checksum mismatch"}
	var payload = JSON.parse_string(payload_text)
	if not payload is Dictionary:
		return {"ok": false, "error": "save payload JSON is malformed"}
	if not SavedPlayerState.integer_in_range(payload.get("format_version"), 2, FORMAT_VERSION):
		return {"ok": false, "error": "unsupported save format"}
	if not SavedPlayerState.integer_in_range(payload.get("generation_version"), GENERATION_VERSION, GENERATION_VERSION):
		return {"ok": false, "error": "incompatible generation version"}
	if not SavedPlayerState.integer_in_range(payload.get("seed"), seed_value, seed_value) or not SavedPlayerState.integer_in_range(payload.get("world_size"), world_size, world_size):
		return {"ok": false, "error": "save belongs to a different world"}
	if not SavedPlayerState.integer_in_range(payload.get("base_signature"), base_signature, base_signature):
		return {"ok": false, "error": "generated base differs from saved world"}
	var options: Variant = payload.get("generation_options", {"mode": "overworld"})
	if not options is Dictionary or options.size() != generation_options.size() or options.get("mode") != generation_options.mode:
		return {"ok": false, "error": "save generation mode/options differ"}
	if generation_options.mode == "dungeon" and not SavedPlayerState.integer_in_range(options.get("room_attempts"), generation_options.room_attempts, generation_options.room_attempts):
		return {"ok": false, "error": "save dungeon room attempts differ or are invalid"}
	var player: Variant = payload.get("player")
	if not player is Dictionary:
		return {"ok": false, "error": "player state is malformed"}
	if not player.is_empty():
		if int(payload.format_version) <= 4:
			player = player.duplicate(true)
			player.inventory = BlockInventory.migrate_legacy(player.get("inventory"))
		elif int(payload.format_version) == 5:
			player = player.duplicate(true)
			player.inventory = BlockInventory.migrate_v5(player.get("inventory"))
		if int(payload.format_version) == 2:
			player = player.duplicate(true)
			player.tools = MiningTools.new().capture()
			player.drops = []
		elif not player.has("tools") or not player.has("drops"):
			return {"ok": false, "error": "mining state is missing"}
		var player_error := SavedPlayerState.validate(player)
		if not player_error.is_empty():
			return {"ok": false, "error": player_error}
		if int(payload.format_version) < 7:
			for drop: Dictionary in player.drops:
				if int(drop.slot) > 8: return {"ok": false, "error": "legacy drop item is invalid"}
	var decoded_edits := {}
	var rows = payload.get("edits")
	if not rows is Array:
		return {"ok": false, "error": "edit journal is malformed"}
	for row in rows:
		if not row is Array or row.size() != 4:
			return {"ok": false, "error": "edit row is malformed"}
		for axis in 3:
			if not SavedPlayerState.integer_in_range(row[axis], -32767, 32767):
				return {"ok": false, "error": "edit coordinate is invalid"}
		if not SavedPlayerState.integer_in_range(row[3], -1, BlockRegistry.MATERIAL_COUNT - 1):
			return {"ok": false, "error": "edit material is invalid"}
		var cell := Vector3i(int(row[0]), int(row[1]), int(row[2]))
		var material_id := int(row[3])
		if decoded_edits.has(cell) or material_id < -1 or material_id >= BlockRegistry.MATERIAL_COUNT:
			return {"ok": false, "error": "duplicate cell or invalid material"}
		decoded_edits[cell] = material_id
	var decoded_states := {}
	# Formats 2/3 predate orientation and must clear live states on load.
	if int(payload.format_version) >= 4:
		var state_rows: Variant = payload.get("block_states")
		if not state_rows is Array: return {"ok": false, "error": "block states are missing or malformed"}
		for row: Variant in state_rows:
			if not row is Array or row.size() != 4: return {"ok": false, "error": "block state row is malformed"}
			for axis in 3:
				if not SavedPlayerState.integer_in_range(row[axis], -32767, 32767): return {"ok": false, "error": "block state coordinate is invalid"}
			if not SavedPlayerState.integer_in_range(row[3], 0, BlockOrientation.COUNT - 1): return {"ok": false, "error": "block orientation is invalid"}
			var cell := Vector3i(int(row[0]), int(row[1]), int(row[2]))
			var material := int(decoded_edits.get(cell, base_cells.get(cell, -1)))
			if decoded_states.has(cell) or material < 0 or not BlockRegistry.DEFINITIONS[material].solid: return {"ok": false, "error": "duplicate state or state on non-solid cell"}
			decoded_states[cell] = int(row[3])
	var station_result := inspect_stations(payload, decoded_edits)
	if not station_result.ok: return station_result
	station_result.merge({"player": player, "edits": decoded_edits, "block_states": decoded_states})
	return station_result


func station_rows() -> Array:
	var result := []
	var cells: Array = stations.keys()
	cells.sort_custom(_sort_cells)
	for cell: Vector3i in cells: result.append({"cell": [cell.x, cell.y, cell.z], "state": stations[cell].duplicate(true)})
	return result


func depleted_rows() -> Array:
	var result := []
	var cells: Array = depleted_ore.keys()
	cells.sort_custom(_sort_cells)
	for cell: Vector3i in cells: result.append([cell.x, cell.y, cell.z])
	return result


func inspect_stations(payload: Dictionary, incoming: Dictionary) -> Dictionary:
	var result := {"ok": true, "error": "", "stations": {}, "depleted_ore": {}, "station_tick_remainder": 0.0}
	if int(payload.format_version) < 7:
		for cell: Vector3i in incoming:
			if int(base_cells.get(cell, -1)) in [BlockRegistry.COBBLESTONE, BlockRegistry.MOSS]: result.depleted_ore[cell] = true
		return result
	if not payload.get("stations") is Array or payload.stations.size() > StationState.MAX_STATIONS: return {"ok": false, "error": "invalid station list"}
	if not payload.get("depleted_ore") is Array: return {"ok": false, "error": "missing ore provenance"}
	var remainder: Variant = payload.get("station_tick_remainder")
	if not SavedPlayerState.finite_number(remainder) or float(remainder) < 0 or float(remainder) >= 0.05: return {"ok": false, "error": "invalid station tick remainder"}
	result.station_tick_remainder = float(remainder)
	for row: Variant in payload.stations:
		if not row is Dictionary or not valid_cell_row(row.get("cell")): return {"ok": false, "error": "invalid station coordinate"}
		var problem := StationState.validate(row.get("state"))
		if not problem.is_empty(): return {"ok": false, "error": problem}
		var cell := Vector3i(int(row.cell[0]), int(row.cell[1]), int(row.cell[2]))
		if result.stations.has(cell) or int(incoming.get(cell, base_cells.get(cell, -1))) != StationState.material(int(row.state.kind)): return {"ok": false, "error": "station binding mismatch or duplicate"}
		var normalized: Dictionary = row.state.duplicate(true)
		normalized.kind = int(normalized.kind)
		normalized.burn = int(normalized.burn)
		normalized.cook = int(normalized.cook)
		for stack: Array in normalized.slots:
			for index in stack.size(): stack[index] = int(stack[index])
		result.stations[cell] = normalized
	for row: Variant in payload.depleted_ore:
		if not valid_cell_row(row): return {"ok": false, "error": "invalid ore coordinate"}
		var cell := Vector3i(int(row[0]), int(row[1]), int(row[2]))
		if result.depleted_ore.has(cell) or int(base_cells.get(cell, -1)) not in [BlockRegistry.COBBLESTONE, BlockRegistry.MOSS]: return {"ok": false, "error": "invalid or duplicate ore provenance"}
		result.depleted_ore[cell] = true
	for cell: Vector3i in incoming:
		if int(base_cells.get(cell, -1)) in [BlockRegistry.COBBLESTONE, BlockRegistry.MOSS]: result.depleted_ore[cell] = true
	return result


static func valid_cell_row(value: Variant) -> bool:
	if not value is Array or value.size() != 3: return false
	for axis: Variant in value:
		if not SavedPlayerState.integer_in_range(axis, -32767, 32767): return false
	return true


func apply_station_state(result: Dictionary) -> void:
	stations = result.stations.duplicate(true)
	depleted_ore = result.depleted_ore.duplicate()
	station_tick_remainder = float(result.station_tick_remainder)


# Include the old journal so loading an earlier checkpoint also undoes new edits.
func apply_edits(incoming: Dictionary, incoming_states: Dictionary = {}) -> Array[Vector3i]:
	var candidates := edits.duplicate()
	candidates.merge(incoming, true)
	candidates.merge(block_states, true)
	candidates.merge(incoming_states, true)
	var changed: Array[Vector3i] = []
	for cell: Vector3i in candidates:
		var next_material := int(incoming.get(cell, base_cells.get(cell, -1)))
		if get_block(cell) != next_material or get_state(cell) != int(incoming_states.get(cell, 0)):
			changed.append(cell)
	var normalized := {}
	for cell: Vector3i in incoming:
		if int(incoming[cell]) != int(base_cells.get(cell, -1)):
			normalized[cell] = int(incoming[cell])
	edits = normalized
	block_states = {}
	for cell: Vector3i in incoming_states:
		if int(incoming_states[cell]) != 0: block_states[cell] = int(incoming_states[cell])
	if not changed.is_empty(): change_serial += 1
	for cell in changed:
		_index_cell(cell, get_block(cell))
		_mark_dirty(cell)
	return changed


func save_to_file(path: String, player_state: Dictionary = {}) -> String:
	var encoded := encode(player_state)
	var checked := inspect_save(encoded)
	if not checked.ok:
		return checked.error
	return write_encoded_file(path, encoded)


# Stage and read back before replacing the save; keep the previous file as .bak.
static func write_encoded_file(path: String, encoded: String) -> String:
	var temporary := path + ".pending"
	var file := FileAccess.open(temporary, FileAccess.WRITE)
	if file == null:
		return "could not open temporary save for writing"
	file.store_string(encoded)
	file.flush()
	var write_error := file.get_error()
	file.close()
	if write_error != OK:
		return "temporary save write failed"
	var readback := read_encoded_file(temporary)
	if not readback.ok or str(readback.encoded) != encoded:
		return "temporary save read-back failed"
	if FileAccess.file_exists(path):
		if DirAccess.copy_absolute(path, path + ".bak") != OK:
			return "could not preserve previous save"
	if DirAccess.rename_absolute(temporary, path) != OK:
		return "could not replace save; previous file preserved"
	return ""


func load_from_file(path: String) -> Dictionary:
	var read_result := read_encoded_file(path)
	return decode(read_result.encoded) if read_result.ok else read_result


static func read_encoded_file(path: String) -> Dictionary:
	if not FileAccess.file_exists(path):
		return {"ok": false, "error": "save file does not exist"}
	var file := FileAccess.open(path, FileAccess.READ)
	if file == null:
		return {"ok": false, "error": "could not open save for reading"}
	if file.get_length() > MAX_SAVE_BYTES:
		file.close()
		return {"ok": false, "error": "save exceeds size limit"}
	var encoded := file.get_as_text()
	file.close()
	return {"ok": true, "error": "", "encoded": encoded}


func _index_cell(cell: Vector3i, material_id: int) -> void:
	var chunk := DeterministicWorldGenerator.world_to_chunk(cell)
	if material_id == -1:
		if chunks.has(chunk):
			chunks[chunk].erase(cell)
			if chunks[chunk].is_empty():
				chunks.erase(chunk)
		return
	if not chunks.has(chunk):
		chunks[chunk] = {}
	chunks[chunk][cell] = material_id


func _mark_dirty(cell: Vector3i) -> void:
	mesh_dirty_cells[cell] = true
	var chunk := DeterministicWorldGenerator.world_to_chunk(cell)
	var local := DeterministicWorldGenerator.world_to_local(cell)
	dirty_chunks[chunk] = true
	if local.x == 0: dirty_chunks[chunk + Vector3i.LEFT] = true
	if local.x == CHUNK_SIZE - 1: dirty_chunks[chunk + Vector3i.RIGHT] = true
	if local.y == 0: dirty_chunks[chunk + Vector3i.DOWN] = true
	if local.y == CHUNK_SIZE - 1: dirty_chunks[chunk + Vector3i.UP] = true
	if local.z == 0: dirty_chunks[chunk + Vector3i(0, 0, -1)] = true
	if local.z == CHUNK_SIZE - 1: dirty_chunks[chunk + Vector3i(0, 0, 1)] = true


static func _sort_cells(a: Vector3i, b: Vector3i) -> bool:
	if a.x != b.x: return a.x < b.x
	if a.y != b.y: return a.y < b.y
	return a.z < b.z
