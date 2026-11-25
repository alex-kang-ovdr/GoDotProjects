'use strict';
// TraceSample.build_id 해석기. 새 형식을 만들지 않고 기존 SSOT를 순서대로 따른다.
//   1) 명시 값(--build-id) 또는 env PLAYFORGE_BUILD_ID
//   2) env PLAYFORGE_BUILD_MANIFEST 가 가리키는 BuildManifest JSON 의 build_id/buildId
//      (BuildManifest 는 Forge-BuildExport 소유 — 착지 전까지는 파일이 있으면 읽기만 한다)
//   3) tools/build-version/resolve-build-info.mjs 의 buildId (target/semver/channel 지정 시)
//   4) "unknown-<git short sha>" (git 도 없으면 "unknown-nogit")
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { pathToFileURL } = require('node:url');

const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');
const BUILD_INFO_MODULE = path.join(REPO_ROOT, 'tools', 'build-version', 'resolve-build-info.mjs');

function gitShortSha(cwd = REPO_ROOT, pathspec) {
  try {
    const args = pathspec ? ['log', '-1', '--format=%h', '--abbrev=7', '--', pathspec] : ['rev-parse', '--short=7', 'HEAD'];
    const out = execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    return /^[0-9a-f]{7,40}$/i.test(out) ? out.slice(0, 7).toLowerCase() : null;
  } catch {
    return null;
  }
}

function unknownBuildId(sha) {
  return `unknown-${sha || 'nogit'}`;
}

function readManifestBuildId(file) {
  try {
    const j = JSON.parse(fs.readFileSync(file, 'utf8'));
    const id = j.build_id || j.buildId;
    return typeof id === 'string' && id ? id : null;
  } catch {
    return null;
  }
}

/**
 * @param {{buildId?:string, env?:object, target?:string, semver?:string, channel?:string, cwd?:string}} opts
 * @returns {Promise<{buildId:string, origin:string}>}
 */
async function resolveTraceBuildId(opts = {}) {
  const env = opts.env || process.env;
  if (opts.buildId) return { buildId: String(opts.buildId), origin: 'explicit' };
  if (env.PLAYFORGE_BUILD_ID) return { buildId: String(env.PLAYFORGE_BUILD_ID), origin: 'env:PLAYFORGE_BUILD_ID' };
  if (env.PLAYFORGE_BUILD_MANIFEST) {
    const id = readManifestBuildId(env.PLAYFORGE_BUILD_MANIFEST);
    if (id) return { buildId: id, origin: 'build-manifest' };
  }
  if (opts.target && opts.semver) {
    try {
      const mod = await import(pathToFileURL(BUILD_INFO_MODULE).href);
      const info = mod.resolveBuildInfo({ target: opts.target, semver: opts.semver, channel: opts.channel || 'local', cwd: opts.cwd || REPO_ROOT });
      if (info && info.buildId) return { buildId: info.buildId, origin: 'tools/build-version' };
    } catch {
      // build-version 해석 실패 시 아래 폴백으로 내려간다
    }
  }
  return { buildId: unknownBuildId(gitShortSha(opts.cwd || REPO_ROOT)), origin: 'fallback:git' };
}

module.exports = { REPO_ROOT, BUILD_INFO_MODULE, gitShortSha, unknownBuildId, readManifestBuildId, resolveTraceBuildId };
