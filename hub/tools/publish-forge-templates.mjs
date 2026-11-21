#!/usr/bin/env node
/**
 * PlayHub Forge Template Batch Publisher CLI
 *
 * Uses createForgeTemplatePublisher (SSOT) to export Forge templates via Godot Web release export,
 * automatically bump minor version (1.0.0 -> 1.1.0 -> ...) for already-deployed Hub games,
 * preserve existing publishedOn, update updatedOn, upsert games/catalog.json, and rebuild hub/dist.
 *
 * Usage:
 *   node hub/tools/publish-forge-templates.mjs --all
 *   node hub/tools/publish-forge-templates.mjs --ids captain-forever,tappy-chicken
 *   node hub/tools/publish-forge-templates.mjs --list
 *   node hub/tools/publish-forge-templates.mjs --all --no-build
 */
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { createForgeTemplatePublisher } from '../server/forge-template-publisher.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const platformRoot = path.resolve(__dirname, '..', '..');
const rootDir = path.join(platformRoot, 'hub', 'dist', 'user');

function parseArgs(argv) {
  const opts = {
    all: false,
    ids: null,
    list: false,
    rebuildDist: true,
    enableInCatalog: true
  };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--all') opts.all = true;
    else if (arg === '--list') opts.list = true;
    else if (arg === '--no-build') opts.rebuildDist = false;
    else if (arg === '--disabled') opts.enableInCatalog = false;
    else if (arg === '--ids') {
      const next = argv[++i];
      if (!next) throw new Error('--ids requires a comma-separated list of template IDs');
      opts.ids = next.split(',').map(s => s.trim()).filter(Boolean);
    } else if (arg.startsWith('--ids=')) {
      opts.ids = arg.slice('--ids='.length).split(',').map(s => s.trim()).filter(Boolean);
    } else if (arg === '--help' || arg === '-h') {
      console.log([
        'Usage: node hub/tools/publish-forge-templates.mjs [--all | --ids id1,id2 | --list] [--no-build] [--disabled]',
        '',
        'Options:',
        '  --all         Publish all registered Forge templates (auto-bumps existing games)',
        '  --ids <list>  Publish specific comma-separated Forge template IDs',
        '  --list        List all templates with current version and planned nextVersion',
        '  --no-build    Skip running hub/tools/build.mjs after packaging',
        '  --disabled    Register catalog entries with enabled=false'
      ].join('\n'));
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return opts;
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const publisher = createForgeTemplatePublisher({
    platformRoot,
    rootDir
  });

  if (opts.list) {
    const templates = publisher.listTemplates();
    console.log(`[forge-publish] ${templates.length} templates found (Godot: ${publisher.godotStatus().available ? 'OK' : 'MISSING'})`);
    for (const t of templates) {
      const status = t.published
        ? `published v${t.version} -> next v${t.nextVersion} (publishedOn=${t.publishedOn || '-'}, updatedOn=${t.updatedOn || '-'})`
        : `new -> next v${t.nextVersion}`;
      console.log(`  - ${t.id.padEnd(26)} ${t.gameId.padEnd(32)} ${status}`);
    }
    return;
  }

  if (!opts.all && (!opts.ids || !opts.ids.length)) {
    throw new Error('Specify --all, --ids <id1,id2>, or --list');
  }

  const templateIds = opts.all ? 'all' : opts.ids;
  const started = publisher.startBatchPublish({
    templateIds,
    enableInCatalog: opts.enableInCatalog,
    rebuildDist: opts.rebuildDist
  });

  console.log(`[forge-publish] Job ${started.id} started (${started.items.length} templates, rebuildDist=${started.rebuildDist})`);
  const reported = new Map();

  let job = started;
  while (job.status === 'running') {
    for (const item of job.items) {
      const key = `${item.status}:${item.step}`;
      if (reported.get(item.templateId) !== key && item.status !== 'queued') {
        reported.set(item.templateId, key);
        const dur = item.durationMs != null ? ` (${(item.durationMs / 1000).toFixed(1)}s)` : '';
        const err = item.error ? ` — ${item.error}` : '';
        console.log(`  [${item.templateId}] ${item.status}: ${item.step}${dur}${err}`);
      }
    }
    await delay(500);
    job = publisher.getJob(started.id);
  }

  // Flush final item statuses
  for (const item of job.items) {
    const key = `${item.status}:${item.step}`;
    if (reported.get(item.templateId) !== key) {
      reported.set(item.templateId, key);
      const dur = item.durationMs != null ? ` (${(item.durationMs / 1000).toFixed(1)}s)` : '';
      const err = item.error ? ` — ${item.error}` : '';
      console.log(`  [${item.templateId}] ${item.status}: ${item.step}${dur}${err}`);
    }
  }

  console.log('');
  console.log(`[forge-publish] Summary: status=${job.status} succeeded=${job.summary.succeeded}/${job.summary.total} failed=${job.summary.failed} buildStatus=${job.buildStatus}`);
  if (job.buildError) {
    console.error(`[forge-publish] Hub build error: ${job.buildError}`);
  }
  const bumped = job.items.filter(i => i.status === 'published' && i.versionAction === 'bumped');
  const initial = job.items.filter(i => i.status === 'published' && i.versionAction === 'initial');
  if (bumped.length) {
    console.log(`[forge-publish] Version-bumped (${bumped.length}):`);
    for (const i of bumped) {
      console.log(`  * ${i.gameId}: v${i.previousVersion} -> v${i.version}`);
    }
  }
  if (initial.length) {
    console.log(`[forge-publish] Newly published (${initial.length}):`);
    for (const i of initial) {
      console.log(`  + ${i.gameId}: v${i.version}`);
    }
  }

  if (job.status !== 'completed') {
    process.exitCode = 1;
  }
}

main().catch(err => {
  console.error(`[forge-publish] Error: ${err?.message || err}`);
  process.exit(1);
});
