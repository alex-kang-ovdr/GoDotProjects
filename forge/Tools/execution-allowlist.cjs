'use strict';

// Temporary P0 control (docs/architecture/hub-forge-decoupling-plan.md): builds and PIE run the host's
// Godot on user-supplied projects without isolation, and Godot import/run can execute @tool scripts and
// editor plugins. Until isolated build workers exist, only explicitly allowlisted accounts may trigger
// anything that executes user content.
//
// PLAYHUB_FORGE_EXECUTION_ALLOWLIST:
//   unset / empty  -> nobody (fail closed)
//   "*"            -> every authenticated account (explicit opt-out, e.g. trusted private deployments)
//   "<key>,<key>"  -> listed Hub account keys (64 lowercase hex, sha256 of the Google subject)
const ACCOUNT_KEY = /^[a-f0-9]{64}$/;

function parseExecutionAllowlist(raw) {
  if (Array.isArray(raw)) raw = raw.join(',');
  const value = typeof raw === 'string' ? raw.trim() : '';
  if (!value) return { mode: 'none', keys: new Set() };
  if (value === '*') return { mode: 'all', keys: new Set() };
  const keys = value.split(/[\s,]+/).filter(Boolean);
  for (const key of keys) {
    if (!ACCOUNT_KEY.test(key)) throw new Error('PLAYHUB_FORGE_EXECUTION_ALLOWLIST must be "*" or comma-separated 64-character lowercase hex account keys.');
  }
  return { mode: 'list', keys: new Set(keys) };
}

function createExecutionPolicy(raw) {
  const parsed = parseExecutionAllowlist(raw);
  return {
    mode: parsed.mode,
    size: parsed.keys.size,
    allows(accountKey) {
      if (parsed.mode === 'all') return typeof accountKey === 'string' && ACCOUNT_KEY.test(accountKey);
      return parsed.mode === 'list' && parsed.keys.has(accountKey);
    },
  };
}

const EXECUTION_NOT_ALLOWED = 'EXECUTION_NOT_ALLOWED';

module.exports = { parseExecutionAllowlist, createExecutionPolicy, EXECUTION_NOT_ALLOWED };
