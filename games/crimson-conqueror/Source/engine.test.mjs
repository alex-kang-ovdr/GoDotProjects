import test from "node:test";
import assert from "node:assert/strict";

await import("../Web/data/game-data.js");
await import("../Web/engine.js");

const RANCE_DATA = globalThis.RANCE_DATA;
const Engine = globalThis.CrimsonConquerorEngine;

test("1. Bundled RANCE_DATA matches all Phase 2 canonical verified_data counts (52+ playable, 14 verified endings, 28 destinies, 28 scenarios)", () => {
  assert.equal(RANCE_DATA.factions.length, 10);
  assert.equal(RANCE_DATA.territories.length, 29);
  assert.equal(RANCE_DATA.unitClasses.length, 14);
  assert.equal(RANCE_DATA.characters.length, 69);
  const playable = RANCE_DATA.characters.filter((c) => c.isPlayableSubordinate);
  assert.ok(playable.length >= 52, `Expected >=52 playable commanders, got ${playable.length}`);
  assert.equal(playable.length, 59);
  assert.ok(RANCE_DATA.scenarioEvents.length >= 26);
  assert.equal(RANCE_DATA.scenarioEvents.length, 28);
  assert.equal(RANCE_DATA.endings.length, 14);
  assert.equal(
    RANCE_DATA.endings.filter((e) => e.evidenceLevel === "VERIFIED").length,
    14,
    "All 14 canonical main story endings must be VERIFIED"
  );
  assert.ok(RANCE_DATA.destinies.length >= 24);
  assert.equal(RANCE_DATA.destinies.length, 28);
  assert.equal(RANCE_DATA.dungeons.length, 4);

  const state = Engine.createInitialState(RANCE_DATA, { seed: 42 });
  assert.equal(Object.keys(state.territories).length, 29);
  assert.equal(Object.keys(state.factions).length, 10);
  assert.equal(Object.keys(state.commanders).length, 69);
  assert.equal(state.commanders.chr_cordoba.troops, 1000);
  assert.equal(state.weeklySlots.ninja, 5); // Kanami starts recruited (1 ninja * 5)
});

test("2. Weekly typed action slots enforce strict per-turn limits & reset on endTurn()", () => {
  const state = Engine.createInitialState(RANCE_DATA, { seed: 101 });

  // City slot: 1 per turn
  const tax1 = Engine.runCityAction(state, RANCE_DATA, "ter_leazas_castle", "tax");
  assert.equal(tax1.ok, true);
  assert.equal(state.weeklySlots.city, 0);
  const tax2 = Engine.runCityAction(state, RANCE_DATA, "ter_leazas_castle", "tax");
  assert.equal(tax2.ok, false);

  // Talk slot: 1 per turn
  const talk1 = Engine.runTalk(state, RANCE_DATA, "chr_kanami");
  assert.equal(talk1.ok, true);
  assert.equal(state.weeklySlots.talk, 0);
  assert.equal(Engine.runTalk(state, RANCE_DATA, "chr_maris").ok, false);

  // Reinforce / Draft mutually exclusive slot: 1 per turn
  const draft1 = Engine.runDraft(state, RANCE_DATA, "chr_rance");
  assert.equal(draft1.ok, true);
  assert.equal(state.weeklySlots.reinforceOrDraft, 0);
  assert.equal(Engine.runReinforce(state, RANCE_DATA, "chr_rance").ok, false);
  assert.equal(Engine.runDraft(state, RANCE_DATA, "chr_barres").ok, false);

  // Build slot: 1 per turn
  const build1 = Engine.runBuildFacility(state, RANCE_DATA, "ter_leazas_castle", "hospital");
  assert.equal(build1.ok, true);
  assert.equal(state.weeklySlots.build, 0);
  assert.equal(Engine.runBuildFacility(state, RANCE_DATA, "ter_leazas_castle", "library").ok, false);

  // Explore slot: 1 per turn
  const exp1 = Engine.runExplore(state, RANCE_DATA, "ter_leazas_castle");
  assert.equal(exp1.ok, true);
  assert.equal(state.weeklySlots.explore, 0);
  assert.equal(Engine.runExplore(state, RANCE_DATA, "ter_leazas_north").ok, false);

  // Ninja slot: 5 per alive ninja (Kanami = 5)
  for (let i = 0; i < 5; i++) {
    const nRes = Engine.runNinjaAction(state, RANCE_DATA, "ter_leazas_white_fort", "scout");
    assert.equal(nRes.ok, true);
  }
  assert.equal(state.weeklySlots.ninja, 0);
  assert.equal(Engine.runNinjaAction(state, RANCE_DATA, "ter_leazas_white_fort", "scout").ok, false);

  // Character Scenario slot: 1 per turn
  const scen1 = Engine.runScenarioEvent(state, RANCE_DATA, "evt_kanami_shinobu_assassination", 0);
  assert.equal(scen1.ok, true);
  assert.equal(state.weeklySlots.characterEvent, 0);

  // End Turn resets all slots & advances calendar
  const endRes = Engine.endTurn(state, RANCE_DATA);
  assert.equal(endRes.ok, true);
  assert.equal(state.turn, 2);
  assert.equal(Engine.formatCalendar(state.calendar), "LP 3/04/2");
  assert.deepEqual(state.weeklySlots, {
    city: 1,
    characterEvent: 1,
    talk: 1,
    reinforceOrDraft: 1,
    build: 1,
    explore: 1,
    ninja: 5,
    invasion: 1
  });
});

