import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const errors = [];
const warnings = [];

function readJson(filename) {
  const fullPath = path.join(__dirname, filename);
  if (!fs.existsSync(fullPath)) {
    errors.push(`Missing JSON file: ${filename}`);
    return null;
  }
  try {
    return JSON.parse(fs.readFileSync(fullPath, "utf8"));
  } catch (err) {
    errors.push(`Invalid JSON in ${filename}: ${err.message}`);
    return null;
  }
}

function readCsv(filename) {
  const fullPath = path.join(__dirname, filename);
  if (!fs.existsSync(fullPath)) {
    errors.push(`Missing CSV file: ${filename}`);
    return [];
  }
  const lines = fs
    .readFileSync(fullPath, "utf8")
    .split(/\r?\n/)
    .filter((l) => l.trim().length > 0);
  if (lines.length < 2) {
    errors.push(`CSV ${filename} has fewer than 2 rows.`);
    return [];
  }
  const headers = lines[0].split(",");
  return lines.slice(1).map((line, idx) => {
    const cols = line.split(",");
    if (cols.length !== headers.length) {
      errors.push(
        `CSV ${filename} line ${idx + 2} column count mismatch: expected ${headers.length}, got ${cols.length}`
      );
    }
    const row = {};
    headers.forEach((h, i) => {
      row[h] = cols[i] ?? "";
    });
    return row;
  });
}

function assertUniqueIds(items, label) {
  const ids = new Set();
  for (const item of items) {
    if (!item.id || typeof item.id !== "string") {
      errors.push(`${label}: item missing string id`);
      continue;
    }
    if (ids.has(item.id)) {
      errors.push(`${label}: duplicate id '${item.id}'`);
    }
    ids.add(item.id);
  }
  return ids;
}

function assertCsvMatchesJsonIds(csvRows, jsonIds, label) {
  const csvIds = new Set(csvRows.map((r) => r.id));
  if (csvRows.length !== jsonIds.size) {
    errors.push(
      `${label}: CSV row count (${csvRows.length}) != JSON count (${jsonIds.size})`
    );
  }
  for (const id of jsonIds) {
    if (!csvIds.has(id)) {
      errors.push(`${label}: JSON id '${id}' missing in CSV`);
    }
  }
  for (const id of csvIds) {
    if (!jsonIds.has(id)) {
      errors.push(`${label}: CSV id '${id}' missing in JSON`);
    }
  }
}

const VALID_EVIDENCE = new Set([
  "VERIFIED",
  "INTERPRETED",
  "RECONSTRUCTED",
  "NEEDS_VERIFICATION",
]);

function checkEvidence(items, label) {
  for (const item of items) {
    if (!VALID_EVIDENCE.has(item.evidenceLevel)) {
      errors.push(
        `${label} '${item.id}': invalid evidenceLevel '${item.evidenceLevel}'`
      );
    }
  }
}

// 1. Load all datasets
const factionsData = readJson("factions.json");
const territoriesData = readJson("territories.json");
const classesData = readJson("unit_classes.json");
const charactersData = readJson("characters.json");
const eventsData = readJson("scenario_events_and_timers.json");
const endingsData = readJson("endings.json");

const factionsCsv = readCsv("factions.csv");
const territoriesCsv = readCsv("territories.csv");
const classesCsv = readCsv("unit_classes.csv");
const charactersCsv = readCsv("characters.csv");

if (
  !factionsData ||
  !territoriesData ||
  !classesData ||
  !charactersData ||
  !eventsData ||
  !endingsData
) {
  console.error("Fatal: one or more JSON files failed to load.", errors);
  process.exit(1);
}

const factions = factionsData.factions ?? [];
const territories = territoriesData.territories ?? [];
const unitClasses = classesData.unitClasses ?? [];
const characters = charactersData.characters ?? [];
const events = eventsData.events ?? [];
const endings = endingsData.endings ?? [];

// 2. Uniqueness & Evidence Tags
const factionIds = assertUniqueIds(factions, "factions");
const territoryIds = assertUniqueIds(territories, "territories");
const classIds = assertUniqueIds(unitClasses, "unit_classes");
const characterIds = assertUniqueIds(characters, "characters");
const eventIds = assertUniqueIds(events, "scenario_events_and_timers");
const endingIds = assertUniqueIds(endings, "endings");

checkEvidence(factions, "factions");
checkEvidence(territories, "territories");
checkEvidence(unitClasses, "unit_classes");
checkEvidence(characters, "characters");
checkEvidence(events, "events");
checkEvidence(endings, "endings");

// 3. CSV ↔ JSON parity
assertCsvMatchesJsonIds(factionsCsv, factionIds, "factions");
assertCsvMatchesJsonIds(territoriesCsv, territoryIds, "territories");
assertCsvMatchesJsonIds(classesCsv, classIds, "unit_classes");
assertCsvMatchesJsonIds(charactersCsv, characterIds, "characters");

