import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {protectInstance} from '../portable/rebex.mjs';

test('Windows instance ACL protection succeeds on first launch and restart', {
  skip: process.platform !== 'win32',
}, async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'playhub-acl-test-'));
  try {
    for (let attempt = 0; attempt < 2; attempt++) {
      const result = await protectInstance(root);
      assert.equal(result.verified, true);
      assert.equal(result.inheritanceProtected, true);
      assert.deepEqual(result.allowedPrincipals, ['current-user', 'SYSTEM', 'Administrators']);
      const marker = path.join(root, 'write-check.txt');
      fs.writeFileSync(marker, String(attempt));
      assert.equal(fs.readFileSync(marker, 'utf8'), String(attempt));
    }
  } finally {
    fs.rmSync(root, {recursive: true, force: true});
  }
});
