import test from "node:test";
import assert from "node:assert/strict";

await import("../Web/data/game-data.js");
await import("../Web/engine.js");

const RANCE_DATA = globalThis.RANCE_DATA;
const Engine = globalThis.KichikuouRanceEngine;

test("1. Bundled RANCE_DATA matches all canonical verified_data counts", () => {
  assert.equal(RANCE_DATA.factions.length, 10);
  assert.equal(RANCE_DATA.territories.length, 29);
  assert.equal(RANCE_DATA.unitClasses.length, 14);
  assert.equal(RANCE_DATA.characters.length, 33);
  assert.equal(RANCE_DATA.scenarioEvents.length, 16);
  assert.equal(RANCE_DATA.endings.length, 14);

  const state = Engine.createInitialState(RANCE_DATA, { seed: 42 });
  assert.equal(Object.keys(state.territories).length, 29);
  assert.equal(Object.keys(state.factions).length, 10);
  assert.equal(Object.keys(state.commanders).length, 33);
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

  // During LEAZAS_REBELLION, invading Helman (even adjacent Volgo Z) is blocked
  assert.equal(Engine.canInvade(state, "ter_volgo_z").ok, false);
  // White Fort is adjacent & allowed
  assert.equal(Engine.canInvade(state, "ter_leazas_white_fort").ok, true);

  // Invade and win White Fort to enter HUMAN_REALM
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

  // Next turn: verify adjacency rules in HUMAN_REALM
  Engine.endTurn(state, RANCE_DATA);
  assert.equal(Engine.canInvade(state, "ter_volgo_z").ok, true); // adjacent to Leazas Castle & North
  assert.equal(Engine.canInvade(state, "ter_ice").ok, true); // adjacent to Leazas Castle & South
  assert.equal(Engine.canInvade(state, "ter_lang_bau").ok, false); // non-adjacent!
  assert.equal(Engine.canInvade(state, "ter_japan_main").ok, false); // non-adjacent!
  assert.equal(Engine.canInvade(state, "ter_sulphur_forest").ok, false); // Monster Realm locked & non-adjacent!
});

