-- Tappy Chicken · PlayForge Lua 5.4 gameplay reference
-- Engine API contract (World, Input, Events, UI, Audio) is proposed, not executed by the HTML preview.
local Game = { difficulty = "Normal", score = 0, state = 'Ready', gravity = 1050, flapVelocity = -345, pipeSpeed = 170, pipeGap = 174, spawnInterval = 1.55 }

function Game:SetDifficulty(name)
    local presets = {
        Easy = { pipeSpeed = 125, pipeGap = 212, spawnInterval = 1.9 },
        Normal = { pipeSpeed = 170, pipeGap = 174, spawnInterval = 1.55 },
        Hard = { pipeSpeed = 225, pipeGap = 145, spawnInterval = 1.32 }
    }
    local preset = presets[name]
    if not preset then return false end
    self.difficulty = name
    for k, v in pairs(preset) do self[k] = v end
    return true
end

function Game:Start()
    self.score = 0
    self.state = 'Playing'
    self.bird = { x = 135, y = 290, vy = 0, radius = 17 }
    self.pipes = {}
    self.spawnIn = 0.9
    Events.Emit('GameStarted')
end

function Game:Flap()
    if self.state == 'Ready' or self.state == 'GameOver' then self:Start() end
    if self.state ~= 'Playing' then return end
    self.bird.vy = self.flapVelocity
    Audio.Play('sfx.flap')
end

function Game:SpawnPipe()
    local center = 175 + math.random() * 220
    table.insert(self.pipes, { x = 510, top = center - self.pipeGap / 2,
        bottom = center + self.pipeGap / 2, passed = false })
end

local function circleIntersectsRect(x,y,r,rx,ry,rw,rh)
    local cx = math.max(rx, math.min(x,rx+rw))
    local cy = math.max(ry, math.min(y,ry+rh))
    return (x-cx)^2 + (y-cy)^2 < r*r
end

function Game:Tick(dt)
    if self.state ~= 'Playing' then return end
    dt = math.min(dt, 0.04)
    local b = self.bird
    b.vy = b.vy + self.gravity * dt
    b.y = b.y + b.vy * dt
    self.spawnIn = self.spawnIn - dt
    if self.spawnIn <= 0 then self:SpawnPipe(); self.spawnIn = self.spawnInterval end
    if b.y - b.radius < 0 or b.y + b.radius >= 570 then return self:GameOver() end
    for i = #self.pipes, 1, -1 do
        local p = self.pipes[i]
        p.x = p.x - self.pipeSpeed * dt
        if not p.passed and p.x + 78 < b.x then
            p.passed = true
            self.score = self.score + 1
            Events.Emit('ScoreChanged', self.score)
        end
        if circleIntersectsRect(b.x,b.y,b.radius-4,p.x,0,78,p.top)
            or circleIntersectsRect(b.x,b.y,b.radius-4,p.x,p.bottom,78,570-p.bottom) then
            return self:GameOver()
        end
        if p.x < -78 then table.remove(self.pipes,i) end
    end
end

function Game:GameOver()
    if self.state ~= 'Playing' then return end
    self.state = 'GameOver'
    Events.Emit('GameOver', self.score)
end

return Game
