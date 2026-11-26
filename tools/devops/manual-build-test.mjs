#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  DEFAULT_REPO_ROOT,
  formatKstRunId,
  isExistingDir,
  resolveNode24,
  safeGit,
  writeJsonAtomic,
} from './common.mjs';

const SAFE_REF_RE = /^[A-Za-z0-9._/-]{1,120}$/;
const SAFE_TAG_RE = /[^a-z0-9-]+/g;

export function sanitizeCloudRunTag(prefix, shortSha) {
  const cleanPrefix = String(prefix || 'rev')
    .toLowerCase()
    .replace(SAFE_TAG_RE, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 24) || 'rev';
  const cleanSha = String(shortSha || '').toLowerCase().replace(/[^a-f0-9]/g, '').slice(0, 7);
  return `${cleanPrefix}-${cleanSha}`.replace(/-+$/g, '');
}

export function listGitRefs(repoRoot = DEFAULT_REPO_ROOT, commitLimit = 20) {
  const branchesRaw = safeGit(repoRoot, ['for-each-ref', '--sort=-committerdate', '--format=%(refname:short)|%(objectname:short)|%(committerdate:iso-strict)|%(subject)', 'refs/heads']);
  const branches = branchesRaw
    ? branchesRaw.split(/\r?\n/).filter(Boolean).map((line) => {
        const [name, shortCommit, date, ...subject] = line.split('|');
        return { name, shortCommit, date, subject: subject.join('|') };
      })
    : [];
  const commitsRaw = safeGit(repoRoot, ['log', `-n`, String(commitLimit), '--format=%H|%h|%an|%aI|%s']);
  const commits = commitsRaw
    ? commitsRaw.split(/\r?\n/).filter(Boolean).map((line) => {
        const [commit, shortCommit, author, date, ...subject] = line.split('|');
        return { commit, shortCommit, author, date, subject: subject.join('|') };
      })
    : [];
  return { branches, commits };
}

export function validateGitRef(repoRoot = DEFAULT_REPO_ROOT, ref) {
  if (typeof ref !== 'string' || !SAFE_REF_RE.test(ref) || ref.includes('..') || ref.startsWith('-')) {
    throw new Error(`Invalid or unsafe git ref: ${ref}`);
  }
  let resolved;
  try {
    resolved = execFileSync('git', ['-C', repoRoot, 'rev-parse', '--verify', `${ref}^{commit}`], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    }).trim();
  } catch {
    throw new Error(`Git ref could not be resolved to a commit: ${ref}`);
  }
  if (!/^[a-f0-9]{40}$/.test(resolved)) {
    throw new Error(`Unexpected resolved commit hash: ${resolved}`);
  }
  const subject = safeGit(repoRoot, ['show', '-s', '--format=%s', resolved]);
  return {
    ref,
    commit: resolved,
    shortCommit: resolved.slice(0, 7),
    subject,
  };
}

