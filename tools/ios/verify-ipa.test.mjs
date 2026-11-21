import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  isBinaryPlist,
  isBlockedLiveHost,
  isExplicitlyDisabledPlistFlag,
  parseBinaryPlist,
  parsePlistBuffer,
  validateHubUrl,
  validateTeamId,
  verifyIpaBuffer
} from './verify-ipa.mjs';

const REPO_ROOT = resolve(import.meta.dirname, '..', '..');
const VALID_PRIVACY_XML = readFileSync(resolve(REPO_ROOT, 'ios/App/Resources/PrivacyInfo.xcprivacy'), 'utf8');

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
    local.writeUInt16LE(0, 8);
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

/**
 * Minimal Apple bplist00 encoder for test fixture generation.
 */
function encodeBinaryPlist(root) {
  const objects = [];

  function intern(val) {
    const idx = objects.length;
    objects.push(null);
    if (val === null) {
      objects[idx] = { kind: 'null' };
    } else if (typeof val === 'boolean') {
      objects[idx] = { kind: 'bool', value: val };
    } else if (typeof val === 'number') {
      objects[idx] = { kind: 'int', value: val };
    } else if (typeof val === 'string') {
      objects[idx] = { kind: 'string', value: val };
    } else if (Array.isArray(val)) {
      const refs = val.map(item => intern(item));
      objects[idx] = { kind: 'array', refs };
    } else if (typeof val === 'object') {
      const entries = Object.entries(val);
      const keyRefs = entries.map(([k]) => intern(k));
      const valRefs = entries.map(([, v]) => intern(v));
      objects[idx] = { kind: 'dict', keyRefs, valRefs };
    } else {
      throw new Error(`Unsupported value type in bplist encoder: ${typeof val}`);
    }
    return idx;
  }

  const topObject = intern(root);
  const numObjects = objects.length;
  const objectRefSize = numObjects < 256 ? 1 : 2;

  function encodeIntMarker(n) {
    if (n >= 0 && n <= 0xff) return Buffer.from([0x10, n]);
    if (n >= 0 && n <= 0xffff) {
      const b = Buffer.alloc(3);
      b[0] = 0x11;
      b.writeUInt16BE(n, 1);
      return b;
    }
    const b = Buffer.alloc(5);
    b[0] = 0x12;
    b.writeUInt32BE(n >>> 0, 1);
    return b;
  }

  function encodeHeader(typeNibble, count) {
    if (count < 15) return Buffer.from([(typeNibble << 4) | count]);
    return Buffer.concat([Buffer.from([(typeNibble << 4) | 0x0f]), encodeIntMarker(count)]);
  }

  function encodeRef(ref) {
    if (objectRefSize === 1) return Buffer.from([ref]);
    const b = Buffer.alloc(2);
    b.writeUInt16BE(ref, 0);
    return b;
  }

  const chunks = [Buffer.from('bplist00', 'ascii')];
  const offsets = [];
  let cursor = 8;

  for (const obj of objects) {
    offsets.push(cursor);
    let encoded;
    if (obj.kind === 'null') {
      encoded = Buffer.from([0x00]);
    } else if (obj.kind === 'bool') {
      encoded = Buffer.from([obj.value ? 0x09 : 0x08]);
    } else if (obj.kind === 'int') {
      encoded = encodeIntMarker(obj.value);
    } else if (obj.kind === 'string') {
      const isAscii = /^[\x00-\x7f]*$/.test(obj.value);
      if (isAscii) {
        const raw = Buffer.from(obj.value, 'ascii');
        encoded = Buffer.concat([encodeHeader(0x5, raw.length), raw]);
      } else {
        const le = Buffer.from(obj.value, 'utf16le');
        const be = Buffer.alloc(le.length);
        for (let i = 0; i < le.length; i += 2) {
          be[i] = le[i + 1];
          be[i + 1] = le[i];
        }
        encoded = Buffer.concat([encodeHeader(0x6, obj.value.length), be]);
      }
    } else if (obj.kind === 'array') {
      encoded = Buffer.concat([
        encodeHeader(0xa, obj.refs.length),
        ...obj.refs.map(encodeRef)
      ]);
    } else if (obj.kind === 'dict') {
      encoded = Buffer.concat([
        encodeHeader(0xd, obj.keyRefs.length),
        ...obj.keyRefs.map(encodeRef),
        ...obj.valRefs.map(encodeRef)
      ]);
    }
    chunks.push(encoded);
    cursor += encoded.length;
  }

  const offsetTableOffset = cursor;
  const offsetIntSize = offsetTableOffset < 256 ? 1 : offsetTableOffset < 65536 ? 2 : 4;
  const offsetTable = Buffer.alloc(numObjects * offsetIntSize);
  for (let i = 0; i < numObjects; i++) {
    if (offsetIntSize === 1) offsetTable[i] = offsets[i];
    else if (offsetIntSize === 2) offsetTable.writeUInt16BE(offsets[i], i * 2);
    else offsetTable.writeUInt32BE(offsets[i], i * 4);
  }
  chunks.push(offsetTable);

  const trailer = Buffer.alloc(32, 0);
  trailer[6] = offsetIntSize;
  trailer[7] = objectRefSize;
  trailer.writeBigUInt64BE(BigInt(numObjects), 8);
  trailer.writeBigUInt64BE(BigInt(topObject), 16);
  trailer.writeBigUInt64BE(BigInt(offsetTableOffset), 24);
  chunks.push(trailer);

  return Buffer.concat(chunks);
}

