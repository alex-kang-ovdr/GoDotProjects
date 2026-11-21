--!strict
-- Seeded xorshift32. Roblox's Random would do in game, but a pure-Luau
-- generator lets the same seed reproduce a layout in tests outside Roblox.

local Rng = {}
Rng.__index = Rng

export type Rng = typeof(setmetatable({} :: { state: number }, Rng))

local TWO_32 = 4294967296

function Rng.new(seed: number): Rng
	local state = math.floor(seed) % TWO_32
	if state == 0 then
		-- xorshift never leaves the all-zero state.
		state = 0x9E3779B9
	end
	return setmetatable({ state = state }, Rng)
end

function Rng.nextU32(self: Rng): number
	local x = self.state
	x = bit32.bxor(x, bit32.lshift(x, 13))
	x = bit32.bxor(x, bit32.rshift(x, 17))
	x = bit32.bxor(x, bit32.lshift(x, 5))
	self.state = x
	return x
end

-- Uniform integer in [min, max], both inclusive.
function Rng.nextInt(self: Rng, min: number, max: number): number
	assert(max >= min, "max must be >= min")
	return min + self:nextU32() % (max - min + 1)
end

-- Uniform number in [0, 1).
function Rng.nextNumber(self: Rng): number
	return self:nextU32() / TWO_32
end

function Rng.shuffle<T>(self: Rng, list: { T })
	for i = #list, 2, -1 do
		local j = self:nextInt(1, i)
		list[i], list[j] = list[j], list[i]
	end
end

return Rng
