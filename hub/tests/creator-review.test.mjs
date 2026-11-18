import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PassThrough } from 'node:stream';
import test from 'node:test';
import { createCreatorReview } from '../server/creator-review.mjs';
import { openDatabase } from '../server/db.mjs';
import { ApiError, uid } from '../server/security.mjs';

const require = createRequire(import.meta.url);
const { accountKey } = require('../../forge/Tools/account-platform-api.cjs');
const { PlatformStore } = require('../../forge/Tools/platform-store.cjs');
const CREATOR = '/api/creator/submissions';
const ADMIN = '/api/admin/submissions';
const csrfToken = 'fixture-csrf';

async function fixture(t) {
  const directory = mkdtempSync(join(tmpdir(), 'creator-review-'));
  const root = join(directory, 'source');
  const storage = join(directory, 'private');
  const db = openDatabase(join(directory, 'database'));
  t.after(() => { db.close(); rmSync(directory, { recursive: true, force: true }); });
  let stamp = 1780000000000;
  const now = () => ++stamp;
  for (const [id, name] of [['owner', 'Owner'], ['other', 'Other'], ['guest', null], ['unbound', 'Unbound']]) {
    db.prepare('INSERT INTO users VALUES (?,?,?,?)').run(id, id === 'guest' ? 'guest' : 'registered', name, now());
  }
  for (const id of ['owner', 'other']) db.prepare('INSERT INTO identities VALUES (?,?,?)').run('google', `google-${id}`, id);

  const sessions = new Map();
  for (const id of ['owner', 'other', 'guest', 'unbound', 'qa']) {
    sessions.set(id, { kind: 'public', principal_id: id === 'qa' ? 'owner' : id, traffic_type: id === 'qa' ? 'qa' : 'live', id_hash: id, csrf: csrfToken });
  }
  sessions.set('operator', { kind: 'admin', admin_authenticated: true, admin_username: 'operator', id_hash: 'admin-token', csrf: csrfToken });
  sessions.set('locked', { kind: 'admin', admin_authenticated: false, id_hash: 'anon-token', csrf: csrfToken });
  function requireSession(req, kind, adminRequired) {
    assert.equal(Boolean(adminRequired), kind === 'admin');
    const session = sessions.get(req.headers.cookie);
    if (session?.kind !== kind) throw new ApiError(401, 'SESSION_REQUIRED');
    if (adminRequired && !session.admin_authenticated) throw new ApiError(401, 'ADMIN_LOGIN_REQUIRED');
    if (req.method !== 'GET' && req.headers['x-csrf-token'] !== session.csrf) throw new ApiError(403, 'CSRF_INVALID');
    return session;
  }
  const audit = (action, target, detail) => db.prepare('INSERT INTO audit VALUES (?,?,?,?,?)')
    .run(uid(), action, target, JSON.stringify(detail), now());
  const review = createCreatorReview({ db, config: { enabled: true, directory: storage }, requireSession, root, now, audit });

  const ownerKey = accountKey({ iss: 'https://accounts.google.com', sub: 'google-owner' });
  const store = new PlatformStore(root, join(storage, 'accounts', ownerKey));
  const project = store.createProject({ name: 'A private Forge game' });
  const release = await store.createRelease(project.id, { label: 'Original' });
  const updated = await store.updateFile(project.id, { path: 'README.txt', content: 'Updated game content', baseRevision: project.revision });
  const secondRelease = await store.createRelease(project.id, { revision: updated.revision, label: 'Revised' });
  const draft = { projectId: project.id, releaseId: release.id, title: ' <b>Example</b> ', description: ' An original game ' };

  function open(route, { method = 'GET', who = 'owner', csrf = true, header = {}, surface = route.startsWith(ADMIN) ? 'admin' : 'public' } = {}) {
    const req = new PassThrough();
    req.method = method;
    req.headers = { cookie: who, 'content-type': 'application/json', ...(csrf ? { 'x-csrf-token': csrfToken } : {}), ...header };
    let data;
    const res = { statusCode: 200, setHeader() {}, end(body) { data = JSON.parse(body); } };
    const result = review[`${surface}Route`](req, res, new URL(`http://local.invalid${route}`))
      .then(matched => ({ status: matched ? res.statusCode : 404, data }), error => {
        if (!(error instanceof ApiError)) throw error;
        return { status: error.status, code: error.code };
      });
    return { result, finish(body) { req.end(JSON.stringify(body ?? {})); return result; } };
  }
  const call = (route, options = {}) => open(route, options).finish(options.body);
  const create = async (body = draft) => {
    const response = await call(CREATOR, { method: 'POST', body });
    assert.equal(response.status, 201, JSON.stringify(response));
    return response.data.submission;
  };
  return { db, sessions, store, project, release, secondRelease, draft, open, call, create };
}

