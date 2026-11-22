import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { analyzeUnityProject } from '../src/unity-analyzer.mjs';
import { parseAiffBuffer, convertAiffBufferToWav } from '../src/aiff-to-wav.mjs';
import { reportsPathsGd } from '../src/godot-harness-paths.mjs';
import { validateUnifiedIR } from '../common-ir/validators/validate-ir.mjs';
import {
  unityPositionToGodot,
  godotPositionToUnity,
  unityQuaternionToGodot,
  godotQuaternionToUnity,
  unityOrthoSizeToGodot,
  unitySpriteRectToGodotRegion,
  unityGammaColorToGodotLinear,
} from '../src/unity-transform.mjs';
import { compileUnityResourcesDeterministic } from '../src/deterministic-compilers.mjs';

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

test('Game #6 Unity Boss Room (Co-op 3D RPG) converts 28 TGA->PNG + unpacked MSE, 7 FBX/OBJ, 5 WAV, and passes 11/11 Godot 4.7.2 E2E', () => {
  const bossDir = path.join(ROOT, 'ported', 'godot-boss-room');
  assert.ok(fs.existsSync(path.join(bossDir, 'project.godot')));
  assert.ok(fs.existsSync(path.join(bossDir, 'scenes', 'boss_room.tscn')));
  assert.ok(fs.existsSync(path.join(bossDir, 'scripts', 'network_action_bus.gd')));

  const modelsDir = path.join(bossDir, 'assets', 'models');
  if (fs.existsSync(modelsDir)) {
    const models = fs.readdirSync(modelsDir).filter((f) => /\.(fbx|obj)$/i.test(f));
    assert.equal(models.length, 7);
    const pngs = fs.readdirSync(path.join(bossDir, 'assets', 'textures')).filter((f) => f.endsWith('.png'));
    assert.ok(pngs.length >= 38, `Expected >= 38 converted+unpacked PNG textures, got ${pngs.length}`);
    assert.ok(fs.existsSync(path.join(bossDir, 'assets', 'textures', 'env_deco_boss_arena_MetalSmoothEmissive_emissive.png')));
    assert.ok(fs.existsSync(path.join(bossDir, 'assets', 'textures', 'env_deco_boss_arena_MetalSmoothEmissive_roughness.png')));
    const wavs = fs.readdirSync(path.join(bossDir, 'assets', 'audio')).filter((f) => f.endsWith('.wav'));
    assert.equal(wavs.length, 5);
  }

  const ver = JSON.parse(fs.readFileSync(path.join(REPORTS_DIR, 'boss-room-verification.json'), 'utf8'));
  assert.equal(ver.failedChecks, 0);
  assert.equal(ver.passedChecks, ver.totalChecks);
  assert.equal(ver.totalChecks, 11);
  assert.equal(ver.captures.length, 5);
  assert.ok(ver.rpcDispatches >= 10);
  assert.ok(ver.bossStuns >= 1);

  for (const board of ['compare_game6_boss_room_before_after.jpg', 'compare_game6_boss_room_full_loop.jpg']) {
    const bp = path.join(REPORTS_DIR, 'screenshots', board);
    assert.ok(fs.existsSync(bp) && fs.statSync(bp).size > 20000, `Missing Boss Room board: ${board}`);
  }
});

/**
 * Helper: encode a positive integer sampleRate as IEEE 754 80-bit extended big-endian.
 */
function encodeExtended80BE(value) {
  const buf = Buffer.alloc(10);
  if (value === 0) return buf;
  let exp = Math.floor(Math.log2(value));
  let mant = value * Math.pow(2, 63 - exp);
  const hi = Math.floor(mant / 0x100000000);
  const lo = Math.floor(mant - hi * 0x100000000);
  buf.writeUInt16BE(exp + 16383, 0);
  buf.writeUInt32BE(hi >>> 0, 2);
  buf.writeUInt32BE(lo >>> 0, 6);
  return buf;
}

