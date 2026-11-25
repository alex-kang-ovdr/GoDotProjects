#!/usr/bin/env node
/**
 * Play Hub iOS IPA 6-Gate Security & Minimal-Footprint Verifier (Cross-platform Node 24).
 * Validates any .ipa (ZIP archive) against PlayHub iOS build rules:
 *   1. Forge exclusion gate (0 PlayForge / /forge/ / editor_bridge / godot_editor artifacts)
 *   2. Minimal footprint starter .pck gate (only <= 64 KiB bootstrap data.pck allowed; 0 starter game .pck)
 *   3. Bundle ID 4-segment Apple UTI rule (com.playhub.<branch-hyphen>.<stage>, no underscore, live trunk-only)
 *   4. Production lockdown gate (release/live must disable ALLOW_FARM_SELECTOR and ATS arbitrary loads)
 *   5. IPA download size budget gate (Stage 1 <= 30 MiB by default)
 *   6. Privacy Manifest gate (PrivacyInfo.xcprivacy present, NSPrivacyTracking=false, Required Reason APIs declared)
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, statSync } from 'node:fs';
import { inflateRawSync } from 'node:zlib';

const FORBIDDEN_PATTERN = /(playforge|\/forge\/|editor_bridge|godot_editor)/i;
const VALID_STAGES = new Set(['debug', 'dev', 'test', 'release', 'live']);
const REQUIRED_PRIVACY_APIS = [
  'NSPrivacyAccessedAPICategoryUserDefaults',
  'NSPrivacyAccessedAPICategoryFileTimestamp',
  'NSPrivacyAccessedAPICategoryDiskSpace',
  'NSPrivacyAccessedAPICategorySystemBootTime'
];

/**
 * Pure Node ZIP parser (no external dependencies, supports Store=0 and Deflate=8).
 */
export function readZipEntries(buffer) {
  let eocdOffset = -1;
  const minOffset = Math.max(0, buffer.length - 65557);
  for (let i = buffer.length - 22; i >= minOffset; i--) {
    if (buffer.readUInt32LE(i) === 0x06054b50) {
      eocdOffset = i;
      break;
    }
  }
  if (eocdOffset < 0) throw new Error('INVALID_ZIP: End of central directory signature not found');

  const totalEntries = buffer.readUInt16LE(eocdOffset + 10);
  const cdOffset = buffer.readUInt32LE(eocdOffset + 16);
  const entries = [];
  let cursor = cdOffset;

  for (let idx = 0; idx < totalEntries; idx++) {
    if (buffer.readUInt32LE(cursor) !== 0x02014b50) {
      throw new Error(`INVALID_ZIP: Bad central directory header at ${cursor}`);
    }
    const method = buffer.readUInt16LE(cursor + 10);
    const compressedSize = buffer.readUInt32LE(cursor + 20);
    const uncompressedSize = buffer.readUInt32LE(cursor + 24);
    const nameLen = buffer.readUInt16LE(cursor + 28);
    const extraLen = buffer.readUInt16LE(cursor + 30);
    const commentLen = buffer.readUInt16LE(cursor + 32);
    const localHeaderOffset = buffer.readUInt32LE(cursor + 42);
    const name = buffer.subarray(cursor + 46, cursor + 46 + nameLen).toString('utf8');
    cursor += 46 + nameLen + extraLen + commentLen;

    entries.push({
      name,
      method,
      compressedSize,
      uncompressedSize,
      localHeaderOffset,
      readData() {
        if (buffer.readUInt32LE(localHeaderOffset) !== 0x04034b50) {
          throw new Error(`INVALID_ZIP: Bad local file header for ${name}`);
        }
        const lNameLen = buffer.readUInt16LE(localHeaderOffset + 26);
        const lExtraLen = buffer.readUInt16LE(localHeaderOffset + 28);
        const dataStart = localHeaderOffset + 30 + lNameLen + lExtraLen;
        const raw = buffer.subarray(dataStart, dataStart + compressedSize);
        if (method === 0) return raw;
        if (method === 8) return inflateRawSync(raw);
        throw new Error(`UNSUPPORTED_ZIP_METHOD: ${method} for ${name}`);
      }
    });
  }
  return entries;
}

function decodePlistBufferToXml(buf) {
  if (buf.length >= 6 && buf.subarray(0, 6).toString('ascii') === 'bplist') {
    try {
      return execFileSync('plutil', ['-convert', 'xml1', '-o', '-', '--', '-'], {
        input: buf,
        encoding: 'utf8'
      });
    } catch {
      return buf.toString('utf8');
    }
  }
  return buf.toString('utf8');
}

