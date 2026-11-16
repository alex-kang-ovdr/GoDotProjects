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
const assert = require('node:assert/strict');
require(path.join(__dirname, '../dist/data.js'));
require(path.join(__dirname, '../dist/engine.js'));
require(path.join(__dirname, '../dist/campaign.js'));

function play(seed, loadoutId = 'argo', difficulty = 'standard') {
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

  while (!['victory', 'defeat'].includes(game.state.mode) && steps++ < 100000) {
    const state = game.state;
    const player = state.player;

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

      const intruders = state.enemy.crew.filter(c => c.hp > 0 && c.shipId === 'player');
      maxIntruders = Math.max(maxIntruders, intruders.length);
      if (state.enemy.special?.warningActive) warnings.add(state.enemy.special.kind);

      // The captain respects the storm's effective reactor capacity, retains
      // a damage source, gathers defenders, and holds fire while concealed.
      if (steps % 6 === 0) {
        const localCrew = player.crew.filter(c => c.hp > 0 && c.shipId === 'player');
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
          cloaking: player.aux.cloaking.level > 0 ? 1 : 0
        };
        const system = id => player.systems[id] || player.aux[id];
        const priority = ['oxygen', 'medbay', 'weapons', 'drones', 'cloaking', 'shields', 'engines', 'teleporter'];
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
          const target = intruders[0].roomId;
          for (const crew of defenders) {
            if (crew.roomId !== target && crew.targetRoomId !== target) game.moveCrew(crew.id, target, 'player');
          }
          // The engineer withdraws from a hostile room while the fighters hold it.
          for (const crew of localCrew.filter(c => c.species === 'engi' && !defenders.includes(c))) {
            if (intruders.some(c => c.roomId === crew.roomId)) game.moveCrew(crew.id, 'medbay', 'player');
          }
        }
        const engineer = localCrew.find(c => c.species === 'engi' && c.hp > c.maxHp * 0.55 && !defenders.includes(c));
        const rock = intruders.length ? null : localCrew.find(c => c !== engineer && c.homeRoomId !== 'bridge' && c.hp > c.maxHp * 0.55);
        const hazards = player.rooms
          .filter(r => !intruders.some(c => c.roomId === r.id) && (r.fire || r.breach || player.systems[r.id].damage))
          .sort((a, b) => player.systems[b.id].damage - player.systems[a.id].damage);

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
        const choice = !firstRefitDone && state.cargo.length < 6 ? 'claim' : 'scrap';
        assert.ok(game.resolveSalvage(choice).ok, 'resolve the displayed salvage before proceeding');
        salvageActions.push({ choice, kind: salvage.item.kind, defId: salvage.item.defId });
      }
      assert.ok(game.continueReward().ok, 'a completed reward must advance exactly once');

    } else if (state.mode === 'map') {
      const current = state.nodes.find(n => n.id === state.currentNodeId);
      const reachable = current.links.map(id => state.nodes.find(n => n.id === id));
      const destination = reachable.find(n => n.type === 'shop') ||
        reachable.find(n => n.type === 'combat') ||
        reachable.find(n => n.type === 'boss' || n.type === 'exit') ||
        reachable[0];
      assert.ok(destination, 'Every visited map state needs a forward route');
      game.jump(destination.id);

    } else if (state.mode === 'event') {
      const preferredIds = ['next_sector', 'continue', 'advance', 'enter_next', 'distress_wait'];
      const choice = state.event.choices.find(c => !c.disabled && preferredIds.includes(c.id)) ||
        state.event.choices.find(c => !c.disabled);
      assert.ok(choice, 'Every event encountered by the policy needs an enabled choice');
      game.chooseEvent(choice.id);

    } else if (state.mode === 'shop') {
      const buy = id => {
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

      while (player.hull < 25 && state.resources.scrap >= 18) buy('repair');
      if (player.systems.shields.level < 4 && state.resources.scrap >= 55) buy('shields');
      if (loadoutId !== 'wraith' && !player.weapons.some(w => w.defId === 'heavy_laser') && state.resources.scrap >= 45) {
        buy('heavy_laser');
      }
      if (loadoutId === 'atlas' && !player.weapons.some(w => w.type === 'beam') && state.resources.scrap >= 65) buy('beam');
      if (state.sector >= 2 && player.crew.filter(c => c.hp > 0).length < 4 && state.resources.scrap >= 42) {
        buy('recruit_mantis');
      }
      const reactorTarget = state.sector >= 3 ? 14 : 12;
      while (player.reactor < reactorTarget) {
        if (!buy('reactor')) break;
      }
      if (player.systems.shields.level < 6 && player.reactor >= 12 && state.resources.scrap >= 75) {
        buy('shields');
      }
      if (loadoutId === 'atlas' && state.sector >= 2 && player.aux.drones.level < 4 && state.resources.scrap >= 36) buy('drone_control');
      while (player.weapons.some(w => w.type === 'missile') && state.resources.missiles < 12 && state.resources.scrap >= 16) buy('missiles');
      if (state.resources.droneParts < 2 && state.resources.scrap >= 18) buy('drone_parts');
      while (player.hull < player.maxHull && state.resources.scrap >= 18) buy('repair');
      if (state.sector >= 2 && player.maxHull < 40 && state.resources.scrap >= 45) buy('hull_plating');
      game.leaveShop();

    } else {
      throw new Error('Unexpected mode: ' + state.mode);
    }
  }

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
  };
  assert.equal(result.result, 'victory', 'The no-cheat policy failed: ' + JSON.stringify(result));
  assert.equal(game.state.sector, 3);
  assert.equal(game.state.bossPhase, 3);
  assert.equal(result.kills, 10);
  assert.deepEqual([...bossPhases], [1, 2, 3]);
  assert.equal(result.layoutId, loadoutId, 'campaign must use the real new ship layout');
  assert.ok(enemyLayouts.has('interceptor') && enemyLayouts.has('flagship'));
  assert.ok(result.salvaged >= 1 && result.equipmentSold >= 1, 'carry and sell real equipment through the campaign');
  assert.ok(salvageActions.some(item => item.choice === 'scrap'));
  assert.ok(equipmentActions.some(item => item.action === 'stow'));
  assert.ok(equipmentActions.some(item => item.action === 'install'));
  if (loadoutId !== 'wraith') assert.ok(equipmentActions.some(item => item.action === 'swap'));
  return result;
}

const args = process.argv.slice(2);
let selectedLoadout = 'argo', selectedDifficulty = 'standard';
const seeds = [];
for (let index = 0; index < args.length; index += 1) {
  const value = args[index];
  if (value === '--loadout' || value === '--difficulty') {
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
const results = cases.map(([seed, loadoutId, difficulty]) => play(seed, loadoutId, difficulty));
console.log(JSON.stringify(results, null, 2));
console.log('PASS: ' + results.length + '/' + cases.length + ' complete runs with public commands and real combat ticks.');
