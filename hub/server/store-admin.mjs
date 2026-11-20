import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { transaction } from './db.mjs';
import { ApiError, json, readJson } from './security.mjs';

const SLUG_RE = /^[a-z][a-z0-9-]{1,63}$/;
const SUBMISSION_ID_RE = /^[a-zA-Z0-9][a-zA-Z0-9._-]{1,127}$/;
const VERSION_RE = /^[0-9]+\.[0-9]+\.[0-9]+(?:-[a-zA-Z0-9.-]+)?$/;
const RELEASE_ID_RE = /^rel-[a-z0-9-]{4,64}$/;
const ARTIFACT_ID_RE = /^art-[a-z0-9-]{4,64}$/;
const SHA256_PREFIXED_RE = /^sha256:[a-f0-9]{64}$/;
const SHA256_HEX_RE = /^[a-f0-9]{64}$/;
const GODOT_VER_RE = /^[0-9]+\.[0-9]+(?:\.[0-9]+)?$/;
const PLATFORMS = new Set(['web', 'windows', 'linux', 'macos']);
const RELEASE_KINDS = new Set(['package', 'editorial']);
const PACKAGE_STATUSES = new Set(['published', 'hidden', 'deprecated', 'yanked']);
const SUBMISSION_FILTERS = new Set(['all', 'in_review', 'approved', 'rejected', 'changes_requested']);
const DECISION_TO_STATUS = Object.freeze({
  approve: 'approved',
  reject: 'rejected',
  request_changes: 'changes_requested'
});

const DECISION_ROUTE = /^\/api\/admin\/store\/submissions\/([^/]+)\/decision$/;
const PACKAGE_STATUS_ROUTE = /^\/api\/admin\/store\/packages\/([^/]+)\/status$/;

const hex64 = ch => ch.repeat(64);

const SEED_PACKAGES = Object.freeze([
  {
    slug: 'lowpoly-fortress-pack',
    asset_id: 'lowpoly-fortress-pack',
    title: 'Lowpoly Fortress Siege Kit',
    summary: '성벽, 포탑, 탄두 메쉬와 충돌 콜라이더가 포함된 모듈형 3D 에셋 팩입니다.',
    category: '3D 환경 · 요새',
    publisher_id: 'pub-playforge-core',
    release_kind: 'package',
    asset_version_id: '1.2.0',
    release_id: 'rel-lowpoly-fortress-120',
    artifact_id: 'art-lowpoly-fortress-120',
    artifact_digest: `sha256:${hex64('a')}`,
    dependency_manifest_hash: `sha256:${hex64('1')}`,
    engine_compatibility: { godot_min: '4.3', godot_tested: '4.7.2', platforms: ['web', 'windows', 'linux'] },
    file_manifest: [
      { path: 'assets/fortress/wall_segment.glb', bytes: 184320, sha256: hex64('b'), executable_addon: false },
      { path: 'assets/fortress/turret_base.tscn', bytes: 8192, sha256: hex64('c'), executable_addon: false }
    ],
    license_snapshot_ref: 'lic-cc0-v1-20261120',
    status: 'published',
    status_reason: null,
    install_count: 142,
    report_count: 0
  },
  {
    slug: 'ui-tactical-hud-kit',
    asset_id: 'ui-tactical-hud-kit',
    title: 'Tactical Strategy HUD & Minimap',
    summary: '전략 게임용 체력바, 미니맵 프레임, 입력 힌트 테마와 도크 보조 스크립트 묶음입니다.',
    category: 'UI · 테마 · Addon',
    publisher_id: 'pub-studio-nord',
    release_kind: 'package',
    asset_version_id: '2.0.1',
    release_id: 'rel-ui-tactical-201',
    artifact_id: 'art-ui-tactical-201',
    artifact_digest: `sha256:${hex64('d')}`,
    dependency_manifest_hash: `sha256:${hex64('2')}`,
    engine_compatibility: { godot_min: '4.3', godot_tested: '4.7.2', platforms: ['web', 'windows', 'linux'] },
    file_manifest: [
      { path: 'addons/tactical_hud/plugin.cfg', bytes: 512, sha256: hex64('e'), executable_addon: true },
      { path: 'addons/tactical_hud/hud_theme.tres', bytes: 14336, sha256: hex64('f'), executable_addon: false }
    ],
    license_snapshot_ref: 'lic-mit-v1-20261120',
    status: 'published',
    status_reason: null,
    install_count: 98,
    report_count: 0
  },
  {
    slug: 'sfx-siege-audio-pack',
    asset_id: 'sfx-siege-audio-pack',
    title: 'Siege Artillery & UI SFX Pack',
    summary: '포격, 타격, 버튼 피드백용 무손실 OGG 효과음 32종 패키지입니다.',
    category: '오디오 · 효과음',
    publisher_id: 'pub-audio-atelier',
    release_kind: 'package',
    asset_version_id: '1.1.0',
    release_id: 'rel-sfx-siege-110',
    artifact_id: 'art-sfx-siege-110',
    artifact_digest: `sha256:${hex64('3')}`,
    dependency_manifest_hash: `sha256:${hex64('4')}`,
    engine_compatibility: { godot_min: '4.3', godot_tested: '4.7.2', platforms: ['web', 'windows', 'linux', 'macos'] },
    file_manifest: [
      { path: 'assets/audio/cannon_fire.ogg', bytes: 92160, sha256: hex64('5'), executable_addon: false }
    ],
    license_snapshot_ref: 'lic-royalty-free-v1-20261120',
    status: 'published',
    status_reason: null,
    install_count: 67,
    report_count: 0
  },
  {
    slug: 'godot-47-dock-guide',
    asset_id: 'godot-47-dock-guide',
    title: 'Godot 에디터 도크 레이아웃 & 안전 적용 가이드',
    summary: '웹 Store에서 라이브러리에 저장한 에셋을 Godot 도크에서 변경 검토 후 프로젝트에 반영하는 권장 흐름 안내입니다.',
    category: '가이드 · 일반 콘텐츠',
    publisher_id: 'pub-playforge-docs',
    release_kind: 'editorial',
    asset_version_id: '1.0.0',
    release_id: 'rel-editorial-dock-100',
    artifact_id: null,
    artifact_digest: null,
    dependency_manifest_hash: null,
    engine_compatibility: null,
    file_manifest: null,
    license_snapshot_ref: 'lic-editorial-v1',
    status: 'published',
    status_reason: null,
    install_count: 0,
    report_count: 0
  },
  {
    slug: 'legacy-voxel-shader-pack',
    asset_id: 'legacy-voxel-shader-pack',
    title: 'Legacy Voxel Shader Pack',
    summary: '이전 Godot 4.3 전용 복셀 라이팅 셰이더 묶음입니다. v1.0 대체 릴리스로 전환을 권장합니다.',
    category: '셰이더 · 렌더링',
    publisher_id: 'pub-shader-lab',
    release_kind: 'package',
    asset_version_id: '0.9.4',
    release_id: 'rel-legacy-voxel-094',
    artifact_id: 'art-legacy-voxel-094',
    artifact_digest: `sha256:${hex64('7')}`,
    dependency_manifest_hash: `sha256:${hex64('8')}`,
    engine_compatibility: { godot_min: '4.3', godot_tested: '4.3', platforms: ['windows', 'linux'] },
    file_manifest: [
      { path: 'assets/shaders/voxel_legacy.gdshader', bytes: 2450, sha256: hex64('9'), executable_addon: false }
    ],
    license_snapshot_ref: 'lic-mit-v1-20261110',
    status: 'deprecated',
    status_reason: 'Godot 4.7 WebGL2 렌더러 호환성 제한으로 신규 설치 비권장',
    install_count: 24,
    report_count: 1
  }
]);

