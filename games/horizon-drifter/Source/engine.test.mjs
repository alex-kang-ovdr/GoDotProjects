import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const gameRoot = resolve(__dirname, '..');
const require = createRequire(import.meta.url);
const YUNO_DATA = require('../Web/data/game-data.js');
const YunoEngine = require('../Web/engine.js');

/** Helper: plays through all 6 modern routes + 6 light jewels + convergence -> enters Dela Grante */
function playModernToIsekai(eng, { useHotspots = false } = {}) {
  assert.equal(eng.advanceToNode('node_prologue_coast_cape').ok, true);
  assert.equal(eng.advanceToNode('node_prologue_triangle_encounter').ok, true);
  assert.equal(eng.advanceToNode('node_day1_hub').ok, true);
  assert.equal(eng.placeJewel().ok, true); // Anchor #1: Day 1 Hub (Study luggage intact!)

  if (useHotspots) {
    const drawerRes = eng.inspectHotspot('hs_room_drawer');
    assert.equal(drawerRes.ok, true);
    assert.equal(drawerRes.action, 'advance');
  } else {
    assert.equal(eng.advanceToNode('node_jewel1_drawer').ok, true); // Jewel #1
  }
  assert.equal(eng.advanceToNode('node_school_day1_gate').ok, true);
  assert.equal(eng.placeJewel().ok, true); // Anchor #2: School Gate

  // 1. Mitsuki Route -> Jewel #2 + Rope + Well Silver Medal + Mitsuki End
  assert.equal(eng.advanceToNode('node_mitsuki_call').ok, true);
  assert.equal(eng.advanceToNode('node_mitsuki_mansion_sneak').ok, true);
  assert.equal(eng.advanceToNode('node_mitsuki_storehouse').ok, true); // Jewel #2 + Rope
  if (useHotspots) {
    const wellRes = eng.useItemOnHotspot('item_rope', 'hs_storehouse_well');
    assert.equal(wellRes.ok, true);
    assert.equal(wellRes.action, 'advance');
  } else {
    assert.equal(eng.advanceToNode('node_mitsuki_well_medal').ok, true); // Silver Medal
  }
  assert.equal(eng.advanceToNode('node_mitsuki_end').ok, true);
  assert.equal(eng.jumpToJewel('node_school_day1_gate', { keepPlaced: true }).ok, true);

  // 2. Ayumi Route -> Jewel #3 + Desk Safe + Toyotomi + Blue Card + Ayumi End
  assert.equal(eng.advanceToNode('node_ayumi_branch').ok, true);
  assert.equal(eng.advanceToNode('node_ayumi_jewel3_mountain').ok, true); // Jewel #3
  assert.equal(eng.advanceToNode('node_ayumi_desk_safe').ok, true);
  assert.equal(eng.advanceToNode('node_ayumi_toyotomi_confront').ok, true);
  assert.equal(eng.advanceToNode('node_ayumi_blue_card').ok, true); // Blue Card
  assert.equal(eng.advanceToNode('node_ayumi_end').ok, true);
  assert.equal(eng.jumpToJewel('node_school_day1_gate', { keepPlaced: true }).ok, true);

  // 3. Kaori Route (Blue Card inherited) -> Jewel #4 + Chounenseki + Kaori End
  assert.equal(eng.advanceToNode('node_kaori_branch').ok, true);
  assert.equal(eng.advanceToNode('node_kaori_dossier_analysis').ok, true);
  assert.equal(eng.advanceToNode('node_kaori_gate_blue_card').ok, true);
  if (useHotspots) {
    const cardRes = eng.useItemOnHotspot('item_blue_card', 'hs_geo_card_reader');
    assert.equal(cardRes.ok, true);
    assert.equal(cardRes.action, 'advance');
  } else {
    assert.equal(eng.advanceToNode('node_kaori_infiltrate_lab').ok, true); // Jewel #4 + Chounenseki
  }
  assert.equal(eng.advanceToNode('node_kaori_end').ok, true);
  assert.equal(eng.jumpToJewel('node_school_day1_gate', { keepPlaced: true }).ok, true);

  // 4. Mio Route (Yuki -> Jewel #5; Silver Medal + Chounenseki inherited -> Mio End)
  assert.equal(eng.advanceToNode('node_mio_branch').ok, true);
  assert.equal(eng.advanceToNode('node_mio_cave_yuki').ok, true); // Jewel #5
  assert.equal(eng.advanceToNode('node_mio_cave_puzzle').ok, true);
  if (useHotspots) {
    const altarRes = eng.useItemOnHotspot('item_silver_medal', 'hs_cave_altar');
    assert.equal(altarRes.ok, true);
    assert.equal(altarRes.action, 'advance');
  } else {
    assert.equal(eng.advanceToNode('node_mio_coast_revelation').ok, true);
  }
  assert.equal(eng.advanceToNode('node_mio_end').ok, true);
  assert.equal(eng.jumpToJewel('node_school_day1_gate', { keepPlaced: true }).ok, true);

  // 5. Eriko Route -> Infirmary Probe -> Eriko End
  assert.equal(eng.advanceToNode('node_eriko_branch').ok, true);
  if (useHotspots) {
    const meterRes = eng.inspectHotspot('hs_infirmary_meter');
    assert.equal(meterRes.ok, true);
    assert.equal(meterRes.action, 'advance');
  } else {
    assert.equal(eng.advanceToNode('node_eriko_infirmary_probe').ok, true);
  }
  assert.equal(eng.advanceToNode('node_eriko_end').ok, true);
  assert.equal(eng.jumpToJewel('node_school_day1_gate', { keepPlaced: true }).ok, true);

  // 6. Kanna Route (Chounenseki inherited) -> Kanna End + Study Key
  assert.equal(eng.advanceToNode('node_kanna_rooftop').ok, true);
  assert.equal(eng.advanceToNode('node_kanna_solitude_home').ok, true);
  assert.equal(eng.advanceToNode('node_kanna_hospital_crisis').ok, true);
  assert.equal(eng.advanceToNode('node_kanna_crisis_gate').ok, true);
  if (useHotspots) {
    const rescueRes = eng.useItemOnHotspot('item_chounenseki', 'hs_town_kanna_collar');
    assert.equal(rescueRes.ok, true);
    assert.equal(rescueRes.action, 'advance');
  } else {
    assert.equal(eng.advanceToNode('node_kanna_end').ok, true);
  }

  // 7. Jump back to Day 1 Hub -> Study Unlock -> Clock 6->3 (Jewel #6!) -> Kodai Manuscript -> Convergence -> Dela Grante!
  assert.equal(eng.jumpToJewel('node_day1_hub').ok, true);
  if (useHotspots) {
    const doorRes = eng.useItemOnHotspot('item_study_key', 'hs_room_study_door');
    assert.equal(doorRes.ok, true);
    assert.equal(doorRes.action, 'advance');
    const clockRes = eng.inspectHotspot('hs_study_clock');
    assert.equal(clockRes.ok, true);
    assert.equal(clockRes.action, 'advance');
    const msRes = eng.inspectHotspot('hs_study_manuscript');
    assert.equal(msRes.ok, true);
    assert.equal(msRes.action, 'advance');
  } else {
    assert.equal(eng.advanceToNode('node_study_unlock').ok, true);
    assert.equal(eng.advanceToNode('node_study_clock_puzzle').ok, true); // Jewel #6
    assert.equal(eng.advanceToNode('node_study_kodai_manuscript').ok, true);
  }
  assert.equal(eng.advanceToNode('node_convergence_cave').ok, true);
  assert.equal(eng.advanceToNode('node_dg_arrival').ok, true);
}

