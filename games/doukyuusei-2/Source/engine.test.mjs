import test from 'node:test';
import assert from 'node:assert/strict';
import '../Web/data/game-data.js';
import '../Web/engine.js';

const DATA = globalThis.DOUKYUUSEI2_DATA;
const { Doukyuusei2Engine, formatMinutes } = globalThis.Doukyuusei2Engine;

function advanceToDay(engine, targetDayIndex) {
  while (engine.state.dayIndex < targetDayIndex && !engine.state.ended) {
    const res = engine.sleepToNextDay();
    assert.equal(res.ok, true);
  }
  assert.equal(engine.state.dayIndex, targetDayIndex);
}

function waitUntil(engine, targetMinute) {
  if (engine.state.minuteOfDay < targetMinute) {
    const res = engine.waitMinutes(targetMinute - engine.state.minuteOfDay);
    assert.equal(res.ok, true);
  }
}

test('1. Initial state & verified data bundle integrity', () => {
  const engine = new Doukyuusei2Engine(DATA);
  assert.equal(DATA.characters.length, 22);
  assert.equal(engine.heroines.length, 15);
  assert.equal(DATA.zones.length, 4);
  assert.equal(DATA.locations.length, 41);
  assert.equal(DATA.days.length, 17);
  assert.equal(DATA.schedules.length, 57);
  assert.equal(DATA.flags.length, 60);
  assert.equal(DATA.events.length, 51);
  assert.equal(DATA.mutually_exclusive_groups.length, 3);
  assert.equal(DATA.endings.length, 19);

  assert.equal(engine.state.dayIndex, 0);
  assert.equal(engine.getCurrentDayMeta().date, '12-22');
  assert.equal(engine.state.minuteOfDay, 480);
  assert.equal(formatMinutes(engine.state.minuteOfDay), '08:00');
  assert.equal(engine.state.zoneId, 'yasohachi_town');
  assert.equal(engine.state.locationId, 'loc_home_room');
  assert.equal(engine.hasFlag('flg_prologue_done'), true);
  assert.equal(engine.state.ended, false);
});

test('2. 5-minute clock quantization, Dijkstra travel costs across zones & facility hours', () => {
  const engine = new Doukyuusei2Engine(DATA);

  // Indoor step: room -> living = +10m
  const r1 = engine.travelTo('loc_home_living');
  assert.equal(r1.ok, true);
  assert.equal(r1.travelMinutes, 10);
  assert.equal(engine.state.minuteOfDay, 490);

  // Multi-hop indoor + town_map + school_step: living -> home_front(10) -> school_gate(15) -> school_3b(10) = 35m
  const r2 = engine.travelTo('loc_school_3b');
  assert.equal(r2.ok, true);
  assert.equal(r2.travelMinutes, 35);
  assert.equal(engine.state.zoneId, 'yasohachi_gakuen');
  assert.equal(engine.state.minuteOfDay, 525);

  // Cross-zone train travel to Kisaragi Town: 3b -> gate(10) -> home_front(15) -> yasohachi_station(15) -> kisaragi_station(30) = 70m
  const trainRoute = engine.computeShortestTravel('loc_school_3b', 'loc_kisaragi_station');
  assert.equal(trainRoute.reachable, true);
  assert.equal(trainRoute.travelMinutes, 70);
  assert.ok(trainRoute.modes.includes('train'));

  // Studio ATARU opens at 10:00 (600m); arrival from 3b at 525 + 85 = 610m should be open!
  const r3 = engine.travelTo('loc_studio_ataru');
  assert.equal(r3.ok, true);
  assert.equal(r3.travelMinutes, 85);
  assert.equal(engine.state.zoneId, 'kisaragi_town');
  assert.equal(engine.state.minuteOfDay, 610);

  // Touji Onsen is locked on regular days
  const rLocked = engine.travelTo('loc_nagashima_ryokan');
  assert.equal(rLocked.ok, false);
  assert.equal(rLocked.reason, 'ZONE_LOCKED');

  // 5-min clock quantization on waitMinutes (e.g., 7 -> 5, 13 -> 15)
  const w1 = engine.waitMinutes(7);
  assert.equal(w1.ok, true);
  assert.equal(w1.waitedMinutes, 5);
  assert.equal(engine.state.minuteOfDay % 5, 0);

  // Facility closed hours check: wait until 20:30 (1230m), school_library closes at 18:00 (1080m)
  waitUntil(engine, 1230);
  const closedTry = engine.travelTo('loc_school_library');
  assert.equal(closedTry.ok, false);
  assert.equal(closedTry.reason, 'CLOSED');
});

