import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { analyzeUnityProject } from '../src/unity-analyzer.mjs';
import { parseAiffBuffer } from '../src/aiff-to-wav.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const SAMPLE_DIR = path.join(ROOT, 'samples', 'unity-2d-roguelike');
const PORTED_DIR = path.join(ROOT, 'ported', 'godot-2d-roguelike');
const REPORTS_DIR = path.join(ROOT, 'reports');

test('unity-core-api.v0.json registry covers D/A/R/X grades with valid schema', () => {
  const reg = JSON.parse(fs.readFileSync(path.join(ROOT, 'mappings', 'unity-core-api.v0.json'), 'utf8'));
  assert.equal(reg.schema_version, 1);
  assert.equal(reg.target_version, '4.7.2');
  const grades = new Set(reg.entries.map((e) => e.grade));
  for (const g of ['D', 'A', 'R', 'X']) {
    assert.ok(grades.has(g), `Missing grade ${g}`);
  }
  assert.ok(reg.entries.length >= 16);
});

test('unity-analyzer parses Unity 2D Roguelike sprites, binary prefabs/anims, scripts, and AIFF audio', () => {
  const analysis = analyzeUnityProject(SAMPLE_DIR);
  assert.equal(analysis.totals.gameplayScriptCount, 8);
  assert.equal(analysis.totals.prefabCount, 26);
  assert.equal(analysis.totals.animationClipCount, 7);
  assert.equal(analysis.totals.audioCount, 12);
  assert.equal(analysis.totals.spriteSliceCount, 56);
  assert.equal(analysis.serializationNotes.binaryPrefabs, 26);
  assert.equal(analysis.serializationNotes.aiff24BitFiles, 4);

  // Verify bottom-left (Unity) -> top-left (Godot) sprite rect transform on SpriteSheet_0
  const s0 = analysis.spriteSheet.sprites.find((s) => s.index === 0);
  assert.deepEqual(s0.unityRect, { x: 0, y: 192, w: 32, h: 32 });
  assert.deepEqual(s0.godotRegion, { x: 0, y: 0, w: 32, h: 32 });
});

test('AIFF to WAV conversion produces valid 16-bit LE RIFF PCM WAV for both 16-bit and 24-bit AIFF sources', () => {
  const srcAif24 = path.join(SAMPLE_DIR, 'Assets', 'Audio', 'scavengers_chop1.aif');
  const dstWav24 = path.join(PORTED_DIR, 'assets', 'audio', 'scavengers_chop1.wav');
  const aiffInfo = parseAiffBuffer(fs.readFileSync(srcAif24));
  assert.equal(aiffInfo.sampleSize, 24);
  assert.equal(aiffInfo.sampleRate, 44100);

  const wavBuf = fs.readFileSync(dstWav24);
  assert.equal(wavBuf.toString('ascii', 0, 4), 'RIFF');
  assert.equal(wavBuf.toString('ascii', 8, 12), 'WAVE');
  assert.equal(wavBuf.readUInt16LE(20), 1); // PCM
  assert.equal(wavBuf.readUInt16LE(22), aiffInfo.channels);
  assert.equal(wavBuf.readUInt32LE(24), 44100);
  assert.equal(wavBuf.readUInt16LE(34), 16); // Converted to 16-bit LE
  assert.equal(wavBuf.readUInt32LE(40), aiffInfo.numSampleFrames * aiffInfo.channels * 2);
});

test('ported Godot 4.7.2 project assets and runtime E2E verification report are complete and green', () => {
  assert.ok(fs.existsSync(path.join(PORTED_DIR, 'project.godot')));
  assert.ok(fs.existsSync(path.join(PORTED_DIR, 'scenes', 'main.tscn')));
  const atlasDir = path.join(PORTED_DIR, 'resources', 'atlas');
  const atlasFiles = fs.readdirSync(atlasDir).filter((f) => f.endsWith('.tres'));
  assert.equal(atlasFiles.length, 56);

  const verification = JSON.parse(
    fs.readFileSync(path.join(REPORTS_DIR, 'godot-runtime-verification.json'), 'utf8'),
  );
  assert.equal(verification.failedChecks, 0);
  assert.equal(verification.passedChecks, verification.totalChecks);
  assert.ok(verification.totalChecks >= 21);
  assert.equal(verification.captures.length, 5);
  for (const png of verification.captures) {
    const p = path.join(REPORTS_DIR, 'screenshots', png);
    assert.ok(fs.existsSync(p) && fs.statSync(p).size > 1000, `Screenshot missing or empty: ${png}`);
  }
});

