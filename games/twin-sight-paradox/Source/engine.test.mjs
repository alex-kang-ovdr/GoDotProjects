#!/usr/bin/env node
/**
 * Twin Sight Paradox — Phase 2 Multi-Sight Dual-Perspective Engine Automated Test Suite (14 Tests)
 *
 * Verifies:
 * 1. Phase 2 SSOT bundle counts (18 chars, 16 locs, 27 scenes, 12 sync barriers, 22 clues, 8 correlations, 16 items, 3 deduction steps, 4 endings).
 * 2. Day 0 staggered start (Marina M_D0_01 -> M_D0_02 -> M_D0_03 unlocks SB_01, stalls at SB_02).
 * 3. Strict epistemic, inventory, location, and alias isolation pre-convergence (zero leakage).
 * 4. Progressive Command Exhaustion (LOOK 1->2->3, TALK 1->2->3, THINK 1->2->3 synthesis + @2 depth gates).
 * 5. Eldia Embassy Wiretap & Aqua Disk cross-site sequence (M_D3_02 -> SB_07 -> K_D3_03 -> SB_08 -> M_D4_01).
 * 6. Dec 6 DBMS Level-7 Deadlock double-lock (SB_09 -> SB_10 -> SB_11) cross-causal breakthrough.
 * 7. Tristan Engine Room (K_D5_02) progressive discovery (glasses-off Mayako & missing National Seal half).
 * 8. All 12 Sync Barriers (SB_01 ~ SB_12) block until partner unlocks them & populate crossCausalLog + 27-node timeline graph.
 * 9. Complete 27-scene walkthrough to C_D6_01 Convergence in BOTH final arrival orders (all 22/22 clues unified).
 * 10. Interactive Clue Cross-Link Engine (correlateClues): validates discovery, order-independence, all 8 canonical pairs, bonus finale hints.
 * 11. 3-Stage Finale Deduction Sequence (submitDeductionStep 0 -> 1 -> 2): multilingual Classic & PLUS answers -> END_TRUE_RESCUE.
 * 12. Wrong deduction at any stage triggers END_BAD_WRONG_CULPRIT + checkpoint retry recovers exact stage.
 * 13. Backward-compatible submitCulprit multilingual check & lethal crisis choices (M_D4_02 / K_D4_02) + checkpoint recovery.
 * 14. Save/load serialization round-trip determinism (correlations, exhaustion, deduction progress) & checksum tamper rejection.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const webDir = path.resolve(__dirname, '..', 'Web');

function loadBrowserRuntime() {
  const dataCode = fs.readFileSync(path.join(webDir, 'data', 'game-data.js'), 'utf8');
  const engineCode = fs.readFileSync(path.join(webDir, 'engine.js'), 'utf8');
  const sandbox = { console };
  sandbox.globalThis = sandbox;
  sandbox.window = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(dataCode, sandbox, { filename: 'game-data.js' });
  vm.runInContext(engineCode, sandbox, { filename: 'engine.js' });
  return {
    EVE_DATA: sandbox.EVE_DATA,
    EveEngine: sandbox.EveEngine,
  };
}

const { EVE_DATA, EveEngine } = loadBrowserRuntime();

// Helper: execute all required investigative steps (respecting @N progressive depth!) for the active scene
function completeActiveSceneObjectives(engine) {
  let guard = 0;
  while (!engine.getSceneProgress().readyToAdvance && guard < 20) {
    guard++;
    const prog = engine.getSceneProgress();
    assert.ok(prog.stepDetails.length > 0, `No stepDetails for ${prog.sceneId}`);
    for (const detail of prog.stepDetails) {
      if (detail.done) continue;
      const clicksNeeded = Math.max(1, detail.requiredDepth - detail.currentDepth);
      for (let c = 0; c < clicksNeeded; c++) {
        const res = engine.executeCommand(detail.verb, detail.targetId);
        assert.equal(
          res.ok,
          true,
          `Expected ${detail.verb}:${detail.targetId} to succeed in ${prog.sceneId}, got ${JSON.stringify(res)}`
        );
      }
    }
  }
  assert.equal(
    engine.getSceneProgress().readyToAdvance,
    true,
    `Scene ${engine.getSceneProgress().sceneId} should be ready to advance`
  );
}

// Helper: play through the canonical 27-scene, 12-barrier golden path up to a stop barrier or full convergence
function advanceToBarrierOrConvergence(engine, { stopAtBarrier = null, reverseFinalOrder = false } = {}) {
  const encounteredBlocks = ['SB_01'];

  // 1. Marina Day 0: M_D0_01 -> M_D0_02 -> M_D0_03 (unlocks SB_01, stalls SB_02)
  completeActiveSceneObjectives(engine);
  assert.equal(engine.advanceScene().nextSceneId, 'M_D0_02');
  completeActiveSceneObjectives(engine);
  assert.equal(engine.advanceScene().nextSceneId, 'M_D0_03');
  completeActiveSceneObjectives(engine);
  let adv = engine.advanceScene();
  assert.equal(adv.stalled, true);
  assert.equal(adv.blockedByBarrier.id, 'SB_02');
  encounteredBlocks.push('SB_02');
  if (stopAtBarrier === 'SB_02') return encounteredBlocks;

  // 2. Kojiro Day 1: K_D1_01 (unlocks SB_02) -> K_D1_02 -> K_D1_03 (stalls SB_03)
  assert.equal(engine.executeCommand('SIGHT_CHANGE').ok, true);
  completeActiveSceneObjectives(engine);
  assert.equal(engine.advanceScene().nextSceneId, 'K_D1_02');
  completeActiveSceneObjectives(engine);
  assert.equal(engine.advanceScene().nextSceneId, 'K_D1_03');
  completeActiveSceneObjectives(engine);
  adv = engine.advanceScene();
  assert.equal(adv.stalled, true);
  assert.equal(adv.blockedByBarrier.id, 'SB_03');
  encounteredBlocks.push('SB_03');
  if (stopAtBarrier === 'SB_03') return encounteredBlocks;

  // 3. Marina Day 1: M_D1_01 -> M_D1_02 (unlocks SB_03, stalls SB_04)
  assert.equal(engine.executeCommand('SIGHT_CHANGE').ok, true);
  assert.equal(engine.getCurrentScene().id, 'M_D1_01');
  completeActiveSceneObjectives(engine);
  assert.equal(engine.advanceScene().nextSceneId, 'M_D1_02');
  completeActiveSceneObjectives(engine);
  adv = engine.advanceScene();
  assert.equal(adv.stalled, true);
  assert.equal(adv.blockedByBarrier.id, 'SB_04');
  encounteredBlocks.push('SB_04');
  if (stopAtBarrier === 'SB_04') return encounteredBlocks;

  // 4. Kojiro Day 2①: K_D2_01 (unlocks SB_04, stalls SB_05)
  assert.equal(engine.executeCommand('SIGHT_CHANGE').ok, true);
  assert.equal(engine.getCurrentScene().id, 'K_D2_01');
  completeActiveSceneObjectives(engine);
  adv = engine.advanceScene();
  assert.equal(adv.stalled, true);
  assert.equal(adv.blockedByBarrier.id, 'SB_05');
  encounteredBlocks.push('SB_05');
  if (stopAtBarrier === 'SB_05') return encounteredBlocks;

  // 5. Marina Day 2: M_D2_01 -> M_D2_02 (unlocks SB_05, stalls SB_06)
  assert.equal(engine.executeCommand('SIGHT_CHANGE').ok, true);
  assert.equal(engine.getCurrentScene().id, 'M_D2_01');
  completeActiveSceneObjectives(engine);
  assert.equal(engine.advanceScene().nextSceneId, 'M_D2_02');
  completeActiveSceneObjectives(engine);
  adv = engine.advanceScene();
  assert.equal(adv.stalled, true);
  assert.equal(adv.blockedByBarrier.id, 'SB_06');
  encounteredBlocks.push('SB_06');
  if (stopAtBarrier === 'SB_06') return encounteredBlocks;

  // 6. Kojiro Day 2② ~ Day 3②: K_D2_02 -> K_D3_01 (unlocks SB_06) -> K_D3_02 (stalls SB_07)
  assert.equal(engine.executeCommand('SIGHT_CHANGE').ok, true);
  assert.equal(engine.getCurrentScene().id, 'K_D2_02');
  completeActiveSceneObjectives(engine);
  assert.equal(engine.advanceScene().nextSceneId, 'K_D3_01');
  completeActiveSceneObjectives(engine);
  assert.equal(engine.advanceScene().nextSceneId, 'K_D3_02');
  completeActiveSceneObjectives(engine);
  adv = engine.advanceScene();
  assert.equal(adv.stalled, true);
  assert.equal(adv.blockedByBarrier.id, 'SB_07');
  encounteredBlocks.push('SB_07');
  if (stopAtBarrier === 'SB_07') return encounteredBlocks;

  // 7. Marina Day 3: M_D3_01 -> M_D3_02 (unlocks SB_07, stalls SB_08)
  assert.equal(engine.executeCommand('SIGHT_CHANGE').ok, true);
  assert.equal(engine.getCurrentScene().id, 'M_D3_01');
  completeActiveSceneObjectives(engine);
  assert.equal(engine.advanceScene().nextSceneId, 'M_D3_02');
  completeActiveSceneObjectives(engine);
  adv = engine.advanceScene();
  assert.equal(adv.stalled, true);
  assert.equal(adv.blockedByBarrier.id, 'SB_08');
  encounteredBlocks.push('SB_08');
  if (stopAtBarrier === 'SB_08') return encounteredBlocks;

  // 8. Kojiro Day 3③: K_D3_03 (Embassy Wiretap + Aqua Disk -> unlocks SB_08, stalls SB_09)
  assert.equal(engine.executeCommand('SIGHT_CHANGE').ok, true);
  assert.equal(engine.getCurrentScene().id, 'K_D3_03');
  completeActiveSceneObjectives(engine);
  adv = engine.advanceScene();
  assert.equal(adv.stalled, true);
  assert.equal(adv.blockedByBarrier.id, 'SB_09');
  encounteredBlocks.push('SB_09');
  if (stopAtBarrier === 'SB_09') return encounteredBlocks;

  // 9. Marina Day 4①: M_D4_01 (Kagawa inquiry + DBMS Level-7 -> unlocks SB_09, stalls SB_10)
  assert.equal(engine.executeCommand('SIGHT_CHANGE').ok, true);
  assert.equal(engine.getCurrentScene().id, 'M_D4_01');
  completeActiveSceneObjectives(engine);
  adv = engine.advanceScene();
  assert.equal(adv.stalled, true);
  assert.equal(adv.blockedByBarrier.id, 'SB_10');
  encounteredBlocks.push('SB_10');
  if (stopAtBarrier === 'SB_10') return encounteredBlocks;

  // 10. Kojiro Day 4①: K_D4_01 (DBMS simultaneous access -> unlocks SB_10, stalls SB_11)
  assert.equal(engine.executeCommand('SIGHT_CHANGE').ok, true);
  assert.equal(engine.getCurrentScene().id, 'K_D4_01');
  completeActiveSceneObjectives(engine);
  adv = engine.advanceScene();
  assert.equal(adv.stalled, true);
  assert.equal(adv.blockedByBarrier.id, 'SB_11');
  encounteredBlocks.push('SB_11');
  if (stopAtBarrier === 'SB_11') return encounteredBlocks;

  // 11. Marina Day 4②: M_D4_02 (C Project + Kouno hostage escape -> unlocks SB_11 -> M_D5_01)
  assert.equal(engine.executeCommand('SIGHT_CHANGE').ok, true);
  assert.equal(engine.getCurrentScene().id, 'M_D4_02');
  if (stopAtBarrier === 'M_D4_02_ENTRY') return encounteredBlocks;
  completeActiveSceneObjectives(engine);
  assert.equal(engine.advanceScene().nextSceneId, 'M_D5_01');

  if (reverseFinalOrder) {
    // Finish Marina M_D5_01 -> M_D5_02 first -> stalls SB_12
    completeActiveSceneObjectives(engine);
    assert.equal(engine.advanceScene().nextSceneId, 'M_D5_02');
    completeActiveSceneObjectives(engine);
    adv = engine.advanceScene();
    assert.equal(adv.stalled, true);
    assert.equal(adv.blockedByBarrier.id, 'SB_12');
    encounteredBlocks.push('SB_12');

    // Switch to Kojiro K_D4_02 -> K_D5_01 -> K_D5_02 -> K_D5_03 -> unlocks SB_12 -> Converges!
    assert.equal(engine.executeCommand('SIGHT_CHANGE').ok, true);
    assert.equal(engine.getCurrentScene().id, 'K_D4_02');
    completeActiveSceneObjectives(engine);
    assert.equal(engine.advanceScene().nextSceneId, 'K_D5_01');
    completeActiveSceneObjectives(engine);
    assert.equal(engine.advanceScene().nextSceneId, 'K_D5_02');
    completeActiveSceneObjectives(engine);
    assert.equal(engine.advanceScene().nextSceneId, 'K_D5_03');
    completeActiveSceneObjectives(engine);
    adv = engine.advanceScene();
    assert.equal(adv.converged, true);
    assert.equal(adv.nextSceneId, 'C_D6_01');
  } else {
    // Switch to Kojiro K_D4_02 -> K_D5_01 -> K_D5_02 -> K_D5_03 -> stalls SB_12
    assert.equal(engine.executeCommand('SIGHT_CHANGE').ok, true);
    assert.equal(engine.getCurrentScene().id, 'K_D4_02');
    if (stopAtBarrier === 'K_D4_02_ENTRY') return encounteredBlocks;
    completeActiveSceneObjectives(engine);
    assert.equal(engine.advanceScene().nextSceneId, 'K_D5_01');
    completeActiveSceneObjectives(engine);
    assert.equal(engine.advanceScene().nextSceneId, 'K_D5_02');
    if (stopAtBarrier === 'K_D5_02_ENTRY') return encounteredBlocks;
    completeActiveSceneObjectives(engine);
    assert.equal(engine.advanceScene().nextSceneId, 'K_D5_03');
    completeActiveSceneObjectives(engine);
    adv = engine.advanceScene();
    assert.equal(adv.stalled, true);
    assert.equal(adv.blockedByBarrier.id, 'SB_12');
    encounteredBlocks.push('SB_12');

    // Switch to Marina M_D5_01 -> M_D5_02 -> unlocks SB_12 -> Converges!
    assert.equal(engine.executeCommand('SIGHT_CHANGE').ok, true);
    assert.equal(engine.getCurrentScene().id, 'M_D5_01');
    completeActiveSceneObjectives(engine);
    assert.equal(engine.advanceScene().nextSceneId, 'M_D5_02');
    completeActiveSceneObjectives(engine);
    adv = engine.advanceScene();
    assert.equal(adv.converged, true);
    assert.equal(adv.nextSceneId, 'C_D6_01');
  }

  return encounteredBlocks;
}

test('01. Phase 2 SSOT bundle matches verified_data canonical counts', () => {
  assert.equal(EVE_DATA.characters.length, 18);
  assert.equal(EVE_DATA.locations.length, 16);
  assert.equal(EVE_DATA.scenes.length, 27);
  assert.equal(EVE_DATA.syncBarriers.length, 12);
  assert.equal(EVE_DATA.clues.length, 22);
  assert.equal(EVE_DATA.clueCorrelations.length, 8);
  assert.equal(EVE_DATA.items.length, 16);
  assert.equal(EVE_DATA.finaleDeductionSteps.length, 3);
  assert.equal(EVE_DATA.endings.length, 4);
});

test('02. Day 0 blocks SIGHT_CHANGE across M_D0_01~M_D0_03 until SB_01 unlocks', () => {
  const engine = EveEngine.createEngine(EVE_DATA);
  const initial = engine.getState();

  assert.equal(initial.activeProtagonist, 'marina');
  assert.equal(initial.protagonists.marina.currentSceneId, 'M_D0_01');
  assert.equal(initial.protagonists.kojiro.blockedByBarrierId, 'SB_01');
  assert.equal(engine.canSightChange().allowed, false);
  assert.equal(engine.executeCommand('SIGHT_CHANGE').ok, false);

  completeActiveSceneObjectives(engine);
  assert.equal(engine.advanceScene().nextSceneId, 'M_D0_02');
  assert.equal(engine.canSightChange().allowed, false);

  completeActiveSceneObjectives(engine);
  assert.equal(engine.advanceScene().nextSceneId, 'M_D0_03');
  assert.equal(engine.canSightChange().allowed, false);

  completeActiveSceneObjectives(engine);
  const adv = engine.advanceScene();
  assert.equal(adv.stalled, true);
  assert.equal(adv.blockedByBarrier.id, 'SB_02');

  const st = engine.getState();
  assert.ok(st.sharedWorld.unlockedBarriers.includes('SB_01'));
  assert.equal(st.protagonists.kojiro.blockedByBarrierId, null);
  assert.equal(engine.canSightChange().allowed, true);

  const sw = engine.executeCommand('SIGHT_CHANGE');
  assert.equal(sw.ok, true);
  assert.equal(sw.activeProtagonist, 'kojiro');
  assert.equal(engine.getCurrentScene().id, 'K_D1_01');
});

test('03. Strict epistemic, inventory, location, and character-alias isolation pre-convergence', () => {
  const engine = EveEngine.createEngine(EVE_DATA);
  advanceToBarrierOrConvergence(engine, { stopAtBarrier: 'SB_06' });

  // Switch to Kojiro K_D2_02
  engine.executeCommand('SIGHT_CHANGE');

  // Kojiro cannot use Marina's handgun or visit Marina-only JCIA HQ / Yale Dorm
  assert.equal(engine.executeCommand('ITEM', 'item_ikuiku_handgun').reason, 'ITEM_NOT_IN_INVENTORY');
  assert.equal(engine.executeCommand('MOVE', 'loc_jcia_hq').reason, 'LOCATION_ACCESS_DENIED');
  assert.equal(engine.executeCommand('MOVE', 'loc_yale_dorm').reason, 'LOCATION_ACCESS_DENIED');

  // Kojiro sees Dib disguised as '스트르만=코우 (위장)' before K_D3_01
  const dibBefore = engine.getCharacterView('dib', 'kojiro');
  assert.equal(dibBefore.displayName, '스트르만=코우 (위장)');
  assert.equal(dibBefore.isRevealed, false);

  // Marina holds clue_suzuki_alias & item_national_seal_half_marina; Kojiro has ZERO leakage
  const st = engine.getState();
  assert.ok(st.protagonists.marina.knownClues.includes('clue_suzuki_alias'));
  assert.ok(st.protagonists.marina.inventory.includes('item_national_seal_half_marina'));
  assert.equal(st.protagonists.kojiro.knownClues.includes('clue_suzuki_alias'), false);
  assert.equal(st.protagonists.kojiro.inventory.includes('item_national_seal_half_marina'), false);

  // THINK:situation at all 3 depths must NEVER leak Marina's '스즈키' or '디렉터룸'
  for (let d = 1; d <= 3; d++) {
    const thinkRes = engine.executeCommand('THINK', 'situation');
    assert.equal(thinkRes.ok, true);
    assert.equal(thinkRes.text.includes('스즈키'), false);
    assert.equal(thinkRes.text.includes('디렉터룸'), false);
  }

  // Verify Genzaburo alias asymmetry
  assert.equal(engine.getCharacterView('genzaburo_katsuragi', 'kojiro').displayName, '카츠라기 겐자부로');
  assert.equal(engine.getCharacterView('genzaburo_katsuragi', 'marina').displayName, '스즈키 겐자부로');
});

test('04. Progressive Command Exhaustion (LOOK 1->2->3, TALK 1->2->3, THINK 1->2->3 & @2 depth gate)', () => {
  const engine = EveEngine.createEngine(EVE_DATA);

  // In M_D0_01, verify 3 progressive LOOK layers and exhaustion indicator
  const l1 = engine.executeCommand('LOOK', 'briefing_dossier');
  const l2 = engine.executeCommand('LOOK', 'briefing_dossier');
  const l3 = engine.executeCommand('LOOK', 'briefing_dossier');
  assert.notEqual(l1.text, l2.text);
  assert.notEqual(l2.text, l3.text);
  assert.equal(l1.exhausted, false);
  assert.equal(l2.exhausted, false);
  assert.equal(l3.exhausted, true);
  assert.equal(l3.depth, 3);
  assert.equal(l3.maxDepth, 3);

  // Verify TALK 1->2->3 progressive dialogue exhaustion
  const t1 = engine.executeCommand('TALK', 'saburo_kouno');
  const t2 = engine.executeCommand('TALK', 'saburo_kouno');
  const t3 = engine.executeCommand('TALK', 'saburo_kouno');
  assert.notEqual(t1.text, t2.text);
  assert.notEqual(t2.text, t3.text);
  assert.equal(t3.exhausted, true);

  // Verify getAvailableCommands reports exhausted: true on exhausted targets
  const cmds = engine.getAvailableCommands();
  const focusTarget = cmds.verbs.LOOK.find((t) => t.id === 'briefing_dossier');
  assert.equal(focusTarget.currentDepth, 3);
  assert.equal(focusTarget.exhausted, true);

  // Advance to K_D1_02 where LOOK:stollman_study_painting@2 enforces depth 2!
  advanceToBarrierOrConvergence(engine, { stopAtBarrier: 'SB_02' });
  engine.executeCommand('SIGHT_CHANGE'); // K_D1_01
  completeActiveSceneObjectives(engine);
  assert.equal(engine.advanceScene().nextSceneId, 'K_D1_02');

  // Talk Yayoi + only 1 LOOK -> NOT yet ready to advance because @2 depth is required!
  engine.executeCommand('TALK', 'yayoi_katsuragi');
  engine.executeCommand('LOOK', 'stollman_study_painting');
  assert.equal(engine.getSceneProgress().readyToAdvance, false);
  assert.equal(engine.advanceScene().reason, 'OBJECTIVES_INCOMPLETE');

  // 2nd LOOK reveals Nikaido's electronic organizer and satisfies @2 depth!
  const look2 = engine.executeCommand('LOOK', 'stollman_study_painting');
  assert.equal(look2.depth, 2);
  assert.equal(engine.getSceneProgress().readyToAdvance, true);
  assert.ok(engine.getState().protagonists.kojiro.inventory.includes('item_nikaido_organizer'));
  assert.ok(engine.getState().protagonists.kojiro.knownClues.includes('clue_nikaido_organizer'));
});

test('05. Eldia Embassy Wiretap & Aqua Encrypted Disk cross-site sequence (SB_07 -> SB_08)', () => {
  const engine = EveEngine.createEngine(EVE_DATA);
  advanceToBarrierOrConvergence(engine, { stopAtBarrier: 'SB_08' });

  // Kojiro enters K_D3_03 with wiretap & disk ready; must execute @2 LOOK + ITEM wiretap + TALK Himuro
  engine.executeCommand('SIGHT_CHANGE');
  assert.equal(engine.getCurrentScene().id, 'K_D3_03');
  assert.ok(engine.getState().protagonists.kojiro.inventory.includes('item_embassy_wiretap'));

  completeActiveSceneObjectives(engine);
  const adv = engine.advanceScene();
  assert.equal(adv.stalled, true);
  assert.equal(adv.blockedByBarrier.id, 'SB_09');

  const st = engine.getState();
  assert.ok(st.sharedWorld.unlockedBarriers.includes('SB_08'));
  assert.ok(st.protagonists.kojiro.knownClues.includes('clue_embassy_wiretap_signal'));
  assert.ok(st.protagonists.kojiro.knownClues.includes('clue_aqua_encrypted_disk'));
  assert.equal(st.protagonists.marina.currentSceneId, 'M_D4_01');
  assert.equal(st.protagonists.marina.blockedByBarrierId, null);
});

test('06. Dec 6 DBMS Level-7 Deadlock double-lock (SB_09 -> SB_10 -> SB_11) enforces cross-causal breakthrough', () => {
  const engine = EveEngine.createEngine(EVE_DATA);
  advanceToBarrierOrConvergence(engine, { stopAtBarrier: 'SB_10' });

  // Marina is strictly stalled on SB_10 (DBMS Level-7 Deadlock); cannot bypass alone!
  let st = engine.getState();
  assert.equal(st.activeProtagonist, 'marina');
  assert.ok(st.sharedWorld.unlockedBarriers.includes('SB_09'));
  assert.equal(st.sharedWorld.unlockedBarriers.includes('SB_10'), false);
  assert.equal(st.protagonists.marina.blockedByBarrierId, 'SB_10');
  assert.equal(engine.advanceScene().reason, 'BLOCKED_BY_SYNC_BARRIER');

  // Switch to Kojiro K_D4_01 -> simultaneous DBMS access breaks SB_10!
  engine.executeCommand('SIGHT_CHANGE');
  assert.equal(engine.getCurrentScene().id, 'K_D4_01');
  completeActiveSceneObjectives(engine);
  const k4Adv = engine.advanceScene();
  assert.equal(k4Adv.stalled, true);
  assert.equal(k4Adv.blockedByBarrier.id, 'SB_11');

  st = engine.getState();
  assert.ok(st.sharedWorld.unlockedBarriers.includes('SB_10'));
  assert.equal(st.protagonists.marina.blockedByBarrierId, null);
  assert.equal(st.protagonists.marina.currentSceneId, 'M_D4_02');

  // Switch to Marina M_D4_02 -> C Project extracted & Kouno hostage escape unlocks SB_11!
  engine.executeCommand('SIGHT_CHANGE');
  completeActiveSceneObjectives(engine);
  assert.equal(engine.advanceScene().nextSceneId, 'M_D5_01');
  st = engine.getState();
  assert.ok(st.sharedWorld.unlockedBarriers.includes('SB_11'));
  assert.ok(st.protagonists.marina.knownClues.includes('clue_c_project_file'));
  assert.equal(st.protagonists.kojiro.currentSceneId, 'K_D4_02');
});

test('07. Tristan Engine Room (K_D5_02) reveals glasses-off Mayako & missing National Seal clue', () => {
  const engine = EveEngine.createEngine(EVE_DATA);
  advanceToBarrierOrConvergence(engine, { stopAtBarrier: 'K_D5_02_ENTRY' });

  assert.equal(engine.getActiveProtagonist(), 'kojiro');
  assert.equal(engine.getCurrentScene().id, 'K_D5_02');
  assert.equal(engine.getState().protagonists.kojiro.locationId, 'loc_tristan_engine');

  // Layer 1 -> Layer 2 -> Layer 3 progressive discovery in Engine Room
  const e1 = engine.executeCommand('LOOK', 'tristan_engine_room');
  const e2 = engine.executeCommand('LOOK', 'tristan_engine_room');
  const e3 = engine.executeCommand('LOOK', 'tristan_engine_room');
  assert.ok(e1.text.includes('안경을 벗은 미도 마야코'));
  assert.ok(e2.text.includes('푸딩(프리시아)'));
  assert.ok(e3.text.includes('국새'));
  assert.equal(e3.exhausted, true);
  assert.ok(engine.getState().protagonists.kojiro.knownClues.includes('clue_engine_room_missing_seal'));
});

test('08. All 12 Sync Barriers (SB_01~SB_12) block until partner unlocks & timeline graph has 27 nodes + 12 unlocked barriers', () => {
  const engine = EveEngine.createEngine(EVE_DATA);
  const encountered = advanceToBarrierOrConvergence(engine, { reverseFinalOrder: false });

  assert.deepEqual(encountered, [
    'SB_01', 'SB_02', 'SB_03', 'SB_04', 'SB_05', 'SB_06',
    'SB_07', 'SB_08', 'SB_09', 'SB_10', 'SB_11', 'SB_12',
  ]);

  const st = engine.getState();
  assert.equal(st.sharedWorld.unlockedBarriers.length, 12);
  assert.equal(st.sharedWorld.crossCausalLog.length, 12);

  const graph = engine.getTimelineGraph();
  assert.equal(graph.nodes.length, 27);
  assert.equal(graph.barriers.length, 12);
  assert.ok(graph.barriers.every((b) => b.unlocked === true));
});

test('09. Complete 27-scene walkthrough to C_D6_01 Convergence (both arrival orders, all 22/22 clues unified)', () => {
  for (const reverseFinalOrder of [false, true]) {
    const engine = EveEngine.createEngine(EVE_DATA);
    advanceToBarrierOrConvergence(engine, { reverseFinalOrder });

    const st = engine.getState();
    assert.equal(st.sharedWorld.converged, true);
    assert.equal(st.protagonists.kojiro.currentSceneId, 'C_D6_01');
    assert.equal(st.protagonists.marina.currentSceneId, 'C_D6_01');
    assert.equal(st.protagonists.kojiro.locationId, 'loc_tristan_hold');
    assert.equal(st.protagonists.marina.locationId, 'loc_tristan_hold');
    assert.equal(engine.canSightChange().allowed, false);
    assert.equal(engine.canSightChange().reason, 'CONVERGENCE_LOCK');

    // All 22 clues unified & shared!
    const matrix = engine.getAsymmetryMatrix();
    assert.equal(matrix.length, 22);
    assert.ok(matrix.every((row) => row.shared === true && row.knownByKojiro && row.knownByMarina));
    assert.ok(st.protagonists.kojiro.inventory.includes('item_oxygen_cylinders'));
    assert.ok(st.protagonists.marina.inventory.includes('item_oxygen_cylinders'));
  }
});

test('10. Interactive Clue Cross-Link Engine (correlateClues) exposes all 8 dramatic-irony truths & finale hints', () => {
  const engine = EveEngine.createEngine(EVE_DATA);

  // Cannot correlate undiscovered clues early in the game
  const tooEarly = engine.correlateClues('clue_painting_seal_half', 'clue_director_room_seal_half');
  assert.equal(tooEarly.ok, false);
  assert.equal(tooEarly.reason, 'CLUE_NOT_DISCOVERED');

  // Advance to Convergence where all 22 clues are discovered
  advanceToBarrierOrConvergence(engine);

  // Self-pair rejected
  assert.equal(engine.correlateClues('clue_purin_warehouse', 'clue_purin_warehouse').reason, 'SAME_CLUE');

  // Non-matching valid pair returns matched: false cleanly
  const miss = engine.correlateClues('clue_nikaido_organizer', 'clue_kagawa_kouno_leverage');
  assert.equal(miss.ok, true);
  assert.equal(miss.matched, false);

  // Correlate all 8 canonical pairs (testing reverse argument order too!)
  for (let i = 0; i < EVE_DATA.clueCorrelations.length; i++) {
    const corr = EVE_DATA.clueCorrelations[i];
    const res =
      i % 2 === 0
        ? engine.correlateClues(corr.clue_a_id, corr.clue_b_id)
        : engine.correlateClues(corr.clue_b_id, corr.clue_a_id);
    assert.equal(res.ok, true);
    assert.equal(res.matched, true, `Expected ${corr.id} to match`);
    assert.equal(res.alreadyDiscovered, false);
    assert.equal(res.correlation.id, corr.id);
  }

  // Re-submitting an existing correlation is idempotent
  const dup = engine.correlateClues('clue_painting_seal_half', 'clue_director_room_seal_half');
  assert.equal(dup.ok, true);
  assert.equal(dup.matched, true);
  assert.equal(dup.alreadyDiscovered, true);

  assert.equal(engine.getDiscoveredCorrelations().length, 8);
  assert.ok(engine.getFinaleHints(0).length >= 2);
  assert.ok(engine.getFinaleHints(1).length >= 3);
  assert.ok(engine.getFinaleHints(2).length >= 2);
});

test('11. 3-Stage Finale Deduction Sequence (submitDeductionStep 0 -> 1 -> 2) reaches END_TRUE_RESCUE', () => {
  const multilingualSets = [
    ['프리시아', '클론', '미도 마야코'],
    ['プリン', 'μ-101', '御堂真弥子'],
    ['엘디아 왕녀', '복제인간', 'Mayako Mido'],
    ['Prisia Rem Crime', '유기 휴머노이드', 'みどう まやこ'],
  ];

  for (const [ans0, ans1, ans2] of multilingualSets) {
    const engine = EveEngine.createEngine(EVE_DATA);
    advanceToBarrierOrConvergence(engine);

    // Out-of-order stage 1 rejected before stage 0
    assert.equal(engine.submitDeductionStep(1, ans1).reason, 'OUT_OF_ORDER_STEP');

    const s0 = engine.submitDeductionStep(0, ans0);
    assert.equal(s0.ok, true);
    assert.equal(s0.correct, true);
    assert.equal(s0.completedAll, false);
    assert.equal(s0.nextStepIndex, 1);

    const s1 = engine.submitDeductionStep(1, ans1);
    assert.equal(s1.ok, true);
    assert.equal(s1.correct, true);
    assert.equal(s1.completedAll, false);
    assert.equal(s1.nextStepIndex, 2);

    const s2 = engine.submitDeductionStep(2, ans2);
    assert.equal(s2.ok, true);
    assert.equal(s2.correct, true);
    assert.equal(s2.completedAll, true);
    assert.equal(s2.endingId, 'END_TRUE_RESCUE');
    assert.equal(engine.getState().sharedWorld.endingId, 'END_TRUE_RESCUE');
  }
});

test('12. Wrong deduction at Stage 1, 2, or 3 triggers END_BAD_WRONG_CULPRIT & checkpoint retry recovers exact stage', () => {
  const engine = EveEngine.createEngine(EVE_DATA);
  advanceToBarrierOrConvergence(engine);

  // Wrong answer on Stage 0 -> Bad Ending -> Checkpoint retry restores Stage 0
  const bad0 = engine.submitDeductionStep(0, '시리아 플랫');
  assert.equal(bad0.correct, false);
  assert.equal(bad0.endingId, 'END_BAD_WRONG_CULPRIT');
  assert.equal(engine.retryFromCheckpoint().ok, true);
  assert.equal(engine.getState().sharedWorld.deductionProgress, 0);

  // Clear Stage 0, fail Stage 1 -> Checkpoint retry restores Stage 1 cleanly!
  assert.equal(engine.submitDeductionStep(0, '프리시아').correct, true);
  const bad1 = engine.submitDeductionStep(1, '핵무기');
  assert.equal(bad1.correct, false);
  assert.equal(bad1.endingId, 'END_BAD_WRONG_CULPRIT');
  assert.equal(engine.retryFromCheckpoint().ok, true);
  assert.equal(engine.getState().sharedWorld.deductionProgress, 1);

  // Clear Stage 1, fail Stage 2 -> Checkpoint retry restores Stage 2 -> Clear Stage 2!
  assert.equal(engine.submitDeductionStep(1, 'μ-101').correct, true);
  const bad2 = engine.submitDeductionStep(2, '로스=미도');
  assert.equal(bad2.correct, false);
  assert.equal(bad2.endingId, 'END_BAD_WRONG_CULPRIT');
  assert.equal(engine.retryFromCheckpoint().ok, true);
  assert.equal(engine.getState().sharedWorld.deductionProgress, 2);

  const win = engine.submitDeductionStep(2, '미도 마야코');
  assert.equal(win.correct, true);
  assert.equal(win.endingId, 'END_TRUE_RESCUE');
});

test('13. Direct submitCulprit compatibility & Lethal crisis choices (M_D4_02 / K_D4_02) + checkpoint recovery', () => {
  // Test Marina M_D4_02 lethal surrender + recovery
  const engineM = EveEngine.createEngine(EVE_DATA);
  advanceToBarrierOrConvergence(engineM, { stopAtBarrier: 'M_D4_02_ENTRY' });
  const fatalM = engineM.executeCommand('CRISIS', 'fatal_surrender_kagawa');
  assert.equal(fatalM.fatal, true);
  assert.equal(fatalM.endingId, 'END_GAMEOVER_FATAL_CHOICE');
  assert.equal(engineM.retryFromCheckpoint().ok, true);
  assert.equal(engineM.executeCommand('CRISIS', 'safe_hostage_escape').ok, true);
  assert.equal(engineM.getState().sharedWorld.endingId, null);

  // Test Kojiro K_D4_02 lethal Dib charge + recovery + Modern/Classic THINK barrier toggle
  const engineK = EveEngine.createEngine(EVE_DATA);
  advanceToBarrierOrConvergence(engineK, { stopAtBarrier: 'K_D4_02_ENTRY' });
  const fatalK = engineK.executeCommand('CRISIS', 'fatal_charge_dib_unarmed');
  assert.equal(fatalK.fatal, true);
  assert.equal(fatalK.endingId, 'END_GAMEOVER_FATAL_CHOICE');
  assert.equal(engineK.retryFromCheckpoint().ok, true);

  // Direct submitCulprit compatibility
  const engineC = EveEngine.createEngine(EVE_DATA);
  advanceToBarrierOrConvergence(engineC);
  const directWin = engineC.submitCulprit('御堂真弥子');
  assert.equal(directWin.correct, true);
  assert.equal(directWin.endingId, 'END_TRUE_RESCUE');
});

test('14. Save/load serialization round-trip preserves dual state, correlations, deduction progress & rejects tampered checksum', () => {
  const engineA = EveEngine.createEngine(EVE_DATA);
  advanceToBarrierOrConvergence(engineA);

  // Correlate 2 pairs and clear Stage 0 of finale deduction
  engineA.correlateClues('clue_painting_seal_half', 'clue_director_room_seal_half');
  engineA.correlateClues('clue_engine_room_missing_seal', 'clue_c_project_file');
  engineA.submitDeductionStep(0, '프리시아');

  const stateBefore = engineA.getState();
  const savedJson = engineA.serialize();

  const engineB = EveEngine.createEngine(EVE_DATA);
  const loadRes = engineB.deserialize(savedJson);
  assert.equal(loadRes.ok, true);
  assert.deepEqual(engineB.getState(), stateBefore);
  assert.equal(engineB.getDiscoveredCorrelations().length, 2);
  assert.equal(engineB.getState().sharedWorld.deductionProgress, 1);

  // Verify Classic vs Modern barrier hint mode persists cleanly too
  engineB.setMode({ sightHintMode: 'classic', culpritInputMode: 'streamlined' });
  const saved2 = engineB.serialize();
  const engineC = EveEngine.createEngine(EVE_DATA);
  assert.equal(engineC.deserialize(saved2).ok, true);
  assert.equal(engineC.getState().mode.sightHintMode, 'classic');
  assert.equal(engineC.getState().mode.culpritInputMode, 'streamlined');

  // Tampered checksum rejected
  const tamperedObj = JSON.parse(savedJson);
  tamperedObj.state.sharedWorld.deductionProgress = 3;
  const badLoad = engineB.deserialize(JSON.stringify(tamperedObj));
  assert.equal(badLoad.ok, false);
  assert.equal(badLoad.reason, 'CHECKSUM_MISMATCH');
});
