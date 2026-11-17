-- Tappy Chicken rules for the GamePlayForge Lua 5.4 runtime.
-- Rendering, input devices, audio, and persistence belong to the host.
local Game = {}

local WORLD = { width = 480, height = 640, ground = 570 }
local DEFAULTS = {
    gravity = 1050,
    flap = 345,
    speed = 170,
    gap = 174,
    interval = 1.55,
    pipeWidth = 78,
    seed = 12345,
    difficulty = "normal",
    best = 0,
}
local PROFILES = {
    easy = { speed = 125, gap = 212, interval = 1.9 },
    normal = { speed = 170, gap = 174, interval = 1.55 },
    hard = { speed = 225, gap = 145, interval = 1.32 },
}

local function clamp(value, low, high)
    value = tonumber(value)
    if value == nil then return nil end
    return math.max(low, math.min(high, value))
end

local function copySettings(input, previous)
    local settings = {}
    for key, value in pairs(DEFAULTS) do settings[key] = value end
    if previous then
        for key in pairs(DEFAULTS) do
            if previous[key] ~= nil then settings[key] = previous[key] end
        end
    end
    if input then
        for key in pairs(DEFAULTS) do
            if input[key] ~= nil then settings[key] = input[key] end
        end
    end

    local difficulty = settings.difficulty
    if not PROFILES[difficulty] then difficulty = "normal" end
    settings.difficulty = difficulty
    for key, value in pairs(PROFILES[difficulty]) do
        -- A supplied numeric setting is an explicit override to the preset.
        local supplied = input and tonumber(input[key])
        if supplied == nil then settings[key] = value end
    end

    settings.gravity = clamp(settings.gravity, 0, 3000) or DEFAULTS.gravity
    settings.flap = clamp(settings.flap, 50, 1000) or DEFAULTS.flap
    settings.speed = clamp(settings.speed, 40, 450) or PROFILES[difficulty].speed
    settings.gap = clamp(settings.gap, 95, 350) or PROFILES[difficulty].gap
    settings.interval = clamp(settings.interval, 0.5, 4) or PROFILES[difficulty].interval
    settings.pipeWidth = clamp(settings.pipeWidth, 25, 160) or DEFAULTS.pipeWidth
    settings.seed = math.floor(clamp(settings.seed, 1, 999999) or DEFAULTS.seed)
    settings.best = math.max(0, math.floor(tonumber(settings.best) or 0))
    return settings
end

local function resetState(self)
    self.state = "ready"
    self.score = 0
    self.elapsed = 0
    self.seed = self.settings.seed
    self.spawnTimer = 0.9
    self.bird = { x = 135, y = 290, vy = 0, r = 17, angle = 0 }
    self.pipes = {}
end

local function random01(self)
    -- Lua 5.4 integer arithmetic wraps at 64 bits; mask to JS uint32 semantics.
    self.seed = (self.seed * 1664525 + 1013904223) & 0xffffffff
    return self.seed / 4294967296
end

local function spawnPipe(self)
    local center = 175 + random01(self) * 220
    local halfGap = self.settings.gap / 2
    self.pipes[#self.pipes + 1] = {
        x = WORLD.width + 30,
        top = center - halfGap,
        bottom = center + halfGap,
        passed = false,
    }
end

local function gameOver(self)
    if self.state ~= "playing" then return end
    self.state = "over"
    if self.score > self.settings.best then self.settings.best = self.score end
end

function Game:Reset(settings)
    self.settings = copySettings(settings, settings == nil and self.settings or nil)
    resetState(self)
    return self:Snapshot()
end

function Game:Input(action)
    if action == "restart" then
        self:Reset(self.settings)
        return self:Snapshot()
    end

    if action == "togglePause" then
        if self.state == "playing" then
            self.state = "paused"
        elseif self.state == "paused" then
            self.state = "playing"
        end
        return self:Snapshot()
    elseif action == "pause" then
        if self.state == "playing" then self.state = "paused" end
        return self:Snapshot()
    elseif action == "resume" then
        if self.state == "paused" then self.state = "playing" end
        return self:Snapshot()
    elseif action ~= "flap" then
        return self:Snapshot()
    end

    if self.state == "paused" then return self:Snapshot() end
    if self.state == "over" then self:Reset(self.settings) end
    if self.state == "ready" then self.state = "playing" end
    self.bird.vy = -self.settings.flap
    return self:Snapshot()
end

function Game:Update(dt)
    dt = math.max(0, math.min(tonumber(dt) or 0, 0.04))
    self.elapsed = self.elapsed + dt
    if self.state ~= "playing" then return self:Snapshot() end

    local bird = self.bird
    bird.vy = bird.vy + self.settings.gravity * dt
    bird.y = bird.y + bird.vy * dt
    bird.angle = math.max(-0.55, math.min(1.1, bird.vy / 450))

    self.spawnTimer = self.spawnTimer - dt
    if self.spawnTimer <= 0 then
        spawnPipe(self)
        self.spawnTimer = self.settings.interval
    end

    if bird.y - bird.r < 0 or bird.y + bird.r >= WORLD.ground then
        gameOver(self)
    end

    for index = #self.pipes, 1, -1 do
        local pipe = self.pipes[index]
        pipe.x = pipe.x - self.settings.speed * dt
        if not pipe.passed and pipe.x + self.settings.pipeWidth < bird.x then
            pipe.passed = true
            self.score = self.score + 1
        end
        if bird.x + bird.r - 4 > pipe.x
            and bird.x - bird.r + 4 < pipe.x + self.settings.pipeWidth
            and (bird.y - bird.r + 4 < pipe.top or bird.y + bird.r - 4 > pipe.bottom) then
            gameOver(self)
        end
        if pipe.x + self.settings.pipeWidth <= -10 then
            table.remove(self.pipes, index)
        end
    end

    return self:Snapshot()
end

function Game:Snapshot()
    local pipes = {}
    for i, pipe in ipairs(self.pipes or {}) do
        pipes[i] = { x = pipe.x, top = pipe.top, bottom = pipe.bottom, passed = pipe.passed }
    end
    local bird = self.bird or { x = 135, y = 290, vy = 0, r = 17, angle = 0 }
    return {
        state = self.state or "ready",
        score = self.score or 0,
        best = (self.settings and self.settings.best) or 0,
        elapsed = self.elapsed or 0,
        seed = self.seed or DEFAULTS.seed,
        difficulty = (self.settings and self.settings.difficulty) or DEFAULTS.difficulty,
        bird = { x = bird.x, y = bird.y, vy = bird.vy, r = bird.r, angle = bird.angle },
        pipes = pipes,
        settings = copySettings(self.settings),
        world = { width = WORLD.width, height = WORLD.height, ground = WORLD.ground },
    }
end

Game:Reset()
return Game
