--!strict
-- Adapts real DataStores to the store contracts the data modules expect. In
-- an unpublished Studio place, where DataStores are unavailable, it falls back
-- to in-memory stores so the game still runs.

local DataStoreService = game:GetService("DataStoreService")
local RunService = game:GetService("RunService")

local MemoryOrderedStore = require(script.Parent.MemoryOrderedStore)
local MemoryStore = require(script.Parent.MemoryStore)

local RobloxStore = {}

export type Store = {
	update: (self: any, key: string, transform: (any) -> any) -> (boolean, any),
}

export type OrderedStore = {
	set: (self: any, key: string, value: number) -> (boolean, any),
	top: (self: any, count: number) -> (boolean, any),
}

-- Studio without "Enable Studio Access to API Services" errors on every
-- call. Probe once instead of making every caller wait out retries.
local function usable(store: GlobalDataStore): boolean
	if not RunService:IsStudio() then
		return true
	end
	return (pcall(function()
		store:GetAsync("__probe")
	end))
end

function RobloxStore.open(name: string): (Store, boolean)
	local ok, dataStore = pcall(function()
		return DataStoreService:GetDataStore(name)
	end)

	if not ok or not usable(dataStore) then
		warn("[Data] DataStore unavailable, using in-memory storage. Progress will not persist.")
		local memory = MemoryStore.new()
		local fallback: Store = {
			update = function(_, key: string, transform: (any) -> any): (boolean, any)
				return memory:update(key, transform)
			end,
		}
		return fallback, false
	end

	local store: Store = {
		update = function(_, key: string, transform: (any) -> any): (boolean, any)
			return pcall(function()
				return dataStore:UpdateAsync(key, transform)
			end)
		end,
	}
	return store, true
end

function RobloxStore.openOrdered(name: string): (OrderedStore, boolean)
	local ok, ordered = pcall(function()
		return DataStoreService:GetOrderedDataStore(name)
	end)

	if not ok or not usable(ordered) then
		warn("[Data] OrderedDataStore unavailable, the leaderboard only shows this server.")
		local memory = MemoryOrderedStore.new()
		local fallback: OrderedStore = {
			set = function(_, key: string, value: number): (boolean, any)
				return memory:set(key, value)
			end,
			top = function(_, count: number): (boolean, any)
				return memory:top(count)
			end,
		}
		return fallback, false
	end

	local store: OrderedStore = {
		set = function(_, key: string, value: number): (boolean, any)
			return pcall(function()
				ordered:SetAsync(key, value)
			end)
		end,
		top = function(_, count: number): (boolean, any)
			return pcall(function()
				local page = ordered:GetSortedAsync(false, count):GetCurrentPage()
				local entries = {}
				for _, item in page do
					table.insert(entries, { key = item.key, value = item.value })
				end
				return entries
			end)
		end,
	}
	return store, true
end

return RobloxStore