test("3. Adjacent territory invasion succeeds; non-adjacent & phase-locked invasions are rejected", () => {
  const state = Engine.createInitialState(RANCE_DATA, { seed: 777 });

  assert.equal(Engine.canInvade(state, "ter_volgo_z").ok, false);
  assert.equal(Engine.canInvade(state, "ter_leazas_white_fort").ok, true);

  const startRes = Engine.startInvasion(state, RANCE_DATA, "ter_leazas_white_fort", [
    "chr_rance",
    "chr_rick",
    "chr_cordoba",
    "chr_maris"
  ]);
  assert.equal(startRes.ok, true);
  Engine.autoResolveBattle(state, RANCE_DATA);

  assert.equal(state.territories.ter_leazas_white_fort.owner, "fac_leazas");
  assert.equal(state.campaignPhase, "HUMAN_REALM");
  assert.equal(state.commanders.chr_ex.recruited, true);
  assert.equal(state.weeklySlots.invasion, 0);

  Engine.endTurn(state, RANCE_DATA);
  assert.equal(Engine.canInvade(state, "ter_volgo_z").ok, true);
  assert.equal(Engine.canInvade(state, "ter_ice").ok, true);
  assert.equal(Engine.canInvade(state, "ter_lang_bau").ok, false);
  assert.equal(Engine.canInvade(state, "ter_japan_main").ok, false);
  assert.equal(Engine.canInvade(state, "ter_sulphur_forest").ok, false);
});

test("4. 4v4 tactical combat: lowest-troop-first order, front/back row targeting, Snipe formula & ninja demon immunity", () => {
  const mockUnits = [
    { unitKey: "P1", side: "PLAYER", slotIndex: 0, troops: 500, commanderHp: 20 },
    { unitKey: "E1", side: "ENEMY", slotIndex: 0, troops: 300, commanderHp: 20 },
    { unitKey: "P2", side: "PLAYER", slotIndex: 1, troops: 300, commanderHp: 20 },
    { unitKey: "P3", side: "PLAYER", slotIndex: 2, troops: 200, commanderHp: 20 },
    { unitKey: "E2", side: "ENEMY", slotIndex: 1, troops: 200, commanderHp: 20 }
  ];
  const order = [];
  const acted = new Set();
  while (true) {
    const next = Engine.selectNextActor(mockUnits, acted);
    if (!next) break;
    order.push(next.unitKey);
    acted.add(next.unitKey);
  }
  assert.deepEqual(order, ["P3", "E2", "P2", "E1", "P1"]);

  for (let i = 0; i < 50; i++) {
    const r = i / 50;
    const d15 = Engine.resolveSnipeDamage({ strikes: 15 }, () => r, 6);
    assert.ok(d15 >= 0 && d15 <= 3);
    const d40 = Engine.resolveSnipeDamage({ strikes: 40 }, () => r, 6);
    assert.ok(d40 >= 0 && d40 <= 6);
  }

  const state = Engine.createInitialState(RANCE_DATA, { seed: 2026 });
  state.commanders.chr_maris.troops = 50;
  state.commanders.chr_rance.troops = 60;
  const inv = Engine.startInvasion(state, RANCE_DATA, "ter_leazas_white_fort", [
    "chr_rance",
    "chr_cordoba",
    "chr_maris",
    "chr_kanami"
  ]);
  assert.equal(inv.ok, true);
  assert.equal(state.activeBattle.activeUnitKey, "PLAYER_chr_maris");

  const badMelee = Engine.executeBattleAction(state, RANCE_DATA, { type: "attack" });
  assert.equal(badMelee.ok, false);

  const goodMagic = Engine.executeBattleAction(state, RANCE_DATA, { type: "magic" });
  assert.equal(goodMagic.ok, true);
  assert.equal(goodMagic.retaliation, null);

  assert.equal(state.activeBattle.activeUnitKey, "PLAYER_chr_rance");
  assert.equal(Engine.executeBattleAction(state, RANCE_DATA, { type: "wait" }).ok, true);

  while (state.activeBattle && state.activeBattle.activeUnitKey !== "PLAYER_chr_rance") {
    Engine.stepBattleAiTurn(state, RANCE_DATA);
  }
  assert.ok(state.activeBattle);
  const backEnemy =
    state.activeBattle.units.find((u) => u.side === "ENEMY" && u.row === "BACK" && u.commanderHp > 0) ||
    state.activeBattle.units.find((u) => u.side === "ENEMY" && u.commanderHp > 0);
  const troopsBefore = backEnemy.troops;
  const snipeRes = Engine.executeBattleAction(state, RANCE_DATA, {
    type: "snipe",
    targetUnitKey: backEnemy.unitKey
  });
  assert.equal(snipeRes.ok, true);
  assert.equal(backEnemy.troops, troopsBefore);

  const demonState = Engine.createInitialState(RANCE_DATA, { seed: 3 });
  demonState.campaignPhase = "MONSTER_REALM";
  demonState.flags.monsterRealmOpen = true;
  demonState.territories.ter_helman_west.owner = "fac_leazas";
  demonState.commanders.chr_rance.troops = 50;
  const dInv = Engine.startInvasion(demonState, RANCE_DATA, "ter_maginot_line", ["chr_rance", "chr_rick"]);
  assert.equal(dInv.ok, true);
  const demonTarget = demonState.activeBattle.units.find((u) => u.side === "ENEMY" && u.classId === "cls_demons");
  assert.ok(demonTarget, "Maginot Line should field Demon units");
  const dAtk = Engine.executeBattleAction(demonState, RANCE_DATA, {
    type: "attack",
    targetUnitKey: demonTarget.unitKey
  });
  assert.equal(dAtk.ok, true);
  assert.equal(dAtk.result.ninjaProc, false);
});

