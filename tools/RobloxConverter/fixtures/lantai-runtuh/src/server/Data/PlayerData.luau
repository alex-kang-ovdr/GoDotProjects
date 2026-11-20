--!strict
-- The saved player record and how to repair whatever comes out of the store.

local PlayerData = {}

PlayerData.VERSION = 1

export type Data = {
	version: number,
	coins: number,
	wins: number,
	roundsPlayed: number,
	bestWave: number,
	ownedTrails: { [string]: boolean },
	equippedTrail: string?,
}

function PlayerData.default(): Data
	return {
		version = PlayerData.VERSION,
		coins = 0,
		wins = 0,
		roundsPlayed = 0,
		bestWave = 0,
		ownedTrails = {},
		equippedTrail = nil,
	}
end

local function count(value: any): number
	if type(value) ~= "number" or value ~= value or value == math.huge then
		return 0
	end
	return math.max(0, math.floor(value))
end

-- Accepts anything (nil for a new player, a record from an older version,
-- a corrupted value) and returns valid data. Never throws: a bad record must
-- not lock a player out of the game.
function PlayerData.reconcile(raw: any): Data
	local data = PlayerData.default()
	if type(raw) ~= "table" then
		return data
	end

	data.coins = count(raw.coins)
	data.wins = count(raw.wins)
	data.roundsPlayed = count(raw.roundsPlayed)
	data.bestWave = count(raw.bestWave)

	if type(raw.ownedTrails) == "table" then
		for id, owned in raw.ownedTrails do
			if type(id) == "string" and owned == true then
				data.ownedTrails[id] = true
			end
		end
	end

	local equipped = raw.equippedTrail
	if type(equipped) == "string" and data.ownedTrails[equipped] then
		data.equippedTrail = equipped
	end

	return data
end

return PlayerData
