--!strict
-- Runs RoundMachine against the real world: feeds it time and falls, and
-- turns its effects into arena changes, rewards and client updates.
--
-- Round state reaches clients as attributes on ReplicatedStorage.Round, not
-- remote events: the engine sends each change once to everyone, players who
-- join mid-round get the current values for free, and spectators cost no
-- per-player traffic.

local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local Workspace = game:GetService("Workspace")

local Config = require(ReplicatedStorage.Shared.Config)
local Pattern = require(ReplicatedStorage.Shared.Pattern)
local Rewards = require(ReplicatedStorage.Shared.Rewards)
local Rng = require(ReplicatedStorage.Shared.Rng)
local RoundMachine = require(ReplicatedStorage.Shared.RoundMachine)

local ArenaService = require(script.Parent.ArenaService)
local Profiles = require(script.Parent.Profiles)

local Round = ReplicatedStorage.Round :: Configuration
local NoticeRemote = ReplicatedStorage.Remotes.Notice :: RemoteEvent

local RoundService = {}

local machine = RoundMachine.new(Config)
local rng = Rng.new(DateTime.now().UnixTimestampMillis)
local function randInt(min: number, max: number): number
	return rng:nextInt(min, max)
end
local layout: Pattern.Layout? = nil
local pendingTeleport: { number }? = nil

-- Setting an attribute to its current value replicates nothing, so publishing
-- everything on each change only sends what actually moved.
local function publish()
	local snap = machine:snapshot()
	local showTarget = snap.phase == "Warning" or snap.phase == "Dropped"
	Round:SetAttribute("Phase", snap.phase)
	Round:SetAttribute("EndsAt", Workspace:GetServerTimeNow() + snap.timeLeft)
	Round:SetAttribute("Wave", snap.wave)
	Round:SetAttribute("Target", if showTarget and layout then layout.target else 0)
	Round:SetAttribute("Alive", snap.aliveCount)
	Round:SetAttribute("Participants", snap.participantCount)
	for _, player in Players:GetPlayers() do
		player:SetAttribute("InRound", machine:isAlive(player.UserId))
	end
end

local function notice(text: string)
	NoticeRemote:FireAllClients(text)
end

local function nameOf(userId: number): string
	local player = Players:GetPlayerByUserId(userId)
	return if player then player.DisplayName else "A player"
end

local function ordinal(n: number): string
	local lastTwo = n % 100
	if lastTwo >= 11 and lastTwo <= 13 then
		return n .. "th"
	end
	local suffix = ({ "st", "nd", "rd" })[n % 10] or "th"
	return n .. suffix
end

local function characterState(player: Player): (boolean, number?)
	local character = player.Character
	if not character then
		return false, nil
	end
	local humanoid = character:FindFirstChildOfClass("Humanoid")
	local root = character:FindFirstChild("HumanoidRootPart") :: BasePart?
	if not humanoid or humanoid.Health <= 0 or not root then
		return false, nil
	end
	return true, root.Position.Y
end

local function readyPlayers(): { number }
	local ready = {}
	for _, player in Players:GetPlayers() do
		if Profiles.isLoaded(player) and characterState(player) then
			table.insert(ready, player.UserId)
		end
	end
	return ready
end

local function payOut(effect: { winners: { number }, participants: { number }, survived: { [number]: number } })
	local payouts = Rewards.compute(Config.Rewards, effect.participants, effect.survived, effect.winners)
	for userId, payout in payouts do
		local player = Players:GetPlayerByUserId(userId)
		if player then
			Profiles.mutate(player, function(data)
				data.coins += payout.coins
				data.roundsPlayed += 1
				data.bestWave = math.max(data.bestWave, payout.wavesSurvived)
				if payout.won then
					data.wins += 1
				end
			end)
		end
	end
end

local function apply(effects: { RoundMachine.Effect })
	local changed = false

	for _, effect in effects do
		if effect.kind == "PhaseChanged" then
			changed = true
		elseif effect.kind == "StartRound" then
			pendingTeleport = effect.participants
			notice(
				string.format(
					"Round starting with %d player%s!",
					#effect.participants,
					if #effect.participants == 1 then "" else "s"
				)
			)
		elseif effect.kind == "NewWave" then
			local nextLayout = Pattern.generate(randInt, {
				size = Config.Arena.GridSize,
				colors = effect.settings.colors,
				patch = effect.settings.patch,
				minTargetShare = Config.Pattern.MinTargetShare,
				maxTargetShare = Config.Pattern.MaxTargetShare,
			})
			layout = nextLayout
			ArenaService.applyLayout(nextLayout)
			if pendingTeleport then
				-- Spread players over distinct tiles so nobody spawns stacked.
				local spots = {}
				for i = 1, ArenaService.tileCount() do
					spots[i] = i
				end
				rng:shuffle(spots)
				for i, userId in pendingTeleport do
					local player = Players:GetPlayerByUserId(userId)
					if player then
						ArenaService.sendToTile(player, spots[(i - 1) % #spots + 1])
					end
				end
				pendingTeleport = nil
			end
		elseif effect.kind == "Drop" then
			if layout then
				ArenaService.drop(layout)
			end
		elseif effect.kind == "Eliminated" then
			changed = true
			local player = Players:GetPlayerByUserId(effect.userId)
			if player then
				notice(string.format("%s is out (%s place)", player.DisplayName, ordinal(effect.place)))
				ArenaService.sendToLobby(player)
			end
		elseif effect.kind == "EndRound" then
			layout = nil
			ArenaService.reset()
			payOut(effect)
			if #effect.winners == 0 then
				notice("Nobody survived this round.")
			else
				local names = {}
				for _, userId in effect.winners do
					table.insert(names, nameOf(userId))
				end
				notice(table.concat(names, ", ") .. (if #names == 1 then " wins!" else " win together!"))
			end
			for _, userId in effect.participants do
				local player = Players:GetPlayerByUserId(userId)
				if player then
					ArenaService.sendToLobby(player)
				end
			end
		end
	end

	if changed then
		publish()
	end
end

local function checkFalls()
	local phase = machine:snapshot().phase
	if phase ~= "Warning" and phase ~= "Dropped" then
		return
	end
	local killHeight = ArenaService.killHeight()
	for _, userId in machine:aliveUserIds() do
		local player = Players:GetPlayerByUserId(userId)
		if not player then
			apply(machine:eliminate(userId, false))
		else
			local alive, y = characterState(player)
			if not alive then
				-- Reset or died to something else: out, but not "fell".
				apply(machine:eliminate(userId, false))
			elseif y and y < killHeight then
				apply(machine:eliminate(userId, true))
			end
		end
	end
end

function RoundService.start()
	ArenaService.build()
	-- Anyone who spawned before the lobby existed is standing in the void.
	for _, player in Players:GetPlayers() do
		ArenaService.sendToLobby(player)
	end
	publish()

	Players.PlayerRemoving:Connect(function(player)
		apply(machine:eliminate(player.UserId, false))
	end)

	task.spawn(function()
		local last = os.clock()
		while true do
			task.wait(Config.TickSeconds)
			local now = os.clock()
			local dt = now - last
			last = now
			checkFalls()
			apply(machine:tick(dt, readyPlayers()))
		end
	end)
end

return RoundService
