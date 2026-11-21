--!strict
-- Round status bar, toasts, and the coins/shop corner.

local ReplicatedStorage = game:GetService("ReplicatedStorage")
local TweenService = game:GetService("TweenService")

local Config = require(ReplicatedStorage:WaitForChild("Shared"):WaitForChild("Config"))

local Ui = require(script.Parent.Ui)

local Hud = {}
Hud.__index = Hud

export type RoundState = {
	phase: string,
	endsAt: number,
	wave: number,
	target: number?,
	alive: number,
	participants: number,
	inRound: boolean,
}

type State = {
	bar: Frame,
	stroke: UIStroke,
	title: TextLabel,
	timer: TextLabel,
	subtitle: TextLabel,
	swatch: Frame,
	swatchLetter: TextLabel,
	toast: TextLabel,
	coins: TextLabel,
	shopButton: TextButton,
	round: RoundState?,
	toastToken: number,
}

export type Hud = typeof(setmetatable({} :: State, Hud))

function Hud.new(parent: ScreenGui): Hud
	local bar = Ui.make("Frame", {
		Name = "RoundBar",
		AnchorPoint = Vector2.new(0.5, 0),
		Position = UDim2.new(0.5, 0, 0, 10),
		Size = UDim2.new(0.92, 0, 0, 92),
		BackgroundColor3 = Ui.Theme.Panel,
		BackgroundTransparency = 0.1,
		Parent = parent,
	}) :: Frame
	Ui.corner(14).Parent = bar
	Ui.padding(10).Parent = bar
	Ui.make("UISizeConstraint", { MaxSize = Vector2.new(480, math.huge), Parent = bar })
	local stroke = Ui.make("UIStroke", { Thickness = 3, Color = Ui.Theme.PanelLight, Parent = bar }) :: UIStroke

	local swatch = Ui.make("Frame", {
		Name = "Target",
		Size = UDim2.fromScale(1, 1),
		SizeConstraint = Enum.SizeConstraint.RelativeYY,
		BackgroundColor3 = Ui.Theme.PanelLight,
		Visible = false,
		Parent = bar,
	}) :: Frame
	Ui.corner(10).Parent = swatch
	local swatchLetter = Ui.label({
		Size = UDim2.fromScale(1, 1),
		Font = Enum.Font.GothamBlack,
		MaxTextSize = 44,
		Text = "",
		Parent = swatch,
	})
	Ui.make("UIStroke", { Thickness = 2, Color = Color3.new(0, 0, 0), Transparency = 0.4, Parent = swatchLetter })

	local title = Ui.label({
		Name = "Title",
		Position = UDim2.fromScale(0, 0),
		Size = UDim2.fromScale(0.72, 0.5),
		TextXAlignment = Enum.TextXAlignment.Left,
		MaxTextSize = 26,
		Text = "Loading...",
		Parent = bar,
	})
	local subtitle = Ui.label({
		Name = "Subtitle",
		Position = UDim2.fromScale(0, 0.58),
		Size = UDim2.fromScale(0.72, 0.36),
		TextXAlignment = Enum.TextXAlignment.Left,
		TextColor3 = Ui.Theme.Muted,
		Font = Enum.Font.GothamMedium,
		MaxTextSize = 18,
		Text = "",
		Parent = bar,
	})
	local timer = Ui.label({
		Name = "Timer",
		AnchorPoint = Vector2.new(1, 0),
		Position = UDim2.fromScale(1, 0),
		Size = UDim2.fromScale(0.26, 1),
		TextXAlignment = Enum.TextXAlignment.Right,
		Font = Enum.Font.GothamBlack,
		TextColor3 = Ui.Theme.Accent,
		MaxTextSize = 48,
		Text = "",
		Parent = bar,
	})

	local toast = Ui.label({
		Name = "Toast",
		AnchorPoint = Vector2.new(0.5, 0),
		Position = UDim2.new(0.5, 0, 0, 112),
		Size = UDim2.new(0.8, 0, 0, 34),
		BackgroundColor3 = Ui.Theme.Panel,
		BackgroundTransparency = 1,
		TextTransparency = 1,
		MaxTextSize = 20,
		Text = "",
		Parent = parent,
	})
	Ui.corner(10).Parent = toast
	Ui.make("UISizeConstraint", { MaxSize = Vector2.new(460, math.huge), Parent = toast })

	local corner = Ui.make("Frame", {
		Name = "Wallet",
		AnchorPoint = Vector2.new(0, 1),
		Position = UDim2.new(0, 12, 1, -12),
		Size = UDim2.fromOffset(220, 48),
		BackgroundTransparency = 1,
		Parent = parent,
	}) :: Frame
	Ui.make("UIListLayout", {
		FillDirection = Enum.FillDirection.Horizontal,
		Padding = UDim.new(0, 8),
		VerticalAlignment = Enum.VerticalAlignment.Center,
		Parent = corner,
	})
	local coins = Ui.label({
		Name = "Coins",
		Size = UDim2.fromOffset(110, 44),
		BackgroundColor3 = Ui.Theme.Panel,
		BackgroundTransparency = 0.1,
		TextColor3 = Ui.Theme.Accent,
		MaxTextSize = 20,
		Text = "0 coins",
		Parent = corner,
	})
	Ui.corner(10).Parent = coins
	local shopButton = Ui.button({
		Name = "ShopButton",
		Size = UDim2.fromOffset(96, 44),
		BackgroundColor3 = Ui.Theme.Accent,
		TextColor3 = Ui.Theme.Panel,
		Text = "Shop",
		Parent = corner,
	})

	return setmetatable({
		bar = bar,
		stroke = stroke,
		title = title,
		timer = timer,
		subtitle = subtitle,
		swatch = swatch,
		swatchLetter = swatchLetter,
		toast = toast,
		coins = coins,
		shopButton = shopButton,
		round = nil,
		toastToken = 0,
	}, Hud)
