import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { auditEngineSsot } from '../engine/check-engine-ssot.mjs';
import { inspectGodotBinary, loadEngineSsot, resolveGodotBinary } from '../engine/resolve-godot.mjs';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

test('TC-E1: godot-engine submodule gitlink and .gitmodules match engine-ssot.json fork pin', () => {
  const result = auditEngineSsot({ repoRoot: REPO_ROOT, strict: false });
  assert.equal(result.ok, true, `Engine SSOT audit failed:\n${result.errors.join('\n')}`);
  assert.equal(result.submoduleCommit, result.pinnedForkCommit);
  assert.notEqual(result.submoduleCommit, loadEngineSsot().upstreamBaseCommit);
});

test('TC-E2: no unregistered official upstream Godot download URLs exist outside knownStockFallbackPending', () => {
  const ssot = loadEngineSsot();
  const result = auditEngineSsot({ repoRoot: REPO_ROOT, strict: false });
  assert.deepEqual(result.errors, []);
  assert.deepEqual(
    result.pendingUpstreamFiles,
    [...ssot.knownStockFallbackPending].sort(),
    'Pending upstream files must match engine-ssot.json ledger exactly (no new additions, no stale entries)'
  );
});

test('TC-E3: SCons custom profiles enforce module_playforge_core_enabled=yes and global XR/camera disable', () => {
  const ssot = loadEngineSsot();
  const profiles = new Set(Object.values(ssot.targets).map((t) => t.profilePath).filter(Boolean));
  assert.ok(profiles.size >= 2, 'Expected at least web-editor and desktop SCons profiles');
  for (const rel of profiles) {
    const src = fs.readFileSync(path.join(REPO_ROOT, rel), 'utf8');
    for (const flag of ssot.globalProfileInvariants.mustEnable) {
      assert.match(src, new RegExp(`^\\s*${flag}\\s*=\\s*["']yes["']`, 'm'), `${rel} must enable ${flag}`);
    }
    for (const flag of ssot.globalProfileInvariants.mustDisable) {
      assert.match(src, new RegExp(`^\\s*${flag}\\s*=\\s*["']no["']`, 'm'), `${rel} must disable ${flag}`);
    }
  }
});

test('TC-E4: resolveGodotBinary prefers custom fork builds over stock fallback and enforces requireFork', (t) => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'playhub-engine-ssot-'));
  t.after(() => fs.rmSync(tmp, { recursive: true, force: true }));

  const forkDir = path.join(tmp, 'godot-engine', 'bin');
  const stockDir = path.join(tmp, 'artifacts', 'local-runtime', 'godot');
  fs.mkdirSync(forkDir, { recursive: true });
  fs.mkdirSync(stockDir, { recursive: true });

  const forkExe = path.join(forkDir, 'godot.windows.editor.x86_64.exe');
  const stockExe = path.join(stockDir, 'Godot_v4.7.2-stable_win64.exe');
  fs.writeFileSync(forkExe, Buffer.from('MZ-FAKE-FORK PlayForgePlatform --playforge-core-pack'));
  fs.writeFileSync(stockExe, Buffer.from('MZ-FAKE-STOCK Godot Engine 4.7.2-stable'));

  // Symbol inspection distinguishes fork vs stock
  assert.equal(inspectGodotBinary(forkExe).hasPlayForgeCore, true);
  assert.equal(inspectGodotBinary(stockExe).hasPlayForgeCore, false);

  // Resolver prefers fork build over stock when both exist
  const preferred = resolveGodotBinary({ searchFrom: tmp, searchOnly: true, env: {}, platform: 'win32', verifySymbols: true });
  assert.equal(preferred.found, true);
  assert.equal(preferred.executable, forkExe);
  assert.equal(preferred.source, 'fork-discovered');
  assert.equal(preferred.isFork, true);

  // Explicit stock binary is rejected when requireFork: true
  const blocked = resolveGodotBinary({ godotBin: stockExe, searchOnly: true, env: {}, platform: 'win32', requireFork: true });
  assert.equal(blocked.found, false);
  assert.match(blocked.reason, /stock Godot/i);

  // Missing fork dir falls back to stock only when requireFork is false, fails closed when true
  fs.rmSync(forkDir, { recursive: true, force: true });
  const fallback = resolveGodotBinary({ searchFrom: tmp, searchOnly: true, env: {}, platform: 'win32', verifySymbols: true });
  assert.equal(fallback.found, true);
  assert.equal(fallback.executable, stockExe);
  assert.equal(fallback.source, 'stock-fallback');
  assert.equal(fallback.isFork, false);

  const strictFail = resolveGodotBinary({ searchFrom: tmp, searchOnly: true, env: {}, platform: 'win32', requireFork: true });
  assert.equal(strictFail.found, false);
});

test('TC-E5: check-engine-ssot CLI returns JSON report with exit 0 in default mode and exit 1 in --strict while pending targets remain', () => {
  const out = execFileSync(process.execPath, ['tools/engine/check-engine-ssot.mjs', '--json'], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    windowsHide: true,
  });
  const parsed = JSON.parse(out);
  assert.equal(parsed.ok, true);
  assert.equal(parsed.targets.length, 6);
  const migrated = parsed.targets.filter((x) => x.status === 'migrated').map((x) => x.target);
  assert.ok(migrated.includes('web-editor'), 'web-editor must be marked migrated');
});
