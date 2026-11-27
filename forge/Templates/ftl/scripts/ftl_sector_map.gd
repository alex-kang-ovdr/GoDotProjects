class_name FTLSectorMap
extends RefCounted

## Authentic FTL 8-sector campaign tree + 20-beacon sector graph + Rebel Fleet pursuit wave.

const JUMP_RANGE := 162.0
const MAP_SIZE := Vector2(680.0, 410.0)

var db: FTLDatabase
var current_sector_index: int = 0   # 0..7 (7 = Sector 8: The Last Stand)
var current_sector_id: String = "CIVILIAN_SECTOR"
var current_sector_name: String = "Civilian Sector"
var current_sector_kind: String = "CIVILIAN"
var current_sector_track: String = "civilian"

# 8-column sector tree: Array of columns, each column = Array of {id, name, kind, next_indices}
var sector_tree: Array = []
var current_tree_node_idx: int = 0

# Beacons in current sector
var beacons: Array = [] # {id, pos, type, visited, explored, rebel, nebula, hazard, event_id, store_data, links}
var current_beacon_id: int = 0
var rebel_fleet_x: float = -120.0
var total_jumps: int = 0
var base_beacon_id: int = 1
var flagship_beacon_id: int = -1
var flagship_phase: int = 1
var flagship_base_turns: int = 0


func init_campaign(p_db: FTLDatabase) -> void:
	db = p_db
	current_sector_index = 0
	current_tree_node_idx = 0
	total_jumps = 0
	flagship_phase = 1
	_build_sector_tree()
	enter_sector(0, 0)


func _build_sector_tree() -> void:
	sector_tree.clear()
	# Col 0: Civilian start
	sector_tree.append([{"id": "CIVILIAN_SECTOR", "name": "Civilian Sector", "kind": "CIVILIAN", "next": [0, 1]}])
	for col in range(1, 7):
		var count := 2 if col in [1, 6] else (3 if col in [2, 5] else 4)
		var nodes: Array = []
		for r in range(count):
			var roll := randf()
			var kind := "CIVILIAN" if roll < 0.42 else ("HOSTILE" if roll < 0.80 else "NEBULA")
			var sid := _pick_sector_id_for_kind(kind, col)
			var sname := _sector_display_name(sid)
			nodes.append({"id": sid, "name": sname, "kind": kind, "next": []})
		sector_tree.append(nodes)
	# Col 7: The Last Stand
	sector_tree.append([{"id": "FINAL", "name": "The Last Stand", "kind": "HOSTILE", "next": []}])

	# Connect each column forward
	for col in range(0, 7):
		var cur_col: Array = sector_tree[col]
		var nxt_col: Array = sector_tree[col + 1]
		for i in range(cur_col.size()):
			var mapped := int(round(float(i) / maxf(1.0, float(cur_col.size() - 1)) * float(nxt_col.size() - 1))) if cur_col.size() > 1 else 0
			var links: Array[int] = [clampi(mapped, 0, nxt_col.size() - 1)]
			if mapped + 1 < nxt_col.size():
				links.append(mapped + 1)
			elif mapped - 1 >= 0:
				links.append(mapped - 1)
			cur_col[i].next = links


func _pick_sector_id_for_kind(kind: String, col: int) -> String:
	var pool: Array = db.sector_types.get(kind, ["CIVILIAN_SECTOR"])
	var valid: Array[String] = []
	for sid in pool:
		var sd: Dictionary = db.sectors.get(str(sid), {})
		if int(sd.get("minSector", 0)) <= col:
			valid.append(str(sid))
	if valid.is_empty():
		return "CIVILIAN_SECTOR" if kind == "CIVILIAN" else ("REBEL_SECTOR" if kind == "HOSTILE" else "NEBULA_SECTOR")
	return valid[randi() % valid.size()]


func _sector_display_name(sid: String) -> String:
	var sd: Dictionary = db.sectors.get(sid, {})
	var names: Array = sd.get("names", [])
	if not names.is_empty():
		return str(names[randi() % names.size()])
	return sid.replace("_", " ").capitalize()


func enter_sector(sector_idx: int, node_idx: int) -> void:
	current_sector_index = clampi(sector_idx, 0, 7)
	current_tree_node_idx = node_idx
	var node: Dictionary = sector_tree[current_sector_index][clampi(node_idx, 0, sector_tree[current_sector_index].size() - 1)]
	current_sector_id = str(node.id)
	current_sector_name = str(node.name)
	current_sector_kind = str(node.kind)

	var sd: Dictionary = db.sectors.get(current_sector_id, {})
	var tracks: Array = sd.get("tracks", ["civilian"])
	current_sector_track = "laststand" if current_sector_index == 7 else (str(tracks[randi() % tracks.size()]) if not tracks.is_empty() else "civilian")

	_generate_beacons()


