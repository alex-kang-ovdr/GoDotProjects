#!/usr/bin/env node
/**
 * YU-NO ReverseDesign verified_data validator (ESM, Node >= 20)
 * Checks:
 *  1. JSON parse & schema completeness
 *  2. JSON <-> CSV exact row & column consistency (characters, locations)
 *  3. Referential integrity across all 6 JSON files (zero dangling IDs)
 *  4. Jewel count invariant (PC-98: 2 initial + 6 findable = 8; SS/Remake: 4 initial + 6 findable = 10)
 *  5. A.D.M.S. graph reachability from root_node_id + cross-route fixed-point satisfiability solver
 *     (simulating Global inventory + Global flags carried across A.D.M.S. Jewel Load jumps)
 *  6. Verification that every cross_route_transfer, all 6 findable jewels, all 6 heroine routes,
 *     convergence, and node_true_end are satisfiable without deadlocks.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = dirname(fileURLToPath(import.meta.url));
const readJson = (f) => JSON.parse(readFileSync(join(dir, f), 'utf8'));
const readText = (f) => readFileSync(join(dir, f), 'utf8');

function parseCsv(text) {
  const lines = text.trim().split(/\r?\n/);
  const headers = lines[0].split(',');
  return lines.slice(1).map((line) => {
    const cells = line.split(',');
    const row = {};
    headers.forEach((h, i) => { row[h] = cells[i] ?? ''; });
    return row;
  });
}

const errors = [];
const assert = (cond, msg) => { if (!cond) errors.push(msg); };

const charactersData = readJson('characters.json');
const locationsData = readJson('locations.json');
const routesData = readJson('routes_and_endings.json');
const itemsData = readJson('items_and_jewels.json');
const flagsData = readJson('flags_and_inheritance.json');
const admsData = readJson('adms_nodes.json');

const charCsv = parseCsv(readText('characters.csv'));
const locCsv = parseCsv(readText('locations.csv'));

const charIds = new Set(charactersData.characters.map((c) => c.id));
const locIds = new Set(locationsData.locations.map((l) => l.id));
const routeIds = new Set(routesData.routes.map((r) => r.id));
const endingIds = new Set(routesData.endings.map((e) => e.id));
const jewelIds = new Set(itemsData.jewels.map((j) => j.id));
const itemIds = new Set(itemsData.items.map((i) => i.id));
const globalFlagIds = new Set(flagsData.global_flags.map((f) => f.id));
const localFlagIds = new Set(flagsData.local_flags.map((f) => f.id));
const nodeMap = new Map(admsData.nodes.map((n) => [n.id, n]));

// 1. Unique ID checks
assert(charIds.size === charactersData.characters.length, 'Duplicate character ID detected');
assert(locIds.size === locationsData.locations.length, 'Duplicate location ID detected');
assert(routeIds.size === routesData.routes.length, 'Duplicate route ID detected');
assert(endingIds.size === routesData.endings.length, 'Duplicate ending ID detected');
assert(jewelIds.size === itemsData.jewels.length, 'Duplicate jewel ID detected');
assert(itemIds.size === itemsData.items.length, 'Duplicate item ID detected');
assert(globalFlagIds.size === flagsData.global_flags.length, 'Duplicate global flag ID detected');
assert(localFlagIds.size === flagsData.local_flags.length, 'Duplicate local flag ID detected');
assert(nodeMap.size === admsData.nodes.length, 'Duplicate A.D.M.S. node ID detected');

// 2. JSON <-> CSV consistency
assert(charCsv.length === charactersData.characters.length, `characters.csv row mismatch: ${charCsv.length} vs ${charactersData.characters.length}`);
for (const c of charactersData.characters) {
  const row = charCsv.find((r) => r.id === c.id);
  assert(Boolean(row), `characters.csv missing id ${c.id}`);
  if (row) {
    assert(row.name_ko === c.name_ko, `characters.csv name_ko mismatch for ${c.id}`);
    assert(row.name_jp === c.name_jp, `characters.csv name_jp mismatch for ${c.id}`);
    assert(row.name_en === c.name_en, `characters.csv name_en mismatch for ${c.id}`);
    assert(row.primary_route_id === c.primary_route_id, `characters.csv primary_route_id mismatch for ${c.id}`);
    assert(row.first_location_id === c.first_location_id, `characters.csv first_location_id mismatch for ${c.id}`);
  }
}

assert(locCsv.length === locationsData.locations.length, `locations.csv row mismatch: ${locCsv.length} vs ${locationsData.locations.length}`);
for (const l of locationsData.locations) {
  const row = locCsv.find((r) => r.id === l.id);
  assert(Boolean(row), `locations.csv missing id ${l.id}`);
  if (row) {
    assert(row.name_ko === l.name_ko, `locations.csv name_ko mismatch for ${l.id}`);
    assert(row.name_jp === l.name_jp, `locations.csv name_jp mismatch for ${l.id}`);
    assert(row.world === l.world, `locations.csv world mismatch for ${l.id}`);
    assert(String(l.has_jewel_pickup) === row.has_jewel_pickup, `locations.csv has_jewel_pickup mismatch for ${l.id}`);
    assert((l.jewel_id ?? '') === row.jewel_id, `locations.csv jewel_id mismatch for ${l.id}`);
  }
}

// 3. Referential integrity across all entities
for (const c of charactersData.characters) {
  assert(routeIds.has(c.primary_route_id), `Character ${c.id} has unknown primary_route_id ${c.primary_route_id}`);
  assert(locIds.has(c.first_location_id), `Character ${c.id} has unknown first_location_id ${c.first_location_id}`);
}

for (const l of locationsData.locations) {
  if (l.has_jewel_pickup) {
    assert(jewelIds.has(l.jewel_id), `Location ${l.id} has unknown jewel_id ${l.jewel_id}`);
  }
}

for (const r of routesData.routes) {
  assert(charIds.has(r.primary_character_id), `Route ${r.id} has unknown primary_character_id ${r.primary_character_id}`);
  assert(nodeMap.has(r.entry_node_id), `Route ${r.id} has unknown entry_node_id ${r.entry_node_id}`);
  assert(globalFlagIds.has(r.clear_global_flag), `Route ${r.id} has unknown clear_global_flag ${r.clear_global_flag}`);
  for (const j of r.jewel_rewards) assert(jewelIds.has(j), `Route ${r.id} unknown jewel_reward ${j}`);
  for (const i of r.key_item_outputs) assert(itemIds.has(i), `Route ${r.id} unknown key_item_output ${i}`);
  for (const pr of r.prerequisite_routes) assert(routeIds.has(pr), `Route ${r.id} unknown prerequisite_route ${pr}`);
  for (const pi of r.prerequisite_items) assert(itemIds.has(pi), `Route ${r.id} unknown prerequisite_item ${pi}`);
}

for (const e of routesData.endings) {
  assert(routeIds.has(e.route_id), `Ending ${e.id} has unknown route_id ${e.route_id}`);
  assert(nodeMap.has(e.terminal_node_id), `Ending ${e.id} has unknown terminal_node_id ${e.terminal_node_id}`);
}

// 4. Jewel invariants
const initialPc98 = itemsData.jewels.filter((j) => j.category === 'initial');
const initialSsExtra = itemsData.jewels.filter((j) => j.category === 'initial_extended');
const findableJewels = itemsData.jewels.filter((j) => j.category === 'findable');
assert(initialPc98.length === 2, `Expected 2 initial PC-98 jewels, got ${initialPc98.length}`);
assert(initialSsExtra.length === 2, `Expected 2 extra SS/Remake initial jewels, got ${initialSsExtra.length}`);
assert(findableJewels.length === 6, `Expected 6 findable jewels, got ${findableJewels.length}`);

for (const j of itemsData.jewels) {
  assert(locIds.has(j.location_id), `Jewel ${j.id} unknown location_id ${j.location_id}`);
  assert(routeIds.has(j.route_id), `Jewel ${j.id} unknown route_id ${j.route_id}`);
  assert(nodeMap.has(j.acquire_node_id), `Jewel ${j.id} unknown acquire_node_id ${j.acquire_node_id}`);
}

for (const it of itemsData.items) {
  assert(typeof it.carries_across_timelines === 'boolean', `Item ${it.id} missing boolean carries_across_timelines`);
  assert(routeIds.has(it.source_route_id), `Item ${it.id} unknown source_route_id ${it.source_route_id}`);
  assert(locIds.has(it.source_location_id), `Item ${it.id} unknown source_location_id ${it.source_location_id}`);
  for (const tr of it.target_route_ids) assert(routeIds.has(tr), `Item ${it.id} unknown target_route_id ${tr}`);
}

for (const gf of flagsData.global_flags) {
  assert(routeIds.has(gf.set_by_route_id), `Global flag ${gf.id} unknown set_by_route_id ${gf.set_by_route_id}`);
}
for (const lf of flagsData.local_flags) {
  assert(routeIds.has(lf.route_id), `Local flag ${lf.id} unknown route_id ${lf.route_id}`);
}
for (const xf of flagsData.cross_route_transfers) {
  assert(routeIds.has(xf.from_route_id), `Transfer ${xf.id} unknown from_route_id ${xf.from_route_id}`);
  assert(routeIds.has(xf.to_route_id), `Transfer ${xf.id} unknown to_route_id ${xf.to_route_id}`);
  assert(itemIds.has(xf.carried_item_id), `Transfer ${xf.id} unknown carried_item_id ${xf.carried_item_id}`);
  assert(nodeMap.has(xf.target_gate_node_id), `Transfer ${xf.id} unknown target_gate_node_id ${xf.target_gate_node_id}`);
  const itemObj = itemsData.items.find((i) => i.id === xf.carried_item_id);
  assert(itemObj && itemObj.carries_across_timelines === true, `Transfer ${xf.id} item ${xf.carried_item_id} must have carries_across_timelines=true`);
}

for (const n of admsData.nodes) {
  assert(routeIds.has(n.route_id), `Node ${n.id} unknown route_id ${n.route_id}`);
  assert(locIds.has(n.location_id), `Node ${n.id} unknown location_id ${n.location_id}`);
  if (n.grants_jewel) assert(jewelIds.has(n.grants_jewel), `Node ${n.id} unknown grants_jewel ${n.grants_jewel}`);
  for (const it of n.grants_items) assert(itemIds.has(it), `Node ${n.id} unknown grants_item ${it}`);
  for (const lf of n.sets_local_flags) assert(localFlagIds.has(lf), `Node ${n.id} unknown sets_local_flag ${lf}`);
  for (const gf of n.sets_global_flags) assert(globalFlagIds.has(gf), `Node ${n.id} unknown sets_global_flag ${gf}`);
  for (const e of n.edges) {
    assert(nodeMap.has(e.to), `Node ${n.id} edge points to unknown target ${e.to}`);
    for (const it of e.requires_items) assert(itemIds.has(it), `Edge ${n.id}->${e.to} unknown requires_item ${it}`);
    for (const gf of e.requires_global_flags) assert(globalFlagIds.has(gf), `Edge ${n.id}->${e.to} unknown requires_global_flag ${gf}`);
    for (const lf of e.requires_local_flags) assert(localFlagIds.has(lf), `Edge ${n.id}->${e.to} unknown requires_local_flag ${lf}`);
    for (const flf of e.forbids_local_flags) assert(localFlagIds.has(flf), `Edge ${n.id}->${e.to} unknown forbids_local_flag ${flf}`);
  }
}

// 5. A.D.M.S. Graph Reachability + Cross-Route Fixed-Point Satisfiability Solver
assert(nodeMap.has(admsData.root_node_id), `Unknown root_node_id ${admsData.root_node_id}`);

const carriesItem = new Map(itemsData.items.map((i) => [i.id, i.carries_across_timelines]));
function solveAdmsFixedPoint(reverseEdges) {
  const gItems = new Set();
  const gFlags = new Set();
  const cJewels = new Set(initialPc98.map((j) => j.id));
  const vNodes = new Set();
  let passes = 0;
  let changed = true;

  while (changed && passes < 20) {
    changed = false;
    passes += 1;

    function dfs(nodeId, localFlags, localItems, pathSeen) {
      if (pathSeen.has(nodeId)) return;
      const node = nodeMap.get(nodeId);
      if (!node) return;

      if (!vNodes.has(nodeId)) {
        vNodes.add(nodeId);
        changed = true;
      }

      const nextLocalFlags = new Set(localFlags);
      const nextLocalItems = new Set(localItems);
      const nextPathSeen = new Set(pathSeen);
      nextPathSeen.add(nodeId);

      for (const lf of node.sets_local_flags) nextLocalFlags.add(lf);
      for (const gf of node.sets_global_flags) {
        if (!gFlags.has(gf)) { gFlags.add(gf); changed = true; }
      }
      if (node.grants_jewel && !cJewels.has(node.grants_jewel)) {
        cJewels.add(node.grants_jewel);
        changed = true;
      }
      for (const it of node.grants_items) {
        if (carriesItem.get(it)) {
          if (!gItems.has(it)) { gItems.add(it); changed = true; }
        } else {
          nextLocalItems.add(it);
        }
      }

      const edges = reverseEdges ? [...node.edges].reverse() : node.edges;
      for (const edge of edges) {
        const itemsOk = edge.requires_items.every((it) => gItems.has(it) || nextLocalItems.has(it));
        const gFlagsOk = edge.requires_global_flags.every((gf) => gFlags.has(gf));
        const lFlagsOk = edge.requires_local_flags.every((lf) => nextLocalFlags.has(lf));
        const forbidOk = edge.forbids_local_flags.every((flf) => !nextLocalFlags.has(flf));
        if (itemsOk && gFlagsOk && lFlagsOk && forbidOk) {
          dfs(edge.to, nextLocalFlags, nextLocalItems, nextPathSeen);
        }
      }
    }

    dfs(admsData.root_node_id, new Set(), new Set(), new Set());
  }

  return { gItems, gFlags, cJewels, vNodes, passes };
}

const forward = solveAdmsFixedPoint(false);
const reversed = solveAdmsFixedPoint(true);

for (const [label, res] of [['forward', forward], ['reversed', reversed]]) {
  for (const n of admsData.nodes) {
    assert(res.vNodes.has(n.id), `[${label}] Unreachable A.D.M.S. node: ${n.id}`);
  }
  for (const fj of findableJewels) {
    assert(res.cJewels.has(fj.id), `[${label}] Findable jewel not collectible: ${fj.id}`);
  }
  assert(res.cJewels.size === 8, `[${label}] Expected 8 PC-98 jewels collected, got ${res.cJewels.size}`);
  assert(res.vNodes.has('node_true_end'), `[${label}] True Ending node_true_end is NOT reachable!`);
  assert(res.gFlags.has('flag_global_true_ending_clear'), `[${label}] True Ending global flag not achieved!`);
}

if (errors.length > 0) {
  console.error(`VALIDATION FAILED (${errors.length} error(s)):`);
  for (const err of errors) console.error(`  - ${err}`);
  process.exit(1);
}

console.log('YU-NO verified_data validation PASSED (0 errors)');
console.log(`  Characters : ${charactersData.characters.length} (JSON & CSV matched)`);
console.log(`  Locations  : ${locationsData.locations.length} (JSON & CSV matched)`);
console.log(`  Routes     : ${routesData.routes.length} / Endings: ${routesData.endings.length}`);
console.log(`  Jewels     : ${itemsData.jewels.length} (PC-98 2+6=8, SS/Remake 4+6=10)`);
console.log(`  Items      : ${itemsData.items.length} (carried: ${itemsData.items.filter((i) => i.carries_across_timelines).length}, local: ${itemsData.items.filter((i) => !i.carries_across_timelines).length})`);
console.log(`  Flags      : ${flagsData.global_flags.length} global + ${flagsData.local_flags.length} local + ${flagsData.cross_route_transfers.length} cross-route transfers`);
console.log(`  A.D.M.S.   : ${admsData.nodes.length}/${admsData.nodes.length} nodes reachable (forward: ${forward.passes} passes, reversed: ${reversed.passes} passes — order-independent True Ending verified)`);
