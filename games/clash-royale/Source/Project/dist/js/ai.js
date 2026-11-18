import { CARDS, selectSpellTargets } from './engine.js';

// Only the visible arena and the AI's own resources are observed. Every action
// still passes through Game.canDeploy/playCard; difficulty grants no resources.
const DIFFICULTIES = Object.freeze({
  easy: { think: 1.25, reaction: 1.05, aim: 15, reserve: 1, attackAt: 8.5, choiceNoise: 1.8 },
  normal: { think: 0.72, reaction: 0.55, aim: 7, reserve: 1.6, attackAt: 7, choiceNoise: 0.7 },
  hard: { think: 0.38, reaction: 0.22, aim: 2, reserve: 2, attackAt: 6.5, choiceNoise: 0.15 },
});
const STYLES = Object.freeze({
  balanced: { attackAt: 0, reserve: 0, tank: 0, support: 0, pressure: 0, defense: 0, spell: 0, split: 0.65 },
  beatdown: { attackAt: 0.4, reserve: 0, tank: 2.5, support: 1.2, pressure: -0.6, defense: 0, spell: 0, split: 0.25 },
  cycle: { attackAt: -1.2, reserve: -0.4, tank: -0.5, support: 0, pressure: 1.7, defense: 0, spell: 0, split: 1.8 },
  control: { attackAt: 0.5, reserve: 0.6, tank: -0.4, support: 0.3, pressure: -0.3, defense: 1.1, spell: 1.1, split: 0.75 },
});
const ROLE = Object.freeze({
  knight: { defense: 3.1, support: 1.4, cycle: 2.4, frontline: true },
  archers: { defense: 2.8, support: 4.4, cycle: 3, antiAir: true, ranged: true },
  giant: { defense: -2, support: 0, cycle: 0, tank: true, frontline: true, assault: true },
  goblins: { defense: 3.3, support: 2.4, cycle: 3, swarm: true },
  musketeer: { defense: 3.6, support: 5.2, cycle: 2.2, antiAir: true, ranged: true },
  bomber: { defense: 2.9, support: 4.3, cycle: 2.7, splash: true, ranged: true },
  minions: { defense: 3, support: 4, cycle: 2.8, antiAir: true, swarm: true },
  cannon: { defense: 4, support: -5, cycle: -5, building: true },
  valkyrie: { defense: 3.3, support: 2.1, cycle: 2, splash: true, frontline: true },
  skeletons: { defense: 2.3, support: 0.8, cycle: 2.3, swarm: true },
  hog_rider: { defense: -3, support: 1, cycle: 5.6, assault: true, fast: true },
  spear_goblins: { defense: 2.6, support: 3.8, cycle: 3.8, antiAir: true, ranged: true, swarm: true },
  duelist: { defense: 4, support: 2.3, cycle: 2.3, frontline: true, antiTank: true },
  ice_spirit: { defense: 2.6, support: 3.5, cycle: 3.8, antiAir: true, splash: true, disposable: true },
  phalanx: { defense: 4.2, support: 2.2, cycle: 1, frontline: true, swarm: true, antiTank: true },
  minion_giant: { defense: -2, support: 0, cycle: 3.4, tank: true, ranged: true, assault: true },
});
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const alive = u => u && u.hp > 0 && !u.dead && !u.destroyed;
const laneOf = u => u.x < 240 ? 120 : 360;
const cardFor = (game,id,team='enemy') => game.getCard?.(id,team) ?? CARDS[id];
const flying = (unit, game) => unit.flying && !(game.rulesVersion >= 5 && unit.groundedRemaining > 1e-7);
const lockedFormation = (u,game) => game.rulesVersion >= 4 && u.cardId === 'phalanx' && u.formationState !== 'charge';
const unitValue = (u,game) => {
  const c = cardFor(game,u.cardId,u.team);
  return (c?.cost ?? 3) / (c?.count ?? 1) * clamp(u.hp / (u.maxHp || u.hp || 1), 0.15, 1);
};
const unitDps = (u,game) => {
  if(lockedFormation(u,game))return 0;
  const c=cardFor(game,u.cardId,u.team);
  return Math.max(0,u.damage ?? c?.damage ?? 0)/Math.max(.05,u.attackInterval ?? c?.attackInterval ?? 1);
};
const combatValue = (u,game) => {
  const baseline=CARDS[u.cardId],baseDps=(baseline?.damage ?? 1)/Math.max(.05,baseline?.attackInterval ?? 1);
  return unitValue(u,game)*clamp(unitDps(u,game)/Math.max(.1,baseDps),0,5);
};
const isDot = c => c.type === 'spell' && c.tickInterval > 0 && c.duration > 0;
const canAttack = (attacker, target,game) => {
  if(lockedFormation(attacker,game)||unitDps(attacker,game)<=0)return false;
  const targets = attacker.targets ?? cardFor(game,attacker.cardId,attacker.team)?.targets ?? 'ground';
  return (targets !== 'buildings' || target.isBuilding || target.kind==='tower') && (targets === 'all' || !flying(target, game));
};