test("5. Rance defeat (commanderHp == 0) immediately triggers end_death Game Over", () => {
  const state = Engine.createInitialState(RANCE_DATA, { seed: 99 });
  state.commanders.chr_rance.commanderHp = 1;
  state.commanders.chr_rance.troops = 0;
  const inv = Engine.startInvasion(state, RANCE_DATA, "ter_leazas_white_fort", ["chr_rance"]);
  assert.equal(inv.ok, true);

  Engine.autoResolveBattle(state, RANCE_DATA, 20);
  assert.equal(state.endingId, "end_death");
  assert.equal(state.commanders.chr_rance.alive, false);
});

test("6. Character scenarios, crisis timers & conquest triggers (Volgo Z, Zeth 4 Towers, Shizuka 5w, Haniwa King)", () => {
  const state = Engine.createInitialState(RANCE_DATA, { seed: 555 });
  Engine.startInvasion(state, RANCE_DATA, "ter_leazas_white_fort", ["chr_rance", "chr_rick", "chr_maris", "chr_kanami"]);
  Engine.autoResolveBattle(state, RANCE_DATA);
  assert.equal(state.timers.monsterRealmInvasion.active, true);
  assert.equal(state.timers.monsterRealmInvasion.remainingWeeks, 73);

  Engine.endTurn(state, RANCE_DATA);
  state.commanders.chr_rance.atk = 35;
  state.commanders.chr_rick.atk = 35;
  Engine.startInvasion(state, RANCE_DATA, "ter_volgo_z", ["chr_rance", "chr_rick", "chr_cordoba", "chr_barres"]);
  Engine.autoResolveBattle(state, RANCE_DATA);
  assert.equal(state.territories.ter_volgo_z.owner, "fac_leazas");
  assert.equal(state.flags.soulRescued, true);
  assert.equal(state.flags.sillRescued, true);
  assert.equal(state.commanders.chr_soul.recruited, true);
  assert.equal(state.commanders.chr_sill.recruited, true);
  assert.equal(state.timers.freyaSabotage.active, true);

  const freyaRes = Engine.runCityAction(state, RANCE_DATA, "ter_leazas_castle", "counter_freya");
  assert.equal(freyaRes.ok, true);
  assert.equal(state.commanders.chr_freya.recruited, true);
  assert.equal(Engine.countAliveRecruitedNinjas(state), 2);

  state.territories.ter_radil.owner = "fac_leazas";
  state.territories.ter_sasa_lake.owner = "fac_leazas";
  Engine.endTurn(state, RANCE_DATA);
  assert.equal(state.weeklySlots.ninja, 10);
  Engine.runCityAction(state, RANCE_DATA, "ter_radil", "tax");
  assert.equal(state.flags.aluminumAxeOwned, true);
  Engine.runScenarioEvent(state, RANCE_DATA, "evt_lake_sasa_haniwa_king", 0);
  assert.equal(state.flags.sasaDungeonOpen, true);
  Engine.runExplore(state, RANCE_DATA, "ter_sasa_lake");
  Engine.endTurn(state, RANCE_DATA);
  Engine.runExplore(state, RANCE_DATA, "ter_sasa_lake");
  assert.equal(state.commanders.chr_haniwa_king.recruited, true);

  Engine.runReinforce(state, RANCE_DATA, "chr_rance");

  state.territories.ter_custom.owner = "fac_leazas";
  const tapeStart = Engine.startInvasion(state, RANCE_DATA, "ter_tape", ["chr_rance", "chr_rick", "chr_haniwa_king", "chr_maris"]);
  assert.equal(tapeStart.ok, true);
  assert.equal(state.timers.zethShizukaDuel.active, true);
  Engine.autoResolveBattle(state, RANCE_DATA);
  assert.equal(state.territories.ter_tape.owner, "fac_leazas");
  let shizukaFired = false;
  for (let w = 0; w < 5; w++) {
    const tRes = Engine.endTurn(state, RANCE_DATA);
    assert.equal(tRes.ok, true);
    if (tRes.dueEvents.includes("evt_zeth_shizuka_duel_timer")) shizukaFired = true;
  }
  assert.equal(shizukaFired, true);
  assert.ok(state.activeScenarios.includes("evt_zeth_shizuka_duel_timer"));

  Engine.runReinforce(state, RANCE_DATA, "chr_rance");
  state.territories.ter_adam_stronghold.owner = "fac_leazas";
  state.territories.ter_amber_city.owner = "fac_leazas";
  state.territories.ter_old_zeth.garrisonTroops = 100;
  const zethStart = Engine.startInvasion(state, RANCE_DATA, "ter_old_zeth", ["chr_rance", "chr_rick", "chr_haniwa_king", "chr_maris"]);
  assert.equal(zethStart.ok, true);
  Engine.autoResolveBattle(state, RANCE_DATA);
  assert.equal(state.territories.ter_zeth_west.owner, "fac_leazas");
  assert.equal(state.factions.fac_zeth.defeated, true);
  assert.equal(state.commanders.chr_magic.recruited, true);
});

