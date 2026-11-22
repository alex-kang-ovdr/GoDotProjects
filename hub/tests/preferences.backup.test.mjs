import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { DatabaseSync } from 'node:sqlite';
import { openDatabase } from '../server/db.mjs';
import { inspectDatabase } from '../tools/restore-data.mjs';
import { createCreatorReview } from '../server/creator-review.mjs';

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

test('backup schema accepts creator submissions and preserves metadata review state', t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'playhub-creator-backup-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 }));
  const db = openDatabase(path.join(root, 'data'));
  createCreatorReview({ config: { enabled: true, directory: path.join(root, 'private') }, root: path.join(root, 'source'), db, requireSession() {}, now: Date.now, audit() {} });
  db.prepare('INSERT INTO users VALUES(?,?,?,?)').run('owner', 'registered', 'Creator', 1);
  db.prepare(
    'INSERT INTO creator_submissions(id,owner_key,owner_id,project_id,release_id,release_revision,release_label,title,description,status,revision,review_note,created_at,updated_at,submitted_at,decided_at,game_slug,visibility,deploy_mode,artifact_sha256,manifest_json,package_validation,publication_status,published_game_id) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)'
  ).run('submission', 'owner-key', 'owner', 'project', 'release', 1, 'v1', 'Game', 'Description', 'approved', 3, '', 1, 2, 1, 2, null, 'public', 'singleplay', null, null, 'not_verified', 'unpublished', null);
  db.close();
  const file = path.join(root, 'data', 'platform.sqlite');
  assert.equal(inspectDatabase(file).integrity, 'ok');
  const restored = new DatabaseSync(file, { readOnly: true });
  try { assert.equal(restored.prepare('SELECT status FROM creator_submissions WHERE id=?').get('submission').status, 'approved'); }
  finally { restored.close(); }
});