function findUnescapedDoubleSlashInXcconfig(content) {
  const violations = [];
  const lines = content.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    if (!trimmed || trimmed.startsWith('//') || trimmed.startsWith('#include')) continue;
    const eqIdx = trimmed.indexOf('=');
    const valuePart = eqIdx >= 0 ? trimmed.slice(eqIdx + 1) : trimmed;
    if (valuePart.includes('//')) {
      violations.push({ line: i + 1, text: trimmed });
    }
  }
  return violations;
}

const VALID_PRIVACY_OBJ = {
  NSPrivacyTracking: false,
  NSPrivacyTrackingDomains: [],
  NSPrivacyCollectedDataTypes: [],
  NSPrivacyAccessedAPITypes: [
    { NSPrivacyAccessedAPIType: 'NSPrivacyAccessedAPICategoryUserDefaults', NSPrivacyAccessedAPITypeReasons: ['CA92.1'] },
    { NSPrivacyAccessedAPIType: 'NSPrivacyAccessedAPICategoryFileTimestamp', NSPrivacyAccessedAPITypeReasons: ['C617.1'] },
    { NSPrivacyAccessedAPIType: 'NSPrivacyAccessedAPICategoryDiskSpace', NSPrivacyAccessedAPITypeReasons: ['E174.1'] },
    { NSPrivacyAccessedAPIType: 'NSPrivacyAccessedAPICategorySystemBootTime', NSPrivacyAccessedAPITypeReasons: ['35F9.1'] }
  ]
};

test('xcconfig files escape :// as :/$()/ so Xcode does not truncate URLs as comments', () => {
  // Self-check: detector catches unescaped //
  const syntheticBad = 'PLAYHUB_DEFAULT_HUB_URL = https://playhub.example.com\n// comment ok';
  assert.equal(findUnescapedDoubleSlashInXcconfig(syntheticBad).length, 1);

  const configDir = resolve(REPO_ROOT, 'ios/Config');
  const files = readdirSync(configDir).filter(f => f.endsWith('.xcconfig') || f.endsWith('.xcconfig.example'));
  const expectedFiles = [
    'Base.xcconfig',
    'Debug.xcconfig',
    'DebugFree.xcconfig',
    'Dev.xcconfig',
    'Test.xcconfig',
    'Release.xcconfig',
    'Live.xcconfig'
  ];
  for (const name of expectedFiles) {
    assert.ok(files.includes(name), `Expected xcconfig file missing: ${name}`);
  }

  for (const file of files) {
    const content = readFileSync(resolve(configDir, file), 'utf8');
    const violations = findUnescapedDoubleSlashInXcconfig(content);
    assert.deepEqual(
      violations,
      [],
      `${file} contains unescaped '//' in non-comment assignment: ${JSON.stringify(violations)}`
    );

    const urlMatch = content.match(/^PLAYHUB_DEFAULT_HUB_URL\s*=\s*(.+)$/m);
    assert.ok(urlMatch, `${file} must define PLAYHUB_DEFAULT_HUB_URL`);
    const rawVal = urlMatch[1].trim();
    assert.match(rawVal, /^https?:\/\$\(\)\/[^/\s]+/i, `${file} PLAYHUB_DEFAULT_HUB_URL must escape :// as :/$()/`);
    const expanded = rawVal.replace('/$()/', '//');
    const parsed = new URL(expanded);
    assert.ok(parsed.protocol === 'http:' || parsed.protocol === 'https:');
    assert.ok(parsed.hostname.length > 0);
  }
});

