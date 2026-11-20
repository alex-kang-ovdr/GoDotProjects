-- RebirthUi.luau
-- Rebirth window: shows the trade (reset progress for a permanent multiplier)
-- and fires the Rebirth remote. The server re-validates the cost.

local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")

local Config = require(ReplicatedStorage.Shared.Config)
local Formulas = require(ReplicatedStorage.Shared.Formulas)
local UI = require(script.Parent.UI)

local RebirthUi = {}

local player = Players.LocalPlayer

local function infoLabel(parent: Frame, order: number, size: number, color: Color3): TextLabel
	return UI.create("TextLabel", {
		LayoutOrder = order,
		Size = UDim2.new(1, 0, 0, size + 8),
		BackgroundTransparency = 1,
		Text = "",
		TextColor3 = color,
		Font = Enum.Font.FredokaOne,
		TextScaled = true,
		Parent = parent,
	}, {
		UI.create("UITextSizeConstraint", { MaxTextSize = size }),
	})
end

function RebirthUi.build()
	local content = UI.window("Rebirth", "🔄 Rebirth", UDim2.fromOffset(380, 330))

	UI.create("UIListLayout", {
		FillDirection = Enum.FillDirection.Vertical,
		HorizontalAlignment = Enum.HorizontalAlignment.Center,
		Padding = UDim.new(0, 8),
		Parent = content,
	})

	local explainer = infoLabel(content, 1, 15, UI.Palette.subtext)
	explainer.Text = "Reset your power, coins and gear\nfor a PERMANENT power boost!"

	local bonusLabel = infoLabel(content, 2, 20, UI.Palette.good)
	local costLabel = infoLabel(content, 3, 18, UI.Palette.text)
	local powerLabel = infoLabel(content, 4, 16, UI.Palette.subtext)

	local rebirthButton = UI.button({
		Text = "🔄 REBIRTH",
		Size = UDim2.fromOffset(220, 56),
		LayoutOrder = 5,
		MaxTextSize = 26,
		Parent = content,
	})
	rebirthButton.Activated:Connect(function()
		ReplicatedStorage.Remotes.Rebirth:FireServer()
	end)

	task.spawn(function()
		local stats = player:WaitForChild("leaderstats")
		local power = stats:WaitForChild("Power")
		local rebirths = stats:WaitForChild("Rebirths")

		local function refresh()
			local cost = Formulas.rebirthCost(rebirths.Value)
			local nextBonus = (rebirths.Value + 1) * Config.Rebirth.BonusPerRebirth * 100
			bonusLabel.Text = `Rebirths: {rebirths.Value}  →  next: +{nextBonus}% power`
			costLabel.Text = `Cost: {Formulas.abbreviate(cost)} 💪`
			powerLabel.Text = `Your power: {Formulas.abbreviate(power.Value)}`
			local canAfford = power.Value >= cost
			rebirthButton.BackgroundColor3 = canAfford and UI.Palette.good or UI.Palette.locked
		end
		power.Changed:Connect(refresh)
		rebirths.Changed:Connect(refresh)
		refresh()
	end)
end

return RebirthUi