const itemPath = item => `${CREATOR}/${item.id}`;
const reviewPath = item => `${ADMIN}/${item.id}`;
const submissionBody = (item, body = {}) => ({ revision: item.revision, ...body });

test('creator submissions require a registered Google identity and the owner’s Forge release', async t => {
  const { call, create, draft } = await fixture(t);
  for (const who of ['guest', 'unbound', 'qa']) {
    assert.deepEqual(await call(CREATOR, { who }), { status: 401, code: 'GOOGLE_LOGIN_REQUIRED' });
  }
  assert.equal((await call(CREATOR, { header: { authorization: 'Bearer alternate-identity' } })).status, 401);
  assert.deepEqual(await call(CREATOR, { method: 'POST', csrf: false, body: draft }), { status: 403, code: 'CSRF_INVALID' });
  assert.equal((await call(CREATOR, { method: 'POST', body: { ...draft, title: '  ' } })).status, 400);
  assert.deepEqual(await call(CREATOR, { method: 'POST', who: 'other', body: { ...draft, ownerId: 'owner' } }),
    { status: 404, code: 'RELEASE_NOT_FOUND' });

  const item = await create({ ...draft, ownerId: 'other', status: 'approved', packageValidation: 'verified' });
  assert.equal(item.title, '<b>Example</b>');
  assert.equal(item.status, 'draft');
  assert.equal(item.packageValidation, 'not_verified');
  assert.equal(item.releaseRevision, 1);
  assert.equal(Object.hasOwn(item, 'ownerId'), false);
  assert.equal(Object.hasOwn(item, 'files'), false);
  assert.deepEqual((await call(CREATOR, { who: 'other' })).data.submissions, []);
  assert.equal((await call(itemPath(item), { who: 'other' })).status, 404);
  assert.equal((await call(itemPath(item), { who: 'other', method: 'PATCH', body: { ...draft, revision: item.revision } })).status, 404);
  assert.equal((await call(`${itemPath(item)}/submit`, { who: 'other', method: 'POST', body: submissionBody(item) })).status, 404);
  assert.equal((await call(itemPath(item))).data.submission.id, item.id);
});

test('metadata review supports correction and resubmission while approvals remain unpublished', async t => {
  const { call, create, draft, secondRelease, db } = await fixture(t);
  const initial = await create();
  const creator = itemPath(initial);
  const admin = reviewPath(initial);
  const decide = (item, decision, note = '', options = {}) => call(`${admin}/decision`, {
    method: 'POST', who: 'operator', body: submissionBody(item, { decision, note }), ...options
  });
  assert.equal((await call(ADMIN, { who: 'owner' })).status, 401);
  assert.deepEqual(await call(ADMIN, { who: 'locked' }), { status: 401, code: 'ADMIN_LOGIN_REQUIRED' });
  assert.deepEqual((await call(`${ADMIN}?status=all`, { who: 'operator' })).data.submissions, []);
  assert.equal((await call(admin, { who: 'operator' })).status, 404);
  assert.equal((await decide(initial, 'approved')).status, 404);

  const inReview = (await call(`${creator}/submit`, { method: 'POST', body: submissionBody(initial) })).data.submission;
  assert.equal(inReview.status, 'in_review');
  assert.deepEqual(await call(creator, { method: 'PATCH', body: submissionBody(inReview, draft) }), { status: 409, code: 'INVALID_SUBMISSION_STATE' });
  assert.deepEqual(await decide(inReview, 'approved', '', { csrf: false }), { status: 403, code: 'CSRF_INVALID' });
  assert.equal((await decide(inReview, 'changes_requested')).status, 400);

  const queue = (await call(ADMIN, { who: 'operator' })).data.submissions;
  assert.equal(queue[0].ownerName, 'Owner');
  assert.equal(queue[0].releaseId, draft.releaseId);
  assert.equal(Object.hasOwn(queue[0], 'owner_key'), false);
  const returned = (await decide(inReview, 'changes_requested', '조작 안내를 추가해 주세요.')).data.submission;
  assert.equal(returned.status, 'changes_requested');
  assert.deepEqual(await decide(inReview, 'approved'), { status: 409, code: 'SUBMISSION_REVISION_CONFLICT' });
  const revised = (await call(creator, { method: 'PATCH', body: submissionBody(returned, { ...draft, releaseId: secondRelease.id, description: '게임 조작 안내' }) })).data.submission;
  assert.equal(revised.reviewNote, returned.reviewNote);
  assert.equal(revised.releaseRevision, secondRelease.revision);
  const resubmitted = (await call(`${creator}/submit`, { method: 'POST', body: submissionBody(revised) })).data.submission;
  assert.equal(resubmitted.reviewNote, null);

  const results = await Promise.all([decide(resubmitted, 'approved'), decide(resubmitted, 'approved')]);
  assert.deepEqual(results.map(row => row.status).sort(), [200, 409]);
  const approved = results.find(row => row.status === 200).data.submission;
  assert.equal(approved.status, 'approved');
  assert.equal(approved.packageValidation, 'not_verified');
  assert.equal(approved.publicationStatus, 'unpublished');
  assert.equal((await call(`${admin}/publish`, { method: 'POST', who: 'operator', body: submissionBody(approved) })).status, 404);
  assert.equal(db.prepare('SELECT COUNT(*) AS count FROM game_overrides').get().count, 0);
  assert.deepEqual(await call(creator, { method: 'PATCH', body: submissionBody(approved, draft) }), { status: 409, code: 'INVALID_SUBMISSION_STATE' });
  const audit = db.prepare('SELECT action, detail FROM audit WHERE target=? ORDER BY created_at').all(approved.id);
  assert.deepEqual(audit.map(row => row.action), ['creator_submission_created', 'creator_submission_requested',
    'creator_submission_changes_requested', 'creator_submission_edited', 'creator_submission_requested', 'creator_submission_approved']);
  assert.equal(JSON.parse(audit[2].detail).note, returned.reviewNote);
  assert.equal(JSON.parse(audit.at(-1).detail).admin, 'operator');
});

