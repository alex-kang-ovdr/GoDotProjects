(function () {
  'use strict';
  const SW = globalThis.Starward ||= {};
  const SYSTEM_IDS = ['engines', 'shields', 'weapons', 'bridge', 'oxygen', 'medbay'];
  const AUX_IDS = ['drones', 'teleporter', 'cloaking'];
  const POWER_IDS = SYSTEM_IDS.concat(AUX_IDS);
  const SKILL_IDS = ['piloting', 'engines', 'weapons', 'shields', 'repair', 'combat'];
  const WEAPON_TYPES = ['laser', 'missile', 'beam', 'ion'];
  const ENVIRONMENT_IDS = ['asteroids', 'solar', 'ion_storm'];
  const AI_PROFILES = ['raider', 'disruptor', 'boarding', 'artillery'];
  const REFIT_MODES = new Set(['briefing', 'map', 'shop', 'reward']);
  const outcome = (ok, message) => ({ ok, message });
  const MODES = new Set(['briefing', 'combat', 'map', 'event', 'shop', 'reward', 'victory', 'defeat']);
  const STEP = 1 / 30;
  const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
  const finite = n => typeof n === 'number' && Number.isFinite(n);
  const integer = n => finite(n) && Number.isInteger(n);
  const clone = value => JSON.parse(JSON.stringify(value));
  const frozenDefinitions = new WeakSet();
  const readonly = value => {
    if (!value || typeof value !== 'object' || frozenDefinitions.has(value)) return value;
    frozenDefinitions.add(value);
    for (const child of Object.values(value)) readonly(child);
    return Object.freeze(value);
  };

  class Game {
    constructor(seed, options = {}) {
      this.newRun(seed, options);
    }

    newRun(seed, options = {}) {
      if (!options || typeof options !== 'object' || Array.isArray(options)) return outcome(false, '출항 설정이 올바르지 않습니다.');
      const loadoutId = options.loadoutId ?? 'argo';
      const difficulty = options.difficulty ?? 'standard';
      if (!this._validRunOptions(loadoutId, difficulty)) return outcome(false, '알 수 없는 함선 또는 난이도입니다.');
      const loadout = SW.DATA.loadouts?.[loadoutId];
      const initialSeed = Number.isFinite(seed) ? (seed >>> 0) : (Date.now() >>> 0);
      this.state = {
        version: 5, seed: initialSeed, rng: initialSeed || 0x6d2b79f5,
        loadoutId, difficulty, environment: null,
        time: 0, mode: 'briefing', paused: true, speed: 1, nextId: 1, simRemainder: 0,
        player: null, enemy: null, projectiles: [], effects: [], log: [], cargo: [],
        resources: clone(loadout?.resources || { scrap: 60, fuel: 12, missiles: 10, droneParts: 4 }),
        sector: 1, jumpCount: 0, fleet: 0, nodes: [], currentNodeId: '',
        selectedNodeId: null, event: null, reward: null,
        stats: { kills: 0, jumps: 0, scrapEarned: 0, damageDealt: 0, damageTaken: 0, salvaged: 0, equipmentSold: 0 },
        bossPhase: 0, lastVictoryCause: null, selectedCrew: null, selectedWeapon: null, combatResolved: true
      };
      this.state.player = this.makeShip(loadout?.spec || {});
      if (typeof this.initCampaign === 'function') this.initCampaign();
      this.log('함장님, 항로가 준비됐습니다. 무기 목표와 전력을 확인하세요.');
      return this.state;
    }

    _validRunOptions(loadoutId, difficulty) {
      return typeof loadoutId === 'string' && ['argo', 'atlas', 'wraith'].includes(loadoutId) &&
        (loadoutId === 'argo' || !!SW.DATA.loadouts?.[loadoutId]) &&
        typeof difficulty === 'string' && ['standard', 'veteran'].includes(difficulty);
    }

    configureRun(loadoutId, difficulty) {
      if (this.state.mode !== 'briefing') return outcome(false, '함선과 난이도는 출항 전에만 바꿀 수 있습니다.');
      if (!this._validRunOptions(loadoutId, difficulty)) return outcome(false, '알 수 없는 함선 또는 난이도입니다.');
      this.newRun(this.state.seed, { loadoutId, difficulty });
      return outcome(true, this.state.player.name + ' 출항 준비 완료');
    }

    _id(prefix) {
      return prefix + '-' + this.state.nextId++;
    }

    _newEquipmentId() {
      const ship = this.state.player;
      const used = new Set([...ship.weapons, ...ship.drones, ...this.state.cargo].map(item => item.id));
      const salvage = this.state.reward?.salvage;
      if (salvage?.item) used.add(salvage.item.id);
      let id;
      do { id = this._id('equip'); } while (used.has(id));
      return id;
    }

    canManageEquipment() {
      return REFIT_MODES.has(this.state.mode);
    }

    _equipmentDefinition(kind, defId) {
      if (!['weapon', 'drone'].includes(kind) || typeof defId !== 'string') return null;
      const definitions = kind === 'weapon' ? SW.DATA.weapons : SW.DATA.drones;
      const catalog = SW.DATA.equipment?.[kind];
      return definitions && catalog && Object.prototype.hasOwnProperty.call(definitions, defId) &&
        Object.prototype.hasOwnProperty.call(catalog, defId) ? definitions[defId] : null;
    }

    _equipmentLimit(kind) {
      const key = kind === 'weapon' ? 'weapons' : kind === 'drone' ? 'drones' : 'cargo';
      return SW.DATA.equipmentLimits?.[key] ?? ({ weapons: 4, drones: 2, cargo: 6 })[key];
    }

    _installedEquipment(kind) {
      return kind === 'weapon' ? this.state.player.weapons : kind === 'drone' ? this.state.player.drones : null;
    }

    _equipmentRuntime(item) {
      if (item.kind === 'drone') return this._createDrone(item.defId, 'player', item.id);
      return Object.assign({}, clone(SW.DATA.weapons[item.defId]), {
        id: item.id, charge: 0, enabled: true, powered: false, target: null, auto: false,
        manualQueued: false, fireMode: 'auto', beamFrom: null, beamTo: null,
        beamStart: null, beamEnd: null, targetRooms: []
      });
    }

    _afterEquipmentChange() {
      const ship = this.state.player;
      this._reconcilePower(ship); this._deriveShip(ship);
      if (this.state.selectedWeapon && !ship.weapons.some(w => w.id === this.state.selectedWeapon)) this.state.selectedWeapon = null;
      if (this.state.campaign) {
        this.state.campaign.powerPlan = Object.fromEntries(POWER_IDS.map(id => [id, this._system(ship, id).power]));
      }
    }

    receiveEquipment(kind, defId, destination = 'auto') {
      if (!this.canManageEquipment()) return outcome(false, '지금은 장비를 정비할 수 없습니다.');
      const definition = this._equipmentDefinition(kind, defId);
      if (!definition || !['auto', 'cargo'].includes(destination)) return outcome(false, '장비 또는 보관 위치가 올바르지 않습니다.');
      const installed = this._installedEquipment(kind);
      const actualDestination = destination === 'auto' && installed.length < this._equipmentLimit(kind) ? 'install' : 'cargo';
      if (actualDestination === 'cargo' && this.state.cargo.length >= this._equipmentLimit('cargo')) return outcome(false, '장착 슬롯과 보관고에 빈자리가 없습니다.');
      const item = { id: this._newEquipmentId(), kind, defId };
      if (actualDestination === 'install') installed.push(this._equipmentRuntime(item));
      else this.state.cargo.push(item);
      this._afterEquipmentChange();
      const message = definition.name + (actualDestination === 'install' ? ' 장착 완료. 전력을 확인하세요.' : ' 보관고에 수납했습니다.');
      this.log(message, 'success');
      return Object.assign(outcome(true, message), { itemId: item.id, destination: actualDestination });
    }

    stowEquipment(kind, itemId) {
      if (!this.canManageEquipment()) return outcome(false, '지금은 장비를 정비할 수 없습니다.');
      const installed = this._installedEquipment(kind);
      const index = installed ? installed.findIndex(item => item.id === itemId) : -1;
      if (index < 0) return outcome(false, '장착된 장비를 찾을 수 없습니다.');
      if (kind === 'weapon' && installed.length <= 1) return outcome(false, '최소 한 개의 무기는 장착되어 있어야 합니다.');
      if (this.state.cargo.length >= this._equipmentLimit('cargo')) return outcome(false, '보관고가 가득 찼습니다.');
      const equipment = installed[index];
      this.state.cargo.push({ id: equipment.id, kind, defId: equipment.defId });
      installed.splice(index, 1);
      this._afterEquipmentChange();
      const message = equipment.name + ' 보관고에 수납했습니다.';
      this.log(message, 'command');
      return Object.assign(outcome(true, message), { itemId: equipment.id, destination: 'cargo' });
    }

    installEquipment(cargoId, replaceId = null) {
      if (!this.canManageEquipment()) return outcome(false, '지금은 장비를 정비할 수 없습니다.');
      const cargoIndex = this.state.cargo.findIndex(item => item.id === cargoId);
      if (cargoIndex < 0 || !(replaceId === null || typeof replaceId === 'string')) return outcome(false, '보관 장비 또는 교체 대상이 올바르지 않습니다.');
      const item = this.state.cargo[cargoIndex];
      const definition = this._equipmentDefinition(item.kind, item.defId);
      if (!definition) return outcome(false, '알 수 없는 장비입니다.');
      const installed = this._installedEquipment(item.kind);
      const replaceIndex = replaceId === null ? -1 : installed.findIndex(equipment => equipment.id === replaceId);
      if (replaceId !== null && replaceIndex < 0) return outcome(false, '같은 종류의 장착 장비만 교체할 수 있습니다.');
      if (replaceId === null && installed.length >= this._equipmentLimit(item.kind)) return outcome(false, '장착 슬롯이 가득 찼습니다. 교체할 장비를 선택하세요.');
      const runtime = this._equipmentRuntime(item);
      if (replaceIndex >= 0) {
        const outgoing = installed[replaceIndex];
        this.state.cargo[cargoIndex] = { id: outgoing.id, kind: item.kind, defId: outgoing.defId };
        installed[replaceIndex] = runtime;
      } else {
        this.state.cargo.splice(cargoIndex, 1);
        installed.push(runtime);
      }
      this._afterEquipmentChange();
      const message = definition.name + (replaceIndex >= 0 ? ' 교체 장착 완료. 기존 장비는 보관고에 수납했습니다.' : ' 장착 완료. 전력을 확인하세요.');
      this.log(message, 'command');
      return Object.assign(outcome(true, message), { itemId: item.id, destination: 'install' });
    }

    sellEquipment(location, itemId) {
      if (this.state.mode !== 'shop') return outcome(false, '장비는 상점에서만 매각할 수 있습니다.');
      const collection = location === 'cargo' ? this.state.cargo : this._installedEquipment(location);
      const index = collection ? collection.findIndex(item => item.id === itemId) : -1;
      if (index < 0) return outcome(false, '매각할 장비를 찾을 수 없습니다.');
      const item = collection[index];
      const kind = location === 'cargo' ? item.kind : location;
      const definition = this._equipmentDefinition(kind, item.defId);
      const value = SW.DATA.equipment?.[kind]?.[item.defId]?.sell;
      if (!definition || !integer(value) || value <= 0 || this.state.resources.scrap + value > 1000000) return outcome(false, '장비 매각 정보를 확인할 수 없습니다.');
      if (location === 'weapon' && collection.length <= 1) return outcome(false, '최소 한 개의 무기는 장착되어 있어야 합니다.');
      collection.splice(index, 1);
      this.state.resources.scrap += value;
      this.state.stats.equipmentSold++;
      this._afterEquipmentChange();
      const message = definition.name + ' 매각 · 스크랩 +' + value;
      this.log(message, 'success');
      return Object.assign(outcome(true, message), { itemId: item.id, scrap: value });
    }

    discardCargo(itemId) {
      if (!this.canManageEquipment()) return outcome(false, '지금은 보관 장비를 정리할 수 없습니다.');
      const index = this.state.cargo.findIndex(item => item.id === itemId);
      if (index < 0) return outcome(false, '보관 장비를 찾을 수 없습니다.');
      const item = this.state.cargo[index];
      const definition = this._equipmentDefinition(item.kind, item.defId);
      this.state.cargo.splice(index, 1);
      this._afterEquipmentChange();
      const message = (definition?.name || '장비') + ' 폐기 완료';
      this.log(message, 'command');
      return outcome(true, message);
    }

    moveWeapon(itemId, direction) {
      if (!this.canManageEquipment()) return outcome(false, '전투 밖에서 무기 순서를 바꿀 수 있습니다.');
      if (direction !== -1 && direction !== 1) return outcome(false, '이동 방향이 올바르지 않습니다.');
      const weapons = this.state.player.weapons;
      const index = weapons.findIndex(weapon => weapon.id === itemId);
      const next = index + direction;
      if (index < 0 || next < 0 || next >= weapons.length) return outcome(false, '더 이동할 수 없는 위치입니다.');
      [weapons[index], weapons[next]] = [weapons[next], weapons[index]];
      this._afterEquipmentChange();
      const message = weapons[next].name + ' 우선순위 변경 완료';
      this.log(message, 'command');
      return outcome(true, message);
    }

    rand() {
      let x = this.state.rng >>> 0;
      x ^= x << 13;
      x ^= x >>> 17;
      x ^= x << 5;
      this.state.rng = x >>> 0;
      return this.state.rng / 4294967296;
    }

    log(text, type = 'info') {
      this.state.log.push({ id: this._id('log'), time: this.state.time, text: String(text), type });
      if (this.state.log.length > 90) this.state.log.splice(0, this.state.log.length - 90);
    }

    _effect(ship, roomId, type, text) {
      this.state.effects.push({
        id: this._id('fx'), ship: ship.id === 'player' ? 'player' : 'enemy',
        roomId, type, ttl: type === 'repair' ? 1.35 : 0.9, text: text || ''
      });
      if (this.state.effects.length > 120) this.state.effects.splice(0, this.state.effects.length - 120);
    }

    _layoutById(id) {
      const layouts = SW.DATA.layouts;
      return typeof id === 'string' && layouts && Object.prototype.hasOwnProperty.call(layouts, id) ? readonly(layouts[id]) : null;
    }

    getLayout(ship = this.state.player) {
      const vessel = typeof ship === 'string' ? this.state[ship] : ship;
      return vessel ? this._layoutById(vessel.layoutId) : null;
    }

    _pointInRoom(point, room, epsilon = 1e-7) {
      return !!room && finite(point?.x) && finite(point?.y) && point.x >= room.x - epsilon && point.x <= room.x + room.w + epsilon &&
        point.y >= room.y - epsilon && point.y <= room.y + room.h + epsilon;
    }

    _roomCenter(room) {
      return { x: room.x + room.w / 2, y: room.y + room.h / 2 };
    }

    makeShip(spec = {}) {
      const D = SW.DATA;
      if (!D || !Array.isArray(D.rooms)) throw new Error('STARWARD data.js must load before engine.js');
      const enemy = !!spec.enemy;
      const layoutId = spec.layoutId ?? (enemy ? 'interceptor' : D.loadouts?.[this.state.loadoutId]?.spec?.layoutId || 'argo');
      const layout = this._layoutById(layoutId);
      if (!layout) throw new Error('Unknown layout: ' + layoutId);
      const weaponDefs = spec.weaponDefs || (enemy ? ['burst_laser'] : ['burst_laser', 'artemis']);
      const weapons = weaponDefs.map((defId, index) => {
        const definition = D.weapons[typeof defId === 'string' ? defId : defId.defId];
        if (!definition) throw new Error('Unknown weapon: ' + defId);
        return Object.assign({}, clone(definition), {
          id: this._id(enemy ? 'ewpn' : 'wpn'), charge: 0, enabled: true,
          powered: false, target: null, auto: enemy, manualQueued: false,
          fireMode: 'auto', beamFrom: null, beamTo: null, beamStart: null, beamEnd: null, targetRooms: []
        }, typeof defId === 'object' ? clone(defId) : {});
      });
      const weaponNeed = weapons.reduce((sum, w) => sum + w.power, 0);
      const layers = clamp(Math.floor(spec.shieldLayers ?? 1), 0, 4);
      const levels = {
        engines: enemy ? (spec.engineLevel ?? 2) : 3,
        shields: Math.max(0, layers * 2),
        weapons: Math.max(enemy ? 2 : 4, spec.weaponLevel || 0, weaponNeed),
        bridge: 1, oxygen: 1, medbay: 1
      };
      const desired = {
        engines: enemy ? Math.min(2, levels.engines) : 2,
        shields: layers * 2, weapons: weaponNeed, bridge: 0, oxygen: 1, medbay: 0
      };
      const systems = {};
      for (const id of SYSTEM_IDS) {
        systems[id] = {
          id, name: D.systemNames[id] || id, level: levels[id],
          power: desired[id], damage: 0, repair: 0, desiredPower: desired[id], ionStacks: 0, ionTimer: 0
        };
      }
      const hull = Math.max(1, spec.maxHull ?? spec.hull ?? (enemy ? 12 : 30));
      const ship = {
        id: enemy ? 'enemy' : 'player', name: spec.name || (enemy ? '추격 정찰함' : '아르고'), layoutId,
        hull: Math.min(spec.hull ?? hull, hull), maxHull: hull,
        reactor: Math.max(0, spec.reactor ?? (enemy ? weaponNeed + layers * 2 + 3 : 10)),
        systems, rooms: layout.rooms.map(r => Object.assign({}, clone(r), {
          oxygen: 100, fire: 0, breach: 0, breachRepair: 0, fireDamage: 0
        })),
        crew: [], weapons, shield: layers, maxShield: layers, shieldCharge: 0,
        shieldCooldown: 2.8, evasion: 0, ftl: 0, venting: false,
        automated: !!spec.automated, bossPhase: spec.bossPhase || 0,
        aiProfile: AI_PROFILES.includes(spec.aiProfile) ? spec.aiProfile : 'raider',
        ammo: spec.missiles ?? 30, aiTimer: 0, aux: this._createAux(),
        doors: this._createDoors(layoutId), drones: [], teleportCooldown: 0,
        cloakRemaining: 0, cloakCooldown: 0,
        droneParts: spec.droneParts ?? 5, boarderCount: Math.min(2, spec.boarderCount ?? (spec.boarding ? 1 : 0)),
        special: this._createSpecial(spec)
      };
      const crewDefinitions = spec.crewTypes?.length ? spec.crewTypes : ['human', 'engi', 'rock'];
      const count = Math.max(0, Math.min(8, spec.crewCount ?? (spec.crewTypes?.length || (enemy ? 2 : 3))));
      const names = spec.crewNames?.length ? spec.crewNames : (enemy ? ['경비 조종사', '정비관', '기관사', '보조 정비관'] : ['아린', '픽스', '바위']);
      const positions = ['bridge', 'weapons', 'engines', 'shields', 'oxygen', 'medbay'];
      for (let i = 0; i < count; i++) {
        const species = crewDefinitions[i % crewDefinitions.length] || 'human';
        const speciesData = D.crewTypes[species] || D.crewTypes.human;
        const roomId = positions[i % positions.length];
        const room = ship.rooms.find(r => r.id === roomId);
        ship.crew.push({
          id: this._id(enemy ? 'ecrew' : 'crew'),
          name: names[i % names.length], species, shipId: ship.id, faction: ship.id, hp: speciesData.maxHp,
          maxHp: speciesData.maxHp, roomId, targetRoomId: null,
          x: room.x + room.w / 2, y: room.y + room.h / 2,
          movePath: [], repairProgress: 0, sabotageProgress: 0, task: '운용 중', homeRoomId: roomId,
          skills: this._createSkills()
        });
      }
      if (enemy && count === 0) ship.automated = true;
      for (const defId of spec.droneDefs || (enemy ? [] : ['defense'])) {
        const drone = this._createDrone(typeof defId === 'string' ? defId : defId.defId, ship.id);
        if (enemy && ship.droneParts > 0) {
          drone.enabled = true; drone.deployed = true; drone.charge = drone.cooldown;
          ship.droneParts--;
        }
        ship.drones.push(drone);
      }
      if (enemy) {
        const dronePower = ship.drones.reduce((sum, d) => sum + (d.enabled ? d.power : 0), 0);
        ship.aux.drones.level = Math.max(2, dronePower);
        ship.aux.drones.power = dronePower; ship.aux.drones.desiredPower = dronePower;
        const teleportPower = ship.boarderCount > 0 || ship.special?.kind === 'boarding' ? 1 : 0;
        ship.aux.teleporter.power = teleportPower; ship.aux.teleporter.desiredPower = teleportPower;
      }
      for (const id of AUX_IDS) {
        if (finite(spec.auxLevels?.[id])) ship.aux[id].level = clamp(Math.floor(spec.auxLevels[id]), 0, id === 'cloaking' ? 3 : 20);
        if (finite(spec.auxPower?.[id])) {
          ship.aux[id].power = clamp(Math.floor(spec.auxPower[id]), 0, ship.aux[id].level);
          ship.aux[id].desiredPower = ship.aux[id].power;
        }
      }
      this._reconcilePower(ship);
      this._deriveShip(ship);
      ship.shield = ship.maxShield;
      return ship;
    }

    getPowerUsed(ship = this.state.player) {
      return POWER_IDS.reduce((sum, id) => sum + (id === 'bridge' ? 0 : (this._system(ship, id)?.power || 0)), 0);
    }

    getReactorCapacity(ship = this.state.player) {
      return this._reactorCapacity(ship, this.state.environment);
    }

    _reactorCapacity(ship, environment) {
      return environment?.kind === 'ion_storm' ? Math.max(2, Math.floor(ship.reactor * 0.65)) : ship.reactor;
    }

    _capacity(system) {
      return Math.max(0, system.level - system.damage);
    }

    _usableCapacity(system) {
      return Math.max(0, this._capacity(system) - (system.ionStacks || 0));
    }

    _reconcilePower(ship) {
      if (!ship.aux) ship.aux = this._createAux();
      for (const id of POWER_IDS) {
        const system = this._system(ship, id);
        system.damage = clamp(system.damage, 0, system.level);
        system.power = id === 'bridge' ? 0 : clamp(Math.floor(system.power), 0, this._usableCapacity(system));
      }
      let excess = this.getPowerUsed(ship) - this.getReactorCapacity(ship);
      for (const id of ['cloaking', 'teleporter', 'drones', 'medbay', 'oxygen', 'engines', 'weapons', 'shields']) {
        if (excess <= 0) break;
        const system = this._system(ship, id);
        const removed = Math.min(excess, system.power);
        system.power -= removed; excess -= removed;
      }
      let available = ship.systems.weapons.power;
      for (const weapon of ship.weapons) {
        const powered = weapon.enabled && available >= weapon.power;
        if (powered) available -= weapon.power;
        if (!powered && weapon.powered) {
          weapon.charge = 0; weapon.manualQueued = false;
        }
        weapon.powered = !!powered;
      }
      available = ship.aux.drones.power;
      for (const drone of ship.drones || []) {
        drone.powered = !!(drone.enabled && drone.deployed && drone.hp > 0 && available >= drone.power);
        if (drone.powered) available -= drone.power;
      }
      ship.maxShield = Math.floor(ship.systems.shields.power / 2);
      ship.shield = clamp(ship.shield, 0, ship.maxShield);
      if (!ship.maxShield) ship.shieldCharge = 0;
      if (ship.cloakRemaining > 0 && ship.aux.cloaking.power < 1) this._endCloak(ship);
    }

    allocatePower(id, delta) {
      const ship = this.state.player;
      if (!POWER_IDS.includes(id) || id === 'bridge' || !finite(delta) || delta === 0) return false;
      const system = this._system(ship, id);
      const amount = Math.max(1, Math.floor(Math.abs(delta)));
      const change = delta > 0
        ? Math.min(amount, this._usableCapacity(system) - system.power, this.getReactorCapacity(ship) - this.getPowerUsed())
        : -Math.min(amount, system.power);
      if (!change) return false;
      system.power += change; system.desiredPower = system.power;
      this._reconcilePower(ship); this._deriveShip(ship);
      return true;
    }

    setPaused(value) {
      this.state.paused = !!value;
      return this.state.paused;
    }

    togglePause() {
      if (this.state.mode !== 'combat') return this.state.paused;
      return this.setPaused(!this.state.paused);
    }

    setSpeed(value) {
      if (value !== 1 && value !== 2) return false;
      this.state.speed = value;
      return true;
    }

    toggleVent() {
      if (['victory', 'defeat'].includes(this.state.mode)) return false;
      const open = !this.state.player.doors.some(d => d.airlock && d.open);
      this.setDoors(open, true);
      this.log(open ? '전체 환기 개방. 연결된 방의 산소가 빠져나갑니다.' : '온전한 문을 모두 닫았습니다. 파괴된 문은 열린 상태입니다.', 'warning');
      return this.state.player.venting;
    }

    _path(ship, start, goal) {
      if (start === goal) return [];
      const adjacency = Object.fromEntries(ship.rooms.map(room => [room.id, []]));
      for (const door of ship.doors) {
        if (door.airlock || !adjacency[door.a] || !adjacency[door.b]) continue;
        adjacency[door.a].push(door.b); adjacency[door.b].push(door.a);
      }
      const queue = [[start]];
      const seen = new Set([start]);
      while (queue.length) {
        const path = queue.shift();
        for (const next of adjacency[path[path.length - 1]] || []) {
          if (seen.has(next)) continue;
          const candidate = path.concat(next);
          if (next === goal) return candidate.slice(1);
          seen.add(next);
          queue.push(candidate);
        }
      }
      return null;
    }

    _moveCrew(ship, crew, roomId) {
      if (!ship || !crew || crew.hp <= 0 || crew.shipId !== ship.id || !ship.rooms.some(r => r.id === roomId)) return false;
      const location = this._routeLocation(ship, crew);
      const path = this._path(ship, location.roomId, roomId);
      if (path === null) return false;
      if (!path.length) {
        const room = ship.rooms.find(r => r.id === roomId);
        if (Math.hypot(crew.x - room.x - room.w / 2, crew.y - room.y - room.h / 2) > 1e-7) path.push(roomId);
      }
      crew.roomId = location.roomId;
      crew.targetRoomId = path.length ? roomId : null;
      crew.movePath = path; crew.sabotageProgress = 0;
      crew.task = path.length ? '이동 중' : '대기';
      return true;
    }

    moveCrew(crewId, roomId, shipId) {
      if (['victory', 'defeat'].includes(this.state.mode)) return false;
      const crew = this.state.player.crew.find(c => c.id === crewId);
      if (!crew || (shipId !== undefined && shipId !== crew.shipId)) return false;
      return this._moveCrew(this.state[crew.shipId], crew, roomId);
    }

    _routeLocation(ship, crew) {
      let path = crew.movePath.slice();
      let roomId = crew.roomId;
      const current = ship.rooms.find(room => room.id === roomId);
      // Old saves kept the origin room until the next room's center was reached.
      if (ship.layoutId === 'legacy' && path.length && !this._pointInRoom(crew, current)) {
        const physical = ship.rooms.find(room => room.id !== roomId && this._pointInRoom(crew, room) && this._doorBetween(ship, roomId, room.id));
        if (physical) {
          roomId = physical.id;
          if (path[0] === roomId) {
            if (path.length > 1) path.shift();
          } else {
            // v4 could also receive another order before updating that old room ID.
            const remaining = this._path(ship, roomId, crew.targetRoomId || path[path.length - 1]);
            if (remaining !== null) {
              path = remaining;
              const center = this._roomCenter(physical);
              if (!path.length && Math.hypot(crew.x - center.x, crew.y - center.y) > 1e-7) path.push(roomId);
            }
          }
        }
      }
      return { roomId, path };
    }

    getCrewRoute(crewId) {
      const crew = [this.state.player, this.state.enemy].filter(Boolean).flatMap(ship => ship.crew).find(member => member.id === crewId);
      if (!crew || crew.hp <= 0 || !crew.movePath.length) return null;
      const ship = this.state[crew.shipId];
      if (!ship) return null;
      const location = this._routeLocation(ship, crew);
      let roomId = location.roomId;
      const roomIds = [roomId];
      const points = [{ x: crew.x, y: crew.y }];
      const append = point => {
        const previous = points[points.length - 1];
        if (Math.hypot(point.x - previous.x, point.y - previous.y) > 1e-9) points.push({ x: point.x, y: point.y });
      };
      for (const next of location.path) {
        if (!ship.rooms.some(room => room.id === next)) return null;
        if (next !== roomId) {
          const door = this._doorBetween(ship, roomId, next);
          if (!door) return null;
          append(door); roomId = next; roomIds.push(next);
        }
      }
      const destination = ship.rooms.find(room => room.id === roomId);
      if (!destination) return null;
      append(this._roomCenter(destination));
      let distance = 0;
      for (let i = 1; i < points.length; i++) distance += Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y);
      return { shipId: ship.id, roomIds, points, distance };
    }

    _advanceCrew(ship, crew, dt, species) {
      const location = this._routeLocation(ship, crew);
      if (location.roomId !== crew.roomId) {
        crew.roomId = location.roomId; crew.movePath = location.path;
        if (!crew.movePath.length) crew.targetRoomId = null;
      }
      const speed = species.moveSpeed || 1.2;
      let movement = speed * dt;
      let iterations = 0;
      while (crew.movePath.length && iterations++ < 24) {
        const nextId = crew.movePath[0];
        const destination = ship.rooms.find(room => room.id === nextId);
        if (!destination) { crew.movePath = []; crew.targetRoomId = null; break; }
        const crossing = nextId !== crew.roomId;
        const door = crossing ? this._doorBetween(ship, crew.roomId, nextId) : null;
        if (crossing && !door) { crew.movePath = []; crew.targetRoomId = null; break; }
        const waypoint = crossing ? door : this._roomCenter(destination);
        const dx = waypoint.x - crew.x, dy = waypoint.y - crew.y;
        const distance = Math.hypot(dx, dy);
        if (distance > movement + 1e-9) {
          if (movement > 0) { crew.x += dx / distance * movement; crew.y += dy / distance * movement; }
          break;
        }
        crew.x = waypoint.x; crew.y = waypoint.y;
        movement = Math.max(0, movement - distance);
        if (door && !door.open) {
          if (crew.faction === ship.id) { door.open = true; door.autoOpened = true; door.manualOpen = false; }
          else {
            const requiredTime = door.hp / 6;
            const workTime = Math.min(movement / speed, requiredTime);
            door.hp = Math.max(0, door.hp - workTime * 6);
            movement = Math.max(0, movement - workTime * speed);
            crew.task = '문 파괴';
            if (door.hp > 1e-9) return;
            door.hp = 0; door.open = true; door.autoOpened = false; door.autoClose = 0;
            this._effect(ship, crew.roomId, 'hit', '문 파괴');
          }
        }
        if (door?.autoOpened) door.autoClose = 0.8;
        if (crossing) {
          crew.roomId = nextId;
          if (crew.movePath.length > 1) crew.movePath.shift();
        } else crew.movePath.shift();
        if (!crew.movePath.length) { crew.targetRoomId = null; break; }
        if (movement <= 1e-9) break;
      }
      crew.task = '이동 중';
    }

    saveStations() {
      if (['victory', 'defeat'].includes(this.state.mode)) return outcome(false, '항해가 종료되었습니다.');
      const crew = this.state.player.crew.filter(c => c.hp > 0 && c.faction === 'player' && c.shipId === 'player' &&
        c.movePath.length === 0 && SYSTEM_IDS.includes(c.roomId));
      if (!crew.length) return outcome(false, '함내에 정지해 있는 생존 승무원이 없습니다.');
      for (const member of crew) member.homeRoomId = member.roomId;
      const message = crew.length + '명의 현재 배치를 저장했습니다.';
      this.log(message, 'command');
      return Object.assign(outcome(true, message), { count: crew.length });
    }

    returnStations() {
      if (['victory', 'defeat'].includes(this.state.mode)) return outcome(false, '항해가 종료되었습니다.');
      const ship = this.state.player;
      const initialRooms = ['bridge', 'weapons', 'engines', 'shields', 'oxygen', 'medbay'];
      const orders = ship.crew.map((crew, index) => ({
        crew, roomId: SYSTEM_IDS.includes(crew.homeRoomId) ? crew.homeRoomId : initialRooms[index % initialRooms.length]
      })).filter(order => order.crew.hp > 0 && order.crew.faction === 'player' && order.crew.shipId === 'player');
      if (!orders.length) return outcome(false, '복귀시킬 함내 생존 승무원이 없습니다.');
      let count = 0;
      for (const order of orders) if (this.moveCrew(order.crew.id, order.roomId, 'player')) count++;
      if (!count) return outcome(false, '저장된 위치로 이동할 수 없습니다.');
      const message = count + '명에게 저장 배치 복귀를 명령했습니다.';
      this.log(message, 'command');
      return Object.assign(outcome(true, message), { count });
    }

    toggleWeapon(id) {
      const weapon = this.state.player.weapons.find(w => w.id === id);
      if (!weapon) return false;
      weapon.enabled = !weapon.enabled;
      if (!weapon.enabled) weapon.manualQueued = false;
      this._reconcilePower(this.state.player);
      return weapon.enabled;
    }

    targetWeapon(id, roomId) {
      const weapon = this.state.player.weapons.find(w => w.id === id);
      if (!weapon || this.state.mode !== 'combat' || !this.state.enemy || !SYSTEM_IDS.includes(roomId)) return false;
      weapon.target = roomId; weapon.targetRooms = [roomId];
      weapon.auto = weapon.fireMode !== 'manual';
      if (weapon.type === 'beam') {
        weapon.beamFrom = roomId; weapon.beamTo = roomId;
        const room = this.state.enemy.rooms.find(r => r.id === roomId);
        weapon.beamStart = { x: room.x + room.w / 2, y: room.y + room.h / 2 };
        weapon.beamEnd = Object.assign({}, weapon.beamStart);
      }
      this.log(weapon.name + ' → ' + this.state.enemy.systems[roomId].name, 'command');
      return true;
    }

    fireWeapon(id) {
      const weapon = this.state.player.weapons.find(w => w.id === id);
      this._reconcilePower(this.state.player);
      if (!this._canFire(this.state.player, weapon) || weapon.manualQueued) return false;
      if (this.state.paused) { weapon.manualQueued = true; return true; }
      return this._shoot(this.state.player, weapon);
    }

    startCombat(enemySpec = {}) {
      if (this.state.enemy) this._cleanupEncounter('escape');
      else this.clearEnvironment();
      this.state.enemy = this.makeShip(Object.assign({}, enemySpec, { enemy: true }));
      this.state.mode = 'combat'; this.state.paused = true;
      this.state.projectiles = []; this.state.effects = [];
      this.state.event = null; this.state.reward = null; this.state.lastVictoryCause = null;
      this.state.combatResolved = false; this.state.simRemainder = 0;
      this.state.encounterId = this._id('encounter');
      const player = this.state.player;
      player.ftl = 0; player.teleportCooldown = 0;
      for (const ship of [player, this.state.enemy]) this._resetTemporarySystems(ship);
      for (const weapon of player.weapons) {
        weapon.charge = 0; weapon.manualQueued = false; weapon.target = null; weapon.auto = false;
        weapon.targetRooms = []; weapon.beamFrom = null; weapon.beamTo = null;
        weapon.beamStart = null; weapon.beamEnd = null;
        if (!weapon.fireMode) weapon.fireMode = 'auto';
      }
      for (const drone of player.drones) {
        drone.enabled = false; drone.deployed = false; drone.powered = false; drone.hp = 1; drone.charge = 0;
      }
      this._reconcilePower(player); this._deriveShip(player);
      if (enemySpec.environment) this.setEnvironment(typeof enemySpec.environment === 'string' ? enemySpec.environment : enemySpec.environment.kind);
      for (const weapon of this.state.enemy.weapons) {
        if (weapon.powered) this._chooseEnemyTarget(weapon);
      }
      this.log(this.state.enemy.name + ' 접근. 조준·문·전력을 확인하세요.', 'combat');
      return this.state.enemy;
    }

    escape() {
      const state = this.state;
      if (state.mode !== 'combat' || state.combatResolved || state.player.ftl < 100 || state.resources.fuel < 1) return false;
      if (!this._hasPilot(state.player) || state.player.systems.engines.power < 1) return false;
      this._cleanupEncounter('escape');
      state.combatResolved = true; state.projectiles = []; state.paused = true; state.player.ftl = 0;
      this.log('긴급 도약 성공. 적함에 남겨진 승무원은 돌아오지 못합니다.', 'warning');
      if (typeof this.onEscape === 'function') this.onEscape();
      else { state.resources.fuel--; state.mode = 'map'; state.enemy = null; }
      return true;
    }

    _hasPilot(ship) {
      return this._usableCapacity(ship.systems.bridge) > 0 && !this._contested(ship, 'bridge') &&
        (ship.automated || this._localCrew(ship).some(c => c.faction === ship.id && c.roomId === 'bridge' && !c.movePath.length));
    }

    _manned(ship, roomId) {
      return !this._contested(ship, roomId) &&
        (ship.automated || this._localCrew(ship).some(c => c.faction === ship.id && c.roomId === roomId && !c.movePath.length));
    }

    _deriveShip(ship) {
      const enginePower = ship.systems.engines.power;
      const base = [0, 5, 10, 15, 20, 25, 28, 31, 35][Math.min(8, enginePower)] || 0;
      const pilotRank = this.getCrewSkillLevel(this._operator(ship, 'bridge', 'piloting'), 'piloting');
      const engineRank = this.getCrewSkillLevel(this._operator(ship, 'engines', 'engines'), 'engines');
      const baseEvasion = this._hasPilot(ship) && enginePower > 0
        ? clamp(base + 5 + pilotRank * 3 + (this._manned(ship, 'engines') ? 5 + engineRank * 3 : 0), 0, 65)
        : 0;
      ship.evasion = clamp(baseEvasion + (ship.cloakRemaining > 0 ? 60 : 0), 0, 95);
      const shieldRank = this.getCrewSkillLevel(this._operator(ship, 'shields', 'shields'), 'shields');
      ship.shieldCooldown = (this._manned(ship, 'shields') ? 2.5 : 2.8) * (1 - shieldRank * 0.08);
    }

    tick(dt) {
      const state = this.state;
      if (!finite(dt) || dt <= 0 || state.mode !== 'combat' || state.paused || state.combatResolved) return;
      state.simRemainder += Math.min(0.25, dt) * state.speed;
      let steps = 0;
      while (state.simRemainder + 1e-10 >= STEP && steps < 16) {
        state.simRemainder = Math.max(0, state.simRemainder - STEP);
        this._step(STEP);
        steps++;
        if (state.mode !== 'combat' || state.paused || state.combatResolved) {
          state.simRemainder = 0;
          break;
        }
      }
    }

    _step(dt) {
      const state = this.state;
      state.time += dt;
      for (const effect of state.effects) effect.ttl -= dt;
      state.effects = state.effects.filter(e => e.ttl > 0);
      if (this._finishIfNeeded()) return;
      const ships = [state.player, state.enemy].filter(Boolean);
      for (const ship of ships) {
        if (ship.layoutId === 'legacy') {
          for (const crew of this._localCrew(ship)) {
            const location = this._routeLocation(ship, crew);
            if (location.roomId !== crew.roomId) {
              crew.roomId = location.roomId; crew.movePath = location.path;
              if (!crew.movePath.length) crew.targetRoomId = null;
            }
          }
        }
        this._updateIon(ship, dt);
        this._reconcilePower(ship); this._updateDoors(ship, dt);
        this._updateCloak(ship, dt);
        if (ship.aux.teleporter.power > 0) ship.teleportCooldown = Math.max(0, ship.teleportCooldown - dt);
      }
      if (state.enemy) this._enemyCrewAI(state.enemy, dt);
      for (const ship of ships) this._atmosphere(ship, dt);
      for (const ship of ships) this._crewCombat(ship, dt);
      for (const ship of ships) this._updateCrew(ship, dt);
      for (const ship of ships) {
        if (ship.automated) this._automatedRepair(ship, dt);
        if (ship.id === 'enemy') this._restoreEnemyPower(ship);
        this._reconcilePower(ship); this._deriveShip(ship);
        if (ship.shield < ship.maxShield) {
          this._trainOperator(ship, 'shields', 'shields', dt);
          ship.shieldCharge += dt;
          if (ship.shieldCharge + 1e-9 >= ship.shieldCooldown) { ship.shield++; ship.shieldCharge = 0; }
        } else ship.shieldCharge = 0;
        if (this._hasPilot(ship) && ship.systems.engines.power > 0) {
          this._trainOperator(ship, 'bridge', 'piloting', dt);
          this._trainOperator(ship, 'engines', 'engines', dt);
          ship.ftl = Math.min(100, ship.ftl + dt * (1.8 + ship.systems.engines.power * 0.65));
        }
      }
      if (this._finishIfNeeded()) return;
      this._updateEnvironment(dt);
      if (this._finishIfNeeded()) return;
      if (state.enemy) this._updateSpecial(state.enemy, dt);
      for (const ship of ships) this._updateWeapons(ship, dt);
      for (const ship of ships) this._updateDrones(ship, dt);
      const remaining = [];
      for (const projectile of state.projectiles) {
        if (projectile.intercepted) continue;
        if (projectile.delay > 0) { projectile.delay -= dt; remaining.push(projectile); continue; }
        projectile.progress = Math.min(1, projectile.progress + dt / projectile.travel);
        if (projectile.progress < 1) remaining.push(projectile);
        else this._resolveProjectile(projectile);
      }
      state.projectiles = remaining;
      this._finishIfNeeded();
    }

    _atmosphere(ship, dt) {
      const previous = Object.fromEntries(ship.rooms.map(r => [r.id, r.oxygen]));
      const oxygenPower = ship.systems.oxygen.power;
      ship.venting = ship.doors.some(d => d.airlock && d.open);
      for (const room of ship.rooms) {
        const openDoors = ship.doors.filter(d => d.open && (d.a === room.id || d.b === room.id));
        const neighbors = openDoors.filter(d => !d.airlock).map(d => d.a === room.id ? d.b : d.a);
        let exchange = 0;
        for (const neighbor of neighbors) exchange += (previous[neighbor] - previous[room.id]) * 0.55;
        const supply = oxygenPower > 0 ? oxygenPower * 1.8 : -0.65;
        const airlocks = openDoors.filter(d => d.airlock).length;
        const drain = room.fire * 0.7 + (room.breach ? 7.5 : 0) + airlocks * 18;
        room.oxygen = clamp(room.oxygen + (supply - drain + exchange) * dt, 0, 100);
        if (room.fire > 0) {
          if (room.oxygen < 12) room.fire = Math.max(0, room.fire - dt * 0.75);
          room.fireDamage = (room.fireDamage || 0) + room.fire * dt;
          if (room.fireDamage >= 12) {
            room.fireDamage -= 12;
            const system = ship.systems[room.id];
            if (system.damage < system.level) {
              system.damage = Math.min(system.level, system.damage + 1);
              this._effect(ship, room.id, 'fire', '화재 손상');
              if (this._capacity(system) === 0) this._damageHull(ship, 1);
            }
          }
          if (neighbors.length && room.fire >= 1.2 && room.oxygen > 35 && this.rand() < dt * 0.003) {
            const neighbor = neighbors[Math.floor(this.rand() * neighbors.length)];
            const other = ship.rooms.find(r => r.id === neighbor);
            if (other && other.oxygen > 30) other.fire = Math.min(3, other.fire + 1);
          }
        } else room.fireDamage = 0;
      }
    }

    _updateCrew(ship, dt) {
      for (const crew of this._localCrew(ship)) {
        if (crew.hp <= 0) continue;
        const location = this._routeLocation(ship, crew);
        if (location.roomId !== crew.roomId) {
          crew.roomId = location.roomId; crew.movePath = location.path;
          if (!crew.movePath.length) crew.targetRoomId = null;
        }
        const species = SW.DATA.crewTypes[crew.species] || SW.DATA.crewTypes.human;
        let room = ship.rooms.find(r => r.id === crew.roomId);
        if (room.oxygen < 20) this._damageCrew(crew, dt * (20 - room.oxygen) / 20 * 5);
        if (room.fire > 0 && !species.fireImmune) this._damageCrew(crew, dt * room.fire * 1.6);
        if (crew.hp <= 0) continue;
        if (crew.movePath.length) {
          this._advanceCrew(ship, crew, dt, species);
          continue;
        }
        room = ship.rooms.find(r => r.id === crew.roomId);
        const friendly = crew.faction === ship.id;
        let healing = false;
        if (friendly && room.id === 'medbay' && ship.systems.medbay.power > 0 && crew.hp < crew.maxHp) {
          crew.hp = Math.min(crew.maxHp, crew.hp + dt * (5 + ship.systems.medbay.power * 3));
          healing = true;
        }
        const opponents = this._localCrew(ship).some(c => c.faction !== crew.faction && c.roomId === room.id);
        if (opponents) { crew.task = '교전 중'; continue; }
        if (!friendly) {
          const system = ship.systems[room.id];
          if (system.damage < system.level) {
            crew.sabotageProgress = (crew.sabotageProgress || 0) + dt / 8;
            crew.task = '시스템 파괴';
            if (crew.sabotageProgress >= 1) {
              crew.sabotageProgress -= 1;
              system.damage = Math.min(system.level, system.damage + 1);
              this._effect(ship, room.id, 'hit', '파괴 공작');
              if (this._capacity(system) === 0) this._damageHull(ship, 1);
            }
          } else crew.task = '강습 대기';
          continue;
        }
        const repairRate = (species.repairMultiplier || species.repairSpeed || 1) * (1 + this.getCrewSkillLevel(crew, 'repair') * 0.15);
        const system = this._repairTarget(ship, room.id);
        if (room.fire > 0) {
          const worked = Math.min(dt, room.fire / (0.28 * repairRate));
          room.fire = Math.max(0, room.fire - dt * 0.28 * repairRate); crew.task = '진화 중';
          this._gainSkill(crew, 'repair', worked * 2);
        } else if (room.breach) {
          const worked = Math.min(dt, (1 - (room.breachRepair || 0)) * 6 / repairRate);
          room.breachRepair = Math.min(1, (room.breachRepair || 0) + dt * repairRate / 6);
          this._gainSkill(crew, 'repair', Math.max(0, worked) * 2);
          crew.repairProgress = room.breachRepair; crew.task = '균열 봉합';
          if (room.breachRepair >= 1) {
            room.breach = 0; room.breachRepair = 0;
            this._effect(ship, room.id, 'repair', '균열 봉합');
          }
        } else if (system && system.damage > 0) {
          const worked = Math.min(dt, (1 - system.repair) * 5 / repairRate);
          system.repair = Math.min(1, system.repair + dt * repairRate / 5);
          this._gainSkill(crew, 'repair', Math.max(0, worked) * 2);
          crew.repairProgress = system.repair; crew.task = system.name + ' 수리';
          if (system.repair >= 1) {
            system.repair -= 1; system.damage = Math.max(0, system.damage - 1);
            this._effect(ship, room.id, 'repair', '+1 복구');
            if (ship.id === 'player') this.log(system.name + ' 수리 완료. 전력을 확인하세요.', 'success');
          }
        } else {
          crew.repairProgress = 0;
          crew.task = healing ? '치료 중' : (['bridge', 'weapons', 'engines', 'shields'].includes(room.id) ? '운용 중' : '대기');
        }
      }
    }

    _enemyCrewAI(ship, dt) {
      ship.aiTimer -= dt;
      if (ship.aiTimer > 0) return;
      ship.aiTimer = 1.2;
      const priorities = this._enemyProfile(ship).repairWeights;
      const repairScore = room => {
        let weight = priorities[room.id] || 0;
        const auxiliary = room.id === 'weapons' ? 'drones' : room.id === 'medbay' ? 'teleporter' : room.id === 'engines' ? 'cloaking' : null;
        if (auxiliary && ship.aux[auxiliary].damage > 0) weight = Math.max(weight, priorities[auxiliary] || 0);
        return weight + room.fire * 2 + this._roomDamage(ship, room.id);
      };
      const intruders = this.getCrewOnShip('enemy').filter(c => c.faction === 'player');
      const reserved = new Set();
      for (const crew of ship.crew) {
        if (crew.hp <= 0) continue;
        if (crew.shipId === 'player') {
          if (crew.hp < crew.maxHp * 0.25 && this._teleportReady(ship)) {
            this._teleport(ship, [crew], ship, 'medbay'); continue;
          }
          if (crew.movePath.length) continue;
          if (this.getCrewOnShip('player').some(c => c.faction === 'player' && c.roomId === crew.roomId)) continue;
          const currentSystem = this.state.player.systems[crew.roomId];
          if (currentSystem.damage < currentSystem.level) continue;
          const target = ['weapons', 'oxygen', 'shields', 'bridge', 'engines', 'medbay']
            .find(id => this.state.player.systems[id].damage < this.state.player.systems[id].level);
          if (target) this._moveCrew(this.state.player, crew, target);
          continue;
        }
        if (crew.roomId === 'medbay' && crew.hp < crew.maxHp * 0.85 && ship.systems.medbay.power > 0) continue;
        if (crew.hp < crew.maxHp * 0.32 && ship.systems.medbay.power > 0) {
          if (crew.targetRoomId !== 'medbay') this._moveCrew(ship, crew, 'medbay');
          continue;
        }
        if (crew.movePath.length) { if (crew.targetRoomId) reserved.add(crew.targetRoomId); continue; }
        if (intruders.length) {
          const opponent = intruders.find(c => c.roomId === crew.roomId) || intruders[0];
          if (crew.roomId !== opponent.roomId) this._moveCrew(ship, crew, opponent.roomId);
          continue;
        }
        const tasks = ship.rooms.filter(r => r.fire > 0 || r.breach || this._roomDamage(ship, r.id) > 0);
        tasks.sort((a, b) => repairScore(b) - repairScore(a));
        const target = tasks.find(r => !reserved.has(r.id)) || tasks[0];
        if (target) {
          reserved.add(target.id);
          if (crew.roomId !== target.id) this._moveCrew(ship, crew, target.id);
        } else if (crew.roomId !== crew.homeRoomId) this._moveCrew(ship, crew, crew.homeRoomId);
      }
    }

    _restoreEnemyPower(ship) {
      let available = this.getReactorCapacity(ship);
      const order = [...new Set(this._enemyProfile(ship).powerOrder.concat(['weapons', 'shields', 'drones', 'teleporter', 'cloaking', 'oxygen', 'medbay', 'engines']))]
        .filter(id => POWER_IDS.includes(id) && id !== 'bridge');
      for (const id of order) {
        const system = this._system(ship, id);
        let desired = system.desiredPower;
        if (id === 'medbay' && ship.crew.some(c => c.hp > 0 && c.hp < c.maxHp * 0.4)) desired = 1;
        system.power = Math.max(0, Math.min(this._usableCapacity(system), desired, available));
        available -= system.power;
      }
    }

    _automatedRepair(ship, dt) {
      for (const id of POWER_IDS) {
        const roomId = id === 'drones' ? 'weapons' : id === 'teleporter' ? 'medbay' : id === 'cloaking' ? 'engines' : id;
        const system = this._system(ship, id);
        if (system.damage <= 0 || this._contested(ship, roomId)) continue;
        system.repair += dt / 12;
        if (system.repair >= 1) { system.repair -= 1; system.damage--; }
      }
    }

    _enemyProfile(ship = this.state.enemy) {
      return SW.DATA.enemyProfiles?.[ship?.aiProfile] || SW.DATA.enemyProfiles?.raider || {
        id: 'raider', name: '습격 전술', description: '무기실을 우선 견제합니다.',
        targetWeights: { weapons: 3, shields: 2, engines: 1, oxygen: 1, bridge: 1, medbay: 1 },
        repairWeights: { weapons: 6, shields: 5, bridge: 4, oxygen: 4, engines: 3, medbay: 2 },
        powerOrder: ['weapons', 'shields', 'drones', 'teleporter', 'cloaking', 'oxygen', 'medbay', 'engines']
      };
    }

    _enemyTarget(weapon) {
      const ship = this.state.player;
      const profile = this._enemyProfile();
      let rooms = ship.rooms.filter(room => finite(profile.targetWeights[room.id]) && profile.targetWeights[room.id] > 0);
      if (!rooms.length) rooms = ship.rooms.slice();
      if (profile.id === 'boarding') {
        const friendlyBoarderRooms = new Set(this.getCrewOnShip('player').filter(crew => crew.faction === 'enemy').map(crew => crew.roomId));
        const clearRooms = rooms.filter(room => !friendlyBoarderRooms.has(room.id));
        if (clearRooms.length) rooms = clearRooms;
      }
      if (profile.id === 'disruptor' && weapon?.type === 'ion') {
        const shields = ship.systems.shields;
        if (shields.power >= 2 && this._usableCapacity(shields) >= 2) return 'shields';
        const alternatives = rooms.filter(room => ['weapons', 'engines'].includes(room.id) && this._capacity(ship.systems[room.id]) > 0);
        if (alternatives.length) rooms = alternatives;
      }
      const functional = rooms.filter(room => this._capacity(ship.systems[room.id]) > 0);
      if (functional.length) rooms = functional;
      if (rooms.length === 1) return rooms[0].id;
      const weights = rooms.map(room => {
        const system = ship.systems[room.id];
        const integrity = system.level > 0 ? this._capacity(system) / system.level : 0;
        const operational = room.id === 'bridge' ? (this._hasPilot(ship) ? 1 : 0) : system.power;
        return Math.max(0.01, profile.targetWeights[room.id] || 1) * (1 + integrity * 0.25 + Math.min(4, operational) * 0.2);
      });
      let choice = this.rand() * weights.reduce((sum, weight) => sum + weight, 0);
      for (let i = 0; i < rooms.length; i++) {
        choice -= weights[i];
        if (choice < 0) return rooms[i].id;
      }
      return rooms[rooms.length - 1].id;
    }

    _chooseEnemyTarget(weapon) {
      weapon.target = this._enemyTarget(weapon);
      weapon.targetRooms = [weapon.target];
      if (weapon.type === 'beam') {
        const room = this.state.player.rooms.find(r => r.id === weapon.target);
        weapon.beamFrom = weapon.target; weapon.beamTo = weapon.target;
        weapon.beamStart = { x: room.x + room.w / 2, y: room.y + room.h / 2 };
        weapon.beamEnd = Object.assign({}, weapon.beamStart);
      }
    }

    getEnemyIntent() {
      const ship = this.state.enemy;
      if (!ship) return null;
      const profile = this._enemyProfile(ship);
      return {
        profileId: ship.aiProfile, name: profile.name, description: profile.description,
        targets: ship.weapons.filter(weapon => SYSTEM_IDS.includes(weapon.target))
          .map(weapon => ({ weaponId: weapon.id, weaponName: weapon.name, roomId: weapon.target }))
      };
    }

    _updateWeapons(ship, dt) {
      const target = ship.id === 'player' ? this.state.enemy : this.state.player;
      if (!target || target.cloakRemaining > 0) return;
      const rank = this.getCrewSkillLevel(this._operator(ship, 'weapons', 'weapons'), 'weapons');
      const manning = (this._manned(ship, 'weapons') ? 1 / 0.9 : 1) * (1 + rank * 0.1);
      if (ship.weapons.some(w => w.powered && w.charge + 1e-8 < w.cooldown)) this._trainOperator(ship, 'weapons', 'weapons', dt);
      for (const weapon of ship.weapons) {
        if (!weapon.powered) continue;
        if (ship.id === 'enemy' && !SYSTEM_IDS.includes(weapon.target)) this._chooseEnemyTarget(weapon);
        weapon.charge = Math.min(weapon.cooldown, weapon.charge + dt * manning);
        if (weapon.charge + 1e-8 >= weapon.cooldown && (weapon.auto || weapon.manualQueued) && this._canFire(ship, weapon)) this._shoot(ship, weapon);
      }
    }

    _canFire(ship, weapon) {
      if (!weapon || this.state.mode !== 'combat' || this.state.combatResolved || !weapon.powered ||
          weapon.charge + 1e-8 < weapon.cooldown || !weapon.target) return false;
      const target = ship.id === 'player' ? this.state.enemy : this.state.player;
      if (!target || target.hull <= 0 || target.cloakRemaining > 0 || !target.rooms.some(r => r.id === weapon.target)) return false;
      if (weapon.type === 'missile' && (ship.id === 'player' ? this.state.resources.missiles : ship.ammo) < 1) return false;
      return true;
    }

    _shoot(ship, weapon) {
      if (!this._canFire(ship, weapon)) return false;
      if (ship.cloakRemaining > 0) { this._endCloak(ship); this._deriveShip(ship); }
      if (weapon.type === 'missile') {
        if (ship.id === 'player') this.state.resources.missiles--;
        else ship.ammo--;
      }
      weapon.charge = 0; weapon.manualQueued = false;
      const shots = weapon.type === 'beam' ? 1 : Math.max(1, weapon.shots || 1);
      for (let i = 0; i < shots; i++) {
        this.state.projectiles.push({
          id: this._id('shot'), from: ship.id,
          weaponType: weapon.type, sourceRoom: 'weapons', targetRoom: weapon.target,
          targetRooms: weapon.type === 'beam' ? [...new Set(weapon.targetRooms?.length ? weapon.targetRooms : [weapon.target])] : [weapon.target],
          beamStart: weapon.type === 'beam' ? clone(weapon.beamStart || null) : null,
          beamEnd: weapon.type === 'beam' ? clone(weapon.beamEnd || null) : null,
          progress: 0, travel: weapon.type === 'beam' ? 0.25 : (weapon.type === 'missile' ? 1.05 : 0.72) + this.rand() * 0.12,
          damage: weapon.damage, miss: false, shieldPierce: weapon.type === 'missile',
          ionDamage: weapon.type === 'ion' ? weapon.ionDamage : 0,
          ionDuration: weapon.type === 'ion' ? weapon.ionDuration : 0,
          delay: i * 0.11, color: weapon.type === 'missile' ? '#ffb86b' : weapon.type === 'beam' ? '#a6edba' : weapon.type === 'ion' ? '#9eb5ff' : '#70d6ee'
        });
      }
      if (ship.id === 'enemy') this._chooseEnemyTarget(weapon);
      return true;
    }

    _resolveProjectile(projectile) {
      const ship = projectile.from === 'player' ? this.state.enemy : this.state.player;
      if (!ship || ship.hull <= 0 || projectile.intercepted) return;
      const room = ship.rooms.find(r => r.id === projectile.targetRoom);
      if (!room) return;
      projectile.miss = projectile.weaponType !== 'beam' && this.rand() < ship.evasion / 100;
      if (projectile.miss) { this._effect(ship, room.id, 'miss', '회피'); return; }
      if (projectile.weaponType === 'ion') {
        const targetId = ship.shield > 0 ? 'shields' : room.id;
        if (ship.shield > 0) { ship.shield--; ship.shieldCharge = 0; }
        this._applyIon(ship, targetId, projectile.ionDamage, projectile.ionDuration);
        return;
      }
      let damage = projectile.damage;
      if (projectile.weaponType === 'beam') {
        damage = Math.max(0, damage - ship.shield);
        if (damage <= 0) { this._effect(ship, room.id, 'shield', '빔 차단'); return; }
        const ids = [...new Set(projectile.targetRooms?.length ? projectile.targetRooms : [room.id])];
        for (const id of ids) {
          const targetRoom = ship.rooms.find(r => r.id === id);
          if (targetRoom) this._hitRoom(ship, targetRoom, damage, 'beam');
        }
        return;
      }
      if (!projectile.shieldPierce && ship.shield > 0) {
        ship.shield--; ship.shieldCharge = 0;
        this._effect(ship, room.id, 'shield', '실드 -1');
        return;
      }
      this._hitRoom(ship, room, damage, projectile.weaponType);
    }

    _damageHull(ship, amount) {
      const actual = Math.min(ship.hull, Math.max(0, amount));
      ship.hull = Math.max(0, ship.hull - actual);
      if (ship.id === 'player') this.state.stats.damageTaken += actual;
      else this.state.stats.damageDealt += actual;
    }

    _finishIfNeeded() {
      const state = this.state;
      if (state.mode !== 'combat' || state.combatResolved) return false;
      if (state.player.hull <= 0 || !state.player.crew.some(c => c.hp > 0)) {
        this._cleanupEncounter('defeat'); this._defeat(); return true;
      }
      const enemy = state.enemy;
      if (!enemy) return false;
      const noEnemyCrew = !enemy.crew.some(c => c.hp > 0);
      if (enemy.hull > 0 && noEnemyCrew && enemy.bossPhase > 0 && !enemy.automated) {
        enemy.automated = true;
        this.log('기함의 승무원이 쓰러졌습니다. 자동 방어가 계속됩니다. 아군을 회수하세요.', 'warning');
      }
      if (enemy.hull <= 0 || (noEnemyCrew && !enemy.automated)) {
        const cause = enemy.hull <= 0 ? 'hull' : 'crew';
        state.lastVictoryCause = cause;
        this._cleanupEncounter(cause);
        if (!state.player.crew.some(c => c.hp > 0)) { this._defeat(); return true; }
        state.combatResolved = true; state.paused = true; state.projectiles = [];
        state.stats.kills++;
        this.log(enemy.name + (cause === 'crew' ? ' 승무원 제압. 생존 강습대를 회수했습니다.' : ' 선체 파괴.'), 'success');
        if (typeof this.onCombatEnd === 'function') this.onCombatEnd(true);
        else {
          state.mode = 'reward';
          state.reward = { title: '교전 승리', body: '항로가 열렸습니다.', scrap: 0, fuel: 0, missiles: 0, droneParts: 0, salvage: null };
        }
        return true;
      }
      return false;
    }

    serialize() {
      return JSON.stringify(this.state);
    }

    load(json) {
      try {
        if (typeof json === 'string' && json.length > 2000000) return false;
        let candidate = typeof json === 'string' ? JSON.parse(json) : clone(json);
        if (candidate && candidate.version === 1) candidate = this._migrateV1(candidate);
        if (candidate && candidate.version === 2) candidate = this._migrateV2(candidate);
        if (candidate && candidate.version === 3) candidate = this._migrateV3(candidate);
        if (candidate && candidate.version === 4) candidate = this._migrateV4(candidate);
        if (!this._validState(candidate) || !this._validTacticalState(candidate) || !this._validV3State(candidate) || !this._validV4State(candidate) || !this._validV5State(candidate)) return false;
        for (const ship of [candidate.player, candidate.enemy].filter(Boolean)) {
          for (const system of Object.values(ship.systems)) {
            if (system.desiredPower === undefined) system.desiredPower = system.power;
          }
          if (ship.ammo === undefined) ship.ammo = 30;
          if (ship.automated === undefined) ship.automated = false;
        }
        this.state = candidate;
        this.state.rng = (candidate.rng ?? candidate.seed ?? 1) >>> 0 || 0x6d2b79f5;
        this.state.nextId = candidate.nextId || 10000;
        this.state.simRemainder = candidate.simRemainder || 0;
        return true;
      } catch (_) {
        return false;
      }
    }

    _validState(s) {
      if (!s || typeof s !== 'object' || Array.isArray(s) || s.version !== 5 || !MODES.has(s.mode)) return false;
      if (!this._validRunOptions(s.loadoutId, s.difficulty)) return false;
      if (!integer(s.seed) || s.seed < 0 || s.seed > 4294967295 || !finite(s.time) || s.time < 0 ||
          typeof s.paused !== 'boolean' || ![1, 2].includes(s.speed)) return false;
      if (!s.resources || !['scrap', 'fuel', 'missiles', 'droneParts'].every(k => integer(s.resources[k]) && s.resources[k] >= 0 && s.resources[k] <= 1000000)) return false;
      if (!integer(s.sector) || s.sector < 1 || s.sector > 3 || !integer(s.jumpCount) || s.jumpCount < 0 ||
          !finite(s.fleet) || s.fleet < 0 || !integer(s.bossPhase) || s.bossPhase < 0 || s.bossPhase > 3) return false;
      if (!s.stats || !['kills', 'jumps', 'scrapEarned', 'damageDealt', 'damageTaken'].every(k => finite(s.stats[k]) && s.stats[k] >= 0)) return false;
      if (!this._validShip(s.player, 'player') || (s.enemy !== null && !this._validShip(s.enemy, 'enemy'))) return false;
      if (typeof s.combatResolved !== 'boolean') return false;
      if (s.mode === 'combat' && (!s.enemy || s.combatResolved)) return false;
      if (s.mode === 'event' && !s.event) return false;
      if (s.mode === 'reward' && !s.reward) return false;
      if (typeof this.initCampaign === 'function') {
        const c = s.campaign;
        if (!c || typeof c !== 'object' || Array.isArray(c) ||
            typeof c.firstRewardPending !== 'boolean' || typeof c.bossInProgress !== 'boolean' ||
            !(c.pendingRewardAction === null || typeof c.pendingRewardAction === 'string') ||
            !(c.activeEventId === null || typeof c.activeEventId === 'string') ||
            !finite(c.combatBonus) || c.combatBonus < 0) return false;
        if (c.powerPlan !== null && (!c.powerPlan || typeof c.powerPlan !== 'object' ||
            !Object.entries(c.powerPlan).every(([id, value]) => POWER_IDS.includes(id) && integer(value) && value >= 0 && value <= 20))) return false;
        if (s.mode === 'event' && !c.activeEventId) return false;
        if (!s.nodes.length) return false;
      }
      if (!Array.isArray(s.projectiles) || s.projectiles.length > 1000 || !Array.isArray(s.effects) || s.effects.length > 1000 ||
          !Array.isArray(s.log) || s.log.length > 1000 || !Array.isArray(s.nodes) || s.nodes.length > 1000) return false;
      for (const p of s.projectiles) {
        if (!p || !['player', 'enemy'].includes(p.from) || !WEAPON_TYPES.includes(p.weaponType) ||
            !SYSTEM_IDS.includes(p.targetRoom) || !finite(p.progress) || p.progress < 0 || p.progress > 1 ||
            !finite(p.travel) || p.travel <= 0 || !finite(p.damage) || p.damage < 0 || p.damage > 100) return false;
      }
      for (const e of s.effects) if (!e || !finite(e.ttl) || typeof e.type !== 'string' || !SYSTEM_IDS.includes(e.roomId)) return false;
      for (const l of s.log) if (!l || typeof l.text !== 'string' || !finite(l.time)) return false;
      const nodeIds = new Set();
      for (const n of s.nodes) {
        if (!n || typeof n.id !== 'string' || nodeIds.has(n.id) || !Array.isArray(n.links) || !finite(n.col) || !finite(n.row)) return false;
        nodeIds.add(n.id);
      }
      for (const n of s.nodes) if (!n.links.every(id => nodeIds.has(id))) return false;
      if (s.nodes.length && !nodeIds.has(s.currentNodeId)) return false;
      if (s.event !== null && (!s.event || typeof s.event.title !== 'string' || !Array.isArray(s.event.choices) ||
          !s.event.choices.every(c => c && typeof c.id === 'string' && typeof c.label === 'string'))) return false;
      if (s.reward !== null && (!s.reward || typeof s.reward.title !== 'string')) return false;
      if (s.nextId !== undefined && (!integer(s.nextId) || s.nextId < 1)) return false;
      if (s.rng !== undefined && (!integer(s.rng) || s.rng < 0 || s.rng > 4294967295)) return false;
      if (s.simRemainder !== undefined && (!finite(s.simRemainder) || s.simRemainder < 0 || s.simRemainder > 0.6)) return false;
      return true;
    }

    _validShip(ship, expectedId) {
      const layout = ship && this.getLayout(ship);
      if (!ship || ship.id !== expectedId || typeof ship.name !== 'string' ||
          !layout || Object.prototype.hasOwnProperty.call(ship, 'adjacency') ||
          !finite(ship.hull) || !finite(ship.maxHull) || ship.maxHull <= 0 || ship.maxHull > 1000 ||
          ship.hull < 0 || ship.hull > ship.maxHull || !integer(ship.reactor) || ship.reactor < 0 || ship.reactor > 100) return false;
      if (!ship.systems || !Array.isArray(ship.rooms) || ship.rooms.length !== SYSTEM_IDS.length ||
          !Array.isArray(ship.crew) || ship.crew.length > 12 || !Array.isArray(ship.weapons) || ship.weapons.length > 8) return false;
      let used = 0;
      for (const id of SYSTEM_IDS) {
        const system = ship.systems[id];
        if (!system || system.id !== id || !integer(system.level) || system.level < 0 || system.level > 20 ||
            !integer(system.damage) || system.damage < 0 || system.damage > system.level ||
            !integer(system.power) || system.power < 0 || !this._validIonSystem(system) || system.power > this._usableCapacity(system) ||
            !finite(system.repair) || system.repair < 0 || system.repair > 2 ||
            (system.desiredPower !== undefined && (!integer(system.desiredPower) || system.desiredPower < 0 || system.desiredPower > 20))) return false;
        if (id === 'bridge' && system.power !== 0) return false;
        used += system.power;
      }
      if (used > ship.reactor) return false;
      if (ship.ammo !== undefined && (!integer(ship.ammo) || ship.ammo < 0 || ship.ammo > 1000000)) return false;
      if (ship.automated !== undefined && typeof ship.automated !== 'boolean') return false;
      const rooms = new Set();
      for (const room of ship.rooms) {
        const definition = layout.rooms.find(item => item.id === room?.id);
        if (!room || !SYSTEM_IDS.includes(room.id) || rooms.has(room.id) ||
            !definition || !['x', 'y', 'w', 'h'].every(key => room[key] === definition[key]) ||
            !['x', 'y', 'w', 'h', 'oxygen', 'fire', 'breach'].every(k => finite(room[k])) ||
            room.w <= 0 || room.h <= 0 || room.oxygen < 0 || room.oxygen > 100 ||
            room.fire < 0 || room.fire > 3 || ![0, 1].includes(room.breach) ||
            (room.breachRepair !== undefined && (!finite(room.breachRepair) || room.breachRepair < 0 || room.breachRepair > 2)) ||
            (room.fireDamage !== undefined && (!finite(room.fireDamage) || room.fireDamage < 0 || room.fireDamage > 100))) return false;
        rooms.add(room.id);
      }
      const crewIds = new Set();
      for (const crew of ship.crew) {
        if (!crew || typeof crew.id !== 'string' || crewIds.has(crew.id) || !SW.DATA.crewTypes[crew.species] ||
            !finite(crew.hp) || !finite(crew.maxHp) || crew.maxHp <= 0 || crew.maxHp > 2000 ||
            crew.hp < 0 || crew.hp > crew.maxHp || typeof crew.roomId !== 'string' ||
            !finite(crew.x) || !finite(crew.y) || !Array.isArray(crew.movePath) ||
            crew.movePath.length > 20 || !crew.movePath.every(id => typeof id === 'string') ||
            (crew.targetRoomId !== null && typeof crew.targetRoomId !== 'string') ||
            (crew.homeRoomId !== undefined && !rooms.has(crew.homeRoomId))) return false;
        crewIds.add(crew.id);
      }
      const weaponIds = new Set();
      for (const w of ship.weapons) {
        if (!w || typeof w.id !== 'string' || weaponIds.has(w.id) || !SW.DATA.weapons[w.defId] ||
            !WEAPON_TYPES.includes(w.type) || !integer(w.power) || w.power < 1 || w.power > 8 ||
            !finite(w.cooldown) || w.cooldown <= 0 || w.cooldown > 1000 ||
            !finite(w.charge) || w.charge < 0 || w.charge > w.cooldown + 0.001 ||
            !finite(w.damage) || w.damage < 0 || w.damage > 100 ||
            !integer(w.shots) || w.shots < 1 || w.shots > 30 ||
            typeof w.enabled !== 'boolean' || typeof w.auto !== 'boolean' ||
            (w.manualQueued !== undefined && typeof w.manualQueued !== 'boolean') ||
            (w.target !== null && typeof w.target !== 'string')) return false;
        weaponIds.add(w.id);
      }
      return finite(ship.shield) && integer(ship.shield) && ship.shield >= 0 && ship.shield <= 10 &&
        integer(ship.maxShield) && ship.maxShield === Math.floor(ship.systems.shields.power / 2) && ship.maxShield >= ship.shield &&
        finite(ship.shieldCharge) && ship.shieldCharge >= 0 &&
        finite(ship.evasion) && ship.evasion >= 0 && ship.evasion <= 100 &&
        finite(ship.ftl) && ship.ftl >= 0 && ship.ftl <= 100 && typeof ship.venting === 'boolean';
    }

    _system(ship, id) {
      return ship.systems[id] || (ship.aux && ship.aux[id]);
    }

    _createAux() {
      return {
        drones: { id: 'drones', name: '드론', level: 2, power: 0, damage: 0, repair: 0, desiredPower: 0, ionStacks: 0, ionTimer: 0 },
        teleporter: { id: 'teleporter', name: '텔레포터', level: 1, power: 0, damage: 0, repair: 0, desiredPower: 0, ionStacks: 0, ionTimer: 0 },
        cloaking: { id: 'cloaking', name: '은폐', level: 0, power: 0, damage: 0, repair: 0, desiredPower: 0, ionStacks: 0, ionTimer: 0 }
      };
    }

    _createSkills() {
      return Object.fromEntries(SKILL_IDS.map(id => [id, 0]));
    }

    getCrewSkillLevel(crewOrId, skillId) {
      if (!SKILL_IDS.includes(skillId)) return 0;
      const crew = typeof crewOrId === 'string'
        ? [this.state.player, this.state.enemy].filter(Boolean).flatMap(ship => ship.crew).find(c => c.id === crewOrId)
        : crewOrId;
      const xp = crew?.skills?.[skillId];
      return finite(xp) ? (xp >= 120 ? 2 : xp >= 40 ? 1 : 0) : 0;
    }

    _operator(ship, roomId, skillId) {
      const system = ship.systems[roomId];
      if (!system || this._usableCapacity(system) <= 0 ||
          (roomId !== 'bridge' && system.power < 1) || this._contested(ship, roomId)) return null;
      return this._localCrew(ship)
        .filter(c => c.faction === ship.id && c.shipId === ship.id && c.roomId === roomId && !c.movePath.length)
        .sort((a, b) => (b.skills?.[skillId] || 0) - (a.skills?.[skillId] || 0) || a.id.localeCompare(b.id))[0] || null;
    }

    _trainOperator(ship, roomId, skillId, dt) {
      const operator = this._operator(ship, roomId, skillId);
      const room = ship.rooms.find(r => r.id === roomId);
      if (!operator || room.fire > 0 || room.breach || this._roomDamage(ship, roomId) > 0) return;
      this._gainSkill(operator, skillId, dt);
    }

    _gainSkill(crew, skillId, amount) {
      if (!crew || crew.hp <= 0 || crew.faction !== 'player' || !SKILL_IDS.includes(skillId) ||
          !finite(amount) || amount <= 0 || this.state.mode !== 'combat' || this.state.paused ||
          crew.movePath.length || (skillId !== 'combat' && crew.shipId !== crew.faction)) return;
      if (!crew.skills) crew.skills = this._createSkills();
      const previousRank = this.getCrewSkillLevel(crew, skillId);
      const previous = finite(crew.skills[skillId]) ? crew.skills[skillId] : 0;
      crew.skills[skillId] = Math.min(120, previous + amount);
      const rank = this.getCrewSkillLevel(crew, skillId);
      if (rank > previousRank) this.log(crew.name + ' · ' + (SW.DATA.skillNames?.[skillId] || skillId) + ' 숙련 ' + rank + '단계', 'success');
    }

    _restoreDesiredPower(ship) {
      this._reconcilePower(ship);
      let available = Math.max(0, this.getReactorCapacity(ship) - this.getPowerUsed(ship));
      for (const id of ['shields', 'weapons', 'oxygen', 'engines', 'drones', 'teleporter', 'cloaking', 'medbay']) {
        const system = this._system(ship, id);
        const desired = Math.min(this._usableCapacity(system), system.desiredPower ?? system.power);
        const add = Math.max(0, Math.min(available, desired - system.power));
        system.power += add; available -= add;
      }
      this._reconcilePower(ship); this._deriveShip(ship);
    }

    _applyIon(ship, id, stacks, duration) {
      const system = this._system(ship, id);
      if (!system || system.level <= 0 || !finite(stacks) || stacks <= 0 || !finite(duration) || duration <= 0) return;
      system.ionStacks = Math.min(system.level, system.ionStacks + Math.max(1, Math.floor(stacks)));
      system.ionTimer = Math.min(15, system.ionTimer + duration);
      this._reconcilePower(ship); this._deriveShip(ship);
      const roomId = id === 'drones' ? 'weapons' : id === 'teleporter' ? 'medbay' : id === 'cloaking' ? 'engines' : id;
      this._effect(ship, roomId, 'ion', '이온 잠금 ' + system.ionStacks);
    }

    _updateIon(ship, dt) {
      let expired = false;
      for (const id of POWER_IDS) {
        const system = this._system(ship, id);
        if (system.ionStacks <= 0) continue;
        system.ionTimer = Math.max(0, system.ionTimer - dt);
        if (system.ionTimer <= 1e-9) { system.ionStacks = 0; system.ionTimer = 0; expired = true; }
      }
      if (expired) this._restoreDesiredPower(ship);
    }

    _resetTemporarySystems(ship) {
      for (const id of POWER_IDS) {
        const system = this._system(ship, id);
        system.ionStacks = 0; system.ionTimer = 0;
      }
      ship.cloakRemaining = 0; ship.cloakCooldown = 0;
      this._restoreDesiredPower(ship);
    }

    activateCloak() {
      const ship = this.state.player;
      if (this.state.mode !== 'combat' || this.state.combatResolved || ship.hull <= 0 || !ship.crew.some(c => c.hp > 0))
        return outcome(false, '진행 중인 전투에서만 은폐할 수 있습니다.');
      if (ship.aux.cloaking.power < 1) return outcome(false, '은폐 장비에 전력을 배분하세요.');
      if (ship.cloakRemaining > 0) return outcome(false, '이미 은폐 중입니다.');
      if (ship.cloakCooldown > 1e-9) return outcome(false, '은폐 장비 재사용 대기 중입니다.');
      ship.cloakCooldown = 0;
      ship.cloakRemaining = 4 + 2 * Math.min(3, ship.aux.cloaking.power);
      this._deriveShip(ship);
      this.log('은폐 가동 · ' + ship.cloakRemaining + '초. 자신의 무기를 발사하면 은폐가 해제됩니다.', 'success');
      return outcome(true, '은폐 가동');
    }

    _endCloak(ship) {
      if (ship.cloakRemaining <= 0) return;
      ship.cloakRemaining = 0; ship.cloakCooldown = 20;
    }

    _updateCloak(ship, dt) {
      if (ship.cloakRemaining > 0) {
        if (ship.aux.cloaking.power < 1 || ship.cloakRemaining <= dt + 1e-9) this._endCloak(ship);
        else ship.cloakRemaining -= dt;
      } else if (ship.aux.cloaking.power > 0) ship.cloakCooldown = Math.max(0, ship.cloakCooldown - dt);
    }

    setEnvironment(kindOrNull) {
      if (this.state.mode !== 'combat' || this.state.combatResolved) return outcome(false, '전투 중에만 환경을 설정할 수 있습니다.');
      if (kindOrNull !== null && !ENVIRONMENT_IDS.includes(kindOrNull)) return outcome(false, '알 수 없는 환경입니다.');
      this.clearEnvironment();
      if (kindOrNull === null) return outcome(true, '정상 우주 공간');
      const def = SW.DATA.environments[kindOrNull];
      this.state.environment = { kind: kindOrNull, timer: def.period, period: def.period, warning: def.warning, warningActive: false, events: 0 };
      for (const ship of [this.state.player, this.state.enemy].filter(Boolean)) { this._reconcilePower(ship); this._deriveShip(ship); }
      this.log(def.name + ' · ' + (kindOrNull === 'ion_storm' ? '사용 가능한 반응로 전력이 제한됩니다.' : '환경 경고를 확인하세요.'), 'warning');
      return outcome(true, def.name);
    }

    clearEnvironment() {
      this.state.environment = null;
      for (const ship of [this.state.player, this.state.enemy].filter(Boolean)) this._restoreDesiredPower(ship);
      return outcome(true, '환경 영향 해제');
    }

    _updateEnvironment(dt) {
      const environment = this.state.environment;
      if (!environment || environment.kind === 'ion_storm') return;
      environment.timer = Math.max(0, environment.timer - dt);
      if (environment.timer <= environment.warning && !environment.warningActive) {
        environment.warningActive = true;
        this.log((environment.kind === 'asteroids' ? '소행성 접근' : '태양 플레어') + ' · ' + Math.ceil(environment.timer) + '초 전 경고', 'warning');
      }
      if (environment.timer > 1e-9) return;
      environment.events++;
      for (const ship of [this.state.player, this.state.enemy].filter(Boolean)) {
        if (ship.hull <= 0) continue;
        const room = ship.rooms[Math.floor(this.rand() * ship.rooms.length)];
        if (environment.kind === 'asteroids') {
          if (this.rand() < ship.evasion / 100) this._effect(ship, room.id, 'miss', '파편 회피');
          else if (ship.shield > 0) { ship.shield--; ship.shieldCharge = 0; this._effect(ship, room.id, 'shield', '파편 차단'); }
          else this._hitRoom(ship, room, 1, 'asteroid');
        } else {
          room.fire = Math.min(3, room.fire + 0.8);
          if (ship.shield === 0) this._damageHull(ship, 1);
          this._effect(ship, room.id, 'fire', '태양 플레어');
        }
      }
      environment.timer = environment.period; environment.warningActive = false;
    }

    _createDoors(layoutId = 'legacy') {
      const layout = this._layoutById(layoutId);
      if (!layout) throw new Error('Unknown layout: ' + layoutId);
      return layout.doors.map(d => Object.assign({}, clone(d), {
        open: false, hp: 30, maxHp: 30, autoClose: 0, autoOpened: false, manualOpen: false
      }));
    }

    _createDrone(defId, owner, id) {
      const def = SW.DATA.drones[defId];
      if (!def) throw new Error('Unknown drone: ' + defId);
      return Object.assign({}, clone(def), {
        id: id || this._id(owner === 'player' ? 'drone' : 'edrone'), defId,
        charge: 0, enabled: false, deployed: false, powered: false, hp: 1
      });
    }

    _createSpecial(spec) {
      const raw = spec.special || ((spec.boarding || spec.boarderCount) ? { kind: 'boarding', period: 32, warning: 5 } : null);
      if (!raw) return null;
      const period = Math.max(6, raw.period || 30);
      return {
        kind: raw.kind, period, timer: period,
        warning: clamp(raw.warning || 5, 5, period - 1), warningActive: false, activeRemaining: 0
      };
    }

    getCrewOnShip(shipId) {
      if (!['player', 'enemy'].includes(shipId)) return [];
      return [this.state.player, this.state.enemy].filter(Boolean)
        .flatMap(owner => owner.crew).filter(c => c.hp > 0 && c.shipId === shipId);
    }

    _localCrew(ship) {
      return this.state[ship.id] === ship
        ? this.getCrewOnShip(ship.id)
        : ship.crew.filter(c => c.hp > 0 && c.shipId === ship.id);
    }

    _contested(ship, roomId) {
      return this._localCrew(ship).some(c => c.faction !== ship.id && c.roomId === roomId);
    }

    addCrew(species, name) {
      const ship = this.state.player;
      const def = SW.DATA.crewTypes[species];
      if (!def) return outcome(false, '알 수 없는 종족입니다.');
      if (ship.crew.filter(c => c.hp > 0).length >= 8) return outcome(false, '승무원 정원은 8명입니다.');
      const room = ship.rooms.find(r => r.id === 'medbay');
      ship.crew = ship.crew.filter(c => c.hp > 0);
      const crew = {
        id: this._id('crew'), name: name || def.name + ' 신입', species,
        faction: 'player', shipId: 'player', hp: def.maxHp, maxHp: def.maxHp,
        roomId: 'medbay', homeRoomId: 'medbay', targetRoomId: null,
        x: room.x + room.w / 2, y: room.y + room.h / 2, movePath: [],
        repairProgress: 0, sabotageProgress: 0, task: '대기', skills: this._createSkills()
      };
      ship.crew.push(crew);
      if (this.state.selectedCrew && !ship.crew.some(c => c.id === this.state.selectedCrew)) this.state.selectedCrew = null;
      this.log(crew.name + ' 승무원이 합류했습니다.', 'success');
      return Object.assign(outcome(true, crew.name + ' 합류'), { crewId: crew.id });
    }

    toggleDoor(doorId) {
      if (['victory', 'defeat'].includes(this.state.mode)) return outcome(false, '항해가 종료되었습니다.');
      const door = this.state.player.doors.find(d => d.id === doorId);
      if (!door) return outcome(false, '문을 찾을 수 없습니다.');
      if (door.hp <= 0) return outcome(false, '파괴된 문은 다음 정비 때 복구됩니다.');
      door.open = !door.open; door.manualOpen = door.open; door.autoOpened = false; door.autoClose = 0;
      this.state.player.venting = this.state.player.doors.some(d => d.airlock && d.open);
      return outcome(true, door.open ? '문 개방' : '문 폐쇄');
    }

    setDoors(open, includeAirlocks = false) {
      if (['victory', 'defeat'].includes(this.state.mode)) return outcome(false, '항해가 종료되었습니다.');
      for (const door of this.state.player.doors) {
        if ((!includeAirlocks && door.airlock) || door.hp <= 0) continue;
        door.open = !!open; door.manualOpen = !!open; door.autoOpened = false; door.autoClose = 0;
      }
      this.state.player.venting = this.state.player.doors.some(d => d.airlock && d.open);
      return outcome(true, open ? '문 개방' : '문 폐쇄');
    }

    sealShip() {
      return this.setDoors(false, true);
    }

    _doorBetween(ship, a, b) {
      return ship.doors.find(d => !d.airlock && ((d.a === a && d.b === b) || (d.a === b && d.b === a)));
    }

    _teleportReady(ship) {
      return this.state.mode === 'combat' && !this.state.combatResolved && ship.aux.teleporter.power > 0 && ship.teleportCooldown <= 1e-7;
    }

    _placeCrew(crew, destination, roomId) {
      const room = destination.rooms.find(r => r.id === roomId);
      crew.shipId = destination.id; crew.roomId = roomId;
      crew.x = room.x + room.w / 2; crew.y = room.y + room.h / 2;
      crew.targetRoomId = null; crew.movePath = []; crew.repairProgress = 0; crew.sabotageProgress = 0;
      crew.task = crew.faction === destination.id ? '대기' : '강습 중';
    }

    _teleport(ship, units, destination, roomId) {
      for (const crew of units) {
        this._effect(this.state[crew.shipId], crew.roomId, 'repair', '전송');
        this._placeCrew(crew, destination, roomId);
        this._effect(destination, roomId, 'repair', crew.faction === destination.id ? '귀환' : '강습');
      }
      ship.teleportCooldown = ship.aux.teleporter.power >= 2 ? 12 : 18;
      this._deriveShip(this.state.player);
      if (this.state.enemy) this._deriveShip(this.state.enemy);
    }

    teleportCrew(crewIds, roomId) {
      const ship = this.state.player;
      if (!this._teleportReady(ship)) return outcome(false, '텔레포터 전력과 재사용 대기를 확인하세요.');
      if (!this.state.enemy || !SYSTEM_IDS.includes(roomId)) return outcome(false, '적 함선의 도착 방을 선택하세요.');
      const ids = Array.isArray(crewIds) ? [...new Set(crewIds)] : [];
      if (!ids.length || ids.length > 2) return outcome(false, '한 번에 아군 승무원 1~2명을 선택하세요.');
      const units = ids.map(id => ship.crew.find(c => c.id === id));
      if (units.some(c => !c || c.hp <= 0 || c.shipId !== 'player')) return outcome(false, '같은 아군 함선에 있는 생존 승무원만 보낼 수 있습니다.');
      this._teleport(ship, units, this.state.enemy, roomId);
      this.log(units.map(c => c.name).join(', ') + ' 적 함선 강습. 회수 전에 적 선체를 파괴하지 마세요.', 'warning');
      return outcome(true, units.length + '명 전송 완료');
    }

    recallCrew(crewIds) {
      const ship = this.state.player;
      if (!this._teleportReady(ship)) return outcome(false, '텔레포터 전력과 재사용 대기를 확인하세요.');
      const defaults = ship.crew.filter(c => c.hp > 0 && c.shipId === 'enemy').slice(0, 2).map(c => c.id);
      const ids = crewIds === undefined ? defaults : (Array.isArray(crewIds) ? [...new Set(crewIds)] : []);
      if (!ids.length || ids.length > 2) return outcome(false, '회수할 적함의 아군 1~2명을 선택하세요.');
      const units = ids.map(id => ship.crew.find(c => c.id === id));
      if (!this.state.enemy || units.some(c => !c || c.hp <= 0 || c.shipId !== 'enemy')) return outcome(false, '적 함선에 있는 생존 아군만 회수할 수 있습니다.');
      this._teleport(ship, units, ship, 'medbay');
      this.log(units.map(c => c.name).join(', ') + ' 귀환.', 'success');
      return outcome(true, units.length + '명 회수 완료');
    }

    toggleDrone(droneId) {
      const ship = this.state.player;
      const drone = ship.drones.find(d => d.id === droneId);
      if (!drone || this.state.mode !== 'combat' || this.state.combatResolved) return outcome(false, '전투 중 설치된 드론을 선택하세요.');
      if (drone.enabled) {
        drone.enabled = false; drone.powered = false;
        return outcome(true, '드론 전원 해제. 이번 전투의 기체는 유지됩니다.');
      }
      const used = ship.drones.reduce((sum, d) => sum + (d.enabled && d.deployed && d.hp > 0 ? d.power : 0), 0);
      if (used + drone.power > ship.aux.drones.power) return outcome(false, '드론 제어에 충분한 전력을 먼저 배분하세요.');
      if (!drone.deployed || drone.hp <= 0) {
        if (this.state.resources.droneParts < 1) return outcome(false, '드론 부품이 부족합니다.');
        this.state.resources.droneParts--;
        drone.deployed = true; drone.hp = 1; drone.charge = drone.type === 'defense' ? drone.cooldown : 0;
      }
      drone.enabled = true;
      this._reconcilePower(ship);
      return outcome(true, drone.name + ' 가동');
    }

    setWeaponAuto(weaponId, enabled) {
      const weapon = this.state.player.weapons.find(w => w.id === weaponId);
      if (!weapon) return outcome(false, '무기를 찾을 수 없습니다.');
      weapon.fireMode = enabled ? 'auto' : 'manual';
      weapon.auto = !!enabled && !!weapon.target;
      return outcome(true, enabled ? '자동 사격' : '수동 사격');
    }

    fireAllReady() {
      let count = 0;
      for (const weapon of this.state.player.weapons) if (this.fireWeapon(weapon.id)) count++;
      return Object.assign(outcome(count > 0, count ? count + '개 무기 일제사격 접수' : '충전·전력·표적을 확인하세요.'), { count });
    }

    _segmentEntry(a, b, room) {
      let low = 0, high = 1;
      const dx = b.x - a.x, dy = b.y - a.y;
      for (const [p, q] of [[-dx, a.x - room.x], [dx, room.x + room.w - a.x], [-dy, a.y - room.y], [dy, room.y + room.h - a.y]]) {
        if (Math.abs(p) < 1e-10) { if (q < 0) return null; continue; }
        const ratio = q / p;
        if (p < 0) low = Math.max(low, ratio);
        else high = Math.min(high, ratio);
        if (low > high + 1e-9) return null;
      }
      return low;
    }

    targetBeam(weaponId, startRoomId, endRoomId) {
      const weapon = this.state.player.weapons.find(w => w.id === weaponId);
      const enemy = this.state.enemy;
      if (!weapon || weapon.type !== 'beam' || this.state.mode !== 'combat' || !enemy ||
          !SYSTEM_IDS.includes(startRoomId) || !SYSTEM_IDS.includes(endRoomId)) return outcome(false, '빔 무기와 적의 시작·끝 방을 선택하세요.');
      const from = enemy.rooms.find(r => r.id === startRoomId);
      const to = enemy.rooms.find(r => r.id === endRoomId);
      const a = { x: from.x + from.w / 2, y: from.y + from.h / 2 };
      const b = { x: to.x + to.w / 2, y: to.y + to.h / 2 };
      const distance = Math.hypot(b.x - a.x, b.y - a.y);
      const length = SW.DATA.weapons[weapon.defId].beamLength || 4;
      if (distance > length) { b.x = a.x + (b.x - a.x) * length / distance; b.y = a.y + (b.y - a.y) * length / distance; }
      const hits = startRoomId === endRoomId ? [{ id: startRoomId, t: 0 }] : enemy.rooms.map(r => ({ id: r.id, t: this._segmentEntry(a, b, r) })).filter(r => r.t !== null);
      hits.sort((a, b) => a.t - b.t || a.id.localeCompare(b.id));
      weapon.target = startRoomId; weapon.beamFrom = startRoomId; weapon.beamTo = endRoomId;
      weapon.beamStart = a; weapon.beamEnd = b; weapon.targetRooms = [...new Set(hits.map(h => h.id))];
      weapon.auto = weapon.fireMode !== 'manual';
      this.log(weapon.name + ' 경로 설정 · ' + weapon.targetRooms.length + '개 방', 'command');
      return Object.assign(outcome(true, weapon.targetRooms.length + '개 방을 통과하는 빔'), { targetRooms: weapon.targetRooms.slice() });
    }

    _updateDoors(ship, dt) {
      for (const door of ship.doors) {
        if (door.hp <= 0) { door.open = true; door.autoOpened = false; door.autoClose = 0; continue; }
        if (!door.autoOpened || !door.open) continue;
        door.autoClose = Math.max(0, door.autoClose - dt);
        if (door.autoClose <= 0) { door.open = false; door.autoOpened = false; }
      }
    }

    _repairTarget(ship, roomId) {
      if (ship.systems[roomId].damage > 0) return ship.systems[roomId];
      if (roomId === 'weapons' && ship.aux.drones.damage > 0) return ship.aux.drones;
      if (roomId === 'medbay' && ship.aux.teleporter.damage > 0) return ship.aux.teleporter;
      if (roomId === 'engines' && ship.aux.cloaking.damage > 0) return ship.aux.cloaking;
      return null;
    }

    _roomDamage(ship, roomId) {
      return ship.systems[roomId].damage + (roomId === 'weapons' ? ship.aux.drones.damage : roomId === 'medbay' ? ship.aux.teleporter.damage : roomId === 'engines' ? ship.aux.cloaking.damage : 0);
    }

    _damageCrew(crew, amount) {
      if (crew.hp <= 0 || amount <= 0) return;
      crew.hp = Math.max(0, crew.hp - amount);
      if (crew.hp <= 0) {
        crew.hp = 0; crew.task = '전사'; crew.movePath = []; crew.targetRoomId = null;
        this.log(crew.name + (crew.faction === 'player' ? ' 승무원을 잃었습니다.' : ' 쓰러짐.'), 'danger');
        if (this.state.selectedCrew === crew.id) this.state.selectedCrew = null;
      }
    }

    _crewCombat(ship, dt) {
      const local = this._localCrew(ship);
      const incoming = new Map();
      const attacks = [];
      for (const room of ship.rooms) {
        const player = local.filter(c => c.faction === 'player' && c.roomId === room.id);
        const enemy = local.filter(c => c.faction === 'enemy' && c.roomId === room.id);
        if (!player.length || !enemy.length) continue;
        for (const [attackers, defenders] of [[player, enemy], [enemy, player]]) {
          attackers.forEach((crew, index) => {
            if (crew.movePath.length) return;
            const target = defenders[index % defenders.length];
            const multiplier = (SW.DATA.crewTypes[crew.species].combatMultiplier ?? 1) * (1 + this.getCrewSkillLevel(crew, 'combat') * 0.1);
            const damage = dt * 4 * multiplier;
            incoming.set(target, (incoming.get(target) || 0) + damage);
            attacks.push({ crew, target, damage });
          });
        }
      }
      for (const attack of attacks) {
        const actualFraction = Math.min(1, attack.target.hp / incoming.get(attack.target));
        this._gainSkill(attack.crew, 'combat', dt * actualFraction);
      }
      for (const [crew, damage] of incoming) this._damageCrew(crew, damage);
    }

    _hitRoom(ship, room, damage, weaponType) {
      this._damageHull(ship, damage);
      const system = ship.systems[room.id];
      system.damage = Math.min(system.level, system.damage + damage);
      system.repair = Math.min(system.repair, 0.99);
      for (const crew of this._localCrew(ship)) {
        if (crew.roomId === room.id) this._damageCrew(crew, damage * 7);
      }
      if (room.oxygen > 15 && this.rand() < (weaponType === 'missile' ? 0.18 : 0.09)) {
        room.fire = Math.min(3, room.fire + 1);
      } else if (this.rand() < (weaponType === 'missile' ? 0.08 : 0.035)) room.breach = 1;
      this._reconcilePower(ship); this._deriveShip(ship);
      this._effect(ship, room.id, 'hit', '-' + damage);
      if (ship.id === 'player' && (damage >= 2 || ship.hull <= 8)) this.log(room.name + ' 피격, 선체 -' + damage + '.', 'danger');
    }

    _cleanupEncounter(cause) {
      const player = this.state.player, enemy = this.state.enemy;
      this.clearEnvironment();
      for (const ship of [player, enemy].filter(Boolean)) {
        this._resetTemporarySystems(ship);
        for (const weapon of ship.weapons) {
          weapon.target = null; weapon.targetRooms = []; weapon.auto = false; weapon.manualQueued = false;
          weapon.beamFrom = null; weapon.beamTo = null; weapon.beamStart = null; weapon.beamEnd = null;
        }
      }
      for (const crew of player.crew) {
        if (crew.shipId !== 'enemy') continue;
        if (crew.hp > 0 && cause !== 'crew') {
          this._damageCrew(crew, crew.hp);
          this.log(crew.name + (cause === 'escape' ? ' 승무원이 적 함선에 남겨졌습니다.' : ' 승무원이 적 함선과 함께 소실되었습니다.'), 'danger');
        }
        this._placeCrew(crew, player, 'medbay');
        if (crew.hp <= 0) crew.task = '전사';
      }
      if (enemy) {
        for (const crew of enemy.crew) {
          if (crew.shipId !== 'player') continue;
          crew.hp = 0; this._placeCrew(crew, enemy, 'medbay'); crew.task = '무력화';
        }
      }
      this._deriveShip(player);
    }

    _defeat() {
      const state = this.state;
      state.combatResolved = true; state.mode = 'defeat'; state.paused = true; state.projectiles = [];
      this.log(state.player.hull <= 0 ? '선체가 붕괴했습니다. 마지막 신호가 끊어집니다.' : '생존 승무원이 없습니다. 항해가 끝났습니다.', 'danger');
    }

    _updateDrones(ship, dt) {
      const target = ship.id === 'player' ? this.state.enemy : this.state.player;
      if (!target) return;
      for (const drone of ship.drones) {
        if (!drone.powered) continue;
        const speed = drone.type === 'combat' && ship.special?.kind === 'drone_surge' && ship.special.activeRemaining > 0 ? 3 : 1;
        drone.charge = Math.min(drone.cooldown, drone.charge + dt * speed);
        if (drone.charge + 1e-8 < drone.cooldown) continue;
        if (drone.type === 'defense') {
          const missile = this.state.projectiles.find(p => !p.intercepted && p.from !== ship.id && p.weaponType === 'missile' &&
            p.progress >= 0.15 && p.progress < 0.95 && !(p.delay > 0));
          if (missile) {
            missile.intercepted = true; drone.charge = 0;
            this._effect(ship, missile.targetRoom, 'shield', '미사일 요격');
          }
        } else {
          drone.charge = 0;
          const roomId = ship.id === 'player' ? 'weapons' : this._enemyTarget();
          this.state.projectiles.push({
            id: this._id('drone-shot'), from: ship.id, weaponType: 'laser',
            sourceRoom: 'weapons', targetRoom: roomId, targetRooms: [roomId],
            progress: 0, travel: 0.85, damage: 1, miss: false, shieldPierce: false,
            delay: 0, droneId: drone.id, color: '#bc95ff'
          });
        }
      }
    }

    _updateSpecial(ship, dt) {
      const special = ship.special;
      if (!special) return;
      special.activeRemaining = Math.max(0, special.activeRemaining - dt);
      special.timer = Math.max(0, special.timer - dt);
      if (special.timer <= special.warning && !special.warningActive) {
        special.warningActive = true;
        const names = { boarding: '강습 전송', drone_surge: '드론 과충전', volley: '미사일 일제사격' };
        this.log('경고: ' + names[special.kind] + '까지 ' + Math.ceil(special.timer) + '초.', 'warning');
      }
      if (special.timer > 0) return;
      if (special.kind === 'boarding') {
        const home = ship.crew.filter(c => c.hp > 0 && c.shipId === 'enemy');
        const candidates = home.filter(c => c.roomId !== 'bridge' && c.hp > c.maxHp * 0.35)
          .sort((a, b) => (SW.DATA.crewTypes[b.species].combatMultiplier || 1) - (SW.DATA.crewTypes[a.species].combatMultiplier || 1));
        const units = candidates.slice(0, Math.min(ship.boarderCount || 1, Math.max(0, home.length - 1)));
        if (units.length && this._teleportReady(ship)) {
          const roomId = this.rand() < 0.5 ? 'oxygen' : 'weapons';
          this._teleport(ship, units, this.state.player, roomId);
          this.log('적 강습대 ' + units.length + '명 침입! 문과 방어 인력을 지휘하세요.', 'danger');
        } else this.log('적 강습 전송이 중단되었습니다.', 'info');
      } else if (special.kind === 'drone_surge') {
        if (ship.drones.some(d => d.type === 'combat' && d.powered)) {
          special.activeRemaining = 8;
          this.log('적 드론 과충전! 8초 동안 공격 주기가 빨라집니다.', 'danger');
        } else this.log('적 드론 전력 부족으로 과충전이 중단되었습니다.', 'info');
      } else if (special.kind === 'volley') {
        if (ship.systems.weapons.power > 0 && this._capacity(ship.systems.weapons) > 0) {
          for (let i = 0; i < 3; i++) {
            const roomId = this._enemyTarget();
            this.state.projectiles.push({
              id: this._id('special-missile'), from: 'enemy', weaponType: 'missile',
              sourceRoom: 'weapons', targetRoom: roomId, targetRooms: [roomId],
              progress: 0, travel: 1.3, damage: 1, miss: false, shieldPierce: true,
              delay: i * 1.5, special: true, color: '#ff8e7a'
            });
          }
          this.log('기함 미사일 일제사격! 방어 드론과 회피 전력을 확인하세요.', 'danger');
        } else this.log('무기실 무력화로 기함 일제사격이 취소되었습니다.', 'success');
      }
      special.timer = special.period; special.warningActive = false;
    }

    _migrateV1(s) {
      if (!s || !s.player || !s.resources) return null;
      for (const owner of [s.player, s.enemy].filter(Boolean)) {
        if (!Array.isArray(owner.crew) || !Array.isArray(owner.weapons)) return null;
        owner.aux = this._createAux();
        owner.doors = this._createDoors();
        if (owner.venting) {
          for (const door of owner.doors) { door.open = true; door.manualOpen = true; }
        }
        owner.teleportCooldown = 0;
        owner.drones = owner.id === 'player' ? [this._createDrone('defense', owner.id, 'legacy-defense-drone')] : [];
        owner.droneParts = 5; owner.boarderCount = 0; owner.special = null;
        for (const crew of owner.crew) {
          crew.shipId = owner.id; crew.faction = owner.id; crew.sabotageProgress = 0;
        }
        for (const weapon of owner.weapons) {
          weapon.fireMode = 'auto'; weapon.manualQueued = !!weapon.manualQueued;
          weapon.beamFrom = weapon.type === 'beam' ? weapon.target : null;
          weapon.beamTo = weapon.type === 'beam' ? weapon.target : null;
          weapon.beamStart = null; weapon.beamEnd = null;
          weapon.targetRooms = weapon.target ? [weapon.target] : [];
        }
      }
      for (const projectile of s.projectiles || []) {
        if (!projectile.targetRooms) projectile.targetRooms = [projectile.targetRoom];
        if (projectile.weaponType === 'beam') { projectile.beamStart = null; projectile.beamEnd = null; }
      }
      if (s.resources.droneParts === undefined) s.resources.droneParts = 4;
      s.lastVictoryCause = null;
      s.version = 2;
      return s;
    }

    _migrateV2(s) {
      if (!s || !s.player || !Array.isArray(s.nodes)) return null;
      for (const owner of [s.player, s.enemy].filter(Boolean)) {
        if (!owner.systems || !owner.aux || !Array.isArray(owner.crew)) return null;
        owner.aux.cloaking = this._createAux().cloaking;
        owner.cloakRemaining = 0; owner.cloakCooldown = 0;
        for (const id of POWER_IDS) {
          const system = owner.systems[id] || owner.aux[id];
          if (!system || typeof system !== 'object' || Array.isArray(system)) return null;
          system.ionStacks = 0; system.ionTimer = 0;
        }
        for (const crew of owner.crew) crew.skills = this._createSkills();
      }
      for (const node of s.nodes) node.environment = null;
      s.loadoutId = 'argo'; s.difficulty = 'standard'; s.environment = null;
      s.version = 3;
      return s;
    }

    _migrateV3(s) {
      if (!s || !s.player || !s.stats) return null;
      s.cargo = [];
      s.stats.salvaged = 0; s.stats.equipmentSold = 0;
      if (s.campaign && typeof s.campaign === 'object' && !Array.isArray(s.campaign)) s.campaign.normalVictories = 0;
      for (const ship of [s.player, s.enemy].filter(Boolean)) ship.aiProfile = 'raider';
      if (s.reward && typeof s.reward === 'object' && !Array.isArray(s.reward)) s.reward.salvage = null;
      s.version = 4;
      return s;
    }

    _migrateV4(s) {
      if (!s || !s.player) return null;
      for (const ship of [s.player, s.enemy].filter(Boolean)) ship.layoutId = 'legacy';
      s.version = 5;
      return s;
    }

    _validLayoutPoint(point, layout) {
      return point === null || (!!layout && !!point && finite(point.x) && finite(point.y) &&
        point.x >= -1e-7 && point.x <= layout.width + 1e-7 && point.y >= -1e-7 && point.y <= layout.height + 1e-7);
    }

    _validCrewPosition(crew, ship) {
      const room = ship.rooms.find(item => item.id === crew.roomId);
      if (this._pointInRoom(crew, room)) return true;
      if (ship.layoutId !== 'legacy') return false;
      if (crew.movePath.length && ship.rooms.some(item => this._doorBetween(ship, crew.roomId, item.id) && this._pointInRoom(crew, item))) return true;
      // A v4 casualty could stop between room centers after its route was cleared.
      return crew.hp === 0 && crew.movePath.length === 0 && ship.rooms.some(item => this._pointInRoom(crew, item));
    }

    _validV5State(s) {
      for (const effect of s.effects) {
        const ship = s[effect.ship];
        if (!['player', 'enemy'].includes(effect.ship) || !ship || !ship.rooms.some(room => room.id === effect.roomId)) return false;
      }
      for (const projectile of s.projectiles) {
        const target = projectile.from === 'player' ? s.enemy : s.player;
        const source = s[projectile.from];
        if (!target || !source || !target.rooms.some(room => room.id === projectile.targetRoom) ||
            (projectile.sourceRoom !== undefined && !source.rooms.some(room => room.id === projectile.sourceRoom))) return false;
      }
      return true;
    }

    _validEquipmentItem(item) {
      return !!item && typeof item === 'object' && !Array.isArray(item) &&
        Object.keys(item).length === 3 && typeof item.id === 'string' && item.id.length > 0 && item.id.length <= 128 &&
        !!this._equipmentDefinition(item.kind, item.defId);
    }

    _validV4State(s) {
      if (!Array.isArray(s.cargo) || s.cargo.length > this._equipmentLimit('cargo') ||
          !['salvaged', 'equipmentSold'].every(key => integer(s.stats[key]) && s.stats[key] >= 0 && s.stats[key] <= 1000000) ||
          !integer(s.nextId) || s.nextId < 1 || s.nextId > 1000000000) return false;
      if (s.campaign !== undefined && (!s.campaign || !integer(s.campaign.normalVictories) || s.campaign.normalVictories < 0 || s.campaign.normalVictories > 1000000)) return false;
      for (const ship of [s.player, s.enemy].filter(Boolean)) if (!AI_PROFILES.includes(ship.aiProfile)) return false;
      const ship = s.player;
      if (ship.weapons.length < 1 || ship.weapons.length > this._equipmentLimit('weapon') || ship.drones.length > this._equipmentLimit('drone')) return false;
      const ids = new Set();
      for (const [kind, equipment] of [['weapon', ship.weapons], ['drone', ship.drones]]) {
        for (const item of equipment) {
          const definition = this._equipmentDefinition(kind, item.defId);
          if (!definition || typeof item.id !== 'string' || item.id.length === 0 || item.id.length > 128 || ids.has(item.id) || item.type !== definition.type) return false;
          ids.add(item.id);
        }
      }
      for (const item of s.cargo) {
        if (!this._validEquipmentItem(item) || ids.has(item.id)) return false;
        ids.add(item.id);
      }
      if (s.reward !== null) {
        const salvage = s.reward.salvage;
        if (salvage !== null) {
          if (!salvage || typeof salvage !== 'object' || Array.isArray(salvage) || !this._validEquipmentItem(salvage.item) ||
              !['pending', 'claimed', 'scrapped'].includes(salvage.status) || !integer(salvage.scrapValue) ||
              salvage.scrapValue <= 0 || salvage.scrapValue > 1000000 ||
              salvage.scrapValue !== SW.DATA.equipment[salvage.item.kind][salvage.item.defId].sell) return false;
          if (salvage.status === 'pending' && (s.mode !== 'reward' || ids.has(salvage.item.id))) return false;
        }
      }
      return true;
    }

    _validIonSystem(system) {
      return integer(system.ionStacks) && system.ionStacks >= 0 && system.ionStacks <= system.level &&
        finite(system.ionTimer) && system.ionTimer >= 0 && system.ionTimer <= 15 &&
        ((system.ionStacks === 0 && system.ionTimer === 0) || (system.ionStacks > 0 && system.ionTimer > 0));
    }

    _validV3State(s) {
      if (s.environment !== null) {
        const environment = s.environment;
        if (!environment || typeof environment !== 'object' || Array.isArray(environment) ||
            !ENVIRONMENT_IDS.includes(environment.kind) || s.mode !== 'combat' || s.combatResolved) return false;
        const definition = SW.DATA.environments[environment.kind];
        if (environment.period !== definition.period || environment.warning !== definition.warning ||
            !finite(environment.timer) || environment.timer < 0 || environment.timer > environment.period ||
            typeof environment.warningActive !== 'boolean' || !integer(environment.events) || environment.events < 0 || environment.events > 1000000 ||
            (environment.kind === 'ion_storm' && (environment.timer !== 0 || environment.warningActive))) return false;
      }
      if (!s.nodes.every(node => node.environment === null || ENVIRONMENT_IDS.includes(node.environment))) return false;
      for (const ship of [s.player, s.enemy].filter(Boolean)) {
        if (this.getPowerUsed(ship) > this._reactorCapacity(ship, s.environment) || ship.aux.cloaking.level > 3 ||
            !finite(ship.cloakRemaining) || ship.cloakRemaining < 0 || ship.cloakRemaining > 10 ||
            !finite(ship.cloakCooldown) || ship.cloakCooldown < 0 || ship.cloakCooldown > 20 ||
            (ship.cloakRemaining > 0 && (ship.aux.cloaking.power < 1 || ship.cloakCooldown > 0))) return false;
        for (const crew of ship.crew) {
          if (!crew.skills || typeof crew.skills !== 'object' || Array.isArray(crew.skills) || Object.keys(crew.skills).length !== SKILL_IDS.length ||
              !SKILL_IDS.every(id => finite(crew.skills[id]) && crew.skills[id] >= 0 && crew.skills[id] <= 120)) return false;
        }
        for (const weapon of ship.weapons) {
          if (weapon.type === 'ion' && (weapon.damage !== 0 || !integer(weapon.ionDamage) || weapon.ionDamage < 1 || weapon.ionDamage > 20 ||
              !finite(weapon.ionDuration) || weapon.ionDuration <= 0 || weapon.ionDuration > 15)) return false;
        }
      }
      for (const projectile of s.projectiles) {
        if (projectile.weaponType === 'ion' && (projectile.damage !== 0 || !integer(projectile.ionDamage) || projectile.ionDamage < 1 || projectile.ionDamage > 20 ||
            !finite(projectile.ionDuration) || projectile.ionDuration <= 0 || projectile.ionDuration > 15)) return false;
      }
      return true;
    }

    _validTacticalState(s) {
      if (![null, 'hull', 'crew'].includes(s.lastVictoryCause)) return false;
      if (s.projectiles.length && !s.enemy) return false;
      const ids = new Set();
      for (const ship of [s.player, s.enemy].filter(Boolean)) {
        const layout = this.getLayout(ship);
        if (!layout) return false;
        const doorSpecs = new Map(layout.doors.map(door => [door.id, door]));
        if (!ship.aux || !AUX_IDS.every(id => ship.aux[id])) return false;
        for (const id of AUX_IDS) {
          const a = ship.aux[id];
          if (a.id !== id || !integer(a.level) || a.level < 0 || a.level > 20 ||
              !integer(a.damage) || a.damage < 0 || a.damage > a.level ||
              !integer(a.power) || a.power < 0 || !this._validIonSystem(a) || a.power > this._usableCapacity(a) ||
              !finite(a.repair) || a.repair < 0 || a.repair > 2 ||
              (a.desiredPower !== undefined && (!integer(a.desiredPower) || a.desiredPower < 0 || a.desiredPower > 20))) return false;
        }
        if (this.getPowerUsed(ship) > ship.reactor) return false;
        if (!finite(ship.teleportCooldown) || ship.teleportCooldown < 0 || ship.teleportCooldown > 60 ||
            !integer(ship.droneParts) || ship.droneParts < 0 || ship.droneParts > 1000000 ||
            !integer(ship.boarderCount) || ship.boarderCount < 0 || ship.boarderCount > 2) return false;
        if (!Array.isArray(ship.doors) || ship.doors.length !== doorSpecs.size) return false;
        const doorIds = new Set();
        for (const door of ship.doors) {
          const def = doorSpecs.get(door.id);
          if (!def || doorIds.has(door.id) || door.a !== def.a || door.b !== def.b || door.airlock !== def.airlock ||
              door.x !== def.x || door.y !== def.y || door.orientation !== def.orientation ||
              typeof door.open !== 'boolean' || !finite(door.hp) || !finite(door.maxHp) ||
              door.maxHp <= 0 || door.maxHp > 100 || door.hp < 0 || door.hp > door.maxHp ||
              (door.hp === 0 && !door.open) || !finite(door.autoClose) || door.autoClose < 0 || door.autoClose > 10 ||
              typeof door.autoOpened !== 'boolean' || typeof door.manualOpen !== 'boolean') return false;
          doorIds.add(door.id);
        }
        if (ship.venting !== ship.doors.some(d => d.airlock && d.open)) return false;
        if (ship.crew.filter(c => c.hp > 0).length > 8) return false;
        for (const crew of ship.crew) {
          if (ids.has(crew.id) || crew.faction !== ship.id || !['player', 'enemy'].includes(crew.shipId) ||
              (crew.shipId === 'enemy' && !s.enemy) ||
              (crew.sabotageProgress !== undefined && (!finite(crew.sabotageProgress) || crew.sabotageProgress < 0 || crew.sabotageProgress > 2))) return false;
          ids.add(crew.id);
          const physicalShip = s[crew.shipId];
          const rooms = new Set(physicalShip.rooms.map(room => room.id));
          if (!rooms.has(crew.roomId) || !crew.movePath.every(id => rooms.has(id)) ||
              (crew.targetRoomId !== null && !rooms.has(crew.targetRoomId)) ||
              (crew.movePath.length ? crew.targetRoomId !== crew.movePath[crew.movePath.length - 1] : crew.targetRoomId !== null) ||
              !this._validCrewPosition(crew, physicalShip)) return false;
          let previous = crew.roomId;
          for (const next of crew.movePath) {
            if (next !== previous && !this._doorBetween(physicalShip, previous, next)) return false;
            previous = next;
          }
        }
        let dronePower = 0;
        if (!Array.isArray(ship.drones) || ship.drones.length > 4) return false;
        const droneIds = new Set();
        for (const drone of ship.drones) {
          if (!drone || typeof drone.id !== 'string' || droneIds.has(drone.id) || !SW.DATA.drones[drone.defId] ||
              !['combat', 'defense'].includes(drone.type) || !integer(drone.power) || drone.power < 1 || drone.power > 8 ||
              !finite(drone.cooldown) || drone.cooldown <= 0 || drone.cooldown > 60 ||
              !finite(drone.charge) || drone.charge < 0 || drone.charge > drone.cooldown + 0.001 ||
              typeof drone.enabled !== 'boolean' || typeof drone.deployed !== 'boolean' ||
              typeof drone.powered !== 'boolean' || !finite(drone.hp) || drone.hp < 0 || drone.hp > 1 ||
              (drone.enabled && (!drone.deployed || drone.hp <= 0)) ||
              (drone.powered && (!drone.enabled || !drone.deployed))) return false;
          droneIds.add(drone.id);
          if (drone.powered) dronePower += drone.power;
        }
        if (dronePower > ship.aux.drones.power) return false;
        const opponent = ship.id === 'player' ? s.enemy : s.player;
        const targetLayout = opponent ? this.getLayout(opponent) : ship.layoutId === 'legacy' ? this._layoutById('legacy') : null;
        const targetRooms = new Set(targetLayout?.rooms.map(room => room.id) || []);
        for (const weapon of ship.weapons) {
          if (!['auto', 'manual'].includes(weapon.fireMode) ||
              (weapon.target !== null && !targetRooms.has(weapon.target)) ||
              !Array.isArray(weapon.targetRooms) || weapon.targetRooms.length > targetRooms.size ||
              new Set(weapon.targetRooms).size !== weapon.targetRooms.length ||
              !weapon.targetRooms.every(id => targetRooms.has(id)) ||
              !(weapon.beamFrom === null || targetRooms.has(weapon.beamFrom)) ||
              !(weapon.beamTo === null || targetRooms.has(weapon.beamTo)) ||
              !this._validLayoutPoint(weapon.beamStart, targetLayout) || !this._validLayoutPoint(weapon.beamEnd, targetLayout) ||
              ((weapon.beamStart === null) !== (weapon.beamEnd === null))) return false;
          if (weapon.beamStart && weapon.beamEnd &&
              Math.hypot(weapon.beamEnd.x - weapon.beamStart.x, weapon.beamEnd.y - weapon.beamStart.y) > (SW.DATA.weapons[weapon.defId].beamLength || 4) + 0.001) return false;
        }
        if (ship.special !== null) {
          const a = ship.special;
          if (!a || !['boarding', 'drone_surge', 'volley'].includes(a.kind) ||
              !finite(a.period) || a.period < 6 || a.period > 300 ||
              !finite(a.timer) || a.timer < 0 || a.timer > a.period ||
              !finite(a.warning) || a.warning < 5 || a.warning >= a.period ||
              typeof a.warningActive !== 'boolean' || !finite(a.activeRemaining) ||
              a.activeRemaining < 0 || a.activeRemaining > 20) return false;
        }
      }
      for (const p of s.projectiles) {
        const target = p.from === 'player' ? s.enemy : s.player;
        if (!target) return false;
        const layout = this.getLayout(target);
        const rooms = new Set(target.rooms.map(room => room.id));
        if (p.targetRooms !== undefined && (!Array.isArray(p.targetRooms) || p.targetRooms.length > rooms.size ||
            new Set(p.targetRooms).size !== p.targetRooms.length || !p.targetRooms.every(id => rooms.has(id)))) return false;
        if (p.beamStart !== undefined && !this._validLayoutPoint(p.beamStart, layout)) return false;
        if (p.beamEnd !== undefined && !this._validLayoutPoint(p.beamEnd, layout)) return false;
        if (p.beamStart && p.beamEnd && Math.hypot(p.beamEnd.x - p.beamStart.x, p.beamEnd.y - p.beamStart.y) > 4 + 0.001) return false;
        if (p.intercepted !== undefined && typeof p.intercepted !== 'boolean') return false;
      }
      return true;
    }

  }

  SW.Game = Game;
})();