function buildSyntheticAiff({
  formType = 'AIFF',
  channels = 1,
  numSampleFrames = 4,
  sampleSize = 16,
  sampleRate = 44100,
  compressionType = 'NONE',
  commSizeOverride = null,
  ssndSizeOverride = null,
  soundOffset = 0,
  pcmBytes = Buffer.from([0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08]),
}) {
  const isAifc = formType === 'AIFC';
  const commPayload = isAifc
    ? Buffer.alloc(24)
    : Buffer.alloc(18);
  commPayload.writeInt16BE(channels, 0);
  commPayload.writeUInt32BE(numSampleFrames, 2);
  commPayload.writeInt16BE(sampleSize, 6);
  encodeExtended80BE(sampleRate).copy(commPayload, 8);
  if (isAifc) {
    commPayload.write(compressionType, 18, 4, 'ascii');
    commPayload.writeUInt8(0, 22); // empty Pascal string + pad
    commPayload.writeUInt8(0, 23);
  }
  const actualCommPayload = commSizeOverride !== null
    ? commPayload.subarray(0, commSizeOverride)
    : commPayload;
  const commChunk = Buffer.alloc(8 + actualCommPayload.length + (actualCommPayload.length % 2));
  commChunk.write('COMM', 0, 'ascii');
  commChunk.writeUInt32BE(commSizeOverride ?? actualCommPayload.length, 4);
  actualCommPayload.copy(commChunk, 8);

  const ssndBody = Buffer.alloc(8 + pcmBytes.length);
  ssndBody.writeUInt32BE(soundOffset, 0);
  ssndBody.writeUInt32BE(0, 4);
  pcmBytes.copy(ssndBody, 8);
  const ssndChunk = Buffer.alloc(8 + ssndBody.length + (ssndBody.length % 2));
  ssndChunk.write('SSND', 0, 'ascii');
  ssndChunk.writeUInt32BE(ssndSizeOverride ?? ssndBody.length, 4);
  ssndBody.copy(ssndChunk, 8);

  const header = Buffer.alloc(12);
  header.write('FORM', 0, 'ascii');
  header.writeUInt32BE(4 + commChunk.length + ssndChunk.length, 4);
  header.write(formType, 8, 'ascii');
  return Buffer.concat([header, commChunk, ssndChunk]);
}

test('aiff-to-wav validates AIFC compressionType and allows NONE/twos uncompressed PCM', () => {
  for (const comp of ['NONE', 'twos']) {
    const buf = buildSyntheticAiff({
      formType: 'AIFC',
      compressionType: comp,
      channels: 1,
      numSampleFrames: 2,
      sampleSize: 16,
      pcmBytes: Buffer.from([0x12, 0x34, 0x7f, 0x00]),
    });
    const parsed = parseAiffBuffer(buf);
    assert.equal(parsed.formType, 'AIFC');
    assert.equal(parsed.compressionType, comp);
    assert.equal(parsed.pcmLength, 4);

    const { wav, frames } = convertAiffBufferToWav(buf);
    assert.equal(frames, 2);
    assert.equal(wav.readInt16LE(44), 0x1234);
    assert.equal(wav.readInt16LE(46), 0x7f00);
  }

  for (const unsupported of ['sowt', 'ulaw', 'alaw', 'ima4', 'fl32']) {
    const buf = buildSyntheticAiff({ formType: 'AIFC', compressionType: unsupported });
    assert.throws(
      () => parseAiffBuffer(buf),
      /Unsupported AIFC compressionType/,
      `Expected AIFC ${unsupported} to be rejected`,
    );
    assert.throws(
      () => convertAiffBufferToWav(buf),
      /Unsupported AIFC compressionType/,
    );
  }

  const truncatedComm = buildSyntheticAiff({
    formType: 'AIFC',
    commSizeOverride: 18,
  });
  assert.throws(() => parseAiffBuffer(truncatedComm), /Truncated AIFC COMM chunk/);
});

test('aiff-to-wav clamps pcmLength when SSND size or soundOffset exceeds buffer bounds', () => {
  // 8-bit mono truncated buffer: declared 1000 bytes in SSND, only 3 bytes present
  const truncated8 = buildSyntheticAiff({
    channels: 1,
    numSampleFrames: 100,
    sampleSize: 8,
    ssndSizeOverride: 1008,
    pcmBytes: Buffer.from([0x10, 0x20, 0x7f]),
  });
  const parsed8 = parseAiffBuffer(truncated8);
  assert.equal(parsed8.pcmLength, 4); // 3 bytes + 1 even-padding byte in synthetic buffer
  const res8 = convertAiffBufferToWav(truncated8);
  assert.equal(res8.frames, 4);
  assert.equal(res8.wav.readInt16LE(44), 0x1000);
  assert.equal(res8.wav.readInt16LE(46), 0x2000);
  assert.equal(res8.wav.readInt16LE(48), 0x7f00);

  // 16-bit stereo truncated buffer: 6 bytes available -> clamped to 1 complete stereo frame (4 bytes)
  const truncatedStereo = buildSyntheticAiff({
    channels: 2,
    numSampleFrames: 50,
    sampleSize: 16,
    ssndSizeOverride: 500,
    pcmBytes: Buffer.from([0x01, 0x02, 0x03, 0x04, 0x05, 0x06]),
  });
  const parsedStereo = parseAiffBuffer(truncatedStereo);
  assert.equal(parsedStereo.pcmLength, 6);
  const resStereo = convertAiffBufferToWav(truncatedStereo);
  assert.equal(resStereo.frames, 1);
  assert.equal(resStereo.wav.readUInt32LE(40), 4);
  assert.equal(resStereo.wav.readInt16LE(44), 0x0102);
  assert.equal(resStereo.wav.readInt16LE(46), 0x0304);

  // soundOffset beyond buffer end -> pcmLength clamped to 0, produces valid empty WAV
  const badOffset = buildSyntheticAiff({
    channels: 1,
    numSampleFrames: 10,
    sampleSize: 16,
    soundOffset: 9999,
    pcmBytes: Buffer.from([0x01, 0x02]),
  });
  const parsedBadOffset = parseAiffBuffer(badOffset);
  assert.equal(parsedBadOffset.pcmLength, 0);
  const resEmpty = convertAiffBufferToWav(badOffset);
  assert.equal(resEmpty.frames, 0);
  assert.equal(resEmpty.wav.length, 44);
});