const SEED_SUBMISSIONS = Object.freeze([
  {
    id: 'sub-fortress-130',
    slug: 'lowpoly-fortress-pack',
    asset_id: 'lowpoly-fortress-pack',
    title: 'Lowpoly Fortress Siege Kit v1.3.0',
    summary: '성문 씬(gatehouse.tscn) 추가 및 Godot 4.7.2 Web/Windows 호환성 검증을 마친 업데이트 릴리스입니다.',
    category: '3D 환경 · 요새',
    publisher_id: 'pub-playforge-core',
    publisher_name: 'PlayForge Core Assets',
    release_kind: 'package',
    asset_version_id: '1.3.0',
    release_id: 'rel-lowpoly-fortress-130',
    artifact_id: 'art-lowpoly-fortress-130',
    artifact_digest: `sha256:${hex64('e')}`,
    dependency_manifest_hash: `sha256:${hex64('6')}`,
    engine_compatibility: { godot_min: '4.3', godot_tested: '4.7.2', platforms: ['web', 'windows', 'linux'] },
    file_manifest: [
      { path: 'assets/fortress/wall_segment_v2.glb', bytes: 196608, sha256: hex64('9'), executable_addon: false },
      { path: 'assets/fortress/gatehouse.tscn', bytes: 12288, sha256: hex64('b'), executable_addon: false }
    ],
    license_snapshot_ref: 'lic-cc0-v1-20261120',
    validator_status: 'passed',
    status: 'in_review',
    revision: 1,
    review_note: null
  },
  {
    id: 'sub-store-checklist-100',
    slug: 'store-publishing-checklist',
    asset_id: 'store-publishing-checklist',
    title: 'Store 패키징 & 라이선스 체크리스트 가이드',
    summary: '일반 콘텐츠(editorial): 빈 패키지를 생성하지 않고 문서 아티클로만 심사·게시되는 가이드 제출입니다.',
    category: '가이드 · 일반 콘텐츠',
    publisher_id: 'pub-playforge-docs',
    publisher_name: 'PlayForge Docs',
    release_kind: 'editorial',
    asset_version_id: '1.0.0',
    release_id: 'rel-editorial-checklist-100',
    artifact_id: null,
    artifact_digest: null,
    dependency_manifest_hash: null,
    engine_compatibility: null,
    file_manifest: null,
    license_snapshot_ref: 'lic-editorial-v1',
    validator_status: 'not_applicable',
    status: 'in_review',
    revision: 1,
    review_note: null
  },
  {
    id: 'sub-navmesh-grid-110',
    slug: 'navmesh-tactical-grid',
    asset_id: 'navmesh-tactical-grid',
    title: 'NavMesh Tactical Grid Addon',
    summary: '턴제 전략 프로젝트용 그리드 경로 탐색 및 이동 범위 시각화 Godot 에디터 Addon 패키지입니다.',
    category: 'Addon · 경로 탐색',
    publisher_id: 'pub-studio-nord',
    publisher_name: 'Studio Nord',
    release_kind: 'package',
    asset_version_id: '1.1.0',
    release_id: 'rel-navmesh-grid-110',
    artifact_id: 'art-navmesh-grid-110',
    artifact_digest: `sha256:${hex64('c')}`,
    dependency_manifest_hash: `sha256:${hex64('4')}`,
    engine_compatibility: { godot_min: '4.3', godot_tested: '4.7.2', platforms: ['web', 'windows', 'linux'] },
    file_manifest: [
      { path: 'addons/tactical_grid/plugin.cfg', bytes: 640, sha256: hex64('5'), executable_addon: true },
      { path: 'addons/tactical_grid/grid_solver.gd', bytes: 4096, sha256: hex64('6'), executable_addon: true }
    ],
    license_snapshot_ref: 'lic-mit-v1-20261120',
    validator_status: 'passed',
    status: 'in_review',
    revision: 1,
    review_note: null
  },
  {
    id: 'sub-shader-hotfix-095',
    slug: 'legacy-voxel-shader-pack',
    asset_id: 'legacy-voxel-shader-pack',
    title: 'Legacy Voxel Shader Pack v0.9.5 (Hotfix)',
    summary: 'WebGL2 폴백 셰이더 경로 수정 제출본입니다.',
    category: '셰이더 · 렌더링',
    publisher_id: 'pub-shader-lab',
    publisher_name: 'Shader Lab',
    release_kind: 'package',
    asset_version_id: '0.9.5',
    release_id: 'rel-legacy-voxel-095',
    artifact_id: 'art-legacy-voxel-095',
    artifact_digest: `sha256:${hex64('f')}`,
    dependency_manifest_hash: `sha256:${hex64('2')}`,
    engine_compatibility: { godot_min: '4.3', godot_tested: '4.7.2', platforms: ['web', 'windows'] },
    file_manifest: [
      { path: 'assets/shaders/voxel_lit.gdshader', bytes: 3072, sha256: hex64('0'), executable_addon: false }
    ],
    license_snapshot_ref: 'lic-mit-v1-20261120',
    validator_status: 'passed',
    status: 'changes_requested',
    revision: 2,
    review_note: 'WebGL2 폴백 셰이더의 라이선스 스냅샷 참조를 최신으로 갱신해 주세요.'
  }
]);

