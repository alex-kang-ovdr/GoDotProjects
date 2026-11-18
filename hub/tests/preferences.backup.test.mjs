import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { DatabaseSync } from 'node:sqlite';
import { openDatabase } from '../server/db.mjs';
import { inspectDatabase } from '../tools/restore-data.mjs';

test('backup schema accepts wishlist/preferences and older snapshots while rejecting unknown tables', t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'playhub-preference-backup-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 }));
  const db = openDatabase(root);
  db.prepare('INSERT INTO users VALUES(?,?,?,?)').run('guest', 'guest', null, 1);
  db.prepare('INSERT INTO wishlist_items VALUES(?,?,?)').run('guest', 'mines-grid', 2);
  db.prepare('INSERT INTO user_preferences VALUES(?,?,?)').run('guest', 'hi', 3);
  db.close();
  const file = path.join(root, 'platform.sqlite');
  assert.equal(inspectDatabase(file).integrity, 'ok');
  let old = new DatabaseSync(file);
  old.exec('DROP TABLE wishlist_items; DROP TABLE user_preferences'); old.close();
  assert.equal(inspectDatabase(file).integrity, 'ok');
  old = new DatabaseSync(file); old.exec('CREATE TABLE unexpected(secret TEXT)'); old.close();
  assert.throws(() => inspectDatabase(file), /expected platform tables/);
});