test('3. Live NPC schedule resolution covers all 15 heroines via npc_schedules.json', () => {
  const seenHeroines = new Set();

  // Check standard town heroines across Day 0..5 with appropriate flags
  const engineTown = new Doukyuusei2Engine(DATA);
  // Day 0 08:00: Yui (living), Misato (nyubai_travel), Minori (school_3b)
  for (const p of engineTown.getPresentNpcs(0, 480)) seenHeroines.add(p.characterId);
  // Day 0 10:00: Misako (cafe), Izumi (home_front), Kozue (library), Mirei (staffroom), Azumi (nursery)
  for (const p of engineTown.getPresentNpcs(0, 600)) seenHeroines.add(p.characterId);
  // Day 0 11:30: Karen (karen_house)
  for (const p of engineTown.getPresentNpcs(0, 690)) seenHeroines.add(p.characterId);
  // Day 0 14:30: Sakurako (city_hospital)
  for (const p of engineTown.getPresentNpcs(0, 870)) seenHeroines.add(p.characterId);
  // Day 1 12:30: Tomomi (tomomi_house), Youko (game_center)
  for (const p of engineTown.getPresentNpcs(1, 750)) seenHeroines.add(p.characterId);
  // Day 3 (12-25) 10:00: Misa (yasohachi_station)
  for (const p of engineTown.getPresentNpcs(3, 600)) seenHeroines.add(p.characterId);

  // Check Touji Onsen heroines (Sachiko, Kumiko) on Day 7 (12-29) via real 12/28 Onsen + Yui phone branch
  const engineOnsen = new Doukyuusei2Engine(DATA);
  waitUntil(engineOnsen, 540);
  assert.equal(engineOnsen.travelTo('loc_school_gym_back').ok, true);
  assert.equal(engineOnsen.triggerEvent('evt_onsen_pre_akira_youko').ok, true);
  advanceToDay(engineOnsen, 6); // 12-28
  waitUntil(engineOnsen, 600);
  assert.equal(engineOnsen.triggerEvent('evt_onsen_phone_invite', 0).ok, true); // Partner: Yui
  advanceToDay(engineOnsen, 7); // 12-29 in touji_onsen
  for (const p of engineOnsen.getPresentNpcs(7, 960)) seenHeroines.add(p.characterId);

  for (const h of engineTown.heroines) {
    assert.ok(seenHeroines.has(h.id), `Expected heroine ${h.id} (${h.name_ko}) to resolve on schedule`);
  }
  assert.equal(
    [...seenHeroines].filter((id) => engineTown.charMap.get(id)?.romanceable).length,
    15
  );

  // Verify priority override: Misako at 12/24 14:30 gets evt_misako_cafe_frog (priority 90) over daily cafe routine (priority 10)
  const misakoEve = engineTown.getPresentNpcs(2, 870, 'loc_home_cafe').find((p) => p.characterId === 'chr_misako');
  assert.ok(misakoEve);
  assert.equal(misakoEve.slot.id, 'sch_misako_cafe_frog');
  assert.equal(misakoEve.eventId, 'evt_misako_cafe_frog');
});

