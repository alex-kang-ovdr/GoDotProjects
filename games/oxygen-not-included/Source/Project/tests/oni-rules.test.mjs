import test from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../../../Web/engine.js';
import { GAS_KG_PER_UNIT, canBreathe, materialFor, oxygenOutletSpace, stepEnvironment } from '../../../Web/environment.js';
import { ELEMENTS } from '../../../Web/elements.js';
import { close, finiteState } from './helpers.mjs';

test('unmarked 4.1 colonies keep their clock, batteries and water mass; a new colony resets the profile', () => {
  const old = new Game(73, 'breath-4.1');
  const battery = old._addBuilding('battery', 26, 11);
  battery.charge = 1010;
  old.step(1);
  const save = old.serialize();
  delete save.ruleset;
  const game = new Game(198);
  game.load(JSON.parse(JSON.stringify(save)));
  assert.equal(game.ruleset, 'breath-4.1');
  assert.equal(game.cycleSeconds, 120);
  assert.equal(game.waterKgPerCell, 12);
  assert.deepEqual(game.buildings.find(b => b.id === battery.id), old.buildings.find(b => b.id === battery.id));
  game.reset(73,'oni-base');
  assert.equal(game.ruleset, 'oni-base');
  assert.equal(game.waterKgPerCell, 1000);
  assert.equal(game.cycleSeconds, 600);
  const before = game.serialize();
  assert.throws(() => game.load({...before, ruleset:'unknown'}));
  assert.deepEqual(game.serialize(), before);
});

test('a duplicant consumes 100 g of oxygen and 1/600 of a daily ration per second and exhales 2 g of CO2', () => {
  const game = new Game(73,'oni-base'), crew = game.crew[0], cell = game.cell(Math.floor(crew.x), Math.floor(crew.y));
  const {oxygen, co2} = cell, hunger = crew.hunger;
  game._crewStep(crew, 1);
  close((oxygen-cell.oxygen)*GAS_KG_PER_UNIT, 0.1, 'ambient oxygen mass');
  close((cell.co2-co2)*GAS_KG_PER_UNIT, 0.002, 'exhaled CO2 mass');
  close((hunger-crew.hunger)*40, 1000/600, 'metabolic kcal');
  cell.oxygen=0;
  crew.portableOxygen=game.breathRate/2;
  const exhaled=cell.co2;
  game._crewStep(crew,1);
  close(crew.portableOxygen,0,'portable oxygen depleted');
  close((cell.co2-exhaled)*GAS_KG_PER_UNIT,.001,'exhaled gas from a partial tank breath');
});

test('Mealwood grows in three cycles using 30 kg dirt, yields 600 kcal and feeds a fractional ration', () => {
  const game = new Game(73,'oni-base'), farm = game.buildings.find(b => b.type === 'farm'), room = game.cell(farm.x,farm.y);
  farm.growth = 0;
  const water = game.resources.water;
  Object.assign(room, {oxygen:0, co2:1, temp:20, water:0});
  game._growMealwood(farm, room, 600);
  close(farm.growth, 1/3, 'one cycle');
  close(game.resources.soil, 30, 'fertilizer');
  for (const disturbance of [{temp:31},{water:0.6},{hydrogen:2},{co2:0.1}]) {
    const prior = {...room};
    Object.assign(room, disturbance);
    game._growMealwood(farm, room, 600);
    close(farm.growth, 1/3, 'stunted plant');
    Object.assign(room, prior, {hydrogen:0});
  }
  game._growMealwood(farm, room, 1500);
  assert.equal(farm.growth, 1);
  close(game.resources.soil, 10, 'mature crop');
  assert.equal(game.resources.water, water);
  const crew = game.crew[0];
  game.resources.food = game.resources.meals = 0;
  game._assign(crew, 'harvest', [], {targetId:farm.id});
  game._crewStep(crew, 3);
  close(game.resources.food*1000, 600, 'actual inventory after harvest');
  assert.equal(farm.growth, 0);
  crew.hunger = 30;
  game._assign(crew, 'eat', []);
  game._crewStep(crew, 2);
  close(game.resources.food, 0, 'partial meal consumed');
  close((crew.hunger-30)*40+2*1000/600, 600, 'energy from harvested meal');
  game.resources.soil = 0.25;
  game._growMealwood(farm, room, 600);
  close(farm.growth, 15/1800, 'growth stops at fertilizer exhaustion');
});