test("4. 4v4 tactical combat: lowest-troop-first order, front/back row targeting, Snipe formula & ninja demon immunity", () => {
  // 4a. Exact lowest-troop-first + tie-breaking (PLAYER before ENEMY, slot 0..3)
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
  // 200 PLAYER (P3) -> 200 ENEMY (E2) -> 300 PLAYER (P2) -> 300 ENEMY (E1) -> 500 PLAYER (P1)
  assert.deepEqual(order, ["P3", "E2", "P2", "E1", "P1"]);

  // 4b. Snipe damage formula range check: 0..min(6, floor(strikes/5))
  for (let i = 0; i < 50; i++) {
    const r = i / 50;
    const d15 = Engine.resolveSnipeDamage({ strikes: 15 }, () => r, 6);
    assert.ok(d15 >= 0 && d15 <= 3);
    const d40 = Engine.resolveSnipeDamage({ strikes: 40 }, () => r, 6);
    assert.ok(d40 >= 0 && d40 <= 6);
  }

  // 4c. Live battle checks: back row cannot melee, wait -> snipe hits enemy back row directly
  const state = Engine.createInitialState(RANCE_DATA, { seed: 2026 });
  state.commanders.chr_maris.troops = 50; // lowest troops so Maris (BACK) acts first!
  state.commanders.chr_rance.troops = 60; // second lowest
  const inv = Engine.startInvasion(state, RANCE_DATA, "ter_leazas_white_fort", [
    "chr_rance",
    "chr_cordoba",
    "chr_maris",
    "chr_kanami"
  ]);
  assert.equal(inv.ok, true);
  assert.equal(state.activeBattle.activeUnitKey, "PLAYER_chr_maris");

  // Back-row Maris cannot direct attack
  const badMelee = Engine.executeBattleAction(state, RANCE_DATA, { type: "attack" });
  assert.equal(badMelee.ok, false);

  // Back-row Maris CAN cast magic with zero retaliation
  const goodMagic = Engine.executeBattleAction(state, RANCE_DATA, { type: "magic" });
  assert.equal(goodMagic.ok, true);
  assert.equal(goodMagic.retaliation, null);

  // Next actor should be Rance (troops 60)
  assert.equal(state.activeBattle.activeUnitKey, "PLAYER_chr_rance");
  // Rance waits to unlock Snipe
  assert.equal(Engine.executeBattleAction(state, RANCE_DATA, { type: "wait" }).ok, true);

  // Finish round 1 so Rance can fire Snipe in round 2
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
  assert.equal(backEnemy.troops, troopsBefore); // Snipe ignores troops completely!

  // 4d. Ninja +1 follow-up immunity against Demons (cls_demons)
  const demonState = Engine.createInitialState(RANCE_DATA, { seed: 3 });
  demonState.campaignPhase = "MONSTER_REALM";
  demonState.flags.monsterRealmOpen = true;
  demonState.territories.ter_helman_west.owner = "fac_leazas";
  demonState.commanders.chr_rance.troops = 50; // acts first
  const dInv = Engine.startInvasion(demonState, RANCE_DATA, "ter_maginot_line", ["chr_rance", "chr_rick"]);
  assert.equal(dInv.ok, true);
  const demonTarget = demonState.activeBattle.units.find((u) => u.side === "ENEMY" && u.classId === "cls_demons");
  assert.ok(demonTarget, "Maginot Line should field Demon units");
  const dAtk = Engine.executeBattleAction(demonState, RANCE_DATA, {
    type: "attack",
    targetUnitKey: demonTarget.unitKey
  });
  assert.equal(dAtk.ok, true);
  assert.equal(dAtk.result.ninjaProc, false); // Demon is strictly immune to Ninja +1!
});

test("5. Rance defeat (commanderHp == 0) immediately triggers end_death Game Over", () => {
  const state = Engine.createInitialState(RANCE_DATA, { seed: 99 });
  state.commanders.chr_rance.commanderHp = 1;
  state.commanders.chr_rance.troops = 0;
  const inv = Engine.startInvasion(state, RANCE_DATA, "ter_leazas_white_fort", ["chr_rance"]);
  assert.equal(inv.ok, true);

  // Force Rance to attack and take lethal retaliation or enemy turn
  Engine.autoResolveBattle(state, RANCE_DATA, 20);
  assert.equal(state.endingId, "end_death");
  assert.equal(state.commanders.chr_rance.alive, false);
});

