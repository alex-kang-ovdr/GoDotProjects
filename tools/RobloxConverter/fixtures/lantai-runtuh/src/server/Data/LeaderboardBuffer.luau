--!strict
-- Collects win counts and writes them to the ordered store in batches.
--
-- Writing on every win would spend the OrderedDataStore budget on players
-- who win several rounds in a row. Instead each player keeps only their
-- latest count until the next flush, so a flush costs at most one write per
-- player whose wins changed.

local LeaderboardBuffer = {}
LeaderboardBuffer.__index = LeaderboardBuffer

export type OrderedStore = {
	set: (self: any, key: string, value: number) -> (boolean, any),
	top: (self: any, count: number) -> (boolean, any),
}

type State = {
	store: OrderedStore,
	pending: { [number]: number },
	-- Last value each player has in the store, so unchanged counts (a coin
	-- update, a rejoin) cost no write.
	stored: { [number]: number },
}

export type LeaderboardBuffer = typeof(setmetatable({} :: State, LeaderboardBuffer))

function LeaderboardBuffer.new(store: OrderedStore): LeaderboardBuffer
	return setmetatable({ store = store, pending = {}, stored = {} }, LeaderboardBuffer)
end

function LeaderboardBuffer.record(self: LeaderboardBuffer, userId: number, wins: number)
	if wins > 0 and wins ~= self.stored[userId] then
		self.pending[userId] = wins
	end
end

function LeaderboardBuffer.pendingCount(self: LeaderboardBuffer): number
	local n = 0
	for _ in self.pending do
		n += 1
	end
	return n
end

-- Writes everything pending. Returns how many writes succeeded and failed;
-- failed entries stay queued for the next flush.
function LeaderboardBuffer.flush(self: LeaderboardBuffer): (number, number)
	-- Swap the table first: store calls yield, and wins recorded meanwhile
	-- must land in the next batch rather than be lost.
	local batch = self.pending
	self.pending = {}

	local written, failed = 0, 0
	for userId, wins in batch do
		local ok = self.store:set(tostring(userId), wins)
		if ok then
			written += 1
			self.stored[userId] = wins
		else
			failed += 1
			-- Don't clobber a newer count recorded while we were writing.
			if self.pending[userId] == nil then
				self.pending[userId] = wins
			end
		end
	end
	return written, failed
end

return LeaderboardBuffer
