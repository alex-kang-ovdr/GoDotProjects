import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import '../Web/data/game-data.js';
import '../Web/engine.js';

const ISAKU_DATA = globalThis.ISAKU_DATA;
const IsakuEngine = globalThis.IsakuEngine;

/**
 * Helper: runs the canonical full walkthrough through all 16 puzzles and 8 rescues.
 * Options allow tweaking Miyuki affection, skipping Kumi rescue, leaving brown book behind,
 * or stopping at a checkpoint for branching tests.
 */
function runCanonicalPlaythrough(engine, opts = {}) {
  const {
    miyukiChoice = 0, // 0 -> +Miyuki affection, 1 -> +Kotomi affection
    failKumi = false,
    skipBrownBookInitially = false,
    useCombineForOil = false,
    stopBeforeClimax = false,
    failAkemiPanel = false,
    failClockTower = false,
    failJinpachi = false,
  } = opts;

  // === PHASE 1: 5F Music Room -> 4F Stairs ===
  assert.equal(engine.getState().currentRoomId, 'rm_5f_music');
  engine.talkToCharacter('char_miyuki', miyukiChoice); // Choice 1
  engine.useItemOnHotspot('item_invitation_letter', 'hs_5f_music_group');

  // Move to 5F Hall and verify 4F stairs & Clock Tower are locked
  assert.equal(engine.moveTo('rm_5f_hall').ok, true);
  assert.equal(engine.moveTo('rm_4f_hall').ok, false);
  assert.equal(engine.moveTo('rm_clock_tower').ok, false);

  // 5F 3-1: Machine Oil
  assert.equal(engine.moveTo('rm_5f_class_3_1').ok, true);
  assert.equal(engine.inspectHotspot('hs_5f_3_1_locker').ok, true);
  assert.ok(engine.getState().inventory.includes('item_machine_oil'));

  // 5F 3-2: Clue Memo
  assert.equal(engine.moveTo('rm_5f_hall').ok, true);
  assert.equal(engine.moveTo('rm_5f_class_3_2').ok, true);
  assert.equal(engine.inspectHotspot('hs_5f_3_2_desk').ok, true);

  // 5F Science: Skeleton Memo + Brown Book (optional skip for backtracking test)
  assert.equal(engine.moveTo('rm_5f_hall').ok, true);
  assert.equal(engine.moveTo('rm_5f_science').ok, true);
  assert.equal(engine.inspectHotspot('hs_5f_science_skeleton').ok, true);
  if (!skipBrownBookInitially) {
    assert.equal(engine.inspectHotspot('hs_5f_science_box').ok, true);
    assert.ok(engine.getState().inventory.includes('item_brown_book'));
  }

  // 5F Men's Restroom: Safe 3878 -> Rusted Key (Puzzle 1)
  assert.equal(engine.moveTo('rm_5f_hall').ok, true);
  assert.equal(engine.moveTo('rm_5f_restroom_m').ok, true);
  const openRes = engine.inspectHotspot('hs_5f_restroom_m_safe');
  assert.equal(openRes.action, 'open_keypad');
  assert.equal(engine.submitPuzzleCode('puz_5f_safe_code', '3878').ok, true);
  assert.ok(engine.getState().inventory.includes('item_rusted_key'));

  // 5F Hall -> Triggers Kumi Restroom Crisis
  assert.equal(engine.moveTo('rm_5f_hall').ok, true);
  assert.ok(engine.getState().activeIncidents.some((i) => i.id === 'inc_kumi_restroom'));

  // Handle Kumi Restroom Crisis
  assert.equal(engine.moveTo('rm_5f_restroom_f').ok, true);
  if (failKumi) {
    assert.equal(engine.interveneIncident('inc_kumi_restroom', 'leave_alone').ok, true);
    assert.equal(engine.getState().characterStates.char_kumi, 'compromised');
    assert.equal(engine.getState().flags.flg_evidence_tape_spawned, true);
  } else {
    assert.equal(engine.interveneIncident('inc_kumi_restroom', 'escort').ok, true);
    assert.equal(engine.getState().characterStates.char_kumi, 'rescued');
  }

  // Unlock 5F -> 4F Stairs (Puzzle 2)
  assert.equal(engine.moveTo('rm_5f_hall').ok, true);
  if (useCombineForOil) {
    assert.equal(engine.combineItems('item_machine_oil', 'item_rusted_key').ok, true);
    assert.equal(engine.useItemOnHotspot('item_rusted_key', 'hs_5f_stairs_gate').ok, true);
  } else {
    assert.equal(engine.useItemOnHotspot('item_machine_oil', 'hs_5f_stairs_gate').ok, true);
    assert.equal(engine.useItemOnHotspot('item_rusted_key', 'hs_5f_stairs_gate').ok, true);
  }

  // === PHASE 2: 4F Exploration & 5F Backtracking ===
  assert.equal(engine.moveTo('rm_4f_hall').ok, true);
  // Rika isolation triggers immediately in rm_4f_hall
  const rikaInc = engine.getState().activeIncidents.find((i) => i.id === 'inc_rika_isolation');
  assert.ok(rikaInc);
  if (failKumi) {
    // Cascade shortened window from 5 to 2!
    assert.equal(rikaInc.effectiveWindow, 2);
  }
  assert.equal(engine.interveneIncident('inc_rika_isolation', 'calm_and_group').ok, true);

  // Pick up Red Paint on 4F Hall
  assert.equal(engine.inspectHotspot('hs_4f_hall_paint').ok, true);
  assert.ok(engine.getState().inventory.includes('item_red_paint'));

  // 4F Storage: Screwdriver + Mouse Hole -> Small Key (Puzzle 3)
  assert.equal(engine.moveTo('rm_4f_storage').ok, true);
  assert.equal(engine.inspectHotspot('hs_4f_storage_box').ok, true);
  assert.equal(engine.useItemOnHotspot('item_screwdriver', 'hs_4f_mouse_hole').ok, true);
  assert.ok(engine.getState().inventory.includes('item_small_key'));

  // Backtrack to 5F: Akemi's Notebook (Science Lab), Safe Back -> D-Battery (Puzzle 4), Time Recorder -> Small Hammer (Puzzle 5)
  assert.equal(engine.moveTo('rm_4f_hall').ok, true);
  assert.equal(engine.moveTo('rm_5f_hall').ok, true);
  assert.equal(engine.moveTo('rm_5f_science').ok, true);
  assert.equal(engine.inspectHotspot('hs_5f_science_floor').ok, true);
  assert.ok(engine.getState().inventory.includes('item_akemi_notebook'));

  assert.equal(engine.moveTo('rm_5f_hall').ok, true);
  assert.equal(engine.moveTo('rm_5f_restroom_m').ok, true);
  assert.equal(engine.useItemOnHotspot('item_screwdriver', 'hs_5f_restroom_m_safe_back').ok, true);
  assert.ok(engine.getState().inventory.includes('item_d_battery'));

  assert.equal(engine.moveTo('rm_5f_hall').ok, true);
  assert.equal(engine.moveTo('rm_5f_restroom_f').ok, true);
  assert.equal(engine.useItemOnHotspot('item_d_battery', 'hs_5f_time_recorder').ok, true);
  assert.ok(engine.getState().inventory.includes('item_small_hammer'));

  // Return to 4F: Handle Akemi Notebook or Fail Akemi Electrical Panel
  assert.equal(engine.moveTo('rm_5f_hall').ok, true);
  assert.equal(engine.moveTo('rm_4f_hall').ok, true);

  if (failAkemiPanel) {
    assert.equal(engine.moveTo('rm_4f_electrical').ok, true);
    assert.equal(engine.interveneIncident('inc_akemi_panel', 'ignore_panic').ok, true);
    return engine.getState();
  }

  // Deliver Akemi's notebook at 4F 2-3 -> stabilizes Akemi!
  assert.equal(engine.moveTo('rm_4f_class_2_3').ok, true);
  assert.equal(engine.useItemOnHotspot('item_akemi_notebook', 'hs_4f_2_3_akemi').ok, true);
  assert.equal(engine.getState().flags.flg_akemi_stabilized, true);

  // 4F Craft: Smash Thinker Statue -> Copper Key (Puzzle 6)
  assert.equal(engine.moveTo('rm_4f_hall').ok, true);
  assert.equal(engine.moveTo('rm_4f_craft').ok, true);
  assert.equal(engine.useItemOnHotspot('item_small_hammer', 'hs_4f_thinker_statue').ok, true);
  assert.ok(engine.getState().inventory.includes('item_copper_key'));

  // Unlock 4F -> 3F Stairs (Puzzle 7)
  assert.equal(engine.moveTo('rm_4f_hall').ok, true);
  assert.equal(engine.useItemOnHotspot('item_machine_oil', 'hs_4f_stairs_gate').ok, true);
  assert.equal(engine.useItemOnHotspot('item_copper_key', 'hs_4f_stairs_gate').ok, true);

  // === PHASE 3: 3F Broadcast, Library, Dead-End ===
  assert.equal(engine.moveTo('rm_3f_hall').ok, true);
  // Mio separation triggers in rm_3f_hall
  assert.equal(engine.interveneIncident('inc_mio_separation', 'reunite').ok, true);

  // If Kumi failed, check evidence tape in 3F Women's Restroom
  if (failKumi) {
    assert.equal(engine.moveTo('rm_3f_restroom_f').ok, true);
    const tapeRes = engine.inspectHotspot('hs_3f_stall_2');
    assert.equal(tapeRes.ok, true);
    assert.ok(engine.getState().inventory.includes('item_evidence_tape'));
    assert.equal(engine.moveTo('rm_3f_hall').ok, true);
  }

  // 3F Broadcast Prep: Unlock with Small Key -> Grants Bar Lock & opens Broadcast Room (Puzzle 8)
  assert.equal(engine.moveTo('rm_3f_broadcast_prep').ok, true);
  assert.equal(engine.useItemOnHotspot('item_small_key', 'hs_3f_bar_lock_door').ok, true);
  assert.ok(engine.getState().inventory.includes('item_bar_lock'));

  // 3F Broadcast: Rescue Soga + Pick up Ladder, Lighter, Cipher Table
  assert.equal(engine.moveTo('rm_3f_broadcast').ok, true);
  assert.equal(engine.interveneIncident('inc_soga_reckless', 'untie_soga').ok, true);
  assert.equal(engine.inspectHotspot('hs_3f_broadcast_ladder').ok, true);
  assert.equal(engine.inspectHotspot('hs_3f_broadcast_wall').ok, true);
  assert.ok(engine.getState().inventory.includes('item_wooden_ladder'));
  assert.ok(engine.getState().inventory.includes('item_lighter'));
  assert.ok(engine.getState().inventory.includes('item_cipher_table'));

  // 3F Library: Talk to Miyuki + Move Shelf -> Red Ribbon Bell (Puzzle 9)
  assert.equal(engine.moveTo('rm_3f_broadcast_prep').ok, true);
  assert.equal(engine.moveTo('rm_3f_hall').ok, true);
  assert.equal(engine.moveTo('rm_3f_library').ok, true);
  engine.talkToCharacter('char_miyuki', miyukiChoice); // Choice 2
  assert.equal(engine.inspectHotspot('hs_3f_library_shelf').ok, true);
  assert.ok(engine.getState().inventory.includes('item_red_ribbon_bell'));

  // Deliver Red Ribbon Bell to Kotomi at 4F AV Room (resolves inc_kotomi_trust)
  assert.equal(engine.moveTo('rm_3f_hall').ok, true);
  assert.equal(engine.moveTo('rm_4f_hall').ok, true);
  assert.equal(engine.moveTo('rm_4f_av').ok, true);
  assert.equal(engine.useItemOnHotspot('item_red_ribbon_bell', 'hs_4f_av_kotomi').ok, true);
  assert.equal(engine.getState().flags.flg_kotomi_protected, true);

  // Return to 3F Dead End: Ceiling Latch -> Red Ribbon Key (Puzzle 10)
  assert.equal(engine.moveTo('rm_4f_hall').ok, true);
  assert.equal(engine.moveTo('rm_3f_hall').ok, true);
  assert.equal(engine.moveTo('rm_3f_dead_end').ok, true);
  assert.equal(engine.useItemOnHotspot('item_wooden_ladder', 'hs_3f_ceiling_latch').ok, true);
  assert.equal(engine.useItemOnHotspot('item_screwdriver', 'hs_3f_ceiling_latch').ok, true);
  assert.ok(engine.getState().inventory.includes('item_red_ribbon_key'));

  // Unlock 3F -> 2F Stairs (Puzzle 11)
  assert.equal(engine.moveTo('rm_3f_hall').ok, true);
  assert.equal(engine.useItemOnHotspot('item_red_ribbon_key', 'hs_3f_stairs_gate').ok, true);

  // === PHASE 4: 2F Kitchen Stove & 1F Stairs ===
  assert.equal(engine.moveTo('rm_2f_hall').ok, true);
  assert.equal(engine.moveTo('rm_2f_class_1_1').ok, true);
  engine.talkToCharacter('char_miyuki', miyukiChoice); // Choice 3

  // 2F Men's Restroom: Alcohol Bottle
  assert.equal(engine.moveTo('rm_2f_hall').ok, true);
  assert.equal(engine.moveTo('rm_2f_restroom_m').ok, true);
  assert.equal(engine.inspectHotspot('hs_2f_restroom_left_door').ok, true);
  assert.ok(engine.getState().inventory.includes('item_alcohol_bottle'));

  // Optional backtracking test: climb all the way back to 5F Science Lab to grab brown book
  if (skipBrownBookInitially) {
    assert.equal(engine.moveTo('rm_2f_hall').ok, true);
    assert.equal(engine.moveTo('rm_2f_kitchen').ok, true);
    // Attempting to ignite without brown book fails safely
    assert.equal(engine.useItemOnHotspot('item_alcohol_bottle', 'hs_2f_kitchen_stove').ok, true);
    const noBookRes = engine.useItemOnHotspot('item_lighter', 'hs_2f_kitchen_stove');
    assert.equal(noBookRes.ok, false);
    assert.equal(noBookRes.reason, 'missing_stove_fuel');

    // Backtrack 2F -> 3F -> 4F -> 5F -> Science Lab
    assert.equal(engine.moveTo('rm_2f_hall').ok, true);
    assert.equal(engine.moveTo('rm_3f_hall').ok, true);
    assert.equal(engine.moveTo('rm_4f_hall').ok, true);
    assert.equal(engine.moveTo('rm_5f_hall').ok, true);
    assert.equal(engine.moveTo('rm_5f_science').ok, true);
    assert.equal(engine.inspectHotspot('hs_5f_science_box').ok, true);
    assert.ok(engine.getState().inventory.includes('item_brown_book'));

    // Descend back to 2F Kitchen
    assert.equal(engine.moveTo('rm_5f_hall').ok, true);
    assert.equal(engine.moveTo('rm_4f_hall').ok, true);
    assert.equal(engine.moveTo('rm_3f_hall').ok, true);
    assert.equal(engine.moveTo('rm_2f_hall').ok, true);
    assert.equal(engine.moveTo('rm_2f_kitchen').ok, true);
    assert.equal(engine.useItemOnHotspot('item_brown_book', 'hs_2f_kitchen_stove').ok, true);
    assert.equal(engine.useItemOnHotspot('item_lighter', 'hs_2f_kitchen_stove').ok, true);
  } else {
    // 2F Kitchen: Combine brown book + alcohol + lighter -> Silver Key (Puzzle 12)
    assert.equal(engine.moveTo('rm_2f_hall').ok, true);
    assert.equal(engine.moveTo('rm_2f_kitchen').ok, true);
    assert.equal(engine.combineItems('item_brown_book', 'item_alcohol_bottle').ok, true);
    assert.equal(engine.useItemOnHotspot('item_lighter', 'hs_2f_kitchen_stove').ok, true);
  }
  assert.ok(engine.getState().inventory.includes('item_silver_key'));

  // Unlock 2F -> 1F Stairs & Clock Tower (Puzzle 13)
  assert.equal(engine.moveTo('rm_2f_hall').ok, true);
  assert.equal(engine.useItemOnHotspot('item_silver_key', 'hs_2f_stairs_gate').ok, true);

  if (stopBeforeClimax) {
    return engine.getState();
  }

  // === PHASE 5: Climax (1F Fake Exit, Clock Tower Paint, 3F Bar Lock, 1F Infirmary Escape) ===
  assert.equal(engine.moveTo('rm_1f_hall').ok, true);
  assert.equal(engine.moveTo('rm_1f_entrance').ok, true);
  assert.equal(engine.inspectHotspot('hs_1f_sealed_gate').ok, true);
  assert.equal(engine.getState().flags.flg_checked_fake_entrance, true);

  // Climb to 5F -> 6F Clock Tower
  assert.equal(engine.moveTo('rm_1f_hall').ok, true);
  assert.equal(engine.moveTo('rm_2f_hall').ok, true);
  assert.equal(engine.moveTo('rm_3f_hall').ok, true);
  assert.equal(engine.moveTo('rm_4f_hall').ok, true);
  assert.equal(engine.moveTo('rm_5f_hall').ok, true);
  assert.equal(engine.moveTo('rm_clock_tower').ok, true);

  if (failClockTower) {
    assert.equal(engine.interveneIncident('inc_miyuki_clock_tower', 'abandon').ok, true);
    return engine.getState();
  }

  // Apply Red Paint Trap on Clock Tower Ladder (Puzzle 14) + Talk Miyuki (Choice 4)
  assert.equal(engine.useItemOnHotspot('item_red_paint', 'hs_clock_tower_ladder').ok, true);
  engine.talkToCharacter('char_miyuki', miyukiChoice);

  // Descend to 3F Broadcast Prep: Bar Lock Containment (Puzzle 15 -> grants Isaku's Knife)
  assert.equal(engine.moveTo('rm_5f_hall').ok, true);
  assert.equal(engine.moveTo('rm_4f_hall').ok, true);
  assert.equal(engine.moveTo('rm_3f_hall').ok, true);
  assert.equal(engine.moveTo('rm_3f_broadcast_prep').ok, true);

  if (failJinpachi) {
    assert.equal(engine.interveneIncident('inc_jinpachi_betrayal', 'trust_blindly').ok, true);
    return engine.getState();
  }

  assert.equal(engine.useItemOnHotspot('item_bar_lock', 'hs_3f_containment_lock').ok, true);
  assert.ok(engine.getState().inventory.includes('item_isaku_knife'));
  assert.equal(engine.getState().flags.flg_climax_isaku_down, true);

  // Descend to 1F Infirmary: Remove Boards with Isaku's Knife (Puzzle 16 -> unlocks Escape Exit)
  assert.equal(engine.moveTo('rm_3f_hall').ok, true);
  assert.equal(engine.moveTo('rm_2f_hall').ok, true);
  assert.equal(engine.moveTo('rm_1f_hall').ok, true);
  assert.equal(engine.moveTo('rm_1f_infirmary').ok, true);
  assert.equal(engine.moveTo('rm_escape_exit').ok, false); // Still locked before knife
  assert.equal(engine.useItemOnHotspot('item_isaku_knife', 'hs_1f_infirmary_board').ok, true);

  // Escape to Exterior -> Ending Evaluated!
  const escRes = engine.moveTo('rm_escape_exit');
  assert.equal(escRes.ok, true);
  return engine.getState();
}

