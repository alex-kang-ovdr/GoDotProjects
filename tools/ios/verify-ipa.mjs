#!/usr/bin/env node
/**
 * Play Hub iOS IPA 6-Gate Security & Minimal-Footprint Verifier (Cross-platform Node 22/24).
 * Validates any .ipa (ZIP archive) against PlayHub iOS build rules:
 *   1. Forge exclusion gate (0 PlayForge / /forge/ / editor_bridge / godot_editor artifacts)
 *   2. Minimal footprint starter .pck gate (only <= 64 KiB bootstrap data.pck allowed; 0 starter game .pck)
 *   3. Bundle ID 4-segment Apple UTI rule (com.playhub.<branch-hyphen>.<stage>, no underscore, live trunk-only)
 *   4. Production lockdown gate (release/live must explicitly disable PlayHubAllowFarmSelector and ATS arbitrary loads)
 *   5. IPA download size budget gate (Stage 1 <= 30 MiB by default)
 *   6. Privacy Manifest gate (PrivacyInfo.xcprivacy present, NSPrivacyTracking=false, Required Reason APIs declared)
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { inflateRawSync } from 'node:zlib';

const FORBIDDEN_PATTERN = /(playforge|\/forge\/|editor_bridge|godot_editor)/i;
const VALID_STAGES = new Set(['debug', 'dev', 'test', 'release', 'live']);
const REQUIRED_PRIVACY_APIS = [
  'NSPrivacyAccessedAPICategoryUserDefaults',
  'NSPrivacyAccessedAPICategoryFileTimestamp',
  'NSPrivacyAccessedAPICategoryDiskSpace',
  'NSPrivacyAccessedAPICategorySystemBootTime'
];

const TEAM_ID_RE = /^[A-Z0-9]{10}$/;
const BLOCKED_LIVE_HOST_PATTERNS = [
  /^playhub\.example\.com$/i,
  /^www\.playhub\.example\.com$/i,
  /^api\.playhub\.example\.com$/i,
  /(^|\.)live\.playhub\./i,
  /(^|\.)prod\.playhub\./i,
  /(^|\.)production\.playhub\./i,
  /(^|\.)playhub-live(?:-[a-z0-9-]+)?\./i,
  /(^|\.)playhub-prod(?:-[a-z0-9-]+)?\./i,
  /^live-[a-z0-9-]*playhub\./i
];

const MAX_BPLIST_OBJECTS = 1_000_000;
const MAX_BPLIST_DEPTH = 64;
const UTF16BE_DECODER = new TextDecoder('utf-16be');

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

/**
 * Minimal XML plist value reader for standard Apple Info.plist / PrivacyInfo.xcprivacy files.
 */
export function parseSimpleXmlPlist(xmlText) {
  const result = Object.create(null);
  const keyValRe = /<key>([^<]+)<\/key>\s*(?:<string>([^<]*)<\/string>|<string\s*\/>|<(true|false)\s*\/>|<integer>(-?\d+)<\/integer>)/g;
  let match;
  while ((match = keyValRe.exec(xmlText)) !== null) {
    const [full, key, strVal, boolVal, intVal] = match;
    if (strVal !== undefined) result[key] = strVal;
    else if (boolVal !== undefined) result[key] = boolVal === 'true';
    else if (intVal !== undefined) result[key] = Number(intVal);
    else if (/<string\s*\/>$/.test(full)) result[key] = '';
  }
  return result;
}

export function isBinaryPlist(buffer) {
  return Buffer.isBuffer(buffer) && buffer.length >= 8 && buffer.subarray(0, 6).toString('ascii') === 'bplist';
}