test('port scripts, Tanks parser, and committed verify_and_capture.gd contain no hardcoded absolute paths', () => {
  const checkedFiles = [
    path.join(ROOT, 'src', 'godot-harness-paths.mjs'),
    path.join(ROOT, 'src', 'unity-transform.mjs'),
    path.join(ROOT, 'src', 'unity-ir-extractor.mjs'),
    path.join(ROOT, 'src', 'deterministic-compilers.mjs'),
    path.join(ROOT, 'src', 'orchestrator.mjs'),
    path.join(ROOT, 'src', 'port-cli.mjs'),
    path.join(ROOT, 'common-ir', 'validators', 'validate-ir.mjs'),
    path.join(ROOT, 'src', 'port-tanks.mjs'),
    path.join(ROOT, 'src', 'port-boss-room.mjs'),
    path.join(ROOT, 'src', 'port-flappy-bird.mjs'),
    path.join(ROOT, 'src', 'port-roll-a-ball.mjs'),
    path.join(ROOT, 'src', 'port-space-shooter.mjs'),
    path.join(ROOT, 'src', 'parse_unity_tanks_level.py'),
    path.join(ROOT, 'ported', 'godot-2d-roguelike', 'tests', 'verify_and_capture.gd'),
    path.join(ROOT, 'ported', 'godot-flappy-bird', 'tests', 'verify_and_capture.gd'),
    path.join(ROOT, 'ported', 'godot-roll-a-ball', 'tests', 'verify_and_capture.gd'),
    path.join(ROOT, 'ported', 'godot-space-shooter', 'tests', 'verify_and_capture.gd'),
    path.join(ROOT, 'ported', 'godot-tanks-3d', 'tests', 'verify_and_capture.gd'),
    path.join(ROOT, 'ported', 'godot-boss-room', 'tests', 'verify_and_capture.gd'),
  ];

  for (const file of checkedFiles) {
    const text = fs.readFileSync(file, 'utf8');
    assert.doesNotMatch(
      text,
      /(?:^|[\s"'`(=,])[A-Za-z]:[\\/][A-Za-z0-9_.-]|GoDotProjects/i,
      `Hardcoded absolute path found in ${path.relative(ROOT, file)}`,
    );
  }

  // Verify each committed verify_and_capture.gd matches reportsPathsGd() helper output
  const harnessExpectations = [
    ['godot-2d-roguelike', '', 'godot-runtime-verification.json'],
    ['godot-flappy-bird', 'flappy-bird', 'flappy-bird-verification.json'],
    ['godot-roll-a-ball', 'roll-a-ball', 'roll-a-ball-verification.json'],
    ['godot-space-shooter', 'space-shooter', 'space-shooter-verification.json'],
    ['godot-tanks-3d', 'tanks-3d', 'tanks-3d-verification.json'],
    ['godot-boss-room', 'boss-room', 'boss-room-verification.json'],
  ];
  for (const [gameDir, subdir, reportFile] of harnessExpectations) {
    const gd = fs.readFileSync(path.join(ROOT, 'ported', gameDir, 'tests', 'verify_and_capture.gd'), 'utf8')
      .replace(/\r\n/g, '\n');
    const expectedHeader = reportsPathsGd(subdir, reportFile);
    assert.ok(
      gd.includes(expectedHeader),
      `${gameDir}/tests/verify_and_capture.gd does not match reportsPathsGd()`,
    );
  }

  // Verify parse_unity_tanks_level.py runs cleanly via relative/CONVERTER_ROOT pathing
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tanks-parser-'));
  try {
    const outJson = path.join(tmpDir, 'out.json');
    execFileSync(
      'python',
      [
        path.join(ROOT, 'src', 'parse_unity_tanks_level.py'),
        path.join(ROOT, 'samples', 'unity-tanks', 'Assets'),
        outJson,
      ],
      { stdio: 'pipe' },
    );
    const extracted = JSON.parse(fs.readFileSync(outJson, 'utf8'));
    assert.equal(extracted.meshNodeCount, 103);
    assert.equal(extracted.colliderNodeCount, 41);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('unity-transform.mjs coordinate, quaternion, ortho, sprite, and Gamma->Linear transforms are exact and bijective', () => {
  const pos = [3.25, 1.5, -7.75];
  assert.deepEqual(unityPositionToGodot(pos), [3.25, 1.5, 7.75]);
  assert.deepEqual(godotPositionToUnity(unityPositionToGodot(pos)), pos);

  const q = [0.1, 0.2, 0.3, 0.927362];
  assert.deepEqual(unityQuaternionToGodot(q), [-0.1, -0.2, 0.3, 0.927362]);
  assert.deepEqual(godotQuaternionToUnity(unityQuaternionToGodot(q)), q);

  assert.equal(unityOrthoSizeToGodot(11.5), 23);
  assert.deepEqual(unitySpriteRectToGodotRegion({ x: 0, y: 192, w: 32, h: 32 }, 224), { x: 0, y: 0, w: 32, h: 32 });

  const lin = unityGammaColorToGodotLinear([1.0, 0.5, 0.0, 1.0]);
  assert.equal(lin[0], 1);
  assert.ok(lin[1] > 0.21 && lin[1] < 0.22);
  assert.equal(lin[2], 0);
  assert.equal(lin[3], 1);
});

test('Deterministic Unity pipeline produces valid Unified IR v0.1, idempotent compiles, 100% scorecard, JPG boards, and unity-boss-room PlayForge template', () => {
  const orchPath = path.join(ROOT, 'audit', 'unity-orchestration-report.json');
  assert.ok(fs.existsSync(orchPath), 'Missing audit/unity-orchestration-report.json');
  const orch = JSON.parse(fs.readFileSync(orchPath, 'utf8'));
  assert.equal(orch.all_gates_passed, true);
  assert.equal(orch.completeness_scorecard.samples_audited, 6);
  assert.equal(orch.completeness_scorecard.failed_unsupported, 0);
  assert.equal(orch.completeness_scorecard.usable_in_godot_pct, 100);
  assert.equal(orch.default_image_format, 'jpg_progressive_q84_max1400');

  // Verify Unified Game IR v0.1 schema validity & byte-identical idempotency on Boss Room
  const bossDir = path.join(ROOT, 'ported', 'godot-boss-room');
  const bossIr = JSON.parse(fs.readFileSync(path.join(bossDir, 'extracted', 'unified-ir.v0.1.json'), 'utf8'));
  const val = validateUnifiedIR(bossIr);
  assert.equal(val.valid, true, `Boss Room IR errors: ${val.errors.join(', ')}`);
  assert.equal(bossIr.source.engine, 'unity');
  assert.equal(bossIr.units.coordinate_system, 'godot_3d');

  compileUnityResourcesDeterministic(bossDir);
  const secondPass = compileUnityResourcesDeterministic(bossDir);
  assert.equal(secondPass.filesWritten, 0, 'Deterministic compiler must be byte-identical idempotent');
  assert.ok(fs.existsSync(path.join(bossDir, 'assets', 'materials', 'env_deco_boss_arena.tres')));
  assert.ok(fs.existsSync(path.join(bossDir, 'assets', 'shaders', 'env_deco_boss_arena_rune_pulse.gdshader')));

  // Verify compressed JPG comparison boards exist and stay lightweight (< 600 KB)
  for (const jpg of ['compare_game6_boss_room_before_after.jpg', 'compare_game6_boss_room_full_loop.jpg']) {
    const p = path.join(REPORTS_DIR, 'screenshots', jpg);
    assert.ok(fs.existsSync(p), `Missing compressed JPG board: ${jpg}`);
    const sz = fs.statSync(p).size;
    assert.ok(sz > 20000 && sz < 600000, `Unexpected JPG size for ${jpg}: ${sz} bytes`);
  }

  // Verify PlayForge text-only template forge/Templates/unity-boss-room/
  const tplDir = path.resolve(ROOT, '..', '..', 'forge', 'Templates', 'unity-boss-room');
  assert.ok(fs.existsSync(path.join(tplDir, 'metadata.json')));
  assert.ok(fs.existsSync(path.join(tplDir, 'project.godot')));
  assert.ok(fs.existsSync(path.join(tplDir, 'scenes', 'main.tscn')));
  const tplMeta = JSON.parse(fs.readFileSync(path.join(tplDir, 'metadata.json'), 'utf8'));
  assert.equal(tplMeta.id, 'unity-boss-room');
  assert.equal(tplMeta.dimension, '3d');
});
