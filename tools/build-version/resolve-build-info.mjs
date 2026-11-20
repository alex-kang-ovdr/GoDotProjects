#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const TARGETS = Object.freeze([
  'aos',
  'ios',
  'forge-desktop',
  'forge-web',
  'hub',
  'godot-server',
]);

export const CHANNELS = Object.freeze(['local', 'dev', 'qa', 'rc', 'live']);
export const STRICT_CLEAN_CHANNELS = new Set(['qa', 'rc', 'live']);
export const UPDATE_POLICIES = Object.freeze(['optional', 'force']);
export const MAX_GOOGLE_PLAY_VERSION_CODE = 2100000000;
export const MAX_CLOUD_RUN_REVISION_LENGTH = 63;

const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
const SEMVER_RE = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;
const SHA_RE = /^[0-9a-f]{7,40}$/i;
const NET_PROTOCOL_RE = /^(\d+)\.(\d+)$/;

function pad2(n) {
  return String(n).padStart(2, '0');
}

export function sanitizeBranchSlug(branch, maxLength = 20) {
  const raw = String(branch || '').trim();
  if (!raw || raw === 'HEAD') return 'detached';
  const normalized = raw
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, maxLength)
    .replace(/-+$/g, '');
  return normalized || 'detached';
}

export function formatKstParts(dateInput = new Date()) {
  const date = dateInput instanceof Date ? dateInput : new Date(dateInput);
  if (!Number.isFinite(date.getTime())) {
    throw new Error(`Invalid date input: ${dateInput}`);
  }
  const utcIso = date.toISOString().replace(/\.\d{3}Z$/, 'Z');
  const kst = new Date(date.getTime() + KST_OFFSET_MS);
  const y = kst.getUTCFullYear();
  const m = pad2(kst.getUTCMonth() + 1);
  const d = pad2(kst.getUTCDate());
  const hh = pad2(kst.getUTCHours());
  const mm = pad2(kst.getUTCMinutes());
  const ss = pad2(kst.getUTCSeconds());
  return {
    dateCompact: `${y}${m}${d}`,
    dateIso: `${y}-${m}-${d}`,
    timeCompact: `${hh}${mm}`,
    kstIso: `${y}-${m}-${d}T${hh}:${mm}:${ss}+09:00`,
    utcIso,
  };
}

export function computeBuildCode(dateCompact, dailySeq = 0) {
  const ds = String(dateCompact || '');
  if (!/^\d{8}$/.test(ds)) {
    throw new Error(`dateCompact must be YYYYMMDD (got: ${ds})`);
  }
  const seq = Number(dailySeq);
  if (!Number.isInteger(seq) || seq < 0 || seq > 99) {
    throw new Error(`dailySeq must be an integer between 0 and 99 (got: ${dailySeq})`);
  }
  const code = Number(`${ds}${pad2(seq)}`);
  if (!Number.isSafeInteger(code) || code >= MAX_GOOGLE_PLAY_VERSION_CODE) {
    throw new Error(
      `buildCode ${code} exceeds Google Play Int32 ceiling (${MAX_GOOGLE_PLAY_VERSION_CODE})`,
    );
  }
  return code;
}

export function buildCloudRunRevision(target, dateCompact, timeCompact, buildNum, sha7) {
  const prefix =
    target === 'hub'
      ? 'ph-pub'
      : target === 'forge-web'
        ? 'pf-web'
        : target === 'godot-server'
          ? 'pf-gs'
          : `pf-${target.replace(/[^a-z0-9]/g, '').slice(0, 6)}`;
  const raw = `${prefix}-${dateCompact}-${timeCompact}-b${buildNum}-${sha7}`
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '');
  const revision = raw.slice(0, MAX_CLOUD_RUN_REVISION_LENGTH).replace(/-+$/g, '');
  if (!/^[a-z][a-z0-9-]{0,62}$/.test(revision)) {
    throw new Error(`Invalid Cloud Run revision name: ${revision}`);
  }
  return revision;
}