func _generate_beacons() -> void:
	beacons.clear()
	rebel_fleet_x = -85.0
	flagship_beacon_id = -1

	# Place Start on left, Exit/Base on right, and 18 intermediate beacons with clean spacing
	var pts: Array[Vector2] = [
		Vector2(56.0, MAP_SIZE.y * 0.5 + randf_range(-40.0, 40.0)),
		Vector2(MAP_SIZE.x - 56.0, MAP_SIZE.y * 0.5 + randf_range(-55.0, 55.0)),
	]
	var attempts := 0
	while pts.size() < 20 and attempts < 600:
		attempts += 1
		var cand := Vector2(randf_range(95.0, MAP_SIZE.x - 95.0), randf_range(46.0, MAP_SIZE.y - 46.0))
		var ok := true
		for p in pts:
			if p.distance_to(cand) < 64.0:
				ok = false
				break
		if ok:
			pts.append(cand)

	var event_pool := _sector_event_pool()
	for i in range(pts.size()):
		var btype := "normal"
		if i == 0:
			btype = "start"
		elif i == 1:
			btype = "boss_base" if current_sector_index == 7 else "exit"
		elif i in [4, 11]:
			btype = "store"
		elif i in [6, 14]:
			btype = "distress"
		elif i in [8, 16]:
			btype = "hostile"
		var is_nebula := (current_sector_kind == "NEBULA" and randf() < 0.55) or (i in [7, 13] and randf() < 0.35)
		var hazard := ""
		if btype == "normal":
			if is_nebula and randf() < 0.28:
				hazard = "ion_storm"
			elif not is_nebula and randf() < 0.14:
				hazard = ["asteroid", "sun", "pulsar"][randi() % 3]
		var ev_id := ""
		if not event_pool.is_empty():
			ev_id = event_pool[randi() % event_pool.size()]
		beacons.append({
			"id": i,
			"pos": pts[i],
			"type": btype,
			"visited": (i == 0),
			"explored": (i == 0),
			"rebel": false,
			"nebula": is_nebula,
			"hazard": hazard,
			"event_id": ev_id,
			"store_data": {},
			"links": [],
		})

	# Build jump graph
	for i in range(beacons.size()):
		for j in range(i + 1, beacons.size()):
			if beacons[i].pos.distance_to(beacons[j].pos) <= JUMP_RANGE:
				beacons[i].links.append(j)
				beacons[j].links.append(i)

	# Guarantee connected graph (connect isolated components to nearest neighbor)
	for _pass in range(20):
		var reached := _bfs_reachable(0)
		if reached.size() == beacons.size():
			break
		var best_dist := 1e9
		var best_a := 0
		var best_b := 0
		for a in reached.keys():
			for b in range(beacons.size()):
				if reached.has(b):
					continue
				var dist: float = beacons[a].pos.distance_to(beacons[b].pos)
				if dist < best_dist:
					best_dist = dist
					best_a = a
					best_b = b
		beacons[best_a].links.append(best_b)
		beacons[best_b].links.append(best_a)

	current_beacon_id = 0
	base_beacon_id = 1
	flagship_base_turns = 0
	if current_sector_index == 7:
		# Authentic FTL 1.6 Sector 8 (The Last Stand): 2 Federation Repair Stations + Flagship marching toward Federation Base!
		var rep_placed := 0
		for b in beacons:
			if int(b.id) >= 2 and str(b.type) == "normal" and rep_placed < 2:
				b.type = "repair"
				b.explored = true
				rep_placed += 1
		# Place Flagship ~3 hops away from Federation Base (or farthest reachable beacon)
		var best_fid := 1
		var best_dist := -1.0
		var base_pos: Vector2 = beacons[base_beacon_id].pos
		for b in beacons:
			if int(b.id) > 1 and str(b.type) != "repair":
				var d := (b.pos as Vector2).distance_to(base_pos)
				if d > best_dist:
					best_dist = d
					best_fid = int(b.id)
		flagship_beacon_id = best_fid
		beacons[base_beacon_id].explored = true
		beacons[flagship_beacon_id].explored = true
	_reveal_neighbors(0)


func _bfs_reachable(start_id: int) -> Dictionary:
	var vis := {start_id: true}
	var q: Array[int] = [start_id]
	while not q.is_empty():
		var cur: int = q.pop_front()
		for nb in beacons[cur].links:
			if not vis.has(nb):
				vis[nb] = true
				q.append(nb)
	return vis


