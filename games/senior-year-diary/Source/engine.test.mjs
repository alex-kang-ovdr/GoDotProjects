import test from 'node:test';
import assert from 'node:assert/strict';
import '../Web/data/game-data.js';
import '../Web/engine.js';

const DATA = globalThis.SENIOR_YEAR_DIARY_DATA;
const { SeniorYearDiaryEngine, formatMinutes } = globalThis.SeniorYearDiaryEngine;

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

test('1. Initial state & Phase 2 verified data bundle integrity', () => {
  const engine = new SeniorYearDiaryEngine(DATA);
  assert.equal(DATA.characters.length, 22);
  assert.equal(engine.heroines.length, 15);
  assert.equal(DATA.zones.length, 4);
  assert.equal(DATA.locations.length, 41);
  assert.equal(DATA.days.length, 17);
  assert.ok(DATA.schedules.length >= 115, `Expected >=115 schedules, got ${DATA.schedules.length}`);
  assert.equal(DATA.schedules.length, 142);
  assert.equal(DATA.flags.length, 90);
  assert.ok(DATA.events.length >= 70, `Expected >=70 events, got ${DATA.events.length}`);
  assert.equal(DATA.events.length, 78);
  assert.equal(DATA.mutually_exclusive_groups.length, 3);
  assert.equal(DATA.phone_directory.length, 16);
  assert.equal(DATA.phone_events.length, 6);
  assert.equal(DATA.daily_rumor_hints.length, 17);
  assert.equal(DATA.endings.length, 19);

  assert.equal(engine.state.dayIndex, 0);
  assert.equal(engine.getCurrentDayMeta().date, '12-22');
  assert.equal(engine.state.minuteOfDay, 480);
  assert.equal(formatMinutes(engine.state.minuteOfDay), '08:00');
  assert.equal(engine.state.zoneId, 'yasohachi_town');
  assert.equal(engine.state.locationId, 'loc_home_room');
  assert.equal(engine.hasFlag('flg_prologue_done'), true);
  assert.equal(engine.state.mood.chr_yui, 50);
  assert.equal(engine.state.affection.chr_yui, 0);
  assert.equal(engine.state.ended, false);
});

test('2. 5-minute clock quantization, Dijkstra travel costs across zones & facility hours', () => {
  const engine = new SeniorYearDiaryEngine(DATA);

  const r1 = engine.travelTo('loc_home_living');
  assert.equal(r1.ok, true);
  assert.equal(r1.travelMinutes, 10);
  assert.equal(engine.state.minuteOfDay, 490);

  const r2 = engine.travelTo('loc_school_3b');
  assert.equal(r2.ok, true);
  assert.equal(r2.travelMinutes, 35);
  assert.equal(engine.state.zoneId, 'yasohachi_gakuen');
  assert.equal(engine.state.minuteOfDay, 525);

  const trainRoute = engine.computeShortestTravel('loc_school_3b', 'loc_kisaragi_station');
  assert.equal(trainRoute.reachable, true);
  assert.equal(trainRoute.travelMinutes, 70);
  assert.ok(trainRoute.modes.includes('train'));

  const r3 = engine.travelTo('loc_studio_ataru');
  assert.equal(r3.ok, true);
  assert.equal(r3.travelMinutes, 85);
  assert.equal(engine.state.zoneId, 'kisaragi_town');
  assert.equal(engine.state.minuteOfDay, 610);

  const rLocked = engine.travelTo('loc_nagashima_ryokan');
  assert.equal(rLocked.ok, false);
  assert.equal(rLocked.reason, 'ZONE_LOCKED');

  const w1 = engine.waitMinutes(7);
  assert.equal(w1.ok, true);
  assert.equal(w1.waitedMinutes, 5);
  assert.equal(engine.state.minuteOfDay % 5, 0);

  waitUntil(engine, 1230);
  const closedTry = engine.travelTo('loc_school_library');
  assert.equal(closedTry.ok, false);
  assert.equal(closedTry.reason, 'CLOSED');
});

