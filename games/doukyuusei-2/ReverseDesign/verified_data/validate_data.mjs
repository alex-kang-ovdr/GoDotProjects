#!/usr/bin/env node
/**
 * 동급생 2 (同級生2) 역기획서 원작 데이터 정합성 검증기 (Phase 2 확장판)
 * - JSON 스키마 및 필수 키 검증
 * - CSV ↔ JSON 행 수 및 핵심 ID 일치 검증
 * - 캐릭터/장소/캘린더/이벤트/플래그/스케줄/전화·힌트/엔딩 참조 무결성 검증
 * - 스케줄 시간 창(5분 양자, 0..1440, day_start..day_end, 17일 × 15인 커버리지) 유효성 검증
 * - evidence_level ↔ evidence_tier 정직한 일관성 검증
 * - 이벤트 선행 의존성 DAG 비순환(acyclicity) 및 연대순 검증
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = dirname(fileURLToPath(import.meta.url));
const errors = [];
const warnings = [];

const fail = (msg) => errors.push(msg);
const warn = (msg) => warnings.push(msg);

function readJson(filename) {
  const full = join(dir, filename);
  return JSON.parse(readFileSync(full, 'utf8'));
}

function readCsv(filename) {
  const raw = readFileSync(join(dir, filename), 'utf8').trim();
  const lines = raw.split(/\r?\n/);
  const headers = lines[0].split(',');
  return lines.slice(1).map((line, idx) => {
    const cols = line.split(',');
    if (cols.length !== headers.length) {
      fail(`${filename}:${idx + 2} column count mismatch (${cols.length} !== ${headers.length})`);
    }
    const row = {};
    headers.forEach((h, i) => { row[h] = cols[i] ?? ''; });
    return row;
  });
}

const VALID_EVIDENCE = new Set(['[확인]', '[해석]', '[재구성안]', '[검증 필요]']);
const EVIDENCE_TO_TIER = {
  '[확인]': 'VERIFIED_PUBLIC',
  '[해석]': 'INFERRED',
  '[재구성안]': 'RECONSTRUCTED',
  '[검증 필요]': 'NEEDS_VERIFICATION'
};

const charactersData = readJson('characters.json');
const charactersCsv = readCsv('characters.csv');
const locationsData = readJson('locations.json');
const locationsCsv = readCsv('locations.csv');
const calendarData = readJson('calendar_days.json');
const eventsData = readJson('events_and_flags.json');
const schedulesData = readJson('npc_schedules.json');
const phoneData = readJson('phone_and_hints.json');
const endingsData = readJson('endings.json');

// 1. Characters JSON & CSV consistency
const charMap = new Map();
for (const c of charactersData.characters) {
  if (!c.id || charMap.has(c.id)) fail(`Duplicate or empty character id: ${c.id}`);
  if (!VALID_EVIDENCE.has(c.evidence_level)) fail(`Invalid evidence_level on character ${c.id}: ${c.evidence_level}`);
  charMap.set(c.id, c);
}
const heroines = charactersData.characters.filter((c) => c.romanceable === true);
if (heroines.length !== 15) fail(`Expected 15 romanceable heroines, found ${heroines.length}`);

if (charactersCsv.length !== charactersData.characters.length) {
  fail(`characters.csv row count (${charactersCsv.length}) !== characters.json (${charactersData.characters.length})`);
}
for (const row of charactersCsv) {
  const c = charMap.get(row.id);
  if (!c) { fail(`characters.csv unknown id: ${row.id}`); continue; }
  if (row.name_ja !== c.name_ja || row.name_ko !== c.name_ko || row.name_en !== c.name_en) {
    fail(`characters.csv name mismatch for ${row.id}`);
  }
  if (String(c.romanceable) !== row.romanceable) {
    fail(`characters.csv romanceable mismatch for ${row.id}`);
  }
}

// 2. Locations JSON & CSV consistency + Graph integrity
const zoneSet = new Set(locationsData.zones.map((z) => z.id));
const locMap = new Map();
for (const loc of locationsData.locations) {
  if (!loc.id || locMap.has(loc.id)) fail(`Duplicate or empty location id: ${loc.id}`);
  if (!zoneSet.has(loc.zone_id)) fail(`Location ${loc.id} references unknown zone ${loc.zone_id}`);
  if (!VALID_EVIDENCE.has(loc.evidence_level)) fail(`Invalid evidence_level on location ${loc.id}`);
  if (loc.open_minute < 0 || loc.close_minute > 1440 || loc.open_minute >= loc.close_minute) {
    fail(`Invalid open/close minutes on location ${loc.id}: ${loc.open_minute}..${loc.close_minute}`);
  }
  locMap.set(loc.id, loc);
}

for (const loc of locationsData.locations) {
  for (const edge of loc.connected_to) {
    if (!locMap.has(edge.target_id)) {
      fail(`Location ${loc.id} connects to unknown target_id ${edge.target_id}`);
    }
    if (edge.target_id === loc.id) {
      fail(`Location ${loc.id} has self-loop`);
    }
    if (edge.travel_minutes <= 0 || edge.travel_minutes % 5 !== 0) {
      fail(`Location ${loc.id} -> ${edge.target_id} has invalid travel_minutes: ${edge.travel_minutes}`);
    }
  }
}

if (locationsCsv.length !== locationsData.locations.length) {
  fail(`locations.csv row count (${locationsCsv.length}) !== locations.json (${locationsData.locations.length})`);
}
for (const row of locationsCsv) {
  const loc = locMap.get(row.id);
  if (!loc) { fail(`locations.csv unknown id: ${row.id}`); continue; }
  if (row.zone_id !== loc.zone_id || row.name_ja !== loc.name_ja || row.name_ko !== loc.name_ko) {
    fail(`locations.csv mismatch for ${row.id}`);
  }
  if (Number(row.connection_count) !== loc.connected_to.length) {
    fail(`locations.csv connection_count mismatch for ${row.id}`);
  }
}

for (const c of charactersData.characters) {
  if (!locMap.has(c.home_location_id)) {
    fail(`Character ${c.id} references unknown home_location_id ${c.home_location_id}`);
  }
}

// 3. Calendar days validation (17 days: Dec 22 ~ Jan 7)
if (calendarData.days.length !== 17) {
  fail(`Expected 17 calendar days (12-22..01-07), found ${calendarData.days.length}`);
}
const dayMap = new Map();
calendarData.days.forEach((d, idx) => {
  if (d.day_index !== idx + 1) fail(`Calendar day_index discontinuity at ${d.date}: expected ${idx + 1}, got ${d.day_index}`);
  if (!VALID_EVIDENCE.has(d.evidence_level)) fail(`Invalid evidence_level on calendar day ${d.date}`);
  for (const z of d.active_zones_default) {
    if (!zoneSet.has(z)) fail(`Calendar day ${d.date} references unknown zone ${z}`);
  }
  dayMap.set(d.day_index, d);
});
if (calendarData.days[0].date !== '12-22' || calendarData.days[16].date !== '01-07') {
  fail(`Calendar range mismatch: ${calendarData.days[0].date}..${calendarData.days[16].date}`);
}

// 4. Flags, Events & Mood/Minigame validation + DAG acyclicity
if (!eventsData.mood_affection_rules) {
  fail('events_and_flags.json missing mood_affection_rules metadata');
} else {
  const mr = eventsData.mood_affection_rules;
  if (!VALID_EVIDENCE.has(mr.evidence_level)) fail(`Invalid evidence_level on mood_affection_rules: ${mr.evidence_level}`);
  if (!Array.isArray(mr.mood_tiers) || mr.mood_tiers.length < 3) fail('mood_affection_rules.mood_tiers incomplete');
}

const flagMap = new Map();
for (const f of eventsData.flags) {
  if (!f.id || flagMap.has(f.id)) fail(`Duplicate or empty flag id: ${f.id}`);
  if (f.character_id && !charMap.has(f.character_id)) {
    fail(`Flag ${f.id} references unknown character ${f.character_id}`);
  }
  flagMap.set(f.id, f);
}

for (const mx of eventsData.mutually_exclusive_groups) {
  for (const flg of mx.exclusive_flags) {
    if (!flagMap.has(flg)) fail(`Mutually exclusive group ${mx.id} references unknown flag ${flg}`);
  }
}

const eventMap = new Map();
for (const ev of eventsData.events) {
  if (!ev.id || eventMap.has(ev.id)) fail(`Duplicate or empty event id: ${ev.id}`);
  if (!charMap.has(ev.character_id)) fail(`Event ${ev.id} references unknown character ${ev.character_id}`);
  if (!locMap.has(ev.location_id)) fail(`Event ${ev.id} references unknown location ${ev.location_id}`);
  if (!dayMap.has(ev.day_start) || !dayMap.has(ev.day_end) || ev.day_start > ev.day_end) {
    fail(`Event ${ev.id} has invalid day range ${ev.day_start}..${ev.day_end}`);
  }
  if (ev.start_minute < 0 || ev.end_minute > 1440 || ev.start_minute >= ev.end_minute) {
    fail(`Event ${ev.id} has invalid time window ${ev.start_minute}..${ev.end_minute}`);
  }
  if (ev.start_minute % 5 !== 0 || ev.end_minute % 5 !== 0 || ev.time_cost_minutes % 5 !== 0) {
    fail(`Event ${ev.id} violates 5-minute clock quantum`);
  }
  if (!VALID_EVIDENCE.has(ev.evidence_level)) fail(`Invalid evidence_level on event ${ev.id}`);
  for (const flg of [...ev.required_flags, ...ev.blocked_by_flags, ...ev.sets_flags]) {
    if (!flagMap.has(flg)) fail(`Event ${ev.id} references unknown flag ${flg}`);
  }
  if (ev.branch_flag_options) {
    for (const opt of ev.branch_flag_options) {
      for (const flg of [...(opt.requires_flags ?? []), ...(opt.sets_flags ?? [])]) {
        if (!flagMap.has(flg)) fail(`Event ${ev.id} branch option references unknown flag ${flg}`);
      }
      if (opt.mood_delta !== undefined && !Number.isFinite(opt.mood_delta)) {
        fail(`Event ${ev.id} branch option has non-numeric mood_delta`);
      }
      if (opt.affection_delta !== undefined && !Number.isFinite(opt.affection_delta)) {
        fail(`Event ${ev.id} branch option has non-numeric affection_delta`);
      }
    }
  }
  if (ev.minigame_spec) {
    if (!VALID_EVIDENCE.has(ev.minigame_spec.evidence_level)) {
      fail(`Event ${ev.id} minigame_spec has invalid evidence_level`);
    }
    if (ev.minigame_spec.win_flag && !flagMap.has(ev.minigame_spec.win_flag)) {
      fail(`Event ${ev.id} minigame_spec references unknown win_flag ${ev.minigame_spec.win_flag}`);
    }
    if (ev.minigame_spec.opponent_id && !charMap.has(ev.minigame_spec.opponent_id)) {
      fail(`Event ${ev.id} minigame_spec references unknown opponent ${ev.minigame_spec.opponent_id}`);
    }
  }
  eventMap.set(ev.id, ev);
}

if (eventsData.events.length < 70) {
  fail(`Expected at least 70 events in Phase 2 dataset, found ${eventsData.events.length}`);
}

const misaTennis = eventMap.get('evt_misa_tennis_match');
if (!misaTennis || !misaTennis.minigame_spec || misaTennis.minigame_spec.type !== 'tennis_rally') {
  fail('evt_misa_tennis_match must define tennis_rally minigame_spec');
}

if (eventsData.mood_affection_rules?.verified_mood_branches) {
  for (const br of eventsData.mood_affection_rules.verified_mood_branches) {
    if (!eventMap.has(br.event_id)) fail(`mood_affection_rules references unknown event ${br.event_id}`);
    if (!charMap.has(br.character_id)) fail(`mood_affection_rules references unknown character ${br.character_id}`);
    if (!VALID_EVIDENCE.has(br.evidence_level)) fail(`Invalid evidence_level on verified_mood_branch ${br.event_id}`);
  }
}

// Check prerequisite_events existence and DAG acyclicity (DFS)
for (const ev of eventsData.events) {
  for (const pre of ev.prerequisite_events) {
    if (!eventMap.has(pre)) {
      fail(`Event ${ev.id} references unknown prerequisite_event ${pre}`);
    } else {
      const preEv = eventMap.get(pre);
      if (preEv.day_start > ev.day_end) {
        fail(`Chronological violation: ${pre} (day ${preEv.day_start}) cannot precede ${ev.id} (day ${ev.day_end})`);
      }
    }
  }
}

const visitState = new Map();
function dfsCycle(id) {
  visitState.set(id, 1);
  const ev = eventMap.get(id);
  for (const pre of ev.prerequisite_events) {
    if (!eventMap.has(pre)) continue;
    const st = visitState.get(pre) ?? 0;
    if (st === 1) {
      fail(`Cycle detected in event prerequisite DAG involving ${id} -> ${pre}`);
      return;
    }
    if (st === 0) dfsCycle(pre);
  }
  visitState.set(id, 2);
}
for (const id of eventMap.keys()) {
  if ((visitState.get(id) ?? 0) === 0) dfsCycle(id);
}

// 5. NPC Schedules validation (115+ slots, all 15 heroines, all 17 days)
const schedIdSet = new Set();
const scheduledHeroines = new Set();
const coveredDays = new Set();
for (const sch of schedulesData.schedules) {
  if (!sch.id || schedIdSet.has(sch.id)) fail(`Duplicate or empty schedule id: ${sch.id}`);
  schedIdSet.add(sch.id);
  if (!charMap.has(sch.character_id)) fail(`Schedule ${sch.id} references unknown character ${sch.character_id}`);
  if (!locMap.has(sch.location_id)) fail(`Schedule ${sch.id} references unknown location ${sch.location_id}`);
  if (!dayMap.has(sch.day_start) || !dayMap.has(sch.day_end) || sch.day_start > sch.day_end) {
    fail(`Schedule ${sch.id} has invalid day range ${sch.day_start}..${sch.day_end}`);
  }
  if (sch.start_minute < 0 || sch.end_minute > 1440 || sch.start_minute >= sch.end_minute) {
    fail(`Schedule ${sch.id} has invalid time window ${sch.start_minute}..${sch.end_minute}`);
  }
  if (sch.start_minute % 5 !== 0 || sch.end_minute % 5 !== 0) {
    fail(`Schedule ${sch.id} violates 5-minute clock quantum`);
  }
  if (sch.event_id !== null && !eventMap.has(sch.event_id)) {
    fail(`Schedule ${sch.id} references unknown event_id ${sch.event_id}`);
  }
  for (const flg of [...sch.required_flags, ...sch.blocked_by_flags]) {
    if (!flagMap.has(flg)) fail(`Schedule ${sch.id} references unknown flag ${flg}`);
  }
  if (!VALID_EVIDENCE.has(sch.evidence_level)) fail(`Invalid evidence_level on schedule ${sch.id}`);
  if (!sch.evidence_tier || EVIDENCE_TO_TIER[sch.evidence_level] !== sch.evidence_tier) {
    fail(`Schedule ${sch.id} evidence_tier (${sch.evidence_tier}) does not match evidence_level (${sch.evidence_level})`);
  }
  if (charMap.get(sch.character_id)?.romanceable) scheduledHeroines.add(sch.character_id);
  for (let d = sch.day_start; d <= sch.day_end; d++) coveredDays.add(d);
}
if (schedulesData.schedules.length < 115) {
  fail(`Expected at least 115 NPC schedules in Phase 2 dataset, found ${schedulesData.schedules.length}`);
}
if (scheduledHeroines.size !== 15) {
  fail(`Expected all 15 heroines to have schedule entries, found ${scheduledHeroines.size}`);
}
if (coveredDays.size !== 17) {
  fail(`Expected schedules to cover all 17 calendar days (1..17), found ${coveredDays.size}`);
}

// 6. Phone Directory & Hints validation
if (!VALID_EVIDENCE.has(phoneData.evidence_level)) {
  fail(`Invalid evidence_level on phone_and_hints.json: ${phoneData.evidence_level}`);
}
if (!Number.isInteger(phoneData.call_time_cost_minutes) || phoneData.call_time_cost_minutes <= 0 || phoneData.call_time_cost_minutes % 5 !== 0) {
  fail(`Invalid call_time_cost_minutes: ${phoneData.call_time_cost_minutes}`);
}

const callableLocSet = new Set();
for (const cl of phoneData.callable_locations) {
  if (!locMap.has(cl.location_id)) fail(`Callable location references unknown location_id ${cl.location_id}`);
  if (callableLocSet.has(cl.location_id)) fail(`Duplicate callable location ${cl.location_id}`);
  if (!VALID_EVIDENCE.has(cl.evidence_level)) fail(`Invalid evidence_level on callable location ${cl.location_id}`);
  callableLocSet.add(cl.location_id);
}

const dirCharSet = new Set();
for (const entry of phoneData.directory) {
  if (!charMap.has(entry.character_id)) fail(`Phone directory references unknown character ${entry.character_id}`);
  if (dirCharSet.has(entry.character_id)) fail(`Duplicate phone directory entry for ${entry.character_id}`);
  dirCharSet.add(entry.character_id);
  if (!locMap.has(entry.home_location_id)) fail(`Phone directory ${entry.character_id} unknown home_location_id ${entry.home_location_id}`);
  if (
    !entry.call_hours ||
    entry.call_hours.start_minute < 0 ||
    entry.call_hours.end_minute > 1440 ||
    entry.call_hours.start_minute >= entry.call_hours.end_minute ||
    entry.call_hours.start_minute % 5 !== 0 ||
    entry.call_hours.end_minute % 5 !== 0
  ) {
    fail(`Phone directory ${entry.character_id} has invalid call_hours`);
  }
  for (const flg of entry.required_flags || []) {
    if (!flagMap.has(flg)) fail(`Phone directory ${entry.character_id} references unknown flag ${flg}`);
  }
  for (const ud of entry.unavailable_days || []) {
    if (!dayMap.has(ud)) fail(`Phone directory ${entry.character_id} has invalid unavailable day ${ud}`);
  }
  if (!VALID_EVIDENCE.has(entry.evidence_level)) fail(`Invalid evidence_level on phone directory ${entry.character_id}`);
}
for (const h of heroines) {
  if (!dirCharSet.has(h.id)) fail(`Heroine ${h.id} missing from phone_and_hints.json directory`);
}
if (!dirCharSet.has('chr_akira')) fail('chr_akira missing from phone_and_hints.json directory');

const phoneEvtIds = new Set();
for (const pe of phoneData.phone_events) {
  if (!pe.id || phoneEvtIds.has(pe.id)) fail(`Duplicate or empty phone_event id: ${pe.id}`);
  phoneEvtIds.add(pe.id);
  if (!eventMap.has(pe.event_id)) fail(`Phone event ${pe.id} references unknown event_id ${pe.event_id}`);
  if (!charMap.has(pe.character_id)) fail(`Phone event ${pe.id} references unknown character_id ${pe.character_id}`);
  if (!dayMap.has(pe.day_start) || !dayMap.has(pe.day_end) || pe.day_start > pe.day_end) {
    fail(`Phone event ${pe.id} has invalid day range ${pe.day_start}..${pe.day_end}`);
  }
  if (pe.start_minute % 5 !== 0 || pe.end_minute % 5 !== 0 || pe.start_minute >= pe.end_minute) {
    fail(`Phone event ${pe.id} has invalid time window`);
  }
  if (!VALID_EVIDENCE.has(pe.evidence_level)) fail(`Invalid evidence_level on phone event ${pe.id}`);
}

const hintDays = new Set();
for (const h of phoneData.daily_rumor_hints) {
  if (!dayMap.has(h.day_index)) fail(`Daily rumor hint has invalid day_index ${h.day_index}`);
  if (dayMap.get(h.day_index)?.date !== h.date) fail(`Daily rumor hint date mismatch on day ${h.day_index}`);
  if (!VALID_EVIDENCE.has(h.evidence_level)) fail(`Invalid evidence_level on daily rumor hint day ${h.day_index}`);
  hintDays.add(h.day_index);
}
if (hintDays.size !== 17) fail(`Expected 17 daily rumor hints, found ${hintDays.size}`);

// 7. Endings validation
const endingIdSet = new Set();
const endedHeroines = new Set();
for (const end of endingsData.endings) {
  if (!end.id || endingIdSet.has(end.id)) fail(`Duplicate or empty ending id: ${end.id}`);
  endingIdSet.add(end.id);
  if (end.character_id !== null && !charMap.has(end.character_id)) {
    fail(`Ending ${end.id} references unknown character ${end.character_id}`);
  }
  for (const flg of [...end.required_flags, ...end.blocked_by_flags]) {
    if (!flagMap.has(flg)) fail(`Ending ${end.id} references unknown flag ${flg}`);
  }
  if (!VALID_EVIDENCE.has(end.evidence_level)) fail(`Invalid evidence_level on ending ${end.id}`);
  if (end.character_id && charMap.get(end.character_id)?.romanceable && end.category !== 'route_fail') {
    endedHeroines.add(end.character_id);
  }
}
if (endedHeroines.size !== 15) {
  fail(`Expected all 15 heroines to have valid endings, found ${endedHeroines.size}`);
}

console.log('=== Doukyuusei 2 Verified Data Validation (Phase 2) ===');
console.log(`Characters: ${charactersData.characters.length} (Heroines: ${heroines.length})`);
console.log(`Zones: ${locationsData.zones.length} | Locations: ${locationsData.locations.length}`);
console.log(`Calendar Days: ${calendarData.days.length} (${calendarData.days[0].date} ~ ${calendarData.days[16].date})`);
console.log(`Flags: ${eventsData.flags.length} | Events: ${eventsData.events.length} | Mutual Exclusions: ${eventsData.mutually_exclusive_groups.length}`);
console.log(`NPC Schedules: ${schedulesData.schedules.length} (Heroines: ${scheduledHeroines.size}/15 | Days: ${coveredDays.size}/17)`);
console.log(`Phone Directory: ${phoneData.directory.length} | Callable Locs: ${phoneData.callable_locations.length} | Phone Events: ${phoneData.phone_events.length} | Daily Hints: ${phoneData.daily_rumor_hints.length}`);
console.log(`Endings: ${endingsData.endings.length} (Heroines covered: ${endedHeroines.size}/15)`);
console.log(`Warnings: ${warnings.length} | Errors: ${errors.length}`);

for (const w of warnings) console.log(`WARN: ${w}`);
for (const e of errors) console.error(`ERROR: ${e}`);

process.exit(errors.length ? 1 : 0);