// Preserve baseline heuristics while allowing live team balance changes to
// alter combat quality. Card identity still describes its tactical role.
function roleFor(game,id,card) {
  const role={...(ROLE[id] ?? {defense:1,support:1,cycle:1}),antiAir:card.targets==='all',
    ranged:card.range>=60&&card.projectileSpeed>0,splash:card.splashRadius>0,building:card.type==='building'};
  if(game.rulesVersion>=4&&id==='phalanx')role.antiTank=false;
  return role;
}
function quality(card,id) {
  const base=CARDS[id];if(!base||card.type==='spell')return 0;
  const ratio=(value,original)=>original>0?Math.log2(clamp(value/original,.125,8)):0;
  const hp=ratio(card.hp*(card.count||1),base.hp*(base.count||1));
  const dps=ratio(card.damage/Math.max(.05,card.attackInterval),base.damage/Math.max(.05,base.attackInterval));
  return hp*.8+dps*1.2+ratio(card.range,base.range)*.5;
}

// This estimate uses visible position, health and published card attributes.
// It does not inspect the opponent's hand, resources, or future attack clock.
function kingThreats(opponents, towers,game) {
  const king = towers.find(t => t.type === 'king');
  if (!king) return [];
  return opponents.filter(u => {
    const c = cardFor(game,u.cardId,u.team);
    if (!c || !canAttack(u, king,game)) return false;
    const reach = (u.range ?? c.range) + (u.radius ?? c.radius) + (king.radius || 29);
    const approach = (u.speed ?? c.speed) * 0.9;
    return dist(u, king) <= reach + approach + 8 && king.hp <= (u.damage ?? c.damage) * 2.5;
  });
}
function seedNumber(value) {
  if (Number.isFinite(value)) return value >>> 0;
  let h = 2166136261;
  for (const c of String(value ?? 'crownfall-ai')) h = Math.imul(h ^ c.charCodeAt(0), 16777619) >>> 0;
  return h;
}

export class BattleAI {
  constructor(game, { difficulty = 'normal', style = 'balanced', seed } = {}) {
    if (!game?.state || typeof game.playCard !== 'function' || typeof game.canDeploy !== 'function') {
      throw new TypeError('AI에는 유효한 전투 엔진이 필요합니다.');
    }
    this.game = game;
    this.enabled = true;
    this.seed = seedNumber(seed ?? game.seed ?? 0x93ab17);
    this.style = Object.hasOwn(STYLES, style) ? style : 'balanced';
    this.setDifficulty(difficulty);
  }

  setDifficulty(difficulty = 'normal') {
    this.difficulty = Object.hasOwn(DIFFICULTIES, difficulty) ? difficulty : 'normal';
    this.config = { ...DIFFICULTIES[this.difficulty] };
    this.reset();
  }

  reset() {
    this.rngState = this.seed || 1;
    this.wait = this.config.think;
    this.seenThreats = new Map();
    this.recentPlays = [];
    this.preferredLane = this.random() < 0.5 ? 120 : 360;
    this.lastDecision = null;
    this.decisionCount = 0;
    this.lastTime = -1;
  }

  random() {
    this.rngState = (Math.imul(this.rngState, 1664525) + 1013904223) >>> 0;
    return this.rngState / 4294967296;
  }

