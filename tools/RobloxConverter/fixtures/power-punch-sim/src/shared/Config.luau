-- Config.luau
-- Every tunable number in the game lives here: balance, zones, gear, monetization.
-- Change values here and the whole game (map, shop, formulas, UI) follows.

local Config = {}

Config.GameName = "Power Punch Simulator"

Config.Training = {
	BasePowerPerPunch = 1,
	PunchCooldown = 0.15, -- seconds between punches, enforced server-side
	CoinsPerPowerGained = 0.5, -- every punch also pays out coins at this ratio
	AutoTrainInterval = 0.6, -- punch rate for the Auto Train gamepass
}

Config.Rebirth = {
	BaseCost = 10_000, -- power needed for the first rebirth
	CostGrowth = 3, -- each rebirth costs 3x the previous one
	BonusPerRebirth = 0.5, -- +50% power per punch, permanently, per rebirth
}

-- Gear must be bought in order; your multiplier is the last gear you bought.
Config.Gear = {
	{ name = "Foam Gloves", cost = 100, multiplier = 2, color = Color3.fromRGB(240, 200, 80) },
	{ name = "Leather Gloves", cost = 1_000, multiplier = 5, color = Color3.fromRGB(160, 100, 50) },
	{ name = "Iron Gauntlets", cost = 10_000, multiplier = 12, color = Color3.fromRGB(180, 180, 190) },
	{ name = "Golden Fists", cost = 100_000, multiplier = 30, color = Color3.fromRGB(255, 200, 40) },
	{ name = "Diamond Crushers", cost = 1_000_000, multiplier = 75, color = Color3.fromRGB(120, 220, 255) },
	{ name = "Void Knuckles", cost = 10_000_000, multiplier = 200, color = Color3.fromRGB(140, 60, 220) },
}

-- Zones are laid out west-to-east by MapBuilder. Standing on a zone's training
-- pads multiplies your punches, but only if you meet the power requirement
-- (validated on the server -- walking through a gate exploit gains nothing).
Config.Zones = {
	{
		name = "Beach",
		powerRequired = 0,
		multiplier = 1,
		floorColor = Color3.fromRGB(238, 214, 160),
		accentColor = Color3.fromRGB(60, 170, 90),
		floorMaterial = Enum.Material.Sand,
	},
	{
		name = "City",
		powerRequired = 5_000,
		multiplier = 3,
		floorColor = Color3.fromRGB(112, 112, 118),
		accentColor = Color3.fromRGB(80, 140, 210),
		floorMaterial = Enum.Material.Concrete,
	},
	{
		name = "Volcano",
		powerRequired = 50_000,
		multiplier = 8,
		floorColor = Color3.fromRGB(62, 48, 46),
		accentColor = Color3.fromRGB(255, 100, 30),
		floorMaterial = Enum.Material.Basalt,
	},
	{
		name = "Space",
		powerRequired = 500_000,
		multiplier = 20,
		floorColor = Color3.fromRGB(42, 38, 62),
		accentColor = Color3.fromRGB(90, 220, 255),
		floorMaterial = Enum.Material.Slate,
	},
}

-- The VIP island hangs off the Beach and requires the VIP gamepass instead of power.
Config.VipZone = {
	name = "VIP Island",
	multiplier = 50,
	floorColor = Color3.fromRGB(235, 225, 180),
	accentColor = Color3.fromRGB(255, 215, 0),
	floorMaterial = Enum.Material.Marble,
}

-- ============================== MONETIZATION ==============================
-- Fill these IDs in from the Creator Dashboard after publishing the game
-- (Creator Dashboard -> your experience -> Monetization -> Passes / Developer Products).
-- With an ID of 0 the item is hidden from the shop and the game runs fine without it.

Config.GamePasses = {
	DoublePower = 0, -- suggested price: 199 R$
	DoubleCoins = 0, -- suggested price: 199 R$
	AutoTrain = 0, -- suggested price: 349 R$
	VIP = 0, -- suggested price: 499 R$
}

Config.GamePassInfo = {
	DoublePower = { title = "2x Power", desc = "Every punch gives double power, forever." },
	DoubleCoins = { title = "2x Coins", desc = "Every punch pays out double coins, forever." },
	AutoTrain = { title = "Auto Train", desc = "Hands-free training: punch automatically while you chill." },
	VIP = { title = "VIP Island", desc = "Unlock the exclusive x50 VIP training island." },
}

Config.DevProducts = {
	{ key = "SmallCoins", id = 0, coins = 25_000, label = "25K Coins" }, -- suggested: 49 R$
	{ key = "MediumCoins", id = 0, coins = 150_000, label = "150K Coins" }, -- suggested: 199 R$
	{ key = "LargeCoins", id = 0, coins = 1_000_000, label = "1M Coins" }, -- suggested: 799 R$
}

return Config