test('room hydrogen rises and conserves mass, dilutes breathability and occupies outlet pressure', () => {
  const gas = () => ({solid:null, oxygen:0, co2:0, water:0, steam:0, frost:0, temp:22, hydrogen:0});
  const top = gas(), bottom = {...gas(), hydrogen:1};
  const chamber = {originalRules:true, waterKgPerCell:1000, w:1, h:2, cells:[top,bottom], time:0};
  for (let tick=0;tick<60;tick++) stepEnvironment(chamber, 0.2, 600);
  assert.ok(top.hydrogen>bottom.hydrogen*2, 'hydrogen collects at the ceiling');
  close(top.hydrogen+bottom.hydrogen, 1, 'hydrogen conservation');
  Object.assign(top,{oxygen:0.2,hydrogen:1.8});
  assert.equal(canBreathe(top), false);
  assert.equal(oxygenOutletSpace(top,true), 0);
  assert.equal(materialFor(top), ELEMENTS.Hydrogen);
});

test('a full water tile holds 1000 kg through boiling and condensation', () => {
  const cell = {solid:null,oxygen:0,co2:0,water:1,frost:0,steam:0,temp:130};
  const chamber = {originalRules:true,waterKgPerCell:1000,w:1,h:1,time:0,cells:[cell]};
  stepEnvironment(chamber, 0.2, 600);
  assert.equal(cell.steam, 1000);
  assert.equal(cell.water, 0);
  cell.temp = 70;
  stepEnvironment(chamber, 0.2, 600);
  assert.equal(cell.water, 1);
  assert.equal(cell.steam, 0);
});

test('new seed 73 reaches cycle two with three live crew using player construction and mining orders', () => {
  const game = new Game(73,'oni-base');
  for (const order of [['diffuser',26,11], ['battery',27,11], ['ladder',12,10], ['dig',11,9], ['diffuser',26,16], ['storage',29,11]]) {
    assert.ok(game.queue(...order).ok, order.join(' '));
  }
  for(let second=0;second<599;second++)game.step(1);
  assert.equal(game.cycle, 1);
  game.step(1);
  assert.equal(game.cycle, 2);
  assert.equal(game.stats.population, 3);
  assert.equal(game.stats.completedDigs, 1);
  assert.equal(game.tasks.length, 0);
  close(game.production.hauledItems, 100, 'half of one 200 kg algae tile');
  assert.ok(game.production.oxygenProduced*GAS_KG_PER_UNIT>100, 'two working diffusers');
  finiteState(game);
  const restored = new Game(73,'oni-base');
  restored.load(game.serialize());
  game.step(1);
  restored.step(1);
  close(restored.resources.soil, game.resources.soil, 'fertilizer after reloading');
  assert.equal(restored.stats.population, 3);
});