function safeJsonParse(raw, fallback = null) {
  if (raw == null || raw === '') return fallback;
  try { return JSON.parse(raw); } catch { return fallback; }
}

/**
 * Validates a Store release/submission record against `store/schemas/package-contract.schema.json`.
 * Returns an array of validation error strings (empty array means valid).
 */
export function validateStoreReleaseContract(entry) {
  const errors = [];
  if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
    return ['Entry must be an object'];
  }
  if ((entry.schema_version ?? 1) !== 1) errors.push('schema_version must be 1');
  if (!SLUG_RE.test(String(entry.asset_id || ''))) errors.push('Invalid asset_id');
  if (!VERSION_RE.test(String(entry.asset_version_id || ''))) errors.push('Invalid asset_version_id');
  if (!RELEASE_ID_RE.test(String(entry.release_id || ''))) errors.push('Invalid release_id');
  if (!RELEASE_KINDS.has(entry.release_kind)) errors.push('release_kind must be package or editorial');
  if (typeof entry.title !== 'string' || !entry.title.trim() || entry.title.trim().length > 120) {
    errors.push('title must be 1..120 characters');
  }
  if (typeof entry.publisher_id !== 'string' || entry.publisher_id.length < 2 || entry.publisher_id.length > 64) {
    errors.push('publisher_id must be 2..64 characters');
  }

  if (entry.release_kind === 'package') {
    if (!ARTIFACT_ID_RE.test(String(entry.artifact_id || ''))) errors.push('package requires valid artifact_id');
    if (!SHA256_PREFIXED_RE.test(String(entry.artifact_digest || ''))) {
      errors.push('package requires immutable sha256:<64-hex> artifact_digest');
    }
    if (!SHA256_PREFIXED_RE.test(String(entry.dependency_manifest_hash || ''))) {
      errors.push('package requires sha256:<64-hex> dependency_manifest_hash');
    }
    const compat = entry.engine_compatibility;
    if (!compat || typeof compat !== 'object' || Array.isArray(compat)
      || !GODOT_VER_RE.test(String(compat.godot_min || ''))
      || !GODOT_VER_RE.test(String(compat.godot_tested || ''))
      || !Array.isArray(compat.platforms) || compat.platforms.length === 0
      || compat.platforms.some(p => !PLATFORMS.has(p))) {
      errors.push('package requires valid engine_compatibility');
    }
    const files = entry.file_manifest;
    if (!Array.isArray(files) || files.length === 0 || files.some(f =>
      !f || typeof f !== 'object' || Array.isArray(f)
      || typeof f.path !== 'string' || !f.path.trim()
      || !Number.isInteger(f.bytes) || f.bytes < 1
      || !SHA256_HEX_RE.test(String(f.sha256 || ''))
      || typeof f.executable_addon !== 'boolean'
    )) {
      errors.push('package requires non-empty valid file_manifest');
    }
    if (typeof entry.license_snapshot_ref !== 'string' || entry.license_snapshot_ref.length < 4 || entry.license_snapshot_ref.length > 128) {
      errors.push('package requires license_snapshot_ref');
    }
  } else if (entry.release_kind === 'editorial') {
    const forbidden = [];
    if (entry.artifact_id !== undefined && entry.artifact_id !== null && entry.artifact_id !== '') forbidden.push('artifact_id');
    if (entry.artifact_digest !== undefined && entry.artifact_digest !== null && entry.artifact_digest !== '') forbidden.push('artifact_digest');
    if (entry.file_manifest !== undefined && entry.file_manifest !== null) forbidden.push('file_manifest');
    if (entry.installation_record !== undefined && entry.installation_record !== null) forbidden.push('installation_record');
    if (forbidden.length > 0) {
      errors.push(`editorial release must not carry package artifact fields (${forbidden.join(', ')})`);
    }
  }
  return errors;
}