test('Gate 4 blocks string YES/true/1/unresolved/missing PlayHubAllowFarmSelector and allows explicit false/NO', () => {
  assert.equal(isExplicitlyDisabledPlistFlag(false), true);
  assert.equal(isExplicitlyDisabledPlistFlag('NO'), true);
  assert.equal(isExplicitlyDisabledPlistFlag('no'), true);
  assert.equal(isExplicitlyDisabledPlistFlag('false'), true);
  for (const unsafe of [true, 'YES', 'yes', 'Yes', 'true', 'TRUE', '1', 1, 0, '0', '', '$(PLAYHUB_ALLOW_FARM_SELECTOR)', undefined, null]) {
    assert.equal(isExplicitlyDisabledPlistFlag(unsafe), false, `Expected ${JSON.stringify(unsafe)} to be blocked`);
  }

  // XML with explicit string NO (matches Xcode Release.xcconfig / Live.xcconfig output) passes
  for (const [stage, bundleId] of [
    ['release', 'com.playhub.hub-ios.release'],
    ['live', 'com.playhub.gamedev.live']
  ]) {
    const passXml = `<?xml version="1.0" encoding="UTF-8"?>
<plist version="1.0"><dict>
  <key>CFBundleIdentifier</key><string>${bundleId}</string>
  <key>PlayHubAllowFarmSelector</key><string>NO</string>
</dict></plist>`;
    const passIpa = buildZip([
      { name: 'Payload/PlayHubApp.app/Info.plist', data: passXml },
      { name: 'Payload/PlayHubApp.app/PrivacyInfo.xcprivacy', data: VALID_PRIVACY_XML }
    ]);
    const res = verifyIpaBuffer(passIpa, { stage });
    assert.equal(res.ok, true, `${stage} with string NO should pass, got: ${res.failures.join('; ')}`);
  }

  // XML with unsafe string / integer / empty / missing PlayHubAllowFarmSelector must be blocked
  const unsafeSnippets = [
    '<key>PlayHubAllowFarmSelector</key><string>YES</string>',
    '<key>PlayHubAllowFarmSelector</key><string>yes</string>',
    '<key>PlayHubAllowFarmSelector</key><string>true</string>',
    '<key>PlayHubAllowFarmSelector</key><string>TRUE</string>',
    '<key>PlayHubAllowFarmSelector</key><string>1</string>',
    '<key>PlayHubAllowFarmSelector</key><string>$(PLAYHUB_ALLOW_FARM_SELECTOR)</string>',
    '<key>PlayHubAllowFarmSelector</key><string></string>',
    '<key>PlayHubAllowFarmSelector</key><string/>',
    '<key>PlayHubAllowFarmSelector</key><integer>1</integer>',
    '<key>PlayHubAllowFarmSelector</key><true/>',
    '' // missing key altogether
  ];

  for (const snippet of unsafeSnippets) {
    const badXml = `<?xml version="1.0" encoding="UTF-8"?>
<plist version="1.0"><dict>
  <key>CFBundleIdentifier</key><string>com.playhub.hub-ios.release</string>
  ${snippet}
</dict></plist>`;
    const ipa = buildZip([
      { name: 'Payload/PlayHubApp.app/Info.plist', data: badXml },
      { name: 'Payload/PlayHubApp.app/PrivacyInfo.xcprivacy', data: VALID_PRIVACY_XML }
    ]);
    const res = verifyIpaBuffer(ipa, { stage: 'release' });
    assert.equal(res.ok, false, `Expected failure for snippet: ${snippet || '<missing>'}`);
    assert.ok(
      res.failures.some(f => f.includes('PRODUCTION_LOCK_GATE') && f.includes('PlayHubAllowFarmSelector')),
      `Expected PRODUCTION_LOCK_GATE for ${snippet || '<missing>'}, got: ${res.failures.join('; ')}`
    );
  }
});

