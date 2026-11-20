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