function rowToContract(row) {
  return {
    schema_version: 1,
    asset_id: row.asset_id,
    asset_version_id: row.asset_version_id,
    release_id: row.release_id,
    release_kind: row.release_kind,
    title: row.title,
    publisher_id: row.publisher_id,
    artifact_id: row.artifact_id ?? undefined,
    artifact_digest: row.artifact_digest ?? undefined,
    dependency_manifest_hash: row.dependency_manifest_hash ?? undefined,
    engine_compatibility: safeJsonParse(row.engine_compatibility_json, null) ?? undefined,
    file_manifest: safeJsonParse(row.file_manifest_json, null),
    license_snapshot_ref: row.license_snapshot_ref || undefined,
    installation_record: null
  };
}

function formatPackageRow(row) {
  return {
    slug: row.slug,
    asset_id: row.asset_id,
    title: row.title,
    summary: row.summary,
    category: row.category,
    publisher_id: row.publisher_id,
    release_kind: row.release_kind,
    asset_version_id: row.asset_version_id,
    release_id: row.release_id,
    artifact_id: row.artifact_id || null,
    artifact_digest: row.artifact_digest || null,
    dependency_manifest_hash: row.dependency_manifest_hash || null,
    engine_compatibility: safeJsonParse(row.engine_compatibility_json, null),
    file_manifest: safeJsonParse(row.file_manifest_json, null),
    license_snapshot_ref: row.license_snapshot_ref || null,
    status: row.status,
    status_reason: row.status_reason || null,
    install_count: row.install_count,
    report_count: row.report_count,
    updated_by: row.updated_by || null,
    created_at: new Date(row.created_at).toISOString(),
    updated_at: new Date(row.updated_at).toISOString()
  };
}

function formatSubmissionRow(row) {
  const contractErrors = validateStoreReleaseContract(rowToContract(row));
  return {
    id: row.id,
    slug: row.slug,
    asset_id: row.asset_id,
    title: row.title,
    summary: row.summary,
    category: row.category,
    publisher_id: row.publisher_id,
    publisher_name: row.publisher_name || row.publisher_id,
    release_kind: row.release_kind,
    asset_version_id: row.asset_version_id,
    release_id: row.release_id,
    artifact_id: row.artifact_id || null,
    artifact_digest: row.artifact_digest || null,
    dependency_manifest_hash: row.dependency_manifest_hash || null,
    engine_compatibility: safeJsonParse(row.engine_compatibility_json, null),
    file_manifest: safeJsonParse(row.file_manifest_json, null),
    license_snapshot_ref: row.license_snapshot_ref || null,
    validator_status: row.validator_status,
    status: row.status,
    revision: row.revision,
    review_note: row.review_note || null,
    decided_by: row.decided_by || null,
    submitted_at: new Date(row.submitted_at).toISOString(),
    decided_at: row.decided_at ? new Date(row.decided_at).toISOString() : null,
    updated_at: new Date(row.updated_at).toISOString(),
    contractCheck: {
      valid: contractErrors.length === 0,
      errors: contractErrors
    }
  };
}