test('verify-ipa.mjs parses Apple binary plists (bplist00) and blocks production lockdown / Forge violations', () => {
  // Round-trip test including nested dict, array, UTF-16BE string, long ASCII string (>=15 bytes), int, bool
  const sampleObj = {
    CFBundleIdentifier: 'com.playhub.hub-ios.release',
    PlayHubAllowFarmSelector: 'NO',
    PlayHubDisplayLabel: '플레이허브 한글 테스트',
    LongKeyNameExceedingFifteenBytes: 'https://staging-farm.playhub.example.com',
    BuildNumber: 42,
    Enabled: false,
    Nested: { InnerFlag: true, Items: ['alpha', 'beta'] }
  };
  const bplistBuf = encodeBinaryPlist(sampleObj);
  assert.equal(isBinaryPlist(bplistBuf), true);
  const parsed = parseBinaryPlist(bplistBuf);
  assert.equal(parsed.CFBundleIdentifier, sampleObj.CFBundleIdentifier);
  assert.equal(parsed.PlayHubAllowFarmSelector, 'NO');
  assert.equal(parsed.PlayHubDisplayLabel, '플레이허브 한글 테스트');
  assert.equal(parsed.LongKeyNameExceedingFifteenBytes, sampleObj.LongKeyNameExceedingFifteenBytes);
  assert.equal(parsed.BuildNumber, 42);
  assert.equal(parsed.Enabled, false);
  assert.equal(parsed.Nested.InnerFlag, true);
  assert.deepEqual(parsed.Nested.Items, ['alpha', 'beta']);

  // Clean release IPA with BOTH Info.plist and PrivacyInfo.xcprivacy as bplist00 passes
  const cleanBinaryIpa = buildZip([
    {
      name: 'Payload/PlayHubApp.app/Info.plist',
      data: encodeBinaryPlist({
        CFBundleIdentifier: 'com.playhub.hub-ios.release',
        PlayHubAllowFarmSelector: 'NO'
      })
    },
    {
      name: 'Payload/PlayHubApp.app/PrivacyInfo.xcprivacy',
      data: encodeBinaryPlist(VALID_PRIVACY_OBJ)
    }
  ]);
  const pass = verifyIpaBuffer(cleanBinaryIpa, { stage: 'release' });
  assert.equal(pass.ok, true, `Clean bplist00 IPA should pass, got: ${pass.failures.join('; ')}`);

  // bplist00 Info.plist with string "YES" / "true" / "1" / bool true must be blocked
  for (const unsafeVal of ['YES', 'yes', 'true', '1', true]) {
    const unlockedBinIpa = buildZip([
      {
        name: 'Payload/PlayHubApp.app/Info.plist',
        data: encodeBinaryPlist({
          CFBundleIdentifier: 'com.playhub.hub-ios.release',
          PlayHubAllowFarmSelector: unsafeVal
        })
      },
      { name: 'Payload/PlayHubApp.app/PrivacyInfo.xcprivacy', data: encodeBinaryPlist(VALID_PRIVACY_OBJ) }
    ]);
    const res = verifyIpaBuffer(unlockedBinIpa, { stage: 'release' });
    assert.equal(res.ok, false, `bplist00 PlayHubAllowFarmSelector=${JSON.stringify(unsafeVal)} must fail`);
    assert.ok(res.failures.some(f => f.includes('PRODUCTION_LOCK_GATE')));
  }

  // bplist00 Info.plist with nested NSAppTransportSecurity.NSAllowsArbitraryLoads = true must be blocked
  const atsBinIpa = buildZip([
    {
      name: 'Payload/PlayHubApp.app/Info.plist',
      data: encodeBinaryPlist({
        CFBundleIdentifier: 'com.playhub.hub-ios.release',
        PlayHubAllowFarmSelector: 'NO',
        NSAppTransportSecurity: { NSAllowsArbitraryLoads: true }
      })
    },
    { name: 'Payload/PlayHubApp.app/PrivacyInfo.xcprivacy', data: encodeBinaryPlist(VALID_PRIVACY_OBJ) }
  ]);
  const atsFail = verifyIpaBuffer(atsBinIpa, { stage: 'release' });
  assert.equal(atsFail.ok, false);
  assert.ok(atsFail.failures.some(f => f.includes('PRODUCTION_LOCK_GATE') && f.includes('NSAllowsArbitraryLoads')));

  // bplist00 Info.plist with UTF-16BE Forge reference must be blocked by Gate 1
  const forgeBinIpa = buildZip([
    {
      name: 'Payload/PlayHubApp.app/Info.plist',
      data: encodeBinaryPlist({
        CFBundleIdentifier: 'com.playhub.hub-ios.release',
        PlayHubAllowFarmSelector: 'NO',
        CFBundleDisplayName: 'PlayForge에디터'
      })
    },
    { name: 'Payload/PlayHubApp.app/PrivacyInfo.xcprivacy', data: encodeBinaryPlist(VALID_PRIVACY_OBJ) }
  ]);
  const forgeFail = verifyIpaBuffer(forgeBinIpa, { stage: 'release' });
  assert.equal(forgeFail.ok, false);
  assert.ok(forgeFail.failures.some(f => f.includes('FORGE_EXCLUSION_GATE')));

  // Corrupted bplist00 Info.plist must fail closed (INFO_PLIST_INVALID)
  const corruptBinIpa = buildZip([
    { name: 'Payload/PlayHubApp.app/Info.plist', data: Buffer.from('bplist00corrupted-truncated-bytes', 'ascii') },
    { name: 'Payload/PlayHubApp.app/PrivacyInfo.xcprivacy', data: VALID_PRIVACY_XML }
  ]);
  const corruptFail = verifyIpaBuffer(corruptBinIpa, { stage: 'release' });
  assert.equal(corruptFail.ok, false);
  assert.ok(corruptFail.failures.some(f => f.includes('INFO_PLIST_INVALID')));
  assert.throws(() => parsePlistBuffer(Buffer.from('bplist00bad'), { allowPlutilFallback: false }));

  // bplist00 PrivacyInfo.xcprivacy with NSPrivacyTracking=true must fail Gate 6
  const badPrivBinIpa = buildZip([
    {
      name: 'Payload/PlayHubApp.app/Info.plist',
      data: encodeBinaryPlist({
        CFBundleIdentifier: 'com.playhub.hub-ios.release',
        PlayHubAllowFarmSelector: 'NO'
      })
    },
    {
      name: 'Payload/PlayHubApp.app/PrivacyInfo.xcprivacy',
      data: encodeBinaryPlist({ ...VALID_PRIVACY_OBJ, NSPrivacyTracking: true })
    }
  ]);
  const privFail = verifyIpaBuffer(badPrivBinIpa, { stage: 'release' });
  assert.equal(privFail.ok, false);
  assert.ok(privFail.failures.some(f => f.includes('PRIVACY_MANIFEST_GATE')));
});