func _sector_event_pool() -> Array[String]:
	var pool: Array[String] = []
	var sd: Dictionary = db.sectors.get(current_sector_id, {})
	for ev in sd.get("events", []):
		var ename := str(ev.get("name", ""))
		if db.events.has(ename) or db.event_lists.has(ename):
			pool.append(ename)
	if pool.is_empty():
		for fallback_name in ["HOSTILE1", "ITEMS", "NEUTRAL", "DISTRESS_BEACON", "NOTHING"]:
			if db.events.has(fallback_name) or db.event_lists.has(fallback_name):
				pool.append(fallback_name)
	return pool


func _reveal_neighbors(bid: int) -> void:
	if bid < 0 or bid >= beacons.size():
		return
	beacons[bid].explored = true
	for nb in beacons[bid].links:
		beacons[nb].explored = true


func can_jump_to(bid: int, adv_ftl_nav: bool = false) -> bool:
	if bid < 0 or bid >= beacons.size() or bid == current_beacon_id:
		return false
	if adv_ftl_nav and bool(beacons[bid].visited):
		return true
	return beacons[current_beacon_id].links.has(bid)


func jump_to(bid: int, adv_ftl_nav: bool = false) -> Dictionary:
	if not can_jump_to(bid, adv_ftl_nav):
		return {}
	current_beacon_id = bid
	total_jumps += 1
	var b: Dictionary = beacons[bid]
	b.visited = true
	_reveal_neighbors(bid)

	# Advance Rebel Fleet wave (slower inside Nebula beacons!) or Sector 8 Flagship march toward Federation Base
	var step := 36.0 if bool(b.nebula) else 66.0
	if current_sector_index < 7:
		rebel_fleet_x += step
		for item in beacons:
			if float(item.pos.x) <= rebel_fleet_x and str(item.type) != "exit":
				item.rebel = true
	elif flagship_beacon_id >= 0:
		if flagship_beacon_id == base_beacon_id:
			flagship_base_turns += 1
		elif flagship_beacon_id != current_beacon_id:
			var fpath := _shortest_beacon_path(flagship_beacon_id, base_beacon_id)
			if not fpath.is_empty():
				flagship_beacon_id = int(fpath[0])
				beacons[flagship_beacon_id].explored = true
	return b


func modify_pursuit(delta_jumps: int) -> void:
	# Authentic FTL 1.6 <modifyPursuit amount="..."/> (0x5e6fb7): negative delays Rebel Fleet, positive accelerates!
	rebel_fleet_x += float(delta_jumps) * 66.0
	for item in beacons:
		if str(item.type) != "exit":
			item.rebel = (float(item.pos.x) <= rebel_fleet_x)


func reveal_all_beacons() -> void:
	# Authentic FTL 1.6 <reveal_map/> (0x5e6f65): reveals all beacons in the current sector!
	for item in beacons:
		item.explored = true


func _shortest_beacon_path(start_id: int, goal_id: int) -> Array[int]:
	if start_id == goal_id or start_id < 0 or goal_id < 0:
		return []
	var q: Array[int] = [start_id]
	var prev: Dictionary = {start_id: -1}
	while not q.is_empty():
		var cur: int = q.pop_front()
		if cur == goal_id:
			break
		for nb in beacons[cur].links:
			if not prev.has(nb):
				prev[nb] = cur
				q.append(nb)
	if not prev.has(goal_id):
		return []
	var path: Array[int] = []
	var c := goal_id
	while c != start_id and c != -1:
		path.push_front(c)
		c = int(prev[c])
	return path


func add_quest_beacon(event_id: String) -> int:
	var candidates: Array[int] = []
	for b in beacons:
		if not bool(b.visited) and not bool(b.rebel) and str(b.type) == "normal" and not bool(b.get("quest", false)):
			candidates.append(int(b.id))
	if candidates.is_empty():
		return -1
	var pick := candidates[randi() % candidates.size()]
	beacons[pick]["quest"] = true
	beacons[pick]["event_id"] = event_id
	return pick


func get_next_sector_options() -> Array:
	if current_sector_index >= 7:
		return []
	var cur_node: Dictionary = sector_tree[current_sector_index][current_tree_node_idx]
	var out: Array = []
	for nxt_idx in cur_node.next:
		var nxt_node: Dictionary = sector_tree[current_sector_index + 1][int(nxt_idx)]
		out.append({
			"sector_index": current_sector_index + 1,
			"node_index": int(nxt_idx),
			"id": nxt_node.id,
			"name": nxt_node.name,
			"kind": nxt_node.kind,
		})
	return out
