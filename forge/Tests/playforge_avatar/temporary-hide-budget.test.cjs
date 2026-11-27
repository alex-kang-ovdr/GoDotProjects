'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const { buildCorePack, buildThinUgcPack } = require('../../Tools/build-core-pack.cjs');
const { injectSealedAvatarIntoProjectDir, injectPlayHubAvatarAutoload } = require('../../Tools/avatar-seal.cjs');
const { PlatformStore } = require('../../Tools/platform-store.cjs');
const { NativeRuntime } = require('../../Tools/native-runtime.cjs');

const forgeRoot = path.resolve(__dirname, '../..');
const engineBin = path.resolve(forgeRoot, '..', '..', 'Forge-GodotEngine', 'bin', 'godot.windows.template_debug.x86_64.console.exe');
const officialGodot = NativeRuntime.availability(forgeRoot);

test('1. Forge-GodotEngine C++ Engine Seal: max 30s temporary avatar hide, auto-restore, 0.2s/s recharge, anti-cheat & scene-reload persistence', {
  skip: fs.existsSync(engineBin) ? false : `Forge-GodotEngine binary missing at ${engineBin}`,
  timeout: 120000,
}, (t) => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pf-hide-cpp-'));
  t.after(() => fs.rmSync(tmp, { recursive: true, force: true }));

  const corePackPath = path.join(tmp, 'playforge_core.pck');
  fs.writeFileSync(corePackPath, buildCorePack(forgeRoot).buffer);
  const assetsDir = path.join(forgeRoot, 'Godot', 'addons', 'playforge_avatar', 'assets');

  const mainScene = `[gd_scene format=3]

[node name="HideTestWorld" type="Node3D"]
`;
  const altScene = `[gd_scene format=3]

[node name="ReloadedWorld" type="Node3D"]
`;

  const probeScript = `extends Node

func _wait_real_seconds(sec: float) -> void:
\tvar target_usec := Time.get_ticks_usec() + int(round(sec * 1000000.0))
\twhile Time.get_ticks_usec() < target_usec:
\t\tawait get_tree().process_frame

func _ready() -> void:
\tprocess_mode = Node.PROCESS_MODE_ALWAYS
\tcall_deferred("_run_audit")

func _run_audit() -> void:
\tfor _i in range(4):
\t\tawait get_tree().process_frame
\tvar pf = Engine.get_singleton("PlayForgePlatform")
\tvar avatar = pf.get_local_avatar()
\tvar portrait = pf.get_avatar_portrait_ui()
\tvar results := {}

\t# A. Initial state (Avatar + Top-Left PlayForgeCoreHUD)
\tvar init_state: Dictionary = pf.get_avatar_hide_state()
\tvar init_hud_state: Dictionary = pf.get_hud_hide_state()
\tresults["initialState"] = init_state
\tresults["initialHudState"] = init_hud_state
\tresults["initialVisible"] = {
\t\t"world": avatar is Node3D and (avatar as Node3D).visible,
\t\t"portrait": portrait is Control and (portrait as Control).visible,
\t\t"hudActive": pf.is_platform_hud_active(),
\t\t"hudHiddenFromUserTree": get_tree().root.get_node_or_null("PlayForgeCoreHUD") == null,
\t}

\t# B. Direct unauthorized visible=false must still be blocked by C++ seal
\tvar v_before: int = pf.get_violation_count()
\tif avatar is Node3D:
\t\t(avatar as Node3D).visible = false
\tif portrait is Control:
\t\t(portrait as Control).visible = false
\tvar v_after: int = pf.get_violation_count()
\tresults["directHideBlocked"] = {
\t\t"violationsDelta": v_after - v_before,
\t\t"worldStillVisible": avatar is Node3D and (avatar as Node3D).visible,
\t\t"portraitStillVisible": portrait is Control and (portrait as Control).visible,
\t\t"hudStillActive": pf.is_platform_hud_active(),
\t}

\t# C. Invalid durations rejected (Avatar & HUD)
\tresults["invalidRejected"] = {
\t\t"zero": pf.request_temporary_avatar_hide(0.0),
\t\t"negative": pf.request_temporary_avatar_hide(-5.0),
\t\t"nan": pf.request_temporary_avatar_hide(NAN),
\t\t"inf": pf.request_temporary_avatar_hide(INF),
\t\t"hudZero": pf.request_temporary_hud_hide(0.0),
\t\t"hudNegative": pf.request_temporary_hud_hide(-5.0),
\t\t"hudNan": pf.request_temporary_hud_hide(NAN),
\t\t"hudInf": pf.request_temporary_hud_hide(INF),
\t}

\t# D. Short hide (1.0s) under Engine.time_scale=0.01 AND get_tree().paused=true must STILL expire in real wall-clock time for BOTH Avatar & HUD!
\tvar started_short: bool = pf.request_temporary_platform_ui_hide(1.0)
\tawait get_tree().process_frame
\tresults["shortHideActive"] = {
\t\t"started": started_short,
\t\t"hidden": pf.is_avatar_temporarily_hidden(),
\t\t"hudHidden": pf.is_hud_temporarily_hidden(),
\t\t"worldVisible": avatar is Node3D and (avatar as Node3D).visible,
\t\t"portraitVisible": portrait is Control and (portrait as Control).visible,
\t\t"hudActive": pf.is_platform_hud_active(),
\t\t"remaining": pf.get_avatar_hide_remaining_seconds(),
\t\t"hudRemaining": pf.get_hud_hide_remaining_seconds(),
\t}
\tEngine.time_scale = 0.01
\tget_tree().paused = true
\tawait _wait_real_seconds(1.25)
\tEngine.time_scale = 1.0
\tget_tree().paused = false
\tawait get_tree().process_frame
\tvar after_short_budget: float = pf.get_avatar_hide_budget_seconds()
\tvar after_short_hud_budget: float = pf.get_hud_hide_budget_seconds()
\tresults["afterShortAutoShow"] = {
\t\t"hidden": pf.is_avatar_temporarily_hidden(),
\t\t"hudHidden": pf.is_hud_temporarily_hidden(),
\t\t"worldVisible": avatar is Node3D and (avatar as Node3D).visible,
\t\t"portraitVisible": portrait is Control and (portrait as Control).visible,
\t\t"hudActive": pf.is_platform_hud_active(),
\t\t"budget": after_short_budget,
\t\t"hudBudget": after_short_hud_budget,
\t}

\t# E. Recharge check: wait 2.5s visible -> should recharge ~0.50s (0.2 s/s) for BOTH Avatar & HUD
\tvar budget_before_recharge: float = pf.get_avatar_hide_budget_seconds()
\tvar hud_budget_before_recharge: float = pf.get_hud_hide_budget_seconds()
\tawait _wait_real_seconds(2.5)
\tvar budget_after_recharge: float = pf.get_avatar_hide_budget_seconds()
\tvar hud_budget_after_recharge: float = pf.get_hud_hide_budget_seconds()
\tresults["rechargeSample"] = {
\t\t"before": budget_before_recharge,
\t\t"after": budget_after_recharge,
\t\t"delta": budget_after_recharge - budget_before_recharge,
\t\t"hudDelta": hud_budget_after_recharge - hud_budget_before_recharge,
\t}

\t# F. Full 30s ceiling clamp & real wall-clock exhaustion -> auto-restore -> exhaustion denial -> recharge -> partial clamp (BOTH Avatar & HUD)
\tvar started_max: bool = pf.request_temporary_platform_ui_hide(999.0)
\tvar clamped_initial_rem: float = pf.get_avatar_hide_remaining_seconds()
\tvar clamped_initial_budget: float = pf.get_avatar_hide_budget_seconds()
\tvar clamped_initial_hud_rem: float = pf.get_hud_hide_remaining_seconds()
\tvar t_start_usec := Time.get_ticks_usec()
\tvar spam_rem_after_15s := -1.0
\tvar spam_hud_rem_after_15s := -1.0
\tvar still_hidden_at_25s := false
\tvar hud_still_hidden_at_25s := false
\tvar spam_checked := false
\tvar mid_checked := false
\twhile pf.is_avatar_temporarily_hidden() or pf.is_hud_temporarily_hidden():
\t\tvar elapsed := float(Time.get_ticks_usec() - t_start_usec) / 1000000.0
\t\tif not spam_checked and elapsed >= 15.0:
\t\t\tspam_checked = true
\t\t\tpf.request_temporary_platform_ui_hide(30.0) # Attempt to stretch timer mid-hide
\t\t\tspam_rem_after_15s = pf.get_avatar_hide_remaining_seconds()
\t\t\tspam_hud_rem_after_15s = pf.get_hud_hide_remaining_seconds()
\t\tif not mid_checked and elapsed >= 25.0:
\t\t\tmid_checked = true
\t\t\tstill_hidden_at_25s = pf.is_avatar_temporarily_hidden()
\t\t\thud_still_hidden_at_25s = pf.is_hud_temporarily_hidden()
\t\tif elapsed > 33.0:
\t\t\tbreak
\t\tawait get_tree().process_frame
\tvar total_hidden_elapsed := float(Time.get_ticks_usec() - t_start_usec) / 1000000.0
\tvar deny_when_exhausted: bool = pf.request_temporary_avatar_hide(10.0)
\tvar hud_deny_when_exhausted: bool = pf.request_temporary_hud_hide(10.0)
\tresults["full30sExhaustion"] = {
\t\t"startedMax": started_max,
\t\t"clampedInitialRem": clamped_initial_rem,
\t\t"clampedInitialBudget": clamped_initial_budget,
\t\t"clampedInitialHudRem": clamped_initial_hud_rem,
\t\t"spamRemAfter15s": spam_rem_after_15s,
\t\t"spamHudRemAfter15s": spam_hud_rem_after_15s,
\t\t"stillHiddenAt25s": still_hidden_at_25s,
\t\t"hudStillHiddenAt25s": hud_still_hidden_at_25s,
\t\t"totalHiddenElapsed": total_hidden_elapsed,
\t\t"autoRestoredHiddenFlag": pf.is_avatar_temporarily_hidden(),
\t\t"autoRestoredHudHiddenFlag": pf.is_hud_temporarily_hidden(),
\t\t"autoRestoredWorldVisible": avatar is Node3D and (avatar as Node3D).visible,
\t\t"autoRestoredPortraitVisible": portrait is Control and (portrait as Control).visible,
\t\t"autoRestoredHudActive": pf.is_platform_hud_active(),
\t\t"budgetAtExpiry": pf.get_avatar_hide_budget_seconds(),
\t\t"hudBudgetAtExpiry": pf.get_hud_hide_budget_seconds(),
\t\t"denyWhenExhausted": deny_when_exhausted,
\t\t"hudDenyWhenExhausted": hud_deny_when_exhausted,
\t}

\t# G. Wait 2.0s visible while exhausted -> should recharge ~0.40s (0.2s/s) -> request(10.0) must clamp to ~0.40s for BOTH!
\tawait _wait_real_seconds(2.0)
\tvar recharged_from_zero: float = pf.get_avatar_hide_budget_seconds()
\tvar hud_recharged_from_zero: float = pf.get_hud_hide_budget_seconds()
\tvar partial_started: bool = pf.request_temporary_platform_ui_hide(10.0)
\tvar partial_granted_rem: float = pf.get_avatar_hide_remaining_seconds()
\tvar partial_granted_hud_rem: float = pf.get_hud_hide_remaining_seconds()
\tawait _wait_real_seconds(0.7)
\tresults["partialRehideAfterRecharge"] = {
\t\t"rechargedFromZero": recharged_from_zero,
\t\t"hudRechargedFromZero": hud_recharged_from_zero,
\t\t"partialStarted": partial_started,
\t\t"partialGrantedRem": partial_granted_rem,
\t\t"partialGrantedHudRem": partial_granted_hud_rem,
\t\t"autoRestoredAfterPartial": not pf.is_avatar_temporarily_hidden(),
\t\t"hudAutoRestoredAfterPartial": not pf.is_hud_temporarily_hidden(),
\t\t"worldVisible": avatar is Node3D and (avatar as Node3D).visible,
\t\t"portraitVisible": portrait is Control and (portrait as Control).visible,
\t\t"hudActive": pf.is_platform_hud_active(),
\t}

\t# H. Scene change must NOT reset exhausted hide budget back to 30s (Avatar OR HUD)!
\tget_tree().change_scene_to_file("res://scenes/alt.tscn")
\tfor _j in range(4):
\t\tawait get_tree().process_frame
\tresults["afterSceneReloadBudget"] = pf.get_avatar_hide_budget_seconds()
\tresults["afterSceneReloadHudBudget"] = pf.get_hud_hide_budget_seconds()

\tprint("CPP_HIDE_BUDGET_AUDIT=" + JSON.stringify(results))
\tget_tree().quit(0)
`;

  const projectGodot = `; Engine configuration file.
config_version=5

[application]
config/name="Hide Budget C++ Test"
run/main_scene="res://scenes/main.tscn"
config/features=PackedStringArray("4.7", "GL Compatibility")

[autoload]
HideProbe="*res://probe.gd"

[playforge]
avatar/presentation_mode=3
avatar/portrait_size=Vector2(144, 144)
avatar/portrait_corner=0
`;

  const ugcPackPath = path.join(tmp, 'ugc-hide-test.pck');
  const ugc = buildThinUgcPack([
    ['project.godot', projectGodot],
    ['scenes/main.tscn', mainScene],
    ['scenes/alt.tscn', altScene],
    ['probe.gd', probeScript],
  ], { worldId: 'hide-test', worldName: 'Hide Test' });
  fs.writeFileSync(ugcPackPath, ugc.buffer);

  const env = {
    ...process.env,
    APPDATA: tmp,
    LOCALAPPDATA: tmp,
    HOME: tmp,
    XDG_DATA_HOME: tmp,
    XDG_CONFIG_HOME: tmp,
    XDG_CACHE_HOME: tmp,
  };
  const res = spawnSync(engineBin, [
    '--headless',
    '--playforge-core-pack', corePackPath,
    '--playforge-ugc-pack', ugcPackPath,
    '--',
    `--avatar-assets-dir=${assetsDir}`,
    `--avatar-cache-dir=${path.join(tmp, 'cache')}`,
  ], {
    env,
    encoding: 'utf8',
    timeout: 90000,
    windowsHide: true,
  });

  const output = (res.stdout || '') + '\n' + (res.stderr || '');
  assert.ifError(res.error);
  assert.equal(res.status, 0, `C++ engine exited with ${res.status}:\n${output}`);
  const match = /CPP_HIDE_BUDGET_AUDIT=(\{[^\r\n]+\})/.exec(output);
  assert.ok(match, `Missing CPP_HIDE_BUDGET_AUDIT:\n${output}`);
  const r = JSON.parse(match[1]);

  // A. Initial state (Avatar + Top-Left PlayForgeCoreHUD)
  assert.equal(r.initialState.hidden, false);
  assert.equal(r.initialState.maxBudgetSeconds, 30);
  assert.equal(r.initialState.rechargeRatePerSecond, 0.2);
  assert.ok(r.initialState.budgetSeconds >= 29.9 && r.initialState.budgetSeconds <= 30.0);
  assert.equal(r.initialHudState.hidden, false);
  assert.equal(r.initialHudState.maxBudgetSeconds, 30);
  assert.equal(r.initialHudState.rechargeRatePerSecond, 0.2);
  assert.ok(r.initialHudState.budgetSeconds >= 29.9 && r.initialHudState.budgetSeconds <= 30.0);
  assert.equal(r.initialVisible.world, true);
  assert.equal(r.initialVisible.portrait, true);
  assert.equal(r.initialVisible.hudActive, true);
  assert.equal(r.initialVisible.hudHiddenFromUserTree, true);

  // B. Unauthorized direct hide still blocked
  assert.ok(r.directHideBlocked.violationsDelta >= 2, `Expected >=2 seal violations, got ${r.directHideBlocked.violationsDelta}`);
  assert.equal(r.directHideBlocked.worldStillVisible, true);
  assert.equal(r.directHideBlocked.portraitStillVisible, true);
  assert.equal(r.directHideBlocked.hudStillActive, true);

  // C. Invalid durations rejected
  assert.deepEqual(r.invalidRejected, {
    zero: false, negative: false, nan: false, inf: false,
    hudZero: false, hudNegative: false, hudNan: false, hudInf: false,
  });

  // D. Short hide + time_scale/paused immunity (Avatar + HUD)
  assert.equal(r.shortHideActive.started, true);
  assert.equal(r.shortHideActive.hidden, true);
  assert.equal(r.shortHideActive.hudHidden, true);
  assert.equal(r.shortHideActive.worldVisible, false);
  assert.equal(r.shortHideActive.portraitVisible, false);
  assert.equal(r.shortHideActive.hudActive, false);
  assert.equal(r.afterShortAutoShow.hidden, false, 'Avatar must auto-restore even under time_scale=0.01 & paused=true');
  assert.equal(r.afterShortAutoShow.hudHidden, false, 'HUD must auto-restore even under time_scale=0.01 & paused=true');
  assert.equal(r.afterShortAutoShow.worldVisible, true);
  assert.equal(r.afterShortAutoShow.portraitVisible, true);
  assert.equal(r.afterShortAutoShow.hudActive, true);
  assert.ok(r.afterShortAutoShow.budget <= 29.3 && r.afterShortAutoShow.budget >= 28.5, `Budget after 1s hide unexpected: ${r.afterShortAutoShow.budget}`);
  assert.ok(r.afterShortAutoShow.hudBudget <= 29.3 && r.afterShortAutoShow.hudBudget >= 28.5, `HUD budget after 1s hide unexpected: ${r.afterShortAutoShow.hudBudget}`);

  // E. 0.2 s/s recharge sample over 2.5s real visible time (~0.50s) for BOTH Avatar & HUD
  assert.ok(r.rechargeSample.delta >= 0.35 && r.rechargeSample.delta <= 0.65, `Expected ~0.50s avatar recharge over 2.5s at 0.2s/s, got ${r.rechargeSample.delta}`);
  assert.ok(r.rechargeSample.hudDelta >= 0.35 && r.rechargeSample.hudDelta <= 0.65, `Expected ~0.50s HUD recharge over 2.5s at 0.2s/s, got ${r.rechargeSample.hudDelta}`);

  // F. Full 30s ceiling clamp & real wall-clock exhaustion (BOTH Avatar & HUD)
  assert.equal(r.full30sExhaustion.startedMax, true);
  assert.ok(r.full30sExhaustion.clampedInitialRem <= 30.0, 'Requested 999s must clamp <= 30s');
  assert.ok(r.full30sExhaustion.clampedInitialHudRem <= 30.0, 'Requested 999s HUD must clamp <= 30s');
  assert.ok(r.full30sExhaustion.spamRemAfter15s <= 16.0, `Mid-hide spam must NOT reset avatar timer, got ${r.full30sExhaustion.spamRemAfter15s}`);
  assert.ok(r.full30sExhaustion.spamHudRemAfter15s <= 16.0, `Mid-hide spam must NOT reset HUD timer, got ${r.full30sExhaustion.spamHudRemAfter15s}`);
  assert.equal(r.full30sExhaustion.stillHiddenAt25s, true);
  assert.equal(r.full30sExhaustion.hudStillHiddenAt25s, true);
  assert.ok(r.full30sExhaustion.totalHiddenElapsed >= 28.0 && r.full30sExhaustion.totalHiddenElapsed <= 31.5, `Unexpected full hide duration: ${r.full30sExhaustion.totalHiddenElapsed}`);
  assert.equal(r.full30sExhaustion.autoRestoredHiddenFlag, false);
  assert.equal(r.full30sExhaustion.autoRestoredHudHiddenFlag, false);
  assert.equal(r.full30sExhaustion.autoRestoredWorldVisible, true);
  assert.equal(r.full30sExhaustion.autoRestoredPortraitVisible, true);
  assert.equal(r.full30sExhaustion.autoRestoredHudActive, true);
  assert.ok(r.full30sExhaustion.budgetAtExpiry <= 0.1, `Expected exhausted avatar budget ~0, got ${r.full30sExhaustion.budgetAtExpiry}`);
  assert.ok(r.full30sExhaustion.hudBudgetAtExpiry <= 0.1, `Expected exhausted HUD budget ~0, got ${r.full30sExhaustion.hudBudgetAtExpiry}`);
  assert.equal(r.full30sExhaustion.denyWhenExhausted, false, 'Re-hiding avatar immediately when exhausted must be denied');
  assert.equal(r.full30sExhaustion.hudDenyWhenExhausted, false, 'Re-hiding HUD immediately when exhausted must be denied');

  // G. 2.0s visible recharge -> ~0.40s -> partial clamp (BOTH Avatar & HUD)
  assert.ok(r.partialRehideAfterRecharge.rechargedFromZero >= 0.28 && r.partialRehideAfterRecharge.rechargedFromZero <= 0.55,
    `Expected ~0.40s avatar recharge over 2.0s from 0, got ${r.partialRehideAfterRecharge.rechargedFromZero}`);
  assert.ok(r.partialRehideAfterRecharge.hudRechargedFromZero >= 0.28 && r.partialRehideAfterRecharge.hudRechargedFromZero <= 0.55,
    `Expected ~0.40s HUD recharge over 2.0s from 0, got ${r.partialRehideAfterRecharge.hudRechargedFromZero}`);
  assert.equal(r.partialRehideAfterRecharge.partialStarted, true);
  assert.ok(r.partialRehideAfterRecharge.partialGrantedRem <= 0.55, `Must clamp partial avatar hide to recharged budget, got ${r.partialRehideAfterRecharge.partialGrantedRem}`);
  assert.ok(r.partialRehideAfterRecharge.partialGrantedHudRem <= 0.55, `Must clamp partial HUD hide to recharged budget, got ${r.partialRehideAfterRecharge.partialGrantedHudRem}`);
  assert.equal(r.partialRehideAfterRecharge.autoRestoredAfterPartial, true);
  assert.equal(r.partialRehideAfterRecharge.hudAutoRestoredAfterPartial, true);
  assert.equal(r.partialRehideAfterRecharge.worldVisible, true);
  assert.equal(r.partialRehideAfterRecharge.portraitVisible, true);
  assert.equal(r.partialRehideAfterRecharge.hudActive, true);

  // H. Scene reload persistence (budget must stay drained, NOT reset to 30s!)
  assert.ok(r.afterSceneReloadBudget < 2.0, `Scene reload must NOT reset avatar hide budget to 30s, got ${r.afterSceneReloadBudget}`);
  assert.ok(r.afterSceneReloadHudBudget < 2.0, `Scene reload must NOT reset HUD hide budget to 30s, got ${r.afterSceneReloadHudBudget}`);
});

