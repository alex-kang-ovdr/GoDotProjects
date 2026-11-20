import { transaction } from './db.mjs';
import { forgeAccountKey, googleIdentityForSession } from './forge-account.mjs';
import { createLocalForgeGateway } from './forge-gateway.mjs';
import { ApiError, json, readJson, uid } from './security.mjs';

const CREATOR_PATH = '/api/creator/submissions';
const ADMIN_PATH = '/api/admin/submissions';
const FORGE_ID = /^[0-9a-f]{24}$/;
const SUBMISSION_ID = '[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}';
const CREATOR_ITEM = new RegExp(`^${CREATOR_PATH}/(${SUBMISSION_ID})(/submit)?$`);
const ADMIN_ITEM = new RegExp(`^${ADMIN_PATH}/(${SUBMISSION_ID})(/decision)?$`);
const EDITABLE = new Set(['draft', 'changes_requested']);
const ADMIN_FILTERS = new Set(['in_review', 'changes_requested', 'approved', 'all']);

function metadata(body) {
  const { projectId, releaseId, title, description } = body;
  if (typeof projectId !== 'string' || !FORGE_ID.test(projectId)
      || typeof releaseId !== 'string' || !FORGE_ID.test(releaseId)
      || typeof title !== 'string' || !title.trim() || title.trim().length > 100
      || typeof description !== 'string' || !description.trim() || description.trim().length > 2000) {
    throw new ApiError(400, 'INVALID_SUBMISSION');
  }
  return { projectId, releaseId, title: title.trim(), description: description.trim() };
}

function toSubmission(row) {
  return {
    id: row.id,
    projectId: row.project_id,
    releaseId: row.release_id,
    releaseRevision: row.release_revision,
    releaseLabel: row.release_label,
    title: row.title,
    description: row.description,
    status: row.status,
    revision: row.revision,
    reviewNote: row.review_note,
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
    submittedAt: row.submitted_at === null ? null : new Date(row.submitted_at).toISOString(),
    decidedAt: row.decided_at === null ? null : new Date(row.decided_at).toISOString(),
    publicationStatus: 'unpublished',
    packageValidation: 'not_verified'
  };
}

function toAdminSubmission(row) {
  return { ...toSubmission(row), ownerId: row.owner_id, ownerName: row.owner_name || null };
}

function offsetFrom(url) {
  const raw = url.searchParams.get('offset') ?? '0';
  const offset = Number(raw);
  if (!/^\d+$/.test(raw) || !Number.isSafeInteger(offset)) throw new ApiError(400, 'INVALID_SUBMISSION_FILTER');
  return offset;
}

function checkRevision(row, revision) {
  if (!Number.isSafeInteger(revision) || revision < 1) throw new ApiError(400, 'INVALID_SUBMISSION_REVISION');
  if (revision !== row.revision) throw new ApiError(409, 'SUBMISSION_REVISION_CONFLICT');
}