  update(dt) {
    const s = this.game.state;
    if (!this.enabled || !s?.running || s.winner || s.phase === 'finished') return;
    if (!Number.isFinite(dt) || dt <= 0) return;
    if (s.time < this.lastTime) this.reset();
    this.lastTime = s.time;
    this.wait -= dt;
    if (this.wait > 0) return;
    // Even a long caller frame permits at most one deployment per think cycle.
    this.wait = this.config.think * (0.9 + this.random() * 0.2);
    this.think(s);
  }

  think(s) {
    const hand = s.hands?.enemy ?? [];
    const elixir = s.elixir?.enemy ?? 0;
    if (!hand.length) return;
    const opponents = (s.units ?? []).filter(u => alive(u) && u.team === 'player').slice(0, 80);
    const allies = (s.units ?? []).filter(u => alive(u) && u.team === 'enemy');
    const enemyTowers = (s.towers ?? []).filter(t => alive(t) && t.team === 'player');
    const friendlyTowers = (s.towers ?? []).filter(t => alive(t) && t.team === 'enemy');
    const critical = kingThreats(opponents, friendlyTowers,this.game);
    const now = s.time ?? 0;
    if (this.trySquadAbility(s, allies, opponents, enemyTowers, critical)) return;
    this.recentPlays = this.recentPlays.filter(p => now - p.time < 12);
    const present = new Set(opponents.map(u => u.id));
    for (const id of this.seenThreats.keys()) if (!present.has(id)) this.seenThreats.delete(id);
    const threats = opponents.filter(u => u.y < (this.game.height ?? 640) / 2 + 30 && !u.isBuilding);
    for (const u of threats) if (!this.seenThreats.has(u.id)) this.seenThreats.set(u.id, now);
    const reacted = threats.filter(u => now - this.seenThreats.get(u.id) >= this.config.reaction);
    const candidates = [];
    for (let index = 0; index < hand.length; index++) {
      const cardId = hand[index], card = cardFor(this.game,cardId,'enemy');
      if (!card || card.cost > elixir + 1e-8) continue;
      if (card.type === 'spell') {
        this.spellCandidates(candidates, index, cardId, card, opponents, enemyTowers, reacted, allies, critical);
        continue;
      }
      const role = roleFor(this.game,cardId,card);
      if (reacted.length) this.defenseCandidates(candidates, index, cardId, card, role, reacted, allies, friendlyTowers, critical);
      this.attackCandidates(candidates, index, cardId, card, role, allies, enemyTowers, threats, elixir, opponents, critical.length > 0);
    }
    for (const c of candidates) c.score += quality(cardFor(this.game,c.cardId,'enemy'),c.cardId)+this.random() * this.config.choiceNoise;
    candidates.sort((a, b) => b.score - a.score);
    for (const candidate of candidates) {
      if (candidate.score < 1) break;
      const point = this.validPosition(candidate);
      if (!point) continue;
      const result = this.game.playCard('enemy', candidate.index, point.x, point.y);
      if (result?.ok) {
        this.decisionCount++;
        this.lastDecision = { time: now, cardId: candidate.cardId, intent: candidate.intent, ...point };
        this.recentPlays.push({ ...this.lastDecision });
        return;
      }
      if ((s.hands?.enemy ?? [])[candidate.index] !== candidate.cardId) return;
    }
  }

  trySquadAbility(s, allies, opponents, towers, critical) {
    if (typeof this.game.getAbilities !== 'function' || typeof this.game.activateAbility !== 'function') return false;
    for (const ability of this.game.getAbilities('enemy')) {
      if (!ability.ready || ability.aliveCount < 3) continue;
      const members = allies.filter(u => ability.memberIds.includes(u.id));
      if (!members.length) continue;
      // Old rules can attack in guard. Rules 4 need charge for any attack, so
      // a ready squad may spend its ability to fight an already adjacent foe.
      const visible = [...opponents.filter(u => !flying(u, this.game)), ...towers];
      const nearest = visible.reduce((best, u) => !best || dist(ability, u) < dist(ability, best) ? u : best, null);
      if (!nearest) continue;
      const separation = dist(ability, nearest);
      const rescuing = critical.some(u => dist(ability, u) > 75 && dist(ability, u) < 190);
      const pushing = separation > 85 && separation < 210 && !opponents.some(u => !flying(u, this.game) && dist(ability, u) < 65);
      const engaging=this.game.rulesVersion>=4&&separation<=85&&members.some(u=>u.formationState!=='charge');
      if ((!rescuing && !pushing && !engaging) || (s.elixir.enemy ?? 0) < ability.cost + (rescuing||engaging ? 0 : this.config.reserve)) continue;
      const result = this.game.activateAbility('enemy', ability.groupId);
      if (result?.ok) {
        this.decisionCount++;
        this.lastDecision = { time: s.time, cardId: 'phalanx', intent: 'charge', x: ability.x, y: ability.y, groupId: ability.groupId };
        return true;
      }
    }
    return false;
  }