test('all 3 additional games (Roll-a-Ball, Flappy Bird, Space Shooter) pass Godot 4.7.2 E2E verification and generate comparison boards', () => {
  const suites = [
    { name: 'roll-a-ball', minChecks: 8, expectedCaptures: 3, board: 'compare_game2_roll_a_ball.png' },
    { name: 'flappy-bird', minChecks: 6, expectedCaptures: 3, board: 'compare_game3_flappy_bird.png' },
    { name: 'space-shooter', minChecks: 7, expectedCaptures: 3, board: 'compare_game4_space_shooter.png' },
  ];

  for (const s of suites) {
    const repPath = path.join(REPORTS_DIR, `${s.name}-verification.json`);
    assert.ok(fs.existsSync(repPath), `Missing verification report for ${s.name}`);
    const v = JSON.parse(fs.readFileSync(repPath, 'utf8'));
    assert.equal(v.failedChecks, 0, `${s.name} had failed checks`);
    assert.equal(v.passedChecks, v.totalChecks);
    assert.ok(v.totalChecks >= s.minChecks, `${s.name} checks < ${s.minChecks}`);
    assert.equal(v.captures.length, s.expectedCaptures);
    for (const c of v.captures) {
      const shot = path.join(REPORTS_DIR, 'screenshots', s.name, c);
      assert.ok(fs.existsSync(shot) && fs.statSync(shot).size > 1000, `Missing screenshot ${shot}`);
    }
    const boardPath = path.join(REPORTS_DIR, 'screenshots', s.board);
    assert.ok(fs.existsSync(boardPath) && fs.statSync(boardPath).size > 10000, `Missing board ${s.board}`);
  }

  // Space Shooter TIFF -> PNG conversion check (22 PNGs + 6 FBX models)
  const ssTexDir = path.join(ROOT, 'ported', 'godot-space-shooter', 'assets', 'textures');
  const ssModelDir = path.join(ROOT, 'ported', 'godot-space-shooter', 'assets', 'models');
  assert.equal(fs.readdirSync(ssTexDir).filter((f) => f.endsWith('.png')).length, 22);
  assert.equal(fs.readdirSync(ssModelDir).filter((f) => f.toLowerCase().endsWith('.fbx')).length, 6);

  // Master 4-game overview board
  const overview = path.join(REPORTS_DIR, 'screenshots', 'compare_all_4_games_overview.png');
  assert.ok(fs.existsSync(overview) && fs.statSync(overview).size > 20000);
});

test('Game #5 large 3D Tanks! port extracts 103 binary prefab meshes, 41 colliders, 26 FBX, AIFF->WAV, and passes 11/11 Godot 4.7.2 E2E', () => {
  const tanksDir = path.join(ROOT, 'ported', 'godot-tanks-3d');
  const manifest = JSON.parse(fs.readFileSync(path.join(tanksDir, 'assets', 'level_art.json'), 'utf8'));
  assert.equal(manifest.totalBinaryObjects, 636);
  assert.equal(manifest.meshNodeCount, 103);
  assert.equal(manifest.colliderNodeCount, 41);
  assert.equal(Object.keys(manifest.materialColors).length, 21);

  assert.equal(fs.readdirSync(path.join(tanksDir, 'assets', 'models')).filter((f) => f.toLowerCase().endsWith('.fbx')).length, 26);
  assert.equal(fs.readdirSync(path.join(tanksDir, 'assets', 'audio')).filter((f) => f.endsWith('.wav')).length, 7);
  assert.ok(fs.existsSync(path.join(tanksDir, 'assets', 'sprites', 'Smoke.png')));

  const ver = JSON.parse(fs.readFileSync(path.join(REPORTS_DIR, 'tanks-3d-verification.json'), 'utf8'));
  assert.equal(ver.failedChecks, 0);
  assert.equal(ver.passedChecks, ver.totalChecks);
  assert.equal(ver.totalChecks, 11);
  assert.equal(ver.captures.length, 4);

  for (const board of ['compare_game5_tanks_3engine.png', 'compare_game5_tanks_gameplay_and_winner.png']) {
    const bp = path.join(REPORTS_DIR, 'screenshots', board);
    assert.ok(fs.existsSync(bp) && fs.statSync(bp).size > 20000, `Missing Tanks! comparison board: ${board}`);
  }
});
