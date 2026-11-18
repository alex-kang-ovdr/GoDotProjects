'use strict';

/**
 * Reproducible, no-cheat campaign traversal.
 *
 * The policy reads state and issues the same public commands exposed by the UI.
 * It never writes hull, scrap, crew health, damage, random outcomes, or encounter
 * resolution. Every fight, including all three flagship phases, uses tick().
 * This checks that the shipped balance permits an earned complete run. It is
 * not an estimate of a first-time player's win rate or a product autoplay mode.
 *
 * Run from the repository root:
 *   node tests/playthrough.cjs
 * Optional explicit seeds:
 *   node tests/playthrough.cjs 42 123
 * Select a ship and difficulty:
 *   node tests/playthrough.cjs --loadout atlas --difficulty veteran 42
 * With no arguments, run all three ships on standard and Argo on veteran.
 */
const path = require('node:path');
const fs = require('node:fs');
const assert = require('node:assert/strict');
require(path.join(__dirname, '../dist/data.js'));
require(path.join(__dirname, '../dist/engine.js'));
require(path.join(__dirname, '../dist/campaign.js'));

function play(seed, loadoutId = 'argo', difficulty = 'standard', options = {}) {
  const game = new globalThis.Starward.Game(seed);
  game.newRun(seed, { loadoutId, difficulty });
  const purchases = [];
  const equipmentActions = [];
  const salvageActions = [];
  let firstRefitDone = false;
  game.startRun();
  let lastEncounter = '';
  let steps = 0;
  const bossPhases = new Set();
  const warnings = new Set();
  let maxIntruders = 0;
  let droneDeployments = 0;
  let cloakActivations = 0;
  const environments = new Set();
  const enemyLayouts = new Set();
  const beamFootprints = new Map();
  let maxCrewRouteDistance = 0;
  let hackingPulses = 0, mindUses = 0, batteryUses = 0;
  const visitedSectors = new Set(), completedQuests = new Set(), captures = new Set();
  const capture = name => {
    if (!options.captureDir || captures.has(name)) return;
    const paused = game.state.paused;
    game.setPaused(true);
    const save = game.serialize();
    game.setPaused(paused);
    fs.mkdirSync(options.captureDir, { recursive: true });
    const filename = path.join(options.captureDir, 'v' + game.state.version + '_browser_' + name + '.json');
    fs.writeFileSync(filename, save + '\n');
    const bytes = fs.readFileSync(filename, 'utf8'), copy = new globalThis.Starward.Game(1);
    assert.equal(typeof JSON.parse(bytes), 'object', 'save files contain the state object, not a quoted JSON string');
    assert.ok(copy.load(bytes), 'exact browser snapshot bytes must pass the real loader: ' + name);
    captures.add(name);
  };
  const shortestStep = targetId => {
    const queue = [[game.state.currentNodeId]], seen = new Set(queue[0]);
    while (queue.length) {
      const route = queue.shift(), tail = game.state.nodes.find(n => n.id === route.at(-1));
      if (tail.id === targetId) return route[1] || tail.id;
      for (const id of tail.links) if (!seen.has(id)) { seen.add(id); queue.push([...route, id]); }
    }
    throw new Error('Unreachable policy destination: ' + targetId);
  };

  while (!['victory', 'defeat'].includes(game.state.mode) && steps++ < 100000) {
    const state = game.state;
    const player = state.player;
    visitedSectors.add(state.sector);
    for (const quest of game.getQuestLog()) if (quest.status === 'completed') completedQuests.add(quest.definitionId);

    if (state.mode === 'combat') {
      if (lastEncounter !== state.encounterId) {
        lastEncounter = state.encounterId;
        enemyLayouts.add(state.enemy.layoutId);
        if (state.bossPhase) bossPhases.add(state.bossPhase);
        if (state.environment) environments.add(state.environment.kind);
        game.sealShip();
        for (const weapon of player.weapons) {
          const needMissile = state.bossPhase >= 2 || state.sector >= 3 || player.hull < 13;
          if (weapon.type === 'missile' && weapon.enabled !== needMissile) {
            game.toggleWeapon(weapon.id);
          }
          if (weapon.enabled) {
            game.setWeaponAuto(weapon.id, true);
            if (weapon.type === 'beam') {
              game.targetBeam(weapon.id, 'engines', 'weapons');
              beamFootprints.set(state.enemy.layoutId, [...weapon.targetRooms]);
            }
            else game.targetWeapon(weapon.id, weapon.type === 'ion' ? 'shields' : 'weapons');
          }
        }
        game.setPaused(false);
      }

      const intruders = game.getCrewOnShip('player').filter(c => c.hp > 0 && game.getEffectiveFaction(c) === 'enemy');
      if (intruders.length) capture('crew_combat');
      maxIntruders = Math.max(maxIntruders, intruders.length);
      if (state.enemy.special?.warningActive) {
        warnings.add(state.enemy.special.kind);
        if (state.enemy.special.kind === 'boarding') capture('boarding_warning');
      }

      // The captain respects the storm's effective reactor capacity, retains
      // a damage source, gathers defenders, and holds fire while concealed.
      if (steps % 6 === 0) {
        const localCrew = player.crew.filter(c => c.hp > 0 && c.shipId === 'player' && !c.controlledBy);
        const wounded = localCrew.filter(c => c.hp < c.maxHp * (intruders.length ? 0.55 : 0.42));
        const wantsMedbay = wounded.length > 0 ||
          localCrew.some(c => c.roomId === 'medbay' && c.hp < c.maxHp * 0.9);
        const missileThreat = state.enemy.special?.kind === 'volley' ||
          state.enemy.weapons.some(w => w.enabled && w.type === 'missile');
        const defense = player.drones.find(d => d.type === 'defense');
        const combatDrone = player.drones.find(d => d.type === 'combat');
        const usable = id => {
          const component = player.systems[id] || player.aux[id];
          return Math.max(0, component.level - component.damage - (component.ionStacks || 0));
        };
        const availableDrone = drone => drone && (drone.deployed || state.resources.droneParts > 0);
        const wantedDrones = [];
        if (missileThreat && availableDrone(defense)) wantedDrones.push(defense);
        if (availableDrone(combatDrone) &&
            wantedDrones.reduce((sum, drone) => sum + drone.power, 0) + combatDrone.power <= usable('drones')) {
          wantedDrones.push(combatDrone);
        }
        const goals = {
          oxygen: 1,
          shields: Math.min(player.systems.shields.level, 6),
          weapons: player.weapons.filter(w => w.enabled).reduce((n, w) => n + w.power, 0),
          engines: 2,
          medbay: wantsMedbay ? 1 : 0,
          drones: wantedDrones.reduce((sum, drone) => sum + drone.power, 0),
          teleporter: 0,
          cloaking: player.aux.cloaking.level > 0 ? 1 : 0,
          hacking: player.aux.hacking.level > 0 ? 1 : 0,
          mind: player.aux.mind.level > 0 ? 1 : 0
        };
        const system = id => player.systems[id] || player.aux[id];
        if (game.getAbilityStatus('battery').ok && game.activateBattery().ok) batteryUses += 1;
        const priority = ['oxygen', 'medbay', 'weapons', 'cloaking', 'shields', 'hacking', 'mind', 'drones', 'engines', 'teleporter'];
        let budget = game.getReactorCapacity();
        const desiredPower = {};
        for (const id of priority) {
          let amount = Math.min(budget, usable(id), goals[id]);
          if (id === 'shields') amount -= amount % 2;
          desiredPower[id] = amount;
          budget -= amount;
        }

        for (const id of Object.keys(desiredPower)) {
          if (system(id).power > desiredPower[id]) {
            game.allocatePower(id, desiredPower[id] - system(id).power);
          }
        }
        for (const id of priority) {
          game.allocatePower(id, desiredPower[id] - system(id).power);
        }
        for (const drone of player.drones) {
          if (drone.enabled && !wantedDrones.includes(drone)) game.toggleDrone(drone.id);
        }
        for (const drone of wantedDrones) {
          if (!drone.enabled) {
            const alreadyDeployed = drone.deployed;
            if (game.toggleDrone(drone.id).ok && !alreadyDeployed) droneDeployments += 1;
          }
        }

        for (const crew of wounded) {
          if (crew.targetRoomId !== 'medbay' && crew.roomId !== 'medbay') {
            game.moveCrew(crew.id, 'medbay');
          }
        }
        const defenders = intruders.length ? localCrew.filter(c => !wounded.includes(c))
          .sort((a, b) => {
            const score = crew => globalThis.Starward.DATA.crewTypes[crew.species].combatMultiplier +
              (crew.homeRoomId === 'bridge' ? -0.2 : 0);
            return score(b) - score(a) || b.hp - a.hp;
          }).slice(0, 2) : [];
        if (intruders.length) {
          const target = intruders[0];
          for (const crew of defenders) {
            if (typeof game.attackCrew === 'function' && crew.attackTargetId !== target.id) game.attackCrew(crew.id, target.id);
            else if (typeof game.attackCrew !== 'function' && crew.roomId !== target.roomId && crew.targetRoomId !== target.roomId) game.moveCrew(crew.id, target.roomId, 'player');
          }
          // The engineer withdraws from a hostile room while the fighters hold it.
          for (const crew of localCrew.filter(c => c.species === 'engi' && !defenders.includes(c))) {
            if (intruders.some(c => c.roomId === crew.roomId)) game.moveCrew(crew.id, 'medbay', 'player');
          }
        }
        const engineer = localCrew.find(c => c.species === 'engi' && c.hp > c.maxHp * 0.55 && !defenders.includes(c));
        const rock = intruders.length ? null : localCrew.find(c => c !== engineer && c.homeRoomId !== 'bridge' && c.hp > c.maxHp * 0.55);
        const hazards = player.rooms
          .filter(r => !intruders.some(c => c.roomId === r.id) && (r.fire || r.breach || (game.getRoomSystem?.(player, r.id)?.damage || 0)))
          .sort((a, b) => (game.getRoomSystem?.(player, b.id)?.damage || 0) - (game.getRoomSystem?.(player, a.id)?.damage || 0));

        if (engineer && hazards.length && !engineer.movePath.length && engineer.roomId !== hazards[0].id) {
          game.moveCrew(engineer.id, hazards[0].id);
        }
        if (rock && hazards[1] && !rock.movePath.length && rock.roomId !== hazards[1].id) {
          game.moveCrew(rock.id, hazards[1].id);
        }
        for (const crew of localCrew) {
          if (!intruders.length && crew.hp > crew.maxHp * 0.9 && !crew.movePath.length &&
              (!hazards.length || crew.roomId === 'medbay') &&
              crew.roomId !== crew.homeRoomId) {
            game.moveCrew(crew.id, crew.homeRoomId);
          }
          const route = game.getCrewRoute(crew.id);
          if (route) maxCrewRouteDistance = Math.max(maxCrewRouteDistance, route.distance);
        }
      }

      if (player.aux.mind.power > 0 && state.enemy.crew.some(c => c.hp > 0)) capture('mind_combat');
      if (player.aux.hacking.power > 0) {
        if (player.hacking.phase === 'idle' && game.launchHacking('shields').ok) capture('hacking_travel');
        if (['attached', 'cooldown'].includes(player.hacking.phase) && game.activateHacking().ok) hackingPulses += 1;
      }
      const controlledFriend = player.crew.find(c => c.hp > 0 && c.controlledBy === 'enemy');
      const mindTarget = controlledFriend || state.enemy.crew.find(c => c.hp > 0 && !c.controlledBy && c.roomId === 'weapons') ||
        state.enemy.crew.find(c => c.hp > 0 && !c.controlledBy);
      if (mindTarget && game.getAbilityStatus('mind', mindTarget.id).ok && game.activateMindControl(mindTarget.id).ok) mindUses += 1;

      const incoming = state.projectiles.some(shot => shot.from === 'enemy' && shot.progress > 0.15);
      const enemyPreparing = state.enemy.weapons.some(weapon => weapon.powered && weapon.charge >= weapon.cooldown * 0.75);
      if (player.aux.cloaking.power > 0 && player.cloakRemaining <= 0 && player.cloakCooldown <= 0 &&
          (incoming || enemyPreparing)) {
        for (const weapon of player.weapons) if (weapon.enabled) game.setWeaponAuto(weapon.id, false);
        if (game.activateCloak().ok) cloakActivations += 1;
      }
      for (const weapon of player.weapons) {
        const automatic = player.cloakRemaining <= 0;
        if (weapon.enabled && (weapon.fireMode === 'auto') !== automatic) game.setWeaponAuto(weapon.id, automatic);
      }
      game.tick(0.25);

    } else if (state.mode === 'reward') {
      const salvage = state.reward?.salvage;
      if (salvage?.status === 'pending') {
        // Carry the early finds to a real shop. Later surplus is explicitly
        // scrapped, so the policy exercises both irreversible reward choices.
        const choice = (!firstRefitDone || state.stats.equipmentSold === 0) && state.cargo.length < 6 ? 'claim' : 'scrap';
        assert.ok(game.resolveSalvage(choice).ok, 'resolve the displayed salvage before proceeding');
        salvageActions.push({ choice, kind: salvage.item.kind, defId: salvage.item.defId });
      }
      assert.ok(game.continueReward().ok, 'a completed reward must advance exactly once');

    } else if (state.mode === 'map') {
      capture('map');
      if (game.getQuestLog().some(q => q.status === 'active')) capture('quest');
      if (state.campaign.pendingSectorChoice) {
        capture('world');
        const world = game.getWorldMap();
        const next = world.availableIds.map(id => world.nodes.find(n => n.id === id))
          .sort((a,b) => (a.category === 'friendly' ? 0 : a.category === 'nebula' ? 1 : 2) -
            (b.category === 'friendly' ? 0 : b.category === 'nebula' ? 1 : 2))[0];
        assert.ok(next, 'a sector exit has a connected next sector');
        const travel = game.advanceSector(next.id);
        assert.ok(travel.ok || state.mode === 'event' && state.resources.fuel === 0, 'choose a connected next sector or request fuel rescue');
        continue;
      }
      const current = state.nodes.find(n => n.id === state.currentNodeId);
      let target;
      const stand = state.campaign.finalStand;
      if (stand) target = state.nodes.find(n => n.id === stand.bossNodeId);
      else {
        const questTargets = game.getQuestLog().filter(q => q.status === 'active' && q.targetSector === state.sector)
          .map(q => state.nodes.find(n => n.id === q.targetNodeId)).filter(Boolean);
        const nextCol = current.col + 1;
        target = questTargets.filter(n => n.col <= nextCol).sort((a,b) => a.col-b.col)[0];
        if (!target && state.sector <= 3 && current.col === 0) target = state.nodes.find(n => n.id === `s${state.sector}-1-1`);
        if (!target) {
          const forward = current.links.map(id => state.nodes.find(n => n.id === id)).filter(n => n.col > current.col);
          target = forward.find(n => n.type === 'shop' && !n.visited) ||
            forward.find(n => n.type === 'repair' && player.hull < player.maxHull - 4) ||
            forward.find(n => n.type === 'combat' && !n.environment) ||
            forward.find(n => n.type === 'exit') || forward.find(n => n.type === 'event') || forward[0];
        }
      }
      const destination = target && state.nodes.find(n => n.id === shortestStep(target.id));
      assert.ok(destination, 'Every visited map state needs a forward route');
      const jump = destination.id === current.id && stand ? game.engageFlagship() : game.jump(destination.id);
      assert.ok(jump.ok || state.mode === 'event' && state.resources.fuel === 0, 'legal destination: ' + jump.message);

    } else if (state.mode === 'event') {
      const preferredIds = ['relay_quest', 'refugee_quest', 'blueprint_quest', 'quest_relay_engi',
        'quest_relay_hacking', 'quest_relay_deliver', 'quest_escort_cloak', 'quest_escort_fight',
        'quest_escort_supplies', 'quest_blueprint_teleport', 'quest_blueprint_rock', 'quest_blueprint_mind',
        'quest_blueprint_beam', 'next_sector', 'continue', 'advance', 'enter_next', 'distress_wait'];
      const choice = preferredIds.map(id => state.event.choices.find(c => c.id === id && !c.disabled)).find(Boolean) ||
        state.event.choices.find(c => !c.disabled && c.style === 'blue') || state.event.choices.find(c => !c.disabled);
      assert.ok(choice, 'Every event encountered by the policy needs an enabled choice');
      assert.ok(game.chooseEvent(choice.id).ok, 'the chosen event must still satisfy its conditions');

    } else if (state.mode === 'shop') {
      capture('shop');
      const buy = id => {
        // A new facility consumes an actual mounting bay. Expand only through
        // the public paid command and only when the complete purchase fits.
        if (['cloaking', 'hacking', 'mind', 'battery'].includes(id) && player.aux[id].level === 0 && game.getSystemSlots) {
          const slots = game.getSystemSlots();
          if (!slots.some(slot => slot.unlocked && !slot.systemId)) {
            const locked = slots.find(slot => !slot.unlocked);
            const expansion = locked && game.getSlotExpansionStatus(locked.id);
            const item = game.shopItems().find(item => item.id === id);
            if (expansion?.ok && item && state.resources.scrap >= expansion.cost + item.cost) {
              const expanded = game.expandSystemSlot(locked.id);
              if (expanded.ok) purchases.push('slot_expand:' + locked.id);
            }
          }
        }
        const result = game.buy(id);
        if (result.ok) purchases.push(id);
        return result.ok;
      };

      if (!firstRefitDone) {
        const command = (action, itemId, replacement = null) => {
          const result = action === 'stow' ? game.stowEquipment('weapon', itemId)
            : game.installEquipment(itemId, replacement);
          assert.ok(result.ok, action + ': ' + result.message);
          equipmentActions.push({ action: replacement ? 'swap' : action, itemId, replacement });
        };
        const firstSalvage = state.cargo.find(item => item.kind === 'weapon' &&
          item.defId === (loadoutId === 'atlas' ? 'beam' : 'ion'));
        assert.ok(firstSalvage, 'the first real victory supplied its promised equipment');
        if (loadoutId === 'argo' || loadoutId === 'atlas') {
          // Place the recovered support weapon first, then bring the proven
          // damage weapon back from cargo. The swap preserves instance IDs.
          const stored = player.weapons.find(item => item.defId === (loadoutId === 'argo' ? 'artemis' : 'heavy_laser'));
          command('stow', stored.id);
          const displaced = player.weapons[0];
          command('install', firstSalvage.id, displaced.id);
          command('install', displaced.id);
          if (loadoutId === 'atlas') command('install', stored.id);
        } else {
          // Wraith keeps its two complementary hull weapons; maintenance
          // verifies an actual stow/reinstall before selling surplus salvage.
          const beam = player.weapons.find(item => item.type === 'beam');
          command('stow', beam.id); command('install', beam.id);
        }
        firstRefitDone = true;
      }
      for (const item of [...state.cargo]) {
        const result = game.sellEquipment('cargo', item.id);
        assert.ok(result.ok, result.message);
        equipmentActions.push({ action: 'sell', itemId: item.id, kind: item.kind, defId: item.defId });
      }

      while (player.hull < 25 && state.resources.scrap >= 18) if (!buy('repair')) break;
      while (state.resources.fuel < 10 && state.resources.scrap >= 12) if (!buy('fuel')) break;
      if (player.systems.shields.level < 4 && state.resources.scrap >= 55) buy('shields');
      if (loadoutId !== 'wraith' && !player.weapons.some(w => w.defId === 'heavy_laser') && state.resources.scrap >= 45) {
        buy('heavy_laser');
      }
      if (loadoutId === 'atlas' && !player.weapons.some(w => w.type === 'beam') && state.resources.scrap >= 65) buy('beam');
      if (loadoutId === 'argo' && state.sector >= 2 && !player.weapons.some(w => w.type === 'beam') && state.resources.scrap >= 65) buy('beam');
      const weaponBudget = player.weapons.reduce((sum, weapon) => sum + weapon.power, 0);
      while (player.systems.weapons.level < weaponBudget) if (!buy('weapons')) break;
      if (state.sector >= 2 && player.crew.filter(c => c.hp > 0).length < 4 && state.resources.scrap >= 42) {
        buy('recruit_mantis');
      }
      const reactorTarget = state.sector >= 4 ? 18 : state.sector >= 3 ? 16 : 12;
      while (player.reactor < reactorTarget) {
        if (!buy('reactor')) break;
      }
      if (player.systems.shields.level < 6 && player.reactor >= 12 && state.resources.scrap >= 75) {
        buy('shields');
      }
      if (loadoutId === 'atlas' && state.sector >= 2 && player.aux.drones.level < 4 && state.resources.scrap >= 36) buy('drone_control');
      while (player.weapons.some(w => w.type === 'missile') && state.resources.missiles < 12 && state.resources.scrap >= 16) if (!buy('missiles')) break;
      if (state.resources.droneParts < 2 && state.resources.scrap >= 18) buy('drone_parts');
      while (player.hull < player.maxHull && state.resources.scrap >= 18) if (!buy('repair')) break;
      if (state.sector >= 2 && player.maxHull < 40 && state.resources.scrap >= 45) buy('hull_plating');
      if (state.sector >= 3 && !player.aux.cloaking.level && state.resources.scrap >= 60) buy('cloaking');
      if (state.sector >= 2 && !player.aux.mind.level && state.resources.scrap >= 50) buy('mind');
      if (state.sector >= 3 && !player.aux.hacking.level && state.resources.scrap >= 55) buy('hacking');
      if (state.sector >= 3 && !player.aux.battery.level && state.resources.scrap >= 35) buy('battery');
      game.leaveShop();

    } else {
      throw new Error('Unexpected mode: ' + state.mode);
    }
  }

  capture('outcome');
  const result = {
    seed,
    loadoutId,
    difficulty,
    result: game.state.mode,
    hull: game.state.player.hull,
    kills: game.state.stats.kills,
    combatSeconds: Math.round(game.state.time),
    missiles: game.state.resources.missiles,
    livingCrew: game.state.player.crew.filter(c => c.hp > 0).length,
    maxIntruders,
    droneDeployments,
    cloakActivations,
    environments: [...environments],
    masteryRanks: game.state.player.crew.filter(c => c.hp > 0).map(crew => ({ name: crew.name,
      ranks: Object.fromEntries(Object.keys(crew.skills).map(id => [id, game.getCrewSkillLevel(crew, id)])) })),
    bossWarnings: [...warnings],
    commandSteps: steps,
    purchases,
    salvageActions,
    equipmentActions,
    salvaged: game.state.stats.salvaged,
    equipmentSold: game.state.stats.equipmentSold,
    layoutId: game.state.player.layoutId,
    enemyLayouts: [...enemyLayouts],
    beamFootprints: Object.fromEntries(beamFootprints),
    maxCrewRouteDistance: Math.round(maxCrewRouteDistance * 100) / 100
    ,hackingPulses, mindUses, batteryUses, visitedSectors: [...visitedSectors], completedQuests: [...completedQuests],
    worldRoute: game.state.campaign.world.route, mapTurns: game.state.campaign.mapTurns
  };
  assert.equal(result.result, 'victory', 'The no-cheat policy failed: ' + JSON.stringify(result));
  assert.equal(game.state.sector, 8);
  assert.equal(game.state.bossPhase, 3);
  assert.ok(result.kills >= 10);
  assert.deepEqual([...visitedSectors], [1,2,3,4,5,6,7,8]);
  assert.deepEqual([...bossPhases], [1, 2, 3]);
  assert.equal(result.layoutId, loadoutId + '_v7', 'campaign must use the real expanded ship layout');
  assert.ok(enemyLayouts.has('interceptor_v7') && enemyLayouts.has('flagship_v7'));
  assert.ok(result.salvaged >= 1 && result.equipmentSold >= 1, 'carry and sell real equipment through the campaign');
  assert.ok(salvageActions.some(item => item.choice === 'scrap'));
  assert.ok(equipmentActions.some(item => item.action === 'stow'));
  assert.ok(equipmentActions.some(item => item.action === 'install'));
  if (loadoutId !== 'wraith') assert.ok(equipmentActions.some(item => item.action === 'swap'));
  return result;
}

