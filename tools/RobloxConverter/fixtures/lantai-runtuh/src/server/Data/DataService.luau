--!strict
-- Session-locked player data on top of any store with UpdateAsync semantics.
--
-- Each record is { data = ..., lock = { jobId, at } }. A server only loads a
-- record it can lock, and only saves while it still holds the lock. That
-- stops the classic Roblox duplication bug: a player hops servers, the old
-- server saves late, and overwrites progress made on the new one.
--
-- Everything Roblox-specific (the store, the clock, waiting) is injected, so
-- this module runs unchanged in tests.

local DataService = {}
DataService.__index = DataService

export type Store = {
	update: (self: any, key: string, transform: (any) -> any) -> (boolean, any),
}

export type Schema = {
	reconcile: (raw: any) -> any,
}

export type Options = {
	store: Store,
	schema: Schema,
	jobId: string,
	now: () -> number,
	wait: (seconds: number) -> (),
	log: ((message: string) -> ())?,
	keyPrefix: string,
	lockTimeoutSeconds: number,
	lockWaitAttempts: number,
	lockWaitSeconds: number,
	maxRetries: number,
	retryBaseSeconds: number,
}

type Lock = { jobId: string, at: number }

type Profile = {
	data: any,
	lost: boolean,
	-- Set once unload starts. Leaving and server shutdown both unload the
	-- same player, and only the first call may do it.
	releasing: boolean,
}

type State = {
	options: Options,
	profiles: { [number]: Profile },
}

export type DataService = typeof(setmetatable({} :: State, DataService))

local function deepCopy(value: any): any
	if type(value) ~= "table" then
		return value
	end
	local copy = {}
	for k, v in value do
		copy[k] = deepCopy(v)
	end
	return copy
end

local function readLock(record: any): Lock?
	if type(record) ~= "table" or type(record.lock) ~= "table" then
		return nil
	end
	local lock = record.lock
	if type(lock.jobId) ~= "string" or type(lock.at) ~= "number" then
		return nil
	end
	return lock
end

function DataService.new(options: Options): DataService
	return setmetatable({ options = options, profiles = {} }, DataService)
end

function DataService.key(self: DataService, userId: number): string
	return self.options.keyPrefix .. tostring(userId)
end

function DataService._log(self: DataService, message: string)
	local log = self.options.log
	if log then
		log(message)
	end
end

-- Retries transient store errors with exponential backoff.
function DataService._update(self: DataService, key: string, transform: (any) -> any): (boolean, any)
	local o = self.options
	local lastError: any = nil
	for attempt = 1, o.maxRetries do
		local ok, result = o.store:update(key, transform)
		if ok then
			return true, result
		end
		lastError = result
		self:_log(string.format("store error on %s (attempt %d/%d): %s", key, attempt, o.maxRetries, tostring(result)))
		if attempt < o.maxRetries then
			o.wait(o.retryBaseSeconds * 2 ^ (attempt - 1))
		end
	end
	return false, lastError
end

-- Loads and locks a player's record. Returns false and a reason when the
-- store is down or another live server still holds the lock.
function DataService.load(self: DataService, userId: number): (boolean, any)
	local o = self.options
	local key = self:key(userId)

	for attempt = 1, o.lockWaitAttempts do
		-- The transform may run more than once (UpdateAsync retries on
		-- conflict), so it only reports through these locals.
		local acquired = false
		local loaded: any = nil

		local ok, err = self:_update(key, function(old: any): any
			acquired = false
			local lock = readLock(old)
			local now = o.now()
			local free = lock == nil or lock.jobId == o.jobId or now - lock.at >= o.lockTimeoutSeconds
			if not free then
				return nil
			end
			if lock and lock.jobId ~= o.jobId then
				self:_log(string.format("taking over stale lock on %s from %s", key, lock.jobId))
			end
			loaded = o.schema.reconcile(if type(old) == "table" then old.data else nil)
			acquired = true
			return { data = loaded, lock = { jobId = o.jobId, at = now } }
		end)

		if not ok then
			return false, "Could not reach the data store: " .. tostring(err)
		end
		if acquired then
			self.profiles[userId] = { data = loaded, lost = false, releasing = false }
			return true, loaded
		end
		if attempt < o.lockWaitAttempts then
			o.wait(o.lockWaitSeconds)
		end
	end

	return false, "Your data is still open on another server. Please rejoin in a minute."
end

function DataService.get(self: DataService, userId: number): any
	local profile = self.profiles[userId]
	return if profile then profile.data else nil
end

function DataService.isLoaded(self: DataService, userId: number): boolean
	local profile = self.profiles[userId]
	return profile ~= nil and not profile.releasing
end

function DataService.userIds(self: DataService): { number }
	local ids = {}
	for userId, profile in self.profiles do
		if not profile.releasing then
			table.insert(ids, userId)
		end
	end
	return ids
end

-- Writes the current data. With release, also gives up the lock so another
-- server can load the player immediately.
function DataService.save(self: DataService, userId: number, release: boolean): (boolean, string?)
	local o = self.options
	local profile = self.profiles[userId]
	if not profile then
		return false, "not loaded"
	end
	if profile.lost then
		return false, "session lost"
	end
	if profile.releasing and not release then
		-- The release save already in flight writes this same data.
		return true, nil
	end

	local snapshot = deepCopy(profile.data)
	local stillOwned = false

	local ok, err = self:_update(self:key(userId), function(old: any): any
		local lock = readLock(old)
		stillOwned = lock ~= nil and lock.jobId == o.jobId
		if not stillOwned then
			-- Another server took the record over. Writing now would
			-- overwrite its newer progress.
			return nil
		end
		return {
			data = snapshot,
			lock = if release then nil else { jobId = o.jobId, at = o.now() },
		}
	end)

	if not ok then
		return false, tostring(err)
	end
	if not stillOwned then
		profile.lost = true
		self:_log(string.format("session lost for %d; save skipped", userId))
		return false, "session lost"
	end
	return true, nil
end

-- Saves with release and forgets the player.
function DataService.unload(self: DataService, userId: number): (boolean, string?)
	local profile = self.profiles[userId]
	if not profile or profile.releasing then
		return false, "not loaded"
	end
	profile.releasing = true
	local ok, err = self:save(userId, true)
	self.profiles[userId] = nil
	return ok, err
end

return DataService
