-- GlobalLeaderboard.luau
-- Cross-server top-10 power leaderboard on a physical board near spawn,
-- backed by an OrderedDataStore. Degrades gracefully in unpublished Studio
-- playtests where DataStores are unavailable.

local DataStoreService = game:GetService("DataStoreService")
local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")

local Formulas = require(ReplicatedStorage.Shared.Formulas)

local STORE_NAME = "GlobalPower_v1"
local UPDATE_INTERVAL = 120
local TOP_N = 10

local GlobalLeaderboard = {}

local nameCache = {} -- [userId] = username

local function usernameFor(userId: number): string
	if nameCache[userId] then
		return nameCache[userId]
	end
	local ok, name = pcall(function()
		return Players:GetNameFromUserIdAsync(userId)
	end)
	nameCache[userId] = ok and name or "Unknown"
	return nameCache[userId]
end

local function buildBoardGui(board: BasePart): { TextLabel }
	local gui = Instance.new("SurfaceGui")
	gui.Face = Enum.NormalId.Front
	gui.CanvasSize = Vector2.new(520, 280)
	gui.SizingMode = Enum.SurfaceGuiSizingMode.FixedSize

	local title = Instance.new("TextLabel")
	title.Size = UDim2.new(1, 0, 0, 44)
	title.BackgroundTransparency = 1
	title.Text = "🏆 GLOBAL TOP POWER 🏆"
	title.TextColor3 = Color3.fromRGB(255, 200, 60)
	title.Font = Enum.Font.FredokaOne
	title.TextScaled = true
	title.Parent = gui

	local list = Instance.new("Frame")
	list.Position = UDim2.new(0, 16, 0, 48)
	list.Size = UDim2.new(1, -32, 1, -56)
	list.BackgroundTransparency = 1
	list.Parent = gui

	local layout = Instance.new("UIListLayout")
	layout.FillDirection = Enum.FillDirection.Vertical
	layout.Padding = UDim.new(0, 2)
	layout.Parent = list

	local rows = {}
	for i = 1, TOP_N do
		local row = Instance.new("TextLabel")
		row.Name = "Row" .. i
		row.LayoutOrder = i
		row.Size = UDim2.new(1, 0, 0, 20)
		row.BackgroundTransparency = 1
		row.Text = ""
		row.TextColor3 = Color3.fromRGB(240, 243, 250)
		row.Font = Enum.Font.GothamBold
		row.TextScaled = true
		row.TextXAlignment = Enum.TextXAlignment.Left
		row.Parent = list
		rows[i] = row
	end

	gui.Parent = board
	return rows
end

function GlobalLeaderboard.start(Data, boardPart: BasePart)
	local rows = buildBoardGui(boardPart)

	local ok, store = pcall(function()
		return DataStoreService:GetOrderedDataStore(STORE_NAME)
	end)
	if not ok or not store then
		rows[1].Text = "Publish the game to enable the global leaderboard"
		return
	end

	task.spawn(function()
		task.wait(5) -- let first players load in before the first refresh
		while true do
			-- Push current players' power, then pull the global top 10.
			for _, player in Players:GetPlayers() do
				local profile = Data.get(player)
				if profile and profile.power > 0 then
					pcall(function()
						store:SetAsync(tostring(player.UserId), profile.power)
					end)
				end
			end

			local pagesOk, pages = pcall(function()
				return store:GetSortedAsync(false, TOP_N)
			end)
			if pagesOk then
				local top = pages:GetCurrentPage()
				for i = 1, TOP_N do
					local entry = top[i]
					if entry then
						local name = usernameFor(tonumber(entry.key) or 0)
						rows[i].Text = `#{i}  {name} — {Formulas.abbreviate(entry.value)}`
						rows[i].TextColor3 = if i == 1
							then Color3.fromRGB(255, 200, 60)
							elseif i == 2 then Color3.fromRGB(200, 200, 210)
							elseif i == 3 then Color3.fromRGB(205, 130, 70)
							else Color3.fromRGB(240, 243, 250)
					else
						rows[i].Text = ""
					end
				end
			end

			task.wait(UPDATE_INTERVAL)
		end
	end)
end

return GlobalLeaderboard