  defenseCandidates(out, index, cardId, card, role, threats, allies, towers, critical = []) {
    if (role.assault) return;
    const style = STYLES[this.style];
    const criticalIds = new Set(critical.map(u => u.id));
    if (role.building) {
      // A flank building cannot attract the opposite lane. While both attackers
      // are still near the river, a central placement is within both sight radii.
      const approaching = threats.filter(u => !flying(u, this.game) && u.y >= 275 && (u.targets ?? cardFor(this.game,u.cardId,u.team)?.targets) === 'buildings');
      if (new Set(approaching.map(laneOf)).size > 1) {
        const point = { x: 240, y: clamp(Math.min(...approaching.map(u => u.y)) - 20, 245, 275) };
        if (!allies.some(u => u.isBuilding && dist(u, point) < 150)) {
          out.push({ index, cardId, ...point, score: 17 + style.defense, intent: 'defend' });
        }
      }
    }
    for (const target of [...threats].sort((a, b) => a.y - b.y).slice(0, 12)) {
      if (flying(target, this.game) && !role.antiAir) continue;
      const local = threats.filter(u => dist(u, target) < 85);
      const ground = local.filter(u => !flying(u, this.game)).length;
      const air = local.some(u => flying(u, this.game));
      const towerDistance = Math.min(...towers.map(t => dist(t, target)), 350);
      const tankThreat = (target.targets ?? cardFor(this.game,target.cardId,target.team)?.targets) === 'buildings';
      const defenders = allies.filter(u => dist(u, target) < Math.max(130,(u.range ?? cardFor(this.game,u.cardId,u.team)?.range ?? 0)+(u.radius||0)+(target.radius||0)) && canAttack(u, target,this.game));
      const threatValue = local.reduce((n, u) => n + unitValue(u,this.game), 0);
      const coverage = defenders.reduce((n, u) => n + combatValue(u,this.game), 0);
      const recentSpend = this.recentPlays.filter(p => p.intent === 'defend' && this.lastTime - p.time < 2 && dist(p, target) < 140)
        .reduce((n, p) => n + cardFor(this.game,p.cardId,'enemy').cost, 0);
      // Nearby living defenders and still-deploying reinforcements both count.
      // A small skirmish must not repeatedly consume the entire hand.
      const excess = Math.max(0, coverage - threatValue - (towerDistance < 65 ? 3 : 0));
      let score = 5 + role.defense + style.defense + Math.max(0, 240 - towerDistance) / 45;
      score -= excess * 1.7 + recentSpend * 0.35 + card.cost * 0.25;
      if (role.splash) score += ground >= 3 ? 3 : -0.5;
      if (role.antiAir && air) score += 2.2;
      if (role.antiTank) score += (target.maxHp || target.hp) > 1000 ? 2.7 : ground >= 3 ? -2 : 0;
      if (role.building && tankThreat) score += 3.2;
      if (role.building && allies.some(u => u.isBuilding && dist(u, target) < 170)) score -= 12;
      if (role.swarm && local.some(u => (u.splashRadius ?? cardFor(this.game,u.cardId,u.team)?.splashRadius) > 0)) score -= 4.3;
      if (criticalIds.has(target.id)) score += 16;
      if (!criticalIds.has(target.id) && coverage > threatValue * 2 + 3 && towerDistance > 90) continue;
      const lane = laneOf(target);
      const x = role.building ? (lane + 240) / 2 : target.x + (role.ranged ? (target.x < 240 ? 16 : -16) : 0);
      const rangedSpacing=clamp(90+(card.range-(CARDS[cardId]?.range ?? card.range))*.65,24,180);
      const y = role.building ? Math.min(target.y - 45, 245) : target.y - (role.ranged ? rangedSpacing : role.disposable ? 45 : 38);
      out.push({ index, cardId, x: clamp(x, 35, 445), y: clamp(y, 45, 280), score, intent: 'defend' });
    }
  }