test("7. Multiple endings reachable: Unification, True Ending (Bliss), World King, Bandit King, Outer Space", () => {
  const sBandit = Engine.createInitialState(RANCE_DATA, { startPhase: "BANDIT_PROLOGUE", seed: 10 });
  Engine.runScenarioEvent(sBandit, RANCE_DATA, "evt_bandit_prologue_ruberan", 0);
  assert.equal(sBandit.endingId, "end_bandit_king");

  const sSpace = Engine.createInitialState(RANCE_DATA, { seed: 20 });
  sSpace.commanders.chr_maria.recruited = true;
  sSpace.gold = 30000;
  Engine.runBuildFacility(sSpace, RANCE_DATA, "ter_leazas_castle", "maria_lab");
  sSpace.flags.tulipProgress = 100;
  Engine.runScenarioEvent(sSpace, RANCE_DATA, "evt_maria_tulip_100", 0);
  assert.equal(sSpace.endingId, "end_to_outer_space");

  const sUni = Engine.createInitialState(RANCE_DATA, { seed: 30 });
  sUni.campaignPhase = "MONSTER_REALM";
  sUni.flags.monsterRealmOpen = true;
  sUni.flags.chaosSwordOwned = true;
  sUni.territories.ter_demon_frontier.owner = "fac_leazas";
  sUni.commanders.chr_rance.atk = 50;
  sUni.commanders.chr_rick.atk = 50;
  sUni.commanders.chr_kayblis.commanderHp = 5;
  sUni.commanders.chr_xavier.commanderHp = 5;
  Engine.startInvasion(sUni, RANCE_DATA, "ter_sulphur_forest", ["chr_rance", "chr_rick", "chr_cordoba", "chr_barres"]);
  Engine.autoResolveBattle(sUni, RANCE_DATA);
  assert.equal(sUni.endingId, "end_unification");

  const sBliss = Engine.createInitialState(RANCE_DATA, { seed: 40 });
  sBliss.campaignPhase = "MONSTER_REALM";
  sBliss.flags.monsterRealmOpen = true;
  sBliss.flags.chaosSwordOwned = true;
  sBliss.flags.sillAlive = true;
  sBliss.commanders.chr_sill.recruited = true;
  sBliss.commanders.chr_sill.alive = true;
  sBliss.commanders.chr_warg.recruited = true;
  sBliss.flags.wargSleepUnlocked = true;
  for (const t of Object.values(sBliss.territories)) {
    if (t.countsForCreatorConquest && t.id !== "ter_sulphur_forest") {
      t.owner = "fac_leazas";
    }
  }
  assert.notEqual(sBliss.territories.ter_shangri_la.owner, "fac_leazas");
  sBliss.commanders.chr_rance.atk = 55;
  sBliss.commanders.chr_rick.atk = 55;
  sBliss.commanders.chr_kayblis.commanderHp = 5;
  sBliss.commanders.chr_xavier.commanderHp = 5;

  Engine.startInvasion(sBliss, RANCE_DATA, "ter_sulphur_forest", ["chr_rance", "chr_rick", "chr_cordoba", "chr_barres"]);
  Engine.autoResolveBattle(sBliss, RANCE_DATA);
  assert.equal(sBliss.endingId, null);
  assert.equal(sBliss.campaignPhase, "CREATOR_PHASE");
  assert.equal(sBliss.territories.ter_rudrasaum_ruins.locked, false);

  Engine.runScenarioEvent(sBliss, RANCE_DATA, "evt_creator_phase_unlock", 0);
  assert.equal(sBliss.endingId, "end_bliss");

  const sExpired = Engine.createInitialState(RANCE_DATA, { seed: 50 });
  for (let i = 0; i < 40; i++) {
    Engine.endTurn(sExpired, RANCE_DATA);
  }
  assert.equal(sExpired.timers.volgoZSoul.status, "EXPIRED");
  assert.equal(sExpired.timers.volgoZSill.status, "EXPIRED");
  assert.equal(sExpired.flags.sillAlive, false);
  sExpired.campaignPhase = "CREATOR_PHASE";
  sExpired.flags.wargSleepUnlocked = true;
  sExpired.commanders.chr_warg.recruited = true;
  Engine.runScenarioEvent(sExpired, RANCE_DATA, "evt_creator_phase_unlock", 0);
  assert.equal(sExpired.endingId, "end_world_king");
});