function readUIntBE(buf, offset, byteLen) {
  if (offset < 0 || offset + byteLen > buf.length) {
    throw new Error('INVALID_BPLIST: unexpected EOF while reading integer');
  }
  if (byteLen === 1) return buf[offset];
  if (byteLen === 2) return buf.readUInt16BE(offset);
  if (byteLen === 4) return buf.readUInt32BE(offset);
  if (byteLen === 8) {
    const val = buf.readBigUInt64BE(offset);
    if (val > BigInt(Number.MAX_SAFE_INTEGER)) {
      throw new Error('INVALID_BPLIST: 64-bit integer exceeds safe JS integer range');
    }
    return Number(val);
  }
  let acc = 0n;
  for (let i = 0; i < byteLen; i++) {
    acc = (acc << 8n) | BigInt(buf[offset + i]);
  }
  if (acc > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new Error('INVALID_BPLIST: integer exceeds safe JS integer range');
  }
  return Number(acc);
}

/**
 * Pure JS minimal Apple Binary Property List (bplist00) parser.
 * Supports null, bool, int, real, date, data, ASCII/UTF-16BE/UTF-8 strings, UID, array, set, dict.
 */
export function parseBinaryPlist(input) {
  const buffer = Buffer.isBuffer(input) ? input : Buffer.from(input);
  if (buffer.length < 40) {
    throw new Error('INVALID_BPLIST: buffer too short');
  }
  const magic = buffer.subarray(0, 8).toString('ascii');
  if (magic !== 'bplist00') {
    throw new Error(`INVALID_BPLIST: unsupported magic '${magic}'`);
  }

  const trailerOffset = buffer.length - 32;
  const offsetIntSize = buffer[trailerOffset + 6];
  const objectRefSize = buffer[trailerOffset + 7];
  if (![1, 2, 4, 8].includes(offsetIntSize) || ![1, 2, 4, 8].includes(objectRefSize)) {
    throw new Error(`INVALID_BPLIST: invalid int sizes (offset=${offsetIntSize}, ref=${objectRefSize})`);
  }

  const numObjects = readUIntBE(buffer, trailerOffset + 8, 8);
  const topObject = readUIntBE(buffer, trailerOffset + 16, 8);
  const offsetTableOffset = readUIntBE(buffer, trailerOffset + 24, 8);

  if (numObjects === 0 || numObjects > MAX_BPLIST_OBJECTS) {
    throw new Error(`INVALID_BPLIST: invalid numObjects ${numObjects}`);
  }
  if (topObject >= numObjects) {
    throw new Error(`INVALID_BPLIST: topObject ${topObject} out of range (numObjects=${numObjects})`);
  }
  const offsetTableEnd = offsetTableOffset + numObjects * offsetIntSize;
  if (offsetTableOffset < 8 || offsetTableEnd > trailerOffset) {
    throw new Error('INVALID_BPLIST: offset table out of bounds');
  }

  const offsets = new Array(numObjects);
  for (let i = 0; i < numObjects; i++) {
    const off = readUIntBE(buffer, offsetTableOffset + i * offsetIntSize, offsetIntSize);
    if (off < 8 || off >= offsetTableOffset) {
      throw new Error(`INVALID_BPLIST: object ${i} offset ${off} out of bounds`);
    }
    offsets[i] = off;
  }

  const cache = new Map();
  const visiting = new Set();

  function readLengthAndStart(offset, objInfo) {
    if (objInfo < 0x0f) {
      return { count: objInfo, dataStart: offset + 1 };
    }
    if (offset + 1 >= offsetTableOffset) {
      throw new Error('INVALID_BPLIST: truncated extended length');
    }
    const lenMarker = buffer[offset + 1];
    if ((lenMarker & 0xf0) !== 0x10) {
      throw new Error(`INVALID_BPLIST: expected int marker for extended length, got 0x${lenMarker.toString(16)}`);
    }
    const lenBytes = 1 << (lenMarker & 0x0f);
    if (![1, 2, 4, 8].includes(lenBytes) || offset + 2 + lenBytes > offsetTableOffset) {
      throw new Error(`INVALID_BPLIST: invalid extended length size ${lenBytes}`);
    }
    const count = readUIntBE(buffer, offset + 2, lenBytes);
    return { count, dataStart: offset + 2 + lenBytes };
  }

  function parseObject(objIdx, depth) {
    if (objIdx < 0 || objIdx >= numObjects) {
      throw new Error(`INVALID_BPLIST: object reference ${objIdx} out of range`);
    }
    if (depth > MAX_BPLIST_DEPTH) {
      throw new Error('INVALID_BPLIST: maximum nesting depth exceeded');
    }
    if (cache.has(objIdx)) {
      return cache.get(objIdx);
    }
    if (visiting.has(objIdx)) {
      throw new Error(`INVALID_BPLIST: cyclic object reference at ${objIdx}`);
    }

    visiting.add(objIdx);
    try {
      const offset = offsets[objIdx];
      const marker = buffer[offset];
      const objType = (marker & 0xf0) >> 4;
      const objInfo = marker & 0x0f;
      let parsed;

      switch (objType) {
        case 0x0: {
          if (objInfo === 0x00) parsed = null;
          else if (objInfo === 0x08) parsed = false;
          else if (objInfo === 0x09) parsed = true;
          else if (objInfo === 0x0f) parsed = undefined;
          else throw new Error(`INVALID_BPLIST: unknown singleton marker 0x${marker.toString(16)}`);
          break;
        }
        case 0x1: {
          const byteLen = 1 << objInfo;
          if (byteLen > 16 || offset + 1 + byteLen > offsetTableOffset) {
            throw new Error(`INVALID_BPLIST: invalid integer byte length ${byteLen}`);
          }
          if (byteLen === 8) {
            const val = buffer.readBigInt64BE(offset + 1);
            parsed = val >= BigInt(Number.MIN_SAFE_INTEGER) && val <= BigInt(Number.MAX_SAFE_INTEGER)
              ? Number(val)
              : val;
          } else if (byteLen === 16) {
            let acc = 0n;
            for (let i = 0; i < 16; i++) acc = (acc << 8n) | BigInt(buffer[offset + 1 + i]);
            if (buffer[offset + 1] & 0x80) acc -= 1n << 128n;
            parsed = acc >= BigInt(Number.MIN_SAFE_INTEGER) && acc <= BigInt(Number.MAX_SAFE_INTEGER)
              ? Number(acc)
              : acc;
          } else {
            parsed = readUIntBE(buffer, offset + 1, byteLen);
          }
          break;
        }
        case 0x2: {
          const byteLen = 1 << objInfo;
          if (offset + 1 + byteLen > offsetTableOffset) {
            throw new Error('INVALID_BPLIST: truncated real value');
          }
          if (byteLen === 4) parsed = buffer.readFloatBE(offset + 1);
          else if (byteLen === 8) parsed = buffer.readDoubleBE(offset + 1);
          else throw new Error(`INVALID_BPLIST: unsupported real byte length ${byteLen}`);
          break;
        }
        case 0x3: {
          if (objInfo !== 0x03 || offset + 9 > offsetTableOffset) {
            throw new Error('INVALID_BPLIST: invalid date object');
          }
          const seconds = buffer.readDoubleBE(offset + 1);
          parsed = new Date((978307200 + seconds) * 1000);
          break;
        }
        case 0x4: {
          const { count, dataStart } = readLengthAndStart(offset, objInfo);
          if (dataStart + count > offsetTableOffset) {
            throw new Error('INVALID_BPLIST: data object out of bounds');
          }
          parsed = Buffer.from(buffer.subarray(dataStart, dataStart + count));
          break;
        }
        case 0x5: {
          const { count, dataStart } = readLengthAndStart(offset, objInfo);
          if (dataStart + count > offsetTableOffset) {
            throw new Error('INVALID_BPLIST: ASCII string out of bounds');
          }
          parsed = buffer.subarray(dataStart, dataStart + count).toString('latin1');
          break;
        }
        case 0x6: {
          const { count, dataStart } = readLengthAndStart(offset, objInfo);
          const byteLen = count * 2;
          if (dataStart + byteLen > offsetTableOffset) {
            throw new Error('INVALID_BPLIST: UTF-16BE string out of bounds');
          }
          parsed = UTF16BE_DECODER.decode(buffer.subarray(dataStart, dataStart + byteLen));
          break;
        }
        case 0x7: {
          const { count, dataStart } = readLengthAndStart(offset, objInfo);
          if (dataStart + count > offsetTableOffset) {
            throw new Error('INVALID_BPLIST: UTF-8 string out of bounds');
          }
          parsed = buffer.subarray(dataStart, dataStart + count).toString('utf8');
          break;
        }
        case 0x8: {
          const byteLen = objInfo + 1;
          if (byteLen > 8 || offset + 1 + byteLen > offsetTableOffset) {
            throw new Error(`INVALID_BPLIST: invalid UID byte length ${byteLen}`);
          }
          parsed = { UID: readUIntBE(buffer, offset + 1, byteLen) };
          break;
        }
        case 0xa:
        case 0xc: {
          const { count, dataStart } = readLengthAndStart(offset, objInfo);
          const byteLen = count * objectRefSize;
          if (dataStart + byteLen > offsetTableOffset) {
            throw new Error('INVALID_BPLIST: array/set out of bounds');
          }
          const arr = new Array(count);
          for (let i = 0; i < count; i++) {
            const ref = readUIntBE(buffer, dataStart + i * objectRefSize, objectRefSize);
            arr[i] = parseObject(ref, depth + 1);
          }
          parsed = arr;
          break;
        }
        case 0xd: {
          const { count, dataStart } = readLengthAndStart(offset, objInfo);
          const byteLen = count * 2 * objectRefSize;
          if (dataStart + byteLen > offsetTableOffset) {
            throw new Error('INVALID_BPLIST: dictionary out of bounds');
          }
          const dict = Object.create(null);
          for (let i = 0; i < count; i++) {
            const keyRef = readUIntBE(buffer, dataStart + i * objectRefSize, objectRefSize);
            const valRef = readUIntBE(buffer, dataStart + (count + i) * objectRefSize, objectRefSize);
            const key = parseObject(keyRef, depth + 1);
            const val = parseObject(valRef, depth + 1);
            dict[String(key)] = val;
          }
          parsed = dict;
          break;
        }
        default:
          throw new Error(`INVALID_BPLIST: unsupported object type 0x${objType.toString(16)}`);
      }

      cache.set(objIdx, parsed);
      return parsed;
    } finally {
      visiting.delete(objIdx);
    }
  }

  return parseObject(topObject, 0);
}

