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

describe('YU-NO SSOT Bundle & Headless A.D.M.S. Engine', () => {
  it('loads all verified_data entities with exact SSOT counts', () => {
    assert.equal(YUNO_DATA.characters.length, 20);
    assert.equal(YUNO_DATA.locations.length, 27);
    assert.equal(YUNO_DATA.nodes.length, 35);
    assert.equal(YUNO_DATA.jewels.length, 10);
    assert.equal(YUNO_DATA.items.length, 17);
    assert.equal(YUNO_DATA.items.filter((i) => i.carries_across_timelines).length, 14);
    assert.equal(YUNO_DATA.items.filter((i) => !i.carries_across_timelines).length, 3);
    assert.equal(YUNO_DATA.globalFlags.length, 11);
    assert.equal(YUNO_DATA.localFlags.length, 12);
    assert.equal(YUNO_DATA.crossRouteTransfers.length, 5);
    assert.equal(YUNO_DATA.routes.length, 9);
    assert.equal(YUNO_DATA.endings.length, 9);
  });

  it('supports PC-98 (8 slots) and Remake (10 slots) edition modes & jewel capacity invariants', () => {
    const pc98 = new YunoEngine(YUNO_DATA, { edition: 'pc98_8jewels' });
    assert.equal(pc98.globalState.jewelCapacity, 8);
    assert.equal(pc98.globalState.availableJewels, 2);
    assert.equal(pc98.getJewelSlots().length, 8);

    const remake = new YunoEngine(YUNO_DATA, { edition: 'remake_10jewels' });
    assert.equal(remake.globalState.jewelCapacity, 10);
    assert.equal(remake.globalState.availableJewels, 4);
    assert.equal(remake.getJewelSlots().length, 10);

    // Place 3 jewels in Remake mode -> switching down to PC-98 (only 2 available total) must fail safely
    assert.equal(remake.placeJewel().ok, true);
    assert.equal(remake.advanceToNode('node_day1_hub').ok, true);
    assert.equal(remake.placeJewel().ok, true);
    assert.equal(remake.advanceToNode('node_school_day1_gate').ok, true);
    assert.equal(remake.placeJewel().ok, true);
    assert.equal(remake.globalState.availableJewels, 1);

    const shrinkFail = remake.setEdition('pc98_8jewels');
    assert.equal(shrinkFail.ok, false);

    // Retrieve 1 jewel -> now 2 placed, shrinking to PC-98 succeeds with 0 available
    assert.equal(remake.retrieveJewel('node_prologue_start').ok, true);
    const shrinkOk = remake.setEdition('pc98_8jewels');
    assert.equal(shrinkOk.ok, true);
    assert.equal(remake.globalState.jewelCapacity, 8);
    assert.equal(remake.globalState.availableJewels, 0);
  });

  it('handles jewel placement, exhaustion, Reflector Jump state partition, and remote retrieval', () => {
    const eng = new YunoEngine(YUNO_DATA, { edition: 'pc98_8jewels' });

    assert.equal(eng.advanceToNode('node_day1_hub').ok, true);
    assert.equal(eng.placeJewel().ok, true);
    assert.equal(eng.globalState.availableJewels, 1);

    // Overwriting existing jewel on the same node costs 0 extra jewels
    const overwrite = eng.placeJewel();
    assert.equal(overwrite.ok, true);
    assert.equal(overwrite.overwritten, true);
    assert.equal(eng.globalState.availableJewels, 1);

    // Advance to Jewel #1 drawer -> collects light jewel #1 (+1 available)
    assert.equal(eng.advanceToNode('node_jewel1_drawer').ok, true);
    assert.deepEqual(eng.globalState.collectedLightJewels, ['jewel_found_1']);
    assert.equal(eng.globalState.availableJewels, 2);
    assert.ok(eng.localState.localFlags.includes('flag_local_manual_unread'));

    // Place 2 more jewels to exhaust availableJewels
    assert.equal(eng.placeJewel().ok, true);
    assert.equal(eng.advanceToNode('node_school_day1_gate').ok, true);
    assert.equal(eng.placeJewel().ok, true);
    assert.equal(eng.globalState.availableJewels, 0);

    // Advance to Eriko branch and try placing with 0 jewels -> must fail
    assert.equal(eng.advanceToNode('node_eriko_branch').ok, true);
    assert.equal(eng.placeJewel().ok, false);

    // Remote retrieval reclaims 1 jewel without moving currentNodeId
    const ret = eng.retrieveJewel('node_jewel1_drawer');
    assert.equal(ret.ok, true);
    assert.equal(eng.localState.currentNodeId, 'node_eriko_branch');
    assert.equal(eng.globalState.availableJewels, 1);

    // Reflector Jump back to Day 1 Hub:
    // - localState restores (flag_local_manual_unread is GONE!)
    // - globalState persists (jewel_found_1, item_kanna_student_id, discoveredNodes KEPT!)
    const jump = eng.jumpToJewel('node_day1_hub');
    assert.equal(jump.ok, true);
    assert.equal(jump.reclaimedJewel, true);
    assert.equal(eng.localState.currentNodeId, 'node_day1_hub');
    assert.equal(eng.localState.localFlags.includes('flag_local_manual_unread'), false);
    assert.ok(eng.globalState.collectedLightJewels.includes('jewel_found_1'));
    assert.ok(eng.globalState.carriedItems.includes('item_kanna_student_id'));
    assert.ok(eng.globalState.discoveredNodes.includes('node_eriko_branch'));
    assert.equal(eng.globalState.availableJewels, 2);
  });

  it('recovers from Vortex Dead-Ends (Mitsuki rope trap & Kanna crisis bad end) via Reflector Jump', () => {
    const eng = new YunoEngine(YUNO_DATA, { edition: 'pc98_8jewels' });
    assert.equal(eng.advanceToNode('node_day1_hub').ok, true);
    assert.equal(eng.advanceToNode('node_school_day1_gate').ok, true);
    assert.equal(eng.placeJewel().ok, true); // anchor at school gate

    // 1. Mitsuki Storehouse Rope Lockout Vortex
    assert.equal(eng.advanceToNode('node_mitsuki_call').ok, true);
    assert.equal(eng.placeJewel().ok, true); // anchor before trap
    assert.equal(eng.advanceToNode('node_mitsuki_rope_lockout').ok, true);
    assert.equal(eng.localState.isVortexDeadEnd, true);
    assert.ok(eng.localState.localFlags.includes('flag_local_storehouse_wall_first'));
    assert.ok(eng.globalState.unlockedEndings.includes('end_dead_storehouse_lockout'));
    assert.equal(eng.placeJewel().ok, false); // cannot place jewel inside Vortex dead-end

    // Jump back to node_mitsuki_call -> local trap flag cleared, global ending record preserved!
    assert.equal(eng.jumpToJewel('node_mitsuki_call').ok, true);
    assert.equal(eng.localState.isVortexDeadEnd, false);
    assert.equal(eng.localState.localFlags.includes('flag_local_storehouse_wall_first'), false);
    assert.ok(eng.globalState.unlockedEndings.includes('end_dead_storehouse_lockout'));

    // Now take the safe storehouse path -> Jewel #2 + Rope + Silver Medal
    const safeRes = eng.advanceToNode('node_mitsuki_storehouse');
    assert.equal(safeRes.ok, true);
    assert.ok(eng.globalState.carriedItems.includes('item_silver_medal'));
    assert.ok(eng.globalState.collectedLightJewels.includes('jewel_found_2'));

    // 2. Kanna Crisis without Chounenseki -> rescue gate locked, trap leads to Vortex
    assert.equal(eng.jumpToJewel('node_school_day1_gate', { keepPlaced: true }).ok, true);
    assert.equal(eng.advanceToNode('node_kanna_rooftop').ok, true);
    assert.equal(eng.advanceToNode('node_kanna_crisis_gate').ok, true);
    const transitions = eng.getAvailableTransitions();
    const saveEdge = transitions.find((t) => t.to === 'node_kanna_end');
    assert.equal(saveEdge.unlocked, false);
    assert.ok(saveEdge.missingItems.some((m) => m.id === 'item_chounenseki'));
    assert.ok(saveEdge.lockReasons.some((r) => r.includes('초념석')));

    assert.equal(eng.advanceToNode('node_kanna_bad_no_stone').ok, true);
    assert.equal(eng.localState.isVortexDeadEnd, true);
    assert.ok(eng.globalState.unlockedEndings.includes('end_dead_kanna_no_stone'));

    // Recover from Kanna Vortex via Reflector Jump
    assert.equal(eng.jumpToJewel('node_school_day1_gate').ok, true);
    assert.equal(eng.localState.isVortexDeadEnd, false);
  });

  it('executes the cross-route inheritance chain via useItem (Blue Card -> Chounenseki -> Study Key -> Day 1 Clock Jewel #6)', () => {
    const eng = new YunoEngine(YUNO_DATA, { edition: 'pc98_8jewels' });

    // Pin Day 1 Hub (preserves flag_local_study_early_luggage_intact)
    assert.equal(eng.advanceToNode('node_day1_hub').ok, true);
    assert.equal(eng.placeJewel().ok, true);

    // Pin School Gate
    assert.equal(eng.advanceToNode('node_school_day1_gate').ok, true);
    assert.equal(eng.placeJewel().ok, true);

    // Ayumi Route -> Blue Card
    assert.equal(eng.advanceToNode('node_ayumi_branch').ok, true);
    assert.equal(eng.advanceToNode('node_ayumi_blue_card').ok, true);
    assert.ok(eng.globalState.carriedItems.includes('item_blue_card'));

    // Jump to School Gate (keep anchor) -> Kaori Gate -> use Blue Card -> Chounenseki + Jewel #4
    assert.equal(eng.jumpToJewel('node_school_day1_gate', { keepPlaced: true }).ok, true);
    assert.equal(eng.advanceToNode('node_kaori_branch').ok, true);
    assert.equal(eng.advanceToNode('node_kaori_gate_blue_card').ok, true);

    const inspectGate = eng.inspectLocation();
    assert.equal(inspectGate.ok, true);
    assert.ok(inspectGate.text.includes('블루 카드'));

    const useBlue = eng.useItem('item_blue_card');
    assert.equal(useBlue.ok, true);
    assert.equal(useBlue.action, 'advance');
    assert.equal(eng.localState.currentNodeId, 'node_kaori_infiltrate_lab');
    assert.ok(eng.globalState.carriedItems.includes('item_chounenseki'));
    assert.ok(eng.globalState.collectedLightJewels.includes('jewel_found_4'));

    // Jump to School Gate -> Kanna Crisis -> use Chounenseki -> Kanna End + Study Key!
    assert.equal(eng.jumpToJewel('node_school_day1_gate', { keepPlaced: true }).ok, true);
    assert.equal(eng.advanceToNode('node_kanna_rooftop').ok, true);
    assert.ok(eng.localState.localItems.includes('item_kanna_necklace'));
    assert.equal(eng.advanceToNode('node_kanna_crisis_gate').ok, true);

    const useStone = eng.useItem('item_chounenseki');
    assert.equal(useStone.ok, true);
    assert.equal(eng.localState.currentNodeId, 'node_kanna_end');
    assert.ok(eng.globalState.carriedItems.includes('item_study_key'));

    // Jump back to Day 1 Hub -> local Kanna necklace is reset, global Study Key is carried!
    assert.equal(eng.jumpToJewel('node_day1_hub').ok, true);
    assert.equal(eng.localState.localItems.includes('item_kanna_necklace'), false);
    assert.ok(eng.localState.localFlags.includes('flag_local_study_early_luggage_intact'));
    assert.ok(eng.globalState.carriedItems.includes('item_study_key'));

    // Use Study Key on Day 1 Hub -> unlocks Study -> use Study Key on Clock 6->3 -> Jewel #6!
    const openStudy = eng.useItem('item_study_key');
    assert.equal(openStudy.ok, true);
    assert.equal(eng.localState.currentNodeId, 'node_study_unlock');
    assert.ok(eng.globalState.globalFlags.includes('flag_global_study_unlocked'));

    const solveClock = eng.useItem('item_study_key');
    assert.equal(solveClock.ok, true);
    assert.equal(eng.localState.currentNodeId, 'node_study_clock_puzzle');
    assert.ok(eng.globalState.collectedLightJewels.includes('jewel_found_6'));
    assert.ok(eng.localState.localFlags.includes('flag_local_clock_6_3_solved'));

    // Convergence MUST still be locked here because not all 6 light jewels & 6 heroine routes are done!
    const convEdge = eng.getAvailableTransitions().find((t) => t.to === 'node_convergence_cave');
    assert.equal(convEdge.unlocked, false);
    assert.ok(convEdge.missingJewelCount > 0);
    assert.ok(convEdge.missingGlobalFlags.length > 0);
  });

  it('enforces YU-NO consumption non-recovery paradox rule across Reflector Jumps', () => {
    const eng = new YunoEngine(YUNO_DATA, { edition: 'pc98_8jewels' });
    assert.equal(eng.advanceToNode('node_day1_hub').ok, true);
    assert.equal(eng.advanceToNode('node_school_day1_gate').ok, true);
    assert.equal(eng.advanceToNode('node_mitsuki_call').ok, true);
    assert.equal(eng.advanceToNode('node_mitsuki_storehouse').ok, true);
    assert.ok(eng.globalState.carriedItems.includes('item_silver_medal'));

    // Save Jewel AFTER acquiring silver medal, then consume silver medal
    assert.equal(eng.placeJewel().ok, true);
    assert.equal(eng.consumeItem('item_silver_medal').ok, true);
    assert.equal(eng.globalState.carriedItems.includes('item_silver_medal'), false);
    assert.ok(eng.globalState.consumedItems.includes('item_silver_medal'));

    // Jumping back to that snapshot must NOT restore the consumed global item
    assert.equal(eng.jumpToJewel('node_mitsuki_storehouse').ok, true);
    assert.equal(eng.globalState.carriedItems.includes('item_silver_medal'), false);
  });

  it('completes a full PC-98 playthrough: all 6 light jewels -> 6 routes -> Convergence -> Dela Grante -> True Ending', () => {
    const eng = new YunoEngine(YUNO_DATA, { edition: 'pc98_8jewels' });

    // 1. Prologue -> Day 1 Hub (place Jewel #1) -> Drawer Jewel #1 -> School Gate (place Jewel #2)
    assert.equal(eng.advanceToNode('node_day1_hub').ok, true);
    assert.equal(eng.placeJewel().ok, true);
    assert.equal(eng.advanceToNode('node_jewel1_drawer').ok, true); // Jewel #1
    assert.equal(eng.advanceToNode('node_school_day1_gate').ok, true);
    assert.equal(eng.placeJewel().ok, true);

    // 2. Mitsuki Route -> Jewel #2 + Silver Medal + Mitsuki End
    assert.equal(eng.advanceToNode('node_mitsuki_call').ok, true);
    assert.equal(eng.advanceToNode('node_mitsuki_storehouse').ok, true); // Jewel #2
    assert.equal(eng.advanceToNode('node_mitsuki_end').ok, true);
    assert.equal(eng.jumpToJewel('node_school_day1_gate', { keepPlaced: true }).ok, true);

    // 3. Ayumi Route -> Jewel #3 + Blue Card + Ayumi End
    assert.equal(eng.advanceToNode('node_ayumi_branch').ok, true);
    assert.equal(eng.advanceToNode('node_ayumi_jewel3_mountain').ok, true); // Jewel #3
    assert.equal(eng.advanceToNode('node_ayumi_blue_card').ok, true);
    assert.equal(eng.advanceToNode('node_ayumi_end').ok, true);
    assert.equal(eng.jumpToJewel('node_school_day1_gate', { keepPlaced: true }).ok, true);

    // 4. Kaori Route (Blue Card inherited) -> Jewel #4 + Chounenseki + Kaori End
    assert.equal(eng.advanceToNode('node_kaori_branch').ok, true);
    assert.equal(eng.advanceToNode('node_kaori_gate_blue_card').ok, true);
    assert.equal(eng.advanceToNode('node_kaori_infiltrate_lab').ok, true); // Jewel #4
    assert.equal(eng.advanceToNode('node_kaori_end').ok, true);
    assert.equal(eng.jumpToJewel('node_school_day1_gate', { keepPlaced: true }).ok, true);

    // 5. Mio Route (Yuki partner -> Jewel #5; Silver Medal + Chounenseki inherited -> Mio End)
    assert.equal(eng.advanceToNode('node_mio_branch').ok, true);
    assert.equal(eng.advanceToNode('node_mio_cave_yuki').ok, true); // Jewel #5
    assert.equal(eng.advanceToNode('node_mio_cave_puzzle').ok, true);
    assert.equal(eng.advanceToNode('node_mio_end').ok, true);
    assert.equal(eng.jumpToJewel('node_school_day1_gate', { keepPlaced: true }).ok, true);

    // 6. Eriko Route -> Eriko End
    assert.equal(eng.advanceToNode('node_eriko_branch').ok, true);
    assert.equal(eng.advanceToNode('node_eriko_end').ok, true);
    assert.equal(eng.jumpToJewel('node_school_day1_gate', { keepPlaced: true }).ok, true);

    // 7. Kanna Route (Chounenseki inherited) -> Kanna End + Study Key
    assert.equal(eng.advanceToNode('node_kanna_rooftop').ok, true);
    assert.equal(eng.advanceToNode('node_kanna_crisis_gate').ok, true);
    assert.equal(eng.advanceToNode('node_kanna_end').ok, true);

    // 8. Jump back to Day 1 Hub -> Study Unlock -> Clock 6->3 (Jewel #6!) -> Convergence!
    assert.equal(eng.jumpToJewel('node_day1_hub').ok, true);
    assert.equal(eng.advanceToNode('node_study_unlock').ok, true);
    assert.equal(eng.advanceToNode('node_study_clock_puzzle').ok, true); // Jewel #6

    assert.equal(eng.globalState.collectedLightJewels.length, 6);
    assert.equal(eng.getTotalCollectedJewels(), 8); // PC-98 max 8/8!
    assert.ok(eng.globalState.globalFlags.includes('flag_global_all_jewels_collected'));

    // All 5 cross-route inheritance chains must now be completed!
    const transfers = eng.getInheritanceStatus();
    assert.equal(transfers.length, 5);
    assert.ok(transfers.every((t) => t.status === 'completed'));

    // 9. Enter Convergence Cave -> Dela Grante Isekai Arc
    assert.equal(eng.advanceToNode('node_convergence_cave').ok, true);
    assert.ok(eng.globalState.globalFlags.includes('flag_global_epilogue_unlocked'));
    assert.equal(eng.advanceToNode('node_dg_arrival').ok, true);

    // Verify A.D.M.S. Reflector is strictly sealed inside Dela Grante!
    assert.equal(eng.isIsekaiLocked(), true);
    assert.equal(eng.placeJewel().ok, false);
    assert.equal(eng.jumpToJewel('node_school_day1_gate').ok, false);
    assert.equal(eng.retrieveJewel('node_school_day1_gate').ok, false);

    // 10. Progress through all 5 Dela Grante stages -> True Ending!
    assert.equal(eng.advanceToNode('node_dg_frontier_yuno').ok, true);
    assert.ok(eng.localState.localItems.includes('item_sacred_stone_dg'));
    assert.equal(eng.advanceToNode('node_dg_desert_trek').ok, true);
    assert.equal(eng.advanceToNode('node_dg_underground_capital').ok, true);
    assert.equal(eng.advanceToNode('node_dg_sanctuary_climax').ok, true);
    assert.ok(eng.localState.localItems.includes('item_entrusted_light'));

    const finalStep = eng.useItem('item_entrusted_light');
    assert.equal(finalStep.ok, true);
    assert.equal(eng.localState.currentNodeId, 'node_true_end');
    assert.equal(eng.localState.isEnding, true);
    assert.ok(eng.globalState.globalFlags.includes('flag_global_true_ending_clear'));
    assert.ok(eng.globalState.unlockedEndings.includes('end_true_yuno'));
  });

  it('maintains deterministic save/load serialization round-trip fidelity', () => {
    const eng = new YunoEngine(YUNO_DATA, { edition: 'remake_10jewels' });
    assert.equal(eng.advanceToNode('node_day1_hub').ok, true);
    assert.equal(eng.placeJewel().ok, true);
    assert.equal(eng.advanceToNode('node_jewel1_drawer').ok, true);
    assert.equal(eng.advanceToNode('node_school_day1_gate').ok, true);
    assert.equal(eng.placeJewel().ok, true);
    assert.equal(eng.advanceToNode('node_ayumi_branch').ok, true);
    assert.equal(eng.advanceToNode('node_ayumi_blue_card').ok, true);
    assert.equal(eng.inspectLocation().ok, true);

    const serialized = eng.serialize();
    const restored = YunoEngine.deserialize(serialized, YUNO_DATA);

    assert.equal(restored.serialize(), serialized);
    assert.deepEqual(restored.globalState, eng.globalState);
    assert.deepEqual(restored.localState, eng.localState);

    // Subsequent deterministic action yields identical snapshot
    const r1 = eng.jumpToJewel('node_school_day1_gate');
    const r2 = restored.jumpToJewel('node_school_day1_gate');
    assert.deepEqual(r1, r2);
    assert.equal(restored.serialize(), eng.serialize());
  });

  it('validates PlayHub manifest, offline Web assets, DOM ID wiring, and 35-node graph coverage', () => {
    const manifest = JSON.parse(readFileSync(join(gameRoot, 'game.manifest.json'), 'utf8'));
    assert.equal(manifest.id, 'yu-no');
    assert.equal(manifest.slug, 'yu-no');
    assert.equal(manifest.entry, 'index.html');
    assert.equal(manifest.version, '1.0.0');
    assert.equal(manifest.media.cover, 'assets/cover.svg');
    assert.equal(manifest.updatedOn, '2026-11-22');

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

    // Every single one of the 35 A.D.M.S. nodes has graph layout coordinates & narrative script
    const eng = new YunoEngine(YUNO_DATA);
    for (const node of YUNO_DATA.nodes) {
      assert.ok(appJs.includes(`${node.id}:`), `Missing NODE_POS entry in app.js for ${node.id}`);
      const beat = eng.getNarrativeBeat(node.id);
      assert.ok(beat.speaker && beat.dialogue && beat.inspect, `Missing narrative beat for ${node.id}`);
    }
  });
});