test('3. Expanded 142-slot schedule coverage across all 15 heroines & all 17 calendar days', () => {
  const seenHeroines = new Set();

  const engineTown = new SeniorYearDiaryEngine(DATA);
  for (const p of engineTown.getPresentNpcs(0, 480)) seenHeroines.add(p.characterId);
  for (const p of engineTown.getPresentNpcs(0, 600)) seenHeroines.add(p.characterId);
  for (const p of engineTown.getPresentNpcs(0, 690)) seenHeroines.add(p.characterId);
  for (const p of engineTown.getPresentNpcs(0, 870)) seenHeroines.add(p.characterId);
  for (const p of engineTown.getPresentNpcs(1, 750)) seenHeroines.add(p.characterId);
  for (const p of engineTown.getPresentNpcs(3, 600)) seenHeroines.add(p.characterId);

  // Verify every single calendar day 0..16 (12-22 ~ 01-07) has active scheduled NPCs!
  for (let d = 0; d < 17; d++) {
    const morning = engineTown.getPresentNpcs(d, 540);
    assert.ok(morning.length > 0, `Expected active NPCs on dayIndex ${d} (${DATA.days[d].date}) at 09:00`);
  }

  // Verify Karen's authentic Hawaii absence on 12/31 ~ 01/03 (dayIndex 9..12)
  for (let d = 9; d <= 12; d++) {
    const tl = engineTown.getDayTimelineForHeroine('chr_karen', d);
    assert.equal(tl.segments.length, 0, `Expected Karen absent in Hawaii on ${DATA.days[d].date}`);
  }

  // Check Touji Onsen heroines (Sachiko, Kumiko) on Day 7 (12-29) via 12/28 Onsen + Yui branch
  const engineOnsen = new SeniorYearDiaryEngine(DATA);
  waitUntil(engineOnsen, 540);
  assert.equal(engineOnsen.travelTo('loc_school_gym_back').ok, true);
  assert.equal(engineOnsen.triggerEvent('evt_onsen_pre_akira_youko').ok, true);
  advanceToDay(engineOnsen, 6); // 12-28
  waitUntil(engineOnsen, 600);
  assert.equal(engineOnsen.triggerEvent('evt_onsen_phone_invite', 0).ok, true);
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
  const eng = new SeniorYearDiaryEngine(DATA);
  waitUntil(eng, 540);
  assert.equal(eng.travelTo('loc_school_gym_back').ok, true);
  assert.equal(eng.triggerEvent('evt_onsen_pre_akira_youko').ok, true);

  advanceToDay(eng, 6); // 12-28
  waitUntil(eng, 600); // 10:00 in loc_home_room
  const phoneEvents = eng.getAvailableEvents('loc_home_room');
  assert.equal(phoneEvents.length, 1);
  assert.equal(phoneEvents[0].id, 'evt_onsen_phone_invite');

  const izumiTry = eng.triggerEvent('evt_onsen_phone_invite', 2);
  assert.equal(izumiTry.ok, false);
  assert.equal(izumiTry.reason, 'CHOICE_LOCKED');

  const declineRes = eng.triggerEvent('evt_onsen_phone_invite', 3);
  assert.equal(declineRes.ok, true);
  assert.equal(eng.hasFlag('flg_onsen_trip_declined'), true);
  assert.equal(eng.hasFlag('flg_onsen_trip_joined'), false);

  const engMx = new SeniorYearDiaryEngine(DATA);
  assert.equal(engMx.travelTo('loc_school_3b').ok, true);
  assert.equal(engMx.triggerEvent('evt_minori_vase_broken').ok, true);

  advanceToDay(engMx, 3);
  waitUntil(engMx, 540);
  assert.equal(engMx.travelTo('loc_yasohachi_station').ok, true);
  assert.equal(engMx.triggerEvent('evt_misa_station_bump').ok, true);

  advanceToDay(engMx, 7);
  assert.equal(engMx.hasFlag('flg_onsen_trip_declined'), true);

  waitUntil(engMx, 540);
  assert.equal(engMx.travelTo('loc_school_tennis').ok, true);
  assert.equal(engMx.triggerEvent('evt_misa_tennis_match').ok, true);
  assert.equal(engMx.hasFlag('flg_misa_tennis_match'), true);

  waitUntil(engMx, 780);
  assert.equal(engMx.travelTo('loc_shirahegaike_park').ok, true);
  const minoriTry = engMx.triggerEvent('evt_minori_dec29_rescue');
  assert.equal(minoriTry.ok, false);
  assert.equal(minoriTry.reason, 'BLOCKED_BY_FLAG');
  assert.equal(engMx.getAvailableEvents('loc_shirahegaike_park').length, 0);
});

