extends SceneTree

var assertions := 0
var failures: Array[String] = []


func _init() -> void:
	call_deferred("_run")


func _run() -> void:
	# Narrow synthetic route: no unmodelled natural cave can mask a blocked exit.
	var cells := {}
	var air := {}
	for x in 8:
		cells[Vector3i(x, 0, 0)] = BlockRegistry.STONE
		for y in range(1, 4): air[Vector3i(x, y, 0)] = true
	var layout := {"spawn": Vector3i(0, 1, 0), "cells": cells, "protected_cave": air, "cave_network": {"rooms": [{"name": "Test Gallery", "center": Vector3i(7, 1, 0), "radius": 1}]}}
	var store := VoxelChunkStore.new()
	store.initialize(1, 41, cells)
	var atlas := CaveWayfinding.new()
	atlas.configure(layout)
	var position := Vector3(7.5, 1, 0.5)
	var reading := atlas.sample(store, position, PI / 2)
	_expect(reading.status == "route" and reading.area == "Test Gallery" and reading.steps == 7 and reading.next == Vector3i(6, 1, 0), "room and next supported exit step")
	_expect(reading.heading == "W" and "AHEAD (W)" in reading.text, "west facing west is ahead")
	_expect("TURN BACK" in atlas.sample(store, position, -PI / 2).text, "east facing west is behind")
	_expect("LEFT" in atlas.sample(store, position, 0).text, "north facing west is left")
	_expect("RIGHT" in atlas.sample(store, position, PI).text, "south facing west is right")
	_expect(atlas.rebuild_count == 1, "rotation reuses route graph")
	for heading in [[0.0, "N"], [PI / 4, "NW"], [PI / 2, "W"], [PI * 0.75, "SW"], [PI, "S"], [-PI * 0.75, "SE"], [-PI / 2, "E"], [-PI / 4, "NE"]]:
		_expect(atlas.sample(store, position, heading[0]).heading == heading[1], "eight-way compass " + heading[1])
	_expect(not atlas.sample(store, Vector3(-0.1, 1, 0.5), 0).visible, "negative X uses floor, not integer truncation")
	_expect(not atlas.sample(store, position + Vector3.UP * 5, 0).visible, "surface directly above room is not a cave room")
	_expect(atlas.sample(store, position + Vector3.UP, 0).status == "unmapped", "airborne guidance does not point through floor")
	_expect(atlas.sample(store, Vector3(0.5, 1, 0.5), 0).status == "exit", "entrance arrival")
	var serial := store.change_serial
	store.set_block(Vector3i(3, 1, 0), -1)
	_expect(store.change_serial == serial, "no-op edit preserves revision")
	store.set_block(Vector3i(3, 1, 0), BlockRegistry.BRICK)
	_expect(atlas.sample(store, position, 0).status == "blocked" and atlas.rebuild_count == 2, "new obstacle invalidates route before mesh rebuild")
	store.set_block(Vector3i(3, 1, 0), -1)
	_expect(atlas.sample(store, position, 0).status == "route", "removing obstacle restores exit")
	store.set_block(Vector3i(3, 0, 0), -1)
	_expect(atlas.sample(store, position, 0).status == "blocked", "mined support invalidates exit")
	store.apply_edits({})
	_expect(atlas.sample(store, position, 0).status == "route", "checkpoint restoration invalidates route")
	serial = store.change_serial
	store.apply_edits({})
	_expect(store.change_serial == serial, "no-op checkpoint does not invalidate route")
	store.set_block(Vector3i(3, 2, 0), BlockRegistry.LEAVES)
	_expect(atlas.sample(store, position, 0).status == "blocked", "conservative clearance excludes occupied head cell")
	store.apply_edits({Vector3i(3, 0, 0): BlockRegistry.WATER})
	_expect(atlas.sample(store, position, 0).status == "blocked", "water is not supporting floor")
	store.initialize(1, 41, cells)
	_expect(atlas.sample(store, position, 0).status == "route", "same store reinitialization invalidates cache")
	var replacement := VoxelChunkStore.new()
	replacement.initialize(1, 41, cells)
	replacement.set_block(Vector3i(3, 1, 0), BlockRegistry.STONE)
	replacement.change_serial = store.change_serial # Deliberate token collision across distinct stores.
	_expect(atlas.sample(replacement, position, 0).status == "blocked", "store identity prevents stale route after world replacement")
	atlas.configure({})
	_expect(not atlas.sample(store, position, 0).visible and atlas.parents.is_empty(), "dungeon clears prior overworld atlas")
	var stair_cells := {Vector3i(0, 0, 0): BlockRegistry.STONE, Vector3i(1, 1, 0): BlockRegistry.STONE}
	var stair_air := {Vector3i(0, 1, 0): true, Vector3i(0, 2, 0): true, Vector3i(0, 3, 0): true, Vector3i(1, 2, 0): true, Vector3i(1, 3, 0): true}
	var stair := {"spawn": Vector3i(1, 2, 0), "cells": stair_cells, "protected_cave": stair_air, "cave_network": {"rooms": []}}
	store.initialize(1, 41, stair_cells)
	atlas.configure(stair)
	_expect("Space: climb" in atlas.sample(store, Vector3(0.5, 1, 0.5), 0).text, "ascending exit signals jump")
	store.set_block(Vector3i(0, 3, 0), BlockRegistry.STONE)
	_expect(atlas.sample(store, Vector3(0.5, 1, 0.5), 0).status == "blocked", "extra jump clearance checked beyond standing head")
	store.apply_edits({})
	stair.spawn = Vector3i(0, 1, 0)
	atlas.configure(stair)
	_expect("Step down" in atlas.sample(store, Vector3(1.5, 2, 0.5), 0).text, "descending exit signals step down")
	for fixture in [[1337, 41], [-7, 41], [2147483647, 41], [1337, 185]]:
		var generated := DeterministicWorldGenerator.generate(fixture[0], fixture[1])
		store.initialize(fixture[0], fixture[1], generated.cells, generated.signature)
		atlas.configure(generated)
		for room: Dictionary in generated.cave_network.rooms:
			reading = atlas.sample(store, Vector3(room.center) + Vector3(0.5, 0, 0.5), 0)
			_expect(reading.status == "route" and reading.area == room.name, "real room identity and exit %s %s" % [fixture, room.name])
		var valid_edges := true
		for cell: Vector3i in atlas.parents:
			if cell == generated.spawn: continue
			var next: Vector3i = atlas.parents[cell]
			var delta := next - cell
			valid_edges = valid_edges and absi(delta.x) + absi(delta.z) == 1 and absi(delta.y) <= 1
			valid_edges = valid_edges and VoxelTraversal.walkable(generated.cells, cell) and VoxelTraversal.walkable(generated.cells, next)
			valid_edges = valid_edges and int(atlas.distances[next]) + 1 == int(atlas.distances[cell])
			if delta.y != 0:
				var lower := cell if delta.y > 0 else next
				valid_edges = valid_edges and not generated.cells.has(lower + Vector3i.UP * 2)
		_expect(valid_edges, "every real exit edge has live floor, jump clearance and descending distance")
		print("WAYFINDING GRAPH fixture=%s candidates=%d reachable=%d build_us=%d" % [fixture, atlas.candidates.size(), atlas.parents.size(), atlas.last_build_us])
	var instance := (load("res://scenes/main.tscn") as PackedScene).instantiate()
	root.add_child(instance)
	var world: VoxelWorld = instance.get_node("VoxelWorld")
	var player: VoxelPlayer = instance.get_node("Player")
	var hud: GameHud = instance.get_node("HUD")
	player.set_physics_process(false)
	player.position = Vector3(world.layout.cave_network.rooms[1].center) + Vector3(0.5, 0, 0.5)
	hud._refresh_navigation()
	_expect(hud.navigation_panel.visible and "WESTERN GALLERY" in hud.navigation_title.text, "real HUD shows current room")
	_expect(hud.navigation_detail.get_minimum_size().x <= hud.navigation_panel.size.x - 32, "route text fits panel")
	player.controls_open = true
	hud._refresh_navigation()
	_expect(not hud.navigation_panel.visible, "generation controls hide atlas")
	player.controls_open = false
	world.loading = true
	hud._refresh_navigation()
	_expect(not hud.navigation_panel.visible, "load transaction hides stale atlas")
	world.loading = false
	world.generating = true
	hud._refresh_navigation()
	_expect(not hud.navigation_panel.visible, "generation transaction hides stale atlas")
	world.generating = false
	world.set_cell_item(Vector3i(1, world.layout.spawn.y, 0), BlockRegistry.BRICK)
	hud._refresh_navigation()
	_expect("EXIT:" in hud.navigation_detail.text and not hud.wayfinding.parents.has(Vector3i(1, world.layout.spawn.y, 0)), "one blocked lane reroutes through intact shoulder")
	# Seal the mapped entrance across all three columns, then restore as a save load does.
	for z in range(-1, 2): world.set_cell_item(Vector3i(1, world.layout.spawn.y, z), BlockRegistry.BRICK)
	hud._refresh_navigation()
	_expect("No verified exit route" in hud.navigation_detail.text, "real HUD warns on a sealed exit")
	_expect(hud.navigation_detail.get_minimum_size().x <= hud.navigation_panel.size.x - 32, "blocked text fits panel")
	world.chunk_store.apply_edits({})
	hud._refresh_navigation()
	_expect("EXIT:" in hud.navigation_detail.text and world.chunk_store.edits.is_empty(), "checkpoint restores real HUD with no stale warning")
	for failure in failures: push_error(failure)
	print("WAYFINDING SMOKE: %d assertions, %d failures" % [assertions, failures.size()])
	quit(0 if failures.is_empty() else 1)


func _expect(condition: bool, message: String) -> void:
	assertions += 1
	if not condition: failures.append(message)