// 4. Referential Integrity
for (const fac of factions) {
  if (!characterIds.has(fac.leaderCharacterId)) {
    errors.push(
      `faction '${fac.id}': dangling leaderCharacterId '${fac.leaderCharacterId}'`
    );
  }
  if (!territoryIds.has(fac.capitalTerritoryId)) {
    errors.push(
      `faction '${fac.id}': dangling capitalTerritoryId '${fac.capitalTerritoryId}'`
    );
  }
}

const territoryMap = new Map(territories.map((t) => [t.id, t]));
for (const ter of territories) {
  if (!factionIds.has(ter.initialOwnerFactionId)) {
    errors.push(
      `territory '${ter.id}': dangling initialOwnerFactionId '${ter.initialOwnerFactionId}'`
    );
  }
  if (!Array.isArray(ter.adjacentIds) || ter.adjacentIds.length === 0) {
    errors.push(`territory '${ter.id}': must have non-empty adjacentIds`);
    continue;
  }
  const seenAdj = new Set();
  for (const adjId of ter.adjacentIds) {
    if (adjId === ter.id) {
      errors.push(`territory '${ter.id}': self-loop in adjacentIds`);
    }
    if (seenAdj.has(adjId)) {
      errors.push(`territory '${ter.id}': duplicate adjacentId '${adjId}'`);
    }
    seenAdj.add(adjId);
    if (!territoryIds.has(adjId)) {
      errors.push(
        `territory '${ter.id}': dangling adjacentId '${adjId}'`
      );
      continue;
    }
    const neighbor = territoryMap.get(adjId);
    if (!neighbor.adjacentIds.includes(ter.id)) {
      errors.push(
        `territory graph asymmetry: '${ter.id}' -> '${adjId}' is missing reverse edge`
      );
    }
  }
}

// 5. Territory Graph Connectivity (BFS from ter_leazas_castle)
if (territoryIds.has("ter_leazas_castle")) {
  const visited = new Set(["ter_leazas_castle"]);
  const queue = ["ter_leazas_castle"];
  while (queue.length > 0) {
    const cur = queue.shift();
    const node = territoryMap.get(cur);
    for (const nxt of node.adjacentIds) {
      if (!visited.has(nxt) && territoryMap.has(nxt)) {
        visited.add(nxt);
        queue.push(nxt);
      }
    }
  }
  if (visited.size !== territories.length) {
    const unreachable = territories
      .map((t) => t.id)
      .filter((id) => !visited.has(id));
    errors.push(
      `territory graph disconnected! Unreachable from ter_leazas_castle: ${unreachable.join(", ")}`
    );
  }
} else {
  errors.push("Missing starting capital 'ter_leazas_castle'");
}

// 6. Characters referential integrity
for (const chr of characters) {
  if (!factionIds.has(chr.initialFactionId)) {
    errors.push(
      `character '${chr.id}': dangling initialFactionId '${chr.initialFactionId}'`
    );
  }
  if (!classIds.has(chr.unitClassId)) {
    errors.push(
      `character '${chr.id}': dangling unitClassId '${chr.unitClassId}'`
    );
  }
  if (!territoryIds.has(chr.homeTerritoryId)) {
    errors.push(
      `character '${chr.id}': dangling homeTerritoryId '${chr.homeTerritoryId}'`
    );
  }
}

// 7. Scenario Events & Timers referential integrity
for (const evt of events) {
  for (const tid of evt.relatedTerritoryIds ?? []) {
    if (!territoryIds.has(tid)) {
      errors.push(`event '${evt.id}': dangling territoryId '${tid}'`);
    }
  }
  for (const cid of evt.relatedCharacterIds ?? []) {
    if (!characterIds.has(cid)) {
      errors.push(`event '${evt.id}': dangling characterId '${cid}'`);
    }
  }
  for (const fid of evt.relatedFactionIds ?? []) {
    if (!factionIds.has(fid)) {
      errors.push(`event '${evt.id}': dangling factionId '${fid}'`);
    }
  }
  for (const eid of evt.unlockedEndingIds ?? []) {
    if (!endingIds.has(eid)) {
      errors.push(`event '${evt.id}': dangling unlockedEndingId '${eid}'`);
    }
  }
}

// 8. Endings referential integrity
for (const end of endings) {
  for (const evId of end.requiredEventIds ?? []) {
    if (!eventIds.has(evId)) {
      errors.push(`ending '${end.id}': dangling requiredEventId '${evId}'`);
    }
  }
  for (const cid of end.requiredCharacterIds ?? []) {
    if (!characterIds.has(cid)) {
      errors.push(`ending '${end.id}': dangling requiredCharacterId '${cid}'`);
    }
  }
}

// Summary Output
const summary = {
  factions: factions.length,
  territories: territories.length,
  unitClasses: unitClasses.length,
  characters: characters.length,
  scenarioEventsAndTimers: events.length,
  endings: endings.length,
  errors: errors.length,
  warnings: warnings.length,
};

console.log("[kichikuou-rance] Verified Data Validation Summary:");
console.log(JSON.stringify(summary, null, 2));

if (errors.length > 0) {
  console.error("\nValidation FAILED with errors:");
  for (const e of errors) {
    console.error(`  - ${e}`);
  }
  process.exit(1);
}

console.log("\nValidation PASSED: 0 errors, 100% referential integrity, symmetric connected continent graph.");
