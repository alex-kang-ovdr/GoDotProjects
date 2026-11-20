--!strict
-- The whole round flow as a pure state machine. It never touches Roblox:
-- the server feeds it time and eliminations, and acts on the effects it
-- returns. That keeps every rule testable, including a fuzz test that plays
-- thousands of rounds outside Studio.

local RoundMachine = {}
RoundMachine.__index = RoundMachine

export type Phase = "Waiting" | "Intermission" | "Warning" | "Dropped" | "RoundOver"

export type WaveRules = {
	StartWarnSeconds: number,
	MinWarnSeconds: number,
	WarnDecaySeconds: number,
	StartColors: number,
	MaxColors: number,
	ColorsEvery: number,
	MaxWaves: number,
}

export type Settings = {
	MinPlayers: number,
	IntermissionSeconds: number,
	RoundOverSeconds: number,
	DropSeconds: number,
	Waves: WaveRules,
}

export type WaveSettings = {
	warnSeconds: number,
	colors: number,
	patch: number,
}

export type Effect =
	{ kind: "PhaseChanged", phase: Phase }
	| { kind: "StartRound", participants: { number } }
	| { kind: "NewWave", wave: number, settings: WaveSettings }
	| { kind: "Drop", wave: number }
	| { kind: "Eliminated", userId: number, place: number }
	| { kind: "EndRound", winners: { number }, participants: { number }, survived: { [number]: number } }

export type Snapshot = {
	phase: Phase,
	timeLeft: number,
	wave: number,
	aliveCount: number,
	participantCount: number,
}

type State = {
	settings: Settings,
	phase: Phase,
	timeLeft: number,
	wave: number,
	participants: { number },
	alive: { [number]: boolean },
	aliveCount: number,
	survived: { [number]: number },
	-- Players who fell during the current drop. If everyone falls at once,
	-- they share the win instead of the round having no winner.
	fellThisWave: { number },
}

export type RoundMachine = typeof(setmetatable({} :: State, RoundMachine))

function RoundMachine.new(settings: Settings): RoundMachine
	return setmetatable({
		settings = settings,
		phase = "Waiting" :: Phase,
		timeLeft = 0,
		wave = 0,
		participants = {},
		alive = {},
		aliveCount = 0,
		survived = {},
		fellThisWave = {},
	}, RoundMachine)
end