test("6. Character scenarios, crisis timers & conquest triggers (Volgo Z, Zeth 4 Towers, Shizuka 5w, Haniwa King)", () => {
  const state = Engine.createInitialState(RANCE_DATA, { seed: 555 });
  // Suppress White Fort first with balanced 2-front + 2-back formation
  Engine.startInvasion(state, RANCE_DATA, "ter_leazas_white_fort", ["chr_rance", "chr_rick", "chr_maris", "chr_kanami"]);
  Engine.autoResolveBattle(state, RANCE_DATA);
  assert.equal(state.timers.monsterRealmInvasion.active, true);
  assert.equal(state.timers.monsterRealmInvasion.remainingWeeks, 73);

  // Next turn: conquer Volgo Z well before LP 3/08/3 -> rescues BOTH Soul & Sill!
  Engine.endTurn(state, RANCE_DATA);
  // Buff troops for guaranteed quick win
  state.commanders.chr_rance.atk = 35;
  state.commanders.chr_rick.atk = 35;
  Engine.startInvasion(state, RANCE_DATA, "ter_volgo_z", ["chr_rance", "chr_rick", "chr_cordoba", "chr_barres"]);
  Engine.autoResolveBattle(state, RANCE_DATA);
  assert.equal(state.territories.ter_volgo_z.owner, "fac_leazas");
  assert.equal(state.flags.soulRescued, true);
  assert.equal(state.flags.sillRescued, true);
  assert.equal(state.commanders.chr_soul.recruited, true);
  assert.equal(state.commanders.chr_sill.recruited, true);
  assert.equal(state.timers.freyaSabotage.active, true); // Helman war triggered Freya!

  // Counter Freya via city action -> recruits Freya and grants +5 ninja slots (10 total next turn)
  const freyaRes = Engine.runCityAction(state, RANCE_DATA, "ter_leazas_castle", "counter_freya");
  assert.equal(freyaRes.ok, true);
  assert.equal(state.commanders.chr_freya.recruited, true);
  assert.equal(Engine.countAliveRecruitedNinjas(state), 2);

  // Lake Sasa Haniwa King secret chain: Radil tax -> Aluminum Axe -> Aluminum choice -> 2x explore!
  state.territories.ter_radil.owner = "fac_leazas";
  state.territories.ter_sasa_lake.owner = "fac_leazas";
  Engine.endTurn(state, RANCE_DATA);
  assert.equal(state.weeklySlots.ninja, 10); // Kanami + Freya!
  Engine.runCityAction(state, RANCE_DATA, "ter_radil", "tax");
  assert.equal(state.flags.aluminumAxeOwned, true);
  Engine.runScenarioEvent(state, RANCE_DATA, "evt_lake_sasa_haniwa_king", 0);
  assert.equal(state.flags.sasaDungeonOpen, true);
  Engine.runExplore(state, RANCE_DATA, "ter_sasa_lake");
  Engine.endTurn(state, RANCE_DATA);
  Engine.runExplore(state, RANCE_DATA, "ter_sasa_lake");
  assert.equal(state.commanders.chr_haniwa_king.recruited, true);

  // Reinforce Rance before Zeth campaign
  Engine.runReinforce(state, RANCE_DATA, "chr_rance");

  // Zeth war starts 5-week Shizuka duel timer
  state.territories.ter_custom.owner = "fac_leazas";
  const tapeStart = Engine.startInvasion(state, RANCE_DATA, "ter_tape", ["chr_rance", "chr_rick", "chr_haniwa_king", "chr_maris"]);
  assert.equal(tapeStart.ok, true);
  assert.equal(state.timers.zethShizukaDuel.active, true);
  Engine.autoResolveBattle(state, RANCE_DATA);
  assert.equal(state.territories.ter_tape.owner, "fac_leazas");
  // Advance 5 weeks -> evt_zeth_shizuka_duel_timer fires on schedule!
  let shizukaFired = false;
  for (let w = 0; w < 5; w++) {
    const tRes = Engine.endTurn(state, RANCE_DATA);
    assert.equal(tRes.ok, true);
    if (tRes.dueEvents.includes("evt_zeth_shizuka_duel_timer")) shizukaFired = true;
  }
  assert.equal(shizukaFired, true);
  assert.ok(state.activeScenarios.includes("evt_zeth_shizuka_duel_timer"));

  // Conquer remaining 3 Zeth Towers -> Zeth 4 Towers collapse automatically transfers ter_zeth_west!
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
  // 7a. Bandit King (Prologue)
  const sBandit = Engine.createInitialState(RANCE_DATA, { startPhase: "BANDIT_PROLOGUE", seed: 10 });
  Engine.runScenarioEvent(sBandit, RANCE_DATA, "evt_bandit_prologue_ruberan", 0);
  assert.equal(sBandit.endingId, "end_bandit_king");

  // 7b. Maria To Outer Space (Tulip 100)
  const sSpace = Engine.createInitialState(RANCE_DATA, { seed: 20 });
  sSpace.commanders.chr_maria.recruited = true;
  sSpace.gold = 30000;
  Engine.runBuildFacility(sSpace, RANCE_DATA, "ter_leazas_castle", "maria_lab");
  sSpace.flags.tulipProgress = 100;
  Engine.runScenarioEvent(sSpace, RANCE_DATA, "evt_maria_tulip_100", 0);
  assert.equal(sSpace.endingId, "end_to_outer_space");

  // 7c. Unification Ending (Kayblis defeated while some counted territories remain unconquered)
  const sUni = Engine.createInitialState(RANCE_DATA, { seed: 30 });
  sUni.campaignPhase = "MONSTER_REALM";
  sUni.flags.monsterRealmOpen = true;
  sUni.flags.chaosSwordOwned = true;
  sUni.territories.ter_demon_frontier.owner = "fac_leazas";
  sUni.commanders.chr_rance.atk = 50;
  sUni.commanders.chr_rick.atk = 50;
  sUni.commanders.chr_kayblis.commanderHp = 5;
  Engine.startInvasion(sUni, RANCE_DATA, "ter_sulphur_forest", ["chr_rance", "chr_rick", "chr_cordoba", "chr_barres"]);
  Engine.autoResolveBattle(sUni, RANCE_DATA);
  assert.equal(sUni.endingId, "end_unification");

  // 7d. True Ending (Bliss): All counted territories (except Shangri-La) conquered -> Kayblis -> CREATOR_PHASE -> Warg + Sill alive!
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
  // Leave ter_shangri_la UNCONQUERED to prove countsForCreatorConquest exclusion works!
  assert.notEqual(sBliss.territories.ter_shangri_la.owner, "fac_leazas");
  sBliss.commanders.chr_rance.atk = 55;
  sBliss.commanders.chr_rick.atk = 55;
  sBliss.commanders.chr_kayblis.commanderHp = 5;

  Engine.startInvasion(sBliss, RANCE_DATA, "ter_sulphur_forest", ["chr_rance", "chr_rick", "chr_cordoba", "chr_barres"]);
  Engine.autoResolveBattle(sBliss, RANCE_DATA);
  assert.equal(sBliss.endingId, null);
  assert.equal(sBliss.campaignPhase, "CREATOR_PHASE");
  assert.equal(sBliss.territories.ter_rudrasaum_ruins.locked, false);

  Engine.runScenarioEvent(sBliss, RANCE_DATA, "evt_creator_phase_unlock", 0);
  assert.equal(sBliss.endingId, "end_bliss");

  // 7e. Volgo Z deadline expiration -> Sill dies -> Bliss locked -> World King instead!
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

  // Serialize s1, deserialize into s3, run identical ninja sabotage + battle and assert exact equality
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

test("9. Hazard & dark endings reachable: end_assassinated, end_demon_king_1, end_demon_king_2, end_defeat", () => {
  // Kanami overwork -> end_assassinated
  const sAssn = Engine.createInitialState(RANCE_DATA, { seed: 61 });
  Engine.runScenarioEvent(sAssn, RANCE_DATA, "evt_kanami_shinobu_assassination", 1);
  assert.equal(sAssn.endingId, "end_assassinated");

  // Satella proposal -> end_demon_king_1
  const sDk1 = Engine.createInitialState(RANCE_DATA, { seed: 62 });
  Engine.runScenarioEvent(sDk1, RANCE_DATA, "evt_satella_proposal", 1);
  assert.equal(sDk1.endingId, "end_demon_king_1");

  // Miki forbidden awakening -> end_demon_king_2
  const sDk2 = Engine.createInitialState(RANCE_DATA, { seed: 63 });
  Engine.runScenarioEvent(sDk2, RANCE_DATA, "evt_miki_kentarou_demon_king_crisis", 1);
  assert.equal(sDk2.endingId, "end_demon_king_2");

  // Leazas Castle lost -> end_defeat
  const sDefeat = Engine.createInitialState(RANCE_DATA, { seed: 64 });
  sDefeat.territories.ter_leazas_castle.owner = "fac_demon_kayblis";
  Engine.evaluateEndings(sDefeat, RANCE_DATA);
  assert.equal(sDefeat.endingId, "end_defeat");
});