test('2. Official Godot 4.7.2 Web/GDScript Runtime (PlayForgeAvatarRuntime): max 30s cap, early restore, 0.2s/s recharge, time_scale immunity & unauthorized hide self-heal', {
  skip: officialGodot.available ? false : officialGodot.error || 'Official Godot unavailable',
  timeout: 60000,
}, (t) => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pf-hide-gd-'));
  t.after(() => fs.rmSync(tmp, { recursive: true, force: true }));

  const store = new PlatformStore(forgeRoot, path.join(tmp, 'store'));
  const projDir = path.join(tmp, 'project');
  const { files } = store.createProject({ name: 'Tappy Hide GD Test', template: 'tappy-chicken', mode: 'ready' });
  for (const [rel, content] of Object.entries(files)) {
    const dest = path.join(projDir, rel);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.writeFileSync(dest, rel === 'project.godot' ? injectPlayHubAvatarAutoload(content) : content, 'utf8');
  }
  injectSealedAvatarIntoProjectDir(forgeRoot, projDir, { includeAssets: 'starter' });

  const gdProbe = `extends Node

func _wait_real_seconds(sec: float) -> void:
\tvar target_usec := Time.get_ticks_usec() + int(round(sec * 1000000.0))
\twhile Time.get_ticks_usec() < target_usec:
\t\tawait get_tree().process_frame

func _ready() -> void:
\tprocess_mode = Node.PROCESS_MODE_ALWAYS
\tcall_deferred("_run")

func _run() -> void:
\tfor _i in range(5):
\t\tawait get_tree().process_frame
\tvar rt := get_tree().root.get_node("PlayForgeAvatarRuntime")
\tvar layer := get_tree().root.get_node("PlayForgePortraitLayer") as CanvasLayer
\tvar portrait := layer.get_node("PlayForgeAvatarPortraitUI") as Control
\tvar hud_layer := get_tree().root.get_node("PlayForgeCoreHUD") as CanvasLayer
\tvar hud_bar := hud_layer.get_node("PlayHubPlatformBar") as Control
\tvar out := {}

\t# 1. Unauthorized portrait/HUD hide or opacity tamper must self-heal on next frame
\tportrait.visible = false
\thud_layer.visible = false
\thud_bar.visible = false
\thud_bar.modulate = Color(1, 1, 1, 0)
\tawait get_tree().process_frame
\tawait get_tree().process_frame
\tout["selfHealedVisible"] = portrait.visible
\tout["hudSelfHealedVisible"] = hud_layer.visible and hud_bar.visible and hud_bar.modulate.a >= 0.99

\t# 2. Request 999s for BOTH Avatar & Top-Left HUD -> clamped <= 30s, hides cleanly, early end after 1.0s restores immediately
\tvar ok_cap: bool = rt.request_temporary_platform_ui_hide(999.0)
\tvar rem_cap: float = rt.get_avatar_hide_remaining_seconds()
\tvar hud_rem_cap: float = rt.get_hud_hide_remaining_seconds()
\tawait get_tree().process_frame
\tout["capCheck"] = {
\t\t"ok": ok_cap,
\t\t"rem": rem_cap,
\t\t"hudRem": hud_rem_cap,
\t\t"portraitHidden": not portrait.visible,
\t\t"layerHidden": not layer.visible,
\t\t"hudHidden": not hud_layer.visible,
\t}
\tawait _wait_real_seconds(1.0)
\trt.end_temporary_platform_ui_hide()
\tawait get_tree().process_frame
\tvar budget_after_early: float = rt.get_avatar_hide_budget_seconds()
\tvar hud_budget_after_early: float = rt.get_hud_hide_budget_seconds()
\tout["earlyRestore"] = {
\t\t"hidden": rt.is_avatar_temporarily_hidden(),
\t\t"hudHidden": rt.is_hud_temporarily_hidden(),
\t\t"portraitVisible": portrait.visible,
\t\t"hudVisible": hud_layer.visible and hud_bar.visible,
\t\t"budget": budget_after_early,
\t\t"hudBudget": hud_budget_after_early,
\t}

\t# 3. 2.0s visible recharge -> +0.40s (0.2s/s) for BOTH Avatar & HUD
\tawait _wait_real_seconds(2.0)
\tvar budget_after_recharge: float = rt.get_avatar_hide_budget_seconds()
\tvar hud_budget_after_recharge: float = rt.get_hud_hide_budget_seconds()
\tout["rechargeDelta"] = budget_after_recharge - budget_after_early
\tout["hudRechargeDelta"] = hud_budget_after_recharge - hud_budget_after_early

\t# 4. time_scale=0.01 + paused=true immunity during 0.8s hide -> auto-restores BOTH Portrait & HUD in real wall-clock time
\trt.request_temporary_platform_ui_hide(0.8)
\tEngine.time_scale = 0.01
\tget_tree().paused = true
\tawait _wait_real_seconds(1.05)
\tEngine.time_scale = 1.0
\tget_tree().paused = false
\tawait get_tree().process_frame
\tout["afterPausedExpiry"] = {
\t\t"hidden": rt.is_avatar_temporarily_hidden(),
\t\t"hudHidden": rt.is_hud_temporarily_hidden(),
\t\t"portraitVisible": portrait.visible,
\t\t"hudVisible": hud_layer.visible and hud_bar.visible,
\t}

\tprint("GD_HIDE_BUDGET_AUDIT=" + JSON.stringify(out))
\tget_tree().quit(0)
`;
  fs.writeFileSync(path.join(projDir, 'gd_hide_probe.gd'), gdProbe, 'utf8');
  let pj = fs.readFileSync(path.join(projDir, 'project.godot'), 'utf8');
  pj = pj.replace(/^\[autoload\]\r?\n/m, '[autoload]\nGdHideProbe="*res://gd_hide_probe.gd"\n');
  fs.writeFileSync(path.join(projDir, 'project.godot'), pj, 'utf8');

  const env = {
    ...process.env,
    APPDATA: tmp,
    LOCALAPPDATA: tmp,
    HOME: tmp,
    XDG_DATA_HOME: tmp,
    XDG_CONFIG_HOME: tmp,
    XDG_CACHE_HOME: tmp,
  };
  const imp = spawnSync(officialGodot.executable, ['--headless', '--path', projDir, '--editor', '--import'], {
    env, encoding: 'utf8', timeout: 60000, windowsHide: true,
  });
  assert.ifError(imp.error);
  assert.equal(imp.status, 0, imp.stdout + imp.stderr);

  const run = spawnSync(officialGodot.executable, ['--headless', '--path', projDir, '--', '--playforge-pie-avatar=on'], {
    env, encoding: 'utf8', timeout: 45000, windowsHide: true,
  });
  const output = (run.stdout || '') + '\n' + (run.stderr || '');
  assert.ifError(run.error);
  assert.equal(run.status, 0, output);
  const match = /GD_HIDE_BUDGET_AUDIT=(\{[^\r\n]+\})/.exec(output);
  assert.ok(match, `Missing GD_HIDE_BUDGET_AUDIT:\n${output}`);
  const out = JSON.parse(match[1]);

  assert.equal(out.selfHealedVisible, true, 'Unauthorized portrait.visible=false must self-heal');
  assert.equal(out.hudSelfHealedVisible, true, 'Unauthorized PlayForgeCoreHUD hide/modulate tamper must self-heal');
  assert.equal(out.capCheck.ok, true);
  assert.ok(out.capCheck.rem <= 30.0 && out.capCheck.rem >= 29.0, `Expected <=30s avatar cap, got ${out.capCheck.rem}`);
  assert.ok(out.capCheck.hudRem <= 30.0 && out.capCheck.hudRem >= 29.0, `Expected <=30s HUD cap, got ${out.capCheck.hudRem}`);
  assert.equal(out.capCheck.portraitHidden, true);
  assert.equal(out.capCheck.layerHidden, true);
  assert.equal(out.capCheck.hudHidden, true);
  assert.equal(out.earlyRestore.hidden, false);
  assert.equal(out.earlyRestore.hudHidden, false);
  assert.equal(out.earlyRestore.portraitVisible, true);
  assert.equal(out.earlyRestore.hudVisible, true);
  assert.ok(out.earlyRestore.budget <= 29.2 && out.earlyRestore.budget >= 28.4, `Expected ~29s avatar after 1s hide, got ${out.earlyRestore.budget}`);
  assert.ok(out.earlyRestore.hudBudget <= 29.2 && out.earlyRestore.hudBudget >= 28.4, `Expected ~29s HUD after 1s hide, got ${out.earlyRestore.hudBudget}`);
  assert.ok(out.rechargeDelta >= 0.28 && out.rechargeDelta <= 0.55, `Expected ~0.40s avatar recharge over 2.0s at 0.2s/s, got ${out.rechargeDelta}`);
  assert.ok(out.hudRechargeDelta >= 0.28 && out.hudRechargeDelta <= 0.55, `Expected ~0.40s HUD recharge over 2.0s at 0.2s/s, got ${out.hudRechargeDelta}`);
  assert.equal(out.afterPausedExpiry.hidden, false, 'Avatar must auto-restore even under time_scale=0.01 & paused=true');
  assert.equal(out.afterPausedExpiry.hudHidden, false, 'HUD must auto-restore even under time_scale=0.01 & paused=true');
  assert.equal(out.afterPausedExpiry.portraitVisible, true);
  assert.equal(out.afterPausedExpiry.hudVisible, true);

  // 5. Verify default Debug PIE (no flag -> experimental OFF) AND explicit --playforge-pie-avatar=off disable BOTH Avatar AND Top-Left PlayForgeCoreHUD!
  const pieProbe = `extends Node
func _ready() -> void:
\tcall_deferred("_check")
func _check() -> void:
\tfor _i in range(4):
\t\tawait get_tree().process_frame
\tvar rt := get_tree().root.get_node_or_null("PlayForgeAvatarRuntime")
\tvar state: Dictionary = rt.call("get_active_avatar_state") if rt != null else {}
\tprint("PIE_OFF_AUDIT=" + JSON.stringify({
\t\t"pieDisabled": bool(state.get("pieDisabled", false)),
\t\t"hasPortrait": get_tree().root.get_node_or_null("PlayForgePortraitLayer") != null,
\t\t"hasCoreHud": get_tree().root.get_node_or_null("PlayForgeCoreHUD") != null,
\t}))
\tget_tree().quit(0)
`;
  fs.writeFileSync(path.join(projDir, 'gd_hide_probe.gd'), pieProbe, 'utf8');
  for (const args of [['--headless', '--path', projDir], ['--headless', '--path', projDir, '--', '--playforge-pie-avatar=off']]) {
    const pieOffRun = spawnSync(officialGodot.executable, args, {
      env, encoding: 'utf8', timeout: 30000, windowsHide: true,
    });
    const pieOffOut = (pieOffRun.stdout || '') + '\n' + (pieOffRun.stderr || '');
    assert.ifError(pieOffRun.error);
    assert.equal(pieOffRun.status, 0, pieOffOut);
    const pieOffMatch = /PIE_OFF_AUDIT=(\{[^\r\n]+\})/.exec(pieOffOut);
    assert.ok(pieOffMatch, `Missing PIE_OFF_AUDIT:\n${pieOffOut}`);
    const pieOff = JSON.parse(pieOffMatch[1]);
    assert.equal(pieOff.pieDisabled, true, `PIE default/OFF must set pieDisabled=true (${args.join(' ')})`);
    assert.equal(pieOff.hasPortrait, false, 'PIE default/OFF must NOT mount PlayForgePortraitLayer');
    assert.equal(pieOff.hasCoreHud, false, 'PIE default/OFF must NOT mount PlayForgeCoreHUD');
  }
});