test('gas is picked up locally, travels along contiguous pipes and only hydrogen becomes generator fuel', () => {
  const game = new Game(73,'oni-base');
  const pump = game._addBuilding('gasPump', 29, 16), generator = game._addBuilding('hydrogenGen', 25, 16);
  const inlet = game.cell(pump.x, pump.y);
  Object.assign(inlet, {oxygen:0, co2:0, hydrogen:2});
  for (const x of [29,28,26,25]) assert.ok(game.queue('gaspipe', x, 16).ok);
  const stepNetwork = () => {
    pump.connected = pump.active = true;
    game._gasProcess(0.1);
  };
  for (let tick=0;tick<15;tick++) stepNetwork();
  assert.equal(game.hydrogenFuelAt(generator), 0, 'disconnected generator');
  close(2-inlet.hydrogen, game.storedHydrogenKg(), 'pump output conserved');
  assert.equal(game.queue('removeGasPipe', 29, 16).ok, false);
  const before = inlet.hydrogen;
  assert.ok(game.queue('gaspipe', 27, 16).ok);
  stepNetwork();
  assert.ok(before-inlet.hydrogen<=0.05+1e-8, '500 g/s intake bound');
  assert.equal(game.hydrogenFuelAt(generator), 0, 'no instantaneous remote delivery');
  for (let tick=0;tick<100;tick++) stepNetwork();
  close(game.hydrogenFuelAt(generator), 2, 'generator holds two kilograms');
  close(game.storedHydrogenKg()+inlet.hydrogen, 2, 'all original hydrogen accounted for');
  close(game.takeHydrogen(generator, 4), 2, 'cannot burn more than staged fuel');
  Object.assign(inlet, {oxygen:1/GAS_KG_PER_UNIT});
  for (let tick=0;tick<50;tick++) stepNetwork();
  assert.equal(game.hydrogenFuelAt(generator), 0);
  const trapped = game.cells.filter(c=>c.gasPacket?.element==='oxygen').reduce((sum,c)=>sum+c.gasPacket.mass,0);
  close(trapped+inlet.oxygen*GAS_KG_PER_UNIT, 1, 'wrong gas retained');

  const vent = game._addBuilding('gasVent', 27, 15);
  assert.ok(game.queue('gaspipe', vent.x, vent.y).ok);
  const outlet = game.cell(vent.x, vent.y), initial = outlet.oxygen;
  for (let tick=0;tick<120;tick++) stepNetwork();
  close((outlet.oxygen-initial)*GAS_KG_PER_UNIT, 1, 'oxygen arrived at the vent');
  assert.ok(game.queue('removeGasPipe', 29, 16).ok, 'empty line can be removed');
});

test('gas lines coexist with liquid and wire and persist mid-transfer; corrupt packets fail atomically', () => {
  const game = new Game(73,'oni-base'), cell = game.cell(27,11);
  assert.ok(cell.pipe && cell.wire);
  assert.ok(game.queue('gaspipe',27,11).ok);
  cell.gasPacket={element:'hydrogen',mass:.432,temp:71.25};
  const snapshot = game.serialize(), restored = new Game(73,'oni-base');
  assert.equal(restored.load(snapshot), true);
  const loaded = restored.cell(27,11);
  assert.ok(loaded.pipe && loaded.wire && loaded.gasPipe);
  assert.deepEqual(loaded.gasPacket, cell.gasPacket);
  const before = restored.serialize();
  for (const bad of [{mass:1.5},{element:'water'},{mass:-.4}]) {
    const corrupt = structuredClone(before);
    Object.assign(corrupt.cells[11*game.w+27].gasPacket,bad);
    assert.throws(()=>restored.load(corrupt));
    assert.deepEqual(restored.serialize(), before);
  }
  const legacy = new Game(73,'breath-4.1');
  for(const tool of ['gasPump','gasVent','gaspipe']) assert.equal(legacy.queue(tool,27,11).ok, false);
});

