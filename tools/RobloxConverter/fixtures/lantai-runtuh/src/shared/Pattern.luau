--!strict
-- Builds the colored tile layout for one wave.

local Pattern = {}

export type Layout = {
	size: number,
	-- Row-major: index = z * size + x + 1.
	cells: { number },
	target: number,
	colors: number,
}

export type Options = {
	size: number,
	colors: number,
	-- Side length of the square patches that share one color. Big patches
	-- are easy to read, single tiles are a scramble.
	patch: number,
	minTargetShare: number,
	maxTargetShare: number,
}

-- Uniform integer in [min, max]. A plain function keeps this module free of
-- any particular generator.
export type RandInt = (min: number, max: number) -> number

function Pattern.count(cells: { number }, color: number): number
	local n = 0
	for _, c in cells do
		if c == color then
			n += 1
		end
	end
	return n
end

local function indicesWhere(cells: { number }, predicate: (number) -> boolean): { number }
	local out = {}
	for i, c in cells do
		if predicate(c) then
			table.insert(out, i)
		end
	end
	return out
end

local function shuffle(randInt: RandInt, list: { number })
	for i = #list, 2, -1 do
		local j = randInt(1, i)
		list[i], list[j] = list[j], list[i]
	end
end

function Pattern.generate(randInt: RandInt, options: Options): Layout
	local size, colors, patch = options.size, options.colors, options.patch
	assert(size >= 2, "grid too small")
	assert(colors >= 2, "need at least two colors")
	assert(patch >= 1, "patch must be >= 1")
	assert(options.minTargetShare <= options.maxTargetShare, "min share above max share")

	local patchesPerRow = math.ceil(size / patch)
	local patchColors = table.create(patchesPerRow * patchesPerRow, 0)
	for i = 1, patchesPerRow * patchesPerRow do
		patchColors[i] = randInt(1, colors)
	end

	local total = size * size
	local cells = table.create(total, 0)
	for z = 0, size - 1 do
		for x = 0, size - 1 do
			local p = (z // patch) * patchesPerRow + (x // patch) + 1
			cells[z * size + x + 1] = patchColors[p]
		end
	end

	local target = randInt(1, colors)

	-- Random patches can leave almost no safe ground, or almost no danger.
	-- Clamp the safe share so every wave is survivable and still a threat.
	local minSafe = math.max(1, math.ceil(total * options.minTargetShare))
	local maxSafe = math.max(minSafe, math.floor(total * options.maxTargetShare))
	local safe = Pattern.count(cells, target)

	if safe < minSafe then
		local others = indicesWhere(cells, function(c)
			return c ~= target
		end)
		shuffle(randInt, others)
		for k = 1, minSafe - safe do
			cells[others[k]] = target
		end
	elseif safe > maxSafe then
		local targets = indicesWhere(cells, function(c)
			return c == target
		end)
		shuffle(randInt, targets)
		for k = 1, safe - maxSafe do
			-- Any color but the target: shift by 1..colors-1 and wrap.
			cells[targets[k]] = (target - 1 + randInt(1, colors - 1)) % colors + 1
		end
	end

	return {
		size = size,
		cells = cells,
		target = target,
		colors = colors,
	}
end

function Pattern.isSafe(layout: Layout, index: number): boolean
	return layout.cells[index] == layout.target
end

return Pattern