test('5. Telephone System: live whereabouts, 5-min cost, mood/affection & 12/28 Onsen phone trigger', () => {
  const eng = new SeniorYearDiaryEngine(DATA, { mode: 'classic' });

  // Home room has a phone
  assert.equal(eng.canUsePhone().canCall, true);
  const contacts = eng.getCallableHeroines();
  assert.equal(contacts.length, 16);

  // Call Misato at 08:00 -> costs 5 mins, discovers schedule in Classic mode, reveals live location & boosts mood/aff
  const callRes = eng.callHeroine('chr_misato');
  assert.equal(callRes.ok, true);
  assert.equal(callRes.timeCost, 5);
  assert.equal(eng.state.minuteOfDay, 485);
  assert.equal(callRes.affectionDelta, 3);
  assert.equal(callRes.moodDelta, 5);
  assert.equal(eng.state.affection.chr_misato, 3);
  assert.equal(eng.state.mood.chr_misato, 55);
  assert.ok(callRes.whereaboutsHint.includes('뉴바이'));
  assert.equal(eng.getDayTimelineForHeroine('chr_misato').visibleInCurrentMode, true);

  // Calling from a location without a phone fails cleanly
  assert.equal(eng.travelTo('loc_yasohachi_park').ok, true);
  const noPhoneRes = eng.callHeroine('chr_yui');
  assert.equal(noPhoneRes.ok, false);
  assert.equal(noPhoneRes.reason, 'NO_PHONE_HERE');

  // Complete pre-onsen event and trigger 12/28 Akira Onsen phone call from a PUBLIC PAYPHONE!
  waitUntil(eng, 540);
  assert.equal(eng.travelTo('loc_school_gym_back').ok, true);
  assert.equal(eng.triggerEvent('evt_onsen_pre_akira_youko').ok, true);
  advanceToDay(eng, 6); // 12-28
  waitUntil(eng, 600);
  assert.equal(eng.travelTo('loc_yasohachi_station').ok, true); // payphone!
  assert.equal(eng.canUsePhone().phoneType, 'payphone');

  const incoming = eng.getActiveIncomingPhoneEvents();
  assert.equal(incoming.length, 1);
  assert.equal(incoming[0].id, 'evt_onsen_phone_invite');

  const akiraCall = eng.callHeroine('chr_akira');
  assert.equal(akiraCall.ok, true);
  assert.equal(akiraCall.status, 'INCOMING_EVENT');
  assert.equal(akiraCall.triggeredPhoneEvent.id, 'evt_onsen_phone_invite');

  // Complete viaPhone from the payphone!
  const onsenAccept = eng.triggerEvent('evt_onsen_phone_invite', 0, { viaPhone: true });
  assert.equal(onsenAccept.ok, true);
  assert.equal(eng.hasFlag('flg_onsen_trip_joined'), true);
  assert.equal(eng.hasFlag('flg_onsen_partner_yui'), true);

  // Verify Karen Hawaii unavailable voicemail on 12/31 (dayIndex 9)
  advanceToDay(eng, 9);
  waitUntil(eng, 600);
  const karenHawaiiCall = eng.callHeroine('chr_karen');
  assert.equal(karenHawaiiCall.ok, true);
  assert.equal(karenHawaiiCall.status, 'UNAVAILABLE_DAY');
  assert.ok(karenHawaiiCall.responseLine.includes('하와이'));
});