function initSchemaAndSeed(sdb, now) {
  sdb.exec(`
    PRAGMA foreign_keys=ON;
    PRAGMA busy_timeout=5000;
    CREATE TABLE IF NOT EXISTS store_admin_meta (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS store_admin_packages (
      slug TEXT PRIMARY KEY,
      asset_id TEXT NOT NULL UNIQUE,
      title TEXT NOT NULL,
      summary TEXT NOT NULL DEFAULT '',
      category TEXT NOT NULL DEFAULT '',
      publisher_id TEXT NOT NULL,
      release_kind TEXT NOT NULL CHECK(release_kind IN ('package', 'editorial')),
      asset_version_id TEXT NOT NULL,
      release_id TEXT NOT NULL,
      artifact_id TEXT,
      artifact_digest TEXT,
      dependency_manifest_hash TEXT,
      engine_compatibility_json TEXT,
      file_manifest_json TEXT,
      license_snapshot_ref TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL CHECK(status IN ('published', 'hidden', 'deprecated', 'yanked')),
      status_reason TEXT,
      install_count INTEGER NOT NULL DEFAULT 0,
      report_count INTEGER NOT NULL DEFAULT 0,
      updated_by TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS store_packages_status ON store_admin_packages(status, updated_at DESC);
    CREATE TABLE IF NOT EXISTS store_admin_submissions (
      id TEXT PRIMARY KEY,
      slug TEXT NOT NULL,
      asset_id TEXT NOT NULL,
      title TEXT NOT NULL,
      summary TEXT NOT NULL DEFAULT '',
      category TEXT NOT NULL DEFAULT '',
      publisher_id TEXT NOT NULL,
      publisher_name TEXT NOT NULL DEFAULT '',
      release_kind TEXT NOT NULL CHECK(release_kind IN ('package', 'editorial')),
      asset_version_id TEXT NOT NULL,
      release_id TEXT NOT NULL,
      artifact_id TEXT,
      artifact_digest TEXT,
      dependency_manifest_hash TEXT,
      engine_compatibility_json TEXT,
      file_manifest_json TEXT,
      license_snapshot_ref TEXT NOT NULL DEFAULT '',
      validator_status TEXT NOT NULL DEFAULT 'passed' CHECK(validator_status IN ('passed', 'failed', 'not_applicable')),
      status TEXT NOT NULL CHECK(status IN ('in_review', 'approved', 'rejected', 'changes_requested')),
      revision INTEGER NOT NULL DEFAULT 1 CHECK(revision > 0),
      review_note TEXT,
      decided_by TEXT,
      submitted_at INTEGER NOT NULL,
      decided_at INTEGER,
      updated_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS store_submissions_status ON store_admin_submissions(status, submitted_at DESC);
  `);

  const seeded = sdb.prepare("SELECT value FROM store_admin_meta WHERE key='seeded_v1'").get();
  if (seeded) return;

  const stamp = now();
  transaction(sdb, () => {
    if (sdb.prepare("SELECT value FROM store_admin_meta WHERE key='seeded_v1'").get()) return;
    const insertPkg = sdb.prepare(`
      INSERT OR IGNORE INTO store_admin_packages (
        slug, asset_id, title, summary, category, publisher_id, release_kind,
        asset_version_id, release_id, artifact_id, artifact_digest, dependency_manifest_hash,
        engine_compatibility_json, file_manifest_json, license_snapshot_ref,
        status, status_reason, install_count, report_count, updated_by, created_at, updated_at
      ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    `);
    SEED_PACKAGES.forEach((pkg, idx) => {
      const t = stamp - (SEED_PACKAGES.length - idx) * 3600000;
      insertPkg.run(
        pkg.slug, pkg.asset_id, pkg.title, pkg.summary, pkg.category, pkg.publisher_id, pkg.release_kind,
        pkg.asset_version_id, pkg.release_id, pkg.artifact_id, pkg.artifact_digest, pkg.dependency_manifest_hash,
        pkg.engine_compatibility ? JSON.stringify(pkg.engine_compatibility) : null,
        pkg.file_manifest ? JSON.stringify(pkg.file_manifest) : null,
        pkg.license_snapshot_ref, pkg.status, pkg.status_reason, pkg.install_count, pkg.report_count, 'seed', t, t
      );
    });

    const insertSub = sdb.prepare(`
      INSERT OR IGNORE INTO store_admin_submissions (
        id, slug, asset_id, title, summary, category, publisher_id, publisher_name,
        release_kind, asset_version_id, release_id, artifact_id, artifact_digest, dependency_manifest_hash,
        engine_compatibility_json, file_manifest_json, license_snapshot_ref,
        validator_status, status, revision, review_note, decided_by, submitted_at, decided_at, updated_at
      ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    `);
    SEED_SUBMISSIONS.forEach((sub, idx) => {
      const t = stamp - (SEED_SUBMISSIONS.length - idx) * 1800000;
      insertSub.run(
        sub.id, sub.slug, sub.asset_id, sub.title, sub.summary, sub.category, sub.publisher_id, sub.publisher_name,
        sub.release_kind, sub.asset_version_id, sub.release_id, sub.artifact_id, sub.artifact_digest, sub.dependency_manifest_hash,
        sub.engine_compatibility ? JSON.stringify(sub.engine_compatibility) : null,
        sub.file_manifest ? JSON.stringify(sub.file_manifest) : null,
        sub.license_snapshot_ref, sub.validator_status, sub.status, sub.revision, sub.review_note, null, t, null, t
      );
    });

    sdb.prepare("INSERT INTO store_admin_meta(key, value) VALUES('seeded_v1', '1')").run();
  });
}

/**
 * Creates the Store Admin backend module backed by an isolated `store-admin.sqlite` database
 * while logging every moderation/decision event to the existing platform `audit` log.
 */
