--!strict
-- Every tunable number lives here, so balancing never touches game logic.

export type ColorDef = {
	name: string,
	rgb: { number },
	letter: string,
}

local Config = {
	MinPlayers = 1,
	IntermissionSeconds = 15,
	RoundOverSeconds = 6,
	DropSeconds = 2.5,
	TickSeconds = 0.1,

	Waves = {
		StartWarnSeconds = 4,
		MinWarnSeconds = 1.25,
		WarnDecaySeconds = 0.25,
		StartColors = 3,
		MaxColors = 6,
		ColorsEvery = 3,
		MaxWaves = 30,
	},

	Arena = {
		GridSize = 12,
		TileSize = 8,
		TileGap = 0.5,
		Origin = { 0, 100, 0 },
		-- Eliminated once the root part is this far below the tiles.
		KillDepth = 25,
		LobbyOffset = { 0, 30, -100 },
		NeutralRgb = { 120, 126, 140 },
	},

	-- Each color also carries a letter drawn on the tile, so the game is
	-- playable without telling colors apart.
	Colors = {
		{ name = "Red", rgb = { 231, 76, 60 }, letter = "R" },
		{ name = "Blue", rgb = { 52, 152, 219 }, letter = "B" },
		{ name = "Yellow", rgb = { 241, 196, 15 }, letter = "Y" },
		{ name = "Green", rgb = { 46, 204, 113 }, letter = "G" },
		{ name = "Purple", rgb = { 155, 89, 182 }, letter = "P" },
		{ name = "White", rgb = { 236, 240, 241 }, letter = "W" },
	} :: { ColorDef },

	Pattern = {
		MinTargetShare = 0.12,
		MaxTargetShare = 0.5,
	},

	Rewards = {
		PerWave = 2,
		Participation = 5,
		WinBonus = 50,
	},

	Data = {
		StoreName = "LantaiRuntuh_PlayerData_v1",
		KeyPrefix = "player_",
		AutosaveSeconds = 120,
		LockTimeoutSeconds = 300,
		LockWaitAttempts = 5,
		LockWaitSeconds = 3,
		MaxRetries = 5,
		RetryBaseSeconds = 1,
	},

	Shop = {
		RequestsPerSecond = 2,
		Burst = 4,
	},

	Leaderboard = {
		StoreName = "LantaiRuntuh_Wins_v1",
		Size = 10,
		-- One flush and one top-N read per interval keeps well inside the
		-- OrderedDataStore request budget.
		RefreshSeconds = 60,
	},

	-- Sounds bundled with the Roblox client, so the place still needs no
	-- uploaded assets. Swap in uploaded sound ids for a published game.
	Effects = {
		TickSound = "rbxasset://sounds/volume_slider.ogg",
		DropSound = "rbxasset://sounds/impact_explosion_03.mp3",
		TickFromSeconds = 3,
		ShakeSeconds = 0.45,
		ShakeDegrees = 1.4,
	},
}

return Config