test('6. Playable 12/29 Misa Tennis Rally Minigame: both Win and Loss paths advance cleanly', () => {
  // Setup helper at Day 7 (12-29) 09:00 loc_school_tennis with flg_misa_station_bump
  function setupMisaTennisDay() {
    const e = new SeniorYearDiaryEngine(DATA);
    advanceToDay(e, 3); // 12-25
    waitUntil(e, 540);
    assert.equal(e.travelTo('loc_yasohachi_station').ok, true);
    assert.equal(e.triggerEvent('evt_misa_station_bump').ok, true);
    advanceToDay(e, 7); // 12-29 (auto-declined Onsen)
    waitUntil(e, 540);
    assert.equal(e.travelTo('loc_school_tennis').ok, true);
    return e;
  }

  // Path A: Victory (5-0 by reading Misa's stance counters!)
  const engWin = setupMisaTennisDay();
  const startWin = engWin.startTennisMinigame();
  assert.equal(startWin.ok, true);
  assert.equal(startWin.match.boundToEvent, true);

  let lastWinRes = null;
  while (!engWin.state.activeTennisMatch.finished) {
    const counterShot = engWin.state.activeTennisMatch.misaStance.counter;
    lastWinRes = engWin.playTennisTurn(counterShot);
    assert.equal(lastWinRes.ok, true);
  }
  assert.equal(lastWinRes.match.winner, 'player');
  assert.equal(lastWinRes.match.playerScore, 5);
  assert.equal(lastWinRes.match.misaScore, 0);
  assert.ok(lastWinRes.eventResult && lastWinRes.eventResult.ok);
  assert.equal(engWin.hasFlag('flg_misa_tennis_match'), true);
  assert.equal(engWin.hasFlag('flg_misa_tennis_won'), true);
  assert.equal(lastWinRes.eventResult.affectionDelta, 35); // 20 base + 15 win bonus
  assert.equal(lastWinRes.eventResult.moodDelta, 20);

  // Path B: Defeat (0-5 by intentionally picking wrong shots -> STILL advances cleanly per original rule!)
  const engLose = setupMisaTennisDay();
  engLose.startTennisMinigame();
  let lastLoseRes = null;
  while (!engLose.state.activeTennisMatch.finished) {
    const counter = engLose.state.activeTennisMatch.misaStance.counter;
    const wrongShot = counter === 'power' ? 'lob' : 'power';
    lastLoseRes = engLose.playTennisTurn(wrongShot);
    assert.equal(lastLoseRes.ok, true);
  }
  assert.equal(lastLoseRes.match.winner, 'misa');
  assert.equal(lastLoseRes.match.playerScore, 0);
  assert.equal(lastLoseRes.match.misaScore, 5);
  assert.ok(lastLoseRes.eventResult && lastLoseRes.eventResult.ok);
  assert.equal(engLose.hasFlag('flg_misa_tennis_match'), true);
  assert.equal(engLose.hasFlag('flg_misa_tennis_won'), false);
  assert.equal(lastLoseRes.eventResult.affectionDelta, 25); // 20 base + 5 loss bonus

  // Verify 12/30 Kisaragi date unlocks on BOTH paths!
  advanceToDay(engLose, 8); // 12-30
  waitUntil(engLose, 765);
  assert.equal(engLose.travelTo('loc_kisaragi_station').ok, true);
  const nextMisaEvents = engLose.getAvailableEvents('loc_kisaragi_station');
  assert.ok(nextMisaEvents.some((ev) => ev.id === 'evt_misa_kisaragi_date'));
});

