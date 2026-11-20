-- Hud.luau
-- The always-visible interface: stat pills (Power / Coins / Rebirths), the big
-- TRAIN button (click or press E), menu buttons, and the Auto Train toggle
-- that appears when the gamepass is owned.

local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local UserInputService = game:GetService("UserInputService")

local Config = require(ReplicatedStorage.Shared.Config)
local Formulas = require(ReplicatedStorage.Shared.Formulas)
local UI = require(script.Parent.UI)

local Hud = {}

local player = Players.LocalPlayer

local function statPill(parent: Frame, order: number, emoji: string, statName: string)
	local label = UI.create("TextLabel", {
		Size = UDim2.fromScale(1, 1),
		BackgroundTransparency = 1,
		Text = emoji .. " 0",
		TextColor3 = UI.Palette.text,
		Font = Enum.Font.FredokaOne,
		TextScaled = true,
	}, {
		UI.create("UITextSizeConstraint", { MaxTextSize = 22 }),
	})

	UI.create("Frame", {
		LayoutOrder = order,
		Size = UDim2.fromOffset(158, 44),
		BackgroundColor3 = UI.Palette.panel,
		BackgroundTransparency = 0.15,
		Parent = parent,
	}, {
		UI.corner(22),
		UI.stroke(UI.Palette.panelLight, 2),
		label,
	})

	-- leaderstats can arrive after the HUD; bind whenever it shows up.
	task.spawn(function()
		local value = player:WaitForChild("leaderstats"):WaitForChild(statName)
		local function update()
			label.Text = `{emoji} {Formulas.abbreviate(value.Value)}`
		end
		value.Changed:Connect(update)
		update()
	end)
end

function Hud.start()
	local gui = UI.create("ScreenGui", {
		Name = "HUD",
		ResetOnSpawn = false,
		Parent = player:WaitForChild("PlayerGui"),
	})

	-- ============================== STAT BAR ==============================
	local bar = UI.create("Frame", {
		AnchorPoint = Vector2.new(0.5, 0),
		Position = UDim2.new(0.5, 0, 0, 10),
		Size = UDim2.fromOffset(510, 44),
		BackgroundTransparency = 1,
		Parent = gui,
	}, {
		UI.create("UIListLayout", {
			FillDirection = Enum.FillDirection.Horizontal,
			HorizontalAlignment = Enum.HorizontalAlignment.Center,
			Padding = UDim.new(0, 8),
		}),
	})
	statPill(bar, 1, "💪", "Power")
	statPill(bar, 2, "🪙", "Coins")
	statPill(bar, 3, "🔄", "Rebirths")

	-- ============================== TRAIN BUTTON ==============================
	local remotes = ReplicatedStorage:WaitForChild("Remotes")
	local punchRemote = remotes:WaitForChild("Punch")

	local trainButton = UI.button({
		Text = "👊 TRAIN",
		Size = UDim2.fromOffset(200, 68),
		AnchorPoint = Vector2.new(0.5, 1),
		Position = UDim2.new(0.5, 0, 1, -24),
		Color = UI.Palette.accent,
		MaxTextSize = 30,
		CornerRadius = 18,
		Parent = gui,
	})
	UI.create("TextLabel", {
		AnchorPoint = Vector2.new(0.5, 1),
		Position = UDim2.new(0.5, 0, 1, -2),
		Size = UDim2.fromOffset(200, 16),
		BackgroundTransparency = 1,
		Text = "or press E",
		TextColor3 = UI.Palette.subtext,
		Font = Enum.Font.Gotham,
		TextSize = 13,
		Parent = gui,
	})

	local lastPunch = 0
	local function punch()
		local now = os.clock()
		if now - lastPunch < Config.Training.PunchCooldown then
			return
		end
		lastPunch = now
		punchRemote:FireServer()
	end

	trainButton.Activated:Connect(punch)
	UserInputService.InputBegan:Connect(function(input, gameProcessed)
		if not gameProcessed and input.KeyCode == Enum.KeyCode.E then
			punch()
		end
	end)

	-- ============================== MENU BUTTONS ==============================
	local menu = UI.create("Frame", {
		AnchorPoint = Vector2.new(0, 0.5),
		Position = UDim2.new(0, 12, 0.5, 0),
		Size = UDim2.fromOffset(120, 220),
		BackgroundTransparency = 1,
		Parent = gui,
	}, {
		UI.create("UIListLayout", {
			FillDirection = Enum.FillDirection.Vertical,
			VerticalAlignment = Enum.VerticalAlignment.Center,
			Padding = UDim.new(0, 8),
		}),
	})

	UI.button({
		Text = "🛒 Shop",
		Size = UDim2.fromOffset(120, 46),
		LayoutOrder = 1,
		Color = UI.Palette.panelLight,
		TextColor = UI.Palette.text,
		Parent = menu,
	}).Activated:Connect(function()
		UI.toggleWindow("Shop")
	end)

	UI.button({
		Text = "🔄 Rebirth",
		Size = UDim2.fromOffset(120, 46),
		LayoutOrder = 2,
		Color = UI.Palette.panelLight,
		TextColor = UI.Palette.text,
		Parent = menu,
	}).Activated:Connect(function()
		UI.toggleWindow("Rebirth")
	end)

	-- Auto Train toggle: only visible once the gamepass is owned.
	local autoOn = false
	local autoButton = UI.button({
		Text = "⚡ Auto: OFF",
		Size = UDim2.fromOffset(120, 46),
		LayoutOrder = 3,
		Color = UI.Palette.panelLight,
		TextColor = UI.Palette.text,
		Parent = menu,
	})
	local function refreshAutoVisibility()
		autoButton.Visible = player:GetAttribute("OwnsAutoTrain") == true
	end
	autoButton.Activated:Connect(function()
		autoOn = not autoOn
		autoButton.Text = autoOn and "⚡ Auto: ON" or "⚡ Auto: OFF"
		autoButton.BackgroundColor3 = autoOn and UI.Palette.good or UI.Palette.panelLight
		remotes:WaitForChild("ToggleAutoTrain"):FireServer(autoOn)
	end)
	player:GetAttributeChangedSignal("OwnsAutoTrain"):Connect(refreshAutoVisibility)
	refreshAutoVisibility()
end

return Hud