test('4. Mutual exclusion enforcement: 12/28 Onsen branch & 12/29 Minori vs Misa', () => {
  // Part A: 12/28 Onsen phone call requires Izumi pre-date to unlock choice 2 (Izumi partner)
  const eng = new Doukyuusei2Engine(DATA);
  // Complete Akira/Youko pre-onsen event on 12/22
  waitUntil(eng, 540);
  assert.equal(eng.travelTo('loc_school_gym_back').ok, true);
  assert.equal(eng.triggerEvent('evt_onsen_pre_akira_youko').ok, true);

  advanceToDay(eng, 6); // 12-28
  waitUntil(eng, 600); // 10:00 in loc_home_room
  const phoneEvents = eng.getAvailableEvents('loc_home_room');
  assert.equal(phoneEvents.length, 1);
  assert.equal(phoneEvents[0].id, 'evt_onsen_phone_invite');

  // Choice 2 (Izumi) must be locked since flg_izumi_pre_onsen_date is not set
  const izumiTry = eng.triggerEvent('evt_onsen_phone_invite', 2);
  assert.equal(izumiTry.ok, false);
  assert.equal(izumiTry.reason, 'CHOICE_LOCKED');

  // Choose Choice 3 (Decline Onsen -> stay in town)
  const declineRes = eng.triggerEvent('evt_onsen_phone_invite', 3);
  assert.equal(declineRes.ok, true);
  assert.equal(eng.hasFlag('flg_onsen_trip_declined'), true);
  assert.equal(eng.hasFlag('flg_onsen_trip_joined'), false);

  // Part B: 12/29 Minori vs Misa mutual exclusion
  const engMx = new Doukyuusei2Engine(DATA);
  // Day 0 (12-22): Minori vase event (08:00~09:30 at school_3b)
  assert.equal(engMx.travelTo('loc_school_3b').ok, true);
  assert.equal(engMx.triggerEvent('evt_minori_vase_broken').ok, true);

  // Day 3 (12-25): Misa station bump (09:00~17:00 at yasohachi_station)
  advanceToDay(engMx, 3);
  waitUntil(engMx, 540);
  assert.equal(engMx.travelTo('loc_yasohachi_station').ok, true);
  assert.equal(engMx.triggerEvent('evt_misa_station_bump').ok, true);

  // Day 7 (12-29): Stayed in town (auto declined Onsen)
  advanceToDay(engMx, 7);
  assert.equal(engMx.hasFlag('flg_onsen_trip_declined'), true);

  // 09:00 Tennis match with Misa
  waitUntil(engMx, 540);
  assert.equal(engMx.travelTo('loc_school_tennis').ok, true);
  assert.equal(engMx.triggerEvent('evt_misa_tennis_match').ok, true);
  assert.equal(engMx.hasFlag('flg_misa_tennis_match'), true);

  // Now at 13:00 (780m), travel to Shirahegaike Park: Minori's rescue event MUST be blocked by mx_dec29_minori_vs_misa!
  waitUntil(engMx, 780);
  assert.equal(engMx.travelTo('loc_shirahegaike_park').ok, true);
  const minoriTry = engMx.triggerEvent('evt_minori_dec29_rescue');
  assert.equal(minoriTry.ok, false);
  assert.equal(minoriTry.reason, 'BLOCKED_BY_FLAG');
  assert.equal(engMx.getAvailableEvents('loc_shirahegaike_park').length, 0);
});

