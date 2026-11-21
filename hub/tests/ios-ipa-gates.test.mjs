import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  expectedBundleId,
  normalizeIosBranchSegment,
  verifyIpaBuffer
} from '../../tools/ios/verify-ipa.mjs';
import { packBootstrapDirectory } from '../../tools/ios/pack-bootstrap.mjs';

const REPO_ROOT = resolve(import.meta.dirname, '..', '..');

// Minimal Store (method=0) ZIP builder for synthetic IPA gate verification tests
function buildZip(files) {
  const localParts = [];
  const centralParts = [];
  let offset = 0;

  for (const { name, data } of files) {
    const nameBuf = Buffer.from(name, 'utf8');
    const dataBuf = Buffer.isBuffer(data) ? data : Buffer.from(data, 'utf8');

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0, 8); // store
    local.writeUInt32LE(dataBuf.length, 18);
    local.writeUInt32LE(dataBuf.length, 22);
    local.writeUInt16LE(nameBuf.length, 26);
    localParts.push(local, nameBuf, dataBuf);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0, 10);
    central.writeUInt32LE(dataBuf.length, 20);
    central.writeUInt32LE(dataBuf.length, 24);
    central.writeUInt16LE(nameBuf.length, 28);
    central.writeUInt32LE(offset, 42);
    centralParts.push(central, nameBuf);

    offset += local.length + nameBuf.length + dataBuf.length;
  }

  const cdBuf = Buffer.concat(centralParts);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(files.length, 8);
  eocd.writeUInt16LE(files.length, 10);
  eocd.writeUInt32LE(cdBuf.length, 12);
  eocd.writeUInt32LE(offset, 16);

  return Buffer.concat([...localParts, cdBuf, eocd]);
}

const VALID_PRIVACY = readFileSync(resolve(REPO_ROOT, 'ios/App/Resources/PrivacyInfo.xcprivacy'), 'utf8');

function makeInfoPlist({ bundleId = 'com.playhub.hub-ios.release', allowFarm = false, arbitraryLoads = false } = {}) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<plist version="1.0"><dict>
  <key>CFBundleIdentifier</key><string>${bundleId}</string>
  <key>PlayHubAllowFarmSelector</key><${allowFarm ? 'true' : 'false'}/>
  <key>NSAllowsArbitraryLoads</key><${arbitraryLoads ? 'true' : 'false'}/>