test('7. Daily 24h NPC Timeline Helper & Quick Route Guide recommendations', () => {
  const eng = new SeniorYearDiaryEngine(DATA, { mode: 'easy_remake' });
  const misakoTl = eng.getDayTimelineForHeroine('chr_misako', 0);
  assert.equal(misakoTl.visibleInCurrentMode, true);
  assert.ok(misakoTl.segments.length >= 3, `Expected multiple daily segments for Misako, got ${misakoTl.segments.length}`);
  assert.ok(misakoTl.segments.some((s) => s.hasEvent && s.eventId === 'evt_misako_cafe_help'));

  // Classic mode hides undiscovered timelines until called/talked
  eng.setMode('classic');
  assert.equal(eng.getDayTimelineForHeroine('chr_karen', 0).visibleInCurrentMode, false);
  eng.callHeroine('chr_karen');
  assert.equal(eng.getDayTimelineForHeroine('chr_karen', 0).visibleInCurrentMode, true);

  // Quick Route Guide returns prioritized active/upcoming events with Dijkstra ETA
  eng.setMode('easy_remake');
  const recs = eng.getQuickRouteRecommendations(3);
  assert.equal(recs.length, 3);
  assert.equal(recs[0].activeNow, true);
  assert.ok(Number.isFinite(recs[0].travelMinutes));
});

test('8. Verified Mood/Affection choice branches (Karen house & Youko End 2 variant)', () => {
  // Karen 12/22 '만나러 왔을 뿐' (+mood) vs '사인' (-mood)
  const engPos = new SeniorYearDiaryEngine(DATA);
  waitUntil(engPos, 660);
  assert.equal(engPos.travelTo('loc_karen_house').ok, true);
  const posRes = engPos.triggerEvent('evt_karen_house_intro', 0);
  assert.equal(posRes.ok, true);
  assert.equal(posRes.moodDelta, 18);
  assert.equal(engPos.state.mood.chr_karen, 68);
  assert.equal(engPos.hasFlag('flg_karen_mood_positive'), true);

  const engNeg = new SeniorYearDiaryEngine(DATA);
  waitUntil(engNeg, 660);
  assert.equal(engNeg.travelTo('loc_karen_house').ok, true);
  const negRes = engNeg.triggerEvent('evt_karen_house_intro', 1);
  assert.equal(negRes.ok, true);
  assert.equal(negRes.moodDelta, -20);
  assert.equal(engNeg.state.mood.chr_karen, 30);
  assert.equal(engNeg.getMoodMeta(engNeg.state.mood.chr_karen).id, 'gloomy');

  // Youko climax Choice 1 reaches end_youko_alt!
  const engYoukoAlt = new SeniorYearDiaryEngine(DATA);
  advanceToDay(engYoukoAlt, 1);
  waitUntil(engYoukoAlt, 720);
  assert.equal(engYoukoAlt.travelTo('loc_game_center').ok, true);
  assert.equal(engYoukoAlt.triggerEvent('evt_youko_arcade_intro').ok, true);
  advanceToDay(engYoukoAlt, 13);
  waitUntil(engYoukoAlt, 900);
  assert.equal(engYoukoAlt.travelTo('loc_youko_house').ok, true);
  assert.equal(engYoukoAlt.triggerEvent('evt_youko_climax', 1).ok, true);
  assert.equal(engYoukoAlt.hasFlag('flg_youko_route_alt_variant'), true);
  advanceToDay(engYoukoAlt, 16);
  assert.equal(engYoukoAlt.state.endingId, 'end_youko_alt');
});

test('9. Full scripted playthrough A: Narusawa Yui ending on 01-07', () => {
  const eng = new SeniorYearDiaryEngine(DATA);

  advanceToDay(eng, 2);
  waitUntil(eng, 1200);
  assert.equal(eng.travelTo('loc_home_living').ok, true);
  assert.equal(eng.triggerEvent('evt_yui_eve_coat').ok, true);
  assert.equal(eng.hasFlag('flg_yui_coat_eve'), true);

  advanceToDay(eng, 10);
  assert.equal(eng.travelTo('loc_home_living').ok, true);
  assert.equal(eng.triggerEvent('evt_yui_jan1_shrine').ok, true);
  assert.equal(eng.hasFlag('flg_yui_shrine_jan1'), true);

  advanceToDay(eng, 15);
  waitUntil(eng, 1200);
  assert.equal(eng.travelTo('loc_home_yui_room').ok, true);
  assert.equal(eng.triggerEvent('evt_yui_jan6_climax').ok, true);
  assert.equal(eng.hasFlag('flg_yui_route_complete'), true);

  const endRes = eng.sleepToNextDay();
  assert.equal(endRes.ok, true);
  assert.equal(endRes.ended, true);
  assert.equal(eng.state.dayIndex, 16);
  assert.equal(endRes.ending.id, 'end_yui');
  assert.equal(eng.state.endingId, 'end_yui');
});

