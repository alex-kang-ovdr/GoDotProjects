--!strict
-- Builds the lobby and the tile grid in Workspace, and moves characters
-- between them. All geometry is generated here, so the place needs no assets.

local ReplicatedStorage = game:GetService("ReplicatedStorage")
local TweenService = game:GetService("TweenService")
local Workspace = game:GetService("Workspace")

local Config = require(ReplicatedStorage.Shared.Config)
local Pattern = require(ReplicatedStorage.Shared.Pattern)

local ArenaService = {}

local arena = Config.Arena
local ORIGIN = Vector3.new(arena.Origin[1], arena.Origin[2], arena.Origin[3])
local LOBBY = ORIGIN + Vector3.new(arena.LobbyOffset[1], arena.LobbyOffset[2], arena.LobbyOffset[3])
local NEUTRAL = Color3.fromRGB(arena.NeutralRgb[1], arena.NeutralRgb[2], arena.NeutralRgb[3])
local FADE = TweenInfo.new(0.2, Enum.EasingStyle.Quad, Enum.EasingDirection.Out)
local LOBBY_SIZE = Vector3.new(64, 2, 36)

local tiles: { Part } = {}
local letters: { TextLabel } = {}
local lobbySpawn: SpawnLocation

local function colorOf(index: number): Color3
	local rgb = Config.Colors[index].rgb
	return Color3.fromRGB(rgb[1], rgb[2], rgb[3])
end

local function part(props: { [string]: any }): Part
	local p = Instance.new("Part")
	p.Anchored = true
	p.TopSurface = Enum.SurfaceType.Smooth
	p.BottomSurface = Enum.SurfaceType.Smooth
	p.Material = Enum.Material.SmoothPlastic
	for key, value in props do
		(p :: any)[key] = value
	end
	return p
end

local function buildLobby(folder: Folder)
	local size = LOBBY_SIZE
	local floor = part({
		Name = "LobbyFloor",
		Size = size,
		Position = LOBBY,
		Color = Color3.fromRGB(52, 58, 72),
	})
	floor.Parent = folder

	-- Low glass walls so nobody walks off the lobby by accident.
	local wallHeight = 6
	local walls = {
		{ Vector3.new(size.X, wallHeight, 1), Vector3.new(0, wallHeight / 2 + 1, size.Z / 2) },
		{ Vector3.new(size.X, wallHeight, 1), Vector3.new(0, wallHeight / 2 + 1, -size.Z / 2) },
		{ Vector3.new(1, wallHeight, size.Z), Vector3.new(size.X / 2, wallHeight / 2 + 1, 0) },
		{ Vector3.new(1, wallHeight, size.Z), Vector3.new(-size.X / 2, wallHeight / 2 + 1, 0) },
	}
	for i, wall in walls do
		local p = part({
			Name = "LobbyWall" .. i,
			Size = wall[1],
			Position = LOBBY + wall[2],
			Transparency = 0.7,
			Material = Enum.Material.Glass,
			Color = Color3.fromRGB(180, 220, 255),
		})
		p.Parent = folder
	end

	local spawn = Instance.new("SpawnLocation")
	spawn.Name = "LobbySpawn"
	spawn.Anchored = true
	spawn.Neutral = true
	spawn.Duration = 0
	spawn.Size = Vector3.new(10, 1, 10)
	spawn.Position = LOBBY + Vector3.new(0, 1.5, 0)
	spawn.Color = Color3.fromRGB(255, 196, 0)
	spawn.Material = Enum.Material.Neon
	spawn.TopSurface = Enum.SurfaceType.Smooth
	spawn.Parent = folder
	lobbySpawn = spawn
end

local function buildGrid(folder: Folder)
	local n, s, gap = arena.GridSize, arena.TileSize, arena.TileGap
	local span = n * s + (n - 1) * gap
	local first = -span / 2 + s / 2

	for z = 0, n - 1 do
		for x = 0, n - 1 do
			local tile = part({
				Name = string.format("Tile_%d_%d", x, z),
				Size = Vector3.new(s, 2, s),
				Position = ORIGIN + Vector3.new(first + x * (s + gap), 0, first + z * (s + gap)),
				Color = NEUTRAL,
			})

			local gui = Instance.new("SurfaceGui")
			gui.Face = Enum.NormalId.Top
			gui.LightInfluence = 0
			gui.SizingMode = Enum.SurfaceGuiSizingMode.PixelsPerStud
			gui.PixelsPerStud = 25
			local label = Instance.new("TextLabel")
			label.BackgroundTransparency = 1
			label.Size = UDim2.fromScale(1, 1)
			label.Font = Enum.Font.GothamBlack
			label.TextScaled = true
			label.TextColor3 = Color3.new(1, 1, 1)
			label.TextTransparency = 0.45
			label.Text = ""
			label.Parent = gui
			gui.Parent = tile

			tile.Parent = folder
			tiles[z * n + x + 1] = tile
			letters[z * n + x + 1] = label
		end
	end
end

function ArenaService.build()
	local folder = Instance.new("Folder")
	folder.Name = "Arena"
	buildLobby(folder)
	buildGrid(folder)
	folder.Parent = Workspace
end

local function show(index: number, color: Color3, letter: string)
	local tile = tiles[index]
	tile.Color = color
	tile.Transparency = 0
	tile.CanCollide = true
	tile.Material = Enum.Material.SmoothPlastic
	letters[index].Text = letter
	letters[index].TextTransparency = 0.45
end

function ArenaService.reset()
	for i in tiles do
		show(i, NEUTRAL, "")
	end
end

function ArenaService.applyLayout(layout: Pattern.Layout)
	for i, colorIndex in layout.cells do
		show(i, colorOf(colorIndex), Config.Colors[colorIndex].letter)
	end
end

function ArenaService.drop(layout: Pattern.Layout)
	for i, tile in tiles do
		if Pattern.isSafe(layout, i) then
			tile.Material = Enum.Material.Neon
		else
			tile.CanCollide = false
			TweenService:Create(tile, FADE, { Transparency = 1 }):Play()
			TweenService:Create(letters[i], FADE, { TextTransparency = 1 }):Play()
		end
	end
end

-- Height below which a character counts as fallen.
function ArenaService.killHeight(): number
	return ORIGIN.Y - arena.KillDepth
end

local function placeCharacter(player: Player, position: Vector3)
	local character = player.Character
	if not character then
		return
	end
	local root = character:FindFirstChild("HumanoidRootPart") :: BasePart?
	if not root then
		return
	end
	root.AssemblyLinearVelocity = Vector3.zero
	character:PivotTo(CFrame.new(position))
end

function ArenaService.sendToTile(player: Player, index: number)
	placeCharacter(player, tiles[index].Position + Vector3.new(0, 4, 0))
end

function ArenaService.sendToLobby(player: Player)
	local jitter = Vector3.new(math.random(-12, 12), 0, math.random(-6, 6))
	placeCharacter(player, lobbySpawn.Position + Vector3.new(0, 4, 0) + jitter)
end

-- Where the leaderboard stands: just behind the lobby's back wall. Its Back
-- face (+Z) looks into the lobby.
function ArenaService.boardCFrame(): CFrame
	return CFrame.new(LOBBY + Vector3.new(0, 11, -(LOBBY_SIZE.Z / 2 + 1)))
end

function ArenaService.tileCount(): number
	return #tiles
end

return ArenaService