test("8. Deterministic RNG & serialize/deserialize round-trip produce identical simulation outcomes", () => {
  const s1 = Engine.createInitialState(RANCE_DATA, { seed: 987654 });
  const s2 = Engine.createInitialState(RANCE_DATA, { seed: 987654 });

  Engine.runExplore(s1, RANCE_DATA, "ter_leazas_castle");
  Engine.runExplore(s2, RANCE_DATA, "ter_leazas_castle");
  assert.equal(s1.gold, s2.gold);
  assert.equal(s1.rngSeed, s2.rngSeed);
  assert.equal(s1.rngCallCount, s2.rngCallCount);

  const snapshot = Engine.serialize(s1);
  const s3 = Engine.deserialize(snapshot, RANCE_DATA);
  assert.deepEqual(s3, s1);

  const n1 = Engine.runNinjaAction(s1, RANCE_DATA, "ter_leazas_white_fort", "sabotage");
  const n3 = Engine.runNinjaAction(s3, RANCE_DATA, "ter_leazas_white_fort", "sabotage");
  assert.equal(n1.success, n3.success);
  assert.equal(s1.rngSeed, s3.rngSeed);

  Engine.startInvasion(s1, RANCE_DATA, "ter_leazas_white_fort", ["chr_rance", "chr_rick", "chr_cordoba"]);
  Engine.startInvasion(s3, RANCE_DATA, "ter_leazas_white_fort", ["chr_rance", "chr_rick", "chr_cordoba"]);
  Engine.autoResolveBattle(s1, RANCE_DATA);
  Engine.autoResolveBattle(s3, RANCE_DATA);

  assert.equal(s1.gold, s3.gold);
  assert.equal(s1.rngSeed, s3.rngSeed);
  assert.equal(s1.commanders.chr_rance.troops, s3.commanders.chr_rance.troops);
  assert.equal(s1.commanders.chr_rance.commanderHp, s3.commanders.chr_rance.commanderHp);
});

test("9. All remaining canonical endings reachable: end_assassinated, end_assassinated_2, end_poisoned, end_demon_king_1, end_demon_king_2, end_servant, end_god, end_defeat", () => {
  // Shinobu Assassination (1)
  const sAssn1 = Engine.createInitialState(RANCE_DATA, { seed: 61 });
  Engine.runScenarioEvent(sAssn1, RANCE_DATA, "evt_kanami_shinobu_assassination", 1);
  assert.equal(sAssn1.endingId, "end_assassinated");

  // Kanami / Code Assassination (2) — newly verified canonical slot!
  const sAssn2 = Engine.createInitialState(RANCE_DATA, { seed: 611 });
  Engine.runScenarioEvent(sAssn2, RANCE_DATA, "evt_kanami_shinobu_assassination", 2);
  assert.equal(sAssn2.endingId, "end_assassinated_2");

  // Saulnia Court Poison Trap without Sill -> end_poisoned (newly verified canonical slot!)
  const sPoison = Engine.createInitialState(RANCE_DATA, { seed: 612 });
  sPoison.flags.sillAlive = false;
  Engine.runScenarioEvent(sPoison, RANCE_DATA, "evt_saulnia_poison_trap_crisis", 1);
  assert.equal(sPoison.endingId, "end_poisoned");

  // Satella proposal -> end_demon_king_1
  const sDk1 = Engine.createInitialState(RANCE_DATA, { seed: 62 });
  Engine.runScenarioEvent(sDk1, RANCE_DATA, "evt_satella_proposal", 1);
  assert.equal(sDk1.endingId, "end_demon_king_1");

  // Miki forbidden awakening -> end_demon_king_2
  const sDk2 = Engine.createInitialState(RANCE_DATA, { seed: 63 });
  Engine.runScenarioEvent(sDk2, RANCE_DATA, "evt_miki_kentarou_demon_king_crisis", 1);
  assert.equal(sDk2.endingId, "end_demon_king_2");

  // Servant & God endings
  const sServant = Engine.createInitialState(RANCE_DATA, { seed: 65 });
  Engine.runScenarioEvent(sServant, RANCE_DATA, "evt_creator_phase_unlock", 1);
  assert.equal(sServant.endingId, "end_servant");

  const sGod = Engine.createInitialState(RANCE_DATA, { seed: 66 });
  Engine.runScenarioEvent(sGod, RANCE_DATA, "evt_creator_phase_unlock", 2);
  assert.equal(sGod.endingId, "end_god");

  // Leazas Castle lost -> end_defeat
  const sDefeat = Engine.createInitialState(RANCE_DATA, { seed: 64 });
  sDefeat.territories.ter_leazas_castle.owner = "fac_demon_kayblis";
  Engine.evaluateEndings(sDefeat, RANCE_DATA);
  assert.equal(sDefeat.endingId, "end_defeat");
});