function RoundMachine.waveSettings(rules: WaveRules, wave: number): WaveSettings
	local warn = math.max(rules.MinWarnSeconds, rules.StartWarnSeconds - (wave - 1) * rules.WarnDecaySeconds)
	local colors = math.min(rules.MaxColors, rules.StartColors + (wave - 1) // rules.ColorsEvery)
	local patch = if wave <= 5 then 3 elseif wave <= 12 then 2 else 1
	return { warnSeconds = warn, colors = colors, patch = patch }
end

function RoundMachine.snapshot(self: RoundMachine): Snapshot
	return {
		phase = self.phase,
		timeLeft = math.max(0, self.timeLeft),
		wave = self.wave,
		aliveCount = self.aliveCount,
		participantCount = #self.participants,
	}
end

function RoundMachine.isAlive(self: RoundMachine, userId: number): boolean
	return self.alive[userId] == true
end

function RoundMachine.aliveUserIds(self: RoundMachine): { number }
	local list = {}
	for _, userId in self.participants do
		if self.alive[userId] then
			table.insert(list, userId)
		end
	end
	return list
end

local function enter(self: RoundMachine, phase: Phase, seconds: number, effects: { Effect })
	self.phase = phase
	self.timeLeft = seconds
	table.insert(effects, { kind = "PhaseChanged", phase = phase } :: Effect)
end

local function nextWave(self: RoundMachine, effects: { Effect })
	self.wave += 1
	self.fellThisWave = {}
	local settings = RoundMachine.waveSettings(self.settings.Waves, self.wave)
	table.insert(effects, { kind = "NewWave", wave = self.wave, settings = settings } :: Effect)
	enter(self, "Warning", settings.warnSeconds, effects)
end

local function startRound(self: RoundMachine, ready: { number }, effects: { Effect })
	self.participants = table.clone(ready)
	self.alive = {}
	self.survived = {}
	for _, userId in ready do
		self.alive[userId] = true
		self.survived[userId] = 0
	end
	self.aliveCount = #ready
	self.wave = 0
	table.insert(effects, { kind = "StartRound", participants = table.clone(ready) } :: Effect)
	nextWave(self, effects)
end

local function endRound(self: RoundMachine, winners: { number }, effects: { Effect })
	table.insert(
		effects,
		{
			kind = "EndRound",
			winners = winners,
			participants = table.clone(self.participants),
			survived = table.clone(self.survived),
		} :: Effect
	)
	self.alive = {}
	self.aliveCount = 0
	enter(self, "RoundOver", self.settings.RoundOverSeconds, effects)
end

local function finishWave(self: RoundMachine, effects: { Effect })
	for userId in self.alive do
		self.survived[userId] += 1
	end

	local solo = #self.participants == 1
	local lastWave = self.wave >= self.settings.Waves.MaxWaves

	if self.aliveCount == 0 then
		-- Solo players only win by clearing every wave.
		endRound(self, if solo then {} else table.clone(self.fellThisWave), effects)
	elseif lastWave or (not solo and self.aliveCount == 1) then
		endRound(self, self:aliveUserIds(), effects)
	else
		nextWave(self, effects)
	end
end

-- Advances time by dt seconds. `ready` lists the players who could join a
-- round right now (data loaded, character alive).
function RoundMachine.tick(self: RoundMachine, dt: number, ready: { number }): { Effect }
	local effects: { Effect } = {}
	local minPlayers = self.settings.MinPlayers
	local phase = self.phase

	if phase == "Waiting" then
		if #ready >= minPlayers then
			enter(self, "Intermission", self.settings.IntermissionSeconds, effects)
		end
		return effects
	end

	self.timeLeft -= dt

	if phase == "Intermission" then
		if #ready < minPlayers then
			enter(self, "Waiting", 0, effects)
		elseif self.timeLeft <= 0 then
			startRound(self, ready, effects)
		end
	elseif phase == "Warning" then
		if self.timeLeft <= 0 then
			enter(self, "Dropped", self.settings.DropSeconds, effects)
			table.insert(effects, { kind = "Drop", wave = self.wave } :: Effect)
		end
	elseif phase == "Dropped" then
		if self.timeLeft <= 0 then
			finishWave(self, effects)
		end
	elseif phase == "RoundOver" then
		if self.timeLeft <= 0 then
			if #ready >= minPlayers then
				enter(self, "Intermission", self.settings.IntermissionSeconds, effects)
			else
				enter(self, "Waiting", 0, effects)
			end
		end
	end

	return effects
end

-- `fell` is true when the player dropped off the arena, false when they
-- left the game or their character was removed some other way.
function RoundMachine.eliminate(self: RoundMachine, userId: number, fell: boolean): { Effect }
	local effects: { Effect } = {}
	if not self.alive[userId] or (self.phase ~= "Warning" and self.phase ~= "Dropped") then
		return effects
	end

	self.alive[userId] = nil
	self.aliveCount -= 1
	table.insert(effects, { kind = "Eliminated", userId = userId, place = self.aliveCount + 1 } :: Effect)

	if self.phase == "Dropped" then
		if fell then
			table.insert(self.fellThisWave, userId)
		end
		-- The wave resolves when the drop ends, so players falling together
		-- are judged together.
		return effects
	end

	-- Outside a drop nobody else is falling: settle the round right away.
	local solo = #self.participants == 1
	if self.aliveCount == 0 then
		endRound(self, {}, effects)
	elseif not solo and self.aliveCount == 1 then
		endRound(self, self:aliveUserIds(), effects)
	end
	return effects
end

return RoundMachine