/**
 * Parses either an XML plist or Apple binary plist (bplist00),
 * with macOS `plutil` fallback if the pure JS bplist parser cannot handle an exotic format.
 */
export function parsePlistBuffer(input, options = {}) {
  const buffer = Buffer.isBuffer(input) ? input : Buffer.from(input);
  if (isBinaryPlist(buffer)) {
    try {
      const parsed = parseBinaryPlist(buffer);
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        throw new Error('INVALID_BPLIST: root plist object must be a dictionary');
      }
      return { format: 'bplist', data: parsed, rawText: '' };
    } catch (pureErr) {
      if (options.allowPlutilFallback !== false && process.platform === 'darwin') {
        try {
          const xmlOut = execFileSync('plutil', ['-convert', 'xml1', '-o', '-', '-'], {
            input: buffer,
            encoding: 'utf8',
            maxBuffer: 16 * 1024 * 1024
          });
          return { format: 'bplist-plutil', data: parseSimpleXmlPlist(xmlOut), rawText: xmlOut };
        } catch (plutilErr) {
          throw new Error(`BPLIST_PARSE_FAILED: ${pureErr.message} (plutil fallback: ${plutilErr.message})`);
        }
      }
      throw pureErr;
    }
  }

  const xmlText = buffer.toString('utf8');
  return { format: 'xml', data: parseSimpleXmlPlist(xmlText), rawText: xmlText };
}