</dict></plist>`;
}

test('Apple UTI Bundle ID normalization & live trunk-only guard', () => {
  assert.equal(normalizeIosBranchSegment('Hub-IOS'), 'hub-ios');
  assert.equal(normalizeIosBranchSegment('PlayHub-Platform'), 'gamedev');
  assert.equal(normalizeIosBranchSegment('2026_hotfix/test'), 'b-2026-hotfix-test');
  assert.equal(expectedBundleId('Hub-IOS', 'release'), 'com.playhub.hub-ios.release');
  assert.equal(expectedBundleId('PlayHub-Platform', 'live'), 'com.playhub.gamedev.live');
  assert.throws(() => expectedBundleId('Hub-IOS', 'live'), /LIVE_TRUNK_GUARD/);
});

test('IPA 6-gate verifier accepts clean release IPA and blocks every policy violation', () => {
  const validIpa = buildZip([
    { name: 'Payload/PlayHubApp.app/Info.plist', data: makeInfoPlist() },
    { name: 'Payload/PlayHubApp.app/PrivacyInfo.xcprivacy', data: VALID_PRIVACY },
    { name: 'Payload/PlayHubApp.app/data.pck', data: Buffer.alloc(1536, 0x41) }
  ]);
  const pass = verifyIpaBuffer(validIpa, { stage: 'release', maxIpaMiB: 30 });
  assert.equal(pass.ok, true, pass.failures.join('; '));
  assert.equal(pass.bundleId, 'com.playhub.hub-ios.release');

  // Gate 1: Forge exclusion failure
  const forgeIpa = buildZip([
    { name: 'Payload/PlayHubApp.app/Info.plist', data: makeInfoPlist() },
    { name: 'Payload/PlayHubApp.app/PrivacyInfo.xcprivacy', data: VALID_PRIVACY },
    { name: 'Payload/PlayHubApp.app/PlayForgeEditor.js', data: 'forbidden' }
  ]);
  const forgeFail = verifyIpaBuffer(forgeIpa, { stage: 'release' });
  assert.equal(forgeFail.ok, false);
  assert.ok(forgeFail.failures.some(f => f.includes('FORGE_EXCLUSION_GATE')));

  // Gate 2: Starter .pck failure
  const starterPckIpa = buildZip([
    { name: 'Payload/PlayHubApp.app/Info.plist', data: makeInfoPlist() },
    { name: 'Payload/PlayHubApp.app/PrivacyInfo.xcprivacy', data: VALID_PRIVACY },
    { name: 'Payload/PlayHubApp.app/survivor-arena-g2.pck', data: Buffer.alloc(128) }
  ]);
  const pckFail = verifyIpaBuffer(starterPckIpa, { stage: 'release' });
  assert.equal(pckFail.ok, false);
  assert.ok(pckFail.failures.some(f => f.includes('STARTER_PCK_GATE')));

  // Gate 3: Underscore in Apple Bundle ID failure
  const badIdIpa = buildZip([
    { name: 'Payload/PlayHubApp.app/Info.plist', data: makeInfoPlist({ bundleId: 'com.playhub.hub_ios.release' }) },
    { name: 'Payload/PlayHubApp.app/PrivacyInfo.xcprivacy', data: VALID_PRIVACY }
  ]);
  const idFail = verifyIpaBuffer(badIdIpa, { stage: 'release' });
  assert.equal(idFail.ok, false);
  assert.ok(idFail.failures.some(f => f.includes('BUNDLE_ID_GATE')));

  // Gate 4: Production Farm & ATS lockdown failure
  const unlockedProdIpa = buildZip([
    { name: 'Payload/PlayHubApp.app/Info.plist', data: makeInfoPlist({ allowFarm: true, arbitraryLoads: true }) },
    { name: 'Payload/PlayHubApp.app/PrivacyInfo.xcprivacy', data: VALID_PRIVACY }
  ]);
  const lockFail = verifyIpaBuffer(unlockedProdIpa, { stage: 'release' });
  assert.equal(lockFail.ok, false);
  assert.equal(lockFail.failures.filter(f => f.includes('PRODUCTION_LOCK_GATE')).length, 2);

  // Gate 6: Missing PrivacyInfo.xcprivacy failure
  const noPrivacyIpa = buildZip([
    { name: 'Payload/PlayHubApp.app/Info.plist', data: makeInfoPlist() }
  ]);
  const privFail = verifyIpaBuffer(noPrivacyIpa, { stage: 'release' });
  assert.equal(privFail.ok, false);
  assert.ok(privFail.failures.some(f => f.includes('PRIVACY_MANIFEST_GATE')));
});

test('Locked Godot 4.7.2 iOS XCFramework metadata matches fixed fork and excludes MoltenVK', () => {
  const lock = JSON.parse(readFileSync(resolve(REPO_ROOT, 'tools/ios/godot-xcframework.lock.json'), 'utf8'));
  assert.equal(lock.godotVersion, '4.7.2-stable');
  assert.equal(lock.forkCommit, 'ed1daf0bf001b61586d9930840f2f1394092c079');
  assert.ok(lock.excluded.includes('MoltenVK.xcframework'));
  assert.match(lock.slices.iosArm64.sha256, /^[0-9a-f]{64}$/);
  assert.match(lock.slices.iosSimulator.sha256, /^[0-9a-f]{64}$/);
});

test('Pure-Node bootstrap packer emits valid <=64KiB Godot 4.7.2 GDPC v3 pack', () => {
  const pck = packBootstrapDirectory(resolve(REPO_ROOT, 'ios/App/Resources/Bootstrap'));
  assert.ok(pck.length > 128 && pck.length <= 65536, `unexpected bootstrap size: ${pck.length}`);
  assert.equal(pck.subarray(0, 4).toString('ascii'), 'GDPC');
  assert.equal(pck.readUInt32LE(4), 3); // PACK_FORMAT_VERSION_V3
  assert.equal(pck.readUInt32LE(8), 4); // major
  assert.equal(pck.readUInt32LE(12), 7); // minor
  assert.equal(pck.readUInt32LE(16), 2); // patch
  assert.equal(pck.readUInt32LE(20), 2); // PACK_REL_FILEBASE
  const dirOffset = Number(pck.readBigUInt64LE(32));
  assert.equal(pck.readUInt32LE(dirOffset), 4); // 4 bootstrap files, 0 starter games
});

test('Free Apple ID ($0) USB configuration omits all paid-only entitlements', () => {
  const freeEnt = readFileSync(resolve(REPO_ROOT, 'ios/App/Resources/PlayHub-Free.entitlements'), 'utf8');
  for (const paidKey of [
    'com.apple.developer.applesignin',
    'com.apple.developer.associated-domains',
    'aps-environment',
    'appattest'
  ]) {
    assert.equal(freeEnt.includes(paidKey), false, `Free entitlements must not contain paid capability: ${paidKey}`);
  }

  const debugFreeCfg = readFileSync(resolve(REPO_ROOT, 'ios/Config/DebugFree.xcconfig'), 'utf8');
  assert.match(debugFreeCfg, /CODE_SIGN_ENTITLEMENTS\s*=\s*App\/Resources\/PlayHub-Free\.entitlements/);
  assert.match(debugFreeCfg, /INFOPLIST_FILE\s*=\s*App\/Resources\/Info-Free\.plist/);
  assert.match(debugFreeCfg, /PLAYHUB_FREE_USB/);
  assert.match(debugFreeCfg, /#include\?\s*"LocalFree\.xcconfig"/);

  const infoFree = readFileSync(resolve(REPO_ROOT, 'ios/App/Resources/Info-Free.plist'), 'utf8');
  assert.match(infoFree, /<key>PlayHubFreeUsbMode<\/key>\s*<true\s*\/>/);
  assert.match(infoFree, /<key>NSAllowsLocalNetworking<\/key>\s*<true\s*\/>/);
  assert.equal(infoFree.includes('NSAllowsArbitraryLoads'), false);

  const projectYml = readFileSync(resolve(REPO_ROOT, 'ios/project.yml'), 'utf8');
  assert.match(projectYml, /DebugFree:\s*Config\/DebugFree\.xcconfig/);
  assert.match(projectYml, /PlayHubAppFree:/);
});
