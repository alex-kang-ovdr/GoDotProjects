import assert from 'node:assert/strict';
import { randomUUID, scryptSync } from 'node:crypto';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import accountPlatform from '../../forge/Tools/account-platform-api.cjs';
import platformStore from '../../forge/Tools/platform-store.cjs';
import { createApp } from '../server/app.mjs';
import { digest } from '../server/security.mjs';

const USER_ORIGIN = 'https://playhub.integration.test';
const ADMIN_ORIGIN = 'https://admin.integration.test';
const PASSWORD = 'creator-integration-test';
const CREATOR_PATH = '/api/creator/submissions';
const ADMIN_PATH = '/api/admin/submissions';

function client(port, origin) {
  let cookie, csrfToken;
  return {
    get cookie() { return cookie; },
    async call(path, { method = 'GET', body, csrf = true, headers = {} } = {}) {
      const response = await fetch(`http://127.0.0.1:${port}${path}`, {
        method,
        headers: {
          Origin: origin,
          ...(cookie && { Cookie: cookie }),
          ...(body !== undefined && { 'Content-Type': 'application/json' }),
          ...(csrf && method !== 'GET' && csrfToken && { 'X-CSRF-Token': csrfToken }),
          ...headers
        },
        body: body === undefined ? undefined : JSON.stringify(body)
      });
      const newCookie = response.headers.get('set-cookie');
      if (newCookie) cookie = newCookie.split(';')[0];
      const data = await response.json();
      if (data.csrfToken) csrfToken = data.csrfToken;
      return { status: response.status, data };
    }
  };
}

