#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { isExistingDir, isExistingFile, sha256File, writeJsonAtomic } from './common.mjs';

const ARCHIVE_CANDIDATE_DIRS = [
  'G:\\My Drive\\PlayHub-Daily-Builds',
  'G:\\내 드라이브\\PlayHub-Daily-Builds',
  'G:\\PlayHub-Daily-Builds',
];

export function detectGdriveArchiveRoot(explicitDir = null) {
  if (explicitDir) return { root: path.resolve(explicitDir), source: 'cli' };
  if (process.env.PLAYHUB_GDRIVE_ARCHIVE_DIR) {
    return { root: path.resolve(process.env.PLAYHUB_GDRIVE_ARCHIVE_DIR), source: 'env' };
  }
  for (const candidate of ARCHIVE_CANDIDATE_DIRS) {
    const parent = path.dirname(candidate);
    if (isExistingDir(parent)) {
      return { root: candidate, source: 'auto-detected-gdrive-desktop' };
    }
  }
  return { root: null, source: 'unavailable' };
}

function collectFiles(baseDir, currentDir = baseDir, acc = []) {
  for (const entry of fs.readdirSync(currentDir, { withFileTypes: true })) {
    if (entry.isSymbolicLink()) continue;
    const full = path.join(currentDir, entry.name);
    if (entry.isDirectory()) {
      collectFiles(baseDir, full, acc);
    } else if (entry.isFile()) {
      const rel = path.relative(baseDir, full).replaceAll('\\', '/');
      if (rel === 'gdrive-upload-queue.json' || rel === 'archive-receipt.json') continue;
      acc.push({ full, rel });
    }
  }
  return acc.sort((a, b) => a.rel.localeCompare(b.rel));
}

export function archiveBuildToGdrive({ buildDir, runId, destRoot = null, dryRun = false } = {}) {
  const sourceDir = path.resolve(buildDir);
  if (!isExistingDir(sourceDir)) {
    throw new Error(`Build directory does not exist: ${sourceDir}`);
  }
  const files = collectFiles(sourceDir);
  const resolved = detectGdriveArchiveRoot(destRoot);

  if (!resolved.root) {
    const queue = {
      schemaVersion: 1,
      runId,
      archiveStatus: 'pending_gdrive_upload',
      archiveVerified: false,
      generatedAt: new Date().toISOString(),
      reason: 'No local Google Drive desktop folder detected and PLAYHUB_GDRIVE_ARCHIVE_DIR is not set. Upload via Google Drive plugin or configure PLAYHUB_GDRIVE_ARCHIVE_DIR.',
      files: files.map((f) => ({
        relativePath: f.rel,
        sourcePath: f.full,
        bytes: fs.statSync(f.full).size,
        sha256: sha256File(f.full),
      })),
    };
    if (!dryRun) {
      writeJsonAtomic(path.join(sourceDir, 'gdrive-upload-queue.json'), queue);
    }
    return queue;
  }

  const targetDir = path.join(resolved.root, runId);
  const records = [];
  if (!dryRun) {
    fs.mkdirSync(targetDir, { recursive: true });
  }
  for (const f of files) {
    const srcHash = sha256File(f.full);
    const bytes = fs.statSync(f.full).size;
    const dstPath = path.join(targetDir, f.rel);
    if (!dryRun) {
      fs.mkdirSync(path.dirname(dstPath), { recursive: true });
      fs.copyFileSync(f.full, dstPath);
      const dstHash = sha256File(dstPath);
      if (dstHash !== srcHash) {
        throw new Error(`Google Drive archive hash mismatch for ${f.rel}`);
      }
    }
    records.push({ relativePath: f.rel, bytes, sha256: srcHash });
  }

  const receipt = {
    schemaVersion: 1,
    runId,
    archiveStatus: dryRun ? 'dry_run' : 'archived',
    archiveVerified: !dryRun,
    destinationSource: resolved.source,
    destinationDir: targetDir,
    archivedAt: new Date().toISOString(),
    fileCount: records.length,
    totalBytes: records.reduce((sum, r) => sum + r.bytes, 0),
    files: records,
  };

  if (!dryRun) {
    const sums = records.map((r) => `${r.sha256}  ${r.relativePath}`).join('\n') + '\n';
    fs.writeFileSync(path.join(targetDir, 'ARCHIVE_SHA256SUMS.txt'), sums, 'utf8');
    writeJsonAtomic(path.join(sourceDir, 'archive-receipt.json'), receipt);
    writeJsonAtomic(path.join(resolved.root, 'latest-archive.json'), {
      runId,
      archivedAt: receipt.archivedAt,
      destinationDir: targetDir,
      fileCount: receipt.fileCount,
      totalBytes: receipt.totalBytes,
    });
  }
  return receipt;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  let buildDir = null;
  let runId = null;
  let destRoot = null;
  let dryRun = false;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--build-dir') buildDir = args[++i];
    else if (args[i] === '--run-id') runId = args[++i];
    else if (args[i] === '--dest') destRoot = args[++i];
    else if (args[i] === '--dry-run') dryRun = true;
    else if (args[i] === '--help') {
      console.log('Usage: node tools/devops/archive-gdrive.mjs --build-dir DIR [--run-id ID] [--dest GDRIVE_DIR] [--dry-run]');
      process.exit(0);
    }
  }
  if (!buildDir) {
    console.error('--build-dir is required');
    process.exit(2);
  }
  const resolvedRunId = runId || path.basename(path.resolve(buildDir));
  const receipt = archiveBuildToGdrive({ buildDir, runId: resolvedRunId, destRoot, dryRun });
  console.log(JSON.stringify(receipt, null, 2));
}