  attackCandidates(out, index, cardId, card, role, allies, towers, threats, elixir, opponents, criticalKing = false) {
    if (role.building || !towers.length || criticalKing) return;
    const style = STYLES[this.style], s = this.game.state;
    const now = s.time ?? 0;
    const behind = (s.crowns?.enemy ?? 0) < (s.crowns?.player ?? 0);
    const timeLeft = this.game.getTimeRemaining?.() ?? 180 - now;
    const urgency = (now >= 120 ? 0.7 : 0) + (s.phase === 'overtime' ? 0.8 : 0) + (behind && timeLeft < 40 ? 1.8 : 0);
    const threshold = clamp(this.config.attackAt + style.attackAt - urgency, 4.2, 9.5);
    const reserve = Math.max(0, this.config.reserve + style.reserve - urgency * 0.35);
    const laneBudget = (this.style === 'beatdown' ? 16 : this.style === 'cycle' ? 11 : 13) + urgency;
    const princesses = towers.filter(t => t.type === 'princess');
    const options = (princesses.length ? princesses : towers).map(tower => {
      const lane = tower.x < 200 ? 120 : tower.x > 280 ? 360 : this.preferredLane;
      const nearby = opponents.filter(u => laneOf(u) === lane && u.y > 285);
      const buildings = nearby.filter(u => u.isBuilding && u.y < 510);
      const ownPush = allies.filter(u => laneOf(u) === lane && !u.isBuilding && u.y > 170).reduce((n, u) => n + unitValue(u,this.game), 0);
      const invested = allies.filter(u => !u.isBuilding && Math.abs(u.x - lane) < 100).reduce((n, u) => n + unitValue(u,this.game), 0);
      const commitment = nearby.filter(u => !u.isBuilding).reduce((n, u) => n + unitValue(u,this.game), 0);
      const otherCommitment = opponents.filter(u => laneOf(u) !== lane && !u.isBuilding && u.y > 285).reduce((n, u) => n + unitValue(u,this.game), 0);
      const split = clamp(otherCommitment - commitment, -6, 6) * style.split;
      const buildingPenalty = buildings.reduce((n, u) => n + unitValue(u,this.game), 0) * (role.assault ? 1.5 : 0.4);
      const excess = Math.max(0, invested + card.cost - laneBudget);
      const score = (1 - tower.hp / (tower.maxHp || tower.hp)) * 5 + ownPush * 0.35 + split - buildingPenalty - excess * 1.8 + (lane === this.preferredLane ? 0.3 : 0);
      return { lane, score, ownPush, split, buildings };
    }).sort((a, b) => b.score - a.score);
    const chosen = options[0], lane = chosen.lane;
    const immediateDanger = threats.some(u => u.y < 215 && unitValue(u,this.game) > 0.65);
    if (immediateDanger) return;
    const laneAllies = allies.filter(u => !u.isBuilding && Math.abs(u.x - lane) < 100);
    const tank = laneAllies.find(u => ROLE[u.cardId]?.frontline && u.y > 110 && u.hp > (u.maxHp || 1) * 0.3);
    const laneValue = laneAllies.reduce((n, u) => n + unitValue(u,this.game), 0);
    if (laneValue + card.cost > laneBudget) return;
    if (role.tank) {
      if (elixir < threshold || allies.some(u => u.cardId === cardId)) return;
      out.push({ index, cardId, x: lane, y: urgency > 1.5 ? 250 : 90,
        score: 6.5 + style.tank + (elixir > 9 ? 1.8 : 0) + urgency, intent: 'tank-push' });
      return;
    }
    if (role.fast && elixir >= threshold && elixir - card.cost >= reserve) {
      if (!laneAllies.some(u => u.cardId === cardId && u.y < 410)) {
        out.push({ index, cardId, x: lane, y: 270,
          score: 6 + style.pressure + urgency + Math.max(0, chosen.split) * 0.5 - chosen.buildings.length * 1.2,
          intent: chosen.split > 1.5 ? 'split-pressure' : 'pressure' });
      }
    }
    if (tank && !role.assault && elixir - card.cost >= (threats.length ? reserve : Math.max(0, reserve - 1))) {
      const supports = laneAllies.filter(u => u.id !== tank.id && Math.abs(u.y - tank.y) < 135);
      const supportValue = supports.reduce((n, u) => n + unitValue(u,this.game), 0);
      if (supportValue < 8 && laneValue < 13) {
        const buildingSupport = chosen.buildings.length && (role.ranged || role.antiAir) ? 0.7 : 0;
        out.push({ index, cardId, x: lane + (role.ranged ? 18 : -12), y: clamp(tank.y - 62, 85, 275),
          score: 3.5 + role.support + style.support - supportValue * 0.5 + buildingSupport, intent: 'support' });
      }
    }
    const counterpush = this.style === 'control' && laneAllies.some(u => u.y > 225 && unitValue(u,this.game) >= 1.2);
    if (elixir >= threshold - (counterpush ? 1 : 0) && elixir - card.cost >= reserve && !threats.length && laneValue < 12) {
      out.push({ index, cardId, x: lane, y: role.ranged && !counterpush ? 105 : 265,
        score: role.cycle + style.pressure + urgency + (elixir > 9 ? 2 : 0) + (counterpush ? 1 : 0),
        intent: counterpush ? 'counterpush' : chosen.split > 1.5 ? 'split-pressure' : 'pressure' });
    }
  }