test('10. Full scripted playthrough B: Minamikawa Youko priority-1000 override trumps Yui', () => {
  const eng = new SeniorYearDiaryEngine(DATA);

  advanceToDay(eng, 1);
  waitUntil(eng, 720);
  assert.equal(eng.travelTo('loc_game_center').ok, true);
  assert.equal(eng.triggerEvent('evt_youko_arcade_intro').ok, true);

  advanceToDay(eng, 2);
  waitUntil(eng, 1200);
  assert.equal(eng.travelTo('loc_home_living').ok, true);
  assert.equal(eng.triggerEvent('evt_yui_eve_coat').ok, true);

  advanceToDay(eng, 10);
  assert.equal(eng.travelTo('loc_home_living').ok, true);
  assert.equal(eng.triggerEvent('evt_yui_jan1_shrine').ok, true);

  advanceToDay(eng, 13);
  waitUntil(eng, 900);
  assert.equal(eng.travelTo('loc_youko_house').ok, true);
  assert.equal(eng.triggerEvent('evt_youko_climax', 0).ok, true);
  assert.equal(eng.hasFlag('flg_youko_ending_override_active'), true);

  advanceToDay(eng, 15);
  waitUntil(eng, 1200);
  assert.equal(eng.travelTo('loc_home_yui_room').ok, true);
  assert.equal(eng.triggerEvent('evt_yui_jan6_climax').ok, true);
  assert.equal(eng.hasFlag('flg_yui_route_complete'), true);

  const endRes = eng.sleepToNextDay();
  assert.equal(endRes.ended, true);
  assert.equal(endRes.ending.id, 'end_youko_main');
});

test('11. Full scripted playthrough C: Izumi Onsen partner route + 01/06 home-return trap verification', () => {
  const eng = new SeniorYearDiaryEngine(DATA);

  waitUntil(eng, 540);
  assert.equal(eng.travelTo('loc_home_front').ok, true);
  assert.equal(eng.triggerEvent('evt_izumi_parfait_intro').ok, true);
  assert.equal(eng.travelTo('loc_school_gym_back').ok, true);
  assert.equal(eng.triggerEvent('evt_onsen_pre_akira_youko').ok, true);

  advanceToDay(eng, 6);
  waitUntil(eng, 540);
  assert.equal(eng.travelTo('loc_studio_ataru').ok, true);
  assert.equal(eng.triggerEvent('evt_izumi_pre_onsen_date').ok, true);
  assert.equal(eng.travelTo('loc_home_room').ok, true);
  const phoneRes = eng.triggerEvent('evt_onsen_phone_invite', 2);
  assert.equal(phoneRes.ok, true);
  assert.equal(eng.hasFlag('flg_onsen_trip_joined'), true);
  assert.equal(eng.hasFlag('flg_onsen_partner_izumi'), true);

  advanceToDay(eng, 7);
  assert.equal(eng.state.zoneId, 'touji_onsen');
  assert.equal(eng.state.locationId, 'loc_nagashima_ryokan');
  assert.deepEqual(eng.getActiveZones(), ['touji_onsen']);

  waitUntil(eng, 960);
  assert.equal(eng.triggerEvent('evt_izumi_onsen_climax').ok, true);
  assert.equal(eng.hasFlag('flg_izumi_route_complete'), true);

  advanceToDay(eng, 9);
  assert.equal(eng.state.zoneId, 'yasohachi_town');
  assert.equal(eng.state.locationId, 'loc_home_room');

  advanceToDay(eng, 15);
  const savedBeforeJan6 = eng.serialize();

  const safeEnd = eng.sleepToNextDay();
  assert.equal(safeEnd.ending.id, 'end_izumi');

  eng.deserialize(savedBeforeJan6);
  assert.equal(eng.travelTo('loc_home_front').ok, true);
  const trapReturn = eng.travelTo('loc_home_living');
  assert.equal(trapReturn.ok, true);
  assert.equal(trapReturn.jan6HomeTrapTriggered, true);
  assert.equal(eng.hasFlag('flg_onsen_jan6_home_broken'), true);
  const failEnd = eng.sleepToNextDay();
  assert.equal(failEnd.ending.id, 'end_onsen_jan6_home_fail');
});