describe('Isaku Exploration Adventure Engine', () => {
  it('loads verified data parity and initializes in 5F Music Room', () => {
    const engine = IsakuEngine.createEngine(ISAKU_DATA);
    const st = engine.getState();

    assert.equal(engine.data.characters.length, 11);
    assert.equal(engine.data.rooms.length, 29);
    const hotspotCount = engine.data.rooms.reduce((acc, r) => acc + r.hotspots.length, 0);
    assert.equal(hotspotCount, 45);
    assert.equal(engine.data.items.length, 23);
    assert.equal(engine.data.puzzles.length, 16);
    assert.equal(engine.data.incidents.length, 8);
    assert.equal(engine.data.endings.length, 5);

    assert.equal(st.currentRoomId, 'rm_5f_music');
    assert.equal(st.currentFloor, 5);
    assert.equal(st.actionTicks, 0);
    assert.deepEqual(st.inventory, ['item_invitation_letter']);
    assert.equal(st.characterStates.char_kenta, 'safe');
    assert.equal(st.characterStates.char_isaku, 'hostile');
    assert.equal(st.characterStates.char_miyuki_sister, 'deceased_backstory');
  });

  it('blocks premature descent through locked gates and non-adjacent room moves', () => {
    const engine = IsakuEngine.createEngine(ISAKU_DATA);

    // Cannot jump straight to 4F from music room
    const jumpRes = engine.moveTo('rm_4f_hall');
    assert.equal(jumpRes.ok, false);
    assert.equal(jumpRes.reason, 'not_adjacent');

    // Move to 5F hall, then try locked 4F stairs & locked Clock Tower
    assert.equal(engine.moveTo('rm_5f_hall').ok, true);
    const stairsRes = engine.moveTo('rm_4f_hall');
    assert.equal(stairsRes.ok, false);
    assert.equal(stairsRes.reason, 'exit_locked');
    assert.equal(stairsRes.unlockPuzzleId, 'puz_5f_unlock_4f_stairs');

    const towerRes = engine.moveTo('rm_clock_tower');
    assert.equal(towerRes.ok, false);
    assert.equal(towerRes.reason, 'exit_locked');
    assert.equal(towerRes.unlockPuzzleId, 'puz_2f_unlock_1f_stairs');
  });

  it('validates 5F Safe keypad code 3878 and rejects wrong codes without penalty', () => {
    const engine = IsakuEngine.createEngine(ISAKU_DATA);
    engine.moveTo('rm_5f_hall');
    engine.moveTo('rm_5f_restroom_m');
    const ticksBefore = engine.getState().actionTicks;

    const wrong = engine.submitPuzzleCode('puz_5f_safe_code', '1234');
    assert.equal(wrong.ok, false);
    assert.equal(wrong.reason, 'wrong_code');
    assert.equal(engine.getState().actionTicks, ticksBefore);
    assert.ok(!engine.getState().inventory.includes('item_rusted_key'));

    const right = engine.submitPuzzleCode('puz_5f_safe_code', '3878');
    assert.equal(right.ok, true);
    assert.equal(right.solved, true);
    assert.ok(engine.getState().inventory.includes('item_rusted_key'));
    assert.equal(engine.getState().flags.flg_5f_safe_opened, true);
  });

  it('enforces lubrication softlock guard and supports combineItems(machine_oil, rusted_key)', () => {
    const engine = IsakuEngine.createEngine(ISAKU_DATA);
    engine.moveTo('rm_5f_hall');
    engine.moveTo('rm_5f_class_3_1');
    engine.inspectHotspot('hs_5f_3_1_locker'); // machine_oil
    engine.moveTo('rm_5f_hall');
    engine.moveTo('rm_5f_restroom_m');
    engine.submitPuzzleCode('puz_5f_safe_code', '3878'); // rusted_key
    engine.moveTo('rm_5f_hall');

    // Attempt rusted key without oil -> prevented softlock, key retained!
    const guarded = engine.useItemOnHotspot('item_rusted_key', 'hs_5f_stairs_gate');
    assert.equal(guarded.ok, false);
    assert.equal(guarded.reason, 'needs_lubrication');
    assert.equal(guarded.softlockPrevented, true);
    assert.ok(engine.getState().inventory.includes('item_rusted_key'));

    // Incompatible combination fails cleanly
    const badCombo = engine.combineItems('item_invitation_letter', 'item_rusted_key');
    assert.equal(badCombo.ok, false);
    assert.equal(badCombo.reason, 'incompatible_items');

    // Combine machine_oil + rusted_key -> unlocks 4F gate smoothly!
    const combo = engine.combineItems('item_machine_oil', 'item_rusted_key');
    assert.equal(combo.ok, true);
    assert.equal(combo.flag, 'flg_rusted_key_oiled');

    const unlock = engine.useItemOnHotspot('item_rusted_key', 'hs_5f_stairs_gate');
    assert.equal(unlock.ok, true);
    assert.equal(unlock.solved, true);
    assert.equal(engine.moveTo('rm_4f_hall').ok, true);
  });

  it('TC-01: completes all 16 puzzles & 8 rescues with high Miyuki affection -> end_happy_miyuki', () => {
    const engine = IsakuEngine.createEngine(ISAKU_DATA);
    const finalState = runCanonicalPlaythrough(engine, { miyukiChoice: 0, useCombineForOil: true });

    assert.equal(finalState.solvedPuzzles.length, 16);
    assert.equal(finalState.resolvedIncidents.length, 8);
    assert.ok(finalState.resolvedIncidents.every((r) => r.outcome === 'rescued'));
    assert.ok(finalState.miyukiAffection >= 3);
    assert.equal(engine.getProgressSummary().compromisedCount, 0);
    assert.equal(finalState.currentRoomId, 'rm_escape_exit');
    assert.equal(finalState.endingId, 'end_happy_miyuki');
  });

  it('TC-02: completes all 16 puzzles & 8 rescues with low Miyuki affection -> end_happy_kotomi', () => {
    const engine = IsakuEngine.createEngine(ISAKU_DATA);
    const finalState = runCanonicalPlaythrough(engine, { miyukiChoice: 1 });

    assert.equal(finalState.solvedPuzzles.length, 16);
    assert.equal(engine.getProgressSummary().compromisedCount, 0);
    assert.ok(finalState.miyukiAffection <= 2);
    assert.equal(finalState.endingId, 'end_happy_kotomi');
  });

  it('TC-03: failing Kumi rescue triggers evidence tape, Rika cascade window, and end_normal_survivor_escape', () => {
    const engine = IsakuEngine.createEngine(ISAKU_DATA);
    const finalState = runCanonicalPlaythrough(engine, { miyukiChoice: 0, failKumi: true });

    assert.equal(finalState.flags.flg_inc_kumi_compromised, true);
    assert.equal(finalState.flags.flg_evidence_tape_spawned, true);
    assert.ok(finalState.inventory.includes('item_evidence_tape'));
    assert.equal(engine.getProgressSummary().compromisedCount, 1);
    assert.equal(finalState.endingId, 'end_normal_survivor_escape');
  });

  it('TC-04: Akemi electrical panel failure triggers immediate end_bad_akemi_fire', () => {
    const engine = IsakuEngine.createEngine(ISAKU_DATA);
    const finalState = runCanonicalPlaythrough(engine, { failAkemiPanel: true });

    assert.equal(finalState.flags.flg_inc_akemi_fire_trigger, true);
    assert.equal(finalState.endingId, 'end_bad_akemi_fire');
  });

  it('TC-05a: Clock Tower Miyuki failure triggers immediate end_bad_isaku_total_loss', () => {
    const engine = IsakuEngine.createEngine(ISAKU_DATA);
    const finalState = runCanonicalPlaythrough(engine, { failClockTower: true });

    assert.equal(finalState.flags.flg_inc_miyuki_compromised, true);
    assert.equal(finalState.endingId, 'end_bad_isaku_total_loss');
  });

  it('TC-05b: Jinpachi betrayal failure triggers immediate end_bad_isaku_total_loss', () => {
    const engine = IsakuEngine.createEngine(ISAKU_DATA);
    const finalState = runCanonicalPlaythrough(engine, { failJinpachi: true });

    assert.equal(finalState.flags.flg_inc_jinpachi_betrayed, true);
    assert.equal(finalState.endingId, 'end_bad_isaku_total_loss');
  });

  it('TC-07: supports full backtracking from 2F back to 5F to retrieve missed brown book', () => {
    const engine = IsakuEngine.createEngine(ISAKU_DATA);
    const finalState = runCanonicalPlaythrough(engine, { skipBrownBookInitially: true, miyukiChoice: 0 });

    assert.equal(finalState.solvedPuzzles.length, 16);
    assert.equal(finalState.endingId, 'end_happy_miyuki');
  });

  it('TC-08: deterministic save/load serialization restores pre-climax branch cleanly', () => {
    const engine = IsakuEngine.createEngine(ISAKU_DATA);
    runCanonicalPlaythrough(engine, { miyukiChoice: 0, stopBeforeClimax: true });

    const snapshot = engine.serialize();
    const savedState = engine.getState();
    assert.equal(savedState.solvedPuzzles.length, 13);
    assert.equal(savedState.endingId, null);

    // Branch A: climb to Clock Tower and fail -> Bad Ending
    engine.moveTo('rm_3f_hall');
    engine.moveTo('rm_4f_hall');
    engine.moveTo('rm_5f_hall');
    engine.moveTo('rm_clock_tower');
    engine.interveneIncident('inc_miyuki_clock_tower', 'abandon');
    assert.equal(engine.getState().endingId, 'end_bad_isaku_total_loss');

    // Deserialize snapshot -> exact pre-climax state restored!
    engine.deserialize(snapshot);
    assert.deepEqual(engine.getState(), savedState);

    // Branch B: play cleanly from restored snapshot to Happy Ending A!
    engine.moveTo('rm_3f_hall');
    engine.moveTo('rm_4f_hall');
    engine.moveTo('rm_5f_hall');
    engine.moveTo('rm_clock_tower');
    engine.useItemOnHotspot('item_red_paint', 'hs_clock_tower_ladder');
    engine.talkToCharacter('char_miyuki', 0);
    engine.moveTo('rm_5f_hall');
    engine.moveTo('rm_4f_hall');
    engine.moveTo('rm_3f_hall');
    engine.moveTo('rm_3f_broadcast_prep');
    engine.useItemOnHotspot('item_bar_lock', 'hs_3f_containment_lock');
    engine.moveTo('rm_3f_hall');
    engine.moveTo('rm_2f_hall');
    engine.moveTo('rm_1f_hall');
    engine.moveTo('rm_1f_infirmary');
    engine.useItemOnHotspot('item_isaku_knife', 'hs_1f_infirmary_board');
    engine.moveTo('rm_escape_exit');

    assert.equal(engine.getState().solvedPuzzles.length, 16);
    assert.equal(engine.getState().endingId, 'end_happy_miyuki');
  });

  it('expires active incidents when player ignores deadline ticks', () => {
    const engine = IsakuEngine.createEngine(ISAKU_DATA);
    engine.moveTo('rm_5f_hall');
    engine.moveTo('rm_5f_restroom_f'); // starts inc_kumi_restroom (windowTicks=6)
    assert.ok(engine.getState().activeIncidents.some((i) => i.id === 'inc_kumi_restroom'));

    // Walk back and forth ignoring Kumi for 6 ticks
    for (let i = 0; i < 3; i++) {
      engine.moveTo('rm_5f_hall');
      engine.moveTo('rm_5f_class_3_1');
    }
    const st = engine.getState();
    assert.equal(st.characterStates.char_kumi, 'compromised');
    assert.equal(st.flags.flg_inc_kumi_compromised, true);
    assert.equal(st.flags.flg_evidence_tape_spawned, true);
  });
});
