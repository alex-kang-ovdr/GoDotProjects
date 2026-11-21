#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DEFAULT_REPO_ROOT, getKstDayOfWeek, isExistingDir, isExistingFile } from './common.mjs';

const HEAVY_SUBDIRS = ['packages', 'logs', 'reports'];

function extractDateFromRunId(name) {
  const match = /(\d{4}-\d{2}-\d{2})/.exec(name);
  return match ? match[1] : null;
}

function readProtectedRunIds(baseDir) {
  const ids = new Set();
  for (const pointerFile of ['latest.json', 'latest-good.json', 'latest-archive.json', 'latest-cloud.json']) {
    const full = path.join(baseDir, pointerFile);
    if (!isExistingFile(full)) continue;
    try {
      const data = JSON.parse(fs.readFileSync(full, 'utf8'));
      if (typeof data.runId === 'string' && data.runId) ids.add(data.runId);
    } catch {
      // ignore malformed pointer
    }
  }
  return ids;
}

export function pruneDailyBuilds({
  baseDir = path.join(DEFAULT_REPO_ROOT, 'artifacts', 'daily-builds'),
  dailyDays = 14,
  weeklyDays = 90,
  now = new Date(),
  dryRun = false,
} = {}) {
  const root = path.resolve(baseDir);
  if (!isExistingDir(root)) {
    return { baseDir: root, dryRun, inspected: 0, pruned: [], kept: [] };
  }
  const protectedIds = readProtectedRunIds(root);
  const nowMs = now.getTime();
  const pruned = [];
  const kept = [];

  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const runId = entry.name;
    const runDir = path.join(root, runId);
    const dateStr = extractDateFromRunId(runId);
    if (!dateStr) {
      kept.push({ runId, reason: 'non_dated_directory' });
      continue;
    }
    if (protectedIds.has(runId)) {
      kept.push({ runId, reason: 'protected_pointer' });
      continue;
    }

    const entryMs = Date.parse(`${dateStr}T00:00:00+09:00`);
    const ageDays = Math.floor((nowMs - entryMs) / (24 * 60 * 60 * 1000));
    const isWeeklyBaseline = getKstDayOfWeek(dateStr) === 1; // Monday KST
    const retentionLimit = isWeeklyBaseline ? weeklyDays : dailyDays;

    if (ageDays <= retentionLimit) {
      kept.push({ runId, ageDays, retentionLimit, isWeeklyBaseline, reason: 'within_retention' });
      continue;
    }

    // Prune heavy subdirs (packages/logs/reports) while permanently retaining manifest JSONs
    const removedSubdirs = [];
    for (const sub of HEAVY_SUBDIRS) {
      const subPath = path.join(runDir, sub);
      if (isExistingDir(subPath)) {
        if (!dryRun) fs.rmSync(subPath, { recursive: true, force: true });
        removedSubdirs.push(sub);
      }
    }
    pruned.push({ runId, ageDays, retentionLimit, isWeeklyBaseline, removedSubdirs, manifestsRetained: true });
  }

  return {
    baseDir: root,
    dryRun,
    dailyDays,
    weeklyDays,
    inspected: pruned.length + kept.length,
    pruned,
    kept,
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const opts = {};
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--dir') opts.baseDir = args[++i];
    else if (args[i] === '--daily-days') opts.dailyDays = Number(args[++i]);
    else if (args[i] === '--weekly-days') opts.weeklyDays = Number(args[++i]);
    else if (args[i] === '--dry-run') opts.dryRun = true;
    else if (args[i] === '--help') {
      console.log('Usage: node tools/devops/prune-daily-builds.mjs [--dir DIR] [--daily-days 14] [--weekly-days 90] [--dry-run]');
      process.exit(0);
    }
  }
  console.log(JSON.stringify(pruneDailyBuilds(opts), null, 2));
}
