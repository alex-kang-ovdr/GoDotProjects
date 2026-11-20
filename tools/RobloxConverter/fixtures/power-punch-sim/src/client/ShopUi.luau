-- ShopUi.luau
-- Shop window with two tabs: Gear (coins) and Robux (gamepasses + coin packs).
-- Gear state comes from the replicated GearLevel attribute; all purchases are
-- validated server-side, this UI just fires remotes / purchase prompts.

local MarketplaceService = game:GetService("MarketplaceService")
local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")

local Config = require(ReplicatedStorage.Shared.Config)
local Formulas = require(ReplicatedStorage.Shared.Formulas)
local UI = require(script.Parent.UI)

local ShopUi = {}

local player = Players.LocalPlayer

local function scrollList(parent: Frame): ScrollingFrame
	return UI.create("ScrollingFrame", {
		Size = UDim2.fromScale(1, 1),
		BackgroundTransparency = 1,
		BorderSizePixel = 0,
		ScrollBarThickness = 6,
		CanvasSize = UDim2.new(),
		AutomaticCanvasSize = Enum.AutomaticSize.Y,
		Parent = parent,
	}, {
		UI.create("UIListLayout", {
			FillDirection = Enum.FillDirection.Vertical,
			Padding = UDim.new(0, 8),
			SortOrder = Enum.SortOrder.LayoutOrder,
		}),
	})
end

local function row(parent: ScrollingFrame, order: number, height: number): Frame
	return UI.create("Frame", {
		LayoutOrder = order,
		Size = UDim2.new(1, -8, 0, height),
		BackgroundColor3 = UI.Palette.panelLight,
		Parent = parent,
	}, {
		UI.corner(10),
	})
end

-- ============================== GEAR TAB ==============================

local function buildGearTab(parent: Frame)
	local list = scrollList(parent)
	local buttons = {}

	for level, gear in Config.Gear do
		local container = row(list, level, 64)

		UI.create("Frame", {
			Position = UDim2.fromOffset(10, 12),
			Size = UDim2.fromOffset(40, 40),
			BackgroundColor3 = gear.color,
			Parent = container,
		}, { UI.corner(8) })

		UI.create("TextLabel", {
			Position = UDim2.fromOffset(60, 8),
			Size = UDim2.new(1, -180, 0, 26),
			BackgroundTransparency = 1,
			Text = gear.name,
			TextColor3 = UI.Palette.text,
			Font = Enum.Font.FredokaOne,
			TextScaled = true,
			TextXAlignment = Enum.TextXAlignment.Left,
			Parent = container,
		}, { UI.create("UITextSizeConstraint", { MaxTextSize = 20 }) })

		UI.create("TextLabel", {
			Position = UDim2.fromOffset(60, 36),
			Size = UDim2.new(1, -180, 0, 20),
			BackgroundTransparency = 1,
			Text = `x{gear.multiplier} Power  •  🪙 {Formulas.abbreviate(gear.cost)}`,
			TextColor3 = UI.Palette.subtext,
			Font = Enum.Font.GothamBold,
			TextScaled = true,
			TextXAlignment = Enum.TextXAlignment.Left,
			Parent = container,
		}, { UI.create("UITextSizeConstraint", { MaxTextSize = 15 }) })

		local buyButton = UI.button({
			Text = "BUY",
			Size = UDim2.fromOffset(96, 40),
			AnchorPoint = Vector2.new(1, 0.5),
			Position = UDim2.new(1, -10, 0.5, 0),
			Parent = container,
		})
		buyButton.Activated:Connect(function()
			ReplicatedStorage.Remotes.BuyGear:FireServer(level)
		end)
		buttons[level] = buyButton
	end

	local function refresh()
		local owned = player:GetAttribute("GearLevel") or 0
		for level, button in buttons do
			if level <= owned then
				button.Text = "OWNED"
				button.BackgroundColor3 = UI.Palette.good
				button.Active = false
			elseif level == owned + 1 then
				button.Text = "BUY"
				button.BackgroundColor3 = UI.Palette.accent
				button.Active = true
			else
				button.Text = "LOCKED"
				button.BackgroundColor3 = UI.Palette.locked
				button.Active = false
			end
		end
	end
	player:GetAttributeChangedSignal("GearLevel"):Connect(refresh)
	refresh()
end

-- ============================== ROBUX TAB ==============================

