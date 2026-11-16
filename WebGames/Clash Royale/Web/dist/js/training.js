import { Game, CARDS } from './engine.js';

const TRAINING_DECK = Object.freeze(['cannon', 'knight', 'arrows', 'giant', 'archers', 'goblins', 'fireball', 'minions']);
const ENEMY_DECK = Object.freeze(['hog_rider', 'minions', 'goblins', 'knight', 'archers', 'cannon', 'arrows', 'fireball']);
const clone = value => JSON.parse(JSON.stringify(value));
const living = unit => unit.hp > 0 && !unit.destroyed;

export const TRAINING_MISSIONS = Object.freeze([
  Object.freeze({ id: 'defend', number: '01', name: '중앙으로 유인하기', subtitle: '건물 배치 · 수비', seed: 11, limit: 35,
    description: '왼쪽 다리로 오는 돌격 기수를 중앙 대포로 끌어내고, 아군 왼쪽 타워 체력을 75% 이상 지키세요.',
    hint: '대포를 금색 원에 배치하세요. 돌격 기수가 대포를 공격하면 기사로 마무리할 수 있습니다.',
    cards: ['cannon', 'knight'], target: Object.freeze({ x: 210, y: 395, radius: 26, label: '대포 유인 위치' }),
    waves: Object.freeze([Object.freeze({ at: 2, card: 'hog_rider', x: 120, y: 280 })]) }),
  Object.freeze({ id: 'spell', number: '02', name: '공중 무리 정리하기', subtitle: '주문 범위 · 대공', seed: 21, limit: 25,
    description: '접근하는 미니언 세 기를 화살비 한 번에 맞히세요. 아군 왼쪽 타워 체력을 75% 이상 지켜야 합니다.',
    hint: '화살비를 고르고 세 미니언이 모두 범위에 들어오게 조준하세요. 주문은 강 건너에도 사용할 수 있습니다.',
    cards: ['arrows'], target: Object.freeze({ x: 120, y: 275, radius: 48, label: '미니언 접근 방향' }),
    waves: Object.freeze([Object.freeze({ at: 2, card: 'minions', x: 120, y: 275 })]) }),
  Object.freeze({ id: 'push', number: '03', name: '전열과 지원 연결하기', subtitle: '탱커 · 지원 · 엘릭서', seed: 3, limit: 75,
    description: '거인 뒤에 궁수를 배치하고, 왼쪽 적 타워에 925 이상의 피해를 누적하세요. 고블린 수비를 넘어야 합니다.',
    hint: '먼저 왼쪽에 거인을 배치하세요. 엘릭서 3이 모이면 이동 중인 거인 뒤에 궁수를 붙이세요.',
    cards: ['giant', 'archers'], target: Object.freeze({ x: 120, y: 425, radius: 28, label: '거인 출발 위치' }),
    waves: Object.freeze([Object.freeze({ at: 7, card: 'goblins', x: 120, y: 280 })]) }),
]);

/** Short scripted exercises. Every deployment uses the normal cost/hand/placement transaction. */
export class TrainingRun {
  constructor(id) {
    const mission = TRAINING_MISSIONS.find(m => m.id === id);
    if (!mission) throw new Error('훈련을 찾을 수 없습니다.');
    this.mission = mission;
    this.game = new Game({ deck: [...TRAINING_DECK], enemyDeck: [...ENEMY_DECK], seed: mission.seed, difficulty: 'normal', practice: true });
    this.waveCursor = 0;
    this.waveRetry = null;
    this.enemyIds = [];
    this.commandCursor = 0;
    this.flags = { pulled: false, volley: false, supported: false };
    this.volley = null;
    this.done = false;
    this.success = false;
    this.reason = '';
    this.game.start();
  }

  step(dt) {
    if (this.done || !Number.isFinite(dt) || dt <= 0) return;
    if (this.game.state.phase === 'finished') {
      this._finish(false, this.game.state.reason === 'concede' ? '훈련을 종료했습니다.' : '전투가 끝나 훈련을 종료했습니다.');
      return;
    }
    if (!this.game.state.running) return;
    const { state } = this.game;
    while (this.waveCursor < this.mission.waves.length && state.time + 1e-7 >= this.mission.waves[this.waveCursor].at) {
      if (this.waveRetry && state.time + 1e-7 < this.waveRetry.nextTime) break;
      const wave = this.mission.waves[this.waveCursor];
      const index = state.hands.enemy.indexOf(wave.card);
      const before = new Set(state.units.map(u => u.id));
      let placed = false;
      // Crowding or a restored hand can temporarily make the preferred point
      // unavailable. Keep the wave in its lane and use the normal paid API.
      if (index >= 0) for (const [dx, dy] of [[0, 0], [0, -24], [-24, 0], [24, 0], [-24, -24], [24, -24], [0, 24]]) {
        if (!this.game.canDeploy('enemy', wave.card, wave.x + dx, wave.y + dy).ok) continue;
        if (this.game.playCard('enemy', index, wave.x + dx, wave.y + dy).ok) { placed = true; break; }
      }
      if (!placed) {
        const retry = this.waveRetry || { waveIndex: this.waveCursor, firstTime: state.time, nextTime: state.time, attempts: 0 };
        retry.attempts++;
        if (state.time - retry.firstTime + 1e-7 >= 3) {
          this.waveRetry = null;
          this._finish(false, '적 병력을 배치하지 못했습니다. 훈련을 다시 시작해 주세요.');
          return;
        }
        retry.nextTime = state.time + .25;
        this.waveRetry = retry;
        break;
      }
      this.waveRetry = null;
      this.enemyIds.push(...state.units.filter(u => u.team === 'enemy' && !before.has(u.id)).map(u => u.id));
      this.waveCursor++;
    }
    this._observeCommands();
    this.game.update(dt);
    this._evaluate();
  }