test('5. Full scripted playthrough A: Narusawa Yui ending on 01-07', () => {
  const eng = new Doukyuusei2Engine(DATA);

  // Day 2 (12-24): 20:00 Yui coat in living room
  advanceToDay(eng, 2);
  waitUntil(eng, 1200);
  assert.equal(eng.travelTo('loc_home_living').ok, true);
  assert.equal(eng.triggerEvent('evt_yui_eve_coat').ok, true);
  assert.equal(eng.hasFlag('flg_yui_coat_eve'), true);

  // Day 10 (01-01): 08:00 Yui shrine visit in living room
  advanceToDay(eng, 10);
  assert.equal(eng.travelTo('loc_home_living').ok, true);
  assert.equal(eng.triggerEvent('evt_yui_jan1_shrine').ok, true);
  assert.equal(eng.hasFlag('flg_yui_shrine_jan1'), true);

  // Day 15 (01-06): 20:00 Yui room climax
  advanceToDay(eng, 15);
  waitUntil(eng, 1200);
  assert.equal(eng.travelTo('loc_home_yui_room').ok, true);
  assert.equal(eng.triggerEvent('evt_yui_jan6_climax').ok, true);
  assert.equal(eng.hasFlag('flg_yui_route_complete'), true);

  // Sleep to 01-07 Opening Ceremony
  const endRes = eng.sleepToNextDay();
  assert.equal(endRes.ok, true);
  assert.equal(endRes.ended, true);
  assert.equal(eng.state.dayIndex, 16);
  assert.equal(endRes.ending.id, 'end_yui');
  assert.equal(eng.state.endingId, 'end_yui');
});

test('6. Full scripted playthrough B: Minamikawa Youko priority-1000 override trumps Yui', () => {
  const eng = new Doukyuusei2Engine(DATA);

  // Complete Youko intro on Day 1 (12-23) at game_center (12:00~19:00)
  advanceToDay(eng, 1);
  waitUntil(eng, 720);
  assert.equal(eng.travelTo('loc_game_center').ok, true);
  assert.equal(eng.triggerEvent('evt_youko_arcade_intro').ok, true);

  // Also complete Yui's full route!
  advanceToDay(eng, 2);
  waitUntil(eng, 1200);
  assert.equal(eng.travelTo('loc_home_living').ok, true);
  assert.equal(eng.triggerEvent('evt_yui_eve_coat').ok, true);

  advanceToDay(eng, 10);
  assert.equal(eng.travelTo('loc_home_living').ok, true);
  assert.equal(eng.triggerEvent('evt_yui_jan1_shrine').ok, true);

  // Day 13 (01-04): Complete Youko climax (activates flg_youko_ending_override_active!)
  advanceToDay(eng, 13);
  waitUntil(eng, 900);
  assert.equal(eng.travelTo('loc_youko_house').ok, true);
  assert.equal(eng.triggerEvent('evt_youko_climax').ok, true);
  assert.equal(eng.hasFlag('flg_youko_ending_override_active'), true);

  // Day 15 (01-06): Also complete Yui climax
  advanceToDay(eng, 15);
  waitUntil(eng, 1200);
  assert.equal(eng.travelTo('loc_home_yui_room').ok, true);
  assert.equal(eng.triggerEvent('evt_yui_jan6_climax').ok, true);
  assert.equal(eng.hasFlag('flg_yui_route_complete'), true);

  // On 01-07, Youko (priority 1000) MUST override Yui (priority 900)
  const endRes = eng.sleepToNextDay();
  assert.equal(endRes.ended, true);
  assert.equal(endRes.ending.id, 'end_youko_main');
});

