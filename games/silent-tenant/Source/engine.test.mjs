import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import '../Web/data/game-data.js';
import '../Web/engine.js';

const ISAKU_DATA = globalThis.ISAKU_DATA;
const IsakuEngine = globalThis.IsakuEngine;

/**
 * Helper: runs the canonical full walkthrough through all 16 puzzles and 8 rescues.
 * Supports testing Miyuki affection choices per venue, 4F rusted-key snap branch,
 * cipher decoding, backtracking, and all 5 endings.
 */
function runCanonicalPlaythrough(engine, opts = {}) {
  const {
    miyukiChoice = 0, // 0 -> +1 Miyuki, 1 -> 0 Miyuki (+1 Kotomi), 2 -> -1 Miyuki
    miyukiChoiceMap = null, // optional per-room override: { rm_5f_music: 0, rm_4f_hall: 0, ... }
    talkMiyukiOn4F = false,
    triggerRustedKeySnapOn4F = false,
    failKumi = false,
    skipBrownBookInitially = false,
    useCombineForOil = false,
    stopBeforeClimax = false,
    failAkemiPanel = false,
    failClockTower = false,
    failJinpachi = false,
  } = opts;

  const choiceFor = (roomId) =>
    miyukiChoiceMap && Object.prototype.hasOwnProperty.call(miyukiChoiceMap, roomId)
      ? miyukiChoiceMap[roomId]
      : miyukiChoice;

  // === PHASE 1: 5F Music Room -> 4F Stairs ===
  assert.equal(engine.getState().currentRoomId, 'rm_5f_music');
  engine.talkToCharacter('char_miyuki', choiceFor('rm_5f_music'));
  engine.useItemOnHotspot('item_invitation_letter', 'hs_5f_music_group');

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

  // Unlock 5F -> 4F Stairs (Puzzle 2 — retains rusted key for canonical 4F snap branch!)
  assert.equal(engine.moveTo('rm_5f_hall').ok, true);
  if (useCombineForOil) {
    assert.equal(engine.combineItems('item_machine_oil', 'item_rusted_key').ok, true);
    assert.equal(engine.useItemOnHotspot('item_rusted_key', 'hs_5f_stairs_gate').ok, true);
  } else {
    assert.equal(engine.useItemOnHotspot('item_machine_oil', 'hs_5f_stairs_gate').ok, true);
    assert.equal(engine.useItemOnHotspot('item_rusted_key', 'hs_5f_stairs_gate').ok, true);
  }
  assert.ok(engine.getState().inventory.includes('item_rusted_key'));

  // === PHASE 2: 4F Exploration & 5F Backtracking ===
  assert.equal(engine.moveTo('rm_4f_hall').ok, true);
  const rikaInc = engine.getState().activeIncidents.find((i) => i.id === 'inc_rika_isolation');
  assert.ok(rikaInc);
  if (failKumi) {
    assert.equal(rikaInc.effectiveWindow, 2);
  }
  assert.equal(engine.interveneIncident('inc_rika_isolation', 'calm_and_group').ok, true);

  if (talkMiyukiOn4F || (miyukiChoiceMap && Object.prototype.hasOwnProperty.call(miyukiChoiceMap, 'rm_4f_hall'))) {
    engine.talkToCharacter('char_miyuki', choiceFor('rm_4f_hall'));
  }

  // Optional canonical 4F->3F rusted key snap check
  if (triggerRustedKeySnapOn4F) {
    const snapRes = engine.useItemOnHotspot('item_rusted_key', 'hs_4f_stairs_gate');
    assert.equal(snapRes.ok, false);
    assert.equal(snapRes.reason, 'key_snapped_fallback_needed');
    assert.equal(snapRes.keySnapped, true);
    assert.equal(snapRes.fallbackItemId, 'item_copper_key');
    assert.equal(engine.getState().flags.flg_rusted_key_snapped, true);
    assert.ok(!engine.getState().inventory.includes('item_rusted_key'));
  }

  // Pick up Red Paint on 4F Hall
  assert.equal(engine.inspectHotspot('hs_4f_hall_paint').ok, true);
  assert.ok(engine.getState().inventory.includes('item_red_paint'));

  // 4F Storage: Screwdriver + Mouse Hole -> Small Key (Puzzle 3)
  assert.equal(engine.moveTo('rm_4f_storage').ok, true);
  assert.equal(engine.inspectHotspot('hs_4f_storage_box').ok, true);
  assert.equal(engine.useItemOnHotspot('item_screwdriver', 'hs_4f_mouse_hole').ok, true);
  assert.ok(engine.getState().inventory.includes('item_small_key'));

  // Backtrack to 5F: Akemi's Notebook, Safe Back -> D-Battery (Puzzle 4), Time Recorder -> Small Hammer (Puzzle 5)
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
  assert.equal(engine.interveneIncident('inc_mio_separation', 'reunite').ok, true);

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
  engine.talkToCharacter('char_miyuki', choiceFor('rm_3f_library'));
  assert.equal(engine.inspectHotspot('hs_3f_library_shelf').ok, true);
  assert.ok(engine.getState().inventory.includes('item_red_ribbon_bell'));

  // Deliver Red Ribbon Bell to Kotomi at 4F AV Room
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
  engine.talkToCharacter('char_miyuki', choiceFor('rm_2f_class_1_1'));

  // 2F Men's Restroom: Alcohol Bottle
  assert.equal(engine.moveTo('rm_2f_hall').ok, true);
  assert.equal(engine.moveTo('rm_2f_restroom_m').ok, true);
  assert.equal(engine.inspectHotspot('hs_2f_restroom_left_door').ok, true);
  assert.ok(engine.getState().inventory.includes('item_alcohol_bottle'));

  if (skipBrownBookInitially) {
    assert.equal(engine.moveTo('rm_2f_hall').ok, true);
    assert.equal(engine.moveTo('rm_2f_kitchen').ok, true);
    assert.equal(engine.useItemOnHotspot('item_alcohol_bottle', 'hs_2f_kitchen_stove').ok, true);
    const noBookRes = engine.useItemOnHotspot('item_lighter', 'hs_2f_kitchen_stove');
    assert.equal(noBookRes.ok, false);
    assert.equal(noBookRes.reason, 'missing_stove_fuel');

    assert.equal(engine.moveTo('rm_2f_hall').ok, true);
    assert.equal(engine.moveTo('rm_3f_hall').ok, true);
    assert.equal(engine.moveTo('rm_4f_hall').ok, true);
    assert.equal(engine.moveTo('rm_5f_hall').ok, true);
    assert.equal(engine.moveTo('rm_5f_science').ok, true);
    assert.equal(engine.inspectHotspot('hs_5f_science_box').ok, true);
    assert.ok(engine.getState().inventory.includes('item_brown_book'));

    assert.equal(engine.moveTo('rm_5f_hall').ok, true);
    assert.equal(engine.moveTo('rm_4f_hall').ok, true);
    assert.equal(engine.moveTo('rm_3f_hall').ok, true);
    assert.equal(engine.moveTo('rm_2f_hall').ok, true);
    assert.equal(engine.moveTo('rm_2f_kitchen').ok, true);
    assert.equal(engine.useItemOnHotspot('item_brown_book', 'hs_2f_kitchen_stove').ok, true);
    assert.equal(engine.useItemOnHotspot('item_lighter', 'hs_2f_kitchen_stove').ok, true);
  } else {
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

  // === PHASE 5: Climax ===
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

  assert.equal(engine.useItemOnHotspot('item_red_paint', 'hs_clock_tower_ladder').ok, true);
  engine.talkToCharacter('char_miyuki', choiceFor('rm_clock_tower'));

  // Descend to 3F Broadcast Prep: Bar Lock Containment (Puzzle 15)
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

  // Descend to 1F Infirmary: Remove Boards with Isaku's Knife (Puzzle 16)
  assert.equal(engine.moveTo('rm_3f_hall').ok, true);
  assert.equal(engine.moveTo('rm_2f_hall').ok, true);
  assert.equal(engine.moveTo('rm_1f_hall').ok, true);
  assert.equal(engine.moveTo('rm_1f_infirmary').ok, true);
  assert.equal(engine.moveTo('rm_escape_exit').ok, false);
  assert.equal(engine.useItemOnHotspot('item_isaku_knife', 'hs_1f_infirmary_board').ok, true);

  const escRes = engine.moveTo('rm_escape_exit');
  assert.equal(escRes.ok, true);
  return engine.getState();
}

describe('Isaku Exploration Adventure Engine (Phase 2 Elevated)', () => {
  it('loads verified Phase 2 data parity (33 rooms, 49 spatial hotspots, 14 dialogue branches, 4 cipher deductions)', () => {
    const engine = IsakuEngine.createEngine(ISAKU_DATA);
    const st = engine.getState();

    assert.equal(engine.data.characters.length, 11);
    assert.equal(engine.data.rooms.length, 33);
    const allHotspots = engine.data.rooms.flatMap((r) => r.hotspots);
    assert.equal(allHotspots.length, 49);
    assert.ok(allHotspots.every((h) => typeof h.x === 'number' && typeof h.y === 'number'));
    assert.equal(engine.data.items.length, 23);
    assert.equal(engine.data.puzzles.length, 16);
    assert.equal(engine.data.incidents.length, 8);
    assert.equal(engine.data.endings.length, 5);
    assert.equal(engine.data.dialogueBranches.length, 14);
    assert.equal(engine.data.cipherData.deductions.length, 4);

    assert.equal(st.currentRoomId, 'rm_5f_music');
    assert.equal(st.currentFloor, 5);
    assert.equal(st.actionTicks, 0);
    assert.equal(st.threatLevel, 12);
    assert.equal(st.threatBand, 'low');
    assert.deepEqual(st.inventory, ['item_invitation_letter']);
    assert.equal(st.characterStates.char_kenta, 'safe');
    assert.equal(st.characterStates.char_isaku, 'hostile');
    assert.equal(st.characterStates.char_miyuki_sister, 'deceased_backstory');
  });

  it('blocks premature descent through locked gates and non-adjacent room moves', () => {
    const engine = IsakuEngine.createEngine(ISAKU_DATA);

    const jumpRes = engine.moveTo('rm_4f_hall');
    assert.equal(jumpRes.ok, false);
    assert.equal(jumpRes.reason, 'not_adjacent');

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

  it('enforces 5F->4F lubrication softlock guard and retains rusted iron key for 4F', () => {
    const engine = IsakuEngine.createEngine(ISAKU_DATA);
    engine.moveTo('rm_5f_hall');
    engine.moveTo('rm_5f_class_3_1');
    engine.inspectHotspot('hs_5f_3_1_locker');
    engine.moveTo('rm_5f_hall');
    engine.moveTo('rm_5f_restroom_m');
    engine.submitPuzzleCode('puz_5f_safe_code', '3878');
    engine.moveTo('rm_5f_hall');

    const guarded = engine.useItemOnHotspot('item_rusted_key', 'hs_5f_stairs_gate');
    assert.equal(guarded.ok, false);
    assert.equal(guarded.reason, 'needs_lubrication');
    assert.equal(guarded.softlockPrevented, true);
    assert.ok(engine.getState().inventory.includes('item_rusted_key'));

    const badCombo = engine.combineItems('item_invitation_letter', 'item_rusted_key');
    assert.equal(badCombo.ok, false);
    assert.equal(badCombo.reason, 'incompatible_items');

    const combo = engine.combineItems('item_machine_oil', 'item_rusted_key');
    assert.equal(combo.ok, true);
    assert.equal(combo.flag, 'flg_rusted_key_oiled');

    const unlock = engine.useItemOnHotspot('item_rusted_key', 'hs_5f_stairs_gate');
    assert.equal(unlock.ok, true);
    assert.equal(unlock.solved, true);
    // Rusted key is retained so player can encounter the canonical 4F->3F snap branch!
    assert.ok(engine.getState().inventory.includes('item_rusted_key'));
    assert.equal(engine.moveTo('rm_4f_hall').ok, true);
  });

  it('handles canonical 4F->3F rusted-key snap & Thinker statue copper-key fallback without softlock (GAP-05)', () => {
    const engine = IsakuEngine.createEngine(ISAKU_DATA);
    const finalState = runCanonicalPlaythrough(engine, {
      miyukiChoice: 0,
      triggerRustedKeySnapOn4F: true,
    });

    assert.equal(finalState.flags.flg_rusted_key_snapped, true);
    assert.ok(finalState.consumedItems.includes('item_rusted_key'));
    assert.equal(finalState.solvedPuzzles.length, 16);
    assert.equal(finalState.endingId, 'end_happy_miyuki');
  });

  it('decodes canonical 6x6 Cipher Table coordinates & deductions via decodeCipher(coordA, coordB) (GAP-03)', () => {
    const engine = IsakuEngine.createEngine(ISAKU_DATA);

    // Before obtaining item_cipher_table -> cleanly blocked
    const lockedRes = engine.decodeCipher('32', '54');
    assert.equal(lockedRes.ok, false);
    assert.equal(lockedRes.reason, 'missing_cipher_table');

    // Progress to 3F Broadcast Room to acquire item_cipher_table legitimately
    runCanonicalPlaythrough(engine, { miyukiChoice: 0, stopBeforeClimax: true });
    assert.ok(engine.getState().inventory.includes('item_cipher_table'));

    const inspectRes = engine.inspectItem('item_cipher_table');
    assert.equal(inspectRes.ok, true);
    assert.equal(inspectRes.action, 'open_cipher_decoder');

    // Invalid coordinates rejected cleanly
    assert.equal(engine.decodeCipher('99', '00').ok, false);

    // Single-cell lookup (row 3, col 2) -> "38"
    const cellRes = engine.decodeCipher(3, 2);
    assert.equal(cellRes.ok, true);
    assert.equal(cellRes.mode, 'cell');
    assert.equal(cellRes.coord, '32');
    assert.equal(cellRes.token, '38');

    // Pair cross-index lookup: 32 x 54 -> "3878"
    const safeDed = engine.decodeCipher('32', '54');
    assert.equal(safeDed.ok, true);
    assert.equal(safeDed.mode, 'pair');
    assert.equal(safeDed.matched, true);
    assert.equal(safeDed.combined, '3878');
    assert.equal(safeDed.deduction.id, 'cipher_safe_3878');
    assert.equal(engine.getState().flags.flg_cipher_safe_decoded, true);

    // Order-independent pair lookups for all remaining 3 deductions
    const bcDed = engine.decodeCipher('36', '21');
    assert.equal(bcDed.ok, true);
    assert.equal(bcDed.matched, true);
    assert.equal(bcDed.deduction.id, 'cipher_broadcast_lighter');

    const bellDed = engine.decodeCipher('33', '45');
    assert.equal(bellDed.ok, true);
    assert.equal(bellDed.matched, true);
    assert.equal(bellDed.deduction.id, 'cipher_library_bell');

    const climaxDed = engine.decodeCipher('61', '44');
    assert.equal(climaxDed.ok, true);
    assert.equal(climaxDed.matched, true);
    assert.equal(climaxDed.deduction.id, 'cipher_clock_tower_paint');

    // Non-matching pair returns informative non-matched result
    const missDed = engine.decodeCipher('11', '66');
    assert.equal(missDed.ok, true);
    assert.equal(missDed.matched, false);

    const status = engine.getCipherStatus();
    assert.equal(status.hasCipherTable, true);
    assert.equal(status.decodedCipherClues.length, 4);
  });

  it('prevents Miyuki affection duplicate farming and enforces exact >=3 vs <=2 Happy Ending split (GAP-04)', () => {
    // 1. Verify duplicate farming prevention & -1 / 0 / +1 deltas
    const farmEng = IsakuEngine.createEngine(ISAKU_DATA);
    const firstTalk = farmEng.talkToCharacter('char_miyuki', 0); // +1 on 5F Music
    assert.equal(firstTalk.ok, true);
    assert.equal(firstTalk.miyukiAffection, 1);
    assert.equal(firstTalk.affectionChanged, true);
    assert.deepEqual(firstTalk.affectionEventsCompleted, ['dlg_miyuki_5f_music']);

    // Talking again in 5F Music MUST NOT increment affection!
    const repeatTalk = farmEng.talkToCharacter('char_miyuki', 0);
    assert.equal(repeatTalk.ok, true);
    assert.equal(repeatTalk.alreadySeen, true);
    assert.equal(repeatTalk.affectionChanged, false);
    assert.equal(repeatTalk.miyukiAffection, 1);

    // 2. Exact boundary: Miyuki affection == 2 -> end_happy_kotomi
    const eng2 = IsakuEngine.createEngine(ISAKU_DATA);
    const st2 = runCanonicalPlaythrough(eng2, {
      talkMiyukiOn4F: true,
      miyukiChoiceMap: {
        rm_5f_music: 0, // +1 (total 1)
        rm_4f_hall: 0, // +1 (total 2)
        rm_3f_library: 0, // +1 (total 3)
        rm_2f_class_1_1: 2, // -1 (total 2)
        rm_clock_tower: 1, // 0 (total 2)
      },
    });
    assert.equal(st2.miyukiAffection, 2);
    assert.equal(st2.affectionEventsCompleted.length, 5);
    assert.equal(st2.endingId, 'end_happy_kotomi');

    // 3. Exact boundary: Miyuki affection == 3 -> end_happy_miyuki
    const eng3 = IsakuEngine.createEngine(ISAKU_DATA);
    const st3 = runCanonicalPlaythrough(eng3, {
      talkMiyukiOn4F: true,
      miyukiChoiceMap: {
        rm_5f_music: 0, // +1 (total 1)
        rm_4f_hall: 1, // 0 (total 1)
        rm_3f_library: 0, // +1 (total 2)
        rm_2f_class_1_1: 0, // +1 (total 3)
        rm_clock_tower: 1, // 0 (total 3)
      },
    });
    assert.equal(st3.miyukiAffection, 3);
    assert.equal(st3.affectionEventsCompleted.length, 5);
    assert.equal(st3.endingId, 'end_happy_miyuki');
  });

  it('provides multi-option dialogues with distinct replies for all 7 non-Miyuki allies (GAP-04)', () => {
    const engine = IsakuEngine.createEngine(ISAKU_DATA);
    const castIds = ['char_kotomi', 'char_kumi', 'char_rika', 'char_akemi', 'char_mio', 'char_jinpachi', 'char_soga'];

    for (const cid of castIds) {
      const dlg = engine.getCharacterDialogue(cid);
      assert.ok(dlg, `Missing dialogue for ${cid}`);
      assert.ok(dlg.choices.length >= 2, `${cid} should have at least 2 choices`);
      const res = engine.talkToCharacter(cid, 0);
      assert.equal(res.ok, true);
      assert.ok(res.replyKo && res.replyKo.length > 5, `${cid} choice should produce non-empty replyKo`);
    }
    assert.ok(engine.getState().kotomiAffection >= 1);
  });

  it('explores confirmed auxiliary rooms (3F 2-1, 2-2, Men Restroom & 2F 1-3) and collects cipher memo coordinates (GAP-02)', () => {
    const engine = IsakuEngine.createEngine(ISAKU_DATA);
    runCanonicalPlaythrough(engine, { miyukiChoice: 0, stopBeforeClimax: true });

    // Visit 2F 1-3 Classroom
    assert.equal(engine.moveTo('rm_2f_class_1_3').ok, true);
    const res13 = engine.inspectHotspot('hs_2f_1_3_locker');
    assert.equal(res13.ok, true);
    assert.equal(res13.coordCode, '44');
    assert.equal(engine.getState().flags.flg_checked_emergency_map, true);

    // Climb to 3F and inspect 2-1, 2-2 (threat spike!), and 3F Men's Restroom
    assert.equal(engine.moveTo('rm_2f_hall').ok, true);
    assert.equal(engine.moveTo('rm_3f_hall').ok, true);

    assert.equal(engine.moveTo('rm_3f_class_2_1').ok, true);
    const res21 = engine.inspectHotspot('hs_3f_2_1_blackboard');
    assert.equal(res21.ok, true);
    assert.equal(res21.coordCode, '21');

    assert.equal(engine.moveTo('rm_3f_hall').ok, true);
    assert.equal(engine.moveTo('rm_3f_class_2_2').ok, true);
    const threatBefore22 = engine.getState().threatLevel;
    const res22 = engine.inspectHotspot('hs_3f_2_2_traces');
    assert.equal(res22.ok, true);
    assert.equal(res22.coordCode, '61');
    assert.equal(engine.getState().flags.flg_isaku_patrol_detected, true);
    assert.ok(engine.getState().threatLevel >= threatBefore22);

    assert.equal(engine.moveTo('rm_3f_hall').ok, true);
    assert.equal(engine.moveTo('rm_3f_restroom_m').ok, true);
    const resRmM = engine.inspectHotspot('hs_3f_restroom_m_mirror');
    assert.equal(resRmM.ok, true);
    assert.equal(resRmM.coordCode, '45');

    const coords = engine.getState().collectedMemoCoords;
    for (const expected of ['32', '54', '36', '33', '21', '61', '45', '44']) {
      assert.ok(coords.includes(expected), `Expected collected memo coord ${expected}`);
    }
  });

  it('tracks surveillance threatLevel dynamics (0..100) and Evidence Tape Detection System', () => {
    const engine = IsakuEngine.createEngine(ISAKU_DATA);
    const initialThreat = engine.getState().threatLevel;
    assert.equal(initialThreat, 12);

    // Moving increases lingering threat
    engine.moveTo('rm_5f_hall');
    assert.ok(engine.getState().threatLevel > initialThreat);

    // Triggering Kumi incident raises threat; rescuing lowers threat
    engine.moveTo('rm_5f_restroom_f');
    const crisisThreat = engine.getState().threatLevel;
    assert.ok(crisisThreat > initialThreat + 10);

    engine.interveneIncident('inc_kumi_restroom', 'escort');
    assert.ok(engine.getState().threatLevel < crisisThreat);
    assert.equal(engine.getState().evidenceTapeDetected, false);

    // In a fresh run, failing Kumi triggers Evidence Tape Detection + threat spike
    const tapeEng = IsakuEngine.createEngine(ISAKU_DATA);
    tapeEng.moveTo('rm_5f_hall');
    tapeEng.moveTo('rm_5f_restroom_f');
    const beforeFail = tapeEng.getState().threatLevel;
    tapeEng.interveneIncident('inc_kumi_restroom', 'leave_alone');
    const afterFail = tapeEng.getState();
    assert.equal(afterFail.evidenceTapeDetected, true);
    assert.equal(afterFail.evidenceTapeEvents.length, 1);
    assert.equal(afterFail.evidenceTapeEvents[0].spawnRoomId, 'rm_3f_restroom_f');
    assert.ok(afterFail.threatLevel >= Math.min(100, beforeFail + 10));
    assert.ok(afterFail.threatLevel <= 100);
  });

  it('provides contextual Detective Memo hints via getNextClueHint() across phases and crises', () => {
    const engine = IsakuEngine.createEngine(ISAKU_DATA);

    // Initial hint points to 5F 3-1 machine oil
    const h1 = engine.getNextClueHint();
    assert.equal(h1.urgency, 'normal');
    assert.equal(h1.targetRoomId, 'rm_5f_class_3_1');
    assert.ok(h1.hintKo.length > 5 && h1.spoilerHintKo.length > 5);

    // Trigger active Kumi crisis -> hint immediately switches to critical rescue!
    engine.moveTo('rm_5f_hall');
    engine.moveTo('rm_5f_restroom_f');
    const hCrisis = engine.getNextClueHint();
    assert.equal(hCrisis.urgency, 'critical');
    assert.equal(hCrisis.targetRoomId, 'rm_5f_restroom_f');

    // After full playthrough -> hint reports ending reached
    const doneEng = IsakuEngine.createEngine(ISAKU_DATA);
    runCanonicalPlaythrough(doneEng, { miyukiChoice: 0 });
    const hDone = doneEng.getNextClueHint();
    assert.equal(hDone.urgency, 'done');
  });

  it('TC-01: completes all 16 puzzles & 8 rescues with high Miyuki affection -> end_happy_miyuki', () => {
    const engine = IsakuEngine.createEngine(ISAKU_DATA);
    const finalState = runCanonicalPlaythrough(engine, { miyukiChoice: 0, useCombineForOil: true });

    assert.equal(finalState.solvedPuzzles.length, 16);
    assert.equal(finalState.resolvedIncidents.length, 8);
    assert.ok(finalState.resolvedIncidents.every((r) => r.outcome === 'rescued'));
    assert.ok(finalState.miyukiAffection >= 3);
    assert.equal(engine.getProgressSummary().compromisedCount, 0);
    assert.equal(finalState.threatLevel, 0);
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
    assert.equal(finalState.evidenceTapeDetected, true);
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

  it('TC-08: deterministic save/load serialization restores pre-climax branch and Phase 2 state cleanly', () => {
    const engine = IsakuEngine.createEngine(ISAKU_DATA);
    runCanonicalPlaythrough(engine, { miyukiChoice: 0, stopBeforeClimax: true });
    engine.decodeCipher('32', '54');

    const snapshot = engine.serialize();
    const savedState = engine.getState();
    assert.equal(savedState.solvedPuzzles.length, 13);
    assert.equal(savedState.decodedCipherClues.length, 1);
    assert.equal(savedState.endingId, null);

    // Branch A: fail at Clock Tower -> Bad Ending
    engine.moveTo('rm_3f_hall');
    engine.moveTo('rm_4f_hall');
    engine.moveTo('rm_5f_hall');
    engine.moveTo('rm_clock_tower');
    engine.interveneIncident('inc_miyuki_clock_tower', 'abandon');
    assert.equal(engine.getState().endingId, 'end_bad_isaku_total_loss');

    // Restore snapshot -> exact pre-climax state including cipher & affection history restored
    engine.deserialize(snapshot);
    assert.deepEqual(engine.getState(), savedState);

    // Branch B: play cleanly from restored snapshot to Happy Ending A
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

    for (let i = 0; i < 3; i++) {
      engine.moveTo('rm_5f_hall');
      engine.moveTo('rm_5f_class_3_1');
    }
    const st = engine.getState();
    assert.equal(st.characterStates.char_kumi, 'compromised');
    assert.equal(st.flags.flg_inc_kumi_compromised, true);
    assert.equal(st.flags.flg_evidence_tape_spawned, true);
    assert.equal(st.evidenceTapeDetected, true);
  });
});
