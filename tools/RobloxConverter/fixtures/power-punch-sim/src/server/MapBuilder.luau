-- MapBuilder.luau
-- Builds the entire map from code at server start: zone platforms, training
-- pads, gates, decorations, spawn, and the leaderboard board. No manual Studio
-- editing needed -- tweak Config.Zones and the world rebuilds to match.

local ReplicatedStorage = game:GetService("ReplicatedStorage")
local Lighting = game:GetService("Lighting")

local Config = require(ReplicatedStorage.Shared.Config)
local Formulas = require(ReplicatedStorage.Shared.Formulas)

local ZONE_SIZE = 140 -- each main zone is a ZONE_SIZE x ZONE_SIZE platform
local WALL_HEIGHT = 24
local PAD_OFFSETS = {
	Vector3.new(-38, 0, 28),
	Vector3.new(0, 0, -38),
	Vector3.new(38, 0, 28),
}

local MapBuilder = {}

-- Axis-aligned regions used by Training to validate zone bonuses server-side.
-- Each entry: { minX, maxX, minZ, maxZ, info = {name, powerRequired, multiplier, vipOnly?} }
local zoneRegions = {}

local function part(props: { [string]: any }): Part
	local p = Instance.new("Part")
	p.Anchored = true
	p.TopSurface = Enum.SurfaceType.Smooth
	p.BottomSurface = Enum.SurfaceType.Smooth
	for key, value in props do
		if key ~= "Parent" then
			p[key] = value
		end
	end
	p.Parent = props.Parent
	return p
end

local function billboard(adornee: BasePart, text: string, color: Color3, offsetY: number, size: UDim2)
	local gui = Instance.new("BillboardGui")
	gui.Adornee = adornee
	gui.Size = size
	gui.StudsOffsetWorldSpace = Vector3.new(0, offsetY, 0)
	gui.AlwaysOnTop = false
	gui.MaxDistance = 400

	local label = Instance.new("TextLabel")
	label.Size = UDim2.fromScale(1, 1)
	label.BackgroundTransparency = 1
	label.Text = text
	label.TextColor3 = color
	label.TextScaled = true
	label.Font = Enum.Font.FredokaOne
	label.TextStrokeTransparency = 0.4
	label.Parent = gui

	gui.Parent = adornee
	return gui, label
end

local function buildTrainingPads(parent: Folder, center: Vector3, offsets: { Vector3 }, accent: Color3, multiplier: number)
	for _, offset in offsets do
		local pad = part({
			Name = "TrainingPad",
			Shape = Enum.PartType.Cylinder,
			Size = Vector3.new(1, 14, 14),
			CFrame = CFrame.new(center + offset + Vector3.new(0, 0.5, 0)) * CFrame.Angles(0, 0, math.rad(90)),
			Color = accent,
			Material = Enum.Material.Neon,
			Parent = parent,
		})
		billboard(pad, `x{multiplier} 💪`, accent, 6, UDim2.fromScale(8, 2.4))
	end
end

local function buildDecorations(parent: Folder, center: Vector3, accent: Color3, seed: number)
	local rng = Random.new(seed)
	for _ = 1, 8 do
		-- Ring placement near the zone edges so pillars never block the pads.
		local angle = rng:NextNumber(0, math.pi * 2)
		local radius = rng:NextNumber(46, 62)
		local width = rng:NextNumber(4, 8)
		local height = rng:NextNumber(8, 32)
		local position = center + Vector3.new(math.cos(angle) * radius, height / 2, math.sin(angle) * radius)

		local pillar = part({
			Name = "Pillar",
			Size = Vector3.new(width, height, width),
			CFrame = CFrame.new(position) * CFrame.Angles(0, angle, 0),
			Color = accent,
			Material = Enum.Material.SmoothPlastic,
			Parent = parent,
		})
		part({
			Name = "PillarCap",
			Size = Vector3.new(width + 1, 1.5, width + 1),
			CFrame = pillar.CFrame * CFrame.new(0, height / 2 + 0.75, 0),
			Color = accent,
			Material = Enum.Material.Neon,
			Parent = parent,
		})
	end
end

function MapBuilder.getZoneAt(position: Vector3)
	for _, region in zoneRegions do
		if
			position.X >= region.minX
			and position.X <= region.maxX
			and position.Z >= region.minZ
			and position.Z <= region.maxZ
		then
			return region.info
		end
	end
	return nil
end

