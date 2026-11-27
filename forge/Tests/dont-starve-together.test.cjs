'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { PlatformStore } = require('../Tools/platform-store.cjs');
const { NativeRuntime } = require('../Tools/native-runtime.cjs');

const forgeRoot = path.resolve(__dirname, '..');
const repoRoot = path.resolve(forgeRoot, '..');
const templateDir = path.join(forgeRoot, 'Templates', 'dont-starve-together');
const engine = NativeRuntime.availability(forgeRoot);

test('DST Godot template exposes valid PlayForge metadata and ready/guided project files', t => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'playforge-dst-store-'));
  t.after(() => fs.rmSync(tmp, { recursive: true, force: true, maxRetries: 4, retryDelay: 100 }));
  const store = new PlatformStore(forgeRoot, tmp);
  const tpl = store.getTemplate('dont-starve-together');
  assert.equal(tpl.id, 'dont-starve-together');
  assert.equal(tpl.dimension, '3d');
  assert.ok(tpl.assetPaths.includes('assets/icon.svg'));
  assert.ok(tpl.assetPaths.includes('data/dst_tuning.json'));

  const ready = store.createProject({ name: 'DST Ready', template: 'dont-starve-together', mode: 'ready' });
  assert.match(ready.files['scenes/main.tscn'], /type="Node3D"/);
  assert.ok(ready.files['scripts/dst_media.gd']);
  assert.ok(ready.files['scripts/dst_logic_engine.gd']);
  assert.ok(ready.files['scripts/dst_database.gd']);
  assert.ok(ready.files['scripts/dst_world_sim.gd']);
  assert.ok(ready.files['scripts/dst_net_sync.gd']);
  assert.ok(ready.files['data/dst_logic_extracted.json']);
  assert.ok(ready.files['data/dst_recipes_skilltrees_extracted.json']);
  assert.ok(ready.files['data/dst_worldgen_loot_extracted.json']);
  assert.ok(ready.files['scripts/dst_camera.gd']);
  assert.ok(ready.files['scripts/dst_renderer.gd']);
  assert.ok(ready.files['scripts/dst_hud.gd']);
  assert.ok(ready.files['scripts/main.gd']);
  assert.ok(ready.files['data/dst_textures_extracted.txt']);
  assert.ok(ready.files['data/dst_kanim_sprites_extracted.txt']);
  assert.ok(ready.files['data/dst_audio_extracted.txt']);
  assert.ok(ready.files['data/dst_shaders_extracted.txt']);
  assert.ok(ready.files['data/full_asset_index.json']);

  const guided = store.createProject({ name: 'DST Guided', template: 'dont-starve-together', mode: 'guided' });
  assert.match(guided.files['scenes/main.tscn'], /Node3D/);
  assert.equal(Object.keys(guided.files).filter(f => f.endsWith('.gd')).length, 0);
});

test('DST zero-omission full asset index verifies 100% source file accounting and 0 failures', () => {
  const indexPath = path.join(templateDir, 'data', 'full_asset_index.json');
  assert.ok(fs.existsSync(indexPath), 'data/full_asset_index.json must exist');
  const idx = JSON.parse(fs.readFileSync(indexPath, 'utf8'));
  assert.equal(idx.zero_omission_verified, true);
  assert.equal(idx.source_audit.unaccounted_source_files, 0);
  assert.equal(idx.source_audit.total_files_in_data, idx.source_audit.accounted_source_files);
  assert.equal(idx.totals.failures_total, 0);
  assert.ok(idx.totals.scripts_extracted >= 4100);
  assert.equal(idx.totals.shaders_ksh_and_glsl, 70);
  assert.ok(idx.totals.haptics_wavs >= 1700);
  assert.ok(idx.totals.images_zip_tex_png >= 68);
  assert.ok(idx.totals.atlas_individual_icons_png >= 8000);
  assert.ok(idx.totals.loose_ktex_png >= 1500);
  assert.ok(idx.totals.kanim_zips_parsed >= 3690);
  assert.equal(idx.totals.fmod_fsb_banks, 155);
  assert.ok(idx.totals.fmod_samples_indexed >= 20800);
  assert.ok(idx.totals.fmod_pcm16_wavs_extracted >= 2560);
});

