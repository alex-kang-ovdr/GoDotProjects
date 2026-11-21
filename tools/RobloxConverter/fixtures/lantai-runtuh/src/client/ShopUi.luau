--!strict
-- Trail shop panel. Renders from the catalog and the last profile the server
-- sent; every purchase is decided by the server.

local ReplicatedStorage = game:GetService("ReplicatedStorage")

local Shop = require(ReplicatedStorage:WaitForChild("Shared"):WaitForChild("Shop"))

local Ui = require(script.Parent.Ui)

local ShopUi = {}
ShopUi.__index = ShopUi

export type Profile = {
	coins: number,
	wins: number,
	bestWave: number,
	ownedTrails: { [string]: boolean },
	equippedTrail: string?,
}

export type Response = { ok: boolean, message: string? }

type Row = { button: TextButton }

type State = {
	panel: Frame,
	stats: TextLabel,
	rows: { [string]: Row },
	profile: Profile?,
	busy: boolean,
	request: (action: string, id: string?) -> Response,
	notify: (text: string) -> (),
}

export type ShopUi = typeof(setmetatable({} :: State, ShopUi))

local function gradient(colors: { { number } }): UIGradient
	local keypoints = {}
	for i, c in colors do
		local t = if #colors == 1 then 0 else (i - 1) / (#colors - 1)
		table.insert(keypoints, ColorSequenceKeypoint.new(t, Ui.rgb(c)))
	end
	if #keypoints == 1 then
		table.insert(keypoints, ColorSequenceKeypoint.new(1, keypoints[1].Value))
	end
	return Ui.make("UIGradient", { Color = ColorSequence.new(keypoints) })
end

function ShopUi.new(parent: ScreenGui, request: (string, string?) -> Response, notify: (string) -> ()): ShopUi
	local panel = Ui.make("Frame", {
		Name = "Shop",
		AnchorPoint = Vector2.new(0.5, 0.5),
		Position = UDim2.fromScale(0.5, 0.55),
		Size = UDim2.fromScale(0.92, 0.7),
		BackgroundColor3 = Ui.Theme.Panel,
		Visible = false,
		Parent = parent,
	}) :: Frame
	Ui.corner(14).Parent = panel
	Ui.padding(14).Parent = panel
	Ui.make("UISizeConstraint", { MaxSize = Vector2.new(520, 460), Parent = panel })

	Ui.label({
		Size = UDim2.new(1, -50, 0, 32),
		TextXAlignment = Enum.TextXAlignment.Left,
		Text = "Trail Shop",
		Parent = panel,
	})
	local stats = Ui.label({
		Position = UDim2.fromOffset(0, 34),
		Size = UDim2.new(1, 0, 0, 20),
		TextXAlignment = Enum.TextXAlignment.Left,
		TextColor3 = Ui.Theme.Muted,
		Font = Enum.Font.GothamMedium,
		MaxTextSize = 16,
		Text = "",
		Parent = panel,
	})
	local close = Ui.button({
		AnchorPoint = Vector2.new(1, 0),
		Position = UDim2.fromScale(1, 0),
		Size = UDim2.fromOffset(40, 32),
		Text = "X",
		Parent = panel,
	})

	local list = Ui.make("ScrollingFrame", {
		Position = UDim2.fromOffset(0, 64),
		Size = UDim2.new(1, 0, 1, -64),
		BackgroundTransparency = 1,
		BorderSizePixel = 0,
		CanvasSize = UDim2.new(),
		AutomaticCanvasSize = Enum.AutomaticSize.Y,
		ScrollBarThickness = 6,
		Parent = panel,
	}) :: ScrollingFrame
	Ui.make("UIListLayout", { Padding = UDim.new(0, 8), SortOrder = Enum.SortOrder.LayoutOrder, Parent = list })

	local self = setmetatable({
		panel = panel,
		stats = stats,
		rows = {},
		profile = nil,
		busy = false,
		request = request,
		notify = notify,
	}, ShopUi)

	for order, trail in Shop.Trails do
		local row = Ui.make("Frame", {
			Name = trail.id,
			LayoutOrder = order,
			Size = UDim2.new(1, -8, 0, 52),
			BackgroundColor3 = Ui.Theme.PanelLight,
			Parent = list,
		}) :: Frame
		Ui.corner(10).Parent = row
		Ui.padding(8).Parent = row

		local preview = Ui.make("Frame", {
			Size = UDim2.new(0, 56, 1, 0),
			BackgroundColor3 = Color3.new(1, 1, 1),
			Parent = row,
		}) :: Frame
		Ui.corner(8).Parent = preview
		gradient(trail.colors).Parent = preview

		Ui.label({
			Position = UDim2.fromOffset(68, 0),
			Size = UDim2.new(1, -200, 1, 0),
			TextXAlignment = Enum.TextXAlignment.Left,
			MaxTextSize = 20,
			Text = trail.name,
			Parent = row,
		})

		local button = Ui.button({
			AnchorPoint = Vector2.new(1, 0),
			Position = UDim2.fromScale(1, 0),
			Size = UDim2.new(0, 120, 1, 0),
			Text = string.format("Buy  %d", trail.price),
			Parent = row,
		})
		button.Activated:Connect(function()
			self:_onAction(trail.id)
		end)
		self.rows[trail.id] = { button = button }
	end

	close.Activated:Connect(function()
		panel.Visible = false
	end)

	return self
end

function ShopUi.toggle(self: ShopUi)
	self.panel.Visible = not self.panel.Visible
end

function ShopUi.setProfile(self: ShopUi, profile: Profile)
	self.profile = profile
	self.stats.Text =
		string.format("%d coins  ·  %d wins  ·  best wave %d", profile.coins, profile.wins, profile.bestWave)
	for _, trail in Shop.Trails do
		local button = self.rows[trail.id].button
		if profile.equippedTrail == trail.id then
			button.Text = "Equipped"
			button.BackgroundColor3 = Ui.Theme.Ok
			button.TextColor3 = Ui.Theme.Panel
		elseif profile.ownedTrails[trail.id] then
			button.Text = "Equip"
			button.BackgroundColor3 = Ui.Theme.Accent
			button.TextColor3 = Ui.Theme.Panel
		else
			local affordable = profile.coins >= trail.price
			button.Text = string.format("Buy  %d", trail.price)
			button.BackgroundColor3 = if affordable then Ui.Theme.Accent else Ui.Theme.PanelLight
			button.TextColor3 = if affordable then Ui.Theme.Panel else Ui.Theme.Muted
		end
	end
end

function ShopUi._onAction(self: ShopUi, id: string)
	local profile = self.profile
	if self.busy or not profile then
		return
	end
	local action: string, target: string?
	if profile.equippedTrail == id then
		action, target = "equip", nil
	elseif profile.ownedTrails[id] then
		action, target = "equip", id
	else
		action, target = "buy", id
	end

	self.busy = true
	task.spawn(function()
		local ok, response = pcall(self.request, action, target)
		self.busy = false
		if not ok then
			self.notify("Shop is unavailable, try again")
		elseif not response.ok then
			self.notify(response.message or "That didn't work")
		elseif action == "buy" then
			-- Equip right away: that is what people buy a trail for.
			self:_onAction(id)
		end
	end)
end

return ShopUi
