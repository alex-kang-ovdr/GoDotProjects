-- Formulas.luau
-- Pure functions shared by the server (authoritative math) and the client
-- (UI display and prediction). No state, no side effects.

local Config = require(script.Parent.Config)

local Formulas = {}

function Formulas.gearMultiplier(gearLevel: number): number
	if gearLevel <= 0 then
		return 1
	end
	local gear = Config.Gear[math.min(gearLevel, #Config.Gear)]
	return gear.multiplier
end

function Formulas.rebirthMultiplier(rebirths: number): number
	return 1 + rebirths * Config.Rebirth.BonusPerRebirth
end

-- state: { gearLevel: number, rebirths: number, zoneMultiplier: number?, hasDoublePower: boolean? }
function Formulas.powerPerPunch(state): number
	local amount = Config.Training.BasePowerPerPunch
		* Formulas.gearMultiplier(state.gearLevel)
		* Formulas.rebirthMultiplier(state.rebirths)
		* (state.zoneMultiplier or 1)
	if state.hasDoublePower then
		amount *= 2
	end
	return math.max(1, math.floor(amount + 0.5))
end

function Formulas.coinsForPower(powerGained: number, hasDoubleCoins: boolean?): number
	local coins = powerGained * Config.Training.CoinsPerPowerGained
	if hasDoubleCoins then
		coins *= 2
	end
	return math.floor(coins + 0.5)
end

function Formulas.rebirthCost(rebirths: number): number
	return math.floor(Config.Rebirth.BaseCost * Config.Rebirth.CostGrowth ^ rebirths)
end

local SUFFIXES = { "", "K", "M", "B", "T", "Qa", "Qi" }

-- 1234567 -> "1.23M", 950 -> "950"
function Formulas.abbreviate(n: number): string
	n = math.floor(n)
	if n < 1000 then
		return tostring(n)
	end
	local index = math.min(math.floor(math.log10(n) / 3), #SUFFIXES - 1)
	local scaled = n / 1000 ^ index
	local formatted
	if scaled >= 100 then
		formatted = string.format("%.0f", scaled)
	elseif scaled >= 10 then
		formatted = string.format("%.1f", scaled)
	else
		formatted = string.format("%.2f", scaled)
	end
	return formatted .. SUFFIXES[index + 1]
end

return Formulas