test('12. Full scripted playthrough D: Tanaka Misa full route via playable Tennis Minigame', () => {
  const eng = new SeniorYearDiaryEngine(DATA);
  advanceToDay(eng, 3); // 12-25
  waitUntil(eng, 540);
  assert.equal(eng.travelTo('loc_yasohachi_station').ok, true);
  assert.equal(eng.triggerEvent('evt_misa_station_bump').ok, true);

  advanceToDay(eng, 7); // 12-29
  waitUntil(eng, 540);
  assert.equal(eng.travelTo('loc_school_tennis').ok, true);
  eng.startTennisMinigame();
  while (!eng.state.activeTennisMatch.finished) {
    eng.playTennisTurn(eng.state.activeTennisMatch.misaStance.counter);
  }
  assert.equal(eng.hasFlag('flg_misa_tennis_won'), true);

  advanceToDay(eng, 8); // 12-30
  waitUntil(eng, 765);
  assert.equal(eng.travelTo('loc_kisaragi_station').ok, true);
  assert.equal(eng.triggerEvent('evt_misa_kisaragi_date', 0).ok, true);

  advanceToDay(eng, 14); // 01-05
  waitUntil(eng, 900);
  assert.equal(eng.travelTo('loc_station_hotel').ok, true);
  assert.equal(eng.triggerEvent('evt_misa_climax').ok, true);

  advanceToDay(eng, 16);
  assert.equal(eng.state.ended, true);
  assert.equal(eng.state.endingId, 'end_misa');
});

test('13. Full scripted playthrough E: Solo Normal Ending on 01-07', () => {
  const eng = new SeniorYearDiaryEngine(DATA);
  advanceToDay(eng, 16);
  assert.equal(eng.state.ended, true);
  assert.equal(eng.state.endingId, 'end_solo_normal');
  assert.equal(eng.evaluateEnding().id, 'end_solo_normal');
});

test('14. Save/load serialization round-trip determinism (with mood/phone) & corruption guard', () => {
  const eng1 = new SeniorYearDiaryEngine(DATA, { mode: 'classic' });
  eng1.callHeroine('chr_tomomi');
  eng1.travelTo('loc_home_living');
  eng1.talkToNpc('chr_yui');
  eng1.waitMinutes(45);
  eng1.travelTo('loc_home_front');
  eng1.triggerEvent('evt_izumi_parfait_intro');

  const serialized = eng1.serialize();
  const eng2 = new SeniorYearDiaryEngine(DATA);
  eng2.deserialize(serialized);

  // lastImpact is transient UI toast, normalize before deepEqual
  const snap1 = eng1.getSnapshot();
  const snap2 = eng2.getSnapshot();
  snap1.lastImpact = null;
  snap2.lastImpact = null;
  assert.deepEqual(snap2, snap1);
  assert.deepEqual(eng2.getWorldNpcRadar().entries.map((e) => e.slot.id), eng1.getWorldNpcRadar().entries.map((e) => e.slot.id));

  const badSave = JSON.parse(serialized);
  badSave.flags.push('flg_onsen_trip_joined', 'flg_onsen_trip_declined');
  assert.throws(() => eng2.deserialize(badSave), /mutual exclusion/i);
});