end

local function layoutText(self: Hud, withSwatch: boolean)
	self.swatch.Visible = withSwatch
	local offset = if withSwatch then 82 else 0
	self.title.Position = UDim2.fromOffset(offset, 0)
	self.title.Size = UDim2.new(0.72, -offset, 0.5, 0)
	self.subtitle.Position = UDim2.new(0, offset, 0.58, 0)
	self.subtitle.Size = UDim2.new(0.72, -offset, 0.36, 0)
end

function Hud.setRound(self: Hud, state: RoundState)
	self.round = state
	local target = if state.target then Config.Colors[state.target] else nil
	local waveLine = string.format("Wave %d  ·  %d of %d still standing", state.wave, state.alive, state.participants)

	if target then
		local color = Ui.rgb(target.rgb)
		layoutText(self, true)
		self.swatch.BackgroundColor3 = color
		self.swatchLetter.Text = target.letter
		self.stroke.Color = color
		if state.phase == "Warning" then
			self.title.Text = (if state.inRound then "Stand on " else "Next safe: ") .. string.upper(target.name)
		else
			self.title.Text = if state.inRound then "Hold on!" else "Tiles are falling..."
		end
		self.subtitle.Text = if state.inRound then waveLine else "Spectating  ·  " .. waveLine
		return
	end

	layoutText(self, false)
	self.stroke.Color = Ui.Theme.PanelLight
	if state.phase == "Waiting" then
		self.title.Text = "Waiting for players"
		self.subtitle.Text =
			string.format("A round needs %d player%s", Config.MinPlayers, if Config.MinPlayers == 1 then "" else "s")
	elseif state.phase == "Intermission" then
		self.title.Text = "Next round starts in"
		self.subtitle.Text = "Stand anywhere in the lobby to join"
	elseif state.phase == "RoundOver" then
		self.title.Text = "Round over"
		self.subtitle.Text = "Coins have been added to your wallet"
	else
		self.title.Text = "Round in progress"
		self.subtitle.Text = waveLine
	end
end

-- Called every frame with the server clock.
function Hud.update(self: Hud, serverNow: number)
	local state = self.round
	if not state or state.phase == "Waiting" then
		self.timer.Text = ""
		return
	end
	local left = math.max(0, state.endsAt - serverNow)
	if state.phase == "Warning" then
		self.timer.Text = string.format("%.1f", left)
		self.timer.TextColor3 = if left < 1 then Ui.Theme.Danger else Ui.Theme.Accent
	elseif state.phase == "Dropped" then
		self.timer.Text = ""
	else
		self.timer.Text = tostring(math.ceil(left))
		self.timer.TextColor3 = Ui.Theme.Accent
	end
end

function Hud.toastMessage(self: Hud, text: string)
	self.toastToken += 1
	local token = self.toastToken
	local toast = self.toast
	toast.Text = text
	toast.TextTransparency = 0
	toast.BackgroundTransparency = 0.15
	task.delay(3, function()
		if self.toastToken ~= token then
			return
		end
		local fade = TweenInfo.new(0.4)
		TweenService:Create(toast, fade, { TextTransparency = 1, BackgroundTransparency = 1 }):Play()
	end)
end

function Hud.setCoins(self: Hud, coins: number)
	self.coins.Text = string.format("%d coins", coins)
end

return Hud
