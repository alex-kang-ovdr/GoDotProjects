--!strict
-- In-memory stand-in for a DataStore with the same UpdateAsync contract.
-- Used in unpublished Studio places and in tests. Values are deep-copied on
-- the way in and out, like the real store's serialization, so callers cannot
-- mutate stored data by accident.

local MemoryStore = {}
MemoryStore.__index = MemoryStore

type State = {
	values: { [string]: any },
	failuresLeft: number,
	calls: number,
}

export type MemoryStore = typeof(setmetatable({} :: State, MemoryStore))

local function deepCopy(value: any): any
	if type(value) ~= "table" then
		return value
	end
	local copy = {}
	for k, v in value do
		copy[deepCopy(k)] = deepCopy(v)
	end
	return copy
end

function MemoryStore.new(): MemoryStore
	return setmetatable({ values = {}, failuresLeft = 0, calls = 0 }, MemoryStore)
end

-- Makes the next n calls fail as if the service were down.
function MemoryStore.failNext(self: MemoryStore, n: number)
	self.failuresLeft = n
end

function MemoryStore.peek(self: MemoryStore, key: string): any
	return deepCopy(self.values[key])
end

function MemoryStore.update(self: MemoryStore, key: string, transform: (any) -> any): (boolean, any)
	self.calls += 1
	if self.failuresLeft > 0 then
		self.failuresLeft -= 1
		return false, "simulated DataStore outage"
	end
	local ok, result = pcall(transform, deepCopy(self.values[key]))
	if not ok then
		return false, result
	end
	if result == nil then
		-- Returning nil cancels the write, as with UpdateAsync.
		return true, nil
	end
	self.values[key] = deepCopy(result)
	return true, deepCopy(result)
end

return MemoryStore