export function buildArtifactName({
  target,
  semver,
  dateCompact,
  timeCompact,
  branchSlug,
  sha7,
  buildNum,
  dirty = false,
  arch = 'win-x64',
  variant = '',
}) {
  const dirtySuffix = dirty ? '-dirty' : '';
  const safeArch = sanitizeBranchSlug(arch || 'win-x64', 24);
  const safeVariant = variant ? `-${sanitizeBranchSlug(variant, 20)}` : '';
  const coreTag = `v${semver}-${dateCompact}-${timeCompact}-${branchSlug}-g${sha7}-b${buildNum}${dirtySuffix}`;
  switch (target) {
    case 'aos':
      return {
        primary: `playhub-aos-${coreTag}${safeVariant}.aab`,
        apk: `playhub-aos-${coreTag}${safeVariant}.apk`,
        dockerTag: null,
        shaTag: `sha-${sha7}`,
      };
    case 'ios':
      return {
        primary: `playhub-ios-${coreTag}${safeVariant}.ipa`,
        dockerTag: null,
        shaTag: `sha-${sha7}`,
      };
    case 'forge-desktop':
      return {
        primary: `PlayForge-Desktop-${coreTag}-${safeArch}${safeVariant}.zip`,
        dockerTag: null,
        shaTag: `sha-${sha7}`,
      };
    case 'forge-web':
      return {
        primary: `forge:${coreTag}`,
        dockerTag: coreTag,
        shaTag: `sha-${sha7}`,
      };
    case 'hub':
      return {
        primary: `hub:${coreTag}`,
        portableZip: `PlayHub_Portable_v${semver}_${dateCompact}_${timeCompact}_${branchSlug}_g${sha7}_b${buildNum}${dirty ? '_dirty' : ''}_${safeArch}${variant ? `_${sanitizeBranchSlug(variant, 20)}` : ''}.zip`,
        dockerTag: coreTag,
        shaTag: `sha-${sha7}`,
      };
    case 'godot-server':
      return {
        primary: `PlayForge-GodotServer-${coreTag}-${safeArch}${safeVariant}.zip`,
        dockerTag: coreTag,
        shaTag: `sha-${sha7}`,
      };
    default:
      throw new Error(`Unsupported target: ${target}`);
  }
}