  _observeCommands() {
    const s = this.game.state;
    while (this.commandCursor < this.game.commands.length) {
      const commandIndex = this.commandCursor;
      const c = this.game.commands[this.commandCursor++];
      if (c.team !== 'player') continue;
      if (this.mission.id === 'spell' && c.cardId === 'arrows') {
        const targets = s.units.filter(u => this.enemyIds.includes(u.id) && living(u) &&
          Math.hypot(u.x - c.x, u.y - c.y) <= CARDS.arrows.spellRadius + u.radius * .65);
        if (targets.length === 3) this.volley = { ids: targets.map(u => u.id),
          deadline: c.tick + Math.ceil(CARDS.arrows.castDelay * 60) + 2, commandIndex };
      }
      if (this.mission.id === 'push' && c.cardId === 'archers' && c.x < 240) {
        const giant = s.units.find(u => living(u) && u.team === 'player' && u.cardId === 'giant' &&
          u.x < 240 && c.y > u.y + 18 && c.y < u.y + 190 && Math.abs(c.x - u.x) < 100);
        if (giant) this.flags.supported = true;
      }
    }
  }

  _evaluate() {
    const s = this.game.state;
    const own = s.towers.find(t => t.id === 'player-left');
    const target = s.towers.find(t => t.id === 'enemy-left');
    const hostiles = s.units.filter(u => this.enemyIds.includes(u.id) && living(u));
    if (this.mission.id === 'defend') {
      for (const u of hostiles) {
        const cannon = s.units.find(v => v.id === u.targetId && v.team === 'player' && v.cardId === 'cannon');
        if (cannon && cannon.x >= 170 && cannon.x <= 300 && cannon.y >= 350 && cannon.y <= 450) this.flags.pulled = true;
      }
    }
    if (this.volley) {
      const command = this.game.commands[this.volley.commandIndex];
      const resolution = this.game.getSpellResolutions().find(r => r.team === 'player' && r.cardId === 'arrows' &&
        r.tick > command.tick && r.tick <= this.volley.deadline && (r.commandIndex === this.volley.commandIndex ||
          // Older saves have no pending-spell input index. Their single paid
          // volley is identified by its recorded point and finite cast window.
          (r.commandIndex === null && r.x === command.x && r.y === command.y)));
      if (resolution && this.volley.ids.every(id => resolution.hits.some(hit =>
        hit.id === id && hit.team === 'enemy' && hit.damage > 0 && hit.killed))) this.flags.volley = true;
      if (resolution || s.tick >= this.volley.deadline) this.volley = null;
    }
    const protectedTower = own.hp >= own.maxHp * .75;
    const spawned = this.waveCursor === this.mission.waves.length;
    const success = this.mission.id === 'defend' ? spawned && !hostiles.length && this.flags.pulled && protectedTower :
      this.mission.id === 'spell' ? this.flags.volley && protectedTower : this.flags.supported && target.maxHp - target.hp >= 925;
    if (success) return this._finish(true, '목표를 모두 달성했습니다.');
    if (this.mission.id !== 'push' && !protectedTower) return this._finish(false, '아군 왼쪽 타워 체력이 75% 아래로 내려갔습니다. 조금 더 일찍 수비해 보세요.');
    if (spawned && !hostiles.length && this.mission.id !== 'push') return this._finish(false,
      this.mission.id === 'defend' ? '기수를 막았지만 중앙 대포로 유인하지 못했습니다.' : '미니언을 막았지만 화살비 한 번에 세 기를 정리하지 못했습니다.');
    if (s.time + 1e-7 >= this.mission.limit || s.phase === 'finished') this._finish(false,
      this.mission.id === 'push' ? '시간 안에 전열·지원 연결과 타워 피해 목표를 달성하지 못했습니다.' : '제한 시간이 끝났습니다. 목표 카드를 먼저 배치해 보세요.');
  }

  _finish(success, reason) { this.done = true; this.success = success; this.reason = reason; this.game.pause(); }