/**
 * Minimal XML plist value reader for standard Apple Info.plist / PrivacyInfo.xcprivacy files.
 */
export function parseSimpleXmlPlist(xmlText) {
  const result = {};
  const keyValRe = /<key>([^<]+)<\/key>\s*(?:<string>([^<]*)<\/string>|<(true|false)\s*\/>|<integer>(-?\d+)<\/integer>)/g;
  let match;
  while ((match = keyValRe.exec(xmlText)) !== null) {
    const [, key, strVal, boolVal, intVal] = match;
    if (strVal !== undefined) result[key] = strVal;
    else if (boolVal !== undefined) result[key] = boolVal === 'true';
    else if (intVal !== undefined) result[key] = Number(intVal);
  }
  return result;
}

export function normalizeIosBranchSegment(rawBranch) {
  let s = String(rawBranch || '').trim().toLowerCase();
  if (!s || s === 'main' || s === 'master' || s === 'playhub-platform' || s === 'gamedev') {
    return 'gamedev';
  }
  s = s.replace(/[^a-z0-9]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
  if (!s) return 'gamedev';
  if (/^[0-9]/.test(s)) s = `b-${s}`;
  return s.slice(0, 32).replace(/-$/, '');
}

export function expectedBundleId(branchName, stage) {
  const normalizedStage = String(stage || '').trim().toLowerCase();
  if (!VALID_STAGES.has(normalizedStage)) {
    throw new Error(`INVALID_STAGE: ${stage}`);
  }
  const seg = normalizeIosBranchSegment(branchName);
  if (normalizedStage === 'live' && seg !== 'gamedev') {
    throw new Error(`LIVE_TRUNK_GUARD: 'live' stage is reserved for official trunk (gamedev), got branch '${branchName}' (${seg})`);
  }
  return `com.playhub.${seg}.${normalizedStage}`;
}

export function verifyIpaBuffer(ipaBuffer, options = {}) {
  const stage = String(options.stage || 'release').trim().toLowerCase();
  if (!VALID_STAGES.has(stage)) throw new Error(`INVALID_STAGE: ${stage}`);
  const maxIpaMiB = Number(options.maxIpaMiB ?? (stage === 'debug' || stage === 'dev' ? 35.0 : 30.0));
  const maxBootstrapPckBytes = Number(options.maxBootstrapPckBytes ?? 65536);

  const entries = readZipEntries(ipaBuffer);
  const failures = [];

  // Locate Payload/<App>.app/
  const appRoots = [...new Set(
    entries
      .map(e => e.name.match(/^(Payload\/[^/]+\.app\/)/)?.[1])
      .filter(Boolean)
  )];
  if (appRoots.length !== 1) {
    failures.push(`APP_BUNDLE_STRUCTURE: expected exactly 1 Payload/*.app/ bundle, found ${appRoots.length}`);
  }
  const appRoot = appRoots[0] || 'Payload/PlayHub.app/';

  // Gate 1: Forge exclusion (paths + text resources)
  const forgeHits = entries.filter(e => FORBIDDEN_PATTERN.test(e.name)).map(e => e.name);
  if (forgeHits.length > 0) {
    failures.push(`FORGE_EXCLUSION_GATE: forbidden entries found: ${forgeHits.join(', ')}`);
  }

  // Gate 2: Minimal footprint starter .pck gate (0 starter games; only <=64 KiB bootstrap data.pck allowed)
  const pckEntries = entries.filter(e => /\.pck$/i.test(e.name));
  for (const pck of pckEntries) {
    const rel = pck.name.startsWith(appRoot) ? pck.name.slice(appRoot.length) : pck.name;
    if (rel !== 'data.pck') {
      failures.push(`STARTER_PCK_GATE: unexpected bundled .pck '${pck.name}' (100% On-Demand policy)`);
    } else if (pck.uncompressedSize > maxBootstrapPckBytes) {
      failures.push(`STARTER_PCK_GATE: bootstrap data.pck too large (${pck.uncompressedSize} > ${maxBootstrapPckBytes} bytes)`);
    }
  }

  // Gate 3 & 4: Info.plist Bundle ID 4-segment Apple UTI rule + release/live lockdown
  const infoEntry = entries.find(e => e.name === `${appRoot}Info.plist`);
  let bundleId = null;
  let plistMap = {};
  if (!infoEntry) {
    failures.push(`INFO_PLIST_MISSING: ${appRoot}Info.plist not found`);
  } else {
    const xml = decodePlistBufferToXml(infoEntry.readData());
    if (FORBIDDEN_PATTERN.test(xml)) {
      failures.push('FORGE_EXCLUSION_GATE: forbidden Forge reference found inside Info.plist');
    }
    plistMap = parseSimpleXmlPlist(xml);
    bundleId = plistMap.CFBundleIdentifier || null;
    const bundleRe = new RegExp(`^com\\.playhub\\.[a-z][a-z0-9-]{0,31}\\.${stage}$`);
    if (!bundleId || !bundleRe.test(bundleId) || bundleId.includes('_')) {
      failures.push(`BUNDLE_ID_GATE: '${bundleId}' does not match Apple UTI rule ${bundleRe}`);
    }
    if (stage === 'live' && bundleId !== 'com.playhub.gamedev.live') {
      failures.push(`LIVE_TRUNK_GUARD: live build must use com.playhub.gamedev.live, got '${bundleId}'`);
    }
    if (stage === 'release' || stage === 'live') {
      const farmFlag = plistMap.PlayHubAllowFarmSelector;
      if (farmFlag === true || String(farmFlag || '').toUpperCase() === 'YES' || String(farmFlag || '').toLowerCase() === 'true') {
        failures.push(`PRODUCTION_LOCK_GATE: PlayHubAllowFarmSelector must be false/NO in '${stage}'`);
      }
      if (plistMap.NSAllowsArbitraryLoads === true) {
        failures.push(`PRODUCTION_LOCK_GATE: NSAllowsArbitraryLoads must not be true in '${stage}'`);
      }
    }
  }

  // Gate 5: IPA size budget
  const sizeMiB = Number((ipaBuffer.length / (1024 * 1024)).toFixed(2));
  if (sizeMiB > maxIpaMiB) {
    failures.push(`SIZE_BUDGET_GATE: IPA size ${sizeMiB} MiB exceeds budget ${maxIpaMiB} MiB`);
  }

  // Gate 6: PrivacyInfo.xcprivacy mandatory Apple privacy manifest check
  const privacyEntry = entries.find(e => e.name === `${appRoot}PrivacyInfo.xcprivacy`);
  if (!privacyEntry) {
    failures.push(`PRIVACY_MANIFEST_GATE: ${appRoot}PrivacyInfo.xcprivacy missing`);
  } else {
    const privXml = decodePlistBufferToXml(privacyEntry.readData());
    const privMap = parseSimpleXmlPlist(privXml);
    if (privMap.NSPrivacyTracking !== false) {
      failures.push('PRIVACY_MANIFEST_GATE: NSPrivacyTracking must be explicitly false');
    }
    for (const apiCat of REQUIRED_PRIVACY_APIS) {
      if (!privXml.includes(apiCat)) {
        failures.push(`PRIVACY_MANIFEST_GATE: missing Required Reason API category ${apiCat}`);
      }
    }
  }

  return {
    ok: failures.length === 0,
    stage,
    bundleId,
    sizeMiB,
    budgetMiB: maxIpaMiB,
    entryCount: entries.length,
    pckEntries: pckEntries.map(e => ({ name: e.name, bytes: e.uncompressedSize })),
    failures
  };
}

// CLI execution
if (import.meta.url === `file://${process.argv[1]?.replace(/\\/g, '/')}` || process.argv[1]?.endsWith('verify-ipa.mjs')) {
  const args = process.argv.slice(2);
  const ipaPath = args[0];
  const flag = (name, fallback) => {
    const i = args.indexOf(name);
    return i >= 0 ? args[i + 1] : fallback;
  };
  if (!ipaPath) {
    console.error('Usage: node tools/ios/verify-ipa.mjs <path/to/app.ipa> [--stage release] [--max-mib 30]');
    process.exit(2);
  }
  const buf = readFileSync(ipaPath);
  const report = verifyIpaBuffer(buf, {
    stage: flag('--stage', 'release'),
    maxIpaMiB: Number(flag('--max-mib', '30'))
  });
  console.log('=== Play Hub iOS IPA 6-Gate Verification Report ===');
  console.log(`Stage       : ${report.stage}`);
  console.log(`Bundle ID   : ${report.bundleId}`);
  console.log(`Artifact    : ${ipaPath} (${statSync(ipaPath).size} bytes / ${report.sizeMiB} MiB)`);
  console.log(`Size Budget : ${report.sizeMiB} MiB <= ${report.budgetMiB} MiB`);
  console.log(`PCK Entries : ${report.pckEntries.length} (${report.pckEntries.map(p => `${p.name}:${p.bytes}B`).join(', ') || 'none'})`);
  if (!report.ok) {
    for (const f of report.failures) console.error(`FAIL  ${f}`);
    process.exit(1);
  }
  console.log('ALL 6 IPA GATES: PASS');
}