test('validateTeamId and validateHubUrl reject injection payloads and Live hosts', () => {
  // Team ID validation
  assert.equal(validateTeamId('A1B2C3D4E5'), 'A1B2C3D4E5');
  for (const badTeam of [
    '',
    'abc1234567',
    'A1B2C3D4E',
    'A1B2C3D4E5F',
    'A1B2C3D4E5\nPLAYHUB_ALLOW_FARM_SELECTOR=YES',
    'A1B2-C3D45',
    '#include "X"'
  ]) {
    assert.throws(() => validateTeamId(badTeam), /INVALID_TEAM_ID/, `Expected Team ID rejection for ${JSON.stringify(badTeam)}`);
  }

  // Hub URL validation: valid dev/local/tunnel URLs
  assert.equal(validateHubUrl('http://127.0.0.1:18130'), 'http://127.0.0.1:18130');
  assert.equal(validateHubUrl('https://demo-tunnel.trycloudflare.com/'), 'https://demo-tunnel.trycloudflare.com');
  assert.equal(validateHubUrl('https://dev-farm1.playhub.example.com'), 'https://dev-farm1.playhub.example.com');
  assert.equal(validateHubUrl('https://staging-farm.playhub.example.com'), 'https://staging-farm.playhub.example.com');

  // Hub URL validation: injection / multiline / xcconfig directives
  for (const badUrl of [
    '',
    'ftp://dev-farm1.playhub.example.com',
    'file:///etc/passwd',
    'https://dev.example.com\nDEVELOPMENT_TEAM = EVIL000000',
    'https://dev.example.com\r#include "Evil.xcconfig"',
    'https://dev.example.com/#include',
    'https://dev.example.com/$(MALICIOUS)',
    'https://dev.example.com/${MALICIOUS}',
    'https://dev.example.com/a//b',
    'https://dev.example.com/a/*comment*/',
    'https://user:pass@dev.example.com',
    'https://dev.example.com?foo=bar',
    'https://dev.example.com with-space'
  ]) {
    assert.throws(() => validateHubUrl(badUrl), /INVALID_HUB_URL/, `Expected Hub URL rejection for ${JSON.stringify(badUrl)}`);
  }

  // Hub URL validation: Live hosts blocked
  for (const liveUrl of [
    'https://playhub.example.com',
    'https://playhub.example.com.',
    'https://www.playhub.example.com',
    'https://live.playhub.example.com',
    'https://prod.playhub.example.com',
    'https://playhub-live-kr.run.app',
    'https://playhub-prod-us.a.run.app'
  ]) {
    assert.equal(isBlockedLiveHost(new URL(liveUrl).hostname), true);
    assert.throws(() => validateHubUrl(liveUrl), /FORBIDDEN_LIVE_HOST/, `Expected Live host block for ${liveUrl}`);
  }
});