test("10. Phase 2 Battle Tactic Selector (setBattleTactic) & Dynamic Combat Zone Gauge (combatZone)", () => {
  const sStd = Engine.createInitialState(RANCE_DATA, { seed: 303 });
  const sAtk = Engine.createInitialState(RANCE_DATA, { seed: 303 });

  sStd.commanders.chr_rance.troops = 100;
  sAtk.commanders.chr_rance.troops = 100;

  Engine.startInvasion(sStd, RANCE_DATA, "ter_leazas_white_fort", ["chr_rance", "chr_rick", "chr_cordoba"]);
  Engine.startInvasion(sAtk, RANCE_DATA, "ter_leazas_white_fort", ["chr_rance", "chr_rick", "chr_cordoba"]);

  assert.equal(sStd.activeBattle.tacticId, "standard");
  const initialZone = sAtk.activeBattle.combatZone;
  assert.ok(initialZone >= 20 && initialZone <= 80);

  // Switch tactic to all_out_assault (+30% ATK, -20% DEF)
  const tacRes = Engine.setBattleTactic(sAtk, RANCE_DATA, "all_out_assault");
  assert.equal(tacRes.ok, true);
  assert.equal(sAtk.activeBattle.tacticId, "all_out_assault");
  assert.equal(Engine.setBattleTactic(sAtk, RANCE_DATA, "invalid_tactic").ok, false);

  const resStd = Engine.executeBattleAction(sStd, RANCE_DATA, { type: "attack" });
  const resAtk = Engine.executeBattleAction(sAtk, RANCE_DATA, { type: "attack" });
  assert.equal(resStd.ok, true);
  assert.equal(resAtk.ok, true);
  assert.ok(
    resAtk.result.troopLoss > resStd.result.troopLoss,
    `all_out_assault (${resAtk.result.troopLoss}) should deal strictly more troop damage than standard (${resStd.result.troopLoss})`
  );
  assert.notEqual(sAtk.activeBattle.combatZone, initialZone, "combatZone gauge must shift dynamically after battle clash");

  // Test fortify & focused_strike tactics also switch cleanly
  assert.equal(Engine.setBattleTactic(sAtk, RANCE_DATA, "fortify").ok, true);
  assert.equal(Engine.setBattleTactic(sAtk, RANCE_DATA, "focused_strike").ok, true);
});

test("11. Phase 2 Post-Battle Enemy Commander Capture & Recruitment (recruit / release / ransom)", () => {
  const state = Engine.createInitialState(RANCE_DATA, { seed: 404 });
  state.commanders.chr_rance.atk = 32;
  state.commanders.chr_rick.atk = 32;

  // Conquer White Fort -> Ex auto-recruits, while Haurein & Melfeis are captured as POWs!
  Engine.startInvasion(state, RANCE_DATA, "ter_leazas_white_fort", ["chr_rance", "chr_rick", "chr_cordoba", "chr_maris"]);
  Engine.autoResolveBattle(state, RANCE_DATA);

  assert.equal(state.territories.ter_leazas_white_fort.owner, "fac_leazas");
  assert.ok(state.pendingCaptures.length >= 2, `Expected captured enemy commanders, got ${state.pendingCaptures}`);
  assert.ok(state.pendingCaptures.includes("chr_haurein"));
  assert.ok(state.pendingCaptures.includes("chr_melfeis"));

  // Recruit Haurein
  const rec = Engine.resolveCapture(state, RANCE_DATA, "chr_haurein", "recruit");
  assert.equal(rec.ok, true);
  assert.equal(state.commanders.chr_haurein.recruited, true);
  assert.equal(state.commanders.chr_haurein.captured, false);
  assert.ok(!state.pendingCaptures.includes("chr_haurein"));

  // Ransom Melfeis -> adds gold and removes from pendingCaptures
  const goldBefore = state.gold;
  const ran = Engine.resolveCapture(state, RANCE_DATA, "chr_melfeis", "ransom");
  assert.equal(ran.ok, true);
  assert.ok(state.gold > goldBefore);
  assert.equal(state.commanders.chr_melfeis.captured, false);

  // Conquer Helman East -> capture Hubert & Cream -> test release morale boost!
  Engine.endTurn(state, RANCE_DATA);
  Engine.startInvasion(state, RANCE_DATA, "ter_helman_east", ["chr_rance", "chr_rick", "chr_cordoba", "chr_barres"]);
  Engine.autoResolveBattle(state, RANCE_DATA);
  assert.ok(state.pendingCaptures.includes("chr_hubert"));
  state.morale = 70;
  const rel = Engine.resolveCapture(state, RANCE_DATA, "chr_hubert", "release");
  assert.equal(rel.ok, true);
  assert.equal(state.morale, 74);
});