test('DST reverse-engineered Lua logic JSON compiles all 79 Crock Pot ASTs with 0 failures', () => {
  const logicPath = path.join(templateDir, 'data', 'dst_logic_extracted.json');
  assert.ok(fs.existsSync(logicPath), 'data/dst_logic_extracted.json must exist');
  const logic = JSON.parse(fs.readFileSync(logicPath, 'utf8'));
  assert.equal(logic.meta.ast_failures, 0);
  assert.equal(logic.meta.counts.prepared_foods_normal, 68);
  assert.equal(logic.meta.counts.prepared_foods_warly, 11);
  assert.equal(logic.meta.counts.prepared_foods_total, 79);
  assert.ok(logic.meta.counts.cooking_ingredients >= 130);
  assert.equal(logic.meta.counts.farm_crops, 14);
  assert.equal(logic.meta.counts.characters_19, 19);
  assert.equal(logic.meta.counts.stategraphs, 9);
  assert.equal(logic.meta.counts.brains, 7);
  assert.ok(logic.meta.counts.recipes2_total >= 940);
  assert.equal(logic.meta.counts.skilltree_characters, 12);
  assert.ok(logic.meta.counts.skilltree_nodes_total >= 350);
  assert.equal(logic.meta.counts.wx78_modules, 23);
  assert.ok(logic.meta.counts.shared_loot_tables >= 220);
  assert.ok(logic.meta.counts.worldgen_rooms >= 220);
  assert.ok(logic.meta.counts.worldgen_tasks >= 135);
  assert.equal(logic.meta.counts.ocean_fish, 18);
  assert.equal(logic.meta.counts.fertilizers, 17);
  assert.equal(logic.meta.counts.krampus_naughty_creatures, 22);
  assert.equal(logic.meta.counts.battlesongs, 10);
  assert.equal(logic.meta.counts.wickerbottom_books, 18);
  assert.equal(logic.meta.counts.slingshot_ammos, 17);
  assert.equal(logic.meta.counts.trinkets_gold, 37);
  assert.ok(logic.meta.counts.bird_spawner_tiles >= 12);
  assert.equal(logic.meta.counts.ghostly_elixirs, 9);
  assert.ok(logic.meta.counts.tool_uses >= 90);
  assert.ok(logic.meta.counts.favorite_foods >= 18);
  assert.ok(logic.meta.counts.dryables >= 19);
  assert.ok(logic.meta.counts.creature_combat_stats >= 35);
  assert.ok(logic.meta.counts.armor_master >= 20);
  assert.equal(logic.meta.counts.spiced_foods_combinations, 316);
  assert.equal(logic.physics.propagator.verified_in_lua, true);
  assert.equal(logic.physics.temperature_insulation.verified_in_lua, true);
  assert.equal(logic.physics.freezable.verified_in_lua, true);
  assert.equal(logic.physics.seasons_clock_interp.verified_in_lua, true);
  assert.equal(logic.physics.spices.verified_in_lua, true);
  assert.equal(logic.physics.combat_planar.verified_in_lua, true);
  assert.equal(logic.physics.perishable_edible.verified_in_lua, true);
  assert.equal(logic.physics.moisture_easing.verified_in_lua, true);
  assert.equal(logic.physics.sanity_dual.verified_in_lua, true);
  assert.equal(logic.physics.beefalo_domestication.verified_in_lua, true);
  assert.equal(logic.physics.sleeper_nightmare.verified_in_lua, true);
  assert.equal(logic.physics.wolfgang_mightiness.verified_in_lua, true);
  assert.equal(logic.physics.wanda_oldager.verified_in_lua, true);
  assert.equal(logic.physics.shadow_spawner.verified_in_lua, true);
  assert.equal(logic.physics.boat_hullhealth.verified_in_lua, true);
  assert.equal(logic.physics.wildfires.verified_in_lua, true);
  assert.equal(logic.physics.riftspawner.verified_in_lua, true);
  assert.equal(logic.physics.fueled_burn.verified_in_lua, true);
  assert.equal(logic.physics.grogginess.verified_in_lua, true);
  assert.equal(logic.physics.wortox_souls.verified_in_lua, true);
  assert.equal(logic.physics.woodie_wereness.verified_in_lua, true);
  assert.equal(logic.physics.maxwell_puppets.verified_in_lua, true);
  assert.equal(logic.physics.storms_antlion.verified_in_lua, true);
  assert.equal(logic.physics.warly_foodmemory.verified_in_lua, true);
  assert.equal(logic.physics.heatrock.verified_in_lua, true);
  assert.equal(logic.physics.wormwood_bloomness.verified_in_lua, true);
  assert.equal(logic.physics.wurt_mermking.verified_in_lua, true);
  assert.equal(logic.krampus.verified_in_lua, true);
  assert.equal(logic.stategraphs.deerclops.attack_hit_frame, 31);
  assert.equal(logic.stategraphs.wilson.attack_hit_frame, 6);
});