export function createManualTriggerPlan({
  repoRoot = DEFAULT_REPO_ROOT,
  ref = 'HEAD',
  buildTarget = 'local', // local | github-actions | cloudbuild
  testTarget = 'local-preview', // none | local-preview | dev-tag | dev-promote
  localBasePort = 18280,
  gcpProject = 'playhub-dev-2611',
  gcpRegion = 'us-west1',
  archiveBucket = 'playhub-daily-ci-2611',
} = {}) {
  if (!['local', 'github-actions', 'cloudbuild'].includes(buildTarget)) {
    throw new Error(`Unsupported buildTarget: ${buildTarget}`);
  }
  if (!['none', 'local-preview', 'dev-tag', 'dev-promote'].includes(testTarget)) {
    throw new Error(`Unsupported testTarget: ${testTarget}`);
  }
  if (!Number.isInteger(localBasePort) || localBasePort < 1024 || localBasePort > 60000) {
    throw new Error(`Invalid localBasePort: ${localBasePort}`);
  }

  const resolvedRef = validateGitRef(repoRoot, ref);
  const runId = `manual-${formatKstRunId(resolvedRef.shortCommit).replace(/^daily-/, '')}`;
  const outDir = path.join(repoRoot, 'artifacts', 'daily-builds', runId);
  const detachedWorktree = path.join(outDir, 'checkout');
  const revisionTag = sanitizeCloudRunTag('rev', resolvedRef.shortCommit);
  const node24 = resolveNode24(repoRoot);

  const ports = {
    userPort: localBasePort,
    adminUiPort: localBasePort + 1,
    publicPort: localBasePort + 10,
    adminPort: localBasePort + 11,
    forgePort: localBasePort + 100,
  };

  const plan = {
    schemaVersion: 1,
    kind: 'playhub-manual-build-deploy-plan',
    runId,
    generatedAt: new Date().toISOString(),
    source: resolvedRef,
    buildTarget,
    testTarget,
    isolation: {
      detachedWorktree,
      localDataDir: path.join(outDir, 'preview-data'),
      ports,
      devUrlPattern: testTarget === 'dev-tag'
        ? `https://${revisionTag}---playhub-hub-<hash>.${gcpRegion}.run.app`
        : testTarget === 'dev-promote'
          ? `https://playhub-hub-<hash>.${gcpRegion}.run.app`
          : `http://127.0.0.1:${ports.userPort}/`,
    },
    githubActions: buildTarget === 'github-actions'
      ? {
          workflow: '.github/workflows/daily-ci.yml',
          inputs: {
            ref: resolvedRef.ref,
            upload_gcs: 'true',
          },
          command: `gh workflow run daily-ci.yml -f ref=${resolvedRef.ref} -f upload_gcs=true`,
          deployWorkflow: ['dev-tag', 'dev-promote'].includes(testTarget)
            ? '.github/workflows/cloudrun-pipeline.yml'
            : null,
        }
      : null,
    cloudBuild: buildTarget === 'cloudbuild'
      ? {
          project: gcpProject,
          region: gcpRegion,
          config: 'tools/devops/cloudbuild.daily.yaml',
          substitutions: {
            _MODE: 'cloud',
            _RUN_ID: runId,
            _ARCHIVE_BUCKET: archiveBucket,
            _DEPLOY_DEV_TAG: testTarget === 'dev-tag' ? 'true' : 'false',
          },
          note: 'Validate gcloud CLI leaf syntax via `gcloud help builds submit` before executing on a host with gcloud installed.',
        }
      : null,
    localExecution: buildTarget === 'local'
      ? {
          node24,
          checkoutCommand: `git worktree add --detach "${detachedWorktree}" ${resolvedRef.commit}`,
          buildAndVerifyCommand: `"${node24}" tools/devops/run-deterministic-ci.mjs --mode local --repo-root "${detachedWorktree}" --run-id "${runId}" --out-dir "${outDir}"`,
          cleanupCommand: `git worktree remove --force "${detachedWorktree}"`,
        }
      : null,
    devDeployment: ['dev-tag', 'dev-promote'].includes(testTarget)
      ? {
          gcpProject,
          gcpRegion,
          mode: testTarget,
          revisionTag: testTarget === 'dev-tag' ? revisionTag : null,
          trafficPercent: testTarget === 'dev-promote' ? 100 : 0,
          immutableDigestRequired: true,
          rollbackSupported: true,
        }
      : null,
  };

  return plan;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  let listRefs = false;
  let ref = 'HEAD';
  let buildTarget = 'local';
  let testTarget = 'local-preview';
  let localBasePort = 18280;
  let writePlan = false;
  let repoRoot = DEFAULT_REPO_ROOT;

  try {
    for (let i = 0; i < args.length; i++) {
      const token = args[i];
      if (token === '--help' || token === '-h') {
        console.log(
          'Usage:\n' +
            '  node tools/devops/manual-build-test.mjs --list-refs\n' +
            '  node tools/devops/manual-build-test.mjs --ref <branch|commit> [--build local|github-actions|cloudbuild] [--test none|local-preview|dev-tag|dev-promote] [--port 18280] [--write-plan]',
        );
        process.exit(0);
      } else if (token === '--list-refs') listRefs = true;
      else if (token === '--write-plan') writePlan = true;
      else if (token === '--ref') ref = args[++i];
      else if (token === '--build') buildTarget = args[++i];
      else if (token === '--test') testTarget = args[++i];
      else if (token === '--port') localBasePort = Number(args[++i]);
      else if (token === '--repo-root') repoRoot = path.resolve(args[++i]);
      else throw new Error(`Unknown option: ${token}`);
    }

    if (listRefs) {
      console.log(JSON.stringify(listGitRefs(repoRoot), null, 2));
      process.exit(0);
    }

    const plan = createManualTriggerPlan({ repoRoot, ref, buildTarget, testTarget, localBasePort });
    if (writePlan) {
      const planPath = path.join(repoRoot, 'artifacts', 'daily-builds', plan.runId, 'manual-plan.json');
      writeJsonAtomic(planPath, plan);
    }
    console.log(JSON.stringify(plan, null, 2));
  } catch (err) {
    console.error(`Manual build/test error: ${err.message}`);
    process.exitCode = 2;
  }
}