function readGitMetadata(cwd) {
  const run = args =>
    execFileSync('git', args, {
      cwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  let branch = 'detached';
  let commit = '0000000000000000000000000000000000000000';
  let dirty = false;
  try {
    branch = run(['rev-parse', '--abbrev-ref', 'HEAD']) || 'detached';
  } catch {}
  try {
    commit = run(['rev-parse', 'HEAD']) || commit;
  } catch {}
  try {
    const status = run(['status', '--porcelain', '--ignore-submodules']);
    dirty = status.length > 0;
  } catch {}
  return { branch, commit, dirty };
}

export function resolveBuildInfo(options = {}) {
  const target = String(options.target || '').trim();
  if (!TARGETS.includes(target)) {
    throw new Error(`Invalid target "${target}". Expected one of: ${TARGETS.join(', ')}`);
  }

  const semver = String(options.semver || '').trim();
  if (!SEMVER_RE.test(semver)) {
    throw new Error(`Invalid semver "${semver}". Expected MAJOR.MINOR.PATCH`);
  }

  const channel = String(options.channel || 'local').trim().toLowerCase();
  if (!CHANNELS.includes(channel)) {
    throw new Error(`Invalid channel "${channel}". Expected one of: ${CHANNELS.join(', ')}`);
  }

  const updatePolicy = String(options.updatePolicy || 'optional').trim().toLowerCase();
  if (!UPDATE_POLICIES.includes(updatePolicy)) {
    throw new Error(`Invalid updatePolicy "${updatePolicy}". Expected optional or force`);
  }

  const buildNum = Number(options.buildNum ?? 0);
  if (!Number.isInteger(buildNum) || buildNum < 0) {
    throw new Error(`buildNum must be a non-negative integer (got: ${options.buildNum})`);
  }

  const dailySeq = Number(options.dailySeq ?? (buildNum > 0 ? ((buildNum - 1) % 99) + 1 : 0));
  const timeParts = formatKstParts(options.date ?? new Date());
  const buildCode = computeBuildCode(timeParts.dateCompact, dailySeq);

  const needsGit =
    options.branch === undefined || options.commit === undefined || options.dirty === undefined;
  const gitAuto = needsGit ? readGitMetadata(options.cwd || process.cwd()) : {};
  const branch = String(options.branch ?? gitAuto.branch ?? 'detached').trim();
  const branchSlug = sanitizeBranchSlug(branch);
  const commitRaw = String(options.commit ?? gitAuto.commit ?? '0000000').trim().toLowerCase();
  if (!SHA_RE.test(commitRaw)) {
    throw new Error(`Invalid commit hash "${commitRaw}"`);
  }
  const sha7 = commitRaw.slice(0, 7);
  const dirty = Boolean(options.dirty ?? gitAuto.dirty ?? false);

  if (dirty && STRICT_CLEAN_CHANNELS.has(channel) && !options.allowDirty) {
    throw new Error(
      `Dirty working tree is blocked on "${channel}" channel. Commit or stash changes before building.`,
    );
  }

  const engineAbi = String(options.engineAbi || 'godot-4.7').trim();
  const engineApiRev = Number(options.engineApiRev ?? 1);
  const minEngineApiRev = Number(options.minEngineApiRev ?? engineApiRev);
  if (!Number.isInteger(engineApiRev) || engineApiRev < 1) {
    throw new Error(`engineApiRev must be a positive integer (got: ${options.engineApiRev})`);
  }
  if (!Number.isInteger(minEngineApiRev) || minEngineApiRev < 1 || minEngineApiRev > engineApiRev) {
    throw new Error(`minEngineApiRev must be between 1 and engineApiRev`);
  }

  const netProtocol = String(options.netProtocol || '1.0').trim();
  if (!NET_PROTOCOL_RE.test(netProtocol)) {
    throw new Error(`netProtocol must be MAJOR.MINOR (got: ${netProtocol})`);
  }

  const gameplayHash = String(options.gameplayHash || 'default').trim() || 'default';
  const minClientBuildCode =
    options.minClientBuildCode !== undefined && options.minClientBuildCode !== null && options.minClientBuildCode !== ''
      ? Number(options.minClientBuildCode)
      : updatePolicy === 'force'
        ? buildCode
        : 0;
  if (!Number.isInteger(minClientBuildCode) || minClientBuildCode < 0 || minClientBuildCode >= MAX_GOOGLE_PLAY_VERSION_CODE) {
    throw new Error(`Invalid minClientBuildCode: ${options.minClientBuildCode}`);
  }

  const dirtySuffix = dirty ? '-dirty' : '';
  const buildId = `${target}-v${semver}-${timeParts.dateCompact}-${timeParts.timeCompact}-${branchSlug}-g${sha7}-b${buildNum}${dirtySuffix}`;
  const artifacts = buildArtifactName({
    target,
    semver,
    dateCompact: timeParts.dateCompact,
    timeCompact: timeParts.timeCompact,
    branchSlug,
    sha7,
    buildNum,
    dirty,
    arch: options.arch || 'win-x64',
    variant: options.variant || '',
  });
  const cloudRunRevision = buildCloudRunRevision(
    target,
    timeParts.dateCompact,
    timeParts.timeCompact,
    buildNum,
    sha7,
  );

  return {
    schemaVersion: 1,
    target,
    semver,
    channel,
    buildId,
    buildCode,
    buildNum,
    dailySeq,
    builtAtUtc: timeParts.utcIso,
    builtAtKst: timeParts.kstIso,
    dateKst: timeParts.dateCompact,
    dateIsoKst: timeParts.dateIso,
    timeKst: timeParts.timeCompact,
    git: {
      branch,
      branchSlug,
      commit: commitRaw,
      sha7,
      dirty,
    },
    compat: {
      engineAbi,
      engineApiRev,
      minEngineApiRev,
      netProtocol,
      gameplayHash,
    },
    updatePolicy,
    minClientBuildCode,
    store: {
      androidVersionName: semver,
      androidVersionCode: buildCode,
      iosShortVersion: semver,
      iosBundleVersion: String(buildCode),
    },
    cloudRun: {
      revisionSuffix: cloudRunRevision,
    },
    artifacts,
  };
}

function parseCliArgs(argv) {
  const opts = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (!arg.startsWith('--')) continue;
    const key = arg.slice(2);
    if (key === 'dirty') {
      opts.dirty = true;
      continue;
    }
    if (key === 'clean') {
      opts.dirty = false;
      continue;
    }
    if (key === 'allow-dirty') {
      opts.allowDirty = true;
      continue;
    }
    const val = argv[++i];
    switch (key) {
      case 'target': opts.target = val; break;
      case 'semver': opts.semver = val; break;
      case 'channel': opts.channel = val; break;
      case 'build-num': opts.buildNum = Number(val); break;
      case 'daily-seq': opts.dailySeq = Number(val); break;
      case 'date': opts.date = val; break;
      case 'branch': opts.branch = val; break;
      case 'commit': opts.commit = val; break;
      case 'arch': opts.arch = val; break;
      case 'variant': opts.variant = val; break;
      case 'engine-abi': opts.engineAbi = val; break;
      case 'engine-api-rev': opts.engineApiRev = Number(val); break;
      case 'min-engine-api-rev': opts.minEngineApiRev = Number(val); break;
      case 'net-protocol': opts.netProtocol = val; break;
      case 'gameplay-hash': opts.gameplayHash = val; break;
      case 'update-policy': opts.updatePolicy = val; break;
      case 'min-build-code': opts.minClientBuildCode = Number(val); break;
      case 'out-json': opts.outJson = val; break;
      case 'github-output': opts.githubOutput = val; break;
      case 'output-prefix': opts.outputPrefix = val; break;
      default:
        throw new Error(`Unknown CLI argument: --${key}`);
    }
  }
  return opts;
}

const isDirectExecution =
  process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isDirectExecution) {
  const cliOpts = parseCliArgs(process.argv.slice(2));
  const info = resolveBuildInfo(cliOpts);
  const serialized = JSON.stringify(info, null, 2) + '\n';
  if (cliOpts.outJson) {
    fs.mkdirSync(path.dirname(path.resolve(cliOpts.outJson)), { recursive: true });
    fs.writeFileSync(cliOpts.outJson, serialized, 'utf8');
  }
  if (cliOpts.githubOutput) {
    const p = cliOpts.outputPrefix ? `${cliOpts.outputPrefix}_` : '';
    const lines = [
      `${p}build_id=${info.buildId}`,
      `${p}build_code=${info.buildCode}`,
      `${p}build_tag=${info.artifacts.dockerTag || info.buildId}`,
      `${p}sha_tag=${info.artifacts.shaTag}`,
      `${p}revision=${info.cloudRun.revisionSuffix}`,
      `${p}artifact_name=${info.artifacts.primary}`,
    ];
    fs.appendFileSync(cliOpts.githubOutput, lines.join('\n') + '\n', 'utf8');
  }
  process.stdout.write(serialized);
}