test("12. Phase 2 Multi-Floor Dungeon Expedition (B66F Haniwa King, Zeth Magic Tower, Custom Labyrinth & Rudrasaum Ruins)", () => {
  const state = Engine.createInitialState(RANCE_DATA, { seed: 808 });
  // Unlock Lake Sasa B66F via Radil tax Aluminum Axe
  state.territories.ter_radil.owner = "fac_leazas";
  state.territories.ter_sasa_lake.owner = "fac_leazas";
  state.territories.ter_custom.owner = "fac_leazas";
  state.territories.ter_zeth_west.owner = "fac_leazas";
  Engine.runCityAction(state, RANCE_DATA, "ter_radil", "tax");
  assert.equal(state.flags.aluminumAxeOwned, true);

  // Start B66F Haniwa King multi-floor dungeon!
  const startSasa = Engine.startDungeon(state, RANCE_DATA, "dng_sasa_b66", ["chr_rance", "chr_rick", "chr_cordoba", "chr_barres"]);
  assert.equal(startSasa.ok, true);
  assert.equal(state.activeDungeon.totalFloors, 5);
  assert.equal(state.activeDungeon.readyForBoss, false);

  // Advance floor-by-floor until B66F boss room
  while (!state.activeDungeon.readyForBoss) {
    const adv = Engine.advanceDungeonFloor(state, RANCE_DATA);
    assert.equal(adv.ok, true);
  }
  assert.equal(state.activeDungeon.currentFloorIndex, 4);
  assert.equal(state.activeDungeon.readyForBoss, true);

  // Fight Haniwa King boss -> awards relic_haniwa_crown & recruits chr_haniwa_king!
  const bossRes = Engine.fightDungeonBoss(state, RANCE_DATA);
  assert.equal(bossRes.ok, true);
  assert.equal(bossRes.victory, true);
  assert.equal(state.activeDungeon, null);
  assert.equal(state.commanders.chr_haniwa_king.recruited, true);
  assert.ok(state.relics.some((r) => r.id === "relic_haniwa_crown"));

  // Next turn: delve Zeth Magic Tower -> recruits Rizna & grants Archmage Staff + Chaos Sword!
  Engine.endTurn(state, RANCE_DATA);
  assert.equal(Engine.startDungeon(state, RANCE_DATA, "dng_zeth_magic_tower").ok, true);
  while (!state.activeDungeon.readyForBoss) Engine.advanceDungeonFloor(state, RANCE_DATA);
  const zethBoss = Engine.fightDungeonBoss(state, RANCE_DATA);
  assert.equal(zethBoss.victory, true);
  assert.equal(state.commanders.chr_rizna.recruited, true);
  assert.equal(state.flags.chaosSwordOwned, true);
  assert.ok(state.relics.some((r) => r.id === "relic_archmage_staff"));

  // Next turn: delve Rudrasaum Ruins in Creator Phase -> queues evt_creator_phase_unlock!
  Engine.endTurn(state, RANCE_DATA);
  state.campaignPhase = "CREATOR_PHASE";
  state.territories.ter_rudrasaum_ruins.locked = false;
  assert.equal(Engine.startDungeon(state, RANCE_DATA, "dng_rudrasaum_ruins").ok, true);
  while (!state.activeDungeon.readyForBoss) Engine.advanceDungeonFloor(state, RANCE_DATA);
  const creatorBoss = Engine.fightDungeonBoss(state, RANCE_DATA);
  assert.equal(creatorBoss.victory, true);
  assert.ok(state.relics.some((r) => r.id === "relic_creator_seal"));
  assert.ok(state.activeScenarios.includes("evt_creator_phase_unlock"));
});