/** Helper: plays through all 10 Dela Grante stages including playable Desert & Underground 1/2 puzzles */
function playDelaGranteToTrueEnd(eng) {
  assert.equal(eng.advanceToNode('node_dg_frontier_yuno').ok, true);
  assert.equal(eng.advanceToNode('node_dg_desert_trek').ok, true);

  // Desert crossing puzzle canonical solution
  const desertSol = YUNO_DATA.isekaiPuzzles.find((p) => p.id === 'puzzle_dg_desert_crossing').canonical_solution;
  for (const cmd of desertSol) {
    assert.equal(eng.stepDesertAction(cmd).ok, true);
  }
  assert.equal(eng.advanceToNode('node_dg_oasis_sarah').ok, true);
  assert.equal(eng.advanceToNode('node_dg_quarry_escape').ok, true);
  assert.equal(eng.advanceToNode('node_dg_underground_1').ok, true);

  // Underground 1 canonical pattern: forward x3 (dead end) -> back -> right -> forward
  const u1Sol = YUNO_DATA.isekaiPuzzles.find((p) => p.id === 'puzzle_dg_underground_1').canonical_solution;
  for (const dir of u1Sol) {
    assert.equal(eng.stepUndergroundMaze(dir).ok, true);
  }
  assert.equal(eng.advanceToNode('node_dg_underground_capital').ok, true);
  assert.equal(eng.advanceToNode('node_dg_underground_2').ok, true);

  // Underground 2 canonical pattern: forward x3
  const u2Sol = YUNO_DATA.isekaiPuzzles.find((p) => p.id === 'puzzle_dg_underground_2').canonical_solution;
  for (const dir of u2Sol) {
    assert.equal(eng.stepUndergroundMaze(dir).ok, true);
  }
  assert.equal(eng.advanceToNode('node_dg_sanctuary_climax').ok, true);
  const finalRes = eng.useItemOnHotspot('item_entrusted_light', 'hs_dg_sanctuary_altar');
  assert.equal(finalRes.ok, true);
  assert.equal(finalRes.action, 'advance');
  assert.equal(eng.localState.currentNodeId, 'node_true_end');
}