  get progress() {
    const s = this.game.state;
    const own = s.towers.find(t => t.id === 'player-left');
    const target = s.towers.find(t => t.id === 'enemy-left');
    if (this.mission.id === 'defend') return [
      { label: '중앙 대포로 기수 유인', complete: this.flags.pulled },
      { label: '기수 처치 · 아군 타워 75% 이상', complete: this.success },
    ];
    if (this.mission.id === 'spell') return [
      { label: '화살비로 미니언 세 기 정리', complete: this.flags.volley },
      { label: `아군 타워 ${Math.ceil(own.hp / own.maxHp * 100)}% 유지`, complete: this.done && this.success },
    ];
    return [
      { label: '거인 뒤에 궁수 배치', complete: this.flags.supported },
      { label: `왼쪽 타워 피해 ${Math.min(925, Math.floor(target.maxHp - target.hp))} / 925`, complete: target.maxHp - target.hp >= 925 },
    ];
  }

  get target() {
    if (this.mission.id === 'spell') {
      const u = this.game.state.units.find(v => this.enemyIds.includes(v.id) && living(v));
      if (u) return { x: u.x, y: u.y, radius: 35, label: '세 기를 함께 조준' };
    }
    if (this.mission.id === 'push' && !this.flags.supported) {
      const giant = this.game.state.units.find(u => living(u) && u.team === 'player' && u.cardId === 'giant');
      if (giant) return { x: giant.x, y: Math.max(365, Math.min(560, giant.y + 75)), radius: 25, label: '궁수 지원 위치' };
    }
    return this.mission.target;
  }

  exportSnapshot() {
    return clone({ version: 1, id: this.mission.id, waveCursor: this.waveCursor, enemyIds: this.enemyIds,
      commandCursor: this.commandCursor, flags: this.flags, volley: this.volley, done: this.done, success: this.success, reason: this.reason,
      ...(this.waveRetry ? { waveRetry: this.waveRetry } : {}) });
  }

  static fromSnapshot(game, snapshot) {
    const fail = () => { throw new Error('저장한 훈련 상태가 올바르지 않습니다.'); };
    if (!snapshot || snapshot.version !== 1) fail();
    const run = new TrainingRun(snapshot.id);
    const s = snapshot;
    if (!game.practice || game.seed !== run.mission.seed || game.deck.join() !== TRAINING_DECK.join() || game.enemyDeck.join() !== ENEMY_DECK.join() ||
      !Number.isInteger(s.waveCursor) || s.waveCursor < 0 || s.waveCursor > run.mission.waves.length ||
      !Number.isInteger(s.commandCursor) || s.commandCursor < 0 || s.commandCursor > game.commands.length ||
      !Array.isArray(s.enemyIds) || s.enemyIds.length > 12 || s.enemyIds.some(id => typeof id !== 'string' || !/^u\d+$/.test(id)) ||
      !s.flags || ['pulled', 'volley', 'supported'].some(key => typeof s.flags[key] !== 'boolean') ||
      s.done !== false || s.success !== false || s.reason !== '') fail();
    if (s.volley !== null && (!s.volley || run.mission.id !== 'spell' || !Array.isArray(s.volley.ids) || s.volley.ids.length !== 3 ||
      new Set(s.volley.ids).size !== 3 ||
      s.volley.ids.some(id => !s.enemyIds.includes(id)) || !Number.isInteger(s.volley.deadline) ||
      s.volley.deadline < 0 || s.volley.deadline > game.state.tick + 24)) fail();
    let volley = null;
    if (s.volley) {
      const commandIndex = s.volley.commandIndex ?? game.commands.findLastIndex(c => c.team === 'player' && c.cardId === 'arrows' &&
        c.tick + Math.ceil(CARDS.arrows.castDelay * 60) + 2 === s.volley.deadline);
      const command = game.commands[commandIndex];
      if (!Number.isInteger(commandIndex) || commandIndex < 0 || !command || command.team !== 'player' || command.cardId !== 'arrows' ||
          command.tick + Math.ceil(CARDS.arrows.castDelay * 60) + 2 !== s.volley.deadline) fail();
      volley = { ...clone(s.volley), commandIndex };
    }
    if (s.waveRetry !== undefined) {
      const r = s.waveRetry;
      if (!r || r.waveIndex !== s.waveCursor || s.waveCursor >= run.mission.waves.length ||
          !Number.isFinite(r.firstTime) || r.firstTime < run.mission.waves[s.waveCursor].at - 1e-7 || r.firstTime > game.state.time + 1e-7 ||
          !Number.isFinite(r.nextTime) || r.nextTime < r.firstTime || r.nextTime > game.state.time + .25 + 1e-7 ||
          !Number.isInteger(r.attempts) || r.attempts < 1 || r.attempts > 20) fail();
    }
    run.game = game;
    run.waveCursor = s.waveCursor; run.enemyIds = [...s.enemyIds]; run.commandCursor = s.commandCursor;
    run.flags = { pulled: s.flags.pulled, volley: s.flags.volley, supported: s.flags.supported };
    run.volley = volley;
    run.waveRetry = s.waveRetry ? clone(s.waveRetry) : null;
    return run;
  }
}
