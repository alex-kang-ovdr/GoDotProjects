--!strict
-- In-memory stand-in for an OrderedDataStore: integer values, read back as a
-- descending top-N. Used in unpublished Studio places and in tests.

local MemoryOrderedStore = {}
MemoryOrderedStore.__index = MemoryOrderedStore

export type Entry = { key: string, value: number }

type State = {
	values: { [string]: number },
	failuresLeft: number,
	writes: number,
}

export type MemoryOrderedStore = typeof(setmetatable({} :: State, MemoryOrderedStore))

function MemoryOrderedStore.new(): MemoryOrderedStore
	return setmetatable({ values = {}, failuresLeft = 0, writes = 0 }, MemoryOrderedStore)
end

-- Makes the next n calls fail as if the service were down.
function MemoryOrderedStore.failNext(self: MemoryOrderedStore, n: number)
	self.failuresLeft = n
end

local function outage(self: MemoryOrderedStore): boolean
	if self.failuresLeft > 0 then
		self.failuresLeft -= 1
		return true
	end
	return false
end

function MemoryOrderedStore.set(self: MemoryOrderedStore, key: string, value: number): (boolean, any)
	if outage(self) then
		return false, "simulated OrderedDataStore outage"
	end
	-- OrderedDataStores only hold integers.
	if type(value) ~= "number" or value ~= math.floor(value) then
		return false, "value must be an integer"
	end
	self.values[key] = value
	self.writes += 1
	return true, nil
end

function MemoryOrderedStore.top(self: MemoryOrderedStore, count: number): (boolean, any)
	if outage(self) then
		return false, "simulated OrderedDataStore outage"
	end
	local entries: { Entry } = {}
	for key, value in self.values do
		table.insert(entries, { key = key, value = value })
	end
	table.sort(entries, function(a, b)
		if a.value ~= b.value then
			return a.value > b.value
		end
		return a.key < b.key
	end)
	local out: { Entry } = {}
	for i = 1, math.min(count, #entries) do
		out[i] = entries[i]
	end
	return true, out
end

return MemoryOrderedStore
