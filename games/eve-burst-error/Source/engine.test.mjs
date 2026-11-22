#!/usr/bin/env node
/**
 * EVE burst error — Multi-Sight Dual-Perspective Engine Automated Test Suite
 *
 * Verifies:
 * 1. Verified data loading & initial Day 0 staggered start (Marina only, Kojiro locked by SB_01).
 * 2. Strict epistemic & inventory isolation between Kojiro and Marina (zero leakage pre-convergence).
 * 3. Location access control (kojiro / marina / both).
 * 4. All 8 Sync Barriers (SB_01 ~ SB_08) enforce blocking until partner emits cross-causal event,
 *    including explicit testing of the Dec 6 DBMS Level-7 deadlock double-lock (SB_05 -> SB_06).
 * 5. Complete dual-perspective walkthrough from M_D0_01 through all 16 scenes to C_D6_01 Convergence
 *    (plus reverse arrival order at SB_08).
 * 6. Finale Culprit Deduction: Korean/Japanese/English canonical culprit -> END_TRUE_RESCUE;
 *    wrong culprit -> END_BAD_WRONG_CULPRIT; lethal crisis choice -> END_GAMEOVER_FATAL_CHOICE + checkpoint retry.
 * 7. Save/load serialization round-trip determinism & checksum tamper rejection.
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

// Load classic browser-compatible UMD bundles in an isolated VM context (mirrors browser file:// load!)
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

// Helper: execute all required investigative steps for the active protagonist's current scene
function completeActiveSceneObjectives(engine) {
  const prog = engine.getSceneProgress();
  for (const step of prog.remainingSteps) {
    const [verb, targetId] = step.split(':');
    const res = engine.executeCommand(verb, targetId);
    assert.equal(res.ok, true, `Expected ${verb}:${targetId} to succeed in ${prog.sceneId}, got ${JSON.stringify(res)}`);
  }
  assert.equal(engine.getSceneProgress().readyToAdvance, true, `Scene ${prog.sceneId} should be ready to advance`);
}

// Helper: play through the canonical golden path up to a target barrier or convergence
function advanceToConvergence(engine, { reverseFinalOrder = false } = {}) {
  // 1. Marina Day 0: M_D0_01 -> M_D0_02 (unlocks SB_01, hits SB_02)
  completeActiveSceneObjectives(engine);
  let adv = engine.advanceScene();
  assert.equal(adv.ok, true);
  assert.equal(adv.nextSceneId, 'M_D0_02');

  completeActiveSceneObjectives(engine);
  adv = engine.advanceScene();
  assert.equal(adv.ok, true);
  assert.equal(adv.stalled, true);
  assert.equal(adv.blockedByBarrier.id, 'SB_02');

  // 2. Switch to Kojiro Day 1: K_D1_01 (unlocks SB_02) -> K_D1_02 (hits SB_03)
  assert.equal(engine.executeCommand('SIGHT_CHANGE').ok, true);
  assert.equal(engine.getActiveProtagonist(), 'kojiro');

  completeActiveSceneObjectives(engine);
  adv = engine.advanceScene();
  assert.equal(adv.ok, true);
  assert.equal(adv.nextSceneId, 'K_D1_02');

  completeActiveSceneObjectives(engine);
  adv = engine.advanceScene();
  assert.equal(adv.ok, true);
  assert.equal(adv.stalled, true);
  assert.equal(adv.blockedByBarrier.id, 'SB_03');

  // 3. Switch to Marina Day 1-2: M_D1_01 -> M_D2_01 (unlocks SB_03, hits SB_04)
  assert.equal(engine.executeCommand('SIGHT_CHANGE').ok, true);
  assert.equal(engine.getActiveProtagonist(), 'marina');
  assert.equal(engine.getCurrentScene().id, 'M_D1_01');

  completeActiveSceneObjectives(engine);
  adv = engine.advanceScene();
  assert.equal(adv.nextSceneId, 'M_D2_01');

  completeActiveSceneObjectives(engine);
  adv = engine.advanceScene();
  assert.equal(adv.stalled, true);
  assert.equal(adv.blockedByBarrier.id, 'SB_04');

  // 4. Switch to Kojiro Day 2-3: K_D2_01 -> K_D3_01 (unlocks SB_04, hits SB_05)
  assert.equal(engine.executeCommand('SIGHT_CHANGE').ok, true);
  assert.equal(engine.getCurrentScene().id, 'K_D2_01');

  completeActiveSceneObjectives(engine);
  adv = engine.advanceScene();
  assert.equal(adv.nextSceneId, 'K_D3_01');

  completeActiveSceneObjectives(engine);
  adv = engine.advanceScene();
  assert.equal(adv.stalled, true);
  assert.equal(adv.blockedByBarrier.id, 'SB_05');

  // 5. Switch to Marina Day 3-4: M_D3_01 -> M_D4_01 (unlocks SB_05, hits SB_06 DBMS Level-7 Deadlock!)
  assert.equal(engine.executeCommand('SIGHT_CHANGE').ok, true);
  assert.equal(engine.getCurrentScene().id, 'M_D3_01');

  completeActiveSceneObjectives(engine);
  adv = engine.advanceScene();
  assert.equal(adv.nextSceneId, 'M_D4_01');

  completeActiveSceneObjectives(engine);
  adv = engine.advanceScene();
  assert.equal(adv.stalled, true);
  assert.equal(adv.blockedByBarrier.id, 'SB_06');

  // 6. Switch to Kojiro Day 4: K_D4_01 (DBMS simultaneous access unlocks SB_06, hits SB_07)
  assert.equal(engine.executeCommand('SIGHT_CHANGE').ok, true);
  assert.equal(engine.getCurrentScene().id, 'K_D4_01');

  completeActiveSceneObjectives(engine);
  adv = engine.advanceScene();
  assert.equal(adv.stalled, true);
  assert.equal(adv.blockedByBarrier.id, 'SB_07');

  // 7. Switch to Marina Day 4: M_D4_02 (C Project + Kouno hostage escape unlocks SB_07 -> M_D5_01)
  assert.equal(engine.executeCommand('SIGHT_CHANGE').ok, true);
  assert.equal(engine.getCurrentScene().id, 'M_D4_02');

  completeActiveSceneObjectives(engine);
  adv = engine.advanceScene();
  assert.equal(adv.nextSceneId, 'M_D5_01');

  if (reverseFinalOrder) {
    // Finish Marina M_D5_01 first -> hits SB_08
    completeActiveSceneObjectives(engine);
    adv = engine.advanceScene();
    assert.equal(adv.stalled, true);
    assert.equal(adv.blockedByBarrier.id, 'SB_08');

    // Switch to Kojiro K_D4_02 -> K_D5_01 -> unlocks SB_08 -> Converges to C_D6_01!
    assert.equal(engine.executeCommand('SIGHT_CHANGE').ok, true);
    assert.equal(engine.getCurrentScene().id, 'K_D4_02');
    completeActiveSceneObjectives(engine);
    adv = engine.advanceScene();
    assert.equal(adv.nextSceneId, 'K_D5_01');

    completeActiveSceneObjectives(engine);
    adv = engine.advanceScene();
    assert.equal(adv.converged, true);
    assert.equal(adv.nextSceneId, 'C_D6_01');
  } else {
    // Switch to Kojiro K_D4_02 -> K_D5_01 (hits SB_08)
    assert.equal(engine.executeCommand('SIGHT_CHANGE').ok, true);
    assert.equal(engine.getCurrentScene().id, 'K_D4_02');

    completeActiveSceneObjectives(engine);
    adv = engine.advanceScene();
    assert.equal(adv.nextSceneId, 'K_D5_01');

    completeActiveSceneObjectives(engine);
    adv = engine.advanceScene();
    assert.equal(adv.stalled, true);
    assert.equal(adv.blockedByBarrier.id, 'SB_08');

    // Switch back to Marina M_D5_01 -> unlocks SB_08 -> Converges to C_D6_01!
    assert.equal(engine.executeCommand('SIGHT_CHANGE').ok, true);
    assert.equal(engine.getCurrentScene().id, 'M_D5_01');
    completeActiveSceneObjectives(engine);
    adv = engine.advanceScene();
    assert.equal(adv.converged, true);
    assert.equal(adv.nextSceneId, 'C_D6_01');
  }
}

test('SSOT bundle matches verified_data canonical counts', () => {
  assert.equal(EVE_DATA.characters.length, 18);
  assert.equal(EVE_DATA.locations.length, 14);
  assert.equal(EVE_DATA.scenes.length, 16);
  assert.equal(EVE_DATA.syncBarriers.length, 8);
  assert.equal(EVE_DATA.clues.length, 12);
  assert.equal(EVE_DATA.items.length, 12);
  assert.equal(EVE_DATA.endings.length, 4);
});

test('TC-MS-01 & TC-MS-02: Day 0 blocks SIGHT_CHANGE until M_D0_02 unlocks SB_01', () => {
  const engine = EveEngine.createEngine(EVE_DATA);
  const initial = engine.getState();

  assert.equal(initial.activeProtagonist, 'marina');
  assert.equal(initial.protagonists.marina.currentSceneId, 'M_D0_01');
  assert.equal(initial.protagonists.kojiro.blockedByBarrierId, 'SB_01');

  // Cannot SIGHT_CHANGE during M_D0_01
  assert.equal(engine.canSightChange().allowed, false);
  const denied1 = engine.executeCommand('SIGHT_CHANGE');
  assert.equal(denied1.ok, false);
  assert.equal(engine.getActiveProtagonist(), 'marina');

  // Advance M_D0_01 -> M_D0_02; still Day 0 locked
  completeActiveSceneObjectives(engine);
  engine.advanceScene();
  assert.equal(engine.getCurrentScene().id, 'M_D0_02');
  assert.equal(engine.canSightChange().allowed, false);

  // Complete M_D0_02 -> emits evt_marina_day0_setup -> unlocks SB_01, blocks Marina at SB_02
  completeActiveSceneObjectives(engine);
  const adv = engine.advanceScene();
  assert.equal(adv.stalled, true);
  assert.equal(adv.blockedByBarrier.id, 'SB_02');

  const st = engine.getState();
  assert.ok(st.sharedWorld.unlockedBarriers.includes('SB_01'));
  assert.equal(st.protagonists.kojiro.blockedByBarrierId, null);
  assert.equal(engine.canSightChange().allowed, true);

  // SIGHT_CHANGE now succeeds and lands on Kojiro K_D1_01
  const sw = engine.executeCommand('SIGHT_CHANGE');
  assert.equal(sw.ok, true);
  assert.equal(sw.activeProtagonist, 'kojiro');
  assert.equal(engine.getCurrentScene().id, 'K_D1_01');
});

test('TC-IA-01 & TC-IA-02: Strict inventory, clue, location, and alias isolation pre-convergence', () => {
  const engine = EveEngine.createEngine(EVE_DATA);

  // Play Marina through M_D0_01 -> M_D0_02
  completeActiveSceneObjectives(engine);
  engine.advanceScene();
  completeActiveSceneObjectives(engine);
  engine.advanceScene();

  // Marina now holds handgun, badge, faculty ID; Kojiro holds nothing
  let st = engine.getState();
  assert.ok(st.protagonists.marina.inventory.includes('item_ikuiku_handgun'));
  assert.ok(st.protagonists.marina.inventory.includes('item_jcia_badge'));
  assert.ok(st.protagonists.marina.inventory.includes('item_yale_faculty_id'));
  assert.equal(st.protagonists.kojiro.inventory.length, 0);

  // Switch to Kojiro K_D1_01 -> K_D1_02
  engine.executeCommand('SIGHT_CHANGE');

  // Kojiro CANNOT use Marina's handgun
  const illegalItem = engine.executeCommand('ITEM', 'item_ikuiku_handgun');
  assert.equal(illegalItem.ok, false);
  assert.equal(illegalItem.reason, 'ITEM_NOT_IN_INVENTORY');

  // Kojiro CANNOT move to Marina-only location (loc_jcia_hq)
  const illegalMove = engine.executeCommand('MOVE', 'loc_jcia_hq');
  assert.equal(illegalMove.ok, false);
  assert.equal(illegalMove.reason, 'LOCATION_ACCESS_DENIED');

  // Kojiro sees Dib under disguised alias '스트르만=코우 (위장)' before K_D3_01
  const dibBefore = engine.getCharacterView('dib', 'kojiro');
  assert.equal(dibBefore.displayName, '스트르만=코우 (위장)');
  assert.equal(dibBefore.isRevealed, false);

  completeActiveSceneObjectives(engine);
  engine.advanceScene(); // K_D1_02
  completeActiveSceneObjectives(engine);
  engine.advanceScene(); // hits SB_03

  // Switch to Marina -> M_D1_01 -> M_D2_01 (acquires clue_suzuki_alias & school seal half)
  engine.executeCommand('SIGHT_CHANGE');
  // Marina CANNOT use Kojiro's painting photo
  const marinaIllegalItem = engine.executeCommand('ITEM', 'item_painting_photo');
  assert.equal(marinaIllegalItem.ok, false);
  assert.equal(marinaIllegalItem.reason, 'ITEM_NOT_IN_INVENTORY');

  // Marina CANNOT move to Kojiro-only location (loc_amagi_agency)
  const marinaIllegalMove = engine.executeCommand('MOVE', 'loc_amagi_agency');
  assert.equal(marinaIllegalMove.ok, false);
  assert.equal(marinaIllegalMove.reason, 'LOCATION_ACCESS_DENIED');

  completeActiveSceneObjectives(engine);
  engine.advanceScene(); // M_D2_01
  completeActiveSceneObjectives(engine);
  engine.advanceScene(); // unlocks SB_03, hits SB_04

  st = engine.getState();
  // Marina has clue_suzuki_alias and item_national_seal_half_marina
  assert.ok(st.protagonists.marina.knownClues.includes('clue_suzuki_alias'));
  assert.ok(st.protagonists.marina.inventory.includes('item_national_seal_half_marina'));
  // Kojiro does NOT have clue_suzuki_alias or Marina's seal half (ZERO LEAKAGE!)
  assert.equal(st.protagonists.kojiro.knownClues.includes('clue_suzuki_alias'), false);
  assert.equal(st.protagonists.kojiro.inventory.includes('item_national_seal_half_marina'), false);

  // Switch to Kojiro and run THINK — must NOT leak '스즈키' or '디렉터룸'
  engine.executeCommand('SIGHT_CHANGE');
  const kojiroThink = engine.executeCommand('THINK', 'situation');
  assert.equal(kojiroThink.ok, true);
  assert.equal(kojiroThink.text.includes('스즈키'), false);
  assert.equal(kojiroThink.text.includes('디렉터룸'), false);

  // Verify character alias asymmetry for Genzaburo Katsuragi
  const genKojiro = engine.getCharacterView('genzaburo_katsuragi', 'kojiro');
  const genMarina = engine.getCharacterView('genzaburo_katsuragi', 'marina');
  assert.equal(genKojiro.displayName, '카츠라기 겐자부로');
  assert.equal(genMarina.displayName, '스즈키 겐자부로');

  // Player's omniscient asymmetry matrix shows clues discovered across BOTH sides as unshared!
  const matrix = engine.getAsymmetryMatrix();
  const suzukiRow = matrix.find((r) => r.id === 'clue_suzuki_alias');
  assert.ok(suzukiRow, 'clue_suzuki_alias should appear in asymmetry matrix');
  assert.equal(suzukiRow.knownByMarina, true);
  assert.equal(suzukiRow.knownByKojiro, false);
  assert.equal(suzukiRow.shared, false);
  assert.ok(suzukiRow.playerOmniscientTruth.includes('동일 인물'));
});

test('TC-MS-03 & TC-MS-04: Dec 6 DBMS Level-7 Deadlock double-lock (SB_05 -> SB_06) enforces cross-causal breakthrough', () => {
  const engine = EveEngine.createEngine(EVE_DATA);

  // Advance up to Kojiro blocked by SB_05 (after K_D3_01)
  completeActiveSceneObjectives(engine);
  engine.advanceScene(); // M_D0_02
  completeActiveSceneObjectives(engine);
  engine.advanceScene(); // SB_01 unlocked, Marina blocked SB_02
  engine.executeCommand('SIGHT_CHANGE'); // K_D1_01
  completeActiveSceneObjectives(engine);
  engine.advanceScene(); // K_D1_02
  completeActiveSceneObjectives(engine);
  engine.advanceScene(); // Kojiro blocked SB_03
  engine.executeCommand('SIGHT_CHANGE'); // M_D1_01
  completeActiveSceneObjectives(engine);
  engine.advanceScene(); // M_D2_01
  completeActiveSceneObjectives(engine);
  engine.advanceScene(); // SB_03 unlocked, Marina blocked SB_04
  engine.executeCommand('SIGHT_CHANGE'); // K_D2_01
  completeActiveSceneObjectives(engine);
  engine.advanceScene(); // K_D3_01
  completeActiveSceneObjectives(engine);
  const k3Adv = engine.advanceScene(); // SB_04 unlocked, Kojiro blocked SB_05
  assert.equal(k3Adv.blockedByBarrier.id, 'SB_05');

  // Kojiro cannot force past SB_05
  const kBlockedRetry = engine.advanceScene();
  assert.equal(kBlockedRetry.ok, false);
  assert.equal(kBlockedRetry.reason, 'BLOCKED_BY_SYNC_BARRIER');
  assert.equal(kBlockedRetry.barrier.id, 'SB_05');

  // Switch to Marina -> M_D3_01 -> M_D4_01 (DBMS Level-7!)
  engine.executeCommand('SIGHT_CHANGE');
  completeActiveSceneObjectives(engine);
  engine.advanceScene(); // M_D4_01
  assert.equal(engine.getCurrentScene().id, 'M_D4_01');

  completeActiveSceneObjectives(engine);
  const m4Adv = engine.advanceScene();
  assert.equal(m4Adv.stalled, true);
  assert.equal(m4Adv.blockedByBarrier.id, 'SB_06');

  // Verify SB_05 is now unlocked while SB_06 is strictly LOCKED
  let st = engine.getState();
  assert.ok(st.sharedWorld.unlockedBarriers.includes('SB_05'));
  assert.equal(st.sharedWorld.unlockedBarriers.includes('SB_06'), false);
  assert.equal(st.protagonists.marina.blockedByBarrierId, 'SB_06');
  assert.equal(st.protagonists.kojiro.blockedByBarrierId, null);
  assert.equal(st.protagonists.kojiro.currentSceneId, 'K_D4_01');

  // Marina CANNOT break past SB_06 alone!
  const marinaRetry = engine.advanceScene();
  assert.equal(marinaRetry.ok, false);
  assert.equal(marinaRetry.reason, 'BLOCKED_BY_SYNC_BARRIER');
  assert.equal(marinaRetry.barrier.id, 'SB_06');

  // Switch to Kojiro K_D4_01 -> execute simultaneous DBMS access using item_dbms_access_credential
  engine.executeCommand('SIGHT_CHANGE');
  assert.equal(engine.getCurrentScene().id, 'K_D4_01');
  completeActiveSceneObjectives(engine);
  const k4Adv = engine.advanceScene();
  assert.equal(k4Adv.stalled, true);
  assert.equal(k4Adv.blockedByBarrier.id, 'SB_07');

  // Verify SB_06 is now UNLOCKED and cross-causal log captured it, unblocking Marina into M_D4_02!
  st = engine.getState();
  assert.ok(st.sharedWorld.unlockedBarriers.includes('SB_06'));
  assert.ok(st.sharedWorld.crossCausalLog.some((e) => e.barrierId === 'SB_06'));
  assert.equal(st.protagonists.marina.blockedByBarrierId, null);
  assert.equal(st.protagonists.marina.currentSceneId, 'M_D4_02');

  // Switch back to Marina and proceed cleanly in M_D4_02
  engine.executeCommand('SIGHT_CHANGE');
  assert.equal(engine.getCurrentScene().id, 'M_D4_02');
});

test('Complete 16-scene dual-perspective walkthrough to C_D6_01 Convergence (both arrival orders)', () => {
  for (const reverseFinalOrder of [false, true]) {
    const engine = EveEngine.createEngine(EVE_DATA);
    advanceToConvergence(engine, { reverseFinalOrder });

    const st = engine.getState();
    assert.equal(st.sharedWorld.converged, true);
    assert.equal(st.sharedWorld.unlockedBarriers.length, 8);
    for (let i = 1; i <= 8; i++) {
      assert.ok(st.sharedWorld.unlockedBarriers.includes(`SB_0${i}`), `SB_0${i} should be unlocked`);
    }
    assert.equal(st.protagonists.kojiro.currentSceneId, 'C_D6_01');
    assert.equal(st.protagonists.marina.currentSceneId, 'C_D6_01');
    assert.equal(st.protagonists.kojiro.locationId, 'loc_tristan_hold');
    assert.equal(st.protagonists.marina.locationId, 'loc_tristan_hold');

    // SIGHT_CHANGE is permanently locked at Convergence
    assert.equal(engine.canSightChange().allowed, false);
    assert.equal(engine.canSightChange().reason, 'CONVERGENCE_LOCK');

    // All 12 clues merged and shared at convergence!
    const matrix = engine.getAsymmetryMatrix();
    assert.equal(matrix.length, 12);
    assert.ok(matrix.every((row) => row.shared === true && row.knownByKojiro && row.knownByMarina));

    // Both protagonists hold shared oxygen cylinders
    assert.ok(st.protagonists.kojiro.inventory.includes('item_oxygen_cylinders'));
    assert.ok(st.protagonists.marina.inventory.includes('item_oxygen_cylinders'));
  }
});

test('TC-END-01 & TC-END-02: Culprit deduction accepts multilingual canonical answers and rejects wrong culprits', () => {
  const validInputs = ['미도 마야코', '御堂真弥子', '마야코', 'Mayako Mido', 'みどう まやこ', 'MAYAKO'];
  for (const raw of validInputs) {
    const engine = EveEngine.createEngine(EVE_DATA);
    advanceToConvergence(engine);
    const res = engine.submitCulprit(raw);
    assert.equal(res.ok, true);
    assert.equal(res.correct, true, `Expected "${raw}" to be accepted`);
    assert.equal(res.endingId, 'END_TRUE_RESCUE');
    assert.equal(engine.getState().sharedWorld.endingId, 'END_TRUE_RESCUE');
  }

  // Wrong culprits -> END_BAD_WRONG_CULPRIT
  const wrongInputs = ['로스=미도', 'ロス＝御堂', '디브', 'ディーブ', '카츠라기 겐자부로', ''];
  for (const raw of wrongInputs) {
    const engine = EveEngine.createEngine(EVE_DATA);
    advanceToConvergence(engine);
    const res = engine.submitCulprit(raw);
    assert.equal(res.ok, true);
    assert.equal(res.correct, false, `Expected "${raw}" to be rejected`);
    assert.equal(res.endingId, 'END_BAD_WRONG_CULPRIT');
  }
});

test('Lethal crisis mistake triggers END_GAMEOVER_FATAL_CHOICE and checkpoint retry recovers cleanly', () => {
  const engine = EveEngine.createEngine(EVE_DATA);

  // Play up to Marina M_D4_02 (Kagawa inquiry crisis)
  completeActiveSceneObjectives(engine);
  engine.advanceScene();
  completeActiveSceneObjectives(engine);
  engine.advanceScene();
  engine.executeCommand('SIGHT_CHANGE');
  completeActiveSceneObjectives(engine);
  engine.advanceScene();
  completeActiveSceneObjectives(engine);
  engine.advanceScene();
  engine.executeCommand('SIGHT_CHANGE');
  completeActiveSceneObjectives(engine);
  engine.advanceScene();
  completeActiveSceneObjectives(engine);
  engine.advanceScene();
  engine.executeCommand('SIGHT_CHANGE');
  completeActiveSceneObjectives(engine);
  engine.advanceScene();
  completeActiveSceneObjectives(engine);
  engine.advanceScene();
  engine.executeCommand('SIGHT_CHANGE');
  completeActiveSceneObjectives(engine);
  engine.advanceScene();
  completeActiveSceneObjectives(engine);
  engine.advanceScene();
  engine.executeCommand('SIGHT_CHANGE');
  completeActiveSceneObjectives(engine);
  engine.advanceScene();
  engine.executeCommand('SIGHT_CHANGE');
  assert.equal(engine.getCurrentScene().id, 'M_D4_02');

  // Choose lethal surrender option
  const fatalRes = engine.executeCommand('CRISIS', 'fatal_surrender_kagawa');
  assert.equal(fatalRes.ok, true);
  assert.equal(fatalRes.fatal, true);
  assert.equal(fatalRes.endingId, 'END_GAMEOVER_FATAL_CHOICE');
  assert.equal(engine.getState().sharedWorld.endingId, 'END_GAMEOVER_FATAL_CHOICE');

  // Retry from checkpoint restores M_D4_02 cleanly
  const retry = engine.retryFromCheckpoint();
  assert.equal(retry.ok, true);
  assert.equal(engine.getState().sharedWorld.endingId, null);
  assert.equal(engine.getCurrentScene().id, 'M_D4_02');

  // Now resolve safely with handgun
  const safeRes = engine.executeCommand('CRISIS', 'safe_hostage_escape');
  assert.equal(safeRes.ok, true);
  assert.equal(engine.getState().sharedWorld.endingId, null);
});

test('TC-SAV-01: Save/load serialization round-trip preserves exact dual state & rejects tampered checksum', () => {
  const engineA = EveEngine.createEngine(EVE_DATA);

  // Reach the iconic DBMS Level-7 deadlock state (SB_05 unlocked, SB_06 locked)
  completeActiveSceneObjectives(engineA);
  engineA.advanceScene();
  completeActiveSceneObjectives(engineA);
  engineA.advanceScene();
  engineA.executeCommand('SIGHT_CHANGE');
  completeActiveSceneObjectives(engineA);
  engineA.advanceScene();
  completeActiveSceneObjectives(engineA);
  engineA.advanceScene();
  engineA.executeCommand('SIGHT_CHANGE');
  completeActiveSceneObjectives(engineA);
  engineA.advanceScene();
  completeActiveSceneObjectives(engineA);
  engineA.advanceScene();
  engineA.executeCommand('SIGHT_CHANGE');
  completeActiveSceneObjectives(engineA);
  engineA.advanceScene();
  completeActiveSceneObjectives(engineA);
  engineA.advanceScene();
  engineA.executeCommand('SIGHT_CHANGE');
  completeActiveSceneObjectives(engineA);
  engineA.advanceScene();
  completeActiveSceneObjectives(engineA);
  engineA.advanceScene();

  const stateBefore = engineA.getState();
  const savedJson = engineA.serialize();

  // Deserialize into a brand-new engine instance
  const engineB = EveEngine.createEngine(EVE_DATA);
  const loadRes = engineB.deserialize(savedJson);
  assert.equal(loadRes.ok, true);

  const stateAfter = engineB.getState();
  assert.deepEqual(stateAfter, stateBefore);
  assert.equal(stateAfter.activeProtagonist, 'marina');
  assert.equal(stateAfter.protagonists.marina.blockedByBarrierId, 'SB_06');
  assert.equal(stateAfter.protagonists.kojiro.currentSceneId, 'K_D4_01');
  assert.ok(stateAfter.sharedWorld.unlockedBarriers.includes('SB_05'));
  assert.equal(stateAfter.sharedWorld.unlockedBarriers.includes('SB_06'), false);

  // Verify tampered save is rejected by checksum
  const tamperedObj = JSON.parse(savedJson);
  tamperedObj.state.sharedWorld.unlockedBarriers.push('SB_06');
  const badLoad = engineB.deserialize(JSON.stringify(tamperedObj));
  assert.equal(badLoad.ok, false);
  assert.equal(badLoad.reason, 'CHECKSUM_MISMATCH');
});

test('All 8 Sync Barriers (SB_01~SB_08) block progression until partner event unlocks them and populate crossCausalLog', () => {
  const engine = EveEngine.createEngine(EVE_DATA);
  const encounteredBlocks = [];

  // SB_01 blocks Kojiro initially
  assert.equal(engine.checkSyncBarrier('kojiro').blocked, true);
  assert.equal(engine.checkSyncBarrier('kojiro').barrier.id, 'SB_01');
  encounteredBlocks.push('SB_01');

  // Step through all scenes, confirming every barrier SB_02..SB_08 blocks the active protagonist before switching
  completeActiveSceneObjectives(engine);
  engine.advanceScene(); // -> M_D0_02
  completeActiveSceneObjectives(engine);
  let adv = engine.advanceScene(); // unlocks SB_01, hits SB_02
  assert.equal(adv.blockedByBarrier.id, 'SB_02');
  encounteredBlocks.push('SB_02');

  engine.executeCommand('SIGHT_CHANGE'); // Kojiro K_D1_01
  completeActiveSceneObjectives(engine);
  engine.advanceScene(); // unlocks SB_02 -> K_D1_02
  completeActiveSceneObjectives(engine);
  adv = engine.advanceScene(); // hits SB_03
  assert.equal(adv.blockedByBarrier.id, 'SB_03');
  encounteredBlocks.push('SB_03');

  engine.executeCommand('SIGHT_CHANGE'); // Marina M_D1_01
  completeActiveSceneObjectives(engine);
  engine.advanceScene(); // -> M_D2_01
  completeActiveSceneObjectives(engine);
  adv = engine.advanceScene(); // unlocks SB_03, hits SB_04
  assert.equal(adv.blockedByBarrier.id, 'SB_04');
  encounteredBlocks.push('SB_04');

  engine.executeCommand('SIGHT_CHANGE'); // Kojiro K_D2_01
  completeActiveSceneObjectives(engine);
  engine.advanceScene(); // -> K_D3_01
  completeActiveSceneObjectives(engine);
  adv = engine.advanceScene(); // unlocks SB_04, hits SB_05
  assert.equal(adv.blockedByBarrier.id, 'SB_05');
  encounteredBlocks.push('SB_05');

  engine.executeCommand('SIGHT_CHANGE'); // Marina M_D3_01
  completeActiveSceneObjectives(engine);
  engine.advanceScene(); // -> M_D4_01
  completeActiveSceneObjectives(engine);
  adv = engine.advanceScene(); // unlocks SB_05, hits SB_06
  assert.equal(adv.blockedByBarrier.id, 'SB_06');
  encounteredBlocks.push('SB_06');

  engine.executeCommand('SIGHT_CHANGE'); // Kojiro K_D4_01
  completeActiveSceneObjectives(engine);
  adv = engine.advanceScene(); // unlocks SB_06, hits SB_07
  assert.equal(adv.blockedByBarrier.id, 'SB_07');
  encounteredBlocks.push('SB_07');

  engine.executeCommand('SIGHT_CHANGE'); // Marina M_D4_02
  completeActiveSceneObjectives(engine);
  engine.advanceScene(); // unlocks SB_07 -> M_D5_01

  engine.executeCommand('SIGHT_CHANGE'); // Kojiro K_D4_02
  // Also test K_D4_02 fatal Dib ambush + checkpoint recovery!
  const fatalDib = engine.executeCommand('CRISIS', 'fatal_charge_dib_unarmed');
  assert.equal(fatalDib.endingId, 'END_GAMEOVER_FATAL_CHOICE');
  assert.equal(engine.retryFromCheckpoint().ok, true);

  completeActiveSceneObjectives(engine);
  engine.advanceScene(); // -> K_D5_01
  completeActiveSceneObjectives(engine);
  adv = engine.advanceScene(); // hits SB_08
  assert.equal(adv.blockedByBarrier.id, 'SB_08');
  encounteredBlocks.push('SB_08');

  // Verify Classic vs Modern THINK barrier hint mode
  engine.setMode({ sightHintMode: 'modern' });
  const modernThink = engine.executeCommand('THINK', 'barrier');
  assert.ok(modernThink.text.includes('SB_08'));

  engine.setMode({ sightHintMode: 'classic' });
  const classicThink = engine.executeCommand('THINK', 'barrier');
  assert.equal(classicThink.text.includes('SB_08'), false);

  // Switch to Marina M_D5_01 -> unlocks SB_08 -> Converges
  engine.executeCommand('SIGHT_CHANGE');
  completeActiveSceneObjectives(engine);
  adv = engine.advanceScene();
  assert.equal(adv.converged, true);

  assert.deepEqual(encounteredBlocks, ['SB_01', 'SB_02', 'SB_03', 'SB_04', 'SB_05', 'SB_06', 'SB_07', 'SB_08']);
  const st = engine.getState();
  assert.equal(st.sharedWorld.crossCausalLog.length, 8);

  // Timeline graph reflects 16 scenes and 8 unlocked barriers
  const graph = engine.getTimelineGraph();
  assert.equal(graph.nodes.length, 16);
  assert.equal(graph.barriers.length, 8);
  assert.ok(graph.barriers.every((b) => b.unlocked === true));
});