local function buildRobuxTab(parent: Frame)
	local list = scrollList(parent)
	local order = 0
	local anyVisible = false

	local passOrder = { "DoublePower", "DoubleCoins", "AutoTrain", "VIP" }
	for _, key in passOrder do
		local passId = Config.GamePasses[key]
		if passId == 0 then
			continue
		end
		anyVisible = true
		order += 1
		local info = Config.GamePassInfo[key]
		local container = row(list, order, 64)

		UI.create("TextLabel", {
			Position = UDim2.fromOffset(12, 8),
			Size = UDim2.new(1, -130, 0, 26),
			BackgroundTransparency = 1,
			Text = "👑 " .. info.title,
			TextColor3 = UI.Palette.accent,
			Font = Enum.Font.FredokaOne,
			TextScaled = true,
			TextXAlignment = Enum.TextXAlignment.Left,
			Parent = container,
		}, { UI.create("UITextSizeConstraint", { MaxTextSize = 20 }) })

		UI.create("TextLabel", {
			Position = UDim2.fromOffset(12, 36),
			Size = UDim2.new(1, -130, 0, 20),
			BackgroundTransparency = 1,
			Text = info.desc,
			TextColor3 = UI.Palette.subtext,
			Font = Enum.Font.Gotham,
			TextScaled = true,
			TextXAlignment = Enum.TextXAlignment.Left,
			Parent = container,
		}, { UI.create("UITextSizeConstraint", { MaxTextSize = 13 }) })

		local buyButton = UI.button({
			Text = "BUY",
			Size = UDim2.fromOffset(96, 40),
			AnchorPoint = Vector2.new(1, 0.5),
			Position = UDim2.new(1, -10, 0.5, 0),
			Color = UI.Palette.good,
			Parent = container,
		})
		local function refreshOwned()
			if player:GetAttribute("Owns" .. key) == true then
				buyButton.Text = "OWNED"
				buyButton.BackgroundColor3 = UI.Palette.locked
				buyButton.Active = false
			end
		end
		buyButton.Activated:Connect(function()
			MarketplaceService:PromptGamePassPurchase(player, passId)
		end)
		player:GetAttributeChangedSignal("Owns" .. key):Connect(refreshOwned)
		refreshOwned()
	end

	for _, product in Config.DevProducts do
		if product.id == 0 then
			continue
		end
		anyVisible = true
		order += 1
		local container = row(list, order, 56)

		UI.create("TextLabel", {
			Position = UDim2.fromOffset(12, 0),
			Size = UDim2.new(1, -130, 1, 0),
			BackgroundTransparency = 1,
			Text = "🪙 " .. product.label,
			TextColor3 = UI.Palette.text,
			Font = Enum.Font.FredokaOne,
			TextScaled = true,
			TextXAlignment = Enum.TextXAlignment.Left,
			Parent = container,
		}, { UI.create("UITextSizeConstraint", { MaxTextSize = 20 }) })

		UI.button({
			Text = "BUY",
			Size = UDim2.fromOffset(96, 40),
			AnchorPoint = Vector2.new(1, 0.5),
			Position = UDim2.new(1, -10, 0.5, 0),
			Color = UI.Palette.good,
			Parent = container,
		}).Activated:Connect(function()
			MarketplaceService:PromptProductPurchase(player, product.id)
		end)
	end

	if not anyVisible then
		UI.create("TextLabel", {
			Size = UDim2.new(1, 0, 0, 80),
			BackgroundTransparency = 1,
			Text = "Robux shop coming soon! 👀",
			TextColor3 = UI.Palette.subtext,
			Font = Enum.Font.FredokaOne,
			TextScaled = true,
			Parent = list,
		}, { UI.create("UITextSizeConstraint", { MaxTextSize = 22 }) })
	end
end

-- ============================== WINDOW ==============================

function ShopUi.build()
	local content = UI.window("Shop", "🛒 Shop", UDim2.fromOffset(470, 430))

	local tabBar = UI.create("Frame", {
		Size = UDim2.new(1, 0, 0, 40),
		BackgroundTransparency = 1,
		Parent = content,
	}, {
		UI.create("UIListLayout", {
			FillDirection = Enum.FillDirection.Horizontal,
			Padding = UDim.new(0, 8),
		}),
	})

	local pages = UI.create("Frame", {
		Position = UDim2.fromOffset(0, 48),
		Size = UDim2.new(1, 0, 1, -48),
		BackgroundTransparency = 1,
		Parent = content,
	})

	local gearPage = UI.create("Frame", { Size = UDim2.fromScale(1, 1), BackgroundTransparency = 1, Parent = pages })
	local robuxPage = UI.create("Frame", { Size = UDim2.fromScale(1, 1), BackgroundTransparency = 1, Visible = false, Parent = pages })
	buildGearTab(gearPage)
	buildRobuxTab(robuxPage)

	local gearTab, robuxTab
	local function selectTab(showGear: boolean)
		gearPage.Visible = showGear
		robuxPage.Visible = not showGear
		gearTab.BackgroundColor3 = showGear and UI.Palette.accent or UI.Palette.panelLight
		gearTab.TextColor3 = showGear and Color3.fromRGB(30, 30, 30) or UI.Palette.text
		robuxTab.BackgroundColor3 = showGear and UI.Palette.panelLight or UI.Palette.accent
		robuxTab.TextColor3 = showGear and UI.Palette.text or Color3.fromRGB(30, 30, 30)
	end

	gearTab = UI.button({ Text = "🥊 Gear", Size = UDim2.fromOffset(120, 40), LayoutOrder = 1, Parent = tabBar })
	robuxTab = UI.button({
		Text = "💎 Robux",
		Size = UDim2.fromOffset(120, 40),
		LayoutOrder = 2,
		Color = UI.Palette.panelLight,
		TextColor = UI.Palette.text,
		Parent = tabBar,
	})
	gearTab.Activated:Connect(function()
		selectTab(true)
	end)
	robuxTab.Activated:Connect(function()
		selectTab(false)
	end)
end

return ShopUi