test('a fresh colony researches electrolysis and generates 2000 J from water via a ceiling gas pump', () => {
  const game = new Game(73,'oni-base');
  function orders(placements) {
    for (const [tool,x,y] of placements) {
      const result = game.queue(tool,x,y);
      assert.ok(result.ok, [tool,x,y,result.message].join(' '));
    }
  }
  orders([['research',25,11], ['diffuser',26,11], ['battery',27,11], ['storage',29,11],
    ['ladder',28,10], ['ladder',28,9], ['dig',11,11], ['dig',10,11]]);
  while (game.stats.research<35 && game.time<550 && !game.lost) game.step(1);
  assert.ok(game.stats.research>=35, 'crew researched the equipment');
  orders([['gasPump',28,8], ['gasVent',33,11], ['electrolyzer',28,11], ['hydrogenGen',32,11]]);
  orders([[28,8],[28,9],[28,10]].map(([x,y])=>['wire',x,y]));
  orders([[28,8],[29,8],[30,8],[31,8],[32,8],[33,8],[32,9],[32,10],[32,11],[33,9],[33,10],[33,11]]
    .map(([x,y])=>['gaspipe',x,y]));
  while (game.production.hydrogenEnergy<2000 && game.time<750 && !game.lost) game.step(1);
  assert.ok(game.production.hydrogenEnergy>=2000, 'electricity from staged hydrogen');
  assert.equal(game.stats.population,3);
  assert.equal(game.cell(28,11).gasPipe || false, false, 'no gas pipe on the electrolyzer');
  assert.equal(game.resources.hydrogen,0, 'global inventory did not supply fuel');
  close(game.production.hydrogenConsumed*8000, game.production.hydrogenEnergy, 'fuel energy');
  const roomMass = game.cells.reduce((total,c)=>total+(c.hydrogen||0),0);
  close(roomMass+game.storedHydrogenKg()+game.production.hydrogenConsumed,
    game.production.hydrogenProduced,'electrolyzer to atmosphere, pump, pipe and generator');
  finiteState(game);
  assert.equal(new Game(73,'oni-base').load(game.serialize()),true);
});

test('mined ore becomes loose mass and mined ice thaws locally', () => {
  const game = new Game(73,'oni-base');
  const cell = game.cell(10,11);
  assert.equal(cell.solid,'copper');
  assert.ok(game.queue('dig',10,11).ok);
  game._completeTask(game.tasks.at(-1));
  assert.equal(game.debris.find(p=>p.resource==='metal').amount,400);
  cell.solid='ice';
  cell.temp=-5;
  const stock = game.resources.water;
  assert.ok(game.queue('dig',10,11).ok);
  game._completeTask(game.tasks.at(-1));
  close(cell.frost*game.waterKgPerCell,500,'ice at the dig site');
  assert.equal(stock, game.resources.water);
  cell.temp=10;
  const chamber={originalRules:true,waterKgPerCell:1000,w:1,h:1,time:0,cells:[cell]};
  stepEnvironment(chamber,.2,600);
  close(cell.water*1000,500,'water remains recoverable by a pump');
  assert.equal(cell.frost,0);
});

test('a pipe crossing the electrolyzer receives no gas directly', () => {
  const game = new Game(73,'oni-base'), b=game._addBuilding('electrolyzer',28,11), cell=game.cell(28,11);
  assert.ok(game.queue('gaspipe',28,11).ok);
  close(game.emitHydrogen(b,.112,70),.112,'emitted hydrogen');
  close(cell.hydrogen,.112,'hydrogen in room');
  assert.equal(cell.gasPacket,null);
  const pump=game._addBuilding('gasPump',28,8);
  assert.ok(game._utilityReady(pump,.1),'unconnected pump is idle');
});

test('a charged original battery loses one kJ per cycle on an idle circuit', () => {
  const game=new Game(73,'oni-base');
  const battery=game._addBuilding('battery',27,11);
  battery.charge=battery.capacity;
  assert.equal(battery.capacity,10000);
  for(let t=0;t<600;t++)game._buildingStep(1);
  close(battery.charge,9000,'one cycle of idle leakage');
  battery.charge=0.1;
  game._buildingStep(1);
  assert.equal(battery.charge,0);
});

test('coal exhaust continues in a pressurized cell that has already stopped oxygen production', () => {
  const game=new Game(73,'oni-base'), coal=game._addBuilding('coalgen',27,11), cell=game.cell(coal.x,coal.y);
  Object.assign(cell,{co2:10,oxygen:0,temp:115});
  game._buildingStep(1);
  assert.equal(game.power.production,600);
  close((cell.co2-10)*GAS_KG_PER_UNIT,0.02,'coal exhaust');
  close(cell.temp,115,'the minimum exhaust temperature does not cool a hot body');
  assert.equal(oxygenOutletSpace(cell,true),0);
  const save=game.serialize();
  assert.equal(new Game(73,'oni-base').load(save),true);
});