  spellCandidates(out, index, cardId, card, opponents, towers, threats, allies, critical = []) {
    const radius = card.spellRadius || 60, dot = isDot(card);
    const damage = card.damage || 0, towerDamage = card.crownDamage ?? damage * 0.3;
    const now = this.game.state.time ?? 0;
    const limited = this.game.rulesVersion >= 5 && card.targetSelection === 'highest-hp';
    // Target-capped spells must account for every visible body, including a
    // healthy tower occupying a slot. Candidate generation can stay bounded,
    // but an omitted high-HP body must never turn into fictional AoE value.
    const selectedAt = point => limited ? selectSpellTargets([
      ...(this.game.state.units ?? opponents), ...(this.game.state.towers ?? towers)
    ], 'enemy', card, point.x, point.y, this.game.rulesVersion) : null;
    const criticalIds = new Set(critical.map(u => u.id));
    const alreadyCovered = point => this.recentPlays.some(p => {
      const previous = cardFor(this.game,p.cardId,'enemy');
      return previous.type === 'spell' && dist(p, point) < (previous.spellRadius || 60) * 0.7 &&
        (isDot(previous)
          ? p.cardId === cardId && now - p.time < previous.duration
          : now - p.time < (previous.castDelay || 0.4) + 0.2);
    });
    // Poison's full-duration damage is not guaranteed. It is never treated as
    // an instant finisher, even when its theoretical total exceeds tower HP.
    if (!dot) for (const tower of towers) {
      const decisive = tower.type === 'king' || this.game.state.phase === 'overtime';
      if (tower.hp <= towerDamage && towerDamage > 0 && !alreadyCovered(tower) && (decisive || !critical.length) &&
          (!limited || selectedAt(tower).some(target => target.id === tower.id))) {
        out.push({ index, cardId, x: tower.x, y: tower.y, score: decisive ? 80 : 23, intent: 'finish-tower', exact: true });
      }
    }
    const visible = opponents.slice(0, 40);
    const points = visible.map(u => ({ x: u.x, y: u.y }));
    for (let i = 0; i < Math.min(visible.length, 14); i++) {
      for (let j = i + 1; j < Math.min(visible.length, 14); j++) {
        if (dist(visible[i], visible[j]) <= radius * 1.65) points.push({ x: (visible[i].x + visible[j].x) / 2, y: (visible[i].y + visible[j].y) / 2 });
      }
    }
    const threatIds = new Set(threats.map(u => u.id));
    for (const point of points) {
      if (alreadyCovered(point)) continue;
      const selected = selectedAt(point);
      const hits = selected ? selected.filter(u => u.kind !== 'tower') :
        visible.filter(u => dist(u, point) <= radius - this.config.aim * 0.5 + (u.radius || 0));
      if (!hits.length) continue;
      let value = 0, controlValue = 0, threatened = false, breaksBuilding = false, urgentStun = false, rescuePriority = 0;
      for (const u of hits) {
        const def = cardFor(this.game,u.cardId,u.team);
        const reduction=u.cardId==='phalanx'&&u.formationProtected?clamp(u.damageReduction ?? def?.damageReduction ?? 0,0,1):0;
        let expectedDamage = damage*(1-reduction);
        if (dot) {
          const ticks = Math.floor(card.duration / card.tickInterval);
          const dwell = u.isBuilding ? ticks : Math.max(1, Math.min(u.targetId ? 3 : 2,
            Math.floor((radius + (u.radius || 0)) / Math.max(20, u.speed ?? def?.speed ?? 40) / card.tickInterval)));
          expectedDamage *= Math.min(ticks, dwell);
        }
        value += ((def?.cost ?? 3) / (def?.count ?? 1)) * Math.min(1, expectedDamage / Math.max(1, u.hp));
        if (threatIds.has(u.id)) threatened = true;
        if (u.isBuilding && allies.some(a => ROLE[a.cardId]?.assault && dist(a, u) < 215)) breaksBuilding = true;
        if (card.stunDuration && threatIds.has(u.id) && u.y < 205 && allies.some(a => dist(a, u) < 125)) urgentStun = true;
        if (limited && card.stunDuration > 0 && threatIds.has(u.id) && unitDps(u, this.game) > 0) {
          controlValue += Math.min(2, card.stunDuration) * Math.min(1.5, unitValue(u, this.game) * .45) / 2;
        }
        if (limited && card.groundingDuration > 0 && flying(u, this.game) && allies.some(a =>
          a.targets === 'ground' && unitDps(a, this.game) > 0 && dist(a, u) < 125)) controlValue += 1.2;
        if (!dot && criticalIds.has(u.id)) {
          rescuePriority = Math.max(rescuePriority, expectedDamage >= u.hp ? 32 : card.stunDuration > 0 ? 16 : 0);
        }
      }
      const tacticalValue = value + controlValue + (breaksBuilding ? 1.2 : 0) + (urgentStun ? 1 : 0);
      const singleWorthwhile = hits.length > 1 || breaksBuilding || urgentStun || (threatened && value >= card.cost * 0.9);
      if (!rescuePriority && (!singleWorthwhile || tacticalValue < card.cost * 0.72)) continue;
      const towerHit = selected ? selected.some(t => t.kind === 'tower') : towers.some(t => dist(t, point) < radius + (t.radius || 0));
      out.push({ index, cardId, ...point,
        score: 3 + tacticalValue * 1.7 - card.cost * 0.55 + (threatened ? 3 : 0) + (towerHit ? 0.6 : 0) + STYLES[this.style].spell + rescuePriority,
        intent: breaksBuilding ? 'clear-building' : dot ? 'control-spell' : 'cluster-spell', exact: true });
    }
  }

