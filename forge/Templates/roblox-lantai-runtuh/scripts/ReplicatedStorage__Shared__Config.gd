extends Node
# Auto-ported ModuleScript by PlayForge RobloxConverter v2 from: ReplicatedStorage/Shared/Config
# Strategy: native | Grades: D=0 A=0 R=0 X=0 V=1

var _data

func _ready() -> void:
	_data = { "MinPlayers": 1, "IntermissionSeconds": 15, "RoundOverSeconds": 6, "DropSeconds": 2.5, "TickSeconds": 0.1, "Waves": { "StartWarnSeconds": 4, "MinWarnSeconds": 1.25, "WarnDecaySeconds": 0.25, "StartColors": 3, "MaxColors": 6, "ColorsEvery": 3, "MaxWaves": 30 }, "Arena": { "GridSize": 12, "TileSize": 8, "TileGap": 0.5, "Origin": [0, 100, 0], "KillDepth": 25, "LobbyOffset": [0, 30, -100], "NeutralRgb": [120, 126, 140] }, "Colors": [{ "name": "Red", "rgb": [231, 76, 60], "letter": "R" }, { "name": "Blue", "rgb": [52, 152, 219], "letter": "B" }, { "name": "Yellow", "rgb": [241, 196, 15], "letter": "Y" }, { "name": "Green", "rgb": [46, 204, 113], "letter": "G" }, { "name": "Purple", "rgb": [155, 89, 182], "letter": "P" }, { "name": "White", "rgb": [236, 240, 241], "letter": "W" }], "Pattern": { "MinTargetShare": 0.12, "MaxTargetShare": 0.5 }, "Rewards": { "PerWave": 2, "Participation": 5, "WinBonus": 50 }, "Data": { "StoreName": "LantaiRuntuh_PlayerData_v1", "KeyPrefix": "player_", "AutosaveSeconds": 120, "LockTimeoutSeconds": 300, "LockWaitAttempts": 5, "LockWaitSeconds": 3, "MaxRetries": 5, "RetryBaseSeconds": 1 }, "Shop": { "RequestsPerSecond": 2, "Burst": 4 }, "Leaderboard": { "StoreName": "LantaiRuntuh_Wins_v1", "Size": 10, "RefreshSeconds": 60 }, "Effects": { "TickSound": "rbxasset://sounds/volume_slider.ogg", "DropSound": "rbxasset://sounds/impact_explosion_03.mp3", "TickFromSeconds": 3, "ShakeSeconds": 0.45, "ShakeDegrees": 1.4 } }
	RobloxCompat.register_module("Config", self)
