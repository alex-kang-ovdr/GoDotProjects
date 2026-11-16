(() => {
  // dist/economy-data.js?v=4.0.0
  var EXTRA_RESOURCE_LABELS = Object.freeze({ silver: "\uC740\uD654", rifle: "\uAC1C\uB7C9 \uC18C\uCD1D", armor: "\uBC29\uD0C4 \uC870\uB07C", tool: "\uC791\uC5C5 \uB3C4\uAD6C" });
  var RECIPES = Object.freeze({
    tool: Object.freeze({ label: "\uC791\uC5C5 \uB3C4\uAD6C", output: "tool", count: 1, cost: Object.freeze({ steel: 8, wood: 4 }), work: 10, description: "\uAC74\uC124\xB7\uC218\uB9AC\xB7\uB18D\uC0AC\xB7\uCC44\uC9D1\xB7\uCC44\uAD11\xB7\uC81C\uC791 \uC18D\uB3C4 +25%" }),
    armor: Object.freeze({ label: "\uBC29\uD0C4 \uC870\uB07C", output: "armor", count: 1, cost: Object.freeze({ steel: 16 }), work: 15, description: "\uCD1D\uD0C4 \uD53C\uD574\uC640 \uCD1D\uC0C1 \uCD9C\uD608 \uC99D\uAC00\uB7C9 \u221235%" }),
    rifle: Object.freeze({ label: "\uAC1C\uB7C9 \uC18C\uCD1D", output: "rifle", count: 1, cost: Object.freeze({ steel: 18, wood: 8 }), work: 18, description: "\uC0AC\uAC70\uB9AC 9\uCE78 \xB7 \uD53C\uD574 +35% \xB7 \uBA85\uC911\uB960 +4%p" })
  });
  var EQUIPMENT = Object.freeze({
    rifle: Object.freeze({ label: "\uAC1C\uB7C9 \uC18C\uCD1D", slot: "weapon", range: 9, damage: 1.35, accuracy: 0.04, cooldown: 1.2, description: "\uAE30\uBCF8 \uC0AC\uAC70\uB9AC 7.5 \u2192 9\uCE78, \uD53C\uD574 \xD71.35, \uBA85\uC911\uB960 +4%p, \uC9D5\uC9D1 \uC0AC\uACA9 \uAC04\uACA9 1.2\uCD08" }),
    armor: Object.freeze({ label: "\uBC29\uD0C4 \uC870\uB07C", slot: "armor", damageTaken: 0.65, description: "\uCD1D\uD0C4 \uD53C\uD574\uC640 \uCD1D\uC0C1 \uCD9C\uD608 \uC99D\uAC00\uB7C9 \xD70.65. \uD654\uC7AC\xB7\uAD76\uC8FC\uB9BC\xB7\uC628\uB3C4 \uD53C\uD574\uB294 \uADF8\uB300\uB85C\uC785\uB2C8\uB2E4." }),
    tool: Object.freeze({ label: "\uC791\uC5C5 \uB3C4\uAD6C", slot: "tool", workSpeed: 1.25, description: "\uAC74\uC124\xB7\uC218\uB9AC\xB7\uB18D\uC0AC\xB7\uCC44\uC9D1\xB7\uCC44\uAD11\xB7\uC81C\uC791\uC758 \uC2E4\uC81C \uC791\uC5C5 \uC18D\uB3C4 \xD71.25. \uC774\uB3D9\xB7\uC5F0\uAD6C\xB7\uC758\uB8CC\uC5D0\uB294 \uC801\uC6A9\uD558\uC9C0 \uC54A\uC2B5\uB2C8\uB2E4." })
  });
  var TRADE_PRICES = Object.freeze({
    wood: Object.freeze({ buy: 2, sell: 1 }),
    steel: Object.freeze({ buy: 5, sell: 3 }),
    rawfood: Object.freeze({ buy: 3, sell: null }),
    meals: Object.freeze({ buy: 8, sell: null }),
    medicine: Object.freeze({ buy: 18, sell: 10 }),
    tool: Object.freeze({ buy: 55, sell: 34 }),
    armor: Object.freeze({ buy: 80, sell: 55 }),
    rifle: Object.freeze({ buy: 100, sell: 72 })
  });

  // dist/colony-systems.js?v=4.0.0
  var SYSTEM_BUILDINGS = Object.freeze({
    solar: { label: "\uD0DC\uC591\uAD11 \uBC1C\uC804\uAE30", cost: { steel: 20, wood: 8 }, work: 10, hp: 120, tech: "electricity" },
    battery: { label: "\uCD95\uC804\uC9C0", cost: { steel: 16, wood: 5 }, work: 8, hp: 100, tech: "electricity" },
    conduit: { label: "\uC804\uB825\uC120", cost: { steel: 1 }, work: 1, hp: 40, tech: "electricity" },
    cooler: { label: "\uB0C9\uAC01\uAE30", cost: { steel: 18, wood: 6 }, work: 9, hp: 100, tech: "refrigeration" },
    heater: { label: "\uB09C\uBC29\uAE30", cost: { steel: 10, wood: 5 }, work: 7, hp: 100, tech: "electricity" }
  });
  var BATTERY_CAPACITY = 18e3;
  var SOLAR_PEAK = 600;
  var MAX_ROOM_AREA = 120;
  var PERIOD = 0.5;
  var DAY = 120;
  var FOOD_LIFE = Object.freeze({ rawfood: 360, meals: 240 });
  var CONSUMPTION = Object.freeze({ cooler: 120, heater: 100, beacon: 240 });
  var CONSUMER_PRIORITY = Object.freeze({ cooler: 0, heater: 1, beacon: 2 });
  var CONDUCTORS = /* @__PURE__ */ new Set(["solar", "battery", "conduit"]);
  var RESOURCES = /* @__PURE__ */ new Set(["wood", "steel", "rawfood", "meals", "medicine", ...Object.keys(EXTRA_RESOURCE_LABELS)]);
  var clamp = (value, lo, hi) => Math.max(lo, Math.min(hi, value));
  var finite = (value, fallback = 0) => Number.isFinite(value) ? value : fallback;
  var record = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
  var isFood = (type) => Object.hasOwn(FOOD_LIFE, type);
  var complete = (building) => Boolean(building?.complete && finite(building.hp, 1) > 0);
  var isBoundary = (tile) => complete(tile?.building) && ["wall", "door"].includes(tile.building.type);
  function tileAt(s, x, y) {
    x = Math.floor(x);
    y = Math.floor(y);
    return x >= 0 && y >= 0 && x < s.width && y < s.height ? s.tiles[y * s.width + x] || null : null;
  }
  function neighbours(index, width, height) {
    const x = index % width, y = Math.floor(index / width), result = [];
    if (y > 0) result.push(index - width);
    if (x + 1 < width) result.push(index + 1);
    if (y + 1 < height) result.push(index + width);
    if (x > 0) result.push(index - 1);
    return result;
  }
  function outsideTemperature(state) {
    const hour = ((8 + finite(state?.time) / DAY * 24) % 24 + 24) % 24;
    const baseline = state?.weather === "heat" ? 32 : state?.weather === "rain" ? 17 : 22;
    return baseline + Math.sin(hour / 24 * Math.PI * 2 - 1.6) * 5;
  }
  function solarGeneration(state) {
    const hour = ((8 + finite(state.time) / DAY * 24) % 24 + 24) % 24;
    if (hour <= 6 || hour >= 18) return 0;
    const weather = state.weather === "rain" ? 0.45 : state.weather === "heat" ? 0.9 : 1;
    return SOLAR_PEAK * Math.sin((hour - 6) / 12 * Math.PI) * weather;
  }
  function defaultStockCell(state) {
    const depot = state.tiles.find((tile) => tile?.zone === "stockpile" && tile.terrain !== "water" && !isBoundary(tile));
    if (depot) return { x: depot.x, y: depot.y };
    const land = state.tiles.find((tile) => tile && tile.terrain !== "water" && !isBoundary(tile));
    return land ? { x: land.x, y: land.y } : { x: 0, y: 0 };
  }
  function stockCell(state, x, y) {
    return Number.isFinite(x) && Number.isFinite(y) ? { x: clamp(Math.floor(x), 0, state.width - 1), y: clamp(Math.floor(y), 0, state.height - 1) } : defaultStockCell(state);
  }
  function initializeSystems(game2, { migration = false } = {}) {
    const s = game2.state;
    const missingDerived = !Array.isArray(s.rooms) || !record(s.power) || s.tiles.some((tile) => tile.roomId === void 0 || tile.roofed === void 0 || tile.temperature === void 0);
    const outside = outsideTemperature(s);
    if (!Array.isArray(s.rooms)) s.rooms = [];
    if (!record(s.power)) s.power = { generation: 0, demand: 0, servedDemand: 0, stored: 0, capacity: 0, networks: [] };
    if (!record(s.foodBatches)) s.foodBatches = {};
    for (const type of Object.keys(FOOD_LIFE)) {
      if (!Array.isArray(s.foodBatches[type])) {
        const count = Math.max(0, Math.floor(finite(s.resources[type])));
        const position = defaultStockCell(s);
        s.foodBatches[type] = count ? [{ count, freshness: 1, ...position }] : [];
      }
    }
    if (!record(s.systemStats)) s.systemStats = { spoiled: 0 };
    if (s.systemStats.spoiled === void 0) s.systemStats.spoiled = 0;
    for (const tile of s.tiles) {
      if (tile.roomId === void 0) tile.roomId = null;
      if (tile.roofed === void 0) tile.roofed = false;
      if (tile.temperature === void 0) tile.temperature = outside;
      if (tile.building) {
        if (tile.building.powered === void 0) tile.building.powered = false;
        if (tile.building.networkId === void 0) tile.building.networkId = null;
        if (tile.building.type === "battery" && tile.building.charge === void 0) tile.building.charge = 0;
      }
    }
    for (const item of s.items || []) if (isFood(item.type) && item.freshness === void 0) item.freshness = 1;
    for (const colonist of s.colonists || []) {
      if (colonist.ambientTemperature === void 0) colonist.ambientTemperature = outside;
      if (colonist.sheltered === void 0) colonist.sheltered = false;
      if (colonist.thermalStress === void 0) colonist.thermalStress = 0;
      if (isFood(colonist.carry?.type) && colonist.carry.freshness === void 0) colonist.carry.freshness = 1;
    }
    if (migration || missingDerived) refreshSystems(game2);
  }
  function buildRooms(state) {
    const { tiles, width, height } = state;
    const oldRooms = new Map((state.rooms || []).map((room) => [room.id, room]));
    const outside = outsideTemperature(state);
    const visited = new Uint8Array(tiles.length);
    const queue = new Int32Array(tiles.length);
    const regions = [];
    for (const tile of tiles) {
      tile.roomId = null;
      tile.roofed = false;
      if (!Number.isFinite(tile.temperature)) tile.temperature = outside;
    }
    for (let start = 0; start < tiles.length; start++) {
      if (visited[start] || !tiles[start] || isBoundary(tiles[start])) continue;
      const members = [];
      let head = 0, tail = 0, exposed = false, perimeter = 0;
      queue[tail++] = start;
      visited[start] = 1;
      while (head < tail) {
        const index = queue[head++], tile = tiles[index];
        members.push(index);
        const x = index % width, y = Math.floor(index / width);
        if (x === 0 || y === 0 || x === width - 1 || y === height - 1 || tile.terrain === "water") exposed = true;
        for (const next of neighbours(index, width, height)) {
          if (!tiles[next]) {
            exposed = true;
            continue;
          }
          if (isBoundary(tiles[next])) {
            perimeter++;
            continue;
          }
          if (visited[next]) continue;
          visited[next] = 1;
          queue[tail++] = next;
        }
      }
      if (exposed || !members.length || members.length > MAX_ROOM_AREA) continue;
      members.sort((a, b) => a - b);
      const id = members[0], previous = oldRooms.get(id);
      const unchanged = previous && previous.tiles.length === members.length && previous.tiles.every((index, i) => index === members[i]);
      const temperature = unchanged && Number.isFinite(previous.temperature) ? previous.temperature : members.reduce((total, index) => total + finite(tiles[index].temperature, outside), 0) / members.length;
      const room = { id, tiles: members, area: members.length, temperature, beds: 0, stockpileTiles: 0 };
      for (const index of members) {
        const tile = tiles[index];
        tile.roomId = id;
        tile.roofed = true;
        tile.temperature = temperature;
        if (complete(tile.building) && tile.building.type === "bed") room.beds++;
        if (tile.zone === "stockpile") room.stockpileTiles++;
      }
      regions.push({ room, perimeter });
    }
    regions.sort((a, b) => a.room.id - b.room.id);
    state.rooms = regions.map((region) => region.room);
    return regions;
  }
  function buildPowerTopology(state) {
    const { tiles, width, height } = state;
    const conductor = new Uint8Array(tiles.length), visited = new Uint8Array(tiles.length);
    const nodeNetworks = new Int32Array(tiles.length);
    nodeNetworks.fill(-1);
    const networks = [], consumers = [];
    for (let i = 0; i < tiles.length; i++) {
      const building = tiles[i]?.building;
      if (!building) continue;
      building.powered = false;
      building.networkId = null;
      if (building.type === "battery" && building.charge === void 0) building.charge = 0;
      if (!complete(building)) continue;
      if (CONDUCTORS.has(building.type)) conductor[i] = 1;
      else if (Object.hasOwn(CONSUMPTION, building.type)) consumers.push({ index: i, tile: tiles[i], building });
    }
    for (let start = 0; start < tiles.length; start++) {
      if (!conductor[start] || visited[start]) continue;
      const queue = [start], nodes = [];
      visited[start] = 1;
      for (let head = 0; head < queue.length; head++) {
        const index = queue[head];
        nodes.push(index);
        for (const next of neighbours(index, width, height)) if (conductor[next] && !visited[next]) {
          visited[next] = 1;
          queue.push(next);
        }
      }
      nodes.sort((a, b) => a - b);
      const network = { id: nodes[0], nodes, batteries: [], solar: [], consumers: [] };
      const ordinal = networks.length;
      for (const index of nodes) {
        const building = tiles[index].building;
        building.networkId = network.id;
        nodeNetworks[index] = ordinal;
        if (building.type === "battery") network.batteries.push(building);
        if (building.type === "solar") network.solar.push(building);
      }
      networks.push(network);
    }
    for (const consumer of consumers) {
      const x = consumer.index % width, y = Math.floor(consumer.index / width);
      let nearest = -1;
      for (let radius = 1; radius <= 3 && nearest < 0; radius++) {
        for (let dx = -radius; dx <= radius; dx++) {
          const dy = radius - Math.abs(dx);
          for (const signedY of dy === 0 ? [0] : [-dy, dy]) {
            const nx = x + dx, ny = y + signedY;
            if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
            const index = ny * width + nx;
            if (conductor[index] && (nearest < 0 || index < nearest)) nearest = index;
          }
        }
      }
      if (nearest >= 0) {
        const network = networks[nodeNetworks[nearest]];
        consumer.building.networkId = network.id;
        network.consumers.push(consumer);
      }
    }
    for (const network of networks) network.consumers.sort((a, b) => CONSUMER_PRIORITY[a.building.type] - CONSUMER_PRIORITY[b.building.type] || a.index - b.index);
    return { networks, consumers };
  }
  function distributePower(state, topology, dt, advance) {
    const output = { generation: 0, demand: 0, servedDemand: 0, stored: 0, capacity: 0, networks: [] };
    for (const consumer of topology.consumers) {
      output.demand += CONSUMPTION[consumer.building.type];
      consumer.building.powered = false;
    }
    const solarOutput = solarGeneration(state);
    for (const network of topology.networks) {
      const generation = network.solar.length * solarOutput;
      const capacity = network.batteries.length * BATTERY_CAPACITY;
      const storedBefore = network.batteries.reduce((n, battery) => n + finite(battery.charge), 0);
      const demand = network.consumers.reduce((n, consumer) => n + CONSUMPTION[consumer.building.type], 0);
      let available = generation + storedBefore / Math.max(1e-6, dt), servedDemand = 0;
      for (const consumer of network.consumers) {
        const watts = CONSUMPTION[consumer.building.type];
        if (available + 1e-9 < watts) continue;
        consumer.building.powered = true;
        available -= watts;
        servedDemand += watts;
      }
      if (advance) {
        let delta = (generation - servedDemand) * dt;
        for (const battery of network.batteries) {
          if (delta >= 0) {
            const charge = Math.min(delta, Math.max(0, BATTERY_CAPACITY - battery.charge));
            battery.charge += charge;
            delta -= charge;
          } else {
            const discharge = Math.min(-delta, battery.charge);
            battery.charge -= discharge;
            delta += discharge;
          }
          if (Math.abs(battery.charge) < 1e-9) battery.charge = 0;
          battery.charge = clamp(battery.charge, 0, BATTERY_CAPACITY);
        }
      }
      const stored = network.batteries.reduce((n, battery) => n + finite(battery.charge), 0);
      const energised = generation > 1e-9 || stored > 1e-9 || servedDemand > 0;
      for (const index of network.nodes) {
        const building = state.tiles[index].building;
        building.powered = building.type === "solar" ? solarOutput > 1e-9 : energised;
      }
      output.networks.push({ id: network.id, generation, demand, servedDemand, stored, capacity });
      output.generation += generation;
      output.servedDemand += servedDemand;
      output.stored += stored;
      output.capacity += capacity;
    }
    state.power = output;
  }
  function updateAmbientFields(state) {
    const outside = outsideTemperature(state);
    for (const colonist of state.colonists || []) {
      const tile = tileAt(state, colonist.x, colonist.y);
      colonist.ambientTemperature = finite(tile?.temperature, outside);
      colonist.sheltered = Boolean(tile?.roofed);
      colonist.thermalStress = clamp(Math.max(0, 8 - colonist.ambientTemperature) * 3 + Math.max(0, colonist.ambientTemperature - 30) * 4, 0, 100);
    }
  }
  function refreshSystems(game2) {
    const s = game2.state;
    buildRooms(s);
    const topology = buildPowerTopology(s);
    distributePower(s, topology, PERIOD, false);
    updateAmbientFields(s);
  }
  function advanceTemperature(state, regions, dt) {
    const outside = outsideTemperature(state), outdoorDecay = Math.exp(-dt / 3);
    for (const tile of state.tiles) if (tile.roomId === null) tile.temperature = clamp(outside + (tile.temperature - outside) * outdoorDecay + clamp(finite(tile.fire), 0, 1) * 7 * dt, -100, 150);
    for (const { room, perimeter } of regions) {
      const heatCapacity = room.area * 12 + 120;
      const heatLeak = perimeter * 0.1 + room.area * 0.02;
      const passive = outside + (room.temperature - outside) * Math.exp(-heatLeak / heatCapacity * dt);
      let coolers = 0, heaters = 0, fireHeat = 0;
      for (const index of room.tiles) {
        fireHeat += clamp(finite(state.tiles[index].fire), 0, 1) * 1400;
        const building = state.tiles[index].building;
        if (!complete(building) || !building.powered) continue;
        if (building.type === "cooler") coolers++;
        if (building.type === "heater") heaters++;
      }
      const heated = passive + fireHeat * dt / heatCapacity;
      const cooling = Math.min(Math.max(0, heated), coolers * 360 * dt / heatCapacity);
      const heating = Math.min(Math.max(0, 21 - heated), heaters * 220 * dt / heatCapacity);
      room.temperature = clamp(heated - cooling + heating, -100, 150);
      for (const index of room.tiles) state.tiles[index].temperature = room.temperature;
    }
  }
  function decayRate(temperature) {
    if (temperature <= 0) return 0;
    if (temperature <= 8) return 0.15;
    if (temperature <= 20) return 0.15 + (temperature - 8) / 12 * 0.85;
    return Math.min(5, 1 + (temperature - 20) / 18);
  }
  function batchTemperature(state, batch) {
    return finite(tileAt(state, batch.x, batch.y)?.temperature, outsideTemperature(state));
  }
  function removeOldest(batches, count) {
    const order = batches.map((batch, index) => ({ batch, index })).sort((a, b) => a.batch.freshness - b.batch.freshness || a.index - b.index);
    let remaining = count, freshness = 1;
    for (const { batch } of order) {
      if (remaining <= 0) break;
      const taken = Math.min(remaining, batch.count);
      if (taken > 0) freshness = Math.min(freshness, batch.freshness);
      batch.count -= taken;
      remaining -= taken;
    }
    return freshness;
  }
  function reconcileStock(state) {
    for (const type of Object.keys(FOOD_LIFE)) {
      const batches = state.foodBatches[type];
      const expected = Math.max(0, Math.floor(finite(state.resources[type])));
      const actual = batches.reduce((sum, batch) => sum + batch.count, 0);
      if (expected > actual) batches.push({ count: expected - actual, freshness: 1, ...defaultStockCell(state) });
      else if (expected < actual) removeOldest(batches, actual - expected);
      state.foodBatches[type] = batches.filter((batch) => batch.count > 0);
    }
  }
  function depositStock(game2, type, count, x, y, freshness = 1) {
    if (!RESOURCES.has(type) || !Number.isInteger(count) || count < 0 || !Number.isFinite(freshness) || freshness < 0 || freshness > 1) return { ok: false };
    const s = game2.state;
    if (!record(s.foodBatches)) initializeSystems(game2);
    if (!count) return { ok: true, freshness };
    if (isFood(type)) {
      reconcileStock(s);
      const position = stockCell(s, x, y);
      const match = s.foodBatches[type].find((batch) => batch.x === position.x && batch.y === position.y && batch.freshness === freshness);
      if (match) match.count += count;
      else s.foodBatches[type].push({ count, freshness, ...position });
    }
    s.resources[type] = finite(s.resources[type]) + count;
    return { ok: true, freshness };
  }
  function withdrawStock(game2, type, count) {
    if (!RESOURCES.has(type) || !Number.isInteger(count) || count < 0) return { ok: false, freshness: 1 };
    const s = game2.state;
    if (!record(s.foodBatches)) initializeSystems(game2);
    if (isFood(type)) reconcileStock(s);
    if (finite(s.resources[type]) < count) return { ok: false, freshness: 1 };
    let freshness = 1;
    if (count && isFood(type)) {
      freshness = removeOldest(s.foodBatches[type], count);
      s.foodBatches[type] = s.foodBatches[type].filter((batch) => batch.count > 0);
    }
    s.resources[type] -= count;
    return { ok: true, freshness };
  }
  function abandonSpoiledWork(game2, colonist) {
    if (typeof game2._releaseJob === "function") game2._releaseJob(colonist, false);
    else colonist.carry = null;
    colonist.status = "\uC74C\uC2DD\uC774 \uC0C1\uD574 \uC791\uC5C5 \uC7AC\uACC4\uD68D";
    colonist.thinkAt = finite(game2.state.time);
  }
  function advanceFood(game2, dt) {
    const s = game2.state;
    let spoiled = 0;
    for (const type of Object.keys(FOOD_LIFE)) {
      const batches = s.foodBatches[type];
      for (const batch of batches) {
        batch.freshness = Math.max(0, batch.freshness - dt * decayRate(batchTemperature(s, batch)) / FOOD_LIFE[type]);
        if (batch.freshness <= 1e-12) {
          spoiled += batch.count;
          s.resources[type] -= batch.count;
          batch.count = 0;
        }
      }
      s.foodBatches[type] = batches.filter((batch) => batch.count > 0);
    }
    const remainingItems = [];
    for (const item of s.items || []) {
      if (!isFood(item.type)) {
        remainingItems.push(item);
        continue;
      }
      item.freshness = Math.max(0, finite(item.freshness, 1) - dt * decayRate(batchTemperature(s, item)) / FOOD_LIFE[item.type]);
      if (item.freshness > 1e-12) {
        remainingItems.push(item);
        continue;
      }
      spoiled += item.count;
      if (item.reservedBy) {
        const owner = (s.colonists || []).find((c) => c.id === item.reservedBy && c.job?.targetId === item.id);
        if (owner) abandonSpoiledWork(game2, owner);
      }
      if (s.reservations) delete s.reservations[`item:${item.id}`];
    }
    s.items = remainingItems;
    for (const colonist of s.colonists || []) {
      const carry = colonist.carry;
      if (!carry || !isFood(carry.type)) continue;
      const temperature = finite(tileAt(s, colonist.x, colonist.y)?.temperature, outsideTemperature(s));
      carry.freshness = Math.max(0, finite(carry.freshness, 1) - dt * decayRate(temperature) / FOOD_LIFE[carry.type]);
      if (carry.freshness <= 1e-12) {
        spoiled += carry.count;
        abandonSpoiledWork(game2, colonist);
      }
    }
    return spoiled;
  }
  function updateSystems(game2, dt) {
    if (!Number.isFinite(dt) || dt <= 0) return;
    const s = game2.state;
    if (!record(s.foodBatches) || !Array.isArray(s.rooms) || !record(s.systemStats)) initializeSystems(game2);
    reconcileStock(s);
    const regions = buildRooms(s), topology = buildPowerTopology(s);
    let remaining = dt, spoiled = 0;
    while (remaining > 1e-9) {
      const step = Math.min(PERIOD, remaining);
      distributePower(s, topology, step, true);
      advanceTemperature(s, regions, step);
      spoiled += advanceFood(game2, step);
      remaining -= step;
    }
    updateAmbientFields(s);
    if (spoiled > 0) {
      s.systemStats.spoiled += spoiled;
      if (!record(s.lastAlerts)) s.lastAlerts = {};
      if (typeof game2._log === "function" && finite(s.time) - finite(s.lastAlerts.spoilage, -100) >= 20) {
        s.lastAlerts.spoilage = finite(s.time);
        game2._log("warning", "\uC74C\uC2DD\uC774 \uC0C1\uD588\uC2B5\uB2C8\uB2E4", `${spoiled}\uAC1C\uC758 \uC74C\uC2DD\uC774 \uBD80\uD328\uD588\uC2B5\uB2C8\uB2E4. \uBC00\uD3D0\uB41C \uCC3D\uACE0\uC640 \uC804\uC6D0\uC774 \uC5F0\uACB0\uB41C \uB0C9\uAC01\uAE30\uB97C \uD655\uC778\uD558\uC138\uC694.`);
      }
    }
  }
  function validateSystems(data, bad) {
    const fail = (label) => {
      bad(label);
      throw new Error(`Invalid system state: ${label}`);
    };
    const num = (value, min, max, label) => {
      if (!Number.isFinite(value) || value < min || value > max) fail(label);
    };
    const integer = (value, min, max, label) => {
      if (!Number.isInteger(value)) fail(label);
      num(value, min, max, label);
    };
    const boolean = (value, label) => {
      if (typeof value !== "boolean") fail(label);
    };
    if (!record(data) || !Array.isArray(data.tiles)) fail("\uC2DC\uC2A4\uD15C \uC9C0\uB3C4");
    const count = data.tiles.length, roomIds = /* @__PURE__ */ new Set(), networkIds = /* @__PURE__ */ new Set(), memberships = /* @__PURE__ */ new Map();
    if (!Array.isArray(data.rooms) || data.rooms.length > count) fail("\uBC29 \uBAA9\uB85D");
    let previousRoomId = -1;
    for (const room of data.rooms) {
      if (!record(room) || !Array.isArray(room.tiles)) fail("\uBC29 \uC0C1\uD0DC");
      integer(room.id, 0, count - 1, "\uBC29 ID");
      if (room.id <= previousRoomId || roomIds.has(room.id)) fail("\uBC29 ID \uC21C\uC11C");
      previousRoomId = room.id;
      roomIds.add(room.id);
      integer(room.area, 1, MAX_ROOM_AREA, "\uBC29 \uBA74\uC801");
      if (room.tiles.length !== room.area) fail("\uBC29 \uD0C0\uC77C \uC218");
      num(room.temperature, -100, 150, "\uC2E4\uB0B4 \uC628\uB3C4");
      integer(room.beds, 0, room.area, "\uC2E4\uB0B4 \uCE68\uC0C1");
      integer(room.stockpileTiles, 0, room.area, "\uC2E4\uB0B4 \uCC3D\uACE0");
      let previous = -1;
      for (const index of room.tiles) {
        integer(index, 0, count - 1, "\uBC29 \uD0C0\uC77C");
        if (index <= previous || memberships.has(index)) fail("\uC911\uBCF5 \uBC29 \uD0C0\uC77C");
        previous = index;
        memberships.set(index, room.id);
      }
      if (room.id !== room.tiles[0]) fail("\uBC29 ID \uCC38\uC870");
    }
    const power = data.power;
    if (!record(power) || !Array.isArray(power.networks) || power.networks.length > count) fail("\uC804\uB825 \uC0C1\uD0DC");
    const powerFields = ["generation", "demand", "servedDemand", "stored", "capacity"];
    for (const key of powerFields) num(power[key], 0, 1e12, `\uC804\uB825 ${key}`);
    if (power.stored > power.capacity + 1e-6 || power.servedDemand > power.demand + 1e-6) fail("\uC804\uB825 \uC218\uC9C0");
    const sums = { generation: 0, demand: 0, servedDemand: 0, stored: 0, capacity: 0 };
    let previousNetworkId = -1;
    for (const network of power.networks) {
      if (!record(network)) fail("\uC804\uB825\uB9DD");
      integer(network.id, 0, count - 1, "\uC804\uB825\uB9DD ID");
      if (network.id <= previousNetworkId || networkIds.has(network.id)) fail("\uC804\uB825\uB9DD ID \uC21C\uC11C");
      previousNetworkId = network.id;
      networkIds.add(network.id);
      for (const key of powerFields) {
        num(network[key], 0, 1e12, `\uC804\uB825\uB9DD ${key}`);
        sums[key] += network[key];
      }
      if (network.stored > network.capacity + 1e-6 || network.servedDemand > network.demand + 1e-6) fail("\uC804\uB825\uB9DD \uC218\uC9C0");
    }
    for (const key of ["generation", "servedDemand", "stored", "capacity"]) if (Math.abs(sums[key] - power[key]) > 1e-5) fail("\uC804\uB825\uB9DD \uD569\uACC4");
    if (sums.demand > power.demand + 1e-5) fail("\uBBF8\uC5F0\uACB0 \uC804\uB825 \uC218\uC694");
    for (let index = 0; index < count; index++) {
      const tile = data.tiles[index];
      if (!record(tile)) fail("\uC2DC\uC2A4\uD15C \uD0C0\uC77C");
      num(tile.temperature, -100, 150, "\uD0C0\uC77C \uC628\uB3C4");
      boolean(tile.roofed, "\uC9C0\uBD95 \uC0C1\uD0DC");
      if (tile.roomId !== null && (!Number.isInteger(tile.roomId) || !roomIds.has(tile.roomId))) fail("\uBC29 \uCC38\uC870");
      const expected = memberships.get(index) ?? null;
      if (tile.roomId !== expected || tile.roofed !== (expected !== null)) fail("\uBC29\xB7\uC9C0\uBD95 \uD0C0\uC77C \uBD88\uC77C\uCE58");
      if (tile.building) {
        const building = tile.building;
        boolean(building.powered, "\uAC74\uBB3C \uC804\uB825");
        if (building.networkId !== null && (!Number.isInteger(building.networkId) || !networkIds.has(building.networkId))) fail("\uAC74\uBB3C \uC804\uB825\uB9DD \uCC38\uC870");
        if (building.type === "battery") num(building.charge, 0, BATTERY_CAPACITY, "\uBC30\uD130\uB9AC \uCDA9\uC804\uB7C9");
      }
    }
    if (!record(data.foodBatches) || !record(data.resources)) fail("\uC2DD\uB7C9 \uBB36\uC74C");
    for (const type of Object.keys(FOOD_LIFE)) {
      const batches = data.foodBatches[type];
      if (!Array.isArray(batches) || batches.length > 1e4) fail("\uC2DD\uB7C9 \uBB36\uC74C \uBAA9\uB85D");
      let total = 0;
      for (const batch of batches) {
        if (!record(batch)) fail("\uC2DD\uB7C9 \uBB36\uC74C \uC0C1\uD0DC");
        integer(batch.count, 1, 1e8, "\uC2DD\uB7C9 \uBB36\uC74C \uC218\uB7C9");
        num(batch.freshness, 0, 1, "\uC2DD\uB7C9 \uC2E0\uC120\uB3C4");
        integer(batch.x, 0, data.width - 1, "\uC2DD\uB7C9 \uBCF4\uAD00 x");
        integer(batch.y, 0, data.height - 1, "\uC2DD\uB7C9 \uBCF4\uAD00 y");
        total += batch.count;
      }
      if (total !== data.resources[type]) fail("\uC2DD\uB7C9 \uC7AC\uACE0\uC640 \uBB36\uC74C \uD569\uACC4");
    }
    if (!record(data.systemStats)) fail("\uC2DC\uC2A4\uD15C \uD1B5\uACC4");
    integer(data.systemStats.spoiled, 0, 1e12, "\uBD80\uD328 \uD1B5\uACC4");
    for (const item of data.items || []) if (isFood(item.type) || item.freshness !== void 0) num(item.freshness, 0, 1, "\uBB3C\uD488 \uC2E0\uC120\uB3C4");
    for (const colonist of data.colonists || []) {
      num(colonist.ambientTemperature, -100, 150, "\uC8FC\uBBFC \uCCB4\uAC10 \uC628\uB3C4");
      boolean(colonist.sheltered, "\uC8FC\uBBFC \uC2E4\uB0B4 \uC0C1\uD0DC");
      num(colonist.thermalStress, 0, 100, "\uC8FC\uBBFC \uC628\uB3C4 \uBD80\uB2F4");
      if (colonist.carry && (isFood(colonist.carry.type) || colonist.carry.freshness !== void 0)) num(colonist.carry.freshness, 0, 1, "\uC6B4\uBC18 \uC74C\uC2DD \uC2E0\uC120\uB3C4");
    }
    return true;
  }

  // dist/hazards.js?v=4.0.0
  var PERIOD2 = 0.5;
  var SPREAD_PERIOD = 3;
  var MAX_FIRES = 32;
  var MAX_SPREAD_PER_CYCLE = 4;
  var DIRS = [[0, -1], [1, 0], [0, 1], [-1, 0]];
  var STRUCTURE_FUEL = Object.freeze({
    wall: 100,
    door: 85,
    bed: 70,
    stove: 65,
    sandbag: 105,
    researchbench: 80,
    horseshoes: 60,
    beacon: 130,
    solar: 75,
    battery: 65,
    cooler: 65,
    heater: 65,
    conduit: 20
  });
  var clamp2 = (value, min, max) => Math.max(min, Math.min(max, value));
  var finite2 = (value, fallback = 0) => Number.isFinite(value) ? value : fallback;
  var record2 = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
  var random = (game2) => typeof game2._rand === "function" ? game2._rand() : 0.5;
  function tileAt2(state, x, y) {
    if (!Number.isInteger(x) || !Number.isInteger(y) || x < 0 || y < 0 || x >= state.width || y >= state.height) return null;
    return state.tiles[y * state.width + x] || null;
  }
  function fuelFor(tile) {
    if (!tile || tile.terrain === "water" || tile.building && !tile.building.complete) return 0;
    let fuel = 0;
    if (!tile.burned && tile.terrain === "grass") fuel += 10;
    if (tile.feature === "tree" && tile.amount > 0) fuel += 48 + Math.min(24, tile.amount);
    if (tile.feature === "berry" && tile.amount > 0) fuel += 25;
    if (tile.crop) fuel += 18;
    if (tile.building?.complete && finite2(tile.building.hp) > 0) fuel += STRUCTURE_FUEL[tile.building.type] || 45;
    return fuel;
  }
  function canIgnite(tile) {
    if (!tile || tile.terrain === "water" || tile.building && !tile.building.complete) return false;
    return finite2(tile.fireFuel) > 0 || fuelFor(tile) > 0;
  }
  function initializeHazards(game2, { migration = false } = {}) {
    const state = game2.state;
    const firstDelay = state.difficulty === "relaxed" ? 480 : 360;
    if (!record2(state.hazards)) state.hazards = {};
    const defaults = {
      nextIncidentAt: finite2(state.time) + firstDelay,
      spreadTimer: 0,
      incidentCount: 0,
      extinguished: 0,
      burnedBuildings: 0,
      burnedPlants: 0
    };
    for (const [key, value] of Object.entries(defaults)) if (state.hazards[key] === void 0) state.hazards[key] = value;
    for (const tile of state.tiles || []) {
      if (tile.fire === void 0) tile.fire = 0;
      if (tile.fireFuel === void 0) tile.fireFuel = 0;
      if (tile.burned === void 0) tile.burned = false;
    }
  }
  function igniteTile(game2, x, y, strength = 0.35) {
    const state = game2?.state;
    if (!state || !Array.isArray(state.tiles)) return { ok: false, message: "\uC9C0\uB3C4\uB97C \uD655\uC778\uD560 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4." };
    const tile = tileAt2(state, x, y);
    if (!tile) return { ok: false, message: "\uC9C0\uB3C4 \uC548\uC758 \uC815\uC218 \uC88C\uD45C\uB97C \uC120\uD0DD\uD558\uC138\uC694." };
    if (!Number.isFinite(strength) || strength <= 0 || strength > 1) return { ok: false, message: "\uD654\uB825\uC740 0\uBCF4\uB2E4 \uD06C\uACE0 1 \uC774\uD558\uC5EC\uC57C \uD569\uB2C8\uB2E4." };
    if (finite2(tile.fire) > 0) return { ok: false, message: "\uC774\uBBF8 \uBD88\uC774 \uB09C \uACF3\uC785\uB2C8\uB2E4." };
    if (!canIgnite(tile)) return { ok: false, message: "\uBB3C\xB7\uBD88\uC5F0\uC131 \uB545\xB7\uAC74\uC124 \uACC4\uD68D\uC5D0\uB294 \uBD88\uC744 \uBD99\uC77C \uC218 \uC5C6\uC2B5\uB2C8\uB2E4." };
    if (state.tiles.reduce((count, t) => count + (finite2(t.fire) > 0 ? 1 : 0), 0) >= MAX_FIRES) return { ok: false, message: "\uB3D9\uC2DC\uC5D0 \uBC88\uC9C8 \uC218 \uC788\uB294 \uD654\uC7AC\uB294 32\uCE78\uC785\uB2C8\uB2E4." };
    if (!record2(state.hazards) || tile.fire === void 0 || tile.burned === void 0) initializeHazards(game2);
    tile.fireFuel = finite2(tile.fireFuel) > 0 ? tile.fireFuel : fuelFor(tile);
    tile.fire = strength;
    if (typeof game2._wake === "function") game2._wake();
    return { ok: true, message: "\uBD88\uC774 \uBD99\uC5C8\uC2B5\uB2C8\uB2E4. \uC18C\uBC29 \uB2F4\uB2F9\uC790\uAC00 \uAC00\uAE4C\uC774 \uC774\uB3D9\uD574 \uC9C4\uD654\uD569\uB2C8\uB2E4." };
  }
  function startIncident(game2) {
    const state = game2.state, hazards = state.hazards;
    if (finite2(state.time) < hazards.nextIncidentAt || state.gameOver) return;
    const fires = state.tiles.reduce((count, tile2) => count + (tile2.fire > 0 ? 1 : 0), 0);
    if (fires >= 8 || state.activeRaid) {
      hazards.nextIncidentAt = finite2(state.time) + 45;
      return;
    }
    const buildings = state.tiles.filter((tile2) => tile2.building?.complete);
    const living = (state.colonists || []).filter((pawn) => !pawn.dead);
    const anchors = buildings.length ? buildings : living;
    const cx = anchors.length ? anchors.reduce((n, value) => n + value.x, 0) / anchors.length : state.width / 2;
    const cy = anchors.length ? anchors.reduce((n, value) => n + value.y, 0) / anchors.length : state.height / 2;
    const safe2 = state.tiles.filter((tile2) => {
      if (tile2.roofed || tile2.building || tile2.crop || tile2.fire > 0 || !canIgnite(tile2)) return false;
      const distance = Math.hypot(tile2.x - cx, tile2.y - cy);
      return distance >= 6 && distance <= 12 && !buildings.some((other) => Math.abs(other.x - tile2.x) + Math.abs(other.y - tile2.y) < 3) && !living.some((pawn) => Math.hypot(pawn.x - tile2.x - 0.5, pawn.y - tile2.y - 0.5) < 2);
    });
    const woody = safe2.filter((tile2) => tile2.feature === "tree" || tile2.feature === "berry");
    const candidates = woody.length ? woody : safe2;
    hazards.nextIncidentAt = finite2(state.time) + (state.difficulty === "relaxed" ? 360 : 300) + Math.floor(random(game2) * 91);
    if (!candidates.length) return;
    const tile = candidates[Math.min(candidates.length - 1, Math.floor(random(game2) * candidates.length))];
    const result = igniteTile(game2, tile.x, tile.y, state.difficulty === "relaxed" ? 0.28 : 0.35);
    if (!result.ok) return;
    hazards.incidentCount++;
    if (typeof game2._effect === "function") game2._effect("hit", tile.x + 0.5, tile.y + 0.5, tile.x + 0.5, tile.y + 0.5, "#f8d995", "\uB099\uB8B0");
    if (typeof game2._log === "function") game2._log("danger", "\uB099\uB8B0\uB85C \uBD88\uC774 \uB0AC\uC2B5\uB2C8\uB2E4", `\uC815\uCC29\uC9C0 \uBC14\uAE65 (${tile.x}, ${tile.y})\uC5D0 \uD654\uC7AC\uAC00 \uBC1C\uC0DD\uD588\uC2B5\uB2C8\uB2E4. \uC18C\uBC29 \uB2F4\uB2F9\uC790\uB97C \uD655\uC778\uD558\uACE0 \uD544\uC694\uD558\uBA74 \uC6B0\uC120 \uC9C4\uD654\uB97C \uC9C0\uC2DC\uD558\uC138\uC694.`);
  }
  function releasePlantWork(game2, tile) {
    if (typeof game2._releaseJob !== "function") return;
    for (const pawn of game2.state.colonists || []) {
      if (pawn.job && ["grow", "harvest"].includes(pawn.job.type) && pawn.job.tx === tile.x && pawn.job.ty === tile.y) game2._releaseJob(pawn);
    }
  }
  function destroyBuilding(game2, tile) {
    const building = tile.building;
    if (!building?.complete) return false;
    if (typeof game2._onBuildingDestroyed === "function") game2._onBuildingDestroyed(building, tile, "fire");
    else if (typeof game2._releaseJob === "function") {
      for (const pawn of game2.state.colonists || []) if (pawn.job?.targetId === building.id || pawn.job?.bedId === building.id) game2._releaseJob(pawn);
    }
    tile.building = null;
    tile.burned = true;
    game2.state.hazards.burnedBuildings++;
    if (typeof game2._effect === "function") game2._effect("hit", tile.x + 0.5, tile.y + 0.5, tile.x + 0.5, tile.y + 0.5, "#d78d64", "\uD654\uC7AC\uB85C \uD30C\uAD34");
    if (typeof game2._log === "function") game2._log("warning", "\uAC74\uBB3C\uC774 \uBD88\uC5D0 \uBB34\uB108\uC84C\uC2B5\uB2C8\uB2E4", `(${tile.x}, ${tile.y})\uC758 \uAD6C\uC870\uBB3C\uC774 \uD30C\uAD34\uB418\uC5C8\uC2B5\uB2C8\uB2E4. \uD654\uC7AC\uB97C \uC9C4\uC555\uD55C \uB4A4 \uBC29\uACFC \uC804\uB825 \uC5F0\uACB0\uC744 \uBCF5\uAD6C\uD558\uC138\uC694.`);
    return true;
  }
  function damageActors(game2, dt) {
    const state = game2.state;
    for (const pawn of state.colonists || []) {
      if (pawn.dead) continue;
      const tile = tileAt2(state, Math.floor(pawn.x), Math.floor(pawn.y));
      if (!tile || tile.fire <= 0) continue;
      const previous = pawn.health;
      pawn.health = Math.max(0, pawn.health - tile.fire * 5 * dt);
      if (pawn.health <= 0) {
        if (typeof game2._killPawn === "function") game2._killPawn(pawn);
        else {
          pawn.dead = true;
          pawn.drafted = false;
        }
      } else if (previous >= 15 && pawn.health < 15) {
        if (typeof game2._downPawn === "function") game2._downPawn(pawn);
        else {
          if (typeof game2._releaseJob === "function") game2._releaseJob(pawn);
          pawn.drafted = false;
          pawn.order = null;
        }
        pawn.status = "\uD654\uC0C1\uC73C\uB85C \uC4F0\uB7EC\uC9D0 \xB7 \uAD6C\uC870 \uD544\uC694";
      }
    }
    for (const pawn of state.raiders || []) {
      if (pawn.dead) continue;
      const tile = tileAt2(state, Math.floor(pawn.x), Math.floor(pawn.y));
      if (!tile || tile.fire <= 0) continue;
      pawn.health = Math.max(0, pawn.health - tile.fire * 5 * dt);
      if (pawn.health <= 0) {
        pawn.dead = true;
        pawn.path = [];
        pawn.destination = null;
        pawn.status = "\uD654\uC7AC\uB85C \uC81C\uC555\uB428";
        if (state.stats) state.stats.raidersDefeated = finite2(state.stats.raidersDefeated) + 1;
      }
    }
  }
  function burnStep(game2, dt) {
    const state = game2.state;
    let destroyed = false;
    for (const tile of state.tiles) {
      if (!(tile.fire > 0)) continue;
      if (tile.terrain === "water" || tile.building && !tile.building.complete) {
        tile.fire = 0;
        tile.fireFuel = 0;
        continue;
      }
      if (tile.fireFuel <= 0) {
        tile.fire = 0;
        continue;
      }
      const rain = state.weather === "rain" && !tile.roofed;
      const growth = tile.fireFuel > 4 ? 0.045 : -0.2;
      tile.fire = clamp2(tile.fire + (growth - (rain ? 0.3 : 0)) * dt, 0, 1);
      if (tile.fire <= 1e-9) {
        tile.fire = 0;
        continue;
      }
      tile.burned = true;
      tile.fireFuel = Math.max(0, tile.fireFuel - (0.35 + tile.fire * 0.95) * dt);
      if (tile.building?.complete) {
        tile.building.hp = Math.max(0, tile.building.hp - tile.fire * 6 * dt);
        if (tile.building.hp <= 0) destroyed = destroyBuilding(game2, tile) || destroyed;
      }
      if (tile.feature === "tree" || tile.feature === "berry") {
        if (tile.fireFuel <= Math.max(6, fuelFor(tile) * 0.5)) {
          tile.feature = null;
          tile.amount = 0;
          tile.designation = null;
          state.hazards.burnedPlants++;
          releasePlantWork(game2, tile);
        }
      }
      if (tile.crop) {
        tile.crop.growth = Math.max(0, tile.crop.growth - tile.fire * 0.06 * dt);
        if (tile.crop.growth <= 0) {
          tile.crop = null;
          state.hazards.burnedPlants++;
          releasePlantWork(game2, tile);
        }
      }
      if (tile.fireFuel <= 0) tile.fire = 0;
    }
    damageActors(game2, dt);
    return destroyed;
  }
  function spreadFire(game2) {
    const state = game2.state, sources = state.tiles.filter((tile) => tile.fire > 0);
    let burning = sources.length, spread = 0;
    for (const tile of sources) {
      if (burning >= MAX_FIRES || spread >= MAX_SPREAD_PER_CYCLE) break;
      if (state.weather === "rain" && !tile.roofed) continue;
      const candidates = DIRS.map(([dx, dy]) => tileAt2(state, tile.x + dx, tile.y + dy)).filter((other) => other && other.fire === 0 && canIgnite(other));
      if (!candidates.length || random(game2) >= tile.fire * 0.45) continue;
      const target = candidates[Math.min(candidates.length - 1, Math.floor(random(game2) * candidates.length))];
      const result = igniteTile(game2, target.x, target.y, 0.22);
      if (result.ok) {
        burning++;
        spread++;
      }
    }
  }
  function updateHazards(game2, dt) {
    if (!Number.isFinite(dt) || dt <= 0 || !game2?.state) return;
    const state = game2.state;
    if (!record2(state.hazards)) initializeHazards(game2);
    startIncident(game2);
    let remaining = dt, topologyChanged = false;
    while (remaining > 1e-9) {
      const step = Math.min(PERIOD2, remaining);
      topologyChanged = burnStep(game2, step) || topologyChanged;
      state.hazards.spreadTimer += step;
      while (state.hazards.spreadTimer >= SPREAD_PERIOD - 1e-9) {
        state.hazards.spreadTimer = Math.max(0, state.hazards.spreadTimer - SPREAD_PERIOD);
        spreadFire(game2);
      }
      remaining -= step;
    }
    if (topologyChanged) {
      refreshSystems(game2);
      if (typeof game2._wake === "function") game2._wake();
    }
  }
  function validateHazards(data, bad) {
    const fail = (label) => {
      bad(label);
      throw new Error(`Invalid hazard state: ${label}`);
    };
    const number2 = (value, min, max, label) => {
      if (!Number.isFinite(value) || value < min || value > max) fail(label);
    };
    if (!record2(data?.hazards) || !Array.isArray(data.tiles)) fail("\uD654\uC7AC \uC0C1\uD0DC");
    const hazards = data.hazards;
    number2(hazards.nextIncidentAt, 0, 1e10, "\uB2E4\uC74C \uB099\uB8B0 \uC2DC\uAC04");
    number2(hazards.spreadTimer, 0, SPREAD_PERIOD, "\uD654\uC7AC \uD655\uC0B0 \uC2DC\uAC04");
    if (hazards.spreadTimer >= SPREAD_PERIOD) fail("\uD654\uC7AC \uD655\uC0B0 \uC8FC\uAE30");
    for (const key of ["incidentCount", "extinguished", "burnedBuildings", "burnedPlants"]) {
      number2(hazards[key], 0, 1e10, `\uD654\uC7AC ${key}`);
      if (!Number.isInteger(hazards[key])) fail("\uD654\uC7AC \uD1B5\uACC4 \uC815\uC218");
    }
    let fires = 0;
    for (const tile of data.tiles) {
      if (!record2(tile)) fail("\uD654\uC7AC \uD0C0\uC77C");
      number2(tile.fire, 0, 1, "\uD654\uB825");
      number2(tile.fireFuel, 0, 1e6, "\uC794\uC5EC \uC5F0\uB8CC");
      if (typeof tile.burned !== "boolean") fail("\uD0C4\uC790\uB9AC");
      if (tile.fire > 0) {
        fires++;
        if (tile.fireFuel <= 0 || tile.terrain === "water" || tile.building && !tile.building.complete) fail("\uBD88\uC774 \uBD99\uC744 \uC218 \uC5C6\uB294 \uD0C0\uC77C");
      }
    }
    if (fires > MAX_FIRES) fail("\uB3D9\uC2DC \uD654\uC7AC \uD55C\uB3C4");
    return true;
  }

  // dist/colonist-life.js?v=4.0.0
  var SCHEDULE_MODES = Object.freeze({ anything: "\uC790\uC728", work: "\uC791\uC5C5", sleep: "\uC218\uBA74", recreation: "\uC5EC\uAC00" });
  var balanced = Array.from({ length: 24 }, (_, h) => h >= 22 || h < 6 ? "sleep" : h >= 8 && h < 18 ? "work" : h >= 18 && h < 20 ? "recreation" : "anything");
  var night = Array.from({ length: 24 }, (_, h) => h >= 10 && h < 18 ? "sleep" : h >= 20 || h < 6 ? "work" : h >= 6 && h < 8 ? "recreation" : "anything");
  var SCHEDULE_PRESETS = Object.freeze({ balanced: Object.freeze(balanced), night: Object.freeze(night), free: Object.freeze(Array(24).fill("anything")) });
  var record3 = (v) => !!v && typeof v === "object" && !Array.isArray(v);
  var clamp3 = (v, a, b) => Math.max(a, Math.min(b, v));
  function initializeLife(game2, { migration = false } = {}) {
    const s = game2.state;
    if (!record3(s.careStats)) s.careStats = { rescued: 0, tended: 0, fed: 0 };
    for (const t of s.tiles) if (t.building?.type === "bed" && t.building.medical === void 0) t.building.medical = false;
    for (const c of s.colonists) {
      if (c.carryingPawnId === void 0) c.carryingPawnId = null;
      if (c.carriedBy === void 0) c.carriedBy = null;
      if (c.patientBedId === void 0) c.patientBedId = null;
      if (c.schedule === void 0) c.schedule = [...SCHEDULE_PRESETS[migration ? "free" : "balanced"]];
      if (c.recreation === void 0) c.recreation = 70;
      if (c.lastScheduleHour === void 0) c.lastScheduleHour = -1;
      if (c.emergencyCheckAt === void 0) c.emergencyCheckAt = 0;
      if (c.skills.rescue === void 0) c.skills.rescue = c.name === "\uBBF8\uB098" ? 8 : 6;
      if (c.skills.firefight === void 0) c.skills.firefight = 6;
      if (c.priorities.rescue === void 0) c.priorities.rescue = 1;
      if (c.priorities.firefight === void 0) c.priorities.firefight = 1;
    }
  }
  function moodFactors(c) {
    if (!c) return [];
    return [
      { id: "baseline", label: "\uAE30\uBCF8 \uC548\uC815\uAC10", value: 76 },
      { id: "pain", label: "\uBD80\uC0C1\uACFC \uD1B5\uC99D", value: -(100 - c.health) * 0.28 },
      { id: "hunger", label: "\uD5C8\uAE30", value: c.hunger < 35 ? -(35 - c.hunger) * 0.8 : 0 },
      { id: "fatigue", label: "\uD53C\uB85C", value: c.energy < 30 ? -(30 - c.energy) * 0.55 : 0 },
      { id: "rest", label: "\uD734\uC2DD \uC911", value: c.job?.type === "rest" || c.patientBedId ? 5 : 0 },
      { id: "shelter", label: "\uC2E4\uB0B4\uC758 \uC548\uC815\uAC10", value: c.sheltered ? 4 : 0 },
      { id: "thermal", label: "\uBD88\uD3B8\uD55C \uC628\uB3C4", value: -(c.thermalStress || 0) * 0.18 },
      { id: "recreation", label: "\uC5EC\uAC00 \uBD80\uC871", value: c.recreation < 30 ? -(30 - c.recreation) * 0.35 : 0 }
    ];
  }
  function moodTarget(c) {
    return clamp3(moodFactors(c).reduce((n, f) => n + f.value, 0), 5, 92);
  }
  function validateLife(data, bad) {
    const number2 = (v, a, b, label) => {
      if (!Number.isFinite(v) || v < a || v > b) bad(label);
    };
    if (!record3(data.careStats)) bad("\uAC04\uD638 \uD1B5\uACC4");
    for (const key of ["rescued", "tended", "fed"]) if (!Number.isSafeInteger(data.careStats[key]) || data.careStats[key] < 0) bad("\uAC04\uD638 \uD1B5\uACC4 \uC218\uB7C9");
    const pawns = new Map(data.colonists.map((c) => [c.id, c])), beds = new Map(data.tiles.filter((t) => t.building?.type === "bed").map((t) => [t.building.id, t]));
    for (const t of beds.values()) if (typeof t.building.medical !== "boolean") bad("\uC758\uB8CC \uCE68\uC0C1 \uC124\uC815");
    const bookings = /* @__PURE__ */ new Map();
    const book = (bedId, patientId) => {
      const t = beds.get(bedId);
      if (!t?.building.complete) bad("\uD658\uC790 \uCE68\uC0C1 \uCC38\uC870");
      if (bookings.has(bedId) && bookings.get(bedId) !== patientId) bad("\uC911\uBCF5 \uD658\uC790 \uCE68\uC0C1");
      bookings.set(bedId, patientId);
    };
    for (const c of data.colonists) {
      if (!Array.isArray(c.schedule) || c.schedule.length !== 24 || Array.from(c.schedule).some((mode) => !Object.hasOwn(SCHEDULE_MODES, mode))) bad("24\uC2DC\uAC04 \uC8FC\uBBFC \uC77C\uC815");
      number2(c.recreation, 0, 100, "\uC5EC\uAC00");
      number2(c.emergencyCheckAt, 0, 1e10, "\uC704\uAE30 \uC7AC\uD3C9\uAC00 \uC2DC\uAC04");
      if (!Number.isInteger(c.lastScheduleHour) || c.lastScheduleHour < -1 || c.lastScheduleHour > 23) bad("\uC77C\uC815 \uAC31\uC2E0 \uC2DC\uAC01");
      for (const key of ["carryingPawnId", "carriedBy", "patientBedId"]) if (c[key] !== null && typeof c[key] !== "string") bad("\uD658\uC790 \uC6B4\uBC18 \uCC38\uC870");
      if (c.carryingPawnId) {
        const p = pawns.get(c.carryingPawnId);
        if (c.dead || c.carry || c.carriedBy || !p || p.dead || p.carriedBy !== c.id || p.carryingPawnId || c.job?.type !== "rescue" || c.job.stage !== "deliver" || c.job.targetId !== p.id || p.patientBedId !== c.job.bedId) bad("\uC6B4\uBC18\uC790\uC640 \uD658\uC790 \uC0C1\uD638 \uCC38\uC870");
        if (Math.abs(c.x - p.x) > 1e-6 || Math.abs(c.y - p.y) > 1e-6) bad("\uC6B4\uBC18 \uC911 \uD658\uC790 \uC704\uCE58");
      }
      if (c.carriedBy) {
        const carrier = pawns.get(c.carriedBy);
        if (c.dead || c.carry || c.job || !carrier || carrier.dead || carrier.carryingPawnId !== c.id) bad("\uD658\uC790 \uC6B4\uBC18\uC790 \uCC38\uC870");
      }
      if (c.patientBedId) {
        if (c.dead) bad("\uC0AC\uB9DD\uD55C \uD658\uC790 \uCE68\uC0C1");
        book(c.patientBedId, c.id);
      }
      const j = c.job;
      if (!j) continue;
      if (j.type === "rescue") {
        if (!["pickup", "deliver"].includes(j.stage) || !pawns.has(j.targetId) || j.targetId === c.id || typeof j.bedId !== "string") bad("\uAD6C\uC870 \uC791\uC5C5");
        book(j.bedId, j.targetId);
        if (j.stage === "deliver" && c.carryingPawnId !== j.targetId) bad("\uD658\uC790 \uC5C6\uB294 \uC6B4\uBC18 \uC791\uC5C5");
      }
      if (j.type === "feed" && (!["fetch", "work"].includes(j.stage) || !pawns.has(j.targetId) || !["meals", "rawfood"].includes(j.foodType))) bad("\uAE09\uC2DD \uC791\uC5C5");
      if (j.type === "firefight" && j.stage !== "work") bad("\uC18C\uBC29 \uC791\uC5C5");
      if (j.type === "recreate" && (j.stage !== "work" || j.ground !== void 0 && typeof j.ground !== "boolean")) bad("\uC5EC\uAC00 \uC791\uC5C5");
    }
  }

  // dist/industry.js?v=4.0.0
  var record4 = (v) => !!v && typeof v === "object" && !Array.isArray(v);
  var SLOT_ITEMS = Object.freeze({ weapon: "rifle", armor: "armor", tool: "tool" });
  function initializeIndustry(game2, { migration = false } = {}) {
    const s = game2.state;
    for (const key of Object.keys(EXTRA_RESOURCE_LABELS)) if (migration || s.resources[key] === void 0) s.resources[key] = key === "silver" && !migration ? 60 : 0;
    if (migration || !record4(s.industry)) s.industry = { bills: {}, crafted: {} };
    for (const id of Object.keys(RECIPES)) {
      if (s.industry.bills[id] === void 0) s.industry.bills[id] = { mode: "count", target: 0, paused: false };
      if (s.industry.crafted[id] === void 0) s.industry.crafted[id] = 0;
    }
    for (const c of s.colonists) {
      if (migration || c.equipment === void 0) c.equipment = { weapon: null, armor: null, tool: null };
      if (migration || c.skills.craft === void 0) c.skills.craft = c.name === "\uC11C\uC724" ? 10 : c.name === "\uB3C4\uD604" ? 7 : 6;
      if (migration || c.priorities.craft === void 0) c.priorities.craft = 3;
    }
  }
  function ownedCount(state, type, { includeCraft = false } = {}) {
    let total = state.resources[type] || 0;
    for (const item of state.items) if (item.type === type) total += item.count;
    for (const c of state.colonists) {
      if (c.carry?.type === type && c.carry.source !== "construction") total += c.carry.count;
      if (c.equipment) {
        for (const item of Object.values(c.equipment)) if (item === type) total++;
      }
      if (includeCraft && c.job?.type === "craft" && RECIPES[c.job.recipeId]?.output === type) total += RECIPES[c.job.recipeId].count;
    }
    return total;
  }
  function canStartCraft(state, recipeId) {
    const recipe = RECIPES[recipeId], bill = state.industry.bills[recipeId];
    if (!recipe || !bill || bill.paused || bill.target <= 0) return false;
    const active = state.colonists.filter((c) => c.job?.type === "craft");
    if (bill.mode === "count" && active.filter((c) => c.job.recipeId === recipeId).length >= bill.target) return false;
    if (bill.mode === "maintain" && ownedCount(state, recipe.output, { includeCraft: true }) >= bill.target) return false;
    for (const [type, count] of Object.entries(recipe.cost)) {
      let committed = 0;
      for (const c of active) {
        const cost = RECIPES[c.job.recipeId]?.cost[type] || 0, delivered = c.job.materials?.[type] || 0, carried = c.carry?.source === "craft" && c.carry.type === type ? c.carry.count : 0;
        committed += Math.max(0, cost - delivered - carried);
      }
      if (state.resources[type] - committed < count) return false;
    }
    return true;
  }
  function equipmentStats(c) {
    const weapon = c?.equipment?.weapon === "rifle" ? EQUIPMENT.rifle : null;
    return { range: weapon?.range ?? 7.5, damage: weapon?.damage ?? 1, accuracy: weapon?.accuracy ?? 0, cooldown: weapon?.cooldown ?? 1.35, damageTaken: c?.equipment?.armor === "armor" ? EQUIPMENT.armor.damageTaken : 1, workSpeed: c?.equipment?.tool === "tool" ? EQUIPMENT.tool.workSpeed : 1 };
  }
  function validateIndustry(data, bad) {
    const number2 = (v, a, b, label) => {
      if (!Number.isFinite(v) || v < a || v > b) bad(label);
    };
    const count = (v, max, label) => {
      if (!Number.isSafeInteger(v) || v < 0 || v > max) bad(label);
    };
    const industry = data.industry;
    for (const key of Object.keys(EXTRA_RESOURCE_LABELS)) count(data.resources[key], 1e8, "\uCD94\uAC00 \uC790\uC6D0 \uC218\uB7C9");
    if (!record4(industry) || !record4(industry.bills) || !record4(industry.crafted)) bad("\uC81C\uC791 \uC8FC\uBB38 \uC0C1\uD0DC");
    if (Object.keys(industry.bills).some((id) => !Object.hasOwn(RECIPES, id)) || Object.keys(industry.crafted).some((id) => !Object.hasOwn(RECIPES, id))) bad("\uC54C \uC218 \uC5C6\uB294 \uC81C\uC791 \uC8FC\uBB38");
    for (const id of Object.keys(RECIPES)) {
      const bill = industry.bills[id];
      if (!record4(bill) || !["count", "maintain"].includes(bill.mode) || typeof bill.paused !== "boolean") bad("\uC81C\uC791 \uC8FC\uBB38 \uC124\uC815");
      count(bill.target, 99, "\uC81C\uC791 \uBAA9\uD45C");
      count(industry.crafted[id], 1e12, "\uC81C\uC791 \uD1B5\uACC4");
      const active = data.colonists.filter((c) => c.job?.type === "craft" && c.job.recipeId === id).length;
      if (active && (bill.paused || bill.target === 0 || bill.mode === "count" && active > bill.target)) bad("\uC81C\uC791 \uC8FC\uBB38\uACFC \uC9C4\uD589 \uC791\uC5C5 \uBD88\uC77C\uCE58");
    }
    for (const c of data.colonists) {
      if (!record4(c.equipment) || Object.keys(c.equipment).length !== 3) bad("\uC7A5\uBE44 \uC2AC\uB86F");
      for (const [slot, item] of Object.entries(SLOT_ITEMS)) if (c.equipment[slot] !== null && c.equipment[slot] !== item) bad("\uC7A5\uBE44 \uC2AC\uB86F\uACFC \uD488\uC885");
      if (c.dead && Object.values(c.equipment).some(Boolean)) bad("\uC0AC\uB9DD \uC8FC\uBBFC\uC758 \uC7A5\uCC29 \uC7A5\uBE44");
      const j = c.job;
      if (j && ["craft", "equip"].includes(j.type) && (c.dead || c.drafted || data.reservations[j.key]?.owner !== c.id)) bad("\uC81C\uC791\xB7\uC7A5\uCC29 \uC791\uC5C5 \uC18C\uC720\uC790");
      if (j?.type === "craft") {
        if (!Object.hasOwn(RECIPES, j.recipeId) || !record4(j.materials) || !["fetch", "deliver", "work"].includes(j.stage)) bad("\uC81C\uC791 \uC791\uC5C5");
        const recipe = RECIPES[j.recipeId], bench = data.tiles.find((t) => t.building?.id === j.targetId);
        if (!bench?.building.complete || bench.building.type !== "workbench" || j.tx !== bench.x || j.ty !== bench.y || j.key !== `craft:${j.targetId}`) bad("\uC81C\uC791 \uC791\uC5C5\uB300 \uCC38\uC870");
        if (j.total !== recipe.work) bad("\uC81C\uC791 \uC791\uC5C5\uB7C9");
        number2(j.progress, 0, recipe.work, "\uC81C\uC791 \uC9C4\uD589");
        for (const [type, n] of Object.entries(j.materials)) {
          if (!Object.hasOwn(recipe.cost, type)) bad("\uC81C\uC791 \uC7AC\uB8CC \uC885\uB958");
          count(n, recipe.cost[type], "\uC81C\uC791 \uC804\uB2EC \uC7AC\uB8CC");
        }
        if (j.stage === "work" && (c.carry || Object.entries(recipe.cost).some(([type, n]) => (j.materials[type] || 0) !== n))) bad("\uC81C\uC791 \uC7AC\uB8CC \uC900\uBE44 \uC0C1\uD0DC");
        if (j.stage === "fetch" && c.carry) bad("\uC790\uC7AC \uC218\uB839 \uC804 \uC6B4\uBC18\uBB3C \uCDA9\uB3CC");
        if (j.stage === "deliver" && (!c.carry || c.carry.source !== "craft")) bad("\uC81C\uC791 \uC790\uC7AC \uC6B4\uBC18 \uC0C1\uD0DC");
      }
      if (c.carry?.source === "craft") {
        if (j?.type !== "craft" || c.carry.recipeId !== j.recipeId || c.carry.benchId !== j.targetId || j.stage !== "deliver") bad("\uC6B4\uBC18 \uC911 \uC81C\uC791 \uC790\uC7AC \uCC38\uC870");
        const cost = RECIPES[j.recipeId].cost[c.carry.type];
        if (!cost || c.carry.count + (j.materials[c.carry.type] || 0) > cost) bad("\uC81C\uC791 \uC790\uC7AC \uC911\uBCF5 \uC218\uB7C9");
      }
      if (j?.type === "equip") {
        if (!Object.hasOwn(EQUIPMENT, j.item) || j.slot !== EQUIPMENT[j.item].slot || !["fetch", "work"].includes(j.stage) || j.total !== 1.5 || j.key !== `equip:${c.id}` || c.equipment[j.slot] !== null) bad("\uC7A5\uBE44 \uC7A5\uCC29 \uC791\uC5C5");
        if (j.stage === "work" && (c.carry?.type !== j.item || c.carry.count !== 1)) bad("\uC7A5\uCC29\uD560 \uC7A5\uBE44 \uC6B4\uBC18");
        if (j.stage === "fetch" && c.carry) bad("\uC7A5\uBE44 \uC218\uB839 \uC804 \uC6B4\uBC18\uBB3C \uCDA9\uB3CC");
      }
    }
  }

  // dist/trade.js?v=4.0.0
  var FIRST_VISIT = 80;
  var NEXT_VISIT = 220;
  var STAY = 100;
  var SPEED = 1.8;
  var REPATH = 2;
  var BLOCK_LIMIT = 12;
  var TRAVEL_LIMIT = 120;
  var DIRS2 = [[0, -1], [1, 0], [0, 1], [-1, 0]];
  var INITIAL_STOCK = Object.freeze({ wood: 30, steel: 24, rawfood: 16, meals: 10, medicine: 6, tool: 2, armor: 2, rifle: 2 });
  var LABELS = Object.freeze({ wood: "\uBAA9\uC7AC", steel: "\uAC15\uCCA0", rawfood: "\uC2DD\uC7AC\uB8CC", meals: "\uC2DD\uC0AC", medicine: "\uC57D\uD488", tool: "\uC791\uC5C5 \uB3C4\uAD6C", armor: "\uBC29\uD0C4 \uC870\uB07C", rifle: "\uAC1C\uB7C9 \uC18C\uCD1D" });
  var NAMES = ["\uAC08\uB300\uAE38 \uC0C1\uC778", "\uBA3C\uBCC4 \uC0C1\uC778", "\uC194\uBC14\uB78C \uC0C1\uC778", "\uB178\uC744\uAE38 \uC0C1\uC778"];
  var record5 = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
  var finite3 = (value, fallback = 0) => Number.isFinite(value) ? value : fallback;
  var clamp4 = (value, min, max) => Math.max(min, Math.min(max, value));
  var cell = (actor) => ({ x: Math.floor(actor.x), y: Math.floor(actor.y) });
  var sameCell = (a, b) => a?.x === b?.x && a?.y === b?.y;
  function visitHash(seed, visit) {
    let value = seed >>> 0 ^ Math.imul(visit, 2654435769);
    value = Math.imul(value ^ value >>> 16, 2146121005);
    value = Math.imul(value ^ value >>> 15, 2221713035);
    return (value ^ value >>> 16) >>> 0;
  }
  function tileAt3(state, x, y) {
    if (!Number.isInteger(x) || !Number.isInteger(y) || x < 0 || y < 0 || x >= state.width || y >= state.height) return null;
    return state.tiles[y * state.width + x] || null;
  }
  function safe(tile) {
    return Boolean(tile && tile.terrain !== "water" && !(tile.fire > 0) && !(tile.building?.complete && tile.building.type === "wall"));
  }
  function reachable(state, start) {
    const size = state.tiles.length, previous = new Int32Array(size), distance = new Int32Array(size);
    previous.fill(-2);
    distance.fill(-1);
    if (!tileAt3(state, start.x, start.y)) return { previous, distance, start: -1 };
    const origin = start.y * state.width + start.x, queue = new Int32Array(size);
    let head = 0, tail = 0;
    previous[origin] = -1;
    distance[origin] = 0;
    queue[tail++] = origin;
    while (head < tail) {
      const index = queue[head++], x = index % state.width, y = Math.floor(index / state.width);
      for (const [dx, dy] of DIRS2) {
        const next = tileAt3(state, x + dx, y + dy);
        if (!safe(next)) continue;
        const n = next.y * state.width + next.x;
        if (previous[n] !== -2) continue;
        previous[n] = index;
        distance[n] = distance[index] + 1;
        queue[tail++] = n;
      }
    }
    return { previous, distance, start: origin };
  }
  function pathFrom(state, map, target) {
    const goal = target.y * state.width + target.x;
    if (map.start < 0 || map.previous[goal] === -2) return null;
    const path = [];
    for (let index = goal; index !== map.start; index = map.previous[index]) path.push({ x: index % state.width, y: Math.floor(index / state.width) });
    return path.reverse();
  }
  function initializeTrade(game2, { migration = false } = {}) {
    const state = game2.state;
    if (migration) {
      state.trade = { nextVisitAt: finite3(state.time) + FIRST_VISIT, visits: 0, visitor: null, stats: { bought: 0, sold: 0, earned: 0, spent: 0 } };
      return;
    }
    if (!record5(state.trade)) state.trade = {};
    const trade = state.trade;
    if (trade.nextVisitAt === void 0) trade.nextVisitAt = finite3(state.time) + FIRST_VISIT;
    if (trade.visits === void 0) trade.visits = 0;
    if (trade.visitor === void 0) trade.visitor = null;
    if (!record5(trade.stats)) trade.stats = {};
    for (const key of ["bought", "sold", "earned", "spent"]) if (trade.stats[key] === void 0) trade.stats[key] = 0;
  }
  function findVisitRoute(state) {
    const depots = state.tiles.filter((tile) => tile.zone === "stockpile" && safe(tile));
    if (!depots.length) return null;
    const anchor = {
      x: depots.reduce((n, tile) => n + tile.x, 0) / depots.length,
      y: depots.reduce((n, tile) => n + tile.y, 0) / depots.length
    };
    const hash = visitHash(state.seed, state.trade.visits + 1);
    const preferredY = clamp4(Math.round(anchor.y) + hash % 9 - 4, 1, state.height - 2);
    const entries = state.tiles.filter((tile) => tile.x === state.width - 1 && safe(tile)).sort((a, b) => Math.abs(a.y - preferredY) - Math.abs(b.y - preferredY) || a.y - b.y);
    const meetings = state.tiles.filter((tile) => safe(tile) && !tile.roofed && !tile.building && !tile.feature && !tile.crop && !tile.zone && Math.abs(tile.x - anchor.x) + Math.abs(tile.y - anchor.y) >= 4 && Math.abs(tile.x - anchor.x) + Math.abs(tile.y - anchor.y) <= 14).sort((a, b) => {
      const score = (tile) => Math.abs(tile.x - Math.min(state.width - 3, anchor.x + 8)) + Math.abs(tile.y - anchor.y) * 1.3;
      return score(a) - score(b) || a.y - b.y || a.x - b.x;
    });
    for (const entry of entries) {
      const map = reachable(state, entry);
      if (!depots.some((tile) => map.distance[tile.y * state.width + tile.x] >= 0)) continue;
      const meeting = meetings.find((tile) => map.distance[tile.y * state.width + tile.x] >= 0);
      if (meeting) return { entry: { x: entry.x, y: entry.y }, meeting: { x: meeting.x, y: meeting.y }, path: pathFrom(state, map, meeting), hash };
    }
    return null;
  }
  function beginVisit(game2) {
    const state = game2.state, trade = state.trade;
    if (state.activeRaid || state.gameOver) {
      trade.nextVisitAt = finite3(state.time) + 30;
      return;
    }
    const route = findVisitRoute(state);
    if (!route) {
      trade.nextVisitAt = finite3(state.time) + 30;
      return;
    }
    trade.visits++;
    trade.visitor = {
      id: `trader_${trade.visits}`,
      name: NAMES[route.hash % NAMES.length],
      x: route.entry.x + 0.5,
      y: route.entry.y + 0.5,
      phase: "arriving",
      path: route.path,
      destination: { ...route.meeting },
      entry: route.entry,
      meeting: route.meeting,
      arrivedAt: null,
      leavesAt: null,
      nextPathAt: finite3(state.time),
      blockedTime: 0,
      travelElapsed: 0,
      stock: { ...INITIAL_STOCK },
      silver: 180
    };
    if (typeof game2._log === "function") game2._log("info", "\uC0C1\uC778\uC774 \uCC3E\uC544\uC635\uB2C8\uB2E4", `${trade.visitor.name}\uC774(\uAC00) \uC815\uCC29\uC9C0 \uC678\uACFD\uC73C\uB85C \uC774\uB3D9 \uC911\uC785\uB2C8\uB2E4. \uB3C4\uCC29\uD558\uBA74 \uCC3D\uACE0\uC758 \uC740\uD654\uC640 \uBB3C\uD488\uC73C\uB85C \uAD50\uC5ED\uD560 \uC218 \uC788\uC2B5\uB2C8\uB2E4.`);
  }
  function routeToExit(state, visitor) {
    const map = reachable(state, cell(visitor));
    const exits = state.tiles.filter((tile) => tile.x === state.width - 1 && safe(tile) && map.distance[tile.y * state.width + tile.x] >= 0).sort((a, b) => map.distance[a.y * state.width + a.x] - map.distance[b.y * state.width + b.x] || Math.abs(a.y - visitor.entry.y) - Math.abs(b.y - visitor.entry.y) || a.y - b.y);
    if (!exits.length) {
      visitor.path = [];
      visitor.destination = { ...visitor.entry };
      return false;
    }
    visitor.destination = { x: exits[0].x, y: exits[0].y };
    visitor.path = pathFrom(state, map, visitor.destination);
    return true;
  }
  function beginLeaving(game2, reason) {
    const state = game2.state, visitor = state.trade.visitor;
    if (!visitor || visitor.phase === "leaving") return;
    visitor.phase = "leaving";
    visitor.blockedTime = 0;
    visitor.travelElapsed = 0;
    routeToExit(state, visitor);
    visitor.nextPathAt = finite3(state.time) + REPATH;
    if (typeof game2._log === "function") game2._log("info", "\uC0C1\uC778\uC774 \uB3CC\uC544\uAC11\uB2C8\uB2E4", reason || "\uAC70\uB798 \uC2DC\uAC04\uC774 \uB05D\uB0AC\uC2B5\uB2C8\uB2E4. \uC774\uBBF8 \uBC30\uC1A1\uB41C \uBB3C\uD488\uACFC \uC740\uD654\uB294 \uC815\uCC29\uC9C0\uC5D0 \uB0A8\uC2B5\uB2C8\uB2E4.");
  }
  function finishVisit(state) {
    state.trade.visitor = null;
    state.trade.nextVisitAt = finite3(state.time) + NEXT_VISIT;
  }
  function replan(state, visitor) {
    visitor.nextPathAt = finite3(state.time) + REPATH;
    if (visitor.phase === "leaving") return routeToExit(state, visitor);
    if (!safe(tileAt3(state, visitor.meeting.x, visitor.meeting.y))) {
      visitor.path = [];
      return false;
    }
    const path = pathFrom(state, reachable(state, cell(visitor)), visitor.meeting);
    visitor.path = path || [];
    return path !== null;
  }
  function advanceVisitor(game2, dt) {
    const state = game2.state, visitor = state.trade.visitor;
    if (!visitor) return;
    const meeting = tileAt3(state, visitor.meeting.x, visitor.meeting.y);
    if (visitor.phase !== "leaving" && (state.activeRaid || !safe(meeting) || meeting.building)) {
      beginLeaving(game2, "\uC2B5\uACA9\uC774\uB098 \uB9CC\uB0A8 \uC9C0\uC810\uC758 \uC704\uD5D8\uC73C\uB85C \uAD50\uC5ED\uC744 \uC911\uB2E8\uD569\uB2C8\uB2E4. \uC0C1\uC778\uC774 \uC548\uC804\uD55C \uAE38\uC744 \uCC3E\uC544 \uB5A0\uB0A9\uB2C8\uB2E4.");
    }
    if (visitor.phase === "trading") {
      if (finite3(state.time) >= visitor.leavesAt) beginLeaving(game2);
      else return;
    }
    visitor.travelElapsed += dt;
    if (visitor.travelElapsed >= TRAVEL_LIMIT) {
      if (visitor.phase === "leaving") finishVisit(state);
      else beginLeaving(game2, "\uC811\uADFC \uACBD\uB85C\uAC00 \uC624\uB798 \uB9C9\uD600 \uC774\uBC88 \uBC29\uBB38\uC744 \uB9C8\uCE69\uB2C8\uB2E4.");
      return;
    }
    let blocked = false;
    if (visitor.path.length && !safe(tileAt3(state, visitor.path[0].x, visitor.path[0].y))) visitor.path = [];
    const atDestination = () => Math.hypot(visitor.x - visitor.destination.x - 0.5, visitor.y - visitor.destination.y - 0.5) < 1e-7;
    if (!visitor.path.length && !atDestination()) {
      if (finite3(state.time) >= visitor.nextPathAt) replan(state, visitor);
      if (!visitor.path.length) blocked = true;
    }
    if (!blocked) {
      let distance = SPEED * dt;
      while (distance > 1e-9 && visitor.path.length) {
        const next = visitor.path[0];
        if (!safe(tileAt3(state, next.x, next.y))) {
          visitor.path = [];
          blocked = true;
          break;
        }
        const dx = next.x + 0.5 - visitor.x, dy = next.y + 0.5 - visitor.y, length = Math.hypot(dx, dy);
        if (length <= distance + 1e-9) {
          visitor.x = next.x + 0.5;
          visitor.y = next.y + 0.5;
          distance -= length;
          visitor.path.shift();
        } else {
          visitor.x += dx / length * distance;
          visitor.y += dy / length * distance;
          distance = 0;
        }
      }
    }
    visitor.blockedTime = blocked ? visitor.blockedTime + dt : 0;
    if (visitor.blockedTime >= BLOCK_LIMIT) {
      if (visitor.phase === "leaving") finishVisit(state);
      else beginLeaving(game2, "\uB9CC\uB0A8 \uC9C0\uC810\uC73C\uB85C \uAC00\uB294 \uAE38\uC774 \uB9C9\uD600 \uC0C1\uC778\uC774 \uB3CC\uC544\uAC11\uB2C8\uB2E4.");
      return;
    }
    if (!visitor.path.length && atDestination()) {
      if (visitor.phase === "leaving") {
        finishVisit(state);
        return;
      }
      visitor.phase = "trading";
      visitor.arrivedAt = finite3(state.time);
      visitor.leavesAt = finite3(state.time) + STAY;
      visitor.travelElapsed = 0;
      visitor.blockedTime = 0;
      if (typeof game2._log === "function") game2._log("success", "\uAD50\uC5ED\uC744 \uC2DC\uC791\uD560 \uC218 \uC788\uC2B5\uB2C8\uB2E4", `${visitor.name}\uC774(\uAC00) 100\uCD08 \uB3D9\uC548 \uBA38\uBB45\uB2C8\uB2E4. \uAD6C\uB9E4\uD488\uACFC \uD310\uB9E4 \uB300\uAE08\uC740 \uC0C1\uC778 \uC606\uC5D0 \uB0B4\uB824\uB193\uC73C\uBBC0\uB85C \uCC3D\uACE0\uB85C \uC6B4\uBC18\uD558\uC138\uC694.`);
    }
  }
  function updateTrade(game2, dt) {
    if (!Number.isFinite(dt) || dt <= 0 || !game2?.state) return;
    const state = game2.state;
    if (!record5(state.trade)) initializeTrade(game2);
    if (!state.trade.visitor && finite3(state.time) >= state.trade.nextVisitAt) beginVisit(game2);
    let remaining = dt;
    while (remaining > 1e-9 && state.trade.visitor) {
      const step = Math.min(0.5, remaining);
      advanceVisitor(game2, step);
      remaining -= step;
    }
  }
  function availableExchange(state, visitor) {
    const position = cell(visitor), delivery = tileAt3(state, position.x, position.y);
    if (!safe(delivery) || delivery.building) return null;
    const map = reachable(state, position);
    const hasDepot = state.tiles.some((tile) => tile.zone === "stockpile" && safe(tile) && map.distance[tile.y * state.width + tile.x] >= 0);
    if (!hasDepot) return null;
    const civilian = (state.colonists || []).some((pawn) => !pawn.dead && !pawn.drafted && pawn.health >= 15 && !pawn.carriedBy && !pawn.carryingPawnId && !pawn.patientBedId && safe(tileAt3(state, Math.floor(pawn.x), Math.floor(pawn.y))) && map.distance[Math.floor(pawn.y) * state.width + Math.floor(pawn.x)] >= 0);
    return civilian ? position : null;
  }
  function executeTrade(game2, payload) {
    const no = (message2) => ({ ok: false, message: message2 });
    const state = game2?.state, visitor = state?.trade?.visitor;
    if (!record5(payload) || !state || !visitor) return no("\uD604\uC7AC \uAD50\uC5ED\uD560 \uC0C1\uC778\uC774 \uC5C6\uC2B5\uB2C8\uB2E4.");
    if (payload.traderId !== visitor.id || visitor.phase !== "trading") return no("\uD604\uC7AC \uBC29\uBB38\uD55C \uC0C1\uC778\uC774 \uB9CC\uB0A8 \uC9C0\uC810\uC5D0 \uB3C4\uCC29\uD574\uC57C \uD569\uB2C8\uB2E4.");
    if (state.gameOver || state.activeRaid || finite3(state.time) >= visitor.leavesAt) return no("\uC704\uD5D8 \uC0C1\uD669\uC774\uAC70\uB098 \uAD50\uC5ED \uC2DC\uAC04\uC774 \uB05D\uB0AC\uC2B5\uB2C8\uB2E4.");
    const { side, type, count } = payload;
    if (!["buy", "sell"].includes(side) || !Object.hasOwn(TRADE_PRICES, type) || !Number.isInteger(count) || count < 1 || count > 100) return no("\uAC70\uB798 \uC885\uB958\uC640 1~100\uAC1C\uC758 \uC815\uC218 \uC218\uB7C9\uC744 \uD655\uC778\uD558\uC138\uC694.");
    const price = TRADE_PRICES[type][side];
    if (!Number.isInteger(price) || price <= 0) return no("\uC2DD\uD488\uC740 \uC0C1\uC778\uC5D0\uAC8C \uAD6C\uB9E4\uB9CC \uD560 \uC218 \uC788\uC2B5\uB2C8\uB2E4.");
    const total = price * count;
    if (side === "buy") {
      if (visitor.stock[type] < count) return no("\uC0C1\uC778\uC5D0\uAC8C \uADF8\uB9CC\uD07C\uC758 \uC7AC\uACE0\uAC00 \uC5C6\uC2B5\uB2C8\uB2E4.");
      if (finite3(state.resources.silver) < total) return no("\uCC3D\uACE0\uC5D0 \uC785\uACE0\uB41C \uC740\uD654\uAC00 \uBD80\uC871\uD569\uB2C8\uB2E4. \uBC14\uB2E5\uC758 \uC740\uD654\uB97C \uBA3C\uC800 \uC6B4\uBC18\uD558\uC138\uC694.");
      if (visitor.silver + total > 1e8) return no("\uC0C1\uC778\uC758 \uC740\uD654 \uBCF4\uAD00 \uD55C\uB3C4\uB97C \uB118\uC2B5\uB2C8\uB2E4.");
    } else {
      if (finite3(state.resources[type]) < count) return no("\uCC3D\uACE0\uC5D0 \uC785\uACE0\uB41C \uD310\uB9E4 \uBB3C\uD488\uC774 \uBD80\uC871\uD569\uB2C8\uB2E4. \uBC14\uB2E5\xB7\uC6B4\uBC18\xB7\uC7A5\uCC29 \uBB3C\uD488\uC740 \uD310\uB9E4\uD558\uC9C0 \uC54A\uC2B5\uB2C8\uB2E4.");
      if (visitor.silver < total) return no("\uC0C1\uC778\uC5D0\uAC8C \uC9C0\uAE09\uD560 \uC740\uD654\uAC00 \uBD80\uC871\uD569\uB2C8\uB2E4.");
      if (visitor.stock[type] + count > 1e8) return no("\uC0C1\uC778\uC758 \uBB3C\uD488 \uBCF4\uAD00 \uD55C\uB3C4\uB97C \uB118\uC2B5\uB2C8\uB2E4.");
    }
    const position = availableExchange(state, visitor);
    if (!position) return no("\uC548\uC804\uD55C \uBC30\uC1A1 \uC704\uCE58\uC640 \uCC3D\uACE0, \uC0C1\uC778\uC5D0\uAC8C \uC655\uBCF5\uD560 \uC218 \uC788\uB294 \uBE44\uC9D5\uC9D1 \uC8FC\uBBFC\uC774 \uD544\uC694\uD569\uB2C8\uB2E4.");
    if (typeof game2._dropItem !== "function") return no("\uBB3C\uD488 \uBC30\uC1A1\uC744 \uC900\uBE44\uD560 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4.");
    const dropType = side === "buy" ? type : "silver", dropCount = side === "buy" ? count : total;
    const stack = state.items.find((item) => item.type === dropType && item.x === position.x && item.y === position.y && !item.reservedBy);
    if (stack && stack.count + dropCount > 1e8 || !stack && state.items.length >= 1e4) return no("\uBC30\uC1A1 \uBB3C\uD488\uC744 \uB193\uC744 \uACF5\uAC04\uC774 \uBD80\uC871\uD569\uB2C8\uB2E4. \uAE30\uC874 \uBB3C\uD488\uC744 \uC6B4\uBC18\uD558\uC138\uC694.");
    const taken = withdrawStock(game2, side === "buy" ? "silver" : type, side === "buy" ? total : count);
    if (!taken.ok) return no("\uAC70\uB798\uD560 \uCC3D\uACE0 \uC7AC\uACE0\uB97C \uB2E4\uC2DC \uD655\uC778\uD558\uC138\uC694.");
    if (side === "buy") {
      visitor.stock[type] -= count;
      visitor.silver += total;
      state.trade.stats.bought += count;
      state.trade.stats.spent += total;
    } else {
      visitor.stock[type] += count;
      visitor.silver -= total;
      state.trade.stats.sold += count;
      state.trade.stats.earned += total;
    }
    game2._dropItem(dropType, dropCount, position.x, position.y, 1);
    if (typeof game2._wake === "function") game2._wake();
    const message = side === "buy" ? `${LABELS[type]} ${count}\uAC1C\uB97C \uC740\uD654 ${total}\uAC1C\uC5D0 \uAD6C\uB9E4\uD588\uC2B5\uB2C8\uB2E4. \uC0C1\uC778 \uC606 \uBB3C\uD488\uC744 \uCC3D\uACE0\uB85C \uC6B4\uBC18\uD558\uC138\uC694.` : `${LABELS[type]} ${count}\uAC1C\uB97C \uD310\uB9E4\uD588\uC2B5\uB2C8\uB2E4. \uC0C1\uC778 \uC606\uC758 \uC740\uD654 ${total}\uAC1C\uB97C \uCC3D\uACE0\uB85C \uC6B4\uBC18\uD558\uC138\uC694.`;
    if (typeof game2._log === "function") game2._log("success", side === "buy" ? "\uBB3C\uD488 \uAD6C\uB9E4" : "\uBB3C\uD488 \uD310\uB9E4", message);
    return { ok: true, message };
  }
  function validateTrade(data, bad) {
    const fail = (label) => {
      bad(label);
      throw new Error(`Invalid trade state: ${label}`);
    };
    const number2 = (value, min, max, label) => {
      if (!Number.isFinite(value) || value < min || value > max) fail(label);
    };
    const integer = (value, min, max, label) => {
      if (!Number.isInteger(value)) fail(label);
      number2(value, min, max, label);
    };
    const point = (value, label) => {
      if (!record5(value)) fail(label);
      integer(value.x, 0, data.width - 1, label);
      integer(value.y, 0, data.height - 1, label);
    };
    if (!record5(data?.trade) || !Array.isArray(data.tiles) || !Number.isInteger(data.width) || !Number.isInteger(data.height) || data.width < 1 || data.height < 1 || data.tiles.length !== data.width * data.height) fail("\uAD50\uC5ED \uC0C1\uD0DC");
    const trade = data.trade;
    number2(trade.nextVisitAt, 0, 1e10, "\uC0C1\uC778 \uBC29\uBB38 \uC2DC\uAC01");
    integer(trade.visits, 0, 1e10, "\uC0C1\uC778 \uBC29\uBB38 \uC218");
    if (!record5(trade.stats)) fail("\uAD50\uC5ED \uD1B5\uACC4");
    for (const key of ["bought", "sold", "earned", "spent"]) integer(trade.stats[key], 0, 1e10, "\uAD50\uC5ED \uD1B5\uACC4");
    const visitor = trade.visitor;
    if (visitor === null) return true;
    if (!record5(visitor) || trade.visits < 1) fail("\uBC29\uBB38 \uC0C1\uC778");
    if (typeof visitor.id !== "string" || !visitor.id || visitor.id.length > 100 || typeof visitor.name !== "string" || !visitor.name || visitor.name.length > 100) fail("\uC0C1\uC778 \uC2E0\uC6D0");
    if (visitor.id !== `trader_${trade.visits}`) fail("\uD604\uC7AC \uBC29\uBB38 \uC0C1\uC778 ID");
    number2(visitor.x, 0, data.width - 1e-6, "\uC0C1\uC778 x");
    number2(visitor.y, 0, data.height - 1e-6, "\uC0C1\uC778 y");
    if (!["arriving", "trading", "leaving"].includes(visitor.phase)) fail("\uC0C1\uC778 \uB2E8\uACC4");
    point(visitor.entry, "\uC0C1\uC778 \uC785\uAD6C");
    point(visitor.meeting, "\uB9CC\uB0A8 \uC9C0\uC810");
    point(visitor.destination, "\uC0C1\uC778 \uBAA9\uC801\uC9C0");
    if (visitor.entry.x !== data.width - 1) fail("\uC0C1\uC778 \uC9C0\uB3C4 \uC785\uAD6C");
    if (visitor.phase === "arriving" && !sameCell(visitor.destination, visitor.meeting)) fail("\uC0C1\uC778 \uB3C4\uCC29 \uBAA9\uC801\uC9C0");
    if (visitor.phase === "leaving" && visitor.destination.x !== data.width - 1) fail("\uC0C1\uC778 \uD1F4\uC7A5 \uBAA9\uC801\uC9C0");
    if (!Array.isArray(visitor.path) || visitor.path.length > data.tiles.length) fail("\uC0C1\uC778 \uC774\uB3D9 \uACBD\uB85C");
    let previous = cell(visitor);
    for (let i = 0; i < visitor.path.length; i++) {
      const step = visitor.path[i];
      point(step, "\uC0C1\uC778 \uACBD\uB85C \uC88C\uD45C");
      const distance = Math.abs(step.x - previous.x) + Math.abs(step.y - previous.y);
      if (distance > 1 || i > 0 && distance !== 1) fail("\uC0C1\uC778 \uACBD\uB85C \uC5F0\uACB0");
      previous = step;
    }
    if (visitor.path.length && !sameCell(previous, visitor.destination)) fail("\uC0C1\uC778 \uACBD\uB85C \uB05D");
    if (visitor.arrivedAt !== null) number2(visitor.arrivedAt, 0, data.time, "\uC0C1\uC778 \uB3C4\uCC29 \uC2DC\uAC01");
    if (visitor.leavesAt !== null) number2(visitor.leavesAt, 0, 1e10, "\uC0C1\uC778 \uCD9C\uBC1C \uC2DC\uAC01");
    if (visitor.arrivedAt === null !== (visitor.leavesAt === null)) fail("\uC0C1\uC778 \uCCB4\uB958 \uC2DC\uAC01");
    if (visitor.arrivedAt !== null && Math.abs(visitor.leavesAt - visitor.arrivedAt - STAY) > 1e-6) fail("\uC0C1\uC778 \uCCB4\uB958 \uAE30\uAC04");
    if (visitor.phase === "arriving" && visitor.arrivedAt !== null) fail("\uB3C4\uCC29 \uC804 \uC0C1\uC778 \uC2DC\uAC01");
    if (visitor.phase === "trading" && (visitor.arrivedAt === null || visitor.path.length || Math.hypot(visitor.x - visitor.meeting.x - 0.5, visitor.y - visitor.meeting.y - 0.5) > 1e-6)) fail("\uAD50\uC5ED \uC9C0\uC810 \uC0C1\uC778");
    for (const key of ["nextPathAt", "blockedTime", "travelElapsed"]) number2(visitor[key], 0, 1e10, "\uC0C1\uC778 \uC774\uB3D9 \uC2DC\uAC04");
    if (!record5(visitor.stock) || Object.keys(visitor.stock).length !== Object.keys(INITIAL_STOCK).length) fail("\uC0C1\uC778 \uC7AC\uACE0 \uBAA9\uB85D");
    for (const type of Object.keys(INITIAL_STOCK)) integer(visitor.stock[type], 0, 1e8, "\uC0C1\uC778 \uC7AC\uACE0");
    integer(visitor.silver, 0, 1e8, "\uC0C1\uC778 \uC740\uD654");
    return true;
  }

  // dist/engine.js?v=4.0.0
  var RESEARCH = Object.freeze({
    electricity: { label: "\uC804\uAE30 \uACF5\uD559", points: 100, requires: [], description: "\uD0DC\uC591\uAD11\uACFC \uCD95\uC804\uC9C0\uB97C \uC804\uB825\uC120\uC73C\uB85C \uC5F0\uACB0\uD574 \uC815\uCC29\uC9C0\uC5D0 \uC804\uAE30\uB97C \uACF5\uAE09\uD569\uB2C8\uB2E4.", unlocks: ["solar", "battery", "conduit", "heater"] },
    refrigeration: { label: "\uB0C9\uC7A5 \uBCF4\uAD00", points: 140, requires: ["electricity"], description: "\uBC00\uD3D0\uB41C \uBC29\uC744 \uC2DD\uD788\uB294 \uB0C9\uAC01\uAE30\uB97C \uD574\uAE08\uD569\uB2C8\uB2E4. \uC800\uC628 \uCC3D\uACE0\uB294 \uC74C\uC2DD\uC758 \uBD80\uD328\uB97C \uB2A6\uCDA5\uB2C8\uB2E4.", unlocks: ["cooler"] },
    communications: { label: "\uC7A5\uAC70\uB9AC \uD1B5\uC2E0", points: 180, requires: ["electricity"], description: "\uC804\uB825\uC744 \uACF5\uAE09\uBC1B\uB294 \uAD6C\uC870 \uC2E0\uD638\uAE30\uB97C \uAC74\uC124\uD574 \uAD6C\uC870\uC120\uC744 \uBD80\uB985\uB2C8\uB2E4.", unlocks: ["beacon"] }
  });
  var BUILDINGS = Object.freeze({
    wall: { label: "\uB098\uBB34 \uBCBD", cost: { wood: 3 }, work: 3, hp: 160 },
    door: { label: "\uBB38", cost: { wood: 5 }, work: 4, hp: 120 },
    bed: { label: "\uCE68\uB300", cost: { wood: 10 }, work: 6, hp: 80 },
    stove: { label: "\uC870\uB9AC\uB300", cost: { wood: 16, steel: 8 }, work: 9, hp: 120 },
    sandbag: { label: "\uBC29\uBCBD", cost: { wood: 6 }, work: 4, hp: 180 },
    researchbench: { label: "\uC5F0\uAD6C\uB300", cost: { wood: 18, steel: 8 }, work: 8, hp: 100 },
    horseshoes: { label: "\uACE0\uB9AC \uB358\uC9C0\uAE30", cost: { wood: 12, steel: 4 }, work: 6, hp: 80 },
    workbench: { label: "\uC81C\uC791 \uC791\uC5C5\uB300", cost: { wood: 20, steel: 8 }, work: 10, hp: 120 },
    beacon: { label: "\uAD6C\uC870 \uC2E0\uD638\uAE30", cost: { wood: 40, steel: 40 }, work: 20, hp: 200, tech: "communications" },
    ...SYSTEM_BUILDINGS
  });
  var RESOURCE_LABELS = Object.freeze({ wood: "\uBAA9\uC7AC", steel: "\uAC15\uCCA0", rawfood: "\uC2DD\uC7AC\uB8CC", meals: "\uC2DD\uC0AC", medicine: "\uC57D\uD488", ...EXTRA_RESOURCE_LABELS });
  var JOB_LABELS = Object.freeze({ doctor: "\uCE58\uB8CC", rescue: "\uAD6C\uC870", firefight: "\uC18C\uBC29", build: "\uAC74\uC124", grow: "\uB18D\uC0AC", cook: "\uC870\uB9AC", haul: "\uC6B4\uBC18", harvest: "\uCC44\uC9D1", mine: "\uCC44\uAD11", research: "\uC5F0\uAD6C", craft: "\uC81C\uC791" });
  var KEYS = Object.keys(RESOURCE_LABELS);
  var WORK = Object.keys(JOB_LABELS);
  var STEP = 0.1;
  var DAY2 = 120;
  var LEGACY_KEYS = ["wood", "steel", "rawfood", "meals", "medicine"];
  var clamp5 = (n, a, b) => Math.max(a, Math.min(b, n));
  var dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  var copy = (v) => JSON.parse(JSON.stringify(v));
  var validInt = (n) => Number.isInteger(n) && Number.isFinite(n);
  var DIRS3 = [[0, -1], [1, 0], [0, 1], [-1, 0]];
  var ColonyGame = class _ColonyGame {
    constructor(options = {}) {
      const seed = validInt(options.seed) ? options.seed : 72831;
      const difficulty = options.difficulty === "relaxed" ? "relaxed" : "standard";
      this.state = {
        version: 4,
        seed,
        width: 48,
        height: 32,
        time: 0,
        difficulty,
        tiles: [],
        colonists: [],
        raiders: [],
        items: [],
        resources: { wood: 70, steel: 24, rawfood: 26, meals: 12, medicine: 5 },
        effects: [],
        logs: [],
        stats: { harvested: 0, buildingsBuilt: 0, mealsCooked: 0, raidersDefeated: 0, survivedRaids: 0 },
        weather: "clear",
        nextRaidAt: difficulty === "relaxed" ? 340 : 210,
        beaconProgress: 0,
        victory: false,
        gameOver: false,
        autoCook: true,
        mealTarget: 20,
        rngState: seed >>> 0 || 184631,
        nextId: 1,
        accumulator: 0,
        systemTimer: 0,
        weatherTimer: 0,
        raidNumber: 0,
        activeRaid: false,
        reservations: {},
        lastAlerts: {},
        autoRepair: true,
        extractionAlarmTriggered: false,
        research: { active: "electricity", progress: { electricity: 0, refrigeration: 0, communications: 0 }, unlocked: [] }
      };
      this._generateMap();
      this._createColonists();
      initializeSystems(this);
      initializeLife(this);
      initializeHazards(this);
      initializeIndustry(this);
      initializeTrade(this);
      this._log("info", "\uC0C8\uB85C\uC6B4 \uC2DC\uC791", "\uAC70\uCC98\uC758 \uB3D9\uCABD\uACFC \uB0A8\uCABD \uD2C8\uC744 \uBB38\uC774\uB098 \uBCBD\uC73C\uB85C \uB9C9\uC73C\uC138\uC694. \uC2E4\uB0B4 \uCE68\uB300, \uC5F0\uAD6C, \uC804\uB825\uC73C\uB85C \uAD6C\uC870 \uC2E0\uD638\uB97C \uC900\uBE44\uD569\uB2C8\uB2E4.");
      this._log("info", "\uC790\uC728 \uC791\uC5C5 \uC2DC\uC791", "\uD45C\uC2DC\uB41C \uB098\uBB34\uC640 \uAD11\uC11D\uC744 \uCC44\uC9D1\uD558\uACE0, \uCC3D\uACE0\uB85C \uB098\uB978 \uB4A4 \uC870\uB9AC\uD569\uB2C8\uB2E4. \uC8FC\uBBFC\uC744 \uC120\uD0DD\uD558\uBA74 \uC5C5\uBB34\uB97C \uC870\uC815\uD560 \uC218 \uC788\uC2B5\uB2C8\uB2E4.");
    }
    _rand() {
      let x = this.state.rngState >>> 0;
      x ^= x << 13;
      x ^= x >>> 17;
      x ^= x << 5;
      this.state.rngState = x >>> 0;
      return (x >>> 0) / 4294967296;
    }
    _id(prefix) {
      return `${prefix}_${this.state.nextId++}`;
    }
    tile(x, y) {
      if (!validInt(x) || !validInt(y) || x < 0 || y < 0 || x >= this.state.width || y >= this.state.height) return null;
      return this.state.tiles[y * this.state.width + x] || null;
    }
    _generateMap() {
      const s = this.state;
      for (let y = 0; y < s.height; y++) for (let x = 0; x < s.width; x++) {
        const river = 8 + Math.sin(y * 0.23) * 2.1;
        let terrain = Math.abs(x - river) < 1.35 ? "water" : this._rand() < 0.09 ? "soil" : "grass";
        if (y >= 15 && y <= 17 && Math.abs(x - river) < 1.65) terrain = "stone";
        let feature = null, amount = 0;
        if (terrain !== "water") {
          const r = this._rand();
          if (r < 0.14) {
            feature = "tree";
            amount = 10 + Math.floor(this._rand() * 7);
          } else if (r < 0.18) {
            feature = "berry";
            amount = 8 + Math.floor(this._rand() * 5);
          } else if (r < 0.215) {
            feature = "ore";
            amount = 14 + Math.floor(this._rand() * 7);
            terrain = "stone";
          }
        }
        if (x >= 17 && x <= 29 && y >= 10 && y <= 22) {
          feature = null;
          amount = 0;
          terrain = "grass";
        }
        s.tiles.push({ x, y, terrain, feature, amount, zone: null, crop: null, building: null, designation: null });
      }
      for (let y = 17; y <= 18; y++) for (let x = 20; x <= 22; x++) this.tile(x, y).zone = "stockpile";
      for (let y = 18; y <= 19; y++) for (let x = 29; x <= 31; x++) {
        const t = this.tile(x, y);
        t.terrain = "soil";
        t.feature = null;
        t.amount = 0;
        t.zone = "farm";
        t.crop = x === 29 ? { growth: 0.5 } : null;
      }
      const put = (x, y, type) => {
        const t = this.tile(x, y);
        t.feature = null;
        t.amount = 0;
        t.building = { id: this._id("building"), type, hp: BUILDINGS[type].hp, maxHp: BUILDINGS[type].hp, progress: 1, complete: true, paidCost: {}, materials: {}, refunded: false };
      };
      for (let x = 19; x <= 27; x++) put(x, 11, x === 23 ? "door" : "wall");
      for (let y = 12; y <= 15; y++) put(19, y, "wall");
      for (let y = 12; y <= 19; y++) if (!this.tile(19, y).building) put(19, y, "wall");
      for (let y = 12; y <= 19; y++) if (y !== 16) put(27, y, "wall");
      for (let x = 20; x <= 26; x++) if (x !== 23) put(x, 19, "wall");
      put(21, 13, "bed");
      put(23, 13, "bed");
      put(25, 14, "stove");
      put(24, 17, "researchbench");
      [[16, 15, "tree", 14, "chop"], [16, 18, "tree", 14, "chop"], [30, 14, "ore", 18, "mine"], [32, 15, "ore", 18, "mine"], [26, 23, "berry", 12, "harvest"], [28, 24, "berry", 10, "harvest"]].forEach(([x, y, feature, amount, designation]) => {
        const t = this.tile(x, y);
        t.terrain = feature === "ore" ? "stone" : "grass";
        t.feature = feature;
        t.amount = amount;
        t.designation = designation;
      });
    }
    _createColonists() {
      const people = [
        ["\uC11C\uC724", "\uAC74\uCD95\uAC00", "#edb86c", 22.5, 15.5, { doctor: 4, build: 12, grow: 4, cook: 5, haul: 7, harvest: 6, mine: 10, shoot: 9 }, { doctor: 2, build: 1, grow: 4, cook: 3, haul: 2, harvest: 3, mine: 2 }],
        ["\uB3C4\uD604", "\uAC1C\uCC99\uC790", "#7dc1b3", 24.5, 16.5, { doctor: 5, build: 5, grow: 12, cook: 10, haul: 6, harvest: 9, mine: 4, shoot: 8 }, { doctor: 2, build: 3, grow: 1, cook: 1, haul: 2, harvest: 2, mine: 3 }],
        ["\uBBF8\uB098", "\uC758\uBB34\uAD00", "#a9ace7", 22.5, 18.5, { doctor: 12, build: 4, grow: 5, cook: 6, haul: 10, harvest: 10, mine: 7, shoot: 12 }, { doctor: 1, build: 3, grow: 3, cook: 3, haul: 1, harvest: 2, mine: 2 }]
      ];
      for (const [name, role, color, x, y, skills, priorities] of people) {
        skills.research = name === "\uBBF8\uB098" ? 10 : name === "\uB3C4\uD604" ? 7 : 6;
        priorities.research = name === "\uBBF8\uB098" ? 2 : 4;
        this.state.colonists.push({ id: this._id("colonist"), name, role, color, x, y, health: 100, hunger: 76, energy: 83, mood: 78, bleed: 0, dead: false, drafted: false, status: "\uC8FC\uBCC0 \uC0B4\uD53C\uB294 \uC911", skills, priorities, job: null, path: [], carry: null, destination: null, thinkAt: 0, shotCooldown: 0, order: null, blockedTargets: {}, breakUntil: 0, nextBreakAt: 80 });
      }
    }
    _log(kind, title, text) {
      this.state.logs.unshift({ id: this._id("log"), time: this.state.time, kind, title, text });
      if (this.state.logs.length > 80) this.state.logs.length = 80;
    }
    _effect(kind, x, y, tx = x, ty = y, color = "#f5c875", text = "") {
      this.state.effects.push({ kind, x, y, tx, ty, age: 0, life: kind === "shot" ? 0.22 : 0.85, color, text });
      if (this.state.effects.length > 100) this.state.effects.splice(0, this.state.effects.length - 100);
    }
    _wake() {
      for (const c of this.state.colonists) c.thinkAt = 0;
    }
    _walkable(x, y, raider = false) {
      const t = this.tile(x, y);
      return !!t && t.terrain !== "water" && !(t.building?.complete && (t.building.type === "wall" || raider && t.building.type === "door"));
    }
    _pathTo(actor, tx, ty, adjacent = false, raider = false) {
      const s = this.state, startX = Math.floor(actor.x), startY = Math.floor(actor.y), start = startY * s.width + startX;
      if (!this.tile(tx, ty) || !this.tile(startX, startY)) return null;
      const baseGoals = [];
      if (adjacent) {
        for (const [dx, dy] of DIRS3) if (this._walkable(tx + dx, ty + dy, raider)) baseGoals.push((ty + dy) * s.width + tx + dx);
      } else if (this._walkable(tx, ty, raider)) baseGoals.push(ty * s.width + tx);
      for (const avoidFire of !actor.drafted && !raider ? [true, false] : [false]) {
        const goals = baseGoals.filter((i) => !avoidFire || !(s.tiles[i].fire > 0.15));
        if (goals.includes(start)) return [];
        if (!goals.length) continue;
        const prev = new Int32Array(s.tiles.length);
        prev.fill(-2);
        prev[start] = -1;
        const q = new Int32Array(s.tiles.length);
        let head = 0, tail = 0;
        q[tail++] = start;
        let found = -1;
        while (head < tail) {
          const k = q[head++], x = k % s.width, y = Math.floor(k / s.width);
          for (const [dx, dy] of DIRS3) {
            const nx = x + dx, ny = y + dy;
            if (!this._walkable(nx, ny, raider)) continue;
            const n = ny * s.width + nx;
            if (prev[n] !== -2 || avoidFire && s.tiles[n].fire > 0.15) continue;
            prev[n] = k;
            if (goals.includes(n)) {
              found = n;
              head = tail;
              break;
            }
            q[tail++] = n;
          }
        }
        if (found >= 0) {
          const path = [];
          for (let k = found; k !== start; k = prev[k]) path.push({ x: k % s.width, y: Math.floor(k / s.width) });
          return path.reverse();
        }
      }
      return null;
    }
    _goto(actor, x, y, adjacent = false, raider = false) {
      const path = this._pathTo(actor, x, y, adjacent, raider);
      if (path === null) return false;
      actor.path = path;
      actor.destination = { x, y, adjacent, raider };
      return true;
    }
    _moveAlong(actor, dt, speed) {
      if (!actor.path?.length) return true;
      const next = actor.path[0];
      if (!actor.drafted && !actor.destination?.raider && actor.blockedTargets && this.tile(next.x, next.y)?.fire > 0.15 && this.state.time >= (actor.blockedTargets["fire-route-check"] || 0)) {
        actor.blockedTargets["fire-route-check"] = this.state.time + 1.5;
        const d = actor.destination;
        if (d) {
          const route = this._pathTo(actor, d.x, d.y, d.adjacent, d.raider);
          if (route !== null) actor.path = route;
        }
        if (!actor.path.length) return true;
      }
      let travel = speed * dt;
      while (travel > 0 && actor.path.length) {
        const p = actor.path[0];
        if (!this._walkable(p.x, p.y, actor.destination?.raider)) {
          const d2 = actor.destination;
          if (!d2 || !this._goto(actor, d2.x, d2.y, d2.adjacent, d2.raider)) {
            actor.path = [];
            return null;
          }
          if (!actor.path.length) return true;
          continue;
        }
        const gx = p.x + 0.5, gy = p.y + 0.5, d = Math.hypot(gx - actor.x, gy - actor.y);
        if (d <= travel + 1e-6) {
          actor.x = gx;
          actor.y = gy;
          travel -= d;
          actor.path.shift();
        } else {
          actor.x += (gx - actor.x) / d * travel;
          actor.y += (gy - actor.y) / d * travel;
          travel = 0;
        }
      }
      return !actor.path.length;
    }
    _stockpileSpot(actor) {
      const spots = this.state.tiles.filter((t) => t.zone === "stockpile" && this._walkable(t.x, t.y)).sort((a, b) => Math.hypot(a.x + 0.5 - actor.x, a.y + 0.5 - actor.y) - Math.hypot(b.x + 0.5 - actor.x, b.y + 0.5 - actor.y));
      for (const t of spots.slice(0, 18)) {
        const path = this._pathTo(actor, t.x, t.y);
        if (path !== null) return { x: t.x, y: t.y, path };
      }
      return null;
    }
    _reserve(key, owner) {
      const r = this.state.reservations[key];
      if (r && r.owner !== owner) return false;
      this.state.reservations[key] = { owner, target: key, quantity: 1, expiry: this.state.time + 45 };
      return true;
    }
    _reserved(key, owner) {
      return this.state.reservations[key] && this.state.reservations[key].owner !== owner;
    }
    _dropItem(type, count, x, y, freshness = 1) {
      if (!KEYS.includes(type) || count <= 0) return;
      x = clamp5(Math.floor(x), 0, this.state.width - 1);
      y = clamp5(Math.floor(y), 0, this.state.height - 1);
      const old = this.state.items.find((i) => i.x === x && i.y === y && i.type === type && !i.reservedBy);
      const food = type === "rawfood" || type === "meals";
      if (old) {
        old.count += count;
        if (food) old.freshness = Math.min(old.freshness ?? 1, clamp5(freshness, 0, 1));
      } else this.state.items.push({ id: this._id("item"), x, y, type, count, reservedBy: null, ...food ? { freshness: clamp5(freshness, 0, 1) } : {} });
    }
    _bedAvailable(t, patient = null, worker = null) {
      const b = t?.building;
      if (!b?.complete || b.type !== "bed" || t.fire > 0) return false;
      return !this.state.colonists.some((c) => !c.dead && c.id !== patient?.id && (c.patientBedId === b.id || c.id !== worker?.id && (c.job?.type === "rescue" && c.job.bedId === b.id || c.job?.type === "rest" && c.job.targetId === b.id)));
    }
    _dropCarriedPawn(c) {
      const p = this.state.colonists.find((p2) => p2.id === c.carryingPawnId);
      c.carryingPawnId = null;
      if (!p) return;
      p.carriedBy = null;
      p.patientBedId = null;
      p.x = c.x;
      p.y = c.y;
      const x = Math.floor(c.x), y = Math.floor(c.y);
      if (!this._walkable(x, y) || this.tile(x, y)?.fire > 0.15) {
        for (const [dx, dy] of DIRS3) {
          const t = this.tile(x + dx, y + dy);
          if (t && this._walkable(t.x, t.y) && !(t.fire > 0.15)) {
            p.x = t.x + 0.5;
            p.y = t.y + 0.5;
            break;
          }
        }
      }
      if (!p.dead) p.status = "\uAD6C\uC870 \uC911\uB2E8 \xB7 \uCE58\uB8CC\uC640 \uCE68\uC0C1 \uD544\uC694";
    }
    _syncCarried(c) {
      const p = this.state.colonists.find((p2) => p2.id === c.carryingPawnId);
      if (p && p.carriedBy === c.id) {
        p.x = c.x;
        p.y = c.y;
      }
    }
    _downPawn(c) {
      if (c.dead) return;
      if (c.job || c.order || c.drafted || c.carry || c.carryingPawnId) this._releaseJob(c);
      c.drafted = false;
      c.order = null;
      c.path = [];
      c.destination = null;
      c.status = c.carriedBy ? "\uAD6C\uC870\uB418\uC5B4 \uC774\uB3D9 \uC911" : c.patientBedId ? "\uCE68\uC0C1 \uC548\uC815 \xB7 \uAC04\uD638 \uD544\uC694" : "\uC4F0\uB7EC\uC9D0 \xB7 \uAD6C\uC870\uC640 \uCE58\uB8CC \uD544\uC694";
    }
    _onBuildingDestroyed(building, tile, reason = "destroyed") {
      for (const c of this.state.colonists) {
        if (c.job?.targetId === building.id || c.job?.bedId === building.id) this._releaseJob(c);
        if (c.patientBedId === building.id) {
          c.patientBedId = null;
          if (!c.dead) c.status = "\uCE68\uC0C1\uC774 \uC5C6\uC5B4 \uAD6C\uC870\uB97C \uAE30\uB2E4\uB9BD\uB2C8\uB2E4";
        }
        c.thinkAt = 0;
      }
    }
    _releaseJob(c, dropCarry = true) {
      if (c.carryingPawnId) this._dropCarriedPawn(c);
      if (c.job?.type === "craft" && c.job.materials) {
        const staged = c.job.materials;
        c.job.materials = {};
        for (const [type, count] of Object.entries(staged)) this._dropItem(type, count, c.job.tx, c.job.ty);
      }
      for (const [key, r] of Object.entries(this.state.reservations)) if (r.owner === c.id) delete this.state.reservations[key];
      for (const i of this.state.items) if (i.reservedBy === c.id) i.reservedBy = null;
      if (c.carry && dropCarry && c.carry.source !== "construction") this._dropItem(c.carry.type, c.carry.count, c.x, c.y, c.carry.freshness ?? 1);
      c.carry = null;
      c.job = null;
      c.path = [];
      c.destination = null;
    }
    _finish(c) {
      this._releaseJob(c);
      c.thinkAt = this.state.time + 0.15;
      c.status = "\uB2E4\uC74C \uC791\uC5C5 \uD655\uC778";
    }
    _fail(c, reason, key) {
      if (key) c.blockedTargets[key] = this.state.time + 8;
      this._releaseJob(c);
      c.status = reason;
      c.thinkAt = this.state.time + 1;
    }
    _job(c, job, x = job.tx, y = job.ty, adjacent = false) {
      const key = job.key;
      if (key && (this._reserved(key, c.id) || (c.blockedTargets[key] || 0) > this.state.time)) return false;
      const path = this._pathTo(c, x, y, adjacent);
      if (path === null) {
        if (key) c.blockedTargets[key] = this.state.time + 8;
        return false;
      }
      if (key && !this._reserve(key, c.id)) return false;
      c.job = { progress: 0, total: 1, stage: "work", targetId: null, ...job };
      c.path = path;
      c.destination = { x, y, adjacent, raider: false };
      return true;
    }
    _nearest(c, list) {
      return list.sort((a, b) => Math.hypot(a.x + 0.5 - c.x, a.y + 0.5 - c.y) - Math.hypot(b.x + 0.5 - c.x, b.y + 0.5 - c.y));
    }
    _countFood(type = "meals") {
      return (this.state.resources[type] || 0) + this.state.items.filter((i) => i.type === type).reduce((n, i) => n + i.count, 0) + this.state.colonists.filter((c) => !c.dead && c.carry?.type === type && c.carry.source !== "construction").reduce((n, c) => n + c.carry.count, 0);
    }
    _tryEat(c) {
      for (const type of ["meals", "rawfood"]) {
        if (this.state.resources[type] > 0) {
          const spot = this._stockpileSpot(c);
          if (spot && this._job(c, { type: "eat", tx: spot.x, ty: spot.y, total: 1.5, stage: "fetch", foodType: type, source: "stock" }, spot.x, spot.y)) {
            c.status = type === "meals" ? "\uC2DD\uC0AC\uD558\uB7EC \uC774\uB3D9" : "\uBE44\uC0C1 \uC2DD\uC7AC\uB8CC\uB85C \uD5C8\uAE30 \uB2EC\uB798\uAE30";
            return true;
          }
        }
        const items = this._nearest(c, this.state.items.filter((i) => i.type === type && i.count > 0 && !i.reservedBy));
        for (const item of items.slice(0, 8)) if (this._job(c, { type: "eat", tx: item.x, ty: item.y, targetId: item.id, key: `item:${item.id}`, total: 1.5, stage: "fetch", foodType: type, source: "item" })) {
          item.reservedBy = c.id;
          c.status = "\uAC00\uAE4C\uC6B4 \uC74C\uC2DD\uC744 \uBA39\uC73C\uB7EC \uC774\uB3D9";
          return true;
        }
      }
      if (c.hunger < 27) {
        const berries = this._nearest(c, this.state.tiles.filter((t) => t.feature === "berry" && t.amount > 0));
        for (const t of berries.slice(0, 8)) if (this._job(c, { type: "harvest", tx: t.x, ty: t.y, key: `feature:${t.x},${t.y}`, action: "forageeat", total: 3 }, t.x, t.y, true)) {
          c.status = "\uBE44\uC0C1 \uC2DD\uB7C9 \uCC44\uC9D1";
          return true;
        }
      }
      return false;
    }
    _tryRest(c, allowGround = false) {
      const beds = this._nearest(c, this.state.tiles.filter((t) => this._bedAvailable(t, c, c) && (!t.building.medical || c.health < 78)));
      for (const t of beds) if (this._job(c, { type: "rest", tx: t.x, ty: t.y, targetId: t.building.id, key: `bed:${t.building.id}`, total: 1, recovering: c.health < 38 })) {
        c.status = "\uCE68\uB300\uB85C \uC774\uB3D9";
        return true;
      }
      if (allowGround || c.energy < 12 || c.health < 30) {
        const ground = this._nearest(c, this.state.tiles.filter((t) => !(t.fire > 0) && this._walkable(t.x, t.y) && Math.hypot(t.x + 0.5 - c.x, t.y + 0.5 - c.y) <= 3));
        for (const t of ground.slice(0, 12)) if (this._job(c, { type: "rest", tx: t.x, ty: t.y, total: 1, ground: true })) {
          c.status = "\uC548\uC804\uD55C \uBC14\uB2E5\uC5D0\uC11C \uD734\uC2DD";
          return true;
        }
      }
      return false;
    }
    _plan(c, job, x = job.tx, y = job.ty, adjacent = false, status = "", forced = false) {
      if (job.key && (this._reserved(job.key, c.id) || !forced && (c.blockedTargets[job.key] || 0) > this.state.time)) return null;
      const path = this._pathTo(c, x, y, adjacent);
      if (path === null) {
        if (job.key && !forced) c.blockedTargets[job.key] = this.state.time + 8;
        return null;
      }
      return { job, x, y, adjacent, path, status };
    }
    _carePlan(c, p, kind = "doctor", forced = false) {
      if (!p || p.dead || p.carriedBy || c.carriedBy || c.carryingPawnId) return null;
      if (this._reserved(`patient:${p.id}`, c.id) || this._pathTo(c, Math.floor(p.x), Math.floor(p.y), p.id !== c.id) === null) return null;
      if (kind === "feed") {
        if (p.id === c.id || p.hunger >= 35 || !(p.health < 15 || p.patientBedId)) return null;
        const foodType = ["meals", "rawfood"].find((type) => this.state.resources[type] > 0), spot2 = foodType ? this._stockpileSpot(c) : null;
        if (!spot2) return null;
        return this._plan(c, { type: "feed", tx: Math.floor(p.x), ty: Math.floor(p.y), targetId: p.id, key: `patient:${p.id}`, total: 2.5, stage: "fetch", foodType }, spot2.x, spot2.y, false, `${p.name}\uC758 \uC2DD\uC0AC \uC900\uBE44`, forced);
      }
      if (p.health >= 100 && p.bleed <= 0) return null;
      const spot = this.state.resources.medicine > 0 ? this._stockpileSpot(c) : null;
      const job = { type: "doctor", tx: Math.floor(p.x), ty: Math.floor(p.y), targetId: p.id, key: `patient:${p.id}`, total: spot ? 5 : 8, stage: spot ? "fetch" : "work", usesMedicine: !!spot };
      return this._plan(c, job, spot ? spot.x : job.tx, spot ? spot.y : job.ty, !spot && p.id !== c.id, spot ? "\uCE58\uB8CC \uC57D\uD488 \uC900\uBE44" : `${p.name} \uC751\uAE09 \uCC98\uCE58`, forced);
    }
    _rescuePlan(c, p, forced = false) {
      if (!p || p.id === c.id || p.dead || p.health >= 15 || p.carriedBy || p.patientBedId || c.carriedBy || c.carryingPawnId || this._reserved(`patient:${p.id}`, c.id)) return null;
      const beds = this.state.tiles.filter((t) => this._bedAvailable(t, p, c)).sort((a, b) => Number(b.building.medical) - Number(a.building.medical) || dist({ x: a.x + 0.5, y: a.y + 0.5 }, p) - dist({ x: b.x + 0.5, y: b.y + 0.5 }, p));
      for (const bed of beds) {
        if (this._pathTo(p, bed.x, bed.y) === null) continue;
        const job = { type: "rescue", tx: Math.floor(p.x), ty: Math.floor(p.y), targetId: p.id, bedId: bed.building.id, key: `patient:${p.id}`, total: 1, stage: "pickup" };
        const plan = this._plan(c, job, job.tx, job.ty, true, `${p.name} \uAD6C\uC870\uD558\uB7EC \uC774\uB3D9`, forced);
        if (plan) return plan;
      }
      return null;
    }
    _firePlan(c) {
      const people = this.state.colonists.filter((p) => !p.dead), score = (t) => (t.building ? 80 : 0) + (t.crop ? 40 : 0) + (people.some((p) => Math.hypot(p.x - t.x - 0.5, p.y - t.y - 0.5) < 4) ? 60 : 0) - Math.hypot(c.x - t.x - 0.5, c.y - t.y - 0.5);
      const fires = this.state.tiles.filter((t) => t.fire > 0).sort((a, b) => score(b) - score(a));
      for (const t of fires.slice(0, 16)) {
        const plan = this._plan(c, { type: "firefight", tx: t.x, ty: t.y, key: `fire:${t.x},${t.y}`, total: 1 }, t.x, t.y, true, "\uBD88\uC744 \uB044\uB7EC \uC774\uB3D9");
        if (plan) return plan;
      }
      return null;
    }
    _emergencyPlan(c) {
      const patients = this.state.colonists.filter((p) => !p.dead && !p.carriedBy).sort((a, b) => b.bleed * 300 + (100 - b.health) - (a.bleed * 300 + (100 - a.health)));
      if (c.priorities.doctor > 0) {
        for (const p of patients) if (p.health < 25 && p.bleed > 0.1) {
          const plan = this._carePlan(c, p);
          if (plan) return plan;
        }
        for (const p of patients) if (p.hunger < 20 && (p.health < 15 || p.patientBedId)) {
          const plan = this._carePlan(c, p, "feed");
          if (plan) return plan;
        }
      }
      if (c.priorities.rescue > 0) for (const p of patients) {
        const plan = this._rescuePlan(c, p);
        if (plan) return plan;
      }
      if (c.priorities.firefight > 0) return this._firePlan(c);
      return null;
    }
    _startPlan(c, plan, { forced = false, interrupt = false } = {}) {
      if (!plan) return false;
      if (interrupt || forced) this._releaseJob(c);
      if (forced && plan.job.key) delete c.blockedTargets[plan.job.key];
      if (!this._job(c, { ...plan.job, forced }, plan.x, plan.y, plan.adjacent)) return false;
      c.status = plan.status;
      return true;
    }
    _tryRecreate(c) {
      const posts = this._nearest(c, this.state.tiles.filter((t) => t.building?.complete && t.building.type === "horseshoes" && !(t.fire > 0)));
      for (const t of posts) if (this._job(c, { type: "recreate", tx: t.x, ty: t.y, targetId: t.building.id, key: `leisure:${t.building.id}`, total: 90 }, t.x, t.y, true)) {
        c.status = "\uACE0\uB9AC \uB358\uC9C0\uAE30 \uD558\uB7EC \uC774\uB3D9";
        return true;
      }
      const candidates = this._nearest(c, this.state.tiles.filter((t) => !t.roofed && !(t.fire > 0) && this._walkable(t.x, t.y) && Math.hypot(t.x + 0.5 - c.x, t.y + 0.5 - c.y) <= 3));
      for (const t of candidates.slice(0, 8)) if (this._job(c, { type: "recreate", tx: t.x, ty: t.y, total: 90, ground: true })) {
        c.status = "\uC0B0\uCC45\uACFC \uC870\uC6A9\uD55C \uD734\uC2DD";
        return true;
      }
      if (this._job(c, { type: "recreate", tx: Math.floor(c.x), ty: Math.floor(c.y), total: 90, ground: true })) {
        c.status = "\uC7A0\uC2DC \uC26C\uBA70 \uC5EC\uAC00";
        return true;
      }
      return false;
    }
    _scheduleMode(c) {
      return c.schedule[Math.floor((8 + this.state.time / DAY2 * 24) % 24)];
    }
    _scheduleRelease(c) {
      if (c.job && !c.job.forced && !["doctor", "feed", "rescue", "firefight"].includes(c.job.type) && !(c.job.type === "eat" && c.hunger < 25) && !(c.job.type === "rest" && c.energy < 12)) this._releaseJob(c);
      c.thinkAt = 0;
    }
    _tileJobPlan(c, t) {
      if (!t) return null;
      const s = this.state, b = t.building;
      let job, x = t.x, y = t.y, adjacent = false, status = "";
      if (t.fire > 0) {
        job = { type: "firefight", tx: t.x, ty: t.y, key: `fire:${t.x},${t.y}`, total: 1 };
        adjacent = true;
        status = "\uC6B0\uC120 \uC9C4\uD654";
      } else if (b && !b.complete) {
        const needed = Object.keys(b.paidCost).some((k) => (b.materials[k] || 0) < b.paidCost[k]);
        const spot = needed ? this._stockpileSpot(c) : null;
        if (needed && !spot) return null;
        job = { type: "build", tx: t.x, ty: t.y, targetId: b.id, key: `build:${b.id}`, total: BUILDINGS[b.type].work, stage: needed ? "fetch" : "work" };
        if (spot) {
          x = spot.x;
          y = spot.y;
        } else adjacent = true;
        status = `${BUILDINGS[b.type].label} \uC6B0\uC120 \uAC74\uC124`;
        if (this._pathTo(c, t.x, t.y, true) === null) return null;
      } else if (b?.complete && b.hp < b.maxHp - 0.01) {
        const resource = BUILDINGS[b.type].cost.wood ? "wood" : "steel", spot = this._stockpileSpot(c);
        if (!spot || s.resources[resource] < 1 || this._pathTo(c, t.x, t.y, true) === null) return null;
        job = { type: "repair", tx: t.x, ty: t.y, targetId: b.id, key: `repair:${b.id}`, total: 4, stage: "fetch", resource };
        x = spot.x;
        y = spot.y;
        status = `${BUILDINGS[b.type].label} \uC218\uB9AC \uC790\uC7AC \uC900\uBE44`;
      } else if (t.zone === "farm" && !b && !t.feature && (!t.crop || t.crop.growth >= 1)) {
        job = { type: "grow", tx: t.x, ty: t.y, key: `crop:${t.x},${t.y}`, total: 3, action: t.crop ? "reap" : "sow" };
        status = t.crop ? "\uC791\uBB3C \uC6B0\uC120 \uC218\uD655" : "\uC6B0\uC120 \uD30C\uC885";
      } else if (t.designation && t.feature && t.amount > 0) {
        job = { type: t.designation === "mine" ? "mine" : "harvest", tx: t.x, ty: t.y, key: `feature:${t.x},${t.y}`, action: t.designation, total: t.feature === "ore" ? 6 : t.feature === "tree" ? 5 : 3 };
        adjacent = true;
        status = "\uC9C0\uC815 \uC790\uC6D0 \uC6B0\uC120 \uC791\uC5C5";
      } else return null;
      if (this._reserved(job.key, c.id)) return null;
      const path = this._pathTo(c, x, y, adjacent);
      if (path === null) return null;
      return { job, x, y, adjacent, path, status };
    }
    _startTilePlan(c, plan, forced = false) {
      if (!plan) return false;
      if (forced) {
        this._releaseJob(c);
        delete c.blockedTargets[plan.job.key];
      }
      if (!this._job(c, { ...plan.job, forced }, plan.x, plan.y, plan.adjacent)) return false;
      c.status = plan.status;
      return true;
    }
    _craftPlan(c) {
      const s = this.state, benches = this._nearest(c, s.tiles.filter((t) => t.building?.complete && t.building.type === "workbench" && !(t.fire > 0)));
      if (!benches.length) return null;
      const spot = this._stockpileSpot(c);
      if (!spot) return null;
      for (const [recipeId, recipe] of Object.entries(RECIPES)) {
        if (!canStartCraft(s, recipeId)) continue;
        for (const t of benches) {
          if (this._pathTo(c, t.x, t.y, true) === null) continue;
          const job = { type: "craft", recipeId, tx: t.x, ty: t.y, targetId: t.building.id, key: `craft:${t.building.id}`, stage: "fetch", total: recipe.work, materials: {} };
          const plan = this._plan(c, job, spot.x, spot.y, false, `${recipe.label} \uC7AC\uB8CC \uC218\uB839`);
          if (plan) return plan;
        }
      }
      return null;
    }
    _workMultiplier(c, work) {
      return ["build", "repair", "grow", "harvest", "mine", "craft"].includes(work) ? equipmentStats(c).workSpeed : 1;
    }
    _chooseJob(c) {
      const s = this.state, hour = (8 + s.time / DAY2 * 24) % 24, mode = this._scheduleMode(c);
      if (c.hunger < 25 && this._tryEat(c)) return;
      if (c.energy < 12 && this._tryRest(c, true)) return;
      if (this._startPlan(c, this._emergencyPlan(c))) return;
      if (mode !== "work" && c.hunger < 48 && this._tryEat(c)) return;
      if ((c.health < 38 || mode !== "work" && (c.energy < 28 || mode === "anything" && (hour >= 21 || hour < 5) && c.energy < 77)) && this._tryRest(c)) return;
      if (mode === "sleep" && c.energy < 92 && this._tryRest(c, true)) return;
      if (mode === "recreation" && c.recreation < 88 && this._tryRecreate(c)) return;
      const order = WORK.filter((k) => c.priorities[k] > 0).sort((a, b) => c.priorities[a] - c.priorities[b] || WORK.indexOf(a) - WORK.indexOf(b));
      for (const work of order) {
        if (work === "doctor") {
          const patients = s.colonists.filter((p) => !p.dead && !p.carriedBy).sort((a, b) => b.bleed * 200 + (100 - b.health) - (a.bleed * 200 + (100 - a.health)));
          for (const p of patients) if (p.hunger < 35 && (p.health < 15 || p.patientBedId) && this._startPlan(c, this._carePlan(c, p, "feed"))) return;
          for (const p of patients) if ((p.bleed > 0.015 || p.health < 78) && this._startPlan(c, this._carePlan(c, p))) return;
        } else if (work === "rescue") {
          for (const p of s.colonists.filter((p2) => !p2.dead && p2.health < 15)) if (this._startPlan(c, this._rescuePlan(c, p))) return;
        } else if (work === "firefight") {
          if (this._startPlan(c, this._firePlan(c))) return;
        } else if (work === "build") {
          const plans = this._nearest(c, s.tiles.filter((t) => t.building && !t.building.complete));
          for (const t of plans) {
            const b = t.building;
            if (this._reserved(`build:${b.id}`, c.id)) continue;
            const needed = Object.keys(b.paidCost).find((k) => (b.materials[k] || 0) < b.paidCost[k]);
            const spot = needed ? this._stockpileSpot(c) : null;
            if (needed && !spot) continue;
            const job = { type: "build", tx: t.x, ty: t.y, targetId: b.id, key: `build:${b.id}`, total: BUILDINGS[b.type].work, stage: needed ? "fetch" : "work" };
            if (this._job(c, job, spot ? spot.x : t.x, spot ? spot.y : t.y, !spot)) {
              c.status = needed ? "\uAC74\uCD95 \uC790\uC7AC \uAC00\uC9C0\uB7EC \uC774\uB3D9" : `${BUILDINGS[b.type].label} \uAC74\uC124`;
              return;
            }
          }
          if (s.autoRepair) {
            const damaged = this._nearest(c, s.tiles.filter((t) => t.building?.complete && t.building.hp < t.building.maxHp - 0.01 && !(t.fire > 0)));
            for (const t of damaged) if (this._startTilePlan(c, this._tileJobPlan(c, t))) return;
          }
        } else if (work === "grow") {
          const plots = this._nearest(c, s.tiles.filter((t) => t.zone === "farm" && !t.building && !t.feature && !(t.fire > 0) && (!t.crop || t.crop.growth >= 1)));
          for (const t of plots) if (this._job(c, { type: "grow", tx: t.x, ty: t.y, key: `crop:${t.x},${t.y}`, total: 3, action: t.crop ? "reap" : "sow" })) {
            c.status = t.crop ? "\uC791\uBB3C \uC218\uD655" : "\uC528\uC557 \uC2EC\uAE30";
            return;
          }
        } else if (work === "cook" && s.autoCook && s.resources.rawfood >= 2 && this._countFood() < s.mealTarget) {
          const stoves = this._nearest(c, s.tiles.filter((t) => t.building?.complete && t.building.type === "stove" && !(t.fire > 0)));
          for (const t of stoves) {
            if (this._reserved(`stove:${t.building.id}`, c.id)) continue;
            const spot = this._stockpileSpot(c);
            if (spot && this._job(c, { type: "cook", tx: t.x, ty: t.y, key: `stove:${t.building.id}`, targetId: t.building.id, total: 4, stage: "fetch" }, spot.x, spot.y)) {
              c.status = "\uC870\uB9AC \uC7AC\uB8CC \uC900\uBE44";
              return;
            }
          }
        } else if (work === "haul") {
          const items = this._nearest(c, s.items.filter((i) => i.count > 0 && !i.reservedBy && !(this.tile(i.x, i.y)?.fire > 0)));
          for (const item of items.slice(0, 16)) {
            if (!this._stockpileSpot({ x: item.x + 0.5, y: item.y + 0.5 })) continue;
            if (this._job(c, { type: "haul", tx: item.x, ty: item.y, targetId: item.id, key: `item:${item.id}`, stage: "pickup", total: 1 })) {
              item.reservedBy = c.id;
              c.status = `${RESOURCE_LABELS[item.type]} \uC6B4\uBC18`;
              return;
            }
          }
        } else if (work === "harvest" || work === "mine") {
          const tiles = this._nearest(c, s.tiles.filter((t) => t.designation && (work === "mine" ? t.designation === "mine" : t.designation !== "mine") && t.feature && t.amount > 0 && !(t.fire > 0)));
          for (const t of tiles.slice(0, 14)) if (this._job(c, { type: work, tx: t.x, ty: t.y, key: `feature:${t.x},${t.y}`, action: t.designation, total: t.feature === "ore" ? 6 : t.feature === "tree" ? 5 : 3 }, t.x, t.y, true)) {
            c.status = t.feature === "tree" ? "\uB098\uBB34 \uBC8C\uBAA9" : t.feature === "ore" ? "\uAC15\uCCA0 \uCC44\uAD11" : "\uC5F4\uB9E4 \uCC44\uC9D1";
            return;
          }
        } else if (work === "research" && s.research.active) {
          const rid = s.research.active, def = RESEARCH[rid];
          if (!def || s.research.unlocked.includes(rid) || !def.requires.every((id) => s.research.unlocked.includes(id))) continue;
          const benches = this._nearest(c, s.tiles.filter((t) => t.building?.complete && t.building.type === "researchbench" && !(t.fire > 0)));
          for (const t of benches) if (this._job(c, { type: "research", tx: t.x, ty: t.y, targetId: t.building.id, key: `research:${t.building.id}`, researchId: rid, total: def.points }, t.x, t.y, true)) {
            c.status = `${def.label} \uC5F0\uAD6C`;
            return;
          }
        } else if (work === "craft") {
          if (this._startPlan(c, this._craftPlan(c))) return;
        }
      }
      if (c.hunger < 68 && this._tryEat(c)) return;
      if (c.energy < 55 && this._tryRest(c)) return;
      if (c.recreation < 40 && this._tryRecreate(c)) return;
      c.status = "\uC5EC\uC720 \uC2DC\uAC04 \xB7 \uB300\uAE30";
      c.thinkAt = s.time + 1.6;
      const homes = [[22, 15], [24, 16], [24, 18]], home = homes[s.colonists.indexOf(c) % homes.length];
      if (!c.path.length && this._walkable(home[0], home[1]) && Math.hypot(c.x - home[0] - 0.5, c.y - home[1] - 0.5) > 0.2) this._goto(c, home[0], home[1]);
    }
    _tickJob(c, dt) {
      const s = this.state, j = c.job;
      if (!j) return;
      if (j.key && s.reservations[j.key]) s.reservations[j.key].expiry = s.time + 45;
      let t = this.tile(j.tx, j.ty);
      if ((j.type === "doctor" || j.type === "feed") && j.stage === "work") {
        const p = s.colonists.find((p2) => p2.id === j.targetId && !p2.dead);
        if (!p) {
          this._fail(c, "\uCE58\uB8CC \uB300\uC0C1 \uC5C6\uC74C", j.key);
          return;
        }
        if (p.carriedBy) {
          this._fail(c, "\uD658\uC790\uAC00 \uAD6C\uC870\uB418\uC5B4 \uC774\uB3D9 \uC911\uC785\uB2C8\uB2E4", j.key);
          return;
        }
        if (dist(c, p) > 1.7 && (!c.path.length || Math.floor(p.x) !== j.tx || Math.floor(p.y) !== j.ty)) {
          j.tx = Math.floor(p.x);
          j.ty = Math.floor(p.y);
          if (!this._goto(c, j.tx, j.ty, p.id !== c.id)) {
            this._fail(c, "\uD658\uC790\uC5D0\uAC8C \uC811\uADFC\uD560 \uC218 \uC5C6\uC74C", j.key);
            return;
          }
        }
      }
      if (j.type === "rescue") {
        const p = s.colonists.find((p2) => p2.id === j.targetId && !p2.dead), bed = s.tiles.find((t2) => t2.building?.id === j.bedId);
        if (!p || !this._bedAvailable(bed, p, c) || j.stage === "pickup" && (p.health >= 15 || p.carriedBy)) {
          this._fail(c, "\uD658\uC790 \uB610\uB294 \uAD6C\uC870 \uCE68\uC0C1 \uC0C1\uD0DC\uAC00 \uBCC0\uACBD\uB428", j.key);
          return;
        }
        if (j.stage === "deliver" && (c.carryingPawnId !== p.id || p.carriedBy !== c.id)) {
          this._fail(c, "\uD658\uC790 \uC6B4\uBC18 \uC0C1\uD0DC\uB97C \uB2E4\uC2DC \uD655\uC778\uD569\uB2C8\uB2E4", j.key);
          return;
        }
        if (j.stage === "pickup" && (Math.floor(p.x) !== j.tx || Math.floor(p.y) !== j.ty)) {
          j.tx = Math.floor(p.x);
          j.ty = Math.floor(p.y);
          if (!this._goto(c, j.tx, j.ty, true)) {
            this._fail(c, "\uD658\uC790\uC5D0\uAC8C \uC811\uADFC\uD560 \uC218 \uC5C6\uC74C", j.key);
            return;
          }
        }
      }
      const speed = (c.carryingPawnId ? 1.5 : 2.45 + c.skills.haul * 0.025) * clamp5(c.health / 100, 0.48, 1) * (c.energy < 15 ? 0.7 : 1);
      if (c.path.length) {
        const moved = this._moveAlong(c, dt, speed);
        if (moved === null) {
          this._fail(c, "\uC774\uB3D9 \uACBD\uB85C\uB97C \uCC3E\uC744 \uC218 \uC5C6\uC74C", j.key);
          return;
        }
        if (!moved) return;
      }
      const depotPhase = j.stage === "fetch" && (["build", "repair", "cook", "doctor", "feed", "craft", "equip"].includes(j.type) || j.type === "eat" && j.source === "stock") || j.type === "haul" && j.stage === "deliver";
      if (depotPhase && (!c.destination || this.tile(c.destination.x, c.destination.y)?.zone !== "stockpile")) {
        this._fail(c, "\uCC3D\uACE0 \uAD6C\uC5ED\uC774 \uBCC0\uACBD\uB428", j.key);
        return;
      }
      if (j.type === "rest") {
        if (t?.fire > 0) {
          this._fail(c, "\uD734\uC2DD \uC7A5\uC18C\uC5D0 \uBD88\uC774 \uB098 \uB300\uD53C\uD569\uB2C8\uB2E4", j.key);
          return;
        }
        if (!j.ground && (!t?.building?.complete || t.building.id !== j.targetId)) {
          this._fail(c, "\uCE68\uB300\uAC00 \uC5C6\uC5B4 \uD734\uC2DD\uC744 \uB2E4\uC2DC \uACC4\uD68D\uD569\uB2C8\uB2E4", j.key);
          return;
        }
        c.status = j.ground ? "\uBC14\uB2E5\uC5D0\uC11C \uC218\uBA74" : "\uCE68\uB300\uC5D0\uC11C \uC218\uBA74";
        const comfort = clamp5(1 - (c.thermalStress || 0) * 6e-3, 0.4, 1) * (c.sheltered ? 1 : 0.85);
        c.energy = clamp5(c.energy + dt * (j.ground ? 1.7 : 3.3) * comfort, 0, 100);
        if (c.bleed <= 0 && c.hunger > 25) c.health = clamp5(c.health + dt * 0.25, 0, 100);
        if (c.energy >= 98 || c.hunger < 20 && c.energy > 15 || j.recovering && c.health >= 55 && c.energy >= 83) {
          this._finish(c);
        }
        return;
      }
      if (j.type === "rescue") {
        const p = s.colonists.find((p2) => p2.id === j.targetId && !p2.dead), bed = s.tiles.find((t2) => t2.building?.id === j.bedId);
        if (!p || !bed) {
          this._fail(c, "\uAD6C\uC870 \uB300\uC0C1\uC774 \uBCC0\uACBD\uB428", j.key);
          return;
        }
        if (j.stage === "pickup") {
          if (dist(c, p) > 1.8) {
            if (!this._goto(c, Math.floor(p.x), Math.floor(p.y), true)) this._fail(c, "\uD658\uC790\uC5D0\uAC8C \uC811\uADFC\uD560 \uC218 \uC5C6\uC74C", j.key);
            return;
          }
          this._downPawn(p);
          this._releaseJob(p);
          p.carriedBy = c.id;
          p.patientBedId = bed.building.id;
          c.carryingPawnId = p.id;
          this._syncCarried(c);
          j.stage = "deliver";
          j.tx = bed.x;
          j.ty = bed.y;
          c.status = `${p.name}\uC744(\uB97C) \uCE68\uC0C1\uC73C\uB85C \uC6B4\uBC18`;
          p.status = `${c.name}\uC5D0\uAC8C \uAD6C\uC870\uB418\uC5B4 \uC774\uB3D9 \uC911`;
          if (!this._goto(c, bed.x, bed.y)) this._fail(c, "\uCE68\uC0C1\uC73C\uB85C \uC774\uB3D9\uD560 \uC218 \uC5C6\uC74C", j.key);
          return;
        }
        c.carryingPawnId = null;
        p.carriedBy = null;
        p.x = bed.x + 0.5;
        p.y = bed.y + 0.5;
        p.patientBedId = bed.building.id;
        p.status = "\uCE68\uC0C1 \uC548\uC815 \xB7 \uAC04\uD638 \uD544\uC694";
        s.careStats.rescued++;
        this._effect("heal", p.x, p.y, p.x, p.y, "#92d8c3", "\uAD6C\uC870 \uC644\uB8CC");
        this._log("success", "\uCE68\uC0C1\uC73C\uB85C \uAD6C\uC870", `${c.name}\uC774(\uAC00) ${p.name}\uC744(\uB97C) \uCE68\uC0C1\uC73C\uB85C \uC62E\uACBC\uC2B5\uB2C8\uB2E4. \uCE58\uB8CC\uC640 \uAE09\uC2DD \uB2F4\uB2F9\uC774 \uD68C\uBCF5\uC744 \uB3D5\uC2B5\uB2C8\uB2E4.`);
        this._finish(c);
        return;
      }
      if (j.type === "feed") {
        const p = s.colonists.find((p2) => p2.id === j.targetId && !p2.dead && !p2.carriedBy);
        if (!p) {
          this._fail(c, "\uAE09\uC2DD \uB300\uC0C1\uC774 \uBCC0\uACBD\uB428", j.key);
          return;
        }
        if (j.stage === "fetch") {
          const taken = withdrawStock(this, j.foodType, 1);
          if (!taken.ok) {
            this._fail(c, "\uD658\uC790\uC5D0\uAC8C \uC904 \uC74C\uC2DD\uC774 \uBD80\uC871\uD568", j.key);
            return;
          }
          c.carry = { type: j.foodType, count: 1, freshness: taken.freshness };
          j.stage = "work";
          j.tx = Math.floor(p.x);
          j.ty = Math.floor(p.y);
          if (!this._goto(c, j.tx, j.ty, true)) this._fail(c, "\uD658\uC790\uC5D0\uAC8C \uC811\uADFC\uD560 \uC218 \uC5C6\uC74C", j.key);
          return;
        }
        if (c.carry?.type !== j.foodType || c.carry.count !== 1) {
          this._fail(c, "\uAE09\uC2DD \uC74C\uC2DD\uC744 \uB2E4\uC2DC \uC900\uBE44\uD569\uB2C8\uB2E4", j.key);
          return;
        }
        if (dist(c, p) > 1.8) return;
        c.status = `${p.name} \uC2DD\uC0AC \uB3D5\uAE30`;
        j.progress += dt;
        if (j.progress >= j.total) {
          p.hunger = clamp5(p.hunger + (j.foodType === "meals" ? 64 : 30), 0, 100);
          c.carry = null;
          s.careStats.fed++;
          this._effect("heal", p.x, p.y, p.x, p.y, "#e5ca83", "\uAE09\uC2DD");
          this._finish(c);
          p.thinkAt = 0;
        }
        return;
      }
      if (j.type === "firefight") {
        if (!t || !(t.fire > 0)) {
          this._finish(c);
          return;
        }
        c.status = "\uBD88 \uB044\uB294 \uC911";
        const amount = dt * (0.25 + c.skills.firefight * 0.025);
        t.fire = Math.max(0, t.fire - amount);
        j.progress = clamp5(j.progress + amount, 0, 1);
        if (t.fire <= 1e-3) {
          t.fire = 0;
          t.burned = true;
          s.hazards.extinguished++;
          this._effect("build", t.x + 0.5, t.y + 0.5, t.x + 0.5, t.y + 0.5, "#8bcbd1", "\uC9C4\uD654");
          this._finish(c);
          this._wake();
        }
        return;
      }
      if (j.type === "recreate") {
        if (t?.fire > 0 || !j.ground && (!t?.building?.complete || t.building.type !== "horseshoes" || t.building.id !== j.targetId)) {
          this._fail(c, "\uC5EC\uAC00 \uC7A5\uC18C\uB97C \uB2E4\uC2DC \uCC3E\uC2B5\uB2C8\uB2E4", j.key);
          return;
        }
        const comfort = clamp5(1 - (c.thermalStress || 0) * 5e-3, 0.5, 1);
        c.status = j.ground ? "\uC0B0\uCC45\uACFC \uC870\uC6A9\uD55C \uD734\uC2DD" : "\uACE0\uB9AC \uB358\uC9C0\uAE30";
        c.recreation = clamp5(c.recreation + dt * (j.ground ? 0.8 : 3) * comfort, 0, 100);
        c.energy = clamp5(c.energy + dt * 0.25 * comfort, 0, 100);
        j.progress = c.recreation;
        if (c.recreation >= 90) this._finish(c);
        return;
      }
      if (j.type === "haul") {
        if (j.stage === "pickup") {
          const item = s.items.find((i) => i.id === j.targetId && i.reservedBy === c.id);
          if (!item || item.count <= 0) {
            this._fail(c, "\uC6B4\uBC18\uD560 \uBB3C\uD488 \uC5C6\uC74C", j.key);
            return;
          }
          const count = Math.min(item.type === "silver" ? 100 : 12, item.count);
          item.count -= count;
          c.carry = { type: item.type, count, ...["rawfood", "meals"].includes(item.type) ? { freshness: item.freshness ?? 1 } : {} };
          item.reservedBy = null;
          if (item.count === 0) s.items = s.items.filter((i) => i !== item);
          const spot = this._stockpileSpot(c);
          if (!spot) {
            this._fail(c, "\uC811\uADFC \uAC00\uB2A5\uD55C \uCC3D\uACE0 \uC5C6\uC74C", j.key);
            return;
          }
          j.stage = "deliver";
          this._goto(c, spot.x, spot.y);
          return;
        }
        if (c.carry) {
          depositStock(this, c.carry.type, c.carry.count, Math.floor(c.x), Math.floor(c.y), c.carry.freshness ?? 1);
          c.carry = null;
        }
        this._finish(c);
        return;
      }
      if (j.type === "eat") {
        if (j.stage === "fetch") {
          let freshness = 1;
          if (j.source === "stock") {
            const taken = withdrawStock(this, j.foodType, 1);
            if (!taken.ok) {
              this._fail(c, "\uC74C\uC2DD\uC774 \uBA3C\uC800 \uC18C\uBE44\uB428");
              return;
            }
            freshness = taken.freshness;
          } else {
            const i = s.items.find((i2) => i2.id === j.targetId && i2.reservedBy === c.id);
            if (!i || i.count < 1) {
              this._fail(c, "\uC74C\uC2DD\uC744 \uCC3E\uC744 \uC218 \uC5C6\uC74C", j.key);
              return;
            }
            freshness = i.freshness ?? 1;
            i.count--;
            i.reservedBy = null;
            if (i.count === 0) s.items = s.items.filter((x) => x !== i);
          }
          c.carry = { type: j.foodType, count: 1, freshness };
          j.stage = "eat";
        }
        if (!c.carry || c.carry.type !== j.foodType || c.carry.count < 1) {
          this._fail(c, "\uC74C\uC2DD\uC774 \uC0C1\uD574 \uB2E4\uC2DC \uC2DD\uC0AC\uB97C \uCC3E\uC2B5\uB2C8\uB2E4", j.key);
          return;
        }
        c.status = j.foodType === "meals" ? "\uB530\uB73B\uD55C \uC2DD\uC0AC" : "\uC2DD\uC7AC\uB8CC\uB85C \uD5C8\uAE30 \uB2EC\uB798\uAE30";
        j.progress += dt;
        if (j.progress >= j.total) {
          c.hunger = clamp5(c.hunger + (j.foodType === "meals" ? 64 : 30), 0, 100);
          c.mood = clamp5(c.mood + (j.foodType === "meals" ? 5 : -2), 0, 100);
          c.carry = null;
          this._finish(c);
        }
        return;
      }
      if (j.type === "equip") {
        if (!Object.hasOwn(EQUIPMENT, j.item) || c.equipment[j.slot] !== null) {
          this._fail(c, "\uC7A5\uBE44 \uC2AC\uB86F \uC0C1\uD0DC\uAC00 \uBCC0\uACBD\uB428", j.key);
          return;
        }
        if (j.stage === "fetch") {
          if (!withdrawStock(this, j.item, 1).ok) {
            this._fail(c, "\uB2E4\uB978 \uC8FC\uBBFC\uC774 \uC7A5\uBE44\uB97C \uBA3C\uC800 \uC218\uB839\uD588\uC2B5\uB2C8\uB2E4", j.key);
            return;
          }
          c.carry = { type: j.item, count: 1 };
          j.stage = "work";
        }
        if (c.carry?.type !== j.item || c.carry.count !== 1) {
          this._fail(c, "\uC7A5\uCC29\uD560 \uC7A5\uBE44\uAC00 \uC5C6\uC2B5\uB2C8\uB2E4", j.key);
          return;
        }
        c.status = `${EQUIPMENT[j.item].label} \uC7A5\uCC29`;
        j.progress += dt;
        if (j.progress >= j.total) {
          c.equipment[j.slot] = j.item;
          c.carry = null;
          this._effect("build", c.x, c.y, c.x, c.y, "#d3bd83", "\uC7A5\uCC29");
          this._finish(c);
        }
        return;
      }
      if (j.type === "craft") {
        const recipe = RECIPES[j.recipeId], bill = s.industry.bills[j.recipeId];
        if (!recipe || !bill || bill.paused || bill.target <= 0 || !t?.building?.complete || t.building.type !== "workbench" || t.building.id !== j.targetId || t.fire > 0) {
          this._fail(c, "\uC81C\uC791 \uC8FC\uBB38\uC774\uB098 \uC791\uC5C5\uB300 \uC0C1\uD0DC\uAC00 \uBCC0\uACBD\uB428", j.key);
          return;
        }
        if (bill.mode === "maintain" && ownedCount(s, recipe.output, { includeCraft: true }) > bill.target) {
          this._fail(c, "\uBAA9\uD45C \uBCF4\uC720\uB7C9\uC774 \uC774\uBBF8 \uD655\uBCF4\uB418\uC5C8\uC2B5\uB2C8\uB2E4", j.key);
          return;
        }
        if (j.stage === "fetch") {
          const type = Object.keys(recipe.cost).find((k) => (j.materials[k] || 0) < recipe.cost[k]);
          if (!type) {
            j.stage = "work";
            if (!this._goto(c, j.tx, j.ty, true)) this._fail(c, "\uC791\uC5C5\uB300\uC5D0 \uC811\uADFC\uD560 \uC218 \uC5C6\uC74C", j.key);
            return;
          }
          const count = Math.min(12, recipe.cost[type] - (j.materials[type] || 0));
          if (!withdrawStock(this, type, count).ok) {
            this._fail(c, "\uC81C\uC791 \uC790\uC7AC\uAC00 \uBD80\uC871\uD574 \uC8FC\uBB38\uC744 \uB2E4\uC2DC \uC900\uBE44\uD569\uB2C8\uB2E4", j.key);
            return;
          }
          c.carry = { type, count, source: "craft", benchId: j.targetId, recipeId: j.recipeId };
          j.stage = "deliver";
          if (!this._goto(c, j.tx, j.ty, true)) this._fail(c, "\uC791\uC5C5\uB300\uC5D0 \uC811\uADFC\uD560 \uC218 \uC5C6\uC74C", j.key);
          return;
        }
        if (j.stage === "deliver") {
          if (c.carry?.source !== "craft" || c.carry.benchId !== j.targetId || c.carry.recipeId !== j.recipeId) {
            this._fail(c, "\uC6B4\uBC18 \uC911\uC778 \uC81C\uC791 \uC790\uC7AC\uB97C \uD655\uC778\uD569\uB2C8\uB2E4", j.key);
            return;
          }
          j.materials[c.carry.type] = (j.materials[c.carry.type] || 0) + c.carry.count;
          c.carry = null;
          if (Object.keys(recipe.cost).some((k) => (j.materials[k] || 0) < recipe.cost[k])) {
            const spot = this._stockpileSpot(c);
            if (!spot) {
              this._fail(c, "\uC81C\uC791 \uC790\uC7AC \uCC3D\uACE0\uC5D0 \uC811\uADFC\uD560 \uC218 \uC5C6\uC74C", j.key);
              return;
            }
            j.stage = "fetch";
            this._goto(c, spot.x, spot.y);
            return;
          }
          j.stage = "work";
        }
        c.status = `${recipe.label} \uC81C\uC791`;
        j.progress += dt * (0.65 + c.skills.craft * 0.075) * this._workMultiplier(c, "craft");
        if (j.progress >= j.total) {
          j.materials = {};
          this._dropItem(recipe.output, recipe.count, t.x, t.y);
          s.industry.crafted[j.recipeId]++;
          if (bill.mode === "count") bill.target = Math.max(0, bill.target - 1);
          this._effect("harvest", t.x + 0.5, t.y + 0.5, t.x + 0.5, t.y + 0.5, "#d3bd83", `${recipe.label} +${recipe.count}`);
          this._finish(c);
          this._wake();
        }
        return;
      }
      if (j.type === "build") {
        if (!t?.building || t.building.id !== j.targetId || t.building.complete) {
          this._fail(c, "\uAC74\uCD95 \uACC4\uD68D \uBCC0\uACBD\uB428", j.key);
          return;
        }
        const b = t.building;
        if (j.stage === "fetch") {
          const type = Object.keys(b.paidCost).find((k) => (b.materials[k] || 0) < b.paidCost[k]);
          if (type) c.carry = { type, count: Math.min(12, b.paidCost[type] - (b.materials[type] || 0)), source: "construction", blueprintId: b.id };
          j.stage = "deliver";
          if (!this._goto(c, j.tx, j.ty, true)) {
            this._fail(c, "\uAC74\uCD95 \uC704\uCE58\uC5D0 \uC811\uADFC \uBD88\uAC00", j.key);
          }
          return;
        }
        if (j.stage === "deliver") {
          if (c.carry?.blueprintId === b.id) {
            b.materials[c.carry.type] = (b.materials[c.carry.type] || 0) + c.carry.count;
            c.carry = null;
          }
          const more = Object.keys(b.paidCost).some((k) => (b.materials[k] || 0) < b.paidCost[k]);
          if (more) {
            const spot = this._stockpileSpot(c);
            if (!spot) {
              this._fail(c, "\uC790\uC7AC \uACF5\uAE09 \uCC3D\uACE0\uC5D0 \uC811\uADFC \uBD88\uAC00", j.key);
              return;
            }
            j.stage = "fetch";
            this._goto(c, spot.x, spot.y);
            return;
          }
          j.stage = "work";
        }
        c.status = `${BUILDINGS[b.type].label} \uAC74\uC124`;
        j.progress = (b.progress || 0) * j.total + dt * (0.65 + c.skills.build * 0.075) * this._workMultiplier(c, "build");
        b.progress = clamp5(j.progress / j.total, 0, 1);
        if (b.progress >= 1 && b.type === "wall" && s.colonists.some((p) => !p.dead && Math.floor(p.x) === t.x && Math.floor(p.y) === t.y)) {
          c.status = "\uD1B5\uB85C\uAC00 \uBE44\uAE30\uB97C \uAE30\uB2E4\uB9AC\uB294 \uC911";
          return;
        }
        if (b.progress >= 1) {
          b.complete = true;
          b.hp = b.maxHp;
          s.stats.buildingsBuilt++;
          refreshSystems(this);
          this._effect("build", t.x + 0.5, t.y + 0.5);
          this._log("success", `${BUILDINGS[b.type].label} \uC644\uACF5`, `${c.name}\uC774(\uAC00) \uAC74\uC124\uC744 \uB9C8\uCCE4\uC2B5\uB2C8\uB2E4.`);
          this._finish(c);
          this._wake();
        }
        return;
      }
      if (j.type === "repair") {
        if (!t?.building?.complete || t.building.id !== j.targetId) {
          this._fail(c, "\uC218\uB9AC \uB300\uC0C1\uC774 \uBCC0\uACBD\uB428", j.key);
          return;
        }
        const b = t.building;
        if (b.hp >= b.maxHp - 1e-3) {
          this._finish(c);
          return;
        }
        if (j.stage === "fetch") {
          if (!withdrawStock(this, j.resource, 1).ok) {
            this._fail(c, "\uC218\uB9AC \uC790\uC7AC \uBD80\uC871", j.key);
            return;
          }
          c.carry = { type: j.resource, count: 1 };
          j.stage = "work";
          if (!this._goto(c, j.tx, j.ty, true)) this._fail(c, "\uC218\uB9AC \uB300\uC0C1\uC5D0 \uC811\uADFC \uBD88\uAC00", j.key);
          return;
        }
        if (!c.carry || c.carry.type !== j.resource || c.carry.count !== 1) {
          this._fail(c, "\uC218\uB9AC \uC790\uC7AC\uB97C \uB2E4\uC2DC \uC900\uBE44\uD569\uB2C8\uB2E4", j.key);
          return;
        }
        c.status = `${BUILDINGS[b.type].label} \uC218\uB9AC`;
        j.progress += dt * (0.65 + c.skills.build * 0.075) * this._workMultiplier(c, "repair");
        if (j.progress >= j.total) {
          b.hp = Math.min(b.maxHp, b.hp + 40);
          c.carry = null;
          this._effect("build", t.x + 0.5, t.y + 0.5, t.x + 0.5, t.y + 0.5, "#89d5af", "\uC218\uB9AC +40");
          this._finish(c);
          refreshSystems(this);
        }
        return;
      }
      if (j.type === "research") {
        const def = RESEARCH[j.researchId];
        if (!def || s.research.active !== j.researchId || s.research.unlocked.includes(j.researchId) || !t?.building?.complete || t.building.type !== "researchbench" || t.building.id !== j.targetId || t.fire > 0) {
          this._fail(c, "\uC5F0\uAD6C \uACC4\uD68D\uC774\uB098 \uC5F0\uAD6C\uB300 \uC0C1\uD0DC\uAC00 \uBCC0\uACBD\uB428", j.key);
          return;
        }
        c.status = `${def.label} \uC5F0\uAD6C`;
        s.research.progress[j.researchId] = Math.min(def.points, s.research.progress[j.researchId] + dt * (0.8 + c.skills.research * 0.08));
        j.progress = s.research.progress[j.researchId];
        if (j.progress >= def.points) {
          s.research.unlocked.push(j.researchId);
          s.research.active = null;
          this._log("success", `${def.label} \uC5F0\uAD6C \uC644\uB8CC`, `${def.unlocks.map((id) => BUILDINGS[id].label).join(" \xB7 ")} \uAC74\uC124\uC774 \uAC00\uB2A5\uD574\uC84C\uC2B5\uB2C8\uB2E4. \uB2E4\uC74C \uC5F0\uAD6C\uB97C \uC120\uD0DD\uD558\uC138\uC694.`);
          for (const worker of s.colonists) if (worker.job?.type === "research") this._finish(worker);
          this._wake();
        }
        return;
      }
      if (j.type === "cook") {
        if (!t?.building?.complete || t.building.id !== j.targetId || !s.autoCook || t.fire > 0) {
          this._fail(c, "\uC870\uB9AC \uC791\uC5C5 \uC911\uB2E8", j.key);
          return;
        }
        if (j.stage === "fetch") {
          const taken = withdrawStock(this, "rawfood", 2);
          if (!taken.ok) {
            this._fail(c, "\uC2DD\uC7AC\uB8CC\uAC00 \uBD80\uC871\uD568", j.key);
            return;
          }
          c.carry = { type: "rawfood", count: 2, freshness: taken.freshness };
          j.stage = "work";
          if (!this._goto(c, j.tx, j.ty, true)) this._fail(c, "\uC870\uB9AC\uB300\uC5D0 \uC811\uADFC \uBD88\uAC00", j.key);
          return;
        }
        if (c.carry?.type !== "rawfood" || c.carry.count !== 2) {
          this._fail(c, "\uC870\uB9AC \uC7AC\uB8CC\uAC00 \uC0C1\uD588\uC2B5\uB2C8\uB2E4", j.key);
          return;
        }
        c.status = "\uC2DD\uC0AC \uC870\uB9AC";
        j.progress += dt * (0.65 + c.skills.cook * 0.065);
        if (j.progress >= j.total) {
          const freshness = c.carry.freshness ?? 1;
          c.carry = null;
          this._dropItem("meals", 1, t.x, t.y, freshness);
          s.stats.mealsCooked++;
          this._effect("harvest", t.x + 0.5, t.y + 0.5, t.x + 0.5, t.y + 0.5, "#f1b669", "\uC2DD\uC0AC +1");
          this._finish(c);
        }
        return;
      }
      if (j.type === "doctor") {
        const p = s.colonists.find((p2) => p2.id === j.targetId && !p2.dead);
        if (!p) {
          this._fail(c, "\uCE58\uB8CC \uB300\uC0C1 \uC5C6\uC74C", j.key);
          return;
        }
        if (j.stage === "fetch") {
          if (withdrawStock(this, "medicine", 1).ok) {
            c.carry = { type: "medicine", count: 1 };
          } else {
            j.usesMedicine = false;
            j.total = 8;
          }
          j.stage = "work";
          j.tx = Math.floor(p.x);
          j.ty = Math.floor(p.y);
          if (!this._goto(c, j.tx, j.ty, p.id !== c.id)) this._fail(c, "\uD658\uC790\uC5D0\uAC8C \uC811\uADFC \uBD88\uAC00", j.key);
          return;
        }
        if (dist(c, p) > 1.8) return;
        c.status = `${p.name} ${j.usesMedicine ? "\uCE58\uB8CC" : "\uC751\uAE09 \uCC98\uCE58"}`;
        j.progress += dt * (0.65 + c.skills.doctor * 0.07);
        if (j.progress >= j.total) {
          const used = !!c.carry;
          p.health = clamp5(p.health + (used ? 38 : 19), 0, 100);
          p.bleed = 0;
          c.carry = null;
          s.careStats.tended++;
          this._effect("heal", p.x, p.y, p.x, p.y, "#89d5af");
          this._log("success", "\uCE58\uB8CC \uC644\uB8CC", `${c.name} \u2192 ${p.name}: ${used ? "\uC57D\uD488\uC744 \uC0AC\uC6A9\uD574" : "\uC751\uAE09 \uCC98\uCE58\uB85C"} \uCD9C\uD608\uC744 \uBA48\uCD94\uACE0 \uD68C\uBCF5\uD588\uC2B5\uB2C8\uB2E4.`);
          this._finish(c);
          p.thinkAt = 0;
        }
        return;
      }
      if (j.type === "grow") {
        if (!t || t.zone !== "farm" || t.building || t.feature || j.action === "reap" && (!t.crop || t.crop.growth < 1)) {
          this._fail(c, "\uACBD\uC791\uC9C0\uAC00 \uBCC0\uACBD\uB428", j.key);
          return;
        }
        j.progress += dt * (0.65 + c.skills.grow * 0.065) * this._workMultiplier(c, "grow");
        c.status = j.action === "reap" ? "\uC791\uBB3C \uC218\uD655" : "\uC528\uC557 \uC2EC\uAE30";
        if (j.progress >= j.total) {
          if (j.action === "sow") t.crop = { growth: 0 };
          else {
            t.crop = null;
            this._dropItem("rawfood", 5, t.x, t.y);
            s.stats.harvested += 5;
            this._effect("harvest", t.x + 0.5, t.y + 0.5, t.x + 0.5, t.y + 0.5, "#a5ce79", "\uC2DD\uC7AC\uB8CC +5");
          }
          this._finish(c);
        }
        return;
      }
      if (j.type === "harvest" || j.type === "mine") {
        if (!t?.feature || t.amount <= 0 || j.action !== "forageeat" && !t.designation) {
          this._fail(c, "\uC791\uC5C5 \uB300\uC0C1\uC774 \uBCC0\uACBD\uB428", j.key);
          return;
        }
        j.progress += dt * (0.65 + c.skills[j.type] * 0.065) * this._workMultiplier(c, j.type);
        if (j.progress >= j.total) {
          const type = t.feature === "tree" ? "wood" : t.feature === "ore" ? "steel" : "rawfood";
          let n = t.amount;
          t.amount = 0;
          t.feature = null;
          t.designation = null;
          if (j.action === "forageeat") {
            n = Math.max(0, n - 1);
            c.hunger = clamp5(c.hunger + 30, 0, 100);
          }
          this._dropItem(type, n, t.x, t.y);
          s.stats.harvested += n;
          this._effect("harvest", t.x + 0.5, t.y + 0.5, t.x + 0.5, t.y + 0.5, "#dcbd85", `${RESOURCE_LABELS[type]} +${n}`);
          this._finish(c);
        }
        return;
      }
      this._fail(c, "\uC791\uC5C5 \uC0C1\uD0DC\uB97C \uB2E4\uC2DC \uACC4\uD68D\uD569\uB2C8\uB2E4");
    }
    _los(a, b) {
      const steps = Math.ceil(dist(a, b) * 3);
      for (let i = 1; i < steps; i++) {
        const f = i / steps, t = this.tile(Math.floor(a.x + (b.x - a.x) * f), Math.floor(a.y + (b.y - a.y) * f));
        if (!t || t.building?.complete && t.building.type === "wall") return false;
      }
      return true;
    }
    _cover(actor, attacker = null) {
      for (const [dx, dy] of DIRS3) {
        const t = this.tile(Math.floor(actor.x) + dx, Math.floor(actor.y) + dy), b = t?.building;
        if (!b?.complete || !["sandbag", "wall"].includes(b.type)) continue;
        if (!attacker) return 0.24;
        const ax = attacker.x - actor.x, ay = attacker.y - actor.y, bx = t.x + 0.5 - actor.x, by = t.y + 0.5 - actor.y, n = Math.hypot(ax, ay) * Math.hypot(bx, by);
        if (n > 0 && (ax * bx + ay * by) / n >= 0.55) return 0.24;
      }
      return 0;
    }
    _hitPawn(c, amount) {
      if (c.dead) return;
      const protection = equipmentStats(c).damageTaken;
      c.health = clamp5(c.health - amount * protection, 0, 100);
      c.bleed = Math.min(0.3, c.bleed + 0.025 * protection);
      this._effect("hit", c.x, c.y, c.x, c.y, "#ef7b75");
      if (c.health <= 0) this._killPawn(c);
      else if (c.health < 15) this._downPawn(c);
    }
    _killPawn(c) {
      if (c.dead) return;
      c.dead = true;
      c.health = 0;
      c.drafted = false;
      c.order = null;
      if (c.carriedBy) {
        const carrier = this.state.colonists.find((p) => p.id === c.carriedBy);
        if (carrier) this._releaseJob(carrier);
        c.carriedBy = null;
      }
      this._releaseJob(c);
      c.patientBedId = null;
      for (const [slot, item] of Object.entries(c.equipment || {})) if (item) {
        c.equipment[slot] = null;
        this._dropItem(item, 1, c.x, c.y);
      }
      for (const worker of this.state.colonists) if (worker.job?.targetId === c.id && ["doctor", "feed", "rescue"].includes(worker.job.type)) this._releaseJob(worker);
      this._log("danger", `${c.name} \uC0AC\uB9DD`, "\uC815\uCC29\uC9C0\uAC00 \uC18C\uC911\uD55C \uB3D9\uB8CC\uB97C \uC783\uC5C8\uC2B5\uB2C8\uB2E4.");
      for (const other of this.state.colonists) if (!other.dead) other.mood = clamp5(other.mood - 14, 0, 100);
    }
    _shootColonist(c, r, automatic = false) {
      if (c.shotCooldown > 0 || r.dead) return;
      const weapon = equipmentStats(c);
      c.shotCooldown = automatic ? 1.7 : weapon.cooldown;
      c.status = "\uC0AC\uACA9";
      this._effect("shot", c.x, c.y, r.x, r.y, "#f1cf85");
      if (this._rand() < (automatic ? 0.64 : 0.76) + c.skills.shoot * 0.012 + weapon.accuracy - this._cover(r, c)) {
        r.health -= (15 + c.skills.shoot * 0.6 + this._rand() * 5) * weapon.damage * (automatic ? 0.6 : 1);
        this._effect("hit", r.x, r.y, r.x, r.y, "#ea8e73");
        if (r.health <= 0) {
          r.health = 0;
          r.dead = true;
          r.status = "\uC81C\uC555\uB428";
          this.state.stats.raidersDefeated++;
          const loot = this._rand() < 0.5 ? "steel" : "medicine";
          this._dropItem(loot, loot === "steel" ? 5 : 1, r.x, r.y);
        }
      }
    }
    _tickDraft(c, dt) {
      const enemies = this.state.raiders.filter((r) => !r.dead), range = equipmentStats(c).range, orderedTarget = c.order?.type === "attack" ? enemies.find((r) => r.id === c.order.targetId) : null;
      let target = orderedTarget;
      if (c.order?.type === "move" && c.path.length) {
        this._moveAlong(c, dt, 2.8 * clamp5(c.health / 100, 0.5, 1));
        c.status = "\uC804\uD22C \uC704\uCE58\uB85C \uC774\uB3D9";
      }
      if (target && (dist(c, target) > range - 0.5 || !this._los(c, target)) && this.state.time >= (c.nextCombatPath ?? 0)) {
        c.nextCombatPath = this.state.time + 1.3;
        if (!this._goto(c, Math.floor(target.x), Math.floor(target.y), true)) {
          c.path = [];
          c.destination = null;
        }
      }
      if (target && c.path.length && (dist(c, target) > range - 0.7 || !this._los(c, target))) {
        this._moveAlong(c, dt, 2.7);
        c.status = "\uC2DC\uC57C\uB97C \uD655\uBCF4\uD558\uBA70 \uC801\uC5D0\uAC8C \uC811\uADFC";
      }
      if (!target || dist(c, target) > range || !this._los(c, target)) target = enemies.filter((r) => dist(c, r) <= range && this._los(c, r)).sort((a, b) => dist(c, a) - dist(c, b))[0];
      if (target && dist(c, target) <= range && this._los(c, target)) {
        if (c.order?.type === "attack") c.path = [];
        this._shootColonist(c, target);
      } else if (!c.path.length) c.status = orderedTarget && (dist(c, orderedTarget) > range - 0.5 || !this._los(c, orderedTarget)) ? "\uC801\uC5D0\uAC8C \uC811\uADFC\uD560 \uC218 \uC5C6\uC74C \xB7 \uACBD\uB85C \uC7AC\uD0D0\uC0C9 \uB300\uAE30" : c.order?.type === "hold" ? "\uAC70\uC810 \uC720\uC9C0 \xB7 \uACBD\uACC4 \uC911" : "\uC9D5\uC9D1 \xB7 \uACBD\uACC4 \uC911";
    }
    _tickColonist(c, dt) {
      if (c.dead) return;
      c.shotCooldown = Math.max(0, c.shotCooldown - dt);
      c.hunger = clamp5(c.hunger - dt * (this.state.difficulty === "relaxed" ? 0.22 : 0.28), 0, 100);
      c.recreation = clamp5(c.recreation - dt * 0.12, 0, 100);
      if (c.job?.type !== "rest" && !c.patientBedId) c.energy = clamp5(c.energy - dt * (c.drafted ? 0.23 : 0.145), 0, 100);
      if (c.bleed > 0) c.health = clamp5(c.health - c.bleed * dt, 0, 100);
      if (c.hunger <= 0) c.health = clamp5(c.health - dt * 0.2, 0, 100);
      if ((c.thermalStress || 0) > 70) c.health = clamp5(c.health - dt * (c.thermalStress - 70) * 6e-3, 0, 100);
      if (c.health <= 0) {
        this._killPawn(c);
        return;
      }
      if (c.health < 15) this._downPawn(c);
      const targetMood = moodTarget(c);
      c.mood = clamp5(c.mood + clamp5(targetMood - c.mood, -dt * 1.8, dt * 0.65), 0, 100);
      if (c.health >= 15 && c.hunger > 50 && c.energy > 50 && c.bleed === 0) c.health = clamp5(c.health + dt * 0.025, 0, 100);
      const hour = Math.floor((8 + this.state.time / DAY2 * 24) % 24);
      if (c.lastScheduleHour !== hour) {
        const old = c.lastScheduleHour;
        c.lastScheduleHour = hour;
        if (old >= 0 && c.schedule[old] !== c.schedule[hour]) this._scheduleRelease(c);
      }
      if (c.carriedBy) {
        c.status = "\uAD6C\uC870\uB418\uC5B4 \uCE68\uC0C1\uC73C\uB85C \uC774\uB3D9 \uC911";
        return;
      }
      if (c.patientBedId) {
        const bed = this.state.tiles.find((t) => t.building?.id === c.patientBedId && t.building.complete && t.building.type === "bed");
        if (!bed || bed.fire > 0 || Math.hypot(c.x - bed.x - 0.5, c.y - bed.y - 0.5) > 0.8 || c.health >= 25) {
          c.patientBedId = null;
          c.thinkAt = 0;
        } else {
          c.energy = clamp5(c.energy + dt * 2.2, 0, 100);
          if (c.bleed <= 0 && c.hunger > 0) c.health = clamp5(c.health + dt * 0.55, 0, 100);
          c.status = "\uCE68\uC0C1 \uC548\uC815 \xB7 \uAC04\uD638\uC640 \uD68C\uBCF5";
          return;
        }
      }
      if (c.health < 15) return;
      if (c.drafted) {
        this._tickDraft(c, dt);
        return;
      }
      const closeEnemy = this.state.raiders.filter((r) => !r.dead && dist(c, r) < 5.8 && this._los(c, r)).sort((a, b) => dist(c, a) - dist(c, b))[0];
      if (closeEnemy) {
        if (c.job) this._releaseJob(c);
        c.status = "\uAE34\uAE09 \uBC29\uC5B4 \xB7 \uC9D5\uC9D1\uC73C\uB85C \uC9C0\uD718 \uAC00\uB2A5";
        this._shootColonist(c, closeEnemy, true);
        return;
      }
      if (c.breakUntil > this.state.time) {
        c.status = "\uC7A0\uC2DC \uB9C8\uC74C\uC744 \uAC00\uB2E4\uB4EC\uB294 \uC911";
        c.energy = clamp5(c.energy + dt * 0.35, 0, 100);
        return;
      }
      if (c.mood < 19 && this.state.time > c.nextBreakAt) {
        this._releaseJob(c);
        c.breakUntil = this.state.time + 5;
        c.nextBreakAt = this.state.time + 45;
        this._log("warning", `${c.name} \uC9C0\uCE68`, "\uD5C8\uAE30\uC640 \uD734\uC2DD\uC744 \uC0B4\uD3B4\uC8FC\uC138\uC694. \uC7A0\uC2DC \uC26C\uACE0 \uB2E4\uC2DC \uC791\uC5C5\uD569\uB2C8\uB2E4.");
        return;
      }
      if (c.job && c.job.type !== "eat" && (c.hunger < 14 && c.job.type !== "harvest" || c.energy < 4 && c.job.type !== "rest")) {
        this._releaseJob(c);
        c.thinkAt = 0;
      }
      if (c.job && !c.job.forced && !["doctor", "feed", "rescue", "firefight"].includes(c.job.type) && c.hunger >= 25 && c.energy >= 12 && this.state.time >= c.emergencyCheckAt) {
        c.emergencyCheckAt = this.state.time + 1.5;
        const emergency = this._emergencyPlan(c);
        if (emergency) this._startPlan(c, emergency, { interrupt: true });
      }
      if (c.job) {
        this._tickJob(c, dt);
        return;
      }
      if (c.path.length) this._moveAlong(c, dt, 1.65);
      if (this.state.time >= c.thinkAt) this._chooseJob(c);
    }
    _spawnRaid() {
      if (this.state.activeRaid) return false;
      const s = this.state;
      s.raidNumber++;
      const count = s.difficulty === "relaxed" ? Math.min(3, 1 + s.raidNumber) : Math.min(4, 1 + s.raidNumber);
      for (let n = 0; n < count; n++) {
        let x = 46, y = 12 + n * 5;
        while (!this._walkable(x, y, true) && x > 35) x--;
        s.raiders.push({ id: this._id("raider"), x: x + 0.5, y: y + 0.5, health: 65 + (s.raidNumber - 1) * 8, maxHp: 65 + (s.raidNumber - 1) * 8, dead: false, status: "\uC815\uCC29\uC9C0\uB85C \uC811\uADFC", path: [], destination: null, shotCooldown: 1 + n * 0.3, thinkAt: 0, targetId: null });
      }
      s.activeRaid = true;
      s.nextRaidAt = s.time + (s.difficulty === "relaxed" ? 370 : 270);
      this._log("danger", "\uC2B5\uACA9 \uACBD\uBCF4", `${count}\uBA85\uC758 \uC57D\uD0C8\uC790\uAC00 \uB3D9\uCABD\uC5D0\uC11C \uC811\uADFC\uD569\uB2C8\uB2E4. \uC8FC\uBBFC\uC744 \uC9D5\uC9D1\uD558\uACE0 \uBC29\uBCBD \uAC00\uAE4C\uC774 \uBAA8\uC73C\uC138\uC694.`);
      return true;
    }
    _tickRaider(r, dt) {
      if (r.dead) return;
      r.shotCooldown = Math.max(0, r.shotCooldown - dt);
      const living = this.state.colonists.filter((c) => !c.dead), standing = living.filter((c) => c.health >= 15);
      const targets = standing.length ? standing : living;
      if (!targets.length) return;
      const p = targets.slice().sort((a, b) => dist(r, a) - dist(r, b))[0];
      if (dist(r, p) <= 5.1 && this._los(r, p)) {
        r.path = [];
        r.status = "\uC0AC\uACA9";
        if (r.shotCooldown <= 0) {
          r.shotCooldown = 2.25;
          this._effect("shot", r.x, r.y, p.x, p.y, "#ee8274");
          if (this._rand() < 0.65 - this._cover(p, r)) this._hitPawn(p, 7 + this._rand() * 5);
        }
        return;
      }
      if (this.state.time >= r.thinkAt) {
        r.thinkAt = this.state.time + 1.1;
        r.targetId = p.id;
        if (!this._goto(r, Math.floor(p.x), Math.floor(p.y), true, true)) {
          const walls = this._nearest(r, this.state.tiles.filter((t) => t.building?.complete && (t.building.type === "wall" || t.building.type === "door")));
          r.bashTarget = null;
          for (const t of walls.slice(0, 20)) if (this._goto(r, t.x, t.y, true, true)) {
            r.bashTarget = { x: t.x, y: t.y, id: t.building.id };
            break;
          }
        } else r.bashTarget = null;
      }
      if (r.path.length) this._moveAlong(r, dt, 1.65);
      if (r.bashTarget && !r.path.length) {
        const tile = this.tile(r.bashTarget.x, r.bashTarget.y), b = tile?.building;
        if (b && b.id === r.bashTarget.id) {
          r.status = "\uBCBD\uC744 \uBD80\uC218\uB294 \uC911";
          b.hp -= dt * 16;
          if (b.hp <= 0) {
            this._onBuildingDestroyed(b, tile, "raid");
            tile.building = null;
            r.bashTarget = null;
            r.thinkAt = 0;
            refreshSystems(this);
            this._wake();
          }
        }
      } else r.status = "\uC815\uCC29\uC9C0\uB85C \uC811\uADFC";
    }
    _periodic(dt) {
      const s = this.state, hour = (8 + s.time / DAY2 * 24) % 24, growthRate = (hour >= 6 && hour < 20 ? 1 : 0.38) * (s.weather === "rain" ? 1.2 : s.weather === "heat" ? 0.85 : 1) / 130;
      for (const t of s.tiles) if (t.crop && t.zone === "farm" && !t.building) t.crop.growth = clamp5(t.crop.growth + dt * growthRate, 0, 1);
      for (const [k, r] of Object.entries(s.reservations)) if (r.expiry < s.time || !s.colonists.some((c) => c.id === r.owner && !c.dead && c.job)) delete s.reservations[k];
      s.items = s.items.filter((i) => i.count > 0);
      updateSystems(this, dt);
      updateHazards(this, dt);
      updateTrade(this, dt);
      if (s.activeRaid && !s.raiders.some((r) => !r.dead)) {
        s.activeRaid = false;
        s.stats.survivedRaids++;
        this._log("success", "\uC815\uCC29\uC9C0 \uBC29\uC5B4 \uC131\uACF5", "\uC801\uC774 \uBB3C\uB7EC\uB0AC\uC2B5\uB2C8\uB2E4. \uC9D5\uC9D1\uC744 \uD574\uC81C\uD558\uACE0 \uBD80\uC0C1\uC790\uB97C \uCE58\uB8CC\uD558\uC138\uC694.");
        this._wake();
      }
      const living = s.colonists.filter((c) => !c.dead);
      if (!living.length && !s.gameOver) {
        s.gameOver = true;
        this._log("danger", "\uC815\uCC29\uC9C0\uC758 \uB9C8\uC9C0\uB9C9 \uB0A0", "\uBAA8\uB4E0 \uC8FC\uBBFC\uC744 \uC783\uC5C8\uC2B5\uB2C8\uB2E4. \uC0C8 \uC815\uCC29\uC9C0\uC5D0\uC11C \uB2E4\uC2DC \uC2DC\uC791\uD560 \uC218 \uC788\uC2B5\uB2C8\uB2E4.");
      }
      const beacon = s.tiles.some((t) => t.building?.complete && t.building.type === "beacon" && t.building.powered);
      const beds = s.tiles.filter((t) => t.building?.complete && t.building.type === "bed" && t.roofed).length;
      if (!s.victory && beacon && beds >= 3 && s.research.unlocked.includes("communications") && this._countFood() >= 6 && s.stats.survivedRaids >= 1 && !s.activeRaid && !s.tiles.some((t) => t.fire > 0) && living.length > 0) {
        if (!s.extractionAlarmTriggered && s.beaconProgress >= 0.5) {
          s.extractionAlarmTriggered = true;
          this._spawnRaid();
          this._log("danger", "\uAD6C\uC870 \uC2E0\uD638\uAC00 \uB178\uCD9C\uB418\uC5C8\uC2B5\uB2C8\uB2E4", "\uB9C8\uC9C0\uB9C9 \uC2B5\uACA9\uC744 \uBB3C\uB9AC\uCE58\uBA74 \uC2E0\uD638 \uC804\uC1A1\uC744 \uC774\uC5B4\uAC11\uB2C8\uB2E4. \uC804\uB825\uACFC \uC2E4\uB0B4 \uCE68\uC0C1, \uC2DD\uB7C9\uC744 \uC9C0\uD0A4\uC138\uC694.");
        } else {
          s.beaconProgress = clamp5(s.beaconProgress + dt / 90, 0, s.extractionAlarmTriggered ? 1 : 0.5);
          if (!s.extractionAlarmTriggered && s.beaconProgress >= 0.5) {
            s.extractionAlarmTriggered = true;
            this._spawnRaid();
            this._log("danger", "\uAD6C\uC870 \uC2E0\uD638\uAC00 \uB178\uCD9C\uB418\uC5C8\uC2B5\uB2C8\uB2E4", "\uB9C8\uC9C0\uB9C9 \uC2B5\uACA9\uC744 \uBB3C\uB9AC\uCE58\uBA74 \uC2E0\uD638 \uC804\uC1A1\uC744 \uC774\uC5B4\uAC11\uB2C8\uB2E4. \uC804\uB825\uACFC \uC2E4\uB0B4 \uCE68\uC0C1, \uC2DD\uB7C9\uC744 \uC9C0\uD0A4\uC138\uC694.");
          }
          if (s.beaconProgress >= 1) {
            s.victory = true;
            this._log("success", "\uAD6C\uC870 \uC2E0\uD638\uAC00 \uB2FF\uC558\uC2B5\uB2C8\uB2E4", "\uC2E4\uB0B4 \uCE68\uC0C1\uACFC \uC2DD\uB7C9, \uC804\uB825\uC744 \uC9C0\uD0A4\uACE0 \uB9C8\uC9C0\uB9C9 \uC2B5\uACA9\uC744 \uACAC\uB3A0\uC2B5\uB2C8\uB2E4. \uAD6C\uC870\uC120\uC774 \uC751\uB2F5\uD588\uC2B5\uB2C8\uB2E4! \uACC4\uC18D \uC815\uCC29\uC9C0\uB97C \uC6B4\uC601\uD560 \uC218 \uC788\uC2B5\uB2C8\uB2E4.");
          }
        }
      }
      if (living.some((c) => c.hunger < 18) && s.time - (s.lastAlerts.hunger ?? -100) > 45) {
        s.lastAlerts.hunger = s.time;
        this._log("warning", "\uD5C8\uAE30 \uC704\uD5D8", "\uBA39\uC744 \uC218 \uC788\uB294 \uC2DD\uB7C9\uACFC \uCC3D\uACE0 \uC811\uADFC \uACBD\uB85C\uB97C \uD655\uC778\uD558\uC138\uC694. \uB538\uAE30 \uCC44\uC9D1\uC774\uB098 \uB18D\uC0AC\uAC00 \uB3C4\uC6C0\uC774 \uB429\uB2C8\uB2E4.");
      }
      if (living.some((c) => c.health < 45) && s.time - (s.lastAlerts.health ?? -100) > 35) {
        s.lastAlerts.health = s.time;
        this._log("warning", "\uCE58\uB8CC\uAC00 \uD544\uC694\uD569\uB2C8\uB2E4", "\uC9D5\uC9D1\uC744 \uD574\uC81C\uD558\uBA74 \uC758\uBB34\uAD00\uC774 \uC57D\uD488\uC744 \uAC00\uC838\uC640 \uC790\uB3D9\uC73C\uB85C \uCE58\uB8CC\uD569\uB2C8\uB2E4. \uC57D\uC774 \uC5C6\uC5B4\uB3C4 \uC751\uAE09 \uCC98\uCE58\uB97C \uD569\uB2C8\uB2E4.");
      }
    }
    update(dt) {
      if (!Number.isFinite(dt) || dt <= 0 || this.state.gameOver) return;
      this.state.accumulator += Math.min(dt, 3600);
      let steps = 0;
      while (this.state.accumulator >= STEP - 1e-9 && steps++ < 36e3) {
        this.state.accumulator = Math.max(0, this.state.accumulator - STEP);
        const s = this.state;
        s.time = +(s.time + STEP).toFixed(7);
        for (const e of s.effects) e.age += STEP;
        s.effects = s.effects.filter((e) => e.age < e.life);
        if (!s.activeRaid && s.time >= s.nextRaidAt) this._spawnRaid();
        for (const c of s.colonists) this._tickColonist(c, STEP);
        for (const c of s.colonists) if (c.carryingPawnId) this._syncCarried(c);
        for (const r of s.raiders) this._tickRaider(r, STEP);
        s.systemTimer += STEP;
        if (s.systemTimer >= 0.5 - 1e-8) {
          this._periodic(s.systemTimer);
          s.systemTimer = 0;
        }
        s.weatherTimer += STEP;
        if (s.weatherTimer >= 180) {
          s.weatherTimer = 0;
          const r = this._rand();
          s.weather = r < 0.2 ? "rain" : r < 0.3 ? "heat" : "clear";
          this._log("info", "\uB0A0\uC528 \uBCC0\uD654", s.weather === "rain" ? "\uBE44\uAC00 \uB0B4\uB824 \uC791\uBB3C\uC758 \uC131\uC7A5\uC744 \uB3D5\uC2B5\uB2C8\uB2E4." : s.weather === "heat" ? "\uB530\uB73B\uD55C \uBC14\uB78C\uC774 \uBD88\uC5B4\uC635\uB2C8\uB2E4." : "\uD558\uB298\uC774 \uB9D1\uAC8C \uAC1C\uC5C8\uC2B5\uB2C8\uB2E4.");
        }
        if (s.gameOver) break;
      }
    }
    command(type, payload = {}) {
      try {
        return this._command(type, payload && typeof payload === "object" ? payload : {});
      } catch {
        return { ok: false, message: "\uBA85\uB839\uC744 \uC801\uC6A9\uD560 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4. \uB300\uC0C1\uACFC \uC870\uAC74\uC744 \uB2E4\uC2DC \uD655\uC778\uD558\uC138\uC694." };
      }
    }
    _command(type, p) {
      const s = this.state, no = (message) => ({ ok: false, message }), yes = (message) => {
        this._wake();
        refreshSystems(this);
        return { ok: true, message };
      };
      if (s.gameOver) return no("\uC815\uCC29\uC774 \uB05D\uB0AC\uC2B5\uB2C8\uB2E4. \uC0C8 \uAC8C\uC784\uC744 \uC2DC\uC791\uD558\uC138\uC694.");
      if (type === "trade") {
        const result = executeTrade(this, p);
        return result.ok ? yes(result.message) : result;
      }
      if (type === "bill") {
        if (!Object.hasOwn(RECIPES, p.recipeId) || !["count", "maintain"].includes(p.mode) || !validInt(p.target) || p.target < 0 || p.target > 99 || typeof p.paused !== "boolean") return no("\uC81C\uC791 \uD488\uBAA9, \uC8FC\uBB38 \uBC29\uC2DD, 0~99 \uBAA9\uD45C\uC640 \uC77C\uC2DC\uC815\uC9C0 \uC0C1\uD0DC\uB97C \uBAA8\uB450 \uC9C0\uC815\uD558\uC138\uC694.");
        const old = s.industry.bills[p.recipeId];
        if (old.mode === p.mode && old.target === p.target && old.paused === p.paused) return yes("\uAC19\uC740 \uC81C\uC791 \uC8FC\uBB38\uC744 \uC720\uC9C0\uD569\uB2C8\uB2E4. \uC9C4\uD589 \uC911\uC778 \uC791\uC5C5\uC740 \uACC4\uC18D\uB429\uB2C8\uB2E4.");
        for (const c of s.colonists) if (c.job?.type === "craft" && c.job.recipeId === p.recipeId) this._releaseJob(c);
        s.industry.bills[p.recipeId] = { mode: p.mode, target: p.target, paused: p.paused };
        return yes(`${RECIPES[p.recipeId].label}: ${p.paused ? "\uC77C\uC2DC\uC815\uC9C0" : p.mode === "count" ? `\uC55E\uC73C\uB85C ${p.target}\uAC1C \uC81C\uC791` : `\uCD1D ${p.target}\uAC1C \uBCF4\uC720 \uC720\uC9C0`}. \uBCC0\uACBD\uB41C \uC791\uC5C5\uC758 \uC790\uC7AC\uB294 \uD604\uC7A5\uC5D0 \uBC18\uD658\uD588\uC2B5\uB2C8\uB2E4.`);
      }
      if (type === "equip" || type === "unequip") {
        const c = s.colonists.find((c2) => c2.id === p.id && !c2.dead);
        if (!c || c.drafted || c.health < 15 || c.carriedBy || c.carryingPawnId || c.patientBedId) return no("\uAC78\uC744 \uC218 \uC788\uACE0 \uC9D5\uC9D1\uB418\uC9C0 \uC54A\uC740 \uC8FC\uBBFC\uC744 \uC120\uD0DD\uD558\uC138\uC694.");
        if (type === "equip") {
          if (!Object.hasOwn(EQUIPMENT, p.item)) return no("\uC7A5\uCC29\uD560 \uC18C\uCD1D\xB7\uC870\uB07C\xB7\uB3C4\uAD6C\uB97C \uC120\uD0DD\uD558\uC138\uC694.");
          const def = EQUIPMENT[p.item];
          if (c.equipment[def.slot] === p.item) return no("\uC774\uBBF8 \uAC19\uC740 \uC7A5\uBE44\uB97C \uC7A5\uCC29\uD558\uACE0 \uC788\uC2B5\uB2C8\uB2E4.");
          if (c.job?.type === "equip" && c.job.item === p.item) return yes("\uC774\uBBF8 \uD574\uB2F9 \uC7A5\uBE44\uB97C \uAC00\uC9C0\uB7EC \uAC00\uAC70\uB098 \uC7A5\uCC29\uD558\uACE0 \uC788\uC2B5\uB2C8\uB2E4.");
          if (s.resources[p.item] < 1) return no("\uCC3D\uACE0\uC5D0 \uC788\uB294 \uC7A5\uBE44\uB9CC \uC7A5\uCC29\uD560 \uC218 \uC788\uC2B5\uB2C8\uB2E4. \uBC14\uB2E5 \uBB3C\uD488\uC744 \uBA3C\uC800 \uC6B4\uBC18\uD558\uC138\uC694.");
          const spot = this._stockpileSpot(c);
          if (!spot) return no("\uC7A5\uBE44\uB97C \uC218\uB839\uD560 \uCC3D\uACE0\uC5D0 \uC811\uADFC\uD560 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4.");
          const plan = this._plan(c, { type: "equip", item: p.item, slot: def.slot, tx: spot.x, ty: spot.y, key: `equip:${c.id}`, stage: "fetch", total: 1.5 }, spot.x, spot.y, false, `${def.label} \uC218\uB839\uD558\uB7EC \uC774\uB3D9`, true);
          if (!plan || !this._startPlan(c, plan, { forced: true })) return no("\uC7A5\uBE44 \uC218\uB839 \uC791\uC5C5\uC744 \uC2DC\uC791\uD560 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4.");
          return yes(`${c.name}\uC774(\uAC00) \uCC3D\uACE0\uC5D0\uC11C ${def.label}\uC744(\uB97C) \uAC00\uC838\uC640 \uC7A5\uCC29\uD569\uB2C8\uB2E4.`);
        }
        if (!["weapon", "armor", "tool"].includes(p.slot)) return no("\uD574\uC81C\uD560 \uC7A5\uBE44 \uC2AC\uB86F\uC744 \uC120\uD0DD\uD558\uC138\uC694.");
        const item = c.equipment[p.slot], pending = c.job?.type === "equip" && c.job.slot === p.slot;
        if (!item && !pending) return no("\uD574\uB2F9 \uC2AC\uB86F\uC5D0 \uC7A5\uCC29\uD558\uAC70\uB098 \uC900\uBE44 \uC911\uC778 \uC7A5\uBE44\uAC00 \uC5C6\uC2B5\uB2C8\uB2E4.");
        if (c.job?.type === "equip") this._releaseJob(c);
        if (item) {
          c.equipment[p.slot] = null;
          this._dropItem(item, 1, c.x, c.y);
        }
        return yes("\uC7A5\uBE44\uB97C \uD574\uC81C\uD588\uC2B5\uB2C8\uB2E4. \uC218\uB839\uD55C \uC7A5\uBE44\uB294 \uC8FC\uBBFC \uC704\uCE58\uC758 \uBC14\uB2E5\uC5D0 \uB0A8\uC2B5\uB2C8\uB2E4.");
      }
      if (type === "ignite") {
        const result = igniteTile(this, p.x, p.y, p.strength === void 0 ? 0.35 : p.strength);
        return result.ok ? yes(result.message) : result;
      }
      if (["designate", "zone", "build", "cancel", "demolish", "medicalBed"].includes(type)) {
        const t = this.tile(p.x, p.y);
        if (!t) return no("\uC9C0\uB3C4 \uC548\uC758 \uCE78\uC744 \uC120\uD0DD\uD558\uC138\uC694.");
        if (type === "medicalBed") {
          if (typeof p.value !== "boolean" || !t.building?.complete || t.building.type !== "bed") return no("\uC644\uC131\uB41C \uCE68\uB300\uC640 \uC758\uB8CC \uCE68\uC0C1 \uC0C1\uD0DC\uB97C \uC9C0\uC815\uD558\uC138\uC694.");
          const b = t.building;
          if (b.medical !== p.value && s.colonists.some((c) => !c.dead && (c.patientBedId === b.id || c.job?.type === "rescue" && c.job.bedId === b.id || c.job?.type === "rest" && c.job.targetId === b.id))) return no("\uC0AC\uC6A9 \uC911\uC774\uAC70\uB098 \uD658\uC790 \uC6B4\uBC18\uC774 \uC608\uC57D\uB41C \uCE68\uC0C1\uC740 \uC804\uD658\uD560 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4.");
          b.medical = p.value;
          return yes(p.value ? "\uC758\uB8CC \uCE68\uC0C1\uC73C\uB85C \uC9C0\uC815\uD588\uC2B5\uB2C8\uB2E4. \uAC74\uAC15\uD55C \uC8FC\uBBFC\uC740 \uC77C\uBC18 \uCE68\uB300\uB97C \uC0AC\uC6A9\uD569\uB2C8\uB2E4." : "\uC77C\uBC18 \uCE68\uB300\uB85C \uC804\uD658\uD588\uC2B5\uB2C8\uB2E4.");
        }
        if (type === "designate") {
          let kind = p.kind;
          if (kind === "gather") kind = t.feature === "tree" ? "chop" : t.feature === "ore" ? "mine" : t.feature === "berry" ? "harvest" : null;
          if (!["chop", "mine", "harvest"].includes(kind)) return no("\uCC44\uC9D1\uD560 \uB098\uBB34\xB7\uC5F4\uB9E4\xB7\uAD11\uC11D\uC744 \uC120\uD0DD\uD558\uC138\uC694.");
          const expected = kind === "chop" ? "tree" : kind === "mine" ? "ore" : "berry";
          if (t.feature !== expected || t.amount <= 0) return no(kind === "chop" ? "\uB098\uBB34\uAC00 \uC788\uB294 \uCE78\uC744 \uC120\uD0DD\uD558\uC138\uC694." : kind === "mine" ? "\uAD11\uC11D\uC774 \uC788\uB294 \uCE78\uC744 \uC120\uD0DD\uD558\uC138\uC694." : "\uC5F4\uB9E4 \uB364\uBD88\uC744 \uC120\uD0DD\uD558\uC138\uC694.");
          t.designation = kind;
          return yes("\uC791\uC5C5\uC744 \uC9C0\uC815\uD588\uC2B5\uB2C8\uB2E4. \uAC00\uB2A5\uD55C \uC8FC\uBBFC\uC774 \uC21C\uC11C\uB300\uB85C \uC218\uD589\uD569\uB2C8\uB2E4.");
        }
        if (type === "zone") {
          if (t.fire > 0) return no("\uBD88\uC744 \uBA3C\uC800 \uB048 \uB4A4 \uAD6C\uC5ED\uC744 \uC9C0\uC815\uD558\uC138\uC694.");
          if (!["farm", "stockpile"].includes(p.kind)) return no("\uC9C0\uC6D0\uD558\uC9C0 \uC54A\uB294 \uAD6C\uC5ED\uC785\uB2C8\uB2E4.");
          if (t.terrain === "water" || t.building || t.feature) return no("\uAC74\uBB3C\xB7\uC790\uC6D0\xB7\uBB3C\uC774 \uC5C6\uB294 \uBE48 \uB545\uC744 \uC120\uD0DD\uD558\uC138\uC694.");
          if (p.kind === "farm" && t.terrain === "stone") return no("\uB3CC \uC9C0\uD615\uC5D0\uB294 \uC791\uBB3C\uC744 \uC2EC\uC744 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4.");
          if (t.zone !== p.kind) {
            for (const c of s.colonists) if (c.job?.tx === t.x && c.job?.ty === t.y) this._releaseJob(c);
            t.zone = p.kind;
            if (p.kind !== "farm") t.crop = null;
          }
          return yes(p.kind === "farm" ? "\uACBD\uC791\uC9C0\uB97C \uC9C0\uC815\uD588\uC2B5\uB2C8\uB2E4. \uB18D\uC0AC \uB2F4\uB2F9\uC790\uAC00 \uD30C\uC885\uD569\uB2C8\uB2E4." : "\uCC3D\uACE0 \uAD6C\uC5ED\uC744 \uC9C0\uC815\uD588\uC2B5\uB2C8\uB2E4. \uC6B4\uBC18 \uB2F4\uB2F9\uC790\uAC00 \uBB3C\uC790\uB97C \uBAA8\uC74D\uB2C8\uB2E4.");
        }
        if (type === "build") {
          if (t.fire > 0) return no("\uBD88\uD0C0\uB294 \uCE78\uC5D0\uB294 \uAC74\uC124\uD560 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4. \uC18C\uBC29 \uC791\uC5C5\uC73C\uB85C \uBA3C\uC800 \uC9C4\uD654\uD558\uC138\uC694.");
          const def = Object.hasOwn(BUILDINGS, p.kind) ? BUILDINGS[p.kind] : null;
          if (!def) return no("\uC9C0\uC6D0\uD558\uC9C0 \uC54A\uB294 \uAC74\uBB3C\uC785\uB2C8\uB2E4.");
          if (def.tech && !s.research.unlocked.includes(def.tech)) return no(`${RESEARCH[def.tech].label} \uC5F0\uAD6C\uB97C \uBA3C\uC800 \uC644\uB8CC\uD558\uC138\uC694.`);
          if (t.terrain === "water" || t.building || t.feature || t.crop || t.zone === "farm") return no("\uAC74\uBB3C\xB7\uC790\uC6D0\xB7\uC791\uBB3C\xB7\uBB3C\uC774 \uC5C6\uB294 \uB545\uC5D0 \uC124\uCE58\uD558\uC138\uC694.");
          if (t.zone === "stockpile") return no("\uCC3D\uACE0 \uAD6C\uC5ED\uC744 \uBA3C\uC800 \uCDE8\uC18C\uD558\uAC70\uB098 \uB2E4\uB978 \uC704\uCE58\uB97C \uC120\uD0DD\uD558\uC138\uC694.");
          if (s.colonists.some((c) => !c.dead && Math.floor(c.x) === t.x && Math.floor(c.y) === t.y) && p.kind === "wall") return no("\uC8FC\uBBFC\uC774 \uC788\uB294 \uCE78\uC5D0\uB294 \uBCBD\uC744 \uACC4\uD68D\uD560 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4.");
          if (p.kind === "beacon" && s.tiles.some((q) => q.building?.type === "beacon")) return no("\uAD6C\uC870 \uC2E0\uD638\uAE30\uB294 \uD558\uB098\uBA74 \uCDA9\uBD84\uD569\uB2C8\uB2E4.");
          const missing = Object.entries(def.cost).filter(([k, v]) => s.resources[k] < v);
          if (missing.length) return no(`\uCC3D\uACE0 \uC790\uC6D0 \uBD80\uC871: ${missing.map(([k, v]) => `${RESOURCE_LABELS[k]} ${v - s.resources[k]}`).join(", ")}`);
          if (!s.colonists.some((c) => !c.dead && this._pathTo(c, t.x, t.y, true) !== null)) return no("\uC8FC\uBBFC\uC774 \uC774 \uAC74\uCD95 \uC704\uCE58\uC5D0 \uC811\uADFC\uD560 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4.");
          for (const [k, v] of Object.entries(def.cost)) withdrawStock(this, k, v);
          t.building = { id: this._id("building"), type: p.kind, hp: def.hp, maxHp: def.hp, progress: 0, complete: false, paidCost: { ...def.cost }, materials: {}, refunded: false, ...p.kind === "bed" ? { medical: false } : {} };
          return yes(`${def.label} \uACC4\uD68D\uC744 \uC138\uC6E0\uC2B5\uB2C8\uB2E4. \uC790\uC7AC\uB97C \uC608\uC57D\uD558\uACE0 \uC6B4\uBC18\uD569\uB2C8\uB2E4.`);
        }
        if (type === "cancel") {
          if (t.building && !t.building.complete) {
            const b = t.building;
            for (const c of s.colonists) if (c.job?.targetId === b.id || c.carry?.blueprintId === b.id) this._releaseJob(c, false);
            if (!b.refunded) {
              for (const [k, v] of Object.entries(b.paidCost)) depositStock(this, k, v, t.x, t.y);
              b.refunded = true;
            }
            t.building = null;
            return yes("\uAC74\uCD95\uC744 \uCDE8\uC18C\uD558\uACE0 \uC608\uC57D\uD55C \uC790\uC7AC\uB97C \uB3CC\uB824\uBC1B\uC558\uC2B5\uB2C8\uB2E4.");
          }
          if (t.designation || t.zone) {
            for (const c of s.colonists) if (c.job?.tx === t.x && c.job?.ty === t.y) this._releaseJob(c);
            t.designation = null;
            t.zone = null;
            t.crop = null;
            return yes("\uC791\uC5C5 \uB610\uB294 \uAD6C\uC5ED \uC9C0\uC815\uC744 \uD574\uC81C\uD588\uC2B5\uB2C8\uB2E4.");
          }
          return no(t.building ? "\uC644\uC131\uB41C \uAC74\uBB3C\uC740 \uCCA0\uAC70 \uB3C4\uAD6C\uB97C \uC0AC\uC6A9\uD558\uC138\uC694." : "\uCDE8\uC18C\uD560 \uC791\uC5C5\uC774\uB098 \uAD6C\uC5ED\uC774 \uC5C6\uC2B5\uB2C8\uB2E4.");
        }
        if (type === "demolish") {
          if (t.fire > 0) return no("\uBD88\uD0C0\uB294 \uAC74\uBB3C\uC740 \uBA3C\uC800 \uC9C4\uD654\uD574\uC57C \uCCA0\uAC70 \uC790\uC7AC\uB97C \uD68C\uC218\uD560 \uC218 \uC788\uC2B5\uB2C8\uB2E4.");
          if (!t.building?.complete) return no("\uC644\uC131\uB41C \uAC74\uBB3C\uC744 \uC120\uD0DD\uD558\uC138\uC694.");
          const b = t.building;
          this._onBuildingDestroyed(b, t, "demolish");
          for (const [k, v] of Object.entries(BUILDINGS[b.type].cost)) this._dropItem(k, Math.floor(v * 0.5), t.x, t.y);
          t.building = null;
          return yes("\uAC74\uBB3C\uC744 \uCCA0\uAC70\uD588\uC2B5\uB2C8\uB2E4. \uD68C\uC218\uD55C \uC790\uC7AC\uB294 \uCC3D\uACE0\uB85C \uC6B4\uBC18\uD574\uC57C \uD569\uB2C8\uB2E4.");
        }
      }
      if (type === "rescue" || type === "tend") {
        const c = s.colonists.find((c2) => c2.id === p.id && !c2.dead), patient = s.colonists.find((c2) => c2.id === p.targetId && !c2.dead);
        if (!c || c.drafted || c.health < 15 || c.carriedBy || c.carryingPawnId || c.patientBedId) return no("\uAC78\uC744 \uC218 \uC788\uACE0 \uC9D5\uC9D1\uB418\uC9C0 \uC54A\uC740 \uC8FC\uBBFC\uC744 \uC120\uD0DD\uD558\uC138\uC694.");
        const plan = type === "rescue" ? this._rescuePlan(c, patient, true) : this._carePlan(c, patient, "doctor", true);
        if (!plan) return no(type === "rescue" ? "\uC4F0\uB7EC\uC9C4 \uD658\uC790, \uC811\uADFC \uACBD\uB85C, \uBE44\uC5B4 \uC788\uB294 \uCE68\uC0C1\uACFC \uC608\uC57D\uC744 \uD655\uC778\uD558\uC138\uC694." : "\uCE58\uB8CC\uD560 \uD658\uC790\uC640 \uC811\uADFC \uACBD\uB85C\xB7\uC608\uC57D\uC744 \uD655\uC778\uD558\uC138\uC694.");
        if (!this._startPlan(c, plan, { forced: true })) return no("\uAC04\uD638 \uC791\uC5C5\uC744 \uC608\uC57D\uD560 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4.");
        return yes(`${c.name}: ${type === "rescue" ? "\uD658\uC790\uB97C \uC2E4\uC81C\uB85C \uCE68\uC0C1\uAE4C\uC9C0 \uC6B4\uBC18\uD569\uB2C8\uB2E4." : "\uC57D\uD488\uC744 \uAC00\uC838\uC624\uAC70\uB098 \uC751\uAE09 \uCC98\uCE58\uB85C \uCE58\uB8CC\uD569\uB2C8\uB2E4."}`);
      }
      if (type === "schedule" || type === "schedulePreset") {
        const c = s.colonists.find((c2) => c2.id === p.id && !c2.dead);
        if (!c) return no("\uC0B4\uC544 \uC788\uB294 \uC8FC\uBBFC\uC744 \uC120\uD0DD\uD558\uC138\uC694.");
        const hour = Math.floor((8 + s.time / DAY2 * 24) % 24), before = c.schedule[hour];
        if (type === "schedule") {
          if (!validInt(p.hour) || p.hour < 0 || p.hour > 23 || !Object.hasOwn(SCHEDULE_MODES, p.mode)) return no("0~23\uC2DC\uC640 \uC720\uD6A8\uD55C \uC77C\uC815 \uBAA8\uB4DC\uB97C \uC120\uD0DD\uD558\uC138\uC694.");
          c.schedule[p.hour] = p.mode;
        } else {
          if (!Object.hasOwn(SCHEDULE_PRESETS, p.preset)) return no("\uC9C0\uC6D0\uD558\uC9C0 \uC54A\uB294 \uC77C\uC815\uC785\uB2C8\uB2E4.");
          c.schedule = [...SCHEDULE_PRESETS[p.preset]];
        }
        if (c.schedule[hour] !== before) this._scheduleRelease(c);
        return yes(`${c.name}\uC758 \uC77C\uC815\uC744 \uBCC0\uACBD\uD588\uC2B5\uB2C8\uB2E4. \uAE34\uAE09\uD55C \uC695\uAD6C\uC640 \uAC04\uD638\xB7\uC18C\uBC29\uC740 \uBA3C\uC800 \uCC98\uB9AC\uD569\uB2C8\uB2E4.`);
      }
      if (type === "research") {
        if (!Object.hasOwn(RESEARCH, p.id)) return no("\uC9C0\uC6D0\uD558\uC9C0 \uC54A\uB294 \uC5F0\uAD6C\uC785\uB2C8\uB2E4.");
        const def = RESEARCH[p.id];
        if (s.research.unlocked.includes(p.id)) return no("\uC774\uBBF8 \uC644\uB8CC\uD55C \uC5F0\uAD6C\uC785\uB2C8\uB2E4.");
        if (!def.requires.every((id) => s.research.unlocked.includes(id))) return no(`\uC120\uD589 \uC5F0\uAD6C \uD544\uC694: ${def.requires.map((id) => RESEARCH[id].label).join(", ")}`);
        if (s.research.active !== p.id) {
          for (const c of s.colonists) if (c.job?.type === "research") this._releaseJob(c);
          s.research.active = p.id;
        }
        return yes(`${def.label} \uC5F0\uAD6C\uB97C \uC120\uD0DD\uD588\uC2B5\uB2C8\uB2E4. \uC5F0\uAD6C \uB2F4\uB2F9\uC790\uAC00 \uC644\uC131\uB41C \uC5F0\uAD6C\uB300\uC5D0\uC11C \uC9C4\uD589\uD569\uB2C8\uB2E4.`);
      }
      if (type === "autoRepair") {
        if (typeof p.value !== "boolean") return no("\uC790\uB3D9 \uC218\uB9AC \uC0C1\uD0DC\uB97C \uC9C0\uC815\uD558\uC138\uC694.");
        s.autoRepair = p.value;
        if (!p.value) {
          for (const c of s.colonists) if (c.job?.type === "repair" && !c.job.forced) this._releaseJob(c);
        }
        return yes(p.value ? "\uAC74\uC124 \uB2F4\uB2F9\uC790\uAC00 \uC190\uC0C1\uB41C \uAC74\uBB3C\uC744 \uC790\uB3D9 \uC218\uB9AC\uD569\uB2C8\uB2E4." : "\uC790\uB3D9 \uC218\uB9AC\uB97C \uC911\uC9C0\uD588\uC2B5\uB2C8\uB2E4. \uC6B0\uC120 \uC791\uC5C5\uC73C\uB85C \uAC1C\uBCC4 \uC218\uB9AC\uAC00 \uAC00\uB2A5\uD569\uB2C8\uB2E4.");
      }
      if (type === "moveGroup") {
        if (!Array.isArray(p.ids) || p.ids.length > 100 || p.ids.some((id) => typeof id !== "string") || !this.tile(p.x, p.y)) return no("\uC9D5\uC9D1\uB41C \uC8FC\uBBFC\uACFC \uC9C0\uB3C4 \uC548\uC758 \uBAA9\uC801\uC9C0\uB97C \uC120\uD0DD\uD558\uC138\uC694.");
        const requested = [...new Set(p.ids)], group = requested.map((id) => s.colonists.find((c) => c.id === id && !c.dead && c.drafted && c.health >= 15 && !c.carriedBy)).filter(Boolean);
        if (!group.length) return no("\uC774\uB3D9 \uAC00\uB2A5\uD55C \uC9D5\uC9D1 \uC8FC\uBBFC\uC774 \uC5C6\uC2B5\uB2C8\uB2E4.");
        const candidates = [];
        for (let radius = 0; radius <= 6; radius++) for (let dy = -radius; dy <= radius; dy++) for (let dx = -radius; dx <= radius; dx++) if (Math.abs(dx) + Math.abs(dy) === radius && this._walkable(p.x + dx, p.y + dy)) candidates.push({ x: p.x + dx, y: p.y + dy });
        const used = /* @__PURE__ */ new Set(), assigned = [];
        for (const c of group) {
          for (const cell2 of candidates) {
            const key = `${cell2.x},${cell2.y}`;
            if (used.has(key)) continue;
            const path = this._pathTo(c, cell2.x, cell2.y);
            if (path === null) continue;
            this._releaseJob(c);
            c.path = path;
            c.destination = { ...cell2, adjacent: false, raider: false };
            c.order = { type: "move", ...cell2 };
            c.status = "\uBD84\uC0B0 \uB300\uD615\uC73C\uB85C \uC774\uB3D9";
            used.add(key);
            assigned.push(c.id);
            break;
          }
        }
        if (!assigned.length) return no("\uC120\uD0DD\uD55C \uC8FC\uBBFC\uC774 \uC811\uADFC\uD560 \uC218 \uC788\uB294 \uC8FC\uBCC0 \uCE78\uC774 \uC5C6\uC2B5\uB2C8\uB2E4.");
        return { ...yes(`${assigned.length}/${requested.length}\uBA85\uC774 \uC11C\uB85C \uB2E4\uB978 \uCE78\uC73C\uB85C \uC774\uB3D9\uD569\uB2C8\uB2E4.`), count: assigned.length, assigned };
      }
      if (["draft", "move", "attack", "hold", "priority", "prioritize"].includes(type)) {
        const c = s.colonists.find((c2) => c2.id === p.id && !c2.dead);
        if (!c) return no("\uC0B4\uC544 \uC788\uB294 \uC8FC\uBBFC\uC744 \uC120\uD0DD\uD558\uC138\uC694.");
        if (type === "prioritize") {
          if (c.drafted) return no("\uC6B0\uC120 \uC791\uC5C5\uC744 \uD558\uB824\uBA74 \uC9D5\uC9D1\uC744 \uD574\uC81C\uD558\uC138\uC694.");
          if (c.health < 15 || c.carriedBy || c.patientBedId) return no("\uD68C\uBCF5 \uC911\uC778 \uC8FC\uBBFC\uC740 \uBA3C\uC800 \uCE58\uB8CC\uD574\uC57C \uD569\uB2C8\uB2E4.");
          const t = this.tile(p.x, p.y);
          if (!t) return no("\uC9C0\uB3C4 \uC548\uC758 \uC791\uC5C5 \uB300\uC0C1\uC744 \uC120\uD0DD\uD558\uC138\uC694.");
          if (c.job?.forced && c.job.tx === t.x && c.job.ty === t.y) return yes("\uC774\uBBF8 \uD574\uB2F9 \uC791\uC5C5\uC744 \uC6B0\uC120 \uC218\uD589\uD558\uACE0 \uC788\uC2B5\uB2C8\uB2E4.");
          const plan = this._tileJobPlan(c, t);
          if (!plan) return no("\uC811\uADFC\xB7\uC790\uC7AC\xB7\uC608\uC57D\uC744 \uD655\uC778\uD558\uC138\uC694. \uAC74\uCD95 \uACC4\uD68D, \uC9C0\uC815 \uC790\uC6D0, \uACBD\uC791\uC9C0 \uB610\uB294 \uC190\uC0C1\uB41C \uAC74\uBB3C\uC774 \uD544\uC694\uD569\uB2C8\uB2E4.");
          if (!this._startTilePlan(c, plan, true)) return no("\uC6B0\uC120 \uC791\uC5C5\uC744 \uC608\uC57D\uD560 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4.");
          return yes(`${c.name}: ${plan.status}. \uAE34\uAE09\uD55C \uC2DD\uC0AC\uC640 \uD734\uC2DD\uC740 \uBA3C\uC800 \uCC98\uB9AC\uD569\uB2C8\uB2E4.`);
        }
        if (type === "priority") {
          if (!WORK.includes(p.work) || !validInt(p.value) || p.value < 0 || p.value > 4) return no("\uC6B0\uC120\uC21C\uC704\uB294 0~4\uC785\uB2C8\uB2E4.");
          c.priorities[p.work] = p.value;
          if (p.value === 0 && (c.job?.type === p.work || p.work === "doctor" && c.job?.type === "feed" || p.work === "build" && c.job?.type === "repair")) this._releaseJob(c);
          return yes(`${JOB_LABELS[p.work]} ${p.value === 0 ? "\uBE44\uD65C\uC131" : `\uC6B0\uC120\uC21C\uC704 ${p.value}`}`);
        }
        if (type === "draft") {
          if (typeof p.value !== "boolean") return no("\uC9D5\uC9D1 \uC0C1\uD0DC\uB97C \uC9C0\uC815\uD558\uC138\uC694.");
          if (c.carriedBy || p.value && (c.health < 15 || c.patientBedId)) return no("\uAD6C\uC870\xB7\uD68C\uBCF5 \uC911\uC778 \uC8FC\uBBFC\uC740 \uBA3C\uC800 \uCE58\uB8CC\uD574\uC57C \uD569\uB2C8\uB2E4.");
          this._releaseJob(c);
          c.drafted = p.value;
          c.order = null;
          c.status = p.value ? "\uC9D5\uC9D1 \xB7 \uACBD\uACC4 \uC911" : "\uC77C\uC0C1 \uC5C5\uBB34 \uBCF5\uADC0";
          return yes(p.value ? "\uC9D5\uC9D1\uD588\uC2B5\uB2C8\uB2E4. \uC6B0\uD074\uB9AD\uC73C\uB85C \uC774\uB3D9\xB7\uACF5\uACA9\uC744 \uC9C0\uD718\uD558\uC138\uC694." : "\uC9D5\uC9D1\uC744 \uD574\uC81C\uD588\uC2B5\uB2C8\uB2E4. \uC790\uB3D9\uC73C\uB85C \uC77C\uC0C1 \uC5C5\uBB34\uC5D0 \uBCF5\uADC0\uD569\uB2C8\uB2E4.");
        }
        if (!c.drafted) return no("\uC804\uD22C \uBA85\uB839\uC744 \uB0B4\uB9AC\uB824\uBA74 \uC8FC\uBBFC\uC744 \uBA3C\uC800 \uC9D5\uC9D1\uD558\uC138\uC694.");
        if (type === "hold") {
          c.path = [];
          c.destination = null;
          c.order = { type: "hold" };
          c.status = "\uAC70\uC810 \uC720\uC9C0 \xB7 \uACBD\uACC4 \uC911";
          return yes("\uD604\uC7AC \uC704\uCE58\uB97C \uC9C0\uD0B5\uB2C8\uB2E4. \uC0AC\uAC70\uB9AC\uC640 \uC2DC\uC57C \uC548\uC758 \uC801\uC5D0\uAC8C \uC0AC\uACA9\uD569\uB2C8\uB2E4.");
        }
        if (type === "move") {
          if (!this.tile(p.x, p.y) || !this._walkable(p.x, p.y)) return no("\uC774\uB3D9 \uAC00\uB2A5\uD55C \uB545\uC744 \uC120\uD0DD\uD558\uC138\uC694.");
          if (!this._goto(c, p.x, p.y)) return no("\uADF8 \uC704\uCE58\uB85C \uC774\uB3D9\uD558\uB294 \uACBD\uB85C\uAC00 \uC5C6\uC2B5\uB2C8\uB2E4.");
          c.order = { type: "move", x: p.x, y: p.y };
          c.status = "\uC9C0\uC815 \uC704\uCE58\uB85C \uC774\uB3D9";
          return yes("\uC774\uB3D9 \uBA85\uB839\uC744 \uB0B4\uB838\uC2B5\uB2C8\uB2E4. \uB3C4\uCC29\uD55C \uB4A4 \uC8FC\uBCC0\uC744 \uACBD\uACC4\uD569\uB2C8\uB2E4.");
        }
        const r = s.raiders.find((r2) => r2.id === p.targetId && !r2.dead);
        if (!r) return no("\uC0B4\uC544 \uC788\uB294 \uC801\uC744 \uC120\uD0DD\uD558\uC138\uC694.");
        c.order = { type: "attack", targetId: r.id };
        c.nextCombatPath = 0;
        c.path = [];
        return yes("\uC801\uC744 \uACF5\uACA9\uD569\uB2C8\uB2E4. \uC0AC\uAC70\uB9AC \uC548\uC5D0\uC11C \uC790\uB3D9 \uC0AC\uACA9\uD569\uB2C8\uB2E4.");
      }
      if (type === "autoCook") {
        if (typeof p.value !== "boolean") return no("\uC790\uB3D9 \uC870\uB9AC \uC0C1\uD0DC\uB97C \uC9C0\uC815\uD558\uC138\uC694.");
        if (p.target !== void 0 && (!validInt(p.target) || p.target < 1 || p.target > 100)) return no("\uBAA9\uD45C \uC2DD\uC0AC\uB294 1~100\uAC1C\uC785\uB2C8\uB2E4.");
        s.autoCook = p.value;
        if (p.target !== void 0) s.mealTarget = p.target;
        if (!s.autoCook) {
          for (const c of s.colonists) if (c.job?.type === "cook") this._releaseJob(c);
        }
        return yes(s.autoCook ? `\uC2DD\uC0AC ${s.mealTarget}\uAC1C\uAE4C\uC9C0 \uC790\uB3D9 \uC870\uB9AC\uD569\uB2C8\uB2E4.` : "\uC790\uB3D9 \uC870\uB9AC\uB97C \uC911\uC9C0\uD588\uC2B5\uB2C8\uB2E4.");
      }
      if (type === "raid") {
        if (s.activeRaid) return no("\uC774\uBBF8 \uC2B5\uACA9\uC774 \uC9C4\uD589 \uC911\uC785\uB2C8\uB2E4.");
        this._spawnRaid();
        return yes("\uC57D\uD0C8\uC790\uB4E4\uC774 \uC811\uADFC\uD569\uB2C8\uB2E4. \uBC29\uC5B4 \uC900\uBE44\uB97C \uD558\uC138\uC694.");
      }
      return no("\uC54C \uC218 \uC5C6\uB294 \uBA85\uB839\uC785\uB2C8\uB2E4.");
    }
    getSummary() {
      const s = this.state, alive = s.colonists.filter((c) => !c.dead).length, hour = (8 + s.time / DAY2 * 24) % 24;
      return {
        day: Math.floor((s.time + DAY2 / 3) / DAY2) + 1,
        hour,
        temperature: Math.round(outsideTemperature(s)),
        foodDays: alive ? (this._countFood("meals") * 64 + this._countFood("rawfood") * 30) / (alive * (s.difficulty === "relaxed" ? 0.22 : 0.28) * DAY2) : 0,
        threat: s.activeRaid ? "\uC2B5\uACA9 \uC9C4\uD589" : s.nextRaidAt - s.time < 35 ? "\uC2B5\uACA9 \uC784\uBC15" : "\uD3C9\uC628",
        beaconProgress: s.beaconProgress,
        alive,
        nextRaidIn: Math.max(0, s.nextRaidAt - s.time),
        indoorBeds: s.tiles.filter((t) => t.roofed && t.building?.complete && t.building.type === "bed").length,
        coldStorage: s.tiles.some((t) => t.zone === "stockpile" && t.roofed && t.temperature <= 8),
        powerGeneration: s.power.generation,
        powerDemand: s.power.demand,
        powerStored: s.power.stored,
        powerCapacity: s.power.capacity,
        researchActive: s.research.active,
        spoiled: s.systemStats.spoiled,
        fireCount: s.tiles.filter((t) => t.fire > 0).length,
        downed: s.colonists.filter((c) => !c.dead && c.health < 15).length
      };
    }
    getMoodFactors(c) {
      if (typeof c === "string") c = this.state.colonists.find((p) => p.id === c);
      return moodFactors(c);
    }
    getEquipmentStats(c) {
      if (typeof c === "string") c = this.state.colonists.find((p) => p.id === c);
      return equipmentStats(c);
    }
    getRoomAt(x, y) {
      const t = this.tile(x, y);
      return t?.roomId === null || t?.roomId === void 0 ? null : this.state.rooms.find((r) => r.id === t.roomId) || null;
    }
    getObjectives() {
      const s = this.state, beds = this.getSummary().indoorBeds, beacon = s.tiles.find((t) => t.building?.complete && t.building.type === "beacon")?.building, food = this._countFood(), tech = s.research.unlocked.includes("communications"), fires = s.tiles.filter((t) => t.fire > 0).length;
      return [
        { id: "beds", label: "\uC2E4\uB0B4 \uCE68\uB300 3\uAC1C \uD655\uBCF4", detail: `\uBC00\uD3D0\uB41C \uBC29\uC758 \uCE68\uB300 ${beds}/3 \xB7 \uB3D9\uCABD\xB7\uB0A8\uCABD \uD2C8\uC744 \uB9C9\uC73C\uC138\uC694`, done: beds >= 3, progress: clamp5(beds / 3, 0, 1) },
        { id: "food", label: "\uC2DD\uC0AC 6\uAC1C \uBE44\uCD95", detail: `\uC644\uC131\uB41C \uC2DD\uC0AC ${food}/6`, done: food >= 6, progress: clamp5(food / 6, 0, 1) },
        { id: "research", label: "\uC804\uAE30 \uACF5\uD559 \u2192 \uC7A5\uAC70\uB9AC \uD1B5\uC2E0", detail: tech ? "\uC7A5\uAC70\uB9AC \uD1B5\uC2E0 \uD574\uAE08 \uC644\uB8CC" : `${s.research.active ? RESEARCH[s.research.active].label : "\uB2E4\uC74C \uC5F0\uAD6C \uC120\uD0DD"} \xB7 \uC5F0\uAD6C\uB300\uC5D0\uC11C \uC2E4\uC81C \uC5F0\uAD6C`, done: tech, progress: clamp5((s.research.progress.electricity + s.research.progress.communications) / 280, 0, 1) },
        { id: "raid", label: "\uC2B5\uACA9\uC5D0\uC11C \uC0B4\uC544\uB0A8\uAE30", detail: `\uBC29\uC5B4 \uC131\uACF5 ${s.stats.survivedRaids}\uD68C`, done: s.stats.survivedRaids >= 1, progress: Math.min(1, s.stats.survivedRaids) },
        { id: "beacon", label: "\uC804\uB825\uC774 \uC5F0\uACB0\uB41C \uAD6C\uC870 \uC2E0\uD638\uAE30", detail: beacon ? beacon.powered ? "240 W \uACF5\uAE09 \uC911" : "\uC804\uB825\uC120\xB7\uBC1C\uC804\uB7C9\xB7\uCD95\uC804\uC9C0\uB97C \uD655\uC778\uD558\uC138\uC694" : "\uBAA9\uC7AC 40 \xB7 \uAC15\uCCA0 40 \xB7 \uC7A5\uAC70\uB9AC \uD1B5\uC2E0 \uD544\uC694", done: !!beacon?.powered, progress: beacon?.powered ? 1 : beacon ? 0.5 : 0 },
        { id: "safety", label: "\uBD88\uC744 \uB044\uACE0 \uC815\uCC29\uC9C0 \uC548\uC804 \uD655\uBCF4", detail: fires ? `\uD654\uC7AC ${fires}\uCE78 \xB7 \uC9C4\uD654\uD560 \uB54C\uAE4C\uC9C0 \uC2E0\uD638 \uC804\uC1A1 \uC911\uB2E8` : `\uD604\uC7AC \uD654\uC7AC \uC5C6\uC74C \xB7 \uC9C4\uD654 ${s.hazards.extinguished}\uD68C`, done: fires === 0, progress: fires ? 0 : 1 },
        { id: "signal", label: "\uCD5C\uC885 \uC2B5\uACA9\uC744 \uACAC\uB514\uACE0 \uAD6C\uC870 \uC2E0\uD638 \uC804\uC1A1", detail: s.victory ? "\uAD6C\uC870\uC120\uC774 \uC751\uB2F5\uD588\uC2B5\uB2C8\uB2E4" : fires ? "\uD654\uC7AC\uB85C \uC804\uC1A1 \uC77C\uC2DC \uC911\uB2E8" : s.activeRaid && s.extractionAlarmTriggered ? "\uC2B5\uACA9 \uC911 \uC804\uC1A1 \uC77C\uC2DC \uC911\uB2E8" : `\uC870\uAC74 \uCDA9\uC871 \uC911 \uC804\uC1A1 \xB7 ${Math.floor(s.beaconProgress * 100)}% \xB7 50%\uC5D0\uC11C \uCD5C\uC885 \uC2B5\uACA9`, done: s.victory, progress: s.beaconProgress }
      ];
    }
    toJSON() {
      return copy(this.state);
    }
    static fromJSON(data) {
      const bad = (reason) => {
        throw new Error(`\uC800\uC7A5 \uD30C\uC77C\uC774 \uC62C\uBC14\uB974\uC9C0 \uC54A\uC2B5\uB2C8\uB2E4: ${reason}`);
      };
      if (!data || typeof data !== "object" || Array.isArray(data)) bad("\uAC8C\uC784 \uC0C1\uD0DC \uC5C6\uC74C");
      if (![1, 2, 3, 4].includes(data.version)) bad("\uC9C0\uC6D0\uD558\uC9C0 \uC54A\uB294 \uBC84\uC804");
      const legacy = data.version === 1, previous = data.version < 3, previousIndustry = data.version < 4, resourceKeys = previousIndustry ? LEGACY_KEYS : KEYS, workKeys = WORK.filter((k) => (!legacy || k !== "research") && (!previous || !["rescue", "firefight"].includes(k)) && (!previousIndustry || k !== "craft"));
      if (data.width !== 48 || data.height !== 32 || !Array.isArray(data.tiles) || data.tiles.length !== 1536) bad("\uC9C0\uB3C4 \uD06C\uAE30");
      const number2 = (v, a, b, label) => {
        if (!Number.isFinite(v) || v < a || v > b) bad(label);
      };
      if (!validInt(data.seed) || !["standard", "relaxed"].includes(data.difficulty)) bad("\uC2DC\uB098\uB9AC\uC624");
      number2(data.time, 0, 1e10, "\uC2DC\uAC04");
      number2(data.rngState, 0, 4294967295, "\uB09C\uC218");
      number2(data.nextId, 1, 1e10, "\uAC1C\uCCB4 ID");
      number2(data.accumulator, 0, 3601, "\uB204\uC801 \uC2DC\uAC04");
      number2(data.nextRaidAt, 0, 1e10, "\uC2B5\uACA9 \uC2DC\uAC04");
      number2(data.beaconProgress, 0, 1, "\uC2E0\uD638 \uC9C4\uD589");
      if (!data.resources || resourceKeys.some((k) => !validInt(data.resources[k]) || data.resources[k] < 0 || data.resources[k] > 1e8)) bad("\uC790\uC6D0");
      if (!Array.isArray(data.colonists) || !data.colonists.length || data.colonists.length > 100 || !Array.isArray(data.raiders) || data.raiders.length > 1e3 || !Array.isArray(data.items) || data.items.length > 1e4) bad("\uAC1C\uCCB4 \uBAA9\uB85D");
      const ids = /* @__PURE__ */ new Set(), id = (v) => {
        if (typeof v !== "string" || !v || v.length > 100 || ids.has(v)) bad("\uC911\uBCF5 \uB610\uB294 \uC798\uBABB\uB41C ID");
        ids.add(v);
      };
      const xy = (o, cell2 = false) => {
        number2(o.x, 0, cell2 ? 47 : 47.999999, "x \uC88C\uD45C");
        number2(o.y, 0, cell2 ? 31 : 31.999999, "y \uC88C\uD45C");
        if (cell2 && (!validInt(o.x) || !validInt(o.y))) bad("\uC140 \uC88C\uD45C");
      };
      for (let i = 0; i < data.tiles.length; i++) {
        const t = data.tiles[i];
        if (!t || t.x !== i % 48 || t.y !== Math.floor(i / 48) || !["grass", "soil", "water", "stone"].includes(t.terrain) || ![null, "tree", "berry", "ore"].includes(t.feature) || ![null, "farm", "stockpile"].includes(t.zone) || ![null, "chop", "mine", "harvest"].includes(t.designation)) bad("\uC9C0\uD615");
        number2(t.amount, 0, 1e6, "\uC790\uC6D0\uB7C9");
        if (t.crop) number2(t.crop.growth, 0, 1, "\uC791\uBB3C");
        if (t.building) {
          const b = t.building;
          id(b.id);
          if (!Object.hasOwn(BUILDINGS, b.type) || typeof b.complete !== "boolean") bad("\uAC74\uBB3C");
          number2(b.hp, 0, 1e6, "\uAC74\uBB3C \uB0B4\uAD6C\uB3C4");
          number2(b.maxHp, 1, 1e6, "\uAC74\uBB3C \uCD5C\uB300 \uB0B4\uAD6C\uB3C4");
          number2(b.progress, 0, 1, "\uAC74\uC124 \uC9C4\uD589");
          if (!b.paidCost || !b.materials) bad("\uAC74\uC124 \uC790\uC7AC");
          for (const obj of [b.paidCost, b.materials]) for (const [k, v] of Object.entries(obj)) if (!resourceKeys.includes(k) || !validInt(v) || v < 0 || v > 1e6) bad("\uAC74\uC124 \uC790\uC7AC \uC218\uB7C9");
        }
      }
      const colonistIds = new Set(data.colonists.map((c) => c?.id));
      for (const c of data.colonists) {
        if (!c) bad("\uC8FC\uBBFC");
        id(c.id);
        xy(c);
        for (const k of ["health", "hunger", "energy", "mood"]) number2(c[k], 0, 100, k);
        number2(c.bleed, 0, 100, "\uCD9C\uD608");
        if (typeof c.dead !== "boolean" || typeof c.drafted !== "boolean" || typeof c.name !== "string" || c.name.length > 100) bad("\uC8FC\uBBFC \uC0C1\uD0DC");
        if (!c.skills || !c.priorities || !Array.isArray(c.path)) bad("\uC8FC\uBBFC \uC791\uC5C5");
        for (const k of [...workKeys, "shoot"]) number2(c.skills[k], 0, 100, "\uAE30\uC220");
        for (const k of workKeys) if (!validInt(c.priorities[k]) || c.priorities[k] < 0 || c.priorities[k] > 4) bad("\uC6B0\uC120\uC21C\uC704");
        if (c.path.length > 1536) bad("\uACBD\uB85C \uAE38\uC774");
        for (const p of c.path) xy(p, true);
        if (c.job) {
          if (typeof c.job.type !== "string" || ![...workKeys, "eat", "rest", ...!legacy ? ["repair"] : [], ...!previous ? ["feed", "recreate"] : [], ...!previousIndustry ? ["equip"] : []].includes(c.job.type)) bad("\uC791\uC5C5 \uC885\uB958");
          number2(c.job.tx, 0, 47, "\uC791\uC5C5 x");
          number2(c.job.ty, 0, 31, "\uC791\uC5C5 y");
          number2(c.job.progress, 0, 1e8, "\uC791\uC5C5 \uC9C4\uD589");
          number2(c.job.total, 1e-5, 1e8, "\uC791\uC5C5\uB7C9");
        }
        if (c.carry) {
          if (!resourceKeys.includes(c.carry.type) || !validInt(c.carry.count) || c.carry.count <= 0 || c.carry.count > 1e6) bad("\uC6B4\uBC18 \uC911 \uBB3C\uD488");
        }
      }
      for (const r of data.raiders) {
        id(r.id);
        xy(r);
        number2(r.health, 0, 1e6, "\uC801 \uCCB4\uB825");
        number2(r.maxHp, 1, 1e6, "\uC801 \uCD5C\uB300 \uCCB4\uB825");
        if (typeof r.dead !== "boolean" || !Array.isArray(r.path)) bad("\uC801 \uC0C1\uD0DC");
        for (const p of r.path) xy(p, true);
      }
      for (const i of data.items) {
        id(i.id);
        xy(i, true);
        if (!resourceKeys.includes(i.type) || !validInt(i.count) || i.count <= 0 || i.count > 1e8 || i.reservedBy !== null && !colonistIds.has(i.reservedBy)) bad("\uBB3C\uD488");
      }
      if (!data.reservations || typeof data.reservations !== "object" || Array.isArray(data.reservations)) bad("\uC608\uC57D");
      for (const r of Object.values(data.reservations)) {
        if (!r || !colonistIds.has(r.owner)) bad("\uC608\uC57D \uC18C\uC720\uC790");
        number2(r.expiry, 0, 1e10, "\uC608\uC57D \uAE30\uD55C");
      }
      if (!Array.isArray(data.logs) || data.logs.length > 100 || !Array.isArray(data.effects) || data.effects.length > 500 || !data.stats) bad("\uAE30\uB85D");
      for (const k of ["harvested", "buildingsBuilt", "mealsCooked", "raidersDefeated", "survivedRaids"]) if (!validInt(data.stats[k]) || data.stats[k] < 0) bad("\uD1B5\uACC4");
      for (const k of ["victory", "gameOver", "autoCook", "activeRaid"]) if (typeof data[k] !== "boolean") bad("\uC9C4\uD589 \uC0C1\uD0DC");
      if (!["clear", "rain", "heat"].includes(data.weather) || !validInt(data.mealTarget) || data.mealTarget < 1 || data.mealTarget > 100) bad("\uD658\uACBD \uC124\uC815");
      for (const k of ["systemTimer", "weatherTimer", "raidNumber"]) number2(data[k], 0, 1e10, "\uC2DC\uC2A4\uD15C \uC2DC\uAC04");
      const record6 = (v) => !!v && typeof v === "object" && !Array.isArray(v);
      const text = (v, max, label) => {
        if (typeof v !== "string" || v.length > max) bad(label);
      };
      const destination = (d) => {
        if (d !== null && d !== void 0) {
          if (!record6(d)) bad("\uC774\uB3D9 \uBAA9\uC801\uC9C0");
          xy(d, true);
          if (typeof d.adjacent !== "boolean" || typeof d.raider !== "boolean") bad("\uC774\uB3D9 \uC815\uCC45");
        }
      };
      if (!record6(data.lastAlerts)) bad("\uC54C\uB9BC \uC2DC\uAC01");
      for (const v of Object.values(data.lastAlerts)) number2(v, 0, 1e10, "\uC54C\uB9BC \uC2DC\uAC01");
      if (!validInt(data.rngState) || !validInt(data.nextId) || !validInt(data.raidNumber)) bad("\uC815\uC218 \uC2DC\uC2A4\uD15C \uC0C1\uD0DC");
      for (const t of data.tiles) if (t.building) {
        const b = t.building;
        if (!record6(b.paidCost) || !record6(b.materials) || typeof b.refunded !== "boolean") bad("\uAC74\uC124 \uC790\uC7AC \uC0C1\uD0DC");
        for (const [key, n] of Object.entries(b.materials)) if (n > (b.paidCost[key] || 0)) bad("\uC608\uC57D\uB7C9\uC744 \uB118\uB294 \uAC74\uC124 \uC790\uC7AC");
      }
      if (!legacy) {
        if (typeof data.autoRepair !== "boolean" || typeof data.extractionAlarmTriggered !== "boolean") bad("\uC790\uB3D9 \uC218\uB9AC \uB610\uB294 \uAD6C\uC870 \uACBD\uBCF4");
        const r = data.research;
        if (!record6(r) || !record6(r.progress) || !Array.isArray(r.unlocked) || r.unlocked.length > 3 || new Set(r.unlocked).size !== r.unlocked.length) bad("\uC5F0\uAD6C \uC0C1\uD0DC");
        if (r.active !== null && !Object.hasOwn(RESEARCH, r.active)) bad("\uC9C4\uD589 \uC5F0\uAD6C");
        for (const [rid, def] of Object.entries(RESEARCH)) number2(r.progress[rid], 0, def.points, "\uC5F0\uAD6C \uC9C4\uD589");
        if (Object.keys(r.progress).some((rid) => !Object.hasOwn(RESEARCH, rid))) bad("\uC54C \uC218 \uC5C6\uB294 \uC5F0\uAD6C \uC9C4\uD589");
        for (const rid of r.unlocked) {
          if (!Object.hasOwn(RESEARCH, rid) || r.progress[rid] !== RESEARCH[rid].points || !RESEARCH[rid].requires.every((prereq) => r.unlocked.includes(prereq))) bad("\uC5F0\uAD6C \uD574\uAE08 \uC870\uAC74");
        }
        if (r.active !== null && (r.unlocked.includes(r.active) || !RESEARCH[r.active].requires.every((prereq) => r.unlocked.includes(prereq)))) bad("\uC9C4\uD589 \uC5F0\uAD6C \uC120\uD589 \uC870\uAC74");
        validateSystems(data, bad);
      }
      for (const c of data.colonists) {
        text(c.status, 500, "\uC8FC\uBBFC \uD589\uB3D9 \uD45C\uC2DC");
        text(c.role, 100, "\uC5ED\uD560");
        text(c.color, 50, "\uC8FC\uBBFC \uC0C9\uC0C1");
        for (const k of ["thinkAt", "shotCooldown", "breakUntil", "nextBreakAt"]) number2(c[k], 0, 1e10, "\uC8FC\uBBFC \uD589\uB3D9 \uC2DC\uAC04");
        if (c.nextCombatPath !== void 0) number2(c.nextCombatPath, 0, 1e10, "\uC804\uD22C \uAC31\uC2E0 \uC2DC\uAC04");
        if (!record6(c.blockedTargets)) bad("\uACBD\uB85C \uC7AC\uC2DC\uB3C4 \uC0C1\uD0DC");
        for (const v of Object.values(c.blockedTargets)) number2(v, 0, 1e10, "\uACBD\uB85C \uC7AC\uC2DC\uB3C4 \uC2DC\uAC04");
        destination(c.destination);
        if (c.order !== null) {
          if (!record6(c.order) || !["move", "attack", ...!previous ? ["hold"] : []].includes(c.order.type)) bad("\uC804\uD22C \uBA85\uB839");
          if (c.order.type === "move") xy(c.order, true);
          else if (c.order.type === "attack" && typeof c.order.targetId !== "string") bad("\uACF5\uACA9 \uB300\uC0C1");
        }
        if (c.job) {
          if (!["work", "fetch", "deliver", "pickup", "eat"].includes(c.job.stage)) bad("\uC791\uC5C5 \uB2E8\uACC4");
          if (!validInt(c.job.tx) || !validInt(c.job.ty)) bad("\uC791\uC5C5 \uBAA9\uC801\uC9C0");
          if (c.job.key !== void 0) text(c.job.key, 250, "\uC791\uC5C5 \uC608\uC57D\uD0A4");
          if (c.job.forced !== void 0 && typeof c.job.forced !== "boolean") bad("\uC6B0\uC120 \uC791\uC5C5 \uC0C1\uD0DC");
          if (c.job.type === "research" && (!Object.hasOwn(RESEARCH, c.job.researchId) || typeof c.job.targetId !== "string" || c.job.stage !== "work")) bad("\uC5F0\uAD6C \uC791\uC5C5");
          if (c.job.type === "repair" && (!["wood", "steel"].includes(c.job.resource) || typeof c.job.targetId !== "string" || !["fetch", "work"].includes(c.job.stage))) bad("\uC218\uB9AC \uC791\uC5C5");
        }
        if (c.carry?.source === "construction") {
          const b = data.tiles.find((t) => t.building?.id === c.carry.blueprintId)?.building;
          if (!b || b.complete || !Object.hasOwn(b.paidCost, c.carry.type) || c.carry.count + (b.materials[c.carry.type] || 0) > b.paidCost[c.carry.type]) bad("\uC6B4\uBC18 \uC911 \uAC74\uCD95 \uC790\uC7AC \uCC38\uC870");
        }
      }
      for (const item of data.items) if (item.reservedBy) {
        const owner = data.colonists.find((c) => c.id === item.reservedBy);
        if (!owner || owner.dead || owner.job?.targetId !== item.id) bad("\uACE0\uC544 \uBB3C\uD488 \uC608\uC57D");
      }
      for (const [key, r] of Object.entries(data.reservations)) {
        const owner = data.colonists.find((c) => c.id === r.owner);
        if (!owner || owner.dead || owner.job?.key !== key) bad("\uACE0\uC544 \uC791\uC5C5 \uC608\uC57D");
      }
      for (const r of data.raiders) {
        for (const k of ["shotCooldown", "thinkAt"]) number2(r[k], 0, 1e10, "\uC801 \uD589\uB3D9 \uC2DC\uAC04");
        destination(r.destination);
        text(r.status, 500, "\uC801 \uD589\uB3D9 \uD45C\uC2DC");
      }
      for (const e of data.effects) {
        if (!record6(e) || !["shot", "hit", "harvest", "heal", "build"].includes(e.kind)) bad("\uD6A8\uACFC");
        for (const k of ["x", "tx"]) number2(e[k], 0, 48, "\uD6A8\uACFC \uC88C\uD45C");
        for (const k of ["y", "ty"]) number2(e[k], 0, 32, "\uD6A8\uACFC \uC88C\uD45C");
        number2(e.age, 0, 100, "\uD6A8\uACFC \uC2DC\uAC04");
        number2(e.life, 1e-5, 100, "\uD6A8\uACFC \uC218\uBA85");
        text(e.color, 50, "\uD6A8\uACFC \uC0C9\uC0C1");
        text(e.text, 500, "\uD6A8\uACFC \uC124\uBA85");
      }
      for (const l of data.logs) {
        if (!record6(l) || !["info", "success", "warning", "danger"].includes(l.kind)) bad("\uAE30\uB85D \uC885\uB958");
        id(l.id);
        number2(l.time, 0, 1e10, "\uAE30\uB85D \uC2DC\uAC01");
        text(l.title, 300, "\uAE30\uB85D \uC81C\uBAA9");
        text(l.text, 2e3, "\uAE30\uB85D \uBCF8\uBB38");
      }
      if (!previous) {
        validateLife(data, bad);
        validateHazards(data, bad);
      }
      if (!previousIndustry) {
        validateIndustry(data, bad);
        validateTrade(data, bad);
      }
      const game2 = Object.create(_ColonyGame.prototype);
      game2.state = copy(data);
      if (legacy) {
        const s = game2.state;
        s.version = 2;
        s.autoRepair = true;
        s.extractionAlarmTriggered = s.victory;
        const grandfather = s.tiles.some((t) => t.building?.type === "beacon");
        s.research = { active: grandfather ? null : "electricity", progress: { electricity: grandfather ? 100 : 0, refrigeration: 0, communications: grandfather ? 180 : 0 }, unlocked: grandfather ? ["electricity", "communications"] : [] };
        for (const c of s.colonists) {
          c.skills.research = c.name === "\uBBF8\uB098" ? 10 : c.name === "\uB3C4\uD604" ? 7 : 6;
          c.priorities.research = c.name === "\uBBF8\uB098" ? 2 : 4;
        }
        initializeSystems(game2, { migration: true });
        validateSystems(s, bad);
      }
      if (previous) {
        game2.state.version = 3;
        initializeLife(game2, { migration: true });
        initializeHazards(game2, { migration: true });
        validateLife(game2.state, bad);
        validateHazards(game2.state, bad);
      }
      if (previousIndustry) {
        game2.state.version = 4;
        initializeIndustry(game2, { migration: true });
        initializeTrade(game2, { migration: true });
        validateIndustry(game2.state, bad);
        validateTrade(game2.state, bad);
      }
      return game2;
    }
  };

  // dist/renderer.js?v=4.0.0
  var TILE = 34;
  var MIN_ZOOM = 0.12;
  var MAX_ZOOM = 3;
  var TAU = Math.PI * 2;
  var FONT = 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
  var CONDUCTORS2 = /* @__PURE__ */ new Set(["solar", "battery", "conduit"]);
  var CONSUMERS = /* @__PURE__ */ new Set(["cooler", "heater", "beacon"]);
  var BUILDING_KINDS = /* @__PURE__ */ new Set(["wall", "door", "bed", "stove", "sandbag", "beacon", "researchbench", "solar", "battery", "conduit", "cooler", "heater", "horseshoes", "workbench"]);
  var clamp6 = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  var number = (v, fallback = 0) => Number.isFinite(v) ? v : fallback;
  var mix = (a, b, t) => a + (b - a) * t;
  var randomAt = (x, y, seed = 0) => {
    let h = Math.imul((x | 0) ^ (seed | 0), 374761393) ^ Math.imul(y | 0, 668265263);
    h = Math.imul(h ^ h >>> 13, 1274126177);
    return ((h ^ h >>> 16) >>> 0) / 4294967295;
  };
  var hashString = (value) => {
    let hash = 2166136261;
    for (const char of String(value ?? "")) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
    return hash >>> 0;
  };
  function roundedPath(ctx, x, y, w, h, r = 0.1) {
    r = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  }
  function rect(ctx, x, y, w, h, fill, radius = 0.08, stroke = null, lineWidth = 0.035) {
    roundedPath(ctx, x, y, w, h, radius);
    if (fill) {
      ctx.fillStyle = fill;
      ctx.fill();
    }
    if (stroke) {
      ctx.strokeStyle = stroke;
      ctx.lineWidth = lineWidth;
      ctx.stroke();
    }
  }
  function ellipse(ctx, x, y, rx, ry, color, rotation = 0) {
    ctx.beginPath();
    ctx.ellipse(x, y, rx, ry, rotation, 0, TAU);
    ctx.fillStyle = color;
    ctx.fill();
  }
  function line(ctx, x1, y1, x2, y2, color, width = 0.04) {
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.stroke();
  }
  function polygon(ctx, points, color, stroke = null, width = 0.025) {
    if (!points.length) return;
    ctx.beginPath();
    ctx.moveTo(points[0][0], points[0][1]);
    for (let i = 1; i < points.length; i++) ctx.lineTo(points[i][0], points[i][1]);
    ctx.closePath();
    ctx.fillStyle = color;
    ctx.fill();
    if (stroke) {
      ctx.strokeStyle = stroke;
      ctx.lineWidth = width;
      ctx.stroke();
    }
  }
  function getTool(value) {
    if (value && typeof value === "object") return { type: value.type || value.kind || "select", kind: value.kind };
    const raw = String(value || "select");
    const parts = raw.split(/[:/_-]/);
    if (BUILDING_KINDS.has(raw)) return { type: "build", kind: raw };
    if (["farm", "stockpile"].includes(raw)) return { type: "zone", kind: raw };
    return { type: parts[0], kind: parts[1] || raw };
  }
  var ColonyRenderer = class {
    constructor(canvas2, game2) {
      if (!canvas2 || typeof canvas2.getContext !== "function") throw new TypeError("A canvas is required.");
      this.canvas = canvas2;
      this.ctx = canvas2.getContext("2d", { alpha: false });
      if (!this.ctx) throw new Error("Canvas 2D is not available.");
      this.game = game2;
      this.camera = { x: 23, y: 16, zoom: 1 };
      this.width = 1;
      this.height = 1;
      this.dpr = 1;
      this._terrain = null;
      this._tilesSource = null;
      this._tileLookup = /* @__PURE__ */ new Map();
      this._waterTiles = [];
      this._viewReady = false;
      this._fitMode = false;
      this._time = 0;
      this._simTime = 0;
      this._selectedId = null;
      this._selectedIds = /* @__PURE__ */ new Set();
      this._layer = "normal";
      this.resize();
    }
    setGame(game2) {
      this.game = game2;
      this._terrain = null;
      this._tilesSource = null;
      this._tileLookup.clear();
      this._waterTiles = [];
      this._initialView();
    }
    resize() {
      const bounds = this.canvas.getBoundingClientRect?.() || {};
      const width = Math.max(1, Math.round(number(bounds.width, this.canvas.clientWidth || 960)));
      const height = Math.max(1, Math.round(number(bounds.height, this.canvas.clientHeight || 640)));
      const dpr = clamp6(number(globalThis.devicePixelRatio, 1), 1, 2.5);
      const changed = width !== this.width || height !== this.height || dpr !== this.dpr;
      this.width = width;
      this.height = height;
      this.dpr = dpr;
      if (changed) {
        this.canvas.width = Math.round(width * dpr);
        this.canvas.height = Math.round(height * dpr);
      }
      if (!this._viewReady) this._initialView();
      else if (this._fitMode) this.fit();
      else this._clampCamera();
    }
    _initialView() {
      const state = this.game?.state || {};
      const cols = number(state.width, 48), rows = number(state.height, 32);
      this.camera.x = Math.min(23.5, cols / 2);
      this.camera.y = Math.min(16, rows / 2);
      const desiredTile = this.width < 600 ? 30 : Math.min(36, Math.max(29, this.height / 20));
      this.camera.zoom = desiredTile / TILE;
      this._viewReady = true;
      this._fitMode = false;
      this._clampCamera();
    }
    fit() {
      const state = this.game?.state || {};
      const cols = Math.max(1, number(state.width, 48)), rows = Math.max(1, number(state.height, 32));
      const padding = this.width < 600 ? 14 : 38;
      this.camera.zoom = clamp6(Math.min((this.width - padding * 2) / cols, (this.height - padding * 2) / rows) / TILE, MIN_ZOOM, MAX_ZOOM);
      this.camera.x = cols / 2;
      this.camera.y = rows / 2;
      this._fitMode = true;
    }
    focus(x, y) {
      if (!Number.isFinite(x) || !Number.isFinite(y)) return;
      this.camera.x = x;
      this.camera.y = y;
      this._fitMode = false;
      this._clampCamera();
    }
    pan(dx, dy) {
      const scale = TILE * this.camera.zoom;
      this.camera.x -= number(dx) / scale;
      this.camera.y -= number(dy) / scale;
      this._fitMode = false;
      this._clampCamera();
    }
    zoomAt(factor, clientX, clientY) {
      if (!Number.isFinite(factor) || factor <= 0) return;
      const bounds = this.canvas.getBoundingClientRect?.() || { left: 0, top: 0 };
      const px = number(clientX, bounds.left + this.width / 2) - bounds.left - this.width / 2;
      const py = number(clientY, bounds.top + this.height / 2) - bounds.top - this.height / 2;
      const oldScale = TILE * this.camera.zoom;
      const wx = this.camera.x + px / oldScale, wy = this.camera.y + py / oldScale;
      this.camera.zoom = clamp6(this.camera.zoom * factor, MIN_ZOOM, MAX_ZOOM);
      const newScale = TILE * this.camera.zoom;
      this.camera.x = wx - px / newScale;
      this.camera.y = wy - py / newScale;
      this._fitMode = false;
      this._clampCamera();
    }
    screenToTile(clientX, clientY) {
      if (!Number.isFinite(clientX) || !Number.isFinite(clientY)) return null;
      const bounds = this.canvas.getBoundingClientRect?.() || { left: 0, top: 0 };
      const scale = TILE * this.camera.zoom;
      const x = Math.floor((clientX - bounds.left - this.width / 2) / scale + this.camera.x);
      const y = Math.floor((clientY - bounds.top - this.height / 2) / scale + this.camera.y);
      const state = this.game?.state || {};
      if (x < 0 || y < 0 || x >= number(state.width, 48) || y >= number(state.height, 32)) return null;
      return { x, y };
    }
    _clampCamera() {
      const state = this.game?.state || {};
      const cols = number(state.width, 48), rows = number(state.height, 32);
      const halfW = this.width / (TILE * this.camera.zoom * 2), halfH = this.height / (TILE * this.camera.zoom * 2);
      this.camera.x = halfW > cols / 2 ? cols / 2 : clamp6(this.camera.x, halfW - 1.5, cols - halfW + 1.5);
      this.camera.y = halfH > rows / 2 ? rows / 2 : clamp6(this.camera.y, halfH - 1.5, rows - halfH + 1.5);
    }
    _tile(x, y) {
      return this._tileLookup.get(`${x},${y}`) || null;
    }
    _prepareTerrain(state) {
      const cols = number(state.width, 48), rows = number(state.height, 32);
      const tiles = Array.isArray(state.tiles) ? state.tiles : [];
      const key = `${cols}:${rows}:${number(state.seed)}`;
      if (this._tilesSource === tiles && this._terrainKey === key) return;
      this._tilesSource = tiles;
      this._terrainKey = key;
      this._tileLookup.clear();
      this._waterTiles = [];
      for (const tile of tiles) {
        if (!tile || !Number.isFinite(tile.x) || !Number.isFinite(tile.y)) continue;
        this._tileLookup.set(`${tile.x},${tile.y}`, tile);
        if (tile.terrain === "water") this._waterTiles.push(tile);
      }
      let surface = null;
      if (typeof globalThis.OffscreenCanvas === "function") surface = new globalThis.OffscreenCanvas(cols * 48, rows * 48);
      else if (this.canvas.ownerDocument?.createElement) {
        surface = this.canvas.ownerDocument.createElement("canvas");
        surface.width = cols * 48;
        surface.height = rows * 48;
      }
      if (surface) {
        const ctx = surface.getContext("2d", { alpha: false });
        ctx.setTransform(48, 0, 0, 48, 0, 0);
        this._paintTerrain(ctx, state);
        this._terrain = surface;
      } else this._terrain = null;
    }
    _paintTerrain(ctx, state) {
      const cols = number(state.width, 48), rows = number(state.height, 32), seed = number(state.seed);
      const grass = ctx.createLinearGradient(0, 0, cols, rows);
      grass.addColorStop(0, "#718969");
      grass.addColorStop(0.48, "#839369");
      grass.addColorStop(1, "#657c5e");
      ctx.fillStyle = grass;
      ctx.fillRect(0, 0, cols, rows);
      for (let i = 0; i < 100; i++) {
        const x = randomAt(i, 70, seed) * cols, y = randomAt(i, 71, seed) * rows;
        const r = 1.3 + randomAt(i, 72, seed) * 3.8;
        const patch = ctx.createRadialGradient(x, y, 0, x, y, r);
        patch.addColorStop(0, i % 3 ? "rgba(43,83,61,0.13)" : "rgba(197,180,116,0.13)");
        patch.addColorStop(1, "rgba(90,128,76,0)");
        ctx.fillStyle = patch;
        ctx.fillRect(x - r, y - r, r * 2, r * 2);
      }
      for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
        const tile = this._tile(x, y), terrain = tile?.terrain || "grass";
        const a = randomAt(x, y, seed), b = randomAt(x + 170, y, seed);
        if (terrain === "water") continue;
        if (terrain === "soil") {
          ellipse(ctx, x + 0.5, y + 0.52, 0.65, 0.56, "rgba(155,132,86,0.24)", a * 0.4);
          for (let k = 0; k < 4; k++) ellipse(ctx, x + randomAt(x * 4 + k, y, seed), y + randomAt(x, y * 4 + k, seed), 0.022, 0.017, "rgba(79,74,51,0.28)");
        } else if (terrain === "stone") {
          polygon(ctx, [[x - 0.02, y + 0.1], [x + 0.55, y - 0.04], [x + 1.03, y + 0.16], [x + 1.02, y + 0.91], [x + 0.5, y + 1.04], [x - 0.03, y + 0.8]], a > 0.5 ? "#7f8a77" : "#89917c");
          line(ctx, x + 0.13, y + 0.66, x + 0.72, y + 0.35, "rgba(61,78,67,.18)", 0.025);
        }
        for (let k = 0; k < 3; k++) {
          const gx = x + randomAt(x * 3 + k, y + 101, seed), gy = y + randomAt(x + 55, y * 3 + k, seed);
          const height = 0.065 + randomAt(x + k, y + 321, seed) * 0.09;
          line(ctx, gx, gy, gx - 0.045, gy - height, a > 0.44 ? "rgba(43,82,51,.24)" : "rgba(203,211,147,.29)", 0.022);
          if (k === 1) line(ctx, gx, gy, gx + 0.06, gy - height * 0.7, "rgba(70,100,55,.26)", 0.022);
        }
        if (b > 0.965) {
          ellipse(ctx, x + 0.24, y + 0.53, 0.035, 0.027, "#d5c790");
          ellipse(ctx, x + 0.38, y + 0.41, 0.025, 0.023, "#e1d4a1");
        }
      }
      this._paintCampFloor(ctx);
      const water = ctx.createLinearGradient(0, 0, cols * 0.7, rows);
      water.addColorStop(0, "#427f83");
      water.addColorStop(0.55, "#396f77");
      water.addColorStop(1, "#2f6570");
      for (const tile of this._waterTiles) {
        const { x, y } = tile;
        const n = this._tile(x, y - 1)?.terrain === "water";
        const e = this._tile(x + 1, y)?.terrain === "water";
        const s = this._tile(x, y + 1)?.terrain === "water";
        const w = this._tile(x - 1, y)?.terrain === "water";
        ctx.lineCap = "round";
        if (!n) line(ctx, x + 0.03, y, x + 0.97, y, "#a5ab7b", 0.22);
        if (!s) line(ctx, x + 0.03, y + 1, x + 0.97, y + 1, "#405c4c", 0.2);
        if (!w) line(ctx, x, y + 0.02, x, y + 0.98, "#9ca779", 0.2);
        if (!e) line(ctx, x + 1, y + 0.02, x + 1, y + 0.98, "#426352", 0.18);
        this._waterCellPath(ctx, x, y, n, e, s, w);
        ctx.fillStyle = water;
        ctx.fill();
        if (!w) line(ctx, x + 0.08, y + 0.23, x + 0.06, y + 0.77, "rgba(171,205,179,.35)", 0.025);
        if (!n) line(ctx, x + 0.23, y + 0.08, x + 0.78, y + 0.07, "rgba(171,205,179,.28)", 0.025);
      }
    }
    _paintCampFloor(ctx) {
      const eligible = this._tile(22, 14);
      if (!eligible || eligible.terrain === "water") return;
      ellipse(ctx, 23.4, 16.3, 6.7, 5.8, "rgba(161,143,98,.23)");
      for (let y = 12; y <= 17; y++) for (let x = 20; x <= 26; x++) {
        if (this._tile(x, y)?.terrain === "water") continue;
        const value = randomAt(x, y, 170);
        ctx.fillStyle = value > 0.5 ? "#9e8b64" : "#a5926b";
        ctx.fillRect(x, y, 1, 1);
        for (let row = 0; row < 3; row++) {
          line(ctx, x, y + row / 3, x + 1, y + row / 3, "rgba(77,64,46,.24)", 0.025);
          const seam = (x + y + row) % 2 ? 0.68 : 0.28;
          line(ctx, x + seam, y + row / 3 + 0.025, x + seam, y + (row + 1) / 3 - 0.025, "rgba(74,64,46,.22)", 0.02);
          line(ctx, x + 0.08, y + row / 3 + 0.12, x + 0.48, y + row / 3 + 0.11, "rgba(197,180,131,.20)", 0.018);
        }
      }
      rect(ctx, 19.96, 11.96, 7.08, 6.08, null, 0.04, "rgba(68,59,42,.36)", 0.07);
      for (let i = 0; i < 7; i++) ellipse(ctx, 24.6 + Math.sin(i * 0.7) * 0.3, 18.2 + i * 0.63, 0.73, 0.48, "rgba(173,155,105,.16)");
    }
    _waterCellPath(ctx, x, y, n, e, s, w) {
      const tl = !n && !w ? 0.25 : 0, tr = !n && !e ? 0.25 : 0;
      const br = !s && !e ? 0.25 : 0, bl = !s && !w ? 0.25 : 0;
      ctx.beginPath();
      ctx.moveTo(x + tl, y);
      ctx.lineTo(x + 1 - tr, y);
      ctx.quadraticCurveTo(x + 1, y, x + 1, y + tr);
      ctx.lineTo(x + 1, y + 1 - br);
      ctx.quadraticCurveTo(x + 1, y + 1, x + 1 - br, y + 1);
      ctx.lineTo(x + bl, y + 1);
      ctx.quadraticCurveTo(x, y + 1, x, y + 1 - bl);
      ctx.lineTo(x, y + tl);
      ctx.quadraticCurveTo(x, y, x + tl, y);
      ctx.closePath();
    }
    render({ selectedId = null, selectedIds = [], tool = "select", hover = null, showGrid = false, showZones = true, layer = "normal", previewTiles = [], time = 0 } = {}) {
      const state = this.game?.state || {};
      this._time = number(time) / 1e3;
      this._simTime = number(state.time);
      this._selectedId = selectedId;
      this._selectedIds = new Set(Array.isArray(selectedIds) ? selectedIds : []);
      if (selectedId !== null) this._selectedIds.add(selectedId);
      this._layer = ["temperature", "power"].includes(layer) ? layer : "normal";
      this._hover = hover;
      this._prepareTerrain(state);
      const ctx = this.ctx, scale = TILE * this.camera.zoom;
      const cols = number(state.width, 48), rows = number(state.height, 32);
      ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = "source-over";
      ctx.fillStyle = "#17282a";
      ctx.fillRect(0, 0, this.width, this.height);
      ctx.save();
      ctx.translate(this.width / 2, this.height / 2);
      ctx.scale(scale, scale);
      ctx.translate(-this.camera.x, -this.camera.y);
      ctx.lineJoin = "round";
      ctx.lineCap = "round";
      if (this._terrain) ctx.drawImage(this._terrain, 0, 0, cols, rows);
      else this._paintTerrain(ctx, state);
      this._visible = {
        minX: this.camera.x - this.width / scale / 2 - 2,
        maxX: this.camera.x + this.width / scale / 2 + 2,
        minY: this.camera.y - this.height / scale / 2 - 2,
        maxY: this.camera.y + this.height / scale / 2 + 3
      };
      this._drawWaterMovement(ctx);
      const tiles = Array.isArray(state.tiles) ? state.tiles : [];
      for (const tile of tiles) {
        if (!tile || !this._isVisible(tile.x, tile.y)) continue;
        if (tile.zone === "farm" || tile.crop) this._drawFarm(ctx, tile);
        if (tile.zone === "stockpile") this._drawPallet(ctx, tile);
        if (tile.burned) this._drawBurnedGround(ctx, tile);
      }
      this._drawRooms(ctx, tiles);
      if (this._layer === "temperature") this._drawTemperature(ctx, tiles);
      this._drawPowerLinks(ctx, tiles, hover, getTool(tool));
      if (showZones) this._drawZones(ctx, tiles);
      if (showGrid) this._drawGrid(ctx, cols, rows);
      const pawns = Array.isArray(state.colonists) ? state.colonists : [];
      const raiders = Array.isArray(state.raiders) ? state.raiders : [];
      this._pawnById = new Map(pawns.filter(Boolean).map((pawn) => [pawn.id, pawn]));
      for (const pawn of [...pawns, ...raiders]) if (pawn && this._selectedIds.has(pawn.id)) this._drawSelectedPath(ctx, pawn);
      const drawables = [];
      for (const tile of tiles) {
        if (!tile || !this._isVisible(tile.x, tile.y)) continue;
        if (tile.feature) drawables.push({ y: tile.y + 0.75, order: 1, type: "feature", tile });
        if (tile.building) drawables.push({ y: tile.y + 0.85, order: 2, type: "building", tile });
        if (number(tile.fire) > 0) drawables.push({ y: tile.y + 0.94, order: 5, type: "fire", tile });
      }
      for (const item of state.items || []) if (item && this._isVisible(item.x, item.y)) drawables.push({ y: item.y + 0.7, order: 3, type: "item", item });
      for (const pawn of pawns) if (pawn && this._isVisible(pawn.x, pawn.y)) {
        const carrier = pawn.carriedBy && this._pawnById.get(pawn.carriedBy);
        if (carrier && !carrier.dead && carrier.carryingPawnId === pawn.id) continue;
        drawables.push({ y: pawn.y + 0.17, order: 4, type: "pawn", pawn });
      }
      for (const pawn of raiders) if (pawn && this._isVisible(pawn.x, pawn.y)) drawables.push({ y: pawn.y + 0.17, order: 4, type: "raider", pawn });
      const visitor = state.trade?.visitor;
      if (visitor && this._isVisible(visitor.x, visitor.y)) drawables.push({ y: visitor.y + 0.18, order: 4, type: "trader", visitor });
      drawables.sort((a, b) => a.y - b.y || a.order - b.order);
      for (const entry of drawables) {
        if (entry.type === "feature") this._drawFeature(ctx, entry.tile, number(state.seed));
        else if (entry.type === "building") this._drawBuilding(ctx, entry.tile, pawns, state);
        else if (entry.type === "item") this._drawItem(ctx, entry.item);
        else if (entry.type === "fire") this._drawFire(ctx, entry.tile);
        else if (entry.type === "trader") this._drawTrader(ctx, entry.visitor);
        else this._drawPawn(ctx, entry.pawn, entry.type === "raider", state);
      }
      for (const tile of tiles) if (number(tile?.fire) > 0 && this._isVisible(tile.x, tile.y)) this._drawSmoke(ctx, tile);
      for (const tile of tiles) if (tile?.designation && this._isVisible(tile.x, tile.y)) this._drawDesignation(ctx, tile);
      for (const effect of state.effects || []) if (effect) this._drawEffect(ctx, effect);
      let hour = ((this._simTime / 120 * 24 + 8) % 24 + 24) % 24;
      if (typeof this.game?.getSummary === "function") {
        const summary = this.game.getSummary();
        if (Number.isFinite(summary?.hour)) hour = summary.hour;
      }
      const night2 = clamp6((Math.cos((hour - 1) / 24 * TAU) - 0.05) * 0.23, 0, 0.2);
      if (night2 > 0) {
        ctx.fillStyle = `rgba(16,34,61,${night2})`;
        ctx.fillRect(0, 0, cols, rows);
      }
      const parsedTool = getTool(tool);
      const preview = Array.isArray(previewTiles) ? previewTiles : [];
      for (const tile of preview) if (tile && Number.isFinite(tile.x) && Number.isFinite(tile.y) && this._isVisible(tile.x, tile.y)) this._drawHover(ctx, tile, parsedTool);
      if (hover && Number.isFinite(hover.x) && Number.isFinite(hover.y) && !preview.some((tile) => tile?.x === hover.x && tile?.y === hover.y)) this._drawHover(ctx, hover, parsedTool);
      ctx.restore();
      this._drawNameplates(ctx, pawns, raiders, selectedId);
      if (visitor) this._drawTraderLabel(ctx, visitor);
      if (this._layer === "temperature") this._drawRoomLabels(ctx, state.rooms || []);
      this._drawWeather(ctx, state.weather);
      this._drawVignette(ctx);
    }
    _isVisible(x, y) {
      const v = this._visible;
      return Number.isFinite(x) && Number.isFinite(y) && (!v || x > v.minX && x < v.maxX && y > v.minY && y < v.maxY);
    }
    _drawWaterMovement(ctx) {
      const time = this._time;
      for (const tile of this._waterTiles) {
        if (!this._isVisible(tile.x, tile.y)) continue;
        const r = randomAt(tile.x, tile.y, 519);
        if (r < 0.42) continue;
        const phase = (time * 0.08 + r) % 1;
        const alpha = Math.sin(phase * Math.PI) * 0.2;
        const x = tile.x + 0.16 + r * 0.25, y = tile.y + 0.15 + phase * 0.65;
        line(ctx, x, y, x + 0.25 + r * 0.23, y - 0.035, `rgba(196,225,212,${alpha})`, 0.025);
        if (r > 0.8) line(ctx, x + 0.08, y + 0.09, x + 0.23, y + 0.07, `rgba(196,225,212,${alpha * 0.6})`, 0.018);
      }
    }
    _drawBurnedGround(ctx, tile) {
      const x = tile.x + 0.5, y = tile.y + 0.5, seed = randomAt(tile.x, tile.y, 719);
      ctx.save();
      ellipse(ctx, x, y + 0.035, 0.48, 0.4, "rgba(52,52,39,.36)", seed * 0.4);
      ellipse(ctx, x - 0.06, y + 0.02, 0.32, 0.27, "rgba(52,45,35,.24)", -seed * 0.5);
      for (let k = 0; k < 5; k++) {
        const angle = k * 2.4 + seed, radius = 0.12 + k % 3 * 0.1;
        const px = x + Math.cos(angle) * radius, py = y + Math.sin(angle) * radius;
        line(ctx, px, py, px + 0.08, py - 0.045, k % 2 ? "rgba(204,191,150,.24)" : "rgba(36,43,32,.45)", 0.024);
      }
      ctx.restore();
    }
    _drawFire(ctx, tile) {
      const strength = clamp6(number(tile.fire), 0, 1), x = tile.x + 0.5, y = tile.y + 0.62;
      const phase = randomAt(tile.x, tile.y, 401) * TAU;
      const flicker = Math.sin(this._time * 8 + phase) * 0.045;
      const size = 0.45 + strength * 0.65;
      ctx.save();
      ctx.translate(x, y);
      const glow = ctx.createRadialGradient(0, -0.15, 0, 0, -0.15, 0.9);
      glow.addColorStop(0, `rgba(247,155,64,${0.19 + strength * 0.17})`);
      glow.addColorStop(1, "rgba(247,155,64,0)");
      ctx.fillStyle = glow;
      ctx.fillRect(-0.9, -1.05, 1.8, 1.8);
      ellipse(ctx, 0, 0.04, 0.35 + strength * 0.09, 0.14, "rgba(89,55,31,.7)");
      const flame = (px, py, width, height, color, sway) => {
        ctx.beginPath();
        ctx.moveTo(px - width * 0.45, py);
        ctx.bezierCurveTo(px - width * 0.95, py - height * 0.35, px + sway - width * 0.07, py - height * 0.63, px + sway, py - height);
        ctx.bezierCurveTo(px + width * 0.1 + sway, py - height * 0.55, px + width * 0.65, py - height * 0.43, px + width * 0.45, py);
        ctx.quadraticCurveTo(px, py + height * 0.14, px - width * 0.45, py);
        ctx.fillStyle = color;
        ctx.fill();
      };
      flame(-0.17, 0.035, 0.35, size * 0.71, "#cd6d39", -0.05 - flicker);
      flame(0.15, 0.04, 0.4, size * 0.83, "#e38c42", 0.04 + flicker);
      flame(-0.015, 0.035, 0.43, size + flicker, "#f2ad55", -0.025 + flicker);
      flame(0.015, 0.045, 0.27, size * 0.62, "#f8d17b", -flicker);
      flame(-0.015, 0.055, 0.12, size * 0.29, "#fff0b4", 0.01);
      for (let k = 0; k < 3; k++) {
        const rise = (this._time * 0.55 + phase + k / 3) % 1;
        const px = Math.sin(phase + k * 2 + rise * 3) * (0.15 + rise * 0.18);
        ellipse(ctx, px, -0.2 - rise * 1.05, 0.015, 0.026, `rgba(250,204,112,${(1 - rise) * strength * 0.8})`);
      }
      ctx.restore();
    }
    _drawSmoke(ctx, tile) {
      const strength = clamp6(number(tile.fire), 0, 1), phase = randomAt(tile.x, tile.y, 728);
      ctx.save();
      for (let k = 0; k < 3; k++) {
        const rise = (this._time * 0.2 + phase + k / 3) % 1;
        const x = tile.x + 0.5 + rise * 0.26 + Math.sin(rise * 3 + phase * 5) * 0.09;
        const y = tile.y + 0.1 - rise * 1.7;
        const radius = 0.12 + rise * 0.29;
        ellipse(ctx, x, y, radius, radius * 0.75, `rgba(69,76,65,${Math.sin(rise * Math.PI) * (0.1 + strength * 0.12)})`);
      }
      ctx.restore();
    }
    _drawFarm(ctx, tile) {
      const { x, y } = tile;
      rect(ctx, x + 0.025, y + 0.025, 0.95, 0.95, "#746544", 0.075);
      for (let row = 0; row < 3; row++) {
        line(ctx, x + 0.12, y + 0.2 + row * 0.28, x + 0.89, y + 0.2 + row * 0.28, "#564d36", 0.055);
        line(ctx, x + 0.12, y + 0.235 + row * 0.28, x + 0.89, y + 0.235 + row * 0.28, "rgba(176,149,91,.35)", 0.026);
      }
      if (!tile.crop) return;
      const growth = clamp6(number(tile.crop.growth), 0, 1);
      for (let row = 0; row < 2; row++) for (let col = 0; col < 3; col++) {
        const px = x + 0.23 + col * 0.265, py = y + 0.37 + row * 0.4;
        const stem = 0.06 + growth * 0.27;
        const sway = Math.sin(this._time * 1.2 + x + row + col) * 0.012 * growth;
        line(ctx, px, py, px + sway, py - stem, growth > 0.82 ? "#e0c477" : "#9bba66", 0.03);
        ellipse(ctx, px - 0.047 + sway, py - stem * 0.6, 0.07 + growth * 0.025, 0.031, growth > 0.82 ? "#c0ad59" : "#6fa357", -0.5);
        ellipse(ctx, px + 0.05 + sway, py - stem * 0.8, 0.065 + growth * 0.025, 0.029, growth > 0.82 ? "#d4c16e" : "#9fbd6b", 0.5);
        if (growth > 0.82) ellipse(ctx, px + sway, py - stem - 0.012, 0.035, 0.08, "#e1c97a", 0.1);
      }
    }
    _drawPallet(ctx, tile) {
      const { x, y } = tile;
      rect(ctx, x + 0.08, y + 0.15, 0.84, 0.75, "rgba(73,62,44,.18)", 0.04);
      for (let row = 0; row < 4; row++) rect(ctx, x + 0.09, y + 0.12 + row * 0.18, 0.82, 0.13, "rgba(158,135,86,.46)", 0.015);
    }
    _drawZones(ctx, tiles) {
      ctx.save();
      ctx.setLineDash([0.12, 0.09]);
      ctx.lineWidth = 0.035;
      for (const tile of tiles) {
        if (!tile?.zone || !this._isVisible(tile.x, tile.y)) continue;
        const { x, y, zone } = tile;
        ctx.strokeStyle = zone === "farm" ? "rgba(174,205,126,.8)" : "rgba(228,190,116,.8)";
        ctx.beginPath();
        if (this._tile(x, y - 1)?.zone !== zone) {
          ctx.moveTo(x + 0.03, y + 0.045);
          ctx.lineTo(x + 0.97, y + 0.045);
        }
        if (this._tile(x + 1, y)?.zone !== zone) {
          ctx.moveTo(x + 0.955, y + 0.03);
          ctx.lineTo(x + 0.955, y + 0.97);
        }
        if (this._tile(x, y + 1)?.zone !== zone) {
          ctx.moveTo(x + 0.03, y + 0.955);
          ctx.lineTo(x + 0.97, y + 0.955);
        }
        if (this._tile(x - 1, y)?.zone !== zone) {
          ctx.moveTo(x + 0.045, y + 0.03);
          ctx.lineTo(x + 0.045, y + 0.97);
        }
        ctx.stroke();
      }
      ctx.restore();
    }
    _drawRooms(ctx, tiles) {
      ctx.save();
      for (const tile of tiles) {
        if (!tile?.roofed || !this._isVisible(tile.x, tile.y)) continue;
        const { x, y, roomId } = tile;
        ctx.fillStyle = "rgba(226,224,194,.095)";
        ctx.fillRect(x, y, 1, 1);
        line(ctx, x + 0.04, y + 0.94, x + 0.96, y + 0.94, "rgba(39,55,47,.09)", 0.018);
        const edge = "rgba(226,220,175,.32)";
        if (this._tile(x, y - 1)?.roomId !== roomId) line(ctx, x + 0.03, y + 0.04, x + 0.97, y + 0.04, edge, 0.038);
        if (this._tile(x + 1, y)?.roomId !== roomId) line(ctx, x + 0.96, y + 0.03, x + 0.96, y + 0.97, edge, 0.038);
        if (this._tile(x, y + 1)?.roomId !== roomId) line(ctx, x + 0.03, y + 0.96, x + 0.97, y + 0.96, edge, 0.038);
        if (this._tile(x - 1, y)?.roomId !== roomId) line(ctx, x + 0.04, y + 0.03, x + 0.04, y + 0.97, edge, 0.038);
      }
      ctx.restore();
    }
    _drawTemperature(ctx, tiles) {
      ctx.save();
      for (const tile of tiles) {
        if (!tile || !Number.isFinite(tile.temperature) || !this._isVisible(tile.x, tile.y)) continue;
        const value = tile.temperature;
        const hue = value <= 0 ? clamp6(205 - value * 2, 205, 240) : value <= 8 ? mix(205, 170, value / 8) : value <= 21 ? mix(170, 75, (value - 8) / 13) : mix(75, 4, clamp6((value - 21) / 24, 0, 1));
        ctx.fillStyle = `hsla(${hue},66%,56%,${tile.roofed ? 0.39 : 0.25})`;
        ctx.fillRect(tile.x, tile.y, 1.005, 1.005);
      }
      ctx.restore();
    }
    _isConductor(tile) {
      return Boolean(tile?.building?.complete && number(tile.building.hp, 1) > 0 && CONDUCTORS2.has(tile.building.type));
    }
    _nearestConductor(tile, nodes, networkId = void 0) {
      let nearest = null, distance = 4;
      for (const node of nodes) {
        if (networkId !== void 0 && node.building.networkId !== networkId) continue;
        const nextDistance = Math.abs(tile.x - node.x) + Math.abs(tile.y - node.y);
        if (nextDistance > 3) continue;
        if (nextDistance < distance || nextDistance === distance && (!nearest || node.y < nearest.y || node.y === nearest.y && node.x < nearest.x)) {
          nearest = node;
          distance = nextDistance;
        }
      }
      return nearest;
    }
    _drawPowerLinks(ctx, tiles, hover, tool) {
      const expanded = this._layer === "power";
      const nodes = tiles.filter((tile) => this._isConductor(tile));
      ctx.save();
      for (const tile of nodes) {
        if (!this._isVisible(tile.x, tile.y)) continue;
        const { x, y, building } = tile;
        for (const [dx, dy] of [[1, 0], [0, 1]]) {
          const next = this._tile(x + dx, y + dy);
          if (!this._isConductor(next)) continue;
          const active = building.powered && next.building.powered;
          const color = expanded ? active ? "#9ce2d3" : "#b6aaa0" : active ? "#bead74" : "#8f8770";
          line(ctx, x + 0.5, y + 0.52, x + dx + 0.5, y + dy + 0.52, "rgba(34,52,44,.64)", expanded ? 0.14 : 0.095);
          line(ctx, x + 0.5, y + 0.5, x + dx + 0.5, y + dy + 0.5, color, expanded ? 0.065 : 0.033);
          if (expanded && active) {
            ctx.setLineDash([0.065, 0.2]);
            ctx.lineDashOffset = -this._time * 0.4;
            line(ctx, x + 0.5, y + 0.5, x + dx + 0.5, y + dy + 0.5, "#e6ffdf", 0.06);
            ctx.setLineDash([]);
          }
        }
      }
      for (const tile of tiles) {
        const building = tile?.building;
        if (!building?.complete || !CONSUMERS.has(building.type) || building.networkId == null || !this._isVisible(tile.x, tile.y)) continue;
        if (!expanded && !(hover?.x === tile.x && hover?.y === tile.y)) continue;
        const node = this._nearestConductor(tile, nodes, building.networkId);
        if (!node) continue;
        ctx.setLineDash([0.1, 0.11]);
        ctx.lineDashOffset = building.powered ? -this._time * 0.22 : 0;
        line(ctx, tile.x + 0.5, tile.y + 0.5, node.x + 0.5, node.y + 0.5, building.powered ? "rgba(174,242,220,.8)" : "rgba(223,160,119,.7)", 0.045);
        ctx.setLineDash([]);
      }
      const hovered = hover && this._tile(hover.x, hover.y);
      const preview = tool.type === "build" && (CONDUCTORS2.has(tool.kind) || CONSUMERS.has(tool.kind));
      const hoverPower = expanded && (CONDUCTORS2.has(hovered?.building?.type) || CONSUMERS.has(hovered?.building?.type));
      if (hovered && (preview || hoverPower)) {
        const { x, y } = hovered;
        ctx.setLineDash([0.12, 0.09]);
        for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) {
          if (Math.abs(dx) + Math.abs(dy) > 3 || !this._tile(x + dx, y + dy)) continue;
          ctx.fillStyle = "rgba(168,225,210,.055)";
          ctx.fillRect(x + dx, y + dy, 1, 1);
          for (const [ex, ey] of [[0, -1], [1, 0], [0, 1], [-1, 0]]) {
            if (Math.abs(dx + ex) + Math.abs(dy + ey) <= 3) continue;
            const px = x + dx, py = y + dy, color = "rgba(189,232,211,.65)";
            if (ey === -1) line(ctx, px, py, px + 1, py, color, 0.03);
            else if (ey === 1) line(ctx, px, py + 1, px + 1, py + 1, color, 0.03);
            else if (ex === -1) line(ctx, px, py, px, py + 1, color, 0.03);
            else line(ctx, px + 1, py, px + 1, py + 1, color, 0.03);
          }
        }
        ctx.setLineDash([]);
        if (preview && CONSUMERS.has(tool.kind)) {
          const node = this._nearestConductor(hovered, nodes);
          if (node) line(ctx, x + 0.5, y + 0.5, node.x + 0.5, node.y + 0.5, "#c9ecd7", 0.06);
        }
      }
      ctx.restore();
    }
    _drawRoomLabels(ctx, rooms) {
      const tiles = this.game?.state?.tiles || [], scale = TILE * this.camera.zoom;
      if (scale < 13 || !Array.isArray(rooms)) return;
      ctx.save();
      ctx.font = `600 ${this.width < 600 ? 10 : 11}px ${FONT}`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      for (const room of rooms) {
        if (!Array.isArray(room?.tiles) || !room.tiles.length || !Number.isFinite(room.temperature)) continue;
        const members = room.tiles.map((index) => tiles[index]).filter(Boolean);
        if (!members.length) continue;
        const x = members.reduce((sum, tile) => sum + tile.x + 0.5, 0) / members.length;
        const y = members.reduce((sum, tile) => sum + tile.y + 0.5, 0) / members.length;
        if (!this._isVisible(x, y)) continue;
        const point = this._screenPoint(x, y);
        const label = `${room.temperature.toFixed(1)}\xB0C${scale >= 23 ? ` \xB7 ${room.area}\uCE78` : ""}`;
        const width = ctx.measureText(label).width + 20;
        rect(ctx, point.x - width / 2, point.y - 10, width, 21, "rgba(25,46,47,.88)", 6, "rgba(202,229,205,.4)", 1);
        ctx.fillStyle = room.temperature <= 8 ? "#bce8ed" : room.temperature > 30 ? "#f4c69b" : "#e5ead0";
        ctx.fillText(label, point.x, point.y + 0.5);
      }
      ctx.restore();
    }
    _drawGrid(ctx, cols, rows) {
      ctx.beginPath();
      for (let x = Math.max(0, Math.floor(this._visible.minX)); x <= Math.min(cols, Math.ceil(this._visible.maxX)); x++) {
        ctx.moveTo(x, 0);
        ctx.lineTo(x, rows);
      }
      for (let y = Math.max(0, Math.floor(this._visible.minY)); y <= Math.min(rows, Math.ceil(this._visible.maxY)); y++) {
        ctx.moveTo(0, y);
        ctx.lineTo(cols, y);
      }
      ctx.strokeStyle = "rgba(239,236,206,.14)";
      ctx.lineWidth = 1 / (TILE * this.camera.zoom);
      ctx.stroke();
    }
    _drawFeature(ctx, tile, seed) {
      const x = tile.x + 0.5, y = tile.y + 0.5;
      const r = randomAt(tile.x, tile.y, seed);
      if (tile.feature === "tree") {
        ellipse(ctx, x + 0.23, y + 0.2, 0.7, 0.3, "rgba(26,49,36,.23)", -0.15);
        rect(ctx, x - 0.07, y - 0.04, 0.14, 0.42, "#65503a", 0.025);
        line(ctx, x + 0.01, y + 0.05, x + 0.025, y + 0.32, "#a28a59", 0.027);
        const sway = Math.sin(this._time * 0.85 + r * 10) * 0.022;
        ctx.save();
        ctx.translate(sway, 0);
        if (r < 0.38) {
          const layers = [
            { y: y - 0.13, w: 0.65, h: 0.79, color: "#315e4c" },
            { y: y - 0.41, w: 0.5, h: 0.7, color: "#3e7355" },
            { y: y - 0.68, w: 0.34, h: 0.62, color: "#59885e" }
          ];
          for (const layer of layers) {
            polygon(ctx, [[x, layer.y - layer.h * 0.55], [x + layer.w * 0.63, layer.y + layer.h * 0.2], [x + layer.w * 0.43, layer.y + layer.h * 0.18], [x + layer.w, layer.y + layer.h * 0.55], [x + 0.1, layer.y + layer.h * 0.45], [x - layer.w * 0.82, layer.y + layer.h * 0.53], [x - layer.w * 0.53, layer.y + layer.h * 0.14]], layer.color);
            line(ctx, x - layer.w * 0.39, layer.y + 0.12, x - 0.03, layer.y - layer.h * 0.32, "rgba(159,181,103,.2)", 0.033);
          }
        } else {
          const tint = r > 0.87;
          ellipse(ctx, x, y - 0.32, 0.64, 0.6, tint ? "#687b49" : "#3c6b50");
          ellipse(ctx, x - 0.28, y - 0.37, 0.39, 0.38, tint ? "#849351" : "#578656");
          ellipse(ctx, x + 0.27, y - 0.38, 0.4, 0.43, tint ? "#6e864a" : "#477a55");
          ellipse(ctx, x - 0.01, y - 0.65, 0.46, 0.36, tint ? "#9da55b" : "#6b985e");
          ellipse(ctx, x - 0.24, y - 0.65, 0.24, 0.21, tint ? "#b4b56b" : "#81a76c");
          ellipse(ctx, x + 0.13, y - 0.13, 0.36, 0.3, tint ? "#667a45" : "#3d704e");
          for (let k = 0; k < 5; k++) {
            const a = k * 1.35 + r;
            ellipse(ctx, x + Math.cos(a) * 0.36, y - 0.45 + Math.sin(a) * 0.28, 0.075, 0.037, tint ? "rgba(204,205,132,.28)" : "rgba(166,196,120,.24)", a);
          }
        }
        ctx.restore();
      } else if (tile.feature === "berry") {
        ellipse(ctx, x + 0.06, y + 0.2, 0.43, 0.2, "rgba(33,55,33,.2)");
        ellipse(ctx, x - 0.12, y, 0.3, 0.29, "#486f46");
        ellipse(ctx, x + 0.17, y - 0.05, 0.27, 0.28, "#5c8750");
        ellipse(ctx, x - 0.03, y - 0.18, 0.25, 0.23, "#759653");
        for (let k = 0; k < 6; k++) {
          const a = k * 2.4 + r;
          ellipse(ctx, x + Math.cos(a) * 0.27, y - 0.07 + Math.sin(a) * 0.2, 0.044, 0.043, k % 2 ? "#c96c61" : "#9d4e56");
        }
      } else if (tile.feature === "ore") {
        ellipse(ctx, x + 0.09, y + 0.22, 0.49, 0.24, "rgba(35,51,45,.24)");
        polygon(ctx, [[x - 0.44, y + 0.15], [x - 0.3, y - 0.26], [x - 0.04, y - 0.42], [x + 0.37, y - 0.27], [x + 0.47, y + 0.17], [x + 0.15, y + 0.32]], "#7a8b85", "#52685f", 0.04);
        polygon(ctx, [[x - 0.3, y - 0.26], [x - 0.04, y - 0.42], [x + 0.2, y - 0.18], [x - 0.08, y + 0.05]], "#a0afa1");
        polygon(ctx, [[x - 0.08, y + 0.05], [x + 0.2, y - 0.18], [x + 0.47, y + 0.17], [x + 0.15, y + 0.32]], "#687d77");
        line(ctx, x - 0.24, y + 0.08, x - 0.01, y - 0.15, "#b2c9ba", 0.055);
        line(ctx, x + 0.06, y + 0.16, x + 0.22, y - 0.02, "#a1c4bc", 0.047);
        ellipse(ctx, x - 0.38, y + 0.26, 0.13, 0.09, "#8a9989");
      }
    }
    _drawBuilding(ctx, tile, pawns, state) {
      const building = tile.building;
      if (!building) return;
      if (!building.complete) {
        this._drawBlueprint(ctx, tile.x, tile.y, building.type, number(building.progress));
        return;
      }
      const { x, y } = tile;
      ctx.save();
      ctx.translate(x + 0.5, y + 0.5);
      if (building.type === "wall") {
        const connects = (dx, dy) => {
          const other = this._tile(x + dx, y + dy)?.building;
          return other?.complete && (other.type === "wall" || other.type === "door");
        };
        const n = connects(0, -1), e = connects(1, 0), s = connects(0, 1), w = connects(-1, 0);
        const parts = [];
        if (n) parts.push([0, 0, 0, -0.53]);
        if (e) parts.push([0, 0, 0.53, 0]);
        if (s) parts.push([0, 0, 0, 0.53]);
        if (w) parts.push([0, 0, -0.53, 0]);
        if (!parts.length) parts.push([-0.31, 0, 0.31, 0]);
        for (const [x1, y1, x2, y2] of parts) line(ctx, x1 + 0.07, y1 + 0.15, x2 + 0.07, y2 + 0.15, "rgba(35,40,25,.25)", 0.49);
        for (const [x1, y1, x2, y2] of parts) {
          line(ctx, x1, y1, x2, y2, "#65543d", 0.43);
          line(ctx, x1, y1 - 0.04, x2, y2 - 0.04, "#b29a6d", 0.32);
          line(ctx, x1 - 0.035, y1 - 0.13, x2 - 0.035, y2 - 0.13, "#d2ba86", 0.055);
        }
        ellipse(ctx, 0, -0.04, 0.18, 0.18, "#ad9568");
        ellipse(ctx, -0.015, -0.065, 0.065, 0.065, "rgba(116,89,52,.35)");
      } else if (building.type === "door") {
        const opened = pawns.some((p) => !p.dead && Math.hypot(number(p.x) - x - 0.5, number(p.y) - y - 0.5) < 0.72);
        rect(ctx, -0.5, -0.15, 1, 0.43, "rgba(52,47,34,.24)", 0.03);
        rect(ctx, -0.47, -0.27, 0.13, 0.47, "#b49b6e", 0.025);
        rect(ctx, 0.34, -0.27, 0.13, 0.47, "#b49b6e", 0.025);
        ctx.save();
        ctx.translate(-0.34, -0.08);
        if (opened) ctx.rotate(-1.03);
        rect(ctx, 0, -0.09, 0.68, 0.24, "#816844", 0.015, "#5c4a35");
        line(ctx, 0.04, -0.04, 0.61, -0.04, "#bd9f6c", 0.035);
        ellipse(ctx, 0.55, 0.05, 0.027, 0.027, "#e2c482");
        ctx.restore();
      } else if (building.type === "bed") {
        ellipse(ctx, 0.06, 0.18, 0.47, 0.37, "rgba(40,39,27,.22)");
        rect(ctx, -0.39, -0.49, 0.78, 1.04, "#705b40", 0.06);
        rect(ctx, -0.32, -0.45, 0.64, 0.89, "#d4ceb0", 0.055);
        rect(ctx, -0.31, -0.14, 0.62, 0.58, building.medical ? "#719fa6" : hashString(building.id) % 2 ? "#6e9699" : "#a49a6a", 0.04);
        rect(ctx, -0.25, -0.4, 0.5, 0.23, "#eee3c3", 0.07);
        line(ctx, -0.3, -0.06, 0.3, -0.06, "rgba(229,226,192,.58)", 0.05);
        line(ctx, 0.19, 0, 0.19, 0.38, "rgba(42,72,76,.20)", 0.025);
        rect(ctx, -0.44, -0.56, 0.88, 0.12, "#ba9c6b", 0.025);
        rect(ctx, -0.43, 0.43, 0.86, 0.12, "#a58a5d", 0.025);
        if (building.medical) {
          rect(ctx, -0.18, 0.045, 0.36, 0.3, "#dfe5c8", 0.035);
          rect(ctx, -0.038, 0.08, 0.076, 0.23, "#487c79", 8e-3);
          rect(ctx, -0.115, 0.157, 0.23, 0.076, "#487c79", 8e-3);
        }
      } else if (building.type === "stove") {
        ellipse(ctx, 0.07, 0.29, 0.51, 0.25, "rgba(33,43,37,.24)");
        rect(ctx, -0.44, -0.36, 0.88, 0.84, "#4f5d5a", 0.07, "#384842", 0.04);
        rect(ctx, -0.43, -0.4, 0.86, 0.55, "#9aada3", 0.06);
        rect(ctx, 0.22, -0.76, 0.15, 0.39, "#455b58", 0.025);
        rect(ctx, 0.19, -0.8, 0.21, 0.08, "#738e83", 0.02);
        ellipse(ctx, -0.14, -0.14, 0.22, 0.2, "#354c48");
        ellipse(ctx, -0.14, -0.17, 0.16, 0.13, "#576f5d");
        ellipse(ctx, -0.14, -0.18, 0.12, 0.095, "#bf945b");
        line(ctx, -0.4, -0.17, -0.33, -0.17, "#c3c5a8", 0.055);
        line(ctx, 0.05, -0.17, 0.12, -0.17, "#c3c5a8", 0.055);
        ellipse(ctx, 0.26, -0.1, 0.1, 0.09, "#566d62");
        rect(ctx, -0.28, 0.23, 0.37, 0.15, "#293f3a", 0.03);
        const working = pawns.some((p) => p.job?.type === "cook" && Math.hypot(number(p.x) - x - 0.5, number(p.y) - y - 0.5) < 2);
        if (working) {
          ellipse(ctx, -0.08, 0.3, 0.14, 0.045, "#e4ae69");
          for (let k = 0; k < 3; k++) {
            const phase = (this._time * 0.5 + k / 3) % 1;
            ellipse(ctx, 0.28 + Math.sin(phase * 5) * 0.08, -0.82 - phase * 0.7, 0.045 + phase * 0.09, 0.065 + phase * 0.1, `rgba(221,224,193,${(1 - phase) * 0.3})`);
          }
        }
        ellipse(ctx, 0.27, 0.31, 0.04, 0.04, "#cbb580");
      } else if (building.type === "sandbag") {
        rect(ctx, -0.48, -0.05, 0.98, 0.48, "rgba(48,46,27,.24)", 0.1);
        for (let row = 0; row < 2; row++) for (let col = 0; col < 3; col++) {
          const bx = -0.45 + col * 0.3 + (row ? 0.04 : 0), by = -0.22 + row * 0.24;
          rect(ctx, bx, by, 0.31, 0.25, row ? "#ad9e6d" : "#c4b783", 0.09, "#84794f", 0.025);
          line(ctx, bx + 0.08, by + 0.05, bx + 0.24, by + 0.07, "rgba(232,222,172,.45)", 0.02);
        }
      } else if (building.type === "horseshoes") {
        ellipse(ctx, 0.025, 0.17, 0.5, 0.36, "rgba(84,70,43,.22)");
        ellipse(ctx, 0, 0.035, 0.44, 0.32, "#a19567");
        ellipse(ctx, -0.04, -0.015, 0.35, 0.25, "#b6aa79");
        rect(ctx, -0.35, 0.23, 0.7, 0.075, "#85744f", 0.025);
        line(ctx, 0, 0.12, 0, -0.55, "#5a6551", 0.085);
        line(ctx, -0.025, 0.07, -0.025, -0.52, "#c4c8a3", 0.025);
        ellipse(ctx, 0, -0.55, 0.05, 0.035, "#ded7ac");
        ctx.strokeStyle = "#d5c998";
        ctx.lineWidth = 0.055;
        ctx.beginPath();
        ctx.ellipse(0.02, 0.08, 0.15, 0.09, -0.25, 0.15, Math.PI * 1.85);
        ctx.stroke();
        ctx.strokeStyle = "#718d81";
        ctx.lineWidth = 0.055;
        ctx.beginPath();
        ctx.arc(-0.24, 0.11, 0.09, -0.5, Math.PI * 1.35);
        ctx.stroke();
        line(ctx, 0.24, 0.18, 0.3, 0.12, "rgba(220,208,154,.5)", 0.025);
      } else if (building.type === "workbench") {
        ellipse(ctx, 0.07, 0.24, 0.52, 0.25, "rgba(32,45,35,.26)");
        rect(ctx, -0.37, 0.06, 0.14, 0.39, "#67543c", 0.025);
        rect(ctx, 0.24, 0.06, 0.14, 0.39, "#67543c", 0.025);
        rect(ctx, -0.45, -0.36, 0.9, 0.64, "#745b3d", 0.04);
        rect(ctx, -0.45, -0.43, 0.9, 0.56, "#af9464", 0.035, "#6d624a", 0.025);
        rect(ctx, -0.39, -0.69, 0.78, 0.21, "#7c8263", 0.025, "#536453", 0.025);
        for (const px of [-0.25, -0.04, 0.18]) {
          line(ctx, px, -0.64, px, -0.48, "#c5be90", 0.028);
          ellipse(ctx, px, -0.65, 0.038, 0.035, "#d3cda6");
        }
        rect(ctx, -0.31, -0.31, 0.31, 0.3, "#68827a", 0.025, "#42635e", 0.025);
        rect(ctx, -0.27, -0.36, 0.08, 0.2, "#a5b3a0", 0.012);
        rect(ctx, -0.11, -0.36, 0.08, 0.2, "#a5b3a0", 0.012);
        line(ctx, -0.15, -0.1, -0.15, 0.16, "#344e48", 0.025);
        line(ctx, -0.23, 0.12, -0.06, 0.12, "#bac3a4", 0.035);
        line(ctx, 0.13, 0.035, 0.29, -0.27, "#71573c", 0.05);
        rect(ctx, 0.18, -0.31, 0.22, 0.085, "#aeb8a2", 0.02);
        rect(ctx, -0.29, 0.23, 0.57, 0.1, "#846b48", 0.02);
        line(ctx, -0.05, 0.28, 0.05, 0.28, "#c0ac7c", 0.025);
        const working = pawns.some((p) => p.job?.type === "craft" && p.job.stage === "work" && Math.hypot(number(p.x) - x - 0.5, number(p.y) - y - 0.5) < 2);
        if (working) {
          const phase = this._time * 1.8 % 1;
          for (let k = 0; k < 3; k++) {
            const angle = -0.8 - k * 0.9;
            line(
              ctx,
              -0.15 + Math.cos(angle) * phase * 0.26,
              -0.25 + Math.sin(angle) * phase * 0.23,
              -0.15 + Math.cos(angle) * (phase * 0.26 + 0.045),
              -0.25 + Math.sin(angle) * (phase * 0.23 + 0.045),
              `rgba(241,208,137,${(1 - phase) * 0.7})`,
              0.023
            );
          }
        }
      } else if (building.type === "researchbench") {
        ellipse(ctx, 0.08, 0.25, 0.5, 0.24, "rgba(34,47,35,.24)");
        rect(ctx, -0.36, 0.1, 0.13, 0.35, "#65553c", 0.025);
        rect(ctx, 0.23, 0.1, 0.13, 0.35, "#65553c", 0.025);
        rect(ctx, -0.46, -0.35, 0.92, 0.67, "#755e40", 0.045);
        rect(ctx, -0.46, -0.42, 0.92, 0.62, "#b69b6c", 0.045, "#6e6149", 0.025);
        line(ctx, -0.4, -0.34, 0.39, -0.34, "rgba(233,211,159,.5)", 0.025);
        ctx.save();
        ctx.translate(0.04, -0.1);
        ctx.rotate(-0.1);
        rect(ctx, -0.23, -0.19, 0.45, 0.35, "#e3dfbd", 0.012);
        rect(ctx, -0.18, -0.14, 0.22, 0.18, null, 5e-3, "#6e9c9a", 0.017);
        line(ctx, -0.15, -0.06, 0.1, -0.06, "#7caaa4", 0.018);
        line(ctx, 0.09, -0.13, 0.09, 0.1, "#7caaa4", 0.018);
        line(ctx, -0.15, 0.09, -0.02, 0.09, "#9aab98", 0.02);
        ctx.restore();
        rect(ctx, 0.26, -0.3, 0.12, 0.29, "#637d7a", 0.015);
        line(ctx, 0.29, -0.24, 0.34, -0.24, "#d5cba5", 0.022);
        ellipse(ctx, -0.3, -0.2, 0.095, 0.07, "#8f784d");
        line(ctx, -0.3, -0.21, -0.3, -0.55, "#5c6954", 0.04);
        polygon(ctx, [[-0.44, -0.48], [-0.39, -0.62], [-0.23, -0.62], [-0.17, -0.48]], "#8aa083", "#5d7567", 0.02);
        const researching = pawns.some((p) => p.job?.type === "research" && Math.hypot(number(p.x) - x - 0.5, number(p.y) - y - 0.5) < 2);
        if (researching) ellipse(ctx, -0.3, -0.45, 0.18, 0.075, "rgba(241,215,143,.22)");
      } else if (building.type === "solar") {
        ellipse(ctx, 0.08, 0.27, 0.55, 0.27, "rgba(31,49,43,.25)");
        line(ctx, -0.28, 0.12, -0.28, 0.44, "#647c75", 0.085);
        line(ctx, 0.28, 0.12, 0.28, 0.44, "#647c75", 0.085);
        rect(ctx, -0.45, -0.45, 0.9, 0.74, "#a7bbb0", 0.04, "#4b6665", 0.035);
        rect(ctx, -0.4, -0.4, 0.8, 0.64, "#294c63", 0.015);
        for (let row = 0; row < 2; row++) for (let col = 0; col < 3; col++) {
          const px = -0.38 + col * 0.263, py = -0.38 + row * 0.3;
          rect(ctx, px, py, 0.236, 0.276, row ? "#3c6480" : "#457189", 0.012);
          line(ctx, px + 0.075, py + 0.02, px + 0.075, py + 0.252, "rgba(166,202,212,.28)", 0.012);
          line(ctx, px + 0.156, py + 0.02, px + 0.156, py + 0.252, "rgba(166,202,212,.28)", 0.012);
        }
        polygon(ctx, [[-0.37, -0.39], [-0.2, -0.39], [0.16, 0.23], [-0.02, 0.23]], "rgba(190,224,224,.12)");
        ellipse(ctx, 0.35, 0.31, 0.036, 0.035, building.powered ? "#e9d59a" : "#768776");
      } else if (building.type === "battery") {
        ellipse(ctx, 0.08, 0.23, 0.45, 0.28, "rgba(32,48,41,.26)");
        rect(ctx, -0.36, -0.35, 0.72, 0.8, "#435e59", 0.085, "#304d48", 0.035);
        rect(ctx, -0.32, -0.37, 0.64, 0.18, "#98b0a1", 0.045);
        rect(ctx, -0.23, -0.46, 0.14, 0.15, "#d0ba81", 0.025);
        rect(ctx, 0.09, -0.46, 0.14, 0.15, "#b58a72", 0.025);
        rect(ctx, -0.27, -0.13, 0.35, 0.46, "#668277", 0.03);
        polygon(ctx, [[-0.035, -0.07], [-0.19, 0.12], [-0.08, 0.12], [-0.16, 0.28], [5e-3, 0.055], [-0.105, 0.055]], "#d9c58d");
        const charge = clamp6(number(building.charge) / 18e3, 0, 1);
        for (let k = 0; k < 5; k++) rect(ctx, 0.16, 0.28 - k * 0.087, 0.09, 0.058, charge > k / 5 ? charge < 0.2 ? "#dfac74" : "#aed1a2" : "#304f48", 0.01);
        if (this._layer === "power") this._bar(ctx, -0.3, 0.53, 0.6, charge, charge < 0.2 ? "#dcad79" : "#a9d5b5", 0.05);
      } else if (building.type === "conduit") {
        ellipse(ctx, 0.035, 0.08, 0.19, 0.12, "rgba(34,46,34,.2)");
        rect(ctx, -0.11, -0.11, 0.22, 0.22, "#576d61", 0.045, "#a49c75", 0.02);
        ellipse(ctx, 0, -5e-3, 0.042, 0.04, building.powered ? "#d9dab0" : "#8d9d86");
        if (this._layer === "power" && building.powered) ellipse(ctx, 0, 0, 0.22, 0.22, "rgba(162,233,202,.13)");
      } else if (building.type === "cooler") {
        ellipse(ctx, 0.08, 0.25, 0.48, 0.25, "rgba(29,49,44,.26)");
        rect(ctx, -0.4, -0.39, 0.8, 0.81, "#658981", 0.065, "#365d58", 0.035);
        rect(ctx, -0.36, -0.4, 0.72, 0.59, "#bbcebb", 0.05);
        ellipse(ctx, -0.065, -0.1, 0.245, 0.235, "#4e7775");
        ctx.save();
        ctx.translate(-0.065, -0.1);
        ctx.rotate(building.powered ? this._simTime * 3.8 : 0.4);
        for (let k = 0; k < 4; k++) {
          ctx.rotate(Math.PI / 2);
          ellipse(ctx, 0.087, -0.048, 0.12, 0.054, "#a8c6bb", -0.45);
        }
        ctx.restore();
        ellipse(ctx, -0.065, -0.1, 0.055, 0.055, "#d8e0bd");
        for (let k = 0; k < 4; k++) line(ctx, -0.27, 0.23 + k * 0.046, 0.27, 0.23 + k * 0.046, "#385e5c", 0.022);
        ellipse(ctx, 0.26, -0.11, 0.034, 0.034, building.powered ? "#a4e5dc" : "#6d8b7d");
        if (building.powered && tile.roofed) {
          for (let k = 0; k < 2; k++) {
            const phase = (this._time * 0.3 + k * 0.5) % 1;
            line(ctx, -0.2, 0.48 + phase * 0.2, 0.12, 0.48 + phase * 0.2, `rgba(194,237,224,${(1 - phase) * 0.3})`, 0.025);
          }
        }
      } else if (building.type === "heater") {
        ellipse(ctx, 0.07, 0.23, 0.47, 0.24, "rgba(36,45,35,.23)");
        rect(ctx, -0.41, -0.27, 0.82, 0.65, "#526b61", 0.06, "#354f48", 0.035);
        rect(ctx, -0.35, -0.3, 0.7, 0.58, "#a9956e", 0.045);
        for (let k = 0; k < 6; k++) {
          const px = -0.28 + k * 0.108;
          rect(ctx, px, -0.23, 0.065, 0.4, building.powered ? "#ca9862" : "#6b7862", 0.025);
          line(ctx, px + 0.02, -0.19, px + 0.02, 0.11, building.powered ? "#e3bb80" : "#a3a181", 0.018);
        }
        ellipse(ctx, 0.3, 0.27, 0.035, 0.035, building.powered ? "#f0bf78" : "#778b72");
        if (building.powered && tile.roofed) {
          for (let k = 0; k < 2; k++) {
            const px = -0.18 + k * 0.32, rise = Math.sin(this._time * 1.8 + k) * 0.025;
            ctx.beginPath();
            ctx.moveTo(px, -0.34);
            ctx.quadraticCurveTo(px - 0.08, -0.48, px + rise, -0.64);
            ctx.strokeStyle = "rgba(242,201,143,.33)";
            ctx.lineWidth = 0.028;
            ctx.stroke();
          }
        }
      } else if (building.type === "beacon") {
        ellipse(ctx, 0.1, 0.24, 0.54, 0.28, "rgba(31,50,44,.27)");
        polygon(ctx, [[-0.43, 0.14], [-0.27, -0.18], [0.27, -0.18], [0.44, 0.14], [0.25, 0.39], [-0.25, 0.39]], "#6c8179", "#3b534e", 0.04);
        rect(ctx, -0.2, -0.3, 0.4, 0.52, "#455e5c", 0.04);
        line(ctx, 0, 0, 0, -1.02, "#b7c7b8", 0.09);
        line(ctx, -0.3, -0.74, 0.3, -0.74, "#8ba8a0", 0.055);
        line(ctx, -0.23, -0.74, -0.11, -1.04, "#b9c6ad", 0.045);
        line(ctx, 0.23, -0.74, 0.11, -1.04, "#b9c6ad", 0.045);
        ellipse(ctx, 0, -1.07, 0.09, 0.09, building.powered === false ? "#8b9e8a" : "#bfe8ca");
        if (building.powered !== false) ellipse(ctx, 0, -1.07, 0.19 + Math.sin(this._time * 2) * 0.025, 0.19, "rgba(138,226,193,.15)");
        rect(ctx, -0.11, -0.21, 0.22, 0.1, building.powered === false ? "#536f62" : "#a2dbc2", 0.02);
        const progress = clamp6(number(state.beaconProgress), 0, 1);
        if (building.powered !== false && (progress > 0 || state.victory)) {
          ctx.save();
          ctx.strokeStyle = "rgba(182,235,207,.45)";
          ctx.lineWidth = 0.035;
          for (let i = 0; i < 2; i++) {
            const pulse = (this._time * 0.38 + i * 0.5) % 1;
            ctx.globalAlpha = 1 - pulse;
            ctx.beginPath();
            ctx.arc(0, -1.07, 0.25 + pulse * 0.85, -Math.PI * 0.83, -Math.PI * 0.17);
            ctx.stroke();
          }
          ctx.restore();
        }
      } else rect(ctx, -0.4, -0.35, 0.8, 0.73, "#9a9d7f", 0.1, "#66715b");
      if (CONSUMERS.has(building.type) && building.powered === false) {
        ellipse(ctx, 0.39, -0.39, 0.17, 0.17, "#354c45");
        polygon(ctx, [[0.42, -0.51], [0.3, -0.36], [0.38, -0.36], [0.35, -0.25], [0.49, -0.42], [0.4, -0.42]], "#e2b484");
        if (building.networkId == null) line(ctx, 0.27, -0.51, 0.51, -0.27, "#e0a18b", 0.026);
      }
      if (number(building.hp, 100) < number(building.maxHp, building.hp) * 0.8) this._bar(ctx, -0.36, 0.58, 0.72, clamp6(building.hp / Math.max(1, building.maxHp), 0, 1), "#dc9973");
      ctx.restore();
    }
    _drawBlueprint(ctx, x, y, kind, progress = null, color = "#b8ddd0") {
      ctx.save();
      rect(ctx, x + 0.06, y + 0.06, 0.88, 0.88, "rgba(103,184,164,.14)", 0.06);
      ctx.setLineDash([0.13, 0.08]);
      rect(ctx, x + 0.07, y + 0.07, 0.86, 0.86, null, 0.04, color, 0.035);
      ctx.setLineDash([]);
      ctx.translate(x + 0.5, y + 0.5);
      ctx.strokeStyle = color;
      ctx.lineWidth = 0.045;
      if (kind === "bed") {
        rect(ctx, -0.24, -0.31, 0.48, 0.62, null, 0.025, color);
        line(ctx, -0.2, -0.11, 0.2, -0.11, color, 0.035);
      } else if (kind === "stove") {
        rect(ctx, -0.28, -0.24, 0.56, 0.48, null, 0.03, color);
        ctx.beginPath();
        ctx.arc(-0.09, -0.04, 0.1, 0, TAU);
        ctx.stroke();
        line(ctx, 0.18, -0.24, 0.18, -0.38, color);
      } else if (kind === "beacon") {
        line(ctx, 0, 0.25, 0, -0.29, color, 0.055);
        line(ctx, -0.2, -0.13, 0.2, -0.13, color, 0.04);
        ctx.beginPath();
        ctx.arc(0, -0.24, 0.2, Math.PI * 1.12, Math.PI * 1.88);
        ctx.stroke();
        line(ctx, -0.21, 0.26, 0.21, 0.26, color);
      } else if (kind === "door") {
        rect(ctx, -0.24, -0.3, 0.48, 0.6, null, 0.01, color);
        ellipse(ctx, 0.13, 0.06, 0.025, 0.025, color);
      } else if (kind === "sandbag") {
        rect(ctx, -0.28, -0.15, 0.55, 0.29, null, 0.1, color);
        line(ctx, 0, -0.12, 0, 0.12, color, 0.025);
      } else if (kind === "horseshoes") {
        line(ctx, 0, 0.2, 0, -0.31, color, 0.045);
        ctx.beginPath();
        ctx.ellipse(0, 0.13, 0.22, 0.12, 0, 0.18, Math.PI * 1.85);
        ctx.stroke();
        line(ctx, -0.27, 0.28, 0.27, 0.28, color, 0.035);
      } else if (kind === "workbench") {
        rect(ctx, -0.3, -0.19, 0.6, 0.32, null, 0.025, color);
        line(ctx, -0.22, 0.13, -0.22, 0.29, color);
        line(ctx, 0.22, 0.13, 0.22, 0.29, color);
        line(ctx, -0.06, 0.02, 0.13, -0.31, color, 0.038);
        line(ctx, 0.03, -0.31, 0.22, -0.21, color, 0.07);
      } else if (kind === "researchbench") {
        rect(ctx, -0.3, -0.22, 0.6, 0.37, null, 0.025, color);
        rect(ctx, -0.12, -0.17, 0.23, 0.25, null, 0.01, color, 0.025);
        line(ctx, -0.22, 0.15, -0.22, 0.28, color);
        line(ctx, 0.22, 0.15, 0.22, 0.28, color);
      } else if (kind === "solar") {
        rect(ctx, -0.31, -0.27, 0.62, 0.47, null, 0.025, color);
        for (const px of [-0.1, 0.1]) line(ctx, px, -0.25, px, 0.18, color, 0.025);
        line(ctx, -0.29, -0.035, 0.29, -0.035, color, 0.025);
        line(ctx, -0.19, 0.21, -0.19, 0.31, color);
        line(ctx, 0.19, 0.21, 0.19, 0.31, color);
      } else if (kind === "battery") {
        rect(ctx, -0.22, -0.26, 0.44, 0.55, null, 0.035, color);
        line(ctx, -0.09, -0.26, -0.09, -0.34, color);
        line(ctx, 0.09, -0.26, 0.09, -0.34, color);
        polygon(ctx, [[0.05, -0.16], [-0.11, 0.045], [0.01, 0.045], [-0.05, 0.2], [0.13, -0.045], [5e-3, -0.045]], color);
      } else if (kind === "conduit") {
        line(ctx, -0.3, 0, 0.3, 0, color, 0.04);
        line(ctx, 0, -0.3, 0, 0.3, color, 0.04);
        rect(ctx, -0.09, -0.09, 0.18, 0.18, "#4a786b", 0.025, color, 0.03);
      } else if (kind === "cooler") {
        rect(ctx, -0.27, -0.27, 0.54, 0.53, null, 0.04, color);
        ctx.beginPath();
        ctx.arc(0, -0.035, 0.17, 0, TAU);
        ctx.stroke();
        line(ctx, -0.11, -0.145, 0.11, 0.075, color, 0.035);
        line(ctx, 0.11, -0.145, -0.11, 0.075, color, 0.035);
        line(ctx, -0.18, 0.2, 0.18, 0.2, color, 0.025);
      } else if (kind === "heater") {
        rect(ctx, -0.28, -0.2, 0.56, 0.42, null, 0.04, color);
        for (const px of [-0.17, -0.055, 0.055, 0.17]) line(ctx, px, -0.13, px, 0.13, color, 0.035);
        line(ctx, -0.13, -0.28, -0.09, -0.36, color, 0.03);
        line(ctx, 0.1, -0.28, 0.14, -0.36, color, 0.03);
      } else {
        rect(ctx, -0.3, -0.15, 0.6, 0.3, null, 0.035, color);
        line(ctx, -0.13, -0.15, -0.13, 0.15, color, 0.025);
        line(ctx, 0.16, -0.15, 0.16, 0.15, color, 0.025);
      }
      if (progress !== null && progress > 0) this._bar(ctx, -0.35, 0.34, 0.7, clamp6(progress, 0, 1), "#e8c580");
      ctx.restore();
    }
    _drawItem(ctx, item) {
      const x = number(item.x) + 0.5, y = number(item.y) + 0.5;
      ctx.save();
      ctx.translate(x, y);
      ellipse(ctx, 0.05, 0.2, 0.32, 0.14, "rgba(37,45,31,.2)");
      if (item.type === "wood") {
        for (let k = 0; k < 3; k++) {
          const py = -0.14 + k * 0.13;
          rect(ctx, -0.27 + (k === 1 ? 0.05 : 0), py, 0.5, 0.12, k === 1 ? "#9d784d" : "#825f3d", 0.045);
          ellipse(ctx, 0.23 + (k === 1 ? 0.05 : 0), py + 0.06, 0.06, 0.055, "#c6a273");
          ellipse(ctx, 0.23 + (k === 1 ? 0.05 : 0), py + 0.06, 0.023, 0.021, "#987448");
        }
        line(ctx, -0.07, -0.15, -0.07, 0.22, "#c1aa77", 0.045);
      } else if (item.type === "steel") {
        for (let k = 0; k < 3; k++) {
          const py = -0.15 + k * 0.13;
          polygon(ctx, [[-0.28, py], [0.13, py - 0.07], [0.28, py + 0.03], [-0.13, py + 0.1]], k === 0 ? "#c0c9b8" : "#a6b5a8");
          line(ctx, -0.13, py + 0.11, 0.28, py + 0.04, "#536f6b", 0.05);
        }
      } else if (item.type === "silver") {
        rect(ctx, -0.26, -0.05, 0.28, 0.25, "#8c8966", 0.09, "#646b54", 0.02);
        for (let k = 0; k < 3; k++) {
          const px = -0.08 + k * 0.14, py = 0.13 - k % 2 * 0.08;
          ellipse(ctx, px, py, 0.11, 0.065, "#869c8d");
          ellipse(ctx, px, py - 0.035, 0.11, 0.065, "#d8dcc3");
          ctx.beginPath();
          ctx.ellipse(px, py - 0.035, 0.065, 0.035, 0, 0, TAU);
          ctx.strokeStyle = "#a2b09a";
          ctx.lineWidth = 0.012;
          ctx.stroke();
        }
      } else if (item.type === "rifle") {
        ctx.save();
        ctx.rotate(-0.3);
        rect(ctx, -0.4, -0.08, 0.8, 0.24, "#9d885b", 0.05, "#6e6246", 0.025);
        rect(ctx, -0.29, -0.06, 0.29, 0.09, "#755638", 0.025);
        rect(ctx, -0.07, -0.08, 0.32, 0.07, "#425f59", 0.018);
        line(ctx, 0.2, -0.045, 0.38, -0.045, "#b6c5af", 0.035);
        line(ctx, 0.02, -0.12, 0.2, -0.12, "#2f514d", 0.045);
        line(ctx, -0.17, -0.06, -0.17, 0.14, "#c7b482", 0.028);
        ctx.restore();
      } else if (item.type === "armor") {
        polygon(ctx, [[-0.24, -0.27], [-0.08, -0.3], [-0.045, -0.17], [0.065, -0.17], [0.1, -0.3], [0.24, -0.26], [0.3, 0.21], [-0.29, 0.21]], "#647b69", "#3c5a4d", 0.03);
        rect(ctx, -0.2, -0.09, 0.16, 0.22, "#8b9b7b", 0.02);
        rect(ctx, 0.045, -0.09, 0.16, 0.22, "#8b9b7b", 0.02);
        line(ctx, 0, -0.12, 0, 0.18, "#b9b995", 0.025);
      } else if (item.type === "tool") {
        rect(ctx, -0.31, -0.16, 0.62, 0.4, "#827d55", 0.055, "#55664d", 0.025);
        line(ctx, -0.21, 0.18, 0.01, -0.19, "#c3a373", 0.06);
        rect(ctx, -0.06, -0.22, 0.23, 0.095, "#c0c6aa", 0.025);
        line(ctx, 0.04, 0.16, 0.24, -0.12, "#96b4a6", 0.05);
        ctx.beginPath();
        ctx.arc(0.25, -0.145, 0.075, 0.25, Math.PI * 1.6);
        ctx.strokeStyle = "#cad5b8";
        ctx.lineWidth = 0.04;
        ctx.stroke();
        line(ctx, -0.27, 0.15, 0.25, 0.15, "#b5a777", 0.025);
      } else if (item.type === "medicine") {
        rect(ctx, -0.26, -0.22, 0.52, 0.44, "#ddd9b8", 0.055, "#6c8575", 0.035);
        rect(ctx, -0.065, -0.15, 0.13, 0.28, "#608e7b", 0.01);
        rect(ctx, -0.14, -0.07, 0.28, 0.12, "#608e7b", 0.01);
      } else if (item.type === "meals") {
        rect(ctx, -0.27, -0.18, 0.54, 0.39, "#d0ba85", 0.08, "#886d48", 0.035);
        rect(ctx, -0.21, -0.13, 0.42, 0.25, "#9b7d52", 0.045);
        ellipse(ctx, -0.08, -0.01, 0.1, 0.075, "#d4bd78");
        ellipse(ctx, 0.1, -0.02, 0.085, 0.06, "#80a464");
      } else if (item.type === "rawfood") {
        rect(ctx, -0.28, -0.16, 0.56, 0.4, "#98784d", 0.025, "#6f593a");
        for (let k = 0; k < 5; k++) ellipse(ctx, -0.19 + k * 0.092, -0.12 + k % 2 * 0.045, 0.075, 0.085, k % 2 ? "#b8ae65" : "#96a65b", k * 0.4);
        line(ctx, -0.23, 0.1, 0.23, 0.1, "#c3a16a", 0.04);
      } else rect(ctx, -0.24, -0.21, 0.48, 0.43, "#b29966", 0.04, "#715c3d");
      if (Number.isFinite(item.freshness) && item.freshness < 0.3) {
        ellipse(ctx, -0.27, -0.23, 0.08, 0.08, "#4d5740");
        ellipse(ctx, -0.27, -0.23, 0.035, 0.035, item.freshness < 0.1 ? "#dd9780" : "#d9c584");
      }
      if (number(item.count) > 1 && TILE * this.camera.zoom > 25) {
        const label = String(Math.floor(item.count));
        ctx.font = `600 0.225px ${FONT}`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        const width = Math.max(0.28, ctx.measureText(label).width + 0.11);
        rect(ctx, 0.17 - width / 2, 0.08, width, 0.27, "rgba(30,47,40,.82)", 0.065);
        ctx.fillStyle = "#e9e0bc";
        ctx.fillText(label, 0.17, 0.218);
      }
      ctx.restore();
    }
    _drawTrader(ctx, visitor) {
      const x = number(visitor.x), y = number(visitor.y), walking = Array.isArray(visitor.path) && visitor.path.length > 0;
      const stride = walking ? Math.sin(this._simTime * 10) * 0.065 : 0;
      ctx.save();
      ctx.translate(x, y);
      ellipse(ctx, 0.25, 0.21, 0.68, 0.24, "rgba(27,45,36,.26)");
      ellipse(ctx, 0.43, 0.32, 0.105, 0.14, "#385048");
      ellipse(ctx, 0.82, 0.22, 0.085, 0.12, "#385048");
      rect(ctx, 0.3, -0.13, 0.58, 0.44, "#846b48", 0.045, "#4f5940", 0.03);
      rect(ctx, 0.32, -0.18, 0.54, 0.32, "#bfaa77", 0.06);
      rect(ctx, 0.4, -0.26, 0.32, 0.24, "#86a294", 0.05);
      line(ctx, 0.56, -0.25, 0.56, 0.22, "#d2bc88", 0.04);
      line(ctx, 0.31, 0.18, 0.12, 0.09, "#9b8156", 0.055);
      line(ctx, -0.105, 0.02, -0.12, 0.25 + stride, "#3b4c43", 0.12);
      line(ctx, 0.085, 0.02, 0.1, 0.25 - stride, "#34463f", 0.12);
      ellipse(ctx, -0.13, 0.26 + stride, 0.085, 0.04, "#283f38");
      ellipse(ctx, 0.1, 0.26 - stride, 0.085, 0.04, "#283f38");
      polygon(ctx, [[-0.2, -0.24], [0.18, -0.24], [0.24, 0.14], [-0.23, 0.14]], "#9a8460", "#5c674d", 0.025);
      rect(ctx, -0.095, -0.24, 0.21, 0.37, "#c0a67a", 0.035);
      line(ctx, -0.16, -0.15, -0.26, 0.02 + stride, "#9a8460", 0.09);
      line(ctx, 0.14, -0.15, 0.25, 0.06, "#9a8460", 0.09);
      ellipse(ctx, 0.25, 0.085, 0.05, 0.055, "#c69c77");
      line(ctx, -0.15, 0.04, 0.16, 0.04, "#685c3e", 0.035);
      ellipse(ctx, -0.01, -0.34, 0.175, 0.175, "#d1af83");
      ellipse(ctx, -0.015, -0.27, 0.1, 0.065, "#807158");
      ellipse(ctx, 0.06, -0.36, 0.014, 0.016, "#3a493d");
      ellipse(ctx, -0.035, -0.47, 0.25, 0.065, "#625e45", -0.1);
      rect(ctx, -0.18, -0.61, 0.29, 0.17, "#8b8259", 0.065);
      line(ctx, -0.17, -0.47, 0.1, -0.47, "#bcb28b", 0.03);
      if (visitor.phase === "trading") {
        ellipse(ctx, 0.35, -0.62, 0.15, 0.15, "#3d6157");
        ellipse(ctx, 0.35, -0.62, 0.075, 0.08, "#d5dbc0");
        line(ctx, 0.35, -0.665, 0.35, -0.575, "#8ca38b", 0.02);
      }
      ctx.restore();
    }
    _drawTraderLabel(ctx, visitor) {
      if (!this._isVisible(visitor.x, visitor.y) || TILE * this.camera.zoom < 14) return;
      const point = this._screenPoint(visitor.x + 0.18, visitor.y + 0.65);
      const remaining = Math.max(0, Math.ceil(number(visitor.leavesAt) - this._simTime));
      const label = visitor.phase === "trading" ? `\uAD50\uC5ED \uC0C1\uC778 \xB7 ${remaining}\uCD08` : visitor.phase === "arriving" ? "\uC0C1\uC778 \xB7 \uB3C4\uCC29\uD558\uB294 \uC911" : "\uC0C1\uC778 \xB7 \uB3CC\uC544\uAC00\uB294 \uC911";
      ctx.save();
      ctx.font = `600 ${this.width < 600 ? 10 : 11}px ${FONT}`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      const width = ctx.measureText(label).width + 16;
      rect(ctx, point.x - width / 2, point.y - 8, width, 18, "rgba(39,62,50,.92)", 5, "rgba(189,202,157,.6)", 1);
      ctx.fillStyle = "#e3e6be";
      ctx.fillText(label, point.x, point.y + 0.5);
      ctx.restore();
    }
    _drawSelectedPath(ctx, pawn) {
      const path = Array.isArray(pawn.path) ? pawn.path : [];
      if (!path.length) return;
      ctx.save();
      ctx.setLineDash([0.14, 0.14]);
      ctx.lineDashOffset = -this._time * 0.2;
      ctx.strokeStyle = pawn.drafted ? "rgba(244,201,124,.75)" : "rgba(220,224,182,.38)";
      ctx.lineWidth = 0.04;
      ctx.beginPath();
      ctx.moveTo(pawn.x, pawn.y);
      for (const step of path) if (Number.isFinite(step.x) && Number.isFinite(step.y)) ctx.lineTo(step.x + 0.5, step.y + 0.5);
      ctx.stroke();
      ctx.setLineDash([]);
      const last = path[path.length - 1];
      if (last && Number.isFinite(last.x) && Number.isFinite(last.y)) {
        const x = last.x + 0.5, y = last.y + 0.5;
        polygon(ctx, [[x, y - 0.16], [x + 0.16, y], [x, y + 0.16], [x - 0.16, y]], "#edc581");
      }
      ctx.restore();
    }
    _drawPawn(ctx, pawn, hostile, state) {
      const x = number(pawn.x), y = number(pawn.y), h = hashString(pawn.id);
      const selected = this._selectedIds.has(pawn.id);
      const dead = pawn.dead || number(pawn.health, 100) <= 0;
      if (!dead && !hostile && (number(pawn.health, 100) < 15 || pawn.patientBedId && !pawn.carriedBy)) {
        this._drawDownedPawn(ctx, pawn);
        return;
      }
      const walking = !dead && Array.isArray(pawn.path) && pawn.path.length > 0;
      const bob = walking ? Math.sin(this._simTime * 12 + h % 10) * 0.025 : 0;
      ctx.save();
      ctx.translate(x, y);
      ellipse(ctx, 0.07, 0.15, 0.32, 0.17, "rgba(21,39,32,.3)");
      if (selected && !dead) {
        const pulse = Math.sin(this._time * 3) * 0.025;
        ellipse(ctx, 0, 0.08, 0.48 + pulse, 0.28 + pulse, "rgba(246,199,112,.12)");
        ctx.beginPath();
        ctx.ellipse(0, 0.08, 0.47 + pulse, 0.28 + pulse, 0, 0, TAU);
        ctx.strokeStyle = "#f0cc86";
        ctx.lineWidth = 0.045;
        ctx.stroke();
      } else if (pawn.drafted && !dead) {
        ctx.beginPath();
        ctx.ellipse(0, 0.08, 0.4, 0.23, 0, 0, TAU);
        ctx.strokeStyle = "rgba(231,198,127,.65)";
        ctx.lineWidth = 0.033;
        ctx.stroke();
      }
      if (dead) {
        ellipse(ctx, 0.1, 0.1, 0.42, 0.18, "rgba(113,61,49,.26)");
        ctx.rotate(-1.3);
        ctx.globalAlpha = 0.68;
      }
      ctx.translate(0, bob);
      const skin = ["#ddbc8d", "#c49a75", "#b78463"][h % 3];
      const hair = ["#504938", "#654a36", "#8e8062", "#3a4541"][h % 4];
      const shirt = hostile ? "#a35c50" : pawn.color || ["#80aca4", "#cfaa6d", "#9b9bb3"][h % 3];
      const stride = walking ? Math.sin(this._simTime * 12 + h % 10) * 0.065 : 0;
      line(ctx, -0.1, 0.02, -0.12, 0.23 + stride, "#344c49", 0.11);
      line(ctx, 0.1, 0.02, 0.12, 0.23 - stride, "#2c4241", 0.11);
      ellipse(ctx, -0.13, 0.24 + stride, 0.08, 0.04, "#273c38");
      ellipse(ctx, 0.13, 0.24 - stride, 0.08, 0.04, "#273c38");
      if (!hostile && pawn.equipment?.weapon === "rifle" && !pawn.drafted) {
        line(ctx, -0.22, 0.16, 0.23, -0.57, "#38564e", 0.075);
        line(ctx, 0.17, -0.47, 0.29, -0.68, "#b4c1ab", 0.035);
        line(ctx, -0.24, 0.18, -0.13, -0.01, "#8c704c", 0.11);
      }
      rect(ctx, -0.205, -0.25, 0.41, 0.4, shirt, 0.13, "rgba(29,48,42,.65)", 0.035);
      line(ctx, -0.18, -0.15, -0.255, 0.01 + stride, shirt, 0.105);
      line(ctx, 0.18, -0.15, 0.25, 0.01 - stride, shirt, 0.105);
      ellipse(ctx, -0.255, 0.055 + stride, 0.057, 0.062, skin);
      ellipse(ctx, 0.25, 0.055 - stride, 0.057, 0.062, skin);
      if (!hostile && pawn.equipment?.armor === "armor") {
        rect(ctx, -0.16, -0.225, 0.32, 0.33, "#5c7263", 0.065, "#3c5b4e", 0.018);
        rect(ctx, -0.12, -0.12, 0.09, 0.13, "#899a7e", 0.012);
        rect(ctx, 0.03, -0.12, 0.09, 0.13, "#899a7e", 0.012);
        line(ctx, 0, -0.17, 0, 0.075, "#b3b693", 0.016);
      }
      line(ctx, -0.13, 0.08, 0.14, 0.08, "rgba(39,56,45,.4)", 0.035);
      if (!hostile && pawn.equipment?.tool === "tool") {
        rect(ctx, -0.235, 0.02, 0.1, 0.16, "#8e764c", 0.018);
        line(ctx, -0.195, 0.16, -0.24, -0.025, "#d2b27a", 0.027);
        line(ctx, -0.29, -0.015, -0.19, -0.04, "#b6c5ac", 0.04);
      }
      ellipse(ctx, 0.02, -0.32, 0.198, 0.2, "rgba(37,44,34,.38)");
      ellipse(ctx, 0, -0.36, 0.187, 0.19, skin);
      ellipse(ctx, -0.018, -0.46, 0.19, 0.12, hair);
      ellipse(ctx, -0.156, -0.37, 0.044, 0.1, hair);
      ellipse(ctx, 0.137, -0.43, 0.048, 0.075, hair);
      ellipse(ctx, 0.067, -0.33, 0.016, 0.018, "#34413a");
      if (hostile) {
        rect(ctx, -0.13, -0.3, 0.27, 0.09, "#694e44", 0.03);
        line(ctx, -0.13, -0.44, 0.15, -0.44, "#d2956a", 0.048);
      } else {
        line(ctx, -0.08, -0.2, 0.08, -0.2, "rgba(240,225,181,.5)", 0.035);
      }
      const patient = pawn.carryingPawnId && this._pawnById?.get(pawn.carryingPawnId);
      if (!dead && patient && !patient.dead && patient.carriedBy === pawn.id) {
        this._drawCarriedPawn(ctx, patient);
      } else if (!dead && (pawn.drafted || hostile)) {
        let target = null;
        const pool = hostile ? state.colonists || [] : state.raiders || [];
        const active = pool.filter((p) => p && !p.dead);
        if (active.length) target = active.reduce((best, p) => Math.hypot(p.x - x, p.y - y) < Math.hypot(best.x - x, best.y - y) ? p : best);
        const angle = target ? Math.atan2(target.y - y, target.x - x) : -0.25;
        ctx.save();
        ctx.rotate(angle);
        const rifle = !hostile && pawn.equipment?.weapon === "rifle";
        rect(ctx, 0.16, -0.09, rifle ? 0.54 : 0.42, 0.095, "#3c504c", 0.025, "#243a36", 0.025);
        rect(ctx, 0.12, -0.04, 0.2, 0.1, "#907349", 0.025);
        line(ctx, rifle ? 0.59 : 0.44, -0.05, rifle ? 0.91 : 0.67, -0.05, "#a1b3a7", 0.045);
        if (rifle) {
          line(ctx, 0.34, -0.17, 0.56, -0.17, "#37564f", 0.06);
          line(ctx, 0.4, -0.15, 0.4, -0.08, "#9dac99", 0.02);
          line(ctx, 0.52, -0.15, 0.52, -0.08, "#9dac99", 0.02);
        }
        ctx.restore();
      } else if (!dead && !walking && pawn.job?.stage === "work" && ["doctor", "feed"].includes(pawn.job.type)) {
        this._drawWorkTool(ctx, pawn.job.type, this._simTime + h % 7);
      } else if (!dead && pawn.carry) {
        rect(ctx, -0.18, -5e-3, 0.36, 0.27, "#b09261", 0.025, "#735c3d", 0.025);
        line(ctx, 0, 0.01, 0, 0.24, "#d5bc87", 0.04);
        line(ctx, -0.16, 0.12, 0.16, 0.12, "#8f744d", 0.025);
      } else if (!dead && pawn.job && !walking && !(pawn.job.type === "recreate" && pawn.job.ground)) this._drawWorkTool(ctx, pawn.job.type, this._simTime + h % 7);
      if (!dead && pawn.job?.type === "firefight" && !walking) this._drawWaterSpray(ctx, pawn);
      if (!dead && number(pawn.bleed) > 0) {
        ellipse(ctx, -0.29, 0.22, 0.043, 0.055, "#b46d5e");
        ellipse(ctx, 0.18, 0.32, 0.03, 0.036, "#9e5a50");
      }
      if (!dead && number(pawn.health, 100) < 88) this._bar(ctx, -0.3, -0.78, 0.6, clamp6(number(pawn.health) / number(pawn.maxHp, 100), 0, 1), hostile ? "#dd8d77" : "#ddaa79");
      if (!dead && pawn.job && number(pawn.job.total) > 0 && !walking) {
        const progress = clamp6(number(pawn.job.progress) / pawn.job.total, 0, 1);
        this._bar(ctx, -0.24, 0.38, 0.48, progress, "#e8c985", 0.045);
      }
      if (!dead && /sleep|rest|수면|잠|휴식/.test(String(pawn.status))) {
        ctx.font = `600 0.22px ${FONT}`;
        ctx.fillStyle = "#e6e3ba";
        ctx.textAlign = "center";
        ctx.fillText("z", 0.32, -0.58 - this._time * 0.1 % 0.16);
      }
      ctx.restore();
    }
    _drawDownedPawn(ctx, pawn) {
      const selected = this._selectedIds.has(pawn.id), h = hashString(pawn.id);
      ctx.save();
      ctx.translate(number(pawn.x), number(pawn.y));
      ellipse(ctx, 0.04, 0.09, 0.55, 0.23, "rgba(30,43,34,.32)");
      if (selected) {
        ctx.beginPath();
        ctx.ellipse(0, 0.04, 0.6, 0.3, 0, 0, TAU);
        ctx.strokeStyle = "#f0cc86";
        ctx.lineWidth = 0.04;
        ctx.stroke();
      }
      ctx.save();
      ctx.rotate(pawn.patientBedId ? Math.PI / 2 : -0.3);
      const shirt = pawn.color || "#91a89a";
      line(ctx, 0.13, -0.055, 0.4, -0.09, "#344d49", 0.12);
      line(ctx, 0.13, 0.08, 0.4, 0.12, "#344d49", 0.12);
      ellipse(ctx, 0.43, -0.08, 0.075, 0.045, "#2c423d");
      ellipse(ctx, 0.43, 0.13, 0.075, 0.045, "#2c423d");
      rect(ctx, -0.21, -0.16, 0.39, 0.32, shirt, 0.1, "#44594d", 0.025);
      line(ctx, -0.12, -0.15, 0.1, -0.22, shirt, 0.08);
      line(ctx, -0.12, 0.14, 0.08, 0.21, shirt, 0.08);
      ellipse(ctx, -0.31, 0, 0.15, 0.15, ["#ddbc8d", "#c49a75", "#b78463"][h % 3]);
      ellipse(ctx, -0.37, -0.02, 0.1, 0.145, ["#504938", "#654a36", "#8e8062"][h % 3]);
      line(ctx, -0.27, -0.055, -0.23, -0.035, "#5f5d43", 0.018);
      line(ctx, -0.27, 0.04, -0.23, 0.055, "#5f5d43", 0.018);
      if (number(pawn.bleed) > 0) ellipse(ctx, 0.05, 0.27, 0.12, 0.065, "rgba(165,91,70,.5)");
      ctx.restore();
      this._bar(ctx, -0.33, -0.61, 0.66, clamp6(number(pawn.health) / 100, 0, 1), "#df9e7b");
      ellipse(ctx, 0.42, -0.36, 0.15, 0.15, "#405d55");
      line(ctx, 0.42, -0.445, 0.42, -0.275, "#f2cf93", 0.042);
      line(ctx, 0.335, -0.36, 0.505, -0.36, "#f2cf93", 0.042);
      ctx.restore();
    }
    _drawCarriedPawn(ctx, patient) {
      const selected = this._selectedIds.has(patient.id), h = hashString(patient.id);
      ctx.save();
      ctx.translate(0.05, -0.07);
      ctx.rotate(-0.12);
      ellipse(ctx, 0.03, 0.035, 0.43, 0.14, "rgba(27,43,37,.22)");
      line(ctx, 0.07, -0.02, 0.34, 0.035, "#344d49", 0.085);
      line(ctx, 0.07, 0.065, 0.33, 0.12, "#344d49", 0.085);
      rect(ctx, -0.19, -0.09, 0.31, 0.21, patient.color || "#a0b1a2", 0.065, "#4a6559", 0.02);
      ellipse(ctx, -0.27, 0, 0.106, 0.108, ["#ddbc8d", "#c49a75", "#b78463"][h % 3]);
      ellipse(ctx, -0.315, -0.02, 0.07, 0.1, ["#504938", "#654a36", "#8e8062"][h % 3]);
      line(ctx, -0.12, 0.1, 0.08, 0.15, "#d5b38a", 0.06);
      if (selected) {
        ctx.strokeStyle = "#f0cc86";
        ctx.lineWidth = 0.025;
        roundedPath(ctx, -0.4, -0.15, 0.82, 0.38, 0.12);
        ctx.stroke();
      }
      ctx.restore();
      ellipse(ctx, 0.35, -0.59, 0.12, 0.12, "#44675f");
      line(ctx, 0.35, -0.655, 0.35, -0.525, "#d8ead1", 0.033);
      line(ctx, 0.285, -0.59, 0.415, -0.59, "#d8ead1", 0.033);
    }
    _drawWaterSpray(ctx, pawn) {
      const job = pawn.job;
      const dx = number(job.tx) + 0.5 - number(pawn.x), dy = number(job.ty) + 0.5 - number(pawn.y);
      if (Math.hypot(dx, dy) > 2.3) return;
      const phase = (this._time * 1.7 + hashString(pawn.id) % 10) % 1;
      ctx.save();
      for (let k = 0; k < 7; k++) {
        const t = (phase + k / 7) % 1;
        const px = mix(0.22, dx, t), py = mix(-0.05, dy + 0.1, t) - Math.sin(t * Math.PI) * 0.32;
        ellipse(ctx, px, py, 0.018 + t * 0.015, 0.027, `rgba(192,226,221,${0.6 - t * 0.3})`, -0.3);
      }
      ctx.restore();
    }
    _drawWorkTool(ctx, type, time) {
      ctx.save();
      const swing = Math.sin(time * 6) * 0.3;
      ctx.translate(0.23, -0.05);
      if (type === "doctor" || type === "rescue") {
        rect(ctx, -0.07, -0.08, 0.21, 0.2, "#e6dfb9", 0.04);
        line(ctx, 0.035, -0.035, 0.035, 0.065, "#78a78a", 0.038);
        line(ctx, -0.015, 0.015, 0.085, 0.015, "#78a78a", 0.038);
      } else if (type === "firefight") {
        ctx.rotate(-0.22 + swing * 0.35);
        polygon(ctx, [[-0.1, -0.06], [0.15, -0.06], [0.12, 0.18], [-0.07, 0.18]], "#81a9aa", "#466e70", 0.025);
        ellipse(ctx, 0.025, -0.06, 0.125, 0.043, "#c2dfcf");
        ctx.beginPath();
        ctx.arc(0.025, -0.075, 0.1, Math.PI, TAU);
        ctx.strokeStyle = "#d0cfab";
        ctx.lineWidth = 0.023;
        ctx.stroke();
      } else if (type === "feed") {
        ellipse(ctx, 0.035, 0.08, 0.16, 0.08, "#ad9062");
        ellipse(ctx, 0.035, 0.045, 0.14, 0.055, "#e1ce91");
        line(ctx, 0.1, 0, 0.19 + swing * 0.05, -0.11, "#c8cead", 0.027);
        ellipse(ctx, 0.2 + swing * 0.05, -0.12, 0.035, 0.026, "#d5dab5");
      } else if (type === "recreate") {
        ctx.translate(swing * 0.14, -0.03 - Math.abs(swing) * 0.2);
        ctx.rotate(-0.3 + swing);
        ctx.beginPath();
        ctx.arc(0.03, 0.035, 0.105, -0.35, Math.PI * 1.55);
        ctx.strokeStyle = "#c9c5a0";
        ctx.lineWidth = 0.035;
        ctx.stroke();
      } else if (type === "equip") {
        rect(ctx, -0.07, -0.1, 0.24, 0.27, "#788d72", 0.045);
        line(ctx, -0.015, -0.04, 0.12, 0.105, "#d7c994", 0.028);
        line(ctx, 0.12, -0.04, -0.015, 0.105, "#d7c994", 0.028);
      } else if (type === "research") {
        ctx.rotate(-0.2);
        rect(ctx, -0.03, -0.06, 0.25, 0.26, "#e1dcb7", 0.015, "#8b9b7f", 0.02);
        line(ctx, 0.02, 0, 0.15, 0, "#78988c", 0.02);
        line(ctx, 0.02, 0.07, 0.12, 0.07, "#78988c", 0.02);
        line(ctx, 0.1 + swing * 0.04, 0.16, 0.2 + swing * 0.04, -0.06, "#8c7048", 0.025);
      } else {
        ctx.rotate(-0.6 + swing);
        line(ctx, 0, 0.12, 0.06, -0.28, "#b99c68", 0.043);
        if (type === "mine") {
          line(ctx, -0.11, -0.25, 0.23, -0.31, "#b9c3af", 0.055);
          line(ctx, 0.23, -0.31, 0.25, -0.23, "#96aa9c", 0.04);
        } else if (type === "build" || type === "repair" || type === "craft") rect(ctx, -0.07, -0.32, 0.25, 0.09, "#a6b6a8", 0.025);
        else if (type === "grow") polygon(ctx, [[-0.02, -0.23], [0.17, -0.25], [0.14, -0.4], [0.02, -0.38]], "#a5b2a0");
        else polygon(ctx, [[0.02, -0.25], [0.2, -0.35], [0.2, -0.17], [0.045, -0.17]], "#b7c2b0");
      }
      ctx.restore();
    }
    _bar(ctx, x, y, width, value, color, height = 0.065) {
      rect(ctx, x - 0.025, y - 0.025, width + 0.05, height + 0.05, "rgba(26,43,37,.8)", 0.035);
      if (value > 0) rect(ctx, x, y, Math.max(5e-3, width * clamp6(value, 0, 1)), height, color, 0.025);
    }
    _drawDesignation(ctx, tile) {
      const color = tile.designation === "mine" ? "#b6c9bd" : tile.designation === "harvest" ? "#e7bc8c" : "#edd097";
      const x = tile.x + 0.85, y = tile.y + 0.08;
      ellipse(ctx, x, y, 0.19, 0.19, "rgba(35,54,43,.82)");
      ctx.save();
      ctx.translate(x, y);
      if (tile.designation === "harvest") {
        ellipse(ctx, 0, 0.03, 0.075, 0.07, color);
        line(ctx, 0.01, -0.01, 0.03, -0.1, "#9eba7e", 0.035);
      } else {
        line(ctx, -0.075, 0.09, 0.055, -0.08, color, 0.035);
        if (tile.designation === "mine") line(ctx, -0.04, -0.1, 0.11, -5e-3, color, 0.045);
        else polygon(ctx, [[0.025, -0.1], [0.12, -0.05], [0.065, 0.025], [-5e-3, -0.025]], color);
      }
      ctx.restore();
    }
    _drawEffect(ctx, effect) {
      const x = number(effect.x), y = number(effect.y);
      const age = Math.max(0, number(effect.age));
      const t = clamp6(age / Math.max(1e-3, number(effect.life, 0.5)), 0, 1);
      if (t >= 1) return;
      const color = effect.color || (effect.kind === "heal" ? "#b0ddbc" : "#edc580");
      ctx.save();
      ctx.globalAlpha = 1 - t;
      if (effect.text === "\uB099\uB8B0") {
        const fade = clamp6(1 - t * 1.8, 0, 1);
        ctx.globalAlpha *= fade;
        ctx.beginPath();
        ctx.moveTo(x + 0.35, y - 3.1);
        ctx.lineTo(x - 0.13, y - 1.86);
        ctx.lineTo(x + 0.23, y - 1.95);
        ctx.lineTo(x - 0.11, y - 0.82);
        ctx.lineTo(x + 0.12, y - 0.92);
        ctx.lineTo(x, y);
        ctx.strokeStyle = "#f5d897";
        ctx.lineWidth = 0.11;
        ctx.stroke();
        ctx.strokeStyle = "#fff1c9";
        ctx.lineWidth = 0.035;
        ctx.stroke();
        ellipse(ctx, x, y, 0.35 + t * 0.5, 0.2 + t * 0.15, "rgba(244,218,150,.22)");
      } else if (String(effect.text || "").includes("\uC9C4\uD654")) {
        for (let k = 0; k < 7; k++) {
          const angle = k * TAU / 7, distance = 0.14 + t * 0.48;
          ellipse(ctx, x + Math.cos(angle) * distance, y - 0.12 + Math.sin(angle) * distance * 0.6, 0.025, 0.045, "#beded8", angle);
        }
      } else if (effect.kind === "shot") {
        const tx = number(effect.tx, x), ty = number(effect.ty, y);
        line(ctx, x, y - 0.08, tx, ty - 0.08, "rgba(247,214,145,.24)", 0.025);
        const head = clamp6(t * 2.8, 0.3, 1), tail = Math.max(0, head - 0.22);
        line(ctx, mix(x, tx, tail), mix(y, ty, tail) - 0.08, mix(x, tx, head), mix(y, ty, head) - 0.08, color, 0.045);
        if (t < 0.3) ellipse(ctx, x, y - 0.08, 0.11, 0.11, "#ffe6ab");
      } else if (effect.kind === "heal") {
        const py = y - 0.5 - t * 0.5;
        line(ctx, x - 0.1, py, x + 0.1, py, color, 0.055);
        line(ctx, x, py - 0.1, x, py + 0.1, color, 0.055);
      } else {
        for (let i = 0; i < 5; i++) {
          const angle = i / 5 * TAU + 0.4, distance = 0.1 + t * 0.45;
          const px = x + Math.cos(angle) * distance, py = y + Math.sin(angle) * distance - t * 0.16;
          line(ctx, px, py, px + Math.cos(angle) * 0.07, py + Math.sin(angle) * 0.07, effect.kind === "hit" ? "#dfac87" : color, 0.045);
        }
      }
      ctx.restore();
    }
    _drawHover(ctx, hover, tool) {
      const tile = this._tile(hover.x, hover.y);
      if (!tile) return;
      const { x, y } = hover;
      let valid = true;
      if (tool.type === "build") valid = tile.terrain !== "water" && !tile.building && !tile.feature && !tile.crop && !["farm", "stockpile"].includes(tile.zone) && number(tile.fire) <= 0;
      else if (tool.type === "zone") valid = tile.terrain !== "water" && tile.terrain !== "stone" && !tile.building;
      else if (tool.type === "gather") valid = ["tree", "berry", "ore"].includes(tile.feature);
      else if (tool.type === "demolish") valid = Boolean(tile.building?.complete);
      else if (tool.type === "cancel") valid = Boolean(tile.designation || tile.zone || tile.building && !tile.building.complete);
      else if (tool.type === "chop") valid = tile.feature === "tree";
      else if (tool.type === "mine") valid = tile.feature === "ore";
      else if (tool.type === "harvest") valid = tile.feature === "berry" || Boolean(tile.crop);
      else if (tool.type === "firefight" || tool.type === "extinguish") valid = number(tile.fire) > 0;
      const fireTarget = ["prioritize", "firefight", "extinguish"].includes(tool.type) && number(tile.fire) > 0;
      const color = fireTarget ? "#bce6dc" : valid ? "#f2d59a" : "#df9980";
      ctx.save();
      if (tool.type === "build" && !tile.building) this._drawBlueprint(ctx, x, y, tool.kind, null, color);
      else {
        rect(ctx, x + 0.035, y + 0.035, 0.93, 0.93, valid ? "rgba(244,210,143,.07)" : "rgba(213,117,92,.11)", 0.06);
        const segments = [
          [x + 0.04, y + 0.26, x + 0.04, y + 0.04],
          [x + 0.04, y + 0.04, x + 0.26, y + 0.04],
          [x + 0.74, y + 0.04, x + 0.96, y + 0.04],
          [x + 0.96, y + 0.04, x + 0.96, y + 0.26],
          [x + 0.04, y + 0.74, x + 0.04, y + 0.96],
          [x + 0.04, y + 0.96, x + 0.26, y + 0.96],
          [x + 0.74, y + 0.96, x + 0.96, y + 0.96],
          [x + 0.96, y + 0.74, x + 0.96, y + 0.96]
        ];
        for (const segment of segments) line(ctx, ...segment, color, 0.045);
      }
      if (fireTarget) {
        ellipse(ctx, x + 0.8, y + 0.1, 0.18, 0.18, "#3d6c6b");
        ctx.beginPath();
        ctx.moveTo(x + 0.8, y - 0.01);
        ctx.quadraticCurveTo(x + 0.65, y + 0.17, x + 0.8, y + 0.2);
        ctx.quadraticCurveTo(x + 0.95, y + 0.17, x + 0.8, y - 0.01);
        ctx.fillStyle = "#c9e7d8";
        ctx.fill();
      }
      ctx.restore();
    }
    _screenPoint(x, y) {
      const scale = TILE * this.camera.zoom;
      return { x: (x - this.camera.x) * scale + this.width / 2, y: (y - this.camera.y) * scale + this.height / 2 };
    }
    _drawNameplates(ctx, pawns, raiders, selectedId) {
      const scale = TILE * this.camera.zoom;
      ctx.save();
      ctx.font = `500 ${this.width < 600 ? 10 : 11}px ${FONT}`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      for (const pawn of [...pawns, ...raiders]) {
        if (!pawn || pawn.dead || !this._isVisible(pawn.x, pawn.y)) continue;
        const carrier = pawn.carriedBy && this._pawnById?.get(pawn.carriedBy);
        if (carrier && !carrier.dead && carrier.carryingPawnId === pawn.id) continue;
        const selected = this._selectedIds.has(pawn.id);
        const hostile = raiders.includes(pawn);
        const hovered = this._hover && Math.floor(pawn.x) === this._hover.x && Math.floor(pawn.y) === this._hover.y;
        if (hostile && !selected && !hovered) continue;
        if (scale < 19 && !selected && !hovered) continue;
        const point = this._screenPoint(pawn.x, pawn.y + 0.58);
        if (point.x < -30 || point.x > this.width + 30 || point.y < 0 || point.y > this.height + 20) continue;
        const carrying = pawn.carryingPawnId && this._pawnById?.get(pawn.carryingPawnId);
        const text = String(pawn.name || (hostile ? "\uCE68\uC785\uC790" : "\uC815\uCC29\uBBFC")) + (carrying ? " \xB7 \uAD6C\uC870 \uC911" : !hostile && number(pawn.health, 100) < 15 ? " \xB7 \uC4F0\uB7EC\uC9D0" : !hostile && pawn.patientBedId ? " \xB7 \uCE68\uC0C1 \uC548\uC815" : "");
        const width = Math.ceil(ctx.measureText(text).width) + 15;
        rect(ctx, point.x - width / 2, point.y - 8, width, 17, selected ? "rgba(35,49,43,.94)" : "rgba(30,48,41,.78)", 5, selected ? "rgba(232,196,128,.65)" : null, 1);
        ctx.fillStyle = selected ? "#f5dba8" : hostile ? "#edb4a0" : "#eee9d2";
        ctx.fillText(text, point.x, point.y + 0.5);
      }
      ctx.restore();
    }
    _drawWeather(ctx, weather) {
      if (weather === "rain") {
        ctx.fillStyle = "rgba(33,58,73,.09)";
        ctx.fillRect(0, 0, this.width, this.height);
        ctx.strokeStyle = "rgba(197,215,207,.22)";
        ctx.lineWidth = 1;
        const count = Math.min(100, Math.round(this.width * this.height / 1e4));
        ctx.beginPath();
        for (let i = 0; i < count; i++) {
          const x = (randomAt(i, 8) * (this.width + 120) - this._time * 24) % (this.width + 120);
          const y = (randomAt(i, 9) * this.height + this._time * 220) % (this.height + 40) - 20;
          const px = x < -30 ? x + this.width + 120 : x;
          ctx.moveTo(px, y);
          ctx.lineTo(px - 4, y + 13);
        }
        ctx.stroke();
      } else if (weather === "heat") {
        const haze = ctx.createLinearGradient(0, 0, 0, this.height);
        haze.addColorStop(0, "rgba(243,191,100,.10)");
        haze.addColorStop(1, "rgba(236,178,92,0)");
        ctx.fillStyle = haze;
        ctx.fillRect(0, 0, this.width, this.height);
      }
    }
    _drawVignette(ctx) {
      const radius = Math.max(this.width, this.height) * 0.7;
      const shade = ctx.createRadialGradient(this.width / 2, this.height / 2, radius * 0.35, this.width / 2, this.height / 2, radius);
      shade.addColorStop(0, "rgba(17,35,30,0)");
      shade.addColorStop(1, "rgba(17,35,30,.19)");
      ctx.fillStyle = shade;
      ctx.fillRect(0, 0, this.width, this.height);
    }
  };

  // dist/app.js
  var $ = (selector, root = document) => root.querySelector(selector);
  var $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
  var esc = (value) => String(value ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  var icon = (name, cls = "") => `<svg${cls ? ` class="${cls}"` : ""} aria-hidden="true"><use href="#i-${name}"/></svg>`;
  var clamp7 = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
  var pct = (n) => Math.round(clamp7(Number(n) || 0, 0, 100));
  var SAVE_KEY = "frontier-colony-save-v1";
  var PREFS_KEY = "frontier-colony-preferences";
  var RECOVERY_KEY = "frontier-colony-recovery";
  var WEATHER = { clear: "\uB9D1\uC74C", rain: "\uBE44", heat: "\uD3ED\uC5FC", cold: "\uD55C\uD30C" };
  var TERRAIN = { grass: "\uD480\uBC2D", soil: "\uBE44\uC625\uD55C \uD1A0\uC591", water: "\uAC15", stone: "\uC554\uBC18" };
  var FEATURE = { tree: "\uB098\uBB34", berry: "\uC57C\uC0DD \uC5F4\uB9E4", ore: "\uAC15\uCCA0 \uAD11\uB9E5" };
  var RES_ICONS = { wood: "wood", steel: "steel", rawfood: "leaf", meals: "food", medicine: "medicine", silver: "coin", rifle: "rifle", armor: "armor", tool: "craft" };
  var BUILD_ICONS = { wall: "wall", door: "door", bed: "bed", stove: "stove", sandbag: "shield", beacon: "beacon", researchbench: "research", solar: "solar", battery: "battery", conduit: "cable", heater: "heat", cooler: "snow", horseshoes: "recreation", workbench: "craft" };
  var SCHEDULE_LABELS = { anything: "\uC790\uC728", work: "\uC791\uC5C5", sleep: "\uC218\uBA74", recreation: "\uC5EC\uAC00" };
  var SCHEDULE_ICONS = { anything: "sun", work: "axe", sleep: "bed", recreation: "recreation" };
  var PRESET_LABELS = { balanced: "\uADE0\uD615 \uC0DD\uD65C", night: "\uC57C\uAC04 \uC791\uC5C5", free: "\uC790\uC728 \uC0DD\uD65C" };
  var UTILITY_TYPES = /* @__PURE__ */ new Set(["solar", "battery", "conduit", "heater", "cooler"]);
  var ui = {
    speed: 1,
    lastSpeed: 1,
    category: "orders",
    tool: "select",
    pane: "colony",
    selectedId: null,
    selectedTile: null,
    hover: null,
    showGrid: false,
    showZones: true,
    drag: null,
    keys: /* @__PURE__ */ new Set(),
    interacting: false,
    selectedIds: [],
    layer: "normal",
    previewTiles: [],
    autoPause: true,
    hadRaid: false,
    hadFire: false,
    downedIds: /* @__PURE__ */ new Set(),
    persistenceBlocked: false,
    scheduleBrush: "work",
    schedulePawnId: null,
    tradeSide: "buy",
    tradeItem: "medicine",
    tradeCount: 1,
    seenTraderId: null,
    dialogSpeed: null,
    seenVictory: false,
    seenGameOver: false,
    lastLogId: null,
    saveTime: 0,
    errorTime: 0
  };
  var game;
  var renderer;
  var frameTime = 0;
  var lastUiTime = 0;
  var restored = false;
  var canvas = $("#world");
  var dialog = $("#dialog");
  var pointers = /* @__PURE__ */ new Map();
  var pinch = null;
  var recoverySave = null;
  var buildingTool = ([id, b]) => ({ id: `build:${id}`, label: b.label, icon: BUILD_ICONS[id] || "wall", hint: `${b.label} \uAC74\uC124 \uC704\uCE58\uB97C \uC120\uD0DD\uD558\uC138\uC694. \uC8FC\uBBFC\uC774 \uC790\uC7AC\uB97C \uC6B4\uBC18\uD574 \uAC74\uC124\uD569\uB2C8\uB2E4.`, sub: Object.entries(b.cost).map(([r, n]) => `${RESOURCE_LABELS[r]} ${n}`).join(" \xB7 "), tech: b.tech, cost: b.cost });
  var toolsByCategory = {
    orders: [
      { id: "select", label: "\uC120\uD0DD", icon: "select", hint: "\uC8FC\uBBFC\uC774\uB098 \uC9C0\uD615\uC744 \uC120\uD0DD\uD558\uC138\uC694", sub: "\uC774\uB3D9 \xB7 \uC0B4\uD3B4\uBCF4\uAE30" },
      { id: "gather", label: "\uCC44\uC9D1 \uC9C0\uC815", icon: "axe", hint: "\uB098\uBB34\xB7\uC5F4\uB9E4\xB7\uAD11\uB9E5 \uC704\uB97C \uB4DC\uB798\uADF8\uD574 \uC791\uC5C5\uC744 \uC9C0\uC815\uD558\uC138\uC694", sub: "\uBC8C\uBAA9 \xB7 \uC218\uD655 \xB7 \uCC44\uAD11" },
      { id: "draft-all", label: "\uC804\uCCB4 \uC9D5\uC9D1", icon: "shield", hint: "\uC815\uCC29\uBBFC \uBAA8\uB450\uB97C \uC804\uD22C\uC5D0 \uBC30\uCE58\uD569\uB2C8\uB2E4", sub: "\uC804\uD22C / \uC791\uC5C5 \uBCF5\uADC0" },
      { id: "hold", label: "\uC704\uCE58 \uC0AC\uC218", icon: "hold", hint: "\uC120\uD0DD\uD55C \uC9D5\uC9D1 \uC8FC\uBBFC\uC758 \uC774\uB3D9\uC744 \uBA48\uCD94\uACE0 \uD604\uC7AC \uC704\uCE58\uC5D0\uC11C \uBC29\uC5B4\uD569\uB2C8\uB2E4", sub: "\uC774\uB3D9 \uC911\uB2E8 \xB7 \uACBD\uACC4" },
      { id: "care", label: "\uC758\uB8CC\xB7\uC18C\uBC29", icon: "medicine", hint: "\uBD80\uC0C1\uC790 \uAD6C\uC870\xB7\uCE58\uB8CC\uC640 \uD654\uC7AC \uB300\uC751\uC744 \uAD00\uB9AC\uD569\uB2C8\uB2E4", sub: "\uB3D9\uB8CC\uB97C \uAD6C\uD558\uAE30" },
      { id: "prioritize", label: "\uC6B0\uC120 \uC791\uC5C5", icon: "prioritize", hint: "\uC8FC\uBBFC \uC120\uD0DD \uD6C4 \uBD88\xB7\uCCAD\uC0AC\uC9C4\xB7\uC9C0\uC815 \uC790\uC6D0\xB7\uB18D\uC9C0\xB7\uC190\uC0C1 \uAC74\uBB3C\uC744 \uB20C\uB7EC \uBA3C\uC800 \uCC98\uB9AC\uD560 \uC77C\uC744 \uC815\uD558\uC138\uC694", sub: "\uC120\uD0DD \uC8FC\uBBFC\uC5D0\uAC8C \uC9C0\uC2DC" },
      { id: "cancel", label: "\uC9C0\uC815 \uCDE8\uC18C", icon: "cancel", hint: "\uCDE8\uC18C\uD560 \uCCAD\uC0AC\uC9C4\xB7\uC791\uC5C5\xB7\uAD6C\uC5ED\uC744 \uC120\uD0DD\uD558\uC138\uC694. \uCCAD\uC0AC\uC9C4 \uC7AC\uB8CC\uB294 \uB3CC\uB824\uBC1B\uC2B5\uB2C8\uB2E4.", sub: "\uCCAD\uC0AC\uC9C4 \xB7 \uAD6C\uC5ED" },
      { id: "demolish", label: "\uAC74\uBB3C \uCCA0\uAC70", icon: "wall", hint: "\uC644\uC131\uB41C \uAC74\uBB3C\uC744 \uCCA0\uAC70\uD569\uB2C8\uB2E4. \uC77C\uBD80 \uC7AC\uB8CC\uB97C \uB3CC\uB824\uBC1B\uC2B5\uB2C8\uB2E4.", sub: "\uC77C\uBD80 \uC7AC\uB8CC \uD68C\uC218" },
      { id: "pan", label: "\uC9C0\uB3C4 \uC774\uB3D9", icon: "focus", hint: "\uB4DC\uB798\uADF8\uD574 \uC9C0\uB3C4\uB97C \uC774\uB3D9\uD558\uC138\uC694", sub: "\uB4DC\uB798\uADF8" }
    ],
    build: Object.entries(BUILDINGS).filter(([id]) => !UTILITY_TYPES.has(id)).map(buildingTool),
    utilities: Object.entries(BUILDINGS).filter(([id]) => UTILITY_TYPES.has(id)).map(buildingTool),
    zones: [
      { id: "zone:farm", label: "\uB18D\uC0AC \uAD6C\uC5ED", icon: "leaf", hint: "\uB4DC\uB798\uADF8\uD574 \uC0AC\uAC01\uD615 \uB18D\uC9C0\uB97C \uC815\uD558\uC138\uC694. \uC190\uC744 \uB5BC\uBA74 \uAD6C\uC5ED\uC744 \uC9C0\uC815\uD569\uB2C8\uB2E4.", sub: "\uC601\uC5ED \uB4DC\uB798\uADF8" },
      { id: "zone:stockpile", label: "\uCC3D\uACE0 \uAD6C\uC5ED", icon: "box", hint: "\uB4DC\uB798\uADF8\uD574 \uC0AC\uAC01\uD615 \uCC3D\uACE0\uB97C \uC815\uD558\uC138\uC694. \uB0C9\uAC01\uD55C \uC2E4\uB0B4\uC5D0\uC11C\uB294 \uC74C\uC2DD\uC744 \uC624\uB798 \uBCF4\uAD00\uD569\uB2C8\uB2E4.", sub: "\uC601\uC5ED \uB4DC\uB798\uADF8" },
      { id: "cancel", label: "\uAD6C\uC5ED \uC9C0\uC6B0\uAE30", icon: "cancel", hint: "\uC9C0\uC6B8 \uAD6C\uC5ED\uC744 \uC120\uD0DD\uD558\uC138\uC694. \uCCAD\uC0AC\uC9C4\uC774\uB098 \uC791\uC5C5 \uC9C0\uC815\uB3C4 \uD568\uAED8 \uCDE8\uC18C\uB429\uB2C8\uB2E4.", sub: "\uC9C0\uC815 \uD574\uC81C" }
    ]
  };
  function toast(message, type = "info", duration = 3300) {
    if (!message) return;
    const node = document.createElement("div");
    node.className = `toast ${type}`;
    node.textContent = message;
    $("#toasts").append(node);
    while ($("#toasts").children.length > 3) $("#toasts").firstElementChild.remove();
    setTimeout(() => {
      node.classList.add("out");
      setTimeout(() => node.remove(), 250);
    }, duration);
  }
  function setContent(node, content) {
    if (node._html === content) return;
    const scroll = node.scrollTop;
    const focused = document.activeElement;
    const scheduleFocus = node.contains?.(focused) && focused?.dataset ? Object.entries(focused.dataset).filter(([key]) => /^(schedule|bill|trade|gear|equip|unequip)/.test(key)) : [];
    node.innerHTML = content;
    node._html = content;
    node.scrollTop = scroll;
    if (scheduleFocus.length) {
      const replacement = [...node.querySelectorAll("button")].find((button) => scheduleFocus.every(([key, value]) => button.dataset[key] === value));
      replacement?.focus({ preventScroll: true });
    }
  }
  function setSpeed(speed) {
    ui.speed = Number(speed);
    if (ui.speed > 0) ui.lastSpeed = ui.speed;
    $$("[data-speed]").forEach((b) => {
      const active = Number(b.dataset.speed) === ui.speed;
      b.classList.toggle("active", active);
      b.setAttribute("aria-pressed", String(active));
    });
    $("#paused-badge").hidden = ui.speed !== 0;
  }
  function setPane(pane, openMobile = false) {
    ui.pane = pane;
    $$("[data-pane]").forEach((b) => {
      b.classList.toggle("active", b.dataset.pane === pane);
      b.setAttribute("aria-selected", String(b.dataset.pane === pane));
    });
    if (openMobile) $("#app").classList.add("show-panel");
    renderSidebar();
  }
  function selectedPawns() {
    return game.state.colonists.filter((p) => !p.dead && ui.selectedIds.includes(p.id));
  }
  function selectPawn(id, focus = false, additive = false) {
    ui.selectedIds = additive ? ui.selectedIds.includes(id) ? ui.selectedIds.filter((p) => p !== id) : [...ui.selectedIds, id] : [id];
    ui.selectedId = ui.selectedIds.includes(id) ? id : ui.selectedIds[0] || null;
    ui.selectedTile = null;
    setPane("inspect");
    const pawn = game.state.colonists.find((p) => p.id === id);
    if (focus && pawn) renderer.focus(pawn.x, pawn.y);
    renderUI();
    updateToolHint();
  }
  function setCategory(category) {
    ui.category = category;
    if (!toolsByCategory[category].some((t) => t.id === ui.tool)) {
      ui.tool = "select";
      canvas.dataset.tool = "select";
      updateToolHint();
    }
    $$("[data-category]").forEach((b) => b.classList.toggle("active", b.dataset.category === category));
    renderTools();
  }
  function setTool(tool) {
    if (tool === "prioritize" && !selectedPawns().length) {
      toast("\uBA3C\uC800 \uC544\uB798 \uCE74\uB4DC\uC5D0\uC11C \uC791\uC5C5\uD560 \uC8FC\uBBFC\uC744 \uC120\uD0DD\uD558\uC138\uC694.", "info");
      return;
    }
    ui.tool = tool;
    canvas.dataset.tool = tool;
    renderTools();
    updateToolHint();
  }
  function getTool2() {
    return Object.values(toolsByCategory).flat().find((t) => t.id === ui.tool) || toolsByCategory.orders[0];
  }
  function updateToolHint() {
    const selected = game?.state.colonists.find((p) => p.id === ui.selectedId && !p.dead);
    const drafted = game ? selectedPawns().filter((p) => p.drafted) : [];
    const tool = getTool2();
    const hint = ui.tool === "select" && drafted.length ? `${drafted.length > 1 ? drafted.length + "\uBA85 \uC120\uD0DD" : drafted[0].name} \xB7 \uB545\uC744 \uB20C\uB7EC \uB300\uD615 \uC774\uB3D9, \uC801\uC744 \uB20C\uB7EC \uC9D1\uC911 \uACF5\uACA9` : tool.hint;
    setContent($("#tool-hint"), `${icon(selected?.drafted && ui.tool === "select" ? "shield" : tool.icon)}<span>${esc(hint)}</span>${ui.tool === "select" && !selected?.drafted ? "<kbd>\uB4DC\uB798\uADF8 \xB7 \uC9C0\uB3C4 \uC774\uB3D9</kbd>" : ""}`);
    $("#active-tool-label").textContent = tool.label + " \uBAA8\uB4DC";
  }
  function renderTools() {
    const allDrafted = game?.state.colonists.filter((p) => !p.dead).every((p) => p.drafted);
    setContent($("#tool-list"), toolsByCategory[ui.category].map((t) => {
      const locked = t.tech && !game?.state.research?.unlocked.includes(t.tech);
      const short = t.cost && Object.entries(t.cost).some(([r, n]) => (game?.state.resources[r] || 0) < n);
      const sub = locked ? `${RESEARCH[t.tech]?.label || t.tech} \uD544\uC694` : t.sub;
      return `<button class="tool ${ui.tool === t.id ? "active" : ""} ${t.id === "demolish" ? "negative" : ""} ${locked ? "locked" : ""} ${short ? "unaffordable" : ""}" data-tool="${t.id}" aria-pressed="${ui.tool === t.id}" title="${esc(t.hint)}${sub ? " / " + esc(sub) : ""}">${icon(locked ? "lock" : t.icon)}<span>${t.id === "draft-all" && allDrafted ? "\uC804\uCCB4 \uD574\uC81C" : esc(t.label)}</span><small>${esc(sub)}</small></button>`;
    }).join(""));
  }
  function execute(type, payload, { silent = false, success = false } = {}) {
    const result = game.command(type, payload);
    if (!result.ok && !silent && performance.now() - ui.errorTime > 600) {
      ui.errorTime = performance.now();
      toast(result.message || "\uC774\uACF3\uC5D0\uB294 \uBA85\uB839\uC744 \uB0B4\uB9B4 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4.", "error");
    } else if (result.ok && success && !silent) toast(result.message || "\uBA85\uB839\uC744 \uC804\uB2EC\uD588\uC2B5\uB2C8\uB2E4.");
    lastUiTime = 0;
    return result;
  }
  function draftAll() {
    const living = game.state.colonists.filter((p) => !p.dead && p.health >= 15);
    if (!living.length) return;
    const value = !living.every((p) => p.drafted);
    living.forEach((p) => execute("draft", { id: p.id, value }, { silent: true }));
    ui.selectedIds = living.map((p) => p.id);
    ui.selectedId = living[0].id;
    setTool("select");
    toast(value ? `${living.length}\uBA85\uC744 \uC9D5\uC9D1\uD558\uACE0 \uC120\uD0DD\uD588\uC2B5\uB2C8\uB2E4. \uB545\uC744 \uB204\uB974\uBA74 \uB300\uD615\uC744 \uAC16\uCDB0 \uD568\uAED8 \uC774\uB3D9\uD569\uB2C8\uB2E4.` : "\uC9D5\uC9D1\uC744 \uD574\uC81C\uD588\uC2B5\uB2C8\uB2E4. \uC8FC\uBBFC\uB4E4\uC774 \uB9E1\uC740 \uC791\uC5C5\uC73C\uB85C \uB3CC\uC544\uAC11\uB2C8\uB2E4.", value ? "info" : "success", 4500);
    renderUI();
  }
  function actorAt(tile) {
    const near = (a) => !a.dead && Math.hypot(a.x - (tile.x + 0.5), a.y - (tile.y + 0.5)) < 0.95;
    return game.state.colonists.find(near) || game.state.raiders.find(near);
  }
  function selectAt(tile, orderOnly = false, additive = false) {
    const target = actorAt(tile);
    const visitor = game.state.trade.visitor;
    if (!target && !orderOnly && visitor && Math.hypot(visitor.x - tile.x - 0.5, visitor.y - tile.y - 0.5) < 0.85) {
      setPane("trade", true);
      return;
    }
    const selected = game.state.colonists.find((p) => p.id === ui.selectedId && !p.dead);
    const drafted = selectedPawns().filter((p) => p.drafted);
    if (target && game.state.colonists.includes(target) && !orderOnly) {
      selectPawn(target.id, false, additive);
    } else if (drafted.length) {
      if (target && game.state.raiders.includes(target)) {
        let count = 0;
        drafted.forEach((p) => {
          if (execute("attack", { id: p.id, targetId: target.id }, { silent: true }).ok) count++;
        });
        if (count) toast(`${count}\uBA85\uC774 \uC120\uD0DD\uD55C \uC801\uC744 \uC9D1\uC911 \uACF5\uACA9\uD569\uB2C8\uB2E4.`);
      } else if (drafted.length > 1) execute("moveGroup", { ids: drafted.map((p) => p.id), x: tile.x, y: tile.y });
      else execute("move", { id: drafted[0].id, x: tile.x, y: tile.y });
    } else if (orderOnly && selected) {
      execute("prioritize", { id: selected.id, ...tile }, { success: true });
    } else if (!orderOnly) {
      ui.selectedId = target?.id || null;
      ui.selectedIds = [];
      ui.selectedTile = tile;
      setPane("inspect");
      updateToolHint();
    }
  }
  function applyTool(tile, silent = false) {
    if (!tile || ui.tool === "pan") return;
    if (ui.tool === "select") {
      selectAt(tile);
      return;
    }
    const [type, kind] = ui.tool.split(":");
    if (type === "build") execute("build", { ...tile, kind }, { silent });
    else if (type === "zone") execute("zone", { ...tile, kind }, { silent });
    else if (type === "gather") execute("designate", { ...tile, kind: "gather" }, { silent });
    else if (type === "prioritize") execute("prioritize", { id: ui.selectedId, ...tile }, { silent, success: true });
    else if (type === "cancel" || type === "demolish") execute(type, tile, { silent });
  }
  function rectangleTiles(from, to) {
    const tiles = [];
    for (let y = Math.min(from.y, to.y); y <= Math.max(from.y, to.y); y++) for (let x = Math.min(from.x, to.x); x <= Math.max(from.x, to.x); x++) tiles.push({ x, y });
    return tiles;
  }
  function setLayer(layer) {
    ui.layer = ui.layer === layer ? "normal" : layer;
    $("#temperature-layer").classList.toggle("active", ui.layer === "temperature");
    $("#power-layer").classList.toggle("active", ui.layer === "power");
    $("#temperature-layer").setAttribute("aria-pressed", String(ui.layer === "temperature"));
    $("#power-layer").setAttribute("aria-pressed", String(ui.layer === "power"));
    const legend = $("#layer-legend");
    legend.hidden = ui.layer === "normal";
    legend.innerHTML = ui.layer === "temperature" ? `${icon("thermometer")}<div><b>\uC628\uB3C4 \xB7 \uC790\uB3D9 \uC9C0\uBD95</b><span class="temperature-spectrum"></span><small>\uB0C9\uC7A5 0\xB0C \xB7 \uCF8C\uC801 21\xB0C \xB7 \uACE0\uC628 38\xB0C</small></div>` : `${icon("power")}<div><b>\uC804\uB825 \uC5F0\uACB0\uB9DD</b><small><i class="legend-dot powered"></i>\uC804\uB825 \uACF5\uAE09 <i class="legend-dot offline"></i>\uACF5\uAE09 \uC5C6\uC74C</small><small>\uC124\uBE44\uB294 \uC804\uB825\uC120\uC5D0\uC11C 3\uCE78 \uC774\uB0B4 \uC5F0\uACB0</small></div>`;
  }
  function paintLine(from, to) {
    const distance = Math.max(Math.abs(to.x - from.x), Math.abs(to.y - from.y));
    for (let i = 1; i <= distance; i++) applyTool({ x: Math.round(from.x + (to.x - from.x) * i / distance), y: Math.round(from.y + (to.y - from.y) * i / distance) }, true);
  }
  function renderResources() {
    const r = game.state.resources;
    setContent($("#resource-list"), ["wood", "steel", "rawfood", "meals", "medicine", "silver"].map((key) => `<div class="resource ${key}" title="${esc(RESOURCE_LABELS[key])}: \uCC3D\uACE0\uC5D0 \uBCF4\uAD00\uB41C \uC218\uB7C9${key === "rawfood" ? " \xB7 \uC870\uB9AC\uD558\uBA74 \uC2DD\uC0AC\uAC00 \uB429\uB2C8\uB2E4." : key === "silver" ? " \xB7 \uAD50\uC5ED \uB300\uAE08\uC740 \uC6B4\uBC18 \uD6C4 \uBC18\uC601\uB429\uB2C8\uB2E4." : ""}">${icon(RES_ICONS[key])}<span><span class="resource-label">${esc(RESOURCE_LABELS[key])}</span><strong class="resource-value ${key === "meals" && r[key] < 5 ? "low" : ""}">${Math.floor(r[key] || 0)}</strong></span></div>`).join(""));
  }
  function renderDock() {
    const dock = $("#colonist-dock");
    if (dock.dataset.ids !== game.state.colonists.map((p) => p.id).join(",")) {
      dock.innerHTML = game.state.colonists.map((p) => `<button class="pawn-card" data-pawn="${esc(p.id)}" title="${esc(p.name)} \uC120\uD0DD \xB7 \uB450 \uBC88 \uD074\uB9AD\uD558\uBA74 \uC704\uCE58\uB85C \uC774\uB3D9"><span class="pawn-avatar" style="--pawn-color:${esc(p.color)}"></span><span class="pawn-info"><span class="pawn-heading"><b>${esc(p.name)}</b><small>${esc(p.role)}</small><span class="draft-tag" hidden>\uC9D5\uC9D1</span></span><span class="pawn-status"></span><span class="mini-needs"><span class="mini-bar health"><i></i></span><span class="mini-bar hunger"><i></i></span><span class="mini-bar energy"><i></i></span></span></span><span class="pawn-health"></span></button>`).join("");
      dock.dataset.ids = game.state.colonists.map((p) => p.id).join(",");
    }
    game.state.colonists.forEach((p, i) => {
      const card = dock.children[i];
      card.classList.toggle("selected", ui.selectedIds.includes(p.id));
      card.classList.toggle("dead", p.dead);
      card.setAttribute("aria-pressed", String(ui.selectedIds.includes(p.id)));
      $(".pawn-status", card).textContent = p.dead ? "\uC0AC\uB9DD" : p.status || "\uC8FC\uBCC0\uC744 \uC0B4\uD53C\uB294 \uC911";
      $(".draft-tag", card).hidden = !p.drafted;
      const hp = $(".pawn-health", card);
      hp.textContent = p.dead ? "\u2014" : `${pct(p.health)}%`;
      hp.classList.toggle("hurt", p.health < 65);
      ["health", "hunger", "energy"].forEach((k) => {
        const bar = $(`.mini-bar.${k}`, card);
        $("i", bar).style.width = pct(p[k]) + "%";
        bar.classList.toggle("low", p[k] < 25);
        bar.title = `${{ health: "\uAC74\uAC15", hunger: "\uD3EC\uB9CC", energy: "\uD734\uC2DD" }[k]} ${pct(p[k])}%`;
      });
    });
  }
  function objectiveHtml(o, index) {
    return `<div class="objective ${o.done ? "done" : ""}"><span class="objective-check">${o.done ? icon("check") : String(index + 1).padStart(2, "0")}</span><div><strong>${esc(o.label)}</strong><p>${esc(o.detail)}</p>${!o.done && o.progress > 0 ? `<div class="progress-track"><i style="width:${pct(o.progress * 100)}%"></i></div>` : ""}</div></div>`;
  }
  function colonyPane() {
    const s = game.getSummary(), state = game.state;
    const objectives = game.getObjectives();
    const complete2 = objectives.filter((o) => o.done).length;
    const food = Math.max(0, Number(s.foodDays) || 0);
    const alert = state.raiders.some((r) => !r.dead);
    const fires = activeFires(), downed = state.colonists.filter((p) => !p.dead && p.health < 15);
    let advice = "<strong>\uAC70\uCC98\uBD80\uD130 \uC644\uC131\uD558\uC138\uC694</strong>\uBCBD\uACFC \uBB38\uC73C\uB85C \uCE68\uB300 \uC8FC\uBCC0\uC744 \uC644\uC804\uD788 \uB458\uB7EC\uC2F8\uBA74 \uC9C0\uBD95\uC774 \uC0DD\uAE41\uB2C8\uB2E4. \uC138 \uBC88\uC9F8 \uCE68\uB300\uB3C4 \uC2E4\uB0B4\uC5D0 \uBC30\uCE58\uD558\uC138\uC694.";
    if (alert) advice = "<strong>\uD568\uAED8 \uC815\uCC29\uC9C0\uB97C \uC9C0\uD0A4\uC138\uC694</strong>\uC804\uCCB4 \uC9D5\uC9D1 \uD6C4 \uBE48 \uB545\uC744 \uB204\uB974\uBA74 \uC138 \uC0AC\uB78C\uC774 \uB300\uD615\uC744 \uAC16\uCDB0 \uC774\uB3D9\uD569\uB2C8\uB2E4. \uC804\uD22C\uAC00 \uB05D\uB098\uBA74 \uC9D5\uC9D1\uC744 \uD574\uC81C\uD558\uC138\uC694.";
    else if (downed.length) advice = "<strong>\uB3D9\uB8CC\uB97C \uC548\uC804\uD55C \uACF3\uC73C\uB85C \uC62E\uAE30\uC138\uC694</strong>\uC758\uB8CC\xB7\uC18C\uBC29 \uD0ED\uC5D0\uC11C \uAD6C\uC870\uB97C \uC9C0\uC2DC\uD558\uACE0, \uCE58\uB8CC \uB2F4\uB2F9\uACFC \uC57D\uD488\uC744 \uC900\uBE44\uD558\uC138\uC694. \uC758\uB8CC \uCE68\uC0C1\uC744 \uBE44\uC6CC \uB450\uBA74 \uD68C\uBCF5\uC744 \uB3C4\uC6B8 \uC218 \uC788\uC2B5\uB2C8\uB2E4.";
    else if (fires.length) advice = "<strong>\uBD88\uAE38\uC744 \uB9C9\uC544 \uC8FC\uC138\uC694</strong>\uC18C\uBC29 \uB2F4\uB2F9\uC758 \uC9D5\uC9D1\uC744 \uD574\uC81C\uD558\uC138\uC694. \uC758\uB8CC\xB7\uC18C\uBC29 \uD0ED\uC5D0\uC11C \uBD88\uC774 \uB09C \uACF3\uC744 \uCC3E\uC544 \uC6B0\uC120 \uC9C4\uD654\uB97C \uC9C0\uC2DC\uD560 \uC218 \uC788\uC2B5\uB2C8\uB2E4.";
    else if (food < 1) advice = "<strong>\uC2DD\uB7C9\uC744 \uBA3C\uC800 \uD655\uBCF4\uD558\uC138\uC694</strong>\uC5F4\uB9E4\uB97C \uCC44\uC9D1\uD558\uACE0 \uB18D\uC9C0\uB97C \uB113\uD788\uC138\uC694. \uB0C9\uAC01\uD55C \uC2E4\uB0B4 \uCC3D\uACE0\uB294 \uC74C\uC2DD \uBD80\uD328\uB97C \uB2A6\uCDA5\uB2C8\uB2E4.";
    else if ((s.indoorBeds || 0) >= 3 && !state.research.unlocked.includes("electricity")) advice = "<strong>\uB2E4\uC74C\uC740 \uC804\uAE30 \uACF5\uD559\uC785\uB2C8\uB2E4</strong>\uC5F0\uAD6C\uB300\uC5D0\uC11C \uC8FC\uBBFC\uC774 \uC2E4\uC81C\uB85C \uC5F0\uAD6C\uD569\uB2C8\uB2E4. \uC791\uC5C5 \uD0ED\uC5D0\uC11C \uC5F0\uAD6C \uC6B0\uC120\uC21C\uC704\uB97C \uB192\uC77C \uC218 \uC788\uC2B5\uB2C8\uB2E4.";
    else if ((s.indoorBeds || 0) >= 3 && !state.research.unlocked.includes("communications")) advice = "<strong>\uBC1C\uC804\uD558\uACE0, \uB2E4\uC74C \uC5F0\uAD6C\uB97C \uACE0\uB974\uC138\uC694</strong>\uD0DC\uC591\uAD11\uACFC \uCD95\uC804\uC9C0\uB97C \uC804\uB825\uC120\uC73C\uB85C \uC787\uACE0 \uB0C9\uC7A5 \uBCF4\uAD00 \uB610\uB294 \uC7A5\uAC70\uB9AC \uD1B5\uC2E0\uC744 \uC5F0\uAD6C\uD558\uC138\uC694.";
    else if (state.research.unlocked.includes("communications")) advice = "<strong>\uAD6C\uC870 \uC2E0\uD638\uB97C \uBCF4\uB0B4\uC138\uC694</strong>\uC2E0\uD638\uAE30\uC5D0 \uC804\uB825\uC744 \uACF5\uAE09\uD558\uC138\uC694. \uC2E0\uD638\uAC00 \uC808\uBC18\uC5D0 \uB3C4\uB2EC\uD558\uBA74 \uB9C8\uC9C0\uB9C9 \uC2B5\uACA9\uC774 \uCC3E\uC544\uC635\uB2C8\uB2E4. \uBC29\uC5B4\uB97C \uB9C8\uCE58\uACE0 \uC804\uC1A1\uC744 \uC644\uB8CC\uD558\uC138\uC694.";
    const power = state.power || {}, charge = power.capacity ? pct(power.stored / power.capacity * 100) : 0;
    return `<div class="eyebrow">A HOME, THEN A HORIZON</div><h2>${state.victory ? "\uC232 \uB108\uBA38\uB85C \uB2FF\uC740 \uC2E0\uD638" : "\uC624\uB298\uC744 \uB118\uC5B4, \uB0B4\uC77C\uB85C"}</h2><p class="section-intro">\uAC70\uCC98\uB97C \uB2EB\uACE0, \uBD88\uC744 \uBC1D\uD788\uACE0,<br>\uC6B0\uB9AC\uC758 \uBAA9\uC18C\uB9AC\uB97C \uBA3C \uACF3\uAE4C\uC9C0 \uBCF4\uB0B4\uC138\uC694.</p>${fires.length || downed.length ? `<button class="crisis-callout" data-action="show-care">${icon(fires.length ? "fire" : "rescue")}<span>${downed.length ? `\uC4F0\uB7EC\uC9C4 \uC8FC\uBBFC ${downed.length}\uBA85` : ``}${downed.length && fires.length ? " \xB7 " : ""}${fires.length ? `\uD654\uC7AC ${fires.length}\uCE78` : ``}</span>${icon("arrow")}</button>` : ""}<div class="colony-pulse"><button data-action="show-systems">${icon("roof")}<span>\uC2E4\uB0B4 \uCE68\uB300 <b>${s.indoorBeds || 0}/3</b></span></button><button data-action="show-systems">${icon("battery")}<span>\uC800\uC7A5 \uC804\uB825 <b>${charge}%</b></span></button></div><div class="signal-block"><div class="signal-icon">${icon("beacon")}</div><div class="signal-copy"><strong>\uAD6C\uC870 \uC2E0\uD638 <b>${pct(state.beaconProgress * 100)}%</b></strong><div class="progress-track"><i style="width:${pct(state.beaconProgress * 100)}%"></i></div><p>${state.victory ? "\uAD6C\uC870\uB300\uAC00 \uC2E0\uD638\uB97C \uD655\uC778\uD588\uC2B5\uB2C8\uB2E4." : fires.length ? "\uD654\uC7AC \uC9C4\uC555\uC744 \uAE30\uB2E4\uB9AC\uBA70 \uC804\uC1A1\uC744 \uBA48\uCDC4\uC2B5\uB2C8\uB2E4." : state.extractionAlarmTriggered ? "\uB9C8\uC9C0\uB9C9 \uBC29\uC5B4\uB97C \uB9C8\uCE58\uACE0 \uC804\uC1A1\uC744 \uC774\uC5B4\uAC00\uC138\uC694." : "\uC548\uC815\uB41C \uC0DD\uD65C\uACFC \uC804\uB825\uC774 \uC2E0\uD638\uB97C \uC9C0\uD0F1\uD569\uB2C8\uB2E4."}</p></div></div><div class="section-divider"></div><div class="section-head"><h3>\uC815\uCC29\uC9C0\uC758 \uBAA9\uD45C</h3><span>${complete2} / ${objectives.length}</span></div><div class="objectives">${objectives.map(objectiveHtml).join("")}</div><div class="section-divider"></div><div class="advice">${advice}</div><div class="button-row"><button class="button ghost" data-action="show-research">${icon("research")}\uC5F0\uAD6C \uBCF4\uAE30</button><button class="button ghost" data-action="show-systems">${icon("power")}\uC124\uBE44 \uBCF4\uAE30</button></div><div class="button-row compact"><button class="button ghost" data-action="show-care">${icon("medicine")}\uC758\uB8CC\xB7\uC18C\uBC29</button><button class="button ghost" data-action="show-schedule">${icon("clock")}\uD558\uB8E8 \uC77C\uC815</button></div><div class="button-row compact"><button class="button ghost" data-action="show-industry">${icon("craft")}\uC81C\uC791\xB7\uC7A5\uBE44</button><button class="button ghost ${state.trade.visitor?.phase === "trading" ? "trader-ready" : ""}" data-action="show-trade">${icon("trade")}${state.trade.visitor?.phase === "trading" ? "\uC0C1\uC778 \uBC29\uBB38 \uC911" : "\uAD50\uC5ED \uBCF4\uAE30"}</button></div><div class="section-divider"></div><div class="section-head"><h3>\uC0DD\uD65C\uACFC \uC8FC\uBCC0 \uC0C1\uD669</h3><span>${esc(WEATHER[state.weather] || state.weather)}</span></div><div class="colony-facts"><div class="fact"><span>\uD604\uC7AC \uC2DD\uB7C9\uC758 \uC601\uC591\uB7C9</span><strong class="${food < 1 ? "danger" : ""}">\uC57D ${food.toFixed(1)}\uC77C\uBD84</strong></div><div class="fact"><span>\uD604\uC7AC \uC704\uD611</span><strong class="${alert || fires.length || downed.length ? "danger" : ""}">${alert ? `\uC2B5\uACA9\uC790 ${state.raiders.filter((r) => !r.dead).length}\uBA85` : downed.length ? `\uC4F0\uB7EC\uC9C4 \uC8FC\uBBFC ${downed.length}\uBA85` : fires.length ? `\uD654\uC7AC ${fires.length}\uCE78` : "\uC8FC\uBCC0\uC740 \uC870\uC6A9\uD569\uB2C8\uB2E4"}</strong></div><div class="fact"><span>\uB2E4\uC74C \uC815\uAE30 \uC2B5\uACA9\uAE4C\uC9C0</span><strong>${alert ? "\uC804\uD22C \uC911" : formatDuration(s.nextRaidIn)}</strong></div><div class="fact"><span>\uBC84\uD168 \uB0B8 \uC2B5\uACA9</span><strong>${state.stats.survivedRaids}\uD68C</strong></div><div class="fact"><span>\uB204\uC801 \uBD80\uD328 \uC2DD\uB7C9</span><strong>${state.systemStats?.spoiled || 0}\uAC1C</strong></div></div><p class="small-note">\uC2DD\uB7C9\uC758 \uC77C\uBD84 \uD45C\uC2DC\uB294 \uC601\uC591\uB7C9 \uAE30\uC900\uC785\uB2C8\uB2E4. \uBCF4\uAD00 \uC628\uB3C4\uC5D0 \uB530\uB978 \uBD80\uD328\uB294 \uBCC4\uB3C4\uB85C \uC9C4\uD589\uB429\uB2C8\uB2E4.</p>`;
  }
  function needHtml(label, value) {
    return `<div class="need ${value < 25 ? "low" : ""}"><div><span>${label}</span><b>${pct(value)} / 100</b></div><div class="progress-track"><i style="width:${pct(value)}%"></i></div></div>`;
  }
  function activeFires() {
    return game.state.tiles.filter((t) => (t.fire || 0) > 0);
  }
  function moodFactorsHtml(pawn) {
    const factors = game.getMoodFactors?.(pawn) || [];
    return factors.length ? `<div class="mood-factors"><span>\uAE30\uBD84\uC5D0 \uC601\uD5A5\uC744 \uC8FC\uB294 \uAC83</span>${factors.filter((f) => Math.abs(f.value) > 0.05).map((f) => `<div><span>${esc(f.label)}</span><b class="${f.value < 0 ? "negative" : "positive"}">${f.value > 0 ? "+" : ""}${Number(f.value).toFixed(1)}</b></div>`).join("")}</div>` : "";
  }
  function careStatus(pawn) {
    if (pawn.carriedBy) {
      const carrier = game.state.colonists.find((p) => p.id === pawn.carriedBy);
      return `${carrier?.name || "\uB3D9\uB8CC"}\uC774(\uAC00) \uC774\uC1A1 \uC911`;
    }
    if (pawn.health < 15) return pawn.patientBedId ? "\uCE68\uC0C1 \uC548\uC815 \xB7 \uCE58\uB8CC \uD544\uC694" : "\uC4F0\uB7EC\uC9D0 \xB7 \uAD6C\uC870 \uD544\uC694";
    if (pawn.bleed > 0) return "\uCD9C\uD608 \uC911 \xB7 \uCE58\uB8CC \uD544\uC694";
    if (pawn.patientBedId) return "\uCE68\uC0C1\uC5D0\uC11C \uD68C\uBCF5 \uC911";
    return pawn.health < 78 ? "\uBD80\uC0C1 \uD68C\uBCF5 \uC911" : "\uAC74\uAC15 \uC548\uC815";
  }
  function requestCare(kind, targetId) {
    const patient = game.state.colonists.find((p) => p.id === targetId && !p.dead);
    if (!patient) return;
    const selected = new Set(ui.selectedIds);
    const candidates = game.state.colonists.filter((p) => !p.dead && !p.drafted && p.health >= 15 && !p.carriedBy && !p.carryingPawnId && (kind !== "rescue" || p.id !== patient.id));
    candidates.sort((a, b) => Number(selected.has(b.id) && b.id !== patient.id) - Number(selected.has(a.id) && a.id !== patient.id) || Math.hypot(a.x - patient.x, a.y - patient.y) - Math.hypot(b.x - patient.x, b.y - patient.y));
    let reason = "\uBA3C\uC800 \uAC74\uAC15\uD55C \uC8FC\uBBFC\uC758 \uC9D5\uC9D1\uC744 \uD574\uC81C\uD558\uC138\uC694.";
    for (const worker of candidates) {
      const result = execute(kind, { id: worker.id, targetId }, { silent: true });
      if (result.ok) {
        toast(result.message || `${worker.name}\uC5D0\uAC8C ${kind === "rescue" ? "\uAD6C\uC870" : "\uCE58\uB8CC"}\uB97C \uC9C0\uC2DC\uD588\uC2B5\uB2C8\uB2E4.`, "success");
        renderUI();
        return;
      }
      reason = result.message || reason;
    }
    toast(reason, "error", 5e3);
  }
  function requestFirefight(x, y) {
    const t = game.tile(x, y);
    if (!t?.fire) {
      toast("\uC774\uACF3\uC758 \uBD88\uC740 \uC774\uBBF8 \uAEBC\uC84C\uC2B5\uB2C8\uB2E4.");
      return;
    }
    const selected = new Set(ui.selectedIds);
    const workers = game.state.colonists.filter((p) => !p.dead && !p.drafted && p.health >= 15 && !p.carriedBy && !p.carryingPawnId).sort((a, b) => Number(selected.has(b.id)) - Number(selected.has(a.id)) || Math.hypot(a.x - x, a.y - y) - Math.hypot(b.x - x, b.y - y));
    let reason = "\uC9C4\uD654\uD560 \uC218 \uC788\uB294 \uC8FC\uBBFC\uC758 \uC9D5\uC9D1\uC744 \uD574\uC81C\uD558\uC138\uC694.";
    for (const worker of workers) {
      const result = execute("prioritize", { id: worker.id, x, y }, { silent: true });
      if (result.ok) {
        toast(result.message || `${worker.name}\uC5D0\uAC8C \uC9C4\uD654\uB97C \uC9C0\uC2DC\uD588\uC2B5\uB2C8\uB2E4.`, "success");
        renderUI();
        return;
      }
      reason = result.message || reason;
    }
    toast(reason, "error", 5e3);
  }
  function carePane() {
    const living = game.state.colonists.filter((p) => !p.dead);
    const patients = living.slice().sort((a, b) => (a.health < 15 ? -200 : 0) - (b.health < 15 ? -200 : 0) + a.health - b.health);
    const downed = patients.filter((p) => p.health < 15), wounded = patients.filter((p) => p.health < 78 || p.bleed > 0);
    const beds = game.state.tiles.filter((t) => t.building?.complete && t.building.type === "bed");
    const medical = beds.filter((t) => t.building.medical), fires = activeFires();
    const stats = game.state.careStats || {}, hazards = game.state.hazards || {};
    return `<div class="eyebrow">NO ONE LEFT BEHIND</div><h2>\uC11C\uB85C\uB97C \uB3CC\uBCF4\uB294 \uC77C</h2><p class="section-intro">\uBD80\uC0C1\uC790\uB97C \uC548\uC804\uD55C \uCE68\uC0C1\uC73C\uB85C \uC62E\uAE30\uACE0,<br>\uCE58\uB8CC\uC640 \uC2DD\uC0AC\uB97C \uC774\uC5B4 \uC8FC\uC138\uC694.</p>
  <div class="care-summary"><div class="${downed.length ? "danger" : ""}">${icon("rescue")}<strong>${downed.length}</strong><span>\uC4F0\uB7EC\uC9C4 \uC8FC\uBBFC</span></div><div>${icon("medicine")}<strong>${medical.length}</strong><span>\uC758\uB8CC \uCE68\uC0C1</span></div><div class="${fires.length ? "danger" : ""}">${icon("fire")}<strong>${fires.length}</strong><span>\uBD88\uC774 \uB09C \uCE78</span></div></div>
  <div class="care-status-line ${downed.length || fires.length ? "urgent" : ""}">${icon(downed.length || fires.length ? "heart" : "check")}<span>${downed.length ? "\uAD6C\uC870\uC640 \uCD9C\uD608 \uCE58\uB8CC\uAC00 \uD544\uC694\uD569\uB2C8\uB2E4." : fires.length ? "\uC18C\uBC29 \uB2F4\uB2F9\uC758 \uC9D5\uC9D1\uC744 \uD574\uC81C\uD574 \uC9C4\uD654\uD558\uC138\uC694." : wounded.length ? "\uB2E4\uCE5C \uC8FC\uBBFC\uC774 \uD68C\uBCF5\uD558\uACE0 \uC788\uC2B5\uB2C8\uB2E4." : "\uBAA8\uB4E0 \uC8FC\uBBFC\uC758 \uAC74\uAC15\uC774 \uC548\uC815\uC801\uC785\uB2C8\uB2E4."}</span></div>
  <div class="patient-list">${patients.map((p) => `<article class="patient-card ${p.health < 15 ? "critical" : ""}"><div class="patient-heading"><button data-focus-pawn="${esc(p.id)}" title="\uC9C0\uB3C4\uC5D0\uC11C ${esc(p.name)} \uC704\uCE58 \uBCF4\uAE30"><span class="pawn-avatar" style="--pawn-color:${esc(p.color)}"></span><span><b>${esc(p.name)}</b><small>${esc(careStatus(p))}</small></span></button><strong>${pct(p.health)}<small>%</small></strong></div><div class="patient-metrics"><span class="${p.bleed > 0 ? "danger" : ""}">\uCD9C\uD608 ${p.bleed > 0 ? `${p.bleed.toFixed(2)}/\uCD08` : "\uC5C6\uC74C"}</span><span class="${p.hunger < 35 ? "danger" : ""}">\uD3EC\uB9CC ${pct(p.hunger)}%</span></div><div class="progress-track"><i style="width:${pct(p.health)}%"></i></div>${p.health < 78 || p.bleed > 0 || p.health < 15 ? `<div class="button-row compact"><button class="button ${p.health < 15 ? "primary" : "ghost"}" data-care="rescue" data-patient="${esc(p.id)}" ${p.health >= 15 || p.carriedBy || p.patientBedId ? "disabled" : ""}>${icon("rescue")}${p.carriedBy ? "\uC774\uC1A1 \uC911" : "\uAD6C\uC870 \uC9C0\uC2DC"}</button><button class="button ghost" data-care="tend" data-patient="${esc(p.id)}" ${p.carriedBy ? "disabled" : ""}>${icon("medicine")}\uCE58\uB8CC \uC9C0\uC2DC</button></div>` : ""}</article>`).join("")}</div>
  <p class="small-note">\uC9C0\uC2DC\uB294 \uC120\uD0DD\uD55C \uC791\uC5C5 \uAC00\uB2A5 \uC8FC\uBBFC\uC744 \uC6B0\uC120 \uC0AC\uC6A9\uD569\uB2C8\uB2E4. \uC5C6\uC73C\uBA74 \uAC00\uAE4C\uC6B4 \uBE44\uC9D5\uC9D1 \uC8FC\uBBFC\uC744 \uCC3E\uC2B5\uB2C8\uB2E4. \uAD6C\uC870\xB7\uCE58\uB8CC\xB7\uAE09\uC2DD\uC5D0\uB294 \uC774\uB3D9\uACFC \uC791\uC5C5 \uC2DC\uAC04\uC774 \uD544\uC694\uD569\uB2C8\uB2E4.</p>
  <div class="section-divider"></div><div class="section-head"><h3>\uCE68\uC0C1 \uC6A9\uB3C4</h3><span>${medical.length} \uC758\uB8CC / ${beds.length} \uC804\uCCB4</span></div><div class="medical-bed-list">${beds.length ? beds.map((t) => {
      const patient = living.find((p) => p.patientBedId === t.building.id && !p.carriedBy);
      const incoming = living.find((p) => p.job?.type === "rescue" && p.job.bedId === t.building.id);
      return `<div class="medical-bed-row"><button data-focus-tile="${t.x},${t.y}">${icon(t.building.medical ? "medicine" : "bed")}<span><b>${t.building.medical ? "\uC758\uB8CC \uCE68\uC0C1" : "\uC77C\uBC18 \uCE68\uB300"} <small>${t.x}, ${t.y}</small></b><small>${patient ? `${esc(patient.name)} \uD68C\uBCF5 \uC911` : incoming ? "\uD658\uC790 \uC774\uC1A1 \uC608\uC815" : t.roofed ? "\uC2E4\uB0B4 \xB7 \uC0AC\uC6A9 \uAC00\uB2A5" : "\uC2E4\uC678 \uCE68\uC0C1"}</small></span></button><button class="bed-mode ${t.building.medical ? "medical" : ""}" data-medical-bed="${t.x},${t.y}" aria-label="\uCE68\uB300 ${t.x}, ${t.y} ${t.building.medical ? "\uC77C\uBC18 \uCE68\uB300\uB85C \uBCC0\uACBD" : "\uC758\uB8CC \uCE68\uC0C1\uC73C\uB85C \uBCC0\uACBD"}">${t.building.medical ? "\uC758\uB8CC" : "\uC77C\uBC18"}</button></div>`;
    }).join("") : '<p class="empty-inline">\uCE68\uB300\uB97C \uAC74\uC124\uD558\uBA74 \uC6A9\uB3C4\uB97C \uC815\uD560 \uC218 \uC788\uC2B5\uB2C8\uB2E4.</p>'}</div>
  <p class="small-note">\uC758\uB8CC \uCE68\uC0C1\uC740 \uBD80\uC0C1\uC790\uB97C \uC704\uD574 \uBE44\uC6CC \uB461\uB2C8\uB2E4. \uAC74\uAC15\uD55C \uC8FC\uBBFC\uC774 \uC798 \uC77C\uBC18 \uCE68\uB300\uB3C4 \uC900\uBE44\uD558\uC138\uC694. \uCE58\uB8CC \uB2F4\uB2F9\uC740 \uB3C4\uC6C0\uC774 \uD544\uC694\uD55C \uD658\uC790\uC5D0\uAC8C \uC2DD\uC0AC\uB97C \uAC00\uC838\uAC11\uB2C8\uB2E4.</p>
  <div class="section-divider"></div><div class="section-head"><h3>\uC18C\uBC29 \uC0C1\uD669</h3><span>\uC9C4\uD654 ${hazards.extinguished || 0}\uD68C</span></div>${fires.length ? `<div class="fire-list">${fires.slice().sort((a, b) => Number(!!b.building) - Number(!!a.building) || b.fire - a.fire).slice(0, 8).map((t) => `<div class="fire-row"><button data-focus-tile="${t.x},${t.y}">${icon("fire")}<span><b>${esc(t.building ? BUILDINGS[t.building.type]?.label : t.feature ? FEATURE[t.feature] : t.crop ? "\uB18D\uC791\uBB3C" : "\uBD88\uAE38")}</b><small>${t.x}, ${t.y} \xB7 \uAC15\uB3C4 ${pct(t.fire * 100)}%</small></span></button><button class="button ghost" data-extinguish="${t.x},${t.y}">\uC9C4\uD654 \uC9C0\uC2DC</button></div>`).join("")}</div>${fires.length > 8 ? `<p class="small-note">\uC678 ${fires.length - 8}\uCE78\uC5D0\uC11C \uBD88\uC774 \uD0C0\uACE0 \uC788\uC2B5\uB2C8\uB2E4.</p>` : ""}` : '<p class="empty-inline">\uBD88\uC774 \uB09C \uACF3\uC774 \uC5C6\uC2B5\uB2C8\uB2E4. \uC18C\uBC29 \uC791\uC5C5\uC744 \uCF1C \uB450\uBA74 \uD654\uC7AC \uB54C \uC8FC\uBBFC\uC774 \uB300\uC751\uD569\uB2C8\uB2E4.</p>'}
  <div class="button-row compact"><button class="button ghost" data-action="enable-emergency">${icon("check")}\uC18C\uBC29\xB7\uAD6C\uC870 \uC791\uC5C5 \uCF1C\uAE30</button><button class="button ghost" data-action="show-work">\uBD84\uC5C5 \uC124\uC815</button></div>
  <div class="care-record">\uAD6C\uC870 ${stats.rescued || 0}\uD68C \xB7 \uCE58\uB8CC ${stats.tended || 0}\uD68C \xB7 \uD658\uC790 \uAE09\uC2DD ${stats.fed || 0}\uD68C</div>`;
  }
  function schedulePane() {
    const pawns = game.state.colonists.filter((p) => !p.dead);
    const pawn = pawns.find((p) => p.id === ui.schedulePawnId) || pawns.find((p) => p.id === ui.selectedId) || pawns[0];
    if (!pawn) return '<div class="eyebrow">A RHYTHM OF OUR OWN</div><h2>\uD558\uB8E8\uC758 \uB9AC\uB4EC</h2><p class="empty-inline">\uC77C\uC815\uC744 \uC815\uD560 \uC0DD\uC874 \uC8FC\uBBFC\uC774 \uC5C6\uC2B5\uB2C8\uB2E4.</p>';
    const hour = Math.floor(game.getSummary().hour) % 24;
    const schedule = pawn.schedule || Array(24).fill("anything");
    const mode = schedule[hour], counts = Object.keys(SCHEDULE_MODES).map((k) => ({ mode: k, count: schedule.filter((m) => m === k).length }));
    return `<div class="eyebrow">A RHYTHM OF OUR OWN</div><h2>\uD558\uB8E8\uC758 \uB9AC\uB4EC</h2><p class="section-intro">\uC77C\uD560 \uB54C\uC640 \uC274 \uB54C\uB97C \uC815\uD558\uC138\uC694.<br>\uD65C\uB3D9\uC744 \uACE0\uB978 \uB4A4 \uC2DC\uAC04\uCE78\uC744 \uB204\uB974\uBA74 \uBC14\uB01D\uB2C8\uB2E4.</p>
  <div class="schedule-pawns" role="group" aria-label="\uC77C\uC815\uC744 \uD3B8\uC9D1\uD560 \uC8FC\uBBFC">${pawns.map((p) => `<button class="${p.id === pawn.id ? "active" : ""}" data-schedule-pawn="${esc(p.id)}" aria-pressed="${p.id === pawn.id}"><span style="background:${esc(p.color)}"></span>${esc(p.name)}</button>`).join("")}</div>
  <div class="schedule-now"><span>${icon(SCHEDULE_ICONS[mode])}<b>\uC9C0\uAE08 ${String(hour).padStart(2, "0")}\uC2DC \xB7 ${esc(SCHEDULE_LABELS[mode])}</b></span><small>${esc(pawn.status)}</small></div>
  <div class="schedule-brushes" role="group" aria-label="\uC77C\uC815 \uD65C\uB3D9 \uC120\uD0DD">${Object.keys(SCHEDULE_MODES).map((k) => `<button class="schedule-brush mode-${k} ${ui.scheduleBrush === k ? "active" : ""}" data-schedule-brush="${k}" aria-pressed="${ui.scheduleBrush === k}">${icon(SCHEDULE_ICONS[k])}<span>${SCHEDULE_LABELS[k]}</span></button>`).join("")}</div>
  <div class="schedule-grid" role="group" aria-label="${esc(pawn.name)}\uC758 24\uC2DC\uAC04 \uC77C\uC815">${schedule.map((m, h) => `<button class="schedule-hour mode-${m} ${h === hour ? "current" : ""}" data-schedule-hour="${h}" data-schedule-id="${esc(pawn.id)}" title="${h}\uC2DC ${SCHEDULE_LABELS[m]} \u2192 ${SCHEDULE_LABELS[ui.scheduleBrush]}" aria-label="${h}\uC2DC ${SCHEDULE_LABELS[m]}, \uB204\uB974\uBA74 ${SCHEDULE_LABELS[ui.scheduleBrush]}\uB85C \uBCC0\uACBD"><b>${String(h).padStart(2, "0")}</b><span>${SCHEDULE_LABELS[m]}</span></button>`).join("")}</div>
  <div class="schedule-totals">${counts.filter((c) => c.count).map((c) => `<span class="mode-${c.mode}"><i></i>${SCHEDULE_LABELS[c.mode]} ${c.count}h</span>`).join("")}</div>
  <div class="schedule-presets">${Object.keys(SCHEDULE_PRESETS).map((k) => `<button class="button ghost" data-schedule-preset="${k}" data-schedule-id="${esc(pawn.id)}">${esc(PRESET_LABELS[k] || k)}</button>`).join("")}</div>
  <p class="small-note">\uAE34\uAE09\uD55C \uC0DD\uC874\xB7\uAD6C\uC870\xB7\uC18C\uBC29\xB7\uC804\uD22C\uAC00 \uC77C\uC815\uBCF4\uB2E4 \uC6B0\uC120\uD569\uB2C8\uB2E4. \uC790\uC728 \uC2DC\uAC04\uC5D0\uB294 \uD544\uC694\uC640 \uC791\uC5C5 \uC6B0\uC120\uC21C\uC704\uC5D0 \uB530\uB77C \uD589\uB3D9\uD569\uB2C8\uB2E4. \uC77C\uC815\uC740 \uB2E4\uC74C \uB0A0\uC5D0\uB3C4 \uBC18\uBCF5\uB429\uB2C8\uB2E4.</p>
  <div class="section-divider"></div><div class="section-head"><h3>\uC274 \uACF3\uB3C4 \uD544\uC694\uD569\uB2C8\uB2E4</h3>${icon("recreation")}</div>${needHtml("\uC5EC\uAC00 \uCDA9\uC871", pawn.recreation ?? 70)}<p class="section-intro">\uACE0\uB9AC \uB358\uC9C0\uAE30 \uC2DC\uC124\uC5D0\uC11C \uC2DC\uAC04\uC744 \uBCF4\uB0B4\uBA74 \uC5EC\uAC00\uB97C \uB354 \uBE68\uB9AC \uCC44\uC6B8 \uC218 \uC788\uC2B5\uB2C8\uB2E4. \uC5EC\uAC00\uAC00 \uBD80\uC871\uD558\uBA74 \uAE30\uBD84\uC774 \uB5A8\uC5B4\uC9D1\uB2C8\uB2E4.</p><div class="button-row"><button class="button ghost" data-action="build-horseshoes">${icon("recreation")}\uC5EC\uAC00 \uC2DC\uC124 \uAC74\uC124</button><button class="button ghost" data-action="show-work">\uC791\uC5C5 \uC6B0\uC120\uC21C\uC704</button></div>${moodFactorsHtml(pawn)}`;
  }
  function inspectPane() {
    const group = selectedPawns();
    if (group.length > 1) {
      const standing = group.filter((p) => p.health >= 15 && !p.carriedBy);
      return `<div class="eyebrow">STAND TOGETHER</div><h2>${group.length}\uBA85 \uC120\uD0DD</h2><p class="section-intro">\uD568\uAED8 \uC774\uB3D9\uD558\uACE0, \uAC19\uC740 \uC801\uC744 \uACF5\uACA9\uD569\uB2C8\uB2E4.<br>\uC8FC\uBBFC \uC774\uB984\uC744 \uB204\uB974\uBA74 \uD55C \uBA85\uB9CC \uC120\uD0DD\uD569\uB2C8\uB2E4.</p>
    <div class="group-list">${group.map((p) => `<button class="group-pawn" data-pawn="${esc(p.id)}"><span class="pawn-avatar" style="--pawn-color:${esc(p.color)}"></span><span><b>${esc(p.name)}</b><small>${esc(p.status)}</small></span><em class="${p.health < 15 ? "danger" : ""}">${pct(p.health)}%</em></button>`).join("")}</div>
    <div class="button-row"><button class="button primary" data-action="draft-selected" ${!standing.length ? "disabled" : ""}>${icon("shield")}${standing.length && standing.every((p) => p.drafted) ? "\uC120\uD0DD \uC8FC\uBBFC \uD574\uC81C" : "\uC120\uD0DD \uC8FC\uBBFC \uC9D5\uC9D1"}</button><button class="button ghost" data-action="focus-selected">${icon("focus")}\uC704\uCE58</button></div>
    <div class="button-row compact"><button class="button ghost" data-action="hold-selected" ${standing.some((p) => p.drafted) ? "" : "disabled"}>${icon("hold")}\uD604\uC7AC \uC704\uCE58 \uC0AC\uC218</button><button class="button ghost" data-action="show-care">${icon("medicine")}\uC758\uB8CC\xB7\uC18C\uBC29</button></div>
    <button class="button ghost wide margin-top" data-action="close-panel">\uC9C0\uB3C4\uC5D0\uC11C \uBA85\uB839\uD558\uAE30</button><div class="section-divider"></div><div class="advice"><strong>\uC9C0\uD718 \uBC29\uBC95</strong>\uC9D5\uC9D1\uD55C \uC0C1\uD0DC\uC5D0\uC11C \uB545\uC744 \uB204\uB974\uBA74 \uC11C\uB85C \uB2E4\uB978 \uCE78\uC73C\uB85C \uC774\uB3D9\uD569\uB2C8\uB2E4. \uC801\uC744 \uB204\uB974\uBA74 \uC9D1\uC911 \uC0AC\uACA9\uD569\uB2C8\uB2E4. \uBC29\uBCBD\uC744 \uC801\uACFC \uC8FC\uBBFC \uC0AC\uC774\uC5D0 \uB450\uBA74 \uC5C4\uD3D0 \uD6A8\uACFC\uB97C \uBC1B\uC2B5\uB2C8\uB2E4.</div>`;
    }
    const pawn = game.state.colonists.find((p) => p.id === ui.selectedId);
    if (pawn) {
      const downed = !pawn.dead && pawn.health < 15;
      return `<div class="eyebrow">SURVIVOR DOSSIER</div><div class="inspect-avatar"><span class="pawn-avatar" style="--pawn-color:${esc(pawn.color)}"></span><div><h2>${esc(pawn.name)}</h2><small>${esc(pawn.role)}</small></div></div>
    <span class="status-pill ${pawn.dead || downed || pawn.drafted ? "danger" : ""}">${esc(pawn.dead ? "\uC0AC\uB9DD" : pawn.status)}</span>
    ${pawn.carriedBy ? `<p class="care-status-line urgent">${icon("rescue")}${esc(careStatus(pawn))}</p>` : ""}
    <div class="pawn-environment">${icon(pawn.sheltered ? "roof" : "sun")}<span>${pawn.sheltered ? "\uC2E4\uB0B4" : "\uC2E4\uC678"} \xB7 ${Math.round(pawn.ambientTemperature ?? game.getSummary().temperature)}\xB0C</span>${pawn.thermalStress > 20 ? "<b>\uC628\uB3C4 \uC2A4\uD2B8\uB808\uC2A4</b>" : ""}</div>
    ${["health", "hunger", "energy", "mood", "recreation"].map((k) => needHtml({ health: "\uAC74\uAC15", hunger: "\uD3EC\uB9CC\uAC10", energy: "\uD734\uC2DD", mood: "\uAE30\uBD84", recreation: "\uC5EC\uAC00" }[k], pawn[k] ?? 70)).join("")}
    ${pawn.bleed > 0 ? `<p class="file-error">\uCD9C\uD608 ${pawn.bleed.toFixed(2)}/\uCD08 \xB7 \uCE58\uB8CC \uB2F4\uB2F9\uC758 \uC9D5\uC9D1\uC744 \uD574\uC81C\uD558\uC138\uC694.</p>` : ""}
    ${downed ? `<div class="button-row"><button class="button primary" data-care="rescue" data-patient="${esc(pawn.id)}" ${pawn.carriedBy || pawn.patientBedId ? "disabled" : ""}>${icon("rescue")}\uCE68\uC0C1\uC73C\uB85C \uAD6C\uC870</button><button class="button ghost" data-care="tend" data-patient="${esc(pawn.id)}" ${pawn.carriedBy ? "disabled" : ""}>\uCE58\uB8CC \uC9C0\uC2DC</button></div>` : ""}
    <div class="button-row"><button class="button ${pawn.drafted ? "primary" : ""}" data-action="draft-selected" ${pawn.dead || downed || pawn.carriedBy ? "disabled" : ""}>${icon("shield")}${pawn.drafted ? "\uC9D5\uC9D1 \uD574\uC81C" : "\uC9D5\uC9D1\uD558\uAE30"}</button><button class="button ghost" data-action="focus-selected">${icon("focus")}\uC704\uCE58 \uBCF4\uAE30</button></div>
    <div class="button-row compact"><button class="button ghost" data-action="show-schedule" ${pawn.dead ? "disabled" : ""}>${icon("clock")}\uD558\uB8E8 \uC77C\uC815</button><button class="button ghost" data-action="show-care">${icon("medicine")}\uC758\uB8CC\xB7\uC18C\uBC29</button></div>
    <div class="button-row compact"><button class="button ghost" data-action="select-all">\uC804\uC6D0 \uC120\uD0DD</button><button class="button ghost" data-action="prioritize-tool" ${pawn.dead || downed || pawn.drafted ? "disabled" : ""}>\uC6B0\uC120 \uC791\uC5C5 \uC9C0\uC2DC</button></div>
    ${pawn.drafted ? `<div class="draft-controls"><p>\uB545\uC744 \uB204\uB974\uBA74 \uC774\uB3D9, \uC801\uC744 \uB204\uB974\uBA74 \uACF5\uACA9\uD569\uB2C8\uB2E4. \uAC00\uAE4C\uC6B4 \uC801\uC740 \uC790\uB3D9 \uC0AC\uACA9\uD569\uB2C8\uB2E4. \uBC29\uBCBD\uC740 \uC801\uC774 \uC788\uB294 \uBC29\uD5A5\uC5D0 \uC788\uC5B4\uC57C \uBCF4\uD638\uD569\uB2C8\uB2E4.</p><div class="button-row"><button class="button ghost" data-action="hold-selected">${icon("hold")}\uC704\uCE58 \uC0AC\uC218</button><button class="button ghost" data-action="close-panel">\uC9C0\uB3C4\uC5D0\uC11C \uBA85\uB839</button></div></div>` : ""}
    ${equipmentHtml(pawn)}${!pawn.dead ? moodFactorsHtml(pawn) : ""}<div class="section-divider"></div><div class="section-head"><h3>\uC791\uC5C5 \uB2A5\uB825</h3><span>\uB192\uC744\uC218\uB85D \uB2A5\uC219\uD569\uB2C8\uB2E4</span></div><div class="skill-list">${Object.entries(pawn.skills).map(([k, n]) => `<div class="skill"><span>${esc(JOB_LABELS[k] || { shoot: "\uC0AC\uACA9" }[k] || k)}</span><strong>${n}</strong></div>`).join("")}</div>`;
    }
    const raider = game.state.raiders.find((r) => r.id === ui.selectedId);
    if (raider) return `<div class="eyebrow">HOSTILE CONTACT</div><h2>\uCE68\uC785\uC790</h2><p class="section-intro">\uC815\uCC29\uC9C0\uB85C \uC811\uADFC\uD558\uB294 \uC801\uC785\uB2C8\uB2E4.</p>${needHtml("\uAC74\uAC15", raider.health / (raider.maxHp || 100) * 100)}<div class="advice"><strong>\uBC29\uC5B4 \uBA85\uB839</strong>\uC8FC\uBBFC\uC744 \uC9D5\uC9D1\uD558\uACE0 \uC774 \uC801\uC744 \uB20C\uB7EC \uACF5\uACA9\uD558\uC138\uC694. \uC801\uACFC \uC8FC\uBBFC \uC0AC\uC774\uC5D0 \uBC29\uBCBD\uC774\uB098 \uBCBD\uC744 \uB450\uBA74 \uC5C4\uD3D0 \uD6A8\uACFC\uB97C \uBC1B\uC2B5\uB2C8\uB2E4.</div><button class="button danger wide margin-top" data-action="draft-all">${icon("shield")}\uC804\uC6D0 \uC9D5\uC9D1</button>`;
    const t = ui.selectedTile && game.tile(ui.selectedTile.x, ui.selectedTile.y);
    if (t) {
      const b = t.building;
      const title = b ? BUILDINGS[b.type]?.label : t.feature ? FEATURE[t.feature] : t.zone === "farm" ? "\uB18D\uC0AC \uAD6C\uC5ED" : t.zone === "stockpile" ? "\uCC3D\uACE0 \uAD6C\uC5ED" : TERRAIN[t.terrain];
      return `<div class="eyebrow">SITE INSPECTION \xB7 ${t.x}, ${t.y}</div><div class="tile-preview">${icon(t.fire ? "fire" : b ? BUILD_ICONS[b.type] : t.feature === "ore" ? "steel" : t.feature === "tree" ? "wood" : t.zone === "stockpile" ? "box" : "leaf")}</div><h2>${esc(title)}</h2>
    ${t.fire ? `<div class="fire-inspection">${icon("fire")}<span>\uBD88\uC774 \uD0C0\uACE0 \uC788\uC2B5\uB2C8\uB2E4 \xB7 ${pct(t.fire * 100)}%</span><button data-extinguish="${t.x},${t.y}">\uC9C4\uD654 \uC9C0\uC2DC</button></div>` : ""}
    <div class="inspect-stat"><span>\uC9C0\uD615</span><strong>${esc(TERRAIN[t.terrain])}${t.burned ? " \xB7 \uD0C4 \uD754\uC801" : ""}</strong></div><div class="inspect-stat"><span>\uAC70\uCC98 \xB7 \uC628\uB3C4</span><strong>${t.roofed ? "\uC9C0\uBD95 \uC788\uC74C" : "\uC2E4\uC678"} \xB7 ${Math.round(t.temperature ?? game.getSummary().temperature)}\xB0C</strong></div>
    ${b?.complete && ["solar", "battery", "conduit", "cooler", "heater", "beacon"].includes(b.type) ? `<div class="inspect-stat"><span>\uC804\uB825 \uC5F0\uACB0</span><strong>${b.networkId != null ? "\uC5F0\uACB0\uB428" : "\uC5F0\uACB0 \uC5C6\uC74C"}${["cooler", "heater", "beacon"].includes(b.type) ? b.powered ? " \xB7 \uAC00\uB3D9 \uC911" : " \xB7 \uC804\uC6D0 \uC5C6\uC74C" : ""}</strong></div>${b.type === "battery" ? `<div class="inspect-stat"><span>\uCDA9\uC804\uB7C9</span><strong>${pct((b.charge || 0) / 18e3 * 100)}%</strong></div>` : ""}` : ""}
    ${t.feature ? `<div class="inspect-stat"><span>\uCC44\uC9D1 \uAC00\uB2A5\uB7C9</span><strong>${Math.floor(t.amount)}</strong></div>` : ""}
    ${b ? `<div class="inspect-stat"><span>\uC0C1\uD0DC</span><strong>${b.complete ? "\uC644\uACF5" : `\uAC74\uC124 \uC911 ${pct(b.progress * 100)}%`}</strong></div><div class="inspect-stat"><span>\uB0B4\uAD6C\uB3C4</span><strong>${Math.ceil(b.hp)} / ${b.maxHp}</strong></div>` : ""}
    ${b?.complete && b.type === "bed" ? `<div class="setting-row"><span>\uC758\uB8CC \uC804\uC6A9 \uCE68\uC0C1</span><button class="toggle ${b.medical ? "on" : ""}" data-medical-bed="${t.x},${t.y}" role="switch" aria-checked="${!!b.medical}" aria-label="\uC758\uB8CC \uCE68\uC0C1 \uC804\uD658"></button></div><p class="small-note">\uC758\uB8CC \uCE68\uC0C1\uC740 \uAD6C\uC870\uB41C \uD658\uC790\uC640 \uBD80\uC0C1\uC790\uB97C \uC704\uD574 \uBE44\uC6CC \uB461\uB2C8\uB2E4. \uAC74\uAC15\uD55C \uC8FC\uBBFC\uC740 \uC77C\uBC18 \uCE68\uB300\uB97C \uC0AC\uC6A9\uD569\uB2C8\uB2E4.</p>` : ""}
    ${b?.complete && b.type === "workbench" ? `<p class="small-note">\uC81C\uC791 \uB2F4\uB2F9\uC774 \uCC3D\uACE0\uC758 \uC7AC\uB8CC\uB97C \uAC00\uC838\uC640 \uC7A5\uBE44\uB97C \uB9CC\uB4ED\uB2C8\uB2E4. \uC644\uC131\uD488\uC740 \uC6B4\uBC18 \uD6C4 \uC9C0\uAE09\uD560 \uC218 \uC788\uC2B5\uB2C8\uB2E4.</p><button class="button primary wide" data-action="show-industry">${icon("craft")}\uC0DD\uC0B0 \uC8FC\uBB38 \uAD00\uB9AC</button>` : ""}
    ${b?.complete && b.type === "horseshoes" ? '<p class="small-note">\uC8FC\uBBFC\uC774 \uC5EC\uAC00 \uC2DC\uAC04\uC5D0 \uC774\uC6A9\uD569\uB2C8\uB2E4. \uC774\uB3D9\uD574 \uC2E4\uC81C\uB85C \uC2DC\uAC04\uC744 \uBCF4\uB0B4\uC57C \uC5EC\uAC00\uAC00 \uCDA9\uC871\uB429\uB2C8\uB2E4.</p>' : ""}
    ${t.zone ? `<div class="inspect-stat"><span>\uC9C0\uC815 \uAD6C\uC5ED</span><strong>${t.zone === "farm" ? "\uB18D\uC0AC" : "\uCC3D\uACE0"}</strong></div>` : ""}${t.crop ? `<div class="inspect-stat"><span>\uC791\uBB3C \uC131\uC7A5</span><strong>${pct(t.crop.growth * 100)}%</strong></div>` : ""}${t.designation ? '<div class="inspect-stat"><span>\uC791\uC5C5</span><strong>\uCC44\uC9D1 \uC791\uC5C5 \uB300\uAE30</strong></div>' : ""}
    <div class="button-row">${t.feature ? '<button class="button" data-action="gather-selected">\uCC44\uC9D1 \uC9C0\uC815</button>' : ""}${b?.complete ? '<button class="button danger" data-action="demolish-selected">\uAC74\uBB3C \uCCA0\uAC70</button>' : b || t.zone || t.designation ? '<button class="button ghost" data-action="cancel-selected">\uC9C0\uC815 \uCDE8\uC18C</button>' : ""}</div>`;
    }
    return `<div class="eyebrow">A CLOSER LOOK</div><h2>\uC120\uD0DD\uD55C \uB300\uC0C1</h2><div class="empty-state">${icon("select")}\uC9C0\uB3C4\uC5D0\uC11C \uC8FC\uBBFC, \uAC74\uBB3C, \uC9C0\uD615\uC744<br>\uC120\uD0DD\uD558\uBA74 \uC790\uC138\uD788 \uC0B4\uD3B4\uBCFC \uC218 \uC788\uC2B5\uB2C8\uB2E4.</div><button class="button wide" data-action="select-all">${icon("users")}\uC815\uCC29\uBBFC \uC804\uC6D0 \uC120\uD0DD</button><div class="section-divider"></div><div class="advice"><strong>\uC8FC\uBBFC\uC744 \uC120\uD0DD\uD574 \uBCF4\uC138\uC694</strong>Shift+\uD074\uB9AD\uC73C\uB85C \uC5EC\uB7EC \uBA85\uC744 \uACE0\uB97C \uC218 \uC788\uC2B5\uB2C8\uB2E4. \uC120\uD0DD\uD55C \uC8FC\uBBFC\uC5D0\uAC8C \uC9D5\uC9D1\uC774\uB098 \uC6B0\uC120 \uC791\uC5C5\uC744 \uC9C0\uC2DC\uD558\uC138\uC694.</div>`;
  }
  function researchPane() {
    const research = game.state.research;
    const benches = game.state.tiles.filter((t) => t.building?.complete && t.building.type === "researchbench").length;
    const workers = game.state.colonists.filter((p) => !p.dead && p.job?.type === "research");
    return `<div class="eyebrow">KNOWLEDGE BECOMES A HOME</div><h2>\uB0B4\uC77C\uC744 \uC704\uD55C \uC5F0\uAD6C</h2><p class="section-intro">\uC8FC\uBBFC\uC774 \uC5F0\uAD6C\uB300\uC5D0\uC11C \uC2DC\uAC04\uC744 \uB4E4\uC5EC<br>\uC0C8\uB85C\uC6B4 \uC124\uBE44\uC640 \uAD6C\uC870 \uBC29\uBC95\uC744 \uC54C\uC544\uB0C5\uB2C8\uB2E4.</p><div class="research-status">${icon("research")}<div><strong>${research.active ? esc(RESEARCH[research.active]?.label) : "\uB2E4\uC74C \uC5F0\uAD6C\uB97C \uC120\uD0DD\uD558\uC138\uC694"}</strong><small>${!benches ? "\uBA3C\uC800 \uC5F0\uAD6C\uB300\uB97C \uAC74\uC124\uD558\uC138\uC694." : workers.length ? `${workers.map((p) => p.name).map(esc).join(", ")} \xB7 \uC5F0\uAD6C \uC791\uC5C5 \uC911` : "\uC5F0\uAD6C \uC791\uC5C5 \uB300\uAE30 \xB7 \uC791\uC5C5 \uC6B0\uC120\uC21C\uC704\uB97C \uD655\uC778\uD558\uC138\uC694."}</small></div></div><div class="research-list">${Object.entries(RESEARCH).map(([id, t]) => {
      const done = research.unlocked.includes(id), active = research.active === id, missing = (t.requires || []).filter((p) => !research.unlocked.includes(p)), progress = Math.min(t.points, research.progress[id] || 0);
      return `<button class="research-card ${done ? "done" : ""} ${active ? "active" : ""} ${missing.length ? "locked" : ""}" data-research="${id}" ${done ? "disabled" : ""}><div class="research-card-head">${icon(done ? "check" : id === "electricity" ? "power" : id === "refrigeration" ? "snow" : "beacon")}<strong>${esc(t.label)}</strong><span>${done ? "\uC644\uB8CC" : active ? "\uC5F0\uAD6C \uC911" : missing.length ? "\uC120\uD589 \uC5F0\uAD6C" : "\uC120\uD0DD \uAC00\uB2A5"}</span></div><p>${esc(t.description || "")}</p><div class="unlock-list">${(t.unlocks || []).map((b) => `<span>${esc(BUILDINGS[b]?.label || b)}</span>`).join("")}</div><div class="progress-track"><i style="width:${pct(progress / t.points * 100)}%"></i></div><div class="research-card-bottom"><span>${missing.length ? `${missing.map((p) => RESEARCH[p]?.label).map(esc).join(" \xB7 ")} \uD544\uC694` : done ? "\uC0C8\uB85C\uC6B4 \uC124\uBE44\uB97C \uC0AC\uC6A9\uD560 \uC218 \uC788\uC2B5\uB2C8\uB2E4." : active ? "\uB2E4\uB978 \uC5F0\uAD6C\uB85C \uBC14\uAFD4\uB3C4 \uC9C4\uD589\uB3C4\uB294 \uC720\uC9C0\uB429\uB2C8\uB2E4." : "\uB20C\uB7EC\uC11C \uC5F0\uAD6C \uC2DC\uC791"}</span><b>${Math.floor(progress)} / ${t.points}</b></div></button>`;
    }).join("")}</div><div class="advice"><strong>\uC5F0\uAD6C\uC5D0\uB3C4 \uC0AC\uB78C\uC774 \uD544\uC694\uD569\uB2C8\uB2E4</strong>\uC5F0\uAD6C \uC6B0\uC120\uC21C\uC704\uB97C \uB192\uC774\uBA74 \uB2E4\uB978 \uC791\uC5C5\uBCF4\uB2E4 \uBA3C\uC800 \uC5F0\uAD6C\uD569\uB2C8\uB2E4. \uD5C8\uAE30\xB7\uD53C\uB85C\xB7\uC804\uD22C\uB294 \uC5F0\uAD6C\uB97C \uBA48\uCD94\uAC8C \uD560 \uC218 \uC788\uC2B5\uB2C8\uB2E4.</div><div class="button-row"><button class="button ghost" data-action="show-work">\uC791\uC5C5 \uBC30\uBD84</button><button class="button ghost" data-action="build-researchbench">\uC5F0\uAD6C\uB300 \uAC74\uC124</button></div>`;
  }
  function foodFreshness(type) {
    const batches = game.state.foodBatches?.[type] || [];
    const count = batches.reduce((n, b) => n + b.count, 0);
    return { count, freshness: count ? batches.reduce((n, b) => n + b.count * b.freshness, 0) / count : 1, nearSpoil: batches.filter((b) => b.freshness < 0.25).reduce((n, b) => n + b.count, 0) };
  }
  function systemsPane() {
    const s = game.state, p = s.power || {}, summary = game.getSummary();
    const percent = p.capacity ? pct(p.stored / p.capacity * 100) : 0;
    const consumers = s.tiles.filter((t) => t.building?.complete && ["cooler", "heater", "beacon"].includes(t.building.type));
    const offline = consumers.filter((t) => !t.building.powered);
    const raw = foodFreshness("rawfood"), meals = foodFreshness("meals");
    return `<div class="eyebrow">THE SYSTEMS THAT SUSTAIN US</div><h2>\uAC70\uCC98\uB97C \uC720\uC9C0\uD558\uB294 \uD798</h2><p class="section-intro">\uC804\uB825\uC740 \uBD88\uBE5B\uACFC \uB0C9\uAE30\uB97C \uC720\uC9C0\uD558\uACE0,<br>\uB2EB\uD78C \uBCBD\uC740 \uADF8 \uC628\uB3C4\uB97C \uC9C0\uCF1C \uC90D\uB2C8\uB2E4.</p><div class="power-summary"><div>${icon("solar")}<strong>${Math.round(p.generation || 0)}<small> W</small></strong><span>\uBC1C\uC804\uB7C9</span></div><div>${icon("power")}<strong>${Math.round(p.demand || 0)}<small> W</small></strong><span>\uD544\uC694 \uC804\uB825</span></div><div>${icon("battery")}<strong>${percent}<small> %</small></strong><span>\uCD95\uC804\uC9C0</span></div></div><div class="power-state ${offline.length ? "warning" : ""}">${icon(offline.length ? "power" : "check")}<span>${!consumers.length ? "\uC544\uC9C1 \uC5F0\uACB0\uD560 \uC18C\uBE44 \uC124\uBE44\uAC00 \uC5C6\uC2B5\uB2C8\uB2E4." : offline.length ? `${offline.length}\uAC1C \uC124\uBE44\uC5D0 \uC804\uB825\uC774 \uACF5\uAE09\uB418\uC9C0 \uC54A\uC2B5\uB2C8\uB2E4.` : "\uBAA8\uB4E0 \uC18C\uBE44 \uC124\uBE44\uC5D0 \uC804\uB825\uC744 \uACF5\uAE09\uD558\uACE0 \uC788\uC2B5\uB2C8\uB2E4."}</span></div><div class="button-row"><button class="button ghost" data-action="layer-power">\uC804\uB825\uB9DD \uBCF4\uAE30</button><button class="button ghost" data-action="build-utilities">\uBC1C\uC804 \uC124\uBE44 \uAC74\uC124</button></div><div class="section-divider"></div><div class="section-head"><h3>\uC2E4\uB0B4\uC640 \uC628\uB3C4</h3><span>\uC2E4\uC678 ${Math.round(summary.temperature)}\xB0C</span></div><div class="room-list">${(s.rooms || []).map((r, i) => {
      const storage = Array.isArray(r.stockpileTiles) ? r.stockpileTiles.length : r.stockpileTiles;
      return `<button class="room-card" data-room="${esc(r.id)}">${icon(storage && r.temperature <= 8 ? "snow" : "roof")}<span><b>\uBC29 ${i + 1} \xB7 ${r.area}\uCE78</b><small>\uCE68\uB300 ${r.beds || 0} \xB7 \uCC3D\uACE0 ${storage || 0}\uCE78</small></span><strong class="${r.temperature <= 8 ? "cold" : r.temperature > 32 ? "hot" : ""}">${Math.round(r.temperature)}\xB0C</strong></button>`;
    }).join("") || '<div class="empty-inline">\uB2EB\uD78C \uC2E4\uB0B4\uAC00 \uC5C6\uC2B5\uB2C8\uB2E4. \uBCBD\uACFC \uBB38\uC73C\uB85C \uACF5\uAC04\uC744 \uC644\uC804\uD788 \uB458\uB7EC\uC2F8\uC138\uC694.</div>'}</div><button class="button ghost wide margin-top" data-action="layer-temperature">${icon("thermometer")}\uC628\uB3C4\uC640 \uC9C0\uBD95 \uBCF4\uAE30</button><div class="section-divider"></div><div class="section-head"><h3>\uCC3D\uACE0 \uC2DD\uB7C9 \uC0C1\uD0DC</h3><span>${summary.coldStorage ? "\uB0C9\uC7A5 \uAD6C\uC5ED \uC788\uC74C" : "\uB0C9\uC7A5 \uAD6C\uC5ED \uC5C6\uC74C"}</span></div>${[["\uC2DD\uC7AC\uB8CC", raw], ["\uC2DD\uC0AC", meals]].map(([label, f]) => `<div class="food-freshness"><div><span>${label} ${f.count}\uAC1C</span><b>${pct(f.freshness * 100)}%</b></div><div class="progress-track"><i style="width:${pct(f.freshness * 100)}%;background:${f.freshness < 0.25 ? "var(--red)" : "var(--green)"}"></i></div>${f.nearSpoil ? `<small>\uACE7 \uC0C1\uD560 \uC218 \uC788\uB294 \uC74C\uC2DD ${f.nearSpoil}\uAC1C</small>` : ""}</div>`).join("")}<p class="small-note">\uC2E0\uC120\uB3C4\uB294 \uB0A8\uC740 \uBCF4\uC874 \uC815\uB3C4\uC785\uB2C8\uB2E4. 0\xB0C \uC774\uD558\uB294 \uBD80\uD328\uB97C \uBA48\uCD94\uACE0, 8\xB0C \uC774\uD558\uB294 \uD06C\uAC8C \uB2A6\uCDA5\uB2C8\uB2E4. \uC74C\uC2DD\uC774 \uB193\uC778 \uC2E4\uC81C \uC704\uCE58\uC758 \uC628\uB3C4\uB97C \uC0AC\uC6A9\uD569\uB2C8\uB2E4.</p><div class="advice"><strong>\uC5F0\uACB0 \uADDC\uCE59</strong>\uBC1C\uC804\uAE30\xB7\uCD95\uC804\uC9C0\xB7\uC804\uB825\uC120\uC740 \uC0C1\uD558\uC88C\uC6B0\uB85C \uC774\uC5B4\uC9D1\uB2C8\uB2E4. \uC18C\uBE44 \uC124\uBE44\uB294 \uC5F0\uACB0\uB9DD\uC5D0\uC11C 3\uCE78 \uC774\uB0B4\uC5D0 \uB450\uC138\uC694. \uB0C9\uB09C\uBC29\uAE30\uB294 \uB2EB\uD78C \uC2E4\uB0B4\uC5D0\uC11C \uC791\uB3D9\uD569\uB2C8\uB2E4.</div>`;
  }
  function workPane() {
    const pawns = game.state.colonists.filter((p) => !p.dead);
    return `<div class="eyebrow">EVERY PAIR OF HANDS</div><h2>\uC624\uB298\uC758 \uC5ED\uD560</h2><p class="section-intro">\uC22B\uC790\uB97C \uB20C\uB7EC \uC6B0\uC120\uC21C\uC704\uB97C \uBC14\uAFB8\uC138\uC694.<br>\uC8FC\uBBFC\uC740 \uB192\uC740 \uC6B0\uC120\uC21C\uC704\uBD80\uD130 \uC77C\uC744 \uCC3E\uC2B5\uB2C8\uB2E4.</p><div class="button-row compact"><button class="button ghost" data-action="show-schedule">${icon("clock")}\uD558\uB8E8 \uC77C\uC815</button><button class="button ghost" data-action="show-care">${icon("medicine")}\uC758\uB8CC\xB7\uC18C\uBC29</button></div><table class="priority-table"><thead><tr><th>\uC791\uC5C5</th>${pawns.map((p) => `<th>${esc(p.name)}</th>`).join("")}</tr></thead><tbody>${Object.entries(JOB_LABELS).map(([k, label]) => `<tr><td>${esc(label)}</td>${pawns.map((p) => `<td><button class="priority-button" data-priority="${p.priorities[k]}" data-work="${k}" data-worker="${esc(p.id)}" title="${esc(p.name)} \xB7 ${esc(label)} \uC6B0\uC120\uC21C\uC704 ${p.priorities[k] || "\uD574\uC81C"} \xB7 \uD074\uB9AD\uD574\uC11C \uBCC0\uACBD">${p.priorities[k] || "\u2014"}</button></td>`).join("")}</tr>`).join("")}</tbody></table><div class="priority-help"><span><b>1</b> \uB192\uC74C \u2192 <b>4</b> \uB0AE\uC74C</span><span><b>\u2014</b> \uC791\uC5C5 \uC548 \uD568</span></div><div class="section-divider"></div><div class="setting-row"><span>\uC190\uC0C1 \uAC74\uBB3C \uC790\uB3D9 \uC218\uB9AC</span><button class="toggle ${game.state.autoRepair ? "on" : ""}" data-action="toggle-repair" role="switch" aria-label="\uC790\uB3D9 \uC218\uB9AC" aria-checked="${game.state.autoRepair}"></button></div><p class="small-note">\uAC74\uC124 \uB2F4\uB2F9\uC774 \uC790\uC7AC\uB97C \uC18C\uBE44\uD574 \uC190\uC0C1\uB41C \uAC74\uBB3C\uC744 \uC218\uB9AC\uD569\uB2C8\uB2E4. \uC0C8 \uCCAD\uC0AC\uC9C4\uC744 \uBA3C\uC800 \uCC98\uB9AC\uD569\uB2C8\uB2E4.</p><div class="section-divider"></div><div class="section-head"><h3>\uC2DD\uC0AC \uC0DD\uC0B0</h3>${icon("stove")}</div><div class="setting-row"><span>\uC790\uB3D9 \uC870\uB9AC</span><button class="toggle ${game.state.autoCook ? "on" : ""}" data-action="toggle-cook" role="switch" aria-label="\uC790\uB3D9 \uC870\uB9AC" aria-checked="${game.state.autoCook}"></button></div><div class="setting-row"><label for="meal-target">\uBAA9\uD45C \uBE44\uCD95 \uC2DD\uC0AC</label><input class="inline-number" id="meal-target" type="number" min="1" max="100" value="${game.state.mealTarget}" aria-label="\uBAA9\uD45C \uBE44\uCD95 \uC2DD\uC0AC"></div><p class="section-intro">\uC644\uC131\uB41C \uC870\uB9AC\uB300\uC640 \uC2DD\uC7AC\uB8CC\uAC00 \uC788\uC73C\uBA74 \uBAA9\uD45C\uB7C9\uAE4C\uC9C0 \uC870\uB9AC\uD569\uB2C8\uB2E4. \uB9CC\uB4E4\uC5B4\uC9C4 \uC2DD\uC0AC\uB294 \uC6B4\uBC18 \uD6C4 \uCC3D\uACE0 \uC218\uB7C9\uC5D0 \uBC18\uC601\uB429\uB2C8\uB2E4.</p><div class="section-divider"></div><div class="advice"><strong>\uC6B4\uBC18 \uB2F4\uB2F9\uB3C4 \uD544\uC694\uD569\uB2C8\uB2E4</strong>\uCC44\uC9D1\xB7\uC870\uB9AC\uD55C \uBB3C\uC790\uB294 \uBA3C\uC800 \uB545\uC5D0 \uB193\uC785\uB2C8\uB2E4. \uC6B4\uBC18 \uC791\uC5C5\uC744 \uB044\uBA74 \uCC3D\uACE0\uAC00 \uBE44\uC5B4 \uC788\uC5B4\uB3C4 \uC0AC\uC6A9\uD560 \uC218 \uC5C6\uB294 \uBB3C\uC790\uAC00 \uC313\uC785\uB2C8\uB2E4.</div>`;
  }
  function logsPane() {
    return `<div class="eyebrow">THE STORY SO FAR</div><h2>\uC815\uCC29\uC9C0\uC758 \uAE30\uB85D</h2><p class="section-intro">\uC870\uC6A9\uD55C \uD558\uB8E8\uB3C4, \uC544\uC2AC\uC544\uC2AC\uD55C \uC21C\uAC04\uB3C4.<br>\uC6B0\uB9AC\uC758 \uC774\uC57C\uAE30\uB294 \uC774\uACF3\uC5D0 \uB0A8\uC2B5\uB2C8\uB2E4.</p><div class="section-divider"></div><div class="event-log">${game.state.logs.slice(0, 45).map((l) => `<article class="event ${esc(l.kind)}"><div class="event-time">${formatGameTime(l.time)}</div><strong>${esc(l.title)}</strong><p>${esc(l.text)}</p></article>`).join("") || '<p class="empty-state">\uC544\uC9C1 \uAE30\uB85D\uB41C \uC0AC\uAC74\uC774 \uC5C6\uC2B5\uB2C8\uB2E4.</p>'}</div>`;
  }
  function gearCount(item) {
    const s = game.state;
    const stock = s.resources[item] || 0;
    const loose = s.items.filter((i) => i.type === item).reduce((n, i) => n + i.count, 0);
    const carried = s.colonists.filter((p) => p.carry?.type === item && p.carry.source !== "construction").reduce((n, p) => n + p.carry.count, 0);
    const equipped = s.colonists.filter((p) => Object.values(p.equipment || {}).includes(item)).length;
    return { stock, loose, carried, equipped, total: stock + loose + carried + equipped };
  }
  function equipmentHtml(pawn) {
    const eligible = !pawn.dead && pawn.health >= 15 && !pawn.carriedBy && !pawn.drafted;
    const pending = pawn.job?.type === "equip";
    return `<div class="section-divider"></div><div class="section-head"><h3>\uC7A5\uBE44\uC640 \uB3C4\uAD6C</h3><button class="text-link" data-action="show-industry">\uC81C\uC791 \uBCF4\uAE30 ${icon("arrow")}</button></div>
  <div class="equipment-list">${Object.entries(EQUIPMENT).map(([item, def]) => {
      const equipped = pawn.equipment?.[def.slot] === item, stock = game.state.resources[item] || 0, pickingUp = pending && pawn.job.item === item;
      return `<div class="equipment-row ${equipped ? "equipped" : ""}"><span class="equipment-icon">${icon(RES_ICONS[item])}</span><div><b>${equipped ? esc(def.label) : pickingUp ? `${esc(def.label)} \uC218\uB839 \uC911` : item === "rifle" ? "\uAE30\uBCF8 \uAD8C\uCD1D" : item === "armor" ? "\uBC29\uC5B4\uAD6C \uC5C6\uC74C" : "\uAE30\uBCF8 \uC791\uC5C5 \uB3C4\uAD6C"}</b><small>${equipped ? item === "rifle" ? "\uC0AC\uAC70\uB9AC 9 \xB7 \uD53C\uD574 +35%" : item === "armor" ? "\uCD1D\uD0C4 \uD53C\uD574 \u221235%" : "\uB300\uC0C1 \uC791\uC5C5 \uC18D\uB3C4 +25%" : `\uCC3D\uACE0 ${stock}\uAC1C \xB7 ${esc(def.label)}`}</small></div><button class="gear-button" ${equipped || pickingUp ? `data-unequip="${def.slot}"` : `data-equip="${item}"`} data-gear-pawn="${esc(pawn.id)}" title="${esc(def.description)}" ${!eligible || !(equipped || pickingUp) && (!stock || pending) ? "disabled" : ""}>${pickingUp ? "\uCDE8\uC18C" : equipped ? "\uD574\uC81C" : "\uC7A5\uCC29"}</button></div>`;
    }).join("")}</div>${pending ? `<p class="equipment-pending">${icon("clock")}${esc(pawn.status)} \xB7 \uC2E4\uC81C \uC218\uB839 \uD6C4 \uC7A5\uCC29\uB429\uB2C8\uB2E4.</p>` : ""}<p class="small-note">\uC9D5\uC9D1\uC744 \uD574\uC81C\uD55C \uC8FC\uBBFC\uC774 \uCC3D\uACE0\uB85C \uAC00\uC11C \uC7A5\uBE44\uB97C \uBC1B\uC2B5\uB2C8\uB2E4. \uD574\uC81C\uD55C \uC7A5\uBE44\uB294 \uBC1C\uBC11\uC5D0 \uB0B4\uB824\uB193\uC2B5\uB2C8\uB2E4.</p>`;
  }
  function changeBill(recipeId, patch) {
    const bill = game.state.industry.bills[recipeId];
    if (!bill) return;
    execute("bill", { recipeId, ...bill, ...patch }, { success: true });
    renderSidebar();
  }
  function industryPane() {
    const s = game.state, benches = s.tiles.filter((t) => t.building?.complete && t.building.type === "workbench");
    const craftJobs = s.colonists.filter((p) => p.job?.type === "craft");
    const totalCrafted = Object.values(s.industry.crafted).reduce((n, v) => n + v, 0);
    const capable = s.colonists.filter((p) => !p.dead && p.priorities.craft > 0 && !p.drafted);
    return `<div class="eyebrow">MADE FOR TOMORROW</div><h2>\uC190\uC73C\uB85C \uB9CC\uB4DC\uB294 \uB300\uBE44</h2><p class="section-intro">\uBAA9\uC7AC\uC640 \uAC15\uCCA0\uC744 \uD544\uC694\uD55C \uC7A5\uBE44\uB85C \uBC14\uAFB8\uC138\uC694.<br>\uC81C\uC791\uACFC \uC6B4\uBC18, \uB450 \uC77C\uC190\uC774 \uC774\uC5B4\uC838\uC57C \uD569\uB2C8\uB2E4.</p>
  <div class="industry-summary"><div>${icon("craft")}<strong>${benches.length}</strong><span>\uC644\uC131\uB41C \uC81C\uC791\uB300</span></div><div>${icon("box")}<strong>${totalCrafted}</strong><span>\uC9C0\uAE08\uAE4C\uC9C0 \uC81C\uC791</span></div></div>
  <div class="button-row"><button class="button primary" data-action="build-workbench">${icon("craft")}\uC81C\uC791\uB300 \uAC74\uC124</button><button class="button ghost" data-action="assign-crafter">${icon("users")}\uC81C\uC791 \uB2F4\uB2F9 \uBC30\uCE58</button></div>
  <p class="small-note">\uC81C\uC791\uB300: \uBAA9\uC7AC 20 \xB7 \uAC15\uCCA0 8. \uC804\uAE30 \uC5C6\uC774 \uC791\uC5C5\uD569\uB2C8\uB2E4. ${capable.length ? `\uBE44\uC9D5\uC9D1 \uC81C\uC791 \uB2F4\uB2F9 ${capable.length}\uBA85\uC774 \uC788\uC2B5\uB2C8\uB2E4.` : "\uC81C\uC791 \uB2F4\uB2F9\uC774 \uC5C6\uAC70\uB098 \uBAA8\uB450 \uC9D5\uC9D1 \uC911\uC785\uB2C8\uB2E4."}</p>
  <div class="section-divider"></div><div class="section-head"><h3>\uC0DD\uC0B0 \uC8FC\uBB38</h3><span>\uBAA9\uD45C\uB294 0\u201399\uAC1C</span></div>
  <div class="recipe-list">${Object.entries(RECIPES).map(([recipeId, recipe]) => {
      const bill = s.industry.bills[recipeId], owned = gearCount(recipe.output), workers = craftJobs.filter((p) => p.job.recipeId === recipeId);
      const missing = Object.entries(recipe.cost).filter(([type, n]) => (s.resources[type] || 0) < n);
      const satisfied = bill.mode === "maintain" ? owned.total + workers.length >= bill.target : bill.target === 0;
      const stateText = bill.paused ? "\uC8FC\uBB38 \uC77C\uC2DC\uC815\uC9C0" : workers.length ? `${workers.length}\uBA85 \uC81C\uC791 \uC911` : satisfied ? "\uBAA9\uD45C \uCDA9\uC871" : !benches.length ? "\uC81C\uC791\uB300 \uD544\uC694" : !capable.length ? "\uC81C\uC791 \uB2F4\uB2F9 \uD544\uC694" : missing.length ? "\uCC3D\uACE0 \uC7AC\uB8CC \uB300\uAE30" : "\uC791\uC5C5 \uC2DC\uC791 \uB300\uAE30";
      return `<section class="recipe-card ${workers.length ? "working" : ""}"><div class="recipe-heading"><span>${icon(RES_ICONS[recipe.output])}</span><div><h4>${esc(recipe.label)}</h4><small>${esc(recipe.description)}</small></div></div><div class="recipe-materials">${Object.entries(recipe.cost).map(([type, n]) => `<span class="${(s.resources[type] || 0) < n ? "short" : ""}">${icon(RES_ICONS[type])}${esc(RESOURCE_LABELS[type])} ${n}</span>`).join("")}</div>
    <div class="recipe-ownership"><span>\uCC3D\uACE0 <b>${owned.stock}</b></span><span>\uBC14\uB2E5\xB7\uC6B4\uBC18 <b>${owned.loose + owned.carried}</b></span><span>\uC7A5\uCC29 <b>${owned.equipped}</b></span></div>
    <div class="segmented bill-mode" aria-label="${esc(recipe.label)} \uC0DD\uC0B0 \uBC29\uC2DD"><button data-bill-mode="count" data-bill-recipe="${recipeId}" class="${bill.mode === "count" ? "active" : ""}" aria-pressed="${bill.mode === "count"}">\uD69F\uC218 \uC9C0\uC815</button><button data-bill-mode="maintain" data-bill-recipe="${recipeId}" class="${bill.mode === "maintain" ? "active" : ""}" aria-pressed="${bill.mode === "maintain"}">\uBCF4\uC720\uB7C9 \uC720\uC9C0</button></div>
    <div class="bill-control"><span>${bill.mode === "count" ? "\uC55E\uC73C\uB85C \uB9CC\uB4E4 \uAC1C\uC218" : "\uC804\uCCB4 \uBCF4\uC720 \uBAA9\uD45C"}</span><div class="quantity-stepper"><button data-bill-delta="-1" data-bill-recipe="${recipeId}" aria-label="${esc(recipe.label)} \uBAA9\uD45C \uC904\uC774\uAE30" ${bill.target === 0 ? "disabled" : ""}>\u2212</button><output aria-label="${esc(recipe.label)} \uBAA9\uD45C">${bill.target}</output><button data-bill-delta="1" data-bill-recipe="${recipeId}" aria-label="${esc(recipe.label)} \uBAA9\uD45C \uB298\uB9AC\uAE30" ${bill.target === 99 ? "disabled" : ""}>+</button></div></div>
    ${workers.map((p) => `<div class="craft-progress"><span><b>${esc(p.name)}</b> \xB7 ${esc(p.job.stage === "work" ? "\uC81C\uC791 \uC911" : "\uC7AC\uB8CC \uC6B4\uBC18 \uC911")}</span><div class="progress-track"><i style="width:${p.job.stage === "work" ? pct(p.job.progress / p.job.total * 100) : 0}%"></i></div></div>`).join("")}
    <div class="recipe-footer"><span class="${workers.length ? "positive" : bill.paused ? "muted" : ""}">${esc(stateText)}</span><button data-bill-pause="${recipeId}" aria-label="${esc(recipe.label)} ${bill.paused ? "\uC7AC\uAC1C" : "\uC77C\uC2DC\uC815\uC9C0"}">${bill.paused ? "\uC7AC\uAC1C" : "\uC77C\uC2DC\uC815\uC9C0"}</button><button data-bill-clear="${recipeId}" ${!bill.target && !workers.length ? "disabled" : ""}>\uC8FC\uBB38 \uD574\uC81C</button></div></section>`;
    }).join("")}</div>
  <p class="small-note">\uBCF4\uC720\uB7C9\uC5D0\uB294 \uCC3D\uACE0\xB7\uBC14\uB2E5\xB7\uC6B4\uBC18\xB7\uC7A5\uCC29 \uC7A5\uBE44\uC640 \uC81C\uC791 \uC911\uC778 \uBB3C\uD488\uC744 \uD3EC\uD568\uD569\uB2C8\uB2E4. \uC8FC\uBB38 \uC124\uC815\uC744 \uBC14\uAFB8\uBA74 \uD574\uB2F9 \uC81C\uC791\uC744 \uC911\uB2E8\uD558\uACE0 \uBC1B\uC740 \uC7AC\uB8CC\uB97C \uBC14\uB2E5\uC5D0 \uB3CC\uB824\uB193\uC2B5\uB2C8\uB2E4.</p>
  <div class="section-divider"></div><div class="section-head"><h3>\uC8FC\uBBFC\uC5D0\uAC8C \uC7A5\uBE44 \uC9C0\uAE09</h3><span>\uC774\uB984\uC744 \uB20C\uB7EC \uC120\uD0DD</span></div><div class="gear-roster">${s.colonists.filter((p) => !p.dead).map((p) => `<button data-pawn="${esc(p.id)}"><span class="pawn-avatar" style="--pawn-color:${esc(p.color)}"></span><span><b>${esc(p.name)}</b><small>${Object.values(p.equipment || {}).filter(Boolean).map((id) => esc(EQUIPMENT[id]?.label || id)).join(" \xB7 ") || "\uAE30\uBCF8 \uC7A5\uBE44"}</small></span>${icon("arrow")}</button>`).join("")}</div>
  <button class="button ghost wide margin-top" data-action="show-trade">${icon("trade")}\uC0C1\uC778\uACFC \uC789\uC5EC \uBB3C\uD488 \uAC70\uB798</button>`;
  }
  function tradePane() {
    const s = game.state, trade = s.trade, visitor = trade.visitor, item = ui.tradeItem, prices = TRADE_PRICES[item];
    const buying = ui.tradeSide === "buy", price = buying ? prices.buy : prices.sell, count = ui.tradeCount;
    const available = buying ? visitor?.stock?.[item] || 0 : s.resources[item] || 0, cash = buying ? s.resources.silver : visitor?.silver || 0;
    const max = price ? Math.min(100, available, Math.floor(cash / price)) : 0;
    const civilian = s.colonists.some((p) => !p.dead && p.health >= 15 && !p.drafted && !p.carriedBy);
    const open = visitor?.phase === "trading" && !s.activeRaid && civilian;
    const ok = open && price !== null && count <= max;
    const status = !visitor ? "\uB2E4\uC74C \uBC29\uBB38\uC744 \uAE30\uB2E4\uB9AC\uB294 \uC911" : visitor.phase === "arriving" ? "\uC815\uCC29\uC9C0\uB85C \uC774\uB3D9 \uC911" : visitor.phase === "leaving" ? "\uAC70\uB798\uB97C \uB9C8\uCE58\uACE0 \uB5A0\uB098\uB294 \uC911" : "\uBB3C\uD488\uC744 \uAC70\uB798\uD560 \uC218 \uC788\uC2B5\uB2C8\uB2E4";
    const reason = !visitor ? "\uC0C1\uC778 \uB3C4\uCC29 \uD6C4 \uAC70\uB798\uD560 \uC218 \uC788\uC2B5\uB2C8\uB2E4." : visitor.phase !== "trading" ? "\uC0C1\uC778\uC774 \uBA38\uBB34\uB294 \uB3D9\uC548 \uAC70\uB798\uD560 \uC218 \uC788\uC2B5\uB2C8\uB2E4." : s.activeRaid ? "\uC2B5\uACA9 \uC911\uC5D0\uB294 \uAC70\uB798\uD560 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4." : !civilian ? "\uC77C\uC5B4\uC120 \uBE44\uC9D5\uC9D1 \uC8FC\uBBFC\uC774 \uD544\uC694\uD569\uB2C8\uB2E4." : price === null ? "\uC0C1\uC778\uC740 \uC74C\uC2DD \uC7AC\uD310\uB9E4\uB97C \uBC1B\uC9C0 \uC54A\uC2B5\uB2C8\uB2E4." : available < count ? "\uC120\uD0DD\uD55C \uC218\uB7C9\uB9CC\uD07C \uC7AC\uACE0\uAC00 \uC5C6\uC2B5\uB2C8\uB2E4." : cash < count * price ? buying ? "\uCC3D\uACE0 \uC740\uD654\uAC00 \uBD80\uC871\uD569\uB2C8\uB2E4." : "\uC0C1\uC778\uC758 \uC740\uD654\uAC00 \uBD80\uC871\uD569\uB2C8\uB2E4." : "\uAD6C\uB9E4\uD488\uACFC \uD310\uB9E4 \uB300\uAE08\uC740 \uC0C1\uC778 \uBC1C\uBC11\uC5D0 \uB193\uC785\uB2C8\uB2E4.";
    return `<div class="eyebrow">A ROAD BETWEEN COLONIES</div><h2>\uAE38 \uC704\uC5D0\uC11C \uB9CC\uB09C \uC774\uC6C3</h2><p class="section-intro">\uB0A8\uB294 \uBB3C\uC790\uB294 \uD314\uACE0, \uD544\uC694\uD55C \uAC83\uC740 \uAD6C\uD558\uC138\uC694.<br>\uBC29\uBB38 \uC2DC\uAC04\uACFC \uC0C1\uC778\uC758 \uC790\uAE08\uC740 \uD55C\uC815\uB418\uC5B4 \uC788\uC2B5\uB2C8\uB2E4.</p>
  <div class="trader-visit ${visitor?.phase === "trading" ? "open" : ""}"><span class="trader-emblem">${icon("trade")}</span><div><b>${esc(visitor?.name || "\uC21C\uD68C \uC0C1\uC778")}</b><small>${esc(status)}</small><span>${!visitor ? `\uB2E4\uC74C \uBC29\uBB38\uAE4C\uC9C0 ${formatDuration(trade.nextVisitAt - s.time)}` : visitor.phase === "trading" ? `\uBA38\uBB34\uB294 \uC2DC\uAC04 ${formatDuration(visitor.leavesAt - s.time)}` : visitor.phase === "arriving" ? "\uC9C0\uB3C4\uC5D0 \uB3C4\uCC29\uD588\uC2B5\uB2C8\uB2E4. \uB9CC\uB0A8 \uC9C0\uC810\uC73C\uB85C \uC774\uB3D9\uD569\uB2C8\uB2E4." : "\uC774\uBBF8 \uBC1B\uC740 \uBB3C\uD488\uC740 \uC815\uCC29\uC9C0\uC5D0 \uB0A8\uC2B5\uB2C8\uB2E4."}</span></div>${visitor ? `<button class="icon-button" data-action="focus-trader" title="\uC0C1\uC778 \uC704\uCE58" aria-label="\uC0C1\uC778 \uC704\uCE58 \uBCF4\uAE30">${icon("focus")}</button>` : ""}</div>
  <div class="trade-balances"><div><span>\uCC3D\uACE0 \uC740\uD654</span><b>${icon("coin")}${s.resources.silver}</b></div><div><span>\uC0C1\uC778 \uC740\uD654</span><b>${icon("coin")}${visitor ? visitor.silver : "\u2014"}</b></div></div>
  <div class="segmented trade-side" role="group" aria-label="\uAC70\uB798 \uBC29\uD5A5"><button data-trade-side="buy" class="${buying ? "active" : ""}" aria-pressed="${buying}">\uAD6C\uB9E4\uD558\uAE30</button><button data-trade-side="sell" class="${!buying ? "active" : ""}" aria-pressed="${!buying}">\uD310\uB9E4\uD558\uAE30</button></div>
  <div class="trade-table-head"><span>\uD488\uBAA9</span><span>${buying ? "\uC0C1\uC778 \uC7AC\uACE0" : "\uCC3D\uACE0 \uC218\uB7C9"}</span><span>${buying ? "\uAD6C\uB9E4" : "\uD310\uB9E4"} \uB2E8\uAC00</span></div><div class="trade-items">${Object.entries(TRADE_PRICES).map(([type, p]) => {
      const unit = buying ? p.buy : p.sell, quantity = buying ? visitor?.stock?.[type] || 0 : s.resources[type];
      return `<button class="trade-item ${type === item ? "selected" : ""}" data-trade-item="${type}" aria-pressed="${type === item}"><span>${icon(RES_ICONS[type])}<b>${esc(RESOURCE_LABELS[type])}</b></span><span>${visitor || !buying ? quantity : "\u2014"}</span><strong>${unit === null ? "\uB9E4\uC785 \uC548 \uD568" : `${unit} \uC740\uD654`}</strong></button>`;
    }).join("")}</div>
  <div class="trade-order"><div class="trade-order-heading"><b>${esc(RESOURCE_LABELS[item])} ${buying ? "\uAD6C\uB9E4" : "\uD310\uB9E4"}</b><span>${max}\uAC1C\uAE4C\uC9C0 \uAC00\uB2A5</span></div><div class="trade-quantity"><label for="trade-count">\uC218\uB7C9</label><div class="quantity-stepper"><button data-trade-delta="-1" aria-label="\uAC70\uB798 \uC218\uB7C9 \uC904\uC774\uAE30" ${count <= 1 ? "disabled" : ""}>\u2212</button><input id="trade-count" type="number" min="1" max="100" step="1" value="${count}" aria-label="\uAC70\uB798 \uC218\uB7C9"><button data-trade-delta="1" aria-label="\uAC70\uB798 \uC218\uB7C9 \uB298\uB9AC\uAE30" ${count >= 100 ? "disabled" : ""}>+</button></div><button class="small-button" data-trade-quantity="${Math.max(1, max)}" ${!max ? "disabled" : ""}>\uCD5C\uB300</button></div><div class="trade-total"><span>${buying ? "\uC9C0\uBD88\uD560 \uC740\uD654" : "\uC218\uAC70\uD560 \uC740\uD654"}</span><b>${icon("coin")}${price === null ? "\u2014" : count * price}</b></div><button class="button primary wide" data-action="confirm-trade" data-trade-trader="${esc(visitor?.id || "")}" ${ok ? "" : "disabled"}>${icon("trade")}${count}\uAC1C ${buying ? "\uAD6C\uB9E4" : "\uD310\uB9E4"}</button><p class="trade-reason ${ok ? "" : "muted"}">${esc(reason)}</p></div>
  <div class="advice"><strong>\uBB3C\uD488\uACFC \uB300\uAE08\uC744 \uCC3D\uACE0\uB85C \uC62E\uAE30\uC138\uC694</strong>\uAD6C\uB9E4\uD488\uACFC \uD310\uB9E4 \uC740\uD654\uB294 \uC0C1\uC778 \uC704\uCE58\uC5D0 \uBC30\uC1A1\uB429\uB2C8\uB2E4. \uC6B4\uBC18 \uB2F4\uB2F9\uC744 \uB0A8\uACA8 \uB450\uACE0 \uC0C1\uC778\uACFC \uCC3D\uACE0 \uC0AC\uC774\uC758 \uAE38\uC744 \uC5F4\uC5B4 \uB450\uC138\uC694. \uC7A5\uCC29 \uC7A5\uBE44\uC640 \uC81C\uC791\uC5D0 \uD22C\uC785\uD55C \uC790\uC7AC\uB294 \uD314 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4.</div><p class="small-note">\uC2B5\uACA9\uC774\uB098 \uC0C1\uC778 \uC704\uCE58\uC758 \uD654\uC7AC\uAC00 \uBC1C\uC0DD\uD558\uBA74 \uC0C1\uC778\uC740 \uB5A0\uB0A9\uB2C8\uB2E4. \uC74C\uC2DD\uC740 \uAD6C\uB9E4\uB9CC \uAC00\uB2A5\uD558\uBA70, \uAD6C\uB9E4 \uD6C4\uC5D0\uB294 \uBCF4\uAD00 \uC628\uB3C4\uC5D0 \uB530\uB77C \uBD80\uD328\uD569\uB2C8\uB2E4.</p><p class="economy-record">\uAD6C\uB9E4 ${trade.stats.bought}\uAC1C \xB7 \uD310\uB9E4 ${trade.stats.sold}\uAC1C<br>\uC9C0\uBD88 ${trade.stats.spent} \uC740\uD654 \xB7 \uBC1B\uC740 \uB300\uAE08 ${trade.stats.earned} \uC740\uD654</p>`;
  }
  function renderSidebar() {
    if (!game) return;
    const node = $("#sidebar-content"), focused = document.activeElement;
    if (node.dataset.pane === ui.pane && node.contains?.(focused) && /INPUT|SELECT|TEXTAREA/.test(focused?.tagName || "")) return;
    const renderers = { colony: colonyPane, inspect: inspectPane, work: workPane, care: carePane, schedule: schedulePane, research: researchPane, systems: systemsPane, industry: industryPane, trade: tradePane, logs: logsPane };
    setContent(node, renderers[ui.pane]());
    node.dataset.pane = ui.pane;
  }
  function formatDuration(seconds) {
    if (!Number.isFinite(seconds)) return "\u2014";
    seconds = Math.max(0, Math.ceil(seconds));
    return `${Math.floor(seconds / 60)}\uBD84 ${String(seconds % 60).padStart(2, "0")}\uCD08`;
  }
  function formatGameTime(time) {
    const totalHours = (Number(time) || 0) / 120 * 24 + 8;
    return `${Math.floor(totalHours / 24) + 1}\uC77C \xB7 ${String(Math.floor(totalHours % 24)).padStart(2, "0")}:${String(Math.floor(totalHours % 1 * 60)).padStart(2, "0")}`;
  }
  function renderUI() {
    if (!game) return;
    renderResources();
    renderDock();
    renderTools();
    if (!ui.interacting) renderSidebar();
    const s = game.getSummary(), hour = Number(s.hour) || 0;
    $("#world-time").textContent = `${s.day}\uC77C \xB7 ${String(Math.floor(hour)).padStart(2, "0")}:${String(Math.floor(hour % 1 * 60)).padStart(2, "0")}`;
    $("#temperature").textContent = `${Math.round(s.temperature)}\xB0C \xB7 ${WEATHER[game.state.weather] || "\uB9D1\uC74C"}`;
    $("#living-count").textContent = `${s.alive}\uBA85\uC758 \uC0DD\uC874\uC790`;
    const enemies = game.state.raiders.filter((r) => !r.dead), fires = activeFires();
    const downed = game.state.colonists.filter((p) => !p.dead && p.health < 15);
    const newRaid = enemies.length && !ui.hadRaid, newFire = fires.length && !ui.hadFire, newDowned = downed.some((p) => !ui.downedIds.has(p.id));
    if (ui.autoPause && (newRaid || newFire || newDowned)) {
      if (dialog.open) ui.dialogSpeed = 0;
      else setSpeed(0);
      const reason = newDowned ? "\uC4F0\uB7EC\uC9C4 \uC8FC\uBBFC\uC774 \uC788\uC2B5\uB2C8\uB2E4. \uC758\uB8CC\xB7\uC18C\uBC29 \uD0ED\uC5D0\uC11C \uAD6C\uC870\uC640 \uCE58\uB8CC\uB97C \uC900\uBE44\uD558\uC138\uC694." : newRaid ? "\uC2B5\uACA9\uC744 \uBC1C\uACAC\uD588\uC2B5\uB2C8\uB2E4. \uC8FC\uBBFC\uC744 \uBC30\uCE58\uD55C \uB4A4 \uC7AC\uC0DD\uD558\uC138\uC694." : "\uD654\uC7AC\uB97C \uBC1C\uACAC\uD588\uC2B5\uB2C8\uB2E4. \uC18C\uBC29 \uB2F4\uB2F9\uC758 \uC9D5\uC9D1\uC744 \uD574\uC81C\uD558\uACE0 \uB300\uC751\uD558\uC138\uC694.";
      toast(`\uC2DC\uAC04\uC744 \uBA48\uCDC4\uC2B5\uB2C8\uB2E4. ${reason}`, "error", 7e3);
    }
    ui.hadRaid = enemies.length > 0;
    ui.hadFire = fires.length > 0;
    ui.downedIds = new Set(downed.map((p) => p.id));
    const visitor = game.state.trade.visitor;
    if (visitor?.phase === "trading" && ui.seenTraderId !== visitor.id) {
      ui.seenTraderId = visitor.id;
      toast("\uC21C\uD68C \uC0C1\uC778\uC774 \uB3C4\uCC29\uD588\uC2B5\uB2C8\uB2E4. \uAD50\uC5ED \uD0ED\uC5D0\uC11C \uD544\uC694\uD55C \uBB3C\uC790\uB97C \uAD6C\uD558\uC138\uC694.", "success", 6500);
    }
    const banner = $("#threat-banner");
    banner.hidden = !enemies.length && !fires.length && !downed.length;
    if (!banner.hidden) {
      const details = [enemies.length ? `\uC2B5\uACA9\uC790 ${enemies.length}\uBA85` : "", fires.length ? `\uD654\uC7AC ${fires.length}\uCE78` : "", downed.length ? `\uC4F0\uB7EC\uC9D0 ${downed.length}\uBA85` : ""].filter(Boolean).join(" \xB7 ");
      const standing = game.state.colonists.filter((p) => !p.dead && p.health >= 15);
      setContent(banner, `${icon(enemies.length ? "shield" : fires.length ? "fire" : "medicine")}<span>${details}</span>${enemies.length ? `<button data-action="draft-all">${standing.length && standing.every((p) => p.drafted) ? "\uC804\uC6D0 \uD574\uC81C" : "\uC804\uC6D0 \uC9D5\uC9D1"}</button>` : ""}${fires.length || downed.length ? '<button data-action="show-care">\uC758\uB8CC\xB7\uC18C\uBC29</button>' : ""}`);
    }
    $("#sidebar-footer-text").textContent = downed.length ? "\uD63C\uC790 \uB0A8\uACA8 \uB450\uC9C0 \uC54A\uACA0\uC2B5\uB2C8\uB2E4." : fires.length ? "\uBD88\uAE38\uC744 \uBA48\uCD94\uACE0 \uAC70\uCC98\uB97C \uC9C0\uCF1C \uC8FC\uC138\uC694." : enemies.length ? "\uC11C\uB85C\uC758 \uB4F1\uC744 \uC9C0\uCF1C \uC8FC\uC138\uC694." : game.state.victory ? "\uC774\uC81C, \uB2E4\uC74C \uC774\uC57C\uAE30\uB97C \uC2DC\uC791\uD569\uB2C8\uB2E4." : "\uC0DD\uC874\uC740 \uD568\uAED8\uD558\uB294 \uC77C\uC785\uB2C8\uB2E4.";
    const recent = game.state.logs[0];
    if (recent && recent.id !== ui.lastLogId) {
      if (ui.lastLogId && recent.kind === "danger") toast(`${recent.title} \xB7 ${recent.text}`, "error", 6e3);
      ui.lastLogId = recent.id;
    }
    if (game.state.victory && !ui.seenVictory) {
      ui.seenVictory = true;
      showOutcome(true);
    } else if (game.state.gameOver && !ui.seenGameOver) {
      ui.seenGameOver = true;
      showOutcome(false);
    }
  }
  function makeSave() {
    return { format: "frontier-colony-save", version: 1, savedAt: (/* @__PURE__ */ new Date()).toISOString(), game: game.toJSON() };
  }
  function readSave(text) {
    if (text.length > 4e6) throw new Error("\uC800\uC7A5 \uD30C\uC77C\uC774 \uB108\uBB34 \uD07D\uB2C8\uB2E4.");
    const data = JSON.parse(text);
    if (!data || data.format !== "frontier-colony-save" || data.version !== 1 || !data.game) throw new Error("\uC9C0\uC6D0\uD558\uB294 \uC815\uCC29\uC9C0 \uC800\uC7A5 \uD30C\uC77C\uC774 \uC544\uB2D9\uB2C8\uB2E4.");
    return ColonyGame.fromJSON(data.game);
  }
  function saveGame(manual = false) {
    if (!game) return false;
    if (ui.persistenceBlocked && !manual) return false;
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify(makeSave()));
      ui.persistenceBlocked = false;
      ui.saveTime = Date.now();
      $("#save-status").textContent = "\uBC29\uAE08 \uC800\uC7A5\uB428";
      setTimeout(() => {
        if (Date.now() - ui.saveTime >= 3500) $("#save-status").textContent = "\uBE0C\uB77C\uC6B0\uC800 \uC790\uB3D9 \uC800\uC7A5";
      }, 4e3);
      if (manual) toast("\uD604\uC7AC \uC815\uCC29\uC9C0\uB97C \uC774 \uBE0C\uB77C\uC6B0\uC800\uC5D0 \uC800\uC7A5\uD588\uC2B5\uB2C8\uB2E4.", "success");
      return true;
    } catch (error) {
      $("#save-status").textContent = "\uC790\uB3D9 \uC800\uC7A5 \uBD88\uAC00";
      if (manual) toast("\uBE0C\uB77C\uC6B0\uC800 \uC800\uC7A5 \uACF5\uAC04\uC5D0 \uC811\uADFC\uD560 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4. \uBA54\uB274\uC5D0\uC11C \uC800\uC7A5 \uD30C\uC77C\uC744 \uB0B4\uBCF4\uB0B4\uC138\uC694.", "error", 6e3);
      return false;
    }
  }
  function replaceGame(next, announce) {
    game = next;
    renderer.setGame(game);
    ui.selectedId = null;
    ui.selectedIds = [];
    ui.selectedTile = null;
    ui.previewTiles = [];
    ui.hadRaid = false;
    ui.hadFire = false;
    ui.downedIds = /* @__PURE__ */ new Set();
    ui.schedulePawnId = null;
    ui.tradeCount = 1;
    ui.tradeItem = "medicine";
    ui.tradeSide = "buy";
    ui.seenTraderId = game.state.trade.visitor?.id || null;
    ui.persistenceBlocked = false;
    ui.seenVictory = game.state.victory;
    ui.seenGameOver = false;
    ui.lastLogId = game.state.logs[0]?.id;
    ui.pane = "colony";
    ui.category = "orders";
    ui.tool = "select";
    $("#colonist-dock").dataset.ids = "";
    $("#app").classList.remove("show-panel");
    setPane("colony");
    setCategory("orders");
    setTool("select");
    renderer.focus(23, 16);
    setSpeed(game.state.gameOver ? 0 : 1);
    saveGame();
    renderUI();
    if (announce) toast(announce, "success", 4500);
  }
  function openDialog(title, eyebrow, body) {
    if (!dialog.open) {
      ui.dialogSpeed = ui.speed;
      setSpeed(0);
    }
    $("#dialog-content").innerHTML = `<div class="dialog-header"><div><div class="eyebrow">${esc(eyebrow)}</div><h2 id="dialog-title">${esc(title)}</h2></div><button class="icon-button" data-action="close-dialog" aria-label="\uB2EB\uAE30">${icon("cancel")}</button></div><div class="dialog-body">${body}</div>`;
    if (!dialog.open) dialog.showModal();
  }
  function closeDialog() {
    if (dialog.open) dialog.close();
    const previous = ui.dialogSpeed;
    ui.dialogSpeed = null;
    if (previous !== null) setSpeed(previous);
  }
  function showHelp() {
    openDialog("\uD568\uAED8 \uB3CC\uC544\uAC08 \uACF3\uC744 \uB9CC\uB4E4\uAE30", "FIELD GUIDE \xB7 \uC0DD\uD65C\uACFC \uC704\uAE30 \uB300\uC751", `<p>\uC8FC\uBBFC\uB4E4\uC740 \uC2A4\uC2A4\uB85C \uBA39\uACE0, \uC26C\uACE0, \uC77C\uD569\uB2C8\uB2E4. \uB2F9\uC2E0\uC740 <b>\uC0DD\uD65C \uACF5\uAC04\uACFC \uD558\uB8E8 \uC77C\uC815\uC744 \uC815\uD558\uACE0, \uC704\uD5D8\uD560 \uB54C \uB3D9\uB8CC\uB97C \uC9C0\uD0A4\uB294 \uC5ED\uD560</b>\uC744 \uB9E1\uC2B5\uB2C8\uB2E4.</p>
  <div class="guide-steps recovery-guide"><div class="guide-step"><span>01</span><strong>\uAC70\uCC98\uC640 \uC2DD\uB7C9</strong><p>\uC2DC\uC791 \uAC70\uCC98\uC758 \uB3D9\uCABD\xB7\uB0A8\uCABD \uBE48\uD2C8\uC744 \uB2EB\uACE0 \uC2E4\uB0B4 \uCE68\uB300\uB97C 3\uAC1C \uC900\uBE44\uD558\uC138\uC694. \uB18D\uC0AC\xB7\uCC44\uC9D1\xB7\uC870\uB9AC\xB7\uC6B4\uBC18 \uB2F4\uB2F9\uC744 \uC815\uD569\uB2C8\uB2E4.</p></div><div class="guide-step"><span>02</span><strong>\uC5F0\uAD6C\uC640 \uC0DD\uD65C</strong><p>\uC804\uAE30 \uACF5\uD559\uC744 \uC5F0\uAD6C\uD574 \uBC1C\uC804\xB7\uCD95\uC804\xB7\uB0C9\uC7A5\uC744 \uC5F0\uACB0\uD558\uC138\uC694. \uACE0\uB9AC \uB358\uC9C0\uAE30\uC640 \uC5EC\uAC00 \uC2DC\uAC04\uB3C4 \uB9C8\uB828\uD569\uB2C8\uB2E4.</p></div><div class="guide-step"><span>03</span><strong>\uAD6C\uC870\uC640 \uD68C\uBCF5</strong><p>\uC758\uB8CC \uCE68\uC0C1\uC744 \uC900\uBE44\uD558\uACE0 \uC18C\uBC29\xB7\uAD6C\uC870\xB7\uCE58\uB8CC \uB2F4\uB2F9\uC744 \uB0A8\uACA8 \uB450\uC138\uC694. \uC804\uD22C \uD6C4 \uC9D5\uC9D1\uC744 \uD574\uC81C\uD574\uC57C \uC704\uAE30 \uB300\uC751\uC744 \uC2DC\uC791\uD569\uB2C8\uB2E4.</p></div><div class="guide-step"><span>04</span><strong>\uB9C8\uC9C0\uB9C9 \uC804\uC1A1</strong><p>\uD1B5\uC2E0\uC744 \uC5F0\uAD6C\uD558\uACE0 \uC2E0\uD638\uAE30\uC5D0 \uC804\uAE30\uB97C \uACF5\uAE09\uD558\uC138\uC694. \uC804\uC1A1 \uB3C4\uC911 \uB9C8\uC9C0\uB9C9 \uC2B5\uACA9\uC744 \uB9C9\uACE0, \uB0A8\uC740 \uD654\uC7AC\uB3C4 \uC9C4\uC555\uD569\uB2C8\uB2E4.</p></div></div>
  <h3>\uBD80\uC0C1\uC790\uB97C \uD63C\uC790 \uB450\uC9C0 \uB9C8\uC138\uC694</h3><p>\uAC74\uAC15\uC774 \uD06C\uAC8C \uB5A8\uC5B4\uC9C0\uBA74 \uC8FC\uBBFC\uC774 \uC4F0\uB7EC\uC9D1\uB2C8\uB2E4. <b>\uC758\uB8CC\xB7\uC18C\uBC29</b> \uD0ED\uC5D0\uC11C \uAD6C\uC870\uB97C \uC9C0\uC2DC\uD558\uBA74 \uB2E4\uB978 \uC8FC\uBBFC\uC774 \uBD80\uC0C1\uC790\uB97C \uB4E4\uC5B4 \uCE68\uC0C1\uC73C\uB85C \uC62E\uAE41\uB2C8\uB2E4. \uCE68\uB300\uB97C \uC120\uD0DD\uD574 \uC758\uB8CC\uC6A9\uC73C\uB85C \uBC14\uAFC0 \uC218 \uC788\uC2B5\uB2C8\uB2E4. \uAC74\uAC15\uD55C \uC8FC\uBBFC\uC774 \uC798 \uC77C\uBC18 \uCE68\uB300\uB3C4 \uB0A8\uACA8 \uB450\uC138\uC694.</p><p>\uCE58\uB8CC \uB2F4\uB2F9\uC740 \uC57D\uD488\uC744 \uAC00\uC838\uC640 \uCD9C\uD608\uC744 \uBA48\uCD94\uACE0 \uD68C\uBCF5\uC744 \uB3D5\uC2B5\uB2C8\uB2E4. \uC57D\uD488\uC774 \uC5C6\uC73C\uBA74 \uC751\uAE09 \uCC98\uCE58\uB97C \uD569\uB2C8\uB2E4. \uB3C4\uC6C0\uC774 \uD544\uC694\uD55C \uD658\uC790\uB294 \uC2DD\uC0AC\uB3C4 \uAC00\uC838\uB2E4\uC8FC\uC5B4\uC57C \uD569\uB2C8\uB2E4. \uCD9C\uD608\uACFC \uD5C8\uAE30\uB294 \uC774\uC1A1 \uC911\uC5D0\uB3C4 \uC9C4\uD589\uB418\uBBC0\uB85C \uB2F4\uB2F9 \uC8FC\uBBFC\uC758 \uC9D5\uC9D1\uACFC \uC791\uC5C5 \uC124\uC815\uC744 \uD655\uC778\uD558\uC138\uC694.</p>
  <h3>\uD654\uC7AC\uB294 \uC2E4\uC81C\uB85C \uBC88\uC9D1\uB2C8\uB2E4</h3><p>\uB099\uB8B0\uB85C \uC2DC\uC791\uD55C \uBD88\uC740 \uC778\uC811\uD55C \uAC00\uC5F0\uBB3C\uB85C \uBC88\uC9C0\uACE0 \uB098\uBB34\xB7\uC791\uBB3C\xB7\uAC74\uBB3C\uC744 \uD0DC\uC6C1\uB2C8\uB2E4. \uC18C\uBC29 \uB2F4\uB2F9\uC774 \uBD88 \uC606\uC73C\uB85C \uC774\uB3D9\uD574 \uC791\uC5C5\uD574\uC57C \uAEBC\uC9D1\uB2C8\uB2E4. <b>\uC758\uB8CC\xB7\uC18C\uBC29 \u2192 \uC9C4\uD654 \uC9C0\uC2DC</b> \uB610\uB294 \uC8FC\uBBFC \uC120\uD0DD \uD6C4 <b>\uC6B0\uC120 \uC791\uC5C5</b> \uB3C4\uAD6C\uB85C \uBD88\uC744 \uB204\uB974\uC138\uC694. \uBE44\uB294 \uC9C0\uBD95\uC774 \uC5C6\uB294 \uACF3\uC758 \uBD88\uC744 \uC57D\uD558\uAC8C \uB9CC\uB4ED\uB2C8\uB2E4.</p><p>\uAC74\uBB3C\uC774 \uD0C0\uBA74 \uBC29\uC774 \uC5F4\uB9AC\uAC70\uB098 \uC804\uB825\uB9DD\uC774 \uB04A\uAE38 \uC218 \uC788\uC2B5\uB2C8\uB2E4. \uBD88\uC744 \uB048 \uB4A4 \uC218\uB9AC\xB7\uC7AC\uAC74\uACFC \uB0C9\uC7A5\uC2E4 \uC628\uB3C4\uB97C \uD655\uC778\uD558\uC138\uC694. \uD654\uC7AC\uAC00 \uB0A8\uC544 \uC788\uC73C\uBA74 \uAD6C\uC870 \uC2E0\uD638 \uCDA9\uC804\uC774 \uBA48\uCDA5\uB2C8\uB2E4.</p>
  <h3>\uD558\uB8E8 \uC77C\uC815\uC744 \uC815\uD558\uC138\uC694</h3><p><b>\uC77C\uC815</b> \uD0ED\uC5D0\uC11C \uC8FC\uBBFC\uACFC \uD65C\uB3D9\uC744 \uC120\uD0DD\uD55C \uB4A4 24\uC2DC\uAC04 \uCE78\uC744 \uB20C\uB7EC \uBC14\uAFC9\uB2C8\uB2E4. \uADE0\uD615 \uC0DD\uD65C\xB7\uC57C\uAC04 \uC791\uC5C5\xB7\uC790\uC728 \uC0DD\uD65C \uC124\uC815\uB3C4 \uC788\uC2B5\uB2C8\uB2E4. \uAE34\uAE09\uD55C \uC0DD\uC874\uACFC \uC704\uAE30 \uB300\uC751\uC740 \uC77C\uC815\uBCF4\uB2E4 \uC6B0\uC120\uD569\uB2C8\uB2E4. \uAE30\uC874 \uC800\uC7A5\uC758 \uC8FC\uBBFC\uC740 \uC790\uC728 \uC77C\uC815\uC73C\uB85C \uC774\uC5B4\uC9D1\uB2C8\uB2E4.</p><p>\uACE0\uB9AC \uB358\uC9C0\uAE30 \uC2DC\uC124\uC740 \uC5EC\uAC00 \uD68C\uBCF5\uC744 \uB3D5\uC2B5\uB2C8\uB2E4. \uC8FC\uBBFC \uC0C1\uC138 \uD654\uBA74\uC5D0\uC11C \uD5C8\uAE30\xB7\uD734\uC2DD\xB7\uC628\uB3C4\xB7\uC5EC\uAC00\uAC00 \uAE30\uBD84\uC5D0 \uC8FC\uB294 \uC601\uD5A5\uC744 \uD655\uC778\uD560 \uC218 \uC788\uC2B5\uB2C8\uB2E4.</p>
  <h3>\uC2E4\uB0B4 \xB7 \uC804\uB825 \xB7 \uC2DD\uB7C9</h3><p>\uBCBD\uACFC \uBB38\uC73C\uB85C \uB458\uB7EC\uC2F8\uC778 120\uCE78 \uC774\uD558 \uACF5\uAC04\uC5D0\uB294 \uC790\uB3D9 \uC9C0\uBD95\uC774 \uC0DD\uAE41\uB2C8\uB2E4. \uBC1C\uC804\uAE30\xB7\uCD95\uC804\uC9C0\xB7\uC804\uB825\uC120\uC740 \uC0C1\uD558\uC88C\uC6B0\uB85C \uC5F0\uACB0\uD558\uACE0, \uC18C\uBE44 \uC124\uBE44\uB294 \uC5F0\uACB0\uB9DD\uC5D0\uC11C 3\uCE78 \uC774\uB0B4\uC5D0 \uB450\uC138\uC694. \uBC24\uC5D0\uB294 \uD0DC\uC591\uAD11\uC774 \uBA48\uCDA5\uB2C8\uB2E4.</p><p>\uB0C9\uAC01\uAE30\uAC00 \uC791\uB3D9\uD558\uB294 \uC2E4\uB0B4 \uCC3D\uACE0\uB294 \uC74C\uC2DD \uBD80\uD328\uB97C \uB2A6\uCDA5\uB2C8\uB2E4. 0\xB0C \uC774\uD558\uC5D0\uC11C\uB294 \uBD80\uD328\uAC00 \uBA48\uCD94\uACE0 8\xB0C \uC774\uD558\uB294 \uD06C\uAC8C \uB290\uB824\uC9D1\uB2C8\uB2E4. \uC9C0\uB3C4 \uC624\uB978\uCABD\uC5D0\uC11C \uC628\uB3C4\uC640 \uC804\uB825\uB9DD\uC744 \uD655\uC778\uD558\uC138\uC694.</p>
  <h3>\uB9CC\uB4E4\uACE0, \uC7A5\uCC29\uD558\uACE0, \uAC70\uB798\uD558\uC138\uC694</h3><p><b>\uC81C\uC791</b> \uD0ED\uC5D0\uC11C \uC81C\uC791\uB300\uB97C \uAC74\uC124\uD558\uACE0 \uC0DD\uC0B0 \uC8FC\uBB38\uC744 \uC815\uD558\uC138\uC694. \uD69F\uC218 \uC9C0\uC815\uC740 \uB0A8\uC740 \uC81C\uC791 \uAC1C\uC218, \uBCF4\uC720\uB7C9 \uC720\uC9C0\uB294 \uCC3D\uACE0\xB7\uBC14\uB2E5\xB7\uC6B4\uBC18\xB7\uC7A5\uCC29 \uC7A5\uBE44\uB97C \uBAA8\uB450 \uD569\uD55C \uBAA9\uD45C\uC785\uB2C8\uB2E4. \uB2F4\uB2F9 \uC8FC\uBBFC\uC774 \uBAA9\uC7AC\uC640 \uAC15\uCCA0\uC744 \uC62E\uACA8 \uC2E4\uC81C\uB85C \uC791\uC5C5\uD558\uBA70, \uC644\uC131\uD488\uB3C4 \uCC3D\uACE0\uB85C \uB098\uB978 \uB4A4 \uC0AC\uC6A9\uD560 \uC218 \uC788\uC2B5\uB2C8\uB2E4.</p><p>\uC8FC\uBBFC\uC744 \uC120\uD0DD\uD574 \uC18C\uCD1D\xB7\uC870\uB07C\xB7\uC791\uC5C5 \uB3C4\uAD6C\uB97C \uC9C0\uAE09\uD558\uC138\uC694. <b>\uBE44\uC9D5\uC9D1 \uC8FC\uBBFC\uC774 \uC9C1\uC811 \uCC3D\uACE0\uC5D0\uC11C \uC218\uB839\uD574\uC57C \uC7A5\uCC29</b>\uB429\uB2C8\uB2E4. \uC18C\uCD1D\uC740 \uB354 \uBA40\uB9AC \uAC15\uD558\uAC8C \uC0AC\uACA9\uD558\uACE0, \uC870\uB07C\uB294 \uCD1D\uD0C4 \uD53C\uD574\uB97C \uC904\uC774\uBA70, \uB3C4\uAD6C\uB294 \uAC74\uC124\xB7\uC218\uB9AC\xB7\uB18D\uC0AC\xB7\uCC44\uC9D1\xB7\uCC44\uAD11\xB7\uC81C\uC791\uC744 \uBE60\uB974\uAC8C \uD569\uB2C8\uB2E4.</p><p><b>\uAD50\uC5ED</b> \uD0ED\uC5D0\uC11C\uB294 \uBC29\uBB38 \uC911\uC778 \uC0C1\uC778\uC5D0\uAC8C \uBB3C\uD488\uC744 \uC0AC\uACE0 \uD314 \uC218 \uC788\uC2B5\uB2C8\uB2E4. \uC0C1\uC778\uC758 \uC7AC\uACE0\uC640 \uC740\uD654\uC5D0\uB294 \uD55C\uB3C4\uAC00 \uC788\uC2B5\uB2C8\uB2E4. \uAD6C\uB9E4\uD488\uACFC \uD310\uB9E4 \uB300\uAE08\uC740 \uC0C1\uC778 \uBC1C\uBC11\uC5D0 \uB193\uC774\uBBC0\uB85C \uC6B4\uBC18 \uB2F4\uB2F9\uC744 \uB0A8\uACA8 \uB450\uC138\uC694. \uC74C\uC2DD\uC740 \uAD6C\uB9E4\uB9CC \uAC00\uB2A5\uD558\uACE0, \uC2B5\uACA9\uC774\uB098 \uC0C1\uC778 \uC704\uCE58\uC758 \uD654\uC7AC\uAC00 \uBC1C\uC0DD\uD558\uBA74 \uC0C1\uC778\uC740 \uB5A0\uB0A9\uB2C8\uB2E4.</p>
  <h3>\uC8FC\uC694 \uC870\uC791</h3><div class="guide-controls"><span><kbd>\uD074\uB9AD / \uD130\uCE58</kbd> \uC120\uD0DD \xB7 \uB3C4\uAD6C \uC0AC\uC6A9</span><span><kbd>\uAD6C\uC5ED \uB4DC\uB798\uADF8</kbd> \uC0AC\uAC01\uD615 \uC601\uC5ED \uC9C0\uC815</span><span><kbd>\uC120\uD0DD \uBAA8\uB4DC \uB4DC\uB798\uADF8</kbd> \uC9C0\uB3C4 \uC774\uB3D9</span><span><kbd>\uD720 / \uD540\uCE58 / \uFF0B \u2212</kbd> \uD655\uB300 \xB7 \uCD95\uC18C</span><span><kbd>Shift+\uC8FC\uBBFC \uC120\uD0DD</kbd> \uC5EC\uB7EC \uBA85 \uC120\uD0DD</span><span><kbd>Ctrl+A</kbd> \uC815\uCC29\uBBFC \uC804\uC6D0 \uC120\uD0DD</span><span><kbd>SPACE</kbd> \uC815\uC9C0 \xB7 \uC7AC\uC0DD</span><span><kbd>1 / 2 / 3</kbd> 1\xD7 \xB7 3\xD7 \xB7 6\xD7</span><span><kbd>Q / B / E / Z</kbd> \uBA85\uB839 \xB7 \uAC74\uC124 \xB7 \uC124\uBE44 \xB7 \uAD6C\uC5ED</span><span><kbd>R / X</kbd> \uC9D5\uC9D1 \xB7 \uD604\uC7AC \uC704\uCE58 \uC0AC\uC218</span><span><kbd>C / L</kbd> \uC758\uB8CC\xB7\uC18C\uBC29 \xB7 \uD558\uB8E8 \uC77C\uC815</span><span><kbd>I / O</kbd> \uC81C\uC791\xB7\uC7A5\uBE44 \xB7 \uAD50\uC5ED</span><span><kbd>J / T / P</kbd> \uC5F0\uAD6C \xB7 \uC628\uB3C4 \xB7 \uC804\uB825\uB9DD</span><span><kbd>WASD / \uBC29\uD5A5\uD0A4</kbd> \uC9C0\uB3C4 \uC774\uB3D9</span><span><kbd>ESC</kbd> \uC120\uD0DD \uB3C4\uAD6C\uB85C \uBCF5\uADC0</span></div>
  <div class="guide-note"><b>\uC5C4\uD3D0\uC640 \uC804\uD22C \uD6C4 \uD68C\uBCF5</b><br>\uBC29\uBCBD\uC740 \uC801\uACFC \uC8FC\uBBFC \uC0AC\uC774\uC5D0 \uB450\uC138\uC694. \uB4A4\uCABD\uC5D0 \uC788\uB294 \uBC29\uBCBD\uC740 \uC55E\uC5D0\uC11C \uC624\uB294 \uACF5\uACA9\uC744 \uB9C9\uC544 \uC8FC\uC9C0 \uC54A\uC2B5\uB2C8\uB2E4. \uC9D5\uC9D1 \uC8FC\uBBFC \uC120\uD0DD \uD6C4 \uB545\uC744 \uB204\uB974\uBA74 \uC774\uB3D9\uD558\uACE0, \uC801\uC744 \uB204\uB974\uBA74 \uACF5\uACA9\uD569\uB2C8\uB2E4. \uC704\uCE58 \uC0AC\uC218\uB294 \uC774\uB3D9\uC744 \uBA48\uCD94\uACE0 \uD604\uC7AC \uC790\uB9AC\uB97C \uC9C0\uD0B5\uB2C8\uB2E4. \uC804\uD22C \uD6C4\uC5D0\uB294 \uC9D5\uC9D1\uC744 \uD574\uC81C\uD558\uC138\uC694.</div>
  <h3>\uC800\uC7A5\uACFC \uC9C4\uD589</h3><p>20\uCD08\uB9C8\uB2E4 \uC774 \uBE0C\uB77C\uC6B0\uC800\uC5D0 \uC790\uB3D9 \uC800\uC7A5\uB429\uB2C8\uB2E4. JSON \uB0B4\uBCF4\uB0B4\uAE30\xB7\uAC00\uC838\uC624\uAE30\uB85C \uB2E4\uB978 \uAE30\uAE30\uC5D0\uC11C\uB3C4 \uC774\uC5B4\uAC08 \uC218 \uC788\uC2B5\uB2C8\uB2E4. v1\xB7v2\xB7v3 \uC800\uC7A5\uC744 \uC9C0\uC6D0\uD558\uBA70, \uB2E4\uB978 \uD0ED\uC744 \uBCF4\uB294 \uB3D9\uC548\uC5D0\uB294 \uC2DC\uAC04\uC774 \uC9C4\uD589\uB418\uC9C0 \uC54A\uC2B5\uB2C8\uB2E4.</p><p>\uC2B5\uACA9\xB7\uC0C8 \uD654\uC7AC\xB7\uC8FC\uBBFC \uC4F0\uB7EC\uC9D0 \uC2DC \uC790\uB3D9 \uC815\uC9C0\uAC00 \uAE30\uBCF8\uC73C\uB85C \uCF1C\uC838 \uC788\uC2B5\uB2C8\uB2E4. \uBA54\uB274\uC5D0\uC11C \uBC14\uAFC0 \uC218 \uC788\uC2B5\uB2C8\uB2E4. \uACBD\uBCF4\uB97C \uD655\uC778\uD55C \uB4A4 \uC7AC\uC0DD \uBC84\uD2BC\uC73C\uB85C \uC9C4\uD589\uD558\uC138\uC694.</p><p class="menu-meta">\uB3C5\uB9BD\uC801\uC73C\uB85C \uAD6C\uD604\uD55C \uC815\uCC29\uC9C0 \uC0DD\uC874 \uAC8C\uC784\uC785\uB2C8\uB2E4. \uC6D0\uC791 \uC5D0\uC14B\uC774\uB098 \uCF54\uB4DC\uB97C \uC0AC\uC6A9\uD558\uC9C0 \uC54A\uC558\uC2B5\uB2C8\uB2E4.</p><button class="button primary wide" data-action="close-dialog">\uC815\uCC29\uC9C0\uB85C \uB3CC\uC544\uAC00\uAE30 ${icon("arrow")}</button>`);
  }
  function showMenu() {
    let available = false;
    try {
      available = !!localStorage.getItem(SAVE_KEY);
    } catch {
    }
    openDialog("\uC7A0\uC2DC, \uC228\uC744 \uACE0\uB974\uAE30", "COLONY MENU", `<p>\uC815\uCC29\uC9C0\uC758 \uC2DC\uAC04\uC740 \uC7A0\uC2DC \uBA48\uCDC4\uC2B5\uB2C8\uB2E4.</p><div class="menu-grid"><button class="button" data-action="save">${icon("save")}\uC9C0\uAE08 \uC800\uC7A5</button><button class="button" data-action="load" ${available ? "" : "disabled"}>${icon("clock")}\uB9C8\uC9C0\uB9C9 \uC800\uC7A5 \uBD88\uB7EC\uC624\uAE30</button><button class="button ghost" data-action="export">\uC800\uC7A5 \uD30C\uC77C \uB0B4\uBCF4\uB0B4\uAE30</button><button class="button ghost" data-action="import">\uC800\uC7A5 \uD30C\uC77C \uAC00\uC838\uC624\uAE30</button><button class="button ghost" data-action="fit-all">\uC9C0\uB3C4 \uC804\uCCB4 \uBCF4\uAE30</button><button class="button ghost" data-action="help">\uD50C\uB808\uC774 \uAC00\uC774\uB4DC</button></div><div class="setting-row"><span>\uC2B5\uACA9\xB7\uD654\uC7AC\xB7\uC4F0\uB7EC\uC9D0 \uC790\uB3D9 \uC815\uC9C0</span><button class="toggle ${ui.autoPause ? "on" : ""}" data-action="toggle-autopause" role="switch" aria-label="\uC704\uAE30 \uBC1C\uC0DD \uC2DC \uC790\uB3D9 \uC815\uC9C0" aria-checked="${ui.autoPause}"></button></div>${recoverySave ? '<button class="button ghost wide" data-action="export-recovery">\uC77D\uC9C0 \uBABB\uD55C \uC774\uC804 \uC800\uC7A5 \uC6D0\uBCF8 \uB0B4\uBCF4\uB0B4\uAE30</button>' : ""}<div class="section-divider"></div><button class="button wide" data-action="new-game">\uC0C8\uB85C\uC6B4 \uC815\uCC29\uC9C0 \uC2DC\uC791</button><p class="menu-meta">\uC9C0\uB3C4 \uC528\uC557 ${game.state.seed} \xB7 ${game.state.difficulty === "relaxed" ? "\uC5EC\uC720\uB85C\uC6B4 \uC815\uCC29" : "\uD45C\uC900 \uC0DD\uC874"}<br>\uC800\uC7A5\uC740 \uC774 \uBE0C\uB77C\uC6B0\uC800\uC5D0 \uBCF4\uAD00\uB429\uB2C8\uB2E4. \uAE30\uAE30\uB97C \uBC14\uAFB8\uAE30 \uC804 \uD30C\uC77C\uB85C \uB0B4\uBCF4\uB0B4 \uC8FC\uC138\uC694.</p><button class="button primary wide" data-action="close-dialog">\uC815\uCC29\uC9C0\uB85C \uB3CC\uC544\uAC00\uAE30 ${icon("arrow")}</button>`);
  }
  function showNewGame() {
    const randomSeed = crypto.getRandomValues(new Uint32Array(1))[0] % 2147483647;
    openDialog("\uB610 \uB2E4\uB978 \uCCAB\uB0A0", "NEW BEGINNING", `<p>\uC0C8\uB85C\uC6B4 \uB545\uC5D0 \uC138 \uBA85\uC758 \uC815\uCC29\uBBFC\uC774 \uB3C4\uCC29\uD569\uB2C8\uB2E4. \uC2DC\uC791\uD558\uBA74 \uD604\uC7AC \uC790\uB3D9 \uC800\uC7A5\uC744 \uC0C8 \uC815\uCC29\uC9C0\uB85C \uBC14\uAFC9\uB2C8\uB2E4.</p><div class="difficulty-grid"><label class="difficulty-choice"><input type="radio" name="difficulty" value="standard" checked><strong>\uD45C\uC900 \uC0DD\uC874</strong><small>\uC0DD\uD65C\uC744 \uC900\uBE44\uD558\uACE0 \uC2B5\uACA9\uC5D0 \uB300\uBE44\uD558\uB294 \uAE30\uBCF8 \uACBD\uD5D8\uC785\uB2C8\uB2E4.</small></label><label class="difficulty-choice"><input type="radio" name="difficulty" value="relaxed"><strong>\uC5EC\uC720\uB85C\uC6B4 \uC815\uCC29</strong><small>\uB290\uAE0B\uD558\uAC8C \uAC74\uC124\uD558\uACE0 \uB354 \uC5EC\uC720\uB86D\uAC8C \uC2B5\uACA9\uC744 \uC900\uBE44\uD569\uB2C8\uB2E4.</small></label></div><label for="seed" class="muted">\uC9C0\uB3C4 \uC528\uC557</label><input id="seed" class="seed-input" type="number" min="1" max="2147483647" value="${randomSeed}"><div class="button-row"><button class="button ghost" data-action="export">\uD604\uC7AC \uC800\uC7A5 \uB0B4\uBCF4\uB0B4\uAE30</button><button class="button primary" data-action="confirm-new">\uC815\uCC29\uC9C0 \uC2DC\uC791 ${icon("arrow")}</button></div>`);
  }
  function showOutcome(won) {
    const s = game.getSummary();
    openDialog(won ? "\uC6B0\uB9AC\uC758 \uC2E0\uD638\uAC00 \uB2FF\uC558\uC2B5\uB2C8\uB2E4" : "\uC232\uC5D0 \uB0A8\uACA8\uC9C4 \uC774\uC57C\uAE30", won ? "SIGNAL RECEIVED" : "COLONY LOST", `<div class="victory-hero">${icon(won ? "beacon" : "mark")}</div><p>${won ? "\uBA40\uB9AC\uC11C \uC751\uB2F5\uC774 \uB4E4\uB824\uC635\uB2C8\uB2E4. \uB0AF\uC120 \uB545\uC5D0\uC11C \uC2DC\uC791\uD55C \uC791\uC740 \uC815\uCC29\uC9C0\uAC00 \uB05D\uB0B4 \uB0B4\uC77C\uC744 \uC5BB\uC5C8\uC2B5\uB2C8\uB2E4. \uC774\uACF3\uC5D0 \uB0A8\uC544 \uC774\uC57C\uAE30\uB97C \uC774\uC5B4\uAC08 \uC218\uB3C4 \uC788\uC2B5\uB2C8\uB2E4." : "\uB9C8\uC9C0\uB9C9 \uC815\uCC29\uBBFC\uC774 \uC4F0\uB7EC\uC84C\uC2B5\uB2C8\uB2E4. \uB2E4\uC74C \uC815\uCC29\uC9C0\uC5D0\uC11C\uB294 \uC774\uACF3\uC5D0\uC11C \uBC30\uC6B4 \uAC83\uC744 \uAC00\uC838\uAC08 \uC218 \uC788\uC2B5\uB2C8\uB2E4."}</p><div class="stats-grid"><div><strong>${s.day}</strong><span>\uAE30\uB85D\uB41C \uB0A0</span></div><div><strong>${s.alive}</strong><span>\uC0DD\uC874\uC790</span></div><div><strong>${game.state.stats.survivedRaids}</strong><span>\uB9C9\uC544 \uB0B8 \uC2B5\uACA9</span></div></div><div class="button-row">${won ? '<button class="button primary" data-action="close-dialog">\uC774\uC57C\uAE30 \uACC4\uC18D\uD558\uAE30</button>' : ""}<button class="button ${won ? "ghost" : "primary"}" data-action="new-game">\uC0C8\uB85C\uC6B4 \uC815\uCC29\uC9C0</button></div>`);
    saveGame();
  }
  function exportSave() {
    const blob = new Blob([JSON.stringify(makeSave(), null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob), a = document.createElement("a");
    a.href = url;
    a.download = `frontier-colony-day${game.getSummary().day}-${(/* @__PURE__ */ new Date()).toISOString().slice(0, 10)}.json`;
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1e3);
    toast("\uC800\uC7A5 \uD30C\uC77C\uC744 \uB0B4\uBCF4\uB0C8\uC2B5\uB2C8\uB2E4.", "success");
  }
  function action(name, element = null) {
    const pawn = game.state.colonists.find((p) => p.id === ui.selectedId && !p.dead);
    const group = selectedPawns();
    switch (name) {
      case "close-dialog":
        closeDialog();
        break;
      case "save":
        saveGame(true);
        break;
      case "help":
        showHelp();
        break;
      case "new-game":
        showNewGame();
        break;
      case "confirm-new": {
        const seed = Number($("#seed").value);
        if (!Number.isInteger(seed) || seed < 1 || seed > 2147483647) {
          toast("\uC9C0\uB3C4 \uC528\uC557\uC740 1~2147483647 \uC0AC\uC774\uC758 \uC815\uC218\uB85C \uC785\uB825\uD574 \uC8FC\uC138\uC694.", "error");
          return;
        }
        const difficulty = $('input[name="difficulty"]:checked').value;
        closeDialog();
        replaceGame(new ColonyGame({ seed, difficulty }), "\uC0C8\uB85C\uC6B4 \uC815\uCC29\uC9C0\uAC00 \uC2DC\uC791\uB418\uC5C8\uC2B5\uB2C8\uB2E4.");
        break;
      }
      case "load":
        try {
          const next = readSave(localStorage.getItem(SAVE_KEY) || "");
          closeDialog();
          replaceGame(next, "\uB9C8\uC9C0\uB9C9 \uC800\uC7A5\uC744 \uBD88\uB7EC\uC654\uC2B5\uB2C8\uB2E4.");
        } catch {
          toast("\uC800\uC7A5 \uB0B4\uC6A9\uC744 \uBD88\uB7EC\uC62C \uC218 \uC5C6\uC2B5\uB2C8\uB2E4. \uD30C\uC77C\uC744 \uAC00\uC838\uC624\uAC70\uB098 \uC0C8 \uC815\uCC29\uC9C0\uB97C \uC2DC\uC791\uD574 \uC8FC\uC138\uC694.", "error", 5e3);
        }
        break;
      case "export":
        exportSave();
        break;
      case "import":
        $("#import-input").click();
        break;
      case "fit-all":
        closeDialog();
        renderer.fit();
        break;
      case "draft-all":
        draftAll();
        break;
      case "draft-selected": {
        const standing = group.filter((p) => p.health >= 15 && !p.carriedBy);
        if (standing.length) {
          const value = !standing.every((p) => p.drafted);
          standing.forEach((p) => execute("draft", { id: p.id, value }));
          setTool("select");
          renderUI();
        }
        break;
      }
      case "hold-selected": {
        const drafted = group.filter((p) => p.drafted && p.health >= 15);
        if (!drafted.length) {
          toast("\uC704\uCE58\uB97C \uC0AC\uC218\uD560 \uC9D5\uC9D1 \uC8FC\uBBFC\uC744 \uBA3C\uC800 \uC120\uD0DD\uD558\uC138\uC694.");
          break;
        }
        let count = 0;
        for (const p of drafted) if (execute("hold", { id: p.id }, { silent: true }).ok) count++;
        toast(`${count}\uBA85\uC774 \uC774\uB3D9\uC744 \uBA48\uCD94\uACE0 \uD604\uC7AC \uC704\uCE58\uB97C \uC9C0\uD0B5\uB2C8\uB2E4.`);
        renderUI();
        break;
      }
      case "focus-selected":
        if (group.length) {
          renderer.focus(group.reduce((n, p) => n + p.x, 0) / group.length, group.reduce((n, p) => n + p.y, 0) / group.length);
          $("#app").classList.remove("show-panel");
        }
        break;
      case "select-all":
        ui.selectedIds = game.state.colonists.filter((p) => !p.dead).map((p) => p.id);
        ui.selectedId = ui.selectedIds[0] || null;
        ui.selectedTile = null;
        setPane("inspect");
        setTool("select");
        renderUI();
        break;
      case "prioritize-tool":
        setCategory("orders");
        setTool("prioritize");
        $("#app").classList.remove("show-panel");
        break;
      case "show-research":
        setPane("research");
        break;
      case "show-systems":
        setPane("systems");
        break;
      case "show-work":
        setPane("work");
        break;
      case "show-industry":
        setPane("industry", true);
        break;
      case "show-trade":
        setPane("trade", true);
        break;
      case "build-workbench":
        setCategory("build");
        setTool("build:workbench");
        $("#app").classList.remove("show-panel");
        break;
      case "assign-crafter": {
        const worker = game.state.colonists.filter((p) => !p.dead && p.health >= 15 && !p.drafted && !p.carriedBy).sort((a, b) => b.skills.craft - a.skills.craft)[0];
        if (!worker) {
          toast("\uC81C\uC791\uD560 \uC218 \uC788\uB294 \uBE44\uC9D5\uC9D1 \uC8FC\uBBFC\uC774 \uC5C6\uC2B5\uB2C8\uB2E4.", "error");
          break;
        }
        execute("priority", { id: worker.id, work: "craft", value: 1 });
        toast(`${worker.name}\uC758 \uC81C\uC791 \uC6B0\uC120\uC21C\uC704\uB97C 1\uB85C \uC815\uD588\uC2B5\uB2C8\uB2E4.`, "success");
        renderSidebar();
        break;
      }
      case "focus-trader": {
        const visitor = game.state.trade.visitor;
        if (visitor) {
          renderer.focus(visitor.x, visitor.y);
          $("#app").classList.remove("show-panel");
        }
        break;
      }
      case "confirm-trade": {
        execute("trade", { traderId: element?.dataset.tradeTrader || game.state.trade.visitor?.id, side: ui.tradeSide, type: ui.tradeItem, count: ui.tradeCount }, { success: true });
        renderUI();
        break;
      }
      case "show-care":
        setPane("care", true);
        break;
      case "show-schedule":
        ui.schedulePawnId = pawn?.id || ui.schedulePawnId;
        setPane("schedule", true);
        break;
      case "enable-emergency":
        for (const p of game.state.colonists.filter((p2) => !p2.dead)) for (const work of ["firefight", "rescue"]) execute("priority", { id: p.id, work, value: 1 }, { silent: true });
        toast("\uC18C\uBC29\xB7\uAD6C\uC870 \uC791\uC5C5\uC744 \uC6B0\uC120\uC21C\uC704 1\uB85C \uCF30\uC2B5\uB2C8\uB2E4. \uBE44\uC9D5\uC9D1 \uC8FC\uBBFC\uC774 \uB300\uC751\uD569\uB2C8\uB2E4.", "success");
        renderUI();
        break;
      case "layer-power":
        setLayer("power");
        $("#app").classList.remove("show-panel");
        break;
      case "layer-temperature":
        setLayer("temperature");
        $("#app").classList.remove("show-panel");
        break;
      case "build-researchbench":
        setCategory("build");
        setTool("build:researchbench");
        $("#app").classList.remove("show-panel");
        break;
      case "build-horseshoes":
        setCategory("build");
        setTool("build:horseshoes");
        $("#app").classList.remove("show-panel");
        break;
      case "build-utilities":
        if (game.state.research.unlocked.includes("electricity")) {
          setCategory("utilities");
          setTool("build:solar");
          $("#app").classList.remove("show-panel");
        } else {
          setPane("research");
          toast("\uC804\uAE30 \uACF5\uD559 \uC5F0\uAD6C\uAC00 \uC644\uB8CC\uB418\uBA74 \uBC1C\uC804 \uC124\uBE44\uB97C \uAC74\uC124\uD560 \uC218 \uC788\uC2B5\uB2C8\uB2E4.");
        }
        break;
      case "close-panel":
        $("#app").classList.remove("show-panel");
        break;
      case "gather-selected":
        if (ui.selectedTile) execute("designate", { ...ui.selectedTile, kind: "gather" }, { success: true });
        renderSidebar();
        break;
      case "demolish-selected":
        if (ui.selectedTile) execute("demolish", ui.selectedTile, { success: true });
        renderSidebar();
        break;
      case "cancel-selected":
        if (ui.selectedTile) execute("cancel", ui.selectedTile, { success: true });
        renderSidebar();
        break;
      case "toggle-cook":
        execute("autoCook", { value: !game.state.autoCook });
        renderSidebar();
        break;
      case "toggle-repair":
        execute("autoRepair", { value: !game.state.autoRepair });
        renderSidebar();
        break;
      case "toggle-autopause":
        ui.autoPause = !ui.autoPause;
        try {
          localStorage.setItem(PREFS_KEY, JSON.stringify({ autoPause: ui.autoPause }));
        } catch {
        }
        showMenu();
        break;
      case "export-recovery":
        if (recoverySave) {
          const a = document.createElement("a"), url = URL.createObjectURL(new Blob([recoverySave], { type: "application/json" }));
          a.href = url;
          a.download = "frontier-colony-recovery.json";
          document.body.append(a);
          a.click();
          a.remove();
          setTimeout(() => URL.revokeObjectURL(url), 1e3);
        }
        break;
    }
  }
  function bindUI() {
    document.addEventListener("pointerdown", (e) => {
      if (e.target !== canvas) ui.interacting = true;
    });
    document.addEventListener("pointerup", () => {
      ui.interacting = false;
    });
    document.addEventListener("pointercancel", () => {
      ui.interacting = false;
    });
    document.addEventListener("click", (e) => {
      const el = e.target.closest("button");
      if (!el) return;
      if (el.dataset.action) {
        action(el.dataset.action, el);
        return;
      }
      if (el.dataset.speed !== void 0) {
        setSpeed(Number(el.dataset.speed));
        return;
      }
      if (el.dataset.category) {
        setCategory(el.dataset.category);
        return;
      }
      if (el.dataset.tool) {
        const tool = Object.values(toolsByCategory).flat().find((t) => t.id === el.dataset.tool);
        if (tool?.tech && !game.state.research.unlocked.includes(tool.tech)) {
          setPane("research", true);
          toast(`${RESEARCH[tool.tech].label}\uC744 \uBA3C\uC800 \uC5F0\uAD6C\uD558\uC138\uC694.`);
          return;
        }
        if (el.dataset.tool === "draft-all") draftAll();
        else if (el.dataset.tool === "hold") action("hold-selected");
        else if (el.dataset.tool === "care") action("show-care");
        else setTool(el.dataset.tool);
        return;
      }
      if (el.dataset.pane) {
        setPane(el.dataset.pane);
        return;
      }
      if (el.dataset.pawn) {
        selectPawn(el.dataset.pawn, false, e.shiftKey);
        return;
      }
      if (el.dataset.focusPawn) {
        const p = game.state.colonists.find((p2) => p2.id === el.dataset.focusPawn);
        if (p) {
          renderer.focus(p.x, p.y);
          $("#app").classList.remove("show-panel");
        }
        return;
      }
      if (el.dataset.focusTile) {
        const [x, y] = el.dataset.focusTile.split(",").map(Number);
        renderer.focus(x + 0.5, y + 0.5);
        ui.selectedTile = { x, y };
        ui.selectedId = null;
        ui.selectedIds = [];
        $("#app").classList.remove("show-panel");
        return;
      }
      if (el.dataset.care) {
        requestCare(el.dataset.care, el.dataset.patient);
        return;
      }
      if (el.dataset.extinguish) {
        const [x, y] = el.dataset.extinguish.split(",").map(Number);
        requestFirefight(x, y);
        return;
      }
      if (el.dataset.medicalBed) {
        const [x, y] = el.dataset.medicalBed.split(",").map(Number), bed = game.tile(x, y)?.building;
        if (bed) execute("medicalBed", { x, y, value: !bed.medical }, { success: true });
        renderSidebar();
        return;
      }
      if (el.dataset.schedulePawn) {
        ui.schedulePawnId = el.dataset.schedulePawn;
        renderSidebar();
        return;
      }
      if (el.dataset.scheduleBrush) {
        ui.scheduleBrush = el.dataset.scheduleBrush;
        renderSidebar();
        return;
      }
      if (el.dataset.scheduleHour !== void 0) {
        execute("schedule", { id: el.dataset.scheduleId, hour: Number(el.dataset.scheduleHour), mode: ui.scheduleBrush });
        renderSidebar();
        return;
      }
      if (el.dataset.schedulePreset) {
        execute("schedulePreset", { id: el.dataset.scheduleId, preset: el.dataset.schedulePreset }, { success: true });
        renderSidebar();
        return;
      }
      if (el.dataset.billMode) {
        changeBill(el.dataset.billRecipe, { mode: el.dataset.billMode });
        return;
      }
      if (el.dataset.billDelta !== void 0) {
        const b = game.state.industry.bills[el.dataset.billRecipe];
        if (b) changeBill(el.dataset.billRecipe, { target: clamp7(b.target + Number(el.dataset.billDelta), 0, 99) });
        return;
      }
      if (el.dataset.billPause) {
        const b = game.state.industry.bills[el.dataset.billPause];
        if (b) changeBill(el.dataset.billPause, { paused: !b.paused });
        return;
      }
      if (el.dataset.billClear) {
        changeBill(el.dataset.billClear, { target: 0, paused: false });
        return;
      }
      if (el.dataset.equip) {
        execute("equip", { id: el.dataset.gearPawn, item: el.dataset.equip }, { success: true });
        renderSidebar();
        return;
      }
      if (el.dataset.unequip) {
        execute("unequip", { id: el.dataset.gearPawn, slot: el.dataset.unequip }, { success: true });
        renderSidebar();
        return;
      }
      if (el.dataset.tradeSide) {
        ui.tradeSide = el.dataset.tradeSide;
        renderSidebar();
        return;
      }
      if (el.dataset.tradeItem) {
        ui.tradeItem = el.dataset.tradeItem;
        renderSidebar();
        return;
      }
      if (el.dataset.tradeDelta !== void 0) {
        ui.tradeCount = clamp7(ui.tradeCount + Number(el.dataset.tradeDelta), 1, 100);
        renderSidebar();
        return;
      }
      if (el.dataset.tradeQuantity) {
        ui.tradeCount = clamp7(Number(el.dataset.tradeQuantity), 1, 100);
        renderSidebar();
        return;
      }
      if (el.dataset.research) {
        execute("research", { id: el.dataset.research }, { success: true });
        renderSidebar();
        renderTools();
        return;
      }
      if (el.dataset.room !== void 0) {
        const room = game.state.rooms.find((r) => String(r.id) === el.dataset.room);
        if (room?.tiles.length) {
          const x = room.tiles.reduce((n, i) => n + i % game.state.width + 0.5, 0) / room.tiles.length, y = room.tiles.reduce((n, i) => n + Math.floor(i / game.state.width) + 0.5, 0) / room.tiles.length;
          renderer.focus(x, y);
          if (ui.layer !== "temperature") setLayer("temperature");
          $("#app").classList.remove("show-panel");
        }
        return;
      }
      if (el.dataset.worker) {
        execute("priority", { id: el.dataset.worker, work: el.dataset.work, value: (Number(el.dataset.priority) + 1) % 5 });
        renderSidebar();
        return;
      }
    });
    $("#colonist-dock").addEventListener("dblclick", (e) => {
      const el = e.target.closest("[data-pawn]");
      if (el) selectPawn(el.dataset.pawn, true);
    });
    $("#sidebar-content").addEventListener("change", (e) => {
      if (e.target.id === "meal-target") {
        const n = clamp7(Math.round(Number(e.target.value) || 1), 1, 100);
        execute("autoCook", { value: game.state.autoCook, target: n });
        e.target.value = n;
      }
      if (e.target.id === "trade-count") {
        ui.tradeCount = clamp7(Math.round(Number(e.target.value) || 1), 1, 100);
        e.target.value = ui.tradeCount;
        renderSidebar();
      }
    });
    $("#save-button").onclick = () => saveGame(true);
    $("#help-button").onclick = showHelp;
    $("#menu-button").onclick = showMenu;
    $("#mobile-panel-toggle").onclick = () => $("#app").classList.toggle("show-panel");
    $("#panel-close").onclick = () => $("#app").classList.remove("show-panel");
    $("#fit-map").onclick = () => renderer.focus(23, 16);
    const zoom = (factor) => {
      const r = canvas.getBoundingClientRect();
      renderer.zoomAt(factor, r.left + r.width / 2, r.top + r.height / 2);
    };
    $("#zoom-in").onclick = () => zoom(1.25);
    $("#zoom-out").onclick = () => zoom(0.8);
    $("#grid-toggle").onclick = () => {
      ui.showGrid = !ui.showGrid;
      $("#grid-toggle").classList.toggle("active", ui.showGrid);
      $("#grid-toggle").setAttribute("aria-pressed", String(ui.showGrid));
    };
    $("#temperature-layer").onclick = () => setLayer("temperature");
    $("#power-layer").onclick = () => setLayer("power");
    dialog.addEventListener("cancel", (e) => {
      e.preventDefault();
      closeDialog();
    });
    $("#import-input").addEventListener("change", async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      try {
        if (file.size > 4e6) throw new Error("\uC800\uC7A5 \uD30C\uC77C\uC774 \uB108\uBB34 \uD07D\uB2C8\uB2E4.");
        const next = readSave(await file.text());
        closeDialog();
        replaceGame(next, "\uAC00\uC838\uC628 \uC815\uCC29\uC9C0\uB97C \uBD88\uB7EC\uC654\uC2B5\uB2C8\uB2E4.");
      } catch (error) {
        toast(`\uAC00\uC838\uC624\uC9C0 \uBABB\uD588\uC2B5\uB2C8\uB2E4. ${error.message || "\uC800\uC7A5 \uD30C\uC77C\uC744 \uD655\uC778\uD574 \uC8FC\uC138\uC694."}`, "error", 6e3);
      }
      e.target.value = "";
    });
    document.addEventListener("keydown", (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        saveGame(true);
        return;
      }
      if (dialog.open || /INPUT|TEXTAREA|SELECT/.test(e.target.tagName)) return;
      const key = e.key.toLowerCase();
      if ((e.ctrlKey || e.metaKey) && key === "a") {
        e.preventDefault();
        action("select-all");
        return;
      }
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if ([" ", "arrowup", "arrowdown", "arrowleft", "arrowright"].includes(key)) e.preventDefault();
      ui.keys.add(key);
      if (e.repeat) return;
      if (key === " ") setSpeed(ui.speed === 0 ? ui.lastSpeed : 0);
      else if (key === "1") setSpeed(1);
      else if (key === "2") setSpeed(3);
      else if (key === "3") setSpeed(6);
      else if (key === "escape") {
        setTool("select");
        setCategory("orders");
        $("#app").classList.remove("show-panel");
      } else if (key === "b") {
        setCategory("build");
        setTool("build:wall");
      } else if (key === "e") {
        setCategory("utilities");
      } else if (key === "q") {
        setCategory("orders");
        setTool("select");
      } else if (key === "z") {
        setCategory("zones");
        setTool("zone:farm");
      } else if (key === "f") renderer.focus(23, 16);
      else if (key === "g") $("#grid-toggle").click();
      else if (key === "t") setLayer("temperature");
      else if (key === "p") setLayer("power");
      else if (key === "j") setPane("research", true);
      else if (key === "c") setPane("care", true);
      else if (key === "l") action("show-schedule");
      else if (key === "i") action("show-industry");
      else if (key === "o") action("show-trade");
      else if (key === "x") action("hold-selected");
      else if (key === "r") {
        if (game.state.colonists.some((p) => p.id === ui.selectedId)) action("draft-selected");
        else draftAll();
      } else if (key === "?" || key === "h") showHelp();
    });
    document.addEventListener("keyup", (e) => ui.keys.delete(e.key.toLowerCase()));
    window.addEventListener("blur", () => {
      ui.keys.clear();
      ui.drag = null;
      ui.previewTiles = [];
      pointers.clear();
      pinch = null;
    });
    canvas.addEventListener("contextmenu", (e) => e.preventDefault());
    canvas.addEventListener("wheel", (e) => {
      e.preventDefault();
      renderer.zoomAt(e.deltaY < 0 ? 1.1 : 1 / 1.1, e.clientX, e.clientY);
    }, { passive: false });
    canvas.addEventListener("pointerdown", (e) => {
      if (dialog.open) return;
      e.preventDefault();
      canvas.focus({ preventScroll: true });
      canvas.setPointerCapture(e.pointerId);
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pointers.size === 2) {
        const [a, b] = [...pointers.values()];
        pinch = { distance: Math.hypot(a.x - b.x, a.y - b.y), x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
        ui.drag = null;
        ui.previewTiles = [];
        return;
      }
      const tile = renderer.screenToTile(e.clientX, e.clientY);
      const pan = e.button === 1 || e.button === 2 || ui.tool === "pan";
      ui.drag = { pointerId: e.pointerId, x: e.clientX, y: e.clientY, startX: e.clientX, startY: e.clientY, button: e.button, pan, moved: false, tile, painted: false, additive: e.shiftKey, shape: !pan && ui.tool.startsWith("zone:") ? "rect" : "stroke" };
      if (!pan && ui.tool !== "select" && ui.drag.shape !== "rect" && tile && e.pointerType !== "touch") {
        applyTool(tile);
        ui.drag.painted = true;
      }
    });
    canvas.addEventListener("pointermove", (e) => {
      ui.hover = renderer.screenToTile(e.clientX, e.clientY);
      if (ui.hover) {
        const t = game.tile(ui.hover.x, ui.hover.y);
        $("#coordinates").textContent = `${String(ui.hover.x).padStart(2, "0")} : ${String(ui.hover.y).padStart(2, "0")} \xB7 ${t?.roofed ? "\uC2E4\uB0B4" : "\uC2E4\uC678"}${ui.layer === "temperature" ? ` ${Math.round(t?.temperature ?? 0)}\xB0C` : ""}`;
      }
      if (pointers.has(e.pointerId)) pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pinch && pointers.size === 2) {
        const [a, b] = [...pointers.values()], d = Math.hypot(a.x - b.x, a.y - b.y), x = (a.x + b.x) / 2, y = (a.y + b.y) / 2;
        if (pinch.distance > 0) renderer.zoomAt(d / pinch.distance, x, y);
        renderer.pan(x - pinch.x, y - pinch.y);
        pinch = { distance: d, x, y };
        return;
      }
      const drag = ui.drag;
      if (!drag || drag.pointerId !== e.pointerId) return;
      const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
      if (Math.hypot(e.clientX - drag.startX, e.clientY - drag.startY) > 5) drag.moved = true;
      if (drag.pan || ui.tool === "select" && drag.moved) renderer.pan(dx, dy);
      else if (drag.shape === "rect" && ui.hover) {
        if (!drag.tile) drag.tile = ui.hover;
        ui.previewTiles = rectangleTiles(drag.tile, ui.hover);
      } else if (ui.tool !== "select" && ui.hover && drag.moved) {
        if (!drag.painted && drag.tile) {
          applyTool(drag.tile);
          drag.painted = true;
        }
        if (drag.tile) paintLine(drag.tile, ui.hover);
        else applyTool(ui.hover, true);
        drag.tile = ui.hover;
      }
      drag.x = e.clientX;
      drag.y = e.clientY;
    });
    function pointerEnd(e) {
      const drag = ui.drag;
      if (drag && drag.pointerId === e.pointerId && drag.shape === "rect" && e.type === "pointerup") {
        const end = renderer.screenToTile(e.clientX, e.clientY) || ui.hover;
        if (end) {
          const tiles = rectangleTiles(drag.tile || end, end);
          let count = 0, reason = "";
          for (const tile of tiles) {
            const result = execute("zone", { ...tile, kind: ui.tool.split(":")[1] }, { silent: true });
            if (result.ok) count++;
            else reason = result.message;
          }
          toast(count ? `${count}\uCE78\uC5D0 ${ui.tool === "zone:farm" ? "\uB18D\uC0AC" : "\uCC3D\uACE0"} \uAD6C\uC5ED\uC744 \uC9C0\uC815\uD588\uC2B5\uB2C8\uB2E4.${count < tiles.length ? ` ${tiles.length - count}\uCE78\uC740 \uBC30\uCE58\uD560 \uC218 \uC5C6\uC5B4 \uC81C\uC678\uD588\uC2B5\uB2C8\uB2E4.` : ""}` : reason, count ? "success" : "error");
        }
      } else if (drag && drag.pointerId === e.pointerId && !drag.moved && e.type === "pointerup") {
        const tile = renderer.screenToTile(e.clientX, e.clientY);
        if (tile && drag.button === 2) selectAt(tile, true);
        else if (tile && !drag.painted && ui.tool === "select") selectAt(tile, false, drag.additive);
        else if (tile && !drag.painted && !drag.pan) applyTool(tile);
      }
      pointers.delete(e.pointerId);
      pinch = null;
      ui.drag = null;
      ui.previewTiles = [];
      if (canvas.hasPointerCapture(e.pointerId)) canvas.releasePointerCapture(e.pointerId);
    }
    canvas.addEventListener("pointerup", pointerEnd);
    canvas.addEventListener("pointercancel", pointerEnd);
    canvas.addEventListener("pointerleave", () => {
      if (!ui.drag) ui.hover = null;
    });
    const ro = new ResizeObserver(() => renderer.resize());
    ro.observe($("#map-stage"));
    document.addEventListener("visibilitychange", () => {
      if (document.hidden) {
        saveGame();
        ui.keys.clear();
      }
      frameTime = 0;
    });
    window.addEventListener("pagehide", () => saveGame());
    setInterval(() => {
      if (!document.hidden && !dialog.open) saveGame();
    }, 2e4);
  }
  function frame(now) {
    const dt = frameTime ? Math.min((now - frameTime) / 1e3, 0.1) : 0;
    frameTime = now;
    if (!document.hidden) {
      if (ui.speed > 0 && !dialog.open && !game.state.gameOver) {
        let remaining = dt * ui.speed;
        while (remaining > 0) {
          const step = Math.min(remaining, 0.1);
          game.update(step);
          remaining -= step;
        }
      }
      if (!dialog.open) {
        const x = (ui.keys.has("a") || ui.keys.has("arrowleft") ? 1 : 0) - (ui.keys.has("d") || ui.keys.has("arrowright") ? 1 : 0);
        const y = (ui.keys.has("w") || ui.keys.has("arrowup") ? 1 : 0) - (ui.keys.has("s") || ui.keys.has("arrowdown") ? 1 : 0);
        if (x || y) renderer.pan(x * dt * 400, y * dt * 400);
      }
      renderer.render({ selectedId: ui.selectedId, selectedIds: ui.selectedIds, tool: ui.tool, hover: ui.hover, showGrid: ui.showGrid, showZones: ui.showZones, layer: ui.layer, previewTiles: ui.previewTiles, time: now });
      if (now - lastUiTime > 350) {
        renderUI();
        lastUiTime = now;
      }
    }
    requestAnimationFrame(frame);
  }
  function boot() {
    let loadError = false;
    try {
      const pref = JSON.parse(localStorage.getItem(PREFS_KEY) || "{}");
      if (typeof pref.autoPause === "boolean") ui.autoPause = pref.autoPause;
    } catch {
    }
    try {
      const saved = localStorage.getItem(SAVE_KEY);
      if (saved) {
        recoverySave = saved;
        game = readSave(saved);
        restored = true;
        recoverySave = null;
      }
    } catch {
      loadError = true;
      ui.persistenceBlocked = true;
      if (recoverySave) try {
        localStorage.setItem(RECOVERY_KEY, recoverySave);
      } catch {
      }
    }
    if (!recoverySave) try {
      recoverySave = localStorage.getItem(RECOVERY_KEY);
    } catch {
    }
    game || (game = new ColonyGame({ seed: 314159, difficulty: "standard" }));
    renderer = new ColonyRenderer(canvas, game);
    ui.seenVictory = game.state.victory;
    ui.seenGameOver = false;
    ui.lastLogId = game.state.logs[0]?.id;
    if (game.state.gameOver) ui.speed = 0;
    bindUI();
    setTool("select");
    setSpeed(ui.speed);
    renderUI();
    $("#loading-screen").classList.add("hidden");
    requestAnimationFrame(frame);
    if (loadError) toast("\uC774\uC804 \uC800\uC7A5\uC744 \uC77D\uC9C0 \uBABB\uD588\uC2B5\uB2C8\uB2E4. \uC6D0\uBCF8\uC740 \uB36E\uC5B4\uC4F0\uC9C0 \uC54A\uC558\uC73C\uBA70 \uBA54\uB274\uC5D0\uC11C \uB0B4\uBCF4\uB0BC \uC218 \uC788\uC2B5\uB2C8\uB2E4.", "error", 7500);
    else if (restored) toast("\uB9C8\uC9C0\uB9C9 \uAE30\uB85D\uC744 \uC774\uC5B4\uAC11\uB2C8\uB2E4. \uC758\uB8CC\xB7\uC18C\uBC29\uACFC \uD558\uB8E8 \uC77C\uC815\uC5D0\uC11C \uC0C8 \uC0DD\uD65C\uC744 \uC900\uBE44\uD558\uC138\uC694.", "success", 5e3);
    else toast("\uAC70\uCC98\uC758 \uB3D9\uCABD\xB7\uB0A8\uCABD \uBE48\uD2C8\uC744 \uB2EB\uACE0 \uC138 \uBC88\uC9F8 \uCE68\uB300\uB97C \uC900\uBE44\uD558\uC138\uC694. \uC758\uB8CC\xB7\uC18C\uBC29\uACFC \uC77C\uC815 \uD0ED\uC5D0\uC11C \uC11C\uB85C\uB97C \uB3CC\uBCFC \uC900\uBE44\uB3C4 \uD560 \uC218 \uC788\uC2B5\uB2C8\uB2E4.", "info", 7500);
  }
  try {
    boot();
  } catch (error) {
    console.error(error);
    $("#loading-screen").innerHTML = `${icon("mark", "brand-mark")}<b>\uC815\uCC29\uC9C0\uB97C \uC5F4\uC9C0 \uBABB\uD588\uC2B5\uB2C8\uB2E4.</b><span>\uD398\uC774\uC9C0\uB97C \uC0C8\uB85C \uACE0\uCE68\uD574 \uC8FC\uC138\uC694. \uBB38\uC81C\uAC00 \uACC4\uC18D\uB418\uBA74 \uC800\uC7A5 \uD30C\uC77C\uC744 \uD655\uC778\uD574 \uC8FC\uC138\uC694.</span><button class="button" onclick="location.reload()">\uB2E4\uC2DC \uC5F4\uAE30</button>`;
  }
})();