function MapBuilder.build()
	local map = Instance.new("Folder")
	map.Name = "Map"
	local gates = Instance.new("Folder")
	gates.Name = "ZoneGates"

	-- ============================== MAIN ZONES ==============================
	for index, zone in Config.Zones do
		local centerX = (index - 1) * ZONE_SIZE
		local center = Vector3.new(centerX, 0, 0)
		local zoneFolder = Instance.new("Folder")
		zoneFolder.Name = zone.name
		zoneFolder.Parent = map

		part({
			Name = "Floor",
			Size = Vector3.new(ZONE_SIZE, 4, ZONE_SIZE),
			CFrame = CFrame.new(centerX, -2, 0),
			Color = zone.floorColor,
			Material = zone.floorMaterial,
			Parent = zoneFolder,
		})

		buildTrainingPads(zoneFolder, center, PAD_OFFSETS, zone.accentColor, zone.multiplier)
		buildDecorations(zoneFolder, center, zone.accentColor, index * 7919)

		table.insert(zoneRegions, {
			minX = centerX - ZONE_SIZE / 2,
			maxX = centerX + ZONE_SIZE / 2,
			minZ = -ZONE_SIZE / 2,
			maxZ = ZONE_SIZE / 2,
			info = {
				name = zone.name,
				powerRequired = zone.powerRequired,
				multiplier = zone.multiplier,
			},
		})

		-- Gate wall on the western edge of every zone after the first.
		if index > 1 then
			local gate = part({
				Name = zone.name .. "Gate",
				Size = Vector3.new(2, WALL_HEIGHT, ZONE_SIZE),
				CFrame = CFrame.new(centerX - ZONE_SIZE / 2, WALL_HEIGHT / 2, 0),
				Color = Color3.fromRGB(235, 87, 87),
				Material = Enum.Material.ForceField,
				Transparency = 0.2,
				Parent = gates,
			})
			gate:SetAttribute("PowerRequired", zone.powerRequired)
			gate:SetAttribute("ZoneName", zone.name)
			gate:SetAttribute("VipOnly", false)
			billboard(
				gate,
				`{zone.name} — {Formulas.abbreviate(zone.powerRequired)} Power`,
				Color3.fromRGB(255, 255, 255),
				WALL_HEIGHT / 2 + 4,
				UDim2.fromScale(24, 4)
			)
		end
	end

	-- ============================== VIP ISLAND ==============================
	local vip = Config.VipZone
	local vipFolder = Instance.new("Folder")
	vipFolder.Name = "VipIsland"
	vipFolder.Parent = map

	part({
		Name = "Floor",
		Size = Vector3.new(100, 4, 100),
		CFrame = CFrame.new(0, -2, -170),
		Color = vip.floorColor,
		Material = vip.floorMaterial,
		Parent = vipFolder,
	})
	part({
		Name = "Bridge",
		Size = Vector3.new(14, 4, 50),
		CFrame = CFrame.new(0, -2, -95),
		Color = vip.floorColor,
		Material = Enum.Material.WoodPlanks,
		Parent = vipFolder,
	})

	local vipPadOffsets = {
		Vector3.new(-28, 0, 20),
		Vector3.new(0, 0, -28),
		Vector3.new(28, 0, 20),
	}
	buildTrainingPads(vipFolder, Vector3.new(0, 0, -170), vipPadOffsets, vip.accentColor, vip.multiplier)
	buildDecorations(vipFolder, Vector3.new(0, 0, -170), vip.accentColor, 424242)

	table.insert(zoneRegions, {
		minX = -50,
		maxX = 50,
		minZ = -220,
		maxZ = -120,
		info = {
			name = vip.name,
			powerRequired = 0,
			multiplier = vip.multiplier,
			vipOnly = true,
		},
	})

	local vipGate = part({
		Name = "VipGate",
		Size = Vector3.new(14, WALL_HEIGHT, 2),
		CFrame = CFrame.new(0, WALL_HEIGHT / 2, -95),
		Color = Color3.fromRGB(255, 215, 0),
		Material = Enum.Material.ForceField,
		Transparency = 0.2,
		Parent = gates,
	})
	vipGate:SetAttribute("PowerRequired", 0)
	vipGate:SetAttribute("ZoneName", vip.name)
	vipGate:SetAttribute("VipOnly", true)
	billboard(vipGate, "👑 VIP Island — Gamepass", vip.accentColor, WALL_HEIGHT / 2 + 4, UDim2.fromScale(24, 4))

	-- ============================== SPAWN & EXTRAS ==============================
	local spawn = Instance.new("SpawnLocation")
	spawn.Size = Vector3.new(12, 1, 12)
	spawn.CFrame = CFrame.new(0, 0.5, 52)
	spawn.Anchored = true
	spawn.Neutral = true
	spawn.Duration = 0
	spawn.Color = Color3.fromRGB(250, 250, 250)
	spawn.Material = Enum.Material.SmoothPlastic
	spawn.TopSurface = Enum.SurfaceType.Smooth
	spawn.Parent = map

	local board = part({
		Name = "LeaderboardBoard",
		Size = Vector3.new(26, 14, 2),
		CFrame = CFrame.new(0, 9, 66),
		Color = Color3.fromRGB(34, 39, 54),
		Material = Enum.Material.SmoothPlastic,
		Parent = map,
	})

	-- Fell off the map? Fast respawn instead of a long fall to the void.
	local killPlane = part({
		Name = "KillPlane",
		Size = Vector3.new(4000, 1, 4000),
		CFrame = CFrame.new(200, -45, 0),
		Transparency = 1,
		CanCollide = false,
		Parent = map,
	})
	killPlane.Touched:Connect(function(hit)
		local humanoid = hit.Parent and hit.Parent:FindFirstChildOfClass("Humanoid")
		if humanoid then
			humanoid.Health = 0
		end
	end)

	local atmosphere = Instance.new("Atmosphere")
	atmosphere.Density = 0.3
	atmosphere.Parent = Lighting
	local bloom = Instance.new("BloomEffect")
	bloom.Intensity = 0.4
	bloom.Size = 24
	bloom.Threshold = 1.2
	bloom.Parent = Lighting

	map.Parent = workspace
	gates.Parent = workspace

	return { leaderboardPart = board }
end

return MapBuilder
