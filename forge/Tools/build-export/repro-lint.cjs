'use strict';
// Pre-export reproducibility lint (roadmap 16 R0 spike).
// Finding (Godot 4.7.2, see docs/build-export/BUILD_MANIFEST.md §5): a .tscn node header without
// `unique_id=` gets a RANDOM id (ResourceUID::create_id) when the scene is packed at export time, so the
// exported binary .scn differs on every export. Scenes saved by the 4.6+ editor carry unique_id and export
// byte-identically. This lint lists text scenes whose node headers lack unique_id.

const fs = require('node:fs');
const path = require('node:path');
const { listFiles } = require('./build-manifest.cjs');

const NODE_HEADER_RE = /^\[node\b[^\]]*\]/gm;

/** Return node headers in a .tscn text that lack unique_id=. */
function nodesWithoutUniqueId(tscnText) {
  const missing = [];
  for (const m of tscnText.matchAll(NODE_HEADER_RE)) {
    if (!/\bunique_id=\d+/.test(m[0])) {
      const name = (m[0].match(/\bname="([^"]*)"/) || [])[1] || '?';
      missing.push(name);
    }
  }
  return missing;
}

/** Scan a project dir: [{ path, nodes:[names] }] for scenes with non-deterministic node ids. */
function lintProject(projectDir) {
  const findings = [];
  for (const rel of listFiles(projectDir, { exclude: ['.godot', '.git'] })) {
    if (!rel.endsWith('.tscn')) continue;
    const nodes = nodesWithoutUniqueId(fs.readFileSync(path.join(projectDir, ...rel.split('/')), 'utf8'));
    if (nodes.length) findings.push({ path: rel, rule: 'tscn-node-missing-unique_id', nodes });
  }
  return findings;
}

module.exports = { nodesWithoutUniqueId, lintProject };

if (require.main === module) {
  const dir = process.argv[2];
  if (!dir) { console.error('Usage: node forge/Tools/build-export/repro-lint.cjs <godot project dir>'); process.exit(2); }
  const findings = lintProject(dir);
  console.log(JSON.stringify(findings, null, 2));
  process.exit(findings.length ? 1 : 0);
}
