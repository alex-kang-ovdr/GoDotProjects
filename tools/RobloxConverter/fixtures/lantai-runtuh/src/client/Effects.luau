--!strict
-- Countdown ticks, the collapse sound, and a short camera shake on drop.

local GuiService = game:GetService("GuiService")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local RunService = game:GetService("RunService")
local SoundService = game:GetService("SoundService")
local Workspace = game:GetService("Workspace")

local Config = require(ReplicatedStorage:WaitForChild("Shared"):WaitForChild("Config"))

local Hud = require(script.Parent.Hud)

local Effects = {}
Effects.__index = Effects

local SHAKE_BINDING = "LantaiRuntuhShake"

type State = {
	tick: Sound,
	drop: Sound,
	lastPhase: string?,
	lastWave: number,
	lastTickSecond: number?,
}

export type Effects = typeof(setmetatable({} :: State, Effects))

local function sound(name: string, id: string, volume: number): Sound
	local s = Instance.new("Sound")
	s.Name = name
	s.SoundId = id
	s.Volume = volume
	s.Parent = SoundService
	return s
end

function Effects.new(): Effects
	local settings = Config.Effects
	return setmetatable({
		tick = sound("CountdownTick", settings.TickSound, 0.6),
		drop = sound("TilesCollapse", settings.DropSound, 0.35),
		lastPhase = nil,
		lastWave = 0,
		lastTickSecond = nil,
	}, Effects)
end

local function shake()
	-- Respect the player's Reduced Motion setting.
	if GuiService.ReducedMotionEnabled then
		return
	end
	local duration = Config.Effects.ShakeSeconds
	local degrees = Config.Effects.ShakeDegrees
	local started = os.clock()
	RunService:UnbindFromRenderStep(SHAKE_BINDING)
	-- Runs after the camera scripts so the offset is applied on top of their
	-- result each frame instead of accumulating.
	RunService:BindToRenderStep(SHAKE_BINDING, Enum.RenderPriority.Camera.Value + 1, function()
		local t = (os.clock() - started) / duration
		local camera = Workspace.CurrentCamera
		if t >= 1 or not camera then
			RunService:UnbindFromRenderStep(SHAKE_BINDING)
			return
		end
		local strength = math.rad(degrees) * (1 - t) ^ 2
		local pitch = math.noise(t * 18, 0.5) * strength
		local roll = math.noise(0.5, t * 18) * strength
		camera.CFrame *= CFrame.Angles(pitch, 0, roll)
	end)
end

-- Called whenever the round state changes.
function Effects.onState(self: Effects, state: Hud.RoundState)
	if state.wave ~= self.lastWave then
		self.lastWave = state.wave
		self.lastTickSecond = nil
	end
	if state.phase == "Dropped" and self.lastPhase ~= "Dropped" then
		self.drop:Play()
		if state.inRound then
			shake()
		end
	end
	self.lastPhase = state.phase
end

-- Called every frame: ticks once per second for the last few seconds of a
-- warning.
function Effects.update(self: Effects, state: Hud.RoundState?, serverNow: number)
	if not state or state.phase ~= "Warning" then
		return
	end
	local second = math.ceil(state.endsAt - serverNow)
	if second >= 1 and second <= Config.Effects.TickFromSeconds and second ~= self.lastTickSecond then
		self.lastTickSecond = second
		self.tick.PlaybackSpeed = if second == 1 then 1.25 else 1
		self.tick:Play()
	end
end

return Effects