/**
 * Fail-closed boolean check for production lockdown plist keys.
 * Only explicit boolean `false` or explicit string `'NO'` / `'false'` (case-insensitive) is treated as disabled.
 */
export function isExplicitlyDisabledPlistFlag(value) {
  if (value === false) return true;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    return normalized === 'no' || normalized === 'false';
  }
  return false;
}

function collectPlistStrings(value, out = [], seen = new Set()) {
  if (typeof value === 'string') {
    out.push(value);
    return out;
  }
  if (!value || typeof value !== 'object' || Buffer.isBuffer(value) || value instanceof Date) {
    return out;
  }
  if (seen.has(value)) return out;
  seen.add(value);
  if (Array.isArray(value)) {
    for (const item of value) collectPlistStrings(item, out, seen);
  } else {
    for (const [k, v] of Object.entries(value)) {
      out.push(k);
      collectPlistStrings(v, out, seen);
    }
  }
  return out;
}

function findAllValuesByKey(value, targetKey, out = [], seen = new Set()) {
  if (!value || typeof value !== 'object' || Buffer.isBuffer(value) || value instanceof Date) {
    return out;
  }
  if (seen.has(value)) return out;
  seen.add(value);
  if (Array.isArray(value)) {
    for (const item of value) findAllValuesByKey(item, targetKey, out, seen);
  } else {
    for (const [k, v] of Object.entries(value)) {
      if (k === targetKey) out.push(v);
      findAllValuesByKey(v, targetKey, out, seen);
    }
  }
  return out;
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

export function validateTeamId(teamId) {
  if (typeof teamId !== 'string' || !TEAM_ID_RE.test(teamId)) {
    throw new Error(`INVALID_TEAM_ID: --team must match ^[A-Z0-9]{10}$, got '${String(teamId ?? '')}'`);
  }
  return teamId;
}

export function isBlockedLiveHost(host) {
  const normalized = String(host || '').trim().toLowerCase().replace(/\.+$/, '');
  if (!normalized) return false;
  return BLOCKED_LIVE_HOST_PATTERNS.some(re => re.test(normalized));
}

export function validateHubUrl(rawUrl, options = {}) {
  const { allowLiveHost = false } = options;
  if (typeof rawUrl !== 'string' || rawUrl.length === 0) {
    throw new Error('INVALID_HUB_URL: --hub-url must be a non-empty single-line http(s):// URL');
  }
  if (/[\r\n\t\v\f\u0000-\u001f\u007f ]/.test(rawUrl)) {
    throw new Error('INVALID_HUB_URL: --hub-url must be a single-line URL without whitespace or control characters');
  }
  if (/#include/i.test(rawUrl) || rawUrl.includes('#')) {
    throw new Error("INVALID_HUB_URL: --hub-url must not contain '#' or '#include'");
  }
  if (/\$\(|\$\{|\$|`|["';]|\/\*|\*\//.test(rawUrl)) {
    throw new Error('INVALID_HUB_URL: --hub-url contains forbidden xcconfig/shell metacharacters');
  }
  if (!/^https?:\/\//i.test(rawUrl)) {
    throw new Error('INVALID_HUB_URL: --hub-url must start with http:// or https://');
  }
  const afterScheme = rawUrl.replace(/^https?:\/\//i, '');
  if (afterScheme.includes('//')) {
    throw new Error("INVALID_HUB_URL: --hub-url must not contain unescaped '//' outside the scheme");
  }

  let parsed;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new Error(`INVALID_HUB_URL: malformed URL '${rawUrl}'`);
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error(`INVALID_HUB_URL: unsupported scheme '${parsed.protocol}'`);
  }
  if (!parsed.hostname) {
    throw new Error('INVALID_HUB_URL: missing hostname');
  }
  if (parsed.username || parsed.password) {
    throw new Error('INVALID_HUB_URL: embedded credentials are not allowed');
  }
  if (parsed.search || parsed.hash) {
    throw new Error('INVALID_HUB_URL: query strings and fragments are not allowed in Hub base URL');
  }
  if (!allowLiveHost && isBlockedLiveHost(parsed.hostname)) {
    throw new Error(`FORBIDDEN_LIVE_HOST: --hub-url host '${parsed.hostname}' is a blocked Live host`);
  }

  return rawUrl.replace(/\/+$/, '');
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
  let plistMap = Object.create(null);
  if (!infoEntry) {
    failures.push(`INFO_PLIST_MISSING: ${appRoot}Info.plist not found`);
  } else {
    let infoParsed = null;
    try {
      infoParsed = parsePlistBuffer(infoEntry.readData());
    } catch (err) {
      failures.push(`INFO_PLIST_INVALID: failed to parse ${appRoot}Info.plist (${err.message})`);
    }
    if (infoParsed) {
      plistMap = infoParsed.data;
      const infoStrings = collectPlistStrings(plistMap);
      if (
        (infoParsed.rawText && FORBIDDEN_PATTERN.test(infoParsed.rawText)) ||
        infoStrings.some(s => FORBIDDEN_PATTERN.test(s))
      ) {
        failures.push('FORGE_EXCLUSION_GATE: forbidden Forge reference found inside Info.plist');
      }
      bundleId = typeof plistMap.CFBundleIdentifier === 'string' ? plistMap.CFBundleIdentifier : null;
      const bundleRe = new RegExp(`^com\\.playhub\\.[a-z][a-z0-9-]{0,31}\\.${stage}$`);
      if (!bundleId || !bundleRe.test(bundleId) || bundleId.includes('_')) {
        failures.push(`BUNDLE_ID_GATE: '${bundleId}' does not match Apple UTI rule ${bundleRe}`);
      }
      if (stage === 'live' && bundleId !== 'com.playhub.gamedev.live') {
        failures.push(`LIVE_TRUNK_GUARD: live build must use com.playhub.gamedev.live, got '${bundleId}'`);
      }
      if (stage === 'release' || stage === 'live') {
        const farmFlag = plistMap.PlayHubAllowFarmSelector;
        if (!isExplicitlyDisabledPlistFlag(farmFlag)) {
          failures.push(`PRODUCTION_LOCK_GATE: PlayHubAllowFarmSelector must be explicitly false or 'NO' in '${stage}', got ${JSON.stringify(farmFlag)}`);
        }
        const arbitraryLoadValues = findAllValuesByKey(plistMap, 'NSAllowsArbitraryLoads');
        if (arbitraryLoadValues.some(val => !isExplicitlyDisabledPlistFlag(val))) {
          failures.push(`PRODUCTION_LOCK_GATE: NSAllowsArbitraryLoads must not be enabled in '${stage}'`);
        }
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
    let privParsed = null;
    try {
      privParsed = parsePlistBuffer(privacyEntry.readData());
    } catch (err) {
      failures.push(`PRIVACY_MANIFEST_GATE: failed to parse ${appRoot}PrivacyInfo.xcprivacy (${err.message})`);
    }
    if (privParsed) {
      const privMap = privParsed.data;
      if (privMap.NSPrivacyTracking !== false) {
        failures.push('PRIVACY_MANIFEST_GATE: NSPrivacyTracking must be explicitly false');
      }
      const privStrings = new Set(collectPlistStrings(privMap));
      for (const apiCat of REQUIRED_PRIVACY_APIS) {
        if (!privStrings.has(apiCat) && !privParsed.rawText.includes(apiCat)) {
          failures.push(`PRIVACY_MANIFEST_GATE: missing Required Reason API category ${apiCat}`);
        }
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

// CLI execution (never auto-run when dynamically imported inside `node -e` / `--eval`)
const isEvalMode = process.execArgv.some(arg =>
  arg === '-e' || arg === '--eval' || arg === '-p' || arg === '--print' ||
  arg.startsWith('--eval=') || arg.startsWith('--print=')
);
const isMain = !isEvalMode && Boolean(process.argv[1]) && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
if (isMain) {
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