test('slow submission mutations refuse revoked or replaced creator and administrator sessions', async t => {
  const { open, create, draft, call, sessions } = await fixture(t);
  const owner = sessions.get('owner');
  const pendingCreate = open(CREATOR, { method: 'POST' });
  sessions.delete('owner');
  assert.equal((await pendingCreate.finish(draft)).status, 401);
  sessions.set('owner', owner);
  assert.deepEqual((await call(CREATOR)).data.submissions, []);

  const item = await create();
  const pendingEdit = open(itemPath(item), { method: 'PATCH' });
  sessions.set('owner', { ...owner, principal_id: 'other' });
  assert.equal((await pendingEdit.finish(submissionBody(item, { ...draft, title: 'Unexpected change' }))).status, 401);
  sessions.set('owner', owner);
  assert.equal((await call(itemPath(item))).data.submission.title, item.title);

  const submit = `${itemPath(item)}/submit`;
  const pendingSubmit = open(submit, { method: 'POST' });
  sessions.delete('owner');
  assert.equal((await pendingSubmit.finish(submissionBody(item))).status, 401);
  sessions.set('owner', owner);
  const inReview = (await call(submit, { method: 'POST', body: submissionBody(item) })).data.submission;

  const pendingApprove = open(`${reviewPath(item)}/decision`, { method: 'POST', who: 'operator' });
  sessions.set('operator', { ...sessions.get('operator'), admin_username: 'replacement' });
  assert.equal((await pendingApprove.finish(submissionBody(inReview, { decision: 'approved' }))).status, 401);
  assert.equal((await call(itemPath(item))).data.submission.status, 'in_review');
});

test('decision preserves review state if the pinned Forge release or audit write fails', async t => {
  const { create, call, store, project, release, db } = await fixture(t);
  const draft = await create();
  const inReview = (await call(`${itemPath(draft)}/submit`, { method: 'POST', body: submissionBody(draft) })).data.submission;
  const approve = () => call(`${reviewPath(draft)}/decision`, { method: 'POST', who: 'operator', body: submissionBody(inReview, { decision: 'approved' }) });
  const original = store.read(project.id);
  store.persist({ ...original, releases: original.releases.filter(entry => entry.id !== release.id) });
  assert.deepEqual(await approve(), { status: 404, code: 'RELEASE_NOT_FOUND' });
  store.persist(original);

  db.exec(`CREATE TRIGGER fail_approval_audit BEFORE INSERT ON audit WHEN NEW.action='creator_submission_approved'
    BEGIN SELECT RAISE(ABORT, 'test audit failure'); END`);
  await assert.rejects(approve(), /test audit failure/);
  assert.equal((await call(itemPath(draft))).data.submission.revision, inReview.revision);
  assert.equal((await call(itemPath(draft))).data.submission.status, 'in_review');
});
