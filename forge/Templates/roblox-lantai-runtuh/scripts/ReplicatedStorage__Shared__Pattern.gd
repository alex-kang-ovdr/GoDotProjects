extends Node
# Auto-ported ModuleScript by PlayForge RobloxConverter v2 from: ReplicatedStorage/Shared/Pattern
# Strategy: adapter | Grades: D=3 A=1 R=0 X=0 V=1


func _ready() -> void:
	pass
	RobloxCompat.register_module("Pattern", self)

func count(cells, color):
	var n = 0
	for c in cells:
		if c == color:
			n += 1
	return n

func indicesWhere(cells, predicate):
	var out = []
	for _idx_i in range(cells.size()):
		var i = _idx_i + 1
		var c = cells[_idx_i]
		if predicate.call(c):
			RobloxCompat.table_insert(out, i)
	return out

func shuffle(randInt, list):
	for i in range(list.size(), (2) - 1, -1):
		var j = randInt.call(1, i)
		var _swap_tmp = list[int(i) - 1]
		list[int(i) - 1] = list[int(j) - 1]
		list[int(j) - 1] = _swap_tmp

func generate(randInt, options):
	var size = options.size
	var colors = options.colors
	var patch = options.patch
	assert(size >= 2, "grid too small")
	assert(colors >= 2, "need at least two colors")
	assert(patch >= 1, "patch must be >= 1")
	assert(options.minTargetShare <= options.maxTargetShare, "min share above max share")
	var patchesPerRow = ceili(float(size) / float(patch))
	var patchColors = RobloxCompat.table_create(patchesPerRow * patchesPerRow, 0)
	for i in range(1, (patchesPerRow * patchesPerRow) + 1, 1):
		patchColors[int(i) - 1] = randInt.call(1, colors)
	var total = size * size
	var cells = RobloxCompat.table_create(total, 0)
	for z in range(0, (size - 1) + 1, 1):
		for x in range(0, (size - 1) + 1, 1):
			var p = (floori(float(z) / float(patch))) * patchesPerRow + (floori(float(x) / float(patch))) + 1
			cells[int(z * size + x + 1) - 1] = patchColors[int(p) - 1]
	var target = randInt.call(1, colors)
	var minSafe = max(1, ceili(total * options.minTargetShare))
	var maxSafe = max(minSafe, floori(total * options.maxTargetShare))
	var safe = count(cells, target)
	if safe < minSafe:
		var others = indicesWhere(cells, func(c):
			return c != target
		)
		shuffle(randInt, others)
		for k in range(1, (minSafe - safe) + 1, 1):
			cells[int(others[int(k) - 1]) - 1] = target
	elif safe > maxSafe:
		var targets = indicesWhere(cells, func(c):
			return c == target
		)
		shuffle(randInt, targets)
		for k in range(1, (safe - maxSafe) + 1, 1):
			cells[int(targets[int(k) - 1]) - 1] = (target - 1 + randInt.call(1, colors - 1)) % colors + 1
	return { "size": size, "cells": cells, "target": target, "colors": colors }

func isSafe(layout, index):
	return layout.cells[int(index) - 1] == layout.target