describe('YU-NO Phase 2 SSOT Bundle & Headless A.D.M.S. Engine (60 Nodes + Hotspots + Dela Grante)', () => {
  it('1. loads all Phase 2 verified_data entities with exact SSOT counts', () => {
    assert.equal(YUNO_DATA.characters.length, 20);
    assert.equal(YUNO_DATA.locations.length, 27);
    assert.equal(YUNO_DATA.nodes.length, 60);
    assert.equal(YUNO_DATA.counts.modernNodes, 50);
    assert.equal(YUNO_DATA.counts.isekaiNodes, 10);
    assert.equal(YUNO_DATA.counts.whirlpoolNodes, 8);
    assert.equal(YUNO_DATA.sceneHotspots.length, 35);
    assert.equal(YUNO_DATA.isekaiPuzzles.length, 3);
    assert.equal(YUNO_DATA.jewels.length, 10);
    assert.equal(YUNO_DATA.items.length, 17);
    assert.equal(YUNO_DATA.items.filter((i) => i.carries_across_timelines).length, 14);
    assert.equal(YUNO_DATA.items.filter((i) => !i.carries_across_timelines).length, 3);
    assert.equal(YUNO_DATA.globalFlags.length, 11);
    assert.equal(YUNO_DATA.localFlags.length, 26);
    assert.equal(YUNO_DATA.crossRouteTransfers.length, 5);
    assert.equal(YUNO_DATA.routes.length, 9);
    assert.equal(YUNO_DATA.endings.length, 15);
  });

  it('2. supports PC-98 (8 slots) and Remake (10 slots) edition modes & jewel capacity invariants', () => {
    const pc98 = new YunoEngine(YUNO_DATA, { edition: 'pc98_8jewels' });
    assert.equal(pc98.globalState.jewelCapacity, 8);
    assert.equal(pc98.globalState.availableJewels, 2);
    assert.equal(pc98.getJewelSlots().length, 8);

    const remake = new YunoEngine(YUNO_DATA, { edition: 'remake_10jewels' });
    assert.equal(remake.globalState.jewelCapacity, 10);
    assert.equal(remake.globalState.availableJewels, 4);
    assert.equal(remake.getJewelSlots().length, 10);

    assert.equal(remake.placeJewel().ok, true);
    assert.equal(remake.advanceToNode('node_day1_hub').ok, true);
    assert.equal(remake.placeJewel().ok, true);
    assert.equal(remake.advanceToNode('node_school_day1_gate').ok, true);
    assert.equal(remake.placeJewel().ok, true);
    assert.equal(remake.globalState.availableJewels, 1);

    assert.equal(remake.setEdition('pc98_8jewels').ok, false);
    assert.equal(remake.retrieveJewel('node_prologue_start').ok, true);
    assert.equal(remake.setEdition('pc98_8jewels').ok, true);
    assert.equal(remake.globalState.jewelCapacity, 8);
    assert.equal(remake.globalState.availableJewels, 0);
  });

  it('3. handles jewel placement, exhaustion, Reflector Jump state partition, and remote retrieval', () => {
    const eng = new YunoEngine(YUNO_DATA, { edition: 'pc98_8jewels' });
    assert.equal(eng.advanceToNode('node_day1_hub').ok, true);
    assert.equal(eng.placeJewel().ok, true);
    assert.equal(eng.globalState.availableJewels, 1);

    const overwrite = eng.placeJewel();
    assert.equal(overwrite.ok, true);
    assert.equal(overwrite.overwritten, true);
    assert.equal(eng.globalState.availableJewels, 1);

    assert.equal(eng.advanceToNode('node_jewel1_drawer').ok, true);
    assert.deepEqual(eng.globalState.collectedLightJewels, ['jewel_found_1']);
    assert.equal(eng.globalState.availableJewels, 2);

    assert.equal(eng.placeJewel().ok, true);
    assert.equal(eng.advanceToNode('node_school_day1_gate').ok, true);
    assert.equal(eng.placeJewel().ok, true);
    assert.equal(eng.globalState.availableJewels, 0);

    assert.equal(eng.advanceToNode('node_eriko_branch').ok, true);
    assert.equal(eng.placeJewel().ok, false);

    const ret = eng.retrieveJewel('node_jewel1_drawer');
    assert.equal(ret.ok, true);
    assert.equal(eng.localState.currentNodeId, 'node_eriko_branch');
    assert.equal(eng.globalState.availableJewels, 1);

    const jump = eng.jumpToJewel('node_day1_hub');
    assert.equal(jump.ok, true);
    assert.equal(jump.reclaimedJewel, true);
    assert.equal(eng.localState.currentNodeId, 'node_day1_hub');
    assert.equal(eng.localState.localFlags.includes('flag_local_manual_unread'), false);
    assert.ok(eng.globalState.collectedLightJewels.includes('jewel_found_1'));
    assert.ok(eng.globalState.carriedItems.includes('item_kanna_student_id'));
    assert.equal(eng.globalState.availableJewels, 2);
  });

  it('4. drives point-and-click hotspot inspection & item-on-hotspot puzzle resolution', () => {
    const eng = new YunoEngine(YUNO_DATA, { edition: 'pc98_8jewels' });
    const rootHotspots = eng.getHotspotsForCurrentScene();
    assert.ok(rootHotspots.some((h) => h.id === 'hs_room_parcel'));

    // Inspect parcel & use Kodai's Letter on parcel
    const parcelInsp = eng.inspectHotspot('hs_room_parcel');
    assert.equal(parcelInsp.ok, true);
    assert.equal(parcelInsp.action, 'inspect');
    assert.ok(eng.localState.inspectedHotspots.includes('hs_room_parcel'));

    const letterUse = eng.useItemOnHotspot('item_kodai_letter', 'hs_room_parcel');
    assert.equal(letterUse.ok, true);
    assert.equal(letterUse.action, 'clue');
    assert.ok(letterUse.message.includes('6에서 3'));

    // Wrong-location hotspot fails safely
    assert.equal(eng.inspectHotspot('hs_study_clock').ok, false);

    // Clicking Drawer on Day 1 Hub discovers Jewel #1 directly!
    assert.equal(eng.advanceToNode('node_day1_hub').ok, true);
    const drawerClick = eng.inspectHotspot('hs_room_drawer');
    assert.equal(drawerClick.ok, true);
    assert.equal(drawerClick.action, 'advance');
    assert.equal(eng.localState.currentNodeId, 'node_jewel1_drawer');
    assert.ok(eng.globalState.collectedLightJewels.includes('jewel_found_1'));

    // Mitsuki Storehouse: Rope on Well hotspot recovers Silver Medal!
    assert.equal(eng.advanceToNode('node_school_day1_gate').ok, true);
    assert.equal(eng.advanceToNode('node_mitsuki_call').ok, true);
    const keyMansion = eng.useItemOnHotspot('item_gold_key', 'hs_mansion_crest');
    assert.equal(keyMansion.ok, true);
    assert.equal(keyMansion.action, 'advance');
    assert.equal(eng.localState.currentNodeId, 'node_mitsuki_mansion_sneak');

    assert.equal(eng.advanceToNode('node_mitsuki_storehouse').ok, true);
    const ropeWell = eng.useItemOnHotspot('item_rope', 'hs_storehouse_well');
    assert.equal(ropeWell.ok, true);
    assert.equal(ropeWell.action, 'advance');
    assert.equal(eng.localState.currentNodeId, 'node_mitsuki_well_medal');
    assert.ok(eng.globalState.carriedItems.includes('item_silver_medal'));
  });

  it('5. recovers from all 8 canonical Whirlpool dead-ends via Reflector Jump while recording endings', () => {
    const eng = new YunoEngine(YUNO_DATA, { edition: 'remake_10jewels' });
    assert.equal(eng.advanceToNode('node_day1_hub').ok, true);
    assert.equal(eng.advanceToNode('node_school_day1_gate').ok, true);
    assert.equal(eng.placeJewel().ok, true); // anchor at School Gate

    const testTrap = (pathToTrap, expectedEndingId) => {
      for (const nid of pathToTrap) {
        assert.equal(eng.advanceToNode(nid).ok, true, `Failed advancing to ${nid}`);
      }
      assert.equal(eng.localState.isVortexDeadEnd, true);
      assert.equal(eng.placeJewel().ok, false);
      assert.ok(eng.globalState.unlockedEndings.includes(expectedEndingId));
      assert.equal(eng.jumpToJewel('node_school_day1_gate', { keepPlaced: true }).ok, true);
      assert.equal(eng.localState.isVortexDeadEnd, false);
    };

    testTrap(['node_mitsuki_call', 'node_mitsuki_ryuzoji_ambush'], 'end_dead_ryuzoji_ambush');
    testTrap(['node_mitsuki_call', 'node_mitsuki_mansion_sneak', 'node_mitsuki_rope_lockout'], 'end_dead_storehouse_lockout');
    testTrap(['node_ayumi_branch', 'node_ayumi_card_trap_whirlpool'], 'end_dead_ayumi_card_trap');
    testTrap(['node_ayumi_branch', 'node_ayumi_desk_safe', 'node_ayumi_toyotomi_confront', 'node_ayumi_toyotomi_bad'], 'end_dead_ayumi_toyotomi');
    testTrap(['node_kaori_branch', 'node_kaori_dossier_analysis', 'node_kaori_gate_blue_card', 'node_kaori_alarm_whirlpool'], 'end_dead_kaori_alarm');
    testTrap(['node_mio_branch', 'node_mio_cave_solo', 'node_mio_cave_collapse_whirlpool'], 'end_dead_mio_cave_collapse');
    testTrap(['node_eriko_branch', 'node_eriko_dismissed_whirlpool'], 'end_dead_eriko_memory_wipe');
    testTrap(['node_kanna_rooftop', 'node_kanna_solitude_home', 'node_kanna_hospital_crisis', 'node_kanna_crisis_gate', 'node_kanna_bad_no_stone'], 'end_dead_kanna_no_stone');

    const brk = eng.getMapCompletionBreakdown();
    assert.equal(brk.whirlpools.discovered, 8);
    assert.equal(brk.whirlpools.total, 8);
    assert.equal(brk.whirlpools.percent, 100);
  });

  it('6. enforces paradox non-recovery for consumed items EXCEPT canonical Drunk Re-Acquisition of Kanna Student ID', () => {
    const eng = new YunoEngine(YUNO_DATA, { edition: 'pc98_8jewels' });
    assert.equal(eng.advanceToNode('node_day1_hub').ok, true);
    assert.equal(eng.advanceToNode('node_school_day1_gate').ok, true);
    assert.equal(eng.placeJewel().ok, true);

    // 1. General global item non-recovery paradox rule (Silver Medal)
    assert.equal(eng.advanceToNode('node_mitsuki_call').ok, true);
    assert.equal(eng.advanceToNode('node_mitsuki_mansion_sneak').ok, true);
    assert.equal(eng.advanceToNode('node_mitsuki_storehouse').ok, true);
    assert.equal(eng.advanceToNode('node_mitsuki_well_medal').ok, true);
    assert.ok(eng.globalState.carriedItems.includes('item_silver_medal'));

    assert.equal(eng.placeJewel().ok, true);
    assert.equal(eng.consumeItem('item_silver_medal').ok, true);
    assert.equal(eng.globalState.carriedItems.includes('item_silver_medal'), false);
    assert.equal(eng.jumpToJewel('node_mitsuki_well_medal').ok, true);
    assert.equal(eng.globalState.carriedItems.includes('item_silver_medal'), false);

    // 2. Canonical GAP-05 rule: Consume Kanna's Student ID -> Kanna rooftop locked -> Drunk collision recovers it!
    assert.equal(eng.jumpToJewel('node_school_day1_gate', { keepPlaced: true }).ok, true);
    assert.equal(eng.consumeItem('item_kanna_student_id').ok, true);
    assert.equal(eng.globalState.carriedItems.includes('item_kanna_student_id'), false);
    assert.equal(eng.advanceToNode('node_kanna_rooftop').ok, false); // locked without Student ID!

    assert.equal(eng.advanceToNode('node_town_drunk_reacquire').ok, true);
    assert.ok(eng.globalState.carriedItems.includes('item_kanna_student_id'));
    assert.ok(eng.localState.localFlags.includes('flag_local_drunk_id_recovered'));
    assert.equal(eng.advanceToNode('node_kanna_rooftop').ok, true);
  });

  it('7. resolves Cross-Route Inheritance Chain Visual paths accurately across lifecycle states', () => {
    const eng = new YunoEngine(YUNO_DATA, { edition: 'pc98_8jewels' });

    const c1 = eng.getInheritanceChainVisual('xfer_ayumi_to_kaori_blue_card');
    assert.equal(c1.status, 'locked');
    assert.equal(c1.sourceNodeId, 'node_ayumi_blue_card');
    assert.equal(c1.jumpHubNodeId, 'node_school_day1_gate');
    assert.equal(c1.gateNodeId, 'node_kaori_gate_blue_card');
    assert.equal(c1.unlockNodeId, 'node_kaori_infiltrate_lab');
    assert.deepEqual(c1.highlightNodeIds, [
      'node_ayumi_blue_card',
      'node_school_day1_gate',
      'node_kaori_gate_blue_card',
      'node_kaori_infiltrate_lab',
    ]);
    assert.equal(c1.segments.length, 3);
    assert.equal(eng.getInheritanceChainVisual('nonexistent_chain'), null);

    // Obtain Blue Card -> status becomes 'carried'
    assert.equal(eng.advanceToNode('node_day1_hub').ok, true);
    assert.equal(eng.advanceToNode('node_school_day1_gate').ok, true);
    assert.equal(eng.placeJewel().ok, true);
    assert.equal(eng.advanceToNode('node_ayumi_branch').ok, true);
    assert.equal(eng.advanceToNode('node_ayumi_desk_safe').ok, true);
    assert.equal(eng.advanceToNode('node_ayumi_toyotomi_confront').ok, true);
    assert.equal(eng.advanceToNode('node_ayumi_blue_card').ok, true);
    assert.equal(eng.getInheritanceChainVisual('xfer_ayumi_to_kaori_blue_card').status, 'carried');

    // Cross Kaori security gate -> status becomes 'completed'
    assert.equal(eng.jumpToJewel('node_school_day1_gate').ok, true);
    assert.equal(eng.advanceToNode('node_kaori_branch').ok, true);
    assert.equal(eng.advanceToNode('node_kaori_dossier_analysis').ok, true);
    assert.equal(eng.advanceToNode('node_kaori_gate_blue_card').ok, true);
    assert.equal(eng.advanceToNode('node_kaori_infiltrate_lab').ok, true);
    assert.equal(eng.getInheritanceChainVisual('xfer_ayumi_to_kaori_blue_card').status, 'completed');
  });

  it('8. enforces Dela Grante Rafaelo Desert Crossing survival counter & non-soft-lock recovery', () => {
    const eng = new YunoEngine(YUNO_DATA, { edition: 'pc98_8jewels' });
    playModernToIsekai(eng);
    assert.equal(eng.advanceToNode('node_dg_frontier_yuno').ok, true);
    assert.equal(eng.advanceToNode('node_dg_desert_trek').ok, true);

    // Exit to Oasis MUST be locked before solving Desert Crossing!
    assert.equal(eng.advanceToNode('node_dg_oasis_sarah').ok, false);
    assert.ok(eng.getActiveIsekaiPuzzle().puzzle.id === 'puzzle_dg_desert_crossing');

    // Test survival exhaustion recovery (spamming walk never soft-locks!)
    for (let i = 0; i < 9; i += 1) {
      const r = eng.stepDesertAction('walk');
      assert.equal(r.ok, true);
    }
    assert.ok(eng.localState.isekaiState.desert.water > 0);
    assert.ok(eng.localState.isekaiState.desert.rations > 0);

    // Forage & complete remaining goals (distance 4, talk 3, look 2)
    assert.equal(eng.stepDesertAction('forage').ok, true);
    assert.equal(eng.stepDesertAction('forage').ok, true);
    while (eng.localState.isekaiState.desert.distance < 4) assert.equal(eng.stepDesertAction('walk').ok, true);
    assert.equal(eng.stepDesertAction('forage').ok, true);
    while (eng.localState.isekaiState.desert.talkCount < 3) assert.equal(eng.stepDesertAction('talk_yuno').ok, true);
    while (eng.localState.isekaiState.desert.lookCount < 2) assert.equal(eng.stepDesertAction('look_around').ok, true);

    assert.equal(eng.localState.isekaiState.desert.completed, true);
    assert.ok(eng.localState.localFlags.includes('flag_local_dg_desert_talk_complete'));
    assert.equal(eng.advanceToNode('node_dg_oasis_sarah').ok, true);
  });

  it('9. enforces Dela Grante Underground Passage 1 (forward -> dead end -> 1 step back -> right) & Passage 2 mazes', () => {
    const eng = new YunoEngine(YUNO_DATA, { edition: 'pc98_8jewels' });
    playModernToIsekai(eng);
    assert.equal(eng.advanceToNode('node_dg_frontier_yuno').ok, true);
    assert.equal(eng.advanceToNode('node_dg_desert_trek').ok, true);
    for (const c of YUNO_DATA.isekaiPuzzles[0].canonical_solution) assert.equal(eng.stepDesertAction(c).ok, true);
    assert.equal(eng.advanceToNode('node_dg_oasis_sarah').ok, true);
    assert.equal(eng.advanceToNode('node_dg_quarry_escape').ok, true);
    assert.equal(eng.advanceToNode('node_dg_underground_1').ok, true);

    // Capital exit MUST be locked initially
    assert.equal(eng.advanceToNode('node_dg_underground_capital').ok, false);

    // Turning right prematurely at depth 2 BEFORE hitting dead end does NOT open secret passage
    assert.equal(eng.stepUndergroundMaze('forward').ok, true); // depth 1
    assert.equal(eng.stepUndergroundMaze('forward').ok, true); // depth 2
    assert.equal(eng.stepUndergroundMaze('right').ok, true);
    assert.equal(eng.localState.isekaiState.underground1.corridor, 'main');

    // Hit canonical dead end at depth 3 -> 1 step back -> right -> forward!
    assert.equal(eng.stepUndergroundMaze('forward').ok, true); // depth 3 deadEndHit!
    assert.equal(eng.localState.isekaiState.underground1.deadEndHit, true);
    assert.equal(eng.stepUndergroundMaze('back').ok, true); // depth 2
    assert.equal(eng.stepUndergroundMaze('right').ok, true); // east_secret!
    assert.equal(eng.localState.isekaiState.underground1.corridor, 'east_secret');
    const exit1 = eng.stepUndergroundMaze('forward');
    assert.equal(exit1.justCompleted, true);
    assert.equal(eng.advanceToNode('node_dg_underground_capital').ok, true);

    // Passage 2: straight chase forward x3
    assert.equal(eng.advanceToNode('node_dg_underground_2').ok, true);
    assert.equal(eng.advanceToNode('node_dg_sanctuary_climax').ok, false);
    assert.equal(eng.stepUndergroundMaze('left').ok, true); // side detour blocked
    assert.equal(eng.stepUndergroundMaze('forward').ok, true);
    assert.equal(eng.stepUndergroundMaze('forward').ok, true);
    const exit2 = eng.stepUndergroundMaze('forward');
    assert.equal(exit2.justCompleted, true);
    assert.equal(eng.advanceToNode('node_dg_sanctuary_climax').ok, true);
  });

  it('10. completes a full PC-98 (8-jewel) playthrough using interactive hotspots & Dela Grante puzzles to True Ending', () => {
    const eng = new YunoEngine(YUNO_DATA, { edition: 'pc98_8jewels' });
    playModernToIsekai(eng, { useHotspots: true });

    assert.equal(eng.globalState.collectedLightJewels.length, 6);
    assert.equal(eng.getTotalCollectedJewels(), 8);
    assert.ok(eng.globalState.globalFlags.includes('flag_global_all_jewels_collected'));
    assert.ok(eng.globalState.globalFlags.includes('flag_global_epilogue_unlocked'));

    // All 5 cross-route transfers completed!
    assert.ok(eng.getInheritanceStatus().every((t) => t.status === 'completed'));

    // Reflector strictly sealed in Dela Grante!
    assert.equal(eng.isIsekaiLocked(), true);
    assert.equal(eng.placeJewel().ok, false);
    assert.equal(eng.jumpToJewel('node_school_day1_gate').ok, false);
    assert.equal(eng.retrieveJewel('node_school_day1_gate').ok, false);

    playDelaGranteToTrueEnd(eng);
    assert.equal(eng.localState.isEnding, true);
    assert.ok(eng.globalState.globalFlags.includes('flag_global_true_ending_clear'));
    assert.ok(eng.globalState.unlockedEndings.includes('end_true_yuno'));
  });

  it('11. completes a full Remake (10-jewel) playthrough & verifies GAP-07 Modern vs Isekai breakdown', () => {
    const eng = new YunoEngine(YUNO_DATA, { edition: 'remake_10jewels' });
    playModernToIsekai(eng, { useHotspots: false });
    assert.equal(eng.getTotalCollectedJewels(), 10);

    const midBrk = eng.getMapCompletionBreakdown();
    assert.equal(midBrk.isekai.discovered, 1);
    assert.equal(midBrk.isekai.total, 10);
    assert.equal(midBrk.isekai.percent, 10);
    assert.ok(midBrk.modern.percent > 60);

    playDelaGranteToTrueEnd(eng);
    const endBrk = eng.getMapCompletionBreakdown();
    assert.equal(endBrk.isekai.discovered, 10);
    assert.equal(endBrk.isekai.percent, 100);
    assert.equal(eng.localState.currentNodeId, 'node_true_end');
  });

  it('12. achieves 100% map completion (60/60 nodes: 50/50 Modern + 10/10 Isekai + 8/8 Whirlpools)', () => {
    const eng = new YunoEngine(YUNO_DATA, { edition: 'remake_10jewels' });
    // Prologue full path + living room + Day 1 Hub
    assert.equal(eng.advanceToNode('node_prologue_coast_cape').ok, true);
    assert.equal(eng.advanceToNode('node_prologue_triangle_encounter').ok, true);
    assert.equal(eng.advanceToNode('node_day1_hub').ok, true);
    assert.equal(eng.placeJewel().ok, true);

    // Visit living room branch
    assert.equal(eng.advanceToNode('node_day1_living_ayumi').ok, true);
    assert.equal(eng.jumpToJewel('node_day1_hub', { keepPlaced: true }).ok, true);

    // Visit drawer Jewel #1 -> School Gate
    assert.equal(eng.advanceToNode('node_jewel1_drawer').ok, true);
    assert.equal(eng.advanceToNode('node_school_day1_gate').ok, true);
    assert.equal(eng.placeJewel().ok, true);

    // Visit Drunk reacquire branch
    assert.equal(eng.advanceToNode('node_town_drunk_reacquire').ok, true);
    assert.equal(eng.jumpToJewel('node_school_day1_gate', { keepPlaced: true }).ok, true);

    // Visit all 8 Whirlpools + Mio solo branch
    const sidePaths = [
      ['node_mitsuki_call', 'node_mitsuki_ryuzoji_ambush'],
      ['node_mitsuki_call', 'node_mitsuki_mansion_sneak', 'node_mitsuki_rope_lockout'],
      ['node_ayumi_branch', 'node_ayumi_card_trap_whirlpool'],
      ['node_ayumi_branch', 'node_ayumi_desk_safe', 'node_ayumi_toyotomi_confront', 'node_ayumi_toyotomi_bad'],
      ['node_kaori_branch', 'node_kaori_dossier_analysis', 'node_kaori_gate_blue_card', 'node_kaori_alarm_whirlpool'],
      ['node_mio_branch', 'node_mio_cave_solo', 'node_mio_cave_collapse_whirlpool'],
      ['node_eriko_branch', 'node_eriko_dismissed_whirlpool'],
      ['node_kanna_rooftop', 'node_kanna_solitude_home', 'node_kanna_hospital_crisis', 'node_kanna_crisis_gate', 'node_kanna_bad_no_stone'],
    ];
    for (const sp of sidePaths) {
      for (const nid of sp) assert.equal(eng.advanceToNode(nid).ok, true);
      assert.equal(eng.jumpToJewel('node_school_day1_gate', { keepPlaced: true }).ok, true);
    }

    // Complete all 6 heroine endings
    for (const p of [
      ['node_mitsuki_call', 'node_mitsuki_mansion_sneak', 'node_mitsuki_storehouse', 'node_mitsuki_well_medal', 'node_mitsuki_end'],
      ['node_ayumi_branch', 'node_ayumi_jewel3_mountain', 'node_ayumi_desk_safe', 'node_ayumi_toyotomi_confront', 'node_ayumi_blue_card', 'node_ayumi_end'],
      ['node_kaori_branch', 'node_kaori_dossier_analysis', 'node_kaori_gate_blue_card', 'node_kaori_infiltrate_lab', 'node_kaori_end'],
      ['node_mio_branch', 'node_mio_cave_yuki', 'node_mio_cave_puzzle', 'node_mio_coast_revelation', 'node_mio_end'],
      ['node_eriko_branch', 'node_eriko_infirmary_probe', 'node_eriko_end'],
      ['node_kanna_rooftop', 'node_kanna_solitude_home', 'node_kanna_hospital_crisis', 'node_kanna_crisis_gate', 'node_kanna_end'],
    ]) {
      for (const nid of p) assert.equal(eng.advanceToNode(nid).ok, true);
      assert.equal(eng.jumpToJewel('node_school_day1_gate', { keepPlaced: true }).ok, true);
    }

    // Jump to Day 1 Hub -> Study -> Convergence -> Dela Grante -> True End
    assert.equal(eng.jumpToJewel('node_day1_hub').ok, true);
    assert.equal(eng.advanceToNode('node_study_unlock').ok, true);
    assert.equal(eng.advanceToNode('node_study_clock_puzzle').ok, true);
    assert.equal(eng.advanceToNode('node_study_kodai_manuscript').ok, true);
    assert.equal(eng.advanceToNode('node_convergence_cave').ok, true);
    assert.equal(eng.advanceToNode('node_dg_arrival').ok, true);
    playDelaGranteToTrueEnd(eng);

    const brk = eng.getMapCompletionBreakdown();
    assert.equal(brk.modern.discovered, 50);
    assert.equal(brk.modern.percent, 100);
    assert.equal(brk.isekai.discovered, 10);
    assert.equal(brk.isekai.percent, 100);
    assert.equal(brk.whirlpools.discovered, 8);
    assert.equal(brk.total.discovered, 60);
    assert.equal(brk.total.percent, 100);
    assert.equal(eng.globalState.unlockedEndings.length, 15);
  });

  it('13. maintains deterministic save/load serialization round-trip fidelity (incl. hotspots & isekaiState)', () => {
    const eng = new YunoEngine(YUNO_DATA, { edition: 'remake_10jewels' });
    playModernToIsekai(eng);
    assert.equal(eng.advanceToNode('node_dg_frontier_yuno').ok, true);
    assert.equal(eng.advanceToNode('node_dg_desert_trek').ok, true);
    assert.equal(eng.stepDesertAction('walk').ok, true);
    assert.equal(eng.stepDesertAction('talk_yuno').ok, true);
    assert.equal(eng.inspectHotspot('hs_dg_oasis_spring').ok, true);

    const serialized = eng.serialize();
    const restored = YunoEngine.deserialize(serialized, YUNO_DATA);
    assert.equal(restored.serialize(), serialized);
    assert.deepEqual(restored.globalState, eng.globalState);
    assert.deepEqual(restored.localState, eng.localState);

    const r1 = eng.stepDesertAction('look_around');
    const r2 = restored.stepDesertAction('look_around');
    assert.deepEqual(r1, r2);
    assert.equal(restored.serialize(), eng.serialize());
  });

  it('14. validates PlayHub manifest, offline Web assets, DOM ID wiring, 60-node graph & mobile CSS guards', () => {
    const manifest = JSON.parse(readFileSync(join(gameRoot, 'game.manifest.json'), 'utf8'));
    assert.equal(manifest.id, 'horizon-drifter');
    assert.equal(manifest.slug, 'horizon-drifter');
    assert.equal(manifest.entry, 'index.html');
    assert.equal(existsSync(join(gameRoot, 'Web', manifest.entry)), true);
    assert.equal(existsSync(join(gameRoot, 'Web', manifest.media.cover)), true);
    assert.equal(existsSync(join(gameRoot, 'Web', 'vendor', 'playhub-locale.js')), false);

    const html = readFileSync(join(gameRoot, 'Web', 'index.html'), 'utf8');
    const css = readFileSync(join(gameRoot, 'Web', 'styles.css'), 'utf8');
    const appJs = readFileSync(join(gameRoot, 'Web', 'app.js'), 'utf8');

    // Zero external CDNs
    assert.equal(/https?:\/\//i.test(html), false);
    assert.equal(/https?:\/\//i.test(css), false);

    // Every getElementById() in app.js exists in index.html
    const ids = [...appJs.matchAll(/getElementById\('([^']+)'\)/g)].map((m) => m[1]);
    const missingDomIds = [...new Set(ids)].filter((id) => !html.includes(`id="${id}"`));
    assert.deepEqual(missingDomIds, []);

    // Strict mobile overflow guard rules present in CSS
    assert.ok(css.includes('overflow-x: clip'), 'Missing horizontal overflow protection');
    assert.ok(css.includes('@media (max-width: 680px)'), 'Missing mobile viewport media query');

    // Every single one of the 60 A.D.M.S. nodes has graph layout coordinates & narrative script
    const eng = new YunoEngine(YUNO_DATA);
    for (const node of YUNO_DATA.nodes) {
      assert.ok(appJs.includes(`${node.id}:`), `Missing NODE_POS entry in app.js for ${node.id}`);
      const beat = eng.getNarrativeBeat(node.id);
      assert.ok(beat.speaker && beat.dialogue && beat.inspect, `Missing narrative beat for ${node.id}`);
    }
  });
});
