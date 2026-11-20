// Reference-based garbage collection. Order matters: expire plans (drops leases and reservations),
// prune old history (drops references), clean abandoned PENDING writes, then sweep unreferenced blobs.
// Head commits and pinned commits are never pruned; latest versions are never deleted for age.
import { transaction } from '../db.mjs';

const DAY = 24 * 60 * 60 * 1000;

export function createCdnGc({ db, store, quota, now, audit = () => {}, settings, readManifest }) {
  const s = settings;
  const tx = fn => transaction(db, fn);

  async function expirePlans(report) {
    const plans = db.prepare("SELECT id, owner FROM cdn_save_plans WHERE state='OPEN' AND expires_at<=?").all(now());
    for (const plan of plans) {
      const keys = tx(() => {
        if (db.prepare("UPDATE cdn_save_plans SET state='EXPIRED', reserved_bytes=0 WHERE id=? AND state='OPEN'").run(plan.id).changes !== 1) return [];
        const open = db.prepare("SELECT id, quarantine_key, reserved_bytes FROM cdn_uploads WHERE plan_id=? AND state IN ('UPLOADING','VERIFYING','FAILED')").all(plan.id);
        quota.release(plan.owner, open.reduce((n, u) => n + u.reserved_bytes, 0));
        db.prepare("UPDATE cdn_uploads SET state='EXPIRED', reserved_bytes=0, updated_at=? WHERE plan_id=? AND state IN ('UPLOADING','VERIFYING')").run(now(), plan.id);
        db.prepare('UPDATE cdn_uploads SET reserved_bytes=0 WHERE plan_id=?').run(plan.id);
        return open.map(u => u.quarantine_key);
      });
      report.plansExpired++;
      for (const key of keys) { try { await store.delete('quarantine', key); report.quarantineDeleted++; } catch { report.errors++; } }
    }
    // A crash during verification leaves VERIFYING behind; hand it back to the client for a retry.
    report.uploadsUnstuck += db.prepare("UPDATE cdn_uploads SET state='UPLOADING', updated_at=? WHERE state='VERIFYING' AND updated_at<?").run(now(), now() - s.verifyTimeoutMs).changes;
  }

  async function pruneHistory(report) {
    const cutoff = now() - s.retentionDays * DAY;
    const projects = db.prepare('SELECT id, owner, head_commit_id FROM cdn_projects').all();
    for (const project of projects) {
      // Policy (conservative AND): prune only when older than retentionDays AND outside the newest retentionCount.
      const candidates = db.prepare(`SELECT * FROM cdn_commits c WHERE c.project_id=? AND c.pruned_at IS NULL AND c.id<>COALESCE(?, '')
          AND c.created_at < ? AND NOT EXISTS(SELECT 1 FROM cdn_pins p WHERE p.commit_id=c.id)
          AND c.id NOT IN (SELECT id FROM cdn_commits WHERE project_id=? AND pruned_at IS NULL ORDER BY created_at DESC, rowid DESC LIMIT ?)`)
        .all(project.id, project.head_commit_id, cutoff, project.id, s.retentionCount);
      for (const commit of candidates) {
        let manifest;
        try { manifest = await readManifest(commit); } catch { report.errors++; continue; }
        const pruned = tx(() => {
          const r = db.prepare(`UPDATE cdn_commits SET pruned_at=? WHERE id=? AND pruned_at IS NULL
              AND id<>COALESCE((SELECT head_commit_id FROM cdn_projects WHERE id=?), '')
              AND NOT EXISTS(SELECT 1 FROM cdn_pins WHERE commit_id=?)`).run(now(), commit.id, project.id, commit.id);
          if (r.changes !== 1) return false;
          for (const blobId of new Set([commit.manifest_blob_id, ...manifest.files.map(f => f.blobId)])) {
            db.prepare('UPDATE cdn_blobs SET ref_count=MAX(0,ref_count-1) WHERE id=?').run(blobId);
          }
          return true;
        });
        if (pruned) report.commitsPruned++;
      }
    }
  }

  async function cleanPending(report) {
    // PENDING rows were never charged to quota, so they use their own ABANDONED state (never DELETING,
    // which the sweep refunds). Claiming first makes a late PENDING->LIVE promotion fail instead of racing.
    const stale = db.prepare("SELECT * FROM cdn_blobs WHERE (state='PENDING' AND state_at<?) OR state='ABANDONED'").all(now() - s.gcGraceMs);
    for (const blob of stale) {
      if (blob.state === 'PENDING' && db.prepare("UPDATE cdn_blobs SET state='ABANDONED', state_at=? WHERE id=? AND state='PENDING'").run(now(), blob.id).changes !== 1) continue;
      try { await store.delete('projects', blob.object_key); } catch { report.errors++; continue; }
      db.prepare("UPDATE cdn_blobs SET state='DELETED', state_at=? WHERE id=? AND state='ABANDONED'").run(now(), blob.id);
      report.pendingCleaned++;
    }
  }

  async function sweep(report) {
    const stamp = now();
    const candidates = db.prepare("SELECT * FROM cdn_blobs WHERE (state='LIVE' AND ref_count=0 AND lease_until<? AND state_at<?) OR state='DELETING'").all(stamp, stamp - s.gcGraceMs);
    for (const blob of candidates) {
      if (blob.state === 'LIVE') {
        // Conditional transition: loses cleanly if a save-plan leased it or a commit referenced it.
        const r = db.prepare("UPDATE cdn_blobs SET state='DELETING', state_at=? WHERE id=? AND state='LIVE' AND ref_count=0 AND lease_until<?").run(now(), blob.id, now());
        if (r.changes !== 1) { report.sweepSkipped++; continue; }
      }
      try { await store.delete('projects', blob.object_key); } catch { report.errors++; continue; }
      tx(() => {
        if (db.prepare("UPDATE cdn_blobs SET state='DELETED', state_at=? WHERE id=? AND state='DELETING'").run(now(), blob.id).changes === 1) quota.refund(blob.owner, blob.bytes);
      });
      report.blobsDeleted++;
      report.bytesFreed += blob.bytes;
    }
  }

  async function run() {
    const report = { plansExpired: 0, quarantineDeleted: 0, uploadsUnstuck: 0, commitsPruned: 0, pendingCleaned: 0, blobsDeleted: 0, bytesFreed: 0, sweepSkipped: 0, errors: 0 };
    await expirePlans(report);
    await pruneHistory(report);
    await cleanPending(report);
    await sweep(report);
    db.prepare('DELETE FROM cdn_idempotency WHERE created_at<?').run(now() - DAY);
    audit('cdn_gc', null, report);
    return report;
  }

  return { run };
}
