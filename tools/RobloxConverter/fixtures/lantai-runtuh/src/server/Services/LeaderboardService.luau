--!strict
-- Global "most wins" board in the lobby, backed by an OrderedDataStore.

local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local Workspace = game:GetService("Workspace")

local Config = require(ReplicatedStorage.Shared.Config)

local LeaderboardBuffer = require(script.Parent.Parent.Data.LeaderboardBuffer)
local RobloxStore = require(script.Parent.Parent.Data.RobloxStore)
local ArenaService = require(script.Parent.ArenaService)
local Profiles = require(script.Parent.Profiles)

local LeaderboardService = {}

local settings = Config.Leaderboard
local store: RobloxStore.OrderedStore
local buffer: LeaderboardBuffer.LeaderboardBuffer
local rows: { TextLabel } = {}
local status: TextLabel
local names: { [number]: string } = {}

local function nameOf(userId: number): string
	local cached = names[userId]
	if cached then
		return cached
	end
	local player = Players:GetPlayerByUserId(userId)
	local name: string? = if player then player.Name else nil
	if not name then
		local ok, result = pcall(function()
			return Players:GetNameFromUserIdAsync(userId)
		end)
		name = if ok then result else nil
	end
	-- Test players in Studio have negative ids with no account behind them.
	local resolved = name or ("Player " .. tostring(userId))
	names[userId] = resolved
	return resolved
end

local function label(parent: Instance, text: string, height: number, color: Color3): TextLabel
	local l = Instance.new("TextLabel")
	l.BackgroundTransparency = 1
	l.Size = UDim2.new(1, 0, 0, height)
	l.Font = Enum.Font.GothamBold
	l.TextScaled = true
	l.TextXAlignment = Enum.TextXAlignment.Left
	l.TextColor3 = color
	l.Text = text
	l.Parent = parent
	return l
end

local function buildBoard()
	local board = Instance.new("Part")
	board.Name = "Leaderboard"
	board.Anchored = true
	board.Size = Vector3.new(30, 18, 1)
	board.CFrame = ArenaService.boardCFrame()
	board.Color = Color3.fromRGB(24, 27, 36)
	board.Material = Enum.Material.SmoothPlastic

	local gui = Instance.new("SurfaceGui")
	gui.Face = Enum.NormalId.Back
	gui.LightInfluence = 0
	gui.SizingMode = Enum.SurfaceGuiSizingMode.PixelsPerStud
	gui.PixelsPerStud = 30
	gui.Parent = board

	local frame = Instance.new("Frame")
	frame.BackgroundTransparency = 1
	frame.Size = UDim2.fromScale(1, 1)
	frame.Parent = gui
	local padding = Instance.new("UIPadding")
	padding.PaddingTop = UDim.new(0, 24)
	padding.PaddingLeft = UDim.new(0, 36)
	padding.PaddingRight = UDim.new(0, 36)
	padding.Parent = frame
	local layout = Instance.new("UIListLayout")
	layout.Padding = UDim.new(0, 6)
	layout.SortOrder = Enum.SortOrder.LayoutOrder
	layout.Parent = frame

	local title = label(frame, "MOST WINS", 70, Color3.fromRGB(255, 196, 0))
	title.LayoutOrder = 0
	status = label(frame, "Loading...", 28, Color3.fromRGB(160, 166, 182))
	status.LayoutOrder = 1
	for i = 1, settings.Size do
		local row = label(frame, "", 36, Color3.fromRGB(240, 242, 247))
		row.LayoutOrder = i + 1
		rows[i] = row
	end

	local arena = Workspace:FindFirstChild("Arena")
	board.Parent = arena or Workspace
end

local function render(entries: { { key: string, value: number } })
	for i, row in rows do
		local entry = entries[i]
		if entry then
			local userId = tonumber(entry.key)
			local name = if userId then nameOf(userId) else entry.key
			row.Text =
				string.format("%d.  %s  —  %d win%s", i, name, entry.value, if entry.value == 1 then "" else "s")
		else
			row.Text = ""
		end
	end
	status.Text = if #entries == 0 then "No winners yet. Be the first!" else "All servers, refreshed regularly"
end

function LeaderboardService.refresh()
	local written, failed = buffer:flush()
	if failed > 0 then
		warn(string.format("[Leaderboard] %d of %d writes failed; retrying next refresh", failed, written + failed))
	end
	local ok, entries = store:top(settings.Size)
	if ok then
		render(entries)
	else
		warn("[Leaderboard] read failed: " .. tostring(entries))
	end
end

-- Writes what is queued; called on shutdown so the last round's wins land.
function LeaderboardService.flush()
	buffer:flush()
end

function LeaderboardService.start()
	local persistent
	store, persistent = RobloxStore.openOrdered(settings.StoreName)
	buffer = LeaderboardBuffer.new(store)
	-- The in-memory fallback has no request budget; refresh faster so the
	-- board is useful while playtesting in Studio.
	local interval = if persistent then settings.RefreshSeconds else 10
	buildBoard()

	Profiles.onChanged(function(player, data)
		buffer:record(player.UserId, data.wins)
	end)

	task.spawn(function()
		while true do
			LeaderboardService.refresh()
			task.wait(interval)
		end
	end)
end

return LeaderboardService