const args = process.argv.slice(2);
let selectedLoadout = 'argo', selectedDifficulty = 'standard', captureDir = null;
const seeds = [];
for (let index = 0; index < args.length; index += 1) {
  const value = args[index];
  if (value === '--capture-dir') { captureDir = path.resolve(args[++index]);
  } else if (value === '--loadout' || value === '--difficulty') {
    const next = args[++index];
    const choices = value === '--loadout' ? globalThis.Starward.DATA.loadouts : globalThis.Starward.DATA.difficulties;
    assert.ok(choices[next], 'Unknown ' + value + ': ' + next);
    if (value === '--loadout') selectedLoadout = next; else selectedDifficulty = next;
  } else {
    const parsed = Number(value);
    assert.ok(Number.isInteger(parsed) && parsed >= 0 && parsed <= 0xffffffff, 'Seed must be uint32');
    seeds.push(parsed);
  }
}
const cases = args.length ? (seeds.length ? seeds : [42]).map(seed => [seed, selectedLoadout, selectedDifficulty])
  : [[42, 'argo', 'standard'], [42, 'atlas', 'standard'], [42, 'wraith', 'standard'], [42, 'argo', 'veteran']];
const results = cases.map(([seed, loadoutId, difficulty]) => play(seed, loadoutId, difficulty, {captureDir}));
console.log(JSON.stringify(results, null, 2));
console.log('PASS: ' + results.length + '/' + cases.length + ' complete runs with public commands and real combat ticks.');