  validPosition(candidate) {
    const aim = candidate.exact ? 0 : this.config.aim;
    const positions = [
      { x: candidate.x + (this.random() - 0.5) * aim * 2, y: candidate.y + (this.random() - 0.5) * aim * 2 },
      { x: candidate.x, y: candidate.y },
    ];
    if (!candidate.exact) {
      const inward = candidate.x < 240 ? 1 : -1;
      positions.push({ x: candidate.x - 24, y: candidate.y }, { x: candidate.x + 24, y: candidate.y }, { x: candidate.x, y: candidate.y - 28 });
      // Narrow offsets can all overlap a princess tower. Check wider flanks
      // through the same engine API instead of silently abandoning defense.
      if (candidate.intent === 'defend') positions.push(
        { x: candidate.x + inward * 48, y: candidate.y },
        { x: candidate.x - inward * 48, y: candidate.y },
        { x: candidate.x + inward * 72, y: candidate.y + 24 },
        { x: candidate.x, y: candidate.y + 42 },
      );
    }
    for (const p of positions) {
      const result = this.game.canDeploy('enemy', candidate.cardId, p.x, p.y);
      if (result === true || result?.ok === true) return p;
    }
    return null;
  }

  exportSnapshot() {
    return {
      version: 2, difficulty: this.difficulty, style: this.style, enabled: this.enabled,
      seed: this.seed, rngState: this.rngState, config: { ...this.config }, wait: this.wait,
      preferredLane: this.preferredLane, decisionCount: this.decisionCount, lastTime: this.lastTime,
      seenThreats: [...this.seenThreats].map(([id, time]) => [id, time]),
      recentPlays: this.recentPlays.map(p => ({ ...p })),
      lastDecision: this.lastDecision ? { ...this.lastDecision } : null,
    };
  }