test('setup-free-usb.sh and build-ipa.sh use absolute pathToFileURL imports and strict input validation', () => {
  for (const scriptName of ['setup-free-usb.sh', 'build-ipa.sh']) {
    const scriptPath = resolve(REPO_ROOT, 'tools/ios', scriptName);
    const raw = readFileSync(scriptPath, 'utf8');
    assert.equal(raw.includes('\r\n'), false, `${scriptName} must use LF line endings`);
    assert.equal(raw.includes('import("./tools/ios/verify-ipa.mjs")'), false, `${scriptName} must not use relative verify-ipa.mjs import`);
    assert.ok(raw.includes('${REPO_ROOT}/tools/ios/verify-ipa.mjs'), `${scriptName} must reference \${REPO_ROOT}/tools/ios/verify-ipa.mjs`);
    assert.ok(raw.includes('pathToFileURL'), `${scriptName} must use pathToFileURL for absolute ESM import`);
    assert.ok(raw.includes('validateTeamId'), `${scriptName} must validate --team via validateTeamId`);
    assert.ok(raw.includes('validateHubUrl'), `${scriptName} must validate --hub-url via validateHubUrl`);
    assert.ok(raw.includes('^[A-Z0-9]{10}$'), `${scriptName} must enforce ^[A-Z0-9]{10}$ for --team`);
  }

  // Runtime check: invoking verify-ipa.mjs via `node -e` + pathToFileURL from a non-root CWD
  const verifyPath = resolve(REPO_ROOT, 'tools/ios/verify-ipa.mjs');
  const out = execFileSync(
    process.execPath,
    [
      '-e',
      'const { pathToFileURL } = require("node:url"); import(pathToFileURL(process.argv[1]).href).then(m => { console.log(m.expectedBundleId(process.argv[2], process.argv[3])); }).catch(err => { console.error(err.message); process.exit(1); });',
      verifyPath,
      'Hub-IOS',
      'release'
    ],
    { cwd: resolve(REPO_ROOT, 'ios'), encoding: 'utf8' }
  ).trim();
  assert.equal(out, 'com.playhub.hub-ios.release');
});

test('MainTabView.swift restricts age-gate retest button to DEBUG+allowFarmSelector and clears Keychain on farm switch', () => {
  const swift = readFileSync(resolve(REPO_ROOT, 'ios/App/UI/MainTabView.swift'), 'utf8');

  // Verify selectFarm deletes access_token and refresh_token from KeychainStore
  const selectFarmMatch = swift.match(/public func selectFarm\([\s\S]*?\n    \}/);
  assert.ok(selectFarmMatch, 'selectFarm function must exist');
  const selectFarmBody = selectFarmMatch[0];
  assert.ok(selectFarmBody.includes('KeychainStore.delete(forKey: "access_token")'), 'selectFarm must delete access_token');
  assert.ok(selectFarmBody.includes('KeychainStore.delete(forKey: "refresh_token")'), 'selectFarm must delete refresh_token');

  // Verify age-gate retest button is guarded inside #if DEBUG and if vm.allowFarmSelector
  assert.match(
    swift,
    /#if DEBUG\s+if vm\.allowFarmSelector\s*\{\s*Button\("연령 게이트 다시 테스트"\)[\s\S]*?\}\s*#endif/,
    'Age-gate retest button must be restricted inside #if DEBUG and if vm.allowFarmSelector'
  );
});