export function createCreatorReview({ config, db, requireSession, root, now, audit, forgeGateway }) {
  // Forge releases are read only through the gateway; a local one is created on first use when none is injected.
  let gateway = forgeGateway || null;
  const forge = () => gateway || (gateway = createLocalForgeGateway({ config, root }));
  db.exec(`
    CREATE TABLE IF NOT EXISTS creator_submissions (
      id TEXT PRIMARY KEY,
      owner_key TEXT NOT NULL,
      owner_id TEXT NOT NULL REFERENCES users(id),
      project_id TEXT NOT NULL,
      release_id TEXT NOT NULL,
      release_revision INTEGER NOT NULL,
      release_label TEXT NOT NULL,
      title TEXT NOT NULL,
      description TEXT NOT NULL,
      status TEXT NOT NULL CHECK(status IN ('draft','in_review','changes_requested','approved')),
      revision INTEGER NOT NULL CHECK(revision > 0),
      review_note TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      submitted_at INTEGER,
      decided_at INTEGER
    );
    CREATE INDEX IF NOT EXISTS creator_submissions_owner_date ON creator_submissions(owner_key,updated_at DESC,id DESC);
    CREATE INDEX IF NOT EXISTS creator_submissions_review_date ON creator_submissions(status,submitted_at DESC,id DESC);
  `);

  const getOwnerRow = db.prepare('SELECT * FROM creator_submissions WHERE owner_key=? AND id=?');
  const adminRows = `SELECT submission.*, users.display_name AS owner_name FROM creator_submissions AS submission
    JOIN users ON users.id=submission.owner_id`;
  const getAdminRow = db.prepare(`${adminRows} WHERE submission.id=? AND submission.status<>'draft'`);
  const listOwnerRows = db.prepare('SELECT * FROM creator_submissions WHERE owner_key=? ORDER BY updated_at DESC,id DESC LIMIT ? OFFSET ?');
  const listAdminRows = db.prepare(`${adminRows} WHERE submission.status<>'draft' AND (?='all' OR submission.status=?)
    ORDER BY submission.submitted_at DESC,submission.id DESC LIMIT ? OFFSET ?`);
  const insert = db.prepare(`INSERT INTO creator_submissions
    (id,owner_key,owner_id,project_id,release_id,release_revision,release_label,title,description,status,revision,created_at,updated_at)
    VALUES (?,?,?,?,?,?,?,?,?,'draft',1,?,?)`);
  const edit = db.prepare(`UPDATE creator_submissions SET project_id=?,release_id=?,release_revision=?,release_label=?,title=?,description=?,
    revision=revision+1,updated_at=? WHERE id=? AND owner_key=? AND revision=?`);
  const submit = db.prepare(`UPDATE creator_submissions SET status='in_review',revision=revision+1,updated_at=?,submitted_at=?,
    review_note=NULL,decided_at=NULL WHERE id=? AND owner_key=? AND revision=?`);
  const decide = db.prepare(`UPDATE creator_submissions SET status=?,review_note=?,revision=revision+1,updated_at=?,decided_at=?
    WHERE id=? AND revision=? AND status='in_review'`);

  function requireForge() {
    if (config?.enabled !== true) throw new ApiError(503, 'FORGE_DISABLED');
  }

  function creator(req) {
    const session = requireSession(req, 'public');
    if (req.headers.authorization) throw new ApiError(401, 'GOOGLE_LOGIN_REQUIRED');
    let identity;
    try { identity = googleIdentityForSession(db, session); }
    catch (error) {
      if (error.code !== 'GOOGLE_LOGIN_REQUIRED') throw error;
      throw new ApiError(401, 'GOOGLE_LOGIN_REQUIRED');
    }
    requireForge();
    // Hub computes the Forge account key itself; Forge's accountKey() is the same hash (see forge-account test).
    return { id: session.principal_id, key: forgeAccountKey(identity), sessionHash: session.id_hash };
  }

  function recheckCreator(req, previous) {
    const current = creator(req);
    if (current.id !== previous.id || current.key !== previous.key || current.sessionHash !== previous.sessionHash) {
      throw new ApiError(401, 'SESSION_REQUIRED');
    }
  }

  function ownedRelease(key, projectId, releaseId) {
    requireForge();
    try { return forge().getRelease(key, projectId, releaseId); }
    catch (error) {
      if (error.status !== 404) throw error;
      throw new ApiError(404, 'RELEASE_NOT_FOUND');
    }
  }

  function pinnedRelease(row) {
    const release = ownedRelease(row.owner_key, row.project_id, row.release_id);
    if (release.revision !== row.release_revision) throw new ApiError(409, 'SUBMISSION_RELEASE_MISMATCH');
  }

  function ownerRow(owner, id) {
    const row = getOwnerRow.get(owner.key, id);
    if (!row) throw new ApiError(404, 'SUBMISSION_NOT_FOUND');
    return row;
  }

  function adminRow(id) {
    const row = getAdminRow.get(id);
    if (!row) throw new ApiError(404, 'SUBMISSION_NOT_FOUND');
    return row;
  }

  function writeAudit(action, row, actor = {}) {
    audit(action, row.id, {
      status: row.status, revision: row.revision, projectId: row.project_id, releaseId: row.release_id, ...actor
    });
  }

  return {
    async publicRoute(req, res, url) {
      const { pathname } = url;
      if (pathname !== CREATOR_PATH && !pathname.startsWith(CREATOR_PATH + '/')) return false;
      const owner = creator(req);
      if (pathname === CREATOR_PATH && req.method === 'GET') {
        const limit = 100;
        const rows = listOwnerRows.all(owner.key, limit + 1, offsetFrom(url));
        json(res, 200, { submissions: rows.slice(0, limit).map(toSubmission), hasMore: rows.length > limit });
        return true;
      }
      if (pathname === CREATOR_PATH && req.method === 'POST') {
        const draft = metadata(await readJson(req, 16 * 1024));
        recheckCreator(req, owner);
        const release = ownedRelease(owner.key, draft.projectId, draft.releaseId);
        const submission = transaction(db, () => {
          const id = uid(), stamp = now();
          insert.run(id, owner.key, owner.id, draft.projectId, draft.releaseId, release.revision, release.label,
            draft.title, draft.description, stamp, stamp);
          const row = ownerRow(owner, id);
          writeAudit('creator_submission_created', row, { ownerId: owner.id });
          return toSubmission(row);
        });
        json(res, 201, { submission });
        return true;
      }

      const match = pathname.match(CREATOR_ITEM);
      if (!match) throw new ApiError(pathname === CREATOR_PATH ? 405 : 404, pathname === CREATOR_PATH ? 'METHOD_NOT_ALLOWED' : 'NOT_FOUND');
      const [, id, submissionAction] = match;
      if (!submissionAction && req.method === 'GET') {
        json(res, 200, { submission: toSubmission(ownerRow(owner, id)) });
        return true;
      }
      const isEdit = !submissionAction && req.method === 'PATCH';
      if (!isEdit && !(submissionAction && req.method === 'POST')) throw new ApiError(405, 'METHOD_NOT_ALLOWED');
      const body = await readJson(req, 16 * 1024);
      recheckCreator(req, owner);
      const submission = transaction(db, () => {
        const current = ownerRow(owner, id);
        checkRevision(current, body.revision);
        if (!EDITABLE.has(current.status)) throw new ApiError(409, 'INVALID_SUBMISSION_STATE');
        const stamp = now();
        if (isEdit) {
          const draft = metadata(body);
          const release = ownedRelease(owner.key, draft.projectId, draft.releaseId);
          edit.run(draft.projectId, draft.releaseId, release.revision, release.label, draft.title, draft.description,
            stamp, id, owner.key, current.revision);
        } else {
          pinnedRelease(current);
          submit.run(stamp, stamp, id, owner.key, current.revision);
        }
        const row = ownerRow(owner, id);
        writeAudit(isEdit ? 'creator_submission_edited' : 'creator_submission_requested', row, { ownerId: owner.id });
        return toSubmission(row);
      });
      json(res, 200, { submission });
      return true;
    },

    async adminRoute(req, res, url) {
      const { pathname } = url;
      if (pathname !== ADMIN_PATH && !pathname.startsWith(ADMIN_PATH + '/')) return false;
      const session = requireSession(req, 'admin', true);
      if (pathname === ADMIN_PATH && req.method === 'GET') {
        const status = url.searchParams.get('status') ?? 'in_review';
        if (!ADMIN_FILTERS.has(status)) throw new ApiError(400, 'INVALID_SUBMISSION_FILTER');
        const limit = 25;
        const rows = listAdminRows.all(status, status, limit + 1, offsetFrom(url));
        json(res, 200, { submissions: rows.slice(0, limit).map(toAdminSubmission), hasMore: rows.length > limit });
        return true;
      }

      const match = pathname.match(ADMIN_ITEM);
      if (!match) throw new ApiError(pathname === ADMIN_PATH ? 405 : 404, pathname === ADMIN_PATH ? 'METHOD_NOT_ALLOWED' : 'NOT_FOUND');
      const [, id, decisionAction] = match;
      if (!decisionAction && req.method === 'GET') {
        json(res, 200, { submission: toAdminSubmission(adminRow(id)) });
        return true;
      }
      if (!decisionAction || req.method !== 'POST') throw new ApiError(405, 'METHOD_NOT_ALLOWED');
      const { revision, decision, note = '' } = await readJson(req, 8 * 1024);
      const currentSession = requireSession(req, 'admin', true);
      if (currentSession.id_hash !== session.id_hash || currentSession.admin_username !== session.admin_username) {
        throw new ApiError(401, 'ADMIN_LOGIN_REQUIRED');
      }
      if (!['changes_requested', 'approved'].includes(decision) || typeof note !== 'string' || note.trim().length > 1000
          || (decision === 'changes_requested' && !note.trim())) {
        throw new ApiError(400, 'INVALID_SUBMISSION_DECISION');
      }
      const submission = transaction(db, () => {
        const current = adminRow(id);
        checkRevision(current, revision);
        if (current.status !== 'in_review') throw new ApiError(409, 'INVALID_SUBMISSION_STATE');
        if (decision === 'approved') pinnedRelease(current);
        const stamp = now();
        decide.run(decision, note.trim() || null, stamp, stamp, id, current.revision);
        const row = adminRow(id);
        writeAudit(decision === 'approved' ? 'creator_submission_approved' : 'creator_submission_changes_requested', row,
          { admin: session.admin_username, note: row.review_note });
        return toAdminSubmission(row);
      });
      json(res, 200, { submission });
      return true;
    }
  };
}