  static fromSnapshot(game, data) {
    validateSnapshot(data);
    const ai = new BattleAI(game, { difficulty: data.difficulty, style: data.style, seed: data.seed });
    ai.enabled = data.enabled;
    ai.rngState = data.rngState;
    ai.config = { ...data.config };
    ai.wait = data.wait;
    ai.preferredLane = data.preferredLane;
    ai.decisionCount = data.decisionCount;
    ai.lastTime = data.lastTime;
    ai.seenThreats = new Map(data.seenThreats.map(([id, time]) => [id, time]));
    ai.recentPlays = data.recentPlays.map(p => ({ ...p }));
    ai.lastDecision = data.lastDecision ? { ...data.lastDecision } : null;
    return ai;
  }
}

function validateSnapshot(d) {
  const fail = () => { throw new TypeError('AI 저장 데이터가 손상되었거나 지원하지 않는 버전입니다.'); };
  const object = x => x !== null && typeof x === 'object' && !Array.isArray(x);
  const finite = (n, min, max) => Number.isFinite(n) && n >= min && n <= max;
  const uint = n => Number.isInteger(n) && finite(n, 0, 4294967295);
  if (!object(d) || d.version !== 2 || !Object.hasOwn(DIFFICULTIES, d.difficulty) || !Object.hasOwn(STYLES, d.style) ||
      typeof d.enabled !== 'boolean' || !uint(d.seed) || !uint(d.rngState) || !finite(d.wait, 0, 10) ||
      ![120, 360].includes(d.preferredLane) || !Number.isSafeInteger(d.decisionCount) || d.decisionCount < 0 ||
      !finite(d.lastTime, -1, 1e8) || !object(d.config)) fail();
  const bounds = { think: [0.05, 5], reaction: [0, 5], aim: [0, 50], reserve: [0, 10], attackAt: [0, 10], choiceNoise: [0, 5] };
  if (Object.keys(d.config).length !== Object.keys(bounds).length) fail();
  for (const [key, [min, max]] of Object.entries(bounds)) if (!finite(d.config[key], min, max)) fail();
  if (!Array.isArray(d.seenThreats) || d.seenThreats.length > 1000 || !Array.isArray(d.recentPlays) || d.recentPlays.length > 1000) fail();
  const ids = new Set();
  for (const pair of d.seenThreats) {
    if (!Array.isArray(pair) || pair.length !== 2 ||
        !(typeof pair[0] === 'string' && pair[0].length <= 100 || Number.isSafeInteger(pair[0])) ||
        !finite(pair[1], 0, 1e8) || ids.has(pair[0])) fail();
    ids.add(pair[0]);
  }
  const intents = new Set(['defend', 'tank-push', 'support', 'pressure', 'split-pressure', 'counterpush', 'finish-tower', 'clear-building', 'control-spell', 'cluster-spell', 'charge']);
  const decision = p => object(p) && Object.hasOwn(CARDS, p.cardId) && intents.has(p.intent) &&
    finite(p.time, 0, 1e8) && finite(p.x, 0, 480) && finite(p.y, 0, 640) &&
    (p.intent !== 'charge' || (p.cardId === 'phalanx' && typeof p.groupId === 'string' && /^g\d{1,9}$/.test(p.groupId)));
  if (d.lastDecision !== null && !decision(d.lastDecision)) fail();
  for (const p of d.recentPlays) if (!decision(p) || p.intent === 'charge') fail();
}