test('Hub listeners enforce creator ownership and administrator review without publishing', async t => {
  const temp = mkdtempSync(join(tmpdir(), 'hub-creator-integration-'));
  const root = join(temp, 'source');
  const rootDir = join(root, 'hub');
  const privateDir = join(temp, 'private');
  const gameId = 'fixture-game';
  const gameDir = join(rootDir, 'games', gameId);
  mkdirSync(gameDir, { recursive: true });
  mkdirSync(join(rootDir, 'catalog'));
  writeFileSync(join(gameDir, 'game.manifest.json'), JSON.stringify({ id: gameId, entry: 'index.html', title: 'Fixture Game' }));
  writeFileSync(join(rootDir, 'catalog', 'games.json'), JSON.stringify({ schemaVersion: 1, entries: [{ id: gameId, path: `games/${gameId}`, enabled: true }] }));
  let app;
  t.after(async () => {
    await app?.close();
    rmSync(temp, { recursive: true, force: true });
  });
  const stamp = Date.parse('2026-11-18T03:00:00Z');
  const salt = '1234567890abcdef1234567890abcdef';
  app = createApp({
    publicHost: '127.0.0.1', publicPort: 0, adminHost: '127.0.0.1', adminPort: 0,
    userOrigins: [USER_ORIGIN], adminOrigins: [ADMIN_ORIGIN], userBaseUrl: USER_ORIGIN,
    publicBaseUrl: USER_ORIGIN, adminBaseUrl: ADMIN_ORIGIN, secureCookies: true,
    dataDir: join(temp, 'data'), forge: { enabled: true, directory: privateDir },
    admin: { username: 'reviewer', salt, passwordHash: scryptSync(PASSWORD, salt, 64).toString('hex') }
  }, { rootDir, clock: () => stamp, env: {} });
  const ports = await app.listen();
  const newCreator = () => client(ports.public.port, USER_ORIGIN);
  const owner = newCreator(), other = newCreator(), guest = newCreator();
  const admin = client(ports.admin.port, ADMIN_ORIGIN);

  async function seedGoogleBinding(user, subject) {
    assert.equal((await user.call('/api/session')).data.kind, 'anonymous');
    const id = randomUUID();
    app.db.prepare('INSERT INTO users VALUES(?,?,?,?)').run(id, 'registered', subject, stamp);
    app.db.prepare('INSERT INTO identities VALUES(?,?,?)').run('google', subject, id);
    const sessionHash = digest(user.cookie.slice(user.cookie.indexOf('=') + 1));
    const result = app.db.prepare('UPDATE sessions SET principal_id=?, analytics_subject=? WHERE id_hash=?').run(id, `u:${id}`, sessionHash);
    assert.equal(result.changes, 1);
    return id;
  }
  const ownerSubject = 'fixture-owner';
  const ownerId = await seedGoogleBinding(owner, ownerSubject);
  await seedGoogleBinding(other, 'fixture-other');
  await guest.call('/api/session');
  assert.equal((await guest.call('/api/play-sessions', { method: 'POST', body: { gameId } })).status, 201);
  assert.equal((await guest.call('/api/session')).data.kind, 'guest');
  const catalogBefore = await guest.call('/api/games');
  assert.equal(catalogBefore.status, 200);
  assert.deepEqual(catalogBefore.data.games.map(game => game.id), [gameId]);

  const createdProject = await owner.call('/api/platform/projects', { method: 'POST', body: { name: 'Draft game' } });
  assert.equal(createdProject.status, 201);
  const projectId = createdProject.data.project.id;
  const key = accountPlatform.accountKey({ iss: 'https://accounts.google.com', sub: ownerSubject });
  const store = new platformStore.PlatformStore(root, join(privateDir, 'accounts', key));
  const release = await store.createRelease(projectId, { revision: 1, label: 'Review fixture' });
  const metadata = { projectId, releaseId: release.id, title: 'Draft game', description: 'Review fixture' };

  assert.equal((await guest.call(CREATOR_PATH, { method: 'POST', body: metadata })).data.error.code, 'GOOGLE_LOGIN_REQUIRED');
  assert.equal((await other.call(CREATOR_PATH, { method: 'POST', body: metadata })).data.error.code, 'RELEASE_NOT_FOUND');
  assert.equal((await owner.call(CREATOR_PATH, { method: 'POST', body: metadata, csrf: false })).data.error.code, 'CSRF_INVALID');
  const draftResult = await owner.call(CREATOR_PATH, { method: 'POST', body: metadata });
  assert.equal(draftResult.status, 201);
  const draft = draftResult.data.submission;
  assert.equal(draft.status, 'draft');
  assert.equal(draft.releaseRevision, release.revision);
  const creatorItem = `${CREATOR_PATH}/${draft.id}`;
  const adminItem = `${ADMIN_PATH}/${draft.id}`;
  assert.equal((await other.call(creatorItem)).status, 404);
  await admin.call('/api/admin/session');
  assert.equal((await admin.call(ADMIN_PATH)).data.error.code, 'ADMIN_LOGIN_REQUIRED');
  const login = await admin.call('/api/admin/login', { method: 'POST', body: { username: 'reviewer', password: PASSWORD } });
  assert.equal(login.data.authenticated, true);
  assert.equal((await admin.call(adminItem)).status, 404);

  const submitted = await owner.call(`${creatorItem}/submit`, { method: 'POST', body: { revision: draft.revision } });
  assert.equal(submitted.status, 200);
  assert.equal(submitted.data.submission.status, 'in_review');
  const review = await admin.call(ADMIN_PATH);
  assert.deepEqual(review.data.submissions.map(submission => [submission.id, submission.ownerId]), [[draft.id, ownerId]]);
  const decisionPath = `${adminItem}/decision`;
  const decision = { method: 'POST', body: { revision: submitted.data.submission.revision, decision: 'approved' } };
  assert.equal((await owner.call(decisionPath, { ...decision, headers: { Cookie: admin.cookie } })).status, 404);
  assert.equal((await admin.call(`${creatorItem}/submit`, decision)).status, 404);
  assert.equal((await admin.call(decisionPath, { ...decision, headers: { Cookie: owner.cookie } })).data.error.code, 'SESSION_REQUIRED');
  assert.equal((await admin.call(decisionPath, { ...decision, csrf: false })).data.error.code, 'CSRF_INVALID');
  assert.equal((await admin.call(decisionPath, { ...decision, headers: { Origin: USER_ORIGIN } })).data.error.code, 'ORIGIN_DENIED');

  const approved = await admin.call(decisionPath, decision);
  assert.equal(approved.status, 200);
  assert.equal(approved.data.submission.status, 'approved');
  assert.equal(approved.data.submission.publicationStatus, 'unpublished');
  assert.equal(approved.data.submission.packageValidation, 'not_verified');
  assert.equal((await owner.call(creatorItem)).data.submission.status, 'approved');
  assert.deepEqual(await guest.call('/api/games'), catalogBefore);
});
