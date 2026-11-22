#!/usr/bin/env node
/**
 * EVE burst error — Verified Data & Multi-Sight Sync Barrier Validator
 *
 * Validates:
 * 1. JSON & CSV parsing and bidirectional parity (characters, locations)
 * 2. Provenance tag validity (확인 / 해석 / 재구성안 / 검증 필요)
 * 3. Zero duplicate IDs and zero dangling references across all 6 datasets
 * 4. Cross-protagonist Sync Barrier invariants & directional checks
 * 5. Deadlock-freedom & topological resolvability (Kahn's DAG algorithm + walkthrough simulation from M_D0_01 to C_D6_01)
 * 6. Information asymmetry contract (distinct perceived vs true meanings)
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const VALID_TAGS = new Set(['확인', '해석', '재구성안', '검증 필요']);
const VALID_TRACKS = new Set(['kojiro', 'marina', 'both']);

const errors = [];
const warnings = [];

function fail(msg) {
  errors.push(msg);
}

function warn(msg) {
  warnings.push(msg);
}

function readJson(fileName) {
  const fullPath = path.join(__dirname, fileName);
  try {
    return JSON.parse(fs.readFileSync(fullPath, 'utf8'));
  } catch (err) {
    fail(`Failed to parse JSON ${fileName}: ${err.message}`);
    return null;
  }
}

function parseSimpleCsv(fileName) {
  const fullPath = path.join(__dirname, fileName);
  let raw;
  try {
    raw = fs.readFileSync(fullPath, 'utf8').trim();
  } catch (err) {
    fail(`Failed to read CSV ${fileName}: ${err.message}`);
    return [];
  }
  const lines = raw.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length < 2) {
    fail(`CSV ${fileName} has fewer than 2 lines`);
    return [];
  }
  const headers = lines[0].split(',').map((h) => h.trim());
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(',').map((c) => c.trim());
    if (cols.length !== headers.length) {
      fail(`CSV ${fileName} line ${i + 1}: expected ${headers.length} columns, got ${cols.length}`);
      continue;
    }
    const obj = {};
    for (let j = 0; j < headers.length; j++) {
      obj[headers[j]] = cols[j];
    }
    rows.push(obj);
  }
  return rows;
}

function checkUniqueIds(records, label) {
  const map = new Map();
  for (const rec of records) {
    if (!rec.id || typeof rec.id !== 'string') {
      fail(`${label}: record missing string id`);
      continue;
    }
    if (map.has(rec.id)) {
      fail(`${label}: duplicate id "${rec.id}"`);
    } else {
      map.set(rec.id, rec);
    }
    if (!VALID_TAGS.has(rec.verification_status)) {
      fail(`${label}[${rec.id}]: invalid verification_status "${rec.verification_status}"`);
    }
  }
  return map;
}

// 1. Load all datasets
const charactersData = readJson('characters.json');
const locationsData = readJson('locations.json');
const timelineData = readJson('timeline_chapters.json');
const barriersData = readJson('sync_barriers.json');
const cluesData = readJson('clues_and_asymmetry.json');
const itemsEndingsData = readJson('items_and_endings.json');

const charactersCsv = parseSimpleCsv('characters.csv');
const locationsCsv = parseSimpleCsv('locations.csv');

if (!charactersData || !locationsData || !timelineData || !barriersData || !cluesData || !itemsEndingsData) {
  console.error('FATAL: Could not load one or more JSON files.');
  for (const e of errors) console.error('  ERROR:', e);
  process.exit(1);
}

const characters = charactersData.characters ?? [];
const locations = locationsData.locations ?? [];
const scenes = timelineData.scenes ?? [];
const barriers = barriersData.sync_barriers ?? [];
const clues = cluesData.clues ?? [];
const items = itemsEndingsData.items ?? [];
const endings = itemsEndingsData.endings_and_outcomes ?? [];

// 2. Unique IDs & provenance tags
const charMap = checkUniqueIds(characters, 'characters.json');
const locMap = checkUniqueIds(locations, 'locations.json');
const sceneMap = checkUniqueIds(scenes, 'timeline_chapters.json');
const barrierMap = checkUniqueIds(barriers, 'sync_barriers.json');
const clueMap = checkUniqueIds(clues, 'clues_and_asymmetry.json');
const itemMap = checkUniqueIds(items, 'items_and_endings.json');
const endingMap = checkUniqueIds(endings, 'items_and_endings.json(endings)');

// 3. JSON <-> CSV parity
if (characters.length !== charactersCsv.length) {
  fail(`characters parity mismatch: JSON=${characters.length}, CSV=${charactersCsv.length}`);
} else {
  for (const row of charactersCsv) {
    const jsonRec = charMap.get(row.id);
    if (!jsonRec) {
      fail(`characters.csv id "${row.id}" not found in characters.json`);
      continue;
    }
    if (jsonRec.name_kr !== row.name_kr || jsonRec.name_jp !== row.name_jp || jsonRec.name_en !== row.name_en) {
      fail(`characters parity field mismatch for "${row.id}"`);
    }
    if (jsonRec.faction !== row.faction) {
      fail(`characters.csv faction mismatch for "${row.id}"`);
    }
    if (jsonRec.known_to_kojiro.initial_alias !== row.kojiro_initial_alias) {
      fail(`characters.csv kojiro_initial_alias mismatch for "${row.id}"`);
    }
    if (jsonRec.known_to_marina.initial_alias !== row.marina_initial_alias) {
      fail(`characters.csv marina_initial_alias mismatch for "${row.id}"`);
    }
  }
}

if (locations.length !== locationsCsv.length) {
  fail(`locations parity mismatch: JSON=${locations.length}, CSV=${locationsCsv.length}`);
} else {
  for (const row of locationsCsv) {
    const jsonRec = locMap.get(row.id);
    if (!jsonRec) {
      fail(`locations.csv id "${row.id}" not found in locations.json`);
      continue;
    }
    if (jsonRec.name_kr !== row.name_kr || jsonRec.name_jp !== row.name_jp || jsonRec.accessible_by !== row.accessible_by) {
      fail(`locations parity field mismatch for "${row.id}"`);
    }
    if (String(jsonRec.unlock_day) !== String(row.unlock_day)) {
      fail(`locations.csv unlock_day mismatch for "${row.id}"`);
    }
  }
}

// 4. Referential integrity: characters -> scenes, locations -> tracks, scenes -> locations/characters/prev_scenes
for (const c of characters) {
  for (const side of ['known_to_kojiro', 'known_to_marina']) {
    const reveal = c[side]?.truth_revealed_at_scene;
    if (reveal !== null && reveal !== undefined && !sceneMap.has(reveal)) {
      fail(`characters[${c.id}].${side}.truth_revealed_at_scene references unknown scene "${reveal}"`);
    }
  }
}

for (const l of locations) {
  if (!VALID_TRACKS.has(l.accessible_by)) {
    fail(`locations[${l.id}]: invalid accessible_by "${l.accessible_by}"`);
  }
}

const eventToEmitterScene = new Map();
for (const s of scenes) {
  if (!VALID_TRACKS.has(s.track)) {
    fail(`scenes[${s.id}]: invalid track "${s.track}"`);
  }
  for (const locId of s.location_ids ?? []) {
    if (!locMap.has(locId)) fail(`scenes[${s.id}]: unknown location_id "${locId}"`);
  }
  for (const charId of s.character_ids ?? []) {
    if (!charMap.has(charId)) fail(`scenes[${s.id}]: unknown character_id "${charId}"`);
  }
  for (const prevId of s.prev_scene_ids ?? []) {
    if (!sceneMap.has(prevId)) fail(`scenes[${s.id}]: unknown prev_scene_id "${prevId}"`);
  }
  for (const evtId of s.emits_event_ids ?? []) {
    if (eventToEmitterScene.has(evtId)) {
      fail(`Duplicate emitted event "${evtId}" in scenes "${eventToEmitterScene.get(evtId)}" and "${s.id}"`);
    } else {
      eventToEmitterScene.set(evtId, s.id);
    }
  }
}

// 5. Sync barrier referential integrity & cross-protagonist rules
for (const b of barriers) {
  if (!VALID_TRACKS.has(b.blocked_protagonist)) {
    fail(`barrier[${b.id}]: invalid blocked_protagonist "${b.blocked_protagonist}"`);
  }
  if (!VALID_TRACKS.has(b.unlocking_protagonist)) {
    fail(`barrier[${b.id}]: invalid unlocking_protagonist "${b.unlocking_protagonist}"`);
  }
  if (b.barrier_type !== 'final_convergence' && b.blocked_protagonist === b.unlocking_protagonist) {
    fail(`barrier[${b.id}]: non-convergence barrier has identical blocked and unlocking protagonist "${b.blocked_protagonist}"`);
  }
  if (!sceneMap.has(b.blocked_scene)) {
    fail(`barrier[${b.id}]: unknown blocked_scene "${b.blocked_scene}"`);
  }
  if (!sceneMap.has(b.unlocking_scene)) {
    fail(`barrier[${b.id}]: unknown unlocking_scene "${b.unlocking_scene}"`);
  }
  if (!eventToEmitterScene.has(b.unlocking_event_id)) {
    fail(`barrier[${b.id}]: unlocking_event_id "${b.unlocking_event_id}" is never emitted by any scene`);
  }
  for (const reqEvt of b.required_event_ids ?? []) {
    if (!eventToEmitterScene.has(reqEvt)) {
      fail(`barrier[${b.id}]: required_event_id "${reqEvt}" is never emitted by any scene`);
    }
  }
}

// 6. Clues & asymmetry integrity
for (const cl of clues) {
  if (!sceneMap.has(cl.acquired_at_scene)) {
    fail(`clue[${cl.id}]: unknown acquired_at_scene "${cl.acquired_at_scene}"`);
  }
  if (!sceneMap.has(cl.shared_at_scene)) {
    fail(`clue[${cl.id}]: unknown shared_at_scene "${cl.shared_at_scene}"`);
  }
  for (const cid of cl.related_character_ids ?? []) {
    if (!charMap.has(cid)) fail(`clue[${cl.id}]: unknown related_character_id "${cid}"`);
  }
  for (const lid of cl.related_location_ids ?? []) {
    if (!locMap.has(lid)) fail(`clue[${cl.id}]: unknown related_location_id "${lid}"`);
  }
  if (!cl.perceived_meaning_kojiro || !cl.perceived_meaning_marina || !cl.true_meaning) {
    fail(`clue[${cl.id}]: missing perceived or true meaning text`);
  }
  if (cl.perceived_meaning_kojiro === cl.true_meaning && cl.perceived_meaning_marina === cl.true_meaning) {
    warn(`clue[${cl.id}]: both protagonists already match true_meaning verbatim (low asymmetry)`);
  }
}

// 7. Items & endings integrity
for (const it of items) {
  if (!VALID_TRACKS.has(it.owner)) fail(`item[${it.id}]: invalid owner "${it.owner}"`);
  if (!sceneMap.has(it.acquired_scene)) fail(`item[${it.id}]: unknown acquired_scene "${it.acquired_scene}"`);
  if (!sceneMap.has(it.used_scene)) fail(`item[${it.id}]: unknown used_scene "${it.used_scene}"`);
}

for (const end of endings) {
  if (!sceneMap.has(end.trigger_scene)) fail(`ending[${end.id}]: unknown trigger_scene "${end.trigger_scene}"`);
  if (end.culprit_character_id !== null && !charMap.has(end.culprit_character_id)) {
    fail(`ending[${end.id}]: unknown culprit_character_id "${end.culprit_character_id}"`);
  }
}

// 8. DAG Acyclicity (Kahn's Algorithm) combining intra-track prev_scene_ids AND cross-track sync_barriers
const adj = new Map();
const inDegree = new Map();
for (const s of scenes) {
  adj.set(s.id, new Set());
  inDegree.set(s.id, 0);
}

function addEdge(from, to) {
  if (!adj.has(from) || !adj.has(to)) return;
  if (!adj.get(from).has(to)) {
    adj.get(from).add(to);
    inDegree.set(to, inDegree.get(to) + 1);
  }
}

for (const s of scenes) {
  for (const prevId of s.prev_scene_ids ?? []) {
    addEdge(prevId, s.id);
  }
}
for (const b of barriers) {
  for (const reqEvt of b.required_event_ids ?? []) {
    const emitter = eventToEmitterScene.get(reqEvt);
    if (emitter && emitter !== b.blocked_scene) {
      addEdge(emitter, b.blocked_scene);
    }
  }
}

const queue = [];
for (const [id, deg] of inDegree.entries()) {
  if (deg === 0) queue.push(id);
}

const topoOrder = [];
while (queue.length > 0) {
  const curr = queue.shift();
  topoOrder.push(curr);
  for (const nxt of adj.get(curr)) {
    inDegree.set(nxt, inDegree.get(nxt) - 1);
    if (inDegree.get(nxt) === 0) {
      queue.push(nxt);
    }
  }
}

if (topoOrder.length !== scenes.length) {
  const stuck = scenes.map((s) => s.id).filter((id) => !topoOrder.includes(id));
  fail(`DEADLOCK CYCLE DETECTED in scene+sync_barrier graph! Unresolvable scenes: ${stuck.join(', ')}`);
}

// 9. Deterministic Dual-Protagonist Walkthrough Simulation (Deadlock-Freedom Proof)
const completed = new Set();
const emittedEvents = new Set();
const unlockedBarriers = new Set();
const executionLog = [];

let progress = true;
while (progress && completed.size < scenes.length) {
  progress = false;
  for (const s of scenes) {
    if (completed.has(s.id)) continue;

    // Check intra-track predecessors
    const prevOk = (s.prev_scene_ids ?? []).every((pid) => completed.has(pid));
    if (!prevOk) continue;

    // Check all sync barriers blocking this scene
    const sceneBarriers = barriers.filter((b) => b.blocked_scene === s.id);
    const barriersOk = sceneBarriers.every((b) =>
      (b.required_event_ids ?? []).every((evt) => emittedEvents.has(evt))
    );
    if (!barriersOk) continue;

    // Advance scene
    for (const b of sceneBarriers) unlockedBarriers.add(b.id);
    completed.add(s.id);
    for (const evt of s.emits_event_ids ?? []) emittedEvents.add(evt);
    executionLog.push(`${s.id}(${s.track})`);
    progress = true;
  }
}

if (completed.size !== scenes.length) {
  const remaining = scenes.map((s) => s.id).filter((id) => !completed.has(id));
  fail(`WALKTHROUGH DEADLOCK: Could not reach scenes: ${remaining.join(', ')}`);
}
if (!completed.has('C_D6_01')) {
  fail('WALKTHROUGH FAILURE: Final convergence scene C_D6_01 was not reached');
}
if (unlockedBarriers.size !== barriers.length) {
  const locked = barriers.map((b) => b.id).filter((id) => !unlockedBarriers.has(id));
  fail(`BARRIER COVERAGE FAILURE: Unresolved barriers: ${locked.join(', ')}`);
}

// Report summary
console.log('=== EVE burst error Verified Data Validation ===');
console.log(`Characters : ${characters.length} (CSV parity OK: ${charactersCsv.length})`);
console.log(`Locations  : ${locations.length} (CSV parity OK: ${locationsCsv.length})`);
console.log(`Scenes     : ${scenes.length} (Kojiro: ${scenes.filter((s) => s.track === 'kojiro').length}, Marina: ${scenes.filter((s) => s.track === 'marina').length}, Convergence: ${scenes.filter((s) => s.track === 'both').length})`);
console.log(`SyncBarriers: ${barriers.length} (All unlocked: ${unlockedBarriers.size}/${barriers.length})`);
console.log(`Clues      : ${clues.length}`);
console.log(`Items      : ${items.length} | Endings/Outcomes: ${endings.length}`);
console.log(`DAG Topo   : ${topoOrder.length}/${scenes.length} acyclic & resolvable`);
console.log(`Walkthrough: ${executionLog.join(' -> ')}`);

if (warnings.length > 0) {
  console.log(`\nWarnings (${warnings.length}):`);
  for (const w of warnings) console.log('  WARN:', w);
}

if (errors.length > 0) {
  console.error(`\nFAILED with ${errors.length} error(s):`);
  for (const e of errors) console.error('  ERROR:', e);
  process.exit(1);
} else {
  console.log('\nPASS: 0 errors, 0 deadlocks, 100% referential integrity.');
  process.exit(0);
}
