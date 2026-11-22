#!/usr/bin/env node
/**
 * 유작 (遺作 / Isaku) 원작 복원 데이터 자동 검증기 (Phase 2 확장)
 * - JSON / CSV 정합성 검증
 * - 모든 참조 ID 무결성(Dangling ID 0건) 검증
 * - 방 그래프 양방향/도달성, 핫스팟 공간 좌표(x,y), 잠금 출구-퍼즐 매칭 검증
 * - 퍼즐 및 아이템 생산-소비 의존성 DAG 비순환(Acyclic) + keyBreakBranch 검증
 * - dialogue_branches.json (미유키 호감도 매트릭스 및 전원 다지선다) 검증
 * - cipher_data.json (6x6 난수표 행·열 매칭 및 메모 단서 무결성) 검증
 * - 시작 방(rm_5f_music) -> 탈출구(rm_escape_exit) 정방향 시뮬레이션 완주 검증
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = dirname(fileURLToPath(import.meta.url));
const readJson = (name) => JSON.parse(readFileSync(join(dir, name), 'utf8'));
const readCsv = (name) => {
  const lines = readFileSync(join(dir, name), 'utf8').trim().split(/\r?\n/);
  const headers = lines[0].split(',');
  return lines.slice(1).map((line) => {
    const cols = line.split(',');
    const obj = {};
    headers.forEach((h, i) => { obj[h] = cols[i] ?? ''; });
    return obj;
  });
};

const VALID_CERTAINTY = new Set(['확인', '해석', '재구성안', '검증 필요']);
const errors = [];
const err = (msg) => errors.push(msg);

const charsData = readJson('characters.json');
const roomsData = readJson('rooms.json');
const itemsData = readJson('items.json');
const puzzlesData = readJson('puzzles.json');
const incEndData = readJson('incidents_and_endings.json');
const dialogueData = readJson('dialogue_branches.json');
const cipherData = readJson('cipher_data.json');

const charsCsv = readCsv('characters.csv');
const roomsCsv = readCsv('rooms.csv');
const itemsCsv = readCsv('items.csv');

const charMap = new Map();
const roomMap = new Map();
const hotspotToRoom = new Map();
const itemMap = new Map();
const puzzleMap = new Map();
const incidentMap = new Map();
const endingMap = new Map();
const dialogueMap = new Map();

// 1. Unique IDs, Certainty tags & Hotspot Spatial Coordinates
for (const c of charsData.characters) {
  if (charMap.has(c.id)) err(`Duplicate character id: ${c.id}`);
  charMap.set(c.id, c);
  if (!VALID_CERTAINTY.has(c.certainty)) err(`Invalid certainty on ${c.id}: ${c.certainty}`);
}
for (const r of roomsData.rooms) {
  if (roomMap.has(r.id)) err(`Duplicate room id: ${r.id}`);
  roomMap.set(r.id, r);
  if (!VALID_CERTAINTY.has(r.certainty)) err(`Invalid certainty on ${r.id}: ${r.certainty}`);
  for (const h of r.hotspots) {
    if (hotspotToRoom.has(h.id)) err(`Duplicate hotspot id: ${h.id}`);
    hotspotToRoom.set(h.id, r.id);
    if (typeof h.x !== 'number' || typeof h.y !== 'number' || h.x < 40 || h.x > 680 || h.y < 60 || h.y > 330) {
      err(`Hotspot ${h.id} in ${r.id} has invalid spatial coordinates: (${h.x}, ${h.y})`);
    }
  }
}
for (const it of itemsData.items) {
  if (itemMap.has(it.id)) err(`Duplicate item id: ${it.id}`);
  itemMap.set(it.id, it);
  if (!VALID_CERTAINTY.has(it.certainty)) err(`Invalid certainty on ${it.id}: ${it.certainty}`);
}
for (const p of puzzlesData.puzzles) {
  if (puzzleMap.has(p.id)) err(`Duplicate puzzle id: ${p.id}`);
  puzzleMap.set(p.id, p);
  if (!VALID_CERTAINTY.has(p.certainty)) err(`Invalid certainty on ${p.id}: ${p.certainty}`);
}
for (const inc of incEndData.incidents) {
  if (incidentMap.has(inc.id)) err(`Duplicate incident id: ${inc.id}`);
  incidentMap.set(inc.id, inc);
  if (!VALID_CERTAINTY.has(inc.certainty)) err(`Invalid certainty on ${inc.id}: ${inc.certainty}`);
}
for (const end of incEndData.endings) {
  if (endingMap.has(end.id)) err(`Duplicate ending id: ${end.id}`);
  endingMap.set(end.id, end);
  if (!VALID_CERTAINTY.has(end.certainty)) err(`Invalid certainty on ${end.id}: ${end.certainty}`);
}

// 2. JSON <-> CSV Parity
function checkParity(label, jsonList, csvList) {
  if (jsonList.length !== csvList.length) {
    err(`${label} count mismatch: json=${jsonList.length} vs csv=${csvList.length}`);
  }
  const jsonIds = jsonList.map((x) => x.id);
  const csvIds = csvList.map((x) => x.id);
  for (const id of jsonIds) if (!csvIds.includes(id)) err(`${label} CSV missing id: ${id}`);
  for (const id of csvIds) if (!jsonIds.includes(id)) err(`${label} JSON missing id: ${id}`);
}
checkParity('characters', charsData.characters, charsCsv);
checkParity('rooms', roomsData.rooms, roomsCsv);
checkParity('items', itemsData.items, itemsCsv);

// 3. Cross-reference integrity (Zero dangling IDs)
for (const c of charsData.characters) {
  if (c.initialRoomId !== null && !roomMap.has(c.initialRoomId)) {
    err(`Character ${c.id} references unknown initialRoomId: ${c.initialRoomId}`);
  }
}

if (!roomMap.has(roomsData.startRoomId)) err(`Unknown startRoomId: ${roomsData.startRoomId}`);
if (!roomMap.has(roomsData.goalRoomId)) err(`Unknown goalRoomId: ${roomsData.goalRoomId}`);

for (const r of roomsData.rooms) {
  for (const ex of r.exits) {
    if (!roomMap.has(ex.to)) {
      err(`Room ${r.id} exit points to unknown room: ${ex.to}`);
    } else {
      const target = roomMap.get(ex.to);
      const hasBack = target.exits.some((e) => e.to === r.id);
      if (!hasBack) err(`Room ${r.id} -> ${ex.to} is missing return exit edge`);
    }
    if (ex.locked) {
      if (!ex.unlockPuzzleId || !puzzleMap.has(ex.unlockPuzzleId)) {
        err(`Room ${r.id} -> ${ex.to} is locked with invalid unlockPuzzleId: ${ex.unlockPuzzleId}`);
      } else {
        const puz = puzzleMap.get(ex.unlockPuzzleId);
        const matches = puz.unlocksExits.some((u) => u.from === r.id && u.to === ex.to);
        if (!matches) {
          err(`Puzzle ${puz.id} does not declare unlocksExits for ${r.id} -> ${ex.to}`);
        }
      }
    }
  }
}

for (const it of itemsData.items) {
  if (!roomMap.has(it.pickupRoomId)) err(`Item ${it.id} references unknown pickupRoomId: ${it.pickupRoomId}`);
  if (it.pickupPuzzleId !== null && !puzzleMap.has(it.pickupPuzzleId)) {
    err(`Item ${it.id} references unknown pickupPuzzleId: ${it.pickupPuzzleId}`);
  }
  for (const hs of it.targetHotspotIds) {
    if (!hotspotToRoom.has(hs)) err(`Item ${it.id} references unknown targetHotspotId: ${hs}`);
  }
  for (const cw of it.combineWith) {
    if (!itemMap.has(cw)) err(`Item ${it.id} combineWith references unknown item: ${cw}`);
  }
}

const itemProducerPuzzle = new Map();
for (const p of puzzlesData.puzzles) {
  if (!roomMap.has(p.roomId)) err(`Puzzle ${p.id} references unknown roomId: ${p.roomId}`);
  if (!hotspotToRoom.has(p.hotspotId)) {
    err(`Puzzle ${p.id} references unknown hotspotId: ${p.hotspotId}`);
  } else if (hotspotToRoom.get(p.hotspotId) !== p.roomId) {
    err(`Puzzle ${p.id} hotspot ${p.hotspotId} belongs to ${hotspotToRoom.get(p.hotspotId)}, not ${p.roomId}`);
  }
  for (const rp of p.requiresPuzzles) {
    if (!puzzleMap.has(rp)) err(`Puzzle ${p.id} requires unknown puzzle: ${rp}`);
  }
  for (const ri of p.requiresItems) {
    if (!itemMap.has(ri)) err(`Puzzle ${p.id} requires unknown item: ${ri}`);
  }
  for (const ci of p.consumesItems) {
    if (!itemMap.has(ci)) err(`Puzzle ${p.id} consumes unknown item: ${ci}`);
    if (!p.requiresItems.includes(ci)) err(`Puzzle ${p.id} consumes ${ci} without requiring it`);
  }
  for (const gi of p.grantsItems) {
    if (!itemMap.has(gi)) err(`Puzzle ${p.id} grants unknown item: ${gi}`);
    if (itemProducerPuzzle.has(gi)) err(`Item ${gi} is granted by multiple puzzles`);
    itemProducerPuzzle.set(gi, p.id);
  }
  for (const ue of p.unlocksExits) {
    if (!roomMap.has(ue.from) || !roomMap.has(ue.to)) {
      err(`Puzzle ${p.id} unlocksExits has invalid room: ${ue.from} -> ${ue.to}`);
    }
  }
  if (p.keyBreakBranch) {
    const kb = p.keyBreakBranch;
    if (!itemMap.has(kb.attemptedItemId)) err(`Puzzle ${p.id} keyBreakBranch unknown attemptedItemId: ${kb.attemptedItemId}`);
    if (!puzzleMap.has(kb.fallbackPuzzleId)) err(`Puzzle ${p.id} keyBreakBranch unknown fallbackPuzzleId: ${kb.fallbackPuzzleId}`);
    if (!itemMap.has(kb.fallbackItemId)) err(`Puzzle ${p.id} keyBreakBranch unknown fallbackItemId: ${kb.fallbackItemId}`);
  }
}

for (const inc of incEndData.incidents) {
  if (!charMap.has(inc.targetCharacterId)) err(`Incident ${inc.id} unknown character: ${inc.targetCharacterId}`);
  if (!roomMap.has(inc.triggerRoomId)) err(`Incident ${inc.id} unknown triggerRoomId: ${inc.triggerRoomId}`);
  for (const cid of inc.failureOutcome.cascadeToIncidentIds ?? []) {
    if (!incidentMap.has(cid)) err(`Incident ${inc.id} cascades to unknown incident: ${cid}`);
  }
  if (inc.failureOutcome.immediateEndingId && !endingMap.has(inc.failureOutcome.immediateEndingId)) {
    err(`Incident ${inc.id} references unknown immediateEndingId: ${inc.failureOutcome.immediateEndingId}`);
  }
}

for (const end of incEndData.endings) {
  if (end.conditions.reachedRoomId && !roomMap.has(end.conditions.reachedRoomId)) {
    err(`Ending ${end.id} references unknown reachedRoomId: ${end.conditions.reachedRoomId}`);
  }
}

// 3b. Dialogue Branches integrity (GAP-04)
let miyukiAffectionEventCount = 0;
for (const br of dialogueData.branches) {
  if (dialogueMap.has(br.id)) err(`Duplicate dialogue branch id: ${br.id}`);
  dialogueMap.set(br.id, br);
  if (!VALID_CERTAINTY.has(br.certainty)) err(`Invalid certainty on dialogue ${br.id}: ${br.certainty}`);
  if (!charMap.has(br.characterId)) err(`Dialogue ${br.id} references unknown characterId: ${br.characterId}`);
  if (!Array.isArray(br.roomIds) || br.roomIds.length === 0) err(`Dialogue ${br.id} missing roomIds`);
  for (const rid of br.roomIds || []) {
    if (!roomMap.has(rid)) err(`Dialogue ${br.id} references unknown roomId: ${rid}`);
  }
  if (!Array.isArray(br.choices) || br.choices.length < 2) {
    err(`Dialogue ${br.id} must define at least 2 choices`);
  }
  if (br.isAffectionEvent && br.characterId === 'char_miyuki') {
    miyukiAffectionEventCount += 1;
    const deltas = new Set(br.choices.map((c) => c.miyukiDelta));
    if (!deltas.has(1) || !deltas.has(0) || !deltas.has(-1)) {
      err(`Miyuki affection event ${br.id} must offer +1, 0, and -1 deltas`);
    }
  }
}
if (miyukiAffectionEventCount < 5) {
  err(`Expected at least 5 canonical Miyuki affection events, found ${miyukiAffectionEventCount}`);
}

// 3c. Cipher Grid & Deductions integrity (GAP-03)
if (!itemMap.has(cipherData.requiredItemId)) {
  err(`Cipher requiredItemId unknown: ${cipherData.requiredItemId}`);
}
const rowCount = cipherData.gridSpec?.rows?.length || 0;
const colCount = cipherData.gridSpec?.cols?.length || 0;
if (!Array.isArray(cipherData.grid) || cipherData.grid.length !== rowCount) {
  err(`Cipher grid row count mismatch: expected ${rowCount}, got ${cipherData.grid?.length}`);
} else {
  cipherData.grid.forEach((row, idx) => {
    if (!Array.isArray(row) || row.length !== colCount) {
      err(`Cipher grid row ${idx + 1} col count mismatch: expected ${colCount}`);
    }
  });
}
const lookupCipherCell = (coord) => {
  const s = String(coord);
  if (!/^[1-6][1-6]$/.test(s)) return null;
  const r = Number(s[0]) - 1;
  const c = Number(s[1]) - 1;
  return cipherData.grid[r]?.[c] ?? null;
};
for (const ms of cipherData.memoSources || []) {
  if (!VALID_CERTAINTY.has(ms.certainty)) err(`Invalid certainty on cipher memo ${ms.id}`);
  if (ms.sourceType === 'item' && !itemMap.has(ms.sourceId)) {
    err(`Cipher memo ${ms.id} unknown item sourceId: ${ms.sourceId}`);
  }
  if (ms.sourceType === 'hotspot' && !hotspotToRoom.has(ms.sourceId)) {
    err(`Cipher memo ${ms.id} unknown hotspot sourceId: ${ms.sourceId}`);
  }
  if (lookupCipherCell(ms.coordCode) === null) {
    err(`Cipher memo ${ms.id} invalid coordCode: ${ms.coordCode}`);
  }
}
for (const ded of cipherData.deductions || []) {
  if (!VALID_CERTAINTY.has(ded.certainty)) err(`Invalid certainty on cipher deduction ${ded.id}`);
  if (!puzzleMap.has(ded.relatedPuzzleId)) {
    err(`Cipher deduction ${ded.id} unknown relatedPuzzleId: ${ded.relatedPuzzleId}`);
  }
  if (!Array.isArray(ded.coordPair) || ded.coordPair.length !== 2) {
    err(`Cipher deduction ${ded.id} must have coordPair of length 2`);
  } else {
    const t0 = lookupCipherCell(ded.coordPair[0]);
    const t1 = lookupCipherCell(ded.coordPair[1]);
    if (t0 !== ded.expectedTokens[0] || t1 !== ded.expectedTokens[1]) {
      err(`Cipher deduction ${ded.id} grid mismatch: got [${t0}, ${t1}] vs expected [${ded.expectedTokens.join(', ')}]`);
    }
  }
}

// 4. Full room graph connectivity (unlocked view)
{
  const visited = new Set([roomsData.startRoomId]);
  const q = [roomsData.startRoomId];
  while (q.length) {
    const cur = q.shift();
    for (const ex of roomMap.get(cur).exits) {
      if (!visited.has(ex.to)) {
        visited.add(ex.to);
        q.push(ex.to);
      }
    }
  }
  for (const r of roomsData.rooms) {
    if (!visited.has(r.id)) err(`Room ${r.id} is disconnected from startRoomId ${roomsData.startRoomId}`);
  }
}

// 5. Puzzle + Item Dependency DAG Acyclicity (Kahn's algorithm)
{
  const adj = new Map();
  const indeg = new Map();
  for (const p of puzzlesData.puzzles) {
    adj.set(p.id, new Set());
    indeg.set(p.id, 0);
  }
  const addEdge = (from, to) => {
    if (from === to) { err(`Self-dependency cycle on puzzle: ${from}`); return; }
    if (!adj.get(from).has(to)) {
      adj.get(from).add(to);
      indeg.set(to, indeg.get(to) + 1);
    }
  };
  for (const p of puzzlesData.puzzles) {
    for (const dep of p.requiresPuzzles) addEdge(dep, p.id);
    for (const reqItem of p.requiresItems) {
      if (itemProducerPuzzle.has(reqItem)) {
        addEdge(itemProducerPuzzle.get(reqItem), p.id);
      }
    }
  }
  const queue = [...indeg.entries()].filter(([, d]) => d === 0).map(([k]) => k);
  let processed = 0;
  while (queue.length) {
    const u = queue.shift();
    processed++;
    for (const v of adj.get(u)) {
      indeg.set(v, indeg.get(v) - 1);
      if (indeg.get(v) === 0) queue.push(v);
    }
  }
  if (processed !== puzzlesData.puzzles.length) {
    const cyclic = [...indeg.entries()].filter(([, d]) => d > 0).map(([k]) => k);
    err(`Puzzle/Item dependency cycle detected involving: ${cyclic.join(', ')}`);
  }
}

// 6. Forward Gameplay Reachability Simulation (Softlock-Free Proof)
{
  const inventory = new Set(
    itemsData.items.filter((i) => i.acquireMethod === 'starting_inventory').map((i) => i.id)
  );
  const solved = new Set();
  const flags = new Set();
  const unlockedEdges = new Set(); // "from->to"

  const getReachableRooms = () => {
    const vis = new Set([roomsData.startRoomId]);
    const q = [roomsData.startRoomId];
    while (q.length) {
      const cur = q.shift();
      for (const ex of roomMap.get(cur).exits) {
        const edgeKey = `${cur}->${ex.to}`;
        if (!ex.locked || unlockedEdges.has(edgeKey)) {
          if (!vis.has(ex.to)) {
            vis.add(ex.to);
            q.push(ex.to);
          }
        }
      }
    }
    return vis;
  };

  let progress = true;
  while (progress) {
    progress = false;
    const reachable = getReachableRooms();

    for (const it of itemsData.items) {
      if (it.acquireMethod === 'room_pickup' && reachable.has(it.pickupRoomId) && !inventory.has(it.id)) {
        inventory.add(it.id);
        progress = true;
      }
    }

    for (const p of puzzlesData.puzzles) {
      if (solved.has(p.id)) continue;
      if (!reachable.has(p.roomId)) continue;
      const okPuz = p.requiresPuzzles.every((rp) => solved.has(rp));
      const okItems = p.requiresItems.every((ri) => inventory.has(ri));
      const okFlags = p.requiresFlags.every((rf) => flags.has(rf));
      if (okPuz && okItems && okFlags) {
        solved.add(p.id);
        for (const ci of p.consumesItems) inventory.delete(ci);
        for (const gi of p.grantsItems) inventory.add(gi);
        for (const sf of p.setsFlags) flags.add(sf);
        for (const ue of p.unlocksExits) unlockedEdges.add(`${ue.from}->${ue.to}`);
        progress = true;
      }
    }
  }

  const finalReachable = getReachableRooms();
  if (!finalReachable.has(roomsData.goalRoomId)) {
    err(`Forward simulation failed to reach goalRoomId (${roomsData.goalRoomId}). Solved: ${solved.size}/${puzzlesData.puzzles.length}`);
  }
  if (solved.size !== puzzlesData.puzzles.length) {
    const unsolved = puzzlesData.puzzles.filter((p) => !solved.has(p.id)).map((p) => p.id);
    err(`Forward simulation left unsolved puzzles: ${unsolved.join(', ')}`);
  }
}

if (errors.length) {
  console.error(`[isaku:validate] FAIL (${errors.length} errors):`);
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}

console.log(
  `[isaku:validate] OK — characters=${charsData.characters.length}, rooms=${roomsData.rooms.length}, hotspots=${hotspotToRoom.size}, items=${itemsData.items.length}, puzzles=${puzzlesData.puzzles.length}, incidents=${incEndData.incidents.length}, endings=${incEndData.endings.length}, dialogueBranches=${dialogueData.branches.length}, cipherDeductions=${cipherData.deductions.length}, DAG=acyclic, forwardSim=goal_reached, errors=0`
);