test('7. Full scripted playthrough C: Izumi Onsen partner route + 01/06 home-return trap verification', () => {
  const eng = new Doukyuusei2Engine(DATA);

  // Day 0 (12-22): Izumi parfait + Akira/Youko pre-onsen
  waitUntil(eng, 540);
  assert.equal(eng.travelTo('loc_home_front').ok, true);
  assert.equal(eng.triggerEvent('evt_izumi_parfait_intro').ok, true);
  assert.equal(eng.travelTo('loc_school_gym_back').ok, true);
  assert.equal(eng.triggerEvent('evt_onsen_pre_akira_youko').ok, true);

  // Day 6 (12-28): Izumi pre-onsen date at Studio ATARU (10:00~17:00), then return to home_room for Akira phone call
  advanceToDay(eng, 6);
  waitUntil(eng, 540);
  assert.equal(eng.travelTo('loc_studio_ataru').ok, true);
  assert.equal(eng.triggerEvent('evt_izumi_pre_onsen_date').ok, true);
  assert.equal(eng.travelTo('loc_home_room').ok, true);
  // Choose Choice 2: Join Onsen + Izumi!
  const phoneRes = eng.triggerEvent('evt_onsen_phone_invite', 2);
  assert.equal(phoneRes.ok, true);
  assert.equal(eng.hasFlag('flg_onsen_trip_joined'), true);
  assert.equal(eng.hasFlag('flg_onsen_partner_izumi'), true);

  // Day 7 (12-29): Automatically transported to touji_onsen / loc_nagashima_ryokan!
  advanceToDay(eng, 7);
  assert.equal(eng.state.zoneId, 'touji_onsen');
  assert.equal(eng.state.locationId, 'loc_nagashima_ryokan');
  assert.deepEqual(eng.getActiveZones(), ['touji_onsen']);

  // Trigger Izumi Onsen climax at 16:00 (960m)
  waitUntil(eng, 960);
  assert.equal(eng.triggerEvent('evt_izumi_onsen_climax').ok, true);
  assert.equal(eng.hasFlag('flg_izumi_route_complete'), true);

  // Day 9 (12-31): Automatically returned to yasohachi_town
  advanceToDay(eng, 9);
  assert.equal(eng.state.zoneId, 'yasohachi_town');
  assert.equal(eng.state.locationId, 'loc_home_room');

  // Fork snapshot before 01-06 to test BOTH safe ending AND home-return trap
  advanceToDay(eng, 15); // 01-06
  const savedBeforeJan6 = eng.serialize();

  // Path 1 (Safe): Don't return home after going out -> end_izumi!
  const safeEnd = eng.sleepToNextDay();
  assert.equal(safeEnd.ending.id, 'end_izumi');

  // Path 2 (Trap): Go out on 01-06, then return to loc_home_living -> flg_onsen_jan6_home_broken -> end_onsen_jan6_home_fail!
  eng.deserialize(savedBeforeJan6);
  assert.equal(eng.travelTo('loc_home_front').ok, true);
  const trapReturn = eng.travelTo('loc_home_living');
  assert.equal(trapReturn.ok, true);
  assert.equal(trapReturn.jan6HomeTrapTriggered, true);
  assert.equal(eng.hasFlag('flg_onsen_jan6_home_broken'), true);
  const failEnd = eng.sleepToNextDay();
  assert.equal(failEnd.ending.id, 'end_onsen_jan6_home_fail');
});

test('8. Full scripted playthrough D: Solo Normal Ending on 01-07', () => {
  const eng = new Doukyuusei2Engine(DATA);
  advanceToDay(eng, 16);
  assert.equal(eng.state.ended, true);
  assert.equal(eng.state.endingId, 'end_solo_normal');
  assert.equal(eng.evaluateEnding().id, 'end_solo_normal');
});

test('9. Save/load serialization round-trip determinism & corruption guard', () => {
  const eng1 = new Doukyuusei2Engine(DATA, { mode: 'classic' });
  eng1.travelTo('loc_home_living');
  eng1.talkToNpc('chr_yui');
  eng1.waitMinutes(45);
  eng1.travelTo('loc_home_front');
  eng1.triggerEvent('evt_izumi_parfait_intro');

  const serialized = eng1.serialize();
  const eng2 = new Doukyuusei2Engine(DATA);
  eng2.deserialize(serialized);

  assert.deepEqual(eng2.getSnapshot(), eng1.getSnapshot());
  assert.deepEqual(eng2.getWorldNpcRadar().entries.map((e) => e.slot.id), eng1.getWorldNpcRadar().entries.map((e) => e.slot.id));

  // Corrupted save violating mutual exclusion must throw
  const badSave = JSON.parse(serialized);
  badSave.flags.push('flg_onsen_trip_joined', 'flg_onsen_trip_declined');
  assert.throws(() => eng2.deserialize(badSave), /mutual exclusion/i);
});