test("13. Phase 2 Diplomacy Actions (truce / alliance / declare_war) control AI behavior & scenario unlocks", () => {
  const state = Engine.createInitialState(RANCE_DATA, { seed: 909 });
  state.campaignPhase = "HUMAN_REALM";
  state.gold = 30000;

  // Cannot negotiate truce with Ex Rebellion or Demon Kayblis
  assert.equal(Engine.negotiateFaction(state, RANCE_DATA, "fac_ex_rebellion", "truce").ok, false);
  assert.equal(Engine.negotiateFaction(state, RANCE_DATA, "fac_demon_kayblis", "truce").ok, false);

  // Negotiate 4-turn Truce with Helman -> blocks invasion of Volgo Z & freezes Helman war reinforcement
  const truceRes = Engine.negotiateFaction(state, RANCE_DATA, "fac_helman", "truce");
  assert.equal(truceRes.ok, true);
  assert.equal(state.factions.fac_helman.diplomaticRelation, "TRUCE");
  assert.equal(state.factions.fac_helman.truceTurns, 4);
  assert.equal(Engine.canInvade(state, "ter_volgo_z").ok, false);

  // Negotiate Alliance with AL Church -> unlocks Gawain/Cafe scenario + +600G/turn passive trade!
  const allyRes = Engine.negotiateFaction(state, RANCE_DATA, "fac_al_church", "alliance");
  assert.equal(allyRes.ok, true);
  assert.equal(state.factions.fac_al_church.diplomaticRelation, "ALLIANCE");
  assert.ok(state.activeScenarios.includes("evt_al_church_gawain_cafe_relics"));

  // Advance 1 turn -> truce ticks down to 3
  Engine.endTurn(state, RANCE_DATA);
  assert.equal(state.factions.fac_helman.truceTurns, 3);

  // Declare War on Helman -> breaks truce immediately, triggers Freya sabotage & re-enables Volgo Z invasion!
  const warRes = Engine.negotiateFaction(state, RANCE_DATA, "fac_helman", "declare_war");
  assert.equal(warRes.ok, true);
  assert.equal(state.factions.fac_helman.diplomaticRelation, "WAR");
  assert.equal(state.factions.fac_helman.truceTurns, 0);
  assert.equal(state.timers.freyaSabotage.active, true);
  assert.equal(Engine.canInvade(state, "ter_volgo_z").ok, true);
});

test("14. Phase 2 Live Character Destiny Evaluator tracks 28 characters across HAPPY / NEUTRAL / UNHAPPY transitions", () => {
  const state = Engine.createInitialState(RANCE_DATA, { seed: 1212 });
  const initial = Engine.evaluateDestinies(state, RANCE_DATA);
  assert.equal(initial.length, 28);

  const byId = (list, cid) => list.find((d) => d.characterId === cid);
  assert.equal(byId(initial, "chr_sill").status, "NEUTRAL");
  assert.equal(byId(initial, "chr_kanami").status, "NEUTRAL");

  // Complete Kanami reward scenario -> Kanami flips HAPPY!
  Engine.runScenarioEvent(state, RANCE_DATA, "evt_kanami_shinobu_assassination", 0);
  // Build Hospital + recruit Maria & Mill + build Maria Lab -> Maria & Mill flip HAPPY!
  state.gold = 40000;
  Engine.runBuildFacility(state, RANCE_DATA, "ter_leazas_castle", "hospital");
  state.commanders.chr_maria.recruited = true;
  state.commanders.chr_mill.recruited = true;
  state.weeklySlots.build = 1;
  Engine.runBuildFacility(state, RANCE_DATA, "ter_leazas_castle", "maria_lab");

  // Somita recruited with 2 battles -> HAPPY; with 5 battles -> UNHAPPY!
  state.commanders.chr_somita.recruited = true;
  state.commanders.chr_somita.battlesFought = 2;

  // Sill rescued -> HAPPY!
  state.flags.sillRescued = true;
  state.flags.sillAlive = true;
  state.commanders.chr_sill.recruited = true;
  state.commanders.chr_sill.imprisoned = false;

  const mid = Engine.evaluateDestinies(state, RANCE_DATA);
  assert.equal(byId(mid, "chr_kanami").status, "HAPPY");
  assert.equal(byId(mid, "chr_maria").status, "HAPPY");
  assert.equal(byId(mid, "chr_mill").status, "HAPPY");
  assert.equal(byId(mid, "chr_somita").status, "HAPPY");
  assert.equal(byId(mid, "chr_sill").status, "HAPPY");

  // Trigger Somita over-deployment & Sill death -> flip to UNHAPPY!
  state.commanders.chr_somita.battlesFought = 6;
  state.flags.sillAlive = false;
  state.commanders.chr_sill.alive = false;

  const late = Engine.evaluateDestinies(state, RANCE_DATA);
  assert.equal(byId(late, "chr_somita").status, "UNHAPPY");
  assert.equal(byId(late, "chr_sill").status, "UNHAPPY");
});

test("15. All 59 playable commanders have complete stat profiles & explicit verified/reconstructed tags", () => {
  const state = Engine.createInitialState(RANCE_DATA, { seed: 2027 });
  const playables = Object.values(state.commanders).filter((c) => c.isPlayableSubordinate);
  assert.equal(playables.length, 59);
  for (const c of playables) {
    assert.ok(c.maxCommanderHp >= 10, `${c.id} missing valid HP`);
    assert.ok(c.maxTroops >= 200, `${c.id} missing valid maxTroops`);
    assert.ok(c.atk >= 4 && c.def >= 4 && c.mag >= 3, `${c.id} missing valid combat stats`);
    assert.ok(["FRONT", "BACK"].includes(c.row), `${c.id} invalid row`);
    assert.ok(
      ["VERIFIED_PUBLIC_PROFILE", "BALANCED_RECONSTRUCTION"].includes(c.statsBasis),
      `${c.id} missing statsBasis tag`
    );
  }
});
