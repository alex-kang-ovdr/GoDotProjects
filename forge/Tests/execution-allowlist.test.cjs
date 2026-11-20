'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { createExecutionPolicy, parseExecutionAllowlist } = require('../Tools/execution-allowlist.cjs');

const A = 'a'.repeat(64), B = 'b'.repeat(64);

test('unset or empty allowlist denies everyone (fail closed)', () => {
  for (const raw of [undefined, null, '', '   ', []]) {
    const policy = createExecutionPolicy(raw);
    assert.equal(policy.mode, 'none');
    assert.equal(policy.allows(A), false);
  }
});

test('"*" allows every well-formed account key only', () => {
  const policy = createExecutionPolicy('*');
  assert.equal(policy.allows(A), true);
  assert.equal(policy.allows('not-a-key'), false);
  assert.equal(policy.allows(undefined), false);
});

test('explicit list allows only listed keys; separators may be commas or whitespace', () => {
  const policy = createExecutionPolicy(`${A}, \n`);
  assert.equal(policy.allows(A), true);
  assert.equal(policy.allows(B), false);
  assert.equal(createExecutionPolicy([A, B]).allows(B), true);
});

test('malformed entries are rejected at startup instead of being ignored', () => {
  assert.throws(() => parseExecutionAllowlist('alice@example.com'), /EXECUTION_ALLOWLIST/);
  assert.throws(() => parseExecutionAllowlist(`${A},${'A'.repeat(64)}`), /EXECUTION_ALLOWLIST/);
  assert.throws(() => parseExecutionAllowlist(`${A},*`), /EXECUTION_ALLOWLIST/);
});