test('DST static catalog JSON contains verified full counts from local installation', () => {
  const catalogPath = path.join(repoRoot, 'references', 'dont-starve-together', 'data', 'dst_catalog.json');
  assert.ok(fs.existsSync(catalogPath), 'dst_catalog.json must exist');
  const catalog = JSON.parse(fs.readFileSync(catalogPath, 'utf8'));
  assert.equal(catalog.meta.appid, '322330');
  assert.ok(catalog.counts.prefabs >= 1600);
  assert.ok(catalog.counts.components >= 800);
  assert.ok(catalog.counts.recipes >= 950);
  assert.equal(catalog.counts.characters, 19);
  assert.equal(catalog.counts.skilltree_characters, 12);
  assert.equal(catalog.counts.foods_warly, 11);
  assert.equal(catalog.counts.farm_crops, 14);
  assert.equal(catalog.counts.wx78_modules, 23);
});

test('DST Godot 4.7.2 restoration passes QA-01~QA-10 formulas, 3-day simulation, and main scene checks', {
  skip: engine.available ? false : engine.error || 'Godot editor unavailable',
}, t => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'playforge-dst-run-'));
  t.after(() => fs.rmSync(tmp, { recursive: true, force: true, maxRetries: 4, retryDelay: 100 }));
  const env = {
    ...process.env,
    APPDATA: tmp,
    LOCALAPPDATA: tmp,
    HOME: tmp,
    XDG_DATA_HOME: tmp,
    XDG_CONFIG_HOME: tmp,
    XDG_CACHE_HOME: tmp,
  };

  const imp = spawnSync(engine.executable, ['--headless', '--editor', '--path', templateDir, '--import', '--quit'], {
    env, encoding: 'utf8', timeout: 60000, windowsHide: true,
  });
  assert.ifError(imp.error);
  assert.equal(imp.status, 0, `import failed:\n${imp.stdout}\n${imp.stderr}`);

  const run = spawnSync(engine.executable, ['--headless', '--path', templateDir, '--script', 'tests/dst_restore_tests.gd'], {
    env, encoding: 'utf8', timeout: 60000, windowsHide: true,
  });
  const out = (run.stdout || '') + (run.stderr || '');
  assert.ifError(run.error);
  assert.equal(run.status, 0, `dst_restore_tests failed:\n${out}`);
  assert.doesNotMatch(out, /SCRIPT ERROR:|Parse Error:/, `script error:\n${out}`);

  const m = /DST_TEST_RESULT\s+(\{.*\})/.exec(out);
  assert.ok(m, `Missing DST_TEST_RESULT:\n${out}`);
  const summary = JSON.parse(m[1]);
  assert.equal(summary.failed, 0, out);
  assert.ok(summary.passed >= 173, `expected >= 173 checks, got ${summary.passed}\n${out}`);
});