export function createStoreAdmin({ config, db, now = Date.now, audit = () => {}, requireSession, storeDbPath } = {}) {
  const resolvedPath = storeDbPath || (config?.dataDir ? path.join(config.dataDir, 'store-admin.sqlite') : ':memory:');
  let memoryDb = null;

  function withStoreDb(fn) {
    if (resolvedPath === ':memory:') {
      if (!memoryDb) memoryDb = new DatabaseSync(':memory:');
      return fn(memoryDb);
    }
    fs.mkdirSync(path.dirname(resolvedPath), { recursive: true, mode: 0o700 });
    const existed = fs.existsSync(resolvedPath);
    const sdb = new DatabaseSync(resolvedPath, { timeout: 5000 });
    if (!existed && process.platform !== 'win32') {
      try { fs.chmodSync(resolvedPath, 0o600); } catch {}
    }
    try {
      sdb.exec('PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;');
      return fn(sdb);
    } finally {
      sdb.close();
    }
  }

  withStoreDb(sdb => initSchemaAndSeed(sdb, now));

  function computeBadges(sdb) {
    const pkgRows = sdb.prepare('SELECT status, release_kind, install_count, report_count FROM store_admin_packages').all();
    const subRows = sdb.prepare('SELECT status FROM store_admin_submissions').all();
    const summary = {
      totalPackages: pkgRows.length,
      publishedPackages: 0,
      hiddenPackages: 0,
      deprecatedPackages: 0,
      yankedPackages: 0,
      restrictedPackages: 0,
      packageCount: 0,
      editorialCount: 0,
      totalInstalls: 0,
      openReports: 0,
      totalSubmissions: subRows.length,
      pendingSubmissions: 0,
      approvedSubmissions: 0,
      rejectedSubmissions: 0,
      changesRequestedSubmissions: 0
    };
    for (const p of pkgRows) {
      if (p.status === 'published') summary.publishedPackages++;
      else if (p.status === 'hidden') summary.hiddenPackages++;
      else if (p.status === 'deprecated') summary.deprecatedPackages++;
      else if (p.status === 'yanked') summary.yankedPackages++;
      if (p.release_kind === 'package') summary.packageCount++;
      else if (p.release_kind === 'editorial') summary.editorialCount++;
      summary.totalInstalls += p.install_count || 0;
      summary.openReports += p.report_count || 0;
    }
    summary.restrictedPackages = summary.hiddenPackages + summary.deprecatedPackages + summary.yankedPackages;
    for (const s of subRows) {
      if (s.status === 'in_review') summary.pendingSubmissions++;
      else if (s.status === 'approved') summary.approvedSubmissions++;
      else if (s.status === 'rejected') summary.rejectedSubmissions++;
      else if (s.status === 'changes_requested') summary.changesRequestedSubmissions++;
    }
    return summary;
  }

  function badges() {
    return withStoreDb(sdb => computeBadges(sdb));
  }

  function recentStoreAudit() {
    if (!db) return [];
    try {
      return db.prepare("SELECT id, action, target, detail, created_at FROM audit WHERE action LIKE 'store_%' ORDER BY created_at DESC LIMIT 20").all().map(r => ({
        id: r.id,
        action: r.action,
        domain: 'store',
        target: r.target,
        detail: safeJsonParse(r.detail, {}),
        createdAt: new Date(r.created_at).toISOString()
      }));
    } catch {
      return [];
    }
  }

  function overview() {
    return withStoreDb(sdb => {
      const summary = computeBadges(sdb);
      const packages = sdb.prepare('SELECT * FROM store_admin_packages ORDER BY updated_at DESC, slug ASC').all().map(formatPackageRow);
      const submissions = sdb.prepare('SELECT * FROM store_admin_submissions ORDER BY CASE WHEN status=\'in_review\' THEN 0 ELSE 1 END, submitted_at DESC, id ASC').all().map(formatSubmissionRow);
      return {
        summary,
        packages,
        submissions,
        recentAudit: recentStoreAudit(),
        contractPolicy: {
          schemaVersion: 1,
          digestFormat: 'sha256:<64-hex>',
          editorialArtifactForbidden: true,
          hubCatalogIsolated: true,
          autoPublishOnApprove: false
        }
      };
    });
  }

  function listSubmissions(url) {
    const status = (url.searchParams.get('status') || 'all').trim();
    const kind = (url.searchParams.get('kind') || 'all').trim();
    const q = (url.searchParams.get('q') || '').trim().toLowerCase();
    if (!SUBMISSION_FILTERS.has(status) || !['all', 'package', 'editorial'].includes(kind)) {
      throw new ApiError(400, 'INVALID_STORE_FILTER', '올바르지 않은 Store 심사 필터입니다.');
    }
    return withStoreDb(sdb => {
      const all = sdb.prepare('SELECT * FROM store_admin_submissions ORDER BY CASE WHEN status=\'in_review\' THEN 0 ELSE 1 END, submitted_at DESC, id ASC').all();
      const counts = {
        total: all.length,
        in_review: all.filter(r => r.status === 'in_review').length,
        approved: all.filter(r => r.status === 'approved').length,
        rejected: all.filter(r => r.status === 'rejected').length,
        changes_requested: all.filter(r => r.status === 'changes_requested').length
      };
      const filtered = all
        .filter(row => {
          if (status !== 'all' && row.status !== status) return false;
          if (kind !== 'all' && row.release_kind !== kind) return false;
          if (q) {
            const hay = `${row.id} ${row.slug} ${row.asset_id} ${row.title} ${row.publisher_id} ${row.publisher_name}`.toLowerCase();
            if (!hay.includes(q)) return false;
          }
          return true;
        })
        .map(formatSubmissionRow);
      return { submissions: filtered, counts };
    });
  }

  function listPackages(url) {
    const status = (url.searchParams.get('status') || 'all').trim();
    const kind = (url.searchParams.get('kind') || 'all').trim();
    const q = (url.searchParams.get('q') || '').trim().toLowerCase();
    if ((status !== 'all' && !PACKAGE_STATUSES.has(status)) || !['all', 'package', 'editorial'].includes(kind)) {
      throw new ApiError(400, 'INVALID_STORE_FILTER', '올바르지 않은 Store 패키지 필터입니다.');
    }
    return withStoreDb(sdb => {
      const all = sdb.prepare('SELECT * FROM store_admin_packages ORDER BY updated_at DESC, slug ASC').all();
      const filtered = all
        .filter(row => {
          if (status !== 'all' && row.status !== status) return false;
          if (kind !== 'all' && row.release_kind !== kind) return false;
          if (q) {
            const hay = `${row.slug} ${row.asset_id} ${row.title} ${row.publisher_id} ${row.category}`.toLowerCase();
            if (!hay.includes(q)) return false;
          }
          return true;
        })
        .map(formatPackageRow);
      return { packages: filtered };
    });
  }

  function decideSubmission(id, body, adminUsername) {
    if (!SUBMISSION_ID_RE.test(id)) {
      throw new ApiError(400, 'INVALID_SUBMISSION_ID', '올바르지 않은 제출 ID입니다.');
    }
    const decision = String(body.decision || '').trim();
    if (!Object.hasOwn(DECISION_TO_STATUS, decision)) {
      throw new ApiError(422, 'INVALID_STORE_DECISION', 'decision은 approve, reject, request_changes 중 하나여야 합니다.');
    }
    const rawNote = body.note ?? body.reviewNote ?? '';
    if (typeof rawNote !== 'string' || rawNote.trim().length > 1000) {
      throw new ApiError(422, 'INVALID_STORE_REVIEW_NOTE', '심사 메모는 1000자 이하 문자열이어야 합니다.');
    }
    const cleanNote = rawNote.trim();
    if (body.revision !== undefined && (!Number.isSafeInteger(body.revision) || body.revision < 1)) {
      throw new ApiError(400, 'INVALID_SUBMISSION_REVISION', 'revision 값이 올바르지 않습니다.');
    }

    const suppliedDigest = body.artifact_digest ?? body.artifactDigest;
    const suppliedArtifactId = body.artifact_id ?? body.artifactId;
    const suppliedManifest = body.file_manifest ?? body.fileManifest;

    return withStoreDb(sdb => transaction(sdb, () => {
      const row = sdb.prepare('SELECT * FROM store_admin_submissions WHERE id=?').get(id);
      if (!row) throw new ApiError(404, 'STORE_SUBMISSION_NOT_FOUND', 'Store 제출 항목을 찾을 수 없습니다.');
      if (body.revision !== undefined && body.revision !== row.revision) {
        throw new ApiError(409, 'STORE_SUBMISSION_REVISION_CONFLICT', '다른 운영자가 먼저 심사 상태를 변경했습니다.');
      }
      if (row.status !== 'in_review') {
        throw new ApiError(409, 'INVALID_SUBMISSION_STATE', '심사 대기(in_review) 상태의 제출만 판정할 수 있습니다.');
      }

      if (decision === 'approve') {
        if (row.release_kind === 'editorial') {
          if (suppliedDigest != null || suppliedArtifactId != null || suppliedManifest != null) {
            throw new ApiError(422, 'STORE_EDITORIAL_ARTIFACT_FORBIDDEN', '일반 콘텐츠(editorial)는 패키지 아티팩트(artifact_id, artifact_digest, file_manifest)를 포함할 수 없습니다.');
          }
          const errors = validateStoreReleaseContract(rowToContract(row));
          if (errors.length > 0) {
            const hasArtifactViolation = errors.some(e => e.includes('editorial release must not carry package artifact fields'));
            throw new ApiError(
              422,
              hasArtifactViolation ? 'STORE_EDITORIAL_ARTIFACT_FORBIDDEN' : 'STORE_CONTRACT_INVALID',
              hasArtifactViolation
                ? '일반 콘텐츠(editorial)는 패키지 아티팩트를 포함할 수 없습니다.'
                : 'Store 릴리스 계약 검증에 실패했습니다.',
              { errors }
            );
          }
        } else {
          if (suppliedDigest !== undefined) {
            if (typeof suppliedDigest !== 'string' || !SHA256_PREFIXED_RE.test(suppliedDigest)) {
              throw new ApiError(422, 'STORE_INVALID_ARTIFACT_DIGEST', 'artifact_digest는 sha256:<64자리 소문자 hex> 불변 형식이어야 합니다.');
            }
            if (row.artifact_digest && suppliedDigest !== row.artifact_digest) {
              throw new ApiError(409, 'STORE_ARTIFACT_DIGEST_IMMUTABLE', '불변 계약 위반: 제출에 고정된 artifact_digest와 일치하지 않습니다.');
            }
          }
          const errors = validateStoreReleaseContract(rowToContract(row));
          if (errors.length > 0) {
            throw new ApiError(422, 'STORE_CONTRACT_INVALID', '패키지 불변 계약(SHA-256 artifact_digest·매니페스트) 검증에 실패했습니다.', { errors });
          }
        }
      } else if (suppliedDigest !== undefined && suppliedDigest !== null) {
        if (row.release_kind === 'editorial') {
          throw new ApiError(422, 'STORE_EDITORIAL_ARTIFACT_FORBIDDEN', '일반 콘텐츠(editorial)에는 artifact_digest를 지정할 수 없습니다.');
        }
        if (typeof suppliedDigest !== 'string' || !SHA256_PREFIXED_RE.test(suppliedDigest)) {
          throw new ApiError(422, 'STORE_INVALID_ARTIFACT_DIGEST', 'artifact_digest 형식이 올바르지 않습니다.');
        }
      }

      const nextStatus = DECISION_TO_STATUS[decision];
      const stamp = now();
      const actor = adminUsername || 'admin';
      const updatedRes = sdb.prepare(`
        UPDATE store_admin_submissions
        SET status=?, review_note=?, decided_by=?, decided_at=?, updated_at=?, revision=revision+1
        WHERE id=? AND revision=? AND status='in_review'
      `).run(nextStatus, cleanNote || null, actor, stamp, stamp, id, row.revision);
      if (updatedRes.changes !== 1) {
        throw new ApiError(409, 'STORE_SUBMISSION_REVISION_CONFLICT', '심사 상태를 갱신할 수 없습니다.');
      }

      let stagedPackage = null;
      if (decision === 'approve') {
        const existingPkg = sdb.prepare('SELECT slug FROM store_admin_packages WHERE slug=?').get(row.slug);
        if (!existingPkg) {
          sdb.prepare(`
            INSERT INTO store_admin_packages (
              slug, asset_id, title, summary, category, publisher_id, release_kind,
              asset_version_id, release_id, artifact_id, artifact_digest, dependency_manifest_hash,
              engine_compatibility_json, file_manifest_json, license_snapshot_ref,
              status, status_reason, install_count, report_count, updated_by, created_at, updated_at
            ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,'hidden',?,0,0,?,?,?)
          `).run(
            row.slug, row.asset_id, row.title, row.summary, row.category, row.publisher_id, row.release_kind,
            row.asset_version_id, row.release_id, row.artifact_id, row.artifact_digest, row.dependency_manifest_hash,
            row.engine_compatibility_json, row.file_manifest_json, row.license_snapshot_ref,
            '심사 승인 완료 · 명시적 공개 전환 대기(자동 게시 안 함)', actor, stamp, stamp
          );
          stagedPackage = formatPackageRow(sdb.prepare('SELECT * FROM store_admin_packages WHERE slug=?').get(row.slug));
        }
      }

      const updated = sdb.prepare('SELECT * FROM store_admin_submissions WHERE id=?').get(id);
      const auditAction = decision === 'approve'
        ? 'store_submission_approved'
        : decision === 'reject'
          ? 'store_submission_rejected'
          : 'store_submission_changes_requested';
      audit(auditAction, updated.id, {
        slug: updated.slug,
        assetId: updated.asset_id,
        releaseId: updated.release_id,
        releaseKind: updated.release_kind,
        decision,
        previousStatus: row.status,
        nextStatus: updated.status,
        artifactDigest: updated.artifact_digest || null,
        note: cleanNote || null,
        admin: actor
      });

      return {
        submission: formatSubmissionRow(updated),
        catalogAutoPublished: false,
        stagedPackage
      };
    }));
  }

  function updatePackageStatus(slug, body, adminUsername) {
    if (!SLUG_RE.test(slug)) {
      throw new ApiError(400, 'INVALID_PACKAGE_SLUG', '올바르지 않은 패키지 slug 형식입니다.');
    }
    const nextStatus = String(body.status || '').trim();
    if (!PACKAGE_STATUSES.has(nextStatus)) {
      throw new ApiError(422, 'INVALID_PACKAGE_STATUS', 'status는 published, hidden, deprecated, yanked 중 하나여야 합니다.');
    }
    const rawReason = body.reason ?? body.note ?? '';
    if (typeof rawReason !== 'string' || rawReason.trim().length > 500) {
      throw new ApiError(422, 'INVALID_STATUS_REASON', '상태 변경 사유는 500자 이하 문자열이어야 합니다.');
    }
    const cleanReason = rawReason.trim();

    return withStoreDb(sdb => transaction(sdb, () => {
      const existing = sdb.prepare('SELECT * FROM store_admin_packages WHERE slug=?').get(slug);
      if (!existing) throw new ApiError(404, 'STORE_PACKAGE_NOT_FOUND', 'Store 패키지를 찾을 수 없습니다.');

      const stamp = now();
      const actor = adminUsername || 'admin';
      const nextReason = cleanReason || null;
      sdb.prepare('UPDATE store_admin_packages SET status=?, status_reason=?, updated_by=?, updated_at=? WHERE slug=?')
        .run(nextStatus, nextReason, actor, stamp, slug);

      const updated = sdb.prepare('SELECT * FROM store_admin_packages WHERE slug=?').get(slug);
      const auditAction = nextStatus === 'yanked' ? 'store_package_yanked' : 'store_package_status_changed';
      audit(auditAction, updated.slug, {
        slug: updated.slug,
        assetId: updated.asset_id,
        releaseId: updated.release_id,
        releaseKind: updated.release_kind,
        previousStatus: existing.status,
        nextStatus: updated.status,
        killSwitch: updated.status === 'yanked',
        reason: updated.status_reason || null,
        admin: actor
      });

      return { package: formatPackageRow(updated) };
    }));
  }

  async function adminRoute(req, res, url, session) {
    const pathname = url.pathname;
    if (pathname !== '/api/admin/store' && !pathname.startsWith('/api/admin/store/')) {
      return false;
    }

    if (pathname === '/api/admin/store/overview') {
      if (req.method !== 'GET') throw new ApiError(405, 'METHOD_NOT_ALLOWED');
      json(res, 200, overview());
      return true;
    }
    if (pathname === '/api/admin/store/submissions') {
      if (req.method !== 'GET') throw new ApiError(405, 'METHOD_NOT_ALLOWED');
      json(res, 200, listSubmissions(url));
      return true;
    }
    if (pathname === '/api/admin/store/packages') {
      if (req.method !== 'GET') throw new ApiError(405, 'METHOD_NOT_ALLOWED');
      json(res, 200, listPackages(url));
      return true;
    }

    const safeDecode = raw => {
      try { return decodeURIComponent(raw); }
      catch { throw new ApiError(400, 'INVALID_PATH', '잘못된 URL 경로 인코딩입니다.'); }
    };

    const decisionMatch = pathname.match(DECISION_ROUTE);
    if (decisionMatch) {
      if (req.method !== 'POST') throw new ApiError(405, 'METHOD_NOT_ALLOWED');
      const body = await readJson(req, 16384);
      const active = requireSession ? requireSession(req, 'admin', true) : session;
      const result = decideSubmission(safeDecode(decisionMatch[1]), body, active?.admin_username);
      json(res, 200, result);
      return true;
    }

    const statusMatch = pathname.match(PACKAGE_STATUS_ROUTE);
    if (statusMatch) {
      if (req.method !== 'POST') throw new ApiError(405, 'METHOD_NOT_ALLOWED');
      const body = await readJson(req, 8192);
      const active = requireSession ? requireSession(req, 'admin', true) : session;
      const result = updatePackageStatus(safeDecode(statusMatch[1]), body, active?.admin_username);
      json(res, 200, result);
      return true;
    }

    throw new ApiError(404, 'NOT_FOUND');
  }

  return {
    adminRoute,
    badges,
    overview,
    listSubmissions,
    listPackages,
    decideSubmission,
    updatePackageStatus,
    resolvedPath
  };
}
